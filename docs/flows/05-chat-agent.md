# Flow: Chat with Agent

**Actors:** Collaborator, Agent  
**Trigger:** Collaborator types message in chat

---

## Happy Path

```
[Collaborator]
   |
   | 1. View space, chat sidebar visible
   |
   v
[Chat UI ready]
   |
   | ┌── Chat ───────────────────┐
   | │ Status: ● Connected        │
   | │                            │
   | │ [Agent] Welcome! I can help│
   | │ you explore this space.    │
   | │                            │
   | │ [You] ┌─────────────────┐  │
   | │       │ Type message...│  │
   | │       └─────────────────┘  │
   | │       [Send]               │
   | └────────────────────────────┘
   |
   v
[Collaborator types message]
   |
   | 2. "What are the vacation options?"
   |
   v
[Collaborator presses Enter]
   |
   | 3. Message sent via WebSocket
   |    { type: "req", method: "chat.send", params: { message: "?" } }
   |
   v
[UI updates]
   |
   | 4. Add user message to chat
   |    Show as "sending..."
   |
   | ┌── Chat ───────────────────┐
   | │ [You] What are the        │
   | │      vacation options?     │
   | │      ● Sending...          │
   | └────────────────────────────┘
   |
   v
[Server receives]
   |
   | 5. Validate session
   |    Create scoped agent context
   |
   v
[Agent processes]
   |
   | 6. Read space files (Maine.md, CostaRica.md)
   |    Generate response based on content
   |    Stream response chunks
   |
   v
[Server streams response]
   |
   | 7. Send chunks via WebSocket
   |    { type: "event", event: "stream_start", payload: { id: "msg-2" } }
   |    { type: "event", event: "stream_chunk", payload: { content: "There are" } }
   |    { type: "event", event: "stream_chunk", payload: { content: " 3 options:" } }
   |    ...
   |
   v
[UI streams text]
   |
   | 8. Render chunks as they arrive
   |
   | ┌── Chat ───────────────────┐
   | │ [You] What are the        │
   | │      vacation options?     │
   | │                            │
   | │ [Agent] There are 3        │
   | │        options:            │
   | │        1. Portland...      │
   | └────────────────────────────┘
   |
   v
[Stream completes]
   |
   | 9. Finalize message
   |    Mark as "sent" in user message
   |
   | ┌── Chat ───────────────────┐
   | │ [You] What are the        │
   | │      vacation options?     │
   | │                            │
   | │ [Agent] There are 3        │
   | │        options:             │
   | │        1. Portland -       │
   | │           Coastal city     │
   | │        2. Acadia -        │
   | │           National park    │
   | │        3. Bar Harbor -    │
   | │           Touristy town   │
   | │                            │
   | │ [You] ┌─────────────────┐  │
   | │       │ Type message...│  │
   | └────────────────────────────┘
   |
   v
[Flow complete]
```

---

## Error Paths

### E1: Agent Denied Tool Access

```
[Collaborator]
   |
   | 1. "Read file ../Private/secrets.md"
   |
   v
[Agent attempts read]
   |
   | 2. Call read tool with path: "../Private/secrets.md"
   |
   v
[Tool hook blocks]
   |
   | 3. Path escape detected
   |    Return error to agent
   |
   v
[Agent responds]
   |
   | 4. "I cannot access files outside this space.
   |      I'm only able to read files within the Vacations space."
   |
   v
[UI shows response]
   |
   | [Agent] I cannot access files outside
   |         this space. I'm only able to
   |         read files within the Vacations
   |         space.
```

### E2: Agent Denied Web Search

```
[Collaborator]
   |
   | 1. "What's the weather in Maine?"
   |
   v
[Agent attempts web_search]
   |
   | 2. Call web_search tool
   |
   v
[Tool hook checks]
   |
   | 3. Space config:
   |    { "agent": { "capabilities": ["read", "write"] } }
   |    web_search NOT in capabilities
   |
   v
[Tool blocked]
   |
   | 4. Tool not allowed
   |    Return error to agent
   |
   v
[Agent responds]
   |
   | 5. "I cannot search the web in this space.
   |      I can only read files within Vacations."
   |
   v
[Owner updates config]
   |
   | 6. Owner adds "web_search" to capabilities
   |    Agent retries, succeeds
```

### E3: WebSocket Disconnects

```
[Collaborator]
   |
   | 1. Chatting, connection drops
   |
   v
[WebSocket closes]
   |
   | 2. onclose event fired
   |
   v
[UI shows disconnected]
   |
   | ┌── Chat ───────────────────┐
   | │ Status: 🔴 Disconnected    │
   | │                            │
   | │ ⚠️ Connection lost          │
   | │ Reconnecting...            │
   | └────────────────────────────┘
   |
   v
[Client reconnects]
   |
   | 3. Attempt reconnect
   |    Use stored token from localStorage
   |
   v
[Reconnected]
   |
   | 4. WebSocket re-established
   |    Status: ● Connected
   |    Show last few messages
   |
   v
[Chat restored]
```

### E4: Agent Timeout

```
[Collaborator]
   |
   | 1. Send message requiring long processing
   |
   v
[Agent processing]
   |
   | 2. Time passes ( > 30 seconds)
   |
   v
[UI shows typing indicator]
   |
   | 3. "Agent is typing..."
   |    Spinner shown
   |
   v
[Timeout]
   |
   | 4. Timeout after 60 seconds
   |
   v
[Agent responds]
   |
   | 5. "I'm taking longer than expected.
   |      Please try again or simplify your request."
   |
   v
[User retries]
```

---

## Edge Cases

### EC1: Reference File Content

```
[Collaborator]
   |
   | 1. "What did we decide about Portland?"
   |
   v
[Agent reads file]
   |
   | 2. Read Maine.md
   |    Extract relevant content
   |
   v
[Agent responds]
   |
   | 3. "According to Maine.md, you decided on
   |      **Portland** as the coastal option with
   |      a budget of $2,000 for lodging."
   |
   v
[File referenced]
   |
   | 4. Click on "Maine.md" to view file
```

### EC2: Modify File

```
[Collaborator (Editor role)]
   |
   | 1. "Add 'Allie prefers beach destinations' to Maine.md"
   |
   v
[Agent writes file]
   |
   | 2. Call write tool
   |    Path: Maine.md
   |    Append note
   |
   v
[Tool hook validates]
   |
   | 3. Check: role is editor
   |    Check: path inside space
   |    Both valid
   |
   v
[File modified]
   |
   | 4. File written
   |    File browser updates: "Maine.md (modified)"
   |
   v
[Agent confirms]
   |
   | 5. "I've added that note to Maine.md."
```

### EC3: Viewer Role Limitation

```
[Collaborator (Viewer role)]
   |
   | 1. "Update the budget in Maine.md"
   |
   v
[Agent attempts write]
   |
   | 2. Call write tool
   |    Path: Maine.md
   |
   v
[Tool hook blocks]
   |
   | 3. Check: role is viewer
   |    ERROR: Viewers cannot modify files
   |
   v
[Agent responds]
   |
   | 4. "I cannot modify files as a viewer.
   |      Ask the owner to upgrade your role to editor."
```

---

## Acceptance Tests

### Test 1: Basic Chat
```bash
# Connect WebSocket
wscat -c "ws://localhost:18789/spaces/Test/ws?share=$TOKEN"

# Send message
> {"type":"req","id":"1","method":"chat.send","params":{"message":"Hello"}}
# Expected: Streamed response from agent
```

### Test 2: File Access
```bash
# Ask about file content
> {"type":"req","id":"2","method":"chat.send","params":{"message":"What's in Test.md?"}}
# Expected: Agent reads file, responds with content
```

### Test 3: Tool Denial
```bash
# Attempt blocked tool
> {"type":"req","id":"3","method":"chat.send","params":{"message":"Execute command"}}
# Expected: Agent refuses or tool hook blocks
```

---

## Timing

| Action | Duration |
|--------|----------|
| Message send | < 100ms |
| Agent acknowledgment | < 500ms |
| First response chunk | < 2s |
| Complete response | varies (streaming) |
| Path validation | < 10ms |

---

## Post-Conditions

- Message in chat history
- Agent response visible
- Files may be modified (if editor)
- Tools called logged (if verbose)