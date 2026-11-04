// The five /animation primitives in the real app (AN-19, MVP3; owner decisions 11 to 13 of 3 Nov 2026), against the LOCAL stack only: local D1, a
// fresh browser profile, no model call. A canvas is seeded with ONE card naming the golden SGD artifact as a built-in example (block.fixtureId
// 'sgd-golden', which Animation3DCard.jsx sceneLoader resolves (goldenFixture, from docs/features/animation/golden-fixture-card.patch); test data, not generation evidence), the way animation-mvp-check
// seeds its fixtures. Expected numbers are hand-written below from the bowl's own formula, never read from the program.
// Covers: the card loads labelled as an example and draws; the surface draws (a share of the view differs from the background); the status
// readout shows a WORD (paused, then running, then converged), not a code; Step once five times makes a six-point path whose true loss equals the
// closed form; a finished run's path draws (orange pixels); New run keeps the old path as the ghost (21 ghost points, one trail point, and the pixels
// differ from the same scene with the ghost cleared by Reset); at learning rate 1.5 the run diverges, the Loss readout keeps its true value
// (far above the bowl) while the clamped ball stays inside the frame and the bowl keeps its share of the view; an older client's result request (no flags, or only the two it had) gets 409 client_update_required from
// the same gate the server uses (control-plane animation-job.js needsFeatures, clientFeatures), and the current client declares all seven flags;
// no model request, no other origin, no page or console error.
// Calibration: the card's viewport is 725 x 240 once More settings is open (CI run 41762152651), 725 x 314 before it. sgd-golden.test.mjs projects the golden through
// the real scene builder, clamp and fit in Node for that view and ray-casts every path point and the ball against the surface (a path behind the bowl's own near wall is
// drawn and invisible: that, with a tube that had no normals and rendered black, is what failed steps 4 and 6). Expected at 725 x 240: the bowl 22% of the view at rate
// 0.1 and 15% at 1.5, the finished path 41 px long and 5.8 px thick (about 250 px2), the ball 8 to 10 px across, the kept path half as thick. Each threshold is about
// half of that. Each pixel step prints its measured numbers ("measured ...") so a CI log can recalibrate it. The numbers from a local software-GL run under the owner's
// decision 25 (calibration only, the golden fixture only, ended when C4's CI is green) are INPUTS to these thresholds, NOT evidence; the CI run on the candidate is
// the only acceptance record.
// Not covered here: the real result route (ANIMATION_ENABLED is off in the CI stack; control-plane/test/animation-golden-sgd.test.js runs it), the
// look of the scene (a person judges it), and a person's eyes on the clamped ball (the pixel probes find a red blob inside the frame, no more).
// Hooks: the card's data-animation-* attributes (Animation3DCard.jsx, animation3d/Controls.jsx).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/animation-primitives-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateAnimationArtifact } from '../src/animation3d/contract.js';
import { ANIMATION_CLIENT_FEATURES } from '../src/animation3d/capabilities.js';
import { animationClient } from '../src/animation3d/client.js';
import { CLIENT_UPDATE, needsFeatures } from '../../control-plane/src/animation-job.js';
import { clientFeatures } from '../../control-plane/src/animation-brief.js';

const NOTEBOOK_ORIGIN = 'https://small-learn-canvas-notebook-dev.tryrabbithole.workers.dev'; // the app page's own notebook frame (animation-mvp-check allows it the same way)
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('animation-primitives-check runs against the local stack only');
const SHOTS = process.argv[2] || 'animation-primitives-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 9; // bump with the steps below; the printed line is what CI reads
const GOLDEN = JSON.parse(readFileSync(new URL('../src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8')).artifact;
const FIXTURE_ID = 'sgd-golden'; // Animation3DCard.jsx goldenFixture: the one name that loads testdata/sgd-golden.json
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `prim-${run}@example.com`, secret, handle: `prim_${run}` }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  return response.json().catch(() => null);
};
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Animation primitives ${run}` }) });
const keyOf = name => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}:ink`;
const SEED = [keyOf(canvas.name), { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [],
  blocks: [{ id: 'a-sgd', type: 'animation3d', dx: 0, dy: 0, title: GOLDEN.title, fixtureId: FIXTURE_ID, w: 760 }] }];

// No generation or model route may be called by watching, playing or the controls. A non-GET is aborted and counted.
const MODEL = /^\/api\/(ask$|learn\/(ask|selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], offOrigin = [], errors = [], consoleErrors = [], results = [];
let current = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) {
    results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`);
    await current?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {});
  }
};
// A card whose scene stopped (runtime failure) shows [data-animation-failure] and disables its controls: every wait and press names that cause at once, instead of timing out 15 s on a disabled control (C9, fast-e2e 41779710894).
const stopped = async () => { if (!await card.locator('[data-animation-failure]').count()) return ''; const text = await card.locator('[data-animation-failure]').first().innerText({ timeout: 500 }).catch(() => 'a failure'); return text ? `the card stopped: "${text.replace(/\s+/g, ' ').trim()}" (runtime notes: ${runtimeNotes.slice(-3).join(' | ') || 'none'})` : ''; };
const alive = async () => { const why = await stopped(); if (why) throw Error(why); };
const until = async (fn, label, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await alive(); await new Promise(r => setTimeout(r, 100)); } await alive(); throw Error(label); };
const press = async id => { await alive(); await action(id).click(); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'light' });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([[key, value], mode]) => { try { localStorage.setItem('small.theme', mode); if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); } catch { /* the defaults then */ } }, [SEED, 'light']);
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && !url.href.startsWith(`${NOTEBOOK_ORIGIN}/`) && !['data:', 'blob:'].includes(url.protocol)) { offOrigin.push(url.href); return route.abort(); }
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { stray.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  return route.fallback();
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
current = page;
page.on('pageerror', error => errors.push(error.message));
const runtimeNotes = []; // session.js logRuntime: console.warn "animation runtime: <code> / <diagnostic> / <phase>", the only place the code of a stopped scene is readable
page.on('console', message => { if (/animation runtime/.test(message.text())) runtimeNotes.push(message.text().slice(0, 240)); });
page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) consoleErrors.push(message.text().slice(0, 300)); });
const scratch = await context.newPage(); // a blank page that decodes screenshots; it never loads the app

const card = page.locator('[data-block-id="a-sgd"] [data-animation3d-card]');
const host = card.locator('[data-animation-host]'), viewport = card.locator('[data-animation-viewport]');
const readout = id => card.locator(`[data-animation-readout="${id}"]`), action = id => card.locator(`[data-animation-action="${id}"]`);
const frame = async () => JSON.parse(await viewport.getAttribute('data-animation-frame'));
const word = async () => ((await readout('status').textContent()) || '').trim().toLowerCase();
const more = () => card.locator('details[data-animation-more]:not([open]) > summary').evaluateAll(nodes => nodes.forEach(node => node.click()));
const shot = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const setRate = async value => { await alive(); await card.locator('input[data-animation-number="learningRate"]').fill(String(value)); await card.locator('input[data-animation-number="learningRate"]').press('Enter'); await page.waitForTimeout(3500); }; // the camera refits once the controls settle (REFIT_MS 300 ms, then the sampler's budget of up to 2 s)

// What the scene looks like, by colour, in the host's screenshot (the primary readout laid over it is masked). The corner pixel is the background.
// covered: the share of pixels that differ from it. orange / blue / red: saturated pixels by hue (the path, the kept path, the ball); box: the red blob's bounds.
// Thresholds below are generous and were set from the golden's own colours, not yet calibrated against a CI render.
const look = async () => {
  const png = await host.screenshot({ mask: [card.locator('[data-animation-primary-readout]')] });
  return scratch.evaluate(async b64 => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
    let covered = 0, orange = 0, blue = 0, red = 0, black = 0, box = null;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], gr = data[i + 1], b = data[i + 2], max = Math.max(r, gr, b), min = Math.min(r, gr, b), d = max - min;
      if (r > 240 && gr < 10 && b > 240) continue; // the mask over the primary readout
      if (r < 12 && gr < 12 && b < 12) black += 1; // an unlit mesh (a tube with no normals) renders (0, 0, 0)
      if (Math.abs(r - data[0]) + Math.abs(gr - data[1]) + Math.abs(b - data[2]) > 36) covered += 1;
      if (!d || d / max < 0.55 || max < 100) continue;
      const hue = 60 * (max === r ? ((gr - b) / d + 6) % 6 : max === gr ? (b - r) / d + 2 : (r - gr) / d + 4);
      if (hue >= 16 && hue <= 45) orange += 1;
      else if (hue >= 205 && hue <= 235) blue += 1;
      else if (hue < 14 || hue > 350) { red += 1; const p = i / 4, x = p % width, y = (p - x) / width; box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y]; }
    }
    return { width, height, covered: covered / (width * height), orange, blue, red, black, box };
  }, png.toString('base64'));
};

// How many pixels differ between two screenshots of the host (by more than 36 summed over the channels).
const differ = async (a, b) => scratch.evaluate(async ([x, y]) => {
  const pixels = async b64 => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
  const [p, q] = [await pixels(x), await pixels(y)];
  let n = p.length === q.length ? 0 : Infinity;
  for (let i = 0; n !== Infinity && i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 36) n += 1;
  return n;
}, [a.toString('base64'), b.toString('base64')]);
const measured = (label, values) => console.log(`   measured ${label} ${JSON.stringify(values)}`);
const sceneShot = () => host.screenshot({ mask: [card.locator('[data-animation-primary-readout]')] });

// The bowl's rule, worked out by hand and written down here, not read from the program: loss = (3 x^2 + z^2) / 2, start (0.3, 1.6), and with all
// 256 examples (no noise) each step multiplies x by (1 - 3 r) and z by (1 - r).
const bowl = (rate, steps) => { const x = 0.3 * (1 - 3 * rate) ** steps, z = 1.6 * (1 - rate) ** steps; return 0.5 * (3 * x * x + z * z); };

try {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await card.waitFor({ timeout: 60000 });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit1'); // zoom to fit, so the card is on screen
  await page.waitForTimeout(900);

  await step('the golden fixture card loads as a built-in example, an experiment, with a live scene', async () => {
    assert.equal(await card.locator('[data-animation-fixture]').count(), 1, 'labelled as an example');
    assert.equal(await card.getAttribute('data-animation-experience'), 'experiment');
    assert.equal(await card.locator('[data-animation-badge="experiment"]').count(), 1);
    await until(() => viewport.evaluate(node => node.hasAttribute('data-viewer-live')), 'the scene never drew its first frame', 30000);
    assert.ok((await card.locator('[data-animation-fixture-note]').innerText()).includes('not generated'), 'the note says it was not generated');
    await shot('A-loaded');
  });
  await step('the surface draws: a large share of the view differs from the background, and the status is the word paused', async () => {
    await more();
    const seen = await look();
    measured('start', { covered: +seen.covered.toFixed(3), size: `${seen.width}x${seen.height}` });
    assert.ok(seen.covered >= 0.11, `the bowl covers ${(seen.covered * 100).toFixed(1)}% of the view (about 22% expected at 725 x 240; a scene with no surface covers under 2%)`);
    assert.equal(await word(), 'paused');
    assert.equal((await frame()).readouts.status, 'paused');
    assert.equal((await frame()).nodes.trail.points.length, 1, 'a path of one point, before any step');
  });
  await step('Step once five times: a six-point path, and the true loss is the closed form', async () => {
    await more(); // Batch size is a secondary setting, under More settings
    await card.locator('[data-animation-parameter="batchSize"] select').selectOption('256');
    await page.waitForTimeout(3000); // the camera refits once the controls settle (REFIT_MS and the sampler's budget)
    for (let i = 0; i < 5; i += 1) await press('step');
    await until(async () => (await frame()).readouts.steps === 5, 'five steps');
    const f = await frame();
    assert.equal(f.nodes.trail.points.length, 6);
    assert.ok(Math.abs(f.readouts.loss - bowl(0.1, 5)) < 1e-9, `loss ${f.readouts.loss}, closed form ${bowl(0.1, 5)}`);
    assert.equal(await word(), 'paused', 'a step leaves the run paused');
  });
  await step('Run: the word is running, then converged; the true loss is under 0.02 and the path has 21 points', async () => {
    const began = Date.now();
    await press('run');
    await until(async () => (await word()) === 'running', 'the word running');
    await until(async () => (await word()) === 'converged', 'the word converged', 40000);
    const took = Date.now() - began;
    measured('run', { msToConverged: took, notes: runtimeNotes.length });
    assert.ok(took < 20000, `fifteen steps at five a second took ${took} ms: the host's 30 ticks a second are costing more than their 33 ms each`);
    assert.deepEqual(runtimeNotes, [], 'the scene logged no runtime failure');
    const f = await frame();
    assert.ok(f.readouts.loss < 0.02 && f.readouts.loss >= 0, `loss ${f.readouts.loss}`);
    assert.equal(f.readouts.steps, 20, 'twenty steps from (0.3, 1.6) at rate 0.1');
    assert.ok(Math.abs(f.readouts.loss - bowl(0.1, 20)) < 1e-9);
    assert.equal(f.nodes.trail.points.length, 21);
    assert.equal(f.nodes.stepArrow.visible, false, 'a finished run shows no arrows');
    await page.waitForTimeout(500);
    const seen = await look();
    measured('converged', { orange: seen.orange, black: seen.black, red: seen.red, covered: +seen.covered.toFixed(3) });
    assert.ok(seen.black < 30, `${seen.black} pure black pixels: the path is drawn unlit (a tube with no normals renders black)`);
    assert.ok(seen.orange >= 100, `the finished run's path draws: ${seen.orange} orange pixels (about 250 expected at 725 x 240: 41 px long, 5.8 px thick; the ball is under 80 px2 and no arrow is shown)`);
    await shot('B-converged');
  });
  await step('New run keeps the old path as the ghost: 21 ghost points, a one-point path, and the picture differs from the same scene with the ghost cleared', async () => {
    await press('newRun');
    await until(async () => (await frame()).nodes.ghost.points.length === 21, 'the kept path');
    const f = await frame();
    assert.equal(f.nodes.trail.points.length, 1);
    assert.equal(f.readouts.steps, 0);
    assert.equal(await word(), 'paused');
    // The same camera for the frames: Reset view returns to the fitted camera, which a Reset does not change. A control frame of the same scene says what two identical shots differ by.
    await card.locator('[data-animation-reset-view]').click();
    await page.waitForTimeout(800);
    const withGhost = await sceneShot();
    await page.waitForTimeout(400);
    const control = await sceneShot();
    await card.locator('[data-animation-reset]').click(); // clears the ghost; the camera stays, the settings return to their defaults
    await until(async () => (await frame()).nodes.ghost.points.length === 0, 'the kept path cleared');
    await more();
    await card.locator('[data-animation-parameter="batchSize"] select').selectOption('256');
    await page.waitForTimeout(3500); // the same settings as before, so the arrows are the same
    await card.locator('[data-animation-reset-view]').click();
    await page.waitForTimeout(800);
    const without = await sceneShot();
    const noise = await differ(withGhost, control), changed = await differ(withGhost, without);
    measured('ghost', { control: noise, withVsWithout: changed });
    assert.ok(noise <= 2, `two shots of the same scene differ by ${noise} pixels`);
    assert.ok(changed >= noise + 25, `the kept path draws: ${changed} pixels differ with and without it, against ${noise} between two shots of one scene (about 100 expected: 41 px long, 2.9 px thick)`);
    await shot('B-ghost');
  });
  await step('learning rate 1.5: diverged, the Loss readout keeps the true value, and the clamped ball stays inside the frame', async () => {
    await setRate(1.5);
    await press('run');
    await until(async () => (await word()) === 'diverged', 'the word diverged', 15000);
    const f = await frame();
    assert.ok(Math.abs(f.readouts.loss - bowl(1.5, 2)) < 1e-9, `the true loss ${f.readouts.loss}, closed form ${bowl(1.5, 2)}`);
    assert.ok(f.nodes.ball.position[1] > 10, `the program's ball height is the true one (${f.nodes.ball.position[1]}); the renderer draws it clamped`);
    await page.waitForTimeout(800);
    const seen = await look();
    measured('diverged', { red: seen.red, black: seen.black, box: seen.box, covered: +seen.covered.toFixed(3) });
    assert.ok(seen.red >= 20, `the ball is drawn: ${seen.red} red pixels (about 80 expected: 10 px across)`);
    const [x0, y0, x1, y1] = seen.box;
    assert.ok(x0 >= 2 && y0 >= 2 && x1 <= seen.width - 3 && y1 <= seen.height - 3, `the ball is inside the frame: ${JSON.stringify(seen.box)} of ${seen.width} x ${seen.height}`);
    assert.ok(seen.covered >= 0.08, `the bowl keeps ${(seen.covered * 100).toFixed(1)}% of the view (about 15% expected at 725 x 240)`);
    assert.equal(f.nodes.fullArrow.visible, false);
    await shot('C-diverged');
  });

  // The server's decision, run by the same functions the Durable Object uses (animation-job.js readResult: needsFeatures against clientFeatures),
  // on the golden artifact, answered for a request the page makes. ANIMATION_ENABLED is off in this stack, so the route is the check's own.
  const sealed = validateAnimationArtifact(GOLDEN).value;
  await page.route('**/api/learn/animation/jobs/results/*', route => {
    const features = (new URL(route.request().url()).searchParams.get('features') || '').split(',').filter(Boolean);
    if (needsFeatures(sealed).some(f => !clientFeatures(features).includes(f))) return route.fulfill({ status: 409, json: { error: CLIENT_UPDATE, code: 'client_update_required' } });
    return route.fulfill({ json: { artifact: sealed, execution: { allowed: true } } });
  });
  const ask = features => page.evaluate(async query => { const r = await fetch(`/api/learn/animation/jobs/results/${query}`); return { status: r.status, body: await r.json() }; },
    `${GOLDEN.artifactId}?board=b1${features === null ? '' : `&features=${encodeURIComponent(features.join(','))}`}`);
  await step('an older client (no flags, or only curve_radius and action_motion, or any one of the five missing) gets 409 client_update_required for the golden', async () => {
    for (const features of [null, [], ['curve_radius'], ['curve_radius', 'action_motion'], ...ANIMATION_CLIENT_FEATURES.slice(2).map(missing => ANIMATION_CLIENT_FEATURES.filter(f => f !== missing))]) {
      const answer = await ask(features);
      assert.deepEqual([answer.status, answer.body.code, answer.body.error], [409, 'client_update_required', CLIENT_UPDATE], `features ${JSON.stringify(features)}`);
    }
    const current = await ask(ANIMATION_CLIENT_FEATURES);
    assert.equal(current.status, 200);
    assert.equal(current.body.artifact.artifactId, GOLDEN.artifactId);
  });
  await step('the current client declares all seven flags in its result request, so it is never given the 409', async () => {
    const paths = [];
    await animationClient(async path => { paths.push(path); return {}; }, 'b1').result(GOLDEN.artifactId);
    const declared = decodeURIComponent(new URL(paths[0], 'http://x').searchParams.get('features')).split(',');
    assert.deepEqual(declared, [...ANIMATION_CLIENT_FEATURES]);
    for (const flag of ['surface_grid', 'trail_points', 'text_readout', 'arrow_anchor', 'clamp']) assert.ok(declared.includes(flag), flag);
    assert.equal(needsFeatures(sealed).filter(f => !clientFeatures(declared).includes(f)).length, 0);
  });
  await step('no generation or model request, no other origin, no page error and no console error', async () => {
    assert.deepEqual(stray, []);
    assert.deepEqual(offOrigin, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
  });
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL && results.length === TOTAL ? 0 : 1);
