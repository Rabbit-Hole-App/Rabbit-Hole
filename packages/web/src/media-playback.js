// Can this browser play this audio or video, and if not, the playable copy (owner spec section 7, Audio and video).
// probeMedia asks a detached, muted media element to reach `canplay` (the decoder started) or fail; the extension and
// canPlayType never decide alone (media-formats.js playbackPlan). A file the browser cannot decode gets a playback
// derivative through the control plane's job runner (contract sections 4.2 and 5; converter `audio-playback`,
// canvas-file-converter.md section 1.3) via the JOBS lane's file-jobs-client.js, never straight from the converter. That
// needs the card's stored source (fileRef.source); until the file is saved the card says so and keeps its original.
import { retryFileJob } from './file-jobs-client.js';
import { playbackPlan } from './media-formats.js';
import { fetchDerivatives, isTerminal, stageLabel, submitFileJob } from './file-jobs-client.js';
import { canWrite, fileScope, scopeQuery } from './file-source-client.js';

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

export const PLAYBACK = { converter: 'audio-playback', options: { bitrate_kbps: 128 } };
export const derivativeUrl = (fileRef, id, at = fileScope()) => `/api/learn/files/${encodeURIComponent(fileRef.source.id)}/d/${encodeURIComponent(id)}${scopeQuery(at)}`;
const scopeArgs = (at = fileScope()) => (at?.share ? { share: at.share } : at?.app ? { app: at.app, board: at.board || 'main' } : {});

// What the card shows for an undecodable file, from what it holds and the last job status:
// 'saving' (no stored source yet), 'working' (+ stage label), 'ready' (+ url), 'failed' (+ error), 'elsewhere' (a viewer's
// or fork's card whose copy is not made yet: it never starts a job), 'checking' (looking for an existing copy).
export function derivativeState({ fileRef, job = null, checked = false, writable = true }) {
  if (!fileRef?.source?.id) return { state: 'saving' };
  if (fileRef.derivatives?.playback) return { state: 'ready', url: derivativeUrl(fileRef, fileRef.derivatives.playback) };
  if (job?.state === 'failed') return { state: 'failed', error: job.error || 'The playable copy could not be made.' };
  if (job?.state === 'cancelled') return { state: 'failed', error: 'Making the playable copy was cancelled.' };
  if (job) return { state: 'working', stage: stageLabel(job) };
  if (!checked) return { state: 'checking' };
  return writable ? { state: 'working', stage: 'Queued' } : { state: 'elsewhere' };
}

// The playback derivative of this source revision, if one is ready (any card of the same source and options finds it).
export async function findPlayback(fileRef, { fetchImpl = fetch, at = fileScope() } = {}) {
  const list = await fetchDerivatives(fetchImpl, { sourceId: fileRef.source.id, rev: fileRef.source.rev, ...PLAYBACK, ...scopeArgs(at) });
  return list?.find(d => d.kind === 'playback')?.id || null;
}

// Submit (idempotent per card, converter and source revision) -> the job.
export const requestPlayback = ({ fileRef, cardId, fetchImpl = fetch, at = fileScope() }) =>
  submitFileJob(fetchImpl, { sourceId: fileRef.source.id, sourceRev: fileRef.source.rev, cardId, ...PLAYBACK, app: at?.app, board: at?.board || 'main' });

// Reads the job until it settles. Polling only reads (contract 5.2); the runner advances the job without a browser.
export async function watchPlayback({ jobId, fetchImpl = fetch, signal, onUpdate = () => {}, delays = [1000, 2000, 3000, 5000], at = fileScope() }) {
  for (let n = 0; ; n++) {
    if (signal?.aborted) return null;
    const response = await fetchImpl(`/api/learn/files/jobs/${encodeURIComponent(jobId)}${scopeQuery(at)}`, { signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.job) throw new Error(body?.error || `The playable copy's status is unavailable (${response.status}).`);
    onUpdate(body.job);
    if (isTerminal(body.job)) return body.job;
    await new Promise(resolve => setTimeout(resolve, delays[Math.min(n, delays.length - 1)]));
  }
}

export async function retryPlayback({ jobId, fetchImpl = fetch }) {
  const response = await fetchImpl(`/api/learn/files/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.job) throw new Error(body?.error || `The retry was refused (${response.status}).`);
  return body.job;
}
export const cancelPlayback = ({ jobId, fetchImpl = fetch }) => fetchImpl(`/api/learn/files/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }).catch(() => null);
export { canWrite };
