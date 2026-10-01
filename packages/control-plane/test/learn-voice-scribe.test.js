import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scribeToken } from '../src/learn-voice-scribe.js';

const KEY = 'xi-secret-key-123';
const quiet = async run => {
  const log = console.log; const lines = [];
  console.log = line => lines.push(line);
  try { return { result: await run(), lines }; } finally { console.log = log; }
};

test('503 with one line when the key is missing, and no provider call', async () => {
  const fetch = async () => { throw new Error('provider called'); };
  const { result } = await quiet(() => scribeToken({}, { fetch }));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: 'Voice input is not configured on this environment.' });
});

test('the token request: POST to realtime_scribe with xi-api-key and a timeout signal', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ token: 'sutkn_abc' }); };
  const { result, lines } = await quiet(() => scribeToken({ ELEVENLABS_API_KEY: KEY }, { fetch }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['xi-api-key'], KEY);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  const text = await result.text();
  assert.deepEqual(JSON.parse(text), { token: 'sutkn_abc' });
  assert.ok(!text.includes(KEY));
  // One log line, ids and timings only.
  assert.equal(lines.length, 1);
  const logged = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(logged).sort(), ['event', 'kind', 'ms', 'status']);
  assert.equal(logged.kind, 'scribe_token');
  assert.ok(!lines[0].includes('sutkn_abc') && !lines[0].includes(KEY));
});

test('provider failures become a 502 that never forwards the provider body or the key', async () => {
  const env = { ELEVENLABS_API_KEY: KEY };
  const cases = [
    async () => new Response(`invalid api key ${KEY}`, { status: 401 }),
    async () => Response.json({ token: '' }),
    async () => Response.json({ nope: 1 }),
    async () => new Response('not json'),
    async () => { throw new DOMException('timed out', 'TimeoutError'); },
  ];
  for (const fetch of cases) {
    const { result } = await quiet(() => scribeToken(env, { fetch }));
    assert.equal(result.status, 502);
    const text = await result.text();
    assert.deepEqual(JSON.parse(text), { error: 'Voice input is unavailable right now.' });
    assert.ok(!text.includes(KEY));
  }
});
