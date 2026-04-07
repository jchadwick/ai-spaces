import { useParams, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import TopNavBar from '../components/TopNavBar'
import FileExplorer from '../components/FileExplorer'
import MarkdownEditor from '../components/MarkdownEditor'
import AIChatPane from '../components/AIChatPane'

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

export default function SpacePage() {
  const { spaceId } = useParams()
  const [searchParams] = useSearchParams()
  const role = (searchParams.get('role') as 'viewer' | 'editor' | 'admin') || 'viewer'
  
  const [space, setSpace] = useState<Space | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/spaces/${spaceId}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch space: ${res.status}`)
        return res.json()
      })
      .then(data => {
        setSpace(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [spaceId])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full w-8 h-8 border-2 border-primary border-t-transparent"></div>
      </div>
    )
  }

  if (error || !space) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="bg-error-container/10 border border-error/20 rounded-xl p-xl">
          <div className="flex items-center gap-sm text-error">
            <span className="material-symbols-outlined">error</span>
            <span className="text-body-md font-medium">Failed to load space</span>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-xs">{error || 'Space not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface font-body text-on-surface overflow-hidden h-screen flex flex-col">
      <TopNavBar spaceName={space?.config?.name} selectedFile={selectedFile} />
      
      <main className="flex flex-1 overflow-hidden">
        <FileExplorer spaceId={spaceId} role={role} selectedFile={selectedFile} onFileSelect={setSelectedFile} />
        <MarkdownEditor spaceId={spaceId} filePath={selectedFile ?? undefined} />
        <AIChatPane spaceId={spaceId!} role={role} />
      </main>

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 w-full h-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            <span className="font-['Inter'] text-[11px] uppercase tracking-widest font-semibold text-emerald-500">Connected</span>
          </div>
          <div className="w-px h-3 bg-slate-300 dark:bg-slate-700"></div>
          <span className="font-['Inter'] text-[11px] uppercase tracking-widest font-semibold text-slate-400">Role: {role.charAt(0).toUpperCase() + role.slice(1)}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-['Inter'] text-[11px] uppercase tracking-widest font-semibold text-slate-400">v1.0.4</span>
          <span className="font-['Inter'] text-[11px] uppercase tracking-widest font-semibold text-slate-400">UTF-8</span>
        </div>
      </footer>
    </div>
  )
}