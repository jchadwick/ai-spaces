# AI Spaces

**Share portions of your AI agent's workspace with collaborators — they just need a browser.**

---

## What is AI Spaces?

Your AI agent has a workspace full of research, notes, plans, and decisions. But your spouse, family, colleagues — they can't see any of it. They send you texts asking "what did we decide about vacation?" or "which car are we leaning toward?"

**AI Spaces lets you share specific goal-centered Rooms from your agent's workspace with specific people.** Your collaborators get a web interface where they can:

- Open Rooms that the owner has promoted from files or folders inside a Space
- Browse and edit documents inside those Rooms
- Chat with a **scoped context** of your agent - it only knows about that Room's shared scope

The agent sees their edits and messages. You see what they changed. Everyone stays in sync.

---

## The Core Insight

**Spaces are subdirectories of your agent's existing workspace. Rooms are the collaborator-facing workspaces inside them.**

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

The agent's private files (`AGENTS.md`, `MEMORY.md`, `Private/`) are never exposed. Spaces remain the security and administration boundary. Collaborators usually enter through promoted Rooms, while owners can still use the raw Space Explorer.

---

## Architecture

AI Spaces is a **standalone service** that connects to your AI agent through a pluggable adapter interface. The MVP uses OpenClaw, but other agents can be supported.

### Key Components

| Component | Responsibility |
|-----------|---------------|
| **Spaces Service** | Users, auth, memberships, invites, permissions, real-time WebSocket, audit logs |
| **Agent Adapter** | File operations, scoped sessions, tool execution |
| **Space UI** | Rooms-first web interface for owners and collaborators (React) |

### Data Ownership

| Data | Owner | Location |
|------|-------|----------|
| Users & Auth | Spaces Service | Database |
| Spaces, Memberships & Invites | Spaces Service | Database |
| Space Config | Agent | `.space/spaces.json` |
| Files | Agent | Workspace |

```
┌─────────────────────────────────────────────────────────────────┐
│                        Spaces Service                           │
│                                                                 │
│  Owns: Users, Auth, Sessions, Memberships, Invites, Audit Log │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  REST API    │  │  WebSocket   │  │  Agent Adapters     │  │
│  │              │  │              │  │                     │  │
│  │  POST /spaces │  │  /ws/space/ │  │  OpenClaw (MVP)     │  │
│  │ POST /invites │  │              │  │  Future Agents      │  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Database: users | spaces | members | invites | audit   │  │
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

### 2. Invite Registered Collaborators

Owners create invite links with a specific role. The invite must be redeemed by a logged-in registered user before it grants access.

```bash
POST /api/spaces/{spaceId}/invites
{
  "role": "editor"
}

Response:
{
  "inviteId": "abc123",
  "inviteUrl": "https://spaces.example.com/invite#token=Kf7Pq9Rz..."
}
```

### 3. Collaborators Access

Collaborators log in, redeem the invite, and then land in Rooms home filtered to spaces where they are members:

- **Rooms Home**: Choose a promoted Room inside an accessible Space
- **Room Files**: Navigate files and folders scoped to that Room
- **Markdown Editor**: View and edit documents when their role allows it
- **Chat Interface**: Talk to the agent about Room content

The agent only receives the selected Room context - it can't see other spaces, private files, or owner-restricted paths.

---

## Security Model

### Permission System

**Permissions** (system-level):
- `read`: View files and directory structure
- `comment`: Chat with agent
- `edit`: Modify files
- `share`: Create invites and manage members

**Roles** (user-facing):

| Role | Permissions | Description |
|------|-------------|-------------|
| Viewer | `read`, `comment` | View-only access |
| Editor | `read`, `comment`, `edit` | Full collaboration |
| Owner | `read`, `comment`, `edit`, `share` | Manage space|
| Admin | `read`, `comment`, `edit`, `share` | Server-wide administration |

### Memory Isolation

When a collaborator chats with the agent, the agent loads a **scoped Room context**:

| File | Full Agent | Scoped Context |
|------|------------|----------------|
| `AGENTS.md` | ✓ Loaded | ✗ Skipped |
| `MEMORY.md` | ✓ Loaded | ✗ Skipped |
| `USER.md` | ✓ Loaded | ✗ Skipped |
| `.space/SPACE.md` | Optional | ✓ Loaded |
| Space files | ✓ All | ✓ Only within selected Room and allowed space paths |

### What Collaborators Cannot Do

- Access files outside the space directory
- Access owner-restricted files or folders
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

Yay!

---

## Building

### Docker (no local Node required)

```bash
docker build -t ai-spaces .
```

This produces a single image containing the sidecar server, web UI, and compiled plugin. To extract the plugin dist for use with OpenClaw or another agent runtime:

```bash
id=$(docker create ai-spaces)
docker cp $id:/plugin ./packages/plugin/dist
docker rm $id
```

---

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - Canonical architecture reference
- [User Stories](./docs/stories/) - Feature specifications
- [User Flows](./docs/flows/) - Interaction flows
- [Data Models](./docs/models/) - Schema definitions
- [Security Model](./docs/security.md) - Security considerations
- [OpenClaw Reference](./docs/openclaw-reference.md) - OpenClaw integration
