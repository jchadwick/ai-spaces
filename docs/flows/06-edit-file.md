# Flow: Edit File

**Actors:** Collaborator (Editor role)  
**Trigger:** Collaborator clicks "Edit" button on file  
**Priority:** Post-MVP

---

## Happy Path

```
[Collaborator]
   |
   | 1. Viewing Maine.md in read mode
   |
   v
[Read mode displayed]
   |
   | ┌── Maine.md ──────────────[Edit]─┐
   | │ # Maine Vacation                  │
   | │                                  │
   | │ ## Options                        │
   | │                                  │
   | │ 1. Portland - Coastal             │
   | │ 2. Acadia - National Park         │
   | └──────────────────────────────────┘
   |
   v
[Collaborator clicks Edit]
   |
   | 2. Click "Edit" button
   |
   v
[UI switches to edit mode]
   |
   | 3. File content loaded into editor
   |    Role checked (must be editor)
   |    Edit lock acquired
   |
   v
[Edit mode displayed]
   |
   | ┌── Maine.md ──────[Save] [Cancel]─┐
   | │ ┌─────────────────────────────┐  │
   | │ │ # Maine Vacation           │  │
   | │ │                             │  │
   | │ │ ## Options                  │  │
   | │ │                             │  │
   | │ │ 1. Portland - Coastal       │  │
   | │ │ 2. Acadia - National Park   │  │
   | │ └─────────────────────────────┘  │
   | └──────────────────────────────────┘
   |
   v
[Collaborator makes edits]
   |
   | 4. Change content
   |    Add: "3. Bar Harbor - Touristy"
   |
   v
[Draft auto-saved locally]
   |
   | 5. Auto-save to localStorage every 30s
   |
   v
[Collaborator clicks Save]
   |
   | 6. Click "Save" button
   |
   v
[UI validates]
   |
   | 7. Check file size (< 10MB)
   |    Check path (inside space)
   |    Check role (editor)
   |
   v
[UI sends update]
   |
   | 8. WebSocket message
   |    { type: "req", method: "files.write", 
   |      params: { path: "Maine.md", content: "..." } }
   |
   v
[Server validates]
   |
   | 9. Path validation
   |    Role validation
   |    Edit lock check
   |
   v
[Agent writes file]
   |
   | 10. Write to disk
   |     Log modification
   |
   v
[Server confirms]
   |
   | 11. { type: "res", result: { success: true } }
   |
   v
[UI updates]
   |
   | 12. Show confirmation toast
   |     "File saved"
   |     File browser shows "modified" timestamp
   |
   v
[Other users notified]
   |
   | 13. WebSocket broadcast
   |     { event: "file_modified", path: "Maine.md" }
   |
   v
[Flow complete]
```

---

## Error Paths

### E1: Viewer Role Edit Attempt

```
[Collaborator (Viewer role)]
   |
   | 1. Viewing Maine.md
   |    Role = viewer
   |
   v
[Edit button disabled]
   |
   | ┌── Maine.md ───────[View Only]───┐
   | │ # Maine Vacation                  │
   | │ ...                               │
   | └──────────────────────────────────┘
   |
   v
[Message shown]
   |
   | "You're viewing this space.
   |    Ask the owner for edit access."
```

### E2: File Too Large

```
[Collaborator]
   |
   | 1. Editing large file (> 10MB)
   |
   v
[Save attempt]
   |
   | 2. Click "Save"
   |
   v
[Validation fails]
   |
   | 3. File size > 10MB
   |
   v
[Error shown]
   |
   | ┌── Error ───────────────────┐
   | │ ⚠️ File Too Large             │
   | │                              │
   | │ This file exceeds the 10MB   │
   | │ limit for editing.            │
   | │                              │
   | │ [Download File]              │
   | │ [Cancel]                     │
   | └──────────────────────────────┘
```

### E3: Edit Conflict (Single-Edit Mode)

```
[Collaborator A]
   |
   | 1. Editing Maine.md
   |    Lock acquired
   |
   v
[Collaborator B]
   |
   | 2. Tries to edit Maine.md
   |
   v
[Lock check fails]
   |
   | 3. File locked by Collaborator A
   |
   v
[Conflict shown]
   |
   | ┌── Conflict ─────────────────┐
   | │ ⚠️ File Being Edited          │
   | │                              │
   | │ Maine.md is currently being │
   | │ edited by another user.      │
   | │                              │
   | │ [View Read-Only]             │
   | │ [Wait for Edit to Complete] │
   | └──────────────────────────────┘
   |
   v
[Collaborator B waits]
   |
   | 4. Waits for Collaborator A to save
   |
   v
[Collaborator A saves]
   |
   | 5. Lock released
   |    Collaborator B notified: "Maine.md is now available"
   |
   v
[Collaborator B edits]
```

### E4: WebSocket Disconnect

```
[Collaborator]
   |
   | 1. Editing file, unsaved changes
   |    Connection drops
   |
   v
[Disconnect detected]
   |
   | 2. WebSocket closes
   |    UI shows: "Disconnected"
   |
   v
[Auto-save to localStorage]
   |
   | 3. Draft saved locally: "Draft saved locally"
   |
   v
[Reconnection]
   |
   | 4. WebSocket reconnects
   |    UI shows: "Connected"
   |    Toast: "Draft restored"
   |
   v
[Changes preserved]
```

---

## Edge Cases

### EC1: Cancel Edit

```
[Collaborator]
   |
   | 1. Editing Maine.md, made changes
   |
   v
[Click Cancel]
   |
   | 2. Click "Cancel" button
   |
   v
[Prompt shown]
   |
   | ┌── Discard Changes? ────────┐
   | │ You have unsaved changes.   │
   | │                              │
   | │ Discard them?                │
   | │                              │
   | │ [Yes, Discard]               │
   | │ [No, Keep Editing]           │
   | └──────────────────────────────┘
   |
   v
[Discard chosen]
   |
   | 3. Revert to original content
   |    Discard localStorage draft
   |    Return to read mode
```

### EC2: Auto-Save Draft

```
[Collaborator]
   |
   | 1. Editing, changes made
   |    No save yet
   |
   v
[Auto-save every 30s]
   |
   | 2. localStorage.setItem('draft_Maine.md', content)
   |
   v
[Toast shown]
   |
   | "Draft saved locally" (briefly)
   |
   v
[Browser refreshed]
   |
   | 3. Refresh page
   |
   v
[Draft restored]
   |
   | 4. Check localStorage
   |    Prompt: "Restore unsaved draft?"
   |    If yes: Load draft into editor
```

### EC3: Markdown Preview

```
[Collaborator]
   |
   | 1. Editing Maine.md
   |
   v
[Split view]
   |
   | ┌── Edit ────────────────┐ Preview ──────────┐
   | │ # Maine Vacation       │ # Maine Vacation   │
   | │                        │                    │
   | │ ## Options             │ ## Options         │
   | │ 1. Portland            │ 1. Portland        │
   | └────────────────────────┴────────────────────┘
   |
   v
[Real-time preview]
   |
   | 2. Changes reflected in preview pane
   |
   v
[Confirm with preview]
```

---

## Acceptance Tests

### Test 1: Basic Edit
```bash
# Connect as editor
TOKEN=$(create_editor_token)

# Open file
wscat -c "..."
> {"type":"req","id":"1","method":"files.read","params":{"path":"Test.md"}}
< {"type":"res","id":"1","result":{"content":"# Original\n"}}

# Edit file
> {"type":"req","id":"2","method":"files.write","params":{"path":"Test.md","content":"# Updated\n"}}
< {"type":"res","id":"2","result":{"success":true}}

# Verify
> {"type":"req","id":"3","method":"files.read","params":{"path":"Test.md"}}
< {"type":"res","id":"3","result":{"content":"# Updated\n"}}
```

### Test 2: Viewer Cannot Edit
```bash
# Connect as viewer
TOKEN=$(create_viewer_token)

# Attempt edit
> {"type":"req","id":"1","method":"files.write","params":{"path":"Test.md","content":"..."}}
< {"type":"res","id":"1","error":"Viewers cannot modify files"}
```

---

## Timing

| Action | Duration |
|--------|----------|
| Switch to edit mode | < 500ms |
| Load into editor | < 200ms |
| Preview update | < 50ms (real-time) |
| Save to server | < 1s |
| Confirmation | < 2s |

---

## Post-Conditions

- File modified on disk
- Modification logged in history
- File browser updated
- Other users notified
- LocalStorage draft cleared