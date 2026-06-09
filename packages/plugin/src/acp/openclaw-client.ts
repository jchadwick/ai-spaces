import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { logger as rootLogger } from "../logger.js";

const log = rootLogger.child({ component: "openclaw-acp-client" });

function createFilteredAcpInput(stdout: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onData = (chunk: Buffer | string) => {
        buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            JSON.parse(trimmed);
            controller.enqueue(encoder.encode(`${trimmed}\n`));
          } catch {
            log.warn(
              { line: trimmed.slice(0, 160) },
              "Dropping non-ACP stdout line from openclaw acp",
            );
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
            log.warn(
              { line: trimmed.slice(0, 160) },
              "Dropping trailing non-ACP stdout line from openclaw acp",
            );
          }
        }
        controller.close();
      };

      const onError = (err: Error) => {
        controller.error(err);
      };

      stdout.on("data", onData);
      stdout.on("end", onEnd);
      stdout.on("error", onError);
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
    log.info("spawning openclaw acp subprocess");
    const proc = spawn("openclaw", ["acp", "-v"], {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, OPENCLAW_SHELL: "acp-client" },
    });
    this.subprocess = proc;

    proc.on("error", (err) => {
      log.error({ err }, "openclaw acp subprocess error");
      this.teardown();
    });

    proc.on("exit", (code) => {
      log.info({ code }, "openclaw acp subprocess exited");
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
              log.warn({ err }, "sessionUpdate handler threw");
            });
          }
        },
        // OpenClaw never calls requestPermission — return cancelled as defensive fallback
        requestPermission: async () => ({
          outcome: { outcome: "cancelled" as const },
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
    log.info("openclaw ACP connection initialized");
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

  async getOrCreateSession(
    runtimeSessionKey: string,
    spaceId: string,
    cwd: string,
  ): Promise<string> {
    const existing = this.sessions.get(runtimeSessionKey);
    if (existing) return existing.sessionId;

    await this.ensureConnected();

    const { sessionId } = await this.connection!.newSession({
      cwd,
      mcpServers: [],
    });

    const session: ManagedSession = { sessionId, spaceId, activeAbort: null };
    this.sessions.set(runtimeSessionKey, session);
    this.sessionById.set(sessionId, session);

    log.info({ spaceId, sessionId }, "created new ACP session");
    return sessionId;
  }

  /**
   * Forward a prompt to OpenClaw via the ACP subprocess.
   * Each space/topic gets its own ACP session, maintaining conversation context.
   */
  async forwardPrompt(
    runtimeSessionKey: string,
    spaceId: string,
    prompt: { systemPrompt: string; userPrompt: string },
    onUpdate: SessionUpdateHandler,
    signal?: AbortSignal,
  ): Promise<string> {
    let session = this.sessions.get(runtimeSessionKey);
    if (!session) {
      // Session missing: create it in OpenClaw before forwarding
      log.warn({ runtimeSessionKey, spaceId }, "ACP session missing on forwardPrompt — creating");
      const spaceRoot = "/home/openclaw/workspace"; // default workspace root
      await this.getOrCreateSession(runtimeSessionKey, spaceId, spaceRoot);
      session = this.sessions.get(runtimeSessionKey)!;
    }

    session.activeAbort?.abort();
    const abort = new AbortController();
    session.activeAbort = abort;
    if (signal) signal.addEventListener("abort", () => abort.abort(), { once: true });

    const timeout = setTimeout(() => abort.abort(), 90_000);

    try {
      return await this.forwardPromptViaAcp(
        spaceId,
        prompt,
        onUpdate,
        abort.signal,
        session,
      );
    } finally {
      clearTimeout(timeout);
      if (session.activeAbort === abort) session.activeAbort = null;
    }
  }

  /**
   * Forward a prompt using the ACP subprocess connection.
   * OpenClaw maintains session context natively through ACP sessions.
   */
  private async forwardPromptViaAcp(
    spaceId: string,
    prompt: { systemPrompt: string; userPrompt: string },
    onUpdate: SessionUpdateHandler,
    signal: AbortSignal,
    session: ManagedSession,
  ): Promise<string> {
    await this.ensureConnected();

    // Register update handler for this session so we receive agent response chunks
    this.updateHandlers.set(session.sessionId, onUpdate);

    const cleanup = () => {
      this.updateHandlers.delete(session.sessionId);
    };

    // Build prompt text: prepend system prompt if provided
    const fullPrompt = prompt.systemPrompt
      ? `${prompt.systemPrompt}\n\n${prompt.userPrompt}`
      : prompt.userPrompt;

    log.info({ spaceId, sessionId: session.sessionId }, "forwarding prompt via OpenClaw ACP");

    // Handle cancellation via abort signal
    const abortListener = () => {
      this.connection?.cancel({ sessionId: session.sessionId });
    };
    signal.addEventListener("abort", abortListener, { once: true });

    try {
      const response = await this.connection!.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: fullPrompt }],
      });

      log.info(
        { spaceId, sessionId: session.sessionId, stopReason: response.stopReason },
        "prompt completed",
      );

      return response.stopReason;
    } catch (err) {
      if (signal.aborted) {
        log.info({ spaceId, sessionId: session.sessionId }, "prompt cancelled");
        return "cancelled";
      }
      throw err;
    } finally {
      cleanup();
      signal.removeEventListener("abort", abortListener);
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
    this.connection?.cancel({ sessionId: session.sessionId });
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
