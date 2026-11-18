// POST /api/learn/voice/tts handler (docs/features/voice-tutor-mvp.md §5): text bounds, the
// missing-key 503, the exact narrator request (the one voice, narration-voice.js), provider errors masked as 502, audio/mpeg passthrough,
// and a log line without the text. A recorded fetch stands in for ElevenLabs; nothing is paid for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceSpeech, VOICE_TTS_TIMEOUT_MS } from '../src/learn-voice-tts.js';
import { NARRATION_VOICE, VOICE_SETTINGS, VOICE_URL } from '../src/narration-voice.js';

const ENV = { SMALL_ENV: 'test', ELEVENLABS_API_KEY: 'el-test-key' };
function recordFetch(reply) {
  const calls = [];
  const fetch = async (url, options) => { calls.push({ url, options }); return typeof reply === 'function' ? reply() : reply; };
  return { calls, fetch };
}
function captureLogs(t) {
  const lines = [], original = console.log;
  console.log = line => lines.push(line);
  t.after(() => { console.log = original; });
  return lines;
}
const audio = () => new Response(new Uint8Array([73, 68, 51]), { headers: { 'Content-Type': 'application/octet-stream' } });

test('text must be a string of 1 to 1200 characters', async () => {
  const { calls, fetch } = recordFetch(audio());
  for (const text of [undefined, 42, '', '   ', 'x'.repeat(1201)]) {
    const res = await voiceSpeech(ENV, { text }, { fetch });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Provide 1 to 1200 characters to speak.' });
  }
  assert.equal(calls.length, 0);
});

test('503 without the ElevenLabs key, and no provider call', async () => {
  const { calls, fetch } = recordFetch(audio());
  const res = await voiceSpeech({}, { text: 'Hello.' }, { fetch });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'Voice output is not configured on this environment.' });
  assert.equal(calls.length, 0);
});

test('the narrator request: Jessica on Flash v2.5 through the shared voice config, mp3 64 kbps, 20 s timeout signal', async t => {
  captureLogs(t);
  const { calls, fetch } = recordFetch(audio());
  const text = 'x'.repeat(1200);
  const res = await voiceSpeech(ENV, { text, trace_id: 't1', app: 'a', confirmed: true }, { fetch });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, VOICE_URL);
  assert.ok(url.includes('cgSgspJ2msm6clMCkdW9') && url.endsWith('output_format=mp3_44100_64'));
  assert.equal(options.method, 'POST');
  assert.deepEqual(options.headers, { 'xi-api-key': 'el-test-key', 'Content-Type': 'application/json', Accept: 'audio/mpeg' });
  assert.deepEqual(JSON.parse(options.body), { text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1.1 } });
  assert.deepEqual(VOICE_SETTINGS, JSON.parse(options.body).voice_settings);
  assert.equal(NARRATION_VOICE.provider, 'elevenlabs');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(VOICE_TTS_TIMEOUT_MS, 20000);
});

test('the audio streams back as audio/mpeg with no-store', async t => {
  captureLogs(t);
  const { fetch } = recordFetch(audio());
  const res = await voiceSpeech(ENV, { text: 'Hello.' }, { fetch });
  assert.equal(res.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [73, 68, 51]);
});

test('provider failures are a 502 without the provider body', async t => {
  captureLogs(t);
  const replies = [
    () => new Response('{"detail":"insufficient balance for el-test-key"}', { status: 402 }),
    () => { throw new TypeError('fetch failed'); },
    () => { throw new DOMException('timed out', 'TimeoutError'); },
  ];
  for (const reply of replies) {
    const res = await voiceSpeech(ENV, { text: 'Hello.' }, recordFetch(reply));
    assert.equal(res.status, 502);
    const raw = await res.text();
    assert.deepEqual(JSON.parse(raw), { error: 'Voice output is unavailable right now.' });
    assert.doesNotMatch(raw, /balance|el-test-key/);
  }
});

test('one log line with turn id, status, ms and chars, never the text', async t => {
  const lines = captureLogs(t);
  const text = 'The secret learner-facing sentence.';
  await voiceSpeech(ENV, { text, trace_id: 'turn-123' }, recordFetch(audio()));
  await voiceSpeech(ENV, { text, trace_id: 'x'.repeat(65) }, recordFetch(() => { throw new DOMException('timed out', 'TimeoutError'); }));
  assert.equal(lines.length, 2);
  assert.ok(lines.every(line => !line.includes('secret')));
  const [ok, timeout] = lines.map(line => JSON.parse(line));
  assert.deepEqual(Object.keys(ok).sort(), ['chars', 'event', 'kind', 'ms', 'status', 'turn_id']);
  assert.deepEqual({ ...ok, ms: 0 }, { event: 'learn_voice', kind: 'tts', turn_id: 'turn-123', status: 200, ms: 0, chars: text.length });
  assert.equal(typeof ok.ms, 'number');
  assert.equal(timeout.turn_id, null);
  assert.equal(timeout.status, 'timeout');
});
