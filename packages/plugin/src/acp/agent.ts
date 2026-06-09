import * as crypto from "node:crypto";
import type {
  Agent,
  AgentSideConnection,
  AuthenticateRequest,
  AuthenticateResponse,
  CancelNotification,
  InitializeRequest,
  InitializeResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { FileMetadataEntry, SpaceRole } from "@ai-spaces/shared";
import { ACP_WORKSPACE_METHODS } from "@ai-spaces/shared";
import { addMessageToSession, getOrCreateSession, getSessionMessages } from "../chat-history.js";
import { logger as rootLogger } from "../logger.js";
import { getSpace, resolveSpaceRoot } from "../space-store.js";
import {
  buildChatSystemPrompt,
  classifyPrompt,
  formatWorkspaceSummary,
  REFUSAL_MESSAGE,
  removeInternalFiles,
  sanitizeAssistantText,
} from "./chat-policy.js";
import { openClawAcpClient, type SessionUpdateParams } from "./openclaw-client.js";
import {
  createWorkspaceDirectory,
  deleteWorkspaceDirectory,
  deleteWorkspaceFile,
  getWorkspaceMetadata,
  getWorkspacePathFacts,
  listWorkspaceFiles,
  patchWorkspaceMetadata,
  readWorkspaceFile,
  renameWorkspacePath,
  writeWorkspaceFile,
} from "./workspace-ops.js";

const log = rootLogger.child({ component: "acp-agent" });

interface SessionState {
  sessionId: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  topicPath: string;
  abort: AbortController | null;
  systemContext: string;
}

function normalizeTopicPath(topicPath: string): string {
  return topicPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function getServerContext(params: { _meta?: { [key: string]: unknown } | null }): string {
  const value = params._meta?.aiSpacesSystemContext;
  return typeof value === "string" ? value : "";
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

  async authenticate(_params: AuthenticateRequest): Promise<AuthenticateResponse | undefined> {
    // Auth is handled by the server before the WebSocket upgrade
    return {};
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const sessionId = crypto.randomUUID();
    const spaceId = this.spaceId;
    const topicPath = normalizeTopicPath(params.cwd ?? "");
    const userId = (params as unknown as Record<string, string>).userId ?? "unknown";

    this.sessions.set(sessionId, {
      sessionId,
      spaceId,
      userId,
      role: this.role,
      topicPath,
      abort: null,
      systemContext: getServerContext(params),
    });

    // Ensure an ACP session exists in OpenClaw for this space
    if (spaceId) {
      const space = getSpace(spaceId);
      if (space) {
        const spaceRoot = resolveSpaceRoot(space);
        await openClawAcpClient
          .getOrCreateSession(this.runtimeSessionKey(spaceId, topicPath), spaceId, spaceRoot)
          .catch((err) => {
            log.warn({ err, spaceId }, "could not create OpenClaw session — prompts will fail");
          });
      }
    }

    log.info({ sessionId, spaceId }, "new ACP session");
    return { sessionId };
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const sessionId = params.sessionId;
    const spaceId = this.spaceId;
    const topicPath = normalizeTopicPath(params.cwd ?? "");
    const userId = (params as unknown as Record<string, string>).userId ?? "unknown";

    // Re-register the session state
    this.sessions.set(sessionId, {
      sessionId,
      spaceId,
      userId,
      role: this.role,
      topicPath,
      abort: null,
      systemContext: getServerContext(params),
    });

    // Ensure an ACP session exists in OpenClaw for this space (server restart case)
    if (spaceId) {
      const space = getSpace(spaceId);
      if (space) {
        const spaceRoot = resolveSpaceRoot(space);
        await openClawAcpClient
          .getOrCreateSession(this.runtimeSessionKey(spaceId, topicPath), spaceId, spaceRoot)
          .catch((err) => {
            log.warn({ err, spaceId }, "could not create OpenClaw session on load — prompts will fail");
          });

        // Replay chat history — OpenClaw does not do this itself
        const history = getSessionMessages(spaceRoot, this.historyUserKey(userId, topicPath));
        for (const msg of history) {
          const updateType = msg.role === "user" ? "user_message_chunk" : "agent_message_chunk";
          await this.conn.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: updateType,
              content: { type: "text", text: msg.content },
            } as unknown as SessionNotification["update"],
          });
        }
      }
    }

    log.info({ sessionId, spaceId }, "loaded ACP session with history replay");
    return {};
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const state = this.sessions.get(params.sessionId);
    if (!state) {
      return { stopReason: "end_turn" };
    }
    state.systemContext = getServerContext(params) || state.systemContext;

    const promptText = params.prompt
      .filter((p: unknown) => (p as Record<string, string>).type === "text")
      .map((p: unknown) => (p as Record<string, string>).text)
      .join("\n");

    const abort = new AbortController();
    state.abort = abort;

    // Record user message
    if (state.spaceId) {
      const space = getSpace(state.spaceId);
      if (space) {
        const spaceRoot = resolveSpaceRoot(space);
        const historyUserKey = this.historyUserKey(state.userId, state.topicPath);
        getOrCreateSession(spaceRoot, historyUserKey);
        addMessageToSession(spaceRoot, historyUserKey, {
          id: crypto.randomUUID(),
          role: "user",
          content: promptText,
          timestamp: new Date().toISOString(),
        });

        const decision = classifyPrompt(promptText, state.role);
        if (decision.action === "refuse") {
          await this.conn.sessionUpdate({
            sessionId: params.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: decision.message },
            } as unknown as SessionNotification["update"],
          });
          addMessageToSession(spaceRoot, historyUserKey, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: decision.message,
            timestamp: new Date().toISOString(),
          });
          return { stopReason: "end_turn" };
        }

        if (decision.action === "workspace_summary") {
          const effectiveRole = state.role;
          const files = removeInternalFiles(
            await listWorkspaceFiles(spaceRoot, false, ""),
            effectiveRole,
          );
          const summary = formatWorkspaceSummary(files, effectiveRole);
          await this.conn.sessionUpdate({
            sessionId: params.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: summary },
            } as unknown as SessionNotification["update"],
          });
          addMessageToSession(spaceRoot, historyUserKey, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: summary,
            timestamp: new Date().toISOString(),
          });
          return { stopReason: "end_turn" };
        }

        const space_ = getSpace(state.spaceId);
        const systemPrompt = space_
          ? `${buildChatSystemPrompt(space_.config)}\n\n${state.systemContext}`
          : REFUSAL_MESSAGE;

        let accumulated = "";

        try {
          const stopReason = await openClawAcpClient.forwardPrompt(
            this.runtimeSessionKey(state.spaceId, state.topicPath),
            state.spaceId,
            {
              systemPrompt,
              userPrompt: promptText,
            },
            async (update: SessionUpdateParams) => {
              // Relay session/update notifications upstream
              if (update.update.sessionUpdate === "agent_message_chunk") {
                const text =
                  (update.update as unknown as { content: { text: string } }).content?.text ?? "";
                accumulated += text;
              } else {
                // Relay all other update types (tool_call, plan, etc.) as-is
                await this.conn.sessionUpdate({
                  sessionId: params.sessionId,
                  update: update.update as SessionNotification["update"],
                });
              }
            },
            abort.signal,
          );

          const sanitized = sanitizeAssistantText(accumulated, { spaceRoot, role: state.role });
          await this.conn.sessionUpdate({
            sessionId: params.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: sanitized },
            } as unknown as SessionNotification["update"],
          });

          // Store assistant message
          addMessageToSession(spaceRoot, historyUserKey, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: sanitized,
            timestamp: new Date().toISOString(),
          });

          return { stopReason: stopReason as PromptResponse["stopReason"] };
        } catch (err) {
          if (abort.signal.aborted) return { stopReason: "cancelled" };
          log.error({ err, spaceId: state.spaceId }, "prompt forwarding error");
          await this.conn.sessionUpdate({
            sessionId: params.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: `\n[Error: ${(err as Error).message}]` },
            } as unknown as SessionNotification["update"],
          });
          return { stopReason: "end_turn" };
        } finally {
          if (state.abort === abort) state.abort = null;
        }
      }
    }

    return { stopReason: "end_turn" };
  }

  async cancel(params: CancelNotification): Promise<void> {
    const state = this.sessions.get(params.sessionId);
    if (!state) return;
    state.abort?.abort();
    openClawAcpClient.cancelPrompt(this.runtimeSessionKey(state.spaceId, state.topicPath));
  }

  // Extension method handler — routes workspace/* calls to file operations
  async extMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const spaceId = this.spaceId;
    if (!spaceId) throw new Error("spaceId required");

    const space = getSpace(spaceId);
    if (!space) throw new Error(`Space not found: ${spaceId}`);
    const spaceRoot = resolveSpaceRoot(space);

    switch (method) {
      case ACP_WORKSPACE_METHODS.RESOLVE_PATH:
        return (await getWorkspacePathFacts(
          spaceRoot,
          (params.path as string) ?? "",
        )) as unknown as Record<string, unknown>;

      case ACP_WORKSPACE_METHODS.LIST_FILES: {
        const files = await listWorkspaceFiles(
          spaceRoot,
          params.includeHidden === true,
          (params.path as string) ?? "",
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
          (params.encoding as "utf-8" | "base64") ?? "utf-8",
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

  private runtimeSessionKey(spaceId: string, topicPath: string): string {
    return `${spaceId}:${topicPath || "/"}`;
  }

  private historyUserKey(userId: string, topicPath: string): string {
    return `${userId}:${topicPath || "/"}`;
  }
}
