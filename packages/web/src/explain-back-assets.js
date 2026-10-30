// Explain-back's private attempt assets in the browser (EB-02/EB-06): the voice note, the Sketch snapshot and the Sketch
// recording go to the learner's own attempt-asset store, never to a board file (packages/control-plane/src/
// learn-attempt-routes.js: PUT /api/learn/tutor/attempts/assets?app=&board=&kind=&sha256=&durationMs= <raw bytes> -> {asset};
// GET .../assets/:aa_id?app=&board= -> the bytes, owner only; PUT .../assets/:aa_id {app, board, marks, text} -> {meta}).
// createExplainBackAssets({ app, board }) is the `assets` object useExplainBackService takes; VoiceNote.jsx withVoicePlayer
// adds the submitted note's player.
import { wsHeaders } from './api.js';
import { mediaInfo } from './media-formats.js';
import { sketchMarks } from './explain-sketch.js';
import { createDraftSync } from './explain-back-drafts.js';

export const ASSETS_PATH = '/api/learn/tutor/attempts/assets';

// The learner's words for the store's refusals; the code stays on the error for callers and logs.
const MESSAGES = {
  asset_too_large: 'it is larger than a private answer file can be',
  unsupported_asset: 'this browser recorded a format that cannot be saved',
  asset_hash_mismatch: 'the upload was damaged on the way. Retry',
  asset_length_required: 'the upload had no length. Retry',
  invalid_asset: 'this kind of file cannot be saved here yet',
  unknown_asset: 'it is no longer stored',
  attempts_unavailable: 'saving answers is unavailable right now. Retry',
};
export class AssetError extends Error {
  constructor(code, status) {
    super(MESSAGES[code] || (status >= 500 || !status ? 'Rabbit Hole could not be reached. Retry' : `saving failed (${code})`));
    this.code = code; this.status = status;
    this.retryable = !status || status >= 500 || ['asset_hash_mismatch', 'asset_length_required', 'attempts_unavailable'].includes(code);
  }
}

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256Hex = async blob => hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
// The type the bytes are, not the type a name or a caller claims: PNG, the audio containers the store takes, or JSON.
export async function mimeOf(blob) {
  const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
  if (head[0] === 0x89 && String.fromCharCode(...head.subarray(1, 4)) === 'PNG') return 'image/png';
  const info = mediaInfo(head);
  if (info && !info.video && ['webm', 'matroska', 'ogg', 'mp4'].includes(info.container)) return { webm: 'audio/webm', matroska: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4' }[info.container];
  if (/^\s*[{[]/.test(new TextDecoder().decode(head.subarray(0, 16)))) return 'application/json';
  return null;
}
// A PNG data URL (the Sketch capture) -> its bytes.
export function pngFromDataUrl(url) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(url || ''));
  if (!match) throw new AssetError('invalid_asset', 400);
  return new Blob([Uint8Array.from(atob(match[1]), c => c.charCodeAt(0))], { type: 'image/png' });
}

export function createExplainBackAssets({ app, board = 'main', fetchImpl = (...args) => globalThis.fetch(...args), timers = globalThis }) {
  const scope = new URLSearchParams({ app, board });
  const headers = () => { try { return wsHeaders(); } catch { return {}; } };
  const fail = async response => { const body = await response.json().catch(() => ({})); throw new AssetError(body.error || `http_${response.status}`, response.status); };

  // One upload: the bytes as they are, their sha256 and the kind the store checks them as. -> the store's asset record.
  async function put(blob, { kind, durationMs = null, onProgress = null }) {
    const type = await mimeOf(blob);
    const sha256 = await sha256Hex(blob);
    const query = new URLSearchParams({ app, board, kind, sha256, ...(durationMs != null ? { durationMs: String(Math.max(1, Math.round(durationMs))) } : {}) });
    onProgress?.({ sent: 0, total: blob.size });
    let response;
    try { response = await fetchImpl(`${ASSETS_PATH}?${query}`, { method: 'PUT', headers: { 'Content-Type': type || 'application/octet-stream', ...headers() }, body: blob }); }
    catch { throw new AssetError('network', 0); }
    if (!response.ok) await fail(response);
    const { asset } = await response.json();
    if (asset?.sha256 && asset.sha256 !== sha256) throw new AssetError('asset_hash_mismatch', 400);
    onProgress?.({ sent: blob.size, total: blob.size });
    return { ...asset, sha256 };
  }
  async function load(assetId) {
    let response;
    try { response = await fetchImpl(`${ASSETS_PATH}/${encodeURIComponent(assetId)}?${scope}`, { headers: headers() }); }
    catch { throw new AssetError('network', 0); }
    if (!response.ok) await fail(response);
    return response.blob();
  }

  // Each card's server draft (explain-back-drafts.js), loaded once per card on first use. The voice note and Sketch recording
  // references live in it, beside the card's text and inputs.
  const drafts = new Map();
  const draftFor = cardId => {
    if (!drafts.has(cardId)) { const sync = createDraftSync({ app, board, cardId, fetchImpl, timers }); drafts.set(cardId, sync); sync.load(); }
    return drafts.get(cardId);
  };

  return {
    drafts: { for: draftFor },
    // The Sketch capture { image: PNG data URL, text, marks? } -> its sketch EvidenceRef, with marks and text stored beside it.
    async uploadSketch({ block, sketch }) {
      const png = pngFromDataUrl(sketch.image);
      const asset = await put(png, { kind: 'image' });
      const meta = { app, board, marks: sketch.marks ?? sketchMarks(block?.sketch), text: sketch.text ?? '' };
      let response;
      try { response = await fetchImpl(`${ASSETS_PATH}/${encodeURIComponent(asset.assetId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(meta) }); }
      catch { throw new AssetError('network', 0); }
      if (!response.ok) await fail(response);
      return { evidenceId: `ev_sketch_${asset.sha256.slice(0, 16)}`, role: 'sketch', media: 'image', state: 'ready', assetId: asset.assetId, revision: asset.revision ?? 1, hash: asset.sha256, mime: 'image/png', bytes: png.size };
    },
    // createVoiceNote's options (explain-back-media.js): upload resolves the asset, which toSavedVoice maps to the EvidenceRef.
    voice: {
      upload: (file, { durationMs, onProgress }) => put(file, { kind: 'audio', durationMs, onProgress }),
      load,
      saved: blockId => draftFor(blockId).get().answer.voice?.[0] ?? null,
      onSaved: (blockId, ref) => draftFor(blockId).patch({ voice: ref ? [ref] : [] }),
    },
    // createSketchRecording's options (sketch-recording.js); the timeline JSON is kind 'timeline'.
    recording: {
      upload: (file, { durationMs, onProgress }) => put(file, { kind: 'timeline', durationMs, onProgress }),
      uploadAudio: (file, { durationMs, onProgress }) => put(file, { kind: 'audio', durationMs, onProgress }),
      load,
      saved: blockId => draftFor(blockId).get().answer.recording ?? null,
      onSaved: (blockId, ref) => draftFor(blockId).patch({ recording: ref ?? undefined }),
    },
  };
}
