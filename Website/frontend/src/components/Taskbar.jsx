import React from 'react'

const Taskbar = () => {
    return (
        <div className='fixed top-3 right-4 z-20 flex items-center gap-2 bg-white rounded-2xl shadow-lg px-4 py-2'>
            <img src='/logo_bus.svg' alt='logo' className='h-8' />
            <span className='text-gray-800 text-lg font-bold tracking-tight'>Bkus</span>
        </div>
    )
}

export default Taskbar