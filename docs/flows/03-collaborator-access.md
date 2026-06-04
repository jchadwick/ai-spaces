# Flow: Registered Collaborator Access

**Actors:** Collaborator
**Trigger:** Collaborator receives an invite URL and opens it

The invite token is not an access credential. It is redeemed by a logged-in user and converted into space membership. After redemption, all access uses the user's normal authenticated session.

---

## Happy Path

```mermaid
sequenceDiagram
    participant Collaborator
    participant Browser
    participant Server
    participant DB
    participant WebSocket

    Collaborator->>Browser: Open /invite#token=...
    Browser->>Browser: Read token and remove fragment from URL
    Browser->>Server: POST /api/invites/redeem with bearer token
    Server->>DB: Atomically mark invite consumed if valid
    Server->>DB: Upsert space_members row
    DB-->>Server: Membership created
    Server-->>Browser: { spaceId, role }
    Browser->>Server: GET /api/spaces
    Server->>DB: Resolve member-scoped spaces
    Server-->>Browser: Accessible spaces and userRole values
    Browser->>Server: GET /api/spaces/{spaceId}/rooms
    Server->>DB: Resolve promoted rooms visible to role
    Server-->>Browser: Rooms for joined space
    Browser->>WebSocket: Connect /ws/spaces/{spaceId} with bearer token
    WebSocket->>DB: Resolve membership role
    WebSocket-->>Browser: Scoped ACP connection established
    Browser-->>Collaborator: Show Rooms home and Room detail links
```

---

## Login-Required Path

```mermaid
sequenceDiagram
    participant Collaborator
    participant Browser
    participant Server

    Collaborator->>Browser: Open /invite#token=... while logged out
    Browser->>Browser: Store token in sessionStorage
    Browser-->>Collaborator: Prompt for login
    Collaborator->>Browser: Log in
    Browser->>Server: POST /api/invites/redeem
    Server-->>Browser: { spaceId, role }
    Browser-->>Collaborator: Joined space and redirected to Rooms home
```

---

## Error Paths

### E1: Invalid, Expired, or Consumed Invite

```mermaid
sequenceDiagram
    participant Collaborator
    participant Browser
    participant Server

    Collaborator->>Browser: Open stale invite
    Browser->>Server: POST /api/invites/redeem
    Server-->>Browser: 400 Invalid, expired, or already-used invite
    Browser-->>Collaborator: Show invite error
```

### E2: User Is Not a Member

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Server

    User->>Browser: Open /spaces/{spaceId}/rooms/{roomId}
    Browser->>Server: GET /api/spaces/{spaceId}
    Server->>Server: Resolve membership
    Server-->>Browser: 403 Forbidden
    Browser-->>User: Show access denied
```

### E3: WebSocket Authentication Fails

```mermaid
sequenceDiagram
    participant Browser
    participant WebSocket

    Browser->>WebSocket: Connect without valid bearer token
    WebSocket-->>Browser: Close 1008 Authentication required
    Browser-->>Browser: Show disconnected state and retry after auth refresh
```

---

## Acceptance Tests

### Test 1: Invite Redemption Creates Membership

**Given** a valid invite and an authenticated collaborator
**When** the collaborator redeems the invite
**Then** the server creates a membership row
**And** the collaborator lands on `/spaces?space={spaceId}`
**And** the collaborator can load promoted Rooms for that space

### Test 2: Space List Is Member-Scoped

**Given** two registered users with different memberships
**When** each calls `GET /api/spaces`
**Then** each sees only spaces where they have membership

### Test 3: WebSocket Requires Authenticated Membership

**Given** a registered user without membership
**When** they connect to `/ws/spaces/{spaceId}`
**Then** the server rejects the connection

---

## Post-Conditions

- Invite token removed from URL
- Invite marked consumed
- Collaborator has durable space membership
- Collaborator starts from Rooms home
- File and chat access use normal authenticated authorization
