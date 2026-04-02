# Story: Concurrent Access

**Epic:** 7 - Error Handling  
**Priority:** Post-MVP  
**Story Points:** 8

---

## As the system

**I want** to handle multiple collaborators gracefully  
**So that** users don't conflict

---

## Acceptance Criteria

### AC1: Multiple Viewers Allowed
**Given** two collaborators with viewer role  
**When** both access space  
**Then**:
- Both can view files
- Both can chat with agent
- No conflicts

### AC2: Multiple Chatters Allowed
**Given** multiple collaborators (viewer or editor)  
**When** chatting  
**Then**:
- All see messages in real-time
- Agent responds to each collaborator
- Chat history shared (Post-MVP: per-session)

### AC3: Single Editor at a Time
**Given** one collaborator editing a file  
**When** another tries to edit  
**Then**:
- Show warning: "Currently being edited by another user"
- Option to view read-only copy
- Option to wait for edit to complete

**Locking mechanism:**
```
File: Vacations/Maine.md
Locked by: session-abc123
Expires: 5 minutes (auto-unlock)
```

### AC4: Presence Indicator
**Given** multiple collaborators active  
**When** viewing space  
**Then**:
- Show presence count: "3 people viewing"
- Show avatars if labels available
- Real-time updates

**UI:**
```
┌── Space: Family Vacations ─────────┐
│ 👤 You, 👤 Leah, 👤 Tom (3 active) │
└────────────────────────────────────┘
```

### AC5: Edit Notification
**Given** file being edited  
**When** changes saved  
**Then**:
- Notify other viewers: "Maine.md updated by Leah"
- Auto-refresh file view
- Show diff (Post-MVP)

### AC6: Conflict Resolution (CRDT)
**Given** CRDT implemented  
**When** two editors edit same file  
**Then**:
- Changes merge automatically
- No lost edits
- Highlight merged sections (optional)

### AC7: Edit Queue
**Given** no CRDT yet  
**When** editing in single-edit mode  
**Then**:
- Use edit queue (first come, first served)
- Show queue position: "2 people ahead of you"
- Notify when turn arrives

---

## Technical Notes

### Edit Lock File
```json
// .space/locks.json
{
  "Vacations/Maine.md": {
    "locked_by": "session-abc123",
    "locked_at": "2026-04-01T14:00:00Z",
    "expires": "2026-04-01T14:05:00Z"
  }
}
```

### Locking Protocol
```typescript
// Try to acquire lock
async function acquireLock(filePath: string, sessionId: string): Promise<boolean> {
  const lockFile = join(spacePath, '.space/locks.json');
  const locks = await readLocks(lockFile);
  
  if (locks[filePath]) {
    const lock = locks[filePath];
    if (new Date(lock.expires) > new Date()) {
      return false; // Locked
    }
  }
  
  // Acquire lock
  locks[filePath] = {
    locked_by: sessionId,
    locked_at: new Date().toISOString(),
    expires: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  };
  
  await writeLocks(lockFile, locks);
  return true;
}
```

### CRDT Implementation (Post-MVP)
Use Yjs for conflict-free editing:

```typescript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const ydoc = new YDoc();
const ytext = ydoc.getText('vacations-maine');

// Sync via WebSocket
const provider = new WebsocketProvider(
  'wss://spaces.example.com/spaces/Vacations',
  ydoc
);

// Apply changes
ytext.insert(0, 'Hello ');
ytext.insert(6, 'World');
```

---

## Out of Scope (Post-MVP)

- Real-time collaborative editing (Google Docs style) - requires CRDT
- Edit conflict manual resolution
- Edit history/undo across users
- Voice/video collaboration