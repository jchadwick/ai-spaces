import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './connection.js';
import { sqlite } from './connection.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { ensureSchemaHealth } from './schema-health.js';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle'
);

export function runMigrations(): void {
  try {
    if (!fs.existsSync(migrationsFolder)) {
      throw new Error(`Migrations folder not found: ${migrationsFolder}`);
    }

    console.info('[DB] Running migrations', {
      dbPath: sqlite.name,
      migrationsFolder,
    });

    migrate(db, { migrationsFolder });

    const schemaHealth = ensureSchemaHealth(sqlite);
    if (schemaHealth.repaired.length > 0) {
      console.warn('[DB] Applied schema repairs', { repairs: schemaHealth.repaired });
    }

    console.info('[DB] Migration + schema health checks complete');
  } catch (e) {
    console.error('[DB] Migration/schema health failed. Have you run `npm run db:generate`?', e);
    process.exit(1);
  }
}
