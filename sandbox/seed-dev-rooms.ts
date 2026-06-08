/**
 * Dev-only: seed default rooms for test spaces after reconcile.
 *
 * This script runs AFTER the server is up and OpenClaw has reconciled spaces.
 * It calls the server API to promote files as rooms so the sandbox has visible
 * rooms immediately. All dev-only logic stays out of production code paths.
 */

const AI_SPACES_URL = process.env.AI_SPACES_AGENT_BASE_URL ?? "http://dev:3001";

async function login() {
  const res = await fetch(`${AI_SPACES_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@ai-spaces.test", password: "ai-spaces" }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = (await res.json()) as { accessToken: string };
  return data.accessToken;
}

async function listSpaces(token: string) {
  const res = await fetch(`${AI_SPACES_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List spaces failed: ${res.status}`);
  const data = (await res.json()) as { spaces: Array<{ id: string; path: string }> };
  return data.spaces;
}

async function promoteRoom(token: string, spaceId: string, topicPath: string, targetType: string) {
  const res = await fetch(`${AI_SPACES_URL}/api/spaces/${spaceId}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ topicPath, targetType }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Promote room failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function seedRooms() {
  console.log("[seed-dev-rooms] Waiting for server and spaces...");
  let spaces: Array<{ id: string; path: string }> = [];
  let token = "";
  for (let i = 0; i < 60; i++) {
    try {
      token = await login();
      spaces = await listSpaces(token);
      if (spaces.length > 0) break;
    } catch {
      /* server not ready yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (spaces.length === 0) throw new Error("No spaces found after waiting");

  console.log(`[seed-dev-rooms] Found ${spaces.length} spaces`);

  const roomMap: Record<string, Array<{ topicPath: string; targetType: string }>> = {
    TestSpace: [{ topicPath: "/CostaRica.md", targetType: "file" }],
    Vacations: [{ topicPath: "/Maine.md", targetType: "file" }],
  };

  for (const space of spaces) {
    const rooms = roomMap[space.path];
    if (!rooms) continue;
    for (const room of rooms) {
      try {
        await promoteRoom(token, space.id, room.topicPath, room.targetType);
        console.log(`[seed-dev-rooms] Promoted ${room.topicPath} in ${space.path}`);
      } catch (err) {
        console.log(`[seed-dev-rooms] Room ${room.topicPath} in ${space.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log("[seed-dev-rooms] Done");
}

seedRooms().catch((err) => {
  console.error("[seed-dev-rooms] Error:", err);
  process.exit(1);
});
