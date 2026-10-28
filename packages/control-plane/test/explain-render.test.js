// EXP-T18 render step: manifest bounds/dedup/staleness and the inert interception, with a fake browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStage } from '../src/explain-job.js';
import { RENDER_ENTRY, RENDER_LIMITS, RENDER_ORIGIN, allowedAsset, checkManifest, compiledHash, interceptor, programCaptureManifest, renderStates, reserveCaptures, reserveRound } from '../src/explain-render.js';
import { buildProgramArtifact } from '../src/explain-program.js';

const scene = { id: 's', width: 400, height: 300, duration: 2, objects: [], timeline: [] };
const entry = (id, extra = {}) => ({ id, time: 1, inputs: {}, theme: 'light', width: 400, height: 300, dpr: 1, ...extra });
const manifestFor = async (entries, reserved = reserveCaptures({ states: 4, themes: 2, width: 400, height: 300, dpr: 1 })) => ({ version: 1, compiledHash: await compiledHash(scene), reserved, entries });

// Assets that exist in the "build": the entry and two hashed static files.
const ASSETS = { fetch: async request => {
  const path = new URL(request.url).pathname;
  const files = { [RENDER_ENTRY]: ['<html></html>', 'text/html'], '/static/render-abc.js': ['//js', 'text/javascript'], '/static/KaTeX_Main-Regular-x.woff2': ['font', 'font/woff2'], '/static/emscripten-module-abc.wasm': ['wasm', 'application/octet-stream'] };
  return files[path] ? new Response(files[path][0], { headers: { 'content-type': files[path][1] } }) : new Response('nope', { status: 404 });
} };

function fakeRequest(url) {
  const r = { url: () => url, outcome: null };
  r.abort = reason => { r.outcome = `abort:${reason}`; };
  r.continue = () => { r.outcome = 'continue'; };
  r.respond = response => { r.outcome = `respond:${response.status}:${response.headers['content-type']}`; };
  return r;
}

// A puppeteer-shaped browser whose page fires the given page requests through the interceptor on goto.
function fakeBrowser({ pageRequests = [], renderResult = { ok: true, fonts: { missing: [] } }, hang = false, hangClose = false } = {}) {
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
    close: async () => { state.pageClosed = (state.pageClosed || 0) + 1; if (hangClose) return new Promise(() => {}); },
    evaluate: async (fn, request) => { state.evaluated.push(request); state.entries = [...(state.entries || []), String(fn).includes('__renderProgram') ? 'program' : 'scene']; if (hang) return new Promise(() => {}); return typeof renderResult === 'function' ? renderResult(request) : renderResult; },
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
    [`${RENDER_ORIGIN}/static/emscripten-module-abc.wasm`]: 'respond:200:application/wasm', // the engine's WASM is served with its own MIME type
    [`${RENDER_ORIGIN}/static/missing.js`]: 'abort:failed',
    [`${RENDER_ORIGIN}/static/emscripten-module-abc.wasm?x=1`]: 'abort:blockedbyclient',
    [`${RENDER_ORIGIN}/uploads/engine.wasm`]: 'abort:blockedbyclient',
    [`${RENDER_ORIGIN}/api/learn/boards`]: 'abort:blockedbyclient',
    [`${RENDER_ORIGIN}${RENDER_ENTRY}?scene=leak`]: 'abort:blockedbyclient',
    [`blob:${RENDER_ORIGIN}/0f8a3c2e-1b7d-4e55-9a10-6c2d4f8e9b11`]: 'continue', // the page's own Worker script, built from a Blob
    'blob:https://elsewhere.example/0f8a3c2e-1b7d-4e55-9a10-6c2d4f8e9b11': 'abort:blockedbyclient',
    'data:text/javascript,alert(1)': 'abort:blockedbyclient',
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

// The ExplainJobs render stage (explain-job.js) on this module, as the production pipeline runs it; only the browser is injected.
test('the job render stage renders through renderStates: inert interception, light and dark, PNGs stored under the job', async () => {
  const { state, browser } = fakeBrowser({ pageRequests: ['https://render.invalid/static/render-abc.js', 'https://example.com/x.js', 'https://render.invalid/api/learn/boards'] });
  const stored = [];
  const out = await renderStage({ launch: async () => browser, store: async key => stored.push(key) })({ id: 'job1', compiled: { scene } }, { env: { ASSETS } });
  assert.deepEqual(out.captures.map(c => c.id), ['light', 'dark']);
  assert.equal('coverage' in out, false, 'a scene job has no program coverage');
  assert.ok(out.captures.every(c => c.key?.startsWith('explain/job1/') && c.mediaType === 'image/png' && !('png' in c)));
  assert.deepEqual(stored, out.captures.map(c => c.key));
  assert.equal(state.interception, true);
  assert.deepEqual(state.intercepted.map(r => r.outcome), ['respond:200:text/html', 'respond:200:text/javascript', 'abort:blockedbyclient', 'abort:blockedbyclient']);
  assert.equal(state.closed, true);
});

test('the job render stage: no BROWSER binding is "not available"; a bound BROWSER is launched, and a launch failure asks for Retry', async () => {
  const job = { id: 'job2', compiled: { scene } };
  await assert.rejects(renderStage()(job, { env: { ASSETS } }), { code: 'render_unavailable', category: 'renderer', message: 'Rendering explanations is not available here yet.' });
  await assert.rejects(renderStage({ launch: async env => { throw new Error(`no session for ${typeof env.BROWSER}`); } })(job, { env: { ASSETS, BROWSER: {} } }), { category: 'renderer', message: 'The explanation could not be rendered (render_unavailable). Retry rendering.' });
});

test('a launched render browser idles at most 10 s for reuse (billed browser time)', () => assert.ok(RENDER_LIMITS.keepAliveMs <= 10_000));

test('a program is captured through __renderProgram from its artifact: the manifest names the artifact hash, traces are kept, a failing run is a program error', async () => {
  const artifact = await buildProgramArtifact({ source: 'export function evaluate() { return { frame: { objects: [] }, quantities: {} }; }',
    manifest: { title: 'T', summary: 'S', assumptions: [], description: 'D', inputs: [], duration: 4, readouts: [], capabilities: ['time_playback'] } });
  const manifest = await programCaptureManifest(artifact, { reserved: reserveCaptures({ states: 1, checkpoints: 3, themes: 1 }) });
  assert.equal(manifest.compiledHash, await compiledHash(artifact));
  assert.deepEqual(manifest.entries.map(e => [e.id, e.time]), [['t0-light', 0], ['t1-light', 2], ['t2-light', 4]]);
  const { state, browser } = fakeBrowser({ renderResult: request => ({ ok: true, fonts: { missing: [] }, trace: { inputs: request.inputs, time: request.time, quantities: { q: request.time }, metrics: { ms: 1 } } }) });
  const result = await renderStates({ ASSETS }, { program: artifact }, manifest, { launch: async () => browser });
  assert.deepEqual(state.entries, ['program', 'program', 'program']);
  assert.deepEqual(state.evaluated.map(r => r.program.bundleHash), Array(3).fill(artifact.bundleHash));
  assert.deepEqual(result.captures.map(c => c.trace.quantities.q), [0, 2, 4]);
  assert.equal(result.compiledHash, await compiledHash(artifact));
  // A manifest built for another artifact is stale; a program that ran and failed is a program error with its stable code.
  await assert.rejects(renderStates({ ASSETS }, { program: { ...artifact, source: artifact.source + ' ' } }, manifest, { launch: async () => browser }), { code: 'stale_version' });
  const failing = fakeBrowser({ renderResult: { ok: false, programError: { code: 'runtime_error', diagnostic: 'ReferenceError: x' } } });
  await assert.rejects(renderStates({ ASSETS }, { program: artifact }, manifest, { launch: async () => failing.browser }), error => error.code === 'program_error' && error.program.code === 'runtime_error');
});

test('a blocked capture times out through the real capture path, closes the page and the session even when the page will not close, leaves no timer, and the next program captures', async () => {
  const artifact = await buildProgramArtifact({ source: 'export function evaluate() { return { frame: { objects: [] }, quantities: {} }; }',
    manifest: { title: 'T', summary: 'S', assumptions: [], description: 'D', inputs: [], duration: 4, readouts: [], capabilities: ['time_playback'] } });
  const manifest = await programCaptureManifest(artifact, { reserved: reserveCaptures({ states: 1, checkpoints: 3, themes: 1 }) });
  const timers = () => process.getActiveResourcesInfo().filter(kind => kind === 'Timeout').length;
  const before = timers();
  const stuck = fakeBrowser({ hang: true, hangClose: true }); // evaluate never answers (a blocked page thread) and page.close never answers either
  stuck.browser.closeCalls = 0;
  const original = stuck.browser.close;
  stuck.browser.close = async () => { stuck.browser.closeCalls++; return original(); };
  const started = Date.now();
  await assert.rejects(renderStates({ ASSETS }, { program: artifact }, manifest, { launch: async () => stuck.browser, limits: { captureMs: 30, closeMs: 30, totalMs: 5000 } }), { code: 'capture_timeout' });
  assert.ok(Date.now() - started < 1000, 'the job was not held by the hung page');
  assert.equal(stuck.state.evaluated.length, 1, 'no further capture was attempted on the blocked page');
  assert.equal(stuck.state.pageClosed, 1, 'the page was asked to close');
  assert.equal(stuck.browser.closeCalls, 1, 'the session was closed even though the page never answered its close');
  assert.equal(stuck.state.closed, true);
  assert.equal(timers(), before, 'no timer or interval is left running');
  // The next capture (the repaired program) gets a fresh session and succeeds.
  const fresh = fakeBrowser({ renderResult: { ok: true, fonts: { missing: [] } } });
  const result = await renderStates({ ASSETS }, { program: artifact }, manifest, { launch: async () => fresh.browser, limits: { captureMs: 30, closeMs: 30 } });
  assert.equal(result.captures.length, 3);
  assert.equal(fresh.state.closed, true);
  assert.equal(timers(), before);
});

// Task 6 review coverage: the program capture manifest samples the defaults first, then boundary input states within the budget.
const SOURCE = 'export function evaluate() { return { frame: { objects: [] }, quantities: {} }; }';
const num = (id, min, max, def) => ({ type: 'number', id, label: id, min, max, default: def });
const pick = (id, values, def) => ({ type: 'select', id, label: id, default: def, options: values.map(value => ({ value, label: value })) });
const programWith = (inputs, duration = 4) => buildProgramArtifact({ source: SOURCE,
  manifest: { title: 'T', summary: 'S', assumptions: [], description: 'D', inputs, ...(duration ? { duration } : {}), readouts: [], capabilities: ['time_playback', 'number_inputs', 'select_inputs'] } });
const SIX = reserveRound({ cap: 6 });

test('a program with no inputs keeps the default moments only and states nothing omitted', async () => {
  const artifact = await programWith([]);
  const manifest = await programCaptureManifest(artifact, { reserved: SIX });
  assert.deepEqual(manifest.entries.map(e => [e.id, e.time]), [['t0-light', 0], ['t1-light', 2], ['t2-light', 4]]);
  assert.deepEqual(manifest.coverage, { states: 1, moments: 3, frames: 3, themes: ['light'], sampled: [
    { id: 't0-light', label: 'default', inputs: {}, time: 0 }, { id: 't1-light', label: 'default', inputs: {}, time: 2 }, { id: 't2-light', label: 'default', inputs: {}, time: 4 }], omitted: [] });
});

test('one numeric input: the default moments, then its min and max at the middle moment, within six', async () => {
  const artifact = await programWith([num('speed', 1, 9, 4)]);
  const manifest = await programCaptureManifest(artifact, { reserved: SIX });
  assert.deepEqual(manifest.entries.map(e => [e.id, e.time, e.inputs.speed]), [['t0-light', 0, 4], ['t1-light', 2, 4], ['t2-light', 4, 4], ['a0-light', 2, 1], ['a1-light', 2, 9]]);
  assert.deepEqual(manifest.coverage.sampled.slice(3), [{ id: 'a0-light', label: 'min of speed', inputs: { speed: 1 }, time: 2 }, { id: 'a1-light', label: 'max of speed', inputs: { speed: 9 }, time: 2 }]);
  assert.deepEqual([manifest.coverage.states, manifest.coverage.frames, manifest.coverage.omitted], [3, 5, []]);
});

test('mixed inputs: boundaries in declared order, one combined state last, the six-capture budget is never exceeded and the rest is listed as omitted', async () => {
  const artifact = await programWith([num('mass', 1, 5, 2), pick('mode', ['a', 'b', 'c'], 'b'), num('g', 0, 10, 3)]);
  const manifest = await programCaptureManifest(artifact, { reserved: SIX });
  assert.equal(manifest.entries.length, 6);
  assert.deepEqual(manifest.coverage.sampled.slice(3).map(s => s.label), ['min of mass', 'max of mass', 'first of mode']);
  assert.deepEqual(manifest.coverage.omitted, ['last of mode', 'min of g', 'max of g', 'combined: every input at its max/last']);
  // With room for everything, the combined state is the last sample and the changed keys are the only ones listed.
  const roomy = await programCaptureManifest(artifact, { reserved: reserveRound({ cap: 12 }) });
  assert.equal(roomy.entries.length, 3 + 7);
  assert.deepEqual(roomy.coverage.sampled.at(-1), { id: 'a6-light', label: 'combined: every input at its max/last', inputs: { mass: 5, mode: 'c', g: 10 }, time: 2 });
  assert.deepEqual(roomy.coverage.omitted, []);
  assert.deepEqual(roomy.entries.at(-1).inputs, { mass: 5, mode: 'c', g: 10 });
});

test('a state equal to another (a default already at a boundary) is captured once', async () => {
  const artifact = await programWith([num('x', 0, 1, 0), pick('mode', ['a', 'b'], 'b')], 0);
  const manifest = await programCaptureManifest(artifact, { reserved: SIX });
  // No duration: the start only. x=0 is its min and mode 'b' its last, both the default, so only x max and mode first remain; both combined
  // states (x max + mode b, x min + mode a) repeat one of those and are dropped.
  assert.deepEqual(manifest.coverage.sampled.map(s => s.label), ['default', 'max of x', 'first of mode']);
  assert.deepEqual(manifest.entries.map(e => e.id), ['light', 'a0-light', 'a1-light']);
  const states = manifest.entries.map(e => JSON.stringify(e.inputs));
  assert.equal(new Set(states).size, states.length);
  assert.equal((await checkManifest(manifest, artifact)).entries.length, 3);
});

test('a reservation too small for alternatives falls back to the default moments without throwing, and too small for the moments is over_budget', async () => {
  const artifact = await programWith([num('speed', 1, 9, 4)]);
  const exact = await programCaptureManifest(artifact, { reserved: reserveRound({ cap: 3 }) });
  assert.deepEqual(exact.entries.map(e => e.id), ['t0-light', 't1-light', 't2-light']);
  assert.deepEqual(exact.coverage.omitted, ['min of speed', 'max of speed']);
  const four = await programCaptureManifest(artifact, { reserved: reserveRound({ cap: 4 }) });
  assert.deepEqual([four.entries.length, four.coverage.omitted], [4, ['max of speed']]);
  await assert.rejects(programCaptureManifest(artifact, { reserved: reserveRound({ cap: 2 }) }), { code: 'over_budget' });
});

test('both themes still apply to the default moments only when they fit twice; alternatives use whatever room is left, light first', async () => {
  const artifact = await programWith([num('speed', 1, 9, 4)]);
  const manifest = await programCaptureManifest(artifact, { reserved: SIX, themes: ['light', 'dark'] });
  assert.deepEqual(manifest.entries.map(e => e.id), ['t0-light', 't0-dark', 't1-light', 't1-dark', 't2-light', 't2-dark']);
  assert.deepEqual(manifest.coverage.omitted, ['min of speed', 'max of speed']);
  const tight = await programCaptureManifest(artifact, { reserved: reserveRound({ cap: 5 }), themes: ['light', 'dark'] });
  assert.deepEqual([tight.coverage.themes, tight.entries.length], [['light'], 5]);
});

test('checkManifest accepts a generated program manifest and refuses it for another compiled version or a smaller reservation', async () => {
  const artifact = await programWith([num('speed', 1, 9, 4), pick('mode', ['a', 'b'], 'a')]);
  const manifest = await programCaptureManifest(artifact, { reserved: SIX });
  const checked = await checkManifest(manifest, artifact);
  assert.equal(checked.entries.length, manifest.entries.length);
  assert.ok(checked.entries.length <= SIX.captures);
  assert.equal(checked.compiledHash, await compiledHash(artifact));
  await assert.rejects(checkManifest(manifest, { ...artifact, source: artifact.source + ' ' }), { code: 'stale_version' });
  await assert.rejects(checkManifest({ ...manifest, reserved: reserveRound({ cap: 3 }) }, artifact), { code: 'over_budget' });
});

test('the job render stage returns the program coverage bound to its artifact hash, with what the budget cut', async () => {
  const artifact = await programWith([num('speed', 1, 9, 4), pick('mode', ['a', 'b'], 'a')]);
  const { browser } = fakeBrowser();
  const out = await renderStage({ launch: async () => browser, store: async () => {} })({ id: 'job3', artifact }, { env: { ASSETS } });
  assert.equal(out.captures.length, 6);
  assert.equal(out.coverage.compiledHash, await compiledHash(artifact));
  assert.deepEqual(out.coverage.sampled.map(s => s.label), ['default', 'default', 'default', 'min of speed', 'max of speed', 'last of mode']);
  assert.deepEqual(out.coverage.omitted, ['combined: every input at its max/last']);
  assert.equal(out.coverage.sampled.length, out.captures.length);
});
