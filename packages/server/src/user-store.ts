import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { User, UserRole } from '@ai-spaces/shared';
import { config } from './config.js';

interface UserStore {
  users: Record<string, User>;
  byEmail: Record<string, string>;
}

export { hashPassword, verifyPassword } from './password-utils.js';

function getDataDir(): string {
  return config.AI_SPACES_DATA;
}

function getUsersFilePath(): string {
  return path.join(getDataDir(), 'users.json');
}

function loadStore(): UserStore {
  const filePath = getUsersFilePath();
  
  if (!fs.existsSync(filePath)) {
    return { users: {}, byEmail: {} };
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { users: {}, byEmail: {} };
  }
}

function saveStore(store: UserStore): void {
  const filePath = getUsersFilePath();
  const dataDir = getDataDir();
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

export function generateUserId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export interface CreateUserOptions {
  email: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
}

export function createUser(email: string, passwordHash: string, role: UserRole, displayName?: string): User {
  const store = loadStore();
  
  if (store.byEmail[email]) {
    const existingId = store.byEmail[email];
    return store.users[existingId];
  }
  
  const id = generateUserId();
  const now = new Date().toISOString();
  
  const user: User = {
    id,
    email,
    passwordHash,
    role,
    displayName,
    createdAt: now,
    updatedAt: now,
  };
  
  store.users[id] = user;
  store.byEmail[email] = id;
  
  saveStore(store);
  
  return user;
}

export function getUserByEmail(email: string): User | null {
  const store = loadStore();
  const id = store.byEmail[email];
  
  if (!id) {
    return null;
  }
  
  return store.users[id] || null;
}

export function getUserById(id: string): User | null {
  const store = loadStore();
  return store.users[id] || null;
}

export function listUsers(): User[] {
  const store = loadStore();
  return Object.values(store.users);
}

export function updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): User | null {
  const store = loadStore();
  const user = store.users[id];
  
  if (!user) {
    return null;
  }
  
  if (updates.email && updates.email !== user.email) {
    delete store.byEmail[user.email];
    store.byEmail[updates.email] = id;
  }
  
  Object.assign(user, updates, { updatedAt: new Date().toISOString() });
  
  saveStore(store);
  
  return user;
}

export function deleteUser(id: string): boolean {
  const store = loadStore();
  const user = store.users[id];
  
  if (!user) {
    return false;
  }
  
  delete store.byEmail[user.email];
  delete store.users[id];
  
  saveStore(store);
  
  return true;
}