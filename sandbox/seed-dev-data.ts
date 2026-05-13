/**
 * Dev-only seed script for local development.
 * Creates test users and runs migrations.
 * Run before starting the server in dev mode.
 */
import * as path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from '../packages/server/src/db/migrate.js';
import { createUser, hashPassword, getUserWithServerRoleByEmail } from '../packages/server/src/user-service.js';
import { db } from '../packages/server/src/db/connection.js';
import { authProviders } from '../packages/server/src/db/index.js';
import { eq, and } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function resetPassword(userId: string, passwordHash: string): Promise<void> {
  db.update(authProviders)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(and(eq(authProviders.userId, userId), eq(authProviders.provider, 'password')))
    .run();
}

async function seedUsers() {
  console.log('[seed-dev] Running migrations...');
  await runMigrations(db, {
    migrationsFolder: path.join(__dirname, '../packages/server/drizzle'),
  });

  const password = 'ai-spaces';
  const passwordHash = await hashPassword(password);

  // Create or reset admin user
  const adminEmail = 'admin@ai-spaces.test';
  const existingAdmin = getUserWithServerRoleByEmail(adminEmail);
  if (!existingAdmin) {
    console.log(`[seed-dev] Creating admin user: ${adminEmail}`);
    createUser(adminEmail, passwordHash, 'admin', 'Admin User');
  } else {
    console.log(`[seed-dev] Resetting password for admin user: ${adminEmail}`);
    await resetPassword(existingAdmin.id, passwordHash);
  }

  // Create or reset regular user
  const userEmail = 'user@ai-spaces.test';
  const existingUser = getUserWithServerRoleByEmail(userEmail);
  if (!existingUser) {
    console.log(`[seed-dev] Creating user: ${userEmail}`);
    createUser(userEmail, passwordHash, 'user', 'Test User');
  } else {
    console.log(`[seed-dev] Resetting password for user: ${userEmail}`);
    await resetPassword(existingUser.id, passwordHash);
  }

  console.log('[seed-dev] Done!');
}

seedUsers().catch((err) => {
  console.error('[seed-dev] Error:', err);
  process.exit(1);
});