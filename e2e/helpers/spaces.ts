import type { APIRequestContext } from "@playwright/test";
import { mkdir, writeFile } from "fs/promises";

export function uniqueSpacePath(): string {
  return `/tmp/e2e-space-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createOwnedSpace(
  request: APIRequestContext,
  server?: { id: string; callbackToken: string },
): Promise<{ id: string; path: string }> {
  const path = uniqueSpacePath();
  const spaceConfigDir = `${path}/.space`;
  await mkdir(spaceConfigDir, { recursive: true });

  const id = `e2e-space-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const config = {
    id,
    name: "E2E Space",
    description: "Space used by automated tests",
  };
  const now = new Date().toISOString();

  await writeFile(`${spaceConfigDir}/spaces.json`, JSON.stringify(config, null, 2));
  await writeFile(`${path}/README.md`, "# E2E Space\nUsed by automated tests.\n");

  const response = await request.post("/api/internal/reconcile", {
    headers: {
      Authorization: "Bearer secret",
    },
    data: {
      spaces: [
        {
          id,
          agentId: "openclaw",
          agentType: "openclaw",
          path,
          configPath: `${spaceConfigDir}/spaces.json`,
          config,
          createdAt: now,
          updatedAt: now,
        },
      ],
      ...(server ? { serverId: server.id, callbackToken: server.callbackToken } : {}),
    },
  });

  if (!response.ok()) {
    throw new Error(`Space reconcile failed: ${response.status()} ${await response.text()}`);
  }

  return { id, path };
}
