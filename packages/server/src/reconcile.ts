import * as crypto from "node:crypto";
import { type WorkspaceSpaceRecord } from "@ai-spaces/shared";
import { logger as rootLogger } from "./logger.js";

const log = rootLogger.child({ component: "reconcile" });

import { eq } from "drizzle-orm";
import { config } from "./config.js";
import { db } from "./db/connection.js";
import { DEFAULT_SERVER_ID } from "./db/constants.js";
import { spaceMembers, spaceTopics, users } from "./db/index.js";
import { deleteSpace, insertSpace, listSpaces, listSpacesByServerId } from "./space-store.js";

/**
 * Migrate legacy collaborators (email-based) to space_members (userId-based).
 * Idempotent: skips spaces where members already exist in DB.
 */
export async function migrateCollaboratorsToMembers(): Promise<void> {
  const allSpaces = listSpaces();

  for (const space of allSpaces) {
    let spaceConfig: { collaborators?: Array<{ email?: string; name?: string; role: string }> };
    try {
      spaceConfig = typeof space.config === "string" ? JSON.parse(space.config) : space.config;
    } catch {
      continue;
    }

    if (!spaceConfig.collaborators || spaceConfig.collaborators.length === 0) continue;

    const existingMembers = db
      .select()
      .from(spaceMembers)
      .where(eq(spaceMembers.spaceId, space.id))
      .all();

    if (existingMembers.length > 0) continue;

    for (const collaborator of spaceConfig.collaborators) {
      if (!collaborator.email) {
        if (config.ALLOW_ORPHAN_COLLABORATORS) {
          log.warn({ spaceId: space.id }, "Collaborator without email — skipping");
        }
        continue;
      }

      const user = db.select().from(users).where(eq(users.email, collaborator.email)).get();

      if (!user) {
        if (config.ALLOW_ORPHAN_COLLABORATORS) {
          log.warn(
            { email: collaborator.email, spaceId: space.id },
            "No user found for collaborator email",
          );
        }
        continue;
      }

      const now = new Date().toISOString();
      db.insert(spaceMembers)
        .values({
          id: crypto.randomUUID(),
          spaceId: space.id,
          userId: user.id,
          role: collaborator.role,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();

      log.info(
        { email: collaborator.email, spaceId: space.id },
        "Migrated collaborator to space_members",
      );
    }
  }
}

/**
 * Ensures the root topic "/" exists for a newly registered space.
 * Idempotent: safe to call even if the topic already exists.
 */
function ensureRootTopic(spaceId: string, now: string): void {
  db.insert(spaceTopics)
    .values({
      id: crypto.randomUUID(),
      spaceId,
      topicPath: "/",
      targetType: "root",
      status: "active",
      acpSessionId: null,
      archivedAt: null,
      createdByUserId: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

export async function reconcileFromSpaceList(
  spaces: WorkspaceSpaceRecord[],
  serverId: string = DEFAULT_SERVER_ID,
): Promise<void> {
  await migrateCollaboratorsToMembers();

  const diskByRuntimeId = new Map(spaces.map((s) => [s.id, s]));
  const dbSpaces = listSpacesByServerId(serverId);
  const dbByRuntimeId = new Map(dbSpaces.map((s) => [s.runtimeSpaceId, s]));

  for (const [runtimeSpaceId, diskSpace] of diskByRuntimeId) {
    const dbSpace = dbByRuntimeId.get(runtimeSpaceId);
    const now = new Date().toISOString();
    if (!dbSpace || dbSpace.path !== diskSpace.path) {
      const space = insertSpace({
        id: dbSpace?.id,
        runtimeSpaceId,
        agentId: diskSpace.agentId,
        agentType: diskSpace.agentType,
        path: diskSpace.path,
        configPath: diskSpace.configPath,
        config: diskSpace.config,
        createdAt: dbSpace?.createdAt ?? now,
        updatedAt: now,
        serverId,
      });
      if (!dbSpace) {
        log.info({ runtimeSpaceId, path: diskSpace.path }, "Registered missing space");
        ensureRootTopic(space.id, now);
      } else {
        log.info(
          { id: dbSpace.id, runtimeSpaceId, from: dbSpace.path, to: diskSpace.path },
          "Updated path for space",
        );
      }
    }
  }

  for (const [runtimeSpaceId, dbSpace] of dbByRuntimeId) {
    if (!diskByRuntimeId.has(runtimeSpaceId)) {
      deleteSpace(dbSpace.id, "system");
      log.info({ id: dbSpace.id, runtimeSpaceId, path: dbSpace.path }, "Removed zombie space");
    }
  }
}
