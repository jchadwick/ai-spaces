# Story: Basic Chat Interface

**Epic:** 5 - Scoped Chat  
**Priority:** MVP  
**Story Points:** 4

---

## As a collaborator

**I want** to chat with the agent about the space  
**So that** I can get answers and clarifications

---

## Acceptance Criteria

### AC1: Chat Sidebar
**Given** I access a space  
**When** the UI loads  
**Then** I see a chat sidebar on the right:

```
┌── Chat ──────────────────────────┐
│ Status: ● Connected               │
│                                  │
│ [Agent] Welcome! I can help you  │
│ explore this space. Ask me about  │
│ the vacation plans.               │
│                                  │
│ [You] What are the options?       │
│                                  │
│ [Agent] There are 3 options:      │
│ 1. Portland (coastal)            │
│ 2. Acadia (nature)               │
│ 3. Bar Harbor (touristy)         │
│                                  │
│ [You] ┌───────────────────────┐  │
│       │ Type a message...     │  │
│       └───────────────────────┘  │
│       [Send]                     │
└──────────────────────────────────┘
```

### AC2: Message Display
**Given** messages exist  
**When** displayed  
**Then**:
- User messages: Right-aligned, blue background
- Agent messages: Left-aligned, gray background
- Timestamp shown (hover or always)
- Markdown rendered in messages

### AC3: Send Message
**Given** I type a message  
**When** I press Enter or click Send  
**Then**:
- Message added to chat
- Input cleared
- Message shows as "sending" then "sent"
- Agent response streams in

### AC4: Streamed Responses
**Given** agent is responding  
**When** streaming  
**Then**:
- Characters appear in real-time
- Typing indicator while processing
- No "waiting..." spinner after 2 seconds

### AC5: Connection Status
**Given** chat sidebar is open  
**When** WebSocket connection changes  
**Then**:
- Connected: Green dot, "Connected"
- Disconnected: Red dot, "Disconnected"
- Connecting: Yellow dot, "Connecting..."

### AC6: Auto-Scroll
**Given** new messages arrive  
**When** chat is scrolled to bottom  
**Then** auto-scroll to show new message

**When** chat is scrolled up (reading history)  
**Then** don't auto-scroll (stay in place)

### AC7: Disabled State (Post-MVP)
**Given** my role is viewer  
**When** I see chat  
**Then**:
- Message input disabled
- Text: "Chat (view only - you cannot send messages)"
- Or: Chat not shown at all

---

## Technical Notes

### WebSocket Connection
```javascript
const ws = new WebSocket(
  `wss://spaces.example.com/spaces/${spaceId}/ws?share=${token}`
);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'event' && data.event === 'chat') {
    addMessage(data.payload);
  }
};

ws.send(JSON.stringify({
  type: 'req',
  id: uuid(),
  method: 'chat.send',
  params: {
    message: '...'
  }
}));
```

### Message Structure
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
}
```

### Streaming Protocol
Server sends chunks:

```json
{"type": "stream_start", "id": "msg-123"}
{"type": "stream_chunk", "id": "msg-123", "content": "There are "}
{"type": "stream_chunk", "id": "msg-123", "content": "3 options..."}
{"type": "stream_end", "id": "msg-123"}
```

Client assembles chunks into message.

---

## Out of Scope (Post-MVP)

- Chat history persistence
- Search past messages
- Copy message text
- Export conversation