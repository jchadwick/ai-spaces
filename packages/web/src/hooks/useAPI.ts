import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Returns a fetch-compatible function that:
 * - Automatically attaches the current Bearer token
 * - On TOKEN_EXPIRED 401, attempts a token refresh and retries once
 * - If refresh fails, logout has already been called; returns the 401
 */
export function useAPI(): (url: string, options?: RequestInit) => Promise<Response> {
  const { accessToken, refresh } = useAuth()

  return useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const withToken = (token: string | null): RequestInit => ({
        ...options,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers as Record<string, string> | undefined),
        },
      })

      const response = await fetch(url, withToken(accessToken))

      if (response.status === 401) {
        const body = await response.clone().json().catch(() => ({}))
        if ((body as { code?: string }).code === 'TOKEN_EXPIRED') {
          const newToken = await refresh()
          if (newToken) {
            return fetch(url, withToken(newToken))
          }
        }
      }

      return response
    },
    [accessToken, refresh],
  )
}
