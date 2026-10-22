import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  screenCapture, labelFrom, combineScreen, textChunks, moderationFingerprint, MODERATION_POLICY_FINGERPRINT, MODERATION_POLICY_VERSION,
  MODERATION_THRESHOLDS, SCREEN_LIMITS,
} from '../src/webpage-screen.js';
import { askJev, JevError, THRESHOLDS } from '../src/learn-grade-jev.js';
import { ROUTE_THRESHOLDS } from '../../web/src/inline-ai-route.js';
import { usageFeature, payerOf } from '../src/learn-usage.js';

const env = { SMALL_ENV: 'test', TYPESAFE_API_KEY: 'k-direct' };
const manifest = { url: 'https://example.com/a', title: 'Example' };
const tile = (index, type = 'image/jpeg') => ({ index, y: index * 1400, h: 1400, width: 1280, type, bytes: new Uint8Array([index, 1, 2, 3]) });
const tiles = n => Array.from({ length: n }, (_, i) => tile(i));
const choice = (label, p = 0.99, confidence = p) => ({ type: 'choice', choice: label, confidence,
  probabilities: { safe: 0, explicit: 0, graphic: 0, ...(label === 'safe' ? { safe: p, explicit: 1 - p } : { [label]: p, safe: 1 - p }) } });
// A mock JEV: answers every question it is asked with verdict(question key, request), records each call.
function jev(verdict = () => choice('safe')) {
  const calls = [];
  const ask = async (_env, request, options) => {
    calls.push({ request, options });
    return { body: { answers: Object.fromEntries(Object.keys(request.questions).map(key => [key, verdict(key, request)])) } };
  };
  return { ask, calls };
}

test('the policy is pinned: any change to its prompts, request shape or labelling needs a new version and a validation rerun', async () => {
  assert.equal(await moderationFingerprint(), MODERATION_POLICY_FINGERPRINT);
  assert.equal(MODERATION_POLICY_VERSION, 'webcard-mod-p1');
  assert.notEqual(MODERATION_THRESHOLDS, THRESHOLDS);
  assert.notEqual(MODERATION_THRESHOLDS, ROUTE_THRESHOLDS);
});

test('labels: unsafe at or above the unsafe threshold; safe needs P(safe) and confidence; anything between is uncertain', () => {
  assert.equal(labelFrom(choice('explicit', 0.5)).label, 'explicit');
  assert.equal(labelFrom(choice('graphic', 0.97)).label, 'graphic');
  assert.equal(labelFrom(choice('safe', 0.9, 0.9)).label, 'safe');
  // JEV picks safe but explicit is still at the threshold: unsafe wins.
  assert.equal(labelFrom({ type: 'choice', choice: 'safe', confidence: 0.5, probabilities: { safe: 0.5, explicit: 0.5, graphic: 0 } }).label, 'explicit');
  assert.equal(labelFrom(choice('safe', 0.79, 0.95)).label, 'uncertain', 'P(safe) under the safe threshold');
  assert.equal(labelFrom({ type: 'choice', choice: 'safe', confidence: 0.4, probabilities: { safe: 0.9, explicit: 0.1, graphic: 0 } }).label, 'uncertain', 'low JEV confidence');
  assert.equal(labelFrom(choice('explicit', 0.45)).label, 'uncertain', 'explicit below the unsafe threshold');
  for (const bad of [undefined, {}, { type: 'noul', noul: 0.1 }, { ...choice('safe'), choice: 'nsfw' }, { ...choice('safe'), confidence: null },
    { type: 'choice', choice: 'safe', confidence: 1, probabilities: { safe: 1, explicit: 0 } }, { ...choice('safe'), probabilities: { safe: 2, explicit: 0, graphic: 0 } }]) {
    assert.throws(() => labelFrom(bad), /no usable moderation answer/);
  }
});

test('combination is strict: unsafe fails even beside errors; uncertain or error is inconclusive; only all-safe passes', () => {
  const safe = { kind: 'tile', index: 0, label: 'safe' };
  assert.equal(combineScreen([safe, { kind: 'text', index: 0, label: 'safe' }]).status, 'passed');
  assert.equal(combineScreen([safe, { kind: 'tile', index: 1, error: 'timeout' }, { kind: 'tile', index: 2, label: 'graphic' }]).status, 'failed');
  assert.match(combineScreen([safe, { kind: 'tile', index: 2, label: 'graphic' }]).reason, /graphic violence or gore \(image tile 3\)/);
  assert.equal(combineScreen([safe, { kind: 'text', index: 0, label: 'uncertain' }]).status, 'inconclusive');
  assert.match(combineScreen([safe, { kind: 'tile', index: 1, error: 'timeout' }]).reason, /image tile 2: timeout/);
});

test('every tile is screened, bottom included, in bounded batches with the image header on the direct transport', async () => {
  const { ask, calls } = jev((key) => (key === 'tile_14' ? choice('explicit', 0.93) : choice('safe')));
  const text = 'a'.repeat(SCREEN_LIMITS.textChunkChars * 2 + 10);
  const out = await screenCapture(env, manifest, tiles(15), text, { ask, nonce: 'n1' });
  assert.equal(out.status, 'failed');
  assert.match(out.reason, /sexually explicit content \(image tile 15\)/);
  assert.equal(out.policy, MODERATION_POLICY_VERSION);
  const tileCalls = calls.filter(c => c.request.assets);
  assert.equal(tileCalls.length, Math.ceil(15 / SCREEN_LIMITS.tilesPerCall));
  assert.deepEqual(tileCalls.flatMap(c => Object.keys(c.request.questions)), Array.from({ length: 15 }, (_, i) => `tile_${i}`));
  for (const { request, options } of tileCalls) {
    assert.equal(options.transport, 'direct');
    assert.equal(request.model, 'jev-1.13.0');
    assert.deepEqual(options.headers, { 'TypeSafe-Danger-Zone-Images': 'true' });
    assert.ok(Object.keys(request.questions).length <= SCREEN_LIMITS.tilesPerCall);
    for (const [key, question] of Object.entries(request.questions)) {
      const placeholder = Object.keys(request.assets).find(ph => question.instructions.includes(ph));
      assert.ok(placeholder, `${key} names its own tile`);
      assert.equal(request.assets[placeholder].format, 'jpeg');
      assert.equal(Object.keys(request.assets).filter(ph => question.instructions.includes(ph)).length, 1);
    }
  }
  const textCalls = calls.filter(c => !c.request.assets);
  assert.equal(textCalls.length, 3, 'text in chunks');
  assert.ok(textCalls.every(c => c.request.state.page_text.length <= SCREEN_LIMITS.textChunkChars && !c.options.headers['TypeSafe-Danger-Zone-Images']));
  assert.deepEqual(out.perTile.map(t => t.label), [...Array(14).fill('safe'), 'explicit']);
  assert.deepEqual(out.perText.map(t => [t.start, t.end]), [[0, 24000], [24000, 48000], [48000, 48010]]);
});

test('all safe passes; text runs are accepted as well as a string', async () => {
  const { ask, calls } = jev();
  const out = await screenCapture(env, manifest, tiles(3), [{ text: 'Tides rise' }, { text: 'and fall.' }], { ask });
  assert.equal(out.status, 'passed');
  assert.equal(calls.find(c => !c.request.assets).request.state.page_text, 'Tides rise and fall.');
  assert.deepEqual(textChunks('   '), [], 'blank text makes no call');
});

test('a timed-out batch leaves its tiles inconclusive, the rest still labelled; never a pass', async () => {
  const ask = async (_env, request) => {
    if (Object.hasOwn(request.questions, 'tile_6')) throw new JevError('timeout', 'Jev timed out after 20000 ms');
    return { body: { answers: Object.fromEntries(Object.keys(request.questions).map(k => [k, choice('safe')])) } };
  };
  const out = await screenCapture(env, manifest, tiles(8), 'ok', { ask });
  assert.equal(out.status, 'inconclusive');
  assert.deepEqual(out.perTile.map(t => t.label || t.error), ['safe', 'safe', 'safe', 'safe', 'safe', 'safe', 'timeout', 'timeout']);
  assert.match(out.reason, /image tile 7: timeout/);
});

test('a partial answer (one tile missing or malformed) is inconclusive; an HTTP refusal is inconclusive', async () => {
  const partial = async (_env, request) => ({ body: { answers: Object.fromEntries(Object.keys(request.questions).filter(k => k !== 'tile_1').map(k => [k, choice('safe')])) } });
  const out = await screenCapture(env, manifest, tiles(3), '', { ask: partial });
  assert.equal(out.status, 'inconclusive');
  assert.equal(out.perTile[1].error, 'bad_response');
  const refused = async () => { throw new JevError('http', 'Jev 400 api_usage_error: Invalid image dimensions.', 400); };
  const http = await screenCapture(env, manifest, tiles(1), '', { ask: refused });
  assert.equal(http.status, 'inconclusive');
  assert.equal(http.perTile[0].error, 'http 400');
  const uncertain = jev(key => (key === 'text' ? choice('safe', 0.6, 0.6) : choice('safe')));
  assert.equal((await screenCapture(env, manifest, tiles(1), 'x', { ask: uncertain.ask })).status, 'inconclusive');
});

test('an unsupported tile type is never sent and never passes', async () => {
  const { ask, calls } = jev();
  const out = await screenCapture(env, manifest, [tile(0), tile(1, 'image/webp')], '', { ask });
  assert.equal(out.status, 'inconclusive');
  assert.equal(out.perTile[1].error, 'unsupported image');
  assert.deepEqual(Object.keys(calls[0].request.questions), ['tile_0']);
});

test('nothing to screen or no credential is an error with no call', async () => {
  const { ask, calls } = jev();
  assert.equal((await screenCapture({ SMALL_ENV: 'test', VERCEL_TYPESAFE_API_KEY: 'gateway-only' }, manifest, tiles(1), '', { ask })).status, 'error', 'the gateway key alone is not enough');
  assert.equal((await screenCapture(env, manifest, [], 'text', { ask })).status, 'error');
  assert.equal((await screenCapture(env, manifest, tiles(SCREEN_LIMITS.maxTiles + 1), '', { ask })).status, 'error');
  assert.equal((await screenCapture(env, manifest, tiles(1), 'x'.repeat(SCREEN_LIMITS.textChunkChars * SCREEN_LIMITS.maxTextChunks + 1), { ask })).status, 'error');
  assert.equal(calls.length, 0);
});

test('through the real askJev: the header reaches TypeSafe direct, and a hung request times out to inconclusive', async () => {
  const seen = [];
  const hang = (url, init) => { seen.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))); };
  const ask = (e, request, options) => askJev(e, request, { ...options, fetchImpl: hang });
  const out = await screenCapture(env, manifest, tiles(1), '', { ask, limits: { ...SCREEN_LIMITS, timeoutMs: 20 } });
  assert.equal(out.status, 'inconclusive');
  assert.equal(out.perTile[0].error, 'timeout');
  assert.equal(seen[0].url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(seen[0].headers['TypeSafe-Danger-Zone-Images'], 'true');
  assert.equal(seen[0].headers.Authorization, 'Bearer k-direct');
  assert.equal(Object.values(seen[0].body.assets)[0].data_base64, Buffer.from([0, 1, 2, 3]).toString('base64'));
});

test('askJev headers cannot replace the credential or content type', async () => {
  let headers;
  await askJev(env, { model: 'jev-1.13.0', state: 'x', questions: {} }, { transport: 'direct', headers: { Authorization: 'Bearer evil', 'Content-Type': 'text/plain' },
    fetchImpl: async (_url, init) => { headers = init.headers; return Response.json({ answers: {} }); } });
  assert.equal(headers.Authorization, 'Bearer k-direct');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('capture and screening Retry are platform-paid (no credits); the status poll is not a paid route', () => {
  for (const path of ['/api/learn/webpages', '/api/learn/webpages/fs_0123456789abcdef01234567/screen']) {
    assert.equal(usageFeature('POST', path), 'webpage_capture', path);
    assert.equal(payerOf({ feature: 'webpage_capture', identity: { userId: 'u-1' } }).chargeClass, 'free');
  }
  assert.equal(usageFeature('GET', '/api/learn/webpages/fs_0123456789abcdef01234567'), null);
});

// The paid validation run, frozen (C:/s/spec/day-1021/webcard-screen-report.md): JEV's recorded answers replayed through
// screenCapture must give the recorded status, and the status must match each case's expected class.
test('frozen validation set replays to its recorded outcomes', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./webpage-screen-validation.json', import.meta.url), 'utf8'));
  assert.equal(fixture.policy, MODERATION_POLICY_VERSION, 'rerun the validation set when the policy changes');
  assert.deepEqual(fixture.thresholds, { ...MODERATION_THRESHOLDS }, 'rerun the validation set when the thresholds change');
  assert.ok(fixture.cases.length >= 50);
  for (const c of fixture.cases) {
    const ask = async (_env, request) => {
      const keys = Object.keys(request.questions).join(',');
      const hit = c.recorded.find(r => r.questions.join(',') === keys);
      assert.ok(hit, `${c.id}: recorded answer for ${keys}`);
      return { body: { answers: hit.answers } };
    };
    const out = await screenCapture(env, manifest, tiles(c.tiles), 'x'.repeat(c.textChars), { ask });
    assert.equal(out.status, c.status, c.id);
    assert.equal(out.status, c.expect === 'unsafe' ? 'failed' : 'passed', `${c.id} expected ${c.expect}`);
  }
});
