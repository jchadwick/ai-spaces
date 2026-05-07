import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, spaceMembers } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';

export const identityRouter = new Hono<{ Variables: AuthVariables }>();

identityRouter.get('/:spaceId/identity-search', authMiddleware, async (c) => {
  const user = c.get('user');
  const spaceId = c.req.param('spaceId');
  const q = (c.req.query('q') ?? '').trim();

  if (q.length < 3) return c.json({ error: 'Query must be at least 3 characters' }, 400);

  // Verify caller is a member of this space
  const membership = db.select().from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, user.userId)))
    .get();
  if (!membership) return c.json({ error: 'Forbidden' }, 403);

  // Search only among members of this space — join on spaceMembers
  const results = db
    .select({ userId: users.id, displayName: users.displayName })
    .from(users)
    .innerJoin(spaceMembers, eq(spaceMembers.userId, users.id))
    .where(
      and(
        eq(spaceMembers.spaceId, spaceId),
        sql`lower(${users.displayName}) LIKE ${'%' + q.toLowerCase() + '%'}`
      )
    )
    .limit(5)
    .all();

  return c.json({ users: results });
});

export type IdentityRouter = typeof identityRouter;
