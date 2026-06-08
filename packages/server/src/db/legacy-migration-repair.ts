import crypto from "node:crypto";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { DEFAULT_SERVER_ID } from "./constants.js";

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1")
    .get(tableName) as { name: string } | undefined;
  return Boolean(row?.name);
}

function indexExists(sqlite: Database.Database, indexName: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=? LIMIT 1")
    .get(indexName) as { name: string } | undefined;
  return Boolean(row?.name);
}

function columnExists(sqlite: Database.Database, tableName: string, columnName: string): boolean {
  if (!tableExists(sqlite, tableName)) return false;
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function migrationApplied(sqlite: Database.Database, hash: string): boolean {
  if (!tableExists(sqlite, "__drizzle_migrations")) return false;
  const row = sqlite
    .prepare("SELECT 1 as found FROM __drizzle_migrations WHERE hash = ? LIMIT 1")
    .get(hash) as { found: number } | undefined;
  return row?.found === 1;
}

function parseJournalTimestamp(journalPath: string, tag: string): number {
  const parsed = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries?: Array<{ tag?: string; when?: number }>;
  };
  const entry = parsed.entries?.find((candidate) => candidate.tag === tag);
  if (!entry?.when) {
    throw new Error(`Missing migration journal timestamp for tag ${tag}`);
  }
  return entry.when;
}

function runMigrationSqlFile(sqlite: Database.Database, sqlPath: string): void {
  const fullSql = fs.readFileSync(sqlPath, "utf8");
  const statements = fullSql
    .split("--> statement-breakpoint")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  for (const statement of statements) {
    sqlite.exec(statement);
  }
}

function ensurePost0003Shape(sqlite: Database.Database): string[] {
  const repaired: string[] = [];

  if (!tableExists(sqlite, "servers")) {
    sqlite.exec(`
      CREATE TABLE servers (
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
      );
    `);
    repaired.push("created servers table (legacy fallback)");
  }

  sqlite
    .prepare("INSERT INTO servers (id, name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING")
    .run(DEFAULT_SERVER_ID, "default");

  if (!tableExists(sqlite, "auth_providers")) {
    sqlite.exec(`
      CREATE TABLE auth_providers (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider text NOT NULL,
        password_hash text,
        oauth_id text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CHECK (provider IN ('password', 'github', 'google'))
      );
    `);
    repaired.push("created auth_providers table (legacy fallback)");
  }

  if (!indexExists(sqlite, "auth_providers_user_provider_idx")) {
    sqlite.exec(
      "CREATE UNIQUE INDEX auth_providers_user_provider_idx ON auth_providers (user_id, provider)",
    );
    repaired.push("created auth_providers_user_provider_idx (legacy fallback)");
  }

  if (!tableExists(sqlite, "server_roles")) {
    sqlite.exec(`
      CREATE TABLE server_roles (
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        server_id text NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        role text NOT NULL DEFAULT 'user',
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY (user_id, server_id)
      );
    `);
    repaired.push("created server_roles table (legacy fallback)");
  }

  if (tableExists(sqlite, "spaces") && !columnExists(sqlite, "spaces", "server_id")) {
    sqlite.exec(
      `ALTER TABLE spaces ADD COLUMN server_id text NOT NULL DEFAULT '${DEFAULT_SERVER_ID}' REFERENCES servers(id)`,
    );
    repaired.push("added spaces.server_id (legacy fallback)");
  }

  if (tableExists(sqlite, "spaces") && !columnExists(sqlite, "spaces", "runtime_space_id")) {
    sqlite.exec("ALTER TABLE spaces ADD COLUMN runtime_space_id text NOT NULL DEFAULT ''");
    sqlite.exec("UPDATE spaces SET runtime_space_id = id WHERE runtime_space_id = ''");
    repaired.push("added spaces.runtime_space_id (legacy fallback)");
  }

  return repaired;
}

export function repairLegacy0003State(
  sqlite: Database.Database,
  migrationsFolder: string,
): string[] {
  const migrationTag = "0003_multi_table_auth";
  const migrationSqlPath = `${migrationsFolder}/${migrationTag}.sql`;
  const journalPath = `${migrationsFolder}/meta/_journal.json`;
  const migrationHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(migrationSqlPath))
    .digest("hex");

  if (!tableExists(sqlite, "__drizzle_migrations")) {
    return [];
  }

  const applied = migrationApplied(sqlite, migrationHash);
  const missingCriticalObjects =
    !tableExists(sqlite, "servers") ||
    !tableExists(sqlite, "auth_providers") ||
    !tableExists(sqlite, "server_roles") ||
    !columnExists(sqlite, "spaces", "server_id") ||
    !columnExists(sqlite, "spaces", "runtime_space_id");

  if (!missingCriticalObjects) return [];

  const repaired: string[] = [];

  sqlite.exec("PRAGMA foreign_keys=OFF");
  sqlite.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    if (
      !applied &&
      !tableExists(sqlite, "servers") &&
      !tableExists(sqlite, "auth_providers") &&
      !tableExists(sqlite, "server_roles")
    ) {
      runMigrationSqlFile(sqlite, migrationSqlPath);
      repaired.push("applied legacy migration 0003 from SQL");
    } else {
      repaired.push(...ensurePost0003Shape(sqlite));
    }

    if (!migrationApplied(sqlite, migrationHash)) {
      const createdAt = parseJournalTimestamp(journalPath, migrationTag);
      sqlite
        .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
        .run(migrationHash, createdAt);
      repaired.push("recorded legacy migration 0003 in drizzle ledger");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys=ON");
  }

  return repaired;
}
