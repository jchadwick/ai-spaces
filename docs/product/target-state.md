# Product Target State

This document is the mutable source of truth for where the project is trying to go now. Update it when the goal changes. Do not encode the current goal permanently into PM process or agent instructions.

## Durable Vision

AI Spaces lets an agent owner safely share a bounded portion of an agent-owned workspace with collaborators through a browser, without exposing private workspace context.

## Current Active Bet

An authenticated owner can create or identify a shareable space, invite another registered user, and prove that the invited user can browse, edit, and chat only within that space through the server-mediated web app.

## Success Evidence

- A local demo shows two registered users completing the owner-to-collaborator loop end to end.
- The owner can create an invite, the collaborator can accept it after login, and the collaborator appears as a space member with the intended role.
- The collaborator can browse and edit files permitted by their role.
- The web app communicates only with the server, never directly with the agent runtime.
- Scoped chat and file access are constrained to the shared space.
- The demo can be repeated from a clean local dev environment.

## Current Non-Goals

- Anonymous access and public share links.
- OAuth beyond what is already needed for registered-user login.
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

- Does the current invite UI work with the app's registered-user auth token handling?
- Which role should drive the first collaborator demo: viewer for privacy proof, or editor for collaboration proof?
- What is the smallest repeatable test that proves scoped chat cannot see outside the invited space?
