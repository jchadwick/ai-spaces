# Data Models

Core data structures for AI Spaces.

## Model Index

| Model | Description | Storage |
|-------|-------------|---------|
| [SpaceConfig.md](./SpaceConfig.md) | Space configuration file | `.space/spaces.json` in folder |
| [Space.md](./Space.md) | Space metadata | Database `spaces` table |
| [Share.md](./Share.md) | Share link | Database `shares` table |
| [User.md](./User.md) | User account | Database `users` table |
| [Session.md](./Session.md) | Active session | Database `sessions` table |
| [SessionContext.md](./SessionContext.md) | Scoped agent session | In-memory (agent adapter) |
| [FileHistory.md](./FileHistory.md) | Edit history | Database `file_history` table (Post-MVP) |
| [ChatHistory.md](./ChatHistory.md) | Chat history | Database `chat_messages` table (Post-MVP) |
| [AuditLog.md](./AuditLog.md) | Security audit log | Database `audit_log` table |

---

## Storage Architecture

### Spaces Service Database
- **Users**: User accounts, OAuth IDs, sessions
- **Spaces**: Space metadata synced from agent
- **Shares**: Share tokens, roles, permissions
- **Sessions**: Active WebSocket connections
- **Audit Log**: All security-relevant actions
- **Chat History**: Chat messages (Post-MVP)

### Agent Workspace
- **Space Config**: `.space/spaces.json` (travels with folder)
- **Space Context**: `.space/SPACE.md` (agent instructions)
- **Files**: Actual content in the space directory

---

## Key Relationships

```
User (optional, for OAuth)
  │
  └─> Share
        │
        └─> Space
              │
              ├─> .space/spaces.json (in agent workspace)
              │
              └─> Session
                     │
                     └─> Agent Session (via adapter)
```

**Note**: MVP does not require user accounts. Shares can be anonymous.