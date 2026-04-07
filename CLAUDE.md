# AI Spaces - Development Directives

## Specification Guidelines

When writing specifications for AI Spaces, follow these conventions:

### Code Examples

- **CLI commands**: INCLUDE - these are user stories/acceptance criteria, not implementation code
- **Implementation code**: REMOVE - TypeScript functions, classes, methods, test commands
- **Convert to**: English descriptions of behavior

### Formats

- **Diagrams**: Use Mermaid (not ASCII art)
- **JSON Examples**: Include for illustration (keep minimal)
- **Schemas/Contracts**: Use Zod v4 schemas (not TypeScript interfaces)

### Documentation Structure

- `docs/stories/` - User stories organized by epic
- `docs/flows/` - User interaction flows
- `docs/models/` - Data models and schemas

### File Organization

Each story, flow, and model should be in its own file.

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **Framework**: OpenClaw plugin architecture
- **UI**: React + Vite + shadcn/ui
- **Validation**: Zod v4
- **Real-time**: WebSocket
- **Markdown**: react-markdown with remark-gfm

## Testing Environment

**IMPORTANT:** Always use the sandbox environment for testing, NOT the system-installed OpenClaw.

IMPORTANT: DO NOT EVER USE THE `openclaw` COMMAND WITHOUT PROVIDING THE SANDBOX PATH
In fact, use the `./openclaw.sh` script instead, which includes the sandbox path.

The sandbox provides an isolated environment that doesn't interfere with your production OpenClaw setup.

When running the gateway the `openclaw gateway` command do not wait for it to exit - it is a service, it does not exit!

### Setup Sandbox

```bash
# One-time setup (creates /tmp/openclaw-sandbox with isolated config)
./scripts/setup-sandbox.sh
```

### Start Gateway in Sandbox

```bash
# Run the gateway using the sandbox environment
OPENCLAW_HOME=/tmp/openclaw-sandbox openclaw gateway --allow-unconfigured
```

### Start Web App (separate terminal)

```bash
npm run dev:web
```

### Clean Up

```bash
pkill -f 'openclaw gateway'
rm -rf /tmp/openclaw-sandbox
```

## MVP Scope (v0.1)

Per the interview decisions:

| Feature | Decision |
|---------|----------|
| Space discovery | ✓ Include |
| Share links (create/list/revoke) | ✓ Include |
| Token-based authentication | ✓ Include |
| Read-only file browser | ✓ Include |
| Basic scoped chat | ✓ Include |
| File editing | Post-MVP |
| Multi-user editing | Post-MVP |
| Owner management UI | Post-MVP |
| Chat history | Post-MVP |
| File history | Post-MVP |

## Key Decisions

1. **Auth**: Token URLs (no login required)
2. **Agent Scope**: Space files + web tools (no external file access)
3. **Space Creation**: CLI first, agent-first later (wraps CLI)
4. **Concurrency**: Single-user for MVP, multi-edit as target
5. **Edit Persistence**: Direct writes to space files
6. **File Browser**: Full tree view
7. **Link Expiry**: Configurable (7 days default, revokable)
8. **Error Handling**: Graceful error messages in UI and chat
9. **UI Stack**: React + Vite + shadcn/ui# Agent Instructions

## Git Workflow

**Commit and push frequently.** After completing meaningful units of work:
- Commit with descriptive messages
- Push to the remote repository immediately

This ensures work is backed up and progress is visible.

## Tasks and Planning

This repo uses the `tk` task manager for planning and tracking work.

A lightweight, git-native issue tracker that stores tickets as JSONL inside the repo.

```bash
Usage:
  tk [command]

Available Commands:
  close       Close a ticket
  completion  Generate the autocompletion script for the specified shell
  create      Create a new ticket
  delete      Delete a ticket permanently
  doctor      Check the .tickets/ directory for config and data integrity issues
  edit        Edit an existing ticket
  help        Help about any command
  hoover      Clean up closed tickets that are no longer referenced
  init        Initialize a repo for use with tk
  list        List tickets with optional filters
  quickstart  Print an LLM-friendly usage guide with examples
  ready       Show the top 5 actionable, non-blocked tickets
  show        Show full details of a single ticket
  update      Update tk to the latest release
  version     Print the version of tk
```

## Autonomy

Do not ever tell me to do something that you can do yourself.
I am not your agent, you are my agent.  YOU do it.
