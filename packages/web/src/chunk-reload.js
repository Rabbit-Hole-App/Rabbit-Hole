// A deploy replaces the hashed chunks (the worker's assets serve only the current version), so a tab opened before it
// gets a 404 on its next lazy chunk and Vite fires 'vite:preloadError' (main.jsx). Reload once to fetch the new shell
// (served no-store); a second failure within the window shows an error instead, so this can never loop.
export const RELOAD_KEY = 'small.chunk-reload';
export const RELOAD_WINDOW = 60_000;

export function reloadOnce(storage, now) {
  try {
    const last = Number(storage.getItem(RELOAD_KEY)) || 0;
    if (now - last < RELOAD_WINDOW) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch { return false; } // no usable session storage: never reload
}
