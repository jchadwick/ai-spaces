/**
 * Dev-only: bootstrap OpenClaw registration by creating a token via the admin API.
 *
 * This script runs inside the OpenClaw container. It mimics the production flow
 * where an admin creates a registration token through the admin API, then the
 * OpenClaw operator configures the container with that token.
 *
 * Outputs ONLY the raw registration token to stdout (for the entrypoint to capture).
 * All log messages go to stderr.
 * Exits with an error if the server is unreachable or authentication fails.
 */

const AI_SPACES_URL = process.env.AI_SPACES_URL ?? "http://dev:3001";
const ADMIN_EMAIL = process.env.AI_SPACES_DEV_ADMIN_EMAIL ?? "admin@ai-spaces.test";
const ADMIN_PASSWORD = process.env.AI_SPACES_DEV_ADMIN_PASSWORD ?? "ai-spaces";

function log(msg) {
  console.error(`[openclaw-bootstrap] ${msg}`);
}

async function waitForServer(maxRetries = 60) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${AI_SPACES_URL}/health`, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) return;
    } catch {
      /* server not ready yet */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`AI Spaces server at ${AI_SPACES_URL} did not become ready`);
}

async function loginAsAdmin() {
  const res = await fetch(`${AI_SPACES_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Admin login failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.accessToken;
}

async function createRegistrationToken(accessToken) {
  const res = await fetch(`${AI_SPACES_URL}/api/admin/servers/registrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ ttlSeconds: 86_400 }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Create registration token failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.registrationToken;
}

async function bootstrap() {
  log("Waiting for AI Spaces server...");
  await waitForServer();
  log("Server is ready");

  log("Logging in as admin...");
  const accessToken = await loginAsAdmin();

  log("Creating registration token...");
  const token = await createRegistrationToken(accessToken);

  // Output ONLY the token to stdout for the entrypoint to capture
  process.stdout.write(token);
}

bootstrap().catch((err) => {
  console.error(`[openclaw-bootstrap] Error: ${err.message}`);
  process.exit(1);
});
