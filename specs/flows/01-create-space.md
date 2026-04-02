# Flow: Create Space

**Actors:** Owner  
**Trigger:** Owner wants to share a portion of their workspace

---

## Happy Path

```mermaid
sequenceDiagram
    participant Owner
    participant FileSystem
    participant Gateway
    participant Registry
    
    Owner->>FileSystem: Navigate to workspace directory
    Owner->>FileSystem: mkdir ~/.openclaw/workspace/Vacations/.space
    Owner->>FileSystem: Create spaces.json
    Note right of Owner: {"name": "Family Vacations", "description": "..."}
    Gateway->>FileSystem: Scan for .space/spaces.json
    FileSystem-->>Gateway: Found spaces.json
    Gateway->>Registry: Add space to registry
    Note right of Registry: ID: "Vacations", Path: ~/.openclaw/workspace/Vacations
    Owner->>Gateway: openclaw spaces list
    Gateway-->>Owner: Show discovered spaces
```

---

## Error Paths

### E1: Invalid Config File

```mermaid
sequenceDiagram
    participant Owner
    participant FileSystem
    participant Gateway
    participant Registry
    
    Owner->>FileSystem: Create invalid spaces.json
    Note right of Owner: Invalid JSON syntax
    Gateway->>FileSystem: Scan for spaces
    Gateway->>FileSystem: Parse spaces.json
    FileSystem-->>Gateway: Parse error
    Gateway->>Gateway: Log warning, continue scan
    Owner->>Gateway: openclaw spaces list
    Gateway-->>Owner: Show spaces + warnings
    Note right of Owner: WARNING: Invalid config at Vacations/.space/spaces.json
    Owner->>FileSystem: Fix config
```

### E2: Missing Required Fields

```mermaid
sequenceDiagram
    participant Owner
    participant FileSystem
    participant Gateway
    
    Owner->>FileSystem: Create spaces.json missing "name"
    Note right of Owner: {"description": "..."} only
    Gateway->>FileSystem: Scan for spaces
    Gateway->>FileSystem: Validate spaces.json
    FileSystem-->>Gateway: Validation fails
    Gateway-->>Owner: Show error
    Note right of Owner: Missing required field: name
    Owner->>FileSystem: Add "name" field
    Gateway->>FileSystem: Rescan
    Gateway-->>Owner: Space discovered
```

---

## Edge Cases

### EC1: Nested Spaces

```mermaid
flowchart TD
    A[Parent space] --> B[.space/spaces.json at Vacations/]
    B --> C[Child space]
    C --> D[.space/spaces.json at Vacations/Maine/]
    D --> E[Both spaces discovered independently]
```

**Behavior:** Parent and child are independent spaces with separate configurations and share links.

### EC2: Deleted Space

```mermaid
sequenceDiagram
    participant Owner
    participant FileSystem
    participant Gateway
    participant Registry
    
    Owner->>FileSystem: Remove .space directory
    Gateway->>FileSystem: Rescan
    FileSystem-->>Gateway: .space not found
    Gateway->>Registry: Remove space from registry
    Owner->>Gateway: Try existing share link
    Gateway-->>Owner: Error: Space not found
```

### EC3: Moved Space

```mermaid
sequenceDiagram
    participant Owner
    participant FileSystem
    participant Gateway
    participant Registry
    
    Owner->>FileSystem: Move workspace directory
    Note right of Owner: mv Vacations Travel
    Gateway->>FileSystem: Rescan
    Gateway->>Registry: New space "Travel" discovered
    Gateway->>Registry: Old space "Vacations" not found
    Note right of Registry: Share links now invalid
    Owner->>Gateway: Create new share for "Travel"
```

---

## Acceptance Tests

### Test 1: Basic Creation

**Given** workspace exists  
**When** owner creates `.space/spaces.json` with valid config  
**Then** `openclaw spaces list` shows the new space

### Test 2: Invalid Config

**Given** workspace exists  
**When** owner creates `.space/spaces.json` with invalid JSON  
**Then** `openclaw spaces list` shows warning  
**And** space is not added to registry

### Test 3: Nested Spaces

**Given** parent space exists  
**When** owner creates `.space/spaces.json` in child directory  
**Then** both spaces appear in `openclaw spaces list`  
**And** each has independent configuration

---

## Timing

| Step | Duration |
|------|----------|
| Create config file | Manual (seconds) |
| Discovery scan | < 10s (for workspace <10k dirs) |
| Total | < 20s |

---

## Post-Conditions

- Space appears in `openclaw spaces list`
- Space ready for share link creation
- `.space/` directory exists in workspace
- `spaces.json` valid and parseable