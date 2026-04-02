# Story: Manual Space Creation

**Epic:** 1 - Space Discovery  
**Priority:** MVP  
**Story Points:** 2

---

## As an agent owner

**I want** to designate a workspace subdirectory as a shareable space  
**So that** I can control exactly what collaborators can see

---

## Acceptance Criteria

### AC1: Create Config File
**Given** I have a workspace directory structure  
**When** I create `.space/spaces.json` in a subdirectory  
**Then** that subdirectory becomes a space

**Example:**
```bash
mkdir -p ~/.openclaw/workspace/Vacations/.space
echo '{"name": "Family Vacations"}' > ~/.openclaw/workspace/Vacations/.space/spaces.json
```

### AC2: Config File Format
**Given** I am creating a spaces.json  
**It must** contain at minimum:
```json
{
  "name": "Space Name"
}
```

**It may** contain:
```json
{
  "name": "Space Name",
  "description": "Optional description",
  "collaborators": [
    { "email": "person@example.com", "role": "editor" }
  ],
  "agent": {
    "capabilities": ["read", "write", "web_search"],
    "denied": ["exec", "messaging"]
  }
}
```

### AC3: Space ID Generation
**Given** a space at `workspace/<path>/`  
**When** discovered  
**Then** space ID equals `<path>`

**Examples:**
- `workspace/Vacations/.space/` → ID: `Vacations`
- `workspace/Research/NewCar/.space/` → ID: `Research/NewCar`

### AC4: List Spaces Command
**Given** spaces exist in workspace  
**When** I run `openclaw spaces list`  
**Then** I see all discovered spaces

**Output:**
```
DISCOVERED SPACES

ID                  NAME                    PATH
------------------------------------------------------------------------
Vacations           Family Vacations        /home/user/.openclaw/workspace/Vacations
Research/NewCar     Car Research            /home/user/.openclaw/workspace/Research/NewCar
```

### AC5: Show Space Details
**Given** a space exists  
**When** I run `openclaw spaces show <space-id>`  
**Then** I see full space configuration

**Output:**
```json
{
  "id": "Vacations",
  "path": "/home/user/.openclaw/workspace/Vacations",
  "configPath": "/home/user/.openclaw/workspace/Vacations/.space/spaces.json",
  "config": {
    "name": "Family Vacations",
    "description": "Shared vacation planning",
    "collaborators": [...],
    "agent": {...}
  }
}
```

---

## Technical Notes

- Config file location: `<space-directory>/.space/spaces.json`
- No database required; config files are source of truth
- Space discovery happens at gateway startup and periodically (configurable)
- JSON schema validation on config file (error if invalid)

---

## Edge Cases

### Nested Spaces
**Q:** What if a parent directory is already a space?  
**A:** Child directories can also be spaces. Space hierarchy is independent of file hierarchy.

**Example:**
```
workspace/
  Vacations/           # Space ID: Vacations
    .space/spaces.json
    Maine/             # Space ID: Vacations/Maine
      .space/spaces.json
```

### Invalid Config
**Q:** What if spaces.json is malformed?  
**A:** Log error, skip space, continue discovery. Show warning in `spaces list` output.

**Example:**
```
WARNING: Invalid config at Vacations/rooms/.space/spaces.json: Unexpected token at line 5
```

---

## Out of Scope (Post-MVP)

- Agent command: "Create a space for Vacations"
- Web UI for space creation
- Space deletion (manual file deletion)
- Space renaming (manual file rename + config update)