# AI Spaces - Agent Instructions

## Git Workflow

**Commit and push frequently.** After completing meaningful units of work:
- Commit with descriptive messages
- Push to the remote repository immediately

This ensures work is backed up and progress is visible.

## Tasks and Planning

We use the `tk` task manager for planning and tracking work in this repository.

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


### Code Style

<typescript>
- Use TypeScript/static typing/type-first development everywhere possible
- Use Zod schemas to define models and provide validation; derive types from schemas
- Prefer functional programming over OOP
- Prefer pure functions and immutability
- **ESM ONLY**: All imports must use ES module syntax
  - Use `import x from 'module'` for default exports
  - Use `import { x } from 'module'` for named exports
  - NEVER use `require()` - it's CommonJS only and will fail inES modules
  - For conditional imports, use dynamic `await import('module')` syntax
</typescript>

<react>
- Use React functional components and hooks
- Prefer composition over inheritance
- Keep components small and focused
- Use Tailwind CSS for styling and shadcn/ui for components
- Use React Query for data fetching
- Use React Hook Form for form handling
</react>

### Naming Conventions
- Use semantic/conventional commit messages
- Prefer functional naming over OOP (e.g., `createSpace()` not `SpaceManager`)

## Autonomy

Do not ever tell me to do something that you can do yourself.
I am not your agent, you are my agent. YOU do it.

## Focus and Simplicity

ALWAYS focus on the task at hand. If you find yourself getting distracted or going off on tangents, add the new task to the task list then bring your focus back to the original task.

ALWAYS try the simplest solution first. If things are getting too complicated, take a step back and re-evaluate your approach.

## Verification

Always verify that your changes work as expected, follow all linting and formatting rules, and do not introduce any new warnings or errors.
- When possible, actually run the code to confirm it works as expected.
- Run any quality checks before attempting to run the code
- End with a short summary of the changes you made and how I can test them (and explain how you already tested them)
