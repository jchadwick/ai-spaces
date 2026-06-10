import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_JWT_SECRET = "test-secret";

let tempDir: string | null = null;
let originalDbPath: string | undefined;
let originalJwtSecret: string | undefined;

async function importWithTempDb() {
  vi.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-spaces-runtime-servers-"));
  process.env.AI_SPACES_DB = path.join(tempDir, "ai-spaces.db");
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const { runMigrations } = await import("../db/migrate.js");
  runMigrations();

  const runtimeServers = await import("../runtime-servers.js");
  const { sqlite } = await import("../db/connection.js");
  return { ...runtimeServers, sqlite };
}

describe("runtime-servers", () => {
  beforeEach(() => {
    originalDbPath = process.env.AI_SPACES_DB;
    originalJwtSecret = process.env.JWT_SECRET;
  });

  afterEach(async () => {
    const { sqlite } = await import("../db/connection.js");
    sqlite.close();

    if (originalDbPath === undefined) {
      delete process.env.AI_SPACES_DB;
    } else {
      process.env.AI_SPACES_DB = originalDbPath;
    }
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }

    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  describe("registerRuntimeServer", () => {
    it("emits a JWT as callbackToken", async () => {
      const { jwt } = await import("jsonwebtoken").then((m) => ({ jwt: m.default }));
      const { createRegistrationToken, registerRuntimeServer } = await importWithTempDb();

      const { token: regToken } = createRegistrationToken("test-user", 60 * 1000);
      const result = registerRuntimeServer({
        registrationToken: regToken,
        runtimeType: "openclaw",
        name: "test-server",
        pluginUrl: "http://localhost:3002",
      });

      const decoded = jwt.verify(result.callbackToken, TEST_JWT_SECRET) as {
        serverId: string;
        type: string;
      };
      expect(decoded.serverId).toBe(result.server.id);
      expect(decoded.type).toBe("callback");
    });

    it("stores the JWT in callback_token column", async () => {
      const { createRegistrationToken, registerRuntimeServer, sqlite } = await importWithTempDb();

      const { token: regToken } = createRegistrationToken("test-user", 60 * 1000);
      const result = registerRuntimeServer({
        registrationToken: regToken,
        runtimeType: "openclaw",
        name: "test-server",
        pluginUrl: "http://localhost:3002",
      });

      const row = sqlite
        .prepare("SELECT callback_token, callback_token_hash FROM servers WHERE id = ?")
        .get(result.server.id) as {
        callback_token: string | null;
        callback_token_hash: string | null;
      };
      expect(row.callback_token).toBe(result.callbackToken);
      expect(row.callback_token_hash).toBeNull();
    });

    it("throws when registration token is invalid", async () => {
      const { registerRuntimeServer } = await importWithTempDb();

      expect(() =>
        registerRuntimeServer({
          registrationToken: "not-a-valid-token",
          runtimeType: "openclaw",
          name: "test-server",
          pluginUrl: "http://localhost:3002",
        }),
      ).toThrow("Registration token is invalid, expired, or already used");
    });

    it("throws when registration token is already consumed", async () => {
      const { createRegistrationToken, registerRuntimeServer } = await importWithTempDb();

      const { token: regToken } = createRegistrationToken("test-user", 60 * 1000);
      // First use
      registerRuntimeServer({
        registrationToken: regToken,
        runtimeType: "openclaw",
        name: "test-server",
        pluginUrl: "http://localhost:3002",
      });
      // Second use should fail
      expect(() =>
        registerRuntimeServer({
          registrationToken: regToken,
          runtimeType: "openclaw",
          name: "test-server-2",
          pluginUrl: "http://localhost:3003",
        }),
      ).toThrow("Registration token is invalid, expired, or already used");
    });

    it("returns created=true for a new server", async () => {
      const { createRegistrationToken, registerRuntimeServer } = await importWithTempDb();

      const { token: regToken } = createRegistrationToken("test-user", 60 * 1000);
      const result = registerRuntimeServer({
        registrationToken: regToken,
        runtimeType: "openclaw",
        name: "test-server",
        pluginUrl: "http://localhost:3002",
      });

      expect(result.created).toBe(true);
    });

    it("returns created=false when re-registering same endpoint", async () => {
      const { createRegistrationToken, registerRuntimeServer } = await importWithTempDb();

      const { token: regToken1 } = createRegistrationToken("test-user", 60 * 1000);
      const first = registerRuntimeServer({
        registrationToken: regToken1,
        runtimeType: "openclaw",
        name: "test-server",
        pluginUrl: "http://localhost:3002",
      });

      const { token: regToken2 } = createRegistrationToken("test-user", 60 * 1000);
      const second = registerRuntimeServer({
        registrationToken: regToken2,
        runtimeType: "openclaw",
        name: "test-server-updated",
        pluginUrl: "http://localhost:3002",
      });

      expect(second.created).toBe(false);
      expect(second.server.id).toBe(first.server.id);
    });
  });

  describe("authenticateRuntimeCallback", () => {
    it("returns null for undefined token", async () => {
      const { authenticateRuntimeCallback } = await importWithTempDb();
      expect(authenticateRuntimeCallback(undefined)).toBeNull();
    });

    it("returns null for non-JWT string", async () => {
      const { authenticateRuntimeCallback } = await importWithTempDb();
      expect(authenticateRuntimeCallback("not-a-jwt")).toBeNull();
    });

    it("returns null for JWT signed with wrong secret", async () => {
      const jwt = (await import("jsonwebtoken")).default;
      const { authenticateRuntimeCallback } = await importWithTempDb();

      const fakeToken = jwt.sign({ serverId: "some-id", type: "callback" }, "wrong-secret");
      expect(authenticateRuntimeCallback(fakeToken)).toBeNull();
    });

    it("returns null for JWT with wrong type", async () => {
      const jwt = (await import("jsonwebtoken")).default;
      const { authenticateRuntimeCallback } = await importWithTempDb();

      const fakeToken = jwt.sign({ serverId: "some-id", type: "wrong" }, TEST_JWT_SECRET);
      expect(authenticateRuntimeCallback(fakeToken)).toBeNull();
    });

    it("returns null when serverId not in DB", async () => {
      const jwt = (await import("jsonwebtoken")).default;
      const { authenticateRuntimeCallback } = await importWithTempDb();

      const fakeToken = jwt.sign(
        { serverId: crypto.randomUUID(), type: "callback" },
        TEST_JWT_SECRET,
      );
      expect(authenticateRuntimeCallback(fakeToken)).toBeNull();
    });

    it("returns server record for valid JWT from registered server", async () => {
      const { createRegistrationToken, registerRuntimeServer, authenticateRuntimeCallback } =
        await importWithTempDb();

      const { token: regToken } = createRegistrationToken("test-user", 60 * 1000);
      const { callbackToken, server } = registerRuntimeServer({
        registrationToken: regToken,
        runtimeType: "openclaw",
        name: "test-server",
        pluginUrl: "http://localhost:3002",
      });

      const result = authenticateRuntimeCallback(callbackToken);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(server.id);
      expect(result!.status).toBe("active");
    });
  });

  describe("createRegistrationToken", () => {
    it("creates a token that can be used exactly once", async () => {
      const { createRegistrationToken, registerRuntimeServer } = await importWithTempDb();

      const { token } = createRegistrationToken("test-user", 60 * 1000);
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");

      // Should work once
      const result = registerRuntimeServer({
        registrationToken: token,
        runtimeType: "openclaw",
        name: "server",
        pluginUrl: "http://localhost:3002",
      });
      expect(result.server).toBeTruthy();
    });

    it("respects TTL — expired tokens are rejected", async () => {
      const { createRegistrationToken, registerRuntimeServer } = await importWithTempDb();

      // Create token with TTL in the past
      const { token } = createRegistrationToken("test-user", -1000);

      expect(() =>
        registerRuntimeServer({
          registrationToken: token,
          runtimeType: "openclaw",
          name: "server",
          pluginUrl: "http://localhost:3002",
        }),
      ).toThrow("Registration token is invalid, expired, or already used");
    });
  });
});
