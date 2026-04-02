# AI Spaces MVP Implementation Plan

A step-by-step, verifiable plan for building AI Spaces as a proper OpenClaw plugin.

---

## Overview

**AI Spaces** shares subdirectories of your agent's workspace with collaborators via share links. Collaborators can browse files, edit documents, and chat with a **scoped agent context** that only knows about that space.

**Key Architecture Decision:** We implement AI Spaces as a **proper OpenClaw plugin** (not a sidecar). This means:
- Registering as a **Channel** for WebSocket routing
- Using **OpenClaw Transport** for first-class message handling
- Registering **CLI commands** via `api.registerCli()`
- Using **Tool Hooks** (`before_tool_call`) for path enforcement
- Storing session context properly via Gateway's session management

---

## Phase 1: Plugin Foundation

### Step 0: Project Initialization

**Goal:** Set up the TypeScript project with proper OpenClaw plugin structure.

**Actions:**
```bash
cd /workspaces/ai-spaces
npm init -y
npm install -D typescript @types/node tsx vitest
npm install openclaw
npx tsc --init
```

**Files to Create:**

```json
// package.json
{
  "name": "@openclaw/ai-spaces",
  "version": "0.1.0",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"],
    "setupEntry": "./setup-entry.ts"
  }
}
```

```json
// openclaw.plugin.json
{
  "id": "ai-spaces",
  "name": "AI Spaces",
  "description": "Share portions of your agent workspace with collaborators",
  "kind": "channel",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "enabled": { "type": "boolean", "default": true },
      "basePath": { "type": "string", "default": "/spaces" }
    }
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src/**/*", "index.ts", "setup-entry.ts"]
}
```

**Verification:**
```bash
npm run build
# Expected: TypeScript compiles without errors

ls -la package.json tsconfig.json openclaw.plugin.json
# Expected: All three files exist
```

---

### Step 1: Plugin Entry Point (OpenClaw-Native)

**Goal:** Create a minimal plugin that registers correctly with OpenClaw Gateway.

**Key Insight:** We must use `defineChannelPluginEntry` (not just `definePluginEntry`) because AI Spaces creates a new "channel" type for space sessions. This ensures the Gateway recognizes our sessions.

**Files:**

```typescript
// index.ts
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { createSpacesChannelPlugin } from "./src/channel.js";

export default defineChannelPluginEntry({
  id: "ai-spaces",
  name: "AI Spaces",
  description: "Share portions of your agent workspace with collaborators",
  plugin: createSpacesChannelPlugin(),
  registerFull(api) {
    // Register CLI commands for space management
    api.registerCli(
      ({ program }) => {
        const spaces = program.command("spaces").description("Manage AI Spaces");
        
        spaces
          .command("list")
          .description("List discovered spaces")
          .action(async () => {
            // Implementation in src/cli/list.ts
          });
        
        spaces
          .command("show <spaceId>")
          .description("Show space details")
          .action(async (spaceId: string) => {
            // Implementation in src/cli/show.ts
          });
        
        spaces
          .command("share create <spaceId>")
          .description("Create a share link")
          .option("--role <role>", "Role: editor or viewer", "editor")
          .option("--expires <duration>", "Expiration (e.g., 7d)", "7d")
          .action(async (spaceId: string, options) => {
            // Implementation in src/cli/share-create.ts
          });
        
        spaces
          .command("share list <spaceId>")
          .description("List share links for a space")
          .action(async (spaceId: string) => {
            // Implementation in src/cli/share-list.ts
          });
        
        spaces
          .command("share revoke <spaceId> <shareId>")
          .description("Revoke a share link")
          .action(async (spaceId: string, shareId: string) => {
            // Implementation in src/cli/share-revoke.ts
          });
      },
      { commands: ["spaces"] }
    );
  },
});
```

```typescript
// setup-entry.ts
import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { createSpacesChannelPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(createSpacesChannelPlugin());
```

```typescript
// src/channel.ts
import {
  createChannelPluginBase,
  createChatChannelPlugin,
} from "openclaw/plugin-sdk/core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

export function createSpacesChannelPlugin() {
  const base = createChannelPluginBase({
    id: "ai-spaces",
    
    setup: {
      resolveAccount(cfg: OpenClawConfig, accountId?: string | null) {
        const section = (cfg.channels as Record<string, unknown>)?.["ai-spaces"];
        return {
          accountId: accountId ?? null,
          enabled: section?.enabled ?? true,
          configured: true,
        };
      },
      
      inspectAccount(cfg: OpenClawConfig, accountId?: string | null) {
        const section = (cfg.channels as Record<string, unknown>)?.["ai-spaces"];
        return {
          enabled: section?.enabled ?? true,
          configured: true,
        };
      },
    },
  });

  return createChatChannelPlugin({
    base,
    
    // DM security: spaces use share tokens, not phone numbers
    security: {
      dm: {
        channelKey: "ai-spaces",
        resolvePolicy: () => "allowlist",
        resolveAllowFrom: () => [], // Share tokens handled separately
      },
    },
    
    // Threading: each space session is isolated
    threading: {
      topLevelReplyToMode: "reply",
    },
    
    // Outbound: we don't send outbound messages directly
    // The agent uses the standard message tool
    outbound: {
      attachedResults: {
        sendText: async () => {
          // Spaces don't have outbound messaging
          // They use the share link web UI instead
          return { messageId: undefined };
        },
      },
    },
  });
}
```

**Verification:**
```bash
# Build the plugin
npm run build

# Link for local development
openclaw plugins install -l /workspaces/ai-spaces

# Verify CLI command registered
openclaw help | grep -i spaces
# Expected: Shows "spaces" as available subcommand

# Check plugin loads
openclaw plugins inspect ai-spaces
# Expected: Shows plugin details, kind="channel", no errors

# Start gateway and verify channel registered
openclaw gateway --once 2>&1 | grep -i "ai-spaces"
# Expected: "Registered channel: ai-spaces" or similar
```

---

### Step 2: Space Discovery System

**Goal:** Scan workspace for `.space/spaces.json` files and maintain a registry.

**Files:**

```typescript
// src/spaces/types.ts
export interface SpaceCollaborator {
  email?: string;
  name?: string;
  role: "editor" | "viewer";
}

export interface SpaceAgentConfig {
  capabilities?: string[];
  denied?: string[];
}

export interface SpaceConfig {
  name: string;
  description?: string;
  collaborators?: SpaceCollaborator[];
  agent?: SpaceAgentConfig;
}

export interface Space {
  id: string;
  path: string;
  config: SpaceConfig;
  configPath: string;
}

export interface SpaceRegistry {
  spaces: Map<string, Space>;
  lastScanned: Date | null;
}
```

```typescript
// src/spaces/discovery.ts
import { readFile, readdir, stat } from "fs/promises";
import { join, resolve } from "path";
import type { Space, SpaceConfig, SpaceRegistry } from "./types.js";

const SPACE_CONFIG_FILE = "spaces.json";
const SPACE_DIR = ".space";

export async function discoverSpaces(
  workspacePath: string
): Promise<Space[]> {
  const spaces: Space[] = [];
  
  async function scan(dir: string, prefix: string = ""): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      
      const fullPath = join(dir, entry.name);
      const spaceConfigPath = join(fullPath, SPACE_DIR, SPACE_CONFIG_FILE);
      
      try {
        const configContent = await readFile(spaceConfigPath, "utf-8");
        const config: SpaceConfig = JSON.parse(configContent);
        const spaceId = prefix ? `${prefix}/${entry.name}` : entry.name;
        
        spaces.push({
          id: spaceId,
          path: resolve(fullPath),
          config,
          configPath: resolve(spaceConfigPath),
        });
      } catch {
        // Not a space directory, recurse
        await scan(fullPath, prefix ? `${prefix}/${entry.name}` : entry.name);
      }
    }
  }
  
  await scan(workspacePath);
  return spaces;
}

export class SpaceManager {
  private registry: SpaceRegistry = {
    spaces: new Map(),
    lastScanned: null,
  };
  
  constructor(private workspacePath: string) {}
  
  async refresh(): Promise<void> {
    const spaces = await discoverSpaces(this.workspacePath);
    this.registry.spaces.clear();
    for (const space of spaces) {
      this.registry.spaces.set(space.id, space);
    }
    this.registry.lastScanned = new Date();
  }
  
  get(spaceId: string): Space | undefined {
    return this.registry.spaces.get(spaceId);
  }
  
  list(): Space[] {
    return Array.from(this.registry.spaces.values());
  }
}
```

```typescript
// src/cli/list.ts
import { SpaceManager } from "../spaces/discovery.js";
import { resolve } from "path";
import { homedir } from "os";

export async function listSpaces(): Promise<void> {
  const workspacePath = process.env.OPENCLAW_WORKSPACE 
    ?? resolve(homedir(), ".openclaw/workspace");
  
  const manager = new SpaceManager(workspacePath);
  await manager.refresh();
  const spaces = manager.list();
  
  if (spaces.length === 0) {
    console.log("No spaces discovered.");
    console.log("Create a space by adding .space/spaces.json to a directory.");
    return;
  }
  
  console.log("DISCOVERED SPACES\n");
  console.log("ID".padEnd(30), "NAME".padEnd(25), "PATH");
  console.log("-".repeat(80));
  
  for (const space of spaces) {
    const id = space.id.length > 28 ? space.id.slice(0, 25) + "..." : space.id;
    const name = space.config.name.length > 23 
      ? space.config.name.slice(0, 20) + "..." 
      : space.config.name;
    console.log(id.padEnd(30), name.padEnd(25), space.path);
  }
}
```

**Verification:**
```bash
# Create test space
mkdir -p ~/.openclaw/workspace/Vacations/.space
echo '{"name":"Family Vacations","description":"Shared vacation planning"}' \
  > ~/.openclaw/workspace/Vacations/.space/spaces.json

# Test discovery
openclaw spaces list
# Expected output:
# DISCOVERED SPACES
# ID                             NAME                      PATH
# --------------------------------------------------------------------------------
# Vacations                      Family Vacations          /home/user/.openclaw/workspace/Vacations

# Show space details
openclaw spaces show Vacations
# Expected: JSON output with path, config, collaborators
```

---

### Step 3: Share Link Management

**Goal:** Create, validate, and revoke share links with proper storage.

**Files:**

```typescript
// src/shares/types.ts
export interface Share {
  id: string;
  token: string;
  spaceId: string;
  spacePath: string;
  role: "editor" | "viewer";
  created: Date;
  expires?: Date;
  label?: string;
}

export interface ShareStore {
  shares: Map<string, Share>;
  byToken: Map<string, Share>;
}
```

```typescript
// src/shares/manager.ts
import { randomBytes } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import type { Share, ShareStore } from "./types.js";

const SHARES_FILE = "shares.json";
const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export class ShareManager {
  private store: ShareStore = {
    shares: new Map(),
    byToken: new Map(),
  };
  private dataDir: string;
  private spaceManager: SpaceManager;
  
  constructor(dataDir: string, spaceManager: SpaceManager) {
    this.dataDir = dataDir;
    this.spaceManager = spaceManager;
  }
  
  private getStorePath(): string {
    return resolve(this.dataDir, "ai-spaces", SHARES_FILE);
  }
  
  async load(): Promise<void> {
    const storePath = this.getStorePath();
    try {
      const content = await readFile(storePath, "utf-8");
      const data = JSON.parse(content);
      this.store.shares = new Map(Object.entries(data.shares || {}));
      this.store.byToken = new Map(Object.entries(data.byToken || {}));
    } catch {
      // No existing store
    }
  }
  
  async save(): Promise<void> {
    const storePath = this.getStorePath();
    await mkdir(dirname(storePath), { recursive: true });
    
    const data = {
      shares: Object.fromEntries(this.store.shares),
      byToken: Object.fromEntries(this.store.byToken),
    };
    
    await writeFile(storePath, JSON.stringify(data, null, 2));
  }
  
  async createShare(params: {
    spaceId: string;
    role: "editor" | "viewer";
    expiresIn?: number; // seconds
    label?: string;
  }): Promise<Share> {
    const space = this.spaceManager.get(params.spaceId);
    if (!space) {
      throw new Error(`Space not found: ${params.spaceId}`);
    }
    
    const id = randomBytes(8).toString("hex");
    const token = generateToken();
    const now = new Date();
    
    const share: Share = {
      id,
      token,
      spaceId: params.spaceId,
      spacePath: space.path,
      role: params.role,
      created: now,
      expires: params.expiresIn 
        ? new Date(now.getTime() + params.expiresIn * 1000) 
        : undefined,
      label: params.label,
    };
    
    this.store.shares.set(id, share);
    this.store.byToken.set(token, share);
    
    await this.save();
    return share;
  }
  
  validateToken(token: string): Share | null {
    const share = this.store.byToken.get(token);
    if (!share) return null;
    
    if (share.expires && share.expires < new Date()) {
      return null; // Expired
    }
    
    return share;
  }
  
  async revokeShare(spaceId: string, shareId: string): Promise<void> {
    const share = this.store.shares.get(shareId);
    if (!share) {
      throw new Error(`Share not found: ${shareId}`);
    }
    
    if (share.spaceId !== spaceId) {
      throw new Error(`Share does not belong to space: ${spaceId}`);
    }
    
    this.store.shares.delete(shareId);
    this.store.byToken.delete(share.token);
    
    await this.save();
  }
  
  listShares(spaceId: string): Share[] {
    return Array.from(this.store.shares.values())
      .filter(s => s.spaceId === spaceId);
  }
}
```

```typescript
// src/cli/share-create.ts
import { ShareManager } from "../shares/manager.js";
import { SpaceManager } from "../spaces/discovery.js";
import { resolve } from "path";
import { homedir } from "os";

interface CreateShareOptions {
  role: "editor" | "viewer";
  expires: string; // e.g., "7d", "1h", "30m"
}

function parseDuration(str: string): number | undefined {
  const match = str.match(/^(\d+)(d|h|m|s)$/);
  if (!match) return undefined;
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case "d": return value * 24 * 60 * 60;
    case "h": return value * 60 * 60;
    case "m": return value * 60;
    case "s": return value;
  }
}

export async function createShare(
  spaceId: string, 
  options: CreateShareOptions
): Promise<void> {
  const workspacePath = process.env.OPENCLAW_WORKSPACE 
    ?? resolve(homedir(), ".openclaw/workspace");
  const dataDir = process.env.OPENCLAW_DATA_DIR 
    ?? resolve(homedir(), ".openclaw/data");
  const basePath = process.env.OPENCLAW_SPACES_BASE_PATH ?? "/spaces";
  
  const spaceManager = new SpaceManager(workspacePath);
  await spaceManager.refresh();
  
  const shareManager = new ShareManager(dataDir, spaceManager);
  await shareManager.load();
  
  const expiresInSeconds = options.expires ? parseDuration(options.expires) : undefined;
  
  const share = await shareManager.createShare({
    spaceId,
    role: options.role,
    expiresIn: expiresInSeconds,
  });
  
  const baseUrl = process.env.OPENCLAW_SPACES_URL ?? `http://localhost:18789${basePath}`;
  const url = `${baseUrl}/${encodeURIComponent(spaceId)}?share=${share.token}`;
  
  console.log("Share created:");
  console.log(`  ID: ${share.id}`);
  console.log(`  Role: ${share.role}`);
  console.log(`  Expires: ${share.expires?.toISOString() ?? "never"}`);
  console.log(`  URL: ${url}`);
}
```

**Verification:**
```bash
# Create test space first
mkdir -p ~/.openclaw/workspace/TestSpace/.space
echo '{"name":"Test Space"}' > ~/.openclaw/workspace/TestSpace/.space/spaces.json

# Create share link
openclaw spaces share create TestSpace --role editor --expires 7d
# Expected output:
# Share created:
#   ID: abc123...
#   Role: editor
#   Expires: 2026-04-05T...
#   URL: http://localhost:18789/spaces/TestSpace?share=...

# List shares
openclaw spaces share list TestSpace
# Expected: Table showing active shares

# Revoke share
openclaw spaces share revoke TestSpace <share-id-from-above>
# Expected: "Share revoked"

# Verify shares file
cat ~/.openclaw/data/ai-spaces/shares.json | jq .
# Expected: JSON with shares object
```

---

### Step 4: HTTP Routes for Space UI

**Goal:** Register HTTP routes that serve the Space UI and validate share tokens.

**Key Insight:** Use `api.registerHttpRoute()` with `auth: "plugin"` since we manage auth via share tokens, not gateway tokens.

**Files:**

```typescript
// Add to src/channel.ts in the registerFull function:

// HTTP route for space UI (HTML page)
api.registerHttpRoute({
  method: "GET",
  path: "/spaces/:spaceId",
  auth: "plugin",
  match: "exact",
  handler: async (req, res) => {
    const spaceId = decodeURIComponent(req.params.spaceId);
    const shareToken = req.query.share as string | undefined;
    
    if (!shareToken) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing share token" }));
      return true;
    }
    
    const share = shareManager.validateToken(shareToken);
    if (!share) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid or expired share link" }));
      return true;
    }
    
    if (share.spaceId !== spaceId) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Share token does not match space" }));
      return true;
    }
    
    const space = spaceManager.get(spaceId);
    if (!space) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Space not found" }));
      return true;
    }
    
    // Serve the Space UI HTML
    const html = await renderSpaceUI(space, share);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(html);
    return true;
  },
});

// HTTP route for token validation (API endpoint)
api.registerHttpRoute({
  method: "GET",
  path: "/spaces/:spaceId/info",
  auth: "plugin",
  match: "exact",
  handler: async (req, res) => {
    const spaceId = decodeURIComponent(req.params.spaceId);
    const shareToken = req.query.share as string | undefined;
    
    if (!shareToken) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing share token" }));
      return true;
    }
    
    const share = shareManager.validateToken(shareToken);
    if (!share) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid or expired share link" }));
      return true;
    }
    
    const space = spaceManager.get(share.spaceId);
    if (!space) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Space not found" }));
      return true;
    }
    
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      space: {
        id: space.id,
        name: space.config.name,
        path: space.path,
      },
      role: share.role,
      expires: share.expires?.toISOString(),
    }));
    return true;
  },
});
```

**Verification:**
```bash
# Start gateway
openclaw gateway &
GATEWAY_PID=$!
sleep 5

# Create share
SHARE_OUTPUT=$(openclaw spaces share create TestSpace --role editor --format json 2>/dev/null)
TOKEN=$(echo "$SHARE_OUTPUT" | jq -r '.token')

# Test valid token
curl -s "http://localhost:18789/spaces/TestSpace/info?share=$TOKEN" | jq .
# Expected:
# {
#   "space": { "id": "TestSpace", "name": "Test Space", "path": "..." },
#   "role": "editor",
#   "expires": "..."
# }

# Test invalid token
curl -s "http://localhost:18789/spaces/TestSpace/info?share=invalid123"
# Expected: {"error":"Invalid or expired share link"}

# Test wrong space
curl -s "http://localhost:18789/spaces/OtherSpace/info?share=$TOKEN"
# Expected: {"error":"Share token does not match space"}

kill $GATEWAY_PID
```

---

### Step 5: WebSocket Channel for Scoped Sessions

**Goal:** Implement proper OpenClaw channel that creates scoped sessions for space collaborators.

**Key Insight:** We must implement the channel's `handleInbound` to create session keys properly. The session key format for spaces is:

```
space:<spaceId>:<agentId>:<shareTokenHash>
```

**Files:**

```typescript
// src/session/scoped-context.ts
import type { Space, Share } from "../types.js";

export interface ScopedSessionContext {
  type: "space";
  spaceId: string;
  spacePath: string;
  agentId: string;
  shareToken: string;
  role: "editor" | "viewer";
  sessionKey: string;
  deniedTools: string[];
  allowedTools: string[];
  
  // Memory isolation
  skipFiles: string[];
  contextFiles: string[];
}

export function createScopedContext(
  space: Space,
  share: Share,
  agentId: string = "main"
): ScopedSessionContext {
  const defaultDenied = ["exec", "messaging", "spawn_agents", "browser", "credentials"];
  const defaultAllowed = ["read", "write", "edit", "glob", "web_search"];
  
  // Use tools from space config if specified
  const denied = space.config.agent?.denied ?? defaultDenied;
  const allowed = space.config.agent?.capabilities ?? defaultAllowed;
  
  // If viewer role, remove write capabilities
  const finalAllowed = share.role === "viewer" 
    ? allowed.filter(t => !["write", "edit"].includes(t))
    : allowed;
  
  return {
    type: "space",
    spaceId: space.id,
    spacePath: space.path,
    agentId,
    shareToken: share.token,
    role: share.role,
    sessionKey: `space:${space.id}:${agentId}:${hashToken(share.token)}`,
    deniedTools: denied,
    allowedTools: finalAllowed,
    
    // Skip agent's private files
    skipFiles: [
      "AGENTS.md",
      "MEMORY.md",
      "USER.md",
      "memory/",
    ],
    
    // Load space-specific context
    contextFiles: [".space/SPACE.md"],
  };
}

function hashToken(token: string): string {
  // Create a short hash for the session key
  // (Don't use the full token in session keys for security)
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
}
```

```typescript
// Add WebSocket session tracking to src/channel.ts

// Session context storage
const scopedSessions = new Map<string, ScopedSessionContext>();

// WebSocket upgrade handler for space sessions
api.registerHttpRoute({
  method: "GET",
  path: "/spaces/:spaceId/ws",
  auth: "plugin",
  match: "exact",
  handler: async (req, res) => {
    const spaceId = decodeURIComponent(req.params.spaceId);
    const shareToken = req.query.share as string | undefined;
    
    if (!shareToken) {
      res.statusCode = 400;
      res.end("Missing share token");
      return true;
    }
    
    const share = shareManager.validateToken(shareToken);
    if (!share) {
      res.statusCode = 401;
      res.end("Invalid or expired share link");
      return true;
    }
    
    const space = spaceManager.get(share.spaceId);
    if (!space) {
      res.statusCode = 404;
      res.end("Space not found");
      return true;
    }
    
    // Create scoped context
    const context = createScopedContext(space, share);
    
    // Store context for this session
    scopedSessions.set(context.sessionKey, context);
    
    // Upgrade to WebSocket
    // The actual WebSocket handling is done by the Gateway's ws server
    // We inject the context into the session metadata
    req.headers["x-space-session"] = context.sessionKey;
    req.headers["x-space-path"] = context.spacePath;
    
    // Let Gateway handle the WebSocket upgrade
    return false; // Continue to Gateway's WebSocket handler
  },
});
```

**Verification:**
```bash
# Install wscat for WebSocket testing
npm install -g wscat

# Start gateway
openclaw gateway &
sleep 5

# Create share
TOKEN=$(openclaw spaces share create TestSpace --role editor --format json 2>/dev/null | jq -r '.token')

# Connect to space WebSocket
wscat -c "ws://localhost:18789/spaces/TestSpace/ws?share=$TOKEN"
# Expected: Connection established
# The Gateway should log the session key with "space:TestSpace:main:..." prefix

# Verify session is tracked
# (Check Gateway logs for session creation)
openclaw logs --lines 50 | grep -i "space.*session"
# Expected: Log lines showing space session creation

# Test with invalid token
wscat -c "ws://localhost:18789/spaces/TestSpace/ws?share=invalid123"
# Expected: Connection rejected (401)
```

---

### Step 6: Tool Hook for Path Enforcement

**Goal:** Intercept tool calls and enforce space path restrictions.

**Key Insight:** Use `api.registerHook(["before_tool_call"], ...)` to intercept tool execution. Return `{ block: true, blockReason: "..." }` to deny access.

**Files:**

```typescript
// src/hooks/path-hook.ts
import { resolve, basename, dirname } from "path";
import type { Space } from "../types.js";

const FILE_TOOLS = ["read", "write", "edit", "glob"];
const PATH_PARAMS: Record<string, string> = {
  read: "path",
  write: "path",
  edit: "filePath",
  glob: "path",
  bash: "workdir",
};

// Deny list for tools that should never run in space context
const DENIED_TOOLS = [
  "exec",
  "messaging",
  "spawn_agents",
  "browser",
  "credentials",
];

export function createToolHook(spaceManager: SpaceManager) {
  return async (event: any) => {
    // Only process if this is a space session
    const sessionKey = event.sessionKey;
    if (!sessionKey || !sessionKey.startsWith("space:")) {
      return {}; // Not a space session, allow
    }
    
    // Extract session context from event
    const context = event.context?.spaceContext;
    if (!context) {
      return { block: true, blockReason: "No space context found" };
    }
    
    const toolName = event.tool;
    const params = event.params || {};
    
    // Check denied tools
    if (context.deniedTools.includes(toolName) || DENIED_TOOLS.includes(toolName)) {
      return {
        block: true,
        blockReason: `Tool '${toolName}' is not allowed in space context`,
      };
    }
    
    // Check allowed tools (if specified)
    if (context.allowedTools.length > 0 && !context.allowedTools.includes(toolName)) {
      if (!DENIED_TOOLS.includes(toolName)) {
        // Only block if not in deny list (deny list already handled)
        return {
          block: true,
          blockReason: `Tool '${toolName}' is not in allowed tools for this space`,
        };
      }
    }
    
    // Path validation for file tools
    const pathParam = PATH_PARAMS[toolName];
    if (pathParam && params[pathParam]) {
      const requestedPath = resolve(params[pathParam]);
      const spaceRoot = resolve(context.spacePath);
      
      if (!requestedPath.startsWith(spaceRoot)) {
        return {
          block: true,
          blockReason: `Path escapes space: ${params[pathParam]} is outside ${context.spaceId}`,
        };
      }
    }
    
    // Special handling for bash - check workdir and commands
    if (toolName === "bash") {
      // Bash should always be blocked in space context for now
      // (We could be smarter about this, checking if commands stay in space)
      return {
        block: true,
        blockReason: "Shell commands are not allowed in space context",
      };
    }
    
    return {}; // Allow
  };
}
```

```typescript
// Add to src/channel.ts registerFull:

api.registerHook(["before_tool_call"], createToolHook(spaceManager));
```

**Verification:**
```bash
# Unit test the hook logic
npm test -- --grep "tool-hook"

# Expected tests:
# - Non-space session: all tools allowed
# - Space session + allowed tool: allowed
# - Space session + denied tool: blocked
# - Space session + path inside space: allowed
# - Space session + path outside space (../): blocked

# Integration test via WebSocket:
# (Requires running gateway with test space)

# Test 1: Read allowed tool
wscat -c "ws://localhost:18789/spaces/TestSpace/ws?share=$TOKEN"
# Send message asking to read file in space
# Expected: Success

# Test 2: Try to read outside space
# Send message: "Read file ../Private.md"
# Expected: "Path escapes space" error

# Test 3: Try denied tool
# Send message invoking exec tool
# Expected: "Tool 'exec' is not allowed" error
```

---

### Step 7: Context Injection for Scoped Sessions

**Goal:** Skip agent's private files and load space-specific context for scoped sessions.

**Key Insight:** Hook into `before_prompt_build` to modify the context that gets loaded for inference. This is cleaner than modifying files directly.

**Files:**

```typescript
// src/hooks/context-hook.ts
import { readFile, stat } from "fs/promises";
import { resolve, join } from "path";

export function createContextHook() {
  return async (event: any) => {
    // Only process for space sessions
    const sessionKey = event.sessionKey;
    if (!sessionKey || !sessionKey.startsWith("space:")) {
      return {}; // Not a space session
    }
    
    const context = event.context;
    if (!context?.spaceContext) {
      return {};
    }
    
    const spaceContext = context.spaceContext;
    const workspaceRoot = context.workspaceRoot;
    
    // Return modifications to context
    return {
      // Files to skip when loading context
      skipFiles: spaceContext.skipFiles,
      
      // Additional context files to load from the space
      extraContextFiles: spaceContext.contextFiles.map((f: string) => 
        join(spaceContext.spacePath, f)
      ),
      
      // Override the effective workspace root for this session
      effectiveWorkspaceRoot: spaceContext.spacePath,
      
      // Add space context to system prompt
      prependToSystem: `You are in a shared space called "${spaceContext.spaceId}". 
Only access files within this space. 
The collaborator's role is: ${spaceContext.role}.
Do not reference files outside this space or the agent's private memory.`,
    };
  };
}
```

```typescript
// Add to src/channel.ts registerFull:

api.registerHook(["before_prompt_build"], createContextHook());
```

**Verification:**
```bash
# Create test files
echo "# Private File\nThis should NOT be visible in space." > ~/.openclaw/workspace/Private.md
echo "# Space File\nThis SHOULD be visible in space." > ~/.openclaw/workspace/TestSpace/space.md
echo "# Space Context\nInstructions for this space." > ~/.openclaw/workspace/TestSpace/.space/SPACE.md

# Unit test context hook
npm test -- --grep "context-hook"

# Expected tests:
# - skipFiles list correct
# - extraContextFiles paths correct
# - effectiveWorkspaceRoot set to space path

# Integration test:
# Connect to space WebSocket
# Ask: "What files can you see?"
# Expected: Lists files in TestSpace, NOT Private.md or AGENTS.md

# Ask: "What are your instructions?"
# Expected: Only includes .space/SPACE.md, NOT AGENTS.md
```

---

## Phase 2: Web UI

### Step 8: React UI Scaffold

**Goal:** Create React + Vite + shadcn/ui web application for the Space UI.

**Actions:**
```bash
cd /workspaces/ai-spaces
npm create vite@latest web -- --template react-ts
cd web
npm install
npx shadcn@latest init
npx shadcn@latest add button card input textarea
npm install @uiw/react-md-editor
```

**Files:**

```typescript
// web/src/App.tsx
import { useState, useEffect } from "react";
import { FileBrowser } from "./components/FileBrowser";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { Chat } from "./components/Chat";
import { useShareToken } from "./hooks/useShareToken";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || window.location.origin;

export function App() {
  const { spaceId, shareToken, isValid, spaceInfo } = useShareToken(GATEWAY_URL);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  
  if (!shareToken) {
    return <div className="error">Missing share token</div>;
  }
  
  if (!isValid) {
    return <div className="error">Invalid or expired share link</div>;
  }
  
  return (
    <div className="app">
      <header>
        <h1>{spaceInfo?.name || spaceId}</h1>
        <span className="role">{spaceInfo?.role}</span>
      </header>
      
      <main className="layout">
        <aside className="sidebar">
          <FileBrowser
            spacePath={spaceInfo?.path}
            selectedFile={selectedFile}
            onSelect={setSelectedFile}
          />
        </aside>
        
        <section className="editor">
          {selectedFile ? (
            <MarkdownEditor
              spaceId={spaceId!}
              shareToken={shareToken!}
              filePath={selectedFile}
              readOnly={spaceInfo?.role === "viewer"}
            />
          ) : (
            <div className="placeholder">Select a file to edit</div>
          )}
        </section>
        
        <aside className="chat">
          <Chat
            spaceId={spaceId!}
            shareToken={shareToken!}
            gatewayUrl={GATEWAY_URL}
          />
        </aside>
      </main>
    </div>
  );
}

export default App;
```

```typescript
// web/src/hooks/useShareToken.ts
import { useState, useEffect } from "react";

interface SpaceInfo {
  id: string;
  name: string;
  path: string;
}

interface UseShareTokenResult {
  spaceId: string | null;
  shareToken: string | null;
  isValid: boolean | null;
  spaceInfo: SpaceInfo | null;
  error: string | null;
}

export function useShareToken(gatewayUrl: string): UseShareTokenResult {
  const [result, setResult] = useState<UseShareTokenResult>({
    spaceId: null,
    shareToken: null,
    isValid: null,
    spaceInfo: null,
    error: null,
  });
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get("share");
    const pathParts = window.location.pathname.split("/");
    const spaceId = pathParts[2] ? decodeURIComponent(pathParts[2]) : null;
    
    if (!shareToken || !spaceId) {
      setResult({
        spaceId,
        shareToken,
        isValid: false,
        spaceInfo: null,
        error: "Missing share token or space ID",
      });
      return;
    }
    
    // Validate token
    fetch(`${gatewayUrl}/spaces/${encodeURIComponent(spaceId)}/info?share=${shareToken}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setResult({
            spaceId,
            shareToken,
            isValid: false,
            spaceInfo: null,
            error: data.error,
          });
        } else {
          setResult({
            spaceId,
            shareToken,
            isValid: true,
            spaceInfo: data.space,
            error: null,
          });
        }
      })
      .catch(err => {
        setResult({
          spaceId,
          shareToken,
          isValid: false,
          spaceInfo: null,
          error: err.message,
        });
      });
  }, [gatewayUrl]);
  
  return result;
}
```

**Verification:**
```bash
cd /workspaces/ai-spaces/web
npm run build
# Expected: Build succeeds, creates dist/ folder

ls web/dist/
# Expected: index.html, assets/, etc.

npm run dev
# Expected: Dev server starts at http://localhost:5173
```

---

### Step 9: File Browser Component

**Goal:** Display space directory contents in a tree view.

**Files:**

```typescript
// web/src/components/FileBrowser.tsx
import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";

interface FileNode {
  name: string;
  type: "file" | "directory";
  children?: FileNode[];
}

interface FileBrowserProps {
  spacePath?: string;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}

export function FileBrowser({ spacePath, selectedFile, onSelect }: FileBrowserProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    if (!spacePath) return;
    // TODO: Fetch file tree from API
    // For now, use mock data
    setFiles([
      { name: "README.md", type: "file" },
      { 
        name: "notes", 
        type: "directory", 
        children: [
          { name: "ideas.md", type: "file" },
          { name: "todo.md", type: "file" },
        ]
      },
    ]);
  }, [spacePath]);
  
  const renderNode = (node: FileNode, path: string) => {
    const fullPath = path ? `${path}/${node.name}` : node.name;
    const isSelected = selectedFile === fullPath;
    const isExpanded = expanded.has(fullPath);
    
    const toggleExpand = () => {
      const newExpanded = new Set(expanded);
      if (isExpanded) {
        newExpanded.delete(fullPath);
      } else {
        newExpanded.add(fullPath);
      }
      setExpanded(newExpanded);
    };
    
    const handleClick = () => {
      if (node.type === "file") {
        onSelect(fullPath);
      } else {
        toggleExpand();
      }
    };
    
    return (
      <div key={fullPath} className="file-node">
        <div 
          className={`file-row ${isSelected ? "selected" : ""}`}
          onClick={handleClick}
        >
          {node.type === "directory" && (
            isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          )}
          {node.type === "file" ? <File size={16} /> : <Folder size={16} />}
          <span className="name">{node.name}</span>
        </div>
        
        {node.type === "directory" && isExpanded && node.children && (
          <div className="children">
            {node.children.map(child => renderNode(child, fullPath))}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="file-browser">
      <h3>Files</h3>
      <div className="file-tree">
        {files.map(node => renderNode(node, ""))}
      </div>
    </div>
  );
}
```

**Verification:**
```bash
npm test -- --grep "FileBrowser"
# Expected: Tests for rendering, click handling, file selection

# Manual test:
# Start gateway + web dev server
# Open browser with share token
# Expected: File tree shows space contents
# Click folders to expand
# Click file to select
```

---

### Step 10: Markdown Editor Component

**Goal:** Edit markdown files with live preview.

**Files:**

```typescript
// web/src/components/MarkdownEditor.tsx
import { useState, useEffect } from "react";
import MDEditor from "@uiw/react-md-editor";

interface MarkdownEditorProps {
  spaceId: string;
  shareToken: string;
  filePath: string;
  readOnly?: boolean;
}

export function MarkdownEditor({ 
  spaceId, 
  shareToken, 
  filePath, 
  readOnly = false 
}: MarkdownEditorProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load file content
  useEffect(() => {
    setLoading(true);
    // TODO: Implement file loading via WebSocket/tool call
    // For now, mock content
    setContent(`# ${filePath}\n\nEdit this file...`);
    setLoading(false);
  }, [spaceId, filePath]);
  
  const handleSave = async () => {
    if (readOnly) return;
    
    setSaving(true);
    setError(null);
    
    try {
      // TODO: Implement file saving via WebSocket/tool call
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log("Saved:", filePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  
  return (
    <div className="markdown-editor">
      <div className="editor-header">
        <span className="file-path">{filePath}</span>
        {!readOnly && (
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="save-btn"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        {readOnly && <span className="read-only-badge">Read Only</span>}
      </div>
      
      {error && <div className="error">{error}</div>}
      
      <MDEditor
        value={content}
        onChange={(val) => setContent(val || "")}
        preview={readOnly ? "preview" : "edit"}
        hideToolbar={readOnly}
        height={600}
      />
    </div>
  );
}
```

**Verification:**
```bash
npm test -- --grep "MarkdownEditor"
# Expected: Tests for load, edit, save

# Manual test:
# Select a markdown file
# Edit content in editor
# Verify preview updates
# Click save
# Verify file saved via API call
```

---

### Step 11: Chat Interface Component

**Goal:** Chat with scoped agent via WebSocket.

**Files:**

```typescript
// web/src/components/Chat.tsx
import { useState, useEffect, useRef } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatProps {
  spaceId: string;
  shareToken: string;
  gatewayUrl: string;
}

export function Chat({ spaceId, shareToken, gatewayUrl }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Connect WebSocket
  useEffect(() => {
    const wsUrl = `${gatewayUrl.replace("http", "ws")}/spaces/${spaceId}/ws?share=${shareToken}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setConnected(true);
      console.log("WebSocket connected");
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "event" && data.event === "chat") {
        const msg = data.payload;
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: msg.role,
          content: msg.content,
          timestamp: new Date(),
        }]);
      }
    };
    
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnected(false);
    };
    
    ws.onclose = () => {
      setConnected(false);
      console.log("WebSocket closed");
    };
    
    wsRef.current = ws;
    
    return () => {
      ws.close();
    };
  }, [spaceId, shareToken, gatewayUrl]);
  
  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  const sendMessage = async () => {
    if (!input.trim() || sending || !connected) return;
    
    const content = input.trim();
    setInput("");
    setSending(true);
    
    // Add user message
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    }]);
    
    // Send to agent via WebSocket
    wsRef.current?.send(JSON.stringify({
      type: "req",
      id: crypto.randomUUID(),
      method: "chat.send",
      params: {
        message: content,
      },
    }));
    
    setSending(false);
  };
  
  return (
    <div className="chat">
      <div className="chat-header">
        <h3>Chat</h3>
        <span className={`status ${connected ? "connected" : "disconnected"}`}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="content">{msg.content}</div>
            <div className="timestamp">{msg.timestamp.toLocaleTimeString()}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Ask about this space..."
          disabled={!connected}
        />
        <button onClick={sendMessage} disabled={!connected || sending}>
          Send
        </button>
      </div>
    </div>
  );
}
```

**Verification:**
```bash
npm test -- --grep "Chat"
# Expected: Tests for message rendering, input, WebSocket connection

# Manual test:
# Open Space UI with share token
# Type message in chat
# Expected: Message appears in list
# Expected: Agent responds (scoped to space content)
# Try to ask about files outside space
# Expected: Agent refuses or says it doesn't know about those files
```

---

## Phase 3: Integration & Polish

### Step 12: End-to-End Integration

**Goal:** All components work together properly.

**Integration Test Script:**
```bash
#!/bin/bash
# e2e-test.sh

set -e

echo "=== AI Spaces End-to-End Test ==="

# Cleanup
rm -rf ~/.openclaw/workspace/E2ETest
rm -f ~/.openclaw/data/ai-spaces/shares.json

# Create test space
mkdir -p ~/.openclaw/workspace/E2ETest/.space
echo '{"name":"E2E Test","agent":{"capabilities":["read","write","web_search"],"denied":["exec","messaging"]}}' \
  > ~/.openclaw/workspace/E2ETest/.space/spaces.json
echo "# Test Doc\n\nThis is a test document." > ~/.openclaw/workspace/E2ETest/doc.md
echo "# Space Context\n\nThis is shared space context." > ~/.openclaw/workspace/E2ETest/.space/SPACE.md

# Build plugin
npm run build

# Install plugin
openclaw plugins install -l /workspaces/ai-spaces

# Verify CLI commands
echo "Testing CLI commands..."
openclaw spaces list | grep "E2ETest"
openclaw spaces show E2ETest | grep "E2E Test"

SHARE_OUTPUT=$(openclaw spaces share create E2ETest --role editor --expires 7d --format json)
TOKEN=$(echo "$SHARE_OUTPUT" | jq -r '.token')
echo "Created share token: $TOKEN"

openclaw spaces share list E2ETest | grep -q "editor"
openclaw spaces share revoke E2ETest $(echo "$SHARE_OUTPUT" | jq -r '.id')

# Start gateway
echo "Starting gateway..."
openclaw gateway &
GATEWAY_PID=$!
sleep 5

# Create fresh share for HTTP testing
SHARE_OUTPUT=$(openclaw spaces share create E2ETest --role editor --format json)
TOKEN=$(echo "$SHARE_OUTPUT" | jq -r '.token')

# Test HTTP routes
echo "Testing HTTP routes..."
curl -s "http://localhost:18789/spaces/E2ETest/info?share=$TOKEN" | jq .
curl -s "http://localhost:18789/spaces/E2ETest/info?share=invalid" | jq .

# Build web UI
echo "Building web UI..."
cd web
npm run build
cd ..

# Run unit tests
echo "Running unit tests..."
npm test

# Cleanup
kill $GATEWAY_PID 2>/dev/null || true
rm -rf ~/.openclaw/workspace/E2ETest

echo "=== All tests passed ==="
```

**Verification:**
```bash
chmod +x e2e-test.sh
./e2e-test.sh
# Expected: All tests pass without errors
```

---

### Step 13: Edit History (Post-MVP)

**Goal:** Track edit history for eventual CRDT support.

**Files:**

```typescript
// src/history/store.ts
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import type { Space } from "../spaces/types.js";

export interface FileVersion {
  content: string;
  timestamp: Date;
  editedBy: "agent" | "collaborator";
  sessionId: string;
}

export interface FileHistory {
  path: string;
  versions: FileVersion[];
}

export class HistoryManager {
  constructor(private dataDir: string) {}
  
  private getHistoryPath(space: Space): string {
    return resolve(space.path, ".space", "history.json");
  }
  
  async loadHistory(space: Space): Promise<Map<string, FileHistory>> {
    const historyPath = this.getHistoryPath(space);
    try {
      const content = await readFile(historyPath, "utf-8");
      const data = JSON.parse(content);
      const map = new Map<string, FileHistory>();
      for (const [path, history] of Object.entries(data.files || {})) {
        map.set(path, history as FileHistory);
      }
      return map;
    } catch {
      return new Map();
    }
  }
  
  async saveVersion(
    space: Space,
    filePath: string,
    content: string,
    editedBy: "agent" | "collaborator",
    sessionId: string
  ): Promise<void> {
    const history = await this.loadHistory(space);
    
    const relPath = filePath.replace(space.path, "").replace(/^\//, "");
    
    if (!history.has(relPath)) {
      history.set(relPath, { path: relPath, versions: [] });
    }
    
    const fileHistory = history.get(relPath)!;
    fileHistory.versions.push({
      content,
      timestamp: new Date(),
      editedBy,
      sessionId,
    });
    
    // Keep last 50 versions
    if (fileHistory.versions.length > 50) {
      fileHistory.versions = fileHistory.versions.slice(-50);
    }
    
    await this.writeHistory(space, history);
  }
  
  private async writeHistory(space: Space, history: Map<string, FileHistory>): Promise<void> {
    const historyPath = this.getHistoryPath(space);
    await mkdir(dirname(historyPath), { recursive: true });
    
    const data = {
      files: Object.fromEntries(history),
    };
    
    await writeFile(historyPath, JSON.stringify(data, null, 2));
  }
}
```

**Verification:**
```bash
# Edit a file multiple times
# Check history
cat ~/.openclaw/workspace/E2ETest/.space/history.json | jq .
# Expected: JSON with versions array

# Verify history content
# Each entry should have: content, timestamp, editedBy, sessionId
```

---

## Verification Summary

| Step | Verification Command |
|------|---------------------|
| 0 | `npm run build` succeeds |
| 1 | `openclaw help` shows `spaces` subcommand |
| 2 | `openclaw spaces list` shows discovered spaces |
| 3 | `openclaw spaces share create/list/revoke` work |
| 4 | `curl` HTTP routes return correct responses |
| 5 | Unit tests for path validation pass |
| 6 | Unit tests for context injection pass |
| 7 | `wscat` WebSocket connects with valid token |
| 8 | `npm run dev` starts React app |
| 9 | File browser renders in browser |
| 10 | Editor saves in browser |
| 11 | Chat sends/receives in browser |
| 12 | `./e2e-test.sh` passes |
| 13 | `history.json` contains edits |

---

## Directory Structure

```
ai-spaces/
├── package.json                 # NPM config with openclaw.extensions
├── openclaw.plugin.json         # Plugin manifest
├── tsconfig.json                 # TypeScript config
├── index.ts                      # Main entry (defineChannelPluginEntry)
├── setup-entry.ts                # Setup-only entry
├── src/
│   ├── channel.ts                # Channel plugin implementation
│   ├── spaces/
│   │   ├── types.ts              # Space types
│   │   ├── discovery.ts          # Space scanning
│   │   └── registry.ts           # In-memory registry
│   ├── shares/
│   │   ├── types.ts              # Share types
│   │   ├── tokens.ts             # Token generation
│   │   ├── storage.ts            # Persist to ~/.openclaw/data/
│   │   └── manager.ts            # Share CRUD
│   ├── session/
│   │   ├── context.ts            # ScopedSessionContext
│   │   └── injection.ts          # Session context setup
│   ├── hooks/
│   │   ├── path-hook.ts          # before_tool_call hook
│   │   └── context-hook.ts      # before_prompt_build hook
│   ├── routes/
│   │   └── spaces.ts             # HTTP route handlers
│   ├── cli/
│   │   ├── list.ts               # openclaw spaces list
│   │   ├── show.ts               # openclaw spaces show
│   │   ├── share-create.ts       # openclaw spaces share create
│   │   ├── share-list.ts         # openclaw spaces share list
│   │   └── share-revoke.ts       # openclaw spaces share revoke
│   └── history/
│       └── store.ts              # Edit history
├── web/                          # React UI (separate Vite project)
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── FileBrowser.tsx
│   │   │   ├── MarkdownEditor.tsx
│   │   │   └── Chat.tsx
│   │   └── hooks/
│   │       └── useShareToken.ts
│   └── dist/                     # Built static files
└── MVP.md                        # This file
```

---

## Security Considerations

1. **Token Validation:** Every request validates the share token, not just on connect
2. **Path Canonicalization:** All paths are resolved and checked against space root
3. **Tool Filtering:** Denied tools are blocked at the hook level
4. **Memory Isolation:** AGENTS.md, MEMORY.md, USER.md are never loaded for space sessions
5. **Session Keys:** Use hashed token (not full token) in session keys
6. **Rate Limiting:** Should be added for production (not in MVP)

---

## Post-MVP Enhancements

1. **CRDT Support:** Replace last-write-wins with CRDT for concurrent edits
2. **Real-time Presence:** Show who else is viewing/editing
3. **File Watcher:** Auto-refresh space discovery when configs change
4. **Web UI Polish:** Better styling, accessibility, mobile support
5. **Audit Logging:** Log all actions with timestamps and actor
6. **Share Link Management UI:** Create/revoke links from web
7. **Multiple Collaborators:** Handle concurrent sessions properly
8. **Email Integration:** Send share links via email