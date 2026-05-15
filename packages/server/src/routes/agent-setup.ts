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
Follow the steps below to connect your agent runtime to this AI Spaces server.

---

## What is AI Spaces?

AI Spaces lets multiple users securely browse, read, and write files inside your workspace through a shared web UI. Your agent doesn't need to build any HTTP servers — **you connect by installing a plugin for your agent runtime.**

**How it works:**

    Plugin (in your agent) ──registers──▶ AI Spaces Server
    AI Spaces Server ──────file ops────▶ Plugin (handles everything)

The plugin handles registration, file serving, WebSocket sessions, and space discovery automatically.

---

## Supported Agent Runtimes

| Runtime | Plugin | Status |
|---------|--------|--------|
| **OpenClaw** | \`@openclaw/ai-spaces\` | ✅ Supported |
| Other runtimes | — | 🔜 Planned |

---

## OpenClaw — Install the Plugin

### Step 1 — Get the plugin

**Option A: Extract from the AI Spaces Docker image (recommended)**

\`\`\`bash
id=$(docker create ai-spaces)
docker cp $id:/plugin ./ai-spaces-plugin
docker rm $id
\`\`\`

The plugin bundle is at \`./ai-spaces-plugin/index.js\`.

**Option B: Build from source**

\`\`\`bash
git clone https://github.com/jchadwick/ai-spaces.git
cd ai-spaces
npm ci
npm run build -w @openclaw/ai-spaces
# Plugin is at packages/plugin/dist/index.js
\`\`\`

---

### Step 2 — Register the plugin with OpenClaw

Add the following to your OpenClaw config (\`~/.openclaw/openclaw.json\`):

\`\`\`json
{
  "plugins": {
    "entries": {
      "ai-spaces": {
        "enabled": true
      }
    },
    "load": {
      "paths": ["/path/to/ai-spaces-plugin/index.js"]
    },
    "installs": {
      "ai-spaces": {
        "source": "path",
        "sourcePath": "/path/to/ai-spaces-plugin/index.js",
        "installPath": "/path/to/ai-spaces-plugin/index.js",
        "installedAt": "2026-01-01T00:00:00.000Z"
      }
    }
  }
}
\`\`\`

Replace \`/path/to/ai-spaces-plugin/index.js\` with the actual path from Step 1.

---

### Step 3 — Point the plugin at this server

Set these environment variables before starting OpenClaw (or add them to your shell profile):

\`\`\`bash
export AI_SPACES_URL="${serverUrl}"
export GATEWAY_TOKEN="<your shared secret>"
\`\`\`

The \`GATEWAY_TOKEN\` must match the \`GATEWAY_TOKEN\` configured on this AI Spaces server.

---

### Step 4 — Restart OpenClaw

\`\`\`bash
openclaw restart
# or
docker compose restart openclaw
\`\`\`

The plugin will automatically register with this server and begin watching your workspace for spaces.

---

## Creating a Space

A **space** is any directory in your workspace that contains a \`.space/spaces.json\` file.

\`\`\`bash
mkdir -p ~/workspace/MyProject/.space
\`\`\`

\`\`\`json
// ~/workspace/MyProject/.space/spaces.json
{
  "name": "My Project",
  "description": "Optional description shown to collaborators"
}
\`\`\`

The plugin detects this automatically and registers the space with this server. No further steps needed. You can then share access via the AI Spaces web UI at ${serverUrl}.

**Optional — add agent context for the space:**

\`\`\`markdown
<!-- ~/workspace/MyProject/.space/SPACE.md -->
# My Project

Context the agent should know when collaborating in this space.
\`\`\`

---

## Verify the Connection

1. **Check server health:**
\`\`\`
GET ${serverUrl}/health
\`\`\`
Should return \`{ "status": "ok", "plugin": "ok" }\`. If \`plugin\` is \`"unreachable"\`, the server cannot reach your agent — check that \`AI_SPACES_URL\` and \`GATEWAY_TOKEN\` are set correctly.

2. **Check your spaces are visible:**

Log in to the web UI at ${serverUrl} and confirm your spaces appear on the home screen.

---

## Quick reference

| What | Where |
|------|-------|
| Plugin source | \`github.com/jchadwick/ai-spaces\` (packages/plugin) |
| Server health | \`GET ${serverUrl}/health\` |
| This document | \`GET ${serverUrl}/agent-setup\` |
| Create a space | Add \`.space/spaces.json\` to any workspace directory |
| Web UI | ${serverUrl} |
`;
}
