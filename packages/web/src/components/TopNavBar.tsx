import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import ThemePicker from "./ThemePicker";
import { useAuth } from "@/contexts/AuthContext";

const AgentGlyph = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}>
    <circle cx="8" cy="3" r="1.4" fill={color} opacity="0.9" />
    <circle cx="3" cy="9" r="1" fill={color} opacity="0.7" />
    <circle cx="13" cy="9" r="1" fill={color} opacity="0.7" />
    <circle cx="8" cy="13" r="0.8" fill={color} opacity="0.5" />
    <path d="M8 3 L3 9 L8 13 L13 9 Z" stroke={color} strokeWidth="0.5" opacity="0.3" />
  </svg>
);

interface TopNavBarProps {
  spaceName?: string;
  selectedFile?: string | null;
  role?: "viewer" | "editor" | "admin";
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

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
            onClick={() => setOpen(false)}
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
            onClick={() => setOpen(false)}
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
        </div>
      )}
    </div>
  );
}

export default function TopNavBar({ spaceName }: TopNavBarProps) {
  const { user } = useAuth();
  return (
    <header style={{
      height: 52,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--t-ink)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <AgentGlyph size={12} color="var(--t-bg)" />
          </div>
          <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 21, fontWeight: 400, letterSpacing: -0.3, fontStyle: 'italic', color: 'var(--t-ink)', lineHeight: 1 }}>Spaces</span>
        </Link>

        {spaceName && (
          <>
            <div style={{ width: 1, height: 18, background: 'var(--t-hair)' }} />
            <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: 'var(--t-inkMid)' }}>
              <Link to="/" style={{ color: 'var(--t-inkMid)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-ink)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--t-inkMid)')}
              >My Spaces</Link>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--t-inkFaint)" strokeWidth="1.5" strokeLinecap="round"><path d="m6 4 4 4-4 4" /></svg>
              <span style={{ color: 'var(--t-ink)', fontWeight: 500 }}>{spaceName}</span>
            </nav>
          </>
        )}
      </div>

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
  );
}
