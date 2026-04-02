# AI Spaces

**Share portions of your AI agent's workspace with collaborators — they just need a browser.**

---

## What is AI Spaces?

Your AI agent has a workspace full of research, notes, plans, and decisions. But your spouse, family, colleagues — they can't see any of it. They send you texts asking "what did we decide about vacation?" or "which car are we leaning toward?"

**AI Spaces lets you share specific folders from your agent's workspace with specific people.** Your collaborators get a web interface where they can:

- Browse files and folders in the shared space
- Edit documents directly
- Chat with a **scoped context** of your agent — it only knows about that space

The agent sees their edits and messages. You see what they changed. Everyone stays in sync.

---

## The Core Insight

**Spaces are subdirectories of your agent's existing workspace.**

You don't create new workspaces. You don't copy files. You share portions of what your agent already knows:

```
~/.openclaw/workspace/           # Your agent's workspace
├── AGENTS.md                     # Agent's instructions (PRIVATE)
├── MEMORY.md                     # Agent's long-term memory (PRIVATE)
├── Vacations/                    # ← SPACE: shared with family
│   ├── .space/
│   │   └── spaces.json          # Who can access
│   ├── Maine.md
│   └── CostaRica.md
├── Research/
│   └── NewCar/                   # ← SPACE: shared with spouse
│       ├── .space/
│       │   └── spaces.json
│       └── comparison.md
└── Private/                     # NOT shared
    └── secrets.md
```

The agent's private files (`AGENTS.md`, `MEMORY.md`, `Private/`) are never exposed. Only the directories you designate as spaces become shareable.

---

## How It Works

### 1. You create a space

Add a `.space/` directory with configuration to any folder in your agent's workspace. The configuration defines who can access and what they can do.

### 2. You generate a share link

A share link is created that can be sent to collaborators. Links can have expiration times and can be revoked.

### 3. Collaborators open the link

They see:
- **File browser**: Navigate the space's files
- **Markdown editor**: Edit documents directly
- **Chat**: Talk to the agent about the space

The agent responds with knowledge scoped to that space. It can't see your other spaces, your private files, or your agent's full memory.

---

## Architecture

AI Spaces is an **OpenClaw plugin** that:

1. **Discovers spaces** by scanning for `.space/` directories in agent workspaces
2. **Validates share links** (managed byAI Spaces, not OpenClaw)
3. **Enforces path restrictions** via tool hooks — the same agent serves requests, but file access is scoped
4. **Serves a web UI** for collaborators to browse, edit, and chat

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           OpenClaw Gateway                               │
│                                                                          │
│  ┌──────────────────────┐  ┌────────────────────────────────────────┐ │
│  │ Messaging Channels   │  │ AI Spaces Plugin                       │ │
│  │ (WhatsApp, Telegram) │  │ • Space discovery                      │ │
│  └──────────────────────┘  │ • Share link validation                │ │
│                            │ • Tool hook enforcement                 │ │
│                            │ • Web UI serving                       │ │
│                            └────────────────────────────┬───────────┘ │
│                                                         │              │
│  ┌─────────────────────────────────────────────────────▼────────────┐ │
│  │              Agent "main" (full tools)                            │ │
│  │              workspace: ~/.openclaw/workspace                     │ │
│  │                                                                   │ │
│  │  ┌────────────────┐          ┌──────────────────────────────┐    │ │
│  │  │ workspace/      │          │ workspace/Vacations/ [SPACE] │    │ │
│  │  │ (all accessible)│          │ Scoped via tool hooks        │    │ │
│  │  └────────────────┘          └──────────────────────────────┘    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ WebSocket
                          ┌─────────┴─────────┐
                          │ Space UI (browser) │
                          │ • File browser     │
                          │ • Markdown editor  │
                          │ • Chat interface   │
                          └─────────────────────┘
```

---

## Security Model

### What Collaborators Can Do

| Action | Editor | Viewer |
|--------|--------|--------|
| Browse files in space | ✓ | ✓ |
| Edit documents | ✓ | ✗ |
| Chat with agent | ✓ | ✓ |
| See other spaces | ✗ | ✗ |
| Access agent memory | ✗ | ✗ |

### What the Agent Can Do in a Scoped Context

| Capability | Full Agent | Scoped Context |
|------------|------------|----------------|
| Read files in space | ✓ | ✓ |
| Write files in space | ✓ | ✓ (if editor) |
| Read files outside space | ✓ | ✗ |
| Read agent memory | ✓ | ✗ |
| Execute commands | ✓ | ✗ |
| Send messages | ✓ | ✗ |

### Enforcement

- **Path validation**: Tool hooks reject any path outside the space directory
- **Tool filtering**: Only allowed tools (`read`, `write`, `web_search`)
- **Memory isolation**: `AGENTS.md`, `MEMORY.md` never loaded for scoped sessions
- **Share links**: Short-lived tokens managed by AI Spaces, not OpenClaw

---

## Comparison to Alternatives

| Approach | Problem |
|----------|---------|
| Share a Google Doc | Your agent can't see it or edit it |
| Share a Notion page | Your agent can't see it or edit it |
| Forward agent messages | No interactivity, collaborators can't ask follow-ups |
| Give agent access to collaborators | Security nightmare, private data exposure |
| **AI Spaces** | Agent can collaborate, but only in the designated space |

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/README.md`](./docs/README.md) | Detailed overview |
| [`docs/architecture.md`](./docs/architecture.md) | Technical architecture |
| [`docs/openclaw-reference.md`](./docs/openclaw-reference.md) | OpenClaw concepts relevant to AI Spaces |
| [`docs/security.md`](./docs/security.md) | Security model deep-dive |
| [`docs/use-cases.md`](./docs/use-cases.md) | Practical scenarios |

---

## Status

AI Spaces is currently in design phase. See [`docs/architecture.md`](./docs/architecture.md) for the technical specification.

---

*The core insight: Share a portion of your agent's knowledge, not the whole thing.*