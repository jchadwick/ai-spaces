# Story: Revoke Share Link

**Epic:** 2 - Share Links  
**Priority:** MVP  
**Story Points:** 2

---

## As an agent owner

**I want** to revoke a share link  
**So that** I can control access to my spaces

---

## Acceptance Criteria

### AC1: CLI Command
**Given** a share link exists  
**When** I run `openclaw spaces share revoke <space-id> <share-id>`  
**Then** the link is revoked

**Syntax:**
```bash
openclaw spaces share revoke <space-id> <share-id> [options]

Options:
  --force    Skip confirmation prompt
```

### AC2: Confirmation Prompt
**Given** I revoke a link  
**When** I don't use `--force`  
**Then** I see:

```
Revoke share link 'a1b2c3d4' for space 'Vacations'?
This will immediately disconnect any active sessions.
[y/N]
```

### AC3: Immediate Invalidation
**Given** I revoke a link  
**When** revoked  
**Then:**
- Token is invalid for new connections
- Active WebSocket sessions are disconnected
- Storage is updated

### AC4: Success Output
**Given** I confirm revocation  
**When** complete  
**Then** I see:

```
Share link revoked: a1b2c3d4
1 active session disconnected.
```

### AC5: ErrorCases
**Given** invalid share ID  
**When** I try to revoke  
**Then** I see:

```
Error: Share 'xyz123' not found in space 'Vacations'
```

**Given** share belongs to different space  
**When** I try to revoke  
**Then** I see:

```
Error: Share 'a1b2c3d4' belongs to space 'Research', not 'Vacations'
```

### AC6: Disconnection Behavior
**Given** active sessions using revoked token  
**When** revocation occurs  
**Then** WebSocket connections receive:

```json
{
  "type": "event",
  "event": "revoked",
  "payload": {
    "reason": "Share link has been revoked by owner"
  }
}
```

**Then** WebSocket closes with code `1008` (Policy Violation)

---

## Technical Notes

### Revocation Storage
Share marked as revoked, not deleted (for audit trail):

```json
{
  "shares": {
    "a1b2c3d4": {
      "revoked": true,
      "revokedAt": "2026-04-02T10:00:00Z",
      ...
    }
  }
}
```

### Active Session Detection
Gateway tracks active sessions by token. On revocation:
1. Loop through active sessions
2. Disconnect those matching token
3. Return count in output

### WebSocket Disconnection
Use standard close code `1008` with reason "Share link revoked". Clients should show:

```
This share link has been revoked. Contact the owner for a new link.
```

---

## Edge Cases

### Revoke Non-Existent Share
Immediately return error, no confirmation prompt.

### Revoke Already Revoked
Allow, but show:

```
Share link 'a1b2c3d4' is already revoked.
```

### Revoke Expired Share
Allow revocation of expired shares (for cleanup).

---

## Out of Scope (Post-MVP)

- Bulk revocation
- Scheduled revocation
- Revocation notification email
- Grace period before disconnection