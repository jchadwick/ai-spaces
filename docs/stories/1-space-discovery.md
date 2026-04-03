# Specification: Space Discovery

**Epic:** 1 - Space Discovery

---

## Manual Space Creation

**User Story**  
As an agent owner, I want to designate a workspace subdirectory as a shareable space so that I can control exactly what collaborators can see.

**Acceptance Checklist**

* [ ] Creating `.space/spaces.json` in a subdirectory designates it as a space
* [ ] Config file must contain at minimum `{ "name": "Space Name" }`
* [ ] Config file may optionally include description and agent settings
* [ ] Registering space via API creates space record in database
* [ ] API returns unique `spaceId` for registered space
* [ ] Space metadata is synced from `.space/spaces.json` to database

**Rules**

* Config file location: `<space-directory>/.space/spaces.json`
* Config file is source of truth for space settings
* Space metadata is stored in database after registration
* JSON schema validation enforced on config files (error if invalid)
* Nested spaces allowed (child directories can be spaces even if parent is a space)

**Examples**

* `workspace/Vacations/.space/spaces.json` → Register → Space ID: `550e8400-...`
* `workspace/Research/NewCar/.space/spaces.json` → Register → Space ID: `660e8400-...`
* Minimal config: `{"name": "Family Vacations"}`
* Full config:
  ```json
  {
    "name": "Space Name",
    "description": "Optional description",
    "agent": {
      "tools": {
        "allow": ["read", "write", "web_search"],
        "deny": ["exec", "messaging"]
      }
    }
  }
  ```

**Technical Implementation**

```typescript
// Agent creates .space/spaces.json
fs.writeFileSync('Vacations/.space/spaces.json', JSON.stringify({
  name: "Family Vacations",
  description: "Shared vacation planning"
}));

// Agent calls Spaces API to register
POST /api/spaces
{
  "agentId": "my-openclaw",
  "agentType": "openclaw",
  "path": "Vacations",
  "config": { ... }
}

// Spaces Service responds
{
  "spaceId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Family Vacations",
  ...
}
```

**Out of Scope**

* Agent command to create spaces (Post-MVP)
* Web UI for space creation (Post-MVP)

---

## Space Registration

**User Story**  
The Spaces Service needs to register spaces so users can create share links.

**Acceptance Checklist**

* [ ] Agent calls `POST /api/spaces` with path and config
* [ ] Spaces Service calls agent adapter's `discoverSpaces()` to validate
* [ ] Spaces Service creates space record in database
* [ ] Spaces Service returns `spaceId` to agent
* [ ] Subsequent updates synced via `POST /api/spaces/{id}/sync`
* [ ] Invalid configs return error with validation details

**Rules**

* Registration requires agent authentication (Post-MVP)
* Path must exist in agent workspace
* Path must contain valid `.space/spaces.json`
* Space ID is assigned by Spaces Service (not derived from path)

**Examples**

```bash
# Register space
curl -X POST https://spaces.example.com/api/spaces \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-openclaw",
    "path": "Vacations",
    "config": {
      "name": "Family Vacations",
      "agent": {
        "tools": { "allow": ["read", "write"], "deny": ["exec"] }
      }
    }
  }'

# Response
{
  "spaceId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Family Vacations",
  "path": "Vacations",
  "createdAt": "2026-04-01T12:00:00Z"
}
```

**Out of Scope**

* Automatic file watching (Post-MVP)
* Multi-agent space aggregation (Post-MVP)

---

## Space Listing

**User Story**  
Agent owners need to see all registered spaces.

**Acceptance Checklist**

* [ ] Agent calls `GET /api/spaces` to list all registered spaces
* [ ] Spaces Service returns array of space metadata
* [ ] Each space includes `id`, `name`, `path`, `createdAt`
* [ ] Optional filtering by `agentId`

**Examples**

```bash
# List spaces
curl https://spaces.example.com/api/spaces?agentId=my-openclaw

# Response
{
  "spaces": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Family Vacations",
      "path": "Vacations",
      "createdAt": "2026-04-01T12:00:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "name": "Car Research",
      "path": "Research/NewCar",
      "createdAt": "2026-04-02T10:00:00Z"
    }
  ]
}
```

---

## Space Deletion

**User Story**  
When `.space/` directory is removed, the space should be unregistered.

**Acceptance Checklist**

* [ ] Agent calls `DELETE /api/spaces/{id}` to unregister
* [ ] Spaces Service marks space as deleted
* [ ] All active shares are invalidated
* [ ] Active sessions are disconnected

**Examples**

```bash
# Unregister space
curl -X DELETE https://spaces.example.com/api/spaces/550e8400-...

# Response
{
  "success": true,
  "spaceId": "550e8400-...",
  "sharesRevoked": 3,
  "sessionsDisconnected": 1
}
```

---

## Open Questions

None - stories are consistent with architecture.