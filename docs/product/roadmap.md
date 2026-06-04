# Product Roadmap

This roadmap is intentionally lightweight. `tk` is the executable backlog; this document explains sequencing and why work matters.

## Active Bet

See `docs/product/target-state.md`.

## Ordered Work

1. Prove the registered owner-to-registered collaborator invite loop.
2. Prove member-scoped space listing, file browsing, and role-based file editing.
3. Prove scoped chat cannot escape the invited space for a non-owner registered user.
4. Reframe the core collaborator UX around promoted rooms as goal-centered workspaces inside spaces.
5. Harden the repeatable local demo from a clean Docker dev environment.
6. Reassess whether file metadata UX is still the next highest-leverage step after the registered-user demo works.

## Current Backlog Notes

- `aa-7d12 Rooms-first prototype UX migration`: current active epic for replacing the old raw-space-first web UI with the prototype Rooms shell.
- `aa-2e47 Registered-user collaboration demo`: current active epic.
- `aa-ff5e Fix registered-user invite UI flow`: first implementation target because invite creation/redemption is likely the demo blocker.
- `aa-1072 Add invite redemption and membership e2e coverage`: prove the owner-to-collaborator loop.
- `aa-2062 Prove non-owner scoped file and chat boundaries`: prove privacy and role constraints for registered collaborators.
- Promoted Rooms UX: Rooms are goal-centered workspaces where files and chat support the goal. They are currently backed by existing Topics internally until the planned rename.
- `aa-7a13 File Metadata UX`: likely polish unless it becomes necessary for collaborator comprehension in the active demo.

## Parking Lot

- Anonymous access and public share links.
- Real-time collaborative editing.
- File version history.
- Multi-folder spaces.
- Broad multi-runtime work beyond maintaining the adapter boundary.

## Review Cadence

Run a short PM review when:

- Starting a new feature.
- Promoting a parked idea.
- Closing an epic.
- The active bet changes.
- The backlog has more than three open top-level items.
