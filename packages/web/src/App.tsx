import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import SpacePage from './pages/SpacePage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/space/:spaceId" element={<SpacePage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App