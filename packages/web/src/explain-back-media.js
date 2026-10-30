// Explain-back media (plan sections 5 and EB-06): the retained voice note on the answer card. Its recorder lives here, in
// a registry keyed by the answer draft, not in a React tree, so closing the Sketch panel, collapsing a narrow panel or
// re-rendering the card never stops a recording or drops a take. The controller handles audio only: it never reads,
// receives or returns the typed answer, so recording, stopping, transcription, removal and re-recording cannot change it.
// A transcript is separate server-side data (control-plane learn-media.js), never part of this state.
import { mediaInfo } from './media-formats.js';
import { validateExplainBackAnswer } from './explain-back-contract.js';

// Owner decision 2026-10-29: two minutes per recording, visibly enforced with a clean stop.
export const RECORDING_LIMIT_MS = 2 * 60 * 1000;
// The last stretch before the limit, where the elapsed time also shows what is left.
export const LIMIT_WARNING_MS = 15 * 1000;

// What MediaRecorder is asked for, in order. The existing stored-audio family (file-capabilities.js) takes Ogg and MP4
// (.m4a) but not WebM audio, so those come first; Chrome records only WebM/Opus (and MP4 in recent versions), so WebM stays
// as the last choice and its acceptance is the storage route's to state (hand-back to D). The stored file is named from the
// container its bytes actually hold (formatOf), never from the requested type.
export const RECORDER_TYPES = ['audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
const EXT = { ogg: 'ogg', mp4: 'm4a', webm: 'webm', matroska: 'webm' };
const TYPE = { ogg: 'audio/ogg', mp4: 'audio/mp4', webm: 'audio/webm', matroska: 'audio/webm' };

export function pickRecorderType(Recorder) {
  const supported = type => { try { return !!Recorder?.isTypeSupported?.(type); } catch { return false; } };
  return RECORDER_TYPES.find(supported) || '';
}

// The recorded bytes' real container and codec: { container, ext, type, codec } or null when they are none of Ogg, MP4, WebM.
export async function formatOf(blob) {
  const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
  const info = mediaInfo(head);
  if (!info || !EXT[info.container] || info.video) return null;
  return { container: info.container === 'matroska' ? 'webm' : info.container, ext: EXT[info.container], type: TYPE[info.container], codec: info.codec || null };
}

export const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---- one microphone owner. The voice note, Sketch narration and Speak answer each claim it before getUserMedia, so two
// recorders on one page never compete for the microphone. { id, label } -> true when it is free or already this owner's.
let holder = null;
export const microphoneHolder = () => holder;
export function claimMicrophone(owner) {
  if (holder && holder.id !== owner.id) return false;
  holder = owner;
  return true;
}
export function releaseMicrophone(owner) { if (holder?.id === owner.id) holder = null; }

// getUserMedia's refusal, as the state the learner can act on.
export function captureError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return { kind: 'denied', message: 'Microphone access was blocked. Allow it for this site in the browser, then try again.', retryable: true };
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { kind: 'no-device', message: 'No microphone was found. Connect one, then try again.', retryable: true };
  if (name === 'NotReadableError' || name === 'AbortError') return { kind: 'unavailable', message: 'The microphone is in use by another app or could not start. Close that app, then try again.', retryable: true };
  return { kind: 'unavailable', message: 'The microphone could not start. Try again.', retryable: true };
}
const UNSUPPORTED = { kind: 'unsupported', message: 'This browser cannot record audio here. Try a current Chrome, Edge, Firefox or Safari.', retryable: false };

const defaultMedia = () => ({
  getUserMedia: globalThis.navigator?.mediaDevices?.getUserMedia ? constraints => globalThis.navigator.mediaDevices.getUserMedia(constraints) : null,
  MediaRecorder: globalThis.MediaRecorder || null,
});
const defaultTime = {
  now: () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()),
  every: (fn, ms) => { const id = setInterval(fn, ms); return () => clearInterval(id); },
};
const sha256Hex = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');

// What a draft persists for its voice note: the EB-01 EvidenceRef (explain-back-contract.js) of the stored take, which goes
// into ExplainBackAnswer.voice as it is. The upload resolves the attempt-private asset: { assetId: 'aa_...', revision? }
// or the bare assetId. This pair is the one place the take and the contract meet.
export function toSavedVoice(take, asset, evidenceId = `ev_voice_${take.sha256.slice(0, 16)}`) {
  const assetId = typeof asset === 'string' ? asset : asset?.assetId;
  return { evidenceId, role: 'voice', media: 'audio', state: 'ready', assetId, revision: asset?.revision ?? 1, hash: take.sha256, mime: take.type, bytes: take.size, durationMs: take.durationMs };
}
// The contract's own answer rules decide (aa_ private asset, voice role and media, hash when ready).
export const fromSavedVoice = saved => (saved?.state === 'ready' && validateExplainBackAnswer({ v: 1, kind: 'explain_back', text: '', voice: [saved], resources: [], assistance: [] }).ok ? saved : null);

// createVoiceNote(options) -> controller. Options, all injectable for tests:
//   owner      { id, label } for the microphone lease (label names it to another recorder: "The voice note").
//   upload     (file, { sha256, durationMs, onProgress({ sent, total }) }) -> Promise<asset>: the private attempt-asset
//              upload (D). Without it a take stays local and Submit stays blocked with the reason.
//   load       (assetId, saved) -> Promise<Blob | string>: the saved note's bytes or URL for playback after a reload.
//   saved      a persisted voice EvidenceRef (fromSavedVoice) to start from.
//   onSaved    (saved | null) called when the note to persist changes (stored, removed).
//   media      { getUserMedia, MediaRecorder }; time { now, every(fn, ms) -> stop }; limitMs.
// State (get / subscribe): { status, elapsedMs, limitMs, take, saved, progress, error, notice }.
//   status: idle | requesting | recording | paused | stopping | saving | saved | error
//   take:   the local recording { blob, type, ext, codec, durationMs, size, sha256 } until a reload; saved: the stored note.
//   error:  { kind, message, retryable }; kind denied | no-device | unavailable | unsupported | busy | empty | interrupted
//           | upload | no-storage. An upload error keeps the take (Retry sends it again).
//   notice: a one-line fact about the last take (limit reached, interrupted part kept).
export function createVoiceNote({ owner = { id: 'voice-note', label: 'The voice note' }, upload = null, load = null, saved = null, onSaved = null, media = defaultMedia(), time = defaultTime, limitMs = RECORDING_LIMIT_MS } = {}) {
  const restored = fromSavedVoice(saved);
  let state = { status: restored ? 'saved' : 'idle', elapsedMs: 0, limitMs, take: null, saved: restored, progress: null, error: null, notice: null };
  const listeners = new Set();
  let session = null, url = null, disposed = false, uploadRun = 0;
  const set = patch => { state = { ...state, ...patch }; for (const fn of [...listeners]) fn(state); };
  const persist = next => { try { onSaved?.(next); } catch { /* the draft's save reports its own failure */ } };

  const releaseTracks = s => { for (const track of s?.stream?.getTracks?.() || []) { try { track.stop(); } catch { /* already stopped */ } } };
  const stopTicker = s => { s?.ticker?.(); if (s) s.ticker = null; };
  const elapsedOf = s => s.accumulated + (s.segmentStart == null ? 0 : time.now() - s.segmentStart);
  const recordingNow = () => state.status === 'recording' || state.status === 'paused';

  const tick = () => {
    if (!session || state.status !== 'recording') return;
    const elapsedMs = Math.min(elapsedOf(session), limitMs);
    if (elapsedMs >= limitMs) { stop('limit'); return; }
    set({ elapsedMs });
  };

  // The previous note comes back when a new recording yields nothing (cancel, denial, empty, interruption before any
  // audio): re-recording replaces evidence only once the new take exists. failed(s, error) keeps it beside the new error.
  const back = s => ({ ...s.previous, elapsedMs: s.previous.saved ? s.previous.elapsedMs : 0 });
  const failed = (s, error) => set({ ...back(s), status: 'error', error });

  async function sendTake(take) {
    const run = ++uploadRun;
    if (!upload) { set({ status: 'error', error: { kind: 'no-storage', message: 'Voice notes cannot be saved on this page yet.', retryable: false } }); return; }
    set({ status: 'saving', progress: { sent: 0, total: take.size }, error: null });
    try {
      const file = new File([take.blob], `voice-note.${take.ext}`, { type: take.type });
      const asset = await upload(file, { sha256: take.sha256, durationMs: take.durationMs, onProgress: progress => { if (run === uploadRun && !disposed) set({ progress }); } });
      if (run !== uploadRun || disposed) return;
      const next = toSavedVoice(take, asset);
      set({ status: 'saved', saved: next, progress: null });
      persist(next);
    } catch (problem) {
      if (run !== uploadRun || disposed) return;
      set({ status: 'error', progress: null, error: { kind: 'upload', message: `Not saved: ${problem?.message || 'the upload failed'}`, retryable: problem?.retryable !== false } });
    }
  }

  async function finish(s) {
    stopTicker(s);
    releaseTracks(s);
    releaseMicrophone(owner);
    if (session === s) session = null;
    if (disposed) return;
    if (s.reason === 'cancel') { set(back(s)); return; }
    const blob = new Blob(s.chunks, { type: s.recorder.mimeType || s.type || 'audio/webm' });
    const durationMs = Math.min(Math.round(s.elapsedMs), limitMs);
    if (!blob.size) {
      failed(s, s.reason === 'interrupted'
        ? { kind: 'interrupted', message: 'Recording stopped before any audio was captured (the microphone was disconnected or blocked). Try again.', retryable: true }
        : { kind: 'empty', message: 'No audio was captured. Check the microphone, then record again.', retryable: true });
      return;
    }
    const format = await formatOf(blob).catch(() => null);
    if (disposed) return;
    if (!format) { failed(s, { kind: 'unsupported', message: `This browser recorded ${blob.type || 'an unknown format'}, which cannot be saved. Try a current Chrome, Edge, Firefox or Safari.`, retryable: false }); return; }
    const take = { blob, ...format, durationMs, size: blob.size, sha256: await sha256Hex(blob) };
    if (disposed) return;
    if (url) { URL.revokeObjectURL?.(url); url = null; }
    const notice = s.reason === 'limit' ? `Stopped at the ${clock(limitMs)} limit.` : s.reason === 'interrupted' ? `The recording was interrupted at ${clock(durationMs)}; the part before it was kept.` : null;
    // The draft keeps pointing at the previous stored note until this take is stored; Submit stays blocked meanwhile.
    // ponytail: a take still uploading when the page reloads is lost (never shown as saved); no IndexedDB copy yet.
    set({ take, saved: null, elapsedMs: durationMs, notice });
    await sendTake(take);
  }

  async function start() {
    if (disposed || ['requesting', 'recording', 'paused', 'stopping', 'saving'].includes(state.status)) return;
    if (!media.getUserMedia || !media.MediaRecorder) { set({ status: 'error', error: UNSUPPORTED }); return; }
    if (!claimMicrophone(owner)) {
      set({ status: 'error', error: { kind: 'busy', message: `${microphoneHolder()?.label || 'Another recording'} is using the microphone. Stop it first.`, retryable: true } });
      return;
    }
    const s = { stream: null, recorder: null, chunks: [], accumulated: 0, segmentStart: null, elapsedMs: 0, reason: null, ticker: null, type: '', previous: { status: state.status === 'error' && state.error?.kind !== 'upload' ? (state.saved ? 'saved' : 'idle') : state.status, take: state.take, saved: state.saved, error: state.error?.kind === 'upload' ? state.error : null, notice: state.notice, elapsedMs: state.elapsedMs } };
    session = s;
    set({ status: 'requesting', error: null, notice: null, elapsedMs: 0 });
    try { s.stream = await media.getUserMedia({ audio: true }); }
    catch (problem) {
      releaseMicrophone(owner);
      if (session === s) session = null;
      if (!disposed) failed(s, captureError(problem));
      return;
    }
    if (disposed || session !== s || s.reason === 'cancel') { releaseTracks(s); releaseMicrophone(owner); if (session === s) session = null; if (!disposed && s.reason === 'cancel') set(back(s)); return; }
    s.type = pickRecorderType(media.MediaRecorder);
    try { s.recorder = new media.MediaRecorder(s.stream, s.type ? { mimeType: s.type } : undefined); }
    catch { releaseTracks(s); releaseMicrophone(owner); session = null; failed(s, UNSUPPORTED); return; }
    s.recorder.ondataavailable = event => { if (event.data?.size) s.chunks.push(event.data); };
    s.recorder.onstop = () => { finish(s); };
    s.recorder.onerror = () => { interrupt(s); };
    // A microphone unplugged or its permission revoked mid-recording ends the track: keep what was captured.
    for (const track of s.stream.getTracks?.() || []) track.addEventListener?.('ended', () => interrupt(s));
    // A timeslice, so an interruption still leaves the audio captured up to it.
    s.recorder.start(1000);
    s.segmentStart = time.now();
    s.ticker = time.every(tick, 250);
    set({ status: 'recording', elapsedMs: 0 });
  }

  function interrupt(s) { if (session === s && recordingNow()) stop('interrupted'); }

  function pause() {
    const s = session;
    if (!s || state.status !== 'recording') return;
    try { s.recorder.pause(); } catch { return; }
    s.accumulated = elapsedOf(s); s.segmentStart = null;
    stopTicker(s);
    set({ status: 'paused', elapsedMs: Math.min(s.accumulated, limitMs) });
  }
  function resume() {
    const s = session;
    if (!s || state.status !== 'paused') return;
    try { s.recorder.resume(); } catch { return; }
    s.segmentStart = time.now();
    s.ticker = time.every(tick, 250);
    set({ status: 'recording' });
  }
  // Stop: the take is kept and saved. The microphone is released at once, before the recorder's last data arrives.
  function stop(reason = 'stop') {
    const s = session;
    if (!s) return;
    if (state.status === 'requesting') { s.reason = 'cancel'; return; }
    if (!recordingNow()) return;
    s.elapsedMs = elapsedOf(s); s.segmentStart = null; s.reason = reason;
    stopTicker(s);
    set({ status: 'stopping', elapsedMs: Math.min(s.elapsedMs, limitMs) });
    try { s.recorder.stop(); } catch { finish(s); }
    releaseTracks(s);
    releaseMicrophone(owner);
  }
  // Cancel: the new take is dropped and the previous note (if any) stays.
  const cancel = () => stop('cancel');

  // Remove the note from this draft. The stored bytes stay with D's asset lifecycle; submitted attempts keep theirs.
  function remove() {
    if (recordingNow() || state.status === 'requesting' || state.status === 'stopping') return;
    uploadRun++;
    if (url) { URL.revokeObjectURL?.(url); url = null; }
    set({ status: 'idle', take: null, saved: null, progress: null, error: null, notice: null, elapsedMs: 0 });
    persist(null);
  }
  function retry() {
    if (state.status !== 'error') return;
    if (state.error?.kind === 'upload' && state.take) { sendTake(state.take); return; }
    set({ status: state.saved ? 'saved' : 'idle', error: null });
  }
  // A playable source for the current note: the local take's object URL, or the saved note through `load`.
  async function source() {
    if (state.take) { if (!url) url = URL.createObjectURL(state.take.blob); return url; }
    if (!state.saved || !load) return null;
    const got = await load(state.saved.assetId, state.saved);
    if (typeof got === 'string' || got == null) return got ?? null;
    if (url) URL.revokeObjectURL?.(url);
    url = URL.createObjectURL(got);
    return url;
  }
  // The end of this draft's note (draft discarded or submitted): release everything, keep nothing running.
  function dispose() {
    if (disposed) return;
    const s = session;
    if (s) { stopTicker(s); try { s.recorder?.state !== 'inactive' && s.recorder?.stop(); } catch { /* inactive */ } releaseTracks(s); session = null; }
    releaseMicrophone(owner);
    disposed = true;
    uploadRun++;
    if (url) { URL.revokeObjectURL?.(url); url = null; }
    listeners.clear();
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start, pause, resume, stop: () => stop('stop'), cancel, remove, retry, source, dispose,
  };
}

// What the voice note means for Submit. { ready, blocked }: ready when a stored note is part of the answer; blocked is the
// disabled Submit's label while the note is in progress or failed (the learner fixes or removes it first).
export function voiceSubmitState(state) {
  const status = state?.status;
  if (['requesting', 'recording', 'paused', 'stopping'].includes(status)) return { ready: false, blocked: 'Stop recording to submit' };
  if (status === 'saving') return { ready: false, blocked: 'Saving voice note' };
  if (state?.error?.kind === 'upload') return { ready: false, blocked: 'Voice note not saved' };
  return { ready: !!state?.saved, blocked: null };
}

// ---- one controller per answer draft, outliving any panel or card render.
const notes = new Map();
export function voiceNoteFor(key, options = {}) {
  if (!notes.has(key)) notes.set(key, createVoiceNote({ owner: { id: `voice-note:${key}`, label: 'The voice note' }, ...options }));
  return notes.get(key);
}
export function disposeVoiceNote(key) { notes.get(key)?.dispose(); notes.delete(key); }

// Leaving the canvas (unmount, another board or canvas): stop every voice note and Sketch recording still capturing, so no
// microphone stays live or claimed. keep: true (the default) keeps each take, as Stop does; keep: false discards it, as cancel.
const stoppers = new Set();
export const onStopAllCaptures = fn => { stoppers.add(fn); return () => stoppers.delete(fn); };
export function stopAllExplainBackCaptures({ keep = true } = {}) {
  for (const note of notes.values()) {
    const { status } = note.get();
    if (status === 'requesting' || (!keep && (status === 'recording' || status === 'paused'))) note.cancel();
    else if (status === 'recording' || status === 'paused') note.stop();
  }
  for (const stop of stoppers) stop({ keep });
}
