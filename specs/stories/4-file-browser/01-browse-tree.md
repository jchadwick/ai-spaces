# Story: Browse Space Contents

**Epic:** 4 - File Browser  
**Priority:** MVP  
**StoryPoints:** 5

---

## As a collaborator

**I want** to browse all files and folders in the space  
**So that** I can explore what the agent knows

---

## Acceptance Criteria

### AC1: File Tree Display
**Given** I access a space  
**When** the UI loads  
**Then** I see a file tree on the left side:

```
┌── File Browser ────────────────┐
│                                │
│ 📁 Vacations/                  │
│   📄 Maine.md                  │
│   📄 CostaRica.md              │
│   📁 Budget/                   │
│     📄 spreadsheet.csv         │
│     📄 notes.md                │
│   📁 .space/                   │
│     📄 spaces.json             │
│                                │
└────────────────────────────────┘
```

### AC2: Folder Expansion
**Given** folders exist in space  
**When** I click a folder  
**Then**:
- Folder expands to show contents
- Icon changes: 📁 → 📂
- State persists during session

### AC3: Nested Folders
**Given** deeply nested folders  
**When** scrolling  
**Then**:
- Infinite scroll opens deeply
- Nested folders indented
- Path shown in breadcrumb

### AC4: File Selection
**Given** files exist in space  
**When** I click a file  
**Then**:
- File highlights in tree
- File content loads in main view
- Path shown in header

### AC5: Hidden Files
**Given** hidden files (starting with `.`)  
**When** displayed  
**Then**:
- Visible but styled differently (gray, italic)
- `.space/` directory shown differently

**Role-Based Visibility:**
- **Viewer/Editor:** `.space/` visible
- **Admin:** Full access to `.space/` contents

### AC6: Empty Folders
**Given** an empty folder  
**When** expanded  
**Then** show:

```
(empty)
```

### AC7: Binary Files
**Given** non-text files (images, PDFs, etc.)  
**When** displayed in tree  
**Then**:
- Show appropriate icon: 🖼️, 📄, 📊
- Clicking opens preview/download

### AC8: Path Breadcrumb
**Given** I navigate to nested file  
**When** viewing  
**Then** show breadcrumb:

```
Vacations / Budget / notes.md
```

**When** I click breadcrumb segment  
**Then** navigate to that folder

---

## TechnicalNotes

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

### Tree Loading
Files loaded lazily:
- Root level loaded immediately
- Folders expand on click (lazy load)
- Cache loaded folders during session

### API Endpoint
```
GET /spaces/{spaceId}/files?share={token}
Response: FileNode[]
```

### WebSocket File Updates
When agent modifies files:
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

UI updates file tree accordingly.

---

## Out of Scope (Post-MVP)

- File search/filter
- Sort by name/date/size
- File upload
- Drag-and-drop to move files
- Create/delete files