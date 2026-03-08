import React from 'react'
import { useNavigate } from 'react-router-dom'

import Taskbar from '../components/Taskbar'
import Map from '../components/App'

const Home = () => {
  const navigate = useNavigate()
  return (
    <>
      <Taskbar />
      <Map />
    </>
  )
}

export default Home