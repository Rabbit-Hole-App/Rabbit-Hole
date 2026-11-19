// VOICE-1 (owner 2026-11-17): ONE narrator, ElevenLabs Jessica, on every spoken path. The paths: the card audio (explanation-audio.js), the Voice
// Tutor (learn-voice-tts.js), "Read it aloud" (dev-worker.js /api/learn/tts) and /whiteboard narration (whiteboard-tts.js). Fake providers only; nothing is paid for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { NARRATION_VOICE, VOICE_SETTINGS, VOICE_URL, narrationMicros, narrationRequest, speakNarration } from '../src/narration-voice.js';
import { voiceSpeech } from '../src/learn-voice-tts.js';
import { narrateBeat } from '../src/whiteboard-tts.js';
import { paidRefusal } from '../src/learn-paid.js';
import { isPaidSpendReply } from '../src/learn-paid-transport.js';

const source = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ENV = { SMALL_ENV: 'test', ELEVENLABS_API_KEY: 'el-test-key' };
const MP3 = new Uint8Array([73, 68, 51]);
const recorded = () => { const calls = []; return { calls, fetch: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return new Response(MP3); } }; };
const isJessica = ({ url, body }) => url === VOICE_URL && url.includes('cgSgspJ2msm6clMCkdW9') && body.model_id === 'eleven_flash_v2_5'
  && body.voice_settings.speed === 1.1 && body.voice_settings.stability === 0.4 && body.voice_settings.similarity_boost === 0.75;

test('the voice config is one frozen object: Jessica, Flash v2.5, speed 1.1, stability 0.4, mp3 64 kbps', () => {
  assert.ok(Object.isFrozen(NARRATION_VOICE) && Object.isFrozen(VOICE_SETTINGS));
  assert.deepEqual({ ...NARRATION_VOICE }, { provider: 'elevenlabs', model: 'eleven_flash_v2_5', voiceId: 'cgSgspJ2msm6clMCkdW9', speed: 1.1, stability: 0.4, similarityBoost: 0.75, format: 'mp3_44100_64', bitrate: 64000 });
  assert.equal(VOICE_URL, 'https://api.elevenlabs.io/v1/text-to-speech/cgSgspJ2msm6clMCkdW9?output_format=mp3_44100_64');
  const [url, init] = narrationRequest(ENV, 'Hi.', undefined);
  assert.deepEqual([url, init.method, init.headers], [VOICE_URL, 'POST', { 'xi-api-key': 'el-test-key', 'Content-Type': 'application/json', Accept: 'audio/mpeg' }]);
  assert.deepEqual(JSON.parse(init.body), { text: 'Hi.', model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1.1 } });
  assert.equal(narrationMicros(1000), 40000, '$0.04 per 1,000 characters in micro-USD');
});

test('the Voice Tutor route speaks through the shared config, 1,200 characters at most, with the 20 s abort signal', async () => {
  const seen = recorded();
  const answer = await voiceSpeech(ENV, { text: 'x'.repeat(1200) }, { fetch: seen.fetch });
  assert.equal(answer.status, 200);
  assert.equal(seen.calls.length, 1);
  assert.ok(isJessica(seen.calls[0]));
  assert.ok(seen.calls[0].init.signal instanceof AbortSignal);
  assert.equal((await voiceSpeech(ENV, { text: 'x'.repeat(1201) }, { fetch: seen.fetch })).status, 400);
  assert.equal(seen.calls.length, 1, 'over the cap: no provider call');
});

test('/whiteboard narration speaks through the shared config; a request that never answers is aborted at its timeout, retried once, then fails', async () => {
  const seen = recorded(), clip = new Uint8Array(readFileSync(new URL('./fixtures/whiteboard/audio/narration-0.mp3', import.meta.url)));
  const spoken = await narrateBeat(ENV, 'Hello there.', { fetch: async (url, init) => { seen.calls.push({ url, init, body: JSON.parse(init.body) }); return new Response(clip); } });
  assert.deepEqual([seen.calls.length, spoken.attempts, spoken.bytes.length], [1, 1, clip.length]);
  assert.ok(isJessica(seen.calls[0]));
  let asked = 0;
  const hang = (url, init) => new Promise((_, reject) => { asked++; init.signal.addEventListener('abort', () => reject(init.signal.reason)); });
  await assert.rejects(narrateBeat(ENV, 'x', { fetch: hang, timeoutMs: 20 }), { code: 'tts_failed' });
  assert.equal(asked, 2, 'one retry before acceptance');
  await assert.rejects(narrateBeat({ SMALL_ENV: 'test' }, 'x', { fetch: seen.fetch }), { code: 'tts_not_configured' });
});

// "Read it aloud" is the dev worker's inline /api/learn/tts branch, executed as written (the full Worker imports build-only assets): learn-spend-boundary.test.js technique.
const inlineWorker = source('../../web/dev-worker.js');
function readAloud() {
  const start = inlineWorker.indexOf("    if (path === '/api/learn/tts' && req.method === 'POST')");
  assert.ok(start >= 0);
  const code = inlineWorker.slice(start, inlineWorker.indexOf('    // The learner can speak', start));
  return new (Object.getPrototypeOf(async function () {}).constructor)('req', 'env', 'path', 'authorizedBoardApp', 'paidRefusal', 'speakNarration', 'isPaidSpendReply', 'fetch', code);
}
test('Read it aloud speaks through the shared config, 4,000 characters at most, only after the paid confirmation', async () => {
  const seen = recorded();
  const call = (body, env = ENV) => readAloud()(new Request('https://dev.test/api/learn/tts', { method: 'POST', body: JSON.stringify(body) }), env, '/api/learn/tts', async () => ({ email: 'a@b.c' }), paidRefusal, speakNarration, isPaidSpendReply, seen.fetch);
  const answer = await call({ app: 'a', text: 'x'.repeat(4000), confirmed: true });
  assert.deepEqual([answer.status, answer.headers.get('content-type')], [200, 'audio/mpeg']);
  assert.ok(isJessica(seen.calls[0]));
  assert.equal((await call({ app: 'a', text: 'x'.repeat(4001), confirmed: true })).status, 400);
  assert.equal((await call({ app: 'a', text: 'Hello.' })).status, 428, 'no confirmation, no provider call');
  assert.equal((await call({ app: 'a', text: 'Hello.', confirmed: true }, { SMALL_ENV: 'test' })).status, 503);
  assert.equal(seen.calls.length, 1);
});

test('Read it aloud gives up after 20 seconds: the request carries a timeout signal and a timeout is a clear 504 the learner can retry', async () => {
  const seen = recorded();
  const call = (fetchImpl) => readAloud()(new Request('https://dev.test/api/learn/tts', { method: 'POST', body: JSON.stringify({ app: 'a', text: 'Hello.', confirmed: true }) }), ENV, '/api/learn/tts', async () => ({ email: 'a@b.c' }), paidRefusal, speakNarration, isPaidSpendReply, fetchImpl);
  assert.equal((await call(seen.fetch)).status, 200);
  assert.ok(seen.calls[0].init.signal instanceof AbortSignal, 'the provider request is cancellable');
  const timeout = await call(async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); });
  assert.deepEqual([timeout.status, (await timeout.json()).error], [504, 'Narration audio timed out. Try again.']);
  assert.equal((await call(async () => { throw new Error('network'); })).status, 502);
});

test('the card audio calls the same function: its source has no request of its own', () => {
  const card = source('../src/explanation-audio.js');
  assert.match(card, /speakNarration\(env, script, \{ signal: AbortSignal\.timeout\(VOICE_TIMEOUT_MS\), category: 'explanation_audio' \}\)/);
  assert.ok(!/fetch\(|xi-api-key|voice_settings/.test(card.split('// ---- the voice ----')[1]), 'no provider request in the voice half of the card route');
});

// The static guard: one voice. Fails when a second narrator (a Fish constant, a second voice id, a second text-to-speech request) appears in the server source.
const SERVER_FILES = [...readdirSync(new URL('../src/', import.meta.url), { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.js')).map(entry => `${entry.parentPath ?? entry.path}/${entry.name}`.replace(/\\/g, '/')), new URL('../../web/dev-worker.js', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), new URL('../../web/app-worker.js', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')];
test('exactly one voice: no Fish constant and no second voice id or text-to-speech request anywhere in the server source', () => {
  assert.ok(SERVER_FILES.length > 100, 'the scan found the source');
  const offenders = [];
  for (const file of SERVER_FILES) {
    const text = readFileSync(file, 'utf8'), name = file.split('/').pop();
    for (const [rule, pattern] of [['fish provider', /fish\.audio|FISH_AUDIO|fishSpendTransport|reference_id|provider: 'fish'/i], ['voice id', /cgSgspJ2msm6clMCkdW9|802e3bc2b27e49c2995d23ef70e6ac89/], ['tts request', /v1\/text-to-speech/]]) {
      if (pattern.test(text) && !(name === 'narration-voice.js' && rule !== 'fish provider')) offenders.push(`${name}: ${rule}`);
    }
  }
  assert.deepEqual(offenders, [], 'the narrator lives in narration-voice.js only');
  assert.equal(SERVER_FILES.filter(file => /cgSgspJ2msm6clMCkdW9/.test(readFileSync(file, 'utf8'))).length, 1);
});
