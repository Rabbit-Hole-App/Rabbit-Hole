// Board files (docs/features/canvas-sharing.md): a card asks for its file by
// asset key; this browser's cache answers first, then the board's server copy
// (set by the page: the owner's board, or a shared link), which is then cached.
import { cachedAsset, cacheAsset } from './learn-asset-cache.js';

let remote = null;
export const setRemoteAssets = fetcher => { remote = fetcher; };

export async function loadAsset(key) {
  if (!key) return null;
  const local = await cachedAsset(key);
  if (local != null || !remote) return local;
  try {
    const response = await remote(key);
    if (!response?.ok) return null;
    const value = response.headers.get('x-asset-kind') === 'string' ? await response.text() : await response.blob();
    cacheAsset(key, value);
    return value;
  } catch { return null; }
}

// Every file a board's cards use: dropped and uploaded files, PDFs, and
// generated illustrations.
export function assetKeysOf(state) {
  const keys = new Set();
  for (const block of state?.blocks || []) {
    if (block.assetKey) keys.add(block.assetKey);
    for (const variant of block.variants || []) if (variant.cacheKey) keys.add(variant.cacheKey);
  }
  return [...keys];
}
