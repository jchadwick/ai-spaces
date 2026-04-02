# Story: Show Session Info

**Epic:** 3 - Authentication  
**Priority:** MVP  
**Story Points:** 1

---

## As a collaborator

**I want** to see my access level and expiry  
**So that** I understand my permissions

---

## Acceptance Criteria

### AC1: Role Display
**Given** I'm viewing a space  
**When** I look at the UI header  
**Then** I see my role:

**Viewer:**
```
┌─────────────────────────────────────┐
│ Family Vacations     [Viewer 👁️]    │
└─────────────────────────────────────┘
```

**Editor:**
```
┌─────────────────────────────────────┐
│ Family Vacations     [Editor ✏️]     │
└─────────────────────────────────────┘
```

**Admin:** (if applicable)
```
┌─────────────────────────────────────┐
│ Family Vacations     [Admin ⚙️]      │
└─────────────────────────────────────┘
```

### AC2: Expiry Display
**Given** my share link has an expiry  
**When** I view session info  
**Then** I see:

```
Expires in 5 days
```

**Given** my share link never expires  
**When** I view session info  
**Then** I see:

```
No expiration
```

**Given** my share link expires soon  
**When** < 24 hours remaining  
**Then** I see:

```
Expires in 3 hours ⚠️
```

### AC3: Permission Indicators
**Given** my role is viewer  
**When** I try to interact  
**Then**:
- Edit buttons are disabled (grayed out)
- Chat input shows: "Chat (read-only - view only)"
- File tree shows "View Only" badge

**Given** my role is editor  
**When** I interact  
**Then**:
- Edit buttons are enabled
- Chat input shows: "Chat with agent"
- No badges

### AC4: Session Info Modal
**Given** I click my role badge  
**When** modal opens  
**Then** I see:

```
Session Details
─────────────────────
Space:        Family Vacations
Role:         Editor
Expires:      April 8, 2026 at 12:00 PM
Share ID:     a1b2c3d4
─────────────────────

[Leave Space]
```

### AC5: Leave Space Button
**Given** I click "Leave Space"  
**When** confirming  
**Then**:
- Clear localStorage
- Disconnect WebSocket
- Redirect to goodbye page:

```
You've left the space

Thank you for collaborating!

[Close Window]
```

---

## Technical Notes

### Role Badge Component

```tsx
function RoleBadge({ role }: { role: 'viewer' | 'editor' | 'admin' }) {
  const icons = {
    viewer: '👁️',
    editor: '✏️',
    admin: '⚙️'
  };
  
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
```

### Expiry Calculation

```javascript
function formatExpiry(expires: string | null): string {
  if (!expires) return 'No expiration';
  
  const expiryDate = new Date(expires);
  const now = new Date();
  const diffMs = expiryDate - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffHours < 24) {
    return `Expires in ${diffHours} hours ⚠️`;
  }
  
  return `Expires in ${diffDays} days`;
}
```

---

## Out of Scope (Post-MVP)

- Request upgrade (viewer → editor)
- View other active sessions
- Session activity log
- Download my data