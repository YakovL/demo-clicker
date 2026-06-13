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

const encourageMessages = [
  'yeah!',
  'come on',
  'awesome',
  'now we\'re talkin',
  'getting hot',
  'you\'re killing it!',
  'nice one!',
  'that\'s the spirit!',
  'way to go!',
  'look at you go!',
  'you got this!',
  'keep the momentum!',
  'on a roll!',
  'boom!',
  'making progress!',
  'great pace!',
  'that\'s more like it!',
  'crushing it!',
  'another one!',
  'you\'re on fire!',
  'sweet!',
  'bingo!',
  'nailed it!',
  'solid',
  'excellent!',
  'keep going!',
  'monster',
]

export default function Main() {
  const { jwt, isLoading: isJwtLoading, error: jwtError } = useAuth()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isUserDataLoading, setIsUserDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentEnergy, setCurrentEnergy] = useState<number | null>(null)
  const [rank, setRank] = useState<number | null>(null)
  const [isUserDataInSync, setIsUserDataInSync] = useState(true)
  // TODO: resolve stale state
  const [encourageMessage, setEncourageMessage] = useState('')

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

  const clickHandler = async () => {
    setEncourageMessage(encourageMessages[
      Math.floor(Math.random() * encourageMessages.length)
    ])
    const tiltAngle = (Math.random() - 0.5) * 10;
    (document.querySelector('.encourage-message') as HTMLElement)?.style
      .setProperty('--tilt', `${tiltAngle}deg`);

    await claimAddClick()
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
        <section className="screen">
          <p>Loading...</p>
        </section>
      </>
    )
  }

  if (jwtError || error) {
    return (
      <>
        <section className="screen">
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
            Your clicks:
          </p>
          <div className="counter">
            {userData?.numberOfClicks ?? '_'}
          </div>
        </div>
        <button
          type="button"
          className="counter-button"
          onClick={clickHandler}
          disabled={currentEnergy < config.clickEnergyCost}
        >
          More!
        </button>
        <div className="encourage-message">
          {encourageMessage || "\u00A0"}
        </div>
      </section>
    </>
  )
}
