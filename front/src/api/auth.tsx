import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import type { ReactNode } from 'react'

const baseUrl = import.meta.env.VITE_API_BASE_URL
const JWT_STORAGE_KEY = 'jwt'

interface AuthContextType {
  jwt: string | null
  isLoading: boolean
  error: Error | null
  reIssueJwt: () => Promise<void>
  revoke: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// TODO: share headers with back, use hono client
// currently Telegram-only (TMA)
// using localStorage as not expecting XSS in clicker
function useAuthInit() {
  const [jwt, setJwt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const revoke = useCallback(() => {
    localStorage.removeItem(JWT_STORAGE_KEY)
    setJwt(null)
    setError(null)
    setIsLoading(false)
  }, [])

  const reIssueJwt = useCallback(async () => {
    const initData = (window as any).Telegram?.WebApp?.initData as string | undefined

    if (!initData) {
      setError(new Error('no initData (presumably opened not as a TMA)'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const url = `${baseUrl}/v1/auth/telegram`
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Telegram-Init-Data': initData,
        }
      })
      const data = await resp.json()
      if (data.jwt) {
        localStorage.setItem(JWT_STORAGE_KEY, data.jwt)
        setJwt(data.jwt)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Authentication failed'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (jwt || isLoading) return

    const storedJwt = localStorage.getItem(JWT_STORAGE_KEY)
    if (storedJwt) {
      setJwt(storedJwt)
      return
    }

    reIssueJwt()
  }, [jwt, isLoading, reIssueJwt])

  return { jwt, isLoading, error, reIssueJwt, revoke }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthInit()

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
