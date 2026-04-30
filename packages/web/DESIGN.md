# Design System Specification: Paper & Ink

## 1. Overview & Creative North Star: "The Editorial Workspace"

The creative direction is **Paper & Ink** — a warm, editorial aesthetic that treats the workspace like a high-quality physical desk. The UI steps back so the content takes center stage. Structure emerges from tonal shifts, not harsh rules. AI moments feel like a quiet, trusted colleague — not a flashy chatbot.

Key principles:
- **Warmth over sterility.** Warm off-white surfaces (`#F6F3EE`) instead of cold grays.
- **Ink, not black.** Deep `#1A1714` for text — has warmth without harshness.
- **One accent, used sparingly.** Rust/coral (`#C2410C`) is the sole action color. It signals momentum.
- **Moss for the agent.** All AI-specific UI uses moss green (`#3F6B4F`). It is reserved — never used for non-AI things.
- **Serif for soul, mono for precision.** Display headings use Instrument Serif italic to give the app editorial weight. Paths, status labels, and metadata use JetBrains Mono.

---

## 2. Color Tokens

### Light Mode

| Token | Hex | Role |
|-------|-----|------|
| `bg` | `#F6F3EE` | Warm canvas — page background |
| `bgAlt` | `#EFEAE2` | Sidebar / secondary panels |
| `bgRaised` | `#FBFAF7` | Cards, chat pane background |
| `bgWell` | `#E9E3D8` | Inputs, wells, code blocks |
| `ink` | `#1A1714` | Primary text |
| `inkMid` | `#5A5147` | Body text, secondary labels |
| `inkDim` | `#8A7F72` | Tertiary, placeholders |
| `inkFaint` | `#B8AE9F` | Hairlines, disabled text |
| `hair` | `#E2DBCD` | Dividers, borders |
| `accent` | `#C2410C` | Rust — primary action color |
| `accentSoft` | `#FBE4D5` | Rust tint background |
| `accentInk` | `#7C2D12` | Rust dark text |
| `agent` | `#3F6B4F` | Moss green — AI-only accent |
| `agentSoft` | `#E4ECDF` | Agent tint background |
| `agentInk` | `#1F3A29` | Agent dark text |

### Dark Mode

| Token | Hex |
|-------|-----|
| `bg` | `#1A1714` |
| `bgAlt` | `#15120F` |
| `bgRaised` | `#221E1A` |
| `bgWell` | `#0F0D0B` |
| `ink` | `#F6F3EE` |
| `inkMid` | `#C8BFB0` |
| `hair` | `#2E2823` |
| `accent` | `#F97316` |
| `agent` | `#86C49C` |
| `agentSoft` | `#1F2E24` |

---

## 3. Typography

Three typefaces, each with a clear role:

| Typeface | Role | Usage |
|----------|------|-------|
| **Inter Tight** | UI sans-serif | All functional labels, body text, buttons, navigation |
| **Instrument Serif** | Display / editorial | Page headings, space names, "Spaces" brand word (always italic) |
| **JetBrains Mono** | Monospace | File paths, status indicators, metadata, code blocks |

**Key rules:**
- Instrument Serif is always italic at display sizes
- Never use display scale fonts for functional UI labels
- Status/metadata labels: uppercase + 1.2–1.4 letter-spacing + JetBrains Mono

---

## 4. Surface Hierarchy

Depth comes from tonal shifts, not shadows.

```
bg (#F6F3EE)           ← page background
  bgAlt (#EFEAE2)      ← sidebar, secondary panels
  bgRaised (#FBFAF7)   ← cards, chat pane, modals
    bgWell (#E9E3D8)   ← inputs, code blocks, wells
```

Hairline borders (`#E2DBCD`, 1px) are acceptable for edge definition between content areas. Avoid multiple stacked borders.

---

## 5. Components

### Buttons
- **Primary:** `background: ink (#1A1714)`, `color: bg (#F6F3EE)`, `borderRadius: 8px`
- **Accent:** `background: accent (#C2410C)`, `color: white`
- **Ghost:** `background: transparent`, `color: inkMid`
- **Soft:** `background: bgWell (#E9E3D8)`, `color: ink`
- All buttons: `font: Inter Tight, 13px, weight 500`

### The AI Chat (Cards style)
Agent and user messages render as cards — full-width, stacked vertically.

- **User message:** dark card — `background: ink (#1A1714)`, `color: bg`, `borderRadius: 14px 14px 2px 14px` (right-corner clipped)
- **Agent message:** tinted card — `background: agentSoft (#E4ECDF)`, `border: 1px solid #C8D9C2`, `borderRadius: 2px 14px 14px 14px` (left-corner clipped). Header shows AgentGlyph + italic serif "agent" in moss green.
- **Typing indicator:** same shape as agent card, with 3 bouncing dots

### AgentGlyph
A small 4-point constellation SVG replaces sparkle icons everywhere for AI attribution. Never use `auto_awesome` or similar sparkle emoji/icons for AI. The glyph uses the `agent` color (`#3F6B4F`).

```svg
<svg viewBox="0 0 16 16">
  <circle cx="8" cy="3" r="1.4" opacity="0.9" />
  <circle cx="3" cy="9" r="1" opacity="0.7" />
  <circle cx="13" cy="9" r="1" opacity="0.7" />
  <circle cx="8" cy="13" r="0.8" opacity="0.5" />
  <path d="M8 3 L3 9 L8 13 L13 9 Z" strokeWidth="0.5" opacity="0.3" />
</svg>
```

### File Explorer
- Background: `bgAlt (#EFEAE2)`
- "FILES" label: JetBrains Mono, 10px, uppercase, letterSpacing 1.4, `inkDim` color
- Active file: `background: accentSoft`, left border `2px solid accent`, `color: accentInk`
- Hover: subtle `rgba(26,23,20,0.04)` overlay

### Chat Composer
- Input container: `background: bg`, `border: 1px solid hair`, `borderRadius: 12px`
- Quick-action chips above input: pill buttons in `bgWell` with hairline border
- Send button: accent rust style
- Footer label: "agent sees only files in this space" in JetBrains Mono, `inkFaint`, centered

### Top Navigation
- Height: 52px, `background: bg`, `borderBottom: 1px solid hair`
- Left: ink square logo (22px, borderRadius 6px) with AgentGlyph, then italic serif "Spaces" brand, then hairline separator + breadcrumb when in a space
- Right: live status dot (moss green + mono "LIVE"), Home button in ink style

### Home Page
- Editorial serif headline at 56px (italic word for emphasis)
- JetBrains Mono eyebrow label above headline
- Space cards: `bgRaised` background, hairline border, Instrument Serif name, rust accent icon, mono metadata

---

## 6. Do's and Don'ts

### Do
- Use **Instrument Serif italic** for display headings and the brand wordmark
- Use **moss green** exclusively for agent/AI attribution — nowhere else
- Use **rust** as the sole CTA color
- Use hairline borders (`1px solid #E2DBCD`) to define content areas
- Use `bgAlt` for sidebars so they recede from the main content area

### Don't
- Don't use `auto_awesome` or sparkle icons for AI — use AgentGlyph only
- Don't use blue as an accent color — this palette has no blue
- Don't use Instrument Serif for functional UI labels or buttons
- Don't use shadow effects except for floating overlays (modals, context menus)
- Don't use multiple stacked borders on the same edge
