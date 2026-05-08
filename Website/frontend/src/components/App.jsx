import React from 'react'
import BusMap from './BusMap'

const App = ({ selectedRouteIds }) => {
    return (
        <div className='relative w-screen h-screen overflow-hidden'>
            <BusMap selectedRouteIds={selectedRouteIds} />
        </div>
    )
}

export default App