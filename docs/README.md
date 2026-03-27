# AI Spaces

**Share your agent's work with anyone — they just need a browser.**

---

## The Problem

AI agents are silos. They talk to *you*, not your *people*. But real decisions — vacations, cars, houses — are multi-stakeholder. Your agent has information that needs to flow OUT. Your collaborators (spouse, family, friends) have input that needs to flow IN.

**Current state:** Your agent knows you're looking at a Toyota RAV4. Your spouse doesn't. They have opinions that never reach the agent.

**Desired state:** Portions of your agent's knowledge are *shared* and *editable* by collaborators.

---

## The Solution: AI Spaces

**Any folder in your agent'sworkspace can become an AI Space** — a shareable, collaborative zone where humans and a scoped agent context work together.

```
Agent Workspace              # Your agent's existing workspace
├── AGENTS.md                # Agent instructions (PRIVATE)
├── MEMORY.md                # Long-term memory (PRIVATE)
├── Vacations/               # ← AI Space (shared with family)
│   ├── .space/
│   │   └── spaces.json     # Access control
│   ├── Maine.md
│   └── CostaRica.md
├── Research/
│   └── NewCar/              # ← AI Space (shared with spouse)
│       ├── .space/
│       │   └── spaces.json
│       └── comparison.md
└── Private/                 # ← NOT shared
    └── secrets.md
```

The key insight: **you're sharing part of your agent's existing knowledge**, not creating a new workspace.

---

## How Spaces Are Defined

### Per-Space Configuration

Create `.space/spaces.json` in any directory:

```json5
// Vacations/.space/spaces.json
{
  name: "Family Vacations",
  description: "Shared vacation planning with family",
  collaborators: [
    { email: "spouse@example.com", role: "editor", name: "Leah" },
    { email: "teen@example.com", role: "viewer", name: "Allie" },
  ],
  agent: {
    capabilities: ["read", "write", "web_search"],
    denied: ["exec", "messaging"],
  },
}
```

### Workspace-Root Configuration

Or manage all spaces from the workspace root:

```json5
// ~/.openclaw/workspace/spaces.json
{
  spaces: {
    "Vacations": {
      name: "Family Vacations",
      collaborators: [...],
    },
    "Research/NewCar": {
      name: "New Car Search",
      collaborators: [...],
    },
  },
}
```

Both formats are supported. Per-space `.space/spaces.json` takes precedence.

---

## The Architecture

AI Spaces is an **OpenClaw plugin** that integrates with the OpenClaw Gateway.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        OpenClaw Gateway                                 │
│                     (WebSocket server :18789)                            │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                      Plugins & Channels                             ││
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────────────┐││
│  │  │ WhatsApp  │ │ Telegram  │ │ Discord   │ │ AI Spaces             │││
│  │  │ channel   │ │ channel   │ │ channel   │ │ • Space discovery     │││
│  │  └───────────┘ └───────────┘ └───────────┘ │ • Share link auth     │││
│  │                                            │ • Tool hook scoping    │││
│  │                                            │ • Web UI serving       │││
│  │                                            └───────────┬───────────┘││
│  └────────────────────────────────────────────────┼────────────────────┘│
│                                                   │                     │
│  ┌────────────────────────────────────────────────▼───────────────────┐│
│  │                    Agent "main" (full access)                       ││
│  │                    workspace: ~/.openclaw/workspace                 ││
│  │                                                                     ││
│  │    ┌──────────────────┐      ┌────────────────────────────────┐   ││
│  │    │ Full workspace   │      │ Vacations/ [SPACE]             │   ││
│  │    │ (agent sees all) │      │ Scoped via tool hooks          │   ││
│  │    └──────────────────┘      └────────────────────────────────┘   ││
│  └────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                           WebSocket│
                                    │
                          ┌─────────┴─────────┐
                          │   Space UI         │
                          │   (browser)        │
                          │                   │
                          │ • File browser    │
                          │ • Markdown editor │
                          │ • Chat interface  │
                          └─────────────────────┘
```

### Key Insight: Same Agent, Scoped Tools

We don't spawn a separate agent for each space. Instead:

1. Collaborator connects via share link
2. AI Spaces plugin validates the link
3. Creates a **scoped context** for that session
4. Tool hooks intercept `read`/`write` calls and enforce path restrictions
5. The agent responds normally, but can only access the space directory

---

## Scoped Context

When a collaborator chats in a space, they interact with a **scoped context** of your agent:

| Capability | Full Agent | Scoped Context |
|------------|------------|----------------|
| Read files in space | ✓ | ✓ |
| Write files in space | ✓ | ✓ (if editor) |
| Read files outside space | ✓ | ✗ |
| Read agent memory (`MEMORY.md`) | ✓ | ✗ |
| Read agent instructions (`AGENTS.md`) | ✓ | ✗ |
| Execute shell commands | ✓ | ✗ |
| Send messages (email, SMS) | ✓ | ✗ |
| Search the web | ✓ | ✓ (if enabled) |

**The collaborator chats with an agent context that ONLY knows about that space.** They can't accidentally access your private data, other spaces, or full agent capabilities.

---

## Share Links

Share links are managed entirely by AI Spaces, not OpenClaw. This means:

- Collaborators don't need OpenClaw accounts
- Links can be revoked instantly
- Links can expire automatically
- No device pairing required

### Creating Share Links

```bash
# Generate a share link
openclaw spaces share create Vacations --role editor --expires 7d

# Output:
# https://spaces.example.com/vacations?share=abc123def456
```

### Share Link Storage

```json5
// ~/.openclaw/data/ai-spaces/shares.json
{
  shares: {
    "abc123def456": {
      spaceId: "vacations",
      spacePath: "~/.openclaw/workspace/Vacations",
      agentId: "main",
      role: "editor",
      created: "2026-03-26T00:00:00Z",
      expires: "2026-04-02T00:00:00Z",
      label: "Leah's link",
    },
  },
}
```

---

## The UI Experience

Collaborators visit `https://spaces.yourdomain.com/vacations?share=abc123`:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  AI Space: "Family Vacations"                                            │
│                                                                          │
│  ┌──────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐ │
│  │ Documents    │  │ # Maine Trip         │  │ Chat (scoped context)  │ │
│  │              │  │                      │  │                         │ │
│  │ 📁 Vacations │  │ ## Dates             │  │ You: What about lodging?│ │
│  │   📄 Maine   │  │ June 15-22, 2026     │  │                         │ │
│  │   📄 CR      │  │                      │  │ Agent: Let me check the │ │
│  │              │  │ ## Options           │  │ options in Maine.md...  │ │
│  │              │  │ - [x] Portland coast │  │                         │ │
│  │              │  │ - [ ] Bar Harbor     │  │ Agent: I found 3 hotels │ │
│  │              │  │                      │  │ in Portland...          │ │
│  │              │  │ [Edit this document] │  │                         │ │
│  │              │  └─────────────────────┘  │ [Send]                  │ │
│  └──────────────┘                            └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

**What collaborators can do:**
- Browse files and folders in the space
- Edit documents (markdown, with live preview)
- Chat with the scoped agent context

**What the agent can do in scoped context:**
- Answer questions about the space content
- Edit documents in the space
- Suggest things (but NOT execute outside the space)

---

## Security Model

### Filesystem Isolation

The scoped context's file operations are intercepted by tool hooks:

```python
# Tool hook enforcement
def validate_path(tool_name, params, space_context):
    requested_path = resolve_path(params.path)
    space_root = resolve_path(space_context.space_path)
    
    if not requested_path.startswith(space_root):
        raise SecurityError(f"Path escapes space: {params.path}")
```

### Memory Isolation

The scoped context does NOT load:
- `AGENTS.md` — Agent's private operating instructions
- `MEMORY.md` — Agent's long-term memory
- `memory/` — Daily memory logs

It CAN load:
- `.space/SPACE.md` — Space-specific context (optional)
- Files within the space directory

### Authentication

Share links are validated by the AI Spaces plugin:

1. Collaborator opens link
2. Space UI loads, connects to Gateway WebSocket
3. Plugin validates share token
4. Plugin injects space context into session
5. All subsequent tool calls are scoped

---

## CLI Commands

```bash
# List discovered spaces
openclaw spaces list

# Create a space (creates .space/spaces.json)
openclaw spaces create Vacations --name "Family Vacations"

# Add collaborator
openclaw spaces collaborators add Vacations --email spouse@example.com --role editor

# Generate share link
openclaw spaces share create Vacations --role editor --expires 7d

# List active shares
openclaw spaces share list Vacations

# Revoke share
openclaw spaces share revoke Vacations <shareId>

# Open space UI in browser
openclaw spaces open Vacations
```

---

## Implementation Approach

AI Spaces is implemented as an OpenClaw plugin:

| Component | Responsibility |
|-----------|----------------|
| Space discovery | Scan workspaces for `.space/spaces.json` |
| Share links | Generate, validate, revoke tokens |
| Web UI | Vite + Lit SPA served by Gateway |
| Tool hooks | Enforce path restrictions, filter denied tools |
| WebSocket routing | Route space sessions to appropriate agent |

See [`architecture.md`](./architecture.md) for technical details.

---

## The Product Edge

Every collaborative doc tool is a **human-human tool with AI bolted on.**

AI Spaces is an **agent-human tool from the start:**
- The agent OWNS the space (it created the files)
- The agent is a FIRST-CLASS participant (not a chatbot sidebar)
- The agent can take action, not just suggest
- But the agent is SCOPED (cannot escape the space)

**Collaborators don't need an agent. They just need a browser.**

**You share a portion of your agent's knowledge, not the whole thing.**

---

## Related Documents

| Document | Description |
|----------|-------------|
| [`architecture.md`](./architecture.md) | Technical architecture and implementation |
| [`openclaw-reference.md`](./openclaw-reference.md) | OpenClaw concepts relevant to AI Spaces |
| [`security.md`](./security.md) | Security model deep-dive |
| [`use-cases.md`](./use-cases.md) | Practical scenarios |

---

*The core insight: Share a portion of your agent's knowledge, not the whole thing.*