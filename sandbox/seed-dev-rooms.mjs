/**
 * Dev-only: seed default rooms for test spaces after reconciliation.
 *
 * Runs inside the OpenClaw container after registration and reconciliation.
 * Calls the server API to promote files as rooms so the sandbox has visible
 * rooms immediately. All dev-only logic stays out of production code paths.
 */

const AI_SPACES_URL = process.env.AI_SPACES_URL ?? "http://dev:3001";
const ADMIN_EMAIL = process.env.AI_SPACES_DEV_ADMIN_EMAIL ?? "admin@ai-spaces.test";
const ADMIN_PASSWORD = process.env.AI_SPACES_DEV_ADMIN_PASSWORD ?? "ai-spaces";

async function login() {
  const res = await fetch(`${AI_SPACES_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  return data.accessToken;
}

async function listSpaces(token) {
  const res = await fetch(`${AI_SPACES_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List spaces failed: ${res.status}`);
  const data = await res.json();
  return data.spaces;
}

async function promoteRoom(token, spaceId, roomPath, targetType) {
  const res = await fetch(`${AI_SPACES_URL}/api/spaces/${spaceId}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ roomPath, targetType }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Promote room failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function seedRooms() {
  console.log("[seed-dev-rooms] Waiting for server and spaces...");
  let spaces = [];
  let token = "";
  for (let i = 0; i < 60; i++) {
    try {
      token = await login();
      spaces = await listSpaces(token);
      if (spaces.length > 0) break;
    } catch {
      /* server not ready yet */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  if (spaces.length === 0) throw new Error("No spaces found after waiting");

  console.log(`[seed-dev-rooms] Found ${spaces.length} spaces`);

  const roomMap = {
    TestSpace: [
      { roomPath: "/Maine/", targetType: "directory" },
      { roomPath: "/CostaRica/", targetType: "directory" },
    ],
    Vacations: [
      { roomPath: "/Maine/", targetType: "directory" },
      { roomPath: "/CostaRica/", targetType: "directory" },
    ],
  };

  for (const space of spaces) {
    const rooms = roomMap[space.path];
    if (!rooms) continue;
    for (const room of rooms) {
      try {
        await promoteRoom(token, space.id, room.roomPath, room.targetType);
        console.log(`[seed-dev-rooms] Promoted ${room.roomPath} in ${space.path}`);
      } catch (err) {
        console.log(
          `[seed-dev-rooms] Room ${room.roomPath} in ${space.path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  console.log("[seed-dev-rooms] Done");
}

seedRooms().catch((err) => {
  console.error("[seed-dev-rooms] Error:", err);
  process.exit(1);
});
