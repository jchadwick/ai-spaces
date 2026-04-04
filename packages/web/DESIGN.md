# Design System Specification: The Architectural Workspace

## 1. Overview & Creative North Star: "The Digital Atelier"

The creative north star for this design system is **The Digital Atelier**. Unlike generic productivity tools that feel like rigid spreadsheets, this system treats the developer’s workspace as a high-end, bespoke studio. It moves away from the "boxy" constraints of traditional IDEs toward an editorial, layered experience where code and AI interact within a breathable, sophisticated environment.

The system breaks the "template" look through **Intentional Asymmetry** and **Tonal Depth**. By prioritizing white space as a functional element rather than a void, we create a UI that feels "quiet" but powerful—mimicking the focus of a clean physical desk.

---

## 2. Colors & Surface Philosophy

The palette is anchored in a light-mode-first approach that uses slate grays for structure and a deep electric blue (`primary`) for momentum. 

### The "No-Line" Rule
To achieve a premium feel, **1px solid borders are prohibited for sectioning.** Boundaries must be defined solely through background color shifts. Use `surface-container-low` for large sidebars sitting on a `surface` background. This creates a "soft-edge" layout that reduces visual noise and cognitive load.

### Surface Hierarchy & Nesting
Depth is achieved through the physical stacking of surface tiers:
- **Base Layer:** `surface` (#f7f9fb) – The desk.
- **Structural Sections:** `surface-container-low` (#f2f4f6) – Collapsible sidebars and background panels.
- **Active Workspaces:** `surface-container-lowest` (#ffffff) – The code editor or active chat bubble, providing the highest contrast for focus.
- **Overlays/Modals:** `surface-container-high` (#e6e8ea) – Floating tools and palettes.

### The "Glass & Gradient" Rule
To avoid a flat "Bootstrap" appearance, use Glassmorphism for floating UI elements (like tab bars or hover-state menus). Apply `surface-container-lowest` with a 70% opacity and a `20px` backdrop-blur. 
- **Signature CTA:** For primary actions, use a subtle linear gradient from `primary` (#0041dd) to `primary_container` (#305dfa) at a 135-degree angle. This adds a "weighted" feel to buttons that flat colors lack.

---

## 3. Typography: Editorial Utility

This system utilizes a dual-font strategy to distinguish between "The Interface" and "The Content."

*   **UI Sans-Serif (Inter):** Used for all functional labels and body text. It is neutral, legible, and disappears into the background to let the work shine.
*   **Brand Serif/Display (Manrope):** Used for headlines and titles to provide an authoritative, editorial "magazine" feel to the dashboard.
*   **Monospace (User-selected high-quality mono):** Reserved strictly for code blocks and file paths to denote technical precision.

**Key Scales:**
- **Display-LG (Manrope, 3.5rem):** High-impact landing or empty-state moments.
- **Title-SM (Inter, 1rem, Medium weight):** Standard header for cards and sidebar categories.
- **Body-MD (Inter, 0.875rem):** The workhorse for chat bubbles and UI descriptions.
- **Label-SM (Inter, 0.6875rem, All-caps):** Meta-data, file types, and status indicators.

---

## 4. Elevation & Depth: Tonal Layering

We convey hierarchy through **Tonal Layering** rather than traditional drop shadows.

### The Layering Principle
Place a `surface-container-lowest` card on a `surface-container-low` background. The slight shift from an off-white to a pure white creates a natural "lift." This mimics how paper reflects light, making the UI feel organic.

### Ambient Shadows
If a floating element (like a context menu) requires a shadow, it must be an **Ambient Shadow**:
- **Color:** `on-surface` (#191c1e) at 6% opacity.
- **Blur/Spread:** 24px blur, 0px spread, 8px Y-offset.
This creates a soft glow rather than a harsh "cutout."

### The "Ghost Border" Fallback
If a border is required for accessibility (e.g., input fields), use a **Ghost Border**:
- Token: `outline-variant` (#c3c6d7) at **20% opacity**.
This provides a "suggestion" of a boundary without cluttering the visual field.

---

## 5. Components

### Buttons & Chips
- **Primary Button:** Gradient fill (`primary` to `primary_container`), `md` (0.375rem) roundedness. No border.
- **Secondary Button:** `surface-container-highest` background with `on-surface` text.
- **Chips:** For file types and status. Use `secondary_container` for background and `on_secondary_container` for text. Keep edges `full` (pill-shaped) for high differentiation from square cards.

### The AI Chat Bubble
- **User Bubble:** `surface-container-lowest` with a `Ghost Border`. Aligned right.
- **AI Response:** `surface-container-low` background. No border. 
- **Spacing:** Use 1.5x line height for AI responses to ensure long-form explanations are readable.

### Tabbed Navigation
- **Active State:** A 2px bottom "underline" using the `primary` color.
- **Inactive State:** `on-surface-variant` text.
- **Container:** Tabs should sit on a `surface-dim` background to distinguish the "Switchboard" from the "Workspace."

### Collapsible Sidebars
- Use `surface-container-low` for the background.
- **No Divider Line:** Use a 24px horizontal padding gap to separate the sidebar content from the main stage.

---

## 6. Do's and Don'ts

### Do
- **Do** use `surface_container_lowest` for the code editor background to maximize contrast.
- **Do** use `tertiary` (#6a1edb) for AI-specific accents or "Magic" features to separate them from standard system actions.
- **Do** embrace "Negative Space." If two elements feel cluttered, add padding instead of a divider line.

### Don't
- **Don't** use `#000000` for shadows. Always use a low-opacity `on_surface` to maintain tonal harmony.
- **Don't** use 100% opaque borders to separate the sidebar from the main editor. Use the "No-Line" Rule (background color shift).
- **Don't** use `display` type scales for functional UI labels. Keep Manrope reserved for high-level hierarchy.
- **Don't** use vibrant colors for non-interactive elements. Colors like `error` or `primary` are reserved for intent and action.