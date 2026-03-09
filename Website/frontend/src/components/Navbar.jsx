import React from 'react'

// Icon components for cleanliness
const IconHamburger = () => (
    <svg className='w-5 h-5' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
        <path strokeLinecap='round' strokeLinejoin='round' d='M4 6h16M4 12h16M4 18h16' />
    </svg>
)
const IconBookmark = () => (
    <svg className='w-5 h-5' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
        <path strokeLinecap='round' strokeLinejoin='round' d='M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z' />
    </svg>
)
const IconClock = () => (
    <svg className='w-5 h-5' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
        <path strokeLinecap='round' strokeLinejoin='round' d='M12 8v4l3 3M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z' />
    </svg>
)
const IconHome = () => (
    <svg className='w-5 h-5' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
        <path strokeLinecap='round' strokeLinejoin='round' d='M3 12l9-9 9 9M5 10v9a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-9' />
    </svg>
)

const NavIconBtn = ({ icon, label, onClick, active }) => (
    <button
        onClick={onClick}
        title={label}
        className={`w-full h-12 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer shrink-0
            ${active ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}
    >
        {icon}
        <span className='text-[9px] font-medium leading-none'>{label}</span>
    </button>
)

const Navbar = ({ isSettingOpen, onSettingToggle }) => {
    return (
        <div className='fixed left-0 top-0 h-screen z-40 w-12 bg-white shadow-md flex flex-col'>

            {/* Hamburger — opens SettingPanel */}
            <button
                onClick={onSettingToggle}
                title={isSettingOpen ? 'Close menu' : 'Open menu'}
                className={`w-full h-12 flex items-center justify-center transition-colors cursor-pointer shrink-0
                    ${isSettingOpen ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'}`}
            >
                <IconHamburger />
            </button>

            {/* Quick-access icon buttons */}
            <div className='flex flex-col mt-1'>
                <NavIconBtn icon={<IconBookmark />} label='Saved' />
                <NavIconBtn icon={<IconClock />} label='Recents' />
                <NavIconBtn icon={<IconHome />} label='Home' />
            </div>
        </div>
    )
}

export default Navbar