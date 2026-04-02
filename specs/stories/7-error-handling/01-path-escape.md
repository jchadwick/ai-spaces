# Story: Path Escape Prevention

**Epic:** 7 - Error Handling  
**Priority:** MVP  
**Story Points:** 3

---

## As the system

**I want** to prevent collaborators from accessing files outside their space  
**So that** private data is protected

---

## Acceptance Criteria

### AC1: Absolute Path Resolution
**Given** agent receives a file path  
**When** resolving  
**Then**:
- All paths resolved to absolute paths
- Relative paths resolved against space root
- Symbolic links followed to target

**Example:**
```
Input: "../Private/secrets.md"
Resolved: /home/user/.openclaw/workspace/Private/secrets.md
Space Root: /home/user/.openclaw/workspace/Vacations
Result: BLOCKED (escapes space)
```

### AC2: Path Traversal Detection
**Given** path contains `../` or other traversal  
**When** resolved  
**Then**:
- Block if resolved path outside space root
- Return error: "Path escapes space: [path] is outside [space-id]"

**Example Attacks:**
- `../../../etc/passwd`
- `./subdir/../../Private/secret.md`
- `./Vacations/./../Private`

### AC3: Symbolic Link Handling
**Given** space contains symlinks  
**When** resolving  
**Then**:
- Follow symlink to target
- Check if target inside space
- Block if target outside space

**Example:**
```
Space: /home/user/.openclaw/workspace/Vacations
File: /home/user/.openclaw/workspace/Vacations/link-to-private
Target: /home/user/.openclaw/workspace/Private
Result: BLOCKED (symlink target outside space)
```

### AC4: Error Message
**Given** path escapes space  
**When** agent/tool tries to access  
**Then**:
- Tool hook blocks execution
- Agent responds: "I cannot access files outside this space."
- No technical details leaked

**Agent Response:**
```
I cannot access files outside this space. I'm only able to read 
files within the Vacations space.
```

### AC5: Audit Logging
**Given** path escape attempted  
**When** blocked  
**Then**:
- Log attempt to security log
- Include: timestamp, session, attempted path, space
- Alert owner (Post-MVP)

**Log format:**
```
[2026-04-01T12:00:00Z] PATH_ESCAPED: session=a1b2c3 space=Vacations 
attempted="../../../Private/secrets.md" action=blocked
```

---

## Technical Notes

### Path Validation Logic
```typescript
function validatePath(requestedPath: string, spaceRoot: string): string | Error {
  // Resolve to absolute path
  const absolute = resolve(spaceRoot, requestedPath);
  
  // Normalize (collapse .. and .)
  const normalized = normalize(absolute);
  
  // Check if inside space
  if (!normalized.startsWith(spaceRoot)) {
    return new Error(`Path escapes space: ${requestedPath}`);
  }
  
  // Check for symlink escape
  try {
    const realPath = realpathSync(normalized);
    if (!realPath.startsWith(spaceRoot)) {
      return new Error(`Symlink target escapes space`);
    }
  } catch (e) {
    // File doesn't exist yet, that's OK
  }
  
  return normalized;
}
```

### Tool Hook Implementation
```typescript
api.registerHook(['before_tool_call'], createToolHook(spaceManager));

function createToolHook(spaceManager: SpaceManager) {
  return async (event: ToolCallEvent) => {
    // Only process for space sessions
    if (!event.sessionKey?.startsWith('space:')) {
      return {};
    }
    
    const context = event.context.spaceContext;
    
    // Check for file operations
    if (['read', 'write', 'edit', 'glob'].includes(event.tool)) {
      const pathParam = event.params.path || event.params.filePath || event.params.workdir;
      
      if (pathParam) {
        const result = validatePath(pathParam, context.spacePath);
        
        if (result instanceof Error) {
          // Log attempt
          logSecurity('PATH_ESCAPED', {
            session: event.sessionKey,
            space: context.spaceId,
            attempted: pathParam
          });
          
          // Block
          return {
            block: true,
            blockReason: result.message
          };
        }
      }
    }
    
    return {};
  };
}
```

---

## Out of Scope (Post-MVP)

- Allow-listed paths outside space (e.g., shared templates)
- Path whitelisting UI
- Advanced symlink detection