import { useState } from 'react'
import { Link } from 'react-router'

export default function Main() {
  const [count, setCount] = useState(0)

  return (
    <>
      <section id="center">
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
        <Link to="/leaderboard">Leaderboard</Link>
      </section>

      <div className="ticks"></div>

      <section id="spacer"></section>
    </>
  )
}
