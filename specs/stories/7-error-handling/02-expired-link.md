# Story: Expired Link Handling

**Epic:** 7 - Error Handling  
**Priority:** MVP  
**Story Points:** 2

---

## As a collaborator

**I want** clear feedback when my link expires  
**So that** I know what to do next

---

## Acceptance Criteria

### AC1: Expired Link Detection
**Given** I access a space with expired token  
**When** validating  
**Then**:
- Compare token expiry to current time
- Reject if expired

### AC2: Expired Link UI
**Given** I open expired link  
**When** page loads  
**Then** show:

```
┌────────────────────────────────────┐
│        Share Link Expired          │
│                                    │
│  This share link expired on        │
│  April 8, 2026 at 12:00 PM.       │
│                                    │
│  Please contact the space owner    │
│  for a new link.                  │
│                                    │
│  [Go Back]                         │
└────────────────────────────────────┘
```

### AC3: No Technical Details
**Given** expired link  
**When** showing error  
**Then**:
- Don't show token value
- Don't show space ID (unless generic)
- Don't show system paths

### AC4: Graceful Expiry Check
**Given** active session  
**When** token expires during use  
**Then**:
- Allow current operation to finish
- Show expiry warning on next action: "Your link has expired. Please contact the owner for a new link."
- Disconnect WebSocket gracefully

### AC5: WebSocket Disconnect
**Given** active WebSocket connection  
**When** token expires  
**Then**:
- Server sends expiry event:

```json
{
  "type": "event",
  "event": "session_expired",
  "payload": {
    "reason": "Share link has expired",
    "expires": "2026-04-08T12:00:00Z"
  }
}
```

- Client shows expiry message
- WebSocket closes with code `1008` (Policy Violation)

---

## Technical Notes

### Expiry Check
```typescript
function validateToken(token: string): Share | null {
  const share = shares.byToken.get(token);
  
  if (!share) {
    return null; // Invalid
  }
  
  if (share.revoked) {
    return null; // Revoked (treat as invalid)
  }
  
  if (share.expires && new Date(share.expires) < new Date()) {
    return null; // Expired
  }
  
  return share;
}
```

### Client-Side Expiry Handling
```typescript
// Check expiry before reconnecting
function checkExpiry(expires: string | null): boolean {
  if (!expires) return true;
  return new Date(expires) > new Date();
}

// On WebSocket message
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.event === 'session_expired') {
    showExpiredMessage(data.payload.expires);
    ws.close();
  }
};
```

### Graceful Degradation
```typescript
// On HTTP endpoint
if (share.expires && new Date(share.expires) < new Date()) {
  res.status(410).json({
    error: 'expired',
    message: 'Share link has expired',
    expires: share.expires
  });
  return;
}
```

---

## Out of Scope (Post-MVP)

- Auto-renew expiring links
- Notify owner on expiry
- Grace period after expiry