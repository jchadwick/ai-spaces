import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ThemePicker from './ThemePicker'
import AgentGlyph from './AgentGlyph'
import { useAuth } from '@/contexts/AuthContext'
import { useHeader } from '@/contexts/HeaderContext'
import { HEADER_HEIGHT } from '@/constants/layout'

function getBuildLabel(): string {
  if (typeof document === 'undefined') return ''
  const fromBuildMeta = document.querySelector('meta[name="ai-spaces-build"]')?.getAttribute('content')?.trim()
  if (fromBuildMeta) return fromBuildMeta

  const tag = document.querySelector('meta[name="ai-spaces-tag"]')?.getAttribute('content')?.trim()
  if (tag) return tag

  const branch = document.querySelector('meta[name="ai-spaces-branch"]')?.getAttribute('content')?.trim()
  const sha = document.querySelector('meta[name="ai-spaces-sha"]')?.getAttribute('content')?.trim()
  if (branch && sha) return `${branch}-${sha}`
  return ''
}

function ProfileMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { logout } = useAuth()
  const navigate = useNavigate()
  const buildLabel = getBuildLabel()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSignOut = async () => {
    setOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--t-bgWell)', border: '1px solid var(--t-hair)',
          display: 'grid', placeItems: 'center', cursor: 'pointer',
          color: 'var(--t-inkMid)',
        }}
        aria-label="Profile menu"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'var(--t-bgRaised)', border: '1px solid var(--t-hair)',
          borderRadius: 10, minWidth: 160, padding: '4px 0',
          boxShadow: '0 4px 16px rgba(26,23,20,0.12)',
          zIndex: 100,
          fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
        }}>
          <button
            onClick={() => {
              setOpen(false)
              navigate('/profile')
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, color: 'var(--t-ink)', textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-bgWell)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="5.5" r="2.5" />
              <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" />
            </svg>
            Profile
          </button>
          <div style={{ height: 1, background: 'var(--t-hair)', margin: '4px 0' }} />
          <button
            onClick={handleSignOut}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, color: 'var(--t-ink)', textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-bgWell)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" />
              <polyline points="7 11 10 8 7 5" />
              <line x1="10" y1="8" x2="2" y2="8" />
            </svg>
            Sign Out
          </button>
          {buildLabel && (
            <>
              <div style={{ height: 1, background: 'var(--t-hair)', margin: '4px 0' }} />
              <div
                style={{
                  padding: '6px 14px 8px',
                  fontSize: 11,
                  color: 'var(--t-inkDim)',
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  letterSpacing: 0.2,
                }}
              >
                {buildLabel}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Header() {
  const { user } = useAuth()
  const { headerContent } = useHeader()

  return (
    <header style={{
      height: HEADER_HEIGHT,
      borderBottom: '1px solid var(--t-hair)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 20,
      paddingRight: 16,
      background: 'var(--t-bg)',
      flexShrink: 0,
      fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
    }}>
      {/* Left: Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--t-ink)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <AgentGlyph size={12} color="var(--t-bg)" />
          </div>
          <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 21, fontWeight: 400, letterSpacing: -0.3, fontStyle: 'italic', color: 'var(--t-ink)', lineHeight: 1 }}>Spaces</span>
        </Link>
      </div>

      {/* Middle: Page-specific content via portal */}
      {headerContent && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
          {headerContent}
        </div>
      )}

      {/* Right: User actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {user?.serverRole === 'admin' && (
          <Link
            to="/admin"
            style={{
              fontSize: 13,
              color: 'var(--t-inkMid)',
              textDecoration: 'none',
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--t-hair)',
              fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--t-inkMid)')}
          >
            Admin
          </Link>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t-inkDim)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", textTransform: 'uppercase', letterSpacing: 1 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t-agent)', display: 'inline-block' }} />
          live
        </div>
        <ThemePicker />
        <ProfileMenu />
      </div>
    </header>
  )
}
