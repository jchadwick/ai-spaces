/**
 * Dev-only seed script for local development.
 * Creates test users and runs migrations.
 * Run before starting the server in dev mode.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, sqlite } from "../packages/server/src/db/connection.js";
import { authProviders, servers } from "../packages/server/src/db/index.js";
import { runMigrations } from "../packages/server/src/db/migrate.js";
import { createRegistrationToken } from "../packages/server/src/runtime-servers.js";
import {
  createUser,
  getUserWithServerRoleByEmail,
  hashPassword,
} from "../packages/server/src/user-service.js";

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

  const admin = getUserWithServerRoleByEmail(adminEmail);
  if (!admin) {
    throw new Error("Seeded admin user was not available for dev registration bootstrap");
  }
  seedOpenClawPairing(admin.id, admin.email);
}

function getDevPairingFile(): string | null {
  const value = process.env.AI_SPACES_DEV_PAIRING_FILE?.trim();
  return value ? value : null;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), { encoding: "utf-8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function ensureDevRegistrationTokenColumns(): void {
  const rows = sqlite.prepare("PRAGMA table_info(server_registration_tokens)").all() as Array<{
    name: string;
  }>;
  const columns = new Set(rows.map((row) => row.name));
  if (!columns.has("created_by_user_id")) {
    sqlite.exec("ALTER TABLE server_registration_tokens ADD COLUMN created_by_user_id text");
  }
  if (!columns.has("used_at")) {
    sqlite.exec("ALTER TABLE server_registration_tokens ADD COLUMN used_at text");
  }
}

function seedOpenClawPairing(adminUserId: string, adminEmail: string): void {
  const pairingFile = getDevPairingFile();
  if (!pairingFile) return;

  const pluginUrl = process.env.PLUGIN_SPACES_URL ?? "http://openclaw:3002";
  const aiSpacesUrl = process.env.AI_SPACES_AGENT_BASE_URL ?? "http://dev:3001";
  const gatewayUrl = process.env.GATEWAY_URL ?? "http://openclaw:19000";
  const existingServer = db.select().from(servers).where(eq(servers.pluginUrl, pluginUrl)).get();
  if (existingServer) {
    writeJsonAtomic(pairingFile, {
      version: 1,
      status: "registered",
      aiSpacesUrl,
      pluginUrl,
      gatewayUrl,
      serverId: existingServer.id,
      generatedAt: new Date().toISOString(),
    });
    console.log(
      "[seed-dev] Existing local OpenClaw registration found; pairing token not regenerated",
    );
    return;
  }

  if (fs.existsSync(pairingFile)) {
    try {
      const existingPairing = JSON.parse(fs.readFileSync(pairingFile, "utf-8"));
      if (typeof existingPairing?.registrationToken === "string") {
        console.log("[seed-dev] Reusing existing local OpenClaw pairing input");
        return;
      }
    } catch {
      /* replace malformed dev-only pairing input below */
    }
  }

  const now = new Date().toISOString();
  ensureDevRegistrationTokenColumns();
  const registration = createRegistrationToken(adminUserId, 24 * 60 * 60 * 1000);

  writeJsonAtomic(pairingFile, {
    version: 1,
    status: "pending",
    aiSpacesUrl,
    pluginUrl,
    gatewayUrl,
    registrationToken: registration.token,
    ownerEmail: adminEmail,
    generatedAt: now,
  });
  console.log("[seed-dev] Wrote local OpenClaw pairing input");
}

seedUsers().catch((err) => {
  console.error("[seed-dev] Error:", err);
  process.exit(1);
});
