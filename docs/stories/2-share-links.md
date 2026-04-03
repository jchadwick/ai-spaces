# Specification: Share Links

**Epic:** 2 - Share Links

---

## Create Share Link

**User Story**  
Generate a shareable link for a space to send to collaborators.

**Acceptance Checklist**

* [ ] Agent calls `POST /api/spaces/{spaceId}/shares` to create share link
* [ ] Request specifies `role` (viewer, editor, admin)
* [ ] Request optionally specifies `expiresAt` (ISO 8601 datetime)
* [ ] Request optionally specifies `label` for tracking
* [ ] Token is 32 bytes cryptographically random, base64url encoded
* [ ] URL format: `https://spaces.example.com/s/{spaceId}?t={token}`
* [ ] Spaces Service creates share record in database
* [ ] Returns share URL and token

**Rules**

* Token uses `crypto.randomBytes(32)` for cryptographic randomness
* URL includes space ID as path component, token as query parameter
* Multiple shares allowed per space (each with unique token)
* Permissions derived from role

**Examples**

```bash
# Create editor share (7-day expiry)
curl -X POST https://spaces.example.com/api/spaces/550e8400-.../shares \
  -H "Content-Type: application/json" \
  -d '{
    "role": "editor",
    "expiresAt": "2026-04-08T00:00:00Z",
    "label": "Leah\'s vacation link"
  }'

# Response
{
  "shareId": "550e8400-e29b-41d4-a716-446655440001",
  "spaceId": "550e8400-e29b-41d4-a716-446655440000",
  "token": "Kf7Pq9RzT2mYvNcX5bS8wA1eF4gH6jK",
  "role": "editor",
  "permissions": ["read", "comment", "edit"],
  "shareUrl": "https://spaces.example.com/s/550e8400-...?t=Kf7Pq9Rz...",
  "label": "Leah's vacation link",
  "expiresAt": "2026-04-08T00:00:00Z",
  "createdAt": "2026-04-01T12:00:00Z"
}
```

---

## List Share Links

**User Story**  
View all active share links for a space to track who has access.

**Acceptance Checklist**

* [ ] Agent calls `GET /api/spaces/{spaceId}/shares` to list shares
* [ ] Optional filter: `?includeExpired=true` to show expired shares
* [ ] Returns array of share metadata (token excluded for security)
* [ ] Each share includes id, role, label, expiresAt, createdAt, revokedAt
* [ ] Expired shares marked with `expired: true`

**Examples**

```bash
# List shares
curl https://spaces.example.com/api/spaces/550e8400-.../shares

# Response
{
  "shares": [
    {
      "shareId": "550e8400-...-001",
      "role": "editor",
      "label": "Leah's vacation link",
      "expiresAt": "2026-04-08T00:00:00Z",
      "createdAt": "2026-04-01T12:00:00Z",
      "revokedAt": null,
      "expired": false
    },
    {
      "shareId": "550e8400-...-002",
      "role": "viewer",
      "label": "Tom's research link",
      "expiresAt": null,
      "createdAt": "2026-04-01T14:30:00Z",
      "revokedAt": null,
      "expired": false
    }
  ]
}
```

---

## Revoke Share Link

**User Story**  
Revoke a share link to control access to spaces.

**Acceptance Checklist**

* [ ] Agent calls `DELETE /api/spaces/{spaceId}/shares/{shareId}` to revoke
* [ ] Spaces Service marks share as revoked in database
* [ ] Active WebSocket sessions using that share are disconnected
* [ ] Sessions receive WebSocket event with reason before disconnection
* [ ] Revoked tokens are invalid for new connections immediately

**Rules**

* Share is marked as revoked, not deleted (for audit trail)
* Revocation stores `revokedAt` timestamp
* Already revoked shares return success (idempotent)

**Examples**

```bash
# Revoke share
curl -X DELETE https://spaces.example.com/api/spaces/550e8400-.../shares/550e8400-...-001

# Response
{
  "success": true,
  "shareId": "550e8400-...-001",
  "sessionsDisconnected": 1
}
```

**WebSocket Event Sent to Sessions**

```json
{
  "type": "event",
  "event": "revoked",
  "payload": {
    "reason": "Share link has been revoked by owner"
  }
}
```

---

## Share Link Validation

**User Story**  
Spaces Service validates share links when collaborators access spaces.

**Acceptance Checklist**

* [ ] Token extracted from URL: `/s/{spaceId}?t={token}`
* [ ] Spaces Service looks up share by token in database
* [ ] Validates: token exists, not revoked, not expired, space matches
* [ ] Valid tokens return space metadata and permissions
* [ ] Invalid/expired/revoked tokens return appropriate error

**Validation Logic**

```typescript
function validateShare(token: string, spaceId: string): ValidationResult {
  const share = await db.shares.findByToken(token);
  
  if (!share) {
    return { valid: false, error: 'invalid_token' };
  }
  
  if (share.revokedAt) {
    return { valid: false, error: 'revoked' };
  }
  
  if (share.expiresAt && share.expiresAt < new Date()) {
    return { valid: false, error: 'expired', expiresAt: share.expiresAt };
  }
  
  if (share.spaceId !== spaceId) {
    return { valid: false, error: 'wrong_space' };
  }
  
  return {
    valid: true,
    share: {
      id: share.id,
      role: share.role,
      permissions: share.permissions,
      spaceId: share.spaceId
    }
  };
}
```

---

## Open Questions

None - stories are consistent with architecture.