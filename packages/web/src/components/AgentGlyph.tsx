/**
 * AgentGlyph — the 4-point constellation SVG for AI attribution.
 * Per DESIGN.md: used everywhere for AI, replaces sparkle icons.
 * The default color is the `agent` design token (moss green).
 */

interface AgentGlyphProps {
  size?: number;
  color?: string;
}

const AgentGlyph = ({ size = 14, color = "currentColor" }: AgentGlyphProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle" }}
  >
    <circle cx="8" cy="3" r="1.4" fill={color} opacity="0.9" />
    <circle cx="3" cy="9" r="1" fill={color} opacity="0.7" />
    <circle cx="13" cy="9" r="1" fill={color} opacity="0.7" />
    <circle cx="8" cy="13" r="0.8" fill={color} opacity="0.5" />
    <path d="M8 3 L3 9 L8 13 L13 9 Z" stroke={color} strokeWidth="0.5" opacity="0.3" />
  </svg>
);

export default AgentGlyph;
