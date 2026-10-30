import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimMicrophone, disposeVoiceNote, microphoneHolder, releaseMicrophone, stopAllExplainBackCaptures, voiceNoteFor } from './explain-back-media.js';
import { createSketchRecording, diffMarks, disposeSketchRecording, recordingSubmitState, sketchRecordingFor, stateAt, timelineSteps } from './sketch-recording.js';
import { validateExplainBackAnswer } from './explain-back-contract.js';
const answerWith = recording => validateExplainBackAnswer({ v: 1, kind: 'explain_back', text: '', voice: [], recording, resources: [], assistance: [] });

const OGG_OPUS = (() => { const b = new Uint8Array(47); b.set([...'OggS'].map(c => c.charCodeAt(0))); b[26] = 1; b[27] = 19; b.set([...'OpusHead'].map(c => c.charCodeAt(0)), 28); return b; })();
function fakeMedia() {
  const tracks = [], calls = { getUserMedia: 0 };
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/ogg;codecs=opus'; }
    constructor(stream, options) { this.mimeType = options?.mimeType || ''; this.state = 'inactive'; Recorder.last = this; }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([OGG_OPUS]) }); queueMicrotask(() => this.onstop?.()); }
  }
  const media = { MediaRecorder: Recorder, getUserMedia: async () => { calls.getUserMedia++; const track = { stopped: 0, stop() { this.stopped++; }, addEventListener() {} }; tracks.push(track); return { getTracks: () => [track] }; } };
  return { media, tracks, calls, Recorder };
}
function fakeTime() {
  const t = { at: 0, tickers: new Set() };
  t.now = () => t.at;
  t.every = fn => { t.tickers.add(fn); return () => t.tickers.delete(fn); };
  t.advance = ms => { t.at += ms; for (const fn of [...t.tickers]) fn(); };
  return t;
}
const until = async (check, what) => { for (let i = 0; i < 200; i++) { if (check()) return; await new Promise(r => setTimeout(r, 0)); } assert.fail(`timed out waiting for ${what}`); };
const uploader = prefix => { let n = 0; return async (file, info) => { info.onProgress({ sent: file.size, total: file.size }); return { assetId: `aa_${prefix}${String(++n).padStart(8, '0')}` }; }; };

const stroke = (x, y) => ({ tool: 'pen', width: 3, points: [{ x, y }, { x: x + 40, y }] });
const arrow = (id, x1, x2, label = '') => ({ id, kind: 'arrow', x1, y1: 50, x2, y2: 50, label });

test('silent recording: no microphone, a starting snapshot and every change on a clock that pauses', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const rec = createSketchRecording({ media: fake.media, time, upload: uploader('rec') });
  const first = { strokes: [stroke(0, 0)], shapes: [], items: [] };
  await rec.start({ sketch: first });
  assert.equal(fake.calls.getUserMedia, 0, 'silent mode never asks for the microphone');
  assert.equal(microphoneHolder(), null);
  time.advance(1000);
  const second = { ...first, shapes: [arrow('a1', 10, 90)] };
  rec.observe(second);
  time.advance(2000); rec.pause(); time.advance(30_000);
  const third = { ...second, strokes: [...first.strokes, stroke(5, 100)] };
  rec.observe(third); // drawn while paused: it lands at the paused moment
  rec.resume(); time.advance(1500);
  const fourth = { ...third, shapes: [] }; // the arrow erased
  rec.observe(fourth);
  rec.observe(fourth); // no change, no op
  time.advance(500); rec.stop();
  await until(() => rec.get().status === 'saved', 'saved');
  const { timeline, durationMs } = rec.get().take;
  assert.equal(durationMs, 5000, 'paused time is not on the clock');
  assert.deepEqual(timeline.start, first);
  assert.deepEqual(timeline.ops.map(op => [op.t, op.k, op.keep, op.add.length]), [[1000, 'shapes', 0, 1], [3000, 'strokes', 1, 1], [4500, 'shapes', 0, 0]]);
  assert.deepEqual(timeline.pauses, [3000]);
  assert.equal(timeline.narration, false);
  assert.deepEqual(stateAt(timeline, 999), first);
  assert.deepEqual(stateAt(timeline, 1000), second);
  assert.deepEqual(stateAt(timeline, 4000), third);
  assert.deepEqual(stateAt(timeline), fourth);
  const saved = rec.get().saved;
  assert.deepEqual([saved.role, saved.media, saved.state, saved.assetId, saved.mime, saved.durationMs, 'narration' in saved], ['recording', 'sketch_timeline', 'ready', 'aa_rec00000001', 'application/json', 5000, false]);
  assert.deepEqual(answerWith(saved).errors, [], 'an EB-01 recording EvidenceRef');
  assert.deepEqual(recordingSubmitState(rec.get()), { ready: true, blocked: null });
});

test('narrated recording: one clock for marks and sound, Pause pauses both, Stop releases the microphone', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const rec = createSketchRecording({ media: fake.media, time, upload: uploader('rec'), uploadAudio: uploader('aud') });
  rec.setAudio(true);
  await rec.start({ sketch: null });
  assert.equal(rec.get().status, 'recording');
  assert.equal(fake.calls.getUserMedia, 1);
  assert.equal(microphoneHolder()?.label, 'The Sketch recording');
  assert.deepEqual(recordingSubmitState(rec.get()).blocked, 'Stop recording to submit');
  time.advance(2000); rec.observe({ strokes: [stroke(0, 0)] });
  rec.pause();
  assert.equal(fake.Recorder.last.state, 'paused', 'the narration pauses with the timeline');
  time.advance(10_000); rec.resume();
  assert.equal(fake.Recorder.last.state, 'recording');
  time.advance(3000); rec.stop();
  assert.ok(fake.tracks.every(track => track.stopped >= 1));
  assert.equal(microphoneHolder(), null);
  await until(() => rec.get().status === 'saved', 'saved with narration');
  const saved = rec.get().saved;
  assert.equal(saved.durationMs, 5000);
  assert.equal(saved.narration.durationMs, 5000, 'the narration has the same length as the timeline');
  assert.deepEqual([saved.narration.role, saved.narration.assetId], ['voice', 'aa_aud00000001']);
  assert.match(saved.narration.evidenceId, /^ev_narration_/);
  assert.deepEqual(answerWith(saved).errors, [], 'a narrated recording EvidenceRef');
  assert.equal(rec.get().take.timeline.narration, true);
});

test('the two-minute limit stops marks and narration together; closing the panel keeps the take', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const rec = createSketchRecording({ media: fake.media, time, upload: uploader('rec'), uploadAudio: uploader('aud') });
  rec.setAudio(true);
  await rec.start({ sketch: { strokes: [] } });
  for (let i = 0; i < 125; i++) time.advance(1000);
  await until(() => rec.get().status === 'saved', 'limit save');
  assert.equal(rec.get().notice, 'Stopped at the 2:00 limit.');
  assert.equal(rec.get().saved.durationMs, 120_000);
  assert.ok(fake.tracks.every(track => track.stopped >= 1));

  const silent = createSketchRecording({ media: fake.media, time, upload: uploader('rec') });
  await silent.start({ sketch: { strokes: [stroke(1, 1)] } });
  time.advance(4000);
  silent.close();
  await until(() => silent.get().status === 'saved', 'closed save');
  assert.equal(silent.get().notice, 'The Sketch was closed, so the recording stopped; it was kept.');
});

test('one microphone: narration waits for a voice note, silent recording does not need it', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const voiceNote = { id: 'voice-note:d1', label: 'The voice note' };
  assert.equal(claimMicrophone(voiceNote), true);
  const rec = createSketchRecording({ media: fake.media, time, upload: uploader('rec'), uploadAudio: uploader('aud') });
  rec.setAudio(true);
  await rec.start({ sketch: {} });
  assert.deepEqual([rec.get().status, rec.get().error.kind, rec.get().error.message], ['idle', 'busy', 'The voice note is using the microphone. Stop it first.']);
  assert.equal(fake.calls.getUserMedia, 0);
  rec.setAudio(false);
  await rec.start({ sketch: {} });
  assert.equal(rec.get().status, 'recording');
  rec.cancel();
  releaseMicrophone(voiceNote);
});

test('two recordings with the same final sketch but different reasoning give different step evidence', () => {
  const right = arrow('a1', 10, 90, 'force inward');
  const wrong = arrow('a0', 90, 10, 'force outward');
  const direct = { v: 1, start: {}, ops: diffMarks({ strokes: [], shapes: [], items: [] }, { strokes: [], shapes: [right], items: [] }, 2000) };
  const startMarks = { strokes: [], shapes: [], items: [] };
  const withWrong = { ...startMarks, shapes: [wrong] };
  const corrected = { v: 1, start: {}, ops: [...diffMarks(startMarks, withWrong, 2000), ...diffMarks(withWrong, { ...startMarks, shapes: [right] }, 9000)] };
  assert.deepEqual(stateAt(direct), stateAt(corrected), 'same final picture');
  const a = timelineSteps(direct), b = timelineSteps(corrected);
  assert.notDeepEqual(a, b);
  assert.match(b[1].text, /force outward/);
  assert.equal(b[1].t, 2000);
  assert.match(b[2].text, /force inward/);
  assert.equal(b[2].t, 9000, 'the self-correction keeps its time');
});

test('a saved recording restores read-only for replay: timeline and narration load only when asked', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const rec = createSketchRecording({ media: fake.media, time, upload: uploader('rec'), uploadAudio: uploader('aud') });
  rec.setAudio(true);
  await rec.start({ sketch: { strokes: [] } });
  time.advance(1000); rec.observe({ strokes: [stroke(0, 0)] });
  time.advance(1000); rec.stop();
  await until(() => rec.get().status === 'saved', 'saved');
  const saved = rec.get().saved;
  const bytes = { [saved.assetId]: rec.get().take.blob, [saved.narration.assetId]: new Blob([OGG_OPUS], { type: 'audio/ogg' }) };
  const loads = [];
  const load = async id => { loads.push(id); return bytes[id]; };
  const replay = createSketchRecording({ saved, load });
  assert.deepEqual([replay.get().status, replay.get().saved, replay.get().elapsedMs], ['saved', saved, 2000]);
  assert.deepEqual(recordingSubmitState(replay.get()), { ready: true, blocked: null }, 'a revision carries it as ready evidence');
  assert.equal(loads.length, 0);
  const timeline = await replay.timeline();
  assert.deepEqual(stateAt(timeline), { strokes: [stroke(0, 0)], shapes: [], items: [] });
  assert.match(await replay.audioSource(), /^blob:/);
  assert.deepEqual(loads, [saved.assetId, saved.narration.assetId]);
  assert.equal(createSketchRecording({ saved: { ...saved, assetId: 'fs_board_file' } }).get().status, 'idle', 'only a private attempt asset restores');
});

test('leaving the canvas stops every capture, keeps each take and releases the microphone', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const note = voiceNoteFor('leave:q1', { media: fake.media, time, upload: uploader('voc') });
  const silent = sketchRecordingFor('leave:q2', { media: fake.media, time, upload: uploader('rec') });
  await note.start(); await silent.start({ sketch: {} });
  time.advance(3000);
  assert.equal(microphoneHolder()?.id, 'voice-note:leave:q1');
  stopAllExplainBackCaptures({ keep: true });
  assert.equal(microphoneHolder(), null, 'the microphone is released at once');
  assert.ok(fake.tracks.every(track => track.stopped >= 1));
  await until(() => note.get().status === 'saved' && silent.get().status === 'saved', 'kept takes');
  assert.equal(note.get().saved.durationMs, 3000);
  // Narration still waiting for the browser's permission is cancelled when it answers; nothing records.
  const narrated = sketchRecordingFor('leave:q3', { media: fake.media, time, upload: uploader('rec'), uploadAudio: uploader('aud') });
  narrated.setAudio(true);
  const starting = narrated.start({ sketch: {} });
  assert.equal(narrated.get().status, 'requesting');
  stopAllExplainBackCaptures();
  await starting;
  await until(() => narrated.get().status === 'idle', 'start abandoned');
  assert.equal(microphoneHolder(), null);
  assert.ok(fake.tracks.every(track => track.stopped >= 1));
  // keep: false discards a running take.
  const discard = voiceNoteFor('leave:q4', { media: fake.media, time, upload: uploader('voc') });
  await discard.start(); time.advance(1000);
  stopAllExplainBackCaptures({ keep: false });
  await until(() => discard.get().status === 'idle', 'discarded');
  for (const key of ['leave:q1', 'leave:q4']) disposeVoiceNote(key);
  for (const key of ['leave:q2', 'leave:q3']) disposeSketchRecording(key);
});
