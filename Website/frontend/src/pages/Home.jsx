import React, { useState } from 'react'

import App from '../components/App'
import Taskbar from '../components/Taskbar'
import Navbar from '../components/Navbar'
import SearchBar from '../components/SearchBar'
import SettingPanel from '../components/SettingPanel'

const Home = () => {
  const [isSettingOpen, setIsSettingOpen] = useState(false)

  return (
    <>
      {/* Full-screen map base layer */}
      <App />

      {/* Floating overlays */}
      <Taskbar />
      <Navbar
        isSettingOpen={isSettingOpen}
        onSettingToggle={() => setIsSettingOpen(prev => !prev)}
      />
      <SearchBar />
      <SettingPanel
        isOpen={isSettingOpen}
        onClose={() => setIsSettingOpen(false)}
      />
    </>
  )
}

export default Home