import React, { useState, useEffect } from 'react';
import { addRecentSearch } from '../services/recentSearches';
import { toggleSavedItem, isItemSaved } from '../services/savedItems';

const IconClose = () => (
    <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
    </svg>
);

const RouteFilterPanel = ({ isOpen, onClose, selectedRouteIds, onSelectionChange, recentRouteSelect }) => {
    const [routes, setRoutes] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [savedState, setSavedState] = useState(0);

    useEffect(() => {
        const handleUpdate = () => setSavedState(s => s + 1);
        window.addEventListener('saved_items_updated', handleUpdate);
        return () => window.removeEventListener('saved_items_updated', handleUpdate);
    }, []);

    useEffect(() => {
        fetch('/routes.json')
            .then(res => res.json())
            .then(data => setRoutes(data))
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        if (recentRouteSelect) {
            setSearchQuery(recentRouteSelect.name);
        }
    }, [recentRouteSelect]);

    const filteredRoutes = routes.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.ref.includes(searchQuery)
    );

    const toggleRoute = (id) => {
        let newSelection;
        let isTurningOn = false;

        if (selectedRouteIds === null) {
            newSelection = new Set([id]);
            isTurningOn = true;
        } else {
            newSelection = new Set(selectedRouteIds);
            if (newSelection.has(id)) {
                newSelection.delete(id);
                if (newSelection.size === 0) {
                    newSelection = new Set(); // Empty set = no routes visible
                }
            } else {
                newSelection.add(id);
                isTurningOn = true;
            }
        }

        if (isTurningOn) {
            const routeData = routes.find(r => r.id === id);
            if (routeData) {
                addRecentSearch('route', { id: routeData.id, name: routeData.name, ref: routeData.ref });
            }
        }

        onSelectionChange(newSelection);
    };

    const selectAll = () => onSelectionChange(null);
    const clearAll = () => onSelectionChange(new Set());

    return (
        <>
            <div
                className={`fixed top-0 z-30 h-screen w-80 bg-white flex flex-col overflow-hidden transition-all duration-300
                    ${isOpen ? 'translate-x-0 shadow-2xl pointer-events-auto' : '-translate-x-full shadow-none pointer-events-none'}`}
                style={{ left: '48px' }}
            >
                <div className='p-4 border-b border-gray-200/50 flex justify-between items-center bg-white/50'>
                    <h2 className='text-lg font-semibold text-gray-800 tracking-tight'>Bus Routes</h2>
                    <button onClick={onClose} className='p-1.5 rounded-full hover:bg-gray-200/50 text-gray-500 transition-colors'>
                        <IconClose />
                    </button>
                </div>

                <div className='p-3 border-b border-gray-200/50 bg-gray-50/30'>
                    <input
                        type="text"
                        placeholder="Search routes (e.g. 01, Ga Ba Son)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className='w-full px-3 py-2 bg-white/60 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition-shadow shadow-inner placeholder-gray-400'
                    />
                    <div className='flex gap-2 mt-3'>
                        <button onClick={selectAll} className='flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors'>Show All</button>
                        <button onClick={clearAll} className='flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors'>Clear All</button>
                    </div>
                </div>

                <div className='flex-1 overflow-y-auto p-2'>
                    {filteredRoutes.length === 0 ? (
                        <div className='p-4 text-center text-sm text-gray-500'>No routes found</div>
                    ) : (
                        <div className='flex flex-col gap-1'>
                            {filteredRoutes.map(route => {
                                const isSelected = selectedRouteIds === null || selectedRouteIds.has(route.id);
                                return (
                                    <div
                                        key={route.id}
                                        onClick={() => toggleRoute(route.id)}
                                        className={`w-full text-left p-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 border border-transparent cursor-pointer
                                        ${isSelected ? 'bg-white shadow-sm border-gray-100' : 'opacity-60 hover:opacity-100 hover:bg-white/50'}
                                    `}
                                    >
                                        <div className='w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-sm shrink-0'
                                            style={{ backgroundColor: `rgb(${route.color[0]}, ${route.color[1]}, ${route.color[2]})` }}>
                                            {route.ref}
                                        </div>
                                        <div className='flex-1 min-w-0'>
                                            <div className='text-sm font-medium text-gray-800 truncate'>{route.name}</div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSavedItem('route', { id: route.id, name: route.name, ref: route.ref });
                                                }}
                                                className={`p-1 rounded-full transition-colors ${isItemSaved('route', route.id) ? 'text-blue-500 hover:text-blue-600' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-200/50'}`}
                                            >
                                                {isItemSaved('route', route.id) ? (
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z" /></svg>
                                                ) : (
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z" /></svg>
                                                )}
                                            </button>
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors
                                            ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}
                                        `}>
                                                {isSelected && <svg className='w-3 h-3 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={3} d='M5 13l4 4L19 7' /></svg>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default RouteFilterPanel;
