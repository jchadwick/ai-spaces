import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "../config.js";
import { logger as rootLogger } from "../logger.js";

const log = rootLogger.child({ component: "openclaw-acp-client" });

const PROMPT_TIMEOUT_MS = 90_000;

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
  agentId: string;
  roomSessionKey: string;
  activeAbort: AbortController | null;
}

interface GatewayAuth {
  url: string;
  token: string;
}

let cachedGatewayAuth: GatewayAuth | null = null;

function readGatewayAuth(): GatewayAuth {
  const url = config.GATEWAY_URL ?? "http://127.0.0.1:19000";
  if (cachedGatewayAuth?.url === url) return cachedGatewayAuth;

  const configPath = path.join(config.OPENCLAW_HOME, ".openclaw", "openclaw.json");
  let token = "";
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      gateway?: { auth?: { token?: string } };
    };
    token = parsed.gateway?.auth?.token ?? "";
  } catch (err) {
    log.warn({ err, configPath }, "could not read gateway auth token from openclaw.json");
  }

  cachedGatewayAuth = { url, token };
  return cachedGatewayAuth;
}

function gatewayModelForAgent(agentId: string): string {
  return agentId && agentId !== "main" ? `openclaw/${agentId}` : "openclaw";
}

/** Stable OpenClaw channel session key scoped to agent + room (shared by all collaborators). */
export function buildRoomSessionKey(agentId: string, runtimeSessionKey: string): string {
  return `ai-spaces:${agentId}:${runtimeSessionKey}`;
}

/**
 * Forwards prompts to OpenClaw gateway HTTP using per-room channel sessions.
 *
 * OpenClaw's `openclaw acp` subprocess hangs on session/prompt in current builds.
 * HTTP chat/completions with a stable room session key gives us working prompts
 * plus OpenClaw-managed shared room history (not per-user, not manually attached).
 */
export class OpenClawAcpClient {
  private sessions = new Map<string, ManagedSession>();

  async getOrCreateSession(
    runtimeSessionKey: string,
    spaceId: string,
    agentId: string,
  ): Promise<string> {
    const existing = this.sessions.get(runtimeSessionKey);
    if (existing) return existing.sessionId;

    const roomSessionKey = buildRoomSessionKey(agentId, runtimeSessionKey);
    const sessionId = crypto.randomUUID();
    const session: ManagedSession = {
      sessionId,
      spaceId,
      agentId,
      roomSessionKey,
      activeAbort: null,
    };
    this.sessions.set(runtimeSessionKey, session);
    log.info(
      { spaceId, sessionId, agentId, roomSessionKey },
      "created logical OpenClaw room session",
    );
    return sessionId;
  }

  async forwardPrompt(
    runtimeSessionKey: string,
    spaceId: string,
    agentId: string,
    prompt: { systemPrompt: string; userPrompt: string },
    onUpdate: SessionUpdateHandler,
    signal?: AbortSignal,
  ): Promise<string> {
    let session = this.sessions.get(runtimeSessionKey);
    if (!session) {
      log.warn(
        { runtimeSessionKey, spaceId, agentId },
        "session missing on forwardPrompt — creating",
      );
      await this.getOrCreateSession(runtimeSessionKey, spaceId, agentId);
      session = this.sessions.get(runtimeSessionKey)!;
    }

    session.activeAbort?.abort();
    const abort = new AbortController();
    session.activeAbort = abort;
    if (signal) signal.addEventListener("abort", () => abort.abort(), { once: true });

    const timeout = setTimeout(() => abort.abort(), PROMPT_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      return await this.forwardPromptViaHttp(
        spaceId,
        session.agentId || agentId,
        session.roomSessionKey,
        prompt,
        onUpdate,
        abort.signal,
        session.sessionId,
        startedAt,
      );
    } finally {
      clearTimeout(timeout);
      if (session.activeAbort === abort) session.activeAbort = null;
    }
  }

  private async forwardPromptViaHttp(
    spaceId: string,
    agentId: string,
    roomSessionKey: string,
    prompt: { systemPrompt: string; userPrompt: string },
    onUpdate: SessionUpdateHandler,
    signal: AbortSignal,
    logicalSessionId: string,
    startedAt: number,
  ): Promise<string> {
    const { url, token } = readGatewayAuth();
    if (!token) throw new Error("OpenClaw gateway auth token is not configured");

    const messages = [
      { role: "system" as const, content: prompt.systemPrompt },
      { role: "user" as const, content: prompt.userPrompt },
    ];

    const model = gatewayModelForAgent(agentId);
    log.info(
      { spaceId, agentId, model, roomSessionKey },
      "forwarding prompt via OpenClaw HTTP room session",
    );

    // #region agent log
    fetch("http://host.docker.internal:7399/ingest/acbd8104-ecfc-434c-a54a-bcf58319b4b4", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "897816" },
      body: JSON.stringify({
        sessionId: "897816",
        runId: "room-session",
        hypothesisId: "H5",
        location: "openclaw-client.ts:forwardPromptViaHttp",
        message: "room session prompt start",
        data: { spaceId, agentId, model, roomSessionKey },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        // OpenClaw maps this field to its channel session store; we use a room key so
        // all collaborators in a room share one conversation history.
        user: roomSessionKey,
        messages,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenClaw gateway error (${response.status}): ${body.slice(0, 200)}`);
    }

    if (!response.body) throw new Error("OpenClaw gateway returned an empty response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    const emitChunk = async (text: string) => {
      if (!text) return;
      accumulated += text;
      await onUpdate({
        sessionId: logicalSessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text },
        },
      });
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const text = parsed.choices?.[0]?.delta?.content ?? "";
          await emitChunk(text);
        } catch {
          /* ignore malformed SSE chunks */
        }
      }
    }

    const elapsedMs = Date.now() - startedAt;
    log.info(
      { spaceId, agentId, model, roomSessionKey, elapsedMs, contentLength: accumulated.length },
      "prompt completed via OpenClaw HTTP room session",
    );

    // #region agent log
    fetch("http://host.docker.internal:7399/ingest/acbd8104-ecfc-434c-a54a-bcf58319b4b4", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "897816" },
      body: JSON.stringify({
        sessionId: "897816",
        runId: "room-session",
        hypothesisId: "H5",
        location: "openclaw-client.ts:forwardPromptViaHttp",
        message: "room session prompt complete",
        data: { spaceId, agentId, roomSessionKey, elapsedMs, contentLength: accumulated.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return accumulated ? "end_turn" : "cancelled";
  }

  cancelPrompt(runtimeSessionKey: string): void {
    const session = this.sessions.get(runtimeSessionKey);
    if (!session) return;
    session.activeAbort?.abort();
  }

  closeSession(runtimeSessionKey: string): void {
    const session = this.sessions.get(runtimeSessionKey);
    if (!session) return;
    session.activeAbort?.abort();
    this.sessions.delete(runtimeSessionKey);
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.activeAbort?.abort();
    }
    this.sessions.clear();
  }
}

export const openClawAcpClient = new OpenClawAcpClient();
