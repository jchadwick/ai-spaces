import { useState, useEffect, useMemo } from 'react'
import type { FileNode } from '@ai-spaces/shared'

export interface FileTree {
  files: FileNode[]
  loading: boolean
  error: string | null
}

export function useFileTree(spaceId: string | undefined, _role: 'viewer' | 'editor' | 'admin'): FileTree {
  const [files, setFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const fetchKey = useMemo(() => spaceId, [spaceId])
  
  useEffect(() => {
    if (!fetchKey) {
      return
    }
    
    setLoading(true)
    setError(null)
    
    fetch(`/api/spaces/${fetchKey}/files`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch files: ${res.status}`)
        return res.json()
      })
      .then(data => {
        setFiles(data.files || [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [fetchKey])
  
  if (!spaceId) {
    return { files: [], loading: false, error: null }
  }
  
  return { files, loading, error }
}