import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECORDING_LIMIT_MS, claimMicrophone, clock, createVoiceNote, disposeVoiceNote, formatOf, microphoneHolder, pickRecorderType,
  releaseMicrophone, voiceNoteFor, voiceSubmitState,
} from './explain-back-media.js';
import { EB_SHAPES, validateExplainBackAnswer } from './explain-back-contract.js';
import { validateShape } from './learn-coaching-contract.js';

// An Ogg page whose payload is an OpusHead: what Firefox's MediaRecorder writes first.
const OGG_OPUS = (() => { const b = new Uint8Array(27 + 1 + 19); b.set([...'OggS'].map(c => c.charCodeAt(0))); b[26] = 1; b[27] = 19; b.set([...'OpusHead'].map(c => c.charCodeAt(0)), 28); return b; })();
// The start of a WebM/Opus file, what Chrome writes: EBML magic, doctype webm, an A_OPUS track.
const WEBM_OPUS = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...[...'....webm....A_OPUS'].map(c => c.charCodeAt(0))]);

function fakeMedia({ types = ['audio/ogg;codecs=opus'], bytes = OGG_OPUS, deny = null } = {}) {
  const tracks = [];
  const calls = { getUserMedia: 0 };
  class Track {
    constructor() { this.stopped = 0; this.listeners = {}; tracks.push(this); }
    stop() { this.stopped++; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    end() { for (const fn of this.listeners.ended || []) fn(); }
  }
  class Recorder {
    static isTypeSupported(type) { return types.includes(type); }
    constructor(stream, options) { this.stream = stream; this.mimeType = options?.mimeType || ''; this.state = 'inactive'; Recorder.last = this; }
    start(slice) { this.slice = slice; this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      if (bytes.length) this.ondataavailable?.({ data: new Blob([bytes], { type: this.mimeType }) });
      queueMicrotask(() => this.onstop?.());
    }
  }
  return {
    tracks, calls, Recorder,
    media: {
      MediaRecorder: Recorder,
      getUserMedia: async constraints => {
        calls.getUserMedia++;
        assert.deepEqual(constraints, { audio: true });
        if (deny) throw Object.assign(new Error('denied'), { name: deny });
        const list = [new Track()];
        return { getTracks: () => list };
      },
    },
  };
}
function fakeTime() {
  const t = { at: 0, tickers: new Set() };
  t.now = () => t.at;
  t.every = fn => { t.tickers.add(fn); return () => t.tickers.delete(fn); };
  t.advance = ms => { t.at += ms; for (const fn of [...t.tickers]) fn(); };
  return t;
}
const until = async (check, what) => { for (let i = 0; i < 200; i++) { if (check()) return; await new Promise(r => setTimeout(r, 0)); } assert.fail(`timed out waiting for ${what}`); };
const okUpload = () => {
  const sent = [];
  const upload = async (file, info) => { sent.push({ file, info }); info.onProgress({ sent: file.size, total: file.size }); return { assetId: `aa_voicetest${sent.length}` }; };
  return { sent, upload };
};

test('typed text is byte-for-byte unchanged through record, pause, stop, save, transcript, remove and re-record', async () => {
  for (const typed of ['  Pendulum: T = 2π√(L/g)\nthe bob   swings ', '']) {
    const draft = { text: typed };
    const before = Buffer.from(draft.text, 'utf8');
    const fake = fakeMedia();
    const time = fakeTime();
    const { upload } = okUpload();
    const persisted = [];
    const note = createVoiceNote({ media: fake.media, time, upload, onSaved: saved => persisted.push(saved) });
    const seen = [];
    note.subscribe(state => seen.push(JSON.stringify({ ...state, take: state.take && { ...state.take, blob: null } })));
    await note.start(); time.advance(1000); note.pause(); time.advance(500); note.resume(); time.advance(1000); note.stop();
    await until(() => note.get().status === 'saved', 'first save');
    // A transcript arriving for the stored note is separate data: nothing on the controller accepts it.
    assert.equal(Object.keys(note).some(name => /text|transcri|answer|draft/i.test(name)), false, 'the controller has no text API');
    note.remove();
    await note.start(); time.advance(2000); note.stop();
    await until(() => note.get().status === 'saved', 'second save');
    assert.deepEqual(Buffer.from(draft.text, 'utf8'), before);
    assert.equal(draft.text, typed);
    if (typed.trim()) assert.ok(seen.every(line => !line.includes('Pendulum')), 'no state ever carries the typed answer');
    assert.equal(persisted.at(-1).assetId, 'aa_voicetest2');
    assert.ok(persisted.every(saved => saved === null || !('text' in saved)), 'the persisted note has no text');
  }
});

test('Stop releases every microphone track and the lease, and saves the take with its real format and duration', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const { sent, upload } = okUpload();
  const note = createVoiceNote({ owner: { id: 'a', label: 'The voice note' }, media: fake.media, time, upload });
  await note.start();
  assert.equal(note.get().status, 'recording');
  assert.equal(fake.Recorder.last.mimeType, 'audio/ogg;codecs=opus');
  assert.equal(microphoneHolder()?.id, 'a');
  time.advance(3200);
  assert.equal(clock(note.get().elapsedMs), '0:03');
  note.stop();
  assert.ok(fake.tracks.every(track => track.stopped >= 1), 'tracks stop at Stop, before the last data arrives');
  assert.equal(microphoneHolder(), null);
  await until(() => note.get().status === 'saved', 'save');
  const { take, saved } = note.get();
  assert.deepEqual([take.container, take.ext, take.type, take.codec, take.durationMs], ['ogg', 'ogg', 'audio/ogg', 'opus', 3200]);
  assert.match(take.sha256, /^[0-9a-f]{64}$/);
  assert.equal(sent[0].file.name, 'voice-note.ogg');
  assert.equal(sent[0].info.sha256, take.sha256);
  assert.deepEqual(saved, { evidenceId: `ev_voice_${take.sha256.slice(0, 16)}`, role: 'voice', media: 'audio', state: 'ready', assetId: 'aa_voicetest1', revision: 1, hash: take.sha256, mime: 'audio/ogg', bytes: OGG_OPUS.length, durationMs: 3200 });
  assert.deepEqual(validateShape(EB_SHAPES, 'EvidenceRef', saved), [], 'an EB-01 EvidenceRef');
  assert.deepEqual(validateExplainBackAnswer({ v: 1, kind: 'explain_back', text: '', voice: [saved], resources: [], assistance: [] }).errors, [], 'a voice-only answer');
  assert.deepEqual(voiceSubmitState(note.get()), { ready: true, blocked: null });
});

test('the two-minute limit stops cleanly and says so; paused time does not count', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const note = createVoiceNote({ media: fake.media, time, upload: okUpload().upload });
  await note.start();
  time.advance(60_000); note.pause(); time.advance(600_000); note.resume();
  assert.equal(note.get().elapsedMs, 60_000, 'a long pause adds nothing');
  time.advance(59_000);
  assert.equal(note.get().status, 'recording');
  time.advance(2_000);
  assert.equal(note.get().status, 'stopping', 'stopped at the limit');
  assert.ok(fake.tracks.every(track => track.stopped >= 1));
  await until(() => note.get().status === 'saved', 'save');
  assert.equal(note.get().take.durationMs, RECORDING_LIMIT_MS);
  assert.equal(note.get().notice, 'Stopped at the 2:00 limit.');
});

test('Submit is blocked while recording, paused or saving, and after a failed upload until Retry stores it', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  let fail = true;
  const note = createVoiceNote({ media: fake.media, time, upload: async () => { if (fail) throw Object.assign(new Error('The upload was interrupted. Check the connection and retry.'), { retryable: true }); return { assetId: 'x' }; } });
  assert.deepEqual(voiceSubmitState(note.get()), { ready: false, blocked: null }, 'no note: other evidence decides');
  await note.start();
  assert.equal(voiceSubmitState(note.get()).blocked, 'Stop recording to submit');
  note.pause();
  assert.equal(voiceSubmitState(note.get()).blocked, 'Stop recording to submit');
  note.resume(); time.advance(1000); note.stop();
  assert.equal(voiceSubmitState(note.get()).blocked, 'Stop recording to submit');
  await until(() => note.get().status === 'error', 'failed upload');
  assert.equal(note.get().error.kind, 'upload');
  assert.match(note.get().error.message, /^Not saved: The upload was interrupted/);
  assert.ok(note.get().take, 'the take is kept');
  assert.deepEqual(voiceSubmitState(note.get()), { ready: false, blocked: 'Voice note not saved' });
  fail = false;
  note.retry();
  assert.equal(voiceSubmitState(note.get()).blocked, 'Saving voice note');
  await until(() => note.get().status === 'saved', 'retry save');
  assert.deepEqual(voiceSubmitState(note.get()), { ready: true, blocked: null });
  note.remove();
  assert.deepEqual(voiceSubmitState(note.get()), { ready: false, blocked: null }, 'removing the only note leaves nothing ready');
});

test('permission denial, a missing recorder and no captured audio are specific recoverable states', async () => {
  const denied = fakeMedia({ deny: 'NotAllowedError' });
  const note = createVoiceNote({ media: denied.media, time: fakeTime(), upload: okUpload().upload });
  await note.start();
  assert.equal(note.get().status, 'error');
  assert.equal(note.get().error.kind, 'denied');
  assert.match(note.get().error.message, /Allow it for this site/);
  assert.equal(microphoneHolder(), null, 'the lease is released');
  note.retry();
  assert.equal(note.get().status, 'idle');

  const none = createVoiceNote({ media: { getUserMedia: null, MediaRecorder: null } });
  await none.start();
  assert.equal(none.get().error.kind, 'unsupported');

  const silent = fakeMedia({ bytes: new Uint8Array(0) });
  const empty = createVoiceNote({ media: silent.media, time: fakeTime(), upload: okUpload().upload });
  await empty.start(); empty.stop();
  await until(() => empty.get().status === 'error', 'empty');
  assert.equal(empty.get().error.kind, 'empty');
  assert.ok(silent.tracks.every(track => track.stopped >= 1));
});

test('an interruption keeps the audio captured before it; with none it says so', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const note = createVoiceNote({ media: fake.media, time, upload: okUpload().upload });
  await note.start(); time.advance(42_000);
  fake.tracks[0].end();
  await until(() => note.get().status === 'saved', 'kept take');
  assert.equal(note.get().notice, 'The recording was interrupted at 0:42; the part before it was kept.');
  assert.ok(fake.tracks.every(track => track.stopped >= 1));

  const quiet = fakeMedia({ bytes: new Uint8Array(0) });
  const lost = createVoiceNote({ media: quiet.media, time, upload: okUpload().upload });
  await lost.start(); quiet.tracks[0].end();
  await until(() => lost.get().status === 'error', 'interrupted');
  assert.equal(lost.get().error.kind, 'interrupted');
});

test('one microphone owner: a second recorder is refused by name until the first stops', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const sketch = { id: 'sketch:q1', label: 'The Sketch recording' };
  assert.equal(claimMicrophone(sketch), true);
  const note = createVoiceNote({ media: fake.media, time, upload: okUpload().upload });
  await note.start();
  assert.equal(fake.calls.getUserMedia, 0, 'the microphone is not even requested');
  assert.deepEqual([note.get().status, note.get().error.kind, note.get().error.message], ['error', 'busy', 'The Sketch recording is using the microphone. Stop it first.']);
  releaseMicrophone(sketch);
  note.retry(); await note.start();
  assert.equal(note.get().status, 'recording');
  assert.equal(claimMicrophone(sketch), false, 'and the other way round');
  note.cancel();
  await until(() => note.get().status === 'idle', 'cancel');
  assert.equal(claimMicrophone(sketch), true);
  releaseMicrophone(sketch);
});

test('re-record replaces the note only once a new take exists; cancel or denial keeps the stored one', async () => {
  const fake = fakeMedia();
  const time = fakeTime();
  const persisted = [];
  const note = createVoiceNote({ media: fake.media, time, upload: okUpload().upload, onSaved: saved => persisted.push(saved) });
  await note.start(); time.advance(1000); note.stop();
  await until(() => note.get().status === 'saved', 'first');
  const first = note.get().saved;
  await note.start(); time.advance(5000); note.cancel();
  await until(() => note.get().status === 'saved', 'cancel restores');
  assert.equal(note.get().saved, first);
  assert.equal(note.get().elapsedMs, 1000);
  assert.ok(fake.tracks.every(track => track.stopped >= 1), 'cancel releases the microphone too');
  assert.deepEqual(persisted, [first], 'a cancelled re-record persists nothing');
});

test('a stored note restores after reload and plays through load; dispose mid-recording releases everything', async () => {
  const saved = { evidenceId: 'ev_voice_1', role: 'voice', media: 'audio', state: 'ready', assetId: 'aa_voice00000001', revision: 1, hash: 'f'.repeat(64), mime: 'audio/ogg', bytes: 10, durationMs: 4000 };
  const loads = [];
  const restored = createVoiceNote({ saved, load: async asset => { loads.push(asset); return 'https://example.invalid/a1'; } });
  assert.equal(createVoiceNote({ saved: { ...saved, assetId: 'fs_board_file' } }).get().status, 'idle', 'a board file is not a private voice note');
  assert.equal(restored.get().status, 'saved');
  assert.deepEqual(voiceSubmitState(restored.get()), { ready: true, blocked: null });
  assert.equal(loads.length, 0, 'nothing loads until playback asks');
  assert.equal(await restored.source(), 'https://example.invalid/a1');

  const fake = fakeMedia();
  const live = voiceNoteFor('draft-1', { media: fake.media, time: fakeTime(), upload: okUpload().upload });
  assert.equal(voiceNoteFor('draft-1'), live, 'one controller per draft, whatever mounts it');
  await live.start();
  disposeVoiceNote('draft-1');
  assert.ok(fake.tracks.every(track => track.stopped >= 1));
  assert.equal(microphoneHolder(), null);
  assert.notEqual(voiceNoteFor('draft-1', { media: fake.media }), live);
  disposeVoiceNote('draft-1');
});

test('the recorded container is read from the bytes, and stored-audio formats are asked for first', async () => {
  assert.deepEqual(await formatOf(new Blob([WEBM_OPUS])), { container: 'webm', ext: 'webm', type: 'audio/webm', codec: 'opus' });
  assert.deepEqual(await formatOf(new Blob([OGG_OPUS])), { container: 'ogg', ext: 'ogg', type: 'audio/ogg', codec: 'opus' });
  assert.equal(await formatOf(new Blob(['not audio'])), null);
  assert.equal(pickRecorderType({ isTypeSupported: t => t.startsWith('audio/webm') }), 'audio/webm;codecs=opus', 'Chrome');
  assert.equal(pickRecorderType({ isTypeSupported: t => t.startsWith('audio/') }), 'audio/ogg;codecs=opus');
  assert.equal(pickRecorderType({ isTypeSupported: t => t === 'audio/mp4' }), 'audio/mp4', 'Safari');
  assert.equal(pickRecorderType({}), '', 'no isTypeSupported: the browser default');
});
