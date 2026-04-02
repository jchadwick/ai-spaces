# Flow: Collaborator Access

**Actors:** Collaborator  
**Trigger:** Collaborator receives share link and clicks it

---

## Happy Path

```mermaid
sequenceDiagram
    participant Collaborator
    participant Browser
    participant Server
    participant SpaceRegistry
    participant ShareStore
    participant WebSocket
    
    Collaborator->>Browser: Click share link
    Note right of Collaborator: https://spaces.example.com/Vacations?share=abc123
    Browser->>Server: GET /spaces/Vacations?share=abc123
    Server->>ShareStore: Validate token
    ShareStore-->>Server: Token valid, role=editor
    Server->>SpaceRegistry: Get space info
    SpaceRegistry-->>Server: Space details
    Server->>Browser: Render Space UI HTML
    Browser->>Browser: Load React app
    Browser->>Browser: Store session in localStorage
    Browser->>WebSocket: Connect ws://spaces.example.com/spaces/Vacations/ws?share=abc123
    WebSocket->>ShareStore: Validate token
    ShareStore-->>WebSocket: Valid
    WebSocket->>SpaceRegistry: Create scoped session
    WebSocket-->>Browser: Connection established
    Browser-->>Collaborator: Show Space UI
    Note right of Browser: Header: "Family Vacations [Editor]"<br/>File browser visible<br/>Chat panel loaded
```

---

## Error Paths

### E1: Invalid Token

```mermaid
sequenceDiagram
    participant Collaborator
    participant Browser
    participant Server
    participant ShareStore
    
    Collaborator->>Browser: Click link with invalid/expired token
    Note right of Collaborator: https://spaces.example.com/Vacations?share=invalid123
    Browser->>Server: GET /spaces/Vacations?share=invalid123
    Server->>ShareStore: Validate token
    ShareStore-->>Server: Token not found OR expired OR revoked
    Server->>Browser: Return error page
    Browser-->>Collaborator: Show "Invalid Share Link"
    Note right of Collaborator: This link is not valid.<br/>Please contact the space owner.
```

### E2: Wrong Space

```mermaid
sequenceDiagram
    participant Collaborator
    participant Browser
    participant Server
    participant ShareStore
    
    Collaborator->>Browser: Click mismatched link
    Note right of Collaborator: Token for "Vacations"<br/>URL for "Research"
    Browser->>Server: GET /spaces/Research?share=abc123
    Server->>ShareStore: Validate token
    ShareStore-->>Server: Token valid but space mismatch
    Server->>Browser: Return error page
    Browser-->>Collaborator: Show "Invalid Share Link"
    Note right of Collaborator: This link is for a different space.
```

### E3: Space Not Found

```mermaid
sequenceDiagram
    participant Collaborator
    participant Browser
    participant Server
    participant SpaceRegistry
    
    Collaborator->>Browser: Click link for deleted space
    Browser->>Server: GET /spaces/DeletedSpace?share=abc123
    Server->>SpaceRegistry: Get space info
    SpaceRegistry-->>Server: Space not found
    Server->>Browser: Return error page
    Browser-->>Collaborator: Show "Space Not Found"
    Note right of Collaborator: This space no longer exists.
```

### E4: WebSocket Fails

```mermaid
sequenceDiagram
    participant Collaborator
    participant Browser
    participant Server
    participant WebSocket
    
    Browser->>Server: Load Space UI
    Server-->>Browser: UI loaded
    Browser->>WebSocket: Connect
    WebSocket-->>Browser: Connection failed
    Note right of Browser: Network error
    Browser->>Browser: Show disconnected status
    Browser-->>Collaborator: Show reconnect button
    Collaborator->>Browser: Click Reconnect
    Browser->>WebSocket: Retry connection
    WebSocket-->>Browser: Connected
    Browser-->>Collaborator: Show connected status
```

---

## Edge Cases

### EC1: Page Refresh

```mermaid
sequenceDiagram
    participant Collaborator
    participant Browser
    participant Server
    participant WebSocket
    
    Note over Browser: Session stored in localStorage
    Collaborator->>Browser: Refresh page
    Browser->>Browser: Retrieve session from localStorage
    Browser->>Server: Validate token
    Server-->>Browser: Token valid
    Browser->>Browser: Restore UI state
    Browser->>WebSocket: Reconnect
    WebSocket-->>Browser: Connected
    Browser-->>Collaborator: UI restored
```

### EC2: Multiple Browser Tabs

```mermaid
sequenceDiagram
    participant TabA as Tab A
    participant TabB as Tab B
    participant Server
    participant WebSocket
    
    TabA->>Server: Open link
    Server-->>TabA: Load UI
    TabA->>WebSocket: Connect
    WebSocket-->>TabA: Session A connected
    
    TabB->>Server: Open same link
    Server-->>TabB: Load UI
    TabB->>WebSocket: Connect
    WebSocket-->>TabB: Session B connected
    
    Note over TabA, TabB: Independent sessions
    Note over TabA, TabB: Chat in Tab A doesn't affect Tab B
```

### EC3: Mobile Browser

```mermaid
flowchart TD
    A[Mobile Browser] --> B[Load Space UI]
    B --> C{Responsive Layout}
    C --> D[File browser: hamburger menu]
    C --> E[Chat panel: slide from bottom]
    C --> F[Touch-friendly buttons]
    
    Note right of C: Same functionality<br/>Optimized layout
```

---

## Acceptance Tests

### Test 1: Valid Access

**Given** valid share token  
**When** collaborator opens link  
**Then** Space UI loads  
**And** role is displayed  
**And** file browser is visible  
**And** chat panel is loaded

### Test 2: Invalid Token

**Given** invalid or expired token  
**When** collaborator opens link  
**Then** error page shows "Invalid Share Link"  
**And** no session created

### Test 3: Expired Token

**Given** expired share token  
**When** collaborator tries to access  
**Then** error page shows "Share Link Expired"  
**And** expiration date displayed

---

## Timing

| Step | Duration |
|------|----------|
| Page load | < 1s |
| Token validation | < 100ms |
| Space info retrieval | < 100ms |
| WebSocket connection | < 500ms |
| File tree load | < 2s (lazy) |
| Total to interactive | < 3s |

---

## Post-Conditions

- Session stored in localStorage
- WebSocket established
- File tree visible
- Chat panel loaded
- Role displayed (Editor/Viewer)
- Expiry displayed (if applicable)