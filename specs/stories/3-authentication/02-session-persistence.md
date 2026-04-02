# Story: Session Persistence

**Epic:** 3 - Authentication  
**Priority:** MVP  
**Story Points:** 2

---

## As a collaborator

**I want** my session to persist across browser refreshes  
**So that** I don't lose my place

---

## Acceptance Criteria

### AC1: Store Session Locally
**Given** I access a space with a valid token  
**When** the Space UI loads  
**Then** session is stored in browser localStorage:

```javascript
localStorage.setItem('space_session', JSON.stringify({
  spaceId: 'Vacations',
  token: '3Kf7...',
  role: 'editor',
  expires: '2026-04-08T12:00:00Z'
}));
```

### AC2: Restore on Refresh
**Given** I have a stored session  
**When** I refresh the page  
**Then**:
- Retrieve session from localStorage
- Validate token with server
- If valid: Load Space UI
- If invalid/expired: Show error page

### AC3: Restore on Return
**Given** I close the browser tab  
**When** I reopen the URL (without token parameter)  
**Then**:
- Retrieve session from localStorage
- Attempt to restore session
- If valid: Load Space UI
- If invalid: Show "new link required" message

### AC4: Clear on Expiry
**Given** stored session has expired  
**When** I try to restore  
**Then**:
- Clear localStorage
- Show error page
- Don't attempt further restoration

### AC5: Manual Clear
**Given** I want to sign out  
**When** I click "Leave Space"  
**Then**:
- Clear localStorage
- Disconnect WebSocket
- Show "goodbye" message

### AC6: Multiple Spaces
**Given** I have sessions for multiple spaces  
**When** stored locally  
**Then** each space has its own session key:

```javascript
localStorage.setItem('space_session_Vacations', {...});
localStorage.setItem('space_session_Research', {...});
```

---

## Technical Notes

### Session Validation on Restore

```javascript
async function restoreSession(spaceId) {
  const sessionKey = `space_session_${spaceId}`;
  const session = JSON.parse(localStorage.getItem(sessionKey));
  
  if (!session) {
    return { valid: false, reason: 'no_session' };
  }
  
  // Check expiry locally first
  if (session.expires && new Date(session.expires) < new Date()) {
    localStorage.removeItem(sessionKey);
    return { valid: false, reason: 'expired' };
  }
  
  // Validate with server
  const response = await fetch(`/spaces/${spaceId}/validate?share=${session.token}`);
  const data = await response.json();
  
  if (!data.valid) {
    localStorage.removeItem(sessionKey);
    return { valid: false, reason: data.reason };
  }
  
  return { valid: true, session: session };
}
```

### WebSocket Reconnection
On refresh, re-establish WebSocket connection using stored token:

```javascript
const ws = new WebSocket(`wss://spaces.example.com/spaces/${spaceId}/ws?share=${token}`);
```

### Security
- Tokens stored in localStorage are subject to XSS attacks
- Mitigation: Content Security Policy, no inline scripts
- Tokens are revocable server-side
- No passwords or sensitive data in localStorage

---

## Out of Scope (Post-MVP)

- Cross-device session sync
- Session timeout (idle timeout)
- Remember me checkbox (always remember)
- Session list in UI (active sessions)