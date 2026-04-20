# AI Spaces - Agent Instructions

## Architecture

**The web app MUST ONLY communicate with the SERVER.**

```
Web App (517x) ──HTTP──▶ Server (3001) ── Agent Adapter ──▶ Agent Runtime
```

- Web App → Server: ✅ Only allowed path
- Web App → Agent Runtime: ❌ NEVER
- Server translates all file operations and chat interactions to the agent runtime via the Agent Adapter.

### Agent Adapter and Agent Runtime

This architecture should support being run on any agent runtime - e.g. OpenClaw, Claude Code, etc. - via the Agent Adapter.

The initial implementation will be exclusively for OpenClaw, however no architectural decisions should be made that would prevent future support for other agent runtimes.

## Testing OpenClaw

**NEVER use `openclaw` directly — always use `./openclaw.sh` (includes sandbox path).**

```bash
./scripts/setup-sandbox.sh   # one-time sandbox setup
```

The gateway (`openclaw gateway`) is a service — do not wait for it to exit.

### Dev Environment (Overmind + Procfile)

```bash
overmind start    # start all services
overmind stop     # stop all services
overmind restart  # restart all services
```

## Code Style

### TypeScript
- TypeScript everywhere; use Zod schemas for models, derive types from schemas
- Functional, pure, immutable
- **ESM only**: `import`/`export` syntax; never `require()`; use `await import()` for dynamic imports

### React
- Tailwind CSS + shadcn/ui for styling
- React Query for data fetching
- React Hook Form for forms

## Progress

- Keep `tk` task statuses current (mark in-progress → complete immediately)
- Commit and push after each completed task
