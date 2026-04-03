# AI Spaces Architecture

**Canonical architecture document.**

---

## Core Principle

> A Space is a subdirectory of an agent's workspace that can be shared with collaborators. The Spaces Service owns users, authentication, and permissions. The Agent Adapter manages all agent communication. The Agent owns files and computation.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Spaces Service                                 │
│                                                                          │
│  Owns: Users, Auth, Sessions, Shares, Permissions, Space Metadata      │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│  │  REST API    │  │  WebSocket   │  │   Database   │                │
│  │              │  │              │  │              │                │
│  │  /api/spaces │  │  /ws/space/  │  │  users      │                │
│  │  /api/shares │  │              │  │  spaces     │                │
│  │              │  │              │  │  shares     │                │
│  └──────────────┘  └──────────────┘  │  sessions   │                │
│                                      └──────────────┘                │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
                        │ API calls with spaceId
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Agent Adapter                                   │
│                                                                          │
│  Owns: spaceId → agent mapping, agent routing                            │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Space Mapping                                                    │  │
│  │                                                                   │  │
│  │  spaceId → { agentType, agentInstanceId, location }             │  │
│  │                                                                   │  │
│  │  "550e..." → {                                                    │  │
│  │    agentType: "openclaw",                                        │  │
│  │    agentInstanceId: "my-agent",                                 │  │
│  │    location: { workspace: "...", path: "Vacations" }            │  │
│  │  }                                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Agent Implementations                                            │  │
│  │                                                                   │  │
│  │  OpenClawAdapter    ClaudeCodeAdapter    FutureAdapter            │  │
│  │  (MVP)              (Future)            (Future)                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
                        │ Translates spaceId → workspace path
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Agent                                       │
│                         (OpenClaw, etc.)                                │
│                                                                          │
│  Owns: Files, Agent Memory, Tool Execution, Space Config                │
│                                                                          │
│  workspace/                                                              │
│  ├── AGENTS.md                     (private)                            │
│  ├── MEMORY.md                     (private)                            │
│  ├── Vacations/                    (space)                              │
│  │   ├── .space/                                                          │
│  │   │   ├── spaces.json           (config)                             │
│  │   │   └── SPACE.md              (context)                            │
│  │   ├── Maine.md                                                         │
│  │   └── CostaRica.md                                                      │
│  └── Research/NewCar/              (space)                               │
│      ├── .space/                                                          │
│      │   └── spaces.json                                                   │
│      └── comparison.md                                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Responsibility Split

### Spaces Service Knows:

- `spaceId` (UUID)
- Space metadata (name, description, owner)
- Users, authentication, OAuth providers
- Share links, roles, permissions
- Sessions, audit logs

### Agent Adapter Knows:

- `spaceId` → `agentType` + `agentInstanceId` + `location`
- How to route to different agent types
- How to translate file paths for each agent
- How to manage agent sessions

### Agent Knows:

- Its own files and workspace
- Space config (`.space/spaces.json`)
- Space context (`.space/SPACE.md`)
- How to execute scoped sessions

---

## Data Models

### Spaces Service Database

```sql
-- Users (multiple auth providers per user)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE auth_providers (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    provider_type TEXT, -- 'email', 'google', 'github', etc.
    provider_user_id TEXT,
    provider_email TEXT,
    metadata JSONB, -- password hash, OAuth tokens, etc.
    created_at TIMESTAMP
);

-- Spaces (minimal metadata)
CREATE TABLE spaces (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES users(id),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Shares
CREATE TABLE shares (
    id UUID PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    space_id UUID REFERENCES spaces(id),
    user_id UUID REFERENCES users(id),
    role TEXT NOT NULL, -- 'viewer', 'editor', 'owner', 'admin'
    permissions TEXT[],
    label TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP,
    revoked_at TIMESTAMP
);
```

### Agent Workspace

```
workspace/Vacations/
├── .space/
│   ├── spaces.json          # Space config
│   └── SPACE.md             # Space context (agent instructions)
├── Maine.md
└── CostaRica.md
```

**spaces.json:**
```json
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

---

## Roles and Permissions

### Role Hierarchy

| Role | Permissions | Description | Availability |
|------|-------------|-------------|--------------|
| `viewer` | `read`, `comment` | View-only access | MVP |
| `editor` | `read`, `comment`, `edit` | Modify files | MVP |
| `owner` | `read`, `comment`, `edit`, `share` | Manage shares, full control | MVP |
| `admin` | All + server admin | AI Spaces administrator | Post-MVP |

### Permission Definitions

- **`read`**: View files and directory structure
- **`comment`**: Chat with agent
- **`edit`**: Modify files
- **`share`**: Create/revoke share links
- **`admin`**: Manage all spaces, users, server configuration

### Role Assignment

- Space creator → `owner` role
- Share links have a single role
- Users can have different roles per space (Post-MVP)
- Anonymous users get role from share link

---

## HTTP API

### Spaces

```bash
# Create space
POST /api/spaces
{
  "name": "Family Vacations",
  "description": "Shared vacation planning"
}

# Response
{
  "spaceId": "550e8400-...",
  "name": "Family Vacations",
  "description": "Shared vacation planning",
  "ownerId": "660e8400-...",
  "createdAt": "2026-04-01T12:00:00Z"
}

# Get space details
GET /api/spaces/{spaceId}

# Get space config (via agent adapter)
GET /api/spaces/{spaceId}/config

# Delete space
DELETE /api/spaces/{spaceId}
```

### Shares

```bash
# Create share link
POST /api/spaces/{spaceId}/shares
{
  "role": "editor",
  "expiresAt": "2026-04-08T00:00:00Z",
  "label": "Leah's vacation link"
}

# Response
{
  "shareId": "550e8400-...",
  "token": "Kf7Pq9Rz...",
  "spaceId": "550e8400-...",
  "role": "editor",
  "permissions": ["read", "comment", "edit"],
  "shareUrl": "https://spaces.example.com/s/550e8400-...?t=Kf7Pq9Rz...",
  "expiresAt": "2026-04-08T00:00:00Z"
}

# List shares
GET /api/spaces/{spaceId}/shares

# Revoke share
DELETE /api/spaces/{spaceId}/shares/{shareId}
```

### Files

```bash
# Via WebSocket
WS /ws/space/{spaceId}?t={token}

# List files
{ "type": "req", "id": "1", "method": "files.list", "params": { "path": "" } }

# Read file
{ "type": "req", "id": "2", "method": "files.read", "params": { "path": "Maine.md" } }

# Write file
{ "type": "req", "id": "3", "method": "files.write", "params": { "path": "Maine.md", "content": "..." } }

# Chat
{ "type": "req", "id": "4", "method": "chat.send", "params": { "message": "What files are here?" } }
```

---

## Agent Adapter Interface

```typescript
interface AgentAdapter {
  // Space management
  createSpace(config: SpaceConfig): Promise<{ spaceId: string }>;
  getSpaceConfig(spaceId: string): Promise<SpaceConfig>;
  
  // File operations
  getFile(spaceId: string, path: string): Promise<FileContent>;
  putFile(spaceId: string, path: string, content: string): Promise<void>;
  listFiles(spaceId: string, path?: string): Promise<FileInfo[]>;
  
  // Session management
  createSession(spaceId: string, context: SessionContext): Promise<Session>;
  closeSession(sessionId: string): Promise<void>;
  
  // Chat
  sendChatMessage(sessionId: string, message: string): AsyncIterator<ChatChunk>;
}
```

All file paths are **relative to the space**. The agent adapter resolves them to absolute paths based on its internal mapping.

---

## Space Creation Flow

```
Agent Owner        Agent Adapter           Spaces Service      Database
     │                  │                       │                 │
     │ 1. Create        │                       │                 │
     │    .space/       │                       │                 │
     │    in workspace  │                       │                 │
     │                  │                       │                 │
     │ 2. Create space  │                       │                 │
     │    POST /api/    │                       │                 │
     │    spaces        │                       │                 │
     │ ─────────────────►│                       │                 │
     │                  │                       │                 │
     │                  │ 3. Create space record │                 │
     │                  │ ──────────────────────►│                 │
     │                  │                       │                 │
     │                  │                       │ 4. Insert       │
     │                  │                       │ ────────────────►│
     │                  │                       │                 │
     │                  │                       │ 5. spaceId      │
     │                  │                       │ ◄───────────────│
     │                  │                       │                 │
     │                  │ 6. Store mapping       │                 │
     │                  │    spaceId → agent     │                 │
     │                  │    (internal)         │                 │
     │                  │                       │                 │
     │                  │ 7. Return spaceId      │                 │
     │ ◄────────────────│                       │                 │
```

**Key Points:**
- Spaces Service stores minimal metadata (id, name, description, owner)
- Agent Adapter maintains the `spaceId` → agent mapping
- Space config stays in `.space/spaces.json` (authoritative)

---

## File Operation Flow

```
Collaborator       Spaces Service      Agent Adapter          Agent
     │                  │                    │                   │
     │ "Read Maine.md"  │                    │                   │
     │ via WebSocket    │                    │                   │
     │ ─────────────────►│                    │                   │
     │                  │                    │                   │
     │                  │ getFile(            │                   │
     │                  │   spaceId, "Maine.md")                   │
     │                  │ ───────────────────►│                   │
     │                  │                    │                   │
     │                  │                    │ Resolve spaceId:  │
     │                  │                    │  → workspace/     │
     │                  │                    │     Vacations/    │
     │                  │                    │                   │
     │                  │                    │ Read path:        │
     │                  │                    │  workspace/Vac/   │
     │                  │                    │  Maine.md         │
     │                  │                    │ ─────────────────►│
     │                  │                    │                   │
     │                  │                    │     file content │
     │                  │                    │ ◄────────────────│
     │                  │                    │                   │
     │    file content  │                    │                   │
     │ ◄────────────────│                    │                   │
```

---

## Security Model

### Path Isolation

All file operations go through the agent adapter, which validates:

1. Path resolves to absolute path
2. Path is within space root
3. Symlinks are resolved and checked
4. Result path still within space root

### Tool Restrictions

Scoped sessions have limited tools:
- **Always allowed**: `read`, `glob`
- **Editor only**: `write`, `edit`
- **Configurable**: `web_search` (per space config)
- **Always denied**: `exec`, `messaging`, `spawn_agents`, `credentials`

### Memory Isolation

Scoped sessions skip:
- `AGENTS.md`
- `MEMORY.md`
- `USER.md`
- `memory/` directory

And load:
- `.space/SPACE.md`

---

## MVP vs Post-MVP

### MVP (v0.1)

| Feature | Implementation |
|---------|---------------|
| Space creation | API + agent adapter |
| Share links | Token-based, anonymous |
| Auth | No user accounts |
| File operations | Via agent adapter |
| Chat | Scoped sessions |
| Agent support | OpenClaw only |

### Post-MVP

| Feature | Implementation |
|---------|---------------|
| User accounts | OAuth + multiple providers |
| Admin role | Server administration |
| Multiple agents | Separate agent adapter service |
| Real-time collab | Yjs CRDT |
| Chat history | Database persistence |

---

## Key Decisions

1. **Spaces Service only knows spaceId** - doesn't know about agents or file paths
2. **Agent Adapter maintains mapping** - spaceId → agent + location
3. **Config lives in workspace** - `.space/spaces.json` is authoritative
4. **Multiple auth providers per user** - email, Google, GitHub, etc.
5. **Roles: viewer, editor, owner, admin** - owner manages shares, admin is server-wide

---

## Related Documents

- [AGENT-ADAPTER.md](./AGENT-ADAPTER.md) - Agent adapter architecture details
- [Security Model](./security.md) - Security considerations
- [User Models](./models/User.md) - User authentication
- [Space Models](./models/Space.md) - Space data model