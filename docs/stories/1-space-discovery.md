# Specification: Space Discovery

**Epic:** 1 - Space Discovery

---

## Manual Space Creation

**User Story**  
As an agent owner, I want to designate a workspace subdirectory as a shareable space so that I can control exactly what collaborators can see.

**Acceptance Checklist**

* [ ] Creating `.space/spaces.json` in a subdirectory designates it as a space
* [ ] Config file must contain at minimum `{ "name": "Space Name" }`
* [ ] Config file may optionally include description, collaborators, and agent settings
* [ ] Space ID equals the relative path from workspace root
* [ ] `openclaw spaces list` command displays all discovered spaces in tabular format
* [ ] `openclaw spaces show <space-id>` command displays full space configuration as JSON

**Rules**

* Config file location: `<space-directory>/.space/spaces.json`
* No database required; config files are source of truth
* JSON schema validation enforced on config files (error if invalid)
* Nested spaces allowed (child directories can be spaces even if parent is a space)
* Invalid configs are logged as errors, skipped during discovery, and shown as warnings in `spaces list` output

**Examples**

* `workspace/Vacations/.space/spaces.json` → Space ID: `Vacations`
* `workspace/Research/NewCar/.space/spaces.json` → Space ID: `Research/NewCar`
* Minimal config: `{"name": "Family Vacations"}`
* Full config with collaborators and agent capabilities:
  ```json
  {
    "name": "Space Name",
    "description": "Optional description",
    "collaborators": [{ "email": "person@example.com", "role": "editor" }],
    "agent": {
      "capabilities": ["read", "write", "web_search"],
      "denied": ["exec", "messaging"]
    }
  }
  ```

**Out of Scope**

* Agent command to create spaces
* Web UI for space creation
* Space deletion or renaming (manual file operations)

---

## Space Discovery Scanning

**User Story**  
The system automatically finds all spaces in the workspace so owners don't have to manually register them.

**Acceptance Checklist**

* [ ] All `.space/spaces.json` files are discovered on gateway startup
* [ ] Periodic rescan occurs every 5 minutes (configurable interval)
* [ ] Scan skips hidden directories (directories starting with `.`)
* [ ] `.space/` directories arealways scanned when direct children of space directories
* [ ] Scan completes within 10 seconds for workspaces with fewer than10,000 directories
* [ ] `openclaw spaces refresh` command triggers manual rescan
* [ ] Space list is cached in memory between rescans

**Rules**

* Discovery algorithm recursively scans workspace for `.space/spaces.json` files
* Hidden directories (starting with `.`) are skipped entirely
* Collision detection: if duplicate space IDs found, use first discovered and log warning
* Malformed configs: log error, skip space, continue discovery
* Failed scans do not block gateway startup

**Examples**

* Scan finds: `workspace/Vacations/.space/spaces.json`, `workspace/Research/NewCar/.space/spaces.json`
* Hidden directory `workspace/.git/` is skipped
* Nested spaces: `workspace/Vacations/` (ID: Vacations) and `workspace/Vacations/Maine/` (ID: Vacations/Maine) both valid

**Out of Scope**

* Real-time file watching (inotify/FSEvents)
* Database-backed space registry
* Space deletion cascade

---

## Open Questions

* None identified - stories are complementary without conflicts