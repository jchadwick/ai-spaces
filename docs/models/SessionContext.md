# Model: SessionContext

**Purpose:** Scoped context for a collaborator session

**Storage:** In-memory (Gateway session)

---

## Zod Schema

```typescript
import { z } from "zod";

export const SessionContextSchema = z.object({
  type: z.literal("space"),
  spaceId: z.string(),
  spacePath: z.string(),
  agentId: z.string(),
  shareToken: z.string(),
  role: z.enum(["viewer", "editor", "admin"]),
  sessionKey: z.string(),
  
  deniedTools: z.array(z.string()),
  allowedTools: z.array(z.string()),
  
  skipFiles: z.array(z.string()),
  contextFiles: z.array(z.string()),
  
  effectiveWorkspaceRoot: z.string(),
});

export type SessionContext = z.infer<typeof SessionContextSchema>;
```

---

## Fields

### `type`

- **Type:** `"space"`
- **Description:** Indicates this is a space session (vs. full agent session)
- **Fixed:** Always `"space"`

### `spaceId`

- **Type:** `string`
- **Description:** ID of the space
- **Example:** `"Vacations"`

### `spacePath`

- **Type:** `string`
- **Description:** Absolute path to space directory
- **Example:** `"/home/user/.openclaw/workspace/Vacations"`

### `agentId`

- **Type:** `string`
- **Description:** ID of the agent serving this session
- **Default:** `"main"` (the primary agent)
- **Example:** `"main"`

### `shareToken`

- **Type:** `string`
- **Description:** The share token used to create this session
- **Example:** `"3Kf7Pq9RzT2mYvNcX5bS8wA1eF4gH6jK"`
- **Note:** Stored as hash in sessionKey for security

### `role`

- **Type:** `"viewer" | "editor" | "admin"`
- **Description:** Permission level for this session
- **Derived from:** Share token

### `sessionKey`

- **Type:** `string`
- **Description:** Unique key for this session
- **Format:** `"space:<spaceId>:<agentId>:<tokenHash>"`
- **Example:** `"space:Vacations:main:abc123def456"`
- **Note:** Token is hashed (not stored in plain text)

### `deniedTools`

- **Type:** `string[]`
- **Description:** Tools explicitly denied for this session
- **Default:** `["exec", "messaging", "spawn_agents", "browser", "credentials"]`
- **Overrides:** Space config `agent.denied`

### `allowedTools`

- **Type:** `string[]`
- **Description:** Tools allowed for this session
- **Default:** `["read", "write", "edit", "glob", "web_search"]`
- **Overrides:** Space config `agent.capabilities`
- **Modified by role:**
  - Viewer: Remove `"write"`, `"edit"`

### `skipFiles`

- **Type:** `string[]`
- **Description:** Files to skip when loading agent context
- **Default:** `["AGENTS.md", "MEMORY.md", "USER.md", "memory/"]`
- **Purpose:** Prevent agent from reading private instructions/memory

### `contextFiles`

- **Type:** `string[]`
- **Description:** Additional context files to load (relative to space)
- **Default:** `[".space/SPACE.md"]` (if exists)
- **Purpose:** Space-specific instructions for the agent

### `effectiveWorkspaceRoot`

- **Type:** `string`
- **Description:** The effective root for file operations
- **Value:** Same as `spacePath`
- **Purpose:** Restrict file operations to space directory

---

## Examples

### Editor Session

```json
{
  "type": "space",
  "spaceId": "Vacations",
  "spacePath": "/home/user/.openclaw/workspace/Vacations",
  "agentId": "main",
  "shareToken": "3Kf7Pq9RzT2mYvNcX5bS8wA1eF4gH6jK",
  "role": "editor",
  "sessionKey": "space:Vacations:main:abc123def456",
  
  "deniedTools": ["exec", "messaging", "spawn_agents", "browser", "credentials"],
  "allowedTools": ["read", "write", "edit", "glob", "web_search"],
  
  "skipFiles": ["AGENTS.md", "MEMORY.md", "USER.md", "memory/"],
  "contextFiles": [".space/SPACE.md"],
  
  "effectiveWorkspaceRoot": "/home/user/.openclaw/workspace/Vacations"
}
```

### Viewer Session

```json
{
  "type": "space",
  "spaceId": "Research/NewCar",
  "spacePath": "/home/user/.openclaw/workspace/Research/NewCar",
  "agentId": "main",
  "shareToken": "XyZ123AbC456...",
  "role": "viewer",
  "sessionKey": "space:Research/NewCar:main:def789ghi012",
  
  "deniedTools": ["exec", "messaging", "spawn_agents", "browser", "credentials"],
  "allowedTools": ["read", "glob", "web_search"],
  
  "skipFiles": ["AGENTS.md", "MEMORY.md", "USER.md", "memory/"],
  "contextFiles": [".space/SPACE.md"],
  
  "effectiveWorkspaceRoot": "/home/user/.openclaw/workspace/Research/NewCar"
}
```

---

## Session Key Format

```
space:<spaceId>:<agentId>:<tokenHash>
```

- `space`: Fixed prefix indicating space session
- `<spaceId>`: ID of space (e.g., "Vacations")
- `<agentId>`: ID of agent (typically "main")
- `<tokenHash>`: First 16 chars of SHA256(token)

**Example:**
```
space:Vacations:main:abc123def456
```

**Purpose:**
- Unique per session
- Allows multiple sessions per space (different tokens)
- Allows session lookup by space ID

---

## Related Models

- [Share](./Share.md) - Share link creating this session
- [Space](./Space.md) - Space being accessed
- [SpaceConfig](./SpaceConfig.md) - Space configuration