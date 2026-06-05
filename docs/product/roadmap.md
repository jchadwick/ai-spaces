# Product Roadmap

This roadmap is intentionally lightweight. `tk` is the executable backlog; this document explains sequencing and why work matters.

## Active Bet

See `docs/product/target-state.md`.

## Ordered Work

1. Fix the top-priority UI migration regressions that block a credible Rooms-first walkthrough.
2. Prove the registered owner-to-registered collaborator invite loop.
3. Prove member-scoped space listing, file browsing, and role-based file editing.
4. Prove scoped chat cannot escape the invited space for a non-owner registered user.
5. Harden the repeatable local demo from a clean Docker dev environment.
6. Reassess whether file metadata UX is still the next highest-leverage step after the registered-user demo works.

## Current Backlog Notes

- `aa-9d54 Restore Rooms content viewers without UI regression`: closed UI regression follow-up; Rooms file panes now use the existing content viewer/editor registry without reintroducing the old file editor shell.
- `aa-c43e Polish authentication and app shell navigation`: first implementation target because login/OAuth friction and duplicated shell controls block any credible walkthrough.
- `aa-2e47 Registered-user collaboration demo`: still the active product bet after the UI migration blockers are cleared.
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
