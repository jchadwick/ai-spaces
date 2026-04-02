# AI Spaces - Development Directives

## Specification Guidelines

When writing specifications for AI Spaces, follow these conventions:

### Code Examples

- **CLI commands**: INCLUDE - these are user stories/acceptance criteria, not implementation code
- **Implementation code**: REMOVE - TypeScript functions, classes, methods, test commands
- **Convert to**: English descriptions of behavior

### Formats

- **Diagrams**: Use Mermaid (not ASCII art)
- **Acceptance Criteria**: Use Given/When/Then format (Gherkin)
- **JSON Examples**: Include for illustration (keep minimal)
- **Schemas/Contracts**: Use Zod v4 schemas (not TypeScript interfaces)

### Documentation Structure

- `specs/stories/` - User stories organized by epic
- `specs/flows/` - User interaction flows
- `specs/models/` - Data models and schemas

### File Organization

Each story, flow, and model should be in its own file.

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **Framework**: OpenClaw plugin architecture
- **UI**: React + Vite + shadcn/ui
- **Validation**: Zod v4
- **Real-time**: WebSocket
- **Markdown**: react-markdown with remark-gfm

## MVP Scope (v0.1)

Per the interview decisions:

| Feature | Decision |
|---------|----------|
| Space discovery | ✓ Include |
| Share links (create/list/revoke) | ✓ Include |
| Token-based authentication | ✓ Include |
| Read-only file browser | ✓ Include |
| Basic scoped chat | ✓ Include |
| File editing | Post-MVP |
| Multi-user editing | Post-MVP |
| Owner management UI | Post-MVP |
| Chat history | Post-MVP |
| File history | Post-MVP |

## Key Decisions

1. **Auth**: Token URLs (no login required)
2. **Agent Scope**: Space files + web tools (no external file access)
3. **Space Creation**: CLI first, agent-first later (wraps CLI)
4. **Concurrency**: Single-user for MVP, multi-edit as target
5. **Edit Persistence**: Direct writes to space files
6. **File Browser**: Full tree view
7. **Link Expiry**: Configurable (7 days default, revokable)
8. **Error Handling**: Graceful error messages in UI and chat
9. **UI Stack**: React + Vite + shadcn/ui