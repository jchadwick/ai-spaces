# OpenClaw Architecture

Everything I learned from the OpenClaw documentation to inform AI Spaces design.

---

## Overview

OpenClaw is a **self-hosted gateway** that connects chat apps (WhatsApp, Telegram, Discord, iMessage, etc.) to AI agents. It runs as a single long-lived process and exposes a WebSocket API for control-plane clients.

Key concepts:
- One Gateway process owns all messaging connections
- Agents are isolated "brains" with their own workspaces, state, and tool permissions
- Messages are routed to agents via **bindings**
- Plugins extend functionality (channels, tools, HTTP routes)

---

## Core Components

### Gateway

The central daemon process that:
- Maintains connections to messaging channels (WhatsApp, Telegram, etc.)
- Exposes WebSocket API on port 18789 (configurable)
- Validates inbound frames against JSON Schema
- Emits events: `agent`, `chat`, `presence`, `health`, `heartbeat`, `cron`
- Serves static files for Control UI and other web surfaces

```
~/.openclaw/
├── openclaw.json          # Main config
├── credentials/           # Channel auth (WhatsApp, Telegram, etc.)
├── agents/               # Per-agent state
│   ├── main/
│   │   ├── agent/        # Auth profiles, model registry
│   │   └── sessions/     # Session transcripts
│   └── <agentId>/
│       ├── agent/
│       └── sessions/
├── workspace/            # Default agent workspace
└── skills/               # Shared skills
```

### Agents

An **agent** is a fully scoped AI "brain" with:

| Component | Description |
|-----------|-------------|
| `workspace` | Working directory for file tools (e.g., `~/.openclaw/workspace`) |
| `agentDir` | Auth profiles, model registry, per-agent config |
| `sessions/` | Chat history + routing state |
| `AGENTS.md` | Operating instructions, loaded every session |
| `SOUL.md` | Persona, tone, boundaries |
| `USER.md` | Who the user is |
| `tools.allow/deny` | Tool restrictions |
| `sandbox` | Optional sandboxing (Docker, etc.) |

**Important**: The workspace is the default cwd, NOT a hard sandbox. Absolute paths can reach elsewhere unless sandboxing is enabled.

### Bindings

Bindings route inbound messages to specific agents. Most-specific wins:

1. `peer` match (exact DM/group/channel id)
2. `parentPeer` match (thread inheritance)
3. `guildId + roles` (Discord role routing)
4. `guildId` (Discord)
5. `teamId` (Slack)
6. `accountId` match for a channel
7. channel-level match (`accountId: "*"`)
8. fallback to default agent

Example:
```json5
{
  bindings: [
    { agentId: "family", match: { channel: "whatsapp", peer: { kind: "group", id: "120363...@g.us" } } },
    { agentId: "main", match: { channel: "whatsapp" } },
  ],
}
```

### Sessions

Session management is key:

- **DM scope**: How direct messages are grouped
  - `main` (default): All DMs share one session
  - `per-peer`: Isolate by sender
  - `per-channel-peer`: Isolate by channel + sender (recommended for shared inboxes)
  - `per-account-channel-peer`: Isolate by account + channel + sender

- **Session keys**:
  - Main: `agent:<agentId>:<mainKey>`
  - DM: `agent:<agentId>:direct:<peerId>` (varies by dmScope)
  - Group: `agent:<agentId>:<channel>:group:<groupId>`
  - Thread: `agent:<agentId>:<channel>:group:<groupId>:topic:<threadId>`

- **Maintenance**: Configurable pruning, rotation, disk budgets
  ```json5
  session: {
    maintenance: {
      mode: "enforce",
      pruneAfter: "30d",
      maxEntries: 500,
      rotateBytes: "10mb",
      maxDiskBytes: "1gb",
    },
  }
  ```

---

## Plugin System

OpenClaw supports plugins via `api.register*` methods:

### Registration Methods

| Method | Purpose |
|--------|---------|
| `api.registerChannel(...)` | Messaging channel (WhatsApp, Telegram, etc.) |
| `api.registerProvider(...)` | LLM backend (Anthropic, OpenAI, etc.) |
| `api.registerTool(...)` | Agent tool |
| `api.registerHttpRoute(...)` | HTTP endpoint |
| `api.registerGatewayMethod(...)` | RPC method for WebSocket clients |
| `api.registerHook(...)` | Event hook (before_tool_call, etc.) |
| `api.registerService(...)` | Background service |
| `api.registerCli(...)` | CLI subcommand |

### Channel Plugin Example

```typescript
api.registerChannel({
  id: "ai-spaces",
  async handleInbound(envelope, ctx) {
    // Route to appropriate agent
    const agentId = `space-${envelope.spaceId}`;
    return { agentId };
  },
  async handleOutbound(message, ctx) {
    // Deliver to connected space UI clients
  },
});
```

### HTTP Route Example

```typescript
api.registerHttpRoute({
  method: "GET",
  path: "/spaces/:spaceId",
  handler: async (req, res) => {
    // Serve static UI files
  },
});
```

---

## Authentication & Security

### Device Pairing

All WebSocket clients (operators + nodes) include a **device identity** on connect:
- New device IDs require pairing approval
- Gateway issues a **device token** for subsequent connects
- Local connects (loopback) can be auto-approved
- Non-local requires explicit approval

### Token/Password Auth

- `gateway.auth.token`: Static token for WebSocket auth
- `gateway.auth.password`: Password-based auth
- `connect.params.auth.token` / `connect.params.auth.password` in WebSocket handshake

### Tailscale Integration

- `openclaw gateway --tailscale serve`: HTTPS via Tailscale
- `gateway.auth.allowTailscale: true`: Accept Tailscale identity headers for auth
- Requests must come through Tailscale proxy (verified via `tailscale whois`)

---

## Control UI (Web Interface)

A Vite + Lit SPA served by the Gateway at `/`:

- Connects via WebSocket to `ws://<host>:18789`
- Auth via token/password in WebSocket handshake
- Features: chat, channels config, sessions management, cron jobs, skills, logs, etc.
- Built into Gateway, served from `dist/control-ui/`

**Key patterns:**
- WebSocket protocol: `{type:"req", id, method, params}` → `{type:"res", id, ok, payload|error}`
- Events: `{type:"event", event, payload, seq?}`
- Everything goes through the Gateway - no direct file access from browser

---

## Nodes

Nodes are companion devices that connect to Gateway with `role: "node"`:

| Platform | Exposes |
|----------|---------|
| macOS app | `canvas.*`, `camera.*`, `system.run` |
| iOS app | `camera.*`, `location.*` |
| Android app | `camera.*`, `sms.send`, `device.*` |
| Headless node host | `system.run`, `system.which` |

Nodes require pairing approval before use.

---

## Memory & Context

### Workspace Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Operating instructions, loaded every session |
| `SOUL.md` | Persona, tone, boundaries |
| `USER.md` | Who the user is |
| `IDENTITY.md` | Agent name, emoji |
| `TOOLS.md` | Notes about local tools (guidance only) |
| `HEARTBEAT.md` | Checklist for heartbeat runs |
| `BOOT.md` | Startup checklist on gateway restart |
| `MEMORY.md` | Curated long-term memory |
| `memory/YYYY-MM-DD.md` | Daily memory logs |
| `skills/` | Workspace-specific skills |

### Session Lifecycle

- Sessions are reused until expiry
- Daily reset at 4 AM (configurable)
- Optional idle reset (`idleMinutes`)
- New sessions created via `/new` or `/reset` commands
- Compaction runs when context nears limit
- Memory flush before compaction writes durable notes

---

## Tool Restrictions

Per-agent tool config:

```json5
{
  agents: {
    list: [{
      id: "family",
      tools: {
        allow: ["read", "write", "web_search"],
        deny: ["exec", "messaging", "spawn_agents", "browser"],
      },
    }],
  },
}
```

### Sandbox Options

```json5
{
  sandbox: {
    mode: "all",      // Always sandboxed
    scope: "agent",  // One container per agent
    docker: {
      setupCommand: "apt-get update && apt-get install -y git curl",
    },
  },
}
```

---

## Canvas & A2UI

The Gateway serves Canvas UI files:
- `/__openclaw__/canvas/` → agent-editable HTML/CSS/JS
- `/__openclaw__/a2ui/` → A2UI host

Nodes can display Canvas content (`canvas.present`, `canvas.snapshot`).

---

## Multi-Agent Architecture

One Gateway can host multiple isolated agents:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        workspace: "~/.openclaw/workspace",
        default: true,
      },
      {
        id: "work",
        workspace: "~/.openclaw/workspace-work",
        sandbox: { mode: "all", scope: "agent" },
        tools: { allow: ["read"], deny: ["exec"] },
      },
    ],
  },
  bindings: [
    { agentId: "work", match: { channel: "telegram" } },
    { agentId: "main", match: { channel: "whatsapp" } },
  ],
}
```

Each agent has:
- Separate sessions (`~/.openclaw/agents/<agentId>/sessions/`)
- Separate auth profiles
- Separate workspace
- Separate tool restrictions

---

## Key Integration Points for AI Spaces

### Channels

Create a channel that routes to scoped agents:
- Route: `/spaces/:spaceId/ws`
- Validate share link tokens
- Inject appropriate agent context

### HTTP Routes

Serve the Space UI:
- `GET /spaces/:spaceId` → static files
- `POST /spaces/:spaceId/messages` → send message to space agent
- WebSocket for real-time chat

### Hooks

Use hooks to enforce scoping:
- `before_tool_call`: Block reads/writes outside space directory
- Modify agent context based on space

### Agents

Option 1: Spawn scoped sub-agents
- Each space gets its own agentId
- Agent workspace = space directory
- Tools restricted to that directory

Option 2: Path-scoped tool calls
- Same agent, but tool calls are intercepted
- Read/write limited to space directory
- Requires hook-based interception

---

## Configuration Paths

| Path | Description |
|------|-------------|
| `~/.openclaw/openclaw.json` | Main config |
| `~/.openclaw/workspace/` | Default workspace |
| `~/.openclaw/agents/<id>/agent/` | Per-agent state |
| `~/.openclaw/agents/<id>/sessions/` | Session transcripts |
| `~/.openclaw/credentials/` | Channel auth |
| `~/.openclaw/skills/` | Shared skills |

---

## WebSocket Protocol

### Request/Response

```json
// Request
{ "type": "req", "id": "abc123", "method": "chat.send", "params": {...} }

// Success response
{ "type": "res", "id": "abc123", "ok": true, "payload": {...} }

// Error response
{ "type": "res", "id": "abc123", "ok": false, "error": "..." }
```

### Events

```json
{ "type": "event", "event": "chat", "payload": {...}, "seq": 123 }
```

### Methods (Examples)

| Method | Description |
|--------|-------------|
| `chat.send` | Send message to agent |
| `chat.history` | Get session history |
| `chat.abort` | Stop current run |
| `sessions.list` | List sessions |
| `config.get` / `config.set` | Read/write config |
| `health` | Gateway health check |
| `status` | Gateway status |

---

## Relevant for AI Spaces Implementation

1. **Spaces as scoped contexts**: Each space is a subdirectory. AI Spaces needs to enforce path restrictions.

2. **Share links**: Not OpenClaw device tokens. AI Spaces manages its own access tokens.

3. **Plugin pattern**: Register channel + HTTP routes for Space UI + WebSocket routing.

4. **Session isolation**: Each collaborator gets their own session key scoped to the space.

5. **No need for separate agents**: The same agent can serve multiple spaces IF we hook tool calls to enforce directory restrictions.

---

*Compiled from OpenClaw documentation at docs.openclaw.ai on 2026-03-26*