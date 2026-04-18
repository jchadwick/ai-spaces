import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export interface User {
  id: string
  email: string
  name?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
  accessToken: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const ACCESS_TOKEN_KEY = 'auth_access_token'
const REFRESH_TOKEN_KEY = 'auth_refresh_token'
const USER_KEY = 'auth_user'

function getStoredTokens(): AuthTokens | null {
  try {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (accessToken && refreshToken) {
      return { accessToken, refreshToken }
    }
  } catch {
    // localStorage not available
  }
  return null
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

function getStoredUser(): User | null {
  try {
    const userJson = localStorage.getItem(USER_KEY)
    if (userJson) {
      return JSON.parse(userJson) as User
    }
  } catch {
    // localStorage not available or corrupted data
  }
  return null
}

function setStoredTokens(tokens: AuthTokens): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
  } catch {
    // localStorage not available
  }
}

function setStoredUser(user: User): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // localStorage not available
  }
}

function clearStoredAuth(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    // localStorage not available
  }
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    const validateAndLoad = async () => {
      const storedUser = getStoredUser()
      const tokens = getStoredTokens()
      
      if (storedUser && tokens) {
        // Validate token by calling an authenticated endpoint
        try {
          const response = await fetch('/api/spaces', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          })
          if (response.ok) {
            setUser(storedUser)
            setAccessToken(tokens.accessToken)
          } else {
            // Token expired - clear auth
            clearStoredAuth()
          }
        } catch {
          clearStoredAuth()
        }
      }
      setIsLoading(false)
    }
    
    validateAndLoad()
  }, [])

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        let errMsg =
          response.status === 502 || response.status === 503
            ? 'Cannot reach the AI Spaces server. Start it with: npm run dev -w @ai-spaces/server (default http://127.0.0.1:3001).'
            : `Login failed: ${response.status}`
        try {
          const errorData = (await response.json()) as {
            error?: string
            message?: string
          }
          if (errorData && typeof errorData.error === 'string') {
            errMsg = errorData.error
          } else if (errorData && typeof errorData.message === 'string') {
            errMsg = errorData.message
          }
        } catch {
          const text = await response.text().catch(() => '')
          if (text) errMsg = text
        }
        throw new Error(errMsg)
      }

      const data = await response.json()
      
      if (!data.user || !data.accessToken || !data.refreshToken) {
        throw new Error('Invalid response from server')
      }

      const tokens: AuthTokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      }
      
      setStoredTokens(tokens)
      setStoredUser(data.user)
      setUser(data.user)
      setAccessToken(data.accessToken)
    } catch (error) {
      clearStoredAuth()
      let errMsg = 'Login failed. Please try again.'
      if (error instanceof Error) {
        errMsg = error.message
      } else if (error && typeof error === 'object' && 'message' in error) {
        errMsg = String((error as { message: unknown }).message)
      } else if (typeof error === 'string') {
        errMsg = error
      }
      throw new Error(errMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async (): Promise<void> => {
    try {
      const tokens = getStoredTokens()
      
      if (tokens?.refreshToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        }).catch(() => {
          // Ignore logout API errors
        })
      }
    } finally {
      clearStoredAuth()
      setUser(null)
    }
  }

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    isAuthenticated: user !== null,
    accessToken,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}