import React, { useState, useEffect } from 'react';
import { getRecentSearches, clearRecentSearches } from '../services/recentSearches';

const IconClose = () => (
    <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
    </svg>
);

const IconRoute = () => (
    <svg className='w-5 h-5 text-blue-500' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
        <path strokeLinecap='round' strokeLinejoin='round' d='M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' />
    </svg>
);

const IconStation = () => (
    <img src="/station.svg" className="w-6 h-6" alt="Station" />
);

const RecentPanel = ({ isOpen, onClose, onSelectRecent }) => {
    const [recents, setRecents] = useState([]);

    useEffect(() => {
        const loadRecents = () => {
            setRecents(getRecentSearches());
        };

        if (isOpen) {
            loadRecents();
        }

        window.addEventListener('recent_searches_updated', loadRecents);
        return () => window.removeEventListener('recent_searches_updated', loadRecents);
    }, [isOpen]);

    const handleClear = () => {
        clearRecentSearches();
        setRecents([]);
    };

    return (
        <>
            <div
                className={`fixed top-0 z-30 h-screen w-80 bg-white flex flex-col overflow-hidden transition-all duration-300
                    ${isOpen ? 'translate-x-0 shadow-2xl pointer-events-auto' : '-translate-x-full shadow-none pointer-events-none'}`}
                style={{ left: '48px' }}
            >
                <div className='p-4 border-b border-gray-200/50 flex justify-between items-center bg-white/50'>
                    <h2 className='text-lg font-semibold text-gray-800 tracking-tight'>Recent Searches</h2>
                    <button onClick={onClose} className='p-1.5 rounded-full hover:bg-gray-200/50 text-gray-500 transition-colors'>
                        <IconClose />
                    </button>
                </div>

                <div className='flex-1 overflow-y-auto p-2'>
                    {recents.length === 0 ? (
                        <div className='p-8 text-center flex flex-col items-center justify-center h-full opacity-60'>
                            <svg className='w-12 h-12 text-gray-400 mb-3' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M12 8v4l3 3M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z' />
                            </svg>
                            <p className='text-sm text-gray-500 font-medium'>No recent search yet</p>
                        </div>
                    ) : (
                        <div className='flex flex-col gap-1'>
                            <div className='flex justify-end px-2 py-1'>
                                <button
                                    onClick={handleClear}
                                    className='text-xs text-gray-400 hover:text-red-500 font-medium transition-colors'
                                >
                                    Clear all
                                </button>
                            </div>

                            {recents.map((item, idx) => (
                                <button
                                    key={`${item.type}-${item.id}-${idx}`}
                                    onClick={() => onSelectRecent(item)}
                                    className='w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all duration-200 hover:bg-gray-50 border border-transparent'
                                >
                                    <div className={`rounded-lg shrink-0 ${item.type === 'route' ? 'p-2 bg-blue-50' : 'p-1.5 bg-amber-50'}`}>
                                        {item.type === 'route' ? <IconRoute /> : <IconStation />}
                                    </div>
                                    <div className='flex-1 min-w-0'>
                                        <div className='text-sm font-medium text-gray-800 truncate'>
                                            {item.name}
                                        </div>
                                        <div className='text-[10px] text-gray-400 uppercase font-semibold tracking-wider mt-0.5'>
                                            {item.type === 'route' ? `Route ${item.ref}` : 'Bus Stop'}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default RecentPanel;
