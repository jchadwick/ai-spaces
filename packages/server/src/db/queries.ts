import { db } from './connection.js';
import { users, spaceMembers, serverRoles, servers, spaces } from './index.js';
import type { UserWithServerRole } from './index.js';
import { and, eq, inArray } from 'drizzle-orm';
import type { SpaceRole } from '@ai-spaces/shared';
import { DEFAULT_SERVER_ID } from './constants.js';

export function getServerById(serverId: string): typeof servers.$inferSelect | null {
  return db.select().from(servers).where(eq(servers.id, serverId)).get() ?? null;
}

export function getServerBySpaceId(spaceId: string): typeof servers.$inferSelect | null {
  const row = db.select({ serverId: spaces.serverId }).from(spaces).where(eq(spaces.id, spaceId)).get();
  if (!row) return null;
  return db.select().from(servers).where(eq(servers.id, row.serverId)).get() ?? null;
}

export function getUserSpaceRole(userId: string, spaceId: string): SpaceRole | null {
  const spaceRow = db.select({ serverId: spaces.serverId }).from(spaces).where(eq(spaces.id, spaceId)).get();
  const resolvedServerId = spaceRow?.serverId ?? DEFAULT_SERVER_ID;

  const serverRole = db.select({ role: serverRoles.role })
    .from(serverRoles)
    .where(and(eq(serverRoles.userId, userId), eq(serverRoles.serverId, resolvedServerId)))
    .get();
  if (serverRole?.role === 'admin') return 'owner';

  if (resolvedServerId !== DEFAULT_SERVER_ID) {
    const godRole = db.select({ role: serverRoles.role })
      .from(serverRoles)
      .where(and(eq(serverRoles.userId, userId), eq(serverRoles.serverId, DEFAULT_SERVER_ID)))
      .get();
    if (godRole?.role === 'admin') return 'owner';
  }

  const membership = db.select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .get();
  return membership ? (membership.role as SpaceRole) : null;
}

export function getUserSpaceRoles(userId: string, spaceIds: string[]): Map<string, SpaceRole> {
  const map = new Map<string, SpaceRole>();
  if (spaceIds.length === 0) return map;

  const spaceRows = db.select({ id: spaces.id, serverId: spaces.serverId })
    .from(spaces)
    .where(inArray(spaces.id, spaceIds))
    .all();
  const serverIdBySpace = new Map(spaceRows.map(r => [r.id, r.serverId]));

  const isGodAdmin = db.select({ role: serverRoles.role })
    .from(serverRoles)
    .where(and(eq(serverRoles.userId, userId), eq(serverRoles.serverId, DEFAULT_SERVER_ID), eq(serverRoles.role, 'admin')))
    .get()?.role === 'admin';

  if (isGodAdmin) {
    for (const id of spaceIds) {
      map.set(id, 'owner');
    }
  } else {
    const adminRows = db.select({ serverId: serverRoles.serverId })
      .from(serverRoles)
      .where(and(eq(serverRoles.userId, userId), eq(serverRoles.role, 'admin')))
      .all();
    const adminServerSet = new Set(adminRows.map(r => r.serverId));

    for (const id of spaceIds) {
      const sid = serverIdBySpace.get(id) ?? DEFAULT_SERVER_ID;
      if (adminServerSet.has(sid)) map.set(id, 'owner');
    }
  }

  const memberships = db.select({ spaceId: spaceMembers.spaceId, role: spaceMembers.role })
    .from(spaceMembers)
    .where(eq(spaceMembers.userId, userId))
    .all();
  for (const m of memberships) {
    if (!map.has(m.spaceId)) map.set(m.spaceId, m.role as SpaceRole);
  }
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
