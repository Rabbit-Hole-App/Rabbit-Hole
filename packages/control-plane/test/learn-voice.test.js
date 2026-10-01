// Voice Mode routes (docs/features/voice-tutor-mvp.md §5): the gate order before either provider,
// and that a response never carries a key. The handlers are injected or their fetch is stubbed:
// no ElevenLabs or Fish call is made here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceRoute } from '../src/learn-voice-routes.js';

const KEY = 'xi-secret-key-never-shown';
const env = { ELEVENLABS_API_KEY: KEY, FISH_AUDIO_API_KEY: 'fish-secret-key-never-shown' };
const allow = async (req, env, app) => ({ email: 'learner@test', org: 'team', app });
const request = (path, { method = 'POST', origin, body = { app: 'canvas-0a1b2c3d', confirmed: true } } = {}) => new Request(`https://dev.test${path}`, {
  method, headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
  ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
const handlers = () => {
  const calls = [];
  return {
    calls,
    authorize: allow,
    scribeToken: async (env, deps) => { calls.push(['scribe']); return Response.json({ token: 'single-use' }); },
    voiceSpeech: async (env, body) => { calls.push(['tts', body]); return new Response('mp3', { headers: { 'Content-Type': 'audio/mpeg' } }); },
  };
};

test('voice routes: foreign paths are not theirs', async () => {
  for (const path of ['/api/learn/voice/other', '/api/learn/tts', '/api/learn/voice']) assert.equal(await voiceRoute(path, request(path), env, handlers()), null, path);
});

test('voice routes: 405, foreign origin 403, bad JSON 400, auth refusal passes through, 428 without confirmed', async () => {
  for (const path of ['/api/learn/voice/scribe-token', '/api/learn/voice/tts']) {
    const deps = handlers();
    assert.equal((await voiceRoute(path, request(path, { method: 'GET' }), env, deps)).status, 405, path);
    assert.equal((await voiceRoute(path, request(path, { origin: 'https://evil.test' }), env, deps)).status, 403, path);
    assert.equal((await voiceRoute(path, request(path, { origin: 'https://dev.test', body: '{' }), env, deps)).status, 400, path);
    const refused = Response.json({ error: 'Sign in first.' }, { status: 401 });
    assert.equal(await voiceRoute(path, request(path), env, { ...deps, authorize: async () => refused }), refused, path);
    const owner = await voiceRoute(path, request(path), { ...env, SUBSCRIPTION_ONLY: 'true', SUBSCRIPTION_OWNER_EMAIL: 'owner@test' }, deps);
    assert.equal(owner.status, 403, `${path}: the subscription owner gate`);
    const unconfirmed = await voiceRoute(path, request(path, { body: { app: 'canvas-0a1b2c3d' } }), env, deps);
    assert.equal(unconfirmed.status, 428, path);
    assert.equal((await unconfirmed.json()).needsConfirm, true);
    assert.deepEqual(deps.calls, [], `${path}: no provider handler before every gate passes`);
  }
});

test('voice routes: authorize gets the app and pending; then dispatch to scribeToken / voiceSpeech', async () => {
  const deps = handlers();
  const seen = [];
  deps.authorize = async (req, env, app, pending) => { seen.push([app, pending]); return allow(req, env, app); };
  const token = await voiceRoute('/api/learn/voice/scribe-token', request('/api/learn/voice/scribe-token', { origin: 'https://dev.test', body: { app: 'canvas-0a1b2c3d', pending: 'p1', confirmed: true } }), env, deps);
  assert.deepEqual(await token.json(), { token: 'single-use' });
  const body = { app: 'canvas-0a1b2c3d', text: 'Row three reads itself.', trace_id: 't1', confirmed: true };
  const speech = await voiceRoute('/api/learn/voice/tts', request('/api/learn/voice/tts', { body }), env, deps);
  assert.equal(speech.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(deps.calls, [['scribe'], ['tts', body]]);
  assert.deepEqual(seen, [['canvas-0a1b2c3d', 'p1'], ['canvas-0a1b2c3d', null]]);
});

test('voice routes: the Scribe token response never carries the API key; no key is a 503', async () => {
  const sent = [];
  const fetch = async (url, init) => { sent.push({ url, key: init.headers['xi-api-key'] }); return Response.json({ token: 'single-use' }); };
  const path = '/api/learn/voice/scribe-token';
  const ok = await voiceRoute(path, request(path), env, { authorize: allow, fetch });
  const text = await ok.text();
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(text), { token: 'single-use' });
  assert.ok(!text.includes(KEY));
  assert.deepEqual(sent, [{ url: 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', key: KEY }]);
  const missing = await voiceRoute(path, request(path), {}, { authorize: allow, fetch });
  assert.equal(missing.status, 503);
  assert.equal(sent.length, 1, 'no provider call without a key');
  const failed = await voiceRoute(path, request(path), env, { authorize: allow, fetch: async () => new Response(`bad key ${KEY}`, { status: 401 }) });
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes(KEY), 'the provider body is never forwarded');
});
