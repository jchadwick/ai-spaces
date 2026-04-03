# Model: SessionContext

**Purpose:** Agent-scoped session context

**Storage:** In-memory (agent adapter)

---

## Zod Schema

```typescript
import { z } from "zod";

export const SessionContextSchema = z.object({
  spaceId: z.string().uuid(),
  spacePath: z.string(),
  agentSessionId: z.string(),
  role: z.enum(["viewer", "editor", "admin"]),
  permissions: z.array(z.string()),
  
  skipFiles: z.array(z.string()),
  contextFiles: z.array(z.string()),
  
  toolAllow: z.array(z.string()),
  toolDeny: z.array(z.string()),
  
  effectiveWorkspaceRoot: z.string(),
});

export type SessionContext = z.infer<typeof SessionContextSchema>;
```

---

## Fields

### `spaceId`

- **Type:** `UUID`
- **Description:** ID of the space being accessed
- **Source:** From share record

### `spacePath`

- **Type:** `string`
- **Description:** Absolute path to space directory in agent workspace
- **Example:** `"/home/user/.openclaw/workspace/Vacations"`

### `agentSessionId`

- **Type:** `string`
- **Description:** Agent's internal session ID
- **Note:** Agent-adapter specific

### `role`

- **Type:** `"viewer" | "editor" | "admin"`
- **Description:** User-facing role for this session
- **Source:** From share record

### `permissions`

- **Type:** `string[]`
- **Description:** System-level permissions
- **Source:** Derived from role
- **Example:** `["read", "comment", "edit"]`

### `skipFiles`

- **Type:** `string[]`
- **Description:** Files to skip when loading agent context
- **Default:** `["AGENTS.md", "MEMORY.md", "USER.md", "memory/"]`
- **Purpose:** Prevent agent from reading private instructions

### `contextFiles`

- **Type:** `string[]`
- **Description:** Additional context files to load (relative to space)
- **Default:** `[".space/SPACE.md"]` (if exists)
- **Purpose:** Space-specific instructions for agent

### `toolAllow`

- **Type:** `string[]`
- **Description:** Tools allowed for this session
- **Default:** `["read", "write", "edit", "glob", "web_search"]` (modified by role)
- **Source:** Space config `agent.tools.allow`

### `toolDeny`

- **Type:** `string[]`
- **Description:** Tools denied for this session
- **Default:** `["exec", "messaging", "spawn_agents", "browser", "credentials"]`
- **Source:** Space config `agent.tools.deny`

### `effectiveWorkspaceRoot`

- **Type:** `string`
- **Description:** The effective root for file operations
- **Value:** Same as `spacePath`
- **Purpose:** Restrict file operations to space directory

---

## Example

### Editor Session

```json
{
  "spaceId": "550e8400-e29b-41d4-a716-446655440000",
  "spacePath": "/home/user/.openclaw/workspace/Vacations",
  "agentSessionId": "openclaw-session-abc123",
  "role": "editor",
  "permissions": ["read", "comment", "edit"],
  
  "skipFiles": ["AGENTS.md", "MEMORY.md", "USER.md", "memory/"],
  "contextFiles": [".space/SPACE.md"],
  
  "toolAllow": ["read", "write", "edit", "glob", "web_search"],
  "toolDeny": ["exec", "messaging", "spawn_agents", "browser", "credentials"],
  
  "effectiveWorkspaceRoot": "/home/user/.openclaw/workspace/Vacations"
}
```

### Viewer Session

```json
{
  "spaceId": "550e8400-e29b-41d4-a716-446655440000",
  "spacePath": "/home/user/.openclaw/workspace/Vacations",
  "agentSessionId": "openclaw-session-def456",
  "role": "viewer",
  "permissions": ["read", "comment"],
  
  "skipFiles": ["AGENTS.md", "MEMORY.md", "USER.md", "memory/"],
  "contextFiles": [".space/SPACE.md"],
  
  "toolAllow": ["read", "glob", "web_search"],
  "toolDeny": ["write", "edit", "exec", "messaging"],
  
  "effectiveWorkspaceRoot": "/home/user/.openclaw/workspace/Vacations"
}
```

---

## Agent Adapter Implementation

### OpenClaw Adapter

```typescript
async function createSession(
  spaceId: string,
  context: SessionContext
): Promise<Session> {
  // Create scoped OpenClaw session
  const openclawSession = await openclaw.createScopedSession({
    workspaceRoot: context.spacePath,
    
    // Skip agent's private memory files
    skipFiles: context.skipFiles,
    
    // Load space-specific context
    contextFiles: context.contextFiles,
    
    // Tool restrictions
    toolHooks: {
      beforeCall: (tool: string, params: any) => {
        // Check if tool is allowed
        if (context.toolDeny.includes(tool)) {
          throw new Error(`Tool '${tool}' is not allowed in this space`);
        }
        
        // Check if tool requires edit permission
        if (['write', 'edit'].includes(tool)) {
          if (!context.permissions.includes('edit')) {
            throw new Error('Viewers cannot modify files');
          }
        }
        
        // Validate file paths
        if (['read', 'write', 'edit', 'glob'].includes(tool)) {
          const resolvedPath = resolve(params.path, context.spacePath);
          if (!resolvedPath.startsWith(context.spacePath)) {
            throw new Error('Path escapes space boundary');
          }
        }
        
        return params;
      }
    }
  });
  
  return {
    id: generateSessionId(),
    spaceId,
    agentSessionId: openclawSession.id
  };
}
```

---

## Memory Isolation

### What Gets Skipped

| File | Full Agent | Scoped Context |
|------|------------|----------------|
| `AGENTS.md` | ✓ Loaded | ✗ Skipped |
| `MEMORY.md` | ✓ Loaded | ✗ Skipped |
| `USER.md` | ✓ Loaded | ✗ Skipped |
| `memory/` | ✓ Loaded | ✗ Skipped |
| `.space/SPACE.md` | Optional | ✓ Loaded |
| Space files | ✓ All | ✓ Only within space |

### Why This Matters

The agent's private files contain sensitive information:
- `AGENTS.md`: Operating instructions the agent follows
- `MEMORY.md`: Long-term memory andprivate notes
- `USER.md`: Information about the agent's owner

These are never loaded for scoped sessions. Instead, the agent loads `.space/SPACE.md` which contains space-specific context.

---

## Tool Restrictions

### Always Allowed

- `read`: Read files within space
- `glob`: List files within space

### Editor Only

- `write`: Create or overwrite files
- `edit`: Edit files with string replacement

### Configurable

- `web_search`: Search the web (if allowed in space config)

### Always Denied

- `exec`: Execute shell commands
- `messaging`: Send messages (email, SMS, etc.)
- `spawn_agents`: Create sub-agents
- `browser`: Control web browser
- `credentials`: Access stored credentials

---

## Path Validation

All file operations must validate paths:

```typescript
function validatePath(path: string, spacePath: string): string {
  // Resolve to absolute path
  const resolved = resolve(spacePath, path);
  
  // Check it's within space root
  if (!resolved.startsWith(spacePath)) {
    throw new Error('Path escapes space boundary');
  }
  
  // Check for symlinks that escape
  const real = realpathSync(resolved);
  if (!real.startsWith(spacePath)) {
    throw new Error('Symlink escapes space boundary');
  }
  
  return resolved;
}
```

---

## Related Models

- [Session](./Session.md) - Database session record
- [Space](./Space.md) - Space being accessed
- [Share](./Share.md) - Share used to create session