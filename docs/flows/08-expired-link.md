# Flow: Expired Link

**Actors:** Collaborator  
**Trigger:** Collaborator accesses space with expired link

---

## Happy Path (Pre-Expiry)

```
[Collaborator]
   |
   | 1. Access space with valid link
   |    Link expires: 2026-04-08 12:00
   |    Current time: 2026-04-01 12:00
   |
   v
[Server validates]
   |
   | 2. Check token
   |    Check expiry
   |    Result: VALID (7 days remaining)
   |
   v
[Access granted]
   |
   | 3. Session created
   |    UI loaded
   |
   v
[Expiry shown]
   |
   | ┌── Family Vacations [Editor]──┐
   | │ Expires in 7 days              │
   | └───────────────────────────────┘
```

---

## Happy Path (Post-Expiry)

```
[Collaborator]
   |
   | 1. Access space with expired link
   |    Link expired: 2026-04-01 12:00
   |    Current time: 2026-04-02 12:00
   |
   v
[Server validates]
   |
   | 2. Check token
   |    Check expiry
   |    Result: EXPIRED
   |
   v
[Error page rendered]
   |
   | 3. Return HTTP 410 (Gone)
   |    Render error HTML
   |
   v
[Browser shows error]
   |
   | ┌────────────────────────────────────┐
   | │        Share Link Expired          │
   | │                                    │
   | │  This share link expired on        │
   | │  April 1, 2026 at 12:00 PM.       │
   | │                                    │
   | │  Please contact the space owner   │
   | │  for a new link.                   │
   | │                                    │
   | │  [Go Back]                         │
   | └────────────────────────────────────┘
   |
   v
[Flow complete]
```

---

## Error Paths

### E1: During Active Session

```
[Collaborator]
   |
   | 1. Using space
   |    Link expires: 2026-04-01 12:00
   |    Session started: 11:30
   |
   v
[Time passes]
   |
   | 2. Current time reaches 12:00
   |    Link expires during session
   |
   v
[Session continues (grace)]
   |
   | 3. Session remains active
   |    No immediate disconnect
   |
   v
[Next action]
   |
   | 4. Try to send message or load file
   |
   v
[Server checks expiry]
   |
   | 5. Token expired
   |
   v
[WebSocket event]
   |
   | 6. Send expiry event
   |    { event: "session_expired", payload: { expires: "2026-04-01T12:00:00Z" } }
   |
   v
[Connection closed]
   |
   | 7. WebSocket close (code 1008)
   |
   v
[Error shown]
   |
   | ┌──────────────────────────────────┐
   | │  Session Expired                  │
   | │                                    │
   | │  Your share link has expired.     │
   | │                                    │
   | │  Please contact the owner for     │
   | │  a new link.                       │
   | │                                    │
   | │  [OK]                              │
   | └──────────────────────────────────┘
```

### E2: Near Expiry Warning

```
[Collaborator]
   |
   | 1. Using space
   |    Link expires: 2026-04-08 12:00
   |    Current time: 2026-04-08 11:00
   |    (1 hour remaining)
   |
   v
[UI shows warning]
   |
   | ┌── Family Vacations [Editor]──┐
   | │ ⚠️ Expires in 1 hour           │
   | └───────────────────────────────┘
   |
   v
[Toast notification]
   |
   | 💡 Your link expires in 1 hour.
   |    Ask the owner for a new link.
   |
   v
[User takes action]
   |
   | 2. Save work, copy important content
   |
   v
[Expiry passes]
   |
   | 3. Session terminated
```

---

## Edge Cases

### EC1: Never Expires

```
[Collaborator]
   |
   | 1. Access space with never-expiring link
   |
   v
[No expiry shown]
   |
   | ┌── Family Vacations [Editor]──┐
   | │ No expiration                  │
   | └───────────────────────────────┘
   |
   v
[Link valid indefinitely]
   |
   | 2. Remains valid until revoked
```

### EC2: Refresh After Expiry

```
[Collaborator]
   |
   | 1. Active session
   |    Link expires
   |    Session terminated
   |
   v
[Refresh page]
   |
   | 2. Refresh browser
   |
   v
[Token checked]
   |
   | 3. Validate token from localStorage
   |    Result: EXPIRED
   |
   v
[Error shown]
   |
   | 4. Same error page as new access
```

### EC3: Owner Extends Link

```
[Collaborator]
   |
   | 1. Link expired
   |    Contacted owner
   |
   v
[Owner extends]
   |
   | 2. Owner creates new link
   |    openclaw spaces share create Vacations --expires 30d
   |
   v
[New link sent]
   |
   | 3. New link: ...?share=newtoken123
   |
   v
[Collaborator accesses]
   |
   | 4. New session with new token
   |    Valid for 30 days
```

### EC4: Clock Skew

```
[Collaborator in different timezone]
   |
   | 1. Link expires: 2026-04-08 12:00 UTC
   |    Collaborator sees: 2026-04-08 08:00 EST
   |    (timezone difference)
   |
   v
[Server uses UTC]
   |
   | 2. Server compares expiry (UTC) vs now (UTC)
   |    No timezone confusion
   |
   v
[Client displays local]
   |
   | 3. Client shows: "Expires April 8 at 8:00 AM"
   |    (converted to local time)
```

---

## Acceptance Tests

### Test 1: Expired Token
```bash
# Create token with past expiry
openclaw spaces share create Test --expires -1d --format json
# (or manually edit shares.json with past date)

# Access with expired token
curl "http://localhost:19000/spaces/Test?share=$TOKEN"

# Expected: HTTP 410 with error page
```

### Test 2: Valid Token
```bash
# Create token with future expiry
openclaw spaces share create Test --expires 7d --format json

# Access with valid token
curl "http://localhost:19000/spaces/Test?share=$TOKEN"

# Expected: HTTP 200 with Space UI
```

### Test 3: During Session
```bash
# Connect with valid token
wscat -c "ws://localhost:19000/spaces/Test/ws?share=$TOKEN" &

# Manually expire token
openclaw spaces share expire Test $SHARE_ID

# Send message
# Expected: WebSocket closes with expiry event
```

---

## Timing

| Event | Duration |
|-------|----------|
| Token validation | < 50ms |
| Expiry check | < 10ms |
| Error page render | < 100ms |
| Session notice (during use) | Immediate |

---

## Post-Conditions

- Token marked as expired (read-only)
- Session terminated (if active)
- Error page shown
- No new access granted