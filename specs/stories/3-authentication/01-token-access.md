# Story: Token-Based Access

**Epic:** 3 - Authentication  
**Priority:** MVP  
**Story Points:** 3

---

## As a collaborator

**I want** to access a space using only a share link  
**So that** I don't need to create an account

---

## Acceptance Criteria

### AC1: Open Share Link
**Given** I have a share link  
**When** I open `https://spaces.example.com/Vacations?share=3Kf7...`  
**Then**:
- Token extracted from URL parameter
- Token validated against shares.json
- If valid: Space UI loads
- If invalid: Error page

### AC2: Valid Token
**Given** token is valid and not expired  
**When** I access the space  
**Then**:
- Retrieve space info (name, description, path)
- Retrieve share info (role, expiry)
- Render Space UI with full access

### AC3: Expired Token
**Given** token has expired  
**When** I try to access  
**Then** show error page:

```
Share Link Expired

This share link expired on April 8, 2026.

Please contact the space owner for a new link.

[Copy Owner Email]
```

**Design:**
- Clean, friendly error page
- No technical details
- Branding consistent with Space UI

### AC4: Invalid Token
**Given** token doesn't exist in shares.json  
**When** I try to access  
**Then** show error page:

```
Invalid Link

This share link is not valid.

Please check the link or contact the space owner.

[Go Back]
```

### AC5: Wrong Space
**Given** token belongs to different space  
**When** URL has mismatched space ID  
**Then** show error page:

```
Invalid Link

This share link is for a different space.

[Go Back]
```

### AC6: No Token Parameter
**Given** URL has no `?share=` parameter  
**When** I try to access  
**Then** show error page:

```
Access Required

You need a share link to access this space.

Please contact the space owner for a link.

[Go Back]
```

### AC7: Revoked Token
**Given** token has been revoked  
**When** I try to access  
**Then** show same error as invalid token (don't reveal it was revoked)

---

## Technical Notes

### Token Validation Sequence

```
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
  
  return { 
    valid: true,
    share: share,
    space: space
  }
```

### Session Storage
Valid tokens create a session stored in localStorage:

```javascript
localStorage.setItem('space_session', JSON.stringify({
  spaceId: 'Vacations',
  token: '3Kf7...',
  role: 'editor',
  expires: '2026-04-08T12:00:00Z'
}));
```

### Security Considerations
- Tokens are long (32 bytes) to prevent brute-forcing
- Tokens are single-purpose (no user accounts)
- Tokens are revocable by owner
- Tokens have configurable expiry
- No sensitive data in tokens themselves

---

## Out of Scope (Post-MVP)

- Remember me / persistent login
- Multi-device session management
- Account creation from share link
- Password-protected links