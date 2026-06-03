# Flow: Invite Registered Collaborator

**Actors:** Owner, registered collaborator
**Trigger:** Owner wants to give another user access to a space

Anonymous/public share links are parked. The current flow creates an invite token that must be redeemed by an authenticated user, producing a `space_members` record.

---

## Happy Path

```mermaid
sequenceDiagram
    participant Owner
    participant Browser
    participant Server
    participant DB
    participant Collaborator

    Owner->>Browser: Open space sharing controls
    Browser->>Server: POST /api/spaces/{spaceId}/invites { role }
    Server->>Server: Verify owner role
    Server->>Server: Generate 32-byte token
    Server->>DB: Store token hash, role, expiry
    DB-->>Server: Invite stored
    Server-->>Browser: Return /invite#token=...
    Browser-->>Owner: Show invite URL
    Owner->>Collaborator: Send invite URL out of band
```

---

## Error Paths

### E1: Caller Is Not Owner

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Server

    User->>Browser: Create invite
    Browser->>Server: POST /api/spaces/{spaceId}/invites
    Server->>Server: Resolve membership role
    Server-->>Browser: 403 Forbidden
    Browser-->>User: Show owner-only action error
```

### E2: Invalid Role

```mermaid
sequenceDiagram
    participant Owner
    participant Browser
    participant Server

    Owner->>Browser: Select unsupported role
    Browser->>Server: POST /api/spaces/{spaceId}/invites
    Server-->>Browser: 400 validation error
    Browser-->>Owner: Show valid roles
```

### E3: Space Not Found

```mermaid
sequenceDiagram
    participant Owner
    participant Browser
    participant Server

    Owner->>Browser: Create invite for missing space
    Browser->>Server: POST /api/spaces/{spaceId}/invites
    Server-->>Browser: 404 Space not found
    Browser-->>Owner: Show missing space error
```

---

## Acceptance Tests

### Test 1: Owner Creates Invite

**Given** an authenticated owner belongs to a space
**When** they create an editor invite
**Then** the server stores only a token hash
**And** the response includes an `/invite#token=...` URL
**And** the raw token is not persisted

### Test 2: Non-Owner Cannot Invite

**Given** an authenticated viewer or editor belongs to a space
**When** they create an invite
**Then** the server returns `403 Forbidden`

### Test 3: Invite Role Is Preserved

**Given** an owner creates a viewer invite
**When** the collaborator redeems it after login
**Then** the collaborator is added as a viewer member

---

## Post-Conditions

- Invite token hash stored in database
- Invite has role and expiration
- Raw invite URL displayed once for owner delivery
- No anonymous access session is created
