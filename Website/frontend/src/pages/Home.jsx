import React, { useState } from 'react'

import App from '../components/App'
import Taskbar from '../components/Taskbar'
import Navbar from '../components/Navbar'
import SearchBar from '../components/SearchBar'
import SettingPanel from '../components/SettingPanel'
import RouteFilterPanel from '../components/RouteFilterPanel'

const Home = () => {
  const [isSettingOpen, setIsSettingOpen] = useState(false)
  const [isRouteFilterOpen, setIsRouteFilterOpen] = useState(false)
  const [selectedRouteIds, setSelectedRouteIds] = useState(null)
  const [targetLocation, setTargetLocation] = useState(null)

  return (
    <>
      {/* Full-screen map base layer */}
      <App selectedRouteIds={selectedRouteIds} targetLocation={targetLocation} />

      {/* Floating overlays */}
      <Taskbar />
      <Navbar
        isSettingOpen={isSettingOpen}
        onSettingToggle={() => setIsSettingOpen(state => !state)}
        isRouteFilterOpen={isRouteFilterOpen}
        onRouteFilterToggle={() => setIsRouteFilterOpen(state => !state)}
      />
      <SearchBar onLocationSelect={setTargetLocation} />
      <SettingPanel
        isOpen={isSettingOpen}
        onClose={() => setIsSettingOpen(false)}
      />
      <RouteFilterPanel
        isOpen={isRouteFilterOpen}
        onClose={() => setIsRouteFilterOpen(false)}
        selectedRouteIds={selectedRouteIds}
        onSelectionChange={setSelectedRouteIds}
      />
    </>
  )
}

export default Home