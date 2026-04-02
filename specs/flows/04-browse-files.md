# Flow: Browse Files

**Actors:** Collaborator  
**Trigger:** Collaborator clicks files/folders in file browser

---

## Happy Path

```mermaid
sequenceDiagram
    participant Collaborator
    participant UI
    participant WebSocket
    participant Agent
    
    Note over UI: File browser shows root
    Collaborator->>UI: Click "Budget" folder
    UI->>WebSocket: files.list {path: "Budget"}
    WebSocket->>Agent: Validate path inside space
    Agent-->>WebSocket: Path valid
    Agent->>Agent: List directory contents
    Agent-->>WebSocket: File nodes
    WebSocket-->>UI: Folder contents
    UI-->>Collaborator: Display expanded folder
    
    Collaborator->>UI: Click "Maine.md" file
    UI->>WebSocket: files.read {path: "Maine.md"}
    WebSocket->>Agent: Validate path inside space
    Agent-->>WebSocket: Path valid
    Agent->>Agent: Read file content
    Agent-->>WebSocket: File content + metadata
    WebSocket-->>UI: File content
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
    participant WebSocket
    participant Agent
    
    Collaborator->>UI: Navigate to "../../../Private/secrets.md"
    UI->>WebSocket: files.read {path: "../../../Private/secrets.md"}
    WebSocket->>Agent: Validate path
    Agent->>Agent: Resolve: /workspace/Private/secrets.md
    Agent->>Agent: Space root: /workspace/Vacations
    Agent-->>WebSocket: Error: Path escapes space
    WebSocket-->>UI: Access denied
    UI-->>Collaborator: Show error dialog
    Note right of Collaborator: "Cannot access files outside<br/>the Vacations space."
    
    Note over Agent: Log security event
```

### E2: File Not Found

```mermaid
sequenceDiagram
    participant Collaborator
    participant UI
    participant WebSocket
    participant Agent
    
    Collaborator->>UI: Click non-existent file
    UI->>WebSocket: files.read {path: "Nonexistent.md"}
    WebSocket->>Agent: Read file
    Agent-->>WebSocket: Error: File not found
    WebSocket-->>UI: Error
    UI-->>Collaborator: Show "File Not Found"
    Note right of Collaborator: This file no longer exists.<br/>It may have been deleted.
    UI->>UI: Refresh file tree
```

### E3: Binary File

```mermaid
sequenceDiagram
    participant Collaborator
    participant UI
    participant WebSocket
    participant Agent
    
    Collaborator->>UI: Click vacation-photo.jpg
    UI->>WebSocket: files.read {path: "vacation-photo.jpg"}
    WebSocket->>Agent: Read file
    Agent-->>WebSocket: Binary file, type: image/jpeg, size: 2.4MB
    WebSocket-->>UI: File metadata (no content)
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
    participant WebSocket
    participant Agent
    
    Collaborator->>UI: Click large file (>1MB)
    UI->>WebSocket: files.read {path: "large.md"}
    WebSocket->>Agent: Read file
    Agent-->>WebSocket: Stream content in chunks
    Note over Agent: Show loading indicator
    WebSocket-->>UI: Chunk 1
    WebSocket-->>UI: Chunk 2
    WebSocket-->>UI: Chunk 3
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

### EC3: Hidden Files

```mermaid
sequenceDiagram
    participant Collaborator
    participant UI
    participant Agent
    
    Note over UI: Hidden files shown differently
    UI->>UI: Display .DS_Store with gray styling
    UI->>UI: Display .space/ with special icon
    
    alt Collaborator is Admin
        UI-->>Collaborator: Can view .space/ contents
    else Collaborator is Viewer/Editor
        UI->>UI: Hide .space/ directory
    end
```

---

## Acceptance Tests

### Test 1: Basic Navigation

**Given** space with nested folders  
**When** collaborator clicks folders  
**Then** folder expands  
**And** contents display  
**When** collaborator clicks file  
**Then** content loads in main panel

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