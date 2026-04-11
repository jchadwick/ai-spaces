import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './index.js';

const dbPath = process.env.AI_SPACES_DB || '.ai-spaces.db';

const sqlite = new Database(dbPath);

sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

export { schema };