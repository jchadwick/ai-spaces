# Specification: Authentication

**Epic:** 3 - Authentication

---

## Token-Based Access

**User Story**
Collaborators access a space using only a share link without creating an account.

**Acceptance Checklist**

* [ ] Token extracted from URL `?share=` parameter
* [ ] Token validated against shares.json
* [ ] Valid tokens load Space UI with space info and share info (name, description, path, role, expiry)
* [ ] Expired tokens show friendly error page with expiry date
* [ ] Invalid/revoked tokens show generic invalid link error (don't reveal revocation status)
* [ ] Wrong space token shows error indicating link is for different space
* [ ] Missing token parameter shows "access required" error
* [ ] Tokens are 32 bytes to prevent brute-forcing
* [ ] Valid tokens create session stored in localStorage

**Rules**

* Tokens are single-purpose, revocable by owner, and have configurable expiry
* No sensitive data embedded in tokens themselves
* Error pages are clean, friendly, and branding-consistent
* Revoked tokens return same error as invalid tokens (security)

**Examples**

* `https://spaces.example.com/Vacations?share=3Kf7...` → Token extracted and validated
* Valid token → Space UI loads with role and expiry displayed
* Expired token → Error: "Share Link Expired" with expiry date
* Invalid/revoked token → Error: "Invalid Link"
* Wrong space token → Error: "This share link is for a different space"
* No token → Error: "Access Required"

**Technical Notes**

```javascript
validateAccess(spaceId, token):
  share = shares.byToken.get(token)
  if not share:
    return { error: "invalid" }
  if share.revoked:
    return { error: "invalid" }
  if share.spaceId != spaceId:
    return { error: "wrong_space" }
  if share.expires and share.expires < now():
    return { error: "expired", expires: share.expires }
  space = spaceManager.get(spaceId)
  if not space:
    return { error: "space_not_found" }
  return { valid: true, share: share, space: space }
```

---

## Session Persistence

**User Story**
Collaborators maintain their session across browser refreshes and tab closings.

**Acceptance Checklist**

* [ ] Valid session stored in localStorage with spaceId, token, role, expires
* [ ] Page refresh validates stored token with server before loading UI
* [ ] Reopening URL without token parameter attempts localStorage session restore
* [ ] Expired stored sessions are cleared from localStorage
* [ ] "Leave Space" clears localStorage and disconnects WebSocket
* [ ] Multiple spaces use separate localStorage keys (e.g., `space_session_Vacations`)
* [ ] Session restore shows error page if token no longer valid

**Rules**

* LocalStorage sessions validated with server on restore
* Expired sessions are cleared locally, not restored
* WebSocket reconnects using stored token on page refresh
* Content Security Policy mitigates XSS risks for stored tokens

**Examples**

* Refresh with valid session → Space UI loads
* Refresh with expired session → Error page, localStorage cleared
* Close/reopen tab → Session restored from localStorage if valid
* Click "Leave Space" → localStorage cleared, WebSocket disconnected, goodbye message

**Technical Notes**

```javascript
async function restoreSession(spaceId) {
  const sessionKey = `space_session_${spaceId}`;
  const session = JSON.parse(localStorage.getItem(sessionKey));
  if (!session) return { valid: false, reason: 'no_session' };
  if (session.expires && new Date(session.expires) < new Date()) {
    localStorage.removeItem(sessionKey);
    return { valid: false, reason: 'expired' };
  }
  const response = await fetch(`/spaces/${spaceId}/validate?share=${session.token}`);
  const data = await response.json();
  if (!data.valid) {
    localStorage.removeItem(sessionKey);
    return { valid: false, reason: data.reason };
  }
  return { valid: true, session: session };
}
```

---

## Show Session Info

**User Story**
Collaborators see their access level and session expiry to understand their permissions.

**Acceptance Checklist**

* [ ] Role badge displays in UI header (Viewer, Editor, Admin with icons)
* [ ] Expiry displays as relative time ("Expires in 5 days")
* [ ] No expiry shows "No expiration"
* [ ] Expiry < 24 hours shows warning icon
* [ ] Viewer role disables edit buttons, shows "read-only" indicators
* [ ] Editor role enables all interactions with no badges
* [ ] Clicking role badge opens session info modal with space name, role, expiry, share ID
* [ ] "Leave Space" in modal clears session and shows goodbye page

**Rules**

* Role badges use distinct colors: Viewer (gray), Editor (blue), Admin (purple)
* Expiry displays use relative time format (hours/days)
* Read-only indicators shown in chat input, file tree, and disabled edit buttons

**Examples**

* Viewer sees: "Family Vacations [Viewer 👁️]" with gray badge, disabled edit buttons
* Editor sees: "Family Vacations [Editor ✏️]" with blue badge, full interactions
* Expiry in 5 days → "Expires in 5 days"
* Expiry null → "No expiration"
* Expiry in 3 hours → "Expires in 3 hours ⚠️"
* Click role badge → Modal with space name, role, expiry, share ID, "Leave Space" button

**Technical Notes**

```tsx
function RoleBadge({ role }: { role: 'viewer' | 'editor' | 'admin' }) {
  const icons = { viewer: '👁️', editor: '✏️', admin: '⚙️' };
  const colors = {
    viewer: 'bg-gray-200 text-gray-700',
    editor: 'bg-blue-100 text-blue-700',
    admin: 'bg-purple-100 text-purple-700'
  };
  return (
    <span className={`badge ${colors[role]}`}>
      {icons[role]} {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

function formatExpiry(expires: string | null): string {
  if (!expires) return 'No expiration';
  const diffMs = new Date(expires) - new Date();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `Expires in ${diffHours} hours ⚠️`;
  return `Expires in ${diffDays} days`;
}
```

---

## Out of Scope (Post-MVP)

* Remember me / persistent login
* Multi-device session management
* Account creation from share link
* Password-protected links
* Cross-device session sync
* Session timeout (idle timeout)
* Session list in UI (active sessions)
* Request upgrade (viewer → editor)
* View other active sessions
* Session activity log
* Download my data

---

## Open Questions

None - all scenarios in source documents are consistent.