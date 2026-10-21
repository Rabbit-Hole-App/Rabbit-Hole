// A deploy replaces the hashed chunks (the worker's assets serve only the current version), so a tab opened before it
// gets a 404 on its next lazy chunk and Vite fires 'vite:preloadError' (main.jsx). Reload once to fetch the new shell
// (served no-store); a second failure within the window shows an error instead, so this can never loop.
export const RELOAD_KEY = 'small.chunk-reload';
export const RELOAD_WINDOW = 60_000;

// The marker must outlive the reload it allows: a store held in memory (storage-fallback.js, where the browser blocks
// sessionStorage) starts empty on every page load, so trusting it would reload on every load. No such store, no reload.
export function reloadOnce(storage, now) {
  if (!storage || storage.memory) return false;
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
// `durable` (optional) answers the stricter question "Reload to update" asks (below): is everything confirmed on the server?
const editors = new Map();
export const editorOpened = (id, unsaved, durable = null) => { editors.set(id, { unsaved, durable }); };
export const editorClosed = id => { editors.delete(id); };
export const editorOpen = () => editors.size > 0;
export const unsavedEdits = () => [...editors.values()].some(({ unsaved }) => { try { return !!unsaved(); } catch { return true; } });
// An editor that cannot confirm (no `durable`, or it throws) counts as not durable.
export const workDurable = () => [...editors.values()].every(({ durable }) => { try { return durable?.() === true; } catch { return false; } });

// vite:preloadError (main.jsx): the automatic reload for a new build, only online and with no editor open.
export const reloadForNewBuild = ({ online, editing, storage, now }) => online && !editing && reloadOnce(storage, now);
// Retry on a feature that could not load (lazy-feature.jsx): the person asked, so only being offline or unsaved edits stop it.
export const retryMayReload = ({ online, unsaved }) => online && !unsaved;

// "Reload to update" where a feature's module could not load (the CAD viewer; owner clarification 8, 2026-10-20). Retry comes
// first. The reload is offered only once the failed chunk is shown to be gone from the server (a release replaced the hashed
// files: a stale build, not a network blip), happens only on the person's click, and only when nothing can be lost.
// A failed dynamic import, in Chrome's, Safari's, Firefox's and Vite's preload words.
export const moduleLoadFailed = error => /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script|Unable to preload/i.test(String(error?.message ?? error ?? ''));
// The built chunk (this origin's /static/*.js) the failure names, else null.
export function failedChunkUrl(error, origin) {
  const found = String(error?.message ?? error ?? '').match(/https?:\/\/[^\s'"]+?\.js/);
  try { const url = found && new URL(found[0]); return url && url.origin === origin && url.pathname.startsWith('/static/') ? url.href : null; } catch { return null; }
}
// Stale build: the server answers 404 for that chunk now. Offline, an error or any other status is not proof.
export async function chunkGone(url, fetcher = fetch) {
  if (!url) return false;
  try { return (await fetcher(url, { method: 'HEAD', cache: 'no-store' })).status === 404; } catch { return false; }
}
// Typed text a reload would drop (a chat draft, a Quick Edit prompt, a clarification answer): any of the given fields
// holding words. React keeps a controlled field's default in step with its value, so the value alone is the test.
export const draftsPending = fields => [...fields].some(field => typeof field.value === 'string' && field.value.trim() !== '');
// Why a reload must not happen now, or null. `durable`: workDurable(). A store held only in memory cannot keep the reload
// marker, so the page could not tell a second failure after the reload from the first: no reload at all (as reloadOnce).
export function updateReloadBlock({ online, durable, drafts, storage }) {
  if (!online) return 'offline';
  if (!durable) return 'unsaved';
  if (drafts) return 'draft';
  if (!storage || storage.memory) return 'storage';
  return null;
}
