// Follow-up R3 item 3: where the browser blocks storage, reading window.localStorage (or sessionStorage) itself throws a
// SecurityError, and the app's first read (the theme, api.js) failed the whole page before a canvas could open. This is
// main.jsx's first import, so before any other module reads storage, a blocked store is replaced for this page load by one
// in memory: every reader keeps working and nothing outlives the page, which an open canvas says (LearnPage UNKEPT).
// memory: true tells a reader that needs a value to outlive the page (chunk-reload.js reloadOnce) that this one cannot.
export const memoryStorage = () => {
  const items = new Map();
  return {
    memory: true,
    getItem: key => (items.has(String(key)) ? items.get(String(key)) : null),
    setItem: (key, value) => { items.set(String(key), String(value)); },
    removeItem: key => { items.delete(String(key)); },
    clear: () => { items.clear(); },
    key: index => [...items.keys()][index] ?? null,
    get length() { return items.size; },
  };
};

export const blockedStorage = [];
for (const name of typeof window === 'undefined' ? [] : ['localStorage', 'sessionStorage']) {
  try { void window[name]; } catch {
    blockedStorage.push(name);
    try { Object.defineProperty(window, name, { configurable: true, value: memoryStorage() }); } catch { /* the readers' own guards stay */ }
  }
}
