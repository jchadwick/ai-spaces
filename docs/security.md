# AI Spaces Security

**Security model for AI Spaces.**

---

## Security Principles

1. **Principle of Least Privilege:** Scoped contexts get only the access they need
2. **Defense in Depth:** Multiple layers of isolation (filesystem, memory, tools, session)
3. **Fail Closed:** Any ambiguity or error defaults to denying access
4. **Audit Trail:** All actions logged and attributable

---

## Threat Model

### ThreatActors

| Actor | Concern | Mitigation |
|-------|---------|------------|
| **Collaborator** | Access data they shouldn't | Path enforcement, role-based permissions |
| **Compromised Invite Link** | Invite leaked before redemption | Single-use expiring invite tokens, registered-user redemption, audit logs |
| **Malicious Prompt** | Prompt injection to extract private data | Scoped context only, no escape hatches |
| **External Attacker** | Try to access spaces without membership | JWT validation, membership checks, no direct web-to-agent path |

### Attack Surfaces

| Surface | Risk | Mitigation |
|---------|------|------------|
| Invite links | Guessable or leaked tokens | Cryptographically random, sufficiently long, single-use, stored hashed |
| WebSocket connection | Unauthorized sessions | Validate JWT and space membership before session creation |
| Tool calls | Path traversal | Canonical paths, resolve and check prefix |
| File operations | Symlink escape | Resolve symlinks before validation |

---

## Authentication Model

### Registered Users and Invites

Authentication, membership, and invites are managed entirely by AI Spaces, not OpenClaw. This isolation is intentional:

- Collaborators do not need OpenClaw accounts
- OpenClaw does not own collaborator identity or authorization
- AI Spaces stores users, roles, memberships, and invite hashes
- Invites are short-lived, single-use claims into registered membership

### How Registered Invites Work

1. Owner creates a space and defines who can access it
2. Owner generates an invite with role and expiration
3. AI Spaces stores only a hash of the invite token
4. Collaborator opens the invite link in browser
5. Collaborator logs in or registers
6. Invite redemption creates or updates a `space_members` row
7. Space UI and WebSocket calls use the collaborator's authenticated session
8. All subsequent operations are scoped to that user's role in that space

### Role Permissions

| Action | Owner | Editor | Viewer |
|--------|-------|--------|--------|
| Browse files in space | ✓ | ✓ | ✓ |
| Read files | ✓ | ✓ | ✓ |
| Write files | ✓ | ✓ | ✗ |
| Delete files | ✓ | ✓ | ✗ |
| Chat with agent | ✓ | ✓ | ✓ |
| View agent responses | ✓ | ✓ | ✓ |
| Invite others | ✓ | ✗ | ✗ |
| Manage members | ✓ | ✗ | ✗ |
| Modify space config | ✓ | ✗ | ✗ |

---

## Filesystem Isolation

### Path Validation

When a collaborator's tool call accesses a file:

1. Resolve the requested path to an absolute path
2. Resolve the space root to an absolute path
3. Verify the requested path starts with the space root
4. Reject if path escapes the space (including `..`, symlinks)

### What Must Be Blocked

| Pattern | Why It's Blocked |
|---------|------------------|
| `../Private/secrets.md` | Path traversal outside space |
| `/etc/passwd` | Absolute path outside space |
| Symlink to external file | Resolves outside space |
| `.private/` files | Convention for private files within space |

---

## Memory Isolation

### What the Scoped Context Sees

When a collaborator chats in a space, the agent context is loaded differently:

| File | Full Agent | Scoped Context |
|------|------------|----------------|
| `AGENTS.md` | ✓ Loaded | ✗ Skipped |
| `MEMORY.md` | ✓ Loaded | ✗ Skipped |
| `USER.md` | ✓ Loaded | ✗ Skipped |
| `memory/*.md` | ✓ Loaded | ✗ Skipped |
| `.space/SPACE.md` | Optional | ✓ Loaded (if exists) |
| Space files | ✓ All | ✓ Only within space |

### Why This Matters

The agent's `AGENTS.md` might contain sensitive instructions. The agent's `MEMORY.md` might contain private notes. These are never loaded for scoped contexts.

---

## Tool Restrictions

### Capability Matrix

| Tool | Full Agent | Scoped Context |
|------|------------|----------------|
| `read` | ✓ All files in workspace | ✓ Only within space |
| `write` | ✓ All files in workspace | ✓ Only within space (editor) |
| `exec` | ✓ Shell commands | ✗ Blocked |
| `messaging` | ✓ Email, SMS, etc. | ✗ Blocked |
| `spawn_agents` | ✓ Create subagents | ✗ Blocked |
| `web_search` | ✓ | ⚠️ Configurable per space |
| `browser` | ✓ | ✗ Blocked |
| `credentials` | ✓ | ✗ Blocked |

### Enforcing Tool Restrictions

Tool hooks intercept each call:

- Is the tool in the denied list? → Block
- Is the tool in the allowed list (if specified)? → Check
- Does the operation involve file paths? → Validate path is within space

---

## Session Isolation

### Session Keys

Each collaborator gets a unique session key scoped to the space:

```
space:<spaceId>:<agentId>:<userId>
```

### Properties

| Property | Behavior |
|----------|----------|
| Isolation | Collaborators don't see each other's chat history |
| Context | Session context is scoped to space |
| Expiry | Sessions follow OpenClaw's session reset policy |
| Audit | All actions logged with collaborator ID |

---

## Audit Logging

### What Gets Logged

| Event | Fields |
|-------|--------|
| Invite created | timestamp, spaceId, ownerUserId, role, expires |
| Invite redeemed | timestamp, spaceId, inviteId, userId, role |
| Member role changed | timestamp, spaceId, actorUserId, targetUserId, role |
| Member removed | timestamp, spaceId, actorUserId, targetUserId |
| File read | timestamp, userId, spaceId, path |
| File written | timestamp, userId, spaceId, path |
| Tool call blocked | timestamp, userId, spaceId, toolName, reason |

---

## Network Security

### TLS/HTTPS

- Run behind reverse proxy (Traefik, Caddy, nginx)
- Use Let's Encrypt for automatic TLS
- Or use Tailscale Funnel/Serve for zero-config HTTPS

### Rate Limiting

Appropriate rate limits should be configured for:
- Chat messages per minute
- File read operations per minute
- File write operations per minute
- Share link validations per minute

---

## Security Checklist

### For Space Owners

- [ ] Review collaborators list regularly
- [ ] Avoid sending invites to public channels
- [ ] Use viewer role when edit is not required
- [ ] Keep private data outside space directories
- [ ] Don't put credentials in space documents
- [ ] Set reasonable expiration times on invites

### For Developers

- [ ] All paths validated and resolved before file operations
- [ ] All protected routes validate JWT and membership before returning space data
- [ ] Invite tokens are stored hashed, single-use, and expired
- [ ] All inputs sanitized before rendering
- [ ] All tool calls intercepted for scoped contexts
- [ ] No secrets in logs

### For Deployment

- [ ] HTTPS enabled (reverse proxy)
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] Regular security updates
- [ ] Backup/recovery tested

---

## Incident Response

### If an Invite Link is Compromised

1. If not redeemed, expire or delete the invite immediately
2. If redeemed by the wrong user, remove that membership immediately
3. Audit file, chat, and member-change activity for the affected space
4. Check if files were modified unexpectedly
5. Generate a new invite for the intended collaborator

### If a Scoped Context Escapes

1. Disable new invites for the space
2. Check audit logs for what was accessed
3. Fix the isolation bug
4. Rotate affected sessions and notify affected members

---

## Comparison to Alternative Approaches

| Approach | Security Gap |
|----------|--------------|
| Share full workspace | Private data exposure |
| Forward agent messages | No interactivity, follow-ups visible |
| Shared account | No audit trail, credential sharing |
| Separate agent instance | State divergence, sync issues |
| **AI Spaces** | Scoped by design, isolated by default |

---

*Security model for AI Spaces.*
