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

For local non-Docker testing, run the one-time sandbox setup first:

```bash
./scripts/setup-sandbox.sh   # one-time sandbox setup
```

### Dev Environment (Docker)

```bash
docker compose up --build     # start all services (rebuilds images)
docker compose down           # stop and remove all containers

docker compose restart <service>           # restart one service (openclaw | ws | server | web)
docker compose logs -f <service>           # stream logs for a service
docker compose logs --tail=100 <service>   # read recent log output
```

Services: `openclaw`, `ws`, `server`, `web`

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
