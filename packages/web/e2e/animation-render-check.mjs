// The /animation review page, end to end in CI's browser (standing owner rule 2, C10; FX-AN-106). The ACTUAL review entry (render/animation3d.html, built from
// render/animation3d-render.js: the page the control plane's Browser Rendering session opens for every review capture) is driven with window.__renderAnimation3d for four
// artifacts: the golden SGD artifact (an offline fixture) and three saved VALID drafts of the Gate 1 regression plans (a grid game, a pendulum, a projectile game; inline
// test data in src/animation3d/testdata/render-fixtures/, sealed by the server's own sealArtifact), at exactly the captures the review stage samples (control-plane
// animation-render.js captureManifest: 2 views x 3 states, 6 per artifact). No model call, no stack, no secrets: the page is served from the BUILT files (dist-dev, or
// RENDER_DIST) by a tiny static server, as explain-program-render-check.mjs does.
// For each capture it asserts:
//   (a) the readout strip the page draws over the scene ([data-animation-strip]) is the hand-written one in testdata/render-fixtures.mjs (the golden's reads
//       "Status: paused  ·  Loss (true value): 1.415  ·  Steps taken: 0"): text readouts present as words, numbers in the card's format, a game's goal last. This is the check that
//       would have caught FX-AN-098 (a strip that kept only finite numbers dropped the Status word from every reviewed picture);
//   (b) the trace the page answers equals the one the same program gives in Node on the same engine (readouts, time, events, ticks, goal), the artifact hash is echoed, and
//       there is no `buried` and no `clamped` entry: nothing sits below its surface, nothing needed holding;
//   (c) 6 captures per artifact, each drawn (a share of the picture differs from the background) with no unlit black: a tube with no vertex normals renders (0, 0, 0), which
//       is what FX-AN-092 was (the same guard as animation-primitives-check.mjs).
// Plus: no page error, no console error, nothing requested outside this origin.
// The same four artifacts' pixel-free half (seal, validate, 6 captures, trace and strip text, and a source guard on the page) runs in verify: src/animation3d/render-fixtures.test.mjs.
// Calibration: the pixel thresholds below (black at most 30 px, drawn at least 0.3% of the picture) are generous guesses (a black tube is hundreds of pixels; a drawn scene tens of
// thousands) and have NOT been calibrated against a CI render: each capture prints its measured numbers so the first CI log can tighten them.
// Usage: node e2e/animation-render-check.mjs [shotsDir]   (after a web build: dist-dev, or RENDER_DIST; no stack, no BASE)
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { captureManifest } from '../../control-plane/src/animation-render.js';
import { runReviewProgram } from '../src/animation3d/review.js';
import { canonicalJson, sha256Hex } from '../src/explain-program/contract.js';
import { loadEngine, runProgram } from '../src/explain-program/runtime.js';
import { validateAnimationArtifact } from '../src/animation3d/contract.js';
import { renderFixtures } from '../src/animation3d/testdata/render-fixtures.mjs';

const ROOT = new URL(`../${process.env.RENDER_DIST || 'dist-dev'}/`, import.meta.url);
if (!existsSync(new URL('render/animation3d.html', ROOT))) throw Error(`no built review entry at ${ROOT.pathname}render/animation3d.html: build the web app first`);
const SHOTS = process.argv[2] || 'animation-render-shots';
mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  const file = new URL('.' + path, ROOT);
  if (!file.pathname.startsWith(ROOT.pathname) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end('not found'); return; }
  response.writeHead(200, { 'content-type': TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
const TOTAL = 5; // four artifacts and the page's own hygiene; the printed line is what CI reads
let passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; console.log(`${ok ? 'ok' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`); };

// The same engine in Node gives the trace each capture must answer (the page runs the program in its own Worker).
const engine = await loadEngine();
const workerFactory = () => {
  const worker = { terminated: false, terminate() { worker.terminated = true; }, postMessage: message => queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...runProgram(engine, message) } }); }) };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
const fixtures = await renderFixtures();
for (const { name, artifact } of fixtures) assert.equal(validateAnimationArtifact(artifact).ok, true, `${name} is a valid artifact`);

const browser = await chromium.launch();
const errors = [], consoleErrors = [], offOrigin = [];
try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => { errors.push(error.message); console.log(`page error: ${error.message}`); });
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) { consoleErrors.push(message.text().slice(0, 300)); console.log(`page console.error: ${message.text().slice(0, 300)}`); } });
  page.on('request', request => { if (!request.url().startsWith(BASE) && !/^(data|blob):/.test(request.url())) offOrigin.push(request.url()); });
  const scratch = await context.newPage(); // a blank page that decodes screenshots; it never loads the entry
  await page.goto(`${BASE}/render/animation3d.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__animationRenderReady === true, null, { timeout: 60000 });
  // What a capture looks like by colour: the share of pixels that differ from the corner (the background), and the unlit black.
  const pixels = png => scratch.evaluate(async b64 => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
    const g = canvas.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
    let black = 0, covered = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 12 && data[i + 1] < 12 && data[i + 2] < 12) black += 1;
      if (Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]) > 36) covered += 1;
    }
    return { black, covered: covered / (data.length / 4) };
  }, Buffer.from(png).toString('base64'));

  for (const { name, artifact, strips } of fixtures) {
    let detail = '';
    try {
      const { entries } = captureManifest(artifact), hash = await sha256Hex(canonicalJson(artifact));
      assert.equal(entries.length, 6, `${name}: the review samples 6 captures (2 views x 3 states), the manifest has ${entries.length}`);
      const measured = [];
      for (const entry of entries) {
        const request = { artifact, artifactHash: hash, view: entry.view, inputs: entry.inputs, time: entry.time, events: entry.events, leadTicks: entry.leadTicks ?? 0, ticks: entry.ticks, seed: entry.seed, theme: entry.theme, width: entry.width, height: entry.height };
        const expected = await runReviewProgram(request, { workerFactory });
        assert.equal(expected.ok, true, `${name} ${entry.id}: the program runs in Node: ${JSON.stringify(expected).slice(0, 200)}`);
        await page.setViewportSize({ width: entry.width, height: entry.height });
        const done = await page.evaluate(r => window.__renderAnimation3d(r), request);
        assert.equal(done?.ok, true, `${name} ${entry.id}: the page answered ${JSON.stringify(done)?.slice(0, 300)}`);
        assert.equal(done.artifactHash, hash, `${name} ${entry.id}: the page echoes the artifact's hash`);
        assert.deepEqual(done.trace, expected.trace, `${name} ${entry.id}: the page's trace is the program's`);
        assert.deepEqual(['buried' in done.trace, 'clamped' in done.trace], [false, false], `${name} ${entry.id}: nothing buried or clamped`);
        const strip = await page.locator('[data-animation-strip]').textContent();
        assert.equal(strip, strips[Number(entry.id.slice(-1))], `${name} ${entry.id}: the readout strip over the picture`);
        const png = await page.locator('[data-animation3d-frame]').screenshot({ type: 'png' });
        writeFileSync(`${SHOTS}/${name}-${entry.id}.png`, png);
        const { black, covered } = await pixels(png);
        measured.push(`${entry.id} black ${black} drawn ${(covered * 100).toFixed(1)}%`);
        assert.ok(black <= 30, `${name} ${entry.id}: ${black} unlit black pixels (a mesh with no normals renders (0, 0, 0))`);
        assert.ok(covered >= 0.003, `${name} ${entry.id}: only ${(covered * 100).toFixed(2)}% of the picture is drawn`);
      }
      detail = `measured ${measured.join('; ')}`;
      check(`${name}: 6 captures through the review page, each with its hand-written readout strip, the program's trace, nothing buried, no unlit black`, true, detail);
    } catch (error) {
      check(`${name}: 6 captures through the review page, each with its hand-written readout strip, the program's trace, nothing buried, no unlit black`, false, String(error.message).slice(0, 600));
    }
  }
  check('no page error, no console error, nothing requested outside this origin', errors.length === 0 && consoleErrors.length === 0 && offOrigin.length === 0, JSON.stringify({ errors, consoleErrors, offOrigin }).slice(0, 400));
} finally {
  await browser.close();
  engine.dispose?.();
  server.close();
}
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL ? 0 : 1);
