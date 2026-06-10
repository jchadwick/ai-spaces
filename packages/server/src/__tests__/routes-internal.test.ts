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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-spaces-routes-internal-"));
  process.env.AI_SPACES_DB = path.join(tempDir, "ai-spaces.db");
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const { runMigrations } = await import("../db/migrate.js");
  runMigrations();

  const runtimeServers = await import("../runtime-servers.js");
  const { internalRouter } = await import("../routes/internal.js");
  const { sqlite } = await import("../db/connection.js");

  return { ...runtimeServers, internalRouter, sqlite };
}

describe("routes/internal", () => {
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

  describe("POST /reconcile", () => {
    it("returns 401 with no auth", async () => {
      const { internalRouter } = await importWithTempDb();

      const res = await internalRouter.request("/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaces: [] }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 200 with valid JWT in Authorization header", async () => {
      const { createRegistrationToken, registerRuntimeServer, internalRouter } =
        await importWithTempDb();

      const { token: regToken } = createRegistrationToken("user", 60_000);
      const { callbackToken } = registerRuntimeServer({
        registrationToken: regToken,
        runtimeType: "openclaw",
        name: "test",
        pluginUrl: "http://localhost:3002",
      });

      const res = await internalRouter.request("/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${callbackToken}`,
        },
        body: JSON.stringify({ spaces: [] }),
      });
      expect(res.status).toBe(200);
    });

    it("returns 401 when body has serverId+callbackToken but no header (old format no longer accepted)", async () => {
      const jwt = (await import("jsonwebtoken")).default;
      const { internalRouter } = await importWithTempDb();

      const fakeServerId = "00000000-0000-0000-0000-000000000099";
      const fakeToken = jwt.sign({ serverId: fakeServerId, type: "callback" }, TEST_JWT_SECRET);

      const res = await internalRouter.request("/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaces: [], serverId: fakeServerId, callbackToken: fakeToken }),
      });
      // Body-only auth is not accepted — should return 401
      expect(res.status).toBe(401);
    });

    it("returns 401 with an expired or wrong-secret JWT", async () => {
      const jwt = (await import("jsonwebtoken")).default;
      const { internalRouter } = await importWithTempDb();

      const badToken = jwt.sign({ serverId: "some-id", type: "callback" }, "wrong-secret");

      const res = await internalRouter.request("/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${badToken}`,
        },
        body: JSON.stringify({ spaces: [] }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /register", () => {
    it("returns 400 with missing registration token", async () => {
      const { internalRouter } = await importWithTempDb();

      const res = await internalRouter.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runtimeType: "openclaw",
          name: "test",
          pluginUrl: "http://localhost:3002",
          // No registrationToken
        }),
      });
      // zValidator rejects missing required field
      expect(res.status).toBe(400);
    });

    it("returns 201 for a new server registration", async () => {
      const { createRegistrationToken, internalRouter } = await importWithTempDb();

      const { token: regToken } = createRegistrationToken("user", 60_000);

      const res = await internalRouter.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationToken: regToken,
          runtimeType: "openclaw",
          name: "test-server",
          pluginUrl: "http://localhost:3002",
        }),
      });
      expect(res.status).toBe(201);

      const body = (await res.json()) as {
        serverId: string;
        callbackToken: string;
        status: string;
      };
      expect(body.serverId).toBeTruthy();
      expect(body.callbackToken).toBeTruthy();
      expect(body.status).toBe("active");
    });

    it("returns 200 (not 201) when re-registering the same endpoint", async () => {
      const { createRegistrationToken, internalRouter } = await importWithTempDb();

      const { token: regToken1 } = createRegistrationToken("user", 60_000);
      await internalRouter.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationToken: regToken1,
          runtimeType: "openclaw",
          name: "server",
          pluginUrl: "http://localhost:3002",
        }),
      });

      const { token: regToken2 } = createRegistrationToken("user", 60_000);
      const res2 = await internalRouter.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationToken: regToken2,
          runtimeType: "openclaw",
          name: "server-updated",
          pluginUrl: "http://localhost:3002",
        }),
      });
      expect(res2.status).toBe(200);
    });

    it("returns 400 for invalid registration token", async () => {
      const { internalRouter } = await importWithTempDb();

      const res = await internalRouter.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationToken: "totally-invalid-token",
          runtimeType: "openclaw",
          name: "server",
          pluginUrl: "http://localhost:3002",
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /invites", () => {
    it("returns 401 with no auth", async () => {
      const { internalRouter } = await importWithTempDb();

      const res = await internalRouter.request("/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: "test", role: "editor" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 404 when space does not exist (but auth is valid)", async () => {
      const { createRegistrationToken, registerRuntimeServer, internalRouter } =
        await importWithTempDb();

      const { token: regToken } = createRegistrationToken("user", 60_000);
      const { callbackToken } = registerRuntimeServer({
        registrationToken: regToken,
        runtimeType: "openclaw",
        name: "server",
        pluginUrl: "http://localhost:3002",
      });

      const res = await internalRouter.request("/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${callbackToken}`,
        },
        body: JSON.stringify({ spaceId: "nonexistent-space", role: "editor" }),
      });
      expect(res.status).toBe(404);
    });
  });
});
