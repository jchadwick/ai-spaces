import { useState, useEffect, useMemo, useCallback } from 'react'
import type { FileNode } from '@ai-spaces/shared'
import { getAccessToken } from '@/contexts/AuthContext'

export interface FileTree {
  files: FileNode[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useFileTree(spaceId: string | undefined): FileTree {
  const [files, setFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  
  const fetchKey = useMemo(() => spaceId, [spaceId])
  
  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])
  
  useEffect(() => {
    if (!fetchKey) {
      return
    }
    
    setLoading(true)
    setError(null)
    
    const token = getAccessToken()
    fetch(`/api/spaces/${fetchKey}/files`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
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
  }, [fetchKey, refreshKey])
  
  if (!spaceId) {
    return { files: [], loading: false, error: null, refresh }
  }
  
  return { files, loading, error, refresh }
}