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

// Reloading is safe only when it cannot lose an edit (follow-up R3 item 1). Offline, a reload lands on the browser's network
// error page; on an open canvas an edit can still be on its way (the canvas writes this browser's copy 400 ms after a change,
// the server copy after that), so a failed chunk there is caught where it renders (lazy-feature.jsx), never reloaded on its own.
// Pages that edit register here while open: LearnPage per board, with how to tell whether that board has edits not on the
// server yet (asked when it matters, so it is never stale). A check that throws counts as unsaved.
const editors = new Map();
export const editorOpened = (id, unsaved) => { editors.set(id, unsaved); };
export const editorClosed = id => { editors.delete(id); };
export const editorOpen = () => editors.size > 0;
export const unsavedEdits = () => [...editors.values()].some(unsaved => { try { return !!unsaved(); } catch { return true; } });

// vite:preloadError (main.jsx): the automatic reload for a new build, only online and with no editor open.
export const reloadForNewBuild = ({ online, editing, storage, now }) => online && !editing && reloadOnce(storage, now);
// Retry on a feature that could not load (lazy-feature.jsx): the person asked, so only being offline or unsaved edits stop it.
export const retryMayReload = ({ online, unsaved }) => online && !unsaved;
