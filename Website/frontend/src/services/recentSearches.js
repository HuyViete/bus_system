export const addRecentSearch = (type, data) => {
    try {
        let recents = JSON.parse(localStorage.getItem('recent_searches')) || [];
        // Filter out existing identical search to bring it to the top
        recents = recents.filter(item => !(item.type === type && item.id === data.id));
        
        // Add new item to front
        recents.unshift({ type, ...data, timestamp: Date.now() });
        
        // Keep only top 15
        if (recents.length > 15) {
            recents = recents.slice(0, 15);
        }
        
        localStorage.setItem('recent_searches', JSON.stringify(recents));
        window.dispatchEvent(new Event('recent_searches_updated'));
    } catch (err) {
        console.error('Failed to save recent search:', err);
    }
};

export const getRecentSearches = () => {
    try {
        const data = localStorage.getItem('recent_searches');
        return data ? JSON.parse(data) : [];
    } catch (err) {
        console.error('Failed to load recent searches:', err);
        return [];
    }
};

export const clearRecentSearches = () => {
    try {
        localStorage.removeItem('recent_searches');
        window.dispatchEvent(new Event('recent_searches_updated'));
    } catch (err) {
        console.error('Failed to clear recent searches:', err);
    }
};
