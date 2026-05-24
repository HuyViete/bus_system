import React from 'react'
import BusMap from './BusMap'

const App = ({ selectedRouteIds, targetLocation }) => {
    return (
        <div className='relative w-screen h-screen overflow-hidden'>
            <BusMap selectedRouteIds={selectedRouteIds} targetLocation={targetLocation} />
        </div>
    )
}

export default App