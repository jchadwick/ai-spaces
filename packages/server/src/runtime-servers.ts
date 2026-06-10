import * as crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { Context } from "hono";
import { config } from "./config.js";
import { sqlite } from "./db/connection.js";
import { DEFAULT_SERVER_ID } from "./db/constants.js";

export type RuntimeType = "openclaw";
export type RuntimeServerStatus = "active" | "revoked" | "unavailable";

export type RuntimeServerRecord = {
  id: string;
  name: string;
  runtimeType: RuntimeType;
  status: RuntimeServerStatus;
  pluginUrl: string | null;
  acpBaseUrl: string | null;
  endpointUrl: string | null;
  gatewayUrl: string | null;
  metadata: Record<string, unknown> | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  revokedAt: string | null;
  hasCallbackToken: boolean;
};

type ServerRow = {
  id: string;
  name: string;
  plugin_url: string | null;
  acp_base_url?: string | null;
  gateway_url: string | null;
  callback_token: string | null;
  callback_token_hash?: string | null;
  runtime_type?: string | null;
  status?: string | null;
  metadata?: string | null;
  last_seen_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  revoked_at?: string | null;
};

type RegistrationTokenRow = {
  id: string;
  token_hash: string;
  expires_at: string;
  consumed_at?: string | null;
  used_at?: string | null;
};

export class RuntimeServerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeServerUnavailableError";
  }
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { name: string } | undefined;
  return Boolean(row?.name);
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  if (!tableExists(db, tableName)) return false;
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

export function ensureRuntimeServerStorage(): void {
  if (!tableExists(sqlite, "server_registration_tokens")) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS server_registration_tokens (
        id text PRIMARY KEY NOT NULL,
        token_hash text NOT NULL UNIQUE,
        name text,
        runtime_type text DEFAULT 'openclaw' NOT NULL,
        metadata text DEFAULT '{}' NOT NULL,
        status text DEFAULT 'active' NOT NULL,
        expires_at text NOT NULL,
        consumed_at text,
        consumed_by_server_id text REFERENCES servers(id) ON DELETE SET NULL,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
  } else {
    const tokenColumns: Array<[string, string]> = [
      ["expires_at", "text"],
      ["consumed_at", "text"],
      ["consumed_by_server_id", "text REFERENCES servers(id) ON DELETE SET NULL"],
      ["updated_at", "text"],
    ];
    for (const [column, definition] of tokenColumns) {
      if (!columnExists(sqlite, "server_registration_tokens", column)) {
        sqlite.exec(`ALTER TABLE server_registration_tokens ADD COLUMN ${column} ${definition}`);
      }
    }
  }

  const serverColumns: Array<[string, string]> = [
    ["runtime_type", "text NOT NULL DEFAULT 'openclaw'"],
    ["acp_base_url", "text"],
    ["callback_token_hash", "text"],
    ["status", "text NOT NULL DEFAULT 'active'"],
    ["metadata", "text"],
    ["last_seen_at", "text"],
    ["updated_at", "text"],
    ["revoked_at", "text"],
  ];
  for (const [column, definition] of serverColumns) {
    if (!columnExists(sqlite, "servers", column)) {
      sqlite.exec(`ALTER TABLE servers ADD COLUMN ${column} ${definition}`);
    }
  }
}

export function createOpaqueToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return `sha256:${crypto.createHash("sha256").update(token, "utf8").digest("hex")}`;
}

export function verifyOpaqueToken(token: string, storedValue: string | null | undefined): boolean {
  if (!storedValue) return false;
  const expected = storedValue.startsWith("sha256:") ? storedValue : hashOpaqueToken(storedValue);
  const actual = storedValue.startsWith("sha256:")
    ? hashOpaqueToken(token)
    : hashOpaqueToken(token);
  return timingSafeEqual(actual, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const [, aRaw, bRaw] = ipv4;
  const a = Number(aRaw);
  const b = Number(bRaw);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

export function normalizeRuntimeEndpointUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not include credentials`);
  }
  const allowInsecureRuntimeUrls = process.env.AI_SPACES_ALLOW_INSECURE_RUNTIME_URLS === "true";
  const localOrPrivate = isLocalOrPrivateHostname(url.hostname);
  if (
    url.protocol !== "https:" &&
    process.env.NODE_ENV === "production" &&
    !allowInsecureRuntimeUrls &&
    !localOrPrivate
  ) {
    throw new Error(`${name} must use HTTPS in production`);
  }

  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function parseMetadata(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toRuntimeServerRecord(row: ServerRow): RuntimeServerRecord {
  const status = row.revoked_at
    ? "revoked"
    : row.status === "revoked" || row.status === "unavailable"
      ? row.status
      : "active";
  const pluginUrl = row.plugin_url ?? null;
  const acpBaseUrl = row.acp_base_url ?? null;
  return {
    id: row.id,
    name: row.name,
    runtimeType: row.runtime_type === "openclaw" ? "openclaw" : "openclaw",
    status,
    pluginUrl,
    acpBaseUrl,
    endpointUrl: acpBaseUrl ?? pluginUrl,
    gatewayUrl: row.gateway_url ?? null,
    metadata: parseMetadata(row.metadata),
    lastSeenAt: row.last_seen_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    revokedAt: row.revoked_at ?? null,
    hasCallbackToken: Boolean(row.callback_token_hash || row.callback_token),
  };
}

function getServerRow(serverId: string): ServerRow | null {
  ensureRuntimeServerStorage();
  return (
    (sqlite.prepare("SELECT * FROM servers WHERE id = ? LIMIT 1").get(serverId) as
      | ServerRow
      | undefined) ?? null
  );
}

export function listRuntimeServers(): RuntimeServerRecord[] {
  ensureRuntimeServerStorage();
  const rows = sqlite.prepare("SELECT * FROM servers ORDER BY created_at ASC").all() as ServerRow[];
  return rows.map(toRuntimeServerRecord);
}

export function createRegistrationToken(
  createdByUserId: string,
  ttlMs = 15 * 60 * 1000,
): { id: string; token: string; expiresAt: string } {
  ensureRuntimeServerStorage();
  void createdByUserId;
  const id = crypto.randomUUID();
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO server_registration_tokens
       (id, token_hash, expires_at, consumed_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
    )
    .run(id, hashOpaqueToken(token), expiresAt, now, now);
  return { id, token, expiresAt };
}

function redeemRegistrationToken(
  token: string,
): { success: true; id: string } | { success: false } {
  ensureRuntimeServerStorage();
  const now = new Date().toISOString();
  const tokenHash = hashOpaqueToken(token);
  const consumedColumn = columnExists(sqlite, "server_registration_tokens", "used_at")
    ? "used_at"
    : "consumed_at";
  const redeem = sqlite.transaction(() => {
    const row = sqlite
      .prepare(
        `SELECT *
         FROM server_registration_tokens
         WHERE token_hash = ? AND ${consumedColumn} IS NULL AND expires_at > ?
         LIMIT 1`,
      )
      .get(tokenHash, now) as RegistrationTokenRow | undefined;
    if (!row) return null;
    const result = sqlite
      .prepare(
        `UPDATE server_registration_tokens
         SET ${consumedColumn} = ?, updated_at = ?
         WHERE id = ? AND ${consumedColumn} IS NULL AND expires_at > ?`,
      )
      .run(now, now, row.id, now);
    return result.changes === 1 ? row.id : null;
  });
  const id = redeem();
  return id ? { success: true, id } : { success: false };
}

export type RegisterRuntimeServerInput = {
  registrationToken: string;
  runtimeType: RuntimeType;
  name: string;
  pluginUrl?: string;
  acpBaseUrl?: string;
  gatewayUrl?: string;
  metadata?: Record<string, unknown>;
};

export function registerRuntimeServer(input: RegisterRuntimeServerInput): {
  server: RuntimeServerRecord;
  callbackToken: string;
  created: boolean;
} {
  const pluginUrl = input.pluginUrl
    ? normalizeRuntimeEndpointUrl(input.pluginUrl, "pluginUrl")
    : undefined;
  const acpBaseUrl = input.acpBaseUrl
    ? normalizeRuntimeEndpointUrl(input.acpBaseUrl, "acpBaseUrl")
    : undefined;
  if (!pluginUrl && !acpBaseUrl) {
    throw new Error("pluginUrl or acpBaseUrl is required");
  }
  const gatewayUrl = input.gatewayUrl
    ? normalizeRuntimeEndpointUrl(input.gatewayUrl, "gatewayUrl")
    : config.BASE_URL;

  const redeemed = redeemRegistrationToken(input.registrationToken);
  if (!redeemed.success) {
    throw new Error("Registration token is invalid, expired, or already used");
  }

  const callbackToken = createOpaqueToken();
  const callbackTokenHash = hashOpaqueToken(callbackToken);
  const now = new Date().toISOString();
  const endpoint = acpBaseUrl ?? pluginUrl;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const existing = sqlite
    .prepare(
      `SELECT * FROM servers
       WHERE id != ?
       AND ((plugin_url IS NOT NULL AND plugin_url = ?)
         OR (acp_base_url IS NOT NULL AND acp_base_url = ?))
       LIMIT 1`,
    )
    .get(DEFAULT_SERVER_ID, endpoint, endpoint) as ServerRow | undefined;

  const serverId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    sqlite
      .prepare(
        `UPDATE servers
         SET name = ?, runtime_type = ?, plugin_url = ?, acp_base_url = ?, gateway_url = ?,
             callback_token = NULL, callback_token_hash = ?, status = 'active',
             metadata = ?, last_seen_at = ?, updated_at = ?, revoked_at = NULL
         WHERE id = ?`,
      )
      .run(
        input.name,
        input.runtimeType,
        pluginUrl ?? acpBaseUrl ?? null,
        acpBaseUrl ?? pluginUrl ?? null,
        gatewayUrl,
        callbackTokenHash,
        metadataJson,
        now,
        now,
        serverId,
      );
  } else {
    sqlite
      .prepare(
        `INSERT INTO servers
         (id, name, plugin_url, gateway_url, callback_token, created_at, runtime_type,
          acp_base_url, callback_token_hash, status, metadata, last_seen_at, updated_at, revoked_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'active', ?, ?, ?, NULL)`,
      )
      .run(
        serverId,
        input.name,
        pluginUrl ?? acpBaseUrl ?? null,
        gatewayUrl,
        now,
        input.runtimeType,
        acpBaseUrl ?? pluginUrl ?? null,
        callbackTokenHash,
        metadataJson,
        now,
        now,
      );
  }

  const server = getServerRow(serverId);
  if (!server) throw new Error("Registered server was not persisted");
  sqlite
    .prepare(
      "UPDATE server_registration_tokens SET consumed_by_server_id = ?, updated_at = ? WHERE id = ?",
    )
    .run(serverId, now, redeemed.id);
  return { server: toRuntimeServerRecord(server), callbackToken, created: !existing };
}

export function authenticateRuntimeCallback(
  serverId: string | undefined,
  callbackToken: string | undefined,
): RuntimeServerRecord | null {
  if (!serverId || !callbackToken) return null;
  const row = getServerRow(serverId);
  if (!row) return null;
  const server = toRuntimeServerRecord(row);
  if (server.status === "revoked") return null;
  const storedToken = row.callback_token_hash ?? row.callback_token;
  if (!verifyOpaqueToken(callbackToken, storedToken)) return null;

  const now = new Date().toISOString();
  sqlite
    .prepare("UPDATE servers SET last_seen_at = ?, status = 'active', updated_at = ? WHERE id = ?")
    .run(now, now, serverId);
  return { ...server, lastSeenAt: now, status: "active" };
}

export function getRuntimeAuthFromRequest(c: Context): {
  serverId: string | undefined;
  callbackToken: string | undefined;
} {
  const authHeader = c.req.header("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  return {
    serverId: c.req.header("X-AI-Spaces-Server-Id") ?? c.req.header("X-Server-Id") ?? undefined,
    callbackToken: bearerToken ?? c.req.header("X-AI-Spaces-Callback-Token") ?? undefined,
  };
}

export function isServerRoutable(serverId: string): boolean {
  if (serverId === DEFAULT_SERVER_ID) return true;
  const row = getServerRow(serverId);
  if (!row) return false;
  const server = toRuntimeServerRecord(row);
  return server.status === "active" && Boolean(server.endpointUrl);
}

export function getActiveRuntimeServerEndpoint(serverId: string): string {
  const row = getServerRow(serverId);
  if (!row) throw new RuntimeServerUnavailableError(`Server ${serverId} is unavailable`);
  const server = toRuntimeServerRecord(row);
  if (server.status !== "active" || !server.endpointUrl) {
    throw new RuntimeServerUnavailableError(`Server ${serverId} is unavailable`);
  }
  return server.endpointUrl;
}

export function updateRuntimeServer(
  serverId: string,
  input: { name?: string; status?: RuntimeServerStatus },
): RuntimeServerRecord | null {
  ensureRuntimeServerStorage();
  const row = getServerRow(serverId);
  if (!row || serverId === DEFAULT_SERVER_ID) return null;
  const current = toRuntimeServerRecord(row);
  const status = input.status ?? current.status;
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `UPDATE servers
       SET name = COALESCE(?, name), status = ?, updated_at = ?,
           revoked_at = CASE WHEN ? = 'revoked' THEN COALESCE(revoked_at, ?) ELSE revoked_at END
       WHERE id = ?`,
    )
    .run(input.name ?? null, status, now, status, now, serverId);
  const updated = getServerRow(serverId);
  return updated ? toRuntimeServerRecord(updated) : null;
}

export function revokeOrDeleteRuntimeServer(
  serverId: string,
  physicalDelete = false,
): {
  deleted: boolean;
  server: RuntimeServerRecord | null;
} {
  ensureRuntimeServerStorage();
  if (serverId === DEFAULT_SERVER_ID) {
    throw new Error("Default server cannot be revoked or deleted");
  }
  const row = getServerRow(serverId);
  if (!row) return { deleted: false, server: null };

  const spaceCount = (
    sqlite.prepare("SELECT COUNT(*) as count FROM spaces WHERE server_id = ?").get(serverId) as {
      count: number;
    }
  ).count;
  if (physicalDelete && spaceCount === 0) {
    sqlite.prepare("DELETE FROM servers WHERE id = ?").run(serverId);
    return { deleted: true, server: null };
  }

  const now = new Date().toISOString();
  sqlite
    .prepare("UPDATE servers SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, serverId);
  const updated = getServerRow(serverId);
  return { deleted: false, server: updated ? toRuntimeServerRecord(updated) : null };
}

export function markRuntimeServerUnavailable(serverId: string): void {
  if (serverId === DEFAULT_SERVER_ID) return;
  ensureRuntimeServerStorage();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      "UPDATE servers SET status = 'unavailable', updated_at = ? WHERE id = ? AND status = 'active'",
    )
    .run(now, serverId);
}
