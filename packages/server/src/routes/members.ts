import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as crypto from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { spaceMembers, inviteTokens, notifications } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { getSpace } from '../space-store.js';
import { config } from '../config.js';
import type { AuthVariables } from '../middleware/auth.js';

export const membersRouter = new Hono<{ Variables: AuthVariables }>();

membersRouter.use('*', authMiddleware);

// GET /api/spaces/:spaceId/members — list members
membersRouter.get('/:spaceId/members', async (c) => {
  const user = c.get('user');
  const spaceId = c.req.param('spaceId');

  const space = getSpace(spaceId);
  if (!space) return c.json({ error: 'Space not found' }, 404);

  const membership = db.select().from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, user.userId)))
    .get();
  if (!membership) return c.json({ error: 'Forbidden' }, 403);

  const members = db.select().from(spaceMembers)
    .where(eq(spaceMembers.spaceId, spaceId))
    .all();

  return c.json({ members });
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['viewer', 'editor', 'admin']),
});

// POST /api/spaces/:spaceId/members — add member (admin only)
// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
membersRouter.post('/:spaceId/members', zValidator('json', addMemberSchema), async (c) => {
  const user = c.get('user');
  const spaceId = c.req.param('spaceId');
  const { userId, role } = c.req.valid('json');

  const space = getSpace(spaceId);
  if (!space) return c.json({ error: 'Space not found' }, 404);

  const membership = db.select().from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, user.userId)))
    .get();
  if (!membership || membership.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(spaceMembers).values({
    id,
    spaceId,
    userId,
    role,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [spaceMembers.spaceId, spaceMembers.userId],
    set: { role, updatedAt: sql`CURRENT_TIMESTAMP` },
  }).run();

  return c.json({ success: true });
});

const updateMemberSchema = z.object({
  role: z.enum(['viewer', 'editor', 'admin']),
});

// PATCH /api/spaces/:spaceId/members/:userId — change role (admin only, last-admin guard)
// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
membersRouter.patch('/:spaceId/members/:userId', zValidator('json', updateMemberSchema), async (c) => {
  const user = c.get('user');
  const spaceId = c.req.param('spaceId');
  const userId = c.req.param('userId');
  const { role: newRole } = c.req.valid('json');

  const space = getSpace(spaceId);
  if (!space) return c.json({ error: 'Space not found' }, 404);

  const membership = db.select().from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, user.userId)))
    .get();
  if (!membership || membership.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const result = db.run(
    sql`UPDATE space_members SET role = ${newRole}, updated_at = CURRENT_TIMESTAMP
        WHERE space_id = ${spaceId} AND user_id = ${userId}
        AND (${newRole} = 'admin'
          OR (SELECT COUNT(*) FROM space_members WHERE space_id = ${spaceId} AND role = 'admin' AND user_id != ${userId}) >= 1)`
  );
  if ((result as { changes: number }).changes === 0) return c.json({ error: 'Cannot demote the last admin' }, 409);

  return c.json({ success: true });
});

// DELETE /api/spaces/:spaceId/members/:userId — remove member (admin only, last-admin guard)
membersRouter.delete('/:spaceId/members/:userId', async (c) => {
  const user = c.get('user');
  const spaceId = c.req.param('spaceId');
  const userId = c.req.param('userId');

  const space = getSpace(spaceId);
  if (!space) return c.json({ error: 'Space not found' }, 404);

  const membership = db.select().from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, user.userId)))
    .get();
  if (!membership || membership.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const result = db.run(
    sql`DELETE FROM space_members
        WHERE space_id = ${spaceId} AND user_id = ${userId}
        AND ((SELECT role FROM space_members WHERE space_id = ${spaceId} AND user_id = ${userId}) != 'admin'
          OR (SELECT COUNT(*) FROM space_members WHERE space_id = ${spaceId} AND role = 'admin') > 1)`
  );
  if ((result as { changes: number }).changes === 0) return c.json({ error: 'Cannot remove the last admin' }, 409);

  return c.json({ success: true });
});

const createInviteSchema = z.object({
  role: z.enum(['viewer', 'editor', 'admin']),
  recipientUserId: z.string().optional(),
});

// POST /api/spaces/:spaceId/invites — create invite token (admin only)
// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
membersRouter.post('/:spaceId/invites', zValidator('json', createInviteSchema), async (c) => {
  const user = c.get('user');
  const spaceId = c.req.param('spaceId');
  const { role, recipientUserId } = c.req.valid('json');

  const space = getSpace(spaceId);
  if (!space) return c.json({ error: 'Space not found' }, 404);

  const membership = db.select().from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, user.userId)))
    .get();
  if (!membership || membership.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const inviteId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.insert(inviteTokens).values({
    id: inviteId,
    spaceId,
    tokenHash,
    role,
    createdByUserId: user.userId,
    recipientUserId: recipientUserId ?? null,
    expiresAt,
    consumedAt: null,
  }).run();

  // Insert notification row — no raw URL stored
  const notificationId = crypto.randomUUID();
  db.insert(notifications).values({
    id: notificationId,
    type: 'invite',
    recipientUserId: recipientUserId ?? null,
    spaceId,
    role,
    inviteId,
    read: 'false',
  }).run();

  // rawToken returned to admin caller for out-of-band delivery — not stored in DB
  const inviteUrl = `${config.INVITE_BASE_URL}/invite#token=${rawToken}`;
  process.stderr.write(`\n[INVITE] Invite URL (deliver out-of-band):\n  ${inviteUrl}\n\n`);

  return c.json({ inviteId, inviteUrl });
});

export type MembersRouter = typeof membersRouter;
