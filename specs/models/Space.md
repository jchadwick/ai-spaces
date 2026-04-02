# Model: Space

**Purpose:** Runtime representation of a discovered space

**Storage:** In-memory (SpaceManager)

---

## Zod Schema

```typescript
import { z } from "zod";
import { SpaceConfigSchema } from "./SpaceConfig";

export const SpaceSchema = z.object({
  id: z.string(),
  path: z.string(),
  configPath: z.string(),
  config: SpaceConfigSchema,
});

export type Space = z.infer<typeof SpaceSchema>;
```

---

## Fields

### `id`

- **Type:** `string`
- **Description:** Unique identifier for the space
- **Derived from:** Relative path from workspace root
- **Example:** `"Vacations"` or `"Research/NewCar"`
- **Constraints:**
  - URL-safe (used in URLs)
  - Unique across all spaces

### `path`

- **Type:** `string`
- **Description:** Absolute path to the space directory
- **Example:** `"/home/user/.openclaw/workspace/Vacations"`
- **Constraints:**
  - Absolute path
  - Exists on disk

### `configPath`

- **Type:** `string`
- **Description:** Absolute path to the config file
- **Example:** `"/home/user/.openclaw/workspace/Vacations/.space/spaces.json"`
- **Constraints:**
  - Absolute path
  - Points to `spaces.json`

### `config`

- **Type:** `SpaceConfig`
- **Description:** Parsed configuration from `spaces.json`
- **See:** [SpaceConfig](./SpaceConfig.md)

---

## Examples

### Root Space

```json
{
  "id": "Vacations",
  "path": "/home/user/.openclaw/workspace/Vacations",
  "configPath": "/home/user/.openclaw/workspace/Vacations/.space/spaces.json",
  "config": {
    "name": "Family Vacations",
    "description": "Shared vacation planning"
  }
}
```

### Nested Space

```json
{
  "id": "Research/NewCar",
  "path": "/home/user/.openclaw/workspace/Research/NewCar",
  "configPath": "/home/user/.openclaw/workspace/Research/NewCar/.space/spaces.json",
  "config": {
    "name": "Car Research",
    "collaborators": [
      { "email": "spouse@example.com", "role": "editor" }
    ]
  }
}
```

---

## Space ID Derivation

The space ID is derived from the relative path within the workspace:

```
Workspace Root: /home/user/.openclaw/workspace

Discovery:
  /home/user/.openclaw/workspace/Vacations/.space/spaces.json
  → Space ID: "Vacations"

Discovery:
  /home/user/.openclaw/workspace/Research/NewCar/.space/spaces.json
  → Space ID: "Research/NewCar"
```

**Derivation:** Space ID equals the relative path from workspace root to the space directory.

---

## Directory Structure

```
workspace/
  ├── AGENTS.md                 (not a space)
  ├── MEMORY.md                 (not a space)
  ├── Private/                   (not a space)
  │
  ├── Vacations/                 (space)
  │   ├── .space/
  │   │   └── spaces.json
  │   ├── Maine.md
  │   └── CostaRica.md
  │
  └── Research/
      ├── notes.md               (not a space)
      │
      └── NewCar/                (space)
          ├── .space/
          │   └── spaces.json
          ├── RAV4.md
          └── CX-5.md
```

---

## Lifecycle

### Creation

1. User creates `.space/spaces.json` in a directory
2. Gateway scans filesystem (periodic or file watcher)
3. Space discovered and added to registry

### Modification

1. User edits `spaces.json`
2. Gateway detects change (file watcher)
3. Space config reloaded

### Deletion

1. User removes `.space/` directory
2. Gateway detects removal
3. Space removed from registry
4. Active shares invalidated

---

## Related Models

- [SpaceConfig](./SpaceConfig.md) - Configuration file schema
- [Share](./Share.md) - Share link for accessing space
- [SpaceRegistry](./SpaceRegistry.md) - Runtime storage