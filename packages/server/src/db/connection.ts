import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './index.js';
import { config } from '../config.js';

const dbDir = path.dirname(config.AI_SPACES_DB);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
export const sqlite = new Database(config.AI_SPACES_DB);

sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

export { schema };
