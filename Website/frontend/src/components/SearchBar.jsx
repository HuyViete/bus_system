import React, { useState, useEffect, useMemo } from 'react'
import SearchDropdown from './SearchDropdown'

const SearchBar = ({ onLocationSelect }) => {
    const [query, setQuery] = useState('')
    const [isFocused, setIsFocused] = useState(false)
    const [stations, setStations] = useState([])

    useEffect(() => {
        fetch('/stations.json')
            .then(res => res.json())
            .then(data => setStations(data))
            .catch(err => console.error('[SearchBar] Failed to load stations:', err))
    }, [])

    const filteredStations = useMemo(() => {
        if (!query.trim()) return []
        const lowerQuery = query.toLowerCase()
        return stations
            .filter(s => s.name.toLowerCase().includes(lowerQuery))
            .slice(0, 10) // Limit to top 10 for performance
    }, [query, stations])

    const handleSelect = (station) => {
        setQuery(station.name)
        if (onLocationSelect) {
            onLocationSelect({ lat: station.lat, lon: station.lon })
        }
    }

    return (
        <div
            className='fixed top-3 z-20'
            style={{ left: '60px' }}
        >
            {/* Search input */}
            <div className={`flex items-center h-12 bg-white rounded-2xl shadow-lg px-4 py-2 gap-2 w-80 transition-shadow duration-200 ${isFocused ? 'shadow-xl ring-2 ring-blue-400' : ''}`}>
                <svg className='w-5 h-5 text-gray-400 shrink-0' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' d='M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z' />
                </svg>
                <input
                    type='text'
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder='Search bus stops...'
                    className='flex-1 outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent'
                />
                {query && (
                    <button
                        onClick={() => {
                            setQuery('')
                        }}
                        className='text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none'
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Dropdown — only visible when input is focused */}
            {isFocused && (
                <SearchDropdown
                    query={query}
                    results={filteredStations}
                    onSelect={handleSelect}
                />
            )}
        </div>
    )
}

export default SearchBar
