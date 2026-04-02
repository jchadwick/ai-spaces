# Specification: Scoped Chat

**Epic:** 5 - Scoped Chat

---

## Basic Chat Interface

**User Story**  
Collaborators interact with the agent through a real-time chat sidebar to get answers about space content.

**Acceptance Checklist**

* [ ] Chat sidebar displays on right side with connection status
* [ ] User messages right-aligned with blue background, agent messages left-aligned with gray background
* [ ] Timestamp shown for each message (hover or always visible)
* [ ] Markdown content rendered in messages
* [ ] Message input clears after sending
* [ ] Message status shows "sending" then "sent"
* [ ] Connection status indicator: green dot (connected), red dot (disconnected), yellow dot (connecting)
* [ ] Chat auto-scrolls to new messages when scrolled to bottom
* [ ] Chat does NOT auto-scroll when user is scrolled up reading history
* [ ] Viewers see disabled message input with text: "Chat (view only - you cannot send messages)" or chat hidden entirely

**Rules**

* WebSocket connection at `wss://spaces.example.com/spaces/${spaceId}/ws?share=${token}`
* Messages sent via `chat.send` method
* Viewer role cannot send messages (Post-MVP)
* Chat history persistence, search, copy, export are Post-MVP

**Examples**

* User types message + presses Enter → message added to chat, input cleared, agent streams response
* WebSocket disconnects mid-session → show red dot with "Disconnected"
* User scrolled up reading history → new message arrives but view stays in place

---

## Streamed Responses

**User Story**  
Agent responses stream in real-time for a responsive chat experience.

**Acceptance Checklist**

* [ ] Text appears character-by-character or chunk-by-chunk with no initial delay
* [ ] Typing indicator shows "Agent is typing..." after 500ms if no chunks received yet
* [ ] Typing indicator hides when first chunk arrives
* [ ] Markdown renders progressively as chunks arrive
* [ ] Code blocks render when complete
* [ ] Lists render progressively as items stream in
* [ ] Connection interruption shows error: "Connection lost. Reconnecting..."
* [ ] Stream completion finalizes rendering and enables message actions (copy, retry)

**Rules**

* Server sends: `stream_start`, `stream_chunk`, `stream_end` events
* Client assembles chunks into message content
* Use `requestAnimationFrame` for updates
* Batch chunks <50ms before re-render
* Debounce markdown parsing
* Stop generation, regenerate, edit message, multi-modal are Post-MVP

**Examples**

* Chunks: "Here are the" → " options:\n\n1" → ". **Portland**" → user sees list forming in real-time
* No chunks for 500ms → typing indicator appears
* WebSocket disconnects → show reconnecting message, attempt reconnect, resume or restart stream

---

## Scoped Knowledge

**User Story**  
The agent only accesses files within the space, protecting private information outside.

**Acceptance Checklist**

* [ ] Agent reads all files in space directory
* [ ] Agent references file content in responses with quotes
* [ ] Agent refuses to read files outside space with message: "I don't have access to files outside this space."
* [ ] Agent does not load AGENTS.md, MEMORY.md, USER.md, or memory/ directory
* [ ] Agent refuses agent memory requests: "I don't have knowledge of your agent's private memory."
* [ ] `.space/SPACE.md` loaded as system prompt for space context
* [ ] Agent references space-specific context from SPACE.md
* [ ] Web search enabled when space config allows web_search
* [ ] Agent cites web sources when using external information
* [ ] Denied tools blocked with message: "I cannot perform that action in this space."

**Rules**

* Default denied tools: exec, messaging, spawn_agents, browser, credentials
* Default allowed tools: read, write (editor), edit (editor), glob, web_search (if enabled)
* Path validation ensures file operations stay within space root
* Context visible to collaborators only, not in agent memory

**Examples**

* User: "What did we decide about Maine?" → Agent: "According to Maine.md, you decided on Acadia National Park with a budget of $2,500 for lodging."
* User: "What's in Private/secrets.md?" → Agent: "I don't have access to files outside this space. I can only see files in the Vacations space."
* User: "What's the weather in Maine?" → Agent searches web, cites Weather.com, provides temperature info
* `.space/SPACE.md` contains preferences → Agent references "According to your space preferences..."

---

## Chat History

**User Story**  
Collaborators can view previous conversations to refer back to discussions.

**Acceptance Checklist**

* [ ] Previous messages visible after closing and reopening space
* [ ] Scroll position starts at bottom on history load
* [ ] Messages stored in `.space/chat-history.json`
* [ ] Sessions grouped by date with date header: "April 1, 2026"
* [ ] "Clear Conversation" shows prompt and deletes current session messages
* [ ] Agent loads history into context for reference
* [ ] Each share token creates isolated session
* [ ] History visible only to that session (not across collaborators)

**Rules**

* Storage path: `<space-root>/.space/chat-history.json`
* History includes session ID, started timestamp, token hash, messages
* Owner can view all history
* Collaborators see their own sessions only
* Search history, export, delete specific messages, history sync are Post-MVP

**Examples**

* User closes space, reopens → sees previous messages, scroll at bottom
* User: "What did we decide last time?" → Agent: "In our last conversation on March 30, you decided on Portland for the coastal option..."
* Two collaborators with different tokens → each sees only their own session history

---

## Agent File Modifications

**User Story**  
Editors can request the agent to update space files, with changes persisted and reflected in the file browser.

**Acceptance Checklist**

* [ ] Editors can request file modifications via chat
* [ ] Agent confirms changes made
* [ ] File browser updates immediately after modification
* [ ] Viewers receive message: "I cannot modify files as a viewer. Ask the owner to upgrade your role."
* [ ] Modified file shows "modified" badge temporarily
* [ ] File tree highlights modified file briefly
* [ ] Toast notification shows "[filename] updated"
* [ ] Agent warns if file is being edited: "[filename] is currently being edited. Please save or cancel your changes first."
* [ ] Modifications logged in `.space/history.json` with timestamp and session ID

**Rules**

* Tool hook checks: session scoped, path inside space, role is editor
* Path validation prevents writes outside space root
* File locks prevent concurrent modifications
* WebSocket broadcasts `file_modified` event after successful write

**Examples**

* User (editor): "Add 'Allie prefers beach destinations' to Maine.md" → Agent writes file, browser updates, toast shows "Maine.md updated"
* User (viewer): "Add note to Maine.md" → Agent: "I cannot modify files as a viewer. Ask the owner to upgrade your role."
* User editing Maine.md in browser → Agent tries to modify → warns about concurrent edit, waits for user to save

---

## Open Questions

* **Connection Retry Strategy:** What happens if WebSocket disconnects during stream? Resume from last chunk or restart entire response?
* **History Visibility:** Should collaborators see each other's chat history? Currently designed as no (isolated sessions per token).
* **Concurrent Edit Timeout:** How long should agent wait for user to save before giving up on modification?