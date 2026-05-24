import React from 'react'

/**
 * SearchDropdown — Displays filtered bus stop results below the SearchBar.
 * Positioned absolutely below the SearchBar input.
 */
const SearchDropdown = ({ query, results, onSelect }) => {
    return (
        <div className='absolute top-full left-0 mt-2 w-full max-h-80 overflow-y-auto bg-white rounded-2xl shadow-xl border border-gray-100 divide-y divide-gray-50'>
            {!query ? (
                <div className='px-4 py-3 text-sm text-gray-400 italic text-center'>
                    Start typing to search for bus stops…
                </div>
            ) : results && results.length > 0 ? (
                results.map((station) => (
                    <button
                        key={station.id}
                        onMouseDown={() => onSelect(station)}
                        className='w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-2 group'
                    >
                        <img src='/station.svg' alt='logo' className='h-7' />
                        <div className='flex flex-col min-w-0'>
                            <span className='text-sm font-medium text-gray-800 truncate group-hover:text-blue-600 transition-colors'>
                                {station.name}
                            </span>
                        </div>
                    </button>
                ))
            ) : (
                <div className='px-4 py-3 text-sm text-gray-400 italic text-center'>
                    No bus stop found for "{query}"
                </div>
            )}
        </div>
    )
}

export default SearchDropdown
