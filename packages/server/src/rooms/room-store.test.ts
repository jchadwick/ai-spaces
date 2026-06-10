import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;
let originalDbPath: string | undefined;

async function importStoreWithTempDb() {
  vi.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-spaces-room-store-"));
  process.env.AI_SPACES_DB = path.join(tempDir, "ai-spaces.db");

  const { runMigrations } = await import("../db/migrate.js");
  runMigrations();

  const { sqlite } = await import("../db/connection.js");
  const now = new Date().toISOString();
  sqlite
    .prepare(
      "INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run("user-1", "owner@example.test", "Owner", now, now);
  sqlite
    .prepare(
      "INSERT INTO spaces (id, server_id, runtime_space_id, agent_id, agent_type, path, config_path, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "space-1",
      "00000000-0000-0000-0000-000000000001",
      "runtime-space-1",
      "agent-1",
      "openclaw",
      "Workspace",
      null,
      JSON.stringify({ name: "Workspace" }),
      now,
      now,
    );

  return import("./room-store.js");
}

describe("room store", () => {
  beforeEach(() => {
    originalDbPath = process.env.AI_SPACES_DB;
  });

  afterEach(async () => {
    const { sqlite } = await import("../db/connection.js");
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

  it("normalizes room paths without trailing slashes", async () => {
    const { normalizeRoomPath } = await importStoreWithTempDb();
    expect(normalizeRoomPath("/Maine/")).toBe("/Maine");
    expect(normalizeRoomPath("/Maine")).toBe("/Maine");
    expect(normalizeRoomPath("Maine/")).toBe("/Maine");
    expect(normalizeRoomPath("/")).toBe("/");
  });

  it("archives only the selected room when demoting by id", async () => {
    const { archiveRoomById, getRoomById, upsertPromotedRoom } = await importStoreWithTempDb();
    const parent = upsertPromotedRoom("space-1", "/Parent", "directory", "user-1");
    const child = upsertPromotedRoom("space-1", "/Parent/Child", "directory", "user-1");

    archiveRoomById("space-1", parent.id);

    expect(getRoomById("space-1", parent.id)?.status).toBe("archived");
    expect(getRoomById("space-1", child.id)?.status).toBe("active");
  });
});
