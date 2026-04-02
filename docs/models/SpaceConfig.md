# Model: SpaceConfig

**Purpose:** Configuration file defining a space

**Storage:** `<space-directory>/.space/spaces.json`

---

## Zod Schema

```typescript
import { z } from "zod";

export const SpaceConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  collaborators: z.array(z.object({
    email: z.string().email().optional(),
    name: z.string().optional(),
    role: z.enum(["viewer", "editor", "admin"]),
  })).optional(),
  agent: z.object({
    capabilities: z.array(z.string()).optional(),
    denied: z.array(z.string()).optional(),
  }).optional(),
});

export type SpaceConfig = z.infer<typeof SpaceConfigSchema>;
```

---

## Fields

### `name` (required)

- **Type:** `string`
- **Description:** Human-readable name for the space
- **Example:** `"Family Vacations"`
- **Constraints:**
  - Required
  - Length: 1-100 characters

### `description` (optional)

- **Type:** `string`
- **Description:** Brief description of the space's purpose
- **Example:** `"Shared vacation planning with family"`
- **Constraints:**
  - Optional
  - Length: 0-500 characters

### `collaborators` (optional)

- **Type:** `CollaboratorConfig[]`
- **Description:** List of pre-configured collaborators
- **Note:** Collaborators can also be managed via share links (not just this config)
- **Example:**
  ```json
  [
    { "email": "leah@example.com", "role": "editor" },
    { "name": "Tom", "role": "viewer" }
  ]
  ```

### `agent` (optional)

- **Type:** `AgentConfig`
- **Description:** Agent capabilities for this space
- **Default:** `{ capabilities: ["read", "write", "web_search"], denied: ["exec", "messaging"] }`

#### `agent.capabilities`

- **Type:** `string[]`
- **Description:** Tools the agent can use in this space
- **Allowed values:** `"read"`, `"write"`, `"edit"`, `"glob"`, `"web_search"`
- **Example:** `["read", "write", "web_search"]`

#### `agent.denied`

- **Type:** `string[]`
- **Description:** Tools explicitly denied for this space
- **Default:** `["exec", "messaging", "spawn_agents", "browser", "credentials"]`
- **Example:** `["exec", "messaging"]`

---

## Examples

### Minimal Config

```json
{
  "name": "Family Vacations"
}
```

### Full Config

```json
{
  "name": "Family Vacations",
  "description": "Shared vacation planning with family",
  "collaborators": [
    { "email": "leah@example.com", "role": "editor" },
    { "email": "allie@example.com", "role": "viewer" }
  ],
  "agent": {
    "capabilities": ["read", "write", "edit", "web_search"],
    "denied": ["exec", "messaging", "credentials"]
  }
}
```

### Read-Only Space

```json
{
  "name": "Reference Materials",
  "description": "Read-only research documents",
  "agent": {
    "capabilities": ["read"],
    "denied": ["write", "edit", "exec", "messaging"]
  }
}
```

### Web-Disabled Space

```json
{
  "name": "Private Projects",
  "description": "Offline project notes",
  "agent": {
    "capabilities": ["read", "write", "edit"],
    "denied": ["web_search", "exec", "messaging"]
  }
}
```

---

## Validation

| Field | Error Condition | Message |
|-------|----------------|---------|
| `name` | missing | `"name" is required` |
| `name` | empty | `"name" must not be empty` |
| `name` | too long | `"name" must be ≤ 100 characters` |
| `collaborators[].role` | invalid value | `"role" must be "viewer", "editor", or "admin"` |
| `agent.capabilities` | invalid tool | `"capabilities" contains invalid tool "foo"` |

---

## File Location

```
workspace/
  Vacations/
    .space/
      spaces.json     ← SpaceConfig
    Maine.md
    CostaRica.md
```

---

## Related Models

- [Space](./Space.md) - Discovered space (runtime representation)
- [Share](./Share.md) - Share link for accessing space
- [SessionContext](./SessionContext.md) - Scoped session context