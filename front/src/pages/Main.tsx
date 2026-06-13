import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../api/auth'
import { api } from '../api/api'
import { config } from '../../../back/users/model'

type UserData = {
  numberOfClicks: number
  lastClickEnergy: number
  lastClickTimestamp: string
}

export default function Main() {
  const { jwt, isLoading: isJwtLoading, error: jwtError } = useAuth()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isUserDataLoading, setIsUserDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentEnergy, setCurrentEnergy] = useState<number | null>(null)
  const [rank, setRank] = useState<number | null>(null)
  const [isUserDataInSync, setIsUserDataInSync] = useState(true)
  // TODO: resolve stale state

  const loadMe = async () => {
    if (!jwt) return
    setIsUserDataLoading(true)
    setError(null)

    try {
      const res = await api.getMeWithRank(jwt)
      if (res.ok) {
        const data = await res.json()
        setRank(data.rank)
        setUserData(data.user)
        setIsUserDataInSync(true)
      } else {
        setError('Failed to load user data')
      }
    } catch (err) {
      setError('Something went wrong')
    } finally {
      setIsUserDataLoading(false)
    }
  }

  const claimAddClick = async () => {
    if (!userData || !jwt || currentEnergy === null) return

    if (currentEnergy < config.clickEnergyCost) {
      return
    }

    // update optimistically
    const optimisticUserData: UserData = {
      numberOfClicks: userData.numberOfClicks + 1,
      lastClickEnergy: currentEnergy - config.clickEnergyCost,
      lastClickTimestamp: new Date().toISOString(),
    }
    setUserData(optimisticUserData)
    setIsUserDataInSync(false)

    // the sync with back (no rank updating yet to reduce the load)
    try {
      const res = await api.postClicksDebounced(1, jwt)
      if (res.ok) {
        const data = await res.json()
        setUserData(data)
        setIsUserDataInSync(true)

        // TODO: notify user on discrepancy?
        // if (data.numberOfClicks !== optimisticUserData.numberOfClicks) {
        // }
        // if (data.lastClickEnergy !== optimisticUserData.lastClickEnergy) {
        // }
      }
      // TODO: else _
      return res
    } catch (err) {
      // TODO: _
    }
  }

  useEffect(() => {
    if (jwt) {
      loadMe()
    }
  }, [jwt])

  // Update energy in time (assuming no other client)
  // TODO: learn if timezone/wrong clock @frontend may cause a bug and if it's worth fixing
  useEffect(() => {
    if (!userData) return

    const updateEnergy = () => {
      const now = new Date()
      const lastClickDate = new Date(userData.lastClickTimestamp)
      const elapsedMinutes = (now.getTime() - lastClickDate.getTime()) / 60000
      const energyRegained = elapsedMinutes * config.energyRegenPerMinute
      const calculatedEnergy = Math.min(config.maxEnergy, userData.lastClickEnergy + energyRegained)
      setCurrentEnergy(calculatedEnergy)
    }

    updateEnergy()
    const interval = setInterval(updateEnergy, 1000)

    return () => clearInterval(interval)
  }, [userData])

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
      <section className="screen">
        <div>
          <h1>Click like a pro!</h1>
          <p>
            Your rank: {rank ?? '_'} (<Link to="/leaderboard">Leaderboard</Link>)
          </p>
          <p>
            Your energy: {currentEnergy ? Math.floor(currentEnergy) : '_'}/{config.maxEnergy}
          </p>
          <p>
            Your clicks: {userData?.numberOfClicks ?? '_'}
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={claimAddClick}
          disabled={currentEnergy < config.clickEnergyCost}
        >
          Click!
        </button>
      </section>
    </>
  )
}
