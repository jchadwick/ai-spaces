# Specification: Authentication

**Epic:** 3 - Authentication

---

## Registered User Access

**User Story**
Collaborators access spaces through a registered user account. Invites are redeemed into durable membership and are not used as long-lived access credentials.

**Acceptance Checklist**

* [ ] Login accepts registered email/password credentials
* [ ] Login returns access and refresh tokens plus user profile
* [ ] Protected API routes require a valid bearer token
* [ ] Expired access tokens can be refreshed with a valid refresh token
* [ ] Invalid credentials return a generic authentication error
* [ ] Unauthenticated web users are redirected to login before protected pages load
* [ ] Space access requires authenticated membership in that space
* [ ] Invite redemption requires authentication

**Rules**

* Authentication proves user identity; membership proves space access.
* Invite tokens are single-use and only convert into membership after login.
* Server-side route checks must not trust client-side role state.
* The web app talks only to the server; it never calls the agent runtime directly.

**Examples**

* Valid login → Rooms home lists only rooms in spaces where the user is a member
* User opens `/spaces/{spaceId}/rooms/{roomId}` without membership → `403 Forbidden`
* User clicks invite while logged out → app asks them to log in, then redeems the invite
* Expired invite → invite redemption fails and no membership is created

**Technical Notes**

```typescript
login(email, password) -> { accessToken, refreshToken, user }
GET /api/spaces with bearer token -> spaces where user has membership
GET /api/spaces/:id with bearer token -> 403 unless membership exists
POST /api/invites/redeem with bearer token -> creates space_members row
```

---

## Session Persistence

**User Story**
Registered users remain signed in across browser refreshes and tab closings.

**Acceptance Checklist**

* [ ] Access token, refresh token, and user profile are stored locally
* [ ] App validates stored auth before loading protected UI
* [ ] Expired access token triggers refresh and one retry
* [ ] Failed refresh clears local auth and returns user to login
* [ ] Logout clears local auth
* [ ] Pending invite token is stored only in tab-scoped session storage

**Rules**

* Long-lived app access is account-based, not share-token-based.
* WebSocket connections authenticate with the user's access token.
* Invite tokens should be removed from the URL fragment immediately.

**Examples**

* Refresh with valid session → Rooms home or Room detail loads
* Refresh with expired session → Error page, localStorage cleared
* Close/reopen tab → Session restored from localStorage if valid
* Click "Leave Space" → localStorage cleared, WebSocket disconnected, goodbye message

**Technical Notes**

```typescript
restoreAuth():
  read auth_access_token, auth_refresh_token, auth_user
  validate access token with an authenticated server endpoint
  if access token is expired, refresh once
  if refresh fails, clear local auth and return to login

redeemPendingInvite():
  read pendingInviteToken from sessionStorage
  POST /api/invites/redeem with bearer token
  clear pendingInviteToken after success or terminal failure
```

---

## Show Session Info

**User Story**
Collaborators see their space role so they understand what they can do.

**Acceptance Checklist**

* [ ] Role badge displays in UI header or space chrome
* [ ] Viewer role disables edit buttons, shows "read-only" indicators
* [ ] Editor role enables all interactions with no badges
* [ ] Owner role enables member, invite, and space settings actions
* [ ] Role changes take effect after refresh or next space load

**Rules**

* Role is resolved server-side from membership for every protected request.
* Client role display is informational and must not be an authorization boundary.

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
