# Personas

## Primary: Agent Owner

**Who:** The person running the OpenClaw agent with a workspace containing research, notes, plans, and accumulated knowledge.

**Demographics:**
- Technical enough to run OpenClaw
- Comfortable with CLI
- Values privacy and control

**Goals:**
- Share specific portions of agent's knowledge
- Maintain control over what collaborators see
- Avoid technical complexity for collaborators
- Keep private information private

**Pain Points:**
- Currently forwards agent outputs via email/text
- Collaborators can't ask follow-up questions
- No way for collaborators to explore without full access
- Sensitive information in workspace can't be shared safely

**Example Agent Owners:**

1. **Alex** - Family planner researching vacations, cars, home projects
2. **Jordan** - Knowledge worker managing job search, side projects
3. **Sam** - Organizer running book club, fantasy football league

---

## Secondary: Collaborator

**Who:** A family member, friend, or colleague who receives a share link to access a space.

**Demographics:**
- Non-technical or less technical
- Wants simplicity (no accounts, no software)
- Just needs to view/contribute

**Goals:**
- Access shared content easily
- Understand what agent knows
- Make contributions (view, chat)
- Not worry about breaking anything

**Pain Points:**
- Currently receives static exports (PDFs, screenshots)
- Can't ask follow-up questions
- Hard to see latest updates
- No interactive exploration

**Example Collaborators:**

1. **Leah** - Spouse helping with vacation planning, wants to see options
2. **Allie** - Teen researching first car, wants to ask questions
3. **Tom** - Book club member reviewing discussion notes

---

## Edge Cases

### Technical Collaborator
A collaborator who is technical and wants advanced features.

**Needs:**
- Direct file editing
- Seeing file history
- Understanding agent prompts

**Accommodation:** Admin/editor role with full capabilities

### Casual Owner
An owner who rarely uses CLI and prefers agent-first commands.

**Needs:**
- Agent creates spaces via conversation
- Agent manages share links
- Agent handles permissions

**Accommodation:** Post-MVP agent-first features

---

## Role Permissions

| Role | View Files | Edit Files | Chat with Agent | Create Share Links |
|------|-----------|------------|-----------------|-------------------|
| Viewer | ✓ | ✗ | ✓ | ✗ |
| Editor | ✓ | ✓ | ✓ | ✗ |
| Admin | ✓ | ✓ | ✓ | ✓ |

**Default Roles:**
- Family members: Editor
- Contractors: Viewer
| external collaborators: Viewer |

---

## Decision Matrix

When designing features, ask:

| Question | Answer | Priority |
|----------|--------|----------|
| Does it help Agent Owner share knowledge? | Yes | High |
| Does it reduce burden on Collaborator? | Yes | High |
| Does it maintain privacy/security? | Yes | Critical |
| Does it require account creation? | No | Required |
| Does it work on mobile? | Yes | Medium |
| Does it work without installation? | Yes | Required |