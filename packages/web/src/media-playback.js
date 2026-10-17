// Can this browser play this audio or video, and if not, the playable copy (owner spec section 7, Audio and video).
// probeMedia asks a detached, muted media element to reach `canplay` (the decoder started) or fail; the extension and
// canPlayType never decide alone (media-formats.js playbackPlan). A file the browser cannot decode gets a playback
// derivative through the control plane's job runner (contract sections 4.2 and 5; converter `audio-playback`,
// canvas-file-converter.md section 1.3), never straight from the converter. That needs the card's stored source
// (fileRef.source); a card without one is "awaiting converter" and keeps its original downloadable.
import { playbackPlan } from './media-formats.js';

export const PROBE_TIMEOUT_MS = 8000;

// blob + { kind: 'audio' | 'video', type } -> { plan, probe, canPlay, duration, width, height, error }
export function probeMedia(blob, { kind = 'audio', type = blob?.type || '', timeout = PROBE_TIMEOUT_MS } = {}) {
  return new Promise(resolve => {
    const element = document.createElement(kind);
    const canPlay = type ? element.canPlayType(type) : '';
    const url = URL.createObjectURL(type && blob.type !== type ? new Blob([blob], { type: type.split(';')[0] }) : blob);
    let timer = null;
    const finish = probe => {
      clearTimeout(timer);
      const duration = Number.isFinite(element.duration) ? element.duration : null;
      const result = { plan: playbackPlan({ canPlay, probe }), probe, canPlay, duration, width: element.videoWidth || 0, height: element.videoHeight || 0, error: element.error?.code ?? null };
      element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url);
      resolve(result);
    };
    timer = setTimeout(() => finish('timeout'), timeout);
    element.muted = true; element.preload = 'auto';
    element.addEventListener('canplay', () => finish('ok'), { once: true });
    element.addEventListener('error', () => finish('error'), { once: true });
    element.src = url;
  });
}

// ---- the playback derivative ------------------------------------------------------------------------------------------

export const PLAYBACK_CONVERTER = 'audio-playback';
export const PLAYBACK_OPTIONS = { bitrate_kbps: 128 };
const TERMINAL = new Set(['ready', 'ready_with_limitations', 'failed', 'cancelled']);
// One playable copy per source revision and options (derivatives are unique on that, contract 4): a second card, a
// retry after reload or a double click lands on the same job.
export const playbackKey = fileRef => `${PLAYBACK_CONVERTER}:${fileRef.source.rev}:${PLAYBACK_OPTIONS.bitrate_kbps}`;

// The card's derivative state, from what it holds and the last job status:
// 'awaiting-converter' (no stored source to convert yet), 'requesting', 'working' (+ stage), 'ready' (+ url), 'failed' (+ error).
export function derivativeState({ fileRef, job }) {
  if (!fileRef?.source?.id) return { state: 'awaiting-converter' };
  const playback = fileRef.derivatives?.playback;
  if (playback) return { state: 'ready', url: derivativeUrl(fileRef, playback) };
  if (!job) return { state: fileRef.job ? 'working' : 'requesting', stage: null };
  if (job.state === 'ready' || job.state === 'ready_with_limitations') {
    const id = playbackDerivative(job);
    return id ? { state: 'ready', url: derivativeUrl(fileRef, id), derivative: id, limitations: job.limitations || [] } : { state: 'failed', error: 'The playable copy finished without a playback file.' };
  }
  if (job.state === 'failed') return { state: 'failed', error: job.error || 'The playable copy could not be made.' };
  if (job.state === 'cancelled') return { state: 'failed', error: 'Making the playable copy was cancelled.' };
  return { state: 'working', stage: job.stage || job.state || null };
}

// The derivative id of kind playback in a job status answer (contract addition requested: the job status shape).
function playbackDerivative(job) {
  const list = job.derivatives || [];
  const found = list.find(d => d.kind === 'playback');
  if (found) return found.id;
  const ids = job.derivative_ids || job.derivativeIds || [];
  return ids.length === 1 ? ids[0] : null;
}
export const derivativeUrl = (fileRef, id) => `/api/learn/files/${encodeURIComponent(fileRef.source.id)}/d/${encodeURIComponent(id)}`;

const statusOf = body => (body?.job && typeof body.job === 'object' ? body.job : body);

// Submit (idempotent) -> the job id. `board` names the board the card is on, for the access check (contract 4.1).
export async function requestPlayback({ fileRef, cardId, board, fetchImpl = fetch, headers = {} }) {
  const response = await fetchImpl(`/api/learn/files/${encodeURIComponent(fileRef.source.id)}/jobs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ converter: PLAYBACK_CONVERTER, options: PLAYBACK_OPTIONS, card: cardId, board, idempotency_key: playbackKey(fileRef) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `The playable copy could not be requested (${response.status}).`);
  const job = statusOf(body);
  return { id: job.id || body.job_id, job };
}

// Reads the job until it settles. Polling only reads (contract 5.2); the runner advances the job without a browser.
export async function watchPlayback({ jobId, fetchImpl = fetch, headers = {}, signal, onUpdate = () => {}, delays = [1000, 2000, 3000, 5000] }) {
  for (let n = 0; ; n++) {
    if (signal?.aborted) return null;
    const response = await fetchImpl(`/api/learn/files/jobs/${encodeURIComponent(jobId)}`, { headers, signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `The playable copy's status is unavailable (${response.status}).`);
    const job = statusOf(body);
    onUpdate(job);
    if (TERMINAL.has(job.state)) return job;
    await new Promise(resolve => setTimeout(resolve, delays[Math.min(n, delays.length - 1)]));
  }
}

export async function retryPlayback({ jobId, fetchImpl = fetch, headers = {} }) {
  const response = await fetchImpl(`/api/learn/files/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST', headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `The retry was refused (${response.status}).`);
  return statusOf(body);
}
