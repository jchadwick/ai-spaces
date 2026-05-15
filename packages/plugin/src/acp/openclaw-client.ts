import { spawn } from 'child_process';
import { Readable, Writable } from 'stream';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { ChildProcess } from 'child_process';
import { logger as rootLogger } from '../logger.js';

const log = rootLogger.child({ component: 'openclaw-acp-client' });

// session/update params from ACP SDK
export interface SessionUpdateParams {
  sessionId: string;
  update: {
    sessionUpdate: string;
    [key: string]: unknown;
  };
}

export type SessionUpdateHandler = (params: SessionUpdateParams) => void | Promise<void>;

interface ManagedSession {
  sessionId: string;
  spaceId: string;
  activeAbort: AbortController | null;
}

/**
 * Plugin-side ACP client to OpenClaw.
 *
 * OpenClaw is spawned as a subprocess (`openclaw acp`) and communicated with
 * via stdio. The client manages one ACP session per space and forwards
 * session/prompt calls, relaying session/update notifications back.
 *
 * OpenClaw handles: token streaming, cancellation, model failover.
 * The plugin handles: fs ops, permissions, file watching — NOT delegated here.
 */
export class OpenClawAcpClient {
  private connection: ClientSideConnection | null = null;
  private subprocess: ChildProcess | null = null;
  private sessions = new Map<string, ManagedSession>(); // spaceId → session
  private sessionById = new Map<string, ManagedSession>(); // sessionId → session
  private updateHandlers = new Map<string, SessionUpdateHandler>(); // sessionId → handler
  private connectPromise: Promise<void> | null = null;

  async ensureConnected(): Promise<void> {
    if (this.connection) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async connect(): Promise<void> {
    log.info('spawning openclaw acp subprocess');
    const proc = spawn('openclaw', ['acp'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, OPENCLAW_SHELL: 'acp-client' },
    });
    this.subprocess = proc;

    proc.on('error', (err) => {
      log.error({ err }, 'openclaw acp subprocess error');
      this.teardown();
    });

    proc.on('exit', (code) => {
      log.info({ code }, 'openclaw acp subprocess exited');
      this.teardown();
    });

    // ACP uses stdio: output=write-to-agent, input=read-from-agent
    const output = Writable.toWeb(proc.stdin!) as WritableStream<Uint8Array>;
    const input = Readable.toWeb(proc.stdout!) as unknown as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(output, input);

    const connection = new ClientSideConnection(
      (_conn) => ({
        sessionUpdate: async (params: SessionUpdateParams) => {
          const handler = this.updateHandlers.get(params.sessionId);
          if (handler) {
            await Promise.resolve(handler(params)).catch((err) => {
              log.warn({ err }, 'sessionUpdate handler threw');
            });
          }
        },
        // OpenClaw never calls requestPermission — return cancelled as defensive fallback
        requestPermission: async () => ({
          outcome: { outcome: 'cancelled' as const },
        }),
      }),
      stream,
    );

    try {
      await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
    } catch (err) {
      proc.kill();
      throw err;
    }

    this.connection = connection;
    log.info('openclaw ACP connection initialized');
  }

  private teardown(): void {
    this.connection = null;
    this.subprocess = null;
    // Reject any active prompts
    for (const session of this.sessions.values()) {
      session.activeAbort?.abort();
    }
    this.sessions.clear();
    this.sessionById.clear();
    this.updateHandlers.clear();
  }

  async getOrCreateSession(spaceId: string, cwd: string): Promise<string> {
    await this.ensureConnected();

    const existing = this.sessions.get(spaceId);
    if (existing) return existing.sessionId;

    const { sessionId } = await this.connection!.newSession({
      cwd,
      mcpServers: [],
    });

    const session: ManagedSession = { sessionId, spaceId, activeAbort: null };
    this.sessions.set(spaceId, session);
    this.sessionById.set(sessionId, session);

    log.info({ spaceId, sessionId }, 'created new ACP session');
    return sessionId;
  }

  /**
   * Forward a prompt to OpenClaw and relay session/update notifications via onUpdate.
   * Returns the stopReason from OpenClaw's prompt response.
   */
  async forwardPrompt(
    spaceId: string,
    text: string,
    onUpdate: SessionUpdateHandler,
    signal?: AbortSignal,
  ): Promise<string> {
    await this.ensureConnected();

    const session = this.sessions.get(spaceId);
    if (!session) throw new Error(`No active session for space ${spaceId}`);

    // Cancel any previous in-flight prompt for this session
    session.activeAbort?.abort();
    const abort = new AbortController();
    session.activeAbort = abort;

    if (signal) {
      signal.addEventListener('abort', () => abort.abort(), { once: true });
    }

    this.updateHandlers.set(session.sessionId, onUpdate);

    try {
      const result = await this.connection!.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: 'text', text }],
      });
      return result.stopReason;
    } finally {
      this.updateHandlers.delete(session.sessionId);
      if (session.activeAbort === abort) {
        session.activeAbort = null;
      }
    }
  }

  /**
   * Send cancel notification to OpenClaw for a space's active session.
   * cancel() is a fire-and-forget notification in ACP.
   */
  cancelPrompt(spaceId: string): void {
    const session = this.sessions.get(spaceId);
    if (!session) return;
    session.activeAbort?.abort();
    // Note: connection.cancel() sends an ACP notification — don't await
    this.connection?.extNotification?.('session/cancel', { sessionId: session.sessionId });
  }

  closeSession(spaceId: string): void {
    const session = this.sessions.get(spaceId);
    if (!session) return;
    session.activeAbort?.abort();
    this.updateHandlers.delete(session.sessionId);
    this.sessionById.delete(session.sessionId);
    this.sessions.delete(spaceId);
  }

  dispose(): void {
    this.subprocess?.kill();
    this.teardown();
  }
}

// Singleton per plugin process
export const openClawAcpClient = new OpenClawAcpClient();
