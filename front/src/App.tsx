import { BrowserRouter, Routes, Route } from 'react-router'
import Main from './pages/Main'
import Leaderboard from './pages/Leaderboard'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Main />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
