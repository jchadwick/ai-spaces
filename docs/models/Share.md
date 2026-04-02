# Model: Share

**Purpose:** Share link granting access to a space

**Storage:** `~/.openclaw/data/ai-spaces/shares.json`

---

## Zod Schema

```typescript
import { z } from "zod";

export const ShareSchema = z.object({
  id: z.string(),
  token: z.string(),
  spaceId: z.string(),
  spacePath: z.string(),
  role: z.enum(["viewer", "editor", "admin"]),
  created: z.string().datetime(),
  expires: z.string().datetime().optional(),
  label: z.string().max(100).optional(),
  revoked: z.boolean().optional(),
  revokedAt: z.string().datetime().optional(),
});

export type Share = z.infer<typeof ShareSchema>;
```

---

## Fields

### `id`

- **Type:** `string`
- **Description:** Unique identifier for this share link
- **Generated as:** 8 random hex bytes
- **Example:** `"a1b2c3d4"`
- **Constraints:**
  - Unique across all shares
  - Used for listing/revoking

### `token`

- **Type:** `string`
- **Description:** Cryptographically random token for URL
- **Generated as:** 32 random bytes, base64url encoded
- **Example:** `"3Kf7Pq9RzT2mYvNcX5bS8wA1eF4gH6jK"`
- **Constraints:**
  - URL-safe
  - High entropy (collision impossible)
  - Never reuse

### `spaceId`

- **Type:** `string`
- **Description:** ID of the space this share grants access to
- **Example:** `"Vacations"`
- **Constraints:**
  - Must match existing space

### `spacePath`

- **Type:** `string`
- **Description:** Absolute path to the space (denormalized for quick access)
- **Example:** `"/home/user/.openclaw/workspace/Vacations"`

### `role`

- **Type:** `"viewer" | "editor" | "admin"`
- **Description:** Permission level granted by this share

#### Viewer Permissions

- View files in space
- Chat with agent (read-only commands)
- Cannot edit files
- Cannot modify space

#### Editor Permissions

- All viewer permissions, plus:
- Edit files in space
- Agent can modify files on behalf of editor
- Chat with agent (all commands)

#### Admin Permissions

- All editor permissions, plus:
- Create new share links
- Revoke share links
- Modify space config (Post-MVP)

### `created`

- **Type:** `Date` (ISO 8601 string in storage)
- **Description:** When the share was created
- **Example:** `"2026-04-01T12:00:00Z"`

### `expires`

- **Type:** `Date | undefined` (ISO 8601 string in storage)
- **Description:** When the share expires
- **Example:** `"2026-04-08T12:00:00Z"`
- **Constraints:**
  - Optional (null = never expires)
  - Must be after `created`

### `label`

- **Type:** `string | undefined`
- **Description:** Human-readable label for owner reference
- **Example:** `"Leah's vacation link"`
- **Constraints:**
  - Optional
  - Max 100 characters

### `revoked`

- **Type:** `boolean | undefined`
- **Description:** Whether the share has been revoked
- **Default:** `false` (not revoked)

### `revokedAt`

- **Type:** `Date | undefined` (ISO 8601 string in storage)
- **Description:** When the share was revoked
- **Example:** `"2026-04-02T10:00:00Z"`
- **Constraints:**
  - Only set if `revoked = true`

---

## Examples

### Editor Share (7-day expiry)

```json
{
  "id": "a1b2c3d4",
  "token": "3Kf7Pq9RzT2mYvNcX5bS8wA1eF4gH6jK",
  "spaceId": "Vacations",
  "spacePath": "/home/user/.openclaw/workspace/Vacations",
  "role": "editor",
  "created": "2026-04-01T12:00:00Z",
  "expires": "2026-04-08T12:00:00Z",
  "label": "Leah's vacation link"
}
```

### Viewer Share (no expiry)

```json
{
  "id": "e5f6g7h8",
  "token": "XyZ123AbC456dEf789GhIjKlMnOpQrSt",
  "spaceId": "Research/NewCar",
  "spacePath": "/home/user/.openclaw/workspace/Research/NewCar",
  "role": "viewer",
  "created": "2026-04-01T14:30:00Z",
  "label": "Tom's research link"
}
```

### Revoked Share

```json
{
  "id": "abc123",
  "token": "OldToken123...",
  "spaceId": "Vacations",
  "spacePath": "/home/user/.openclaw/workspace/Vacations",
  "role": "editor",
  "created": "2026-03-01T10:00:00Z",
  "expires": "2026-03-08T10:00:00Z",
  "revoked": true,
  "revokedAt": "2026-03-05T15:00:00Z"
}
```

---

## Token Security

**Token Generation:**
- 32 bytes of cryptographically random data
- Encoded as base64url (URL-safe)
- 256 bits of entropy
- Collision probability: ~0 (1 in 2^256)

---

## Storage

Shares are stored in `~/.openclaw/data/ai-spaces/shares.json`:

```json
{
  "shares": {
    "a1b2c3d4": {
      "id": "a1b2c3d4",
      "token": "3Kf7...",
      ...
    }
  },
  "byToken": {
    "3Kf7...": "a1b2c3d4"
  }
}
```

**Indices:**
- `shares` by ID (for listing/revoking)
- `byToken` by token (for validation)

---

## Related Models

- [ShareStore](./ShareStore.md) - Storage structure
- [Space](./Space.md) - Space being shared
- [SessionContext](./SessionContext.md) - Session created from share