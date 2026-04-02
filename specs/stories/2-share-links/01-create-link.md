# Story: Create Share Link

**Epic:** 2 - Share Links  
**Priority:** MVP  
**Story Points:** 3

---

## As an agent owner

**I want** to generate a shareable link for a space  
**So that** I can send it to collaborators

---

## Acceptance Criteria

### AC1: CLI Command
**Given** a space exists  
**When** I run `openclaw spaces share create <space-id>`  
**Then** a share link is created

**Syntax:**
```bash
openclaw spaces share create <space-id> [options]

Options:
  --role <role>        Role: viewer, editor, admin (default: editor)
  --expires <duration> Expiration: 1h, 24h, 7d, 30d, never (default: 7d)
  --label <text>       Label for tracking (default: none)
  --format <format>    Output: human, json (default: human)
  --copy               Copy URL to clipboard
```

### AC2: Output
**Given** I create a share link  
**When** complete  
**Then** I see:

```
Share created:
  ID: a1b2c3d4
  Role: editor
  Expires: 2026-04-08T12:00:00Z (7 days)
  URL: https://spaces.example.com/Vacations?share=token123abc...

[Link copied to clipboard]
```

### AC3: Token Generation
**Given** I create a share link  
**When** generating the token  
**Then** the token is:
- 32 bytes of cryptographically random data
- Encoded as base64url (no padding)
- Unique across all shares

**Example:**
```
token: 3Kf7Pq9RzT2mYvNcX5bS8wA1eF4gH6jK
```

### AC4: URL Format
**Given** a space ID and token  
**When** constructing the URL  
**Then** format is:

```
https://<base-url>/<encoded-space-id>?share=<token>
```

**Examples:**
- `https://spaces.example.com/Vacations?share=3Kf7...`
- `https://spaces.example.com/Research%2FNewCar?share=XyZ...`

### AC5: Storage
**Given** a share link is created  
**When** stored  
**Then** saved to `~/.openclaw/data/ai-spaces/shares.json`

**Format:**
```json
{
  "shares": {
    "a1b2c3d4": {
      "id": "a1b2c3d4",
      "token": "3Kf7Pq9RzT2mYvNcX5bS8wA1eF4gH6jK",
      "spaceId": "Vacations",
      "spacePath": "/home/user/.openclaw/workspace/Vacations",
      "role": "editor",
      "created": "2026-04-01T12:00:00Z",
      "expires": "2026-04-08T12:00:00Z",
      "label": "Leah's vacation link"
    }
  },
  "byToken": {
    "3Kf7Pq9RzT2mYvNcX5bS8wA1eF4gH6jK": "a1b2c3d4"
  }
}
```

### AC6: Validation
**Given** I create a share link  
**When** validating  
**Then** check:
- Space exists
- Role is valid (viewer, editor, admin)
- Duration format is valid

**Errors:**
```
Error: Space 'Vacations' not found
Error: Invalid role 'collaborator'. Must be: viewer, editor, admin
Error: Invalid duration 'foo'. Must be: 1h, 24h, 7d, 30d, never
```

---

## Expiration Durations

| Input | Duration |
|-------|----------|
| `1h` | 1hour |
| `24h` | 24 hours (1 day) |
| `7d` | 7 days (default) |
| `30d` | 30 days |
| `never` | No expiration |

---

## Technical Notes

### Token Uniqueness
Uses `crypto.randomBytes(32)` for cryptographic randomness. Collision probability: 1 in 2^256.

### URL Construction
- Base URL: Configurable via `OPENCLAW_SPACES_URL` env var
- Default: `http://localhost:18789/spaces`
- Space IDs with `/` are URL-encoded: `Research/NewCar` → `Research%2FNewCar`

### Storage Location
Shares stored separately from space configs to avoid workspace pollution. Location: `~/.openclaw/data/ai-spaces/shares.json`

---

## Edge Cases

### Multiple Links for Same Space
**Q:** Can I create multiple share links for one space?  
**A:** Yes. Each has unique ID, token, and optional label.

**Use Case:** Different links for different collaborators (Leah's link, Tom's link)

### Reusing Space Names
**Q:** What if I delete and recreate a space?  
**A:** Old share links are invalid (space ID must match existing space). Clean up manually.

---

## Out of Scope (Post-MVP)

- Share link for multiple spaces
- Password-protected links
- One-time use links
- Revocation notifications