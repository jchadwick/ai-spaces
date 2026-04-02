# Story: File Content Viewer

**Epic:** 4 - File Browser  
**Priority:** MVP  
**Story Points:** 4

---

## As a collaborator

**I want** to view file contents  
**So that** I can read the agent's research

---

## Acceptance Criteria

### AC1: Markdown Rendering
**Given** I select a `.md` file  
**When** it loads  
**Then**:
- Markdown rendered with styling
- Headings, lists, links work
- Images displayed inline
- Code blocks syntax highlighted

**Example:**
```markdown
# Maine Vacation

## Options

1. **Portland** - Coastal city
2. **Acadia** - National park

[More info](https://example.com)

```python
def budget():
  return 2000
# Initialize OpenAI client 

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### AC2: Plain Text Files
**Given** I select a `.txt` or `.csv` file  
**When** it loads  
**Then**:
- Shown in monospace font
- Line numbers optional
- No wrapping (horizontal scroll)

### AC3: Images
**Given** I select an image file  
**When** it loads  
**Then**:
- Displayed inline
- Max width: 100% of container
- Zoom controls (fit to screen, 100%)

### AC4: Binary Files
**Given** I select unsupported file type  
**When** it loads  
**Then** show:

```
Cannot preview this file type.

Type: application/pdf
Size: 2.4 MB
Modified: April 1, 2026

[Download File]
```

### AC5: File Metadata
**Given** any file  
**When** viewing  
**Then** header shows:

```
Maine.md                 Modified: Apr 1, 2026 at 2:30 PM
```

### AC6: Large Files
**Given** file > 1MB  
**When** loading  
**Then**:
- Show loading indicator
- Stream content (don't block)
- Truncate preview (load more button)

### AC7: File Path Display
**Given** I'm viewing a file  
**When** I look at header  
**Then** I see:

```
📄 Vacations/Maine.md
```

### AC8: Copy File Path
**Given** I want to reference file  
**When** I click file path  
**Then**:
- Path copied to clipboard
- Toast: "Path copied!"

---

## Technical Notes

### Markdown Renderer
Use `react-markdown` with plugins:
- `remark-gfm` (GitHub Flavored Markdown)
- `rehype-highlight` (code highlighting)
- `rehype-raw` (allow HTML)

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

function MarkdownViewer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
    >
      {content}
    </ReactMarkdown>
  );
}
```

### API Endpoint
```
GET /spaces/{spaceId}/files/{path}?share={token}
Response: {
  content: string,
  type: 'markdown' | 'text' | 'image' | 'binary',
  size: number,
  modified: string
}
```

### File Size Limits
- Max file size: 10MB for preview
- Stream files > 1MB
- Offer download for files > 10MB

### Image Support
Supported formats:
- JPEG, PNG, GIF, WebP (inline display)
- SVG (inline display, sanitized)
- PDF (download only, Post-MVP: preview)

---

## Out of Scope (Post-MVP)

- Edit files (separate story)
- Version history
- File diff viewer
- Offline viewing