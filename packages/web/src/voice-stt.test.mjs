import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scribeUrl, encodeChunk, parseScribeFrame, downsample, createScribeStt, createFakeStt, WORKLET } from './voice-stt.js';

// A fake browser: every seam the Scribe adapter touches, recording what it did.
function fakeBrowser({ deny = false } = {}) {
  const world = { sockets: [], tracks: [], contexts: [], nodes: [], worklet: null, tokens: 0 };
  class FakeSocket {
    constructor(url) { this.url = url; this.sent = []; this.readyState = 1; this.closed = false; world.sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.closed = true; this.readyState = 3; }
    serve(frame) { this.onmessage({ data: JSON.stringify(frame) }); }
    drop() { this.readyState = 3; this.onclose({}); }
  }
  class FakeContext {
    constructor() { this.closed = false; this.destination = {}; world.contexts.push(this); }
    audioWorklet = { addModule: async url => { world.worklet = await (await fetch(url)).text(); } };
    createMediaStreamSource() { return { connect: target => { this.source = target; } }; }
    close() { this.closed = true; }
  }
  class FakeNode {
    constructor(context, name) { this.name = name; this.port = {}; world.nodes.push(this); }
    connect(target) { this.output = target; }
  }
  const getUserMedia = async constraints => {
    world.constraints = constraints;
    if (deny) throw new DOMException('Permission denied', 'NotAllowedError');
    const track = { stopped: false, stop() { this.stopped = true; } };
    world.tracks.push(track);
    return { getTracks: () => [track] };
  };
  world.deps = { WebSocket: FakeSocket, getUserMedia, AudioContext: FakeContext, AudioWorkletNode: FakeNode };
  world.fetchToken = async () => ({ token: `tok-${++world.tokens}` });
  world.frame = pcm => world.nodes.at(-1).port.onmessage({ data: pcm });
  return world;
}

const loud = () => Int16Array.from({ length: 1600 }, (_, i) => (i % 2 ? 8000 : -8000));
const silent = () => new Int16Array(1600);

test('the Scribe URL carries exactly the spec query params', () => {
  const url = new URL(scribeUrl('t/k+n'));
  assert.equal(`${url.origin}${url.pathname}`, 'wss://api.elevenlabs.io/v1/speech-to-text/realtime');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    model_id: 'scribe_v2_realtime', token: 't/k+n', audio_format: 'pcm_16000', language_code: 'en', commit_strategy: 'vad',
    vad_silence_threshold_secs: '1.0', min_speech_duration_ms: '100',
  });
});

test('a chunk frame is base64 PCM16 little-endian at 16 kHz, never a commit', () => {
  const frame = encodeChunk(Int16Array.of(1, -2, 0x7fff));
  assert.deepEqual(Object.keys(frame).sort(), ['audio_base_64', 'commit', 'message_type', 'sample_rate']);
  assert.equal(frame.message_type, 'input_audio_chunk');
  assert.equal(frame.commit, false);
  assert.equal(frame.sample_rate, 16000);
  assert.deepEqual([...Buffer.from(frame.audio_base_64, 'base64')], [0x01, 0x00, 0xfe, 0xff, 0xff, 0x7f]);
});

test('server frames: partial, commit, errors; everything else is ignored', () => {
  assert.deepEqual(parseScribeFrame('{"message_type":"partial_transcript","text":"what is"}'), { type: 'partial', text: 'what is' });
  assert.deepEqual(parseScribeFrame('{"message_type":"committed_transcript","text":"what is attention"}'), { type: 'commit', text: 'what is attention' });
  assert.deepEqual(parseScribeFrame('{"message_type":"auth_error","error":"bad token"}'), { type: 'error', kind: 'auth_error' });
  assert.deepEqual(parseScribeFrame('{"message_type":"quota_exceeded"}'), { type: 'error', kind: 'quota_exceeded' });
  assert.deepEqual(parseScribeFrame('{"error":"boom"}'), { type: 'error', kind: 'error' });
  assert.equal(parseScribeFrame('{"message_type":"session_started","session_id":"s"}'), null);
  assert.equal(parseScribeFrame('not json'), null);
  assert.equal(parseScribeFrame('null'), null);
});

test('downsample: 48 kHz to 16 kHz averages triples and clamps to PCM16', () => {
  const out = downsample(Float32Array.of(1, 1, 1, -1, -1, -1, 0.5, 0.5, 0.5, 2, 2, 2), 48000, 16000);
  assert.deepEqual([...out], [0x7fff, -0x8000, Math.trunc(0.5 * 0x7fff), 0x7fff]);
  assert.equal(downsample(new Float32Array(4410), 44100, 16000).length, 1600);
});

test('start: echo-cancelled mic, worklet posts 100 ms of 16 kHz PCM, chunks go out as frames', async () => {
  const world = fakeBrowser();
  const stt = createScribeStt({ fetchToken: world.fetchToken, onEvent: () => {}, deps: world.deps });
  await stt.start();
  assert.deepEqual(world.constraints, { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  assert.equal(world.sockets.length, 1);
  assert.equal(new URL(world.sockets[0].url).searchParams.get('token'), 'tok-1');
  assert.equal(world.nodes[0].name, 'scribe-capture');

  // The inline worklet source really runs: 48 kHz in, one 1600-sample frame per 100 ms out.
  const posted = [];
  let Processor;
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', world.worklet)(
    class { port = { postMessage: data => posted.push(data) }; },
    (name, cls) => { assert.equal(name, 'scribe-capture'); Processor = cls; },
    48000,
  );
  const processor = new Processor();
  for (let block = 0; block < 75; block++) processor.process([[new Float32Array(128).fill(0.25)]]);
  assert.equal(posted.length, 2); // 9600 samples = 2 x 4800
  assert.equal(posted[0].length, 1600);
  assert.equal(posted[0][0], Math.trunc(0.25 * 0x7fff));

  world.frame(silent());
  assert.equal(world.sockets[0].sent.length, 1);
  assert.equal(world.sockets[0].sent[0].message_type, 'input_audio_chunk');
});

test('events: speech_start once per listen, partial and commit pass through, a fatal error surfaces', async () => {
  const world = fakeBrowser();
  const events = [];
  const stt = createScribeStt({ fetchToken: world.fetchToken, onEvent: event => events.push(event), deps: world.deps });
  await stt.start();
  world.frame(silent());
  assert.deepEqual(events, []);
  world.frame(loud());
  world.frame(loud());
  assert.deepEqual(events, [{ type: 'speech_start' }]);
  world.sockets[0].serve({ message_type: 'partial_transcript', text: 'why' });
  world.sockets[0].serve({ message_type: 'committed_transcript', text: 'why scale' });
  assert.deepEqual(events.slice(1), [{ type: 'partial', text: 'why' }, { type: 'commit', text: 'why scale' }]);
  world.sockets[0].serve({ message_type: 'auth_error', error: 'x' });
  world.sockets[0].drop();
  assert.deepEqual(events.at(-1), { type: 'error', kind: 'auth_error' });
  assert.equal(events.filter(event => event.type === 'error').length, 1);
  assert.equal(world.sockets.length, 1, 'a new token cannot fix it: no reconnect');
});

const settle = () => new Promise(resolve => setImmediate(resolve));
test('Voice stays on: a stream dropped or failed while listening reconnects with a fresh token', async () => {
  const world = fakeBrowser();
  const events = [];
  const stt = createScribeStt({ fetchToken: world.fetchToken, onEvent: event => events.push(event), deps: world.deps });
  await stt.start();
  world.sockets[0].drop();
  await settle();
  assert.equal(world.sockets.length, 2);
  assert.equal(new URL(world.sockets[1].url).searchParams.get('token'), 'tok-2');
  world.sockets[1].serve({ message_type: 'session_time_limit_exceeded', error: 'x' });
  await settle();
  assert.equal(world.sockets[1].closed, true);
  assert.equal(world.sockets.length, 3);
  assert.deepEqual(events, [], 'nothing reaches the session');
  world.frame(loud());
  assert.equal(world.sockets[2].sent.length, 1, 'audio flows on the new stream');
  assert.equal(world.tracks[0].stopped, false, 'the mic stays open');
});

test('reconnects give up after three failures in a row; a transcript resets the count', async () => {
  const world = fakeBrowser();
  const events = [];
  const stt = createScribeStt({ fetchToken: world.fetchToken, onEvent: event => events.push(event), deps: world.deps });
  await stt.start();
  for (let i = 0; i < 3; i++) { world.sockets.at(-1).drop(); await settle(); }
  assert.equal(world.sockets.length, 4);
  world.sockets.at(-1).serve({ message_type: 'partial_transcript', text: 'hi' });
  for (let i = 0; i < 3; i++) { world.sockets.at(-1).drop(); await settle(); }
  assert.equal(world.sockets.length, 7);
  assert.deepEqual(events.filter(event => event.type === 'error'), []);
  world.sockets.at(-1).drop();
  await settle();
  assert.equal(world.sockets.length, 7);
  assert.deepEqual(events.at(-1), { type: 'error', kind: 'closed' });
});

test('pause: no audio, no commit; resume reconnects with a fresh token if the socket closed', async () => {
  const world = fakeBrowser();
  const events = [];
  const stt = createScribeStt({ fetchToken: world.fetchToken, onEvent: event => events.push(event), deps: world.deps });
  await stt.start();
  stt.pause();
  world.frame(loud());
  assert.equal(world.sockets[0].sent.length, 0);
  world.sockets[0].serve({ message_type: 'committed_transcript', text: 'the tutor talking' });
  world.sockets[0].drop();
  assert.deepEqual(events, []);
  assert.equal(world.tracks[0].stopped, false);

  await stt.resume();
  assert.equal(world.sockets.length, 2);
  assert.equal(new URL(world.sockets[1].url).searchParams.get('token'), 'tok-2');
  world.frame(loud());
  assert.deepEqual(events, [{ type: 'speech_start' }]);
  assert.equal(world.sockets[1].sent.length, 1);
  assert.equal(world.sockets[0].sent.length, 0);
});

test('resume keeps an open socket, and a provider error while paused only forces a reconnect', async () => {
  const world = fakeBrowser();
  const events = [];
  const stt = createScribeStt({ fetchToken: world.fetchToken, onEvent: event => events.push(event), deps: world.deps });
  await stt.start();
  stt.pause();
  await stt.resume();
  assert.equal(world.sockets.length, 1);
  stt.pause();
  world.sockets[0].serve({ message_type: 'insufficient_audio_activity', error: 'idle' });
  assert.equal(world.sockets[0].closed, true);
  await stt.resume();
  assert.equal(world.sockets.length, 2);
  assert.deepEqual(events, []);
});

test('a failed token re-mint on resume is an error event, not a rejection', async () => {
  const world = fakeBrowser();
  const events = [];
  let calls = 0;
  const fetchToken = async () => { if (++calls > 1) throw new Error('502'); return 'tok-bare'; };
  const stt = createScribeStt({ fetchToken, onEvent: event => events.push(event), deps: world.deps });
  await stt.start();
  assert.equal(new URL(world.sockets[0].url).searchParams.get('token'), 'tok-bare');
  stt.pause();
  world.sockets[0].drop();
  await stt.resume();
  assert.deepEqual(events, [{ type: 'error', kind: 'token' }]);
});

test('stop releases the mic track, the AudioContext and the socket, and goes quiet', async () => {
  const world = fakeBrowser();
  const events = [];
  const stt = createScribeStt({ fetchToken: world.fetchToken, onEvent: event => events.push(event), deps: world.deps });
  await stt.start();
  const socket = world.sockets[0];
  stt.stop();
  assert.equal(world.tracks[0].stopped, true);
  assert.equal(world.contexts[0].closed, true);
  assert.equal(socket.closed, true);
  socket.drop();
  assert.deepEqual(events, []);
  await stt.resume();
  assert.equal(world.sockets.length, 1);
});

test('mic denied: start rejects with NotAllowedError and opens nothing', async () => {
  const world = fakeBrowser({ deny: true });
  const stt = createScribeStt({ fetchToken: world.fetchToken, onEvent: () => {}, deps: world.deps });
  await assert.rejects(stt.start(), { name: 'NotAllowedError' });
  assert.equal(world.sockets.length, 0);
  assert.equal(world.tokens, 0);
});

test('a failed first token releases the mic it already opened', async () => {
  const world = fakeBrowser();
  const stt = createScribeStt({ fetchToken: async () => { throw new Error('503'); }, onEvent: () => {}, deps: world.deps });
  await assert.rejects(stt.start(), /503/);
  assert.equal(world.tracks[0].stopped, true);
  assert.equal(world.contexts[0].closed, true);
});

test('stop while the permission prompt is open: the mic it then grants is released and no token is minted', async () => {
  const world = fakeBrowser();
  let grant;
  const deps = { ...world.deps, getUserMedia: constraints => new Promise(resolve => { grant = () => resolve(world.deps.getUserMedia(constraints)); }) };
  const stt = createScribeStt({ fetchToken: world.fetchToken, onEvent: () => {}, deps });
  const starting = stt.start();
  stt.stop();
  grant();
  await starting;
  assert.equal(world.tracks[0].stopped, true);
  assert.equal(world.contexts.length, 0);
  assert.equal(world.tokens, 0);
  assert.equal(world.sockets.length, 0);
});

test('a reconnect still minting when Voice goes off and on again opens no second socket', async () => {
  const world = fakeBrowser();
  let held = false, release = null;
  const fetchToken = () => held ? new Promise(resolve => { held = false; release = () => resolve(world.fetchToken()); }) : world.fetchToken();
  const stt = createScribeStt({ fetchToken, onEvent: () => {}, deps: world.deps });
  await stt.start();
  stt.pause();
  world.sockets[0].drop();
  held = true;
  const resuming = stt.resume(); // its token is still on the way
  stt.stop();
  await stt.start();
  assert.equal(world.sockets.length, 2);
  release();
  await resuming;
  assert.equal(world.sockets.length, 2, 'the stale reconnect opens nothing');
  stt.stop();
  assert.equal(world.sockets[1].closed, true);
});

test('fake STT: say emits speech_start, partial, commit; silent when paused or stopped; fail and deny', async () => {
  const events = [];
  const stt = createFakeStt({ onEvent: event => events.push(event) });
  stt.say('too early');
  assert.deepEqual(events, []);
  await stt.start();
  stt.say('why divide by root d');
  assert.deepEqual(events, [{ type: 'speech_start' }, { type: 'partial', text: 'why divide by root d' }, { type: 'commit', text: 'why divide by root d' }]);
  stt.pause();
  stt.say('ignored');
  assert.equal(events.length, 3);
  await stt.resume();
  stt.fail('closed');
  assert.deepEqual(events.at(-1), { type: 'error', kind: 'closed' });
  stt.stop();
  stt.say('after stop');
  assert.equal(events.length, 4);
  await assert.rejects(createFakeStt({ onEvent: () => {}, denyPermission: true }).start(), { name: 'NotAllowedError' });
});

test('the capture worklet still runs when the bundler renames downsample (minified build)', () => {
  // Simulate the minifier: the embedded function keeps working under another name.
  const src = WORKLET.replace('function downsample(', 'function va(');
  let Processor = null; const posted = [];
  class Base { constructor() { this.port = { postMessage: data => posted.push(data) }; } }
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', src)(Base, (name, cls) => { Processor = cls; }, 48000);
  const node = new Processor();
  node.process([[new Float32Array(4800).fill(0.5)]]);
  assert.equal(posted.length, 1, 'one 100 ms frame posted');
  assert.equal(posted[0].length, 1600, '16 kHz PCM16');
});
