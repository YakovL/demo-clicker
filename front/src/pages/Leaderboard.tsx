import { Link } from 'react-router'
import { useAuth } from '../api/auth'
import { api } from '../api/api'
import { useState, useEffect } from 'react'
import { config } from '../../../back/users/model'

type LeaderboardEntry = {
  rank: number
  title: string
  numberOfClicks: number
}

export default function Leaderboard() {
  const { jwt, isLoading: isJwtLoading, error: jwtError } = useAuth()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadLeaderboard = async () => {
    if (!jwt) return
    setIsLoading(true)
    setError(null)

    try {
      const res = await api.getLeaderboard(jwt)
      if (res.ok) {
        const data = await res.json()
        setLeaderboard(data)
      } else {
        setError('Failed to load leaderboard')
      }
    } catch (err) {
      setError('Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (jwt) {
      loadLeaderboard()
    }
  }, [jwt])

  const header = (
    <>
      <Link to="/">Back to Main</Link>
      <h1>Leaderboard</h1>
    </>
  )

  if (isJwtLoading || isLoading) {
    return (
      <>
        {header}
        <p>Loading...</p>
      </>
    )
  }

  if (jwtError || error) {
    return (
      <>
        {header}
        <p>Something went wrong</p>
        <button onClick={loadLeaderboard}>Retry</button>
      </>
    )
  }

  return (
    <div className="screen">
      {header}
      {leaderboard && (
        <table className="leaderboard">
          <thead>
            <tr>
              <th>Rank</th>
              <th>User</th>
              <th>Clicks</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry) => (
              <>
                {entry.rank > config.leaderboardSize + 1 &&
                  <tr><td colSpan={3}>...</td></tr>}
                <tr key={entry.rank}>
                  <td>{entry.rank}</td>
                  <td>{entry.title}</td>
                  <td>{entry.numberOfClicks}</td>
                </tr>
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
