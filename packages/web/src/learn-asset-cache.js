// Generated lesson assets (images today) are cached in this browser by their
// prompt, so re-inserting a block or reloading never pays for the same
// illustration twice. Server-side scene and video jobs already dedupe by a
// content hash, so only image bytes need a client cache.
// ponytail: no eviction policy yet; IndexedDB grows until the browser trims it.

const DB = 'small-learn-assets';
const STORE = 'assets';

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const store = db.transaction(STORE, mode).objectStore(STORE);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch { return null; } // a blocked or full store must never break a lesson
}

export const cachedAsset = key => run('readonly', store => store.get(key));
export const cacheAsset = (key, value) => run('readwrite', store => store.put(value, key));
