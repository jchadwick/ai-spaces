import * as crypto from 'crypto';
import { db } from './db/connection.js';
import { users } from './db/index.js';
import { eq } from 'drizzle-orm';
import type { UserRole } from '@ai-spaces/shared';

export { hashPassword, verifyPassword } from './password-utils.js';

export function generateUserId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export interface CreateUserOptions {
  email: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
}

export function createUser(email: string, passwordHash: string, role: UserRole, displayName?: string) {
  const existing = db.select().from(users).where(eq(users.email, email)).limit(1).get();
  
  if (existing) {
    return existing;
  }
  
  const id = generateUserId();
  const now = new Date().toISOString();
  
  db.insert(users).values({
    id,
    email,
    passwordHash,
    role,
    displayName,
    createdAt: now,
    updatedAt: now,
  }).run();
  
  return db.select().from(users).where(eq(users.id, id)).limit(1).get();
}

export function getUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).limit(1).get();
}

export function getUserById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).limit(1).get();
}

export function listUsers() {
  return db.select().from(users).all();
}

export function updateUser(id: string, updates: Partial<{ email: string; passwordHash: string; role: UserRole; displayName: string }>) {
  const user = db.select().from(users).where(eq(users.id, id)).limit(1).get();
  
  if (!user) {
    return null;
  }
  
  const updatedData = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  db.update(users).set(updatedData).where(eq(users.id, id)).run();
  
  return db.select().from(users).where(eq(users.id, id)).limit(1).get();
}

export function deleteUser(id: string): boolean {
  const result = db.delete(users).where(eq(users.id, id)).run();
  return result.changes > 0;
}