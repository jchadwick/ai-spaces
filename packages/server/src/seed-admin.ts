import { db } from './db/connection.js';
import { users, spaces, spaceMembers } from './db/index.js';
import { hashPassword } from './password-utils.js';
import { eq, sql } from 'drizzle-orm';
import * as crypto from 'crypto';

const ADMIN_EMAIL = 'admin@ai-spaces.test';
const ADMIN_PASSWORD = 'ai-spaces';
const ADMIN_ROLE = 'admin';

const DEV_USER_ID = 'dev-user-00000000-0000-0000-0000-000000000000';
const DEV_USER_EMAIL = 'dev@local';

export async function seedAdmin(): Promise<void> {
  if (process.env.DEV_VIRTUAL_USER === 'true') {
    const now = new Date().toISOString();
    db.insert(users).values({
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      passwordHash: '',
      role: 'admin',
      displayName: 'Dev User',
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing().run();
  }

  const existing = db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1).get();

  if (existing) {
    if (existing.role !== ADMIN_ROLE) {
      db.update(users).set({ role: ADMIN_ROLE, updatedAt: new Date().toISOString() }).where(eq(users.email, ADMIN_EMAIL)).run();
      console.log('Admin user role corrected to admin');
    } else {
      console.log('Admin user already exists');
    }
    return;
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const id = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  db.insert(users).values({
    id,
    email: ADMIN_EMAIL,
    passwordHash,
    role: ADMIN_ROLE,
    displayName: 'Administrator',
    createdAt: now,
    updatedAt: now,
  }).run();

  console.log('Admin user created:');
  console.log(`  Email: ${ADMIN_EMAIL}`);
  console.log(`  Role: ${ADMIN_ROLE}`);
  console.log(`  ID: ${id}`);
}

const TEST_USER_EMAIL = 'test@ai-spaces.test';
const TEST_USER_PASSWORD = 'ai-spaces';

const TEST_USER_MEMBERSHIPS: { name: string; role: string }[] = [
  { name: 'Home', role: 'owner' },
  { name: 'Travel', role: 'editor' },
];

export async function seedTestUser(): Promise<void> {
  let testUser = db.select().from(users).where(eq(users.email, TEST_USER_EMAIL)).limit(1).get();

  if (!testUser) {
    const passwordHash = await hashPassword(TEST_USER_PASSWORD);
    const id = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    db.insert(users).values({
      id,
      email: TEST_USER_EMAIL,
      passwordHash,
      role: 'user',
      displayName: 'Test User',
      createdAt: now,
      updatedAt: now,
    }).run();
    testUser = db.select().from(users).where(eq(users.email, TEST_USER_EMAIL)).limit(1).get()!;
    console.log('Test user created:', TEST_USER_EMAIL);
  }

  for (const { name, role } of TEST_USER_MEMBERSHIPS) {
    const space = db.select().from(spaces)
      .where(sql`json_extract(${spaces.config}, '$.name') = ${name}`)
      .get();

    if (!space) {
      console.log(`  Space "${name}" not found, skipping membership`);
      continue;
    }

    const now = new Date().toISOString();
    db.insert(spaceMembers).values({
      id: crypto.randomUUID(),
      spaceId: space.id,
      userId: testUser.id,
      role,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [spaceMembers.spaceId, spaceMembers.userId],
      set: { role, updatedAt: now },
    }).run();

    console.log(`  Test user configured as ${role} of "${name}"`);
  }
}