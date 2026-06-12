import { useState, useEffect } from 'react'

const baseUrl = import.meta.env.VITE_API_BASE_URL

// TODO: share headers with back, use hono client
// currently Telegram-only (TMA)
export function useAuthInit(): [string | null, boolean, Error | null] {
  const [jwt, setJwt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (jwt || isLoading) return

    const initData = (window as any).Telegram?.WebApp?.initData as string | undefined

    const authenticate = async () => {
      if (!initData) {
        setIsLoading(false)
        setError(new Error('no initData'))
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
          setJwt(data.jwt)
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Authentication failed'))
      } finally {
        setIsLoading(false)
      }
    }

    authenticate()
  }, [jwt, isLoading])

  return [jwt, isLoading, error]
}
