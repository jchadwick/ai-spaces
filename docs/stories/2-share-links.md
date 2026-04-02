# Specification: Share Links

**Epic:** 2 - Share Links

---

## Create Share Link

**User Story**  
Generate a shareable link for a space to send to collaborators.

**Acceptance Checklist**

* [ ] CLI command `openclaw spaces share create <space-id>` creates a share link
* [ ] Accepts `--role` option (viewer, editor, admin, default: editor)
* [ ] Accepts `--expires` option (1h, 24h, 7d, 30d, never, default: 7d)
* [ ] Accepts `--label` option for tracking (default: none)
* [ ] Accepts `--format` option (human, json, default: human)
* [ ] Accepts `--copy` option to copy URL to clipboard
* [ ] Outputs share ID, role, expiration, and URL
* [ ] Token is 32 bytes cryptographically random, base64url encoded
* [ ] URL format: `https://<base-url>/<encoded-space-id>?share=<token>`
* [ ] Space IDs with `/` are URL-encoded in the URL
* [ ] Stores share in `~/.openclaw/data/ai-spaces/shares.json`
* [ ] Validates space exists, role is valid, duration format is valid
* [ ] Returns error for invalid space, role, or duration

**Rules**

* Token uses `crypto.randomBytes(32)` for cryptographic randomness (collision probability: 1 in 2^256)
* Base URL configurable via `OPENCLAW_SPACES_URL` env var; default: `http://localhost:18789/spaces`
* Shares stored separately from space configs to avoid workspace pollution
* Storage includes `shares` object keyed by ID and `byToken` index for lookup
* Multiple links allowed for same space (each with unique ID, token, and optional label)
* Old share links become invalid if space is deleted and recreated (space ID must match existing space)

**Examples**

* `openclaw spaces share create Vacations` → creates editor link with 7d expiration
* `openclaw spaces share create Research --role viewer --expires 1h --copy` → creates viewer link with 1h expiration, copies to clipboard
* `openclaw spaces share create "Research/NewCar"` → URL contains `Research%2FNewCar`
* Invalid role: `Error: Invalid role 'collaborator'. Must be: viewer, editor, admin`
* Invalid duration: `Error: Invalid duration 'foo'. Must be: 1h, 24h, 7d, 30d, never`

---

## List Share Links

**User Story**  
View all active share links for a space to track who has access.

**Acceptance Checklist**

* [ ] CLI command `openclaw spaces share list <space-id>` lists shares
* [ ] Accepts `--all` option to include expired shares
* [ ] Accepts `--format` option (human, json, default: human)
* [ ] Human output shows ID, role, created, expires, label columns
* [ ] Empty list shows helpful message with create command suggestion
* [ ] Expired shares hidden by default (without `--all`)
* [ ] `--all` shows expired shares with `[EXPIRED]` tag
* [ ] JSON output includes `expired` boolean per share

**Rules**

* Filter shares by `spaceId` matching requested space
* By default, filter out shares where `expires < now` (unless `expires == null` for "never")
* Show `[EXPIRED]` tag on expired shares when using `--all`

**Examples**

* `openclaw spaces share list Vacations` → shows active shares for Vacations space
* `openclaw spaces share list Vacations --all` → shows all shares including expired ones
* `openclaw spaces share list Vacations --format json` → JSON output with shares array
* No shares: `No share links found for space: Vacations` followed by create suggestion

---

## Revoke Share Link

**User Story**  
Revoke a share link to control access to spaces.

**Acceptance Checklist**

* [ ] CLI command `openclaw spaces share revoke <space-id> <share-id>` revokes link
* [ ] Accepts `--force` option to skip confirmation prompt
* [ ] Shows confirmation prompt without `--force`
* [ ] Revoked tokens invalid for new connections immediately
* [ ] Active WebSocket sessions disconnected upon revocation
* [ ] Storage updated to mark share as revoked
* [ ] Success output shows share ID and count of disconnected sessions
* [ ] Error if share not found in specified space
* [ ] Error if share belongs to different space
* [ ] WebSocket receives revoked event with reason before disconnection
* [ ] WebSocket closes with code `1008` (Policy Violation)

**Rules**

* Share marked as revoked, not deleted (for audit trail)
* Revocation stores `revoked: true` and `revokedAt` timestamp
* Gateway tracks active sessions by token; on revocation, loop through and disconnect matching tokens
* Already revoked shares show "already revoked" message (not error)
* Expired shares can still be revoked (for cleanup)
* Non-existent shares return error immediately without prompting

**Examples**

* `openclaw spaces share revoke Vacations a1b2c3d4` → prompts: `Revoke share link 'a1b2c3d4' for space 'Vacations'? [y/N]`
* `openclaw spaces share revoke Vacations a1b2c3d4 --force` → revokes without confirmation prompt
* Invalid share: `Error: Share 'xyz123' not found in space 'Vacations'`
* Wrong space: `Error: Share 'a1b2c3d4' belongs to space 'Research', not 'Vacations'`
* Already revoked: `Share link 'a1b2c3d4' is already revoked.`
* Active sessions disconnected: WebSocket receives `{"type": "event", "event": "revoked", "payload": {"reason": "Share link has been revoked by owner"}}`

---

## Open Questions

None identified - all three stories are consistent with no conflicts.