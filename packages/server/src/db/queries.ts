import { db } from './connection.js';
import { users, spaceMembers, serverRoles } from './index.js';
import type { UserWithServerRole } from './index.js';
import { and, eq } from 'drizzle-orm';
import type { SpaceRole } from '@ai-spaces/shared';
import { DEFAULT_SERVER_ID } from './constants.js';

export function getUserSpaceRole(userId: string, spaceId: string): SpaceRole | null {
  const serverRole = db.select({ role: serverRoles.role })
    .from(serverRoles)
    .where(and(eq(serverRoles.userId, userId), eq(serverRoles.serverId, DEFAULT_SERVER_ID)))
    .get();
  if (serverRole?.role === 'admin') return 'owner';

  const membership = db.select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .get();
  return membership ? (membership.role as SpaceRole) : null;
}

export function getUserSpaceRoles(userId: string, spaceIds: string[]): Map<string, SpaceRole> {
  const map = new Map<string, SpaceRole>();
  if (spaceIds.length === 0) return map;

  const serverRole = db.select({ role: serverRoles.role })
    .from(serverRoles)
    .where(and(eq(serverRoles.userId, userId), eq(serverRoles.serverId, DEFAULT_SERVER_ID)))
    .get();
  if (serverRole?.role === 'admin') {
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
  const row = db.select({ role: serverRoles.role })
    .from(serverRoles)
    .where(and(eq(serverRoles.userId, userId), eq(serverRoles.serverId, DEFAULT_SERVER_ID)))
    .get();
  return row?.role === 'admin';
}

export function getUserWithServerRole(userId: string): UserWithServerRole | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  const sr = db.select({ role: serverRoles.role })
    .from(serverRoles)
    .where(and(eq(serverRoles.userId, userId), eq(serverRoles.serverId, DEFAULT_SERVER_ID)))
    .get();
  return { ...user, serverRole: ((sr?.role ?? 'user') as 'admin' | 'user') };
}

export function getUserWithServerRoleByEmail(email: string): UserWithServerRole | null {
  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) return null;
  const sr = db.select({ role: serverRoles.role })
    .from(serverRoles)
    .where(and(eq(serverRoles.userId, user.id), eq(serverRoles.serverId, DEFAULT_SERVER_ID)))
    .get();
  return { ...user, serverRole: ((sr?.role ?? 'user') as 'admin' | 'user') };
}
