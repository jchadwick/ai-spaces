# Specification: File Browser

**Epic:** 4 - File Browser

---

## Browse Space Contents

**User Story**  
Browse all files and folders in the space to explore what the agent knows.

**Acceptance Checklist**

* [ ] File tree displays on left side of UI
* [ ] Clicking a folder expands it to show contents with icon change (📁 → 📂)
* [ ] Expanded folder state persists during session
* [ ] Nested folders display with proper indentation
* [ ] Infinite scroll supports deeply nested folders
* [ ] Clicking a file highlights it in tree and loads content in main view
* [ ] File path shown in header when selected
* [ ] Hidden files (starting with `.`) visible with different styling (gray, italic)
* [ ] `.space/` directory shown differently than regular folders
* [ ] Empty folders show "(empty)" text
* [ ] Binary files show appropriate icons (🖼️, 📄, 📊)
* [ ] Clicking binary files opens preview/download
* [ ] Breadcrumb shows full path (e.g., "Vacations / Budget / notes.md")
* [ ] Clicking breadcrumb segment navigates to that folder

**Rules**

* Files loaded lazily: root level immediately, folders on expand
* Loaded folders cached during session
* Role-based visibility affects `.space/` access:
  * Viewer/Editor: `.space/` visible
  * Admin: Full access to `.space/` contents
* Max file size for preview: 10MB
* WebSocket updates file tree when agent modifies files

**Examples**

* Folder `Vacations/` with `Maine.md` and `CostaRica.md` → expands to show both files
* Empty folder `Archive/` → displays "(empty)"
* File `Vacations/Budget/notes.md` → breadcrumb shows "Vacations / Budget / notes.md"

---

## View File Contents

**User Story**  
View file contents to read the agent's research.

**Acceptance Checklist**

* [ ] Markdown files render with proper styling (headings, lists, links)
* [ ] Images in markdown display inline
* [ ] Code blocks in markdown have syntax highlighting
* [ ] Plain text files (`.txt`, `.csv`) display in monospace font
* [ ] Plain text files allow horizontal scroll (no wrapping)
* [ ] Images display inline with max-width 100% of container
* [ ] Images have zoom controls (fit to screen, 100%)
* [ ] Unsupported file types show "Cannot preview" message with file info and download button
* [ ] File header shows filename and modified date
* [ ] Files > 1MB show loading indicator and stream content
* [ ] Large files truncate with "Load more" button
* [ ] File path displayed with icon (e.g., "📄 Vacations/Maine.md")
* [ ] Clicking file path copies it to clipboard with toast confirmation

**Rules**

* Use `react-markdown` with `remark-gfm`, `rehype-highlight`, `rehype-raw` plugins
* Supported image formats: JPEG, PNG, GIF, WebP, SVG (sanitized)
* PDF files offer download only (preview is Post-MVP)
* Line numbers optional for plain text files

**Examples**

* Markdown with `# Heading` → renders as H1
* CSV file → displays as monospace text with scroll
* Image `photo.jpg` → displays inline with zoom controls
* PDF file → shows "Cannot preview" with download button
* Large file (2MB) → shows loading indicator, then truncated content with "Load more"

---

## Edit File Contents

**User Story**  
Edit files directly in the browser to contribute updates.

**Acceptance Checklist**

* [ ] "Edit" button available for users with editor role
* [ ] Clicking "Edit" switches file to edit mode
* [ ] Markdown files show split view (edit left, preview right) with scroll sync
* [ ] Text files show code editor with line numbers and syntax highlighting
* [ ] "Save" button uploads file and shows confirmation toast
* [ ] Saved changes visible to agent immediately
* [ ] "Cancel" button prompts "Discard changes?" before reverting
* [ ] Auto-save to localStorage every 30 seconds
* [ ] Page refresh restores draft with prompt
* [ ] Concurrent edit warning shows when another user is editing same file
* [ ] Concurrent editing offers "View their changes" or "Edit anyway" options
* [ ] "Edit anyway" uses last-save-wins strategy (CRDT in Post-MVP)

**Rules**

* Use `@uiw/react-md-editor` for markdown editing
* File content validated for size < 10MB before save
* Save flow: validate → WebSocket send → agent writes → agent confirms → UI confirms
* Pre-CRDT conflict detection uses version vectors with checksums
* CRDT integration (Post-MVP) uses Yjs for conflict-free editing

**Examples**

* Editor clicks "Edit" on `Maine.md` → sees split view with live preview
* User edits for 30 seconds → draft auto-saved to localStorage
* User refreshes page → prompt asks to restore draft
* Two editors try editing same file → second sees warning with options

---

## Out of Scope

**Browse Tree (MVP)**
* File search/filter
* Sort by name/date/size
* File upload
* Drag-and-drop to move files
* Create/delete files

**File Viewer (MVP)**
* Edit files (separate story)
* Version history
* File diff viewer
* Offline viewing

**File Editor (Post-MVP)**
* Multi-file editing
* Find and replace
* File upload
* Create new files
* Delete files

---

## Technical Notes

### File Tree Data Structure
```typescript
interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;  // Relative to space root
  children?: FileNode[];
  size?: number;
  modified?: Date;
}
```

### API Endpoints

**Get File Tree**
```
GET /spaces/{spaceId}/files?share={token}
Response: FileNode[]
```

**Get File Content**
```
GET /spaces/{spaceId}/files/{path}?share={token}
Response: {
  content: string,
  type: 'markdown' | 'text' | 'image' | 'binary',
  size: number,
  modified: string
}
```

### WebSocket Messages

**File Modified Event**
```json
{
  "type": "event",
  "event": "file_modified",
  "payload": {
    "path": "Vacations/Maine.md",
    "action": "modified"
  }
}
```

**File Write Request**
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

**File Write Response**
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