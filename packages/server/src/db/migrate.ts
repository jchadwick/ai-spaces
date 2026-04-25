import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './connection.js';
import { fileURLToPath } from 'url';
import path from 'path';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle'
);

export function runMigrations(): void {
  try {
    migrate(db, { migrationsFolder });
  } catch (e) {
    console.error('[DB] Migration failed. Have you run `npm run db:generate`?', e);
    process.exit(1);
  }
}
