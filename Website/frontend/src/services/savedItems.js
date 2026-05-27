const STORAGE_KEY = 'bkus_saved_items';

export const getSavedItems = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to parse saved items from localStorage', e);
    }
    return [];
};

export const saveItem = (type, data) => {
    let items = getSavedItems();

    // Check if already saved
    const existsIndex = items.findIndex(item => item.type === type && item.id === data.id);
    if (existsIndex === -1) {
        items.unshift({ type, ...data });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        window.dispatchEvent(new Event('saved_items_updated'));
        return true; // Added
    }
    return false; // Already existed
};

export const removeItem = (type, id) => {
    let items = getSavedItems();
    const newItems = items.filter(item => !(item.type === type && item.id === id));

    if (newItems.length !== items.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
        window.dispatchEvent(new Event('saved_items_updated'));
        return true; // Removed
    }
    return false; // Did not exist
};

export const toggleSavedItem = (type, data) => {
    if (isItemSaved(type, data.id)) {
        removeItem(type, data.id);
        return false; // is now unsaved
    } else {
        saveItem(type, data);
        return true; // is now saved
    }
};

export const isItemSaved = (type, id) => {
    const items = getSavedItems();
    return items.some(item => item.type === type && item.id === id);
};

export const clearSavedItems = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('saved_items_updated'));
};
