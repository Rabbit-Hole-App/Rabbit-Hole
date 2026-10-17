// The browser side of imported file sources (docs/features/canvas-file-imports.md sections 3 and 4.2), shared by lanes 2-4:
// upload an original (sha256, POST /api/learn/files, PUT the bytes with byte progress) and read a card's original back,
// whether the card is a fileRef card or an older card whose bytes are a board file (assetKey). A local preview is never
// "saved": a card is saved only once its fileRef names a stored source revision and the board save that names it went
// through (that save writes the file_source_refs row the server authorizes reads by).
import { cachedAsset, cacheAsset } from './learn-asset-cache.js';
import { loadAsset } from './learn-board-assets.js';
import { wsHeaders } from './api.js';

// The workspace header, or none where the page has no storage to read it from (a test, a locked-down browser).
const headers = () => { try { return wsHeaders(); } catch { return {}; } };

// How this page reads sources: { app, board } on the owner's canvas (a fork's owner reads through their own board), { share }
// on a share or publication link, { member } (a board id) on a canvas member's page; null reads as the source's owner only.
let scope = null;
export const setFileScope = next => { scope = next || null; };
export const fileScope = () => scope;
// The query a read carries for the current scope (learn-files.js download, file-jobs.js reads).
export function scopeQuery(at = scope) {
  if (at?.share) return `?share=${encodeURIComponent(at.share)}`;
  if (at?.member) return `?member=${encodeURIComponent(at.member)}`;
  if (at?.app) return `?app=${encodeURIComponent(at.app)}&board=${encodeURIComponent(at.board || 'main')}`;
  return '';
}
// Only the owner's own canvas page uploads and stores derivatives; a link or member page only reads.
export const canWrite = (at = scope) => !!at?.app && !at.share && !at.member;

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
// ponytail: the whole file is hashed at once (crypto.subtle has no streaming digest); sources are capped at 50 MiB.
export const sha256Hex = async blob => hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));

// The local cache key of a stored revision: sources are immutable, so a cached copy of id@rev never goes stale.
export const sourceKey = source => `file:${source.id}@${source.rev}`;

// PUT with byte progress (fetch has no upload progress). Resolves { status, body }.
function put(url, file, onProgress, Request = globalThis.XMLHttpRequest) {
  return new Promise((resolve, reject) => {
    const xhr = new Request();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers())) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = event => onProgress?.({ sent: event.loaded, total: event.lengthComputable ? event.total : file.size });
    xhr.onload = () => { let body = null; try { body = JSON.parse(xhr.responseText); } catch { body = null; } resolve({ status: xhr.status, body }); };
    xhr.onerror = () => reject(Object.assign(Error('The upload was interrupted. Check the connection and retry.'), { retryable: true }));
    xhr.onabort = () => reject(Object.assign(Error('The upload was cancelled.'), { retryable: true }));
    xhr.send(file);
  });
}

// uploadSource(file, { app, board, family, onProgress }) -> { source: { id, rev, family, name, type, size, status } }.
// Identical bytes the owner already stored are not sent again (the create answers upload: null). A failure throws an Error
// whose message is the visible reason; `retryable` says whether Retry can help.
export async function uploadSource(file, { app, board = 'main', family, onProgress = null, fetchImpl = globalThis.fetch, Request } = {}) {
  onProgress?.({ stage: 'hashing', sent: 0, total: file.size });
  const sha256 = await sha256Hex(file);
  let made;
  try {
    const response = await fetchImpl('/api/learn/files', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ app, board, name: file.name, type: file.type || '', size: file.size, sha256, family }) });
    made = { status: response.status, body: await response.json().catch(() => null) };
  } catch { throw Object.assign(Error('Could not reach Rabbit Hole to save this file. Check the connection and retry.'), { retryable: true }); }
  if (made.status === 404 && /Save this board first/.test(made.body?.error || '')) throw Object.assign(Error('This canvas is still saving. The file will be saved once it is.'), { retryable: true, boardNotSaved: true });
  if (made.status >= 400 || !made.body?.source) throw Object.assign(Error(made.body?.error || `Saving this file failed (${made.status}).`), { retryable: made.status >= 500 || made.status === 401 });
  if (made.body.upload) {
    const sent = await put(made.body.upload.url, file, progress => onProgress?.({ stage: 'uploading', ...progress }), Request);
    if (sent.status >= 400 || !sent.body?.source) throw Object.assign(Error(sent.body?.error || `Uploading this file failed (${sent.status}).`), { retryable: sent.status >= 500 || sent.status === 409 });
    made.body.source = sent.body.source;
  }
  onProgress?.({ stage: 'sent', sent: file.size, total: file.size }); // stored is the caller's to say, with the source
  return { source: made.body.source };
}

// A card's original: a fileRef's stored source (this browser's copy, else the server through this page's scope), a fileRef
// still uploading (its local copy), or an older card's board file (assetKey). null when none can be read here.
const reading = new Map();
export async function loadSource(block, { fetchImpl = globalThis.fetch } = {}) {
  const ref = block?.fileRef;
  if (!ref) return block?.assetKey ? loadAsset(block.assetKey) : null;
  if (!ref.source?.id) return ref.local ? cachedAsset(ref.local) : null;
  const key = sourceKey(ref.source);
  const local = await cachedAsset(key);
  if (local != null) return local;
  if (!reading.has(key)) {
    reading.set(key, (async () => {
      const response = await fetchImpl(`/api/learn/files/${encodeURIComponent(ref.source.id)}${scopeQuery()}`, { headers: headers() });
      if (!response.ok) return null;
      const blob = await response.blob();
      // Only the owner's canvas keeps a copy: a link or member page reads per request, so revoking access ends reading.
      if (canWrite()) await cacheAsset(key, blob);
      return blob;
    })().catch(() => null).finally(() => setTimeout(() => reading.delete(key), 0)));
  }
  return reading.get(key);
}

// ---- uploads by a card's local key, so every card made from one file shares one upload, and a card that mounts after a
// reload resumes from the local copy instead of asking for the file again. State: { stage, sent, total, error, retryable,
// source }. stage: 'waiting' | 'hashing' | 'uploading' | 'stored' | 'failed'.
const uploads = new Map(), listeners = new Map();
const emit = (key, state) => { uploads.set(key, state); for (const fn of listeners.get(key) || []) fn(state); };
export const uploadState = key => uploads.get(key) || null;
export function watchUpload(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}
const BOARD_WAITS = [1500, 3000, 5000, 8000, 12000];
// startUpload: idempotent per key while running or stored; a failed one runs again (Retry).
export function startUpload(key, { family, at = scope, file = null, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), ...options } = {}) {
  const now = uploads.get(key);
  if (now && now.stage !== 'failed') return now;
  emit(key, { stage: 'waiting', sent: 0, total: file?.size || 0 });
  (async () => {
    const bytes = file || await cachedAsset(key);
    if (!bytes) { emit(key, { stage: 'failed', error: 'This file is not in this browser any more, so it was never saved. Drop it on the canvas again.', retryable: false }); return; }
    const named = bytes instanceof File ? bytes : new File([bytes], options.name || 'file', { type: bytes.type || '' });
    if (!canWrite(at)) { emit(key, { stage: 'failed', error: 'Only the canvas owner can save files here.', retryable: false }); return; }
    for (let attempt = 0; ; attempt++) {
      try {
        const { source } = await uploadSource(named, { app: at.app, board: at.board, family, onProgress: progress => emit(key, { ...uploads.get(key), ...progress, stage: progress.stage }), ...options });
        await cacheAsset(sourceKey(source), named);
        emit(key, { stage: 'stored', sent: named.size, total: named.size, source });
        return;
      } catch (error) {
        if (error.boardNotSaved && attempt < BOARD_WAITS.length) { emit(key, { ...uploads.get(key), stage: 'waiting' }); await wait(BOARD_WAITS[attempt]); continue; }
        emit(key, { stage: 'failed', error: error.message, retryable: error.retryable !== false });
        return;
      }
    }
  })();
  return uploads.get(key);
}
// For tests: forget every upload.
export const resetUploads = () => { uploads.clear(); listeners.clear(); reading.clear(); };
