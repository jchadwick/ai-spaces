import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '@/components/ui/toast'
import { useAPI } from '@/hooks/useAPI'

interface Space {
  id: string
  name: string
  agent: string
  path: string
  config: {
    name: string
    description?: string
  }
}

const AgentGlyph = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}>
    <circle cx="8" cy="3" r="1.4" fill={color} opacity="0.9" />
    <circle cx="3" cy="9" r="1" fill={color} opacity="0.7" />
    <circle cx="13" cy="9" r="1" fill={color} opacity="0.7" />
    <circle cx="8" cy="13" r="0.8" fill={color} opacity="0.5" />
    <path d="M8 3 L3 9 L8 13 L13 9 Z" stroke={color} strokeWidth="0.5" opacity="0.3" />
  </svg>
)

function HomePage() {
  const apiFetch = useAPI()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const { showToast } = useToast()

  const fetchSpaces = useCallback(() => {
    apiFetch(`/api/spaces`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch spaces: ${res.status}`)
        return res.json()
      })
      .then(data => {
        setSpaces(data.spaces || [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [apiFetch])

  useEffect(() => {
    fetchSpaces()
  }, [fetchSpaces])

  const handleScan = async () => {
    setScanning(true)
    try {
      const res = await apiFetch('/api/spaces/scan', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Scan failed')
      }
      showToast('Scan complete', 'success', 3000)
      fetchSpaces()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Scan failed', 'error', 5000)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-ink)', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ height: 56, borderBottom: '1px solid var(--t-hair)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--t-ink)', display: 'grid', placeItems: 'center' }}>
            <AgentGlyph size={13} color="var(--t-bg)" />
          </div>
          <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, fontStyle: 'italic', letterSpacing: -0.4, color: 'var(--t-ink)' }}>Spaces</span>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{ fontSize: 13, color: 'var(--t-inkDim)', fontFamily: "'JetBrains Mono', monospace", background: 'transparent', border: 'none', cursor: scanning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: scanning ? 0.6 : 1 }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t-agent)', display: 'inline-block' }} />
          {scanning ? 'scanning…' : 'scan'}
        </button>
      </header>

      <main style={{ padding: '48px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Editorial title */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 12, color: 'var(--t-inkDim)', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>AI Spaces</div>
          <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 60, fontWeight: 400, letterSpacing: -1.6, lineHeight: 1, margin: '0 0 12px', color: 'var(--t-ink)' }}>
            Your <span style={{ fontStyle: 'italic' }}>shared</span> workspaces.
          </h1>
          <p style={{ fontSize: 17, color: 'var(--t-inkMid)', maxWidth: 540, lineHeight: 1.45, margin: 0 }}>
            Spaces let you share portions of your agent's workspace with collaborators.
          </p>
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
            <div className="animate-spin rounded-full" style={{ width: 28, height: 28, border: '2px solid var(--t-hair)', borderTopColor: 'var(--t-accent)', borderRadius: '50%' }}></div>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(194,65,12,0.06)', border: '1px solid rgba(194,65,12,0.2)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--t-accent)', marginBottom: 4 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><line x1="8" y1="5" x2="8" y2="8" /><line x1="8" y1="11" x2="8" y2="11.5" strokeWidth="2" /></svg>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Failed to load spaces</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--t-inkDim)', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Spaces grid */}
        {!loading && !error && spaces.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {spaces.map(space => (
              <Link key={space.id} to={`/space/${space.id}`} style={{ background: 'var(--t-bgRaised)', border: '1px solid var(--t-hair)', borderRadius: 14, padding: 20, textDecoration: 'none', display: 'block', cursor: 'pointer', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--t-accent)', display: 'grid', placeItems: 'center' }}>
                    <AgentGlyph size={20} color="var(--t-bgRaised)" />
                  </div>
                </div>
                <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, fontWeight: 400, letterSpacing: -0.4, marginBottom: 4, color: 'var(--t-ink)' }}>{space.config.name || space.name}</div>
                <div style={{ fontSize: 14, color: 'var(--t-inkMid)', marginBottom: 16, lineHeight: 1.4 }}>{space.config.description || 'No description'}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--t-inkDim)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3 }}>
                  <span>{space.path}</span>
                  <span>{space.agent}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && spaces.length === 0 && (
          <div style={{ background: 'var(--t-bgRaised)', border: '1px solid var(--t-hair)', borderRadius: 14, padding: '48px 32px', textAlign: 'center' }}>
            <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, fontWeight: 400, fontStyle: 'italic', color: 'var(--t-ink)', marginBottom: 12 }}>No spaces yet</h3>
            <p style={{ fontSize: 15, color: 'var(--t-inkMid)', maxWidth: 400, margin: '0 auto', lineHeight: 1.5 }}>
              Create a space by adding a <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--t-bgWell)', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>.space/config.json</code> file to a directory.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

export default HomePage
