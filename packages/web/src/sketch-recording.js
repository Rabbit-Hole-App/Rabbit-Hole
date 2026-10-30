// Explain-back Sketch recording (plan sections 3 and 5, EB-06 06.5): records one question's Sketch as it is drawn - a
// starting snapshot plus every change to its marks, timestamped on the recording's own clock - with optional narration
// on the same clock. It reads only that question's sketch (the marks the panel's host passes to observe), never the answer
// card, the board or the screen. Silent mode never asks for the microphone. Pause/Resume stops the clock for the timeline
// and the narration together, so a time t means the same moment in both. Like the voice note, the controller lives in a
// registry keyed by question and draft, above any panel mount; closing the panel stops cleanly and keeps the take.
import { RECORDING_LIMIT_MS, clock, createVoiceNote } from './explain-back-media.js';
import { sketchMarks, sketchText } from './explain-sketch.js';

export const TIMELINE_VERSION = 1;
const KEYS = ['strokes', 'shapes', 'items'];
// A bound on what one recording stores; past it the recording stops cleanly and says so.
export const MAX_OPS = 4000;

const marksOf = sketch => Object.fromEntries(KEYS.map(key => [key, Array.isArray(sketch?.[key]) ? sketch[key] : []]));
const copy = value => JSON.parse(JSON.stringify(value));

// The ops that turn `before` into `after`: per mark list, keep the unchanged leading marks and replace the rest. Marks are
// immutable objects in the board's state, so an unchanged mark is the same object; an append keeps everything, an undo
// keeps all but the last, an edit in the middle keeps up to it.
export function diffMarks(before, after, t) {
  const ops = [];
  for (const key of KEYS) {
    const a = before[key], b = after[key];
    if (a === b) continue;
    let keep = 0;
    while (keep < a.length && keep < b.length && a[keep] === b[keep]) keep++;
    if (keep === a.length && keep === b.length) continue;
    ops.push({ t, k: key, keep, add: copy(b.slice(keep)) });
  }
  return ops;
}

// The sketch at time t (ms on the recording clock): the starting snapshot with every op at or before t applied.
export function stateAt(timeline, t = Infinity) {
  const marks = copy(marksOf(timeline.start));
  for (const op of timeline.ops) {
    if (op.t > t) break;
    marks[op.k] = marks[op.k].slice(0, op.keep).concat(copy(op.add));
  }
  return marks;
}

// What the sketch showed, step by step: the times its marks or words changed, each with the sketch's own description
// (explain-sketch.js sketchText). Changes within `merge` ms are one step. Two recordings with the same final picture but
// different steps give different lists; this is the timestamped evidence a single final screenshot cannot give.
export function timelineSteps(timeline, { merge = 1000 } = {}) {
  const steps = [{ t: 0, marks: sketchMarks(timeline.start), text: sketchText(timeline.start) }];
  const times = [...new Set(timeline.ops.map(op => op.t))];
  for (let i = 0; i < times.length; i++) {
    if (i + 1 < times.length && times[i + 1] - times[i] < merge) continue;
    const state = stateAt(timeline, times[i]);
    const step = { t: times[i], marks: sketchMarks(state), text: sketchText(state) };
    if (step.text !== steps.at(-1).text || step.marks !== steps.at(-1).marks) steps.push(step);
  }
  return steps;
}

const defaultTime = {
  now: () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()),
  every: (fn, ms) => { const id = setInterval(fn, ms); return () => clearInterval(id); },
};
const sha256Hex = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');

// What a draft persists for its recording. ponytail: EB-01 allows a recording EvidenceRef only with media 'video'; this is a
// sketch timeline (JSON) plus optional narration audio, requested from D through P. Until the contract names it, this is
// the one place it is mapped: { evidenceId, role: 'recording', media: 'video', state, assetId, revision, hash, mime, bytes,
// durationMs, narration: voice EvidenceRef | null }.
export function toSavedRecording(take, asset, narration = null) {
  const assetId = typeof asset === 'string' ? asset : asset?.assetId;
  return { evidenceId: `ev_rec_${take.sha256.slice(0, 16)}`, role: 'recording', media: 'video', state: 'ready', assetId, revision: asset?.revision ?? 1, hash: take.sha256, mime: 'application/json', bytes: take.size, durationMs: take.durationMs, narration };
}

// createSketchRecording(options) -> controller.
//   upload(file, { sha256, durationMs, onProgress }) -> asset; the timeline JSON goes up as one private attempt asset.
//   uploadAudio (same shape) for the narration; load(assetId) for replay after a reload; media / time as createVoiceNote.
//   owner { id, label } for the microphone lease while narrating.
// State: { status, audio, elapsedMs, limitMs, take, saved, narration, progress, error, notice }
//   status idle | requesting | recording | paused | saving | saved | error; audio: narration on for the next recording.
//   take: { timeline, blob, sha256, size, durationMs } of the last recording; narration: the narration voice note's state.
export function createSketchRecording({ owner = { id: 'sketch-recording', label: 'The Sketch recording' }, upload = null, uploadAudio = null, load = null, onSaved = null, media, time = defaultTime, limitMs = RECORDING_LIMIT_MS } = {}) {
  // The narration's own limit sits a second later: the timeline's limit stops both, together.
  const voice = createVoiceNote({ owner, upload: uploadAudio, load, media, time, limitMs: limitMs + 1000 });
  let state = { status: 'idle', audio: false, elapsedMs: 0, limitMs, take: null, saved: null, narration: voice.get(), progress: null, error: null, notice: null };
  const listeners = new Set();
  let session = null, run = 0, disposed = false;
  const set = patch => { state = { ...state, ...patch }; for (const fn of [...listeners]) fn(state); };
  const persist = next => { try { onSaved?.(next); } catch { /* the draft's save reports its own failure */ } };
  const active = () => state.status === 'recording' || state.status === 'paused';
  const elapsedOf = s => s.accumulated + (s.segmentStart == null ? 0 : time.now() - s.segmentStart);

  voice.subscribe(next => {
    set({ narration: next });
    // The microphone went away mid-recording (unplugged, revoked): stop the whole recording so sound and marks stay in step.
    if (session?.audio && active() && !['recording', 'paused', 'requesting'].includes(next.status)) stop('interrupted');
    if (state.take?.timeline.narration && !active()) maybeSaved();
  });

  function tick() {
    if (!session || state.status !== 'recording') return;
    const elapsedMs = Math.min(elapsedOf(session), limitMs);
    if (elapsedMs >= limitMs) { stop('limit'); return; }
    set({ elapsedMs });
  }

  async function start({ sketch } = {}) {
    if (disposed || active() || state.status === 'requesting' || state.status === 'saving') return;
    const s = { audio: state.audio, start: copy(marksOf(sketch)), last: marksOf(sketch), ops: [], pauses: [], accumulated: 0, segmentStart: null, reason: null, ticker: null, previous: { take: state.take, saved: state.saved, status: state.saved ? 'saved' : 'idle' } };
    set({ error: null, notice: null, elapsedMs: 0 });
    if (s.audio) {
      set({ status: 'requesting' });
      await voice.start();
      const heard = voice.get();
      if (heard.status !== 'recording') {
        if (heard.status === 'requesting') voice.cancel();
        set({ status: s.previous.status, error: heard.error || { kind: 'unavailable', message: 'The microphone could not start. Try again, or turn Audio off.', retryable: true } });
        return;
      }
    }
    session = s;
    s.startedAt = new Date().toISOString();
    s.segmentStart = time.now();
    s.ticker = time.every(tick, 250);
    set({ status: 'recording' });
  }

  // The panel's host calls this with the question's sketch whenever it changes; outside a recording it is ignored.
  function observe(sketch) {
    const s = session;
    if (!s || !active()) return;
    const next = marksOf(sketch);
    const ops = diffMarks(s.last, next, Math.min(Math.round(elapsedOf(s)), limitMs));
    s.last = next;
    s.ops.push(...ops);
    if (s.ops.length >= MAX_OPS) stop('size');
  }

  function pause() {
    const s = session;
    if (!s || state.status !== 'recording') return;
    s.accumulated = elapsedOf(s); s.segmentStart = null;
    s.ticker?.(); s.ticker = null;
    s.pauses.push(Math.round(s.accumulated));
    if (s.audio) voice.pause();
    set({ status: 'paused', elapsedMs: Math.min(s.accumulated, limitMs) });
  }
  function resume() {
    const s = session;
    if (!s || state.status !== 'paused') return;
    if (s.audio) voice.resume();
    s.segmentStart = time.now();
    s.ticker = time.every(tick, 250);
    set({ status: 'recording' });
  }

  async function stop(reason = 'stop') {
    const s = session;
    if (!s || !active()) return;
    session = null;
    s.ticker?.();
    const durationMs = Math.min(Math.round(elapsedOf(s)), limitMs);
    if (s.audio && reason !== 'interrupted') { if (reason === 'cancel') voice.cancel(); else voice.stop(); }
    if (reason === 'cancel') { set({ status: s.previous.status, take: s.previous.take, saved: s.previous.saved, elapsedMs: 0 }); return; }
    const timeline = { v: TIMELINE_VERSION, kind: 'sketch-timeline', startedAt: s.startedAt, durationMs, limitMs, narration: s.audio, start: s.start, ops: s.ops, pauses: s.pauses };
    const blob = new Blob([JSON.stringify(timeline)], { type: 'application/json' });
    const take = { timeline, blob, size: blob.size, durationMs, sha256: await sha256Hex(blob) };
    if (disposed) return;
    const notice = reason === 'limit' ? `Stopped at the ${clock(limitMs)} limit.` : reason === 'size' ? 'Stopped: the recording reached its size limit.'
      : reason === 'interrupted' ? `The microphone stopped at ${clock(durationMs)}; the recording up to then was kept.` : reason === 'closed' ? 'The Sketch was closed, so the recording stopped; it was kept.' : null;
    set({ take, saved: null, elapsedMs: durationMs, notice });
    await send(take);
  }

  async function send(take) {
    const mine = ++run;
    if (!upload) { set({ status: 'error', error: { kind: 'no-storage', message: 'Sketch recordings cannot be saved on this page yet.', retryable: false } }); return; }
    set({ status: 'saving', progress: { sent: 0, total: take.size }, error: null });
    try {
      const asset = await upload(new File([take.blob], 'sketch-recording.json', { type: 'application/json' }), { sha256: take.sha256, durationMs: take.durationMs, onProgress: progress => { if (mine === run) set({ progress }); } });
      if (mine !== run || disposed) return;
      take.asset = asset;
      set({ progress: null });
      maybeSaved();
    } catch (problem) {
      if (mine !== run || disposed) return;
      set({ status: 'error', progress: null, error: { kind: 'upload', message: `Not saved: ${problem?.message || 'the upload failed'}`, retryable: problem?.retryable !== false } });
    }
  }
  // Saved once the timeline is stored and, when narrated, the narration is too.
  function maybeSaved() {
    const take = state.take;
    if (!take?.asset || state.saved) return;
    const narrated = take.timeline.narration;
    const heard = voice.get();
    if (narrated && heard.error?.kind === 'upload') { set({ status: 'error', error: { ...heard.error, message: `Narration ${heard.error.message.replace(/^Not saved/, 'not saved')}` } }); return; }
    if (narrated && !heard.saved) { set({ status: 'saving' }); return; }
    const next = toSavedRecording(take, take.asset, narrated ? heard.saved : null);
    set({ status: 'saved', saved: next, error: null });
    persist(next);
  }

  function retry() {
    if (state.status !== 'error') return;
    if (state.error?.kind === 'upload' && state.take) {
      if (!state.take.asset) send(state.take);
      else { voice.retry(); }
      return;
    }
    set({ status: state.saved ? 'saved' : 'idle', error: null });
  }
  function remove() {
    if (active() || state.status === 'requesting') return;
    run++;
    voice.remove();
    set({ status: 'idle', take: null, saved: null, progress: null, error: null, notice: null, elapsedMs: 0 });
    persist(null);
  }
  function dispose() {
    if (disposed) return;
    if (session) { session.ticker?.(); session = null; }
    disposed = true; run++;
    voice.dispose();
    listeners.clear();
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setAudio(on) { if (!active() && state.status !== 'requesting') set({ audio: !!on }); },
    start, observe, pause, resume, stop: () => stop('stop'), cancel: () => stop('cancel'),
    // Closing the panel mid-recording: stop cleanly and keep the take (plan section 3).
    close: () => stop('closed'),
    remove, retry, dispose,
    // The replay's timeline: the local take, or the saved one through load. And the narration's playable source.
    async timeline() {
      if (state.take) return state.take.timeline;
      if (!state.saved || !load) return null;
      const got = await load(state.saved.assetId, state.saved);
      return typeof got === 'string' ? (await fetch(got)).json() : JSON.parse(await got.text());
    },
    audioSource: () => voice.source(),
  };
}

// What the recording means for Submit (as voiceSubmitState): blocked while it records or saves, ready once saved.
export function recordingSubmitState(state) {
  if (['requesting', 'recording', 'paused'].includes(state?.status)) return { ready: false, blocked: 'Stop recording to submit' };
  if (state?.status === 'saving') return { ready: false, blocked: 'Saving Sketch recording' };
  if (state?.error?.kind === 'upload') return { ready: false, blocked: 'Sketch recording not saved' };
  return { ready: !!state?.saved, blocked: null };
}

const recordings = new Map();
export function sketchRecordingFor(key, options = {}) {
  if (!recordings.has(key)) recordings.set(key, createSketchRecording({ owner: { id: `sketch:${key}`, label: 'The Sketch recording' }, ...options }));
  return recordings.get(key);
}
export function disposeSketchRecording(key) { recordings.get(key)?.dispose(); recordings.delete(key); }
