# Story: Scoped Knowledge

**Epic:** 5 - Scoped Chat  
**Priority:** MVP  
**Story Points:** 5

---

## As a collaborator

**I want** the agent to only know about files in this space  
**So that** private information is protected

---

## Acceptance Criteria

### AC1: Read Space Files
**Given** I ask about files in the space  
**When** agent responds  
**Then**:
- Agent can read all files in space directory
- Agent references file content in response
- Agent can quote from files

**Example:**
```
User: What did we decide about Maine?
Agent: According to Maine.md, you decided on Acadia National Park with 
a budget of $2,500 for lodging.
```

### AC2: Deny Outside Files
**Given** I ask about files outside the space  
**When** agent responds  
**Then**:
- Agent refuses to read file
- Agent says: "I don't have access to files outside this space."

**Example:**
```
User: What's in Private/secrets.md?
Agent: I don't have access to files outside this space. I can only 
see files in the Vacations space.
```

### AC3: Deny Agent Memory
**Given** I ask about agent's private memory  
**When** agent responds  
**Then**:
- Agent doesn't load `AGENTS.md`, `MEMORY.md`, `USER.md`
- Agent says: "I don't have knowledge of your agent's private memory."

**Files Skipped:**
- `AGENTS.md` (agent instructions)
- `MEMORY.md` (long-term memory)
- `USER.md` (user preferences)
- `memory/` directory

### AC4: Load Space Context
**Given** `.space/SPACE.md` exists  
**When** agent session starts  
**Then**:
- File loaded as part of system prompt
- Agent references space-specificcontext
- Context visible only to collaborators, not in agent memory

**Example `.space/SPACE.md`:**
```markdown
# Family Vacations Space

This space is for planning family vacations. 
Family members: Alex, Leah, Allie, Tom
Preferences:
- Prefer budget-friendly options
- Allie prefers beach destinations
```

**Agent behavior:**
```
User: What do we prefer?
Agent: According to your space preferences, you prefer budget-friendly 
options and Allie likes beach destinations.
```

### AC5: Web Tool Access
**Given** space config allows web_search  
**When** agent needs external info  
**Then**:
- Agent can search the web
- Agent references web sources
- Agent cites sources

**Example:**
```
User: What's the weather in Maine in June?
Agent: [searches web] According to Weather.com, Maine in June 
averages 70°F with occasional rain. Good for coastal activities.
```

### AC6: Tool Denial
**Given** space config denies certain tools  
**When** agent tries to use them  
**Then**:
- Tool blocked
- Agent says: "I cannot perform that action in this space."

**Default Denied Tools:**
- `exec` (execute shell commands)
- `messaging` (send messages to channels)
- `spawn_agents` (create sub-agents)
- `browser` (headless browser)
- `credentials` (access stored credentials)

**Default Allowed Tools:**
- `read` (read files)
- `write` (write files) (if editor role)
- `edit` (edit files) (if editor role)
- `glob` (find files)
- `web_search` (if enabled)

---

## Technical Notes

### Tool Hook Implementation
```typescript
function createToolHook(spaceManager: SpaceManager) {
  return async (event: ToolCallEvent) => {
    // Check if this is a space session
    const sessionKey = event.sessionKey;
    if (!sessionKey?.startsWith('space:')) {
      return {}; // Not a space session, allow
    }

    // Get session context
    const context = event.context?.spaceContext;
    if (!context) {
      return { block: true, blockReason: 'No space context found' };
    }

    // Check denied tools
    if (context.deniedTools.includes(event.tool)) {
      return {
        block: true,
        blockReason: `Tool '${event.tool}' is not allowed in this space`
      };
    }

    // Check allowed tools
    if (context.allowedTools.length > 0 && 
        !context.allowedTools.includes(event.tool)) {
      return {
        block: true,
        blockReason: `Tool '${event.tool}' is not in allowed tools for this space`
      };
    }

    // Path validation for file tools
    const pathParam = PATH_PARAMS[event.tool];
    if (pathParam && event.params[pathParam]) {
      const requestedPath = resolve(event.params[pathParam]);
      const spaceRoot = resolve(context.spacePath);

      if (!requestedPath.startsWith(spaceRoot)) {
        return {
          block: true,
          blockReason: `Path escapes space: ${event.params[pathParam]} is outside ${context.spaceId}`
        };
      }
    }

    return {}; // Allow
  };
}
```

### Context Injection
```typescript
function createContextHook() {
  return async (event: PromptBuildEvent) => {
    if (!event.sessionKey?.startsWith('space:')) {
      return {}; // Not a space session
    }

    const context = event.context?.spaceContext;

    return {
      // Skip agent's private files
      skipFiles: context.skipFiles,

      // Load space-specific context
      extraContextFiles: context.contextFiles,

      // Override workspace root
      effectiveWorkspaceRoot: context.spacePath,

      // Add space context to system prompt
      prependToSystem: `You are in a shared space called "${context.spaceId}". 
Only access files within this space. 
The collaborator's role is: ${context.role}.
Do not reference files outside this space or the agent's private memory.`
    };
  };
}
```

---

## Out of Scope (Post-MVP)

- Per-tool permissions in UI
- Tool usage audit log
- Custom tool whitelist per space