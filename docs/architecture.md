# AI Spaces Architecture

**How AI Spaces integrates with OpenClaw to share portions of an agent's workspace with collaborators.**

---

## The Misconception vs. The Reality

### What AI Spaces is NOT

~Each Space is NOT a separate agent workspace.~ 

The agent already has a workspace with files and knowledge. The goal is to share portions of it.

### What AI Spaces IS

**A Space is a subdirectory of an agent's existing workspace that can be shared with collaborators.**

```
Agent Workspace                    # Owned by the agent
├── AGENTS.md                      # Agent's operating instructions (PRIVATE)
├── MEMORY.md                      # Agent's long-term memory (PRIVATE)
├── Private/                       # Never shared
│   └── secrets.md
│
├── Vacations/                     # ← SPACE (shared with family)
│   ├── .space/
│   │   └── spaces.json            # Who can access
│   ├── Maine.md
│   ├── CostaRica.md
│   └── tables.db
│
└── Research/
    └── NewCar/                    # ← SPACE (shared with spouse)
        ├── .space/
        │   └── spaces.json
        ├── RAV4.md
        └── CX-5.md
```

**The agent shares a slice of its knowledge**, not a separate workspace.

---

## Core Components

### 1. Agent's Workspace (OpenClaw)

The agent already has a workspace at `~/.openclaw/workspace/` (or custom path). This is the source of truth.

### 2. Space Definition (Self-Registration)

Spaces are defined by the presence of a `.space/spaces.json` file in a directory:

```json5
// Vacations/.space/spaces.json
{
  name: "Family Vacations",
  description: "Shared vacation planning with family",
  collaborators: [
    { email: "wife@example.com", role: "editor", name: "Leah" },
    { email: "teen@example.com", role: "viewer", name: "Allie" },
  ],
  agent: {
    capabilities: ["read", "write", "web_search"],
    denied: ["exec", "messaging", "spawn_agents"],
  },
}
```

**Alternative: Workspace-root config**

For bulk management, a single `spaces.json` at the root:

```json5
// ~/.openclaw/workspace/spaces.json
{
  spaces: {
    "Vacations": {
      name: "Family Vacations",
      collaborators: [...],
    },
    "Research/NewCar": {
      name: "New Car Search",
      collaborators: [...],
    },
  },
}
```

Both formats are supported. Per-space `.space/spaces.json` takes precedence.

### 3. AI Spaces Plugin (OpenClaw Extension)

A plugin that:
- Discovers spaces by scanning for `spaces.json` / `.space/spaces.json`
- Serves the Space UI (web interface)
- Validates share links
- Enforces path restrictions on agent tool calls
- Routes collaborator messages to the agent

### 4. Space UI (Web Interface)

A Vite + Lit SPA (like OpenClaw's Control UI) that:
- Connects to Gateway WebSocket
- Authenticates via share link tokens
- Displays files, markdown editor, chat interface
- Sends messages to the scoped agent context

---

## Authentication: Share Links

### What They Are

Share links are URL tokens managed entirely by AI Spaces. OpenClaw knows nothing about collaborators.

```
https://spaces.example.com/vacations?share=abc123def456
```

### How They Work

```
┌────────────┐     Create Space      ┌─────────────┐
│   Agent    │──────────────────────▶│ AI Spaces   │
│ (owner)    │                       │  Plugin     │
└────────────┘                       └──────┬──────┘
                                            │
                                     spaces.json
                                     (in workspace)
                                            │
┌────────────┐     Generate share     ┌──────▼──────┐
│   Agent    │──────────────────────▶│ AI Spaces   │
│ (owner)    │   openclaw spaces      │  Plugin    │
└────────────┘   share vacations     └──────┬──────┘
                                            │
                                     shares.json
                                     (plugin-managed)
                                            │
┌────────────┐     Open share link   ┌──────▼──────┐
│Collaborator│──────────────────────▶│   Space    │
│  (browser) │                       │    UI      │
└────────────┘                       └──────┬──────┘
                                            │
                                     WebSocket to
                                     Gateway (with share token)
```

### Share Link Storage

Share links are stored in AI Spaces' own data file, NOT in OpenClaw config:

```json5
// ~/.openclaw/data/ai-spaces/shares.json
{
  shares: {
    "abc123def456": {
      spaceId: "vacations",
      spacePath: "~/.openclaw/workspace/Vacations",
      agentId: "main",
      role: "editor",
      created: "2026-03-26T00:00:00Z",
      expires: "2026-04-02T00:00:00Z",
      lastAccess: "2026-03-26T14:30:00Z",
      label: "Leah's link",
    },
  },
}
```

### Validation Flow

1. Collaborator opens share link
2. Space UI loaded by Gateway
3. UI opens WebSocket with share token in query
4. AI Spaces plugin validates token against `shares.json`
5. Plugin injects space-scoped context into agent routing
6. Agent tool calls are intercepted to enforce path restrictions

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           OpenClaw Gateway                               │
│                     (WebSocket on :18789)                                │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         Plugins                                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────────┐ │ │
│  │  │ WhatsApp │ │ Telegram │ │ Discord │ │    AI Spaces           │ │ │
│  │  │ channel  │ │ channel  │ │ channel │ │    channel + plugin    │ │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────────┬───────────┘ │ │
│  └───────┼────────────┼────────────┼─────────────────┼───────────────┘ │
│          │            │            │                 │                 │
│  ┌───────▼────────────▼────────────▼─────────────────▼───────────────┐ │
│  │                    Routing + Bindings                              │ │
│  └─────────────────────────────┬──────────────────────────────────────┘ │
│                                │                                        │
│  ┌─────────────────────────────▼──────────────────────────────────────┐ │
│  │                     Agents + Tool Execution                        │ │
│  │  ┌────────────────────────────────────────────────────────────────┐│ │
│  │  │  Agent "main"                                                  ││ │
│  │  │  workspace: ~/.openclaw/workspace                              ││ │
│  │  │  tools: ALL                                                    ││ │
│  │  │                                                                ││ │
│  │  │  ┌─────────────────┐  ┌──────────────────────────────────┐     ││ │
│  │  │  │ workspace/       │  │ workspace/Vacations/ [SPACE]     │     ││ │
│  │  │  │ ├── AGENTS.md   │  │ ├── .space/spaces.json           │     ││ │
│  │  │  │ ├── MEMORY.md   │  │ ├── Maine.md                    │     ││ │
│  │  │  │ ├── Private/    │  │ └── CostaRica.md                │     ││ │
│  │  │  │ └── ...         │  │                                  │     ││ │
│  │  │  └─────────────────┘  └──────────────────────────────────┘     ││ │
│  │  └────────────────────────────────────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                      ┌─────────────┼─────────────┐
                      │             │             │
                ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
                │ Control  │ │ macOS app │ │  Space   │
                │   UI     │ │   (node)  │ │   UI     │
                └──────────┘ └───────────┘ │(browser) │
                                          └──────────┘
```

---

## Scoped Access: How It Works

### Key Insight: Same Agent, Scoped Tools

We don't need separate agents for each space. Instead:

1. Collaborator connects via share link
2. AI Spaces plugin validates the share
3. Plugin creates a **scoped tool context** for that session
4. Agent tool calls are intercepted via `before_tool_call` hook
5. Path-based restrictions enforced

### Tool Interception

```typescript
// AI Spaces plugin
api.on("before_tool_call", async (ctx) => {
  // Check if this session is space-scoped
  const spaceContext = ctx.sessionMetadata?.spaceContext;
  if (!spaceContext) return; // Not a space session
  
  // Enforce path restrictions
  if (ctx.toolName === "read" || ctx.toolName === "write") {
    const requestedPath = ctx.params.path;
    const spacePath = spaceContext.spacePath;
    
    // Resolve to absolute paths
    const resolvedRequested = path.resolve(spacePath, requestedPath);
    const resolvedSpace = path.resolve(spacePath);
    
    // Check if path is within space
    if (!resolvedRequested.startsWith(resolvedSpace + path.sep)) {
      throw new Error(`Path escapes space: ${requestedPath}`);
    }
  }
  
  // Block denied tools
  if (spaceContext.deniedTools.includes(ctx.toolName)) {
    throw new Error(`Tool not allowed in space: ${ctx.toolName}`);
  }
});
```

### Memory Isolation

The scoped context also limits what memory files are loaded:

- `AGENTS.md` → Skipped (agent's private instructions)
- `MEMORY.md` → Skipped (agent's private memory)
- `.space/SPACE.md` → Loaded (space-specific context)
- `.space/spaces.json` → Skipped (config, not memory)

---

## Space Discovery

### On Gateway Start

```typescript
// AI Spaces plugin
async onGatewayStart() {
  // Scan agent workspaces for spaces
  const agents = await api.getAgents();
  for (const agent of agents) {
    await this.discoverSpaces(agent.workspace, agent.id);
  }
}

async discoverSpaces(workspacePath: string, agentId: string) {
  // Option 1: Workspace-root spaces.json
  const rootConfig = path.join(workspacePath, "spaces.json");
  if (await fs.exists(rootConfig)) {
    const config = JSON.parse(await fs.readFile(rootConfig));
    for (const [subdir, spaceConfig] of Object.entries(config.spaces)) {
      await this.registerSpace(path.join(workspacePath, subdir), agentId, spaceConfig);
    }
  }
  
  // Option 2: Per-space .space/spaces.json
  const subdirs = await fs.readdir(workspacePath);
  for (const subdir of subdirs) {
    const spaceConfigPath = path.join(workspacePath, subdir, ".space", "spaces.json");
    if (await fs.exists(spaceConfigPath)) {
      const config = JSON.parse(await fs.readFile(spaceConfigPath));
      await this.registerSpace(path.join(workspacePath, subdir), agentId, config);
    }
  }
}
```

### On File Watch

Use file watcher to detect `.space/spaces.json` changes:

```typescript
// Watch for space config changes
api.registerService({
  id: "ai-spaces-watcher",
  async start() {
    const watcher = chokidar.watch([
      path.join(workspace, "**/.space/spaces.json"),
      path.join(workspace, "spaces.json"),
    ]);
    
    watcher.on("add", (file) => this.discoverSpaces());
    watcher.on("change", (file) => this.reloadSpace(file));
    watcher.on("unlink", (file) => this.unregisterSpace(file));
  },
});
```

---

## Session Management

### Session Keys for Space Collaborators

Each collaborator gets a unique session key:

```
space:<spaceId>:<agentId>:<collaboratorId>
```

Example:
- `space:vacations:main:wife@example.com`
- `space:newcar:main:spouse@example.com`

### Session Isolation

Sessions are isolated by space + collaborator:
- Collaborators don't see each other's chat history
- Collaborators don't see agent's other sessions
- Session context is scoped to the space

### Context Injection

When a space session starts, inject space context:

```typescript
// Session context for space collaborators
{
  spaceId: "vacations",
  spacePath: "/Users/me/.openclaw/workspace/Vacations",
  spaceName: "Family Vacations",
  agentId: "main",
  role: "editor",
  // Tool restrictions from .space/spaces.json
  allowedTools: ["read", "write", "web_search"],
  deniedTools: ["exec", "messaging", "spawn_agents"],
}
```

---

## Plugin Integration

### Channel Registration

```typescript
api.registerChannel({
  id: "ai-spaces",
  
  routes: ["/spaces/:spaceId/ws"],
  
  async handleInbound(envelope, ctx) {
    // Validate share link token
    const shareToken = envelope.metadata?.shareToken;
    const share = await this.validateShare(shareToken);
    if (!share) {
      throw new Error("Invalid or expired share link");
    }
    
    // Inject space context into session
    ctx.sessionMetadata.spaceContext = {
      spaceId: share.spaceId,
      spacePath: share.spacePath,
      agentId: share.agentId,
      role: share.role,
    };
    
    // Route to the agent that owns the space
    return { agentId: share.agentId };
  },
  
  async handleOutbound(message, ctx) {
    // Push updates to connected space UI clients
    await this.broadcastToSpace(ctx.spaceId, message);
  },
});
```

### HTTP Routes

```typescript
// Serve Space UI
api.registerHttpRoute("GET", "/spaces/:spaceId", async (req, res) => {
  const shareToken = req.query.share;
  const share = await this.validateShare(shareToken);
  
  if (!share) {
    return res.status(401).send("Invalid or expired share link");
  }
  
  // Serve static UI files (path restrictions handled by WebSocket)
  res.sendFile(path.join(__dirname, "ui", "index.html"));
});

// Generate share link
api.registerHttpRoute("POST", "/api/spaces/:spaceId/shares", async (req, res) => {
  // Requires owner authentication
  const owner = await this.authenticateOwner(req);
  if (!owner) {
    return res.status(401).send("Not authenticated");
  }
  
  const { role, expiresIn } = req.body;
  const share = await this.createShare({
    spaceId: req.params.spaceId,
    agentId: owner.agentId,
    role: role || "editor",
    expiresIn: expiresIn || "7d",
  });
  
  res.json({
    shareToken: share.token,
    shareUrl: `https://spaces.example.com/${share.spaceId}?share=${share.token}`,
  });
});

// List shares for a space
api.registerHttpRoute("GET", "/api/spaces/:spaceId/shares", async (req, res) => {
  const owner = await this.authenticateOwner(req);
  if (!owner) return res.status(401).send("Not authenticated");
  
  const shares = await this.listShares(req.params.spaceId);
  res.json(shares);
});

// Revoke share
api.registerHttpRoute("DELETE", "/api/spaces/:spaceId/shares/:shareId", async (req, res) => {
  const owner = await this.authenticateOwner(req);
  if (!owner) return res.status(401).send("Not authenticated");
  
  await this.revokeShare(req.params.shareId);
  res.status(204).send();
});
```

---

## CLI Commands

```bash
# List spaces discovered in agent workspace
openclaw spaces list

# Create a space (creates .space/spaces.json)
openclaw spaces create Vacations --name "Family Vacations"

# Add collaborator
openclaw spaces collaborators add Vacations --email wife@example.com --role editor

# Generate share link
openclaw spaces share create Vacations --role editor --expires 7d

# List active shares
openclaw spaces share list Vacations

# Revoke share
openclaw spaces share revoke Vacations <shareId>

# Open space UI in browser
openclaw spaces open Vacations
```

---

## Security Model

### What Collaborators Can Do

- Read files in the space directory
- Write files in the space directory (if role = editor)
- Chat with the agent about space content
- Use tools allowed by `.space/spaces.json`

### What Collaborators Cannot Do

- Access files outside the space directory
- See agent's `AGENTS.md`, `MEMORY.md`, `USER.md`
- Use tools denied by `.space/spaces.json`
- Escalate to other spaces
- Access agent's other sessions

### Enforcement Points

| Layer | Enforcement |
|-------|-------------|
| WebSocket auth | Validate share link token |
| Tool hooks | Path validation, tool filtering |
| File system | Resolve paths, check prefix |
| Memory | Skip agent memory files, load space memory |

---

## File Structure Summary

```
~/.openclaw/
├── openclaw.json                    # OpenClaw config
├── workspace/                       # Agent's workspace
│   ├── AGENTS.md                    # (PRIVATE)
│   ├── MEMORY.md                    # (PRIVATE)
│   ├── USER.md                      # (PRIVATE)
│   │
│   ├── Vacations/                   # Space
│   │   ├── .space/
│   │   │   └── spaces.json          # Space config
│   │   ├── Maine.md
│   │   └── CostaRica.md
│   │
│   └── Research/
│       └── NewCar/                  # Space
│           ├── .space/
│           │   └── spaces.json
│           ├── RAV4.md
│           └── CX-5.md
│
└── data/
    └── ai-spaces/
        ├── shares.json              # Share links (managed by plugin)
        └── sessions/                # Session metadata
```

---

## Comparison to Original Docs

| Aspect | Original Docs | Revised Architecture |
|--------|---------------|----------------------|
| Space storage | New workspace per space | Subdirectory of existing workspace |
| Agent model | Spawn scoped sub-agent | Same agent with tool hooks |
| Auth | Magic links (vague) | Share links managed by plugin |
| Integration | Hand-waved | Concrete OpenClaw plugin API |
| Config location | Unspecified | `.space/spaces.json` or `spaces.json` |

---

## Next Steps

1. **Prototype the plugin skeleton** - Create basic plugin structure
2. **Implement space discovery** - Scan for `spaces.json` files
3. **Implement share link auth** - Generate, validate, revoke
4. **Implement tool interception** - Path restrictions, tool filtering
5. **Build Space UI** - Vite + Lit SPA with file browser + chat
6. **Implement WebSocket routing** - Route space sessions to agent

---

*Architecture document created 2026-03-26*