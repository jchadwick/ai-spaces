# Specification: Error Handling

**Epic:** 7 - Error Handling

---

## Path Escape Prevention

**User Story**  
Prevent collaborators from accessing files outside their space to protect private data.

**Acceptance Checklist**

* [ ] All paths resolved to absolute paths
* [ ] Relative paths resolved against space root  
* [ ] Symbolic links followed to target and validated
* [ ] Paths outside space root are blocked
* [ ] Error message shows user-friendly text, no technical details
* [ ] Escape attempts logged to security audit

**Rules**

* Normalize all paths before checking containment
* Symlink targets must resolve within space root
* Block with generic message, not technical error

**Examples**

* `../Private/secrets.md` from `/workspace/Vacations` → BLOCKED (escapes space)
* `./subdir/../../Private/secret.md` → BLOCKED (traversal pattern)
* `./Vacations/./../Private` → BLOCKED (obfuscated traversal)
* Symlink to `/workspace/Private` → BLOCKED (target outside space)
* Valid path `./Maine.md` → ALLOWED (inside space root)

---

## Expired Link Handling

**User Story**  
Show clear feedback when share links expire so collaborators know next steps.

**Acceptance Checklist**

* [ ] Expired tokens rejected on validation
* [ ] UI shows expiry date and contact suggestion
* [ ] No technical details (token, space ID, paths) exposed
* [ ] Current operation completes before session disconnects
* [ ] WebSocket sends expiry event before closing

**Rules**

* Check token expiry against current time before access
* Allow active operations to finish before disconnecting
* Show expiry date and next steps, never token value

**Examples**

* Expired link opened → Show "This share link expired on April 8, 2026. Please contact the space owner."
* Token expires mid-session → Complete operation, show warning on next action
* WebSocket expiry event → `{"event": "session_expired", "payload": {"reason": "Share link has expired"}}`

---

## Concurrent Access

**User Story**  
Allow multiple collaborators to access a space without conflicts.

**Acceptance Checklist**

* [ ] Multiple viewers can access simultaneously without blocking
* [ ] All collaborators receive chat messages in real-time
* [ ] Only one editor per file at a time (exclusive lock)
* [ ] Edit conflicts show "locked by another user" with wait option
* [ ] Presence indicator shows active collaborators count
* [ ] File updates notify other viewers automatically

**Rules**

* Viewers and chatters don't conflict or require locking
* Editor locks are file-specific, not space-wide
* Locks auto-expire after 5 minutes if not released
* CRDT merges concurrent edits (Post-MVP)

**Examples**

* Two viewers accessing same space → Both work independently
* Editor tries locked file → Show "Currently being edited. Wait or view read-only copy."
* Three active users → Show "You, Leah, Tom (3 active)"
* Lock file format → `{"file.md": {"locked_by": "session-abc", "expires": "2026-04-01T14:05:00Z"}}`

**Open Questions**

* Story 03 is marked Post-MVP: Should concurrent access be deferred from MVP scope?
* CRDT implementation mentioned but not prioritized: Clarify edit queue vs CRDT preference