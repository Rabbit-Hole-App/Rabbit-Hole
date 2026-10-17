// Where a media card's original lives (file-imports Lane 3). Two shapes, one reader:
//   fileRef (contract section 3; lead 2026-10-16): new SVG and audio imports become one stored source through Lane 2's
//     file-source-client.js; cards made by Context "Add to canvas" (file-to-canvas.js) carry the same shape for any media
//     family, images and video included.
//   board asset: assetKey names a blob in this browser's cache, synced with the board. Image, GIF and video drops keep this
//     proven path (lead ruling 2026-10-16), and so do SVG and audio until the client is injected.
// The client is injected (setSourceClient) so this module codes against its signature before it lands:
//   uploadSource(file, { app, board, family }) -> { id, rev } (or { source: { id, rev } }); loadSource(block) -> Blob
// ponytail: LearnPage calls setSourceClient(await import('./file-source-client.js'), { app, board }) once Lane 2 commits it.
import { cacheAsset } from './learn-asset-cache.js';
import { loadAsset } from './learn-board-assets.js';

let client = null, where = {};
export const setSourceClient = (next, context = {}) => { client = next; where = context; };
export const sourceClient = () => client;

// Families whose new imports go to a stored source when the client is there.
export const SOURCE_FAMILIES = new Set(['svg', 'audio']);
const FAMILY_OF_KIND = { svg: 'svg', audio: 'audio', image: 'image', gif: 'gif', clip: 'video' };

const sourceOf = result => { const source = result?.source || result; if (!source?.id || !source?.rev) throw new Error('The file could not be stored'); return { id: source.id, rev: source.rev }; };

// importMedia's { kind, meta } for `file` -> the card fields to insert: { assetKey } or { fileRef }, plus label and kind.
// meta (size, type and the facts the card reserves its shape with) rides in fileRef.meta; nothing else, never bytes or URLs.
export async function storeMedia(file, { kind, meta }, { app, board } = where) {
  const family = FAMILY_OF_KIND[kind];
  if (client && SOURCE_FAMILIES.has(family)) {
    const source = sourceOf(await client.uploadSource(file, { app, board, family }));
    const title = file.name.replace(/\.[^.]+$/, '');
    return { kind, label: file.name, fileRef: { v: 1, source, family, meta: { ...meta, title }, view: {}, derivatives: {}, job: null, doc: null, status: { preview: 'ready', context: 'none' } } };
  }
  const assetKey = `drop:${crypto.randomUUID()}`;
  await cacheAsset(assetKey, file);
  return { kind, label: file.name, assetKey, meta };
}

// The original's bytes for a card: the stored source, else the board asset. null when neither is readable here.
export async function loadMediaOriginal(block) {
  if (block?.fileRef?.source?.id) {
    if (!client) return null;
    try { return (await client.loadSource(block)) || null; } catch { return null; }
  }
  return loadAsset(block?.assetKey);
}
// What the card knows about its file: fileRef.meta for a stored source, the block's own meta otherwise.
export const mediaMeta = block => block?.fileRef?.meta || block?.meta || {};
