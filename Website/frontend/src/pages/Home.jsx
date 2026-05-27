import React, { useState } from 'react'

import App from '../components/App'
import Taskbar from '../components/Taskbar'
import Navbar from '../components/Navbar'
import SearchBar from '../components/SearchBar'
import SettingPanel from '../components/SettingPanel'
import RecentPanel from '../components/RecentPanel'
import RouteFilterPanel from '../components/RouteFilterPanel'
import SavedPanel from '../components/SavedPanel'

const Home = () => {
  const [isSettingOpen, setIsSettingOpen] = useState(false)
  const [isRouteFilterOpen, setIsRouteFilterOpen] = useState(false)
  const [isRecentOpen, setIsRecentOpen] = useState(false)
  const [isSavedOpen, setIsSavedOpen] = useState(false)
  const [selectedRouteIds, setSelectedRouteIds] = useState(null)
  const [targetLocation, setTargetLocation] = useState(null)
  const [recentStationSelect, setRecentStationSelect] = useState(null)
  const [recentRouteSelect, setRecentRouteSelect] = useState(null)

  const handleRecentSelect = (item) => {
    if (item.type === 'station') {
      setTargetLocation(item)
      setRecentStationSelect(item)
      setIsRecentOpen(false)
    } else if (item.type === 'route') {
      let newSelection = new Set([item.id])
      setSelectedRouteIds(newSelection)
      setRecentRouteSelect(item)
      setIsRecentOpen(false)
      setIsRouteFilterOpen(true)
    }
  }

  const handleSavedSelect = (item) => {
    if (item.type === 'station') {
      setTargetLocation(item)
      setRecentStationSelect(item)
      setIsSavedOpen(false)
    } else if (item.type === 'route') {
      let newSelection = new Set([item.id])
      setSelectedRouteIds(newSelection)
      setRecentRouteSelect(item)
      setIsSavedOpen(false)
      setIsRouteFilterOpen(true)
    }
  }

  return (
    <>
      {/* Full-screen map base layer */}
      <App selectedRouteIds={selectedRouteIds} targetLocation={targetLocation} />

      {/* Floating overlays */}
      <Taskbar />
      <Navbar
        isSettingOpen={isSettingOpen}
        onSettingToggle={() => {
          setIsSettingOpen(state => !state)
          setIsRouteFilterOpen(false)
          setIsRecentOpen(false)
          setIsSavedOpen(false)
        }}
        isRouteFilterOpen={isRouteFilterOpen}
        onRouteFilterToggle={() => {
          setIsRouteFilterOpen(state => !state)
          setIsSettingOpen(false)
          setIsRecentOpen(false)
          setIsSavedOpen(false)
        }}
        isRecentOpen={isRecentOpen}
        onRecentToggle={() => {
          setIsRecentOpen(state => !state)
          setIsSettingOpen(false)
          setIsRouteFilterOpen(false)
          setIsSavedOpen(false)
        }}
        isSavedOpen={isSavedOpen}
        onSavedToggle={() => {
          setIsSavedOpen(state => !state)
          setIsSettingOpen(false)
          setIsRouteFilterOpen(false)
          setIsRecentOpen(false)
        }}
      />
      <SearchBar
        onLocationSelect={setTargetLocation}
        recentStationSelect={recentStationSelect}
      />
      <SettingPanel
        isOpen={isSettingOpen}
        onClose={() => setIsSettingOpen(false)}
      />
      <RecentPanel
        isOpen={isRecentOpen}
        onClose={() => setIsRecentOpen(false)}
        onSelectRecent={handleRecentSelect}
      />
      <SavedPanel
        isOpen={isSavedOpen}
        onClose={() => setIsSavedOpen(false)}
        onSelectSaved={handleSavedSelect}
      />
      <RouteFilterPanel
        isOpen={isRouteFilterOpen}
        onClose={() => setIsRouteFilterOpen(false)}
        selectedRouteIds={selectedRouteIds}
        onSelectionChange={setSelectedRouteIds}
        recentRouteSelect={recentRouteSelect}
      />
    </>
  )
}

export default Home