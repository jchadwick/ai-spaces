# Topic Routing and Context Isolation

## OpenClaw Lifecycle Verification

The default plugin path does not call `POST /v1/sessions`, and the OpenClaw
gateway does not natively bind a topic workspace path for AI Spaces.

`OpenClawAcpClient` sends prompts to `POST /v1/chat/completions` and maintains a
lightweight in-memory logical session for cancellation tracking. When
`AI_SPACES_USE_OPENCLAW_ACP=true`, it initializes an ACP subprocess session with
`cwd`, but AI Spaces must still own the topic mapping and quarantine checks.

## Implemented Routing

- Hono persists `(space_id, topic_path) -> acp_session_id` in `space_topics`.
- The web app loads or provisions an ACP session when a folder is activated.
- ACP `cwd` carries the selected topic path through the server proxy.
- The plugin validates that topic path, scopes logical OpenClaw sessions and
  chat history by topic, and injects the visible workspace tree plus inherited
  parent context into the prompt.

## Isolation Rule

All workspace paths must remain under the canonical space root. Nested symlinks
that resolve outside that root are rejected for listing, reading, writing, and
topic context construction.
