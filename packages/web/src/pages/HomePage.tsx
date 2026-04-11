import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import RecentActivity from '@/components/RecentActivity'

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

function HomePage() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const { showToast } = useToast()

  const fetchSpaces = useCallback(() => {
    fetch(`/api/spaces`)
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
  }, [])

  useEffect(() => {
    fetchSpaces()
  }, [fetchSpaces])

  const handleScan = async () => {
    setScanning(true)
    try {
      const res = await fetch('/api/spaces/scan', { method: 'POST' })
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
    <div className="min-h-screen bg-surface font-ui text-on-surface">
      <header className="bg-surface-container-lowest border-b border-outline-variant/20 px-xl py-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-md">
            <span className="material-symbols-outlined text-primary text-2xl">workspaces</span>
            <h1 className="font-display text-title-lg text-on-surface">AI Spaces</h1>
          </div>
          <div className="flex items-center gap-sm">
            <Button 
              size="sm" 
              variant="secondary"
              onClick={handleScan}
              disabled={scanning}
              className="gap-1.5"
            >
              <span className={`material-symbols-outlined text-sm ${scanning ? 'animate-spin' : ''}`}>
                {scanning ? 'sync' : 'search'}
              </span>
              {scanning ? 'Scanning...' : 'Scan'}
            </Button>
            <span className="material-symbols-outlined text-lg text-on-surface-variant">account_circle</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-xl py-xl">
        <section className="mb-xl">
          <h2 className="font-display text-title-md text-on-surface mb-md">Your Workspaces</h2>
          <p className="text-body-md text-on-surface-variant">
            Select a space to view and collaborate on files with AI assistance.
          </p>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-3xl">
            <div className="animate-spin rounded-full w-8 h-8 border-2 border-primary border-t-transparent"></div>
          </div>
        )}

        {error && (
          <div className="bg-error-container/10 border border-error/20 rounded-xl p-lg mb-lg">
            <div className="flex items-center gap-sm text-error">
              <span className="material-symbols-outlined">error</span>
              <span className="text-body-md font-medium">Failed to load spaces</span>
            </div>
            <p className="text-body-sm text-on-surface-variant mt-xs">{error}</p>
          </div>
        )}

        {!loading && !error && spaces.length === 0 && (
          <div className="bg-surface-container-lowest rounded-2xl p-2xl text-center shadow-ambient">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-md">folder_open</span>
            <h3 className="font-display text-title-md text-on-surface mb-sm">No Spaces Found</h3>
            <p className="text-body-md text-on-surface-variant max-w-md mx-auto">
              Create a space by adding a <code className="bg-surface-container px-xs rounded font-mono text-body-sm">.space/spaces.json</code> file to a directory in your workspace.
            </p>
          </div>
        )}

        {!loading && !error && spaces.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-lg">
            {spaces.map(space => (
              <Link
                key={space.id}
                to={`/space/${space.id}`}
                className="bg-surface-container-lowest rounded-xl p-lg shadow-ambient hover:shadow-elevated transition-shadow text-left group"
              >
                <div className="flex items-start justify-between mb-sm">
                  <span className="material-symbols-outlined text-primary group-hover:text-primary-container transition-colors">
                    folder_shared
                  </span>
                  <span className="text-label-sm text-on-surface-variant bg-surface-container-low px-sm py-xxs rounded-full">
                    {space.agent}
                  </span>
                </div>
                <h3 className="font-display text-title-sm text-on-surface mb-xs group-hover:text-primary transition-colors">
                  {space.name}
                </h3>
                <p className="text-body-sm text-on-surface-variant mb-sm">
                  {space.config.description || 'No description'}
                </p>
                <div className="flex items-center gap-xs text-label-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm">description</span>
                  <span className="font-mono">{space.path}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <aside className="fixed right-0 top-14 bottom-6 w-72 border-l border-outline-variant/20 bg-surface-container-lowest/50">
        <RecentActivity className="h-full" />
      </aside>

      <footer className="fixed bottom-0 w-full bg-surface-container-lowest border-t border-outline-variant/20 px-xl py-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-label-sm text-on-surface-variant">
          <div className="flex items-center gap-md">
            <div className="flex items-center gap-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Connected</span>
            </div>
          </div>
          <span>AI Spaces v0.1.0</span>
        </div>
      </footer>
    </div>
  )
}

export default HomePage