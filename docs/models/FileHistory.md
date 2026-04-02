# Model: FileHistory

**Purpose:** Track file modifications (Post-MVP)

**Storage:** `<space-directory>/.space/history.json`

---

## Zod Schema

```typescript
import { z } from "zod";

export const FileHistoryStoreSchema = z.object({
  files: z.record(FileHistorySchema),
});

export const FileHistorySchema = z.object({
  path: z.string(),
  versions: z.array(FileVersionSchema),
});

export const FileVersionSchema = z.object({
  content: z.string(),
  timestamp: z.string().datetime(),
  editedBy: z.enum(["agent", "collaborator"]),
  sessionId: z.string(),
});

export type FileHistoryStore = z.infer<typeof FileHistoryStoreSchema>;
export type FileHistory = z.infer<typeof FileHistorySchema>;
export type FileVersion = z.infer<typeof FileVersionSchema>;
```

---

## Fields

### `files` (root)

- **Type:** `Record<string, FileHistory>`
- **Description:** Map of file paths to their history
- **Key:** Relative path from space root

### `path` (FileHistory)

- **Type:** `string`
- **Description:** Relative path of the file
- **Example:** `"Maine.md"`

### `versions` (FileHistory)

- **Type:** `FileVersion[]`
- **Description:** List of versions (newest last)

### `content` (FileVersion)

- **Type:** `string`
- **Description:** Full content of the file at this version
- **Note:** Post-MVP: Use CRDT instead of full snapshots

### `timestamp` (FileVersion)

- **Type:** `Date` (ISO 8601 string in storage)
- **Description:** When this version was created
- **Example:** `"2026-04-01T14:30:00Z"`

### `editedBy` (FileVersion)

- **Type:** `"agent" | "collaborator"`
- **Description:** Who made this change
- **Values:**
  - `"agent"`: Agent modified file via chat
  - `"collaborator"`: User edited file via UI

### `sessionId` (FileVersion)

- **Type:** `string`
- **Description:** Session that made this change
- **Example:** `"session-abc123"`

---

## Examples

### Basic History

```json
{
  "files": {
    "Maine.md": {
      "path": "Maine.md",
      "versions": [
        {
          "content": "# Maine Vacation\n\n## Options\n\n1. Portland...",
          "timestamp": "2026-04-01T12:00:00Z",
          "editedBy": "agent",
          "sessionId": "session-main"
        },
        {
          "content": "# Maine Vacation\n\n## Options\n\n1. Portland...\n\nAllie prefers beach...",
          "timestamp": "2026-04-01T14:30:00Z",
          "editedBy": "collaborator",
          "sessionId": "session-leah"
        }
      ]
    }
  }
}
```

### Multiple Files

```json
{
  "files": {
    "Maine.md": {
      "path": "Maine.md",
      "versions": [...]
    },
    "CostaRica.md": {
      "path": "CostaRica.md",
      "versions": [...]
    },
    "Budget/spreadsheet.csv": {
      "path": "Budget/spreadsheet.csv",
      "versions": [...]
    }
  }
}
```

---

## Version Limit

Maximum **50 versions per file** retained.

**Rationale:**
- Prevent unbounded file size
- Keep history manageable
- Sufficient for most use cases

**Cleanup:** When version count exceeds 50, oldest versions are removed.

---

## Post-MVP: CRDT

Future implementation may use Conflict-free Replicated Data Types (CRDT) instead of full content snapshots.

**Benefits:**
- No version limit needed
- Automatic merge of concurrent edits
- Smaller storage footprint
- Enable real-time collaboration

---

## Related Models

- [Space](./Space.md) - Space containing files
- [SessionContext](./SessionContext.md) - Session making edits