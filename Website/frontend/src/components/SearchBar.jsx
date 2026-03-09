import React, { useState } from 'react'
import SearchDropdown from './SearchDropdown'

const SearchBar = () => {
    const [query, setQuery] = useState('')
    const [isFocused, setIsFocused] = useState(false)

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
                    onBlur={() => setTimeout(() => setIsFocused(false), 150)}
                    placeholder='Search bus routes, stops...'
                    className='flex-1 outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent'
                />
                {query && (
                    <button
                        onClick={() => setQuery('')}
                        className='text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none'
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Dropdown — only visible when input is focused */}
            {isFocused && <SearchDropdown query={query} />}
        </div>
    )
}

export default SearchBar
