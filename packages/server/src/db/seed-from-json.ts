import * as fs from 'fs';
import * as path from 'path';
import { db } from './connection.js';
import { spaces, users } from './index.js';
import { config } from '../config.js';

export function seedFromJsonIfNeeded(): void {
  const dataDir = config.AI_SPACES_DATA;

  const hasSpaces = db.select().from(spaces).limit(1).get();
  const spacesJson = path.join(dataDir, 'spaces.json');
  if (!hasSpaces && fs.existsSync(spacesJson)) {
    try {
      const raw = JSON.parse(fs.readFileSync(spacesJson, 'utf-8'));
      const records = Object.values(raw.spaces ?? {}) as Record<string, unknown>[];
      db.transaction((tx) => {
        for (const rec of records) {
          tx.insert(spaces).values({
            id: rec.id as string,
            agentId: rec.agentId as string,
            agentType: (rec.agentType as string) ?? 'openclaw',
            path: rec.path as string,
            configPath: (rec.configPath as string | null) ?? null,
            config: typeof rec.config === 'string' ? rec.config : JSON.stringify(rec.config ?? {}),
            createdAt: rec.createdAt as string,
            updatedAt: rec.updatedAt as string,
          }).run();
        }
      });
      console.log(`[DB] Migrated ${records.length} spaces from JSON`);
    } catch (e) {
      console.error('[DB] Failed to migrate spaces from JSON:', e);
    }
  }

  const hasUsers = db.select().from(users).limit(1).get();
  const usersJson = path.join(dataDir, 'users.json');
  if (!hasUsers && fs.existsSync(usersJson)) {
    try {
      const raw = JSON.parse(fs.readFileSync(usersJson, 'utf-8'));
      const records = Object.values(raw.users ?? {}) as Record<string, unknown>[];
      db.transaction((tx) => {
        for (const rec of records) {
          tx.insert(users).values({
            id: rec.id as string,
            email: rec.email as string,
            passwordHash: rec.passwordHash as string,
            role: (rec.role as string) ?? 'viewer',
            displayName: (rec.displayName as string | null) ?? null,
            createdAt: rec.createdAt as string,
            updatedAt: rec.updatedAt as string,
          }).run();
        }
      });
      console.log(`[DB] Migrated ${records.length} users from JSON`);
    } catch (e) {
      console.error('[DB] Failed to migrate users from JSON:', e);
    }
  }
}
