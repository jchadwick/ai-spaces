import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '@/components/ui/toast'
import { useAPI } from '@/hooks/useAPI'
import { useHeaderContent } from '@/contexts/HeaderContext'
import AgentGlyph from '@/components/AgentGlyph'

interface Space {
  id: string
  name: string
  agent: string
  path: string
  config: {
    name: string
    description?: string
    notificationIgnorePatterns?: string[]
  }
}

function HomeHeaderActions({ scanning, onScan }: { scanning: boolean; onScan: () => void }) {
  return (
    <button
      onClick={onScan}
      disabled={scanning}
      style={{
        fontSize: 13,
        color: scanning ? 'var(--t-inkFaint)' : 'var(--t-inkDim)',
        fontFamily: "'JetBrains Mono', monospace",
        background: 'transparent',
        border: 'none',
        cursor: scanning ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t-agent)', display: 'inline-block' }} />
      {scanning ? 'scanning…' : 'scan'}
    </button>
  )
}

function HomePage() {
  const apiFetch = useAPI()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const { showToast } = useToast()

  const handleScan = useCallback(async () => {
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
  }, [apiFetch]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // memoized: same reason as SpacePage breadcrumb
  const headerActions = useMemo(
    () => <HomeHeaderActions scanning={scanning} onScan={handleScan} />,
    [scanning, handleScan],
  )
  useHeaderContent(headerActions)

  return (
    <main style={{ flex: 1, overflow: 'auto', background: 'var(--t-bg)', color: 'var(--t-ink)', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>
      <div style={{ padding: '48px 32px', maxWidth: 1100, margin: '0 auto' }}>
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
            <div className="animate-spin rounded-full" style={{ width: 28, height: 28, border: '2px solid var(--t-hair)', borderTopColor: 'var(--t-accent)', borderRadius: '50%' }} />
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
              Create a space by adding a <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--t-bgWell)', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>.space/spaces.json</code> file to a directory, or ask your agent to create one for you.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

export default HomePage