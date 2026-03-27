# AI Spaces Security

**Security model and implementation details.**

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
| **Compromised Share Link** | Link leaked to unauthorized person | Expiring links, revocation, audit logs |
| **Malicious Prompt** | Prompt injection to extract private data | Scoped context only, no escape hatches |
| **External Attacker** | Try to access spaces without valid link | Token validation, no public endpoints |

### Attack Surfaces

| Surface | Risk | Mitigation |
|---------|------|------------|
| Share links | Guessable tokens | Cryptographically random, sufficiently long |
| WebSocket connection | Unauthorized sessions | Validate token before session creation |
| Tool calls | Path traversal | Canonical paths, resolve and check prefix |
| File operations | Symlink escape | Resolve symlinks before validation |

---

## Authentication Model

### Share Links

Share links are managed entirely by AI Spaces, NOT OpenClaw. This isolation is intentional:

- Collaborators don't need OpenClaw accounts
- OpenClaw knows nothing about collaborator identities
- AI Spaces maintains its own token database
- Links are short-lived and revocable

### Share Link Generation

```bash
# Owner generates a share link
openclaw spaces share create Vacations --role editor --expires 7d
```

```json5
// Output stored in ~/.openclaw/data/ai-spaces/shares.json
{
  shares: {
    "7f3a9b2c": {
      spaceId: "vacations",
      spacePath: "/Users/me/.openclaw/workspace/Vacations",
      agentId: "main",
      role: "editor",
      created: "2026-03-26T00:00:00Z",
      expires: "2026-04-02T00:00:00Z",
      label: "Family share link",
    },
  },
}
```

### Share Link Validation

```typescript
// AI Spaces plugin validates on WebSocket connect
async function validateShare(shareToken: string): Promise<ShareContext | null> {
  const share = await loadShare(shareToken);
  
  if (!share) return null;
  if (share.expires < Date.now()) return null;
  if (share.revoked) return null;
  
  // Verify space still exists and config is valid
  const spaceConfig = await loadSpaceConfig(share.spacePath);
  if (!spaceConfig) return null;
  
  return {
    spaceId: share.spaceId,
    spacePath: share.spacePath,
    agentId: share.agentId,
    role: share.role,
    allowedTools: spaceConfig.agent?.capabilities || ["read", "write"],
    deniedTools: spaceConfig.agent?.denied || ["exec", "messaging"],
  };
}
```

### Role Permissions

| Action | Editor | Viewer |
|--------|--------|--------|
| Browse files in space | ✓ | ✓ |
| Read files | ✓ | ✓ |
| Write files | ✓ | ✗ |
| Delete files | ✓ | ✗ |
| Chat with agent | ✓ | ✓ |
| View agent responses | ✓ | ✓ |
| Invite others | ✗ | ✗ |
| Modify space config | ✗ | ✗ |

---

## Filesystem Isolation

### Implementation

The scoped context's file operations are intercepted by tool hooks in the AI Spaces plugin:

```typescript
// AI Spaces plugin - tool hook
api.on("before_tool_call", async (ctx) => {
  const spaceContext = ctx.sessionMetadata?.spaceContext;
  if (!spaceContext) return; // Not a space session
  
  // Only intercept file operations
  if (ctx.toolName === "read" || ctx.toolName === "write") {
    const requestedPath = ctx.params.path;
    const spaceRoot = spaceContext.spacePath;
    
    // Resolve to absolute paths
    const resolved = path.resolve(spaceRoot, requestedPath);
    const resolvedRoot = path.resolve(spaceRoot);
    
    // Check if path is within space
    if (!resolved.startsWith(resolvedRoot + path.sep)) {
      throw new SecurityError(`Path escapes space: ${requestedPath}`);
    }
    
    // Inject resolved path back into params
    ctx.params.path = resolved;
  }
  
  // Block denied tools
  if (spaceContext.deniedTools.includes(ctx.toolName)) {
    throw new SecurityError(`Tool not allowed in space: ${ctx.toolName}`);
  }
});
```

### Blocked Patterns

```typescript
// Path traversal attempts
"../Private/secrets.md"        // ❌ Blocked (resolves outside space)
"../../.openclaw/MEMORY.md"    // ❌ Blocked
"/etc/passwd"                  // ❌ Blocked (absolute path)

// Symlink attacks
symlink_to_private_file        // ❌ Blocked (resolves outside space)

// Valid paths
"Maine.md"                     // ✓ Allowed
"./Maine.md"                   // ✓ Allowed
"subdir/file.md"               // ✓ Allowed
```

---

## Memory Isolation

### What the Scoped Context Sees

When a collaborator chats in a space, the agent context is loaded differently:

```typescript
// Memory loading for scoped context
async function loadScopedContext(spacePath: string): Promise<MemoryContext> {
  const context = new MemoryContext();
  
  // Load space-specific memory (if exists)
  const spaceMemory = path.join(spacePath, ".space", "SPACE.md");
  if (await fs.exists(spaceMemory)) {
    context.loadFile(spaceMemory);
  }
  
  // Load current session context (ephemeral)
  context.loadSessionContext();
  
  // Explicitly NOT loading:
  // - AGENTS.md (agent's private instructions)
  // - MEMORY.md (agent's long-term memory)
  // - USER.md (user profile)
  // - memory/YYYY-MM-DD.md (daily logs)
  // - ../anything
  
  return context;
}
```

### Memory Boundary Enforcement

| File | Full Agent | Scoped Context |
|------|------------|----------------|
| `AGENTS.md` | ✓ Loaded | ✗ Skipped |
| `MEMORY.md` | ✓ Loaded | ✗ Skipped |
| `USER.md` | ✓ Loaded | ✗ Skipped |
| `memory/*.md` | ✓ Loaded | ✗ Skipped |
| `.space/SPACE.md` | Optional | ✓ Loaded (if exists) |
| Space files | ✓ All | ✓ Only within space |

---

## Tool Restrictions

### Capability Matrix

| Tool | Full Agent | Scoped Context |
|------|------------|----------------|
| `read` | ✅ All files in workspace | ✅ Only within space |
| `write` | ✅ All files in workspace | ✅ Only within space (editor) |
| `exec` | ✅ Shell commands | ❌ Blocked |
| `messaging` | ✅ Email, SMS, etc. | ❌ Blocked |
| `spawn_agents` | ✅ Create subagents | ❌ Blocked |
| `web_search` | ✅ | ⚠️ Configurable per space |
| `browser` | ✅ | ❌ Blocked |
| `credentials` | ✅ | ❌ Blocked |

### Tool Filtering Implementation

```typescript
// Tool filtering in space config
{
  agent: {
    capabilities: ["read", "write", "web_search"],
    denied: ["exec", "messaging", "spawn_agents", "browser", "credentials"],
  },
}
```

Tool hooks enforce these restrictions:

```typescript
api.on("before_tool_call", async (ctx) => {
  const spaceContext = ctx.sessionMetadata?.spaceContext;
  if (!spaceContext) return;
  
  // Check if tool is explicitly denied
  if (spaceContext.deniedTools.includes(ctx.toolName)) {
    throw new SecurityError(`Tool denied: ${ctx.toolName}`);
  }
  
  // Check if tool is in allowed list (if specified)
  if (spaceContext.allowedTools && !spaceContext.allowedTools.includes(ctx.toolName)) {
    throw new SecurityError(`Tool not allowed: ${ctx.toolName}`);
  }
});
```

---

## Session Isolation

### Session Keys

Each collaborator gets a unique session key scoped to the space:

```
space:<spaceId>:<agentId>:<collaboratorId>
```

Examples:
- `space:vacations:main:spouse@example.com`
- `space:newcar:main:teen@example.com`

### Session Properties

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
| Share link created | timestamp, spaceId, role, expires, label |
| Share link accessed | timestamp, shareToken, spaceId, remoteIP |
| Share link revoked | timestamp, spaceId, shareId |
| File read | timestamp, shareToken, spaceId, path |
| File written | timestamp, shareToken, spaceId, path, diffHash |
| Tool call blocked | timestamp, shareToken, spaceId, toolName, reason |

### Log Format

```json
{
  "timestamp": "2026-03-26T14:30:00Z",
  "event": "file_write",
  "spaceId": "vacations",
  "shareToken": "7f3a9b2c",
  "path": "Maine.md",
  "diffHash": "sha256:abc123...",
  "remoteIP": "192.168.1.100"
}
```

### Log Storage

```
~/.openclaw/data/ai-spaces/logs/
├── shares.log          # Share link events
├── access.log          # Access events
└── audit.log           # All security events
```

---

## Network Security

### TLS/HTTPS

- Run behind reverse proxy (Traefik, Caddy, nginx)
- Use Let's Encrypt for automatic TLS
- Or use Tailscale Funnel/Serve for zero-config HTTPS

### CORS Policy

```json5
{
  gateway: {
    controlUi: {
      allowedOrigins: [
        "https://spaces.yourdomain.com",
      ],
    },
  },
}
```

### Rate Limiting

```json5
{
  rateLimits: {
    "space:chat": "30/minute",
    "space:file_read": "100/minute",
    "space:file_write": "20/minute",
    "share:validate": "10/minute",
  },
}
```

---

## Security Checklist

### For Space Owners

- [ ] Review collaborators list regularly
- [ ] Revoke share links when no longer needed
- [ ] Use viewer role when edit is not required
- [ ] Keep private data outside space directories
- [ ] Don't put credentials in space documents
- [ ] Set reasonable expiration times on share links

### For Developers

- [ ] All paths validated and resolved before file operations
- [ ] All share tokens validated before session creation
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

### If a Share Link is Compromised

1. **Revoke immediately:** `openclaw spaces share revoke <spaceId> <shareId>`
2. **Generate new link:** `openclaw spaces share create <spaceId>`
3. **Audit logs:** Check access log for unauthorized access
4. **Review content:** Check if files were modified unexpectedly
5. **Notify collaborators:** Send new link to legitimate users

### If a Scoped Context Escapes

1. **Immediate:** Revoke all share links for the space
2. **Assess:** Check audit logs for what was accessed
3. **Patch:** Fix the isolation bug
4. **Notify:** Alert all space owners with active shares

### If OpenClaw Config is Exposed

1. **Rotate tokens:** Regenerate all share tokens
2. **Review logs:** Check for unauthorized access
3. **Update config:** Change any exposed secrets
4. **Notify:** Alert all affected collaborators

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