import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAPI } from './useAPI'

export interface AuditEntry {
  id: string
  timestamp: string
  action: string
  userId: string
  spaceId?: string
  details?: Record<string, unknown>
}

interface UseAuditLogResult {
  entries: AuditEntry[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useAuditLog(spaceId?: string, limit: number = 50): UseAuditLogResult {
  const { isLoading: authLoading, isAuthenticated } = useAuth()
  const apiFetch = useAPI()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = () => setRefreshKey(k => k + 1)

  useEffect(() => {
    if (authLoading || !isAuthenticated) return

    let mounted = true
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    params.set('limit', limit.toString())
    if (spaceId) {
      params.set('spaceId', spaceId)
    }

    apiFetch(`/api/audit?${params.toString()}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to fetch audit log')
        }
        return res.json()
      })
      .then(data => {
        if (!mounted) return
        setEntries(data.entries || [])
        setLoading(false)
      })
      .catch(err => {
        if (!mounted) return
        setError(err.message || 'Unable to load activity')
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [spaceId, limit, refreshKey, apiFetch, authLoading, isAuthenticated])

  return { entries, loading, error, refresh }
}