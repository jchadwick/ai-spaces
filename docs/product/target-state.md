# Product Target State

This document is the mutable source of truth for where the project is trying to go now. Update it when the goal changes. Do not encode the current goal permanently into PM process or agent instructions.

## Durable Vision

AI Spaces lets an agent owner safely share a bounded portion of an agent-owned workspace with collaborators through a browser, without exposing private workspace context.

## Current Active Bet

An owner can create or identify a shareable space, generate an anonymous share link, open it as a collaborator, browse Markdown files, and ask scoped questions without seeing private files.

## Success Evidence

- A local demo shows the owner-to-collaborator loop end to end.
- The web app communicates only with the server, never directly with the agent runtime.
- Scoped chat and file access are constrained to the shared space.
- The demo can be repeated from a clean local dev environment.

## Current Non-Goals

- User accounts or OAuth beyond what is required for the current active bet.
- Real-time collaborative editing.
- Multi-agent runtime support beyond preserving the adapter boundary.
- File metadata polish unless it unblocks the demo or materially improves comprehension.
- Agent-first space management unless the core browser sharing loop depends on it.

## Guardrails

- Privacy and scoped access are product requirements, not implementation details.
- The server is the only allowed web-app communication boundary.
- OpenClaw is the initial runtime, but implementation choices should not prevent future adapters.
- Dev/test-only behavior belongs in dev tooling, not production modules.

## Open Questions

- What is the minimum file-editing behavior required before a first useful demo?
- Is scoped chat useful enough with read-only files, or does the first demo require edits?
- Which single collaborator persona should drive the first demo script?
