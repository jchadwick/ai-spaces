import * as fs from "node:fs";
import * as path from "node:path";
import { tryReadSecretFileSync } from "openclaw/plugin-sdk/core";
import { config, configStatus } from "./config.js";
import { logger as rootLogger } from "./logger.js";
import { getRuntime } from "./runtime.js";

const log = rootLogger.child({ component: "registration" });

export interface CredentialEntry {
  serverId: string;
  token: string;
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
  state: CredentialEntry | null;
  error?: string;
}

export function classifyCallbackResponse(status: number): RegistrationStatus | null {
  if (status === 401 || status === 403) return "stale-callback-token";
  if (status === 404 || status === 410) return "revoked";
  return null;
}

function getCredentialsPath(): string {
  return path.join(getRuntime().state.resolveStateDir(), "ai-spaces", "credentials.json");
}

export function loadCredentials(): CredentialEntry[] {
  try {
    const credPath = getCredentialsPath();
    const raw = tryReadSecretFileSync(credPath, "ai-spaces credentials");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CredentialEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as Record<string, unknown>).serverId === "string" &&
        typeof (e as Record<string, unknown>).token === "string",
    );
  } catch {
    return [];
  }
}

export function saveCredentials(entries: CredentialEntry[]): void {
  const credPath = getCredentialsPath();
  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  fs.writeFileSync(credPath, JSON.stringify(entries, null, 2), "utf-8");
}

export function clearCredentials(): void {
  try {
    fs.unlinkSync(getCredentialsPath());
  } catch {
    /* ignore */
  }
}

export function upsertCredential(entry: CredentialEntry): void {
  const existing = loadCredentials();
  const idx = existing.findIndex((e) => e.serverId === entry.serverId);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  saveCredentials(existing);
}

function buildPluginBaseUrl(): string {
  return config.PLUGIN_URL ?? `http://127.0.0.1:${config.AI_SPACES_WS_PORT}`;
}

async function attemptRegister(
  aiSpacesUrl: string,
  pluginUrl: string,
  registrationToken: string,
  gatewayUrl?: string,
): Promise<CredentialEntry> {
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
  };
  if (typeof data.serverId !== "string" || typeof data.callbackToken !== "string") {
    throw new Error("[ai-spaces] Server registration response missing serverId/callbackToken");
  }
  return {
    serverId: data.serverId,
    token: data.callbackToken,
  };
}

export async function registerWithServer(): Promise<CredentialEntry | null> {
  const result = await tryRegisterWithServer();
  return result.state;
}

export async function tryRegisterWithServer(): Promise<RegistrationResult> {
  const existing = loadCredentials()[0] ?? null;
  if (existing) {
    log.info({ serverId: existing.serverId }, "Using persisted credential");
    return { status: "registered", state: existing };
  }

  if (!configStatus.hasRegistrationToken) {
    return {
      status: "unpaired",
      state: null,
      error: "No local credential found. Set AI_SPACES_REGISTRATION_TOKEN to pair with AI Spaces.",
    };
  }

  log.info({ url: config.AI_SPACES_URL }, "Registering with server");
  const pluginUrl = buildPluginBaseUrl();

  try {
    const entry = await attemptRegister(
      config.AI_SPACES_URL,
      pluginUrl,
      config.AI_SPACES_REGISTRATION_TOKEN,
      config.GATEWAY_URL,
    );
    upsertCredential(entry);
    log.info({ serverId: entry.serverId }, "Registered with server");
    return { status: "registered", state: entry };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn({ err: error }, "Registration failed");
    if (error.includes("rejected (401)") || error.includes("rejected (403)")) {
      return { status: "auth-failed", state: null, error };
    }
    return { status: "server-unreachable", state: null, error };
  }
}
