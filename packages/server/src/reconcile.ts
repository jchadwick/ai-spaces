import * as crypto from 'crypto';
import { type WorkspaceSpaceRecord } from '@ai-spaces/shared';
import { listSpaces, deleteSpace, insertSpace } from './space-store.js';
import { config } from './config.js';
import { db } from './db/connection.js';
import { spaceMembers, users } from './db/index.js';
import { eq } from 'drizzle-orm';

/**
 * Migrate legacy collaborators (email-based) to space_members (userId-based).
 * Idempotent: skips spaces where members already exist in DB.
 */
export async function migrateCollaboratorsToMembers(): Promise<void> {
  const allSpaces = listSpaces();

  for (const space of allSpaces) {
    let spaceConfig: { collaborators?: Array<{ email?: string; name?: string; role: string }> };
    try {
      spaceConfig = typeof space.config === 'string' ? JSON.parse(space.config) : space.config;
    } catch {
      continue;
    }

    if (!spaceConfig.collaborators || spaceConfig.collaborators.length === 0) continue;

    // Check if any members already exist for this space
    const existingMembers = db.select().from(spaceMembers)
      .where(eq(spaceMembers.spaceId, space.id))
      .all();

    if (existingMembers.length > 0) continue; // already migrated

    for (const collaborator of spaceConfig.collaborators) {
      if (!collaborator.email) {
        if (config.ALLOW_ORPHAN_COLLABORATORS) {
          console.warn(`[reconcile] Collaborator without email in space ${space.id} — skipping`);
        }
        continue;
      }

      const user = db.select().from(users).where(eq(users.email, collaborator.email)).get();

      if (!user) {
        if (config.ALLOW_ORPHAN_COLLABORATORS) {
          console.warn(`[reconcile] No user found for collaborator email ${collaborator.email} in space ${space.id}`);
        }
        continue;
      }

      const now = new Date().toISOString();
      db.insert(spaceMembers).values({
        id: crypto.randomUUID(),
        spaceId: space.id,
        userId: user.id,
        role: collaborator.role,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing().run();

      console.info(`[reconcile] Migrated collaborator ${collaborator.email} to space_members for space ${space.id}`);
    }
  }
}

export async function reconcileFromSpaceList(spaces: WorkspaceSpaceRecord[]): Promise<void> {
  await migrateCollaboratorsToMembers();

  const diskById = new Map(spaces.map(s => [s.id, s]));
  const dbSpaces = listSpaces();
  const dbById = new Map(dbSpaces.map(s => [s.id, s]));

  for (const [id, diskSpace] of diskById) {
    const dbSpace = dbById.get(id);
    const now = new Date().toISOString();
    if (!dbSpace || dbSpace.path !== diskSpace.path) {
      insertSpace({
        id: diskSpace.id,
        agentId: diskSpace.agentId,
        agentType: diskSpace.agentType,
        path: diskSpace.path,
        configPath: diskSpace.configPath,
        config: diskSpace.config,
        createdAt: dbSpace?.createdAt ?? now,
        updatedAt: now,
      });
      if (!dbSpace) console.info(`[reconcile] Registered missing space: ${id} at ${diskSpace.path}`);
      else console.info(`[reconcile] Updated path for space: ${id} ${dbSpace.path} → ${diskSpace.path}`);
    }
  }

  for (const [id, dbSpace] of dbById) {
    if (!diskById.has(id)) {
      deleteSpace(id, 'system');
      console.info(`[reconcile] Removed zombie space: ${id} (path: ${dbSpace.path})`);
    }
  }
}

