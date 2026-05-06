# PDF Viewer — Investigation Log

## Problem
PDFs open in the file editor but show blank pages. Larger PDFs may not load at all.

## What We Know
- The PDF bytes arrive correctly in the browser: blob is valid, size ~89KB, starts with `%PDF-`
- Chrome's built-in PDF plugin loads (toolbar/UI appears) but page content is blank
- Larger PDFs fail entirely when encoded as data URLs (Chrome's ~2MB data URL limit for iframes)
- PDF.js throws `FormatError: Bad FCHECK in flate stream: 120, 239` on at least one PDF — invalid zlib header (byte 0x78 0xEF), FDICT bit set, which may indicate a malformed/non-standard PDF that Chrome's native viewer handles leniently but PDF.js rejects

## Root Cause (Unknown)
Chrome's native PDF plugin in an iframe/embed shows blank pages despite valid data. Exact cause not isolated — candidates:
- Chrome compositing bug when PDF plugin is inside overflow:hidden or flex containers
- Stale dev server (port 5173 vs 5174) meant early tests were not running latest layout code — **never cleanly re-tested native plugin after fixing port issue**
- Malformed zlib in the PDFs causes PDF.js to fail to render content streams

## Attempts Made

### 1. Fix height (iframe, flex-1 → h-full)
- **File:** `PdfViewer.tsx`
- **Change:** Outer div from `flex-1 flex flex-col overflow-hidden` → `h-full flex flex-col overflow-hidden`; added `min-h-0` to iframe
- **Result:** PDF now fills the panel (height fixed), but pages still blank

### 2. Switch iframe → embed
- **File:** `PdfViewer.tsx`
- **Change:** Replaced `<iframe>` with `<embed type="application/pdf">`
- **Result:** No change, still blank pages

### 3. Explicit MIME type on blob
- **File:** `useFileContent.ts`
- **Change:** `new Blob([blob], { type: 'application/pdf' })` when type isn't already correct
- **Result:** No change

### 4. overflow-hidden on FileEditor container for PDFs
- **File:** `FileEditor.tsx`
- **Change:** `overflow-y-auto` → `overflow-hidden` when `fileInfo.type === 'pdf'`
- **Result:** No change

### 5. Absolute positioning for embed
- **File:** `PdfViewer.tsx`
- **Change:** `position: absolute; inset: 0; width: 100%; height: 100%` on embed inside `relative h-full` div
- **Result:** No change

### 6. Set iframe src imperatively via useEffect + useRef
- **File:** `PdfViewer.tsx`
- **Change:** Render iframe with no src, then set `iframeRef.current.src = content` in useEffect after mount
- **Rationale:** Ensure Chrome PDF plugin initializes after layout is settled
- **Result:** No change

### 7. Data URL instead of blob URL
- **File:** `useFileContent.ts`
- **Change:** Convert PDF ArrayBuffer to base64 data URL (`data:application/pdf;base64,...`) instead of `URL.createObjectURL`
- **Rationale:** Avoid blob URL cross-context issues
- **Result:** Small PDF — viewer loads, pages still blank. Large PDF — viewer fails entirely (exceeds Chrome's ~2MB data URL limit)

### 8. PDF.js (pdfjs-dist) canvas rendering
- **Files:** `PdfViewer.tsx`, `packages/web/package.json`
- **Change:** Install `pdfjs-dist@5.7.284`; render each page to `<canvas>` via `pdfjs.getDocument(blobUrl)`
- **Result:** `FormatError: Bad FCHECK in flate stream: 120, 239` — PDF.js rejects the malformed zlib headers present in the test PDFs. Pages blank/missing.

### 9. Revert to iframe + blob URL (final state before undo)
- **File:** `PdfViewer.tsx`
- **Change:** Back to `<iframe src={content}>` with absolute positioning
- **Result:** Blank pages (same as attempt 1, but now on correct port)

## Current File State (before undo)
- `PdfViewer.tsx`: `<iframe>` with `position: absolute; inset: 0`
- `FileEditor.tsx`: view wrapper changed to `overflow-hidden`
- `useFileContent.ts`: explicit `application/pdf` blob type
- `packages/web/package.json`: `pdfjs-dist` dependency added
- `package-lock.json`: updated

## Things Not Yet Tried
- Cookie/session-based auth so the PDF's direct API URL (`/api/spaces/{id}/files/{path}`) can be used in an iframe without needing JS-injected auth headers — this is the most likely fix since Chrome's PDF plugin reliably works with plain HTTP URLs
- PDF.js with malformed-PDF tolerance / stream error recovery
- Preprocessing PDF bytes to fix invalid zlib FCHECK headers before passing to PDF.js
- Checking whether `X-Frame-Options` or CSP from the Vite dev server blocks the PDF plugin
- Testing in Firefox (which has its own PDF.js-based viewer built in)
