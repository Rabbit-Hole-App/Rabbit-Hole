// Where a media card's original lives (file-imports Lane 3). Two shapes, one reader (Lane 2's file-source-client.js):
//   fileRef (contract section 3; lead 2026-10-16): a new SVG or audio import is a fileRef card at once. Its bytes wait in
//     this browser under fileRef.local while startUpload stores them as one source; the card then writes fileRef.source
//     (MediaCard.jsx). Cards made by Context "Add to canvas" (file-to-canvas.js) carry the same shape for any media family.
//   board asset: assetKey names a blob in this browser's cache, synced with the board. Image, GIF and video drops keep this
//     proven path (lead ruling 2026-10-16).
import { cacheAsset } from './learn-asset-cache.js';
import { canWrite, loadSource, startUpload } from './file-source-client.js';

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

// A stored source can be unreadable for a moment: a card placed from a stored file (a generated image, Add to canvas) is read
// before the board save that registers this canvas's reference to it (file_source_refs) lands, about 2 s later (LearnPage
// pushBoard), and until then the server answers the same 404 as for a file this page may not read; a read can also fail in
// transit. So a failed read of a stored source is tried again at once after each board save and otherwise with backoff, and is
// called missing only when the waits run out; a board save after that, on a writable canvas (the only page that can register the
// reference), reads once more per save. publish({ status: 'loading' | 'ready' | 'missing', blob }). -> cancel(): once the
// card is removed, its source replaced or the page left, nothing more is read or published.
export const READ_WAITS = [500, 1000, 2000, 4000, 8000, 16000];
const boardSaved = fn => { globalThis.addEventListener?.('rh:board-saved', fn); return () => globalThis.removeEventListener?.('rh:board-saved', fn); };
export function readOriginal(block, publish, { load = loadMediaOriginal, waits = READ_WAITS, onSaved = boardSaved } = {}) {
  let live = true, timer = null, reading = false, saved = false, gaveUp = false, tries = 0;
  const read = () => {
    timer = null; reading = true; saved = false;
    Promise.resolve(block).then(load).catch(() => null).then(value => {
      reading = false;
      if (!live) return;
      if (value && typeof value !== 'string') { publish({ status: 'ready', blob: value }); return; }
      if (!block?.fileRef?.source?.id || tries >= waits.length) { gaveUp = true; publish({ status: 'missing', blob: null }); return; }
      timer = setTimeout(read, saved ? 0 : waits[tries]); tries++;
    });
  };
  const off = onSaved(() => { if (!live) return; if (timer) { clearTimeout(timer); read(); } else if (reading) saved = true; else if (gaveUp && block.fileRef?.source?.id && canWrite()) read(); });
  publish({ status: 'loading', blob: null });
  read();
  return () => { live = false; clearTimeout(timer); off(); };
}

// What the card knows about its file: fileRef.meta for a fileRef card, the block's own meta otherwise.
export const mediaMeta = block => block?.fileRef?.meta || block?.meta || {};
