import * as fs from "node:fs";
import * as path from "node:path";
import { config, configStatus } from "./config.js";
import { logger as rootLogger } from "./logger.js";

const log = rootLogger.child({ component: "registration" });

export interface RegistrationState {
  serverId: string;
  callbackToken: string;
  aiSpacesUrl: string;
  pluginUrl: string;
  acpBaseUrl: string;
  gatewayUrl?: string;
  runtimeType: "openclaw";
  registeredAt: string;
}

export type RegistrationStatus =
  | "registered"
  | "unpaired"
  | "missing-state"
  | "invalid-config"
  | "auth-failed"
  | "server-unreachable"
  | "stale-callback-token"
  | "revoked";

export interface RegistrationResult {
  status: RegistrationStatus;
  state: RegistrationState | null;
  error?: string;
}

export function classifyCallbackResponse(status: number): RegistrationStatus | null {
  if (status === 401 || status === 403) return "stale-callback-token";
  if (status === 404 || status === 410) return "revoked";
  return null;
}

export function loadRegistrationState(): RegistrationState | null {
  try {
    if (!fs.existsSync(config.AI_SPACES_PLUGIN_STATE_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(config.AI_SPACES_PLUGIN_STATE_FILE, "utf-8"));
    if (
      typeof parsed?.serverId === "string" &&
      typeof parsed?.callbackToken === "string" &&
      typeof parsed?.aiSpacesUrl === "string" &&
      typeof parsed?.pluginUrl === "string" &&
      typeof parsed?.acpBaseUrl === "string" &&
      parsed?.runtimeType === "openclaw" &&
      typeof parsed?.registeredAt === "string" &&
      (typeof parsed?.gatewayUrl === "string" || parsed?.gatewayUrl === undefined)
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

function buildPluginBaseUrl(): string {
  return config.PLUGIN_URL ?? `http://127.0.0.1:${config.AI_SPACES_WS_PORT}`;
}

async function attemptRegister(
  aiSpacesUrl: string,
  pluginUrl: string,
  registrationToken: string,
  gatewayUrl?: string,
): Promise<RegistrationState> {
  const res = await fetch(`${aiSpacesUrl}/api/internal/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      runtimeType: "openclaw",
      name: "openclaw-plugin",
      pluginUrl,
      acpBaseUrl: pluginUrl,
      ...(gatewayUrl ? { gatewayUrl } : {}),
      registrationToken,
      metadata: {
        stateFile: config.AI_SPACES_PLUGIN_STATE_FILE,
      },
    }),
    signal: AbortSignal.timeout(3_000),
  });

  // Pairing token failures won't self-heal without a fresh admin-issued token.
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `[ai-spaces] Server pairing rejected (${res.status}) — check registration token`,
    );
  }

  if (!res.ok) {
    throw new Error(`[ai-spaces] Server registration failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    serverId?: unknown;
    callbackToken?: unknown;
    gatewayUrl?: string;
    acpBaseUrl?: string;
  };
  if (typeof data.serverId !== "string" || typeof data.callbackToken !== "string") {
    throw new Error("[ai-spaces] Server registration response missing serverId/callbackToken");
  }
  return {
    serverId: data.serverId,
    callbackToken: data.callbackToken,
    aiSpacesUrl,
    pluginUrl,
    acpBaseUrl: data.acpBaseUrl ?? pluginUrl,
    ...(data.gatewayUrl ? { gatewayUrl: data.gatewayUrl } : {}),
    runtimeType: "openclaw",
    registeredAt: new Date().toISOString(),
  };
}

export async function registerWithServer(): Promise<RegistrationState | null> {
  const result = await tryRegisterWithServer();
  return result.state;
}

export async function tryRegisterWithServer(): Promise<RegistrationResult> {
  const existing = loadRegistrationState();
  if (existing) {
    log.info({ serverId: existing.serverId }, "Using persisted registration");
    return { status: "registered", state: existing };
  }

  if (!configStatus.hasRegistrationToken) {
    return {
      status: "unpaired",
      state: null,
      error:
        "No local registration state found. Set AI_SPACES_REGISTRATION_TOKEN to pair with AI Spaces.",
    };
  }

  log.info({ url: config.AI_SPACES_URL }, "Registering with server");
  const pluginUrl = buildPluginBaseUrl();

  try {
    const state = await attemptRegister(
      config.AI_SPACES_URL,
      pluginUrl,
      config.AI_SPACES_REGISTRATION_TOKEN,
      config.GATEWAY_URL,
    );
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
