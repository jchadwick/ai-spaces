# AI Spaces User Stories

Each story is in its own file. Stories are organized by epic.

---

## MVP Scope

**Version 0.1 (MVP)**:
- Space creation via API
- Share link generation (anonymous access)
- File browsing (read-only via WebSocket)
- File editing (full content, last-write-wins)
- Scoped chat with agent
- Anonymous access (no user accounts)

**Post-MVP**:
- User accounts with OAuth
- Real-time collaborative editing (Yjs CRDT)
- Chat history persistence
- File version history
- Multi-folder spaces

---

## Epic Index

| Epic | Description | MVP |
|------|-------------|-----|
| [1-space-discovery](./1-space-discovery.md) | Space creation and discovery | ✓ |
| [2-share-links](./2-share-links.md) | Share link management | ✓ |
| [3-authentication](./3-authentication.md) | Collaborator authentication | ✓ |
| [4-file-browser](./4-file-browser.md) | File browsing and viewing | ✓ |
| [5-scoped-chat](./5-scoped-chat.md) | Scoped agent chat | ✓ |
| [6-file-editing](./6-file-editing.md) | File editing | Post-MVP |
| [7-collaborative-editing](./7-collaborative-editing.md) | Real-time collaboration | Post-MVP |
| [8-user-accounts](./8-user-accounts.md) | User accounts with OAuth | Post-MVP |
| [9-error-handling](./9-error-handling.md) | Error states and edge cases | ✓ |

---

## Personas

See [personas.md](./personas.md) for detailed persona definitions.

### Primary: Agent Owner

Technical user running an AI agent. Wants to share specific portions of agent's knowledge.

**Goals**: Share easily, control access, keep private data private.

### Secondary: Collaborator

Non-technical user receiving a share link. Wants to view and contribute without setup.

**Goals**: Access easily, understand content, collaborate simply.

---

## Key Concepts

### Permissions vs Roles

**Permissions** (system-level):
- `read`: View files and directories
- `comment`: Chat with agent
- `edit`: Modify files
- `share`: Create/revoke share links

**Roles** (user-facing):

| Role | Permissions | Description |
|------|-------------|-------------|
| Viewer | `read`, `comment` | View-only access |
| Editor | `read`, `comment`, `edit` | Full collaboration |
| Admin | `read`, `comment`, `edit`, `share` | Manage shares |

### Data Storage

| Data | Storage | Owner |
|------|---------|-------|
| Space config | `.space/spaces.json` | Agent |
| Users, shares, sessions | Database | Spaces Service |
| Files | Workspace | Agent |

---

## Integration Points

All stories integrate with:

- **Spaces Service**: REST API for space/share management
- **WebSocket Server**: Real-time file/chat operations
- **Agent Adapter**: Interface to AI agent (OpenClaw MVP)