// EXP-T18 render step: manifest bounds/dedup/staleness and the inert interception, with a fake browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RENDER_ENTRY, RENDER_ORIGIN, allowedAsset, checkManifest, compiledHash, interceptor, renderStates, reserveCaptures } from '../src/explain-render.js';

const scene = { id: 's', width: 400, height: 300, duration: 2, objects: [], timeline: [] };
const entry = (id, extra = {}) => ({ id, time: 1, inputs: {}, theme: 'light', width: 400, height: 300, dpr: 1, ...extra });
const manifestFor = async (entries, reserved = reserveCaptures({ states: 4, themes: 2, width: 400, height: 300, dpr: 1 })) => ({ version: 1, compiledHash: await compiledHash(scene), reserved, entries });

// Assets that exist in the "build": the entry and two hashed static files.
const ASSETS = { fetch: async request => {
  const path = new URL(request.url).pathname;
  const files = { [RENDER_ENTRY]: ['<html></html>', 'text/html'], '/static/render-abc.js': ['//js', 'text/javascript'], '/static/KaTeX_Main-Regular-x.woff2': ['font', 'font/woff2'] };
  return files[path] ? new Response(files[path][0], { headers: { 'content-type': files[path][1] } }) : new Response('nope', { status: 404 });
} };

function fakeRequest(url) {
  const r = { url: () => url, outcome: null };
  r.abort = reason => { r.outcome = `abort:${reason}`; };
  r.respond = response => { r.outcome = `respond:${response.status}:${response.headers['content-type']}`; };
  return r;
}

// A puppeteer-shaped browser whose page fires the given page requests through the interceptor on goto.
function fakeBrowser({ pageRequests = [], renderResult = { ok: true, fonts: { missing: [] } }, hang = false } = {}) {
  const state = { closed: false, evaluated: [], intercepted: [], handler: null };
  const page = {
    setRequestInterception: async on => { state.interception = on; },
    on: (event, handler) => { if (event === 'request') state.handler = handler; },
    emulateMediaFeatures: async features => { state.media = features; },
    setViewport: async viewport => { state.viewport = viewport; },
    goto: async url => {
      for (const u of [url, ...pageRequests]) { const r = fakeRequest(u); await state.handler(r); state.intercepted.push(r); }
    },
    waitForFunction: async () => {},
    evaluate: async (fn, request) => { state.evaluated.push(request); if (hang) return new Promise(() => {}); return renderResult; },
    $: async () => ({ screenshot: async () => new TextEncoder().encode(`png:${state.evaluated.length}`) }),
  };
  return { state, browser: { newPage: async () => page, close: async () => { state.closed = true; } } };
}

test('identical states are captured once and the duplicate is recorded as an alias', async () => {
  const checked = await checkManifest(await manifestFor([entry('a'), entry('b'), entry('c', { theme: 'dark' })]), scene);
  assert.equal(checked.entries.length, 2);
  assert.deepEqual(checked.entries[0].aliases, ['b']);
});

test('an over-budget manifest is refused, never trimmed', async () => {
  const entries = [entry('a', { time: 0 }), entry('b', { time: 1 }), entry('c', { time: 2 })];
  await assert.rejects(checkManifest(await manifestFor(entries, { captures: 2, pixels: 10 ** 9 }), scene), { code: 'over_budget' });
  await assert.rejects(checkManifest(await manifestFor(entries, { captures: 9, pixels: 1000 }), scene), { code: 'over_budget' });
  await assert.rejects(checkManifest({ ...(await manifestFor(entries)), reserved: undefined }, scene), { code: 'no_reservation' });
});

test('a manifest for another compiled version is refused as stale before any browser starts', async () => {
  const manifest = await manifestFor([entry('a')]);
  let launched = false;
  await assert.rejects(renderStates({ ASSETS }, { scene: { ...scene, duration: 3 } }, manifest, { launch: async () => { launched = true; } }), { code: 'stale_version' });
  assert.equal(launched, false);
});

test('only the entry and its hashed static assets are served; every other request is aborted', async () => {
  const log = { served: [], blocked: [] };
  const handle = interceptor(ASSETS, log);
  const cases = {
    [`${RENDER_ORIGIN}${RENDER_ENTRY}`]: 'respond:200:text/html',
    [`${RENDER_ORIGIN}/static/render-abc.js`]: 'respond:200:text/javascript',
    [`${RENDER_ORIGIN}/static/KaTeX_Main-Regular-x.woff2`]: 'respond:200:font/woff2',
    [`${RENDER_ORIGIN}/static/missing.js`]: 'abort:failed',
    [`${RENDER_ORIGIN}/api/learn/boards`]: 'abort:blockedbyclient',
    [`${RENDER_ORIGIN}${RENDER_ENTRY}?scene=leak`]: 'abort:blockedbyclient',
    'https://fonts.googleapis.com/css': 'abort:blockedbyclient',
    'http://169.254.169.254/latest/meta-data': 'abort:blockedbyclient',
    [`https://rabbit-hole-cp-dev.tryrabbithole.workers.dev${RENDER_ENTRY}`]: 'abort:blockedbyclient',
  };
  for (const [url, expected] of Object.entries(cases)) {
    const r = fakeRequest(url);
    await handle(r);
    assert.equal(r.outcome, expected, url);
  }
  assert.equal(allowedAsset(new URL(`${RENDER_ORIGIN}/static/../api/x.js`)), false);
});

test('renders each distinct state once, stores PNGs under the job, injects the scene by evaluate and closes the browser', async () => {
  const { state, browser } = fakeBrowser({ pageRequests: [`${RENDER_ORIGIN}/static/render-abc.js`, 'https://cdn.example.com/x.js'] });
  const stored = [];
  const manifest = await manifestFor([entry('light'), entry('again'), entry('dark', { theme: 'dark', inputs: { len: 3 } })]);
  const result = await renderStates({ ASSETS }, { scene }, manifest, { launch: async () => browser, jobId: 'job1', store: async (key, png) => stored.push(key) });
  assert.equal(result.captures.length, 2);
  assert.deepEqual(result.captures[0].aliases, ['again']);
  assert.equal(state.evaluated.length, 2);
  assert.deepEqual(state.evaluated[1].inputs, { len: 3 });
  assert.equal(state.evaluated[1].theme, 'dark');
  assert.deepEqual(state.media, [{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  assert.equal(state.interception, true);
  assert.ok(stored.every(key => key.startsWith('explain/job1/') && key.endsWith('.png')));
  assert.deepEqual(result.requests.blocked, ['https://cdn.example.com/x.js']);
  assert.ok(!result.requests.served.some(path => path.includes('?')));
  assert.equal(state.closed, true);
});

test('outage and timeouts fail with explicit codes and still close the browser', async () => {
  const manifest = await manifestFor([entry('a')]);
  await assert.rejects(renderStates({ ASSETS }, { scene }, manifest), { code: 'render_unavailable' }, 'no BROWSER binding');
  await assert.rejects(renderStates({}, { scene }, manifest, { launch: async () => ({}) }), { code: 'render_unavailable' }, 'no ASSETS');
  await assert.rejects(renderStates({ ASSETS }, { scene }, manifest, { launch: async () => { throw new Error('429 Too Many Requests'); } }), { code: 'render_unavailable', message: /429/ });
  const hung = fakeBrowser({ hang: true });
  await assert.rejects(renderStates({ ASSETS }, { scene }, manifest, { launch: async () => hung.browser, limits: { captureMs: 20 } }), { code: 'capture_timeout' });
  assert.equal(hung.state.closed, true);
  const invalid = fakeBrowser({ renderResult: { ok: false, error: 'Invalid animation at objects.0' } });
  await assert.rejects(renderStates({ ASSETS }, { scene }, manifest, { launch: async () => invalid.browser }), { code: 'scene_invalid' });
  const noFonts = fakeBrowser({ renderResult: { ok: true, fonts: { missing: ['1em KaTeX_Main'] } } });
  await assert.rejects(renderStates({ ASSETS }, { scene }, manifest, { launch: async () => noFonts.browser }), { code: 'fonts_missing' });
});
