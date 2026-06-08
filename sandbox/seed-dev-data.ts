/**
 * Dev-only seed script for local development.
 * Creates test users and runs migrations.
 * Run before starting the server in dev mode.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../packages/server/src/db/connection.js";
import { authProviders } from "../packages/server/src/db/index.js";
import { runMigrations } from "../packages/server/src/db/migrate.js";
import { createUser, getUserWithServerRoleByEmail, hashPassword } from "../packages/server/src/user-service.js";

async function resetPassword(userId: string, passwordHash: string): Promise<void> {
  db.update(authProviders)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(and(eq(authProviders.userId, userId), eq(authProviders.provider, "password")))
    .run();
}

async function seedUsers() {
  runMigrations();

  const password = "ai-spaces";
  const passwordHash = await hashPassword(password);

  // Create or reset admin user
  const adminEmail = "admin@ai-spaces.test";
  const existingAdmin = getUserWithServerRoleByEmail(adminEmail);
  if (!existingAdmin) {
    createUser(adminEmail, passwordHash, "admin", "Admin User");
  } else {
    await resetPassword(existingAdmin.id, passwordHash);
  }

  // Create or reset regular user
  const userEmail = "user@ai-spaces.test";
  const existingUser = getUserWithServerRoleByEmail(userEmail);
  if (!existingUser) {
    createUser(userEmail, passwordHash, "user", "Test User");
  } else {
    await resetPassword(existingUser.id, passwordHash);
  }

  console.log("[seed-dev] Users seeded");
}

seedUsers().catch((err) => {
  console.error("[seed-dev] Error:", err);
  process.exit(1);
});
