# Story: Chat History

**Epic:** 5 - Scoped Chat  
**Priority:** Post-MVP  
**Story Points:** 3

---

## As a collaborator

**I want** to see my previous conversations  
**So that** I can refer back to discussions

---

## Acceptance Criteria

### AC1: Persist Chat History
**Given** I have a conversation  
**When** I close and reopen the space  
**Then**:
- Previous messages visible
- Scroll position at bottom
- Messages loaded from storage

### AC2: History Storage
**Given** chat history needs storage  
**When** messages sent/received  
**Then** stored in `.space/chat-history.json`:

```json
{
  "sessions": {
    "session-uuid": {
      "started": "2026-04-01T12:00:00Z",
      "token": "abc123...",
      "messages": [
        {
          "id": "msg-1",
          "role": "user",
          "content": "What are the options?",
          "timestamp": "2026-04-01T12:00:05Z"
        },
        {
          "id": "msg-2",
          "role": "assistant",
          "content": "There are 3 options:\n1. Portland...",
          "timestamp": "2026-04-01T12:00:10Z"
        }
      ]
    }
  }
}
```

### AC3: Session Grouping
**Given** multiple chat sessions  
**When** viewing history  
**Then**:
- Each session grouped separately
- Session date shown: "April 1, 2026"
- Messages within session continuous

**UI:**
```
─ April 1, 2026 ─
[You] What are the options?
[Agent] ...

─ March 30, 2026 ─
[You] Did we decide on Maine?
[Agent] ...
```

### AC4: Clear Conversation
**Given** I want to start fresh  
**When** I click "Clear Conversation"  
**Then**:
- Prompt: "Clear this conversation? History will be removed."
- If yes: Delete current session messages
- File browser unaffected

### AC5: History Loading
**Given** history exists in `.space/chat-history.json`  
**When** agent loads space context  
**Then**:
- History loaded into context
- Agent can reference past discussions

**Example:**
```
User: What did we decide last time?
Agent: In our last conversation on March 30, you decided on Portland for 
the coastal option with a budget of $2,000.
```

---

## Technical Notes

### Storage Location
Chat history stored per-space, not per-user:
- Path: `<space-root>/.space/chat-history.json`
- Owner can view all history
- Collaborators see their own sessions

### Privacy Consideration
**Q:** Should collaborators see each other's history?  
**A:** No. Each share token creates isolated session. History only visible to that session.

### Implementation
```typescript
interface ChatHistory {
  sessions: Map<string, ChatSession>;
}

interface ChatSession {
  id: string;
  started: Date;
  token: string; // Share token (hashed)
  messages: Message[];
}

async function saveHistory(space: Space, session: ChatSession) {
  const historyPath = join(space.path, '.space/chat-history.json');
  let history = await loadHistory(historyPath);
  history.sessions.set(session.id, session);
  await writeFile(historyPath, JSON.stringify(history, null, 2));
}

async function loadHistoryForToken(space: Space, token: string) {
  const history = await loadHistory(join(space.path, '.space/chat-history.json'));
  const tokenHash = hashToken(token);
  
  return Array.from(history.sessions.values())
    .filter(s => s.token === tokenHash);
}
```

---

## Out of Scope (Post-MVP)

- Search history
- Export history (PDF, markdown)
- Delete specific messages
- History sync across devices