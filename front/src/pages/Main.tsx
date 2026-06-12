import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../api/auth'
import { api } from '../api/api'

type UserData = {
  numberOfClicks: number
  lastClickEnergy: number
}

export default function Main() {
  const [count, setCount] = useState(0)
  const { jwt, isLoading: isJwtLoading, error: jwtError } = useAuth()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isUserDataLoading, setIsUserDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMe = async () => {
    if (!jwt) return
    setIsUserDataLoading(true)
    setError(null)

    try {
      const res = await api.getMe(jwt)
      if (res.ok) {
        const data = await res.json()
        setUserData(data)
      } else {
        setError('Failed to load user data')
      }
    } catch (err) {
      setError('Something went wrong')
    } finally {
      setIsUserDataLoading(false)
    }
  }

  useEffect(() => {
    if (jwt) {
      loadMe()
    }
  }, [jwt])

  if (isJwtLoading || isUserDataLoading) {
    return (
      <>
        <section id="center">
          <p>Loading...</p>
        </section>
      </>
    )
  }

  if (jwtError || error) {
    return (
      <>
        <section id="center">
          <p>Something went wrong</p>
          <button onClick={loadMe}>Retry</button>
        </section>
      </>
    )
  }

  return (
    <>
      <section id="center">
        <div>
          <h1>Click like a pro!</h1>
          <p>
            Your rank: _ (<Link to="/leaderboard">Leaderboard</Link>)
          </p>
          <p>
            Your energy: {userData?.lastClickEnergy ?? '_'}
          </p>
          <p>
            Your clicks: {userData?.numberOfClicks ?? '_'}
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
      </section>
    </>
  )
}
