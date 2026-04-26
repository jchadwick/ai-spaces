import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { FileNode } from '@ai-spaces/shared'
import { useAPI } from './useAPI'

function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

function mergeChildren(nodes: FileNode[], targetPath: string, children: FileNode[]): FileNode[] {
  return nodes.map(node => {
    if (node.path === targetPath) return { ...node, children }
    if (node.children && targetPath.startsWith(node.path + '/')) {
      return { ...node, children: mergeChildren(node.children, targetPath, children) }
    }
    return node
  })
}

export interface FileTree {
  files: FileNode[]
  loading: boolean
  error: string | null
  refresh: () => void
  loadChildren: (dirPath: string) => Promise<void>
}

export function useFileTree(spaceId: string | undefined): FileTree {
  const apiFetch = useAPI()
  const [files, setFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const activeSpaceId = useRef<string | undefined>(undefined)

  const fetchKey = useMemo(() => spaceId, [spaceId])

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  const fetchDir = useCallback(async (sid: string, dirPath: string): Promise<FileNode[]> => {
    const url = `/api/spaces/${sid}/files${dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''}`
    const res = await apiFetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return sortNodes(data.files || [])
  }, [apiFetch])

  const prefetchAll = useCallback(async (sid: string, nodes: FileNode[]) => {
    const dirs = nodes.filter(n => n.type === 'directory')
    if (dirs.length === 0) return

    const results = await Promise.all(
      dirs.map(async dir => {
        try {
          const children = await fetchDir(sid, dir.path)
          return { path: dir.path, children }
        } catch {
          return null
        }
      })
    )

    const valid = results.filter(Boolean) as { path: string; children: FileNode[] }[]
    if (valid.length === 0 || activeSpaceId.current !== sid) return

    setFiles(prev => {
      let updated = prev
      for (const { path, children } of valid) {
        updated = mergeChildren(updated, path, children)
      }
      return updated
    })

    await Promise.all(valid.map(({ children }) => prefetchAll(sid, children)))
  }, [fetchDir])

  useEffect(() => {
    if (!fetchKey) return

    activeSpaceId.current = fetchKey
    setLoading(true)
    setError(null)

    fetchDir(fetchKey, '')
      .then(rootFiles => {
        if (activeSpaceId.current !== fetchKey) return
        setFiles(rootFiles)
        setLoading(false)
        prefetchAll(fetchKey, rootFiles)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [fetchKey, refreshKey, fetchDir, prefetchAll])

  const loadChildren = useCallback(async (dirPath: string) => {
    if (!spaceId) return
    try {
      const children = await fetchDir(spaceId, dirPath)
      setFiles(prev => mergeChildren(prev, dirPath, children))
    } catch {
      // silently fail — folder just won't expand
    }
  }, [spaceId, fetchDir])

  if (!spaceId) {
    return { files: [], loading: false, error: null, refresh, loadChildren: async () => {} }
  }

  return { files, loading, error, refresh, loadChildren }
}
