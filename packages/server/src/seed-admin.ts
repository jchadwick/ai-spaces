import { db } from './db/connection.js';
import { users } from './db/index.js';
import { hashPassword } from './password-utils.js';
import { eq } from 'drizzle-orm';
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
    console.log('Admin user already exists');
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