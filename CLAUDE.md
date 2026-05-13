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

### Dev Environment (Docker)

**Always start Docker in background/daemon mode — NEVER block waiting for containers.**

```bash
docker compose up --build -d     # start all services detached (rebuilds images)
docker compose down               # stop and remove all containers

docker compose restart <service>  # restart one service (openclaw | dev)
docker compose logs -f <service> # stream logs for a service
docker compose logs --tail=100 <service>   # read recent log output

docker compose --profile studio up drizzle-studio   # open Drizzle Studio at http://localhost:4983
```

**Log checking workflow:**
1. Start containers detached: `docker compose up --build -d`
2. Check logs: `docker compose logs --tail=100 <service>`
3. If issues, stream logs: `docker compose logs -f <service>`
4. When done: `docker compose down`

Services: `openclaw`, `dev`

- **dev**: runs `tsx watch` for the server and Vite for the web; source files are mounted from host for hot reload; also runs `sandbox/seed-dev-data.ts` on startup to create test users
- **openclaw**: mount `packages/plugin/dist` — rebuild plugin on host with `npm run dev:plugin`, then `docker compose restart openclaw`

### Production Build (Docker only)

```bash
docker build -t ai-spaces .          # build prod image
docker cp $(docker create ai-spaces):/plugin ./plugin-dist   # extract compiled plugin
```

### Local Dev Test Users

When running locally, these users are seeded automatically:

| Email | Password | Role |
|-------|----------|------|
| admin@ai-spaces.test | ai-spaces | admin |
| user@ai-spaces.test | ai-spaces | user |

## Dev vs Production

Never add production code paths, guards, or abstractions whose sole purpose is to support local dev or testing workflows. Dev/test setup belongs in dev/test tooling — not in production code. If something is dev-only, keep it in entrypoints, seed scripts, docker-compose, or test helpers, not in production modules.

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
