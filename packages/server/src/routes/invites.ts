import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { inviteTokens, spaceMembers } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';

export const invitesRouter = new Hono<{ Variables: AuthVariables }>();

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
invitesRouter.post('/redeem', authMiddleware, zValidator('json', z.object({ token: z.string().length(64) })), async (c) => {
    const user = c.get('user');
    const { token } = c.req.valid('json');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();

    // Single atomic conditional UPDATE — no SELECT-then-UPDATE
    const result = db.run(
      sql`UPDATE invite_tokens SET consumed_at = ${now}
          WHERE token_hash = ${tokenHash} AND consumed_at IS NULL AND expires_at > ${now}`
    );

    if ((result as { changes: number }).changes !== 1) {
      return c.json({ error: 'Invalid, expired, or already-used invite' }, 400);
    }

    // Fetch invite details after successful consumption
    const invite = db.select().from(inviteTokens).where(eq(inviteTokens.tokenHash, tokenHash)).get();
    if (!invite) return c.json({ error: 'Invite not found' }, 404);

    // Add to space members (upsert)
    db.insert(spaceMembers).values({
      id: crypto.randomUUID(),
      spaceId: invite.spaceId,
      userId: user.userId,
      role: invite.role,
    }).onConflictDoUpdate({
      target: [spaceMembers.spaceId, spaceMembers.userId],
      set: { role: invite.role, updatedAt: sql`CURRENT_TIMESTAMP` },
    }).run();

    // Record who redeemed
    db.update(inviteTokens).set({ recipientUserId: user.userId }).where(eq(inviteTokens.tokenHash, tokenHash)).run();

    return c.json({ success: true, spaceId: invite.spaceId, role: invite.role });
  }
);

export type InvitesRouter = typeof invitesRouter;
