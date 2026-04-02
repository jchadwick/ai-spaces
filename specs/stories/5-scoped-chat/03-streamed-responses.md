# Story: Streamed Responses

**Epic:** 5 - Scoped Chat  
**Priority:** MVP  
**Story Points:** 3

---

## As a collaborator

**I want** to see agent responses stream in real-time  
**So that** the interface feels responsive

---

## Acceptance Criteria

### AC1: Real-Time Streaming
**Given** agent is generating response  
**When** text is produced  
**Then**:
- Text appears character-by-character or chunk-by-chunk
- No delay before text appears
- Smooth animation

### AC2: Typing Indicator
**Given** agent is processing  
**When** no text has been streamed yet (>500ms)  
**Then**:
- Show typing indicator: "Agent is typing..."
- Animated dots: `Agent is typing...`
- Hide when first chunk arrives

### AC3: Progressive Rendering
**Given** response contains formatting  
**When** streaming  
**Then**:
- Markdown renders as it arrives
- Code blocks render when complete
- Lists render progressively

**Example:**
```
[Chunk 1] "Here are the"
[Chunk 2] " options:\n\n1"
[Chunk 3] ". **Portland**"
[Chunk 4] "\n2. **Acadia**"
```

User sees list forming in real-time.

### AC4: Connection Interruption
**Given** WebSocket disconnects mid-stream  
**When** connection lost  
**Then**:
- Show error: "Connection lost. Reconnecting..."
- Attempt reconnect
- Resume stream or restart

### AC5: Stream Complete
**Given** stream finishes  
**When** end event received  
**Then**:
- Finalize message rendering
- Enable message actions (copy, retry)
- Update chat state

---

## Technical Notes

### Streaming Protocol

Server streams chunks:

```json
{"type": "event", "event": "stream_start", "payload": {"id": "msg-123"}}
{"type": "event", "event": "stream_chunk", "payload": {"id": "msg-123", "content": "Here are "}}
{"type": "event", "event": "stream_chunk", "payload": {"id": "msg-123", "content": "the options:\n\n1. **Portland**"}}
{"type": "event", "event": "stream_chunk", "payload": {"id": "msg-123", "content": "\n2. **Acadia**"}}
{"type": "event", "event": "stream_end", "payload": {"id": "msg-123"}}
```

### Client Assembly

```typescript
interface StreamState {
  activeStreams: Map<string, string[]>;
}

function handleStreamEvent(event: StreamEvent) {
  switch (event.event) {
    case 'stream_start':
      state.activeStreams.set(event.payload.id, []);
      addMessage({ id: event.payload.id, content: '', status: 'streaming' });
      break;
      
    case 'stream_chunk':
      const chunks = state.activeStreams.get(event.payload.id);
      chunks.push(event.payload.content);
      updateMessage(event.payload.id, { content: chunks.join('') });
      break;
      
    case 'stream_end':
      state.activeStreams.delete(event.payload.id);
      updateMessage(event.payload.id, { status: 'complete' });
      break;
  }
}
```

### Rendering Optimization

- Use `requestAnimationFrame` for updates
- Batch chunks (<50ms) before re-render
- Debounce markdown parsing
- Use virtual scrolling for long messages

---

## Out of Scope (Post-MVP)

- Stop generation button
- Regenerate response
- Edit sent message
- Multi-modal (images, files) in chat