import * as crypto from 'crypto';
import type { Agent, AgentSideConnection, InitializeRequest, InitializeResponse, NewSessionRequest, NewSessionResponse, LoadSessionRequest, LoadSessionResponse, PromptRequest, PromptResponse, CancelNotification, AuthenticateRequest, AuthenticateResponse, SessionNotification } from '@agentclientprotocol/sdk';
import { PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { SpaceRole, SpaceConfig, FileMetadataEntry } from '@ai-spaces/shared';
import { ACP_WORKSPACE_METHODS, toSpaceRole } from '@ai-spaces/shared';
import { getSpace, resolveSpaceRoot, listSpaces } from '../space-store.js';
import { config } from '../config.js';
import { getOrCreateSession, addMessageToSession, getSessionMessages } from '../chat-history.js';
import { openClawAcpClient, type SessionUpdateParams } from './openclaw-client.js';
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspaceFile,
  renameWorkspacePath,
  createWorkspaceDirectory,
  deleteWorkspaceDirectory,
  getWorkspaceMetadata,
  patchWorkspaceMetadata,
} from './workspace-ops.js';
import { logger as rootLogger } from '../logger.js';

const log = rootLogger.child({ component: 'acp-agent' });

interface SessionState {
  sessionId: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  abort: AbortController | null;
}

/**
 * ACP agent handler for a single WebSocket connection.
 *
 * Acts as an intermediary:
 *  - Upstream (AgentSideConnection): receives session/prompt from server
 *  - Downstream (openClawAcpClient): forwards prompts to OpenClaw subprocess
 *
 * Workspace file operations are handled entirely within this plugin —
 * OpenClaw is never involved in file I/O.
 */
export class AISpacesAgent implements Agent {
  private readonly conn: AgentSideConnection;
  private readonly spaceId: string;
  private readonly role: SpaceRole;
  private sessions = new Map<string, SessionState>();

  constructor(conn: AgentSideConnection, spaceId: string, role: SpaceRole) {
    this.conn = conn;
    this.spaceId = spaceId;
    this.role = role;
  }

  async initialize(_params: InitializeRequest): Promise<InitializeResponse> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          image: false,
          audio: false,
          embeddedContext: false,
        },
      },
    };
  }

  async authenticate(_params: AuthenticateRequest): Promise<AuthenticateResponse | void> {
    // Auth is handled by the server before the WebSocket upgrade
    return {};
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const sessionId = crypto.randomUUID();

    // Resolve space from cwd — find a space whose root matches; fall back to this connection's space
    const spaceId = this.resolveSpaceIdFromCwd(params.cwd ?? '') ?? this.spaceId;
    const userId = (params as unknown as Record<string, string>).userId ?? 'unknown';

    this.sessions.set(sessionId, { sessionId, spaceId, userId, role: this.role, abort: null });

    // Ensure an ACP session exists in OpenClaw for this space
    if (spaceId) {
      const space = getSpace(spaceId);
      if (space) {
        const spaceRoot = resolveSpaceRoot(space);
        await openClawAcpClient.getOrCreateSession(spaceId, spaceRoot).catch((err) => {
          log.warn({ err, spaceId }, 'could not create OpenClaw session — prompts will fail');
        });
      }
    }

    log.info({ sessionId, spaceId }, 'new ACP session');
    return { sessionId };
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const sessionId = params.sessionId;
    const spaceId = this.resolveSpaceIdFromSession(sessionId) ?? this.spaceId;
    const userId = (params as unknown as Record<string, string>).userId ?? 'unknown';

    // Re-register the session state
    this.sessions.set(sessionId, { sessionId, spaceId, userId, role: this.role, abort: null });

    // Replay chat history — OpenClaw does not do this itself
    if (spaceId) {
      const space = getSpace(spaceId);
      if (space) {
        const spaceRoot = resolveSpaceRoot(space);
        const history = getSessionMessages(spaceRoot, userId);
        for (const msg of history) {
          const updateType = msg.role === 'user' ? 'user_message_chunk' : 'agent_message_chunk';
          await this.conn.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: updateType,
              content: { type: 'text', text: msg.content },
            } as unknown as SessionNotification['update'],
          });
        }
      }
    }

    log.info({ sessionId, spaceId }, 'loaded ACP session with history replay');
    return {};
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const state = this.sessions.get(params.sessionId);
    if (!state) {
      return { stopReason: 'end_turn' };
    }

    const promptText = params.prompt
      .filter((p: unknown) => (p as Record<string, string>).type === 'text')
      .map((p: unknown) => (p as Record<string, string>).text)
      .join('\n');

    const abort = new AbortController();
    state.abort = abort;

    // Record user message
    if (state.spaceId) {
      const space = getSpace(state.spaceId);
      if (space) {
        const spaceRoot = resolveSpaceRoot(space);
        const session = getOrCreateSession(spaceRoot, state.userId);
        addMessageToSession(spaceRoot, state.userId, {
          id: crypto.randomUUID(),
          role: 'user',
          content: promptText,
          timestamp: new Date().toISOString(),
        });

        // Prepend system prompt on first message
        const history = getSessionMessages(spaceRoot, state.userId);
        const isFirstMessage = history.filter(m => m.role === 'user').length <= 1;
        const space_ = getSpace(state.spaceId);
        const effectiveText = isFirstMessage && space_
          ? buildSystemPrompt(space_.config, resolveSpaceRoot(space_)) + '\n\n' + promptText
          : promptText;

        let accumulated = '';

        try {
          const stopReason = await openClawAcpClient.forwardPrompt(
            state.spaceId,
            effectiveText,
            async (update: SessionUpdateParams) => {
              // Relay session/update notifications upstream
              if (update.update.sessionUpdate === 'agent_message_chunk') {
                const text = (update.update as unknown as { content: { text: string } }).content?.text ?? '';
                accumulated += text;
                await this.conn.sessionUpdate({
                  sessionId: params.sessionId,
                  update: update.update as SessionNotification['update'],
                });
              } else {
                // Relay all other update types (tool_call, plan, etc.) as-is
                await this.conn.sessionUpdate({
                  sessionId: params.sessionId,
                  update: update.update as SessionNotification['update'],
                });
              }
            },
            abort.signal,
          );

          // Store assistant message
          addMessageToSession(spaceRoot, state.userId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: accumulated,
            timestamp: new Date().toISOString(),
          });

          return { stopReason: stopReason as PromptResponse['stopReason'] };
        } catch (err) {
          if (abort.signal.aborted) return { stopReason: 'cancelled' };
          log.error({ err, spaceId: state.spaceId }, 'prompt forwarding error');
          await this.conn.sessionUpdate({
            sessionId: params.sessionId,
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: `\n[Error: ${(err as Error).message}]` },
            } as unknown as SessionNotification['update'],
          });
          return { stopReason: 'end_turn' };
        } finally {
          if (state.abort === abort) state.abort = null;
        }
      }
    }

    return { stopReason: 'end_turn' };
  }

  async cancel(params: CancelNotification): Promise<void> {
    const state = this.sessions.get(params.sessionId);
    if (!state) return;
    state.abort?.abort();
    openClawAcpClient.cancelPrompt(state.spaceId);
  }

  // Extension method handler — routes workspace/* calls to file operations
  async extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const spaceId = this.spaceId;
    if (!spaceId) throw new Error('spaceId required');

    const MUTATING_METHODS: ReadonlyArray<string> = [
      ACP_WORKSPACE_METHODS.WRITE_FILE,
      ACP_WORKSPACE_METHODS.DELETE_FILE,
      ACP_WORKSPACE_METHODS.RENAME,
      ACP_WORKSPACE_METHODS.CREATE_DIRECTORY,
      ACP_WORKSPACE_METHODS.DELETE_DIRECTORY,
      ACP_WORKSPACE_METHODS.PATCH_METADATA,
    ];
    if (MUTATING_METHODS.includes(method) && this.role === 'viewer') {
      throw new Error('Permission denied: viewers cannot modify files');
    }

    const space = getSpace(spaceId);
    if (!space) throw new Error(`Space not found: ${spaceId}`);
    const spaceRoot = resolveSpaceRoot(space);

    switch (method) {
      case ACP_WORKSPACE_METHODS.LIST_FILES: {
        const files = await listWorkspaceFiles(
          spaceRoot,
          toSpaceRole(params.role as string),
          (params.path as string) ?? '',
        );
        return { files };
      }

      case ACP_WORKSPACE_METHODS.READ_FILE: {
        const result = await readWorkspaceFile(spaceRoot, params.path as string);
        return result;
      }

      case ACP_WORKSPACE_METHODS.WRITE_FILE: {
        await writeWorkspaceFile(
          spaceRoot,
          params.path as string,
          params.content as string,
          (params.encoding as 'utf-8' | 'base64') ?? 'utf-8',
        );
        return {};
      }

      case ACP_WORKSPACE_METHODS.DELETE_FILE: {
        await deleteWorkspaceFile(spaceRoot, params.path as string);
        return {};
      }

      case ACP_WORKSPACE_METHODS.RENAME: {
        await renameWorkspacePath(spaceRoot, params.path as string, params.newPath as string);
        return {};
      }

      case ACP_WORKSPACE_METHODS.CREATE_DIRECTORY: {
        await createWorkspaceDirectory(spaceRoot, params.path as string);
        return {};
      }

      case ACP_WORKSPACE_METHODS.DELETE_DIRECTORY: {
        await deleteWorkspaceDirectory(spaceRoot, params.path as string);
        return {};
      }

      case ACP_WORKSPACE_METHODS.GET_METADATA: {
        const metadata = await getWorkspaceMetadata(spaceRoot);
        return metadata as Record<string, unknown>;
      }

      case ACP_WORKSPACE_METHODS.PATCH_METADATA: {
        await patchWorkspaceMetadata(
          spaceRoot,
          (params.files as Record<string, Partial<FileMetadataEntry>>) ?? {},
        );
        return {};
      }

      default:
        throw new Error(`Unknown extension method: ${method}`);
    }
  }

  private resolveSpaceIdFromCwd(cwd: string): string | undefined {
    if (!cwd) return listSpaces()[0]?.id;
    // Find the space whose resolved root matches the cwd
    for (const space of listSpaces()) {
      const root = resolveSpaceRoot(space);
      if (root === cwd || cwd.startsWith(root + '/') || cwd.startsWith(root + '\\')) {
        return space.id;
      }
    }
    return listSpaces()[0]?.id;
  }

  private resolveSpaceIdFromSession(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.spaceId;
  }
}

function buildSystemPrompt(spaceConfig: SpaceConfig, fullSpacePath: string): string {
  const capabilities = spaceConfig.agent?.capabilities || config.DEFAULT_ALLOWED_TOOLS;
  const denied = spaceConfig.agent?.denied || config.DEFAULT_DENIED_TOOLS;
  const allDenied = [...new Set([...denied, ...config.DEFAULT_DENIED_TOOLS])];

  return [
    `# AI SPACES SECURITY POLICY`,
    `CONTEXT: You are helping with a space called "${spaceConfig.name}".`,
    spaceConfig.description ? `DESCRIPTION: ${spaceConfig.description}` : '',
    `WORKSPACE ROOT: ${fullSpacePath}`,
    `CRITICAL: You are strictly confined to the workspace root above. You MUST NOT access, list, read, write, or mention any files or directories outside of it.`,
    `CRITICAL: Any path containing "..", starting with "~/", "/home/", "/etc/", "/root/", or any absolute path that does not begin with "${fullSpacePath}" is FORBIDDEN.`,
    `CRITICAL: Do NOT access agent-internal paths such as ~/.openclaw, AGENTS.md, MEMORY.md, USER.md, or any memory/ directory.`,
    `ALLOWED TOOLS: ${capabilities.join(', ')}`,
    allDenied.length > 0 ? `DENIED TOOLS: ${allDenied.join(', ')}` : '',
    `REFERENCE: Check .space/SPACE.md if it exists for space-specific preferences.`,
  ].filter(Boolean).join('\n');
}
