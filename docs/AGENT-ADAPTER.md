# Agent Adapter Architecture

**The Agent Adapter is a reverse proxy that sits between Spaces Service and all agents.**

---

## Core Concept

The Spaces Service only knows about `spaceId`. It doesn't know about:
- Which agent the space belongs to
- Where files are located
- How to talk to the agent

The Agent Adapter maintains the mapping and handles all agent communication.

```
┌─────────────────┐
│ Spaces Service  │  Only knows: spaceId
│                 │
│  "Get file from │
│   space X"      │
└────────┬────────┘
         │
         │ API call with spaceId
         │
         ▼
┌─────────────────┐
│  Agent Adapter  │  Maintains mapping:
│                 │  spaceId → agent + location
│  550e... → {    │
│    agent: "oa", │
│    type: "ocl", │
│    path: "Vaca" │
│  }              │
└────────┬────────┘
         │
         │ Routes to correct agent
         │ Translates file paths
         │
         ▼
┌─────────────────┐
│     Agent       │  Knows about files
│   (OpenClaw)    │
│                 │
│ workspace/Vac/  │
│   Maine.md      │
└─────────────────┘
```

---

## Key Responsibilities

| Responsibility | Spaces Service | Agent Adapter | Agent |
|---------------|----------------|--------------|-------|
| User auth | ✓ | | |
| Space metadata | ✓ | | |
| Share links | ✓ | | |
| Map spaceId → agent | | ✓ | |
| Map spaceId → location | | ✓ | |
| Route API calls | | ✓ | |
| Translate paths | | ✓ | |
| File operations | | | ✓ |
| Agent context | | | ✓ |
| Store space config | | ✓ (cached) | ✓ (authoritative) |

---

## Adapter Interface

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

---

## Space Mapping

The adapter maintains an internal mapping (implementation-specific):

```typescript
interface SpaceMapping {
  spaceId: string;
  agentType: string;        // "openclaw", "claude-code", etc.
  agentInstanceId: string;  // "my-openclaw", "work-agent", etc.
  location: any;            // Agent-specific location format
}

// OpenClaw example:
{
  spaceId: "550e8400-...",
  agentType: "openclaw",
  agentInstanceId: "my-openclaw",
  location: {
    workspaceRoot: "/home/user/.openclaw/workspace",
    spacePath: "Vacations"
  }
}

// Future: Claude Code example (hypothetical):
{
  spaceId: "660e8400-...",
  agentType: "claude-code",
  agentInstanceId: "work-claude",
  location: {
    projectRoot: "/home/user/projects/myproject",
    spaceDir: ".spaces/vacations"
  }
}
```

---

## Registration Flow

```
Agent Owner        Agent Adapter           Spaces Service      Agent
     │                  │                       │                 │
     │ 1. Create        │                       │                 │
     │    .space/       │                       │                 │
     │    dir in ws     │                       │                 │
     │                  │                       │                 │
     │ 2. Register      │                       │                 │
     │    POST /api/    │                       │                 │
     │    spaces        │                       │                 │
     │ ───────────────────────────────────────►│                 │
     │                  │                       │                 │
     │                  │                       │ 3. Create       │
     │                  │                       │    space record │
     │                  │                       │    return id    │
     │                  │                       │                 │
     │                  │ 4. Store mapping      │                 │
     │                  │    (internal)         │                 │
     │                  │                       │                 │
     │ 5. Return        │                       │                 │
     │    spaceId       │                       │                 │
     │ ◄────────────────────────────────────── │                 │
```

---

## File Operation Flow

```
Collaborator       Spaces Service      Agent Adapter          Agent
     │                  │                    │                   │
     │ "Read Maine.md"  │                    │                   │
     │ ─────────────────►│                    │                   │
     │                  │                    │                   │
     │                  │ getFile(            │                   │
     │                  │   spaceId, path)    │                   │
     │                  │ ───────────────────►│                   │
     │                  │                    │                   │
     │                  │                    │ 5. Resolve:       │
     │                  │                    │    spaceId →     │
     │                  │                    │    workspace +   │
     │                  │                    │    spacePath     │
     │                  │                    │                   │
     │                  │                    │ 6. Translate:    │
     │                  │                    │    "Maine.md"    │
     │                  │                    │    → workspace/ │
     │                  │                    │       Vac/       │
     │                  │                    │       Maine.md    │
     │                  │                    │                   │
     │                  │                    │ read(path)       │
     │                  │                    │ ─────────────────►│
     │                  │                    │                   │
     │                  │                    │        file content
     │                  │                    │ ◄────────────────│
     │                  │                    │                   │
     │                  │     file content   │                   │
     │                  │ ◄──────────────────│                   │
     │                  │                    │                   │
     │    file content  │                    │                   │
     │ ◄────────────────│                    │                   │
```

---

## Config Synchronization

### Where Config Lives

**Authoritative source:** `.space/spaces.json` in agent workspace

Why?
- Config travels with files
- Different agents may have different config formats
- Agent can work offline

**Spaces Service:** Does NOT cache config
- Spaces Service only stores: `id`, `name`, `description`, `ownerId`
- When Spaces Service needs config, it asks Agent Adapter
- Agent Adapter reads from agent workspace

### Sync Flow

```
Collaborator       Spaces Service      Agent Adapter          Agent
     │                  │                    │                   │
     │ "Get space info" │                    │                   │
     │ ─────────────────►│                    │                   │
     │                  │                    │                   │
     │                  │ getSpace(           │                   │
     │                  │   spaceId)          │                   │
     │                  │ ───────────────────►│                   │
     │                  │                    │                   │
     │                  │                    │ read .space/      │
     │                  │                    │      spaces.json  │
     │                  │                    │ ─────────────────►│
     │                  │                    │                   │
     │                  │                    │   config content  │
     │                  │                    │ ◄────────────────│
     │                  │                    │                   │
     │                  │  { name, desc,     │                   │
     │                  │    agent: {...} }  │                   │
     │                  │ ◄──────────────────│                   │
     │                  │                    │                   │
     │  space info      │                    │                   │
     │ ◄────────────────│                    │                   │
```

### What If Config Changes?

Agent owner edits `.space/spaces.json` locally:

**Option 1: Agent calls sync**
```bash
POST /api/spaces/{spaceId}/sync
```
Agent Adapter re-reads config and updates cache.

**Option 2: Polling (Post-MVP)**
Agent Adapter periodically re-reads config.

**Option 3: File watcher (Post-MVP)**
Agent Adapter watches `.space/` directories for changes.

---

## Agent Types

### OpenClaw Adapter (MVP)

```typescript
class OpenClawAdapter implements AgentAdapter {
  private workspaceRoot: string;
  
  async createSpace(config: SpaceConfig): Promise<{ spaceId: string }> {
    // 1. Generate spaceId
    // 2. Create .space/ directory
    // 3. Write spaces.json
    // 4. Store mapping internally
    // 5. Return spaceId
  }
  
  async getFile(spaceId: string, path: string): Promise<FileContent> {
    const mapping = this.mapping.get(spaceId);
    const fullPath = join(mapping.workspaceRoot, mapping.spacePath, path);
    return fs.readFile(fullPath, 'utf-8');
  }
}
```

### Future: Claude Code Adapter (Hypothetical)

```typescript
class ClaudeCodeAdapter implements AgentAdapter {
  async getFile(spaceId: string, path: string): Promise<FileContent> {
    const mapping = this.mapping.get(spaceId);
    // Claude Code has different file structure
    const fullPath = join(mapping.projectRoot, mapping.spaceDir, path);
    return fs.readFile(fullPath, 'utf-8');
  }
}
```

---

## Benefits of This Architecture

### For Spaces Service
- Doesn't need to know about agent types
- Simple interface: just use spaceId
- Can support multiple agent types without changes

### For Agents
- Don't need to implement Spaces Service logic
- Just implement file operations
- Can have agent-specific config formats

### For Portability
- Agent Adapter can be replaced
- New agents just need adapter implementation
- Spaces Service remains unchanged

---

## Implementation Options

### Option 1: Separate Service
```
Spaces Service → Agent Adapter Service → Agents
```
- Agent Adapter is its own process
- Communicates via HTTP/WebSocket
- Pros: Can scale independently, supports multiple agents
- Cons: More complex deployment

### Option 2: Built-in Adapter (MVP)
```
Spaces Service (includes OpenClaw Adapter) → OpenClaw
```
- Agent Adapter code runs in Spaces Service
- Only supports OpenClaw
- Pros: Simpler deployment, good for MVP
- Cons: Can't support multiple agent types without code changes

### Recommendation
- **MVP:** Built-in OpenClaw Adapter
- **Post-MVP:** Extract to separate service for multiple agent types

---

## Related Documents

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system architecture
- [Space.md](./models/Space.md) - Space model
- [SessionContext.md](./models/SessionContext.md) - Agent session context
