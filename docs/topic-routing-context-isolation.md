# Topic Routing and Context Isolation

## OpenClaw Lifecycle Verification

The default plugin path does not call `POST /v1/sessions`, and the OpenClaw
gateway does not natively bind a topic workspace path for AI Spaces.

`OpenClawAcpClient` sends prompts to `POST /v1/chat/completions` and maintains a
lightweight in-memory logical session for cancellation tracking. When
`AI_SPACES_USE_OPENCLAW_ACP=true`, it initializes an ACP subprocess session with
`cwd`, but AI Spaces must still own the topic mapping and quarantine checks.

## Implemented Routing

- Hono persists explicitly promoted file and directory topics in `space_topics`.
  Root chat remains a built-in active topic.
- Ordinary folder navigation expands or collapses the file explorer. Ordinary
  file selection opens its preview. A file or directory only activates topic
  chat after an owner explicitly promotes it.
- Hono allowlists browser ACP session traffic, rejects browser workspace RPCs,
  and only forwards `session/new` or `session/load` for active topics.
- Hono owns topic context assembly. It requests approved path facts and file
  content through the adapter, then injects context into the runtime prompt.
- ACP is transport only. It reports file-system facts and executes approved
  operations, but it never decides membership, topic eligibility, or path
  authorization.

## Isolation Rule

Hono evaluates workspace containment, hidden paths, symlink resolution,
permissions, and topic status. Each approved file operation carries a
short-lived one-shot Hono resolution token through the adapter. Nested symlinks
that resolve outside the canonical space root are rejected before execution.
