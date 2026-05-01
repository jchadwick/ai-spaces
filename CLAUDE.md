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

### Dev Environment (PM2)

```bash
./scripts/dev-start.sh        # start all services (truncates logs, then tails live)
./scripts/dev-stop.sh         # stop and delete all PM2 processes

pm2 restart <name>            # restart one process (openclaw | ws | server | web)
pm2 stop <name>               # stop one process
pm2 logs <name> --lines 50    # read recent log output (past + live stream)
pm2 monit                     # live TUI dashboard (CPU, mem, logs per process)
pm2 status                    # show process list and status
```

Logs are written to `.logs/<name>.log` and **truncated on each `dev-start.sh` run** so they stay small. Always read with `tail -n 100 .logs/<name>.log` or `pm2 logs <name> --lines 100 --nostream` — never `cat`.

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
