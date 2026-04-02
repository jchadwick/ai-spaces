# Flow: Share Space

**Actors:** Owner  
**Trigger:** Owner wants to share space with collaborator

---

## Happy Path

```mermaid
sequenceDiagram
    participant Owner
    participant CLI
    participant System
    participant Storage
    
    Owner->>CLI: openclaw spaces share create Vacations --role editor --expires 7d
    CLI->>System: Validate space exists
    System->>System: Validate role valid
    System->>System: Validate duration valid
    System->>System: Generate token (32 random bytes)
    System->>Storage: Save to shares.json
    Storage-->>System: Confirmed
    System-->>CLI: Share created
    CLI-->>Owner: Display share link
    
    Note right of Owner: ID: abc123<br/>Role: editor<br/>Expires: 2026-04-08<br/>URL: https://spaces.example.com/Vacations?share=...
    
    Owner->>Owner: Copy URL
    Owner->>Owner: Send to collaborator
```

---

## Error Paths

### E1: Space Not Found

```mermaid
sequenceDiagram
    participant Owner
    participant CLI
    participant System
    
    Owner->>CLI: openclaw spaces share create NonExistent --role editor
    CLI->>System: Validate space exists
    System-->>CLI: Error: Space not found
    CLI-->>Owner: Show error and available spaces
    Note right of Owner: Error: Space 'NonExistent' not found<br/>Available spaces:<br/>- Vacations<br/>- Research/NewCar
```

### E2: Invalid Role

```mermaid
sequenceDiagram
    participant Owner
    participant CLI
    participant System
    
    Owner->>CLI: openclaw spaces share create Vacations --role admin
    CLI->>System: Validate role
    System-->>CLI: Error: Invalid role
    CLI-->>Owner: Show valid roles
    Note right of Owner: Error: Invalid role 'admin'<br/>Valid roles: viewer, editor
```

### E3: Invalid Duration

```mermaid
sequenceDiagram
    participant Owner
    participant CLI
    participant System
    
    Owner->>CLI: openclaw spaces share create Vacations --expires 2weeks
    CLI->>System: Validate duration
    System-->>CLI: Error: Invalid duration
    CLI-->>Owner: Show valid formats
    Note right of Owner: Error: Invalid duration '2weeks'<br/>Valid formats: 1h, 24h, 7d, 30d, never
```

---

## Edge Cases

### EC1: Multiple Shares

```mermaid
sequenceDiagram
    participant Owner
    participant CLI
    participant System
    participant Storage
    
    Owner->>CLI: openclaw spaces share create Vacations --role editor --label "Leah"
    System->>Storage: Save share-abc123
    CLI-->>Owner: Share created: share-abc123
    
    Owner->>CLI: openclaw spaces share create Vacations --role viewer --label "Tom"
    System->>Storage: Save share-xyz789
    CLI-->>Owner: Share created: share-xyz789
    
    Owner->>CLI: openclaw spaces share list Vacations
    CLI-->>Owner: Show both shares
    Note right of Owner: ID: abc123, Role: editor, Label: Leah<br/>ID: xyz789, Role: viewer, Label: Tom
```

### EC2: No Expiry

```mermaid
sequenceDiagram
    participant Owner
    participant CLI
    participant System
    
    Owner->>CLI: openclaw spaces share create Vacations --expires never
    System->>System: Create share without expiry
    CLI-->>Owner: Share created
    Note right of Owner: Expires: never
    Note right of Owner: Link valid indefinitely
```

### EC3: Token Collision

```mermaid
flowchart LR
    A[Generate token] --> B{Collision check}
    B -->|Collision detected| C[Regenerate]
    C --> B
    B -->|Unique| D[Return token]
    
    Note right of B: Collision probability: ~0<br/>32 bytes = 2^256 possibilities
```

---

## Acceptance Tests

### Test 1: Basic Creation

**Given** space "Vacations" exists  
**When** owner runs `openclaw spaces share create Vacations --role editor`  
**Then** output contains valid share URL  
**And** URL matches format `https://spaces.example.com/Vacations?share=<token>`

### Test 2: Multiple Roles

**Given** space "Vacations" exists  
**When** owner creates viewer share  
**And** owner creates editor share  
**Then** `openclaw spaces share list Vacations` shows both  
**And** roles are correctly labeled

### Test 3: Expiry

**Given** space "Vacations" exists  
**When** owner creates share with `--expires 1h`  
**And** waits 61 minutes  
**Then** share link returns expired error

---

## Timing

| Step | Duration |
|------|----------|
| CLI command | < 1s |
| Token generation | < 100ms |
| Storage write | < 100ms |
| Total | < 2s |

---

## Post-Conditions

- Share link stored in `shares.json`
- Token cryptographically random
- Link ready to send to collaborator
- Expiry timer started (if set)