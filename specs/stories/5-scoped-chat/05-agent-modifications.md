# Story: Agent File Modifications

**Epic:** 5 - Scoped Chat  
**Priority:** MVP  
**Story Points:** 4

---

## As a collaborator

**I want** the agent to update space files when I ask  
**So that** changes are persisted

---

## Acceptance Criteria

### AC1: Editor Can Request Modifications
**Given** my role is editor  
**When** I ask agent to modify files  
**Then**:
- Agent can write to space files
- Agent confirms changes made
- File browser updates immediately

**Example:**
```
User: Add "Allie prefers beach destinations" to Maine.md
Agent: I've added that note to Maine.md under the Preferences section.
[File browser shows Maine.md modified]
```

### AC2: Viewer Cannot Request Modifications
**Given** my role is viewer  
**When** I ask agent to modify files  
**Then**:
- Agent refuses: "I cannot modify files as a viewer. Ask the owner to upgrade your role."
- No changes made

### AC3: File Update Feedback
**Given** agent modifies a file  
**When** modification complete  
**Then**:
- File shows "modified" badge
- File tree shows file highlighted briefly
- Toast: "Maine.md updated"

### AC4: Conflict Prevention
**Given** file is being edited by user  
**When** agent tries to modify same file  
**Then**:
- Agent warns: "Maine.md is currently being edited. Please save or cancel your changes first."
- No modification until user saves

### AC5: Modification Logging
**Given** agent modifies file  
**When** logged  
**Then** stored in `.space/history.json`:

```json
{
  "file": "Maine.md",
  "versions": [
    {
      "content": "# Maine Vacation\n...",
      "timestamp": "2026-04-01T14:30:00Z",
      "editedBy": "agent",
      "sessionId": "session-123"
    }
  ]
}
```

---

## Technical Notes

### Modification Flow
```
1. User: "Add a note to Maine.md"
2. Agent calls write tool
3. Tool hook checks: 
   - Is session scoped? Yes
   - Is path inside space? Yes
   - Is role editor? Yes
4. Agent writes file
5. Agent confirms success
6. WebSocket broadcasts update to file browser
```

### Tool Execution
```typescript
// Agent uses write tool
{
  "type": "tool_call",
  "tool": "write",
  "params": {
    "filePath": "Vacations/Maine.md",
    "content": "..."
  }
}

// Tool hook validates
function validateWrite(params, context) {
  const resolved = resolve(params.filePath);
  const spaceRoot = resolve(context.spacePath);
  
  if (!resolved.startsWith(spaceRoot)) {
    throw new Error(`Path escapes space: ${params.filePath}`);
  }
  
  if (context.role !== 'editor') {
    throw new Error('Viewers cannot modify files');
  }
  
  return true; // Allow write
}
```

### WebSocket Update
After successful modification:

```json
{
  "type": "event",
  "event": "file_modified",
  "payload": {
    "path": "Vacations/Maine.md",
    "action": "modified",
    "modifiedBy": "agent",
    "timestamp": "2026-04-01T14:30:00Z"
  }
}
```

UI receives update and refreshes file.

---

## Out of Scope (Post-MVP)

- Undo modifications
- File creation/deletion via chat
- Multi-file edits in one request
- Modification preview before confirming