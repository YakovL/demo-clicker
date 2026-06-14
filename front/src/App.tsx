import { BrowserRouter, Routes, Route } from 'react-router'
import Main from './pages/Main'
import Leaderboard from './pages/Leaderboard'
import { AuthProvider } from './api/auth'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/clicker">
        <Routes>
          <Route path="/" element={<Main />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
