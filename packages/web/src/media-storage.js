// Where a media card's original lives (file-imports Lane 3). Two shapes, one reader (Lane 2's file-source-client.js):
//   fileRef (contract section 3; lead 2026-10-16): a new SVG or audio import is a fileRef card at once. Its bytes wait in
//     this browser under fileRef.local while startUpload stores them as one source; the card then writes fileRef.source
//     (MediaCard.jsx). Cards made by Context "Add to canvas" (file-to-canvas.js) carry the same shape for any media family.
//   board asset: assetKey names a blob in this browser's cache, synced with the board. Image, GIF and video drops keep this
//     proven path (lead ruling 2026-10-16).
import { cacheAsset } from './learn-asset-cache.js';
import { loadSource, startUpload } from './file-source-client.js';

// Families whose new imports become stored sources.
export const SOURCE_FAMILIES = new Set(['svg', 'audio']);

// importMedia's { kind, meta } for an SVG or audio `file` -> the card fields to insert. One upload starts now, from the file
// in hand; the card shows its progress and, on failure, "Not saved: <reason>" with Retry. Nothing but the compact fileRef
// rides in the board: no bytes, URLs or text.
export async function storeMedia(file, { kind, meta }) {
  const family = kind;
  if (!SOURCE_FAMILIES.has(family)) throw new Error(`${kind} cards keep their board-file path`);
  const local = `import:${crypto.randomUUID()}`;
  await cacheAsset(local, file);
  startUpload(local, { family, file });
  return { kind, label: file.name, fileRef: { v: 1, source: null, family, meta: { ...meta, title: file.name.replace(/\.[^.]+$/, '') }, view: {}, local, derivatives: {}, job: null, doc: null, status: { preview: 'ready', context: 'none' } } };
}

// The original's bytes for a card, either shape. null when it cannot be read here.
export const loadMediaOriginal = block => loadSource(block).catch(() => null);
// What the card knows about its file: fileRef.meta for a fileRef card, the block's own meta otherwise.
export const mediaMeta = block => block?.fileRef?.meta || block?.meta || {};
