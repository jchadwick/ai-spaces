import * as crypto from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import { inviteTokens, notifications, spaceMembers, users } from "../db/index.js";
import { getUserSpaceRole } from "../db/queries.js";
import type { AuthVariables } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { getSpace } from "../space-store.js";

export const membersRouter = new Hono<{ Variables: AuthVariables }>();

membersRouter.use("*", authMiddleware);

// GET /api/spaces/:spaceId/members — list members with user details
membersRouter.get("/:spaceId/members", async (c) => {
  const user = c.get("user");
  const spaceId = c.req.param("spaceId");

  const space = getSpace(spaceId);
  if (!space) return c.json({ error: "Space not found" }, 404);

  if (!getUserSpaceRole(user.userId, spaceId)) return c.json({ error: "Forbidden" }, 403);

  const members = db
    .select({
      id: spaceMembers.id,
      spaceId: spaceMembers.spaceId,
      userId: spaceMembers.userId,
      role: spaceMembers.role,
      email: users.email,
      displayName: users.displayName,
      createdAt: spaceMembers.createdAt,
      updatedAt: spaceMembers.updatedAt,
    })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, spaceId))
    .all();

  return c.json({ members });
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["owner", "editor", "viewer"]),
});

// POST /api/spaces/:spaceId/members — add member (owner only)
// @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
membersRouter.post("/:spaceId/members", zValidator("json", addMemberSchema), async (c) => {
  const user = c.get("user");
  const spaceId = c.req.param("spaceId");
  const { userId, role } = c.req.valid("json");

  const space = getSpace(spaceId);
  if (!space) return c.json({ error: "Space not found" }, 404);

  if (getUserSpaceRole(user.userId, spaceId) !== "owner")
    return c.json({ error: "Forbidden" }, 403);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(spaceMembers)
    .values({
      id,
      spaceId,
      userId,
      role,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [spaceMembers.spaceId, spaceMembers.userId],
      set: { role, updatedAt: sql`CURRENT_TIMESTAMP` },
    })
    .run();

  return c.json({ success: true });
});

const updateMemberSchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
});

// PATCH /api/spaces/:spaceId/members/:userId — change role (owner only, last-owner guard)
membersRouter.patch(
  "/:spaceId/members/:userId",
  // @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
  zValidator("json", updateMemberSchema),
  async (c) => {
    const user = c.get("user");
    const spaceId = c.req.param("spaceId");
    const userId = c.req.param("userId");
    const { role: newRole } = c.req.valid("json");

    const space = getSpace(spaceId);
    if (!space) return c.json({ error: "Space not found" }, 404);

    if (getUserSpaceRole(user.userId, spaceId) !== "owner")
      return c.json({ error: "Forbidden" }, 403);

    const result = db.run(
      sql`UPDATE space_members SET role = ${newRole}, updated_at = CURRENT_TIMESTAMP
        WHERE space_id = ${spaceId} AND user_id = ${userId}
        AND (${newRole} = 'owner'
          OR (SELECT COUNT(*) FROM space_members WHERE space_id = ${spaceId} AND role = 'owner' AND user_id != ${userId}) >= 1)`,
    );
    if ((result as { changes: number }).changes === 0)
      return c.json({ error: "Cannot demote the last owner" }, 409);

    return c.json({ success: true });
  },
);

// DELETE /api/spaces/:spaceId/members/:userId — remove member (owner only, last-owner guard)
membersRouter.delete("/:spaceId/members/:userId", async (c) => {
  const user = c.get("user");
  const spaceId = c.req.param("spaceId");
  const userId = c.req.param("userId");

  const space = getSpace(spaceId);
  if (!space) return c.json({ error: "Space not found" }, 404);

  if (getUserSpaceRole(user.userId, spaceId) !== "owner")
    return c.json({ error: "Forbidden" }, 403);

  const result = db.run(
    sql`DELETE FROM space_members
        WHERE space_id = ${spaceId} AND user_id = ${userId}
        AND ((SELECT role FROM space_members WHERE space_id = ${spaceId} AND user_id = ${userId}) != 'owner'
          OR (SELECT COUNT(*) FROM space_members WHERE space_id = ${spaceId} AND role = 'owner') > 1)`,
  );
  if ((result as { changes: number }).changes === 0)
    return c.json({ error: "Cannot remove the last owner" }, 409);

  return c.json({ success: true });
});

const createInviteSchema = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
  recipientUserId: z.string().optional(),
});

// POST /api/spaces/:spaceId/invites — create invite token (owner only)
// @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
membersRouter.post("/:spaceId/invites", zValidator("json", createInviteSchema), async (c) => {
  const user = c.get("user");
  const spaceId = c.req.param("spaceId");
  const { role, recipientUserId } = c.req.valid("json");

  const space = getSpace(spaceId);
  if (!space) return c.json({ error: "Space not found" }, 404);

  if (getUserSpaceRole(user.userId, spaceId) !== "owner")
    return c.json({ error: "Forbidden" }, 403);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const inviteId = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + config.INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  db.insert(inviteTokens)
    .values({
      id: inviteId,
      spaceId,
      tokenHash,
      role,
      recipientUserId: recipientUserId ?? null,
      expiresAt,
      consumedAt: null,
    })
    .run();

  // Insert notification row — no raw URL stored
  const notificationId = crypto.randomUUID();
  db.insert(notifications)
    .values({
      id: notificationId,
      type: "invite",
      recipientUserId: recipientUserId ?? null,
      spaceId,
      role,
      inviteId,
      read: "false",
    })
    .run();

  // rawToken returned to admin caller for out-of-band delivery — not stored in DB
  const inviteUrl = `${config.BASE_URL}/invite#token=${rawToken}`;
  process.stderr.write(`\n[INVITE] Invite URL (deliver out-of-band):\n  ${inviteUrl}\n\n`);

  return c.json({ inviteId, inviteUrl });
});

export type MembersRouter = typeof membersRouter;
