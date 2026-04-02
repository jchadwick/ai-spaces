# Story: Space Discovery Scanning

**Epic:** 1 - Space Discovery  
**Priority:** MVP  
**Story Points:** 3

---

## As the system

**I want** to automatically find all spaces in the workspace  
**So that** the owner doesn't have to manually register them

---

## Acceptance Criteria

### AC1: Scan on Startup
**Given** the gateway starts  
**When** initialization completes  
**Then** all `.space/spaces.json` files are discovered

### AC2: Periodic Rescan
**Given** the gateway is running  
**When** 5 minutes have elapsed (configurable)  
**Then** rescan for new spaces

**Rationale:** New spaces created via config file should appear without restart

### AC3: File Watcher (Post-MVP)
**Given** a file watcher is enabled  
**When** a `.space/spaces.json` file is created/modified/deleted  
**Then** space list updates immediately

**Note:** Optional feature for faster discovery

### AC4: Discovery Algorithm
```
function discoverSpaces(workspaceRoot):
  spaces = []
  for each directory in workspace:
    if directory contains ".space/spaces.json":
      config = parseJSON(directory/.space/spaces.json)
      spaces.append({
        id: relativePath(workspaceRoot, directory),
        path: absolutePath(directory),
        config: config
      })
    else:
      recursively scan subdirectories
  return spaces
```

### AC5: Skip Hidden Directories
**Given** a directory starts with `.`  
**When** scanning  
**Then** skip that directory and its children

**Exception:** `.space/` is always scanned if it's the direct child of a space directory

### AC6: Collision Detection
**Given** two spaces have the same ID (impossible with current design)  
**When** discovered  
**Then** use first found and log warning

---

## Performance

- **Timeout:** Scan must complete within 10 seconds for workspaces <10,000 directories
- **Caching:** Space list cached in memory, rescanned periodically
- **Incremental:** (Post-MVP) Track last modification time, only reparse changed files

---

## Technical Notes

### Storage
Spaces are stored in a `SpaceManager` instance:

```typescript
interface SpaceRegistry {
  spaces: Map<string, Space>;
  lastScanned: Date | null;
}

interface Space {
  id: string;          // Relative path from workspace root
  path: string;        // Absolute path
  config: SpaceConfig;
  configPath: string;  // Absolute path to spaces.json
}
```

### Rescan Trigger
Manual rescan available via CLI:

```bash
openclaw spaces refresh
```

---

## Out of Scope (Post-MVP)

- Real-time file watching (inotify/FSEvents)
- Database-backed space registry
- Space deletion cascade