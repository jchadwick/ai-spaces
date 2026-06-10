import type Database from "better-sqlite3";
import { DEFAULT_SERVER_ID } from "./constants.js";

export type SchemaHealthResult = {
  repaired: string[];
};

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { name: string } | undefined;
  return Boolean(row?.name);
}

function getColumnNames(sqlite: Database.Database, tableName: string): Set<string> {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function indexExists(sqlite: Database.Database, indexName: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1")
    .get(indexName) as { name: string } | undefined;
  return Boolean(row?.name);
}

function ensureServersTable(sqlite: Database.Database, repaired: string[]): void {
  if (!tableExists(sqlite, "servers")) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        runtime_type text DEFAULT 'openclaw' NOT NULL,
        status text DEFAULT 'active' NOT NULL,
        plugin_url text,
        gateway_url text,
        metadata text DEFAULT '{}' NOT NULL,
        callback_token text,
        callback_token_hash text,
        callback_token_created_at text,
        callback_token_expires_at text,
        callback_token_revoked_at text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        last_seen_at text
      )
    `);
    repaired.push("created table servers");
  }

  const columns = getColumnNames(sqlite, "servers");
  if (!columns.has("runtime_type")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN runtime_type text NOT NULL DEFAULT 'openclaw'");
    repaired.push("added servers.runtime_type");
  }
  if (!columns.has("status")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN status text NOT NULL DEFAULT 'active'");
    repaired.push("added servers.status");
  }
  if (!columns.has("plugin_url")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN plugin_url text");
    repaired.push("added servers.plugin_url");
  }
  if (!columns.has("callback_token")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN callback_token text");
    repaired.push("added servers.callback_token");
  }
  if (!columns.has("gateway_url")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN gateway_url text");
    repaired.push("added servers.gateway_url");
  }
  if (!columns.has("metadata")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN metadata text NOT NULL DEFAULT '{}'");
    repaired.push("added servers.metadata");
  }
  if (!columns.has("callback_token_hash")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN callback_token_hash text");
    repaired.push("added servers.callback_token_hash");
  }
  if (!columns.has("callback_token_created_at")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN callback_token_created_at text");
    repaired.push("added servers.callback_token_created_at");
  }
  if (!columns.has("callback_token_expires_at")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN callback_token_expires_at text");
    repaired.push("added servers.callback_token_expires_at");
  }
  if (!columns.has("callback_token_revoked_at")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN callback_token_revoked_at text");
    repaired.push("added servers.callback_token_revoked_at");
  }
  if (!columns.has("updated_at")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN updated_at text NOT NULL DEFAULT ''");
    sqlite.exec("UPDATE servers SET updated_at = created_at WHERE updated_at = ''");
    repaired.push("added servers.updated_at");
  }
  if (!columns.has("last_seen_at")) {
    sqlite.exec("ALTER TABLE servers ADD COLUMN last_seen_at text");
    repaired.push("added servers.last_seen_at");
  }
}

function ensureServerRegistrationTokensTable(sqlite: Database.Database, repaired: string[]): void {
  if (tableExists(sqlite, "server_registration_tokens")) return;

  sqlite.exec(`
    CREATE TABLE server_registration_tokens (
      id text PRIMARY KEY NOT NULL,
      token_hash text NOT NULL UNIQUE,
      name text,
      runtime_type text DEFAULT 'openclaw' NOT NULL,
      metadata text DEFAULT '{}' NOT NULL,
      status text DEFAULT 'active' NOT NULL,
      expires_at text,
      consumed_at text,
      consumed_by_server_id text REFERENCES servers(id) ON DELETE SET NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  repaired.push("created table server_registration_tokens");
}

function ensureDefaultServer(sqlite: Database.Database, repaired: string[]): void {
  const result = sqlite
    .prepare("INSERT INTO servers (id, name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING")
    .run(DEFAULT_SERVER_ID, "God Server");

  if (!sqlite.prepare("SELECT id FROM servers WHERE id = ? LIMIT 1").get(DEFAULT_SERVER_ID)) {
    throw new Error("Failed to ensure default server row exists");
  }

  if (result.changes > 0) {
    repaired.push("inserted default servers row");
  }
}

function ensureSpacesServerId(sqlite: Database.Database, repaired: string[]): void {
  if (!tableExists(sqlite, "spaces")) return;

  const columns = getColumnNames(sqlite, "spaces");
  if (!columns.has("server_id")) {
    sqlite.exec(
      `ALTER TABLE spaces ADD COLUMN server_id text NOT NULL DEFAULT '${DEFAULT_SERVER_ID}' REFERENCES servers(id)`,
    );
    repaired.push("added spaces.server_id");
  }
  if (!columns.has("runtime_space_id")) {
    sqlite.exec("ALTER TABLE spaces ADD COLUMN runtime_space_id text NOT NULL DEFAULT ''");
    sqlite.exec("UPDATE spaces SET runtime_space_id = id WHERE runtime_space_id = ''");
    repaired.push("added spaces.runtime_space_id");
  }

  if (indexExists(sqlite, "spaces_agent_path_idx")) {
    sqlite.exec("DROP INDEX spaces_agent_path_idx");
    repaired.push("dropped spaces_agent_path_idx");
  }
  if (!indexExists(sqlite, "spaces_server_runtime_space_idx")) {
    sqlite.exec(
      "CREATE UNIQUE INDEX spaces_server_runtime_space_idx ON spaces (server_id, runtime_space_id)",
    );
    repaired.push("created spaces_server_runtime_space_idx");
  }
  if (!indexExists(sqlite, "spaces_server_agent_path_idx")) {
    sqlite.exec(
      "CREATE UNIQUE INDEX spaces_server_agent_path_idx ON spaces (server_id, agent_id, path)",
    );
    repaired.push("created spaces_server_agent_path_idx");
  }
}

function ensureRoomPathNormalization(sqlite: Database.Database, repaired: string[]): void {
  if (!tableExists(sqlite, "space_rooms")) return;

  const rows = sqlite
    .prepare("SELECT id, room_path FROM space_rooms WHERE room_path != '/' AND room_path LIKE '%/'")
    .all() as Array<{ id: string; room_path: string }>;

  for (const row of rows) {
    const normalized = row.room_path.replace(/\/+$/, "");
    if (normalized === row.room_path) continue;
    sqlite.prepare("UPDATE space_rooms SET room_path = ? WHERE id = ?").run(normalized, row.id);
    repaired.push(`normalized space_rooms.room_path ${row.room_path} -> ${normalized}`);
  }
}

function validateCriticalSchema(sqlite: Database.Database): void {
  if (!tableExists(sqlite, "servers")) {
    throw new Error("Schema health check failed: servers table is missing after repair attempt");
  }

  const fkErrors = sqlite.prepare("PRAGMA foreign_key_check").all() as Array<
    Record<string, unknown>
  >;
  if (fkErrors.length > 0) {
    const first = fkErrors[0];
    throw new Error(
      `Schema health check failed: foreign_key_check reported ${fkErrors.length} issue(s). First issue: ${JSON.stringify(first)}`,
    );
  }
}

export function ensureSchemaHealth(sqlite: Database.Database): SchemaHealthResult {
  const repaired: string[] = [];

  sqlite.exec("PRAGMA foreign_keys=OFF");
  sqlite.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    ensureServersTable(sqlite, repaired);
    ensureDefaultServer(sqlite, repaired);
    ensureServerRegistrationTokensTable(sqlite, repaired);
    ensureSpacesServerId(sqlite, repaired);
    ensureRoomPathNormalization(sqlite, repaired);
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys=ON");
  }

  validateCriticalSchema(sqlite);

  return { repaired };
}
