import * as crypto from 'crypto';
import { db } from './db/connection.js';
import { users, authProviders, serverRoles } from './db/index.js';
import type { UserWithServerRole } from './db/index.js';
import { eq, and } from 'drizzle-orm';
import type { User as DbUser } from './db/index.js';
import { DEFAULT_SERVER_ID } from './db/constants.js';
import {
  getUserWithServerRole,
  getUserWithServerRoleByEmail,
  getUserByOAuthId,
} from './db/queries.js';

export { hashPassword, verifyPassword } from './password-utils.js';
export { getUserWithServerRole, getUserWithServerRoleByEmail };

export function generateUserId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function createUser(
  email: string,
  passwordHash: string,
  role: 'admin' | 'user',
  displayName?: string,
): UserWithServerRole {
  const existing = db.select().from(users).where(eq(users.email, email)).limit(1).get();
  if (existing) {
    throw new Error(`User with email ${email} already exists`);
  }

  const id = generateUserId();
  const authProviderId = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.insert(users).values({
      id,
      email,
      displayName,
      createdAt: now,
      updatedAt: now,
    }).run();

    tx.insert(authProviders).values({
      id: authProviderId,
      userId: id,
      provider: 'password',
      passwordHash,
      createdAt: now,
      updatedAt: now,
    }).run();

    tx.insert(serverRoles).values({
      userId: id,
      serverId: DEFAULT_SERVER_ID,
      role,
      createdAt: now,
    }).run();
  });

  return getUserWithServerRole(id)!;
}

export function getUserForLogin(email: string): { user: UserWithServerRole; passwordHash: string } | null {
  const user = getUserWithServerRoleByEmail(email);
  if (!user) return null;

  const ap = db.select({ passwordHash: authProviders.passwordHash })
    .from(authProviders)
    .where(and(eq(authProviders.userId, user.id), eq(authProviders.provider, 'password')))
    .get();

  if (!ap?.passwordHash) return null;
  return { user, passwordHash: ap.passwordHash };
}

export function getUserPasswordHash(userId: string): string | null {
  const ap = db.select({ passwordHash: authProviders.passwordHash })
    .from(authProviders)
    .where(and(eq(authProviders.userId, userId), eq(authProviders.provider, 'password')))
    .get();
  return ap?.passwordHash ?? null;
}

export function updateUserPassword(userId: string, passwordHash: string): boolean {
  const provider = db.select({ id: authProviders.id })
    .from(authProviders)
    .where(and(eq(authProviders.userId, userId), eq(authProviders.provider, 'password')))
    .get();

  if (!provider) return false;

  db.update(authProviders)
    .set({
      passwordHash,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(authProviders.id, provider.id))
    .run();

  return true;
}

export function getUserById(id: string): DbUser | null {
  return db.select().from(users).where(eq(users.id, id)).limit(1).get() ?? null;
}

export function listUsers(): Array<DbUser & { serverRole: 'admin' | 'user' }> {
  const allUsers = db.select().from(users).all();
  const allRoles = db.select({ userId: serverRoles.userId, role: serverRoles.role })
    .from(serverRoles)
    .where(eq(serverRoles.serverId, DEFAULT_SERVER_ID))
    .all();
  const roleMap = new Map(allRoles.map(r => [r.userId, r.role as 'admin' | 'user']));
  return allUsers.map(u => ({ ...u, serverRole: roleMap.get(u.id) ?? 'user' }));
}

export function updateUser(id: string, updates: Partial<{ email: string; displayName: string }>): DbUser | null {
  const user = db.select().from(users).where(eq(users.id, id)).limit(1).get();
  if (!user) return null;

  const updatedData = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  db.update(users).set(updatedData).where(eq(users.id, id)).run();
  return db.select().from(users).where(eq(users.id, id)).limit(1).get() ?? null;
}

export function updateUserServerRole(userId: string, serverId: string, role: 'admin' | 'user'): boolean {
  const existing = db.select({ userId: serverRoles.userId })
    .from(serverRoles)
    .where(and(eq(serverRoles.userId, userId), eq(serverRoles.serverId, serverId)))
    .get();

  if (!existing) return false;

  db.update(serverRoles)
    .set({ role })
    .where(and(eq(serverRoles.userId, userId), eq(serverRoles.serverId, serverId)))
    .run();
  return true;
}

export function deleteUser(id: string): boolean {
  const result = db.delete(users).where(eq(users.id, id)).run();
  return result.changes > 0;
}

/**
 * Find or create a user based on OAuth provider information.
 * 
 * 1. Look up user by oauth_id + provider
 * 2. If not found, look up by email and link the OAuth provider to existing user
 * 3. If neither found, create new user with OAuth provider (bypasses ALLOW_OPEN_REGISTRATION)
 */
export function findOrCreateOAuthUser(
  provider: string,
  oauthId: string,
  email: string,
  displayName?: string,
): UserWithServerRole {
  // Step 1: Look up by OAuth ID
  const existingOAuthUser = getUserByOAuthId(provider, oauthId);
  if (existingOAuthUser) {
    return existingOAuthUser;
  }

  // Step 2: Look up by email and link OAuth provider if user exists
  const existingEmailUser = getUserWithServerRoleByEmail(email);
  if (existingEmailUser) {
    // Link the OAuth provider to this existing user
    const authProviderId = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    
    db.insert(authProviders).values({
      id: authProviderId,
      userId: existingEmailUser.id,
      provider,
      oauthId,
      createdAt: now,
      updatedAt: now,
    }).run();
    
    return existingEmailUser;
  }

  // Step 3: Create new user with OAuth provider
  const id = generateUserId();
  const authProviderId = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.insert(users).values({
      id,
      email,
      displayName,
      createdAt: now,
      updatedAt: now,
    }).run();

    tx.insert(authProviders).values({
      id: authProviderId,
      userId: id,
      provider,
      oauthId,
      createdAt: now,
      updatedAt: now,
    }).run();

    tx.insert(serverRoles).values({
      userId: id,
      serverId: DEFAULT_SERVER_ID,
      role: 'user',
      createdAt: now,
    }).run();
  });

  return getUserWithServerRole(id)!;
}
