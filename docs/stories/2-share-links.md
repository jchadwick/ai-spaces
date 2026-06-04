# Specification: Registered-User Invites and Membership

**Epic:** 2 - Invites and Membership

Anonymous/public share links are not part of the current active bet. The current model is: an owner creates an invite token, a collaborator logs in or registers, the collaborator redeems the invite, and the server records space membership. All subsequent access is based on the authenticated user's membership and role.

---

## Create Invite

**User Story**  
As a space owner, I want to create an invite for a registered collaborator so they can join the space with a specific role.

**Acceptance Checklist**

* [ ] Owner calls `POST /api/spaces/{spaceId}/invites`
* [ ] Request specifies `role` (`viewer`, `editor`, or `owner`)
* [ ] Server requires the caller to be an owner of the space
* [ ] Server generates a 32-byte random token and stores only its SHA-256 hash
* [ ] Server stores the invite expiration
* [ ] Response returns a one-time invite URL using the fragment format `/invite#token={rawToken}`
* [ ] Raw invite token is never persisted in the database

**Rules**

* Invite tokens are a delivery mechanism, not an access session.
* Redeeming an invite converts it into durable space membership for the authenticated user.
* Invite URLs may be delivered out of band; the app should not depend on anonymous link access.
* Tokens are single-use and expire.

**Example**

```bash
curl -X POST https://spaces.example.com/api/spaces/550e8400-.../invites \
  -H "Authorization: Bearer <owner-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "role": "editor" }'
```

```json
{
  "inviteId": "550e8400-e29b-41d4-a716-446655440001",
  "inviteUrl": "https://spaces.example.com/invite#token=64-char-hex-token"
}
```

---

## Redeem Invite

**User Story**  
As a collaborator, I want to accept an invite after logging in so the space appears in my account.

**Acceptance Checklist**

* [ ] Invite page reads the token from the URL fragment and immediately removes it from the address bar
* [ ] If the collaborator is not authenticated, the token is stored in tab-scoped session storage until login
* [ ] Authenticated collaborator calls `POST /api/invites/redeem`
* [ ] Server validates token hash, expiration, and single-use state atomically
* [ ] Server creates or updates `space_members` for the authenticated user
* [ ] Server records who redeemed the invite
* [ ] UI routes the collaborator to Rooms home filtered to the joined space after success (`/spaces?space={spaceId}`)

**Rules**

* A valid invite does not grant access until redeemed by an authenticated user.
* Consumed, expired, or invalid invites all fail without exposing sensitive details.
* If the user already belongs to the space, redemption may update their role to the invite role.

**Example**

```bash
curl -X POST https://spaces.example.com/api/invites/redeem \
  -H "Authorization: Bearer <collaborator-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "token": "64-char-hex-token" }'
```

```json
{
  "success": true,
  "spaceId": "550e8400-e29b-41d4-a716-446655440000",
  "role": "editor"
}
```

---

## List Members

**User Story**  
As a space member, I want to see who has access to the space.

**Acceptance Checklist**

* [ ] Member calls `GET /api/spaces/{spaceId}/members`
* [ ] Server requires the caller to be a member of the space
* [ ] Response includes member email, display name, role, and membership timestamps
* [ ] Raw invite tokens are never returned

---

## Manage Members

**User Story**  
As a space owner, I want to add, remove, or change member roles.

**Acceptance Checklist**

* [ ] Owner can add a registered user with `POST /api/spaces/{spaceId}/members`
* [ ] Owner can update roles with `PATCH /api/spaces/{spaceId}/members/{userId}`
* [ ] Owner can remove users with `DELETE /api/spaces/{spaceId}/members/{userId}`
* [ ] Non-owners receive `403 Forbidden`
* [ ] Server prevents demoting or removing the last owner

**Roles**

| Role | Permissions |
| --- | --- |
| `viewer` | Browse Room files and chat, no file writes |
| `editor` | Browse Room files, chat, create, edit, rename, and delete allowed files |
| `owner` | Editor permissions plus member, invite, and space config management |

---

## Out of Scope

* Anonymous/public share links
* Anonymous access sessions
* Password-protected public links
* Cross-device invite claiming before login
* Invite email delivery
* Bulk member administration
