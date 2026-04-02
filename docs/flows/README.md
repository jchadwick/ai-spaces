# User Flows

Each flow describes a complete user journey from start to finish.

## Flow Index

| Flow | Description | Actors | MVP |
|------|-------------|--------|-----|
| [01-create-space.md](./01-create-space.md) | Owner creates a new space | Owner | ✓ |
| [02-share-space.md](./02-share-space.md) | Owner shares space with collaborator | Owner | ✓ |
| [03-collaborator-access.md](./03-collaborator-access.md) | Collaborator accesses space | Collaborator | ✓ |
| [04-browse-files.md](./04-browse-files.md) | Collaborator browses space files | Collaborator | ✓ |
| [05-chat-agent.md](./05-chat-agent.md) | Collaborator chats with agent | Collaborator | ✓ |
| [06-edit-file.md](./06-edit-file.md) | Collaborator edits file | Collaborator (Editor) | Post-MVP |
| [07-revoke-share.md](./07-revoke-share.md) | Owner revokes share link | Owner | ✓ |
| [08-expired-link.md](./08-expired-link.md) | Collaborator link expires | Collaborator | ✓ |
| [09-agent-modifies.md](./09-agent-modifies.md) | Agent modifies file in space | Agent, Collaborator | ✓ |

---

## Flow Notation

Each flow uses:

- **Actor**: Who performs the action
- **UI**: What the user sees
- **System**: What happens automatically
- **Decision**: Branching points
- **Error**: Error handling

---

## Happy Path vs Error Paths

Each flow includes:

1. **Happy Path**: Expected flow without errors
2. **Error Paths**: What happens when things go wrong
3. **Edge Cases**: Unusual scenarios