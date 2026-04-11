import { db } from './db/connection.js';
import { users } from './db/index.js';
import { hashPassword } from './password-utils.js';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';

const ADMIN_EMAIL = 'admin';
const ADMIN_PASSWORD = 'ai-spaces';
const ADMIN_ROLE = 'admin';

export async function seedAdmin(): Promise<void> {
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