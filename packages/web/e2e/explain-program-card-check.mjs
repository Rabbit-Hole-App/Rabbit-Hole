// The interactive program card in the real app (explain sandbox Task 4, plan section 8), against the LOCAL stack only: local D1,
// a fresh browser profile, no model call. A canvas is seeded with the hand-authored fixture program cards (fixtures.js, test data
// and not generation evidence) plus one old scene card; the dev build admits fixture cards (VITE_COACHING_DEV, program-card.js).
// Covers: the picture draws from the saved program, Play and Pause, the scrubber, a number control and a choice control, Reset,
// reload keeping the learner's values, the two fixed error messages with Restart, and an old scene card still working.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/explain-program-card-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { axisScene } from '../src/demo-scenes.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explain-program-card-check runs against the local stack only');
const SHOTS = process.argv[2] || 'explain-program-card-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 14; // bump with the checks below; the printed line is what CI reads
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `prog-${run}@example.com`, secret, handle: `prog_${run}` }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  return response.json().catch(() => null);
};

const program = (id, title, fixtureId) => ({ id, type: 'animation', dx: 0, dy: 0, title, program: { fixtureId }, time: 0, selectedObject: null, marked: null });
const BLOCKS = [
  program('p-growth', 'Balance over time', 'fixture-growth'), program('p-search', 'Halving a sorted row', 'fixture-search'),
  program('p-loop', 'A program that never finishes', 'fixture-loop'), program('p-capability', 'A program that needs an unavailable capability', 'fixture-capability'),
  { id: 'old-scene', type: 'animation', dx: 0, dy: 0, title: axisScene.title, scene: axisScene, time: 0, selectedObject: null, marked: null },
];
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Program card ${run}` }) });
const catalog = await api('/api/apps');
const key = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const seed = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks: BLOCKS, exchanges: [] };

const browser = await chromium.launch();
const errors = [], stray = [], offOrigin = [];
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(([storageKey, value]) => { if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(value)); }, [key, seed]);
  // Playing, scrubbing and controls are local: no model route may be called. Any such POST fails the run.
  await context.route(/\/api\/learn\/(ask|tutor|artifact|home-ask|journeys?|explain)\b/, route => {
    if (route.request().method() === 'GET' || new URL(route.request().url()).pathname === '/api/learn/tutor/next-steps') return route.fallback();
    stray.push(route.request().url());
    return route.abort();
  });
  context.on('request', request => { if (!request.url().startsWith(BASE) && !/^(data|blob):/.test(request.url())) offOrigin.push(request.url()); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const card = id => page.locator(`[data-block-id="${id}"]`);
  const timeText = async id => (await card(id).locator('[data-program-time]').innerText()).trim();
  const readouts = async id => (await card(id).locator('[data-program-readouts]').innerText()).trim();
  const scrub = async (id, seconds) => { await card(id).locator('input[aria-label="Explanation time"]').fill(String(seconds)); await page.waitForTimeout(500); };
  const open = async () => {
    await page.goto(`${BASE}/apps/${canvas.name}`);
    await card('p-growth').waitFor({ timeout: 60000 });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Shift+Digit1'); // zoom to fit, so every card is on screen
    await page.waitForTimeout(900);
  };
  await open();

  await check('1 the growth card draws its picture from the saved program: curve, marker, axes and a readout', async () => {
    await card('p-growth').locator('[data-program-frame] [data-animation-object]').first().waitFor({ timeout: 30000 });
    assert.ok(await card('p-growth').locator('[data-program-frame] polyline').count() >= 1, 'a plotted curve');
    assert.ok(await card('p-growth').locator('[data-program-frame] [data-animation-object="marker"]').count() === 1);
    assert.match(await readouts('p-growth'), /^Balance: 1000$/);
    assert.equal(await card('p-growth').locator('[data-program-error]').count(), 0);
    await shot('A-growth-at-zero');
  });
  await check('2 a new card starts stopped at zero with a Play button and one scrubber', async () => {
    assert.equal(await timeText('p-growth'), '0.0s');
    assert.match(await card('p-growth').locator('[data-animation-play]').innerText(), /Play/);
    assert.equal(await card('p-growth').locator('[data-animation-transport]').count(), 1, 'one transport row, never two');
  });
  await check('3 Play advances real time and the picture; the button becomes Pause', async () => {
    await card('p-growth').locator('[data-animation-play]').click();
    await page.waitForTimeout(900);
    assert.notEqual(await timeText('p-growth'), '0.0s');
    assert.match(await card('p-growth').locator('[data-animation-play]').innerText(), /Pause/);
    assert.notEqual(await readouts('p-growth'), 'Balance: 1000');
  });
  await check('4 Pause stops the clock', async () => {
    await card('p-growth').locator('[data-animation-play]').click();
    const first = await timeText('p-growth');
    await page.waitForTimeout(600);
    assert.equal(await timeText('p-growth'), first);
    assert.match(await card('p-growth').locator('[data-animation-play]').innerText(), /Play|Replay/);
  });
  await check('5 the scrubber jumps to the end and the readout is the program\'s own number; the button reads Replay', async () => {
    await scrub('p-growth', 4);
    assert.equal(await timeText('p-growth'), '4.0s');
    assert.equal(await readouts('p-growth'), `Balance: ${Math.round(1000 * 1.05 ** 10)}`);
    assert.match(await card('p-growth').locator('[data-animation-play]').innerText(), /Replay/);
    await shot('B-growth-at-end');
  });
  await check('6 a number control changes the picture and the readout without any model call', async () => {
    await card('p-growth').locator('input[data-input-control="rate"]').fill('12');
    await page.waitForTimeout(600);
    assert.equal(await readouts('p-growth'), `Balance: ${Math.round(1000 * 1.12 ** 10)}`);
    assert.match(await card('p-growth').locator('[data-input-readout="rate"]').innerText(), /12/);
    assert.deepEqual(stray, []);
  });
  await check('7 a choice control (simple interest) changes the result again', async () => {
    await card('p-growth').locator('[data-input-control="mode"][data-input-value="simple"]').click();
    await page.waitForTimeout(600);
    assert.equal(await readouts('p-growth'), `Balance: ${Math.round(1000 * (1 + 0.12 * 10))}`);
    assert.equal(await card('p-growth').locator('[data-input-control="mode"][data-input-value="simple"]').getAttribute('aria-pressed'), 'true');
    await shot('C-growth-changed');
  });
  await check('8 Reset experiment restores the defaults and time zero', async () => {
    await card('p-growth').locator('[data-scene-reset]').click();
    await page.waitForTimeout(600);
    assert.equal(await timeText('p-growth'), '0.0s');
    assert.equal(await readouts('p-growth'), 'Balance: 1000');
    assert.match(await card('p-growth').locator('[data-input-readout="rate"]').innerText(), /^5/);
    assert.equal(await card('p-growth').locator('[data-scene-reset]').count(), 0, 'nothing left to reset');
  });
  await check('9 reload keeps the learner\'s inputs and moment', async () => {
    await card('p-growth').locator('input[data-input-control="rate"]').fill('8');
    await scrub('p-growth', 2);
    await page.waitForTimeout(2500); // the canvas saves after a short pause
    await open();
    await card('p-growth').locator('[data-program-frame] [data-animation-object]').first().waitFor({ timeout: 30000 });
    assert.equal(await timeText('p-growth'), '2.0s');
    assert.match(await card('p-growth').locator('[data-input-readout="rate"]').innerText(), /^8/);
  });
  await check('10 a structurally different program draws through the same card: fifteen cells and a pointer, no curve', async () => {
    assert.equal(await card('p-search').locator('[data-program-frame] [data-animation-object^="cell-"]').count(), 15);
    assert.equal(await card('p-search').locator('[data-program-frame] polyline').count(), 0);
    const before = await card('p-search').locator('[data-program-frame]').textContent();
    await scrub('p-search', 3);
    assert.notEqual(await card('p-search').locator('[data-program-frame]').textContent(), before, 'the caption follows the time');
    await shot('D-search');
  });
  await check('11 a program that never finishes is stopped with the fixed runtime-limit message, and Restart explanation answers without a crash', async () => {
    const error = card('p-loop').locator('[data-program-error]');
    await error.waitFor({ timeout: 30000 });
    assert.equal(await error.getAttribute('data-program-error'), 'runtime_limit');
    assert.match(await error.innerText(), /This explanation stopped because it exceeded its runtime limit\./);
    await card('p-loop').locator('[data-program-restart]').click();
    await card('p-loop').locator('[data-program-error]').waitFor({ timeout: 30000 });
    assert.equal(await card('p-growth').locator('[data-program-error]').count(), 0, 'another card is unaffected');
  });
  await check('12 a program needing an unavailable capability shows the fixed capability message', async () => {
    const error = card('p-capability').locator('[data-program-error]');
    await error.waitFor({ timeout: 30000 });
    assert.equal(await error.getAttribute('data-program-error'), 'unsupported_capability');
    assert.match(await error.innerText(), /This explanation needs a capability that is not available yet\./);
    await shot('E-errors');
  });
  await check('13 an old scene card is unchanged: its frame draws and it has no program card inside', async () => {
    assert.ok(await card('old-scene').locator('[data-animation-frame]').count() >= 1);
    assert.equal(await card('old-scene').locator('[data-program-card]').count(), 0);
  });
  await check('14 no model route was called, nothing left the origin, and no page error', async () => {
    assert.deepEqual(stray, []);
    assert.deepEqual(offOrigin, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
