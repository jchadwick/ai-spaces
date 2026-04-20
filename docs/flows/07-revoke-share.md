# Flow: Revoke Share Link

**Actors:** Owner  
**Trigger:** Owner wants to remove collaborator access

---

## Happy Path

```
[Owner]
   |
   | 1. List share links
   |    openclaw spaces share list Vacations
   |
   v
[Share links shown]
   |
   | SHARE LINKS FOR: Vacations
   | 
   | ID          ROLE     LABEL      EXPIRES
   | ----------------------------------------
   | abc123      editor   Leah       5 days
   | xyz789      viewer   Tom        never
   |
   v
[Owner selects link to revoke]
   |
   | 2. Identify link: abc123 (Leah)
   |
   v
[Owner revokes link]
   |
   | 3. openclaw spaces share revoke Vacations abc123
   |
   v
[Confirmation prompt]
   |
   | Revoke share link 'abc123' for space 'Vacations'?
   | This will immediately disconnect any active sessions.
   | [y/N]
   |
   v
[Owner confirms]
   |
   | 4. y
   |
   v
[Server processes]
   |
   | 5. Mark share as revoked
   |    Update shares.json
   |    Find active sessions using abc123
   |    Disconnect WebSocket connections
   |
   v
[Active sessions disconnected]
   |
   | 6. Send WebSocket event to affected clients
   |    { event: "revoked", payload: { reason: "Share link revoked" } }
   |    Close connection with code 1008
   |
   v
[Success output]
   |
   | Share link revoked: abc123
   | 1 active session disconnected.
   |
   v
[Owner verifies]
   |
   | 7. openclaw spaces share list Vacations
   |
   v
[Link not shown]
   |
   | SHARE LINKS FOR: Vacations
   | 
   | ID          ROLE     LABEL      EXPIRES
   | ----------------------------------------
   | xyz789      viewer   Tom        never
   |
   v
[Flow complete]
```

---

## Error Paths

### E1: Share Not Found

```
[Owner]
   |
   | 1. openclaw spaces share revoke Vacations nonexistent123
   |
   v
[Server checks]
   |
   | 2. Share ID not found
   |
   v
[Error shown]
   |
   | Error: Share 'nonexistent123' not found in space 'Vacations'
   |
   v
[Owner corrects ID]
   |
   | 3. Use correct share ID from list
```

### E2: Wrong Space

```
[Owner]
   |
   | 1. openclaw spaces share revoke Research abc123
   |    (but abc123 belongs to Vacations)
   |
   v
[Server checks]
   |
   | 2. Share belongs to different space
   |
   v
[Error shown]
   |
   | Error: Share 'abc123' belongs to space 'Vacations', not 'Research'
   |
   v
[Owner uses correct space]
   |
   | 3. openclaw spaces share revoke Vacations abc123
```

### E3: Already Revoked

```
[Owner]
   |
   | 1. openclaw spaces share revoke Vacations abc123
   |    (already revoked earlier)
   |
   v
[Server checks]
   |
   | 2. Share already revoked
   |
   v
[Info shown]
   |
   | Share link 'abc123' is already revoked.
   |
   v
[No action taken]
```

---

## Edge Cases

### EC1: Revoke While Active

```
[Leah using link abc123]
   |
   | 1. Chatting, browsing files
   |
   v
[Owner revokes link]
   |
   | 2. openclaw spaces share revoke Vacations abc123
   |
   v
[Server finds session]
   |
   | 3. Session: session-leah-123
   |    Using share: abc123
   |
   v
[WebSocket event sent]
   |
   | 4. Send to Leah's client
   |    { event: "revoked", payload: { reason: "Share link revoked" } }
   |
   v
[Leah's connection closed]
   |
   | 5. WebSocket close (code 1008)
   |
   v
[Leah sees message]
   |
   | ┌────────────────────────────┐
   | │  Access Revoked             │
   | │                              │
   | │  The share link has been    │
   | │  revoked by the owner.       │
   | │                              │
   | │  Please contact the owner   │
   | │  for a new link.             │
   | │                              │
   | │  [OK]                        │
   | └──────────────────────────────┘
   |
   v
[Session terminated]
```

### EC2: Multiple Active Sessions

```
[Multiple collaborators using same link]
   |
   | 1. Leah at home (session-leah-home)
   |    Leah at work (session-leah-work)
   |    Both using share: abc123
   |
   v
[Owner revokes link]
   |
   | 2. openclaw spaces share revoke Vacations abc123
   |
   v
[Both sessions disconnected]
   |
   | 3. Send event to both sessions
   |    Disconnect both
   |
   v
[Output shows count]
   |
   | Share link revoked: abc123
   | 2 active sessions disconnected.
```

### EC3: No Active Sessions

```
[Owner]
   |
   | 1. openclaw spaces share revoke Vacations xyz789
   |    (no active sessions)
   |
   v
[Server revokes]
   |
   | 2. Mark share as revoked
   |    No active sessions found
   |
   v
[Output]
   |
   | Share link revoked: xyz789
   | No active sessions.
```

### EC4: Force Revoke

```
[Owner]
   |
   | 1. openclaw spaces share revoke Vacations abc123 --force
   |    (skip confirmation prompt)
   |
   v
[No prompt]
   |
   | 2. Immediately revoke without asking
   |
   v
[Useful for automation]
   |
   | 3. No confirmation needed
   |    Used in scripts
```

---

## Acceptance Tests

### Test 1: Basic Revoke
```bash
# Create share
SHARE_ID=$(openclaw spaces share create Test --role editor --format json | jq -r '.id')

# Revoke share
openclaw spaces share revoke Test $SHARE_ID --force

# Verify revoked
openclaw spaces share list Test
# Expected: Share not listed
```

### Test 2: Active Session Disconnect
```bash
# Connect with share
TOKEN=$(create_token)
wscat -c "ws://localhost:19000/spaces/Test/ws?share=$TOKEN" &
WS_PID=$!

# Revoke share
openclaw spaces share revoke Test $SHARE_ID --force

# Check WebSocket closed
wait $WS_PID
# Expected: WebSocket closed with code 1008
```

### Test 3: Access After Revoke
```bash
# Revoke share
openclaw spaces share revoke Test $SHARE_ID --force

# Try to access
curl "http://localhost:19000/spaces/Test?share=$TOKEN"
# Expected: Error page "Invalid Share Link"
```

---

## Timing

| Action | Duration |
|--------|----------|
| Revoke share | < 100ms |
| Update storage | < 100ms |
| Disconnect sessions | < 1s |
| Total | < 2s |

---

## Post-Conditions

- Share marked as revoked
- Active sessions disconnected
- Storage updated
- Link inaccessible