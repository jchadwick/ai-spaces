import { Hono } from 'hono';

export const agentSetupRouter = new Hono();

agentSetupRouter.get('/', (c) => {
  const serverUrl = new URL(c.req.url).origin;
  const doc = buildSetupDoc(serverUrl);
  return c.text(doc, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
});

function buildSetupDoc(serverUrl: string): string {
  return `\
# AI Spaces — Agent Setup Guide

You are an AI agent reading this document at ${serverUrl}/agent-setup.
Follow the steps below to register yourself with this AI Spaces server and expose workspaces to collaborators.

---

## What is AI Spaces?

AI Spaces is a server that lets multiple users securely browse, read, and write files inside an AI agent's workspace through a web UI. As the agent, you act as the "plugin" — you register once with the server, then expose HTTP endpoints the server calls back into for file operations.

**Communication flow:**

    You (Agent) ──POST /register──▶ Server
    Server ────GET /files────────▶ You (Agent HTTP server)
    Server ────WS proxy──────────▶ You (Agent WebSocket server)

---

## Prerequisites

Before starting, you need:

1. **A running HTTP server** on a port you control (e.g. \`http://0.0.0.0:3002\`). The AI Spaces server will call back into this URL for file operations.
2. **The GATEWAY_TOKEN** — a shared secret configured on this server. Pass it as \`Authorization: Bearer <token>\` on all calls to \`/api/internal/*\` endpoints.
3. **Network access** from this server to your HTTP server's \`pluginUrl\`.

---

## Step 1 — Register with the Server

Make a single POST request to register. If the server accepts it, you receive a \`serverId\` and \`callbackToken\` — save both persistently (e.g. to a state file). You will need them for all future calls.

**Request:**
\`\`\`
POST ${serverUrl}/api/internal/register
Authorization: Bearer <GATEWAY_TOKEN>
Content-Type: application/json

{
  "pluginUrl": "http://<your-host>:<your-port>",
  "gatewayUrl": "http://<your-gateway-host>:<gateway-port>",
  "name": "my-agent-plugin"
}
\`\`\`

- \`pluginUrl\` — the base URL the server will use to reach your HTTP server (must be reachable from this server)
- \`gatewayUrl\` — the URL of your agent gateway (used for routing; can be the same as pluginUrl if you have no separate gateway)
- \`name\` — a human-readable label for this agent (any string)

**Response (200 or 201):**
\`\`\`json
{
  "serverId": "<uuid>",
  "callbackToken": "<64-char hex string>",
  "gatewayUrl": "<string>"
}
\`\`\`

Store \`serverId\` and \`callbackToken\` somewhere durable. If the process restarts, load them and skip re-registration. You can re-register at any time if the state is lost — the server is idempotent on \`pluginUrl\`.

---

## Step 2 — Discover Spaces and Reconcile

AI Spaces are directories in your workspace that contain a \`.space/spaces.json\` config file. Scan your workspace for these files, then POST the list to the server. This tells the server which spaces exist and which users have access.

**Scan for spaces:**

Walk your workspace directory looking for files matching the pattern:
\`\`\`
<workspace_root>/<any_path>/.space/spaces.json
\`\`\`

Each \`spaces.json\` file looks like:
\`\`\`json
{
  "name": "My Project",
  "description": "Optional description"
}
\`\`\`

**Build the space record for each file found:**
\`\`\`json
{
  "id": "<deterministic ID>",
  "agentId": "main",
  "agentType": "main",
  "path": "<path relative to workspace root, e.g. my-project>",
  "configPath": "<absolute path to spaces.json>",
  "config": { "name": "My Project", "description": "..." }
}
\`\`\`

To compute the \`id\`: \`sha256("<agentId>:<relative_path>")\` — take the first 16 hex chars, or use any stable deterministic ID scheme.

**POST the list:**
\`\`\`
POST ${serverUrl}/api/internal/reconcile
Authorization: Bearer <GATEWAY_TOKEN>
Content-Type: application/json

{
  "serverId": "<your serverId from Step 1>",
  "callbackToken": "<your callbackToken from Step 1>",
  "spaces": [ ...space records... ]
}
\`\`\`

**Response:**
\`\`\`json
{ "success": true }
\`\`\`

**Repeat this call:**
- Once at startup (after scanning)
- Whenever a \`.space/spaces.json\` file is created or deleted in your workspace
- On a periodic timer (every 60 seconds) to stay in sync

---

## Step 3 — Expose the Plugin HTTP API

The server calls back into your \`pluginUrl\` for all file operations and WebSocket sessions. You must implement the following HTTP endpoints.

All paths below are relative to your \`pluginUrl\`.

### Health check

\`\`\`
GET /health
→ 200  { "status": "ok" }
\`\`\`

### List files in a space

\`\`\`
GET /api/spaces/{spaceId}/files?role={role}&path={dirPath}
→ 200  { "files": [ <FileNode>, ... ] }
\`\`\`

\`role\` is one of \`"owner"\`, \`"editor"\`, \`"viewer"\`. \`path\` is optional (defaults to root).

**FileNode shape:**
\`\`\`json
{
  "name": "README.md",
  "type": "file",
  "path": "README.md",
  "size": 1024,
  "modified": "2025-01-01T00:00:00.000Z"
}
\`\`\`
\`type\` is \`"file"\` or \`"directory"\`. Directories may include a \`"children"\` array.

### Read a file

\`\`\`
GET /api/spaces/{spaceId}/files/{filePath}
→ 200  <file content as text>
      Content-Type: text/plain (or appropriate MIME type)
\`\`\`

### Write a file

\`\`\`
PUT /api/spaces/{spaceId}/files/{filePath}
Content-Type: application/json

{ "content": "<string>", "encoding": "utf-8" }
→ 200  { "success": true, "path": "...", "modified": "..." }
\`\`\`

\`encoding\` can be \`"utf-8"\` or \`"base64"\`. Use atomic write (write to a temp file, then rename) to avoid corrupted files on crash.

### Delete a file

\`\`\`
DELETE /api/spaces/{spaceId}/files/{filePath}
→ 200  { "success": true }
\`\`\`

### Rename a file

\`\`\`
PATCH /api/spaces/{spaceId}/files/{filePath}
Content-Type: application/json

{ "newPath": "<new relative path>" }
→ 200  { "success": true }
\`\`\`

### Create a directory

\`\`\`
POST /api/spaces/{spaceId}/directories
Content-Type: application/json

{ "path": "<relative path>" }
→ 200  { "success": true }
\`\`\`

### Delete a directory

\`\`\`
DELETE /api/spaces/{spaceId}/directories/{dirPath}
→ 200  { "success": true }
\`\`\`

### Rename a directory

\`\`\`
PATCH /api/spaces/{spaceId}/directories/{dirPath}
Content-Type: application/json

{ "newPath": "<new relative path>" }
→ 200  { "success": true }
\`\`\`

### Get file metadata (optional)

\`\`\`
GET /api/spaces/{spaceId}/metadata
→ 200  { "files": { "<path>": { "displayName": "...", "summary": "..." } } }
\`\`\`

### Patch file metadata (optional)

\`\`\`
PATCH /api/spaces/{spaceId}/metadata
Content-Type: application/json

{ "files": { "<path>": { "displayName": "My File", "summary": "Brief summary" } } }
→ 200  { "success": true }
\`\`\`

### WebSocket session

The server proxies browser WebSocket connections to your agent. Implement a WebSocket handler at:

\`\`\`
WS /api/spaces/{spaceId}/ws
\`\`\`

The server forwards the \`Authorization: Bearer <jwt>\` header containing a signed token with:
\`\`\`json
{ "userId": "...", "role": "owner|editor|viewer" }
\`\`\`

Use the \`role\` field to enforce permissions within the session (viewers cannot write, etc.).

---

## Step 4 — Verify the Setup

After completing registration and starting your HTTP server, verify everything is wired up:

1. **Confirm registration was accepted:**
\`\`\`
GET ${serverUrl}/health
→ { "status": "ok", "plugin": "ok" }
\`\`\`
If \`plugin\` is \`"unreachable"\`, the server cannot reach your \`pluginUrl\`. Check networking and firewall.

2. **Confirm your spaces are visible:**
\`\`\`
GET ${serverUrl}/api/spaces
Authorization: Bearer <user JWT>
\`\`\`
You should see the spaces you reconciled in Step 2.

3. **Check your own health endpoint is reachable:**
\`\`\`
GET <your-pluginUrl>/health
→ { "status": "ok" }
\`\`\`

---

## Security notes

- Always pass \`Authorization: Bearer <GATEWAY_TOKEN>\` on calls to \`/api/internal/*\`. The server enforces a timing-safe comparison and IP allowlist (LAN/loopback only by default).
- The \`callbackToken\` received in Step 1 is a secret — treat it like a password. Do not log it.
- File paths from the server will be URL-encoded. Decode them before use. Validate that all resolved paths stay within the space root to prevent path traversal.
- Only serve files from within the space's workspace directory. Reject any path that resolves outside it.

---

## Quick reference

| What | Where |
|------|-------|
| Register | \`POST ${serverUrl}/api/internal/register\` |
| Reconcile | \`POST ${serverUrl}/api/internal/reconcile\` |
| Server health | \`GET ${serverUrl}/health\` |
| This document | \`GET ${serverUrl}/agent-setup\` |
| Auth header | \`Authorization: Bearer <GATEWAY_TOKEN>\` |
`;
}
