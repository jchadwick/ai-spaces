import * as crypto from 'crypto';
import { type WorkspaceSpaceRecord } from '@ai-spaces/shared';
import { logger as rootLogger } from './logger.js';

const log = rootLogger.child({ component: 'reconcile' });
import { listSpaces, listSpacesByServerId, deleteSpace, insertSpace } from './space-store.js';
import { config } from './config.js';
import { db } from './db/connection.js';
import { spaceMembers, users } from './db/index.js';
import { eq } from 'drizzle-orm';
import { DEFAULT_SERVER_ID } from './db/constants.js';

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

    const existingMembers = db.select().from(spaceMembers)
      .where(eq(spaceMembers.spaceId, space.id))
      .all();

    if (existingMembers.length > 0) continue;

    for (const collaborator of spaceConfig.collaborators) {
      if (!collaborator.email) {
        if (config.ALLOW_ORPHAN_COLLABORATORS) {
          log.warn({ spaceId: space.id }, 'Collaborator without email — skipping');
        }
        continue;
      }

      const user = db.select().from(users).where(eq(users.email, collaborator.email)).get();

      if (!user) {
        if (config.ALLOW_ORPHAN_COLLABORATORS) {
          log.warn({ email: collaborator.email, spaceId: space.id }, 'No user found for collaborator email');
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

      log.info({ email: collaborator.email, spaceId: space.id }, 'Migrated collaborator to space_members');
    }
  }
}

export async function reconcileFromSpaceList(
  spaces: WorkspaceSpaceRecord[],
  serverId: string = DEFAULT_SERVER_ID,
): Promise<void> {
  await migrateCollaboratorsToMembers();

  const diskById = new Map(spaces.map(s => [s.id, s]));
  const dbSpaces = listSpacesByServerId(serverId);
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
        serverId,
      });
      if (!dbSpace) log.info({ id, path: diskSpace.path }, 'Registered missing space');
      else log.info({ id, from: dbSpace.path, to: diskSpace.path }, 'Updated path for space');
    }
  }

  for (const [id, dbSpace] of dbById) {
    if (!diskById.has(id)) {
      deleteSpace(id, 'system');
      log.info({ id, path: dbSpace.path }, 'Removed zombie space');
    }
  }
}
