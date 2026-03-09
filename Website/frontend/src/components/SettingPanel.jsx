import React, { useState } from 'react'

/* ── Small inline SVG icons ── */
const IconX = () => (
  <svg className='w-5 h-5' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
    <path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
  </svg>
)
const IconSidebar = () => (
  <svg className='w-5 h-5' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
    <rect x='3' y='3' width='18' height='18' rx='2' /><line x1='9' y1='3' x2='9' y2='21' />
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
const IconContrib = () => (
  <svg className='w-5 h-5' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
    <path strokeLinecap='round' strokeLinejoin='round' d='M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M13 21l4-4m0 0l4 4m-4-4v6' />
  </svg>
)
const IconShare = () => (
  <svg className='w-5 h-5' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
    <path strokeLinecap='round' strokeLinejoin='round' d='M8.684 13.342C8.886 12.938 9 12.482 9 12s-.114-.938-.316-1.342m0 2.684a3 3 0 1 1 0-2.684m6.632 8.342A3 3 0 1 0 18 17a3 3 0 0 0-2.684 1.658m0-10.316A3 3 0 1 0 18 7a3 3 0 0 0-2.684 1.658' />
  </svg>
)
const IconPrint = () => (
  <svg className='w-5 h-5' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
    <path strokeLinecap='round' strokeLinejoin='round' d='M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-6 0v4H9v-4h6z' />
  </svg>
)

/* ── Reusable row components ── */
const MenuItem = ({ icon, label, sub }) => (
  <button className='w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors text-left'>
    <span className='text-gray-500 shrink-0'>{icon}</span>
    <div>
      <p className='text-sm text-gray-800'>{label}</p>
      {sub && <p className='text-xs text-gray-400'>{sub}</p>}
    </div>
  </button>
)
const TextLink = ({ label }) => (
  <button className='w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors'>
    {label}
  </button>
)
const Divider = () => <div className='border-t border-gray-100 my-1' />

/* ── Toggle switch ── */
const Toggle = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${checked ? 'bg-teal-600' : 'bg-gray-300'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>
)

/* ── Main panel ── */
const SettingPanel = ({ isOpen, onClose }) => {
  const [showSidebar, setShowSidebar] = useState(true)

  return (
    <>
      {/* Backdrop — click to close */}
      {isOpen && (
        <div
          className='fixed inset-0 z-25'
          onClick={onClose}
        />
      )}

      {/* Slide-in panel */}
      <div
        className={`fixed top-0 z-30 h-screen w-72 bg-white shadow-2xl flex flex-col overflow-hidden transition-transform duration-300
                    ${isOpen ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'}`}
        style={{ left: '48px' }}
      >
        {/* Header */}
        <div className='flex items-center justify-between px-5 py-4 shrink-0'>
          <div className='flex items-center gap-2'>
            <img src='/logo_bus.svg' alt='logo' className='h-7' />
            <span className='text-xl font-bold text-gray-800 tracking-tight'>Bkus</span>
          </div>
          <button
            onClick={onClose}
            className='text-gray-400 hover:text-gray-700 transition-colors cursor-pointer p-1 rounded-full hover:bg-gray-100'
          >
            <IconX />
          </button>
        </div>

        {/* Show sidebar toggle */}
        <div className='flex items-center justify-between px-5 py-3 border-t border-b border-gray-100'>
          <div className='flex items-center gap-3 text-sm text-gray-700'>
            <IconSidebar />
            <span>Show side bar</span>
          </div>
          <Toggle checked={showSidebar} onChange={setShowSidebar} />
        </div>

        {/* Scrollable content */}
        <div className='flex-1 overflow-y-auto'>
          <Divider />

          {/* Quick access */}
          <MenuItem icon={<IconBookmark />} label='Saved' />
          <MenuItem icon={<IconClock />} label='Recents' sub='No recent activity' />
          <MenuItem icon={<IconContrib />} label='Your contributions' />

          <Divider />

          {/* Actions */}
          <MenuItem icon={<IconShare />} label='Share or embed map' />
          <MenuItem icon={<IconPrint />} label='Print' />

          <Divider />

          {/* Text links */}
          <TextLink label='Add a missing place' />
          <TextLink label='Add your business' />
          <TextLink label='Edit the map' />

          <Divider />

          {/* Support */}
          <TextLink label='Tips and tricks' />
          <TextLink label='Get help' />
          <TextLink label='Consumer information' />

          <Divider />

          {/* Settings */}
          <TextLink label='Language' />
          <TextLink label='Search settings' />
          <TextLink label='Maps history' />

          <div className='h-6' />
        </div>
      </div>
    </>
  )
}

export default SettingPanel