# Flow: Browse Files

**Actors:** Collaborator  
**Trigger:** Collaborator opens a Room and clicks files/folders in the Room file list

Collaborators browse files through Rooms. The raw Space Explorer is owner-only. A Room is currently backed by a promoted Topic path, so all file paths in this flow are scoped under that Room's backing path.

---

## Happy Path

```mermaid
sequenceDiagram
    participant Collaborator
    participant UI
    participant Server
    participant Agent
    
    Note over UI: Room file list shows the Room root
    Collaborator->>UI: Click "Budget" folder
    UI->>Server: GET /api/spaces/{spaceId}/files/Budget
    Server->>Agent: Validate path inside Room and space
    Agent-->>Server: Path valid
    Agent->>Agent: List directory contents
    Agent-->>Server: File nodes
    Server-->>UI: Folder contents
    UI-->>Collaborator: Display expanded folder
    
    Collaborator->>UI: Click "Maine.md" file
    UI->>UI: Navigate /spaces/{spaceId}/rooms/{roomId}/Maine.md
    UI->>Server: GET /api/spaces/{spaceId}/files/Maine.md
    Server->>Agent: Validate path inside Room and space
    Agent-->>Server: Path valid
    Agent->>Agent: Read file content
    Agent-->>Server: File content + metadata
    Server-->>UI: File content
    UI->>UI: Detect file type
    UI->>UI: Render markdown
    UI-->>Collaborator: Display rendered file
```

---

## Error Paths

### E1: Path Escape Attempt

```mermaid
sequenceDiagram
    participant Collaborator
    participant UI
    participant Server
    participant Agent
    
    Collaborator->>UI: Navigate to "../../../Private/secrets.md"
    UI->>Server: GET /api/spaces/{spaceId}/files/../../../Private/secrets.md
    Server->>Agent: Validate path
    Agent->>Agent: Resolve: /workspace/Private/secrets.md
    Agent->>Agent: Space root: /workspace/Vacations
    Agent-->>Server: Error: Path escapes space
    Server-->>UI: Access denied
    UI-->>Collaborator: Show error dialog
    Note right of Collaborator: "Cannot access files outside<br/>the Vacations space."
    
    Note over Agent: Log security event
```

### E2: File Not Found

```mermaid
sequenceDiagram
    participant Collaborator
    participant UI
    participant Server
    participant Agent
    
    Collaborator->>UI: Click non-existent file
    UI->>Server: GET /api/spaces/{spaceId}/files/Nonexistent.md
    Server->>Agent: Read file
    Agent-->>Server: Error: File not found
    Server-->>UI: Error
    UI-->>Collaborator: Show "File Not Found"
    Note right of Collaborator: This file no longer exists.<br/>It may have been deleted.
    UI->>UI: Refresh file tree
```

### E3: Binary File

```mermaid
sequenceDiagram
    participant Collaborator
    participant UI
    participant Server
    participant Agent
    
    Collaborator->>UI: Click vacation-photo.jpg
    UI->>Server: GET /api/spaces/{spaceId}/files/vacation-photo.jpg
    Server->>Agent: Read file
    Agent-->>Server: Binary file, type: image/jpeg, size: 2.4MB
    Server-->>UI: File metadata (no content)
    UI-->>Collaborator: Show download option
    Note right of Collaborator: Cannot preview this file.<br/>Type: image/jpeg<br/>Size: 2.4 MB<br/>[Download File]
```

---

## Edge Cases

### EC1: Large File

```mermaid
sequenceDiagram
    participant Collaborator
    participant UI
    participant Server
    participant Agent
    
    Collaborator->>UI: Click large file (>1MB)
    UI->>Server: GET /api/spaces/{spaceId}/files/large.md
    Server->>Agent: Read file
    Agent-->>Server: Stream content in chunks
    Note over Agent: Show loading indicator
    Server-->>UI: Chunk 1
    Server-->>UI: Chunk 2
    Server-->>UI: Chunk 3
    UI->>UI: Display progress
    UI-->>Collaborator: Show content (streaming)
    
    alt File > 10MB
        UI-->>Collaborator: Show truncated + download option
    end
```

### EC2: Nested Folders

```mermaid
flowchart TD
    A[Root] --> B[Vacations/]
    B --> C[Budget/]
    C --> D[2026/]
    D --> E[April/]
    E --> F[expenses.csv]
    
    Note right of A: Breadcrumb: Vacations / Budget / 2026 / April
    Note right of F: Deep navigation supported
```

### EC3: Restricted And Hidden Files

```mermaid
sequenceDiagram
    participant Collaborator
    participant UI
    participant Agent
    
    Note over UI: Room list hides owner-only paths
    UI->>UI: Hide .space/ and hidden internals
    UI->>UI: Hide metadata-restricted files/folders
    
    alt User is Owner in Space Explorer
        UI-->>Collaborator: Can view .space/ and restricted badges
    else Collaborator is Viewer/Editor
        UI->>UI: Never show raw Space Explorer
    end
```

---

## Acceptance Tests

### Test 1: Basic Navigation

**Given** a Room with nested folders  
**When** collaborator clicks folders  
**Then** folder expands  
**And** contents display  
**When** collaborator clicks file  
**Then** content loads in main panel
**And** the URL uses `/spaces/{spaceId}/rooms/{roomId}/{filePath}`

### Test 2: Path Escape Prevention

**Given** editor role  
**When** collaborator attempts to read `../../Private/secrets.md`  
**Then** request is blocked  
**And** error shows "Cannot access files outside space"  
**And** attempt logged for security audit

### Test 3: Binary File

**Given** binary file in space  
**When** collaborator clicks file  
**Then** download option shown  
**And** file metadata displayed (size, type)

---

## Timing

| Action | Duration |
|--------|----------|
| Expand folder | < 500ms (lazy load) |
| Load file <1MB | < 1s |
| Load file >1MB | <5s (streamed) |
| Path validation | < 10ms |

---

## Post-Conditions

- File content displayed
- Path shown in breadcrumb
- File visible in tree
- Content cached in memory
