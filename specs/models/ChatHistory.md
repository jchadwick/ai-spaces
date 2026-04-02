# Model: ChatHistory

**Purpose:** Store chat conversation history (Post-MVP)

**Storage:** `<space-directory>/.space/chat-history.json`

---

## Zod Schema

```typescript
import { z } from "zod";

export const ChatHistoryStoreSchema = z.object({
  sessions: z.record(ChatSessionSchema),
});

export const ChatSessionSchema = z.object({
  id: z.string(),
  started: z.string().datetime(),
  token: z.string(),
  messages: z.array(ChatMessageSchema),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.string().datetime(),
});

export type ChatHistoryStore = z.infer<typeof ChatHistoryStoreSchema>;
export type ChatSession = z.infer<typeof ChatSessionSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
```

---

## Fields

### `sessions` (root)

- **Type:** Record of `ChatSession` keyed by session ID
- **Description:** Map of sessions to their chat history
- **Key:** Unique session identifier

### `id` (ChatSession)

- **Type:** `string`
- **Description:** Unique identifier for this chat session
- **Example:** `"session-abc123"`

### `started` (ChatSession)

- **Type:** `string` (ISO 8601 datetime)
- **Description:** When this session started
- **Example:** `"2026-04-01T12:00:00Z"`

### `token` (ChatSession)

- **Type:** `string`
- **Description:** Hashed share token for this session
- **Purpose:** Ensures session isolation (different collaborators see different history)

### `messages` (ChatSession)

- **Type:** Array of `ChatMessage`
- **Description:** List of messages in this session (oldest first)

### `id` (ChatMessage)

- **Type:** `string`
- **Description:** Unique identifier for this message
- **Example:** `"msg-1"`

### `role` (ChatMessage)

- **Type:** `"user" | "assistant"`
- **Description:** Who sent the message
- **Values:**
  - `"user"`: Collaborator's message
  - `"assistant"`: Agent's response

### `content` (ChatMessage)

- **Type:** `string`
- **Description:** Message content (markdown supported)
- **Example:** `"What are the vacation options?"`

### `timestamp` (ChatMessage)

- **Type:** `string` (ISO 8601 datetime)
- **Description:** When this message was sent
- **Example:** `"2026-04-01T12:00:05Z"`

---

## Examples

### Single Session

```json
{
  "sessions": {
    "session-abc123": {
      "id": "session-abc123",
      "started": "2026-04-01T12:00:00Z",
      "token": "hash-of-share-token",
      "messages": [
        {
          "id": "msg-1",
          "role": "user",
          "content": "What are the vacation options?",
          "timestamp": "2026-04-01T12:00:05Z"
        },
        {
          "id": "msg-2",
          "role": "assistant",
          "content": "Based on the files in this space, there are 3 options:\n\n1. **Portland** - Coastal city\n2. **Acadia** - National park\n3. **Bar Harbor** - Touristy town",
          "timestamp": "2026-04-01T12:00:10Z"
        }
      ]
    }
  }
}
```

### Multiple Sessions

```json
{
  "sessions": {
    "session-abc123": {
      "id": "session-abc123",
      "started": "2026-04-01T12:00:00Z",
      "token": "hash-1",
      "messages": [...]
    },
    "session-def456": {
      "id": "session-def456",
      "started": "2026-04-02T10:00:00Z",
      "token": "hash-2",
      "messages": [...]
    }
  }
}
```

---

## Session Isolation

Each share token creates an isolated session:

- Different collaborators see different histories
- Sessions keyed by hashed share token
- Owner can view all sessions (Post-MVP)

**Privacy:** Collaborators cannot see each other's chat history.

---

## Storage Location

```
<space-directory>/
  .space/
    spaces.json
    history.json
    chat-history.json     ← ChatHistoryStore
```

---

## Related Models

- [Space](./Space.md) - Space containing chat history
- [SessionContext](./SessionContext.md) - Active session