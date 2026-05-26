import type Database from 'better-sqlite3';
import { DEFAULT_SERVER_ID } from './constants.js';

export type SchemaHealthResult = {
  repaired: string[];
};

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(tableName) as { name: string } | undefined;
  return Boolean(row?.name);
}

function getColumnNames(sqlite: Database.Database, tableName: string): Set<string> {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function ensureServersTable(sqlite: Database.Database, repaired: string[]): void {
  if (!tableExists(sqlite, 'servers')) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        plugin_url text,
        gateway_url text,
        callback_token text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    repaired.push('created table servers');
  }

  const columns = getColumnNames(sqlite, 'servers');
  if (!columns.has('plugin_url')) {
    sqlite.exec('ALTER TABLE servers ADD COLUMN plugin_url text');
    repaired.push('added servers.plugin_url');
  }
  if (!columns.has('callback_token')) {
    sqlite.exec('ALTER TABLE servers ADD COLUMN callback_token text');
    repaired.push('added servers.callback_token');
  }
  if (!columns.has('gateway_url')) {
    sqlite.exec('ALTER TABLE servers ADD COLUMN gateway_url text');
    repaired.push('added servers.gateway_url');
  }
}

function ensureDefaultServer(sqlite: Database.Database, repaired: string[]): void {
  const result = sqlite.prepare(
    'INSERT INTO servers (id, name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING'
  ).run(DEFAULT_SERVER_ID, 'God Server');

  if (
    !sqlite
      .prepare('SELECT id FROM servers WHERE id = ? LIMIT 1')
      .get(DEFAULT_SERVER_ID)
  ) {
    throw new Error('Failed to ensure default server row exists');
  }

  if (result.changes > 0) {
    repaired.push('inserted default servers row');
  }
}

function ensureSpacesServerId(sqlite: Database.Database, repaired: string[]): void {
  if (!tableExists(sqlite, 'spaces')) return;

  const columns = getColumnNames(sqlite, 'spaces');
  if (!columns.has('server_id')) {
    sqlite.exec(
      `ALTER TABLE spaces ADD COLUMN server_id text NOT NULL DEFAULT '${DEFAULT_SERVER_ID}' REFERENCES servers(id)`
    );
    repaired.push('added spaces.server_id');
  }
}

function validateCriticalSchema(sqlite: Database.Database): void {
  if (!tableExists(sqlite, 'servers')) {
    throw new Error('Schema health check failed: servers table is missing after repair attempt');
  }

  const fkErrors = sqlite.prepare('PRAGMA foreign_key_check').all() as Array<Record<string, unknown>>;
  if (fkErrors.length > 0) {
    const first = fkErrors[0];
    throw new Error(
      `Schema health check failed: foreign_key_check reported ${fkErrors.length} issue(s). First issue: ${JSON.stringify(first)}`,
    );
  }
}

export function ensureSchemaHealth(sqlite: Database.Database): SchemaHealthResult {
  const repaired: string[] = [];

  sqlite.exec('PRAGMA foreign_keys=OFF');
  sqlite.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    ensureServersTable(sqlite, repaired);
    ensureDefaultServer(sqlite, repaired);
    ensureSpacesServerId(sqlite, repaired);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  } finally {
    sqlite.exec('PRAGMA foreign_keys=ON');
  }

  validateCriticalSchema(sqlite);

  return { repaired };
}
