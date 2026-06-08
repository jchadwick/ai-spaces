import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkspaceSpaceRecord } from "@ai-spaces/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;
let originalDbPath: string | undefined;

async function importReconcileWithTempDb() {
  vi.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-spaces-reconcile-"));
  process.env.AI_SPACES_DB = path.join(tempDir, "ai-spaces.db");

  const { runMigrations } = await import("./db/migrate.js");
  runMigrations();

  return {
    ...(await import("./reconcile.js")),
    ...(await import("./space-store.js")),
    ...(await import("./db/connection.js")),
  };
}

describe("reconcileFromSpaceList", () => {
  beforeEach(() => {
    originalDbPath = process.env.AI_SPACES_DB;
  });

  afterEach(async () => {
    const { sqlite } = await import("./db/connection.js");
    sqlite.close();
    if (originalDbPath === undefined) {
      delete process.env.AI_SPACES_DB;
    } else {
      process.env.AI_SPACES_DB = originalDbPath;
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("keeps identical runtime spaces distinct across servers", async () => {
    const { listSpacesByServerId, reconcileFromSpaceList, sqlite } =
      await importReconcileWithTempDb();
    const now = new Date().toISOString();

    sqlite
      .prepare(
        "INSERT INTO servers (id, name, runtime_type, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("server-a", "Server A", "openclaw", "active", "{}", now, now);
    sqlite
      .prepare(
        "INSERT INTO servers (id, name, runtime_type, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("server-b", "Server B", "openclaw", "active", "{}", now, now);

    const runtimeSpace: WorkspaceSpaceRecord = {
      id: "runtime-space",
      agentId: "main",
      agentType: "main",
      path: "shared-path",
      configPath: "/tmp/shared-path/.space/spaces.json",
      config: { name: "Shared Path" },
    };

    await reconcileFromSpaceList([runtimeSpace], "server-a");
    await reconcileFromSpaceList([runtimeSpace], "server-b");

    const serverASpaces = listSpacesByServerId("server-a");
    const serverBSpaces = listSpacesByServerId("server-b");

    expect(serverASpaces).toHaveLength(1);
    expect(serverBSpaces).toHaveLength(1);
    expect(serverASpaces[0]?.runtimeSpaceId).toBe("runtime-space");
    expect(serverBSpaces[0]?.runtimeSpaceId).toBe("runtime-space");
    expect(serverASpaces[0]?.path).toBe("shared-path");
    expect(serverBSpaces[0]?.path).toBe("shared-path");
    expect(serverASpaces[0]?.id).not.toBe(serverBSpaces[0]?.id);
  });
});
