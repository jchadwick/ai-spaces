import { useParams } from 'react-router-dom'
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
  const [space, setSpace] = useState<Space | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    <div className="h-screen flex flex-col bg-surface font-body text-on-surface overflow-hidden">
      <TopNavBar spaceName={space.name} fileName="Maine.md" />
      
      <main className="flex-1 flex overflow-hidden">
        <FileExplorer spacePath={space.path} />
        <MarkdownEditor />
        <AIChatPane />
      </main>
    </div>
  )
}