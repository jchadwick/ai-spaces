import { useState, useEffect } from 'react'
import { getAccessToken } from '@/contexts/AuthContext'

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
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = () => setRefreshKey(k => k + 1)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    params.set('limit', limit.toString())
    if (spaceId) {
      params.set('spaceId', spaceId)
    }

    const url = `/api/audit?${params.toString()}`
    const token = getAccessToken()

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
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
  }, [spaceId, limit, refreshKey])

  return { entries, loading, error, refresh }
}