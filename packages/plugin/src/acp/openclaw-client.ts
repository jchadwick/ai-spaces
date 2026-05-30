import { spawn } from 'child_process';
import { Readable, Writable } from 'stream';
import * as crypto from 'crypto';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { ChildProcess } from 'child_process';
import { logger as rootLogger } from '../logger.js';

const log = rootLogger.child({ component: 'openclaw-acp-client' });

function createFilteredAcpInput(stdout: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onData = (chunk: Buffer | string) => {
        buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            JSON.parse(trimmed);
            controller.enqueue(encoder.encode(`${trimmed}\n`));
          } catch {
            log.warn({ line: trimmed.slice(0, 160) }, 'Dropping non-ACP stdout line from openclaw acp');
          }
        }
      };

      const onEnd = () => {
        const trimmed = buffer.trim();
        if (trimmed) {
          try {
            JSON.parse(trimmed);
            controller.enqueue(encoder.encode(trimmed));
          } catch {
            log.warn({ line: trimmed.slice(0, 160) }, 'Dropping trailing non-ACP stdout line from openclaw acp');
          }
        }
        controller.close();
      };

      const onError = (err: Error) => {
        controller.error(err);
      };

      stdout.on('data', onData);
      stdout.on('end', onEnd);
      stdout.on('error', onError);
    },
  });
}

// session/update params from ACP SDK
export interface SessionUpdateParams {
  sessionId: string;
  update: {
    sessionUpdate: string;
    [key: string]: unknown;
  };
}

export type SessionUpdateHandler = (params: SessionUpdateParams) => void | Promise<void>;

interface GatewayCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface ManagedSession {
  sessionId: string;
  spaceId: string;
  activeAbort: AbortController | null;
}

/**
 * Plugin-side ACP client to OpenClaw.
 *
 * OpenClaw is spawned as a subprocess (`openclaw acp`) and communicated with
 * via stdio. The client manages one ACP session per runtime session key and forwards
 * session/prompt calls, relaying session/update notifications back.
 *
 * OpenClaw handles: token streaming, cancellation, model failover.
 * The plugin handles: fs ops, permissions, file watching — NOT delegated here.
 */
export class OpenClawAcpClient {
  private connection: ClientSideConnection | null = null;
  private subprocess: ChildProcess | null = null;
  private sessions = new Map<string, ManagedSession>(); // runtime session key → session
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
    const input = createFilteredAcpInput(proc.stdout!);
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

  async getOrCreateSession(runtimeSessionKey: string, spaceId: string, cwd: string): Promise<string> {
    const existing = this.sessions.get(runtimeSessionKey);
    if (existing) return existing.sessionId;

    // Primary path: use OpenClaw gateway chat-completions API for prompt execution.
    // Keep a lightweight logical session per space for cancellation tracking.
    if ((process.env.AI_SPACES_USE_OPENCLAW_ACP ?? 'false') !== 'true') {
      const sessionId = crypto.randomUUID();
      const session: ManagedSession = { sessionId, spaceId, activeAbort: null };
      this.sessions.set(runtimeSessionKey, session);
      this.sessionById.set(sessionId, session);
      log.info({ spaceId, sessionId }, 'created logical gateway session');
      return sessionId;
    }

    await this.ensureConnected();

    const { sessionId } = await this.connection!.newSession({
      cwd,
      mcpServers: [],
    });

    const session: ManagedSession = { sessionId, spaceId, activeAbort: null };
    this.sessions.set(runtimeSessionKey, session);
    this.sessionById.set(sessionId, session);

    log.info({ spaceId, sessionId }, 'created new ACP session');
    return sessionId;
  }

  /**
   * Forward a prompt to OpenClaw and relay session/update notifications via onUpdate.
   * Returns the stopReason from OpenClaw's prompt response.
   */
  async forwardPrompt(
    runtimeSessionKey: string,
    spaceId: string,
    prompt: { systemPrompt: string; userPrompt: string },
    onUpdate: SessionUpdateHandler,
    signal?: AbortSignal,
  ): Promise<string> {
    const session = this.sessions.get(runtimeSessionKey) ?? { sessionId: crypto.randomUUID(), spaceId, activeAbort: null };
    this.sessions.set(runtimeSessionKey, session);

    session.activeAbort?.abort();
    const abort = new AbortController();
    session.activeAbort = abort;
    if (signal) signal.addEventListener('abort', () => abort.abort(), { once: true });

    const timeout = setTimeout(() => abort.abort(), 90_000);
    const gatewayUrl = process.env.GATEWAY_URL ?? 'http://127.0.0.1:19000';
    const gatewayToken = process.env.GATEWAY_TOKEN ?? 'secret';

    try {
      log.info({ spaceId }, 'forwarding prompt via OpenClaw gateway chat completions');
      const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gatewayToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openclaw',
          messages: [
            { role: 'system', content: prompt.systemPrompt },
            { role: 'user', content: prompt.userPrompt },
          ],
          stream: false,
        }),
        signal: abort.signal,
      });

      if (!response.ok) {
        throw new Error(`Gateway chat completion failed: ${response.status} ${await response.text()}`);
      }

      const data = await response.json() as GatewayCompletionResponse;
      const content = data.choices?.[0]?.message?.content ?? '';
      if (content) {
        await Promise.resolve(onUpdate({
          sessionId: session.sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: content },
          },
        }));
      }

      return 'end_turn';
    } finally {
      clearTimeout(timeout);
      if (session.activeAbort === abort) session.activeAbort = null;
    }
  }

  /**
   * Send cancel notification to OpenClaw for a space's active session.
   * cancel() is a fire-and-forget notification in ACP.
   */
  cancelPrompt(runtimeSessionKey: string): void {
    const session = this.sessions.get(runtimeSessionKey);
    if (!session) return;
    session.activeAbort?.abort();
    // Note: connection.cancel() sends an ACP notification — don't await
    this.connection?.extNotification?.('session/cancel', { sessionId: session.sessionId });
  }

  closeSession(runtimeSessionKey: string): void {
    const session = this.sessions.get(runtimeSessionKey);
    if (!session) return;
    session.activeAbort?.abort();
    this.updateHandlers.delete(session.sessionId);
    this.sessionById.delete(session.sessionId);
    this.sessions.delete(runtimeSessionKey);
  }

  dispose(): void {
    this.subprocess?.kill();
    this.teardown();
  }
}

// Singleton per plugin process
export const openClawAcpClient = new OpenClawAcpClient();
