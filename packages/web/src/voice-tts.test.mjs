// Voice Mode TTS adapter (docs/features/voice-tutor-mvp.md §4): what is read aloud, the event
// order, stop/fail/empty outcomes and one speak at a time. Fake post and fake audio; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { speakable, createFishTts, createFakeTts } from './voice-tts.js';
import { createVoiceSession } from './voice-session.js';
import { createFakeStt } from './voice-stt.js';

test('speakable drops code, math, URLs and markdown syntax but keeps link text', () => {
  assert.equal(speakable('Run ```py\nprint(1)\n``` then `x = 1` now.'), 'Run then now.');
  assert.equal(speakable('Scores are $$QK^T$$ scaled by $\\sqrt{d}$ here.'), 'Scores are scaled by here.');
  assert.equal(speakable('See [the paper](https://arxiv.org/abs/1706.03762) or https://example.com/x.'), 'See the paper or');
  assert.equal(speakable('# Softmax\n- **each** score\n1. _sums_ to one\n> quoted'), 'Softmax each score sums to one quoted');
  assert.equal(speakable('Open fence ```js\nconst a = 1;'), 'Open fence');
  assert.equal(speakable('  many \n\n  spaces  '), 'many spaces');
  assert.equal(speakable(''), '');
  assert.equal(speakable(null), '');
  assert.equal(speakable('```\nonly code\n```'), '');
});

test('speakable caps about 600 characters at a sentence boundary, else at a word', () => {
  const sentence = 'Attention weighs every token by its score. ';
  const long = sentence.repeat(30);
  const capped = speakable(long);
  assert.ok(capped.length <= 600 && capped.length > 300);
  assert.ok(capped.endsWith('score.'));
  const words = speakable('word '.repeat(200));
  assert.ok(words.length <= 600 && words.endsWith('word'));
});

function fakeAudio() {
  const made = [];
  const makeAudio = url => {
    const audio = { url, paused: true, play: async () => { audio.paused = false; queueMicrotask(() => audio.onplaying?.()); }, pause: () => { audio.paused = true; } };
    made.push(audio);
    return audio;
  };
  return { made, makeAudio };
}
const audioResponse = () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2])); c.enqueue(new Uint8Array([3])); c.close(); } }), { headers: { 'Content-Type': 'audio/mpeg' } });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const revoked = [], revoke = URL.revokeObjectURL;
URL.revokeObjectURL = url => { revoked.push(url); revoke(url); };

test('createFishTts posts the speakable text, emits events in order and resolves ended', async () => {
  const events = [], posts = [], { made, makeAudio } = fakeAudio();
  const tts = createFishTts({ post: async (path, body, signal) => { posts.push({ path, body, signal }); return audioResponse(); }, onEvent: e => events.push(e), makeAudio, now: () => 7 });
  const done = tts.speak('Look at `code` the **card**.', { turnId: 't1' });
  while (!made.length) await tick();
  await tick();
  made[0].onended();
  assert.equal(await done, 'ended');
  assert.deepEqual(posts.map(p => [p.path, p.body]), [['/api/learn/voice/tts', { text: 'Look at the card.', trace_id: 't1', confirmed: true }]]);
  assert.ok(posts[0].signal instanceof AbortSignal);
  assert.deepEqual(events.map(e => e.type), ['tts_request_start', 'tts_first_byte', 'tts_play_start', 'tts_play_end']);
  assert.ok(events.every(e => e.turnId === 't1' && e.at === 7 && Object.keys(e).length === 3));
  assert.match(made[0].url, /^blob:/);
  assert.equal(revoked.at(-1), made[0].url, 'the object URL is revoked');
});

test('stop pauses the audio and resolves stopped with no tts_error', async () => {
  const events = [], { made, makeAudio } = fakeAudio();
  const tts = createFishTts({ post: async () => audioResponse(), onEvent: e => events.push(e), makeAudio });
  const done = tts.speak('Hello there.', { turnId: 't2' });
  while (!made.length) await tick();
  tts.stop();
  assert.equal(await done, 'stopped');
  assert.equal(made[0].paused, true);
  assert.ok(!events.some(e => e.type === 'tts_error' || e.type === 'tts_play_end'));
});

test('stop during the request aborts it and resolves stopped', async () => {
  let seen;
  const tts = createFishTts({
    post: (path, body, signal) => { seen = signal; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))); },
    makeAudio: () => assert.fail('no audio after stop'),
  });
  const done = tts.speak('Hello.', { turnId: 't3' });
  await tick();
  tts.stop();
  assert.equal(await done, 'stopped');
  assert.equal(seen.aborted, true);
});

test('errors resolve failed with tts_error and never throw', async () => {
  const cases = [
    async () => Response.json({ error: 'Voice output is unavailable right now.' }, { status: 502 }),
    async () => { throw new TypeError('network'); },
  ];
  for (const post of cases) {
    const events = [];
    const tts = createFishTts({ post, onEvent: e => events.push(e.type), makeAudio: () => assert.fail('no audio on error') });
    assert.equal(await tts.speak('Hi.', { turnId: 't4' }), 'failed');
    assert.deepEqual(events, ['tts_request_start', 'tts_error']);
  }
  // Autoplay blocked: play() rejects.
  const events = [];
  const blocked = createFishTts({ post: async () => audioResponse(), onEvent: e => events.push(e.type), makeAudio: () => ({ play: () => Promise.reject(new Error('NotAllowedError')), pause() {} }) });
  assert.equal(await blocked.speak('Hi.', { turnId: 't5' }), 'failed');
  assert.deepEqual(events, ['tts_request_start', 'tts_first_byte', 'tts_error']);
});

test('text with nothing speakable resolves ended without a request', async () => {
  const events = [];
  const tts = createFishTts({ post: () => assert.fail('no request'), onEvent: e => events.push(e) });
  assert.equal(await tts.speak('$$x^2$$ `y`', { turnId: 't6' }), 'ended');
  assert.deepEqual(events, []);
});

test('a second speak stops the first', async () => {
  const { made, makeAudio } = fakeAudio();
  const tts = createFishTts({ post: async () => audioResponse(), makeAudio });
  const first = tts.speak('One.', { turnId: 'a' });
  while (!made.length) await tick();
  const second = tts.speak('Two.', { turnId: 'b' });
  assert.equal(await first, 'stopped');
  assert.equal(made[0].paused, true);
  while (made.length < 2) await tick();
  made[1].onended();
  assert.equal(await second, 'ended');
});

test('createFakeTts: ended after ms, stopped on stop, failed with fail, same events', async () => {
  const events = [];
  const options = { onEvent: e => events.push(e.type), ms: 5 };
  const tts = createFakeTts(options);
  assert.equal(await tts.speak('Hello.', { turnId: 'f1' }), 'ended');
  assert.deepEqual(events, ['tts_request_start', 'tts_first_byte', 'tts_play_start', 'tts_play_end']);

  events.length = 0;
  options.ms = 10000;
  const pending = tts.speak('Long one.', { turnId: 'f2' });
  tts.stop();
  assert.equal(await pending, 'stopped');
  assert.ok(!events.includes('tts_play_end'));

  events.length = 0;
  options.fail = true;
  assert.equal(await tts.speak('Hi.', { turnId: 'f3' }), 'failed');
  assert.deepEqual(events, ['tts_request_start', 'tts_error']);
  assert.equal(await tts.speak('```code```', { turnId: 'f4' }), 'ended');
});

// Streaming playback (owner, 2026-10-01): a MediaSource fake that records what is appended, and a Fish
// body whose chunks the test releases one at a time.
class FakeMediaSource extends EventTarget {
  static isTypeSupported = type => type === 'audio/mpeg';
  static made = [];
  readyState = 'closed';
  constructor() {
    super();
    FakeMediaSource.made.push(this);
    setTimeout(() => { this.readyState = 'open'; this.dispatchEvent(new Event('sourceopen')); });
  }
  addSourceBuffer(type) {
    assert.equal(type, 'audio/mpeg');
    const buffer = this.buffer = Object.assign(new EventTarget(), { appended: [] });
    buffer.appendBuffer = chunk => { buffer.appended.push([...chunk]); setTimeout(() => { buffer.dispatchEvent(new Event('updateend')); this.onData?.(); }); };
    return buffer;
  }
  endOfStream() { this.readyState = 'ended'; }
}
const createURL = URL.createObjectURL;
URL.createObjectURL = source => (source instanceof FakeMediaSource ? `blob:ms-${FakeMediaSource.made.indexOf(source)}` : createURL(source));
function heldBody() {
  let control;
  const body = new ReadableStream({ start(c) { control = c; } });
  return { response: new Response(body, { headers: { 'Content-Type': 'audio/mpeg' } }), push: bytes => control.enqueue(new Uint8Array(bytes)), close: () => control.close() };
}
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
// Like a browser, a MediaSource audio element starts playing (onplaying) only once data is buffered.
function streamAudio(made) {
  return url => {
    const source = FakeMediaSource.made.at(-1);
    const audio = { url, paused: true, pause: () => { audio.paused = true; } };
    audio.play = async () => { audio.paused = false; source.onData = () => { source.onData = null; if (!audio.paused) audio.onplaying?.(); }; };
    made.push(audio);
    return audio;
  };
}
function streamingRig() {
  const events = [], bodies = [], signals = [], made = [], makeAudio = streamAudio(made);
  const tts = createFishTts({ post: async (path, body, signal) => { signals.push(signal); const held = heldBody(); bodies.push(held); return held.response; }, onEvent: e => events.push(e.type), makeAudio, MediaSource: FakeMediaSource });
  return { tts, events, bodies, signals, made };
}

test('streaming: playback starts after the first chunk, before the Fish body completes', async () => {
  const r = streamingRig();
  const done = r.tts.speak('Here it is. Notice the division before softmax.', { turnId: 's1' });
  await settle();
  assert.deepEqual(r.events, ['tts_request_start'], 'nothing audible before the first chunk');
  r.bodies[0].push([1, 2]);
  await settle();
  assert.equal(r.made[0].paused, false, 'playing while the body is still open');
  assert.deepEqual(r.events, ['tts_request_start', 'tts_first_byte', 'tts_play_start']);
  r.bodies[0].push([3]);
  r.bodies[0].close();
  await settle();
  const source = FakeMediaSource.made.at(-1);
  assert.deepEqual(source.buffer.appended, [[1, 2], [3]]);
  assert.equal(source.readyState, 'ended', 'endOfStream once the body is done');
  r.made[0].onended();
  assert.equal(await done, 'ended');
  assert.equal(revoked.at(-1), r.made[0].url);
});

test('streaming: Stop pauses at once, aborts the request and no later chunk is appended or played', async () => {
  const r = streamingRig();
  const done = r.tts.speak('A long explanation the learner cuts short.', { turnId: 's2' });
  await settle();
  r.bodies[0].push([1]);
  await settle();
  const source = FakeMediaSource.made.at(-1);
  r.tts.stop();
  assert.equal(r.made[0].paused, true, 'silent immediately');
  assert.equal(r.signals[0].aborted, true, 'the Fish stream is aborted');
  assert.equal(await done, 'stopped');
  assert.ok(r.events.includes('tts_stopped'));
  // A stale chunk that still arrives is never appended, and nothing plays again.
  try { r.bodies[0].push([9]); r.bodies[0].close(); } catch {}
  await settle();
  assert.deepEqual(source.buffer.appended, [[1]]);
  assert.equal(r.made[0].paused, true);
  assert.ok(!r.events.includes('tts_error') && !r.events.includes('tts_play_end'));
});

test('streaming: a new turn never plays audio from the previous turn', async () => {
  const r = streamingRig();
  const first = r.tts.speak('First reply.', { turnId: 'old' });
  await settle();
  r.bodies[0].push([1]);
  await settle();
  const oldSource = FakeMediaSource.made.at(-1);
  const second = r.tts.speak('Second reply.', { turnId: 'new' });
  assert.equal(await first, 'stopped');
  try { r.bodies[0].push([2]); } catch {}
  await settle();
  r.bodies[1].push([7]);
  await settle();
  assert.deepEqual(oldSource.buffer.appended, [[1]], 'the old stream gets nothing more');
  assert.equal(r.made[0].paused, true);
  assert.deepEqual(FakeMediaSource.made.at(-1).buffer.appended, [[7]]);
  assert.equal(r.made[1].paused, false);
  assert.notEqual(r.made[1].url, r.made[0].url);
  r.bodies[1].close();
  await settle();
  r.made[1].onended();
  assert.equal(await second, 'ended');
});

test('streaming in a voice session: canvas acts before audio, Stop keeps Voice Mode on and listening', async () => {
  const r = streamingRig();
  const canvas = [];
  const sttEvents = [];
  let session;
  const stt = createFakeStt({ onEvent: event => session.sttEvent(event) });
  const tts = createFishTts({ post: async (path, body, signal) => { r.signals.push(signal); const held = heldBody(); r.bodies.push(held); return held.response; }, onEvent: event => session.ttsEvent(event), makeAudio: streamAudio(r.made), MediaSource: FakeMediaSource });
  const tutor = { voiceTurn: async ({ turnId }) => { canvas.push(turnId); return { speech: 'Here it is. Notice the division before softmax.', turnId, ms: { to_evidence_ready: 1, to_planner_ready: 2, canvas_done: 3 } }; } };
  session = createVoiceSession({ stt, tts, tutor, telemetry: (name, detail) => sttEvents.push({ name, ...detail }) });
  await session.enter();
  stt.say('show me where this happens');
  await settle();
  assert.equal(canvas.length, 1, 'the canvas acted before any audio');
  assert.ok(sttEvents.some(e => e.name === 'canvas_action_visible'));
  r.bodies[0].push([1, 2]);
  await settle();
  assert.equal(session.state, 'speaking');
  assert.ok(!sttEvents.some(e => e.name === 'tts_play_end'), 'the canvas did not wait for speech to finish');
  session.interrupt();
  assert.equal(session.state, 'listening', 'Voice Mode stays on and listens again');
  assert.equal(r.made[0].paused, true);
  try { r.bodies[0].push([3]); r.bodies[0].close(); } catch {}
  await settle();
  assert.equal(session.state, 'listening');
  assert.deepEqual(FakeMediaSource.made.at(-1).buffer.appended, [[1, 2]]);
  const turn = sttEvents.find(e => e.name === 'voice_turn');
  assert.equal(typeof turn.ms.text_ready_to_tts_request, 'number');
  assert.equal(typeof turn.ms.text_ready_to_play_start, 'number');
  assert.equal(typeof turn.ms.stop_to_pause, 'number');
  session.exit();
});

test('streaming: a Stop before the MediaSource opens resolves stopped and leaves nothing waiting', async () => {
  const r = streamingRig();
  const done = r.tts.speak('Hello there.', { turnId: 's5' });
  while (!r.made.length) await tick();
  r.tts.stop();
  assert.equal(await done, 'stopped');
  assert.ok(r.events.includes('tts_stopped'));
  await settle();
  assert.equal(FakeMediaSource.made.at(-1).buffer, undefined, 'no SourceBuffer after the stop');
});
