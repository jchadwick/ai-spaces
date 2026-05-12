import { db } from './connection.js';
import { users, spaceMembers } from './index.js';
import { and, eq } from 'drizzle-orm';
import type { SpaceRole } from '@ai-spaces/shared';

export function getUserSpaceRole(userId: string, spaceId: string): SpaceRole | null {
  const user = db.select({ role: users.role }).from(users).where(eq(users.id, userId)).get();
  if (user?.role === 'admin') return 'owner';

  const membership = db.select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .get();

  return membership ? (membership.role as SpaceRole) : null;
}

export function getUserSpaceRoles(userId: string, spaceIds: string[]): Map<string, SpaceRole> {
  const map = new Map<string, SpaceRole>();
  if (spaceIds.length === 0) return map;

  const user = db.select({ role: users.role }).from(users).where(eq(users.id, userId)).get();
  if (user?.role === 'admin') {
    for (const id of spaceIds) map.set(id, 'owner');
    return map;
  }

  const memberships = db.select({ spaceId: spaceMembers.spaceId, role: spaceMembers.role })
    .from(spaceMembers)
    .where(eq(spaceMembers.userId, userId))
    .all();

  for (const m of memberships) map.set(m.spaceId, m.role as SpaceRole);
  return map;
}

export function isServerAdmin(userId: string): boolean {
  const user = db.select({ role: users.role }).from(users).where(eq(users.id, userId)).get();
  return user?.role === 'admin';
}
