// /whiteboard render client (roadmap v1 sections 6.1 rendering row and 6.2): the Worker's side of the renderer's whiteboard routes
// (packages/learn-render/motion/service/whiteboard-routes.mjs, request gate whiteboard/contracts.mjs on feat/w1-render).
//   GET  {WHITEBOARD_RENDERER_URL}/health                       no auth; must report whiteboard: RENDERER_VERSION, else fail closed
//   POST /whiteboard/render                                      Bearer WHITEBOARD_RENDERER_TOKEN, Idempotency-Key <job>:<attempt>:0, a whiteboard-render/1 body
//   GET  /whiteboard/<render_id>                                 { status: rendering | ready | failed, artifacts: { final, poster, contact_sheet } }
//   GET  /whiteboard/<render_id>/artifacts/<final.mp4|poster.png|contact-sheet.png>
//   GET  /render/by-key/<key>                                    the service's memory of a key, asked before any second POST
// W1 renders one segment (index 0 of 1, frames 0 to d x 30). The whiteboard app keeps no job store, so a restart forgets a render: its 404 is
// answered by asking by-key, then by ONE more POST with a new key; a render lost twice fails the job. A 429 or 503 waits 30 s and is never a
// second render (a POST repeats the same key, which the service answers with the same render). Each call is one step of the job's alarm.
import { RENDERER_VERSION, WHITEBOARD_LIMITS as L } from './whiteboard-policy.js';

export const POLL_MS = 5000, BUSY_MS = 30000, ARTIFACTS = Object.freeze(['final.mp4', 'poster.png', 'contact-sheet.png']);
const MIB = 1024 * 1024, LIMIT_BYTES = { 'final.mp4': L.segmentMp4Bytes, 'poster.png': 8 * MIB, 'contact-sheet.png': 8 * MIB };

export function base64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
// The whiteboard-render/1 body, field for field as contracts.mjs validateRenderRequest: one audio entry per narrated beat, named by its audioKey.
export function renderRequest(job, scenes, timing, audio) {
  return { schema: 'whiteboard-render/1', job_id: job.id, segment: { index: 0, of: 1, startFrame: 0, endFrame: timing.totalFrames },
    manifest: { plan: job.plan, scenes, timing }, audio: timing.beats.filter(t => t.audioFrames > 0).map(t => ({ beat: t.audioKey, b64: audio.get(t.audioKey) })), illustrations: [] };
}
export const requestBytes = body => new TextEncoder().encode(JSON.stringify(body)).length;

const fail = (code, message) => Object.assign(new Error(message), { code, reason: 'the drawing could not be rendered' });
// The status reply, read in one place (the service's view of a render record).
// The ready record carries frame_count, duration_seconds and output_bytes (the renderer's ffprobe); a failed one error and detail.
export const readStatus = view => ({ status: view?.status ?? null, error: view?.error ?? null, detail: view?.detail ?? null, frames: view?.frame_count ?? null, seconds: view?.duration_seconds ?? null, bytes: view?.output_bytes ?? null });

// One step. state: the job's render record ({ key, total, renderId, resubmitted, versionOk, deadline }); body: async () => the request (built only to POST).
// -> { state, waitMs } | { state, files: { name: Uint8Array }, measured: { frames, seconds } }; throws (reason "the drawing could not be rendered").
export async function renderStep(env, state, body, { fetch = globalThis.fetch, now = Date.now() } = {}) {
  const base = String(env.WHITEBOARD_RENDERER_URL || '').replace(/\/+$/, ''), auth = { Authorization: `Bearer ${env.WHITEBOARD_RENDERER_TOKEN}` };
  if (!base || !env.WHITEBOARD_RENDERER_TOKEN) throw fail('renderer_not_configured', 'The whiteboard renderer is not configured here.');
  if (state.deadline && now > state.deadline) throw fail('render_deadline', 'The render did not finish within its deadline.');
  const get = (path, headers = auth) => fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(30000) });
  const wait = (ms, extra = {}) => ({ state: { ...state, ...extra }, waitMs: ms });
  if (!state.versionOk) {
    const health = await get('/health', {}).catch(() => null);
    if (!health || health.status === 503) return wait(BUSY_MS, { waking: true }); // an auto-stopped machine answers once it is up
    const seen = (await health.json().catch(() => null))?.whiteboard;
    if (seen !== RENDERER_VERSION) throw fail('renderer_version', `The renderer reports ${seen ?? 'no'} whiteboard version, not ${RENDERER_VERSION}.`);
    state = { ...state, versionOk: true, waking: false };
  }
  if (!state.renderId) {
    const request = await body();
    if (requestBytes(request) > L.segmentRequestBytes) throw fail('request_too_large', 'The render request is larger than 16 MiB.');
    const posted = await fetch(`${base}/whiteboard/render`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', 'Idempotency-Key': state.key }, body: JSON.stringify(request), signal: AbortSignal.timeout(60000) }).catch(() => null);
    if (!posted || [429, 503].includes(posted.status)) return wait(BUSY_MS); // busy or waking: the same key again later, never a second render
    const reply = await posted.json().catch(() => null);
    if (posted.status !== 202 || !/^[0-9a-f]{32}$/.test(reply?.render_id || '')) throw fail('render_refused', `The renderer refused the render (${posted.status} ${reply?.error ?? ''}).`);
    return wait(POLL_MS, { renderId: reply.render_id, deadline: state.deadline ?? now + L.segmentDeadlineMs + 2 * BUSY_MS });
  }
  const polled = await get(`/whiteboard/${state.renderId}`).catch(() => null);
  if (!polled || [429, 503].includes(polled.status)) return wait(BUSY_MS);
  if (polled.status === 404) {
    // The service does not remember this render (a restart): ask what it knows of the key before any second POST.
    const known = await get(`/render/by-key/${encodeURIComponent(state.key)}`).catch(() => null);
    const k = known?.ok ? await known.json().catch(() => null) : null;
    if (k?.live && /^[0-9a-f]{32}$/.test(k.render_id || '') && k.render_id !== state.renderId) return wait(POLL_MS, { renderId: k.render_id });
    if (state.resubmitted) throw fail('render_lost', 'The renderer lost the render twice.');
    return wait(0, { renderId: null, key: `${state.key}:r1`, resubmitted: true, deadline: null });
  }
  const view = readStatus(await polled.json().catch(() => null));
  if (view.status === 'rendering') return wait(POLL_MS);
  if (view.status !== 'ready') throw fail('render_failed', `The render ended ${view.status ?? 'without a status'} (${view.error ?? 'no reason'}: ${String(view.detail ?? '').slice(0, 300)}).`);
  if (view.frames !== state.total) throw fail('render_frames', `The render has ${view.frames} frames, not ${state.total}.`);
  const files = {};
  for (const name of ARTIFACTS) {
    const got = await get(`/whiteboard/${state.renderId}/artifacts/${name}`);
    if (!got.ok) throw fail('artifact_missing', `The renderer did not return ${name} (${got.status}).`);
    const bytes = new Uint8Array(await got.arrayBuffer());
    if (!bytes.length || bytes.length > LIMIT_BYTES[name]) throw fail('artifact_size', `${name} is ${bytes.length} bytes, outside its limit.`);
    files[name] = bytes;
  }
  return { state, files, measured: { frames: view.frames, seconds: view.seconds } };
}
