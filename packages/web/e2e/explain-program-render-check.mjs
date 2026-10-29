// Generated /explain programs, review-renderer proof (explain sandbox Task 6). The ACTUAL render entry (render/scene.html, the page the
// control plane's Browser Rendering session opens) is driven with window.__renderProgram and an artifact SEALED BY THE SERVER code
// path (control-plane explain-program.js: checkProgramDraft, then buildProgramArtifact with the host's stamps). It must verify and run
// the program in the pinned engine through host.js, draw a non-empty frame with the shared Frame, and answer the hash of the sealed
// bundle; a changed artifact, a module with no export, a throwing program and an endless loop must each fail with their stable code
// without drawing anything, and the page must still render the next valid program. The page makes no request outside this origin, and
// its WASM comes from /static/ with the application/wasm MIME type (what explain-render.js's interceptor serves).
// The programs below are HAND-AUTHORED TEST DATA, not generation evidence. Local stack only, no model call, no secrets.
// The page is served from the BUILT files (dist-dev, or RENDER_DIST) by a tiny static server below, not by the dev worker: the dev worker
// (run_worker_first) answers only its own routes, so it never serves /render/scene.html; the control plane's Browser Rendering session
// likewise gets the entry from the assets binding. The engine runs in a REAL dedicated Worker started from a Blob (page-worker.js).
// Usage: node e2e/explain-program-render-check.mjs   (after a web build; no stack, no BASE)
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { buildProgramArtifact, checkProgramDraft } from '../../control-plane/src/explain-program.js';
import { sealProgram } from '../src/explain-program/contract.js';
import { PROGRAM_STAMPS } from '../src/explain-program/stamps.js';
import { dragFixture, sortFixture } from '../src/explain-program/fixtures.js';

const ROOT = new URL(`../${process.env.RENDER_DIST || 'dist-dev'}/`, import.meta.url);
if (!existsSync(new URL('render/scene.html', ROOT))) throw Error(`no built render entry at ${ROOT.pathname}render/scene.html: build the web app first`);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  const file = new URL('.' + path, ROOT);
  if (!file.pathname.startsWith(ROOT.pathname) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end('not found'); return; }
  response.writeHead(200, { 'content-type': TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
const TOTAL = 36; // bump with the checks below; the printed line is what CI reads
let passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; console.log(`${ok ? 'ok' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`); };

const MANIFEST = {
  title: 'A rate times a time', summary: 'A bar and a line grow with the rate you choose.', assumptions: ['Constant rate.'], description: 'A bar whose length is the rate multiplied by the elapsed time, and a falling line.',
  inputs: [{ type: 'number', id: 'rate', label: 'Rate', unit: '1/s', default: 2, min: 0, max: 10, step: 1 }], duration: 4,
  readouts: [{ id: 'level', label: 'Level', decimals: 2 }], capabilities: ['time_playback', 'number_inputs', 'polyline'],
};
const VALID = `export function evaluate({ inputs, time }) {
  const level = inputs.rate * time;
  const curve = sdk.sample(x => 480 - 4 * inputs.rate * x, 0, 10, 20).map(([x, y]) => [40 + 60 * x, y]);
  const objects = [
    sdk.box('bar', 40, 200, Math.max(1, 40 * level), 60, { role: 'output' }),
    sdk.text('caption', 40, 150, 'Level ' + sdk.format(level, 2)),
    sdk.polyline('curve', curve, { role: 'neutral' }),
  ];
  return { frame: sdk.frame(objects, { width: 960, height: 540, readouts: [{ id: 'level', value: level }] }), quantities: { level } };
}`;
const GLOBAL_ONLY = VALID.replace('export function evaluate', 'function evaluate');
const THROWS = `export function evaluate() { throw new Error('boom'); }`;
const LOOPS = `export function evaluate() { for (;;) {} }`;

// The server's own path: the same checks and the same sealing the accept stage runs.
const seal = async source => {
  const checked = checkProgramDraft({ source, manifest: MANIFEST });
  return checked.bundle ? { artifact: await buildProgramArtifact(checked.bundle), checked } : { checked };
};
const { artifact } = await seal(VALID);
check('the server path seals the valid program', !!artifact && /^[0-9a-f]{64}$/.test(artifact.bundleHash), artifact?.bundleHash?.slice(0, 12));
const refused = checkProgramDraft({ source: GLOBAL_ONLY, manifest: MANIFEST });
check('the server path refuses a global-only evaluate with invalid_program and the export format', !!refused.problems?.some(p => /^invalid_program: the module must export evaluate: export function evaluate\(\{ inputs, time, seed, state \}\)/.test(p)), JSON.stringify(refused.problems));
if (!artifact) { console.log(`${passed}/${TOTAL} checks passed`); process.exit(1); }
const forced = async source => (await sealProgram({ manifest: MANIFEST, source }, PROGRAM_STAMPS)).value; // bypasses the server pre-check

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', error => console.log(`page error: ${error.message}`)); // what CI shows if the entry fails to start
  page.on('console', message => { if (message.type() === 'error') console.log(`page console.error: ${message.text().slice(0, 300)}`); });
  const offOrigin = [], wasm = [], violations = [];
  page.on('request', request => { if (!request.url().startsWith(BASE) && !/^(data|blob):/.test(request.url())) offOrigin.push(request.url()); });
  page.on('response', response => { if (response.url().endsWith('.wasm')) wasm.push({ url: response.url(), type: response.headers()['content-type'], status: response.status() }); });
  await page.addInitScript(() => { window.__cspViolations = []; document.addEventListener('securitypolicyviolation', e => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  await page.goto(`${BASE}/render/scene.html`);
  await page.waitForFunction(() => window.__renderReady === true, null, { timeout: 30000 });
  check('the render entry loads and offers __renderProgram', await page.evaluate(() => typeof window.__renderProgram === 'function'));
  const render = (program, extra = {}) => page.evaluate(request => window.__renderProgram(request), { program, time: 0, inputs: {}, theme: 'light', width: 960, height: 540, ...extra });

  const first = await render(artifact, { inputs: { rate: 2 }, time: 0 });
  check('a server-sealed program renders: ok with the declared frame size', first.ok === true && first.frame.width === 960 && first.frame.height === 540, JSON.stringify(first).slice(0, 300));
  check('the captured hash is the sealed bundle hash', first.bundleHash === artifact.bundleHash);
  check('the page marks the drawn card with the sealed bundle hash', (await page.locator('[data-render-target]').getAttribute('data-program-bundle')) === artifact.bundleHash);
  check('a non-empty frame was drawn (objects, SVG elements, a readout)', first.drawn?.objects === 3 && first.drawn?.elements > 5 && first.drawn?.readouts === 1, JSON.stringify(first.drawn));
  check('the readout text comes from the program\'s own quantity', (await page.locator('[data-program-readouts]').innerText()) === 'Level: 0.00' && first.trace.quantities.level === 0);
  check('the polyline primitive drew a path', await page.locator('[data-animation-frame] svg polyline, [data-animation-frame] svg path').count() > 0);
  check('no font was missing', Array.isArray(first.fonts?.missing) && first.fonts.missing.length === 0, JSON.stringify(first.fonts));
  const shotA = await page.locator('[data-animation-frame]').screenshot();

  const second = await render(artifact, { inputs: { rate: 5 }, time: 4, theme: 'dark' });
  check('another input and time render the same sealed bundle', second.ok === true && second.bundleHash === artifact.bundleHash);
  check('the quantities are the program\'s own calculation (5 x 4 = 20)', second.trace?.quantities?.level === 20 && (await page.locator('[data-program-readouts]').innerText()) === 'Level: 20.00');
  check('the dark theme was applied', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  const shotB = await page.locator('[data-animation-frame]').screenshot();
  check('the two captures are real, different images', shotA.length > 2000 && shotB.length > 2000 && !shotA.equals(shotB), `${shotA.length} vs ${shotB.length} bytes`);
  await render(artifact, { inputs: { rate: 2 }, time: 0 });
  check('re-rendering the first state reproduces the first image', (await page.locator('[data-animation-frame]').screenshot()).equals(shotA));

  const tampered = await render({ ...artifact, source: artifact.source.replace('40 * level', '41 * level') });
  check('a changed artifact is refused before anything runs (invalid_program)', tampered.ok === false && tampered.programError?.code === 'invalid_program', JSON.stringify(tampered));
  const otherEngine = await render({ ...artifact, runtimeVersion: 'quickjs-release-sync@0.33.0' });
  check('an artifact pinned to another engine is version_unavailable', otherEngine.ok === false && otherEngine.programError?.code === 'version_unavailable', JSON.stringify(otherEngine));
  const global = await forced(GLOBAL_ONLY);
  const globalOut = await render(global);
  check('a global-only evaluate that bypassed the server check is invalid_program at the real runtime', globalOut.ok === false && globalOut.programError?.code === 'invalid_program', JSON.stringify(globalOut));
  const threw = await render(await forced(THROWS));
  check('a throwing program is runtime_error with a bounded diagnostic', threw.ok === false && threw.programError?.code === 'runtime_error' && /boom/.test(threw.programError.diagnostic) && threw.programError.diagnostic.length <= 500, JSON.stringify(threw));
  const started = Date.now();
  const looped = await render(await forced(LOOPS));
  check('an endless loop is stopped as runtime_limit within seconds', looped.ok === false && looped.programError?.code === 'runtime_limit' && Date.now() - started < 8000, `${Date.now() - started} ms ${JSON.stringify(looped)}`);
  const after = await render(artifact, { inputs: { rate: 3 }, time: 2 });
  check('the next valid program still renders after the failures', after.ok === true && after.trace.quantities.level === 6);

  check('the page made no request outside this origin', offOrigin.length === 0, offOrigin.join(', '));
  check('the engine WASM was fetched from this origin under /static/', wasm.length > 0 && wasm.every(w => new URL(w.url).origin === BASE && new URL(w.url).pathname.startsWith('/static/')), JSON.stringify(wasm));
  check('the WASM was served as application/wasm with status 200', wasm.length > 0 && wasm.every(w => w.type === 'application/wasm' && w.status === 200), JSON.stringify(wasm));
  check('no CSP violation was recorded', (await page.evaluate(() => window.__cspViolations)).length === 0);
  // The legacy path is untouched: a scene capture still works on the same page.
  const scene = { id: 's', title: 'T', width: 300, height: 200, duration: 1, objects: [{ id: 'b', type: 'box', initialState: { x: 20, y: 20, w: 100, h: 50, label: 'A', opacity: 1 } }], timeline: [], presentation: { mode: 'static' } };
  const legacy = await page.evaluate(request => window.__renderScene(request), { scene, time: 1, inputs: {}, theme: 'light', width: 300, height: 200 });
  check('a scene capture on the same page still works (legacy path unchanged)', legacy.ok === true && legacy.frame.width === 300, JSON.stringify(legacy).slice(0, 200));
  // Task 8.3: a stateful program sealed by the server path (stateful drafts admitted) replays the seed and events the review asked for
  // through the same host, at its declared viewport, and reports the events and the resulting state; an undeclared event fails in reduce.
  const sortDraft = checkProgramDraft({ source: sortFixture.source, manifest: sortFixture.manifest }, { stateful: true });
  const sorted = sortDraft.bundle ? await buildProgramArtifact(sortDraft.bundle) : null;
  const events = [{ type: 'action', action: 'step' }, { type: 'action', action: 'step' }, { type: 'select', target: 'bar-2' }];
  const replay = sorted && await render(sorted, { width: 720, height: 360, seed: 0, events });
  check('a stateful program replays its events in the review page: declared size, the events and the resulting state reported', replay?.ok === true && replay.frame.width === 720 && replay.bundleHash === sorted.bundleHash
    && JSON.stringify(replay.trace.events) === JSON.stringify(events) && /^[0-9a-f]{64}$/.test(replay.trace.stateHash) && replay.trace.state?.swaps === 1 && replay.trace.state?.selected === 2
    && /Bar 3 holds 6/.test(await page.locator('[data-program-frame]').textContent()), JSON.stringify(replay).slice(0, 300));
  const undeclared = sorted && await render(sorted, { width: 720, height: 360, seed: 0, events: [{ type: 'action', action: 'explode' }] });
  check('an undeclared event fails in the reduce phase with its stable code', undeclared?.ok === false && undeclared.programError?.code === 'invalid_program' && undeclared.programError.phase === 'reduce', JSON.stringify(undeclared));
  // Owner review of 0ee34e70c (fix 2): every state of the replay is checked as the card checks it, so a program whose second state
  // cannot be drawn fails review even though its fourth draws.
  const stuckDraft = checkProgramDraft({ manifest: { title: 'Count', summary: 'A count.', assumptions: [], description: 'A count.', inputs: [], readouts: [], capabilities: [], viewport: { width: 400, height: 300 }, actions: [{ id: 'add', label: 'Add' }], targets: [] },
    source: `export function initialState() { return { count: 0 }; }
export function reduce({ state }) { return { count: state.count + 1 }; }
export function evaluate({ state }) { return { frame: { width: 400, height: 300, objects: state.count === 2 ? [{ kind: 'nope', id: 'x' }] : [sdk.text('n', 10, 20, String(state.count))] }, quantities: { count: state.count } }; }` }, { stateful: true });
  const stuckArtifact = stuckDraft.bundle ? await buildProgramArtifact(stuckDraft.bundle) : null;
  const stuck = stuckArtifact && await render(stuckArtifact, { width: 400, height: 300, seed: 0, events: Array(4).fill({ type: 'action', action: 'add' }) });
  check('a sequence the learner could not play through fails review at its first undrawable state', stuck?.ok === false && stuck.programError?.code === 'invalid_output' && /at state 2 of 4/.test(stuck.programError.diagnostic), JSON.stringify(stuck));
  // Task 8.4: the review replays a sampled drag (start, move, end inside the viewport) through the same host, as the card does.
  const dragDraft = checkProgramDraft({ source: dragFixture.source, manifest: dragFixture.manifest }, { stateful: true });
  const dragged = dragDraft.bundle ? await buildProgramArtifact(dragDraft.bundle) : null;
  const dragEvents = [{ type: 'drag_start', target: 'handle', x: 360, y: 180 }, { type: 'drag_move', target: 'handle', x: 540, y: 180 }, { type: 'drag_end', target: 'handle', x: 540, y: 180 }];
  const dragReplay = dragged && await render(dragged, { width: 720, height: 360, seed: 0, events: dragEvents });
  check('a sampled drag replays in the review page and draws its resulting state', dragReplay?.ok === true && dragReplay.trace.state?.x === 540 && dragReplay.trace.state?.drops === 1 && /Handle at 540, placed 1 times/.test(await page.locator('[data-program-frame]').textContent()), JSON.stringify(dragReplay).slice(0, 300));
  check('the program renderer left no Worker or request behind', offOrigin.length === 0 && (await page.evaluate(() => performance.getEntriesByType('resource').every(e => e.name.startsWith(location.origin)))));
  check('every program failure returned a stable code, never a stack', [tampered, otherEngine, globalOut, threw, looped].every(r => r.programError && /^[a-z_]+$/.test(r.programError.code) && !/\n\s+at /.test(r.programError.diagnostic ?? '')));
  check('the sealed artifact the check used passes the contract\'s own hash verification', (await import('../src/explain-program/contract.js').then(m => m.verifyHashes(artifact))) === true);
} finally {
  await browser.close();
}

// ---- A page thread the engine's interrupt cannot reach (explain-render.js capture timeout and session close) ----------------------------------
// The guest is interrupted inside the engine, but anything that blocks the PAGE thread outside it (here a spin in the page itself) stops the
// page answering. The control plane then times the capture out (unit-tested through renderStates and the job in explain-m3.test.js) and
// closes the SESSION, not just the page. This case proves the browser half on Chromium: a spinning page stops answering, closing the
// browser ends it, and a fresh session renders the next valid program. The Cloudflare Browser Rendering fork itself is only provable in a
// real Browser Rendering run (Task 7 dev clone).
{
  const blocked = await chromium.launch();
  let closedInTime = false, closeMs = -1;
  try {
    const trapped = await blocked.newPage();
    await trapped.goto(BASE + '/render/scene.html');
    await trapped.waitForFunction(() => window.__renderReady === true, null, { timeout: 30000 });
    trapped.evaluate(() => { const end = performance.now() + 120000; while (performance.now() < end) { /* the page thread is busy */ } }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 300));
    const answered = await Promise.race([trapped.evaluate(() => 1).then(() => true, () => true), new Promise(resolve => setTimeout(() => resolve(false), 1500))]);
    check('a spinning page thread stops answering (what the engine interrupt cannot reach)', answered === false);
    const t0 = Date.now();
    closedInTime = await Promise.race([blocked.close().then(() => true, () => true), new Promise(resolve => setTimeout(() => resolve(false), 30000))]);
    closeMs = Date.now() - t0;
  } finally { await blocked.close().catch(() => {}); }
  check('closing the browser session ends the blocked page within 30 s', closedInTime === true, closeMs + ' ms');
  const fresh = await chromium.launch();
  try {
    const page = await fresh.newPage();
    await page.goto(BASE + '/render/scene.html');
    await page.waitForFunction(() => window.__renderReady === true, null, { timeout: 30000 });
    const next = await page.evaluate(request => window.__renderProgram(request), { program: artifact, time: 2, inputs: { rate: 2 }, theme: 'light', width: 960, height: 540 });
    check('a fresh session renders the next valid sealed program after the blocked one', next.ok === true && next.bundleHash === artifact.bundleHash && next.trace.quantities.level === 4, JSON.stringify(next).slice(0, 200));
  } finally { await fresh.close(); }
}
server.close();
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL ? 0 : 1);
