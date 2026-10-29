// Stateful program cards (schema 2, Task 8.3) in the real app, against the LOCAL stack only: local D1, a fresh browser profile, no
// model call. A canvas is seeded with the two hand-authored stateful fixtures (fixtures.js sortFixture and springFixture: test data,
// not generation evidence); the dev build admits fixture cards (VITE_COACHING_DEV, program-card.js).
// Covers: declared buttons and selectable objects drawn with the shared controls and operable by keyboard; three fast presses applied
// exactly once each and in order; a selection by clicking the drawing and by its button; rapid input changes followed by an action,
// applied with their own values; Reset after button-only changes; reload restoring the committed state; a refused change followed by
// Restart and reload, which come back to the last committed state and inputs without retrying it.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/explain-program-state-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explain-program-state-check runs against the local stack only');
const SHOTS = process.argv[2] || 'explain-program-state-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 9; // bump with the checks below; the printed line is what CI reads
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `state-${run}@example.com`, secret, handle: `state_${run}` }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  return response.json().catch(() => null);
};

const program = (id, title, fixtureId) => ({ id, type: 'animation', dx: 0, dy: 0, title, program: { fixtureId }, time: 0, selectedObject: null, marked: null });
const BLOCKS = [program('p-sort', 'Sorting by neighbour swaps', 'fixture-sort'), program('p-spring', 'A mass on a spring, step by step', 'fixture-spring')];
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Stateful card ${run}` }) });
const catalog = await api('/api/apps');
const key = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const seed = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks: BLOCKS, exchanges: [] };
// The spring fixture's own arithmetic (fixtures.js): ten steps of a hundredth of a second per Advance.
const advance = ([x, v], k) => { for (let n = 0; n < 10; n++) { v -= k * x * 0.01; x += v * 0.01; } return [x, v]; };

const browser = await chromium.launch();
const errors = [], stray = [], offOrigin = [];
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(([storageKey, value]) => { if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(value)); }, [key, seed]);
  // Pressing, selecting and moving controls are local: no model route may be called. Any such POST fails the run.
  await context.route(/\/api\/learn\/(ask|tutor|artifact|home-ask|journeys?|explain)\b/, route => {
    if (route.request().method() === 'GET' || new URL(route.request().url()).pathname === '/api/learn/tutor/next-steps') return route.fallback();
    stray.push(route.request().url());
    return route.abort();
  });
  const NOTEBOOK_ORIGIN = 'https://small-learn-canvas-notebook-dev.tryrabbithole.workers.dev'; // the app page's own notebook frame (as in explain-program-card-check)
  context.on('request', request => { const url = request.url(); if (!url.startsWith(BASE) && !url.startsWith(`${NOTEBOOK_ORIGIN}/`) && !/^(data|blob):/.test(url)) offOrigin.push(url); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const card = id => page.locator(`[data-block-id="${id}"]`);
  const frameText = async id => (await card(id).locator('[data-program-frame]').textContent()).replace(/\s+/g, ' ');
  const waitText = async (id, pattern) => { for (let i = 0; i < 60; i++) { if (pattern.test(await frameText(id))) return; await page.waitForTimeout(100); } assert.match(await frameText(id), pattern); };
  const open = async () => {
    await page.goto(`${BASE}/apps/${canvas.name}`);
    await card('p-sort').locator('[data-program-action="step"]').waitFor({ timeout: 60000 });
    await card('p-spring').locator('[data-program-action="advance"]').waitFor({ timeout: 60000 });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Shift+Digit1'); // zoom to fit, so both cards are on screen
    await page.waitForTimeout(900);
  };
  await open();

  await check('1 the declared buttons and selectable objects are drawn with the shared controls; nothing to reset yet', async () => {
    assert.deepEqual(await card('p-sort').locator('[data-program-action]').allInnerTexts(), ['Compare next pair', 'Shuffle']);
    assert.equal(await card('p-sort').locator('[data-program-target]').count(), 6);
    assert.equal(await card('p-sort').locator('[data-program-frame] [data-animation-object^="bar-"]').count(), 6);
    await waitText('p-sort', /Next: compare bar 1 and bar 2/);
    assert.equal(await card('p-sort').locator('[data-scene-reset]').count(), 0);
    await shot('A-initial');
  });
  await check('2 three fast presses apply three transitions exactly once each, in order', async () => {
    const step = card('p-sort').locator('[data-program-action="step"]');
    await step.click(); await step.click(); await step.click(); // no wait between them
    await waitText('p-sort', /Next: compare bar 4 and bar 5/); // 5 2 6 1 4 3 -> swap, keep, swap: 2 5 1 6 4 3, next pair 4-5
    assert.match(await frameText('p-sort'), /^251643Next/, 'the bars read 2 5 1 6 4 3');
    await page.waitForTimeout(500);
    assert.match(await frameText('p-sort'), /Next: compare bar 4 and bar 5/, 'no fourth transition');
    assert.equal(await card('p-sort').locator('[data-scene-reset]').count(), 1, 'Reset is offered after button-only changes');
  });
  await check('3 a button works from the keyboard', async () => {
    await card('p-sort').locator('[data-program-action="step"]').focus();
    await page.keyboard.press('Enter');
    await waitText('p-sort', /Next: compare bar 5 and bar 6/);
  });
  await check('4 selecting by clicking the drawing and by the selection button is the same declared event', async () => {
    await card('p-sort').locator('[data-program-frame] [data-animation-object="bar-2"]').click();
    await waitText('p-sort', /Bar 3 holds 1/);
    await card('p-sort').locator('[data-program-target="bar-0"]').click();
    await waitText('p-sort', /Bar 1 holds 2/);
    await shot('B-after-presses');
  });
  await check('5 rapid input changes then an action: the action runs once, with the last value', async () => {
    const stiffness = card('p-spring').locator('input[data-input-control="stiffness"]');
    for (const value of ['9', '12', '15', '7']) await stiffness.fill(value);
    await card('p-spring').locator('[data-program-action="advance"]').click();
    const [x] = advance([1, 0], 7);
    await waitText('p-spring', new RegExp(`Position ${x.toFixed(2)} m after 0\\.1 s`));
    await page.waitForTimeout(500);
    assert.match(await frameText('p-spring'), /after 0\.1 s/, 'one advance, not one per input change');
    assert.equal(await card('p-spring').locator('[data-program-error]').count(), 0);
  });
  await check('6 Reset restores the initial state and offers nothing more to reset', async () => {
    await card('p-sort').locator('[data-scene-reset]').click();
    await waitText('p-sort', /Next: compare bar 1 and bar 2/);
    assert.match(await frameText('p-sort'), /Select a bar to see its value/);
    await page.waitForTimeout(400);
    assert.equal(await card('p-sort').locator('[data-scene-reset]').count(), 0);
  });
  await check('7 reload restores the committed state: presses, the selection and the advanced simulation', async () => {
    const step = card('p-sort').locator('[data-program-action="step"]');
    await step.click(); await step.click();
    await card('p-sort').locator('[data-program-target="bar-1"]').click();
    await waitText('p-sort', /Bar 2 holds 5/);
    await waitText('p-sort', /Next: compare bar 3 and bar 4/);
    await page.waitForTimeout(2500); // the canvas saves after a short pause
    await open();
    await waitText('p-sort', /Next: compare bar 3 and bar 4/);
    assert.match(await frameText('p-sort'), /Bar 2 holds 5/);
    const [x] = advance([1, 0], 7);
    await waitText('p-spring', new RegExp(`Position ${x.toFixed(2)} m after 0\\.1 s`));
    assert.match(await card('p-spring').locator('[data-input-readout="stiffness"]').innerText(), /^7/);
    await shot('C-after-reload');
  });
  await check('8 a change the program refuses stops the card; Restart and reload come back to the last committed state and inputs, never retrying it', async () => {
    const [x] = advance([1, 0], 7);
    await card('p-spring').locator('input[data-input-control="stiffness"]').fill('20'); // the fixture refuses a stiffness above 18
    await card('p-spring').locator('[data-program-error]').waitFor({ timeout: 30000 });
    await card('p-spring').locator('[data-program-restart]').click();
    await card('p-spring').locator('[data-program-action="advance"]').waitFor({ timeout: 30000 });
    await waitText('p-spring', new RegExp(`Position ${x.toFixed(2)} m after 0\\.1 s`));
    await page.waitForTimeout(800);
    assert.equal(await card('p-spring').locator('[data-program-error]').count(), 0, 'the refused change was not retried');
    assert.match(await card('p-spring').locator('[data-input-readout="stiffness"]').innerText(), /^7/, 'the committed input, not the refused one');
    await page.waitForTimeout(2500);
    await open();
    await waitText('p-spring', new RegExp(`Position ${x.toFixed(2)} m after 0\\.1 s`));
    assert.match(await card('p-spring').locator('[data-input-readout="stiffness"]').innerText(), /^7/);
    assert.equal(await card('p-spring').locator('[data-program-error]').count(), 0);
  });
  await check('9 no model route was called, no host other than the app and its own notebook frame was contacted, and no page error', async () => {
    assert.deepEqual(stray, []);
    assert.deepEqual(offOrigin, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
