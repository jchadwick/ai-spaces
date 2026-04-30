import { useState } from 'react'
import { PALETTES, useTheme } from '../contexts/ThemeContext'

const PALETTE_ORDER = ['paper', 'ink', 'garden', 'dusk', 'midnight']

export default function ThemePicker() {
  const { paletteName, setPalette } = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger button — three stacked dots matching current theme's accent/agent/bg */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Change theme"
        style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--t-bgWell)',
          border: '1px solid var(--t-hair)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 2, cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.15s',
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--t-accent)', display: 'block', flexShrink: 0 }} />
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--t-agent)', display: 'block', flexShrink: 0 }} />
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--t-inkDim)', display: 'block', flexShrink: 0 }} />
      </button>

      {/* Panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', top: 36, right: 0, zIndex: 50,
            background: 'var(--t-bgRaised)',
            border: '1px solid var(--t-hair)',
            borderRadius: 14,
            padding: '14px 12px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
            display: 'flex', flexDirection: 'column', gap: 6,
            minWidth: 200,
            animation: 'themePanelIn 0.15s ease-out',
          }}>
            <div style={{
              fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
              textTransform: 'uppercase', letterSpacing: 1.4,
              color: 'var(--t-inkDim)', marginBottom: 4, paddingLeft: 2,
            }}>
              Theme
            </div>

            {PALETTE_ORDER.map(key => {
              const p = PALETTES[key]
              const isActive = key === paletteName
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setPalette(key); setOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 9,
                    background: isActive ? 'var(--t-bgWell)' : 'transparent',
                    border: isActive ? '1px solid var(--t-hair)' : '1px solid transparent',
                    cursor: 'pointer', width: '100%', textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                >
                  {/* Swatch */}
                  <div style={{
                    width: 36, height: 24, borderRadius: 6,
                    background: p.bg,
                    border: `1px solid ${p.hair}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 3, flexShrink: 0, overflow: 'hidden',
                    position: 'relative',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.accent, display: 'block' }} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.agent, display: 'block' }} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.ink, display: 'block' }} />
                  </div>

                  <span style={{
                    fontSize: 12.5, fontWeight: isActive ? 600 : 400,
                    color: 'var(--t-ink)',
                    fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
                    flex: 1,
                  }}>
                    {p.name}
                  </span>

                  {isActive && (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--t-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8l3.5 3.5L13 4.5" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      <style>{`
        @keyframes themePanelIn {
          from { opacity: 0; transform: scale(0.94) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
