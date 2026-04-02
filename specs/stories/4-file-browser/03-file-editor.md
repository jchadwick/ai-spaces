# Story: File Content Editor

**Epic:** 4 - File Browser  
**Priority:** Post-MVP  
**Story Points:** 8

---

## As an editor

**I want** to edit files directly in the browser  
**So that** I can contribute updates

---

## Acceptance Criteria

### AC1: Edit Mode Activation
**Given** I'm viewing a file and role = editor  
**When** I click "Edit" button  
**Then**:
- File switches to edit mode
- Markdown shows split view (edit + preview)
- Text files show code editor

### AC2: Markdown Split View
**Given** I'm editing a markdown file  
**When** in edit mode  
**Then**:
- Left: Raw markdown editor
- Right: Live preview
- Scroll synchronization

### AC3: Plain Text Editor
**Given** I'm editing a text file  
**When** in edit mode  
**Then**:
- Monospace code editor
- Line numbers
- Syntax highlighting (if applicable)

### AC4: Save Changes
**Given** I've made edits  
**When** I click "Save"  
**Then**:
- File uploaded to space
- Confirmation toast: "File saved"
- Agent sees changes immediately
- File tree updates modified time

### AC5: Cancel Edits
**Given** I've made edits  
**When** I click "Cancel"  
**Then**:
- Prompt: "Discard changes?"
- If yes: Revert to original content
- If no: Continue editing

### AC6: Auto-Save Draft
**Given** I'm editing  
**When** content changes  
**Then**:
- Auto-save to localStorage every 30 seconds
- On page refresh: Restore draft with prompt

### AC7: Concurrent Edit Protection
**Given** another editor is editing same file  
**When** I try to edit  
**Then**:
- Warning: "File is being edited by another user"
- Option: "View their changes" or "Edit anyway"
- If I edit anyway: Last save wins (CRDT comes later)

### AC8: Conflict Resolution (CRDT)
**Given** CRDT is implemented  
**When** two editors edit same file  
**Then**:
- Changes merge automatically
- No lost edits
- Show merged sections with highlight (optional)

---

## Technical Notes

### Editor Component
Use `@uiw/react-md-editor` for markdown:

```typescript
import MDEditor from '@uiw/react-md-editor';

function MarkdownEditor({ content, onChange, readOnly }) {
  return (
    <MDEditor
      value={content}
      onChange={onChange}
      preview={readOnly ? 'preview' : 'edit'}
      height={600}
    />
  );
}
```

### Save Flow
```
1. User clicks Save
2. Content validated (size <10MB)
3. WebSocket message sent to agent
4. Agent writes file
5. Agent confirms success
6. UI shows confirmation
```

### WebSocket Save Message
```json
{
  "type": "req",
  "id": "uuid",
  "method": "file.write",
  "params": {
    "path": "Vacations/Maine.md",
    "content": "# Updated content..."
  }
}
```

### Agent Response
```json
{
  "type": "res",
  "id": "uuid",
  "result": {
    "success": true,
    "path": "Vacations/Maine.md",
    "modified": "2026-04-01T14:30:00Z"
  }
}
```

### Conflict Detection (Pre-CRDT)
```typescript
// Simple version vector
interface FileVersion {
  path: string;
  version: number;
  modified: string;
  checksum: string;
}

// On edit start, get current version
// On save, check if version matches
// If not, show conflict warning
```

### CRDT Integration (Post-MVP)
Use Yjs for conflict-free editing:

```typescript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const ydoc = new YDoc();
const ytext = ydoc.getText('content');
const provider = new WebsocketProvider(
  'wss://spaces.example.com/spaces/Vacations',
  ydoc
);
```

---

## Out of Scope (Post-MVP)

- Multi-file editing
- Find and replace
- File upload
- Create new files
- Delete files