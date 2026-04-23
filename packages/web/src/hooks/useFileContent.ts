import { useState, useEffect, useRef, useMemo } from 'react'
import { useAPI } from './useAPI'

export type FileType = 'markdown' | 'text' | 'image' | 'binary' | 'unknown'

export interface FileInfo {
  name: string
  path: string
  type: FileType
  modifiedAt?: string
  size?: number
}

export interface FileContent {
  content: string | null
  fileInfo: FileInfo | null
  loading: boolean
  error: string | null
}

function detectFileType(contentType: string | null, fileName: string): FileType {
  if (contentType?.startsWith('image/')) return 'image'
  if (contentType === 'application/octet-stream') return 'binary'
  
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (['txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'xml', 'yaml', 'yml'].includes(ext || '')) return 'text'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) return 'image'
  
  if (contentType?.startsWith('text/') || contentType === 'application/json') return 'text'
  
  return 'unknown'
}

interface UseFileContentOptions {
  refreshKey?: number;
}

export function useFileContent(spaceId: string | undefined, filePath: string | undefined, options?: UseFileContentOptions): FileContent {
  const refreshKey = options?.refreshKey ?? 0;
  const apiFetch = useAPI()

  const [content, setContent] = useState<string | null>(null)
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fetchIdRef = useRef(0)
  
  const fetchKey = useMemo(() => {
    if (!spaceId || !filePath) return null
    return `${spaceId}:${filePath}:${refreshKey}`
  }, [spaceId, filePath, refreshKey])

  useEffect(() => {
    if (!fetchKey) {
      return
    }

    const currentFetchId = ++fetchIdRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const fetchData = async () => {
      try {
        const [currentSpaceId, currentFilePath] = fetchKey.split(':')
        const encodedPath = encodeURIComponent(currentFilePath)
        const response = await apiFetch(`/api/spaces/${currentSpaceId}/files/${encodedPath}`, {
          signal: controller.signal,
        })

        if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return

        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
        }

        const contentType = response.headers.get('content-type')
        const fileName = currentFilePath.split('/').pop() || currentFilePath
        const fileType = detectFileType(contentType, fileName)

        if (fileType === 'image') {
          const blob = await response.blob()
          if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return
          const url = URL.createObjectURL(blob)
          setContent(url)
          setFileInfo({
            name: fileName,
            path: currentFilePath,
            type: fileType,
          })
          setLoading(false)
          return
        }

        if (fileType === 'binary') {
          if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return
          setContent(null)
          setFileInfo({
            name: fileName,
            path: currentFilePath,
            type: fileType,
          })
          setLoading(false)
          return
        }

        const text = await response.text()
        if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return
        
        // Check if response is JSON (from backend) or raw content
        let actualContent = text
        let detectedType = fileType
        let modifiedAt: string | undefined
        
        try {
          const parsed = JSON.parse(text)
          if (typeof parsed === 'object' && parsed !== null) {
            if ('content' in parsed) {
              actualContent = parsed.content
              detectedType = parsed.contentType || fileType
              modifiedAt = parsed.modified
            }
          }
        } catch {
          // Not JSON, use raw text
        }
        
        setContent(actualContent)
        setFileInfo({
          name: fileName,
          path: currentFilePath,
          type: detectedType as FileType,
          modifiedAt,
        })
        setLoading(false)
      } catch (err) {
        if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        setContent(null)
        setFileInfo(null)
        setLoading(false)
      }
    }

    setLoading(true)
    setError(null)
    fetchData()

    return () => {
      controller.abort()
    }
  }, [fetchKey, apiFetch])

  if (!spaceId || !filePath) {
    return { content: null, fileInfo: null, loading: false, error: null }
  }

  return { content, fileInfo, loading, error }
}