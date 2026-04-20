# AI Spaces

**Share portions of your AI agent's workspace with collaborators — they just need a browser.**

---

## What is AI Spaces?

Your AI agent has a workspace full of research, notes, plans, and decisions. But your spouse, family, colleagues — they can't see any of it. They send you texts asking "what did we decide about vacation?" or "which car are we leaning toward?"

**AI Spaces lets you share specific folders from your agent's workspace with specific people.** Your collaborators get a web interface where they can:

- Browse files and folders in the shared space
- Edit documents directly
- Chat with a **scoped context** of your agent — it only knows about that space

The agent sees their edits and messages. You see what they changed. Everyone stays in sync.

---

## The Core Insight

**Spaces are subdirectories of your agent's existing workspace.**

You don't create new workspaces. You don't copy files. You share portions of what your agent already knows:

```
~/.openclaw/workspace/           # Your agent's workspace
├── AGENTS.md                     # Agent's instructions (PRIVATE)
├── MEMORY.md                     # Agent's long-term memory (PRIVATE)
├── Vacations/                    # ← SPACE: shared with family
│   ├── .space/
│   │   ├── spaces.json          # Space configuration
│   │   └── SPACE.md             # Space-specific context
│   ├── Maine.md
│   └── CostaRica.md
├── Research/
│   └── NewCar/                   # ← SPACE: shared with spouse
│       ├── .space/
│       │   └── spaces.json
│       └── comparison.md
└── Private/                     # NOT shared
    └── secrets.md
```

The agent's private files (`AGENTS.md`, `MEMORY.md`, `Private/`) are never exposed. Only the directories you designate as spaces become shareable.

---

## Architecture

AI Spaces is a **standalone service** that connects to your AI agent through a pluggable adapter interface. The MVP uses OpenClaw, but other agents can be supported.

### Key Components

| Component | Responsibility |
|-----------|---------------|
| **Spaces Service** | Users, auth, shares, permissions, real-time WebSocket, audit logs |
| **Agent Adapter** | File operations, scoped sessions, tool execution |
| **Space UI** | Web interface for collaborators (React) |

### Data Ownership

| Data | Owner | Location |
|------|-------|----------|
| Users & Auth | Spaces Service | Database |
| Spaces & Shares | Spaces Service | Database |
| Space Config | Agent | `.space/spaces.json` |
| Files | Agent | Workspace |

```
┌─────────────────────────────────────────────────────────────────┐
│                        Spaces Service                           │
│                                                                 │
│  Owns: Users, Auth, Sessions, Shares, Permissions, Audit Log  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  REST API    │  │  WebSocket   │  │  Agent Adapters     │  │
│  │              │  │              │  │                     │  │
│  │  POST /spaces │  │  /ws/space/ │  │  OpenClaw (MVP)     │  │
│  │  POST /shares │  │              │  │  Future Agents      │  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Database: users | spaces | shares | sessions | audit   │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Agent (OpenClaw)                        │
│                                                                 │
│  Owns: Files, Agent Memory, Tool Execution                     │
│                                                                 │
│  workspace/                                                     │
│  ├── AGENTS.md         (private)                               │
│  ├── MEMORY.md         (private)                               │
│  └── Vacations/        (shared space)                          │
│      ├── .space/spaces.json                                   │
│      └── Maine.md                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. Create a Space

Add a `.space/` directory with configuration to any folder in your agent's workspace:

```json
// .space/spaces.json
{
  "name": "Family Vacations",
  "description": "Shared vacation planning",
  "agent": {
    "tools": {
      "allow": ["read", "write", "web_search"],
      "deny": ["exec", "messaging"]
    }
  }
}
```

Register the space with Spaces Service:

```bash
POST /api/spaces
{
  "agentId": "my-openclaw",
  "path": "Vacations",
  "config": { ... }
}
```

### 2. Create Share Links

Generate shareable links with specific permissions:

```bash
POST /api/spaces/{spaceId}/shares
{
  "role": "editor",
  "expiresAt": "2026-05-01T00:00:00Z"
}

Response:
{
  "shareUrl": "https://spaces.example.com/s/abc123?t=Kf7Pq9Rz...",
  "token": "Kf7Pq9Rz..."
}
```

### 3. Collaborators Access

Collaborators open the share URL and see:

- **File Browser**: Navigate files and folders in the space
- **Markdown Editor**: View and edit documents
- **Chat Interface**: Talk to the agent about space content

The agent only knows about files in that space — it can't see other spaces or private files.

---

## Security Model

### Permission System

**Permissions** (system-level):
- `read`: View files and directory structure
- `comment`: Chat with agent
- `edit`: Modify files
- `share`: Create/revoke share links

**Roles** (user-facing):

| Role | Permissions | Description |
|------|-------------|-------------|
| Viewer | `read`, `comment` | View-only access |
| Editor | `read`, `comment`, `edit` | Full collaboration |
| Owner | `read`, `comment`, `edit`, `share` | Manage space|
| Admin | `read`, `comment`, `edit`, `share` | Manage all spaces and shares |

### Memory Isolation

When a collaborator chats with the agent, the agent loads a **scoped context**:

| File | Full Agent | Scoped Context |
|------|------------|----------------|
| `AGENTS.md` | ✓ Loaded | ✗ Skipped |
| `MEMORY.md` | ✓ Loaded | ✗ Skipped |
| `USER.md` | ✓ Loaded | ✗ Skipped |
| `.space/SPACE.md` | Optional | ✓ Loaded |
| Space files | ✓ All | ✓ Only within space |

### What Collaborators Cannot Do

- Access files outside the space directory
- See the agent's private memory or instructions
- Use tools denied by space configuration
- Escalate to other spaces
- Access other collaborator sessions

---

## Configuration

### Space Config (`.space/spaces.json`)

Defines space metadata and agent behavior:

```json
{
  "name": "Family Vacations",
  "description": "Shared vacation planning",
  "agent": {
    "tools": {
      "allow": ["read", "write", "web_search"],
      "deny": ["exec", "messaging", "spawn_agents"]
    }
  }
}
```

### Space Context (`.space/SPACE.md`)

Space-specific instructions for the agent:

```markdown
# Space Context

This space is for planning family vacations.

## Guidelines
- Focus on travel-related topics
- Be helpful with budget questions
- Keep suggestions family-friendly
```

---

## Key Features

### Scoped Agent Sessions
- Collaborators chat with a scoped version of your agent
- Agent only sees files within the space
- Tool access restricted per space configuration

### Real-Time Collaboration
- WebSocket-based real-time updates
- File changes broadcast to all collaborators
- Chat responses streamed character-by-character

### Fine-Grained Permissions
- Role-based access control
- Per-space tool restrictions
- Audit logging for security

### Portable Spaces
- `.space/` directory travels with the folder
- Move or rename spaces without losing configuration
- Agent settings stay with the content


## Comparison to Alternatives

| Approach | Problem |
|----------|---------|
| Share a Google Doc | Your agent can't see it or edit it |
| Share a Notion page | Your agent can't see it or edit it |
| Forward agent messages | No interactivity, collaborators can't ask follow-ups |
| Give agent access to collaborators | Security nightmare, private data exposure |
| **AI Spaces** | Agent can collaborate, but only in the designated space |

---

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - Canonical architecture reference
- [User Stories](./docs/stories/) - Feature specifications
- [User Flows](./docs/flows/) - Interaction flows
- [Data Models](./docs/models/) - Schema definitions
- [Security Model](./docs/security.md) - Security considerations
- [OpenClaw Reference](./docs/openclaw-reference.md) - OpenClaw integration

---

## Development

### Prerequisites

- Node.js 22.14+ or 24.x
- npm 9+
- [OpenClaw](https://openclaw.ai) installed globally

### Setup

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Setup sandbox environment (isolated test environment)
./scripts/setup-sandbox.sh
```

### Running

```bash
# Start the gateway (uses sandbox environment)
./start.sh

# In another terminal, start the web app
npm run dev:web

# Test the API
curl http://localhost:19000/api/spaces

# Test auth (default admin credentials)
curl -X POST http://localhost:19000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"ai-spaces"}'
```

### Clean Up

```bash
# Stop the gateway (or just Ctrl+C if using ./start.sh)
pkill -f 'openclaw gateway'

# Remove sandbox environment
rm -rf /tmp/openclaw-sandbox
```
