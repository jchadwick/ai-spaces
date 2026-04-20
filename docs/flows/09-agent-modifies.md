# Flow: Agent Modifies File

**Actors:** Collaborator, Agent  
**Trigger:** Collaborator asks agent to modify file

---

## Happy Path (Editor Role)

```
[Collaborator]
   |
   | 1. Chatting with agent
   |    Role: Editor
   |
   v
[Collaborator requests modification]
   |
   | 2. "Add 'Allie prefers beach destinations' to Maine.md"
   |
   v
[Agent processes request]
   |
   | 3. Understand intent
   |    Determine file: Maine.md
   |    Determine action: append to file
   |
   v
[Agent calls tool]
   |
   | 4. { tool: "edit", 
   |      params: { 
   |        filePath: "Maine.md", 
   |        oldString: "## Options",
   |        newString: "## Options\n\nAllie prefers beach destinations."
   |      }
   |    }
   |
   v
[Tool hook validates]
   |
   | 5. Check: Is session scoped?
   |    Result: Yes (space:Vacations)
   |    Check: Is role editor?
   |    Result: Yes
   |    Check: Path inside space?
   |    Result: Yes
   |    Check: Tool allowed?
   |    Result: Yes (edit in allowedTools)
   |
   v
[Tool allowed]
   |
   | 6. Proceed with edit
   |
   v
[Agent modifies file]
   |
   | 7. Read Maine.md
   |    Apply edit
   |    Write Maine.md
   |
   v
[File updated]
   |
   | 8. Maine.md now contains new text
   |
   v
[Agent confirms]
   |
   | 9. Stream response: "I've added 'Allie prefers beach 
   |    destinations' to Maine.md under the Options section."
   |
   v
[WebSocket notifies clients]
   |
   | 10. Broadcast to all space sessions
   |     { event: "file_modified", 
   |       payload: { path: "Maine.md", modifiedBy: "agent" } }
   |
   v
[UI updates]
   |
   | 11. File browser shows "Maine.md (modified)"
   |     If viewing Maine.md: Show notification, reload content
   |
   v
[Modification logged]
   |
   | 12. Log to .space/history.json
   |     { file: "Maine.md", action: "modified", 
   |       by: "agent", timestamp: "..." }
   |
   v
[Flow complete]
```

---

## Happy Path (Viewer Role)

```
[Collaborator]
   |
   | 1. Chatting with agent
   |    Role: Viewer
   |
   v
[Collaborator requests modification]
   |
   | 2. "Add 'Allie prefers beach destinations' to Maine.md"
   |
   v
[Agent processes request]
   |
   | 3. Understand intent
   |    Determine action: modify file
   |
   v
[Agent calls tool]
   |
   | 4. { tool: "edit", 
   |      params: { filePath: "Maine.md", ... } }
   |
   v
[Tool hook validates]
   |
   | 5. Check: Is role editor?
   |    Result: No (role = viewer)
   |
   v
[Tool blocked]
   |
   | 6. Return error: "Viewers cannot modify files"
   |
   v
[Agent responds]
   |
   | 7. "I cannot modify files as a viewer. 
   |      Please ask the space owner to upgrade your role."
   |
   v
[Collaborator informed]
   |
   | 8. No file changes made
   |     No modifications logged
```

---

## Error Paths

### E1: Path Escape Attempt

```
[Collaborator]
   |
   | 1. "Update ../Private/secrets.md"
   |
   v
[Agent attempts write]
   |
   | 2. { tool: "edit", 
   |      params: { filePath: "../Private/secrets.md", ... } }
   |
   v
[Tool hook validates]
   |
   | 3. Resolve path: /home/user/.openclaw/workspace/Private/secrets.md
   |    Space root: /home/user/.openclaw/workspace/Vacations
   |    ERROR: Path escapes space
   |
   v
[Tool blocked]
   |
   | 4. Return error: "Path escapes space"
   |    Log security event
   |
   v
[Agent responds]
   |
   | 5. "I cannot access files outside this space."
   |
   v
[Collaborator informed]
```

### E2: Tool Not Allowed

```
[Collaborator]
   |
   | 1. "Execute this shell command: ls -la"
   |
   v
[Agent attempts exec]
   |
   | 2. { tool: "exec", params: { command: "ls -la" } }
   |
   v
[Tool hook validates]
   |
   | 3. Check: Tool in deniedTools?
   |    Result: Yes (exec is denied)
   |
   v
[Tool blocked]
   |
   | 4. Return error: "Tool 'exec' is not allowed in this space"
   |
   v
[Agent responds]
   |
   | 5. "I cannot execute shell commands in this space."
```

### E3: File Not Found

```
[Collaborator]
   |
   | 1. "Update nonexistent.md with new content"
   |
   v
[Agent attempts edit]
   |
   | 2. { tool: "edit", 
   |      params: { filePath: "nonexistent.md", ... } }
   |
   v
[Tool validates]
   |
   | 3. Path inside space: Yes
   |    Role is editor: Yes
   |    Tool allowed: Yes
   |
   v
[Agent reads file]
   |
   | 4. Read nonexistent.md
   |    ERROR: File not found
   |
   v
[Agent responds]
   |
   | 5. "The file nonexistent.md doesn't exist. 
   |      Would you like me to create it?"
   |
   v
[Collaborator decides]
   |
   | 6. "Yes, create it"
   |
   v
[Agent creates file]
   |
   | 7. { tool: "write", 
   |      params: { filePath: "nonexistent.md", content: "..." } }
   |
   v
[File created]
```

---

## Edge Cases

### EC1: Multiple Modifications

```
[Collaborator]
   |
   | 1. "Update Maine.md, CostaRica.md, and Budget.md"
   |
   v
[Agent processes]
   |
   | 2. Agent understands multiple file edits needed
   |
   v
[Agent edits sequentially]
   |
   | 3. Edit Maine.md → success
   |    Edit CostaRica.md → success
   |    Edit Budget.md → success
   |
   v
[Notifications sent]
   |
   | 4. Broadcast: { event: "file_modified", path: "Maine.md" }
   |    Broadcast: { event: "file_modified", path: "CostaRica.md" }
   |    Broadcast: { event: "file_modified", path: "Budget.md" }
   |
   v
[UI updates]
   |
   | 5. File browser shows 3 files modified
   |    Timestamps updated
```

### EC2: Concurrent User Edit

```
[Collaborator A]
   |
   | 1. Editing Maine.md in UI
   |    Has edit lock (Post-MVP)
   |
   v
[Collaborator B (via agent)]
   |
   | 2. "Update Maine.md"
   |
   v
[Agent attempts edit]
   |
   | 3. { tool: "edit", params: { filePath: "Maine.md", ... } }
   |
   v
[Edit lock check]
   |
   | 4. File locked by Collaborator A
   |    ERROR: File being edited
   |
   v
[Agent responds]
   |
   | 5. "Maine.md is currently being edited by another user. 
   |      Please wait for them to finish."
   |
   v
[Collaborator A saves]
   |
   | 6. Save file, release lock
   |
   v
[Collaborator B retries]
   |
   | 7. "Now update Maine.md"
   |    Agent edits successfully
```

### EC3: Large File Edit

```
[Collaborator]
   |
   | 1. "Add this 5MB text to bigfile.md"
   |
   v
[Agent attempts edit]
   |
   | 2. Edit would create file > 10MB
   |
   v
[Size check]
   |
   | 3. Resulting file exceeds limit
   |
   v
[Agent responds]
   |
   | 4. "The file would be too large (>10MB). 
   |      Please split into multiple files."
```

---

## Acceptance Tests

### Test 1: Edit File as Editor
```bash
# Connect as editor
TOKEN=$(create_editor_token)
wscat -c "ws://localhost:19000/spaces/Test/ws?share=$TOKEN"

# Send chat message
> {"type":"req","id":"1","method":"chat.send","params":{"message":"Add 'test note' to Test.md"}}
# Expected: Agent edits file, broadcasts modification
```

### Test 2: Edit File as Viewer
```bash
# Connect as viewer
TOKEN=$(create_viewer_token)

# Send chat message
> {"type":"req","id":"1","method":"chat.send","params":{"message":"Add 'test note' to Test.md"}}
# Expected: Agent refuses: "Viewers cannot modify files"
```

### Test 3: Path Escape
```bash
# Connect as editor
TOKEN=$(create_editor_token)

# Request outside-space file
> {"type":"req","id":"1","method":"chat.send","params":{"message":"Read ../Private/secrets.md"}}
# Expected: Agent refuses: "I cannot access files outside this space"
# Expected: Security log entry
```

---

## Timing

| Action | Duration |
|--------|----------|
| Chat message sent | < 100ms |
| Agent processing | 1-5s |
| Tool validation | < 10ms |
| File write | < 100ms |
| WebSocket broadcast | < 50ms |
| Total | 1-6s |

---

## Post-Conditions

- File modified on disk
- Modification logged in history
- All sessions notified
- File browser updated
- Agent confirms to user