import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { User, UserRole } from "@ai-spaces/shared";
import { config } from "./config.js";

interface StoredUser extends User {
  passwordHash: string;
  role: UserRole;
}

interface UserStore {
  users: Record<string, StoredUser>;
  byEmail: Record<string, string>;
}

export { hashPassword, verifyPassword } from "./password-utils.js";

function getOpenClawHome(): string {
  return config.OPENCLAW_HOME;
}

function getUsersFilePath(): string {
  return path.join(getOpenClawHome(), "users.json");
}

function loadStore(): UserStore {
  const filePath = getUsersFilePath();

  if (!fs.existsSync(filePath)) {
    return { users: {}, byEmail: {} };
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return { users: {}, byEmail: {} };
  }
}

function saveStore(store: UserStore): void {
  const filePath = getUsersFilePath();
  const openclawHome = getOpenClawHome();

  if (!fs.existsSync(openclawHome)) {
    fs.mkdirSync(openclawHome, { recursive: true });
  }

  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, filePath);
}

export function generateUserId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export interface CreateUserOptions {
  email: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
}

export function createUser(
  email: string,
  passwordHash: string,
  role: UserRole,
  displayName?: string,
): StoredUser {
  const store = loadStore();

  if (store.byEmail[email]) {
    const existingId = store.byEmail[email];
    return store.users[existingId];
  }

  const id = generateUserId();
  const now = new Date().toISOString();

  const user: StoredUser = {
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

export function getUserByEmail(email: string): StoredUser | null {
  const store = loadStore();
  const id = store.byEmail[email];

  if (!id) {
    return null;
  }

  return store.users[id] || null;
}

export function getUserById(id: string): StoredUser | null {
  const store = loadStore();
  return store.users[id] || null;
}

export function listUsers(): StoredUser[] {
  const store = loadStore();
  return Object.values(store.users);
}

export function updateUser(
  id: string,
  updates: Partial<Omit<StoredUser, "id" | "createdAt">>,
): StoredUser | null {
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
