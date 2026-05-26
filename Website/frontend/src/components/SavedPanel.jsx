import React, { useState, useEffect } from 'react';
import { getSavedItems, removeItem, clearSavedItems } from '../services/savedItems';

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

const IconTrash = () => (
    <svg className='w-4 h-4' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
        <path strokeLinecap='round' strokeLinejoin='round' d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
    </svg>
);

const SavedPanel = ({ isOpen, onClose, onSelectSaved }) => {
    const [savedItems, setSavedItems] = useState([]);

    useEffect(() => {
        const loadItems = () => {
            setSavedItems(getSavedItems());
        };

        if (isOpen) {
            loadItems();
        }

        window.addEventListener('saved_items_updated', loadItems);
        return () => window.removeEventListener('saved_items_updated', loadItems);
    }, [isOpen]);

    const handleClear = () => {
        clearSavedItems();
        setSavedItems([]);
    };

    const handleRemove = (e, type, id) => {
        e.stopPropagation();
        removeItem(type, id);
    };

    return (
        <>
            <div
                className={`fixed top-0 z-30 h-screen w-80 bg-white flex flex-col overflow-hidden transition-all duration-300
                    ${isOpen ? 'translate-x-0 shadow-2xl pointer-events-auto' : '-translate-x-full shadow-none pointer-events-none'}`}
                style={{ left: '48px' }}
            >
                <div className='p-4 border-b border-gray-200/50 flex justify-between items-center bg-white/50'>
                    <h2 className='text-lg font-semibold text-gray-800 tracking-tight'>Saved Items</h2>
                    <button onClick={onClose} className='p-1.5 rounded-full hover:bg-gray-200/50 text-gray-500 transition-colors'>
                        <IconClose />
                    </button>
                </div>

                <div className='flex-1 overflow-y-auto p-2'>
                    {savedItems.length === 0 ? (
                        <div className='p-8 text-center flex flex-col items-center justify-center h-full opacity-60'>
                            <svg className='w-12 h-12 text-gray-300 mb-3' fill='none' stroke='currentColor' strokeWidth={1.5} viewBox='0 0 24 24'>
                                <path strokeLinecap='round' strokeLinejoin='round' d='M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z' />
                            </svg>
                            <p className='text-sm text-gray-500 font-medium'>No saved item yet</p>
                        </div>
                    ) : (
                        <div className='flex flex-col gap-1'>
                            <div className='flex justify-between items-center px-2 py-1 mb-1'>
                                <span className='text-xs font-bold text-gray-400 uppercase tracking-wider'>Your Collection</span>
                                <button
                                    onClick={handleClear}
                                    className='text-xs text-gray-400 hover:text-red-500 font-medium transition-colors'
                                >
                                    Clear all
                                </button>
                            </div>

                            {savedItems.map((item, idx) => (
                                <div
                                    key={`${item.type}-${item.id}-${idx}`}
                                    onClick={() => onSelectSaved(item)}
                                    className='w-full text-left p-3 rounded-xl flex items-center justify-between gap-3 transition-all duration-200 hover:bg-gray-50 border border-transparent cursor-pointer group'
                                >
                                    <div className='flex items-center gap-3 min-w-0'>
                                        <div className={`rounded-lg shrink-0 ${item.type === 'route' ? 'p-2 bg-blue-50' : 'p-1.5 bg-amber-50'}`}>
                                            {item.type === 'route' ? <IconRoute /> : <IconStation />}
                                        </div>
                                        <div className='flex-1 min-w-0'>
                                            <div className='flex items-center gap-2'>
                                                <div className='text-sm font-semibold text-gray-800 truncate'>{item.name}</div>
                                            </div>
                                            <div className='text-[10px] text-gray-400 font-medium mt-0.5 uppercase tracking-wide'>
                                                {item.type === 'route' ? `Route ${item.ref}` : `Station ID: ${item.id}`}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleRemove(e, item.type, item.id)}
                                        className='p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0'
                                        title='Remove saved item'
                                    >
                                        <IconTrash />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default SavedPanel;
