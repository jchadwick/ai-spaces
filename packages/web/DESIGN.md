# Web Design System: Rooms Paper Shell

## 1. Direction

The web app now uses the prototype Rooms-first UX. Spaces remain the security and administration boundary, but Rooms are the primary workspace people see and use.

The visual direction is a crisp paper workspace:

- **Inter only.** Use Inter for navigation, labels, body text, headings, controls, and metadata.
- **Paper surfaces.** White and soft neutral grays define depth.
- **Black primary controls.** Primary actions use near-black backgrounds with white text.
- **Purple boundary accent.** Purple identifies security boundaries, shared scope, and restricted/private affordances.
- **Per-space dot colors.** Space identity is carried by small colored dots in the rail, cards, and breadcrumbs.
- **Hairline structure.** Use subtle 1px dividers and modest shadows only for floating overlays.

Do not reintroduce the previous editorial serif, rust CTA, or moss AI palette.

## 2. Product Language

Visible UI uses **Rooms** for the collaborator-facing workspace. Internally, Rooms are currently backed by the existing Topics implementation and `space_topics` data until the planned rename.

Use this language:

| Concept | Visible Copy | Internal Backing |
|---------|--------------|------------------|
| Security/admin boundary | Space | `spaces` |
| Collaborator workspace | Room | promoted `space_topics` row |
| Owner raw filesystem | Space Explorer | server file APIs |
| Private path | Restricted | file metadata `restricted` |

## 3. Routes

The UI route shape is hierarchical:

| Route | Purpose |
|-------|---------|
| `/` | Rooms home |
| `/spaces` | Rooms home across accessible spaces |
| `/spaces/:spaceId` | Owner-only Space Explorer |
| `/spaces/:spaceId/rooms/:roomId` | Room detail |
| `/spaces/:spaceId/rooms/:roomId/*filePath` | Room detail with selected room-relative file |

Legacy `/space/:spaceId/*` and `/room/:spaceId/*` links may be accepted for compatibility, but new navigation should use `/spaces/:spaceId/rooms/:roomId/*filePath`.

## 4. Layout

### App Shell

- Left rail: `72px` fixed width.
- Top bar: `56px` fixed height.
- Main surface: fills remaining viewport height and width.
- Rail contains Rooms home and accessible Space dots.
- Top bar contains product mark, search/filter affordance, role-appropriate actions, and account/admin entry points.

### Rooms Home

- Shows Rooms as the first screen.
- Owner sees all accessible spaces in the rail and can create Rooms.
- Editor/viewer sees Rooms only; clicking a rail space filters Rooms for that Space.
- Room cards use a 16px radius, white paper surface, soft border, concise metadata, member avatars, and visible Space identity.

### Room Detail

- Header shows Room name, Space breadcrumb, member avatars, owner manage action, and chat entry.
- Left file list is scoped to the Room's topic path.
- Document pane keeps editor/viewer internals but uses the Rooms shell chrome.
- Chat opens as a right drawer and stays scoped to the selected Room.

### Owner Space Explorer

- Owner-only raw Space Explorer at `/spaces/:spaceId`.
- Shows the raw file tree, Room badges, restricted badges, context menus, and create/rename/delete/promote/demote/restrict controls.
- Non-owners must be redirected to Rooms home filtered to the requested Space.

## 5. Tokens

Core CSS variables live in `packages/web/src/index.css`.

| Token | Value | Role |
|-------|-------|------|
| `--rooms-paper` | `#ffffff` | Primary content surface |
| `--rooms-paper-2` | `#f7f7f5` | Secondary panels and rails |
| `--rooms-paper-3` | `#efefec` | Inputs and subtle wells |
| `--rooms-ink` | `#1f1f1d` | Primary text |
| `--rooms-ink-soft` | `#3f3f3a` | Secondary readable text |
| `--rooms-muted` | `#73716a` | Metadata and inactive labels |
| `--rooms-muted-2` | `#aaa69b` | Tertiary labels and hints |
| `--rooms-line` | `#e6e3db` | Hairline dividers |
| `--rooms-line-strong` | `#d4d0c6` | Active borders and control outlines |
| `--rooms-boundary` | `#7c3aed` | Space boundary and restricted accent |
| `--rooms-boundary-soft` | `#f0e9ff` | Boundary tint |
| `--rooms-success` | `#168a5b` | Promoted Room state |
| `--rooms-warning` | `#b7791f` | Caution state |
| `--rooms-error` | `#c23b3b` | Destructive/error state |

Per-space colors:

- `--rooms-space-0`
- `--rooms-space-1`
- `--rooms-space-2`
- `--rooms-space-3`

## 6. Components

### Buttons

- Primary: black/ink background, white text, 9px radius.
- Outline: white/transparent paper, 1.5px strong hairline border.
- Ghost: transparent with muted text.
- Icon buttons: square, stable dimensions, lucide icons, hover tint.

### Cards

- Room cards use 16px radius, white surface, `--rooms-line` border, and a light hover lift.
- Do not nest cards inside cards.
- Use chips only for compact state such as Room, Restricted, Owner, Editor, Viewer.

### Modals and Menus

- Modals use 20px radius and a real overlay.
- Context menus use 12px radius, paper background, strong border, and floating shadow.
- Menus must close on outside click and Escape.

### Chat

- Chat is a right drawer, not a separate page.
- Header must show the Room scope.
- Composer uses paper input chrome and a compact send icon button.
- Chat context must be selected via the active Room's backing topic path.

### Restricted Paths

- Restricted files/folders show a lock and "Restricted" badge in owner Space Explorer.
- Restricted paths are never shown to non-owners.
- Restricted paths cannot be promoted to Rooms until sharing is allowed again.

## 7. Role Behavior

| Role | UX |
|------|----|
| Owner | Rooms home, raw Space Explorer, create Room, promote/demote, restrict/allow, members, invites, edit |
| Editor | Rooms home and Room detail only; can read, edit, and chat inside Rooms |
| Viewer | Rooms home and Room detail only; can read and chat inside Rooms; edit controls hidden or disabled |

The prototype Owner/Collaborator toggle is not part of production UI.
