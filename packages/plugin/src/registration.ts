import * as fs from "node:fs";
import * as path from "node:path";
import { config, configStatus } from "./config.js";
import { logger as rootLogger } from "./logger.js";

const log = rootLogger.child({ component: "registration" });

export interface RegistrationState {
  serverId: string;
  callbackToken: string;
  gatewayUrl: string;
}

export type RegistrationStatus =
  | "registered"
  | "unregistered"
  | "invalid-config"
  | "auth-failed"
  | "server-unreachable"
  | "stale-callback-token";

export interface RegistrationResult {
  status: RegistrationStatus;
  state: RegistrationState | null;
  error?: string;
}

export function loadRegistrationState(): RegistrationState | null {
  try {
    if (!fs.existsSync(config.AI_SPACES_PLUGIN_STATE_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(config.AI_SPACES_PLUGIN_STATE_FILE, "utf-8"));
    if (
      typeof parsed?.serverId === "string" &&
      typeof parsed?.callbackToken === "string" &&
      typeof parsed?.gatewayUrl === "string"
    ) {
      return parsed as RegistrationState;
    }
    return null;
  } catch {
    return null;
  }
}

function saveState(state: RegistrationState): void {
  try {
    fs.mkdirSync(path.dirname(config.AI_SPACES_PLUGIN_STATE_FILE), { recursive: true });
    fs.writeFileSync(config.AI_SPACES_PLUGIN_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Could not persist registration state",
    );
  }
}

export function clearRegistrationState(): void {
  try {
    fs.unlinkSync(config.AI_SPACES_PLUGIN_STATE_FILE);
  } catch {
    /* ignore */
  }
}

async function attemptRegister(pluginUrl: string, gatewayUrl: string): Promise<RegistrationState> {
  const res = await fetch(`${config.AI_SPACES_URL}/api/internal/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pluginUrl, gatewayUrl, name: "openclaw-plugin" }),
    signal: AbortSignal.timeout(3_000),
  });

  // Auth failures won't self-heal — propagate immediately without retry
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `[ai-spaces] Server registration rejected (${res.status}) — check GATEWAY_TOKEN`,
    );
  }

  if (!res.ok) {
    throw new Error(`[ai-spaces] Server registration failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    serverId: string;
    callbackToken: string;
    gatewayUrl: string;
  };
  return {
    serverId: data.serverId,
    callbackToken: data.callbackToken,
    gatewayUrl: data.gatewayUrl,
  };
}

export async function registerWithServer(): Promise<RegistrationState | null> {
  const result = await tryRegisterWithServer();
  return result.state;
}

export async function tryRegisterWithServer(): Promise<RegistrationResult> {
  if (!configStatus.hasGatewayToken) {
    return {
      status: "invalid-config",
      state: null,
      error: "GATEWAY_TOKEN missing",
    };
  }

  const existing = loadRegistrationState();
  if (existing) {
    log.info({ serverId: existing.serverId }, "Using persisted registration");
    return { status: "registered", state: existing };
  }

  log.info({ url: config.AI_SPACES_URL }, "Registering with server");
  const pluginUrl = config.PLUGIN_URL ?? `http://127.0.0.1:${config.AI_SPACES_WS_PORT}`;
  const gatewayUrl = process.env.GATEWAY_URL ?? "http://127.0.0.1:19000";

  try {
    const state = await attemptRegister(pluginUrl, gatewayUrl);
    saveState(state);
    log.info({ serverId: state.serverId }, "Registered with server");
    return { status: "registered", state };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn({ err: error }, "Registration failed");
    if (error.includes("rejected (401)") || error.includes("rejected (403)")) {
      return { status: "auth-failed", state: null, error };
    }
    return { status: "server-unreachable", state: null, error };
  }
}
