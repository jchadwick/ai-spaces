import { useState, useEffect, useMemo, useCallback } from 'react'
import type { FileNode } from '@ai-spaces/shared'
import { useAPI } from './useAPI'

function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    .map(node => node.children ? { ...node, children: sortNodes(node.children) } : node)
}

export interface FileTree {
  files: FileNode[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useFileTree(spaceId: string | undefined): FileTree {
  const apiFetch = useAPI()
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

    apiFetch(`/api/spaces/${fetchKey}/files`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch files: ${res.status}`)
        return res.json()
      })
      .then(data => {
        setFiles(sortNodes(data.files || []))
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [fetchKey, refreshKey, apiFetch])
  
  if (!spaceId) {
    return { files: [], loading: false, error: null, refresh }
  }
  
  return { files, loading, error, refresh }
}