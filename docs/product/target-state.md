# Product Target State

This document is the mutable source of truth for where the project is trying to go now. Update it when the goal changes. Do not encode the current goal permanently into PM process or agent instructions.

## Durable Vision

AI Spaces lets an agent owner safely share bounded, goal-centered workspaces from an agent-owned file system with collaborators through a browser, without exposing private workspace context.

## Product Model

A **Space** is the security and administration boundary. It maps to an agent and workspace folder, owns membership, invites, roles, and raw file access, and provides the containment boundary that keeps private agent context out of collaborator workflows.

A **Room** is the primary collaboration workspace. A room is a promoted file or folder inside a space, organized around a goal such as planning a vacation, buying a car, managing a household, or organizing tax documents. The room goal is primary. Opening and editing the files that support that goal is a close second. Chatting with the room to query, create, and edit those files is a third close second.

The product should treat spaces as backstage containers and rooms as the frontstage user experience. Collaborators should usually start by choosing a room, not by browsing a raw space root.

Implementation note: Rooms are currently backed by the existing Topics implementation and `space_topics` storage. The product should use Rooms language in the UI and docs while internal API/model names may still say topics until the planned rename is done.

## Current Active Bet

An authenticated owner can create or identify a shareable space, invite another registered user, promote files/folders to Rooms, and prove that the invited user can browse, edit, and chat only inside those Rooms through the server-mediated web app.

## Success Evidence

- A local demo shows two registered users completing the owner-to-collaborator loop end to end.
- The owner can create an invite, the collaborator can accept it after login, and the collaborator appears as a space member with the intended role.
- The collaborator can enter a promoted room as the primary work surface for a specific goal.
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
