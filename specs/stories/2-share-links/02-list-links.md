# Story: List Share Links

**Epic:** 2 - Share Links  
**Priority:** MVP  
**Story Points:** 1

---

## As an agent owner

**I want** to see all active share links for a space  
**So that** I can track who has access

---

## Acceptance Criteria

### AC1: CLI Command
**Given** a space exists  
**When** I run `openclaw spaces share list <space-id>`  
**Then** I see all shares for that space

**Syntax:**
```bash
openclaw spaces share list <space-id> [options]

Options:
  --all      Include expired shares
  --format   Output: human, json (default: human)
```

### AC2: Human-Readable Output
**Given** shares exist  
**When** I list them  
**Then** I see:

```
SHARE LINKS FOR: Vacations

ID          ROLE     CREATED              EXPIRES              LABEL
------------------------------------------------------------------------
a1b2c3d4    editor   2026-04-01 12:00     2026-04-08 12:00     Leah's link
e5f6g7h8    viewer   2026-04-01 14:30     never                Tom's link
```

### AC3: Empty List
**Given** no shares exist  
**When** I list them  
**Then** I see:

```
No share links found for space: Vacations

Create one: openclaw spaces share create Vacations
```

### AC4: ExpiredShares
**Given** shares have expired  
**When** I list without `--all`  
**Then** expired shares are hidden

**When** I list with `--all`  
**Then** expired shares shown with `[EXPIRED]` tag:

```
ID          ROLE     CREATED              EXPIRES              LABEL
------------------------------------------------------------------------
a1b2c3d4    editor   2026-04-01 12:00     2026-04-08 12:00     Leah's link
e5f6g7h8    viewer   2026-03-01 10:00     2026-03-08 10:00     [EXPIRED] Old link
```

### AC5: JSON Output
**Given** I use `--format json`  
**Then** output is:

```json
{
  "spaceId": "Vacations",
  "shares": [
    {
      "id": "a1b2c3d4",
      "role": "editor",
      "created": "2026-04-01T12:00:00Z",
      "expires": "2026-04-08T12:00:00Z",
      "label": "Leah's link",
      "expired": false
    },
    {
      "id": "e5f6g7h8",
      "role": "viewer",
      "created": "2026-03-01T10:00:00Z",
      "expires": "2026-03-08T10:00:00Z",
      "label": "Old link",
      "expired": true
    }
  ]
}
```

---

## Technical Notes

### Query Logic
```
function listShares(spaceId, includeExpired):
  allShares = loadFromStorage()
  spaceShares = filter(allShares, s => s.spaceId == spaceId)
  
  if not includeExpired:
    spaceShares = filter(spaceShares, s => s.expires > now || s.expires == null)
  
  return spaceShares
```

---

## Out of Scope (Post-MVP)

- Last access time for each link
- Active session count per link
- Filter by role
- Sort by created/expires