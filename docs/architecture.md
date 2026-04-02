# AI Spaces Architecture

**How AI Spaces integrates with OpenClaw to share portions of an agent's workspace with collaborators.**

---

## The Core Concept

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
│   └── CostaRica.md
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

## Why This Matters

| Wrong Approach | Right Approach |
|----------------|----------------|
| Create new workspace per space | Share subdirectory of existing workspace |
| Spawn separate agent per space | Same agent with scoped tool access |
| Diverging state between agent and space | Agent already knows the content |
| Complex sync between workspaces | Single source of truth |

---

## Core Components

### 1. Agent's Workspace (OpenClaw)

The agent already has a workspace at `~/.openclaw/workspace/` (or custom path). This is the source of truth. AI Spaces does not create new workspaces.

### 2. Space Definition (Self-Registration)

Spaces are defined by the presence of a config file in a directory. The format is flexible, but the concept is:

- A `.space/` subdirectory indicates "this folder is a Space"
- The config specifies who can access and what they can do
- Can also be defined centrally at workspace root

### 3. AI Spaces Plugin (OpenClaw Extension)

An OpenClaw plugin that:
- Discovers spaces by scanning for config files
- Validates share links for collaborator access
- Intercepts agent tool calls to enforce scoping
- Serves the Space UI

### 4. Space UI (Web Interface)

A web interface that:
- Connects to OpenClaw Gateway via WebSocket
- Authenticates via share links
- Displays files, markdown editor, chat interface

### 5. Share Links (Auth Mechanism)

Share links are managed entirely by AI Spaces:
- OpenClaw knows nothing about collaborators
- Links are short-lived and revocable
- Links map to specific spaces and roles

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
│  │  │  │ ├── AGENTS.md   │  │ Scoped via tool hooks            │     ││ │
│  │  │  │ ├── MEMORY.md   │  │                                  │     ││ │
│  │  │  │ ├── Private/    │  │                                  │     ││ │
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
3. Plugin creates a **scoped context** for that session
4. Agent tool calls are intercepted via OpenClaw's tool hooks
5. Path-based restrictions enforce the space boundary

### What Gets Scoped

| Layer | Enforcement |
|-------|-------------|
| WebSocket auth | Validate share link token |
| Tool hooks | Path validation, tool filtering |
| File system | Resolve paths, check they're within space |
| Memory | Skip agent's private memory, load space-specific memory if present |

### Memory Isolation

The scoped context loads differently:

| File | Full Agent | Scoped Context |
|------|------------|----------------|
| `AGENTS.md` | ✓ Loaded | ✗ Skipped |
| `MEMORY.md` | ✓ Loaded | ✗ Skipped |
| `USER.md` | ✓ Loaded | ✗ Skipped |
| `.space/SPACE.md` | Optional | ✓ Loaded (if exists) |
| Space files | ✓ All | ✓ Only within space |

---

## Space Discovery

### How Spaces Are Found

The plugin needs to discover spaces when:
- Gateway starts
- Config files change
- New spaces are created

Two approaches:
1. **Per-space config**: `.space/spaces.json` in each space directory
2. **Workspace-root config**: `spaces.json` at the workspace root

Both formats can be supported; per-space takes precedence.

### File Watcher

A file watcher can detect when space configs are added/modified/removed, enabling dynamic space management without gateway restart.

---

## Session Management

### Session Keys

Each collaborator gets a unique session key scoped to the space:

```
space:<spaceId>:<agentId>:<collaboratorId>
```

### Session Isolation

- Collaborators don't see each other's chat history
- Collaborators don't see agent's other sessions
- Session context is scoped to the space

---

## Integrationwith OpenClaw

### How AI SpacesPlugs In

AI Spaces needs to:
1. **Discover spaces** by scanning config files
2. **Register as a channel** for WebSocket routing
3. **Register HTTP routes** for serving UI and share link management
4. **Hook into tool execution** for path scoping
5. **Inject context** into session metadata

### Key Integration Points

| OpenClaw Feature | AI Spaces Use |
|------------------|---------------|
| Plugin registration | Channel + HTTP routes |
| Tool hooks | Path validation, tool filtering |
| Session metadata | Store space context |
| Agent workspace | Source of truth for files |

---

## Security Model

### What Collaborators Can Do

- Read files in the space directory
- Write files in the space directory (if role = editor)
- Chat with the agent about space content
- Use tools allowed by space config

### What Collaborators Cannot Do

- Access files outside the space directory
- See agent's `AGENTS.md`, `MEMORY.md`, `USER.md`
- Use tools denied by space config
- Escalate to other spaces
- Access agent's other sessions

### Enforcement Points

| Layer | Enforcement |
|-------|-------------|
| Share link validation | Must be valid and not expired |
| Session creation | Inject space context |
| Tool calls | Path must resolve within space |
| Memory loading | Skip agent's private files |

---

## File Structure

```
~/.openclaw/
├── openclaw.json                    # OpenClaw config
├── workspace/                       # Agent's workspace
│   ├── AGENTS.md                    # (PRIVATE)
│   ├── MEMORY.md                    # (PRIVATE)
│   │
│   ├── Vacations/                   # Space
│   │   ├── .space/
│   │   │   └── spaces.json          # Space config
│   │   └── ...
│   │
│   └── Research/NewCar/             # Space
│       ├── .space/
│       │   └── spaces.json
│       └── ...
│
└── data/
    └── ai-spaces/
        └── shares.json              # Share links (managed by plugin)
```

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Subdirectory of existing workspace | Agent already knows the content, no sync latency |
| Same agent with tool hooks | Simpler than spawning/managing separate agents |
| Share links managed by plugin | OpenClaw doesn't need to know about collaborators |
| Per-space config files | Self-contained, easy to reason about |
| OpenClaw plugin architecture | Leverages existing infrastructure |

---

## Open Questions

1. **UI Technology**: What framework for Space UI? (Control UI uses Vite + Lit)
2. **Real-time Edits**: How to handle concurrent edits? (CRDT? OT? Locking?)
3. **File Watcher vs Polling**: How fast should space discovery respond?
4. **Share Link Format**: URL param? Path component? JWT?
5. **Session Storage**: Where to store session metadata? (OpenClaw sessions? Separate?)

---

*Architecture document for AI Spaces.*