import React from 'react'

/**
 * SearchDropdown — placeholder component.
 * Will be implemented later to show route/stop suggestions
 * as the user types in the SearchBar.
 *
 * Positioned absolutely below the SearchBar input.
 */
const SearchDropdown = ({ query }) => {
    return (
        <div className='absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100'>
            {/* ── Placeholder content ── */}
            <div className='px-4 py-3 text-xs text-gray-400 italic'>
                {query
                    ? `Results for "${query}" will appear here…`
                    : 'Start typing to search for bus routes or stops…'}
            </div>
            {/* TODO: map suggestion items here */}
        </div>
    )
}

export default SearchDropdown
