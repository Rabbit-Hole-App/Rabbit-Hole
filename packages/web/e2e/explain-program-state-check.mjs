// Stateful program cards (schema 2, Task 8.3) in the real app, against the LOCAL stack only: local D1, a fresh browser profile, no
// model call. A canvas is seeded with the two hand-authored stateful fixtures (fixtures.js sortFixture and springFixture: test data,
// not generation evidence); the dev build admits fixture cards (VITE_COACHING_DEV, program-card.js).
// Covers: declared buttons and selectable objects drawn with the shared controls and operable by keyboard; three fast presses applied
// exactly once each and in order; a selection by clicking the drawing and by its button; rapid input changes followed by an action,
// applied with their own values; Reset after button-only changes; reload restoring the committed state; a refused change followed by
// Restart and reload, which come back to the last committed state and inputs without retrying it. Task 8.4 (fixtures.js dragFixture):
// a drag target hit and dragged at canvas zoom and pan outside Focus (the SVG's own screen transform, FX-56), dropped on a known point;
// a rapid drag end; a cancelled pointer; a drag outside the target; the keyboard equivalent; a share-link viewer's drag kept local.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/explain-program-state-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explain-program-state-check runs against the local stack only');
const SHOTS = process.argv[2] || 'explain-program-state-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 15; // bump with the checks below; the printed line is what CI reads
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `state-${run}@example.com`, secret, handle: `state_${run}` }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  return response.json().catch(() => null);
};

const program = (id, title, fixtureId) => ({ id, type: 'animation', dx: 0, dy: 0, title, program: { fixtureId }, time: 0, selectedObject: null, marked: null });
const BLOCKS = [program('p-sort', 'Sorting by neighbour swaps', 'fixture-sort'), program('p-spring', 'A mass on a spring, step by step', 'fixture-spring'), program('p-drag', 'Placing a point on a track', 'fixture-drag')];
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
    // The picture and the Notes values come from the same accepted state and its input snapshot.
    await card('p-spring').locator('[data-program-notes-toggle]').click();
    assert.equal((await card('p-spring').locator('[data-program-value="position"]').innerText()).trim(), `Position: ${x.toFixed(2)} m`);
    assert.equal((await card('p-spring').locator('[data-program-value="elapsed"]').innerText()).trim(), 'Time: 0.1 s');
    await card('p-spring').locator('[data-program-notes-toggle]').click();
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
  // ---- Task 8.4: drag targets ----------------------------------------------------------------------------------------------------
  const centre = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
  const handle = (on = page) => on.locator('[data-block-id="p-drag"] [data-program-frame] [data-animation-object="handle"]');
  const mark = (on = page) => on.locator('[data-block-id="p-drag"] [data-program-frame] [data-animation-object="mark"]');
  const dragText = async (on = page) => (await on.locator('[data-block-id="p-drag"] [data-program-frame]').textContent()).replace(/\s+/g, ' ');
  const handleAt = async (on = page) => Number((await dragText(on)).match(/Handle at (\d+)/)[1]);
  const placed = async () => Number((await dragText()).match(/placed (\d+) times/)[1]);
  const settledAt = async (expected, on = page, slack = 3) => {
    for (let i = 0; i < 60; i++) { const text = await dragText(on); if (!/dragging/.test(text) && Math.abs(Number(text.match(/Handle at (\d+)/)[1]) - expected) <= slack) return; await page.waitForTimeout(100); }
    assert.fail(`the handle did not settle at ${expected}: ${await dragText(on)}`);
  };
  // A pointer drag from the handle to the screen point of the marker (540 in frame units), through the real mouse.
  const dropOnMark = async (on = page, steps = 8) => {
    const from = await centre(handle(on)), to = await centre(mark(on));
    await on.mouse.move(from.x, from.y); await on.mouse.down(); await on.mouse.move(to.x, to.y, { steps }); await on.mouse.up();
  };
  const centreIt = async () => { await card('p-drag').locator('[data-program-action="centre"]').click(); await settledAt(360, page, 0); };
  await check('9 at canvas zoom and pan, outside Focus, the drag target is hit and dropped where the pointer is, in frame coordinates (FX-56)', async () => {
    await handle().waitFor({ state: 'attached', timeout: 30000 });
    const before = await centre(handle());
    await page.locator('[title="Zoom in"]').click();
    await page.mouse.move(200, 800); await page.mouse.wheel(-60, -40); await page.waitForTimeout(600); // pan over empty canvas
    const after = await centre(handle());
    assert.ok(Math.abs(after.x - before.x) > 5 || Math.abs(after.y - before.y) > 5, 'the canvas view changed');
    assert.equal(await card('p-drag').locator('[data-program-focus]').count(), 0, 'not in Focus');
    await dropOnMark();
    await settledAt(540);
    assert.equal(await placed(), 1);
    // The picture and the Notes values come from the same accepted state.
    await card('p-drag').locator('[data-program-notes-toggle]').click();
    assert.equal((await card('p-drag').locator('[data-program-value="position"]').innerText()).trim(), `Position: ${await handleAt()}`);
    await card('p-drag').locator('[data-program-notes-toggle]').click();
    await shot('D-drag-at-zoom');
  });
  await check('10 a rapid drag (no pause before the release) ends exactly once at its last point', async () => {
    await centreIt();
    await dropOnMark(page, 2);
    await settledAt(540);
    assert.equal(await placed(), 2);
  });
  await check('11 a cancelled pointer ends the drag at its last point; the program is never left mid-drag', async () => {
    await centreIt();
    const from = await centre(handle()), to = await centre(mark());
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 });
    await card('p-drag').locator('[data-program-frame] [data-animation-frame]').evaluate(element => element.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
    await page.mouse.up();
    await settledAt(540);
    assert.equal(await placed(), 3);
  });
  await check('12 a drag that starts outside the target sends nothing to the program', async () => {
    await centreIt();
    const frame = await card('p-drag').locator('[data-program-frame] [data-animation-frame]').boundingBox(), to = await centre(mark());
    await page.mouse.move(frame.x + 15, frame.y + frame.height - 15); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(600);
    assert.deepEqual([await handleAt(), await placed()], [360, 3]);
  });
  await check('13 the keyboard equivalent: an arrow key on the target\'s button moves it as one drag', async () => {
    const button = card('p-drag').locator('[data-program-target="handle"]');
    assert.equal(await button.getAttribute('aria-keyshortcuts'), 'ArrowLeft ArrowRight ArrowUp ArrowDown');
    await button.focus();
    await page.keyboard.press('ArrowRight');
    await settledAt(360 + 720 / 20, page, 0);
    assert.equal(await placed(), 4);
  });
  await check('14 a share-link viewer drags the card in memory only: no board write, and a reload shows the saved card', async () => {
    await page.waitForTimeout(2500); // the canvas saves after a short pause: the link serves the owner's saved card (Handle at 396)
    const state = { ...seed, blocks: [program('p-drag', 'Placing a point on a track', 'fixture-drag')] };
    const shared = await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state }) });
    assert.ok(shared?.sharing?.view, JSON.stringify(shared).slice(0, 200));
    const visitor = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const writes = [];
    visitor.on('request', request => { if (request.method() !== 'GET' && /\/api\/learn\/boards/.test(request.url())) writes.push(`${request.method()} ${new URL(request.url()).pathname}`); });
    const viewer = await visitor.newPage();
    viewer.on('pageerror', error => errors.push(error.message));
    await viewer.goto(`${BASE}/b/${shared.sharing.view}`);
    await handle(viewer).waitFor({ state: 'attached', timeout: 60000 });
    const saved = await handleAt(viewer); // the owner's saved card, as the link serves it
    assert.equal(saved, 396, 'the last position the owner saved');
    await viewer.evaluate(() => document.activeElement?.blur());
    await viewer.keyboard.press('Shift+Digit1'); // zoom to fit, so the card is on screen
    await viewer.waitForTimeout(900);
    await dropOnMark(viewer);
    await settledAt(540, viewer);
    await viewer.reload();
    await handle(viewer).waitFor({ state: 'attached', timeout: 60000 });
    assert.equal(await handleAt(viewer), saved, 'the saved shared card, not the visitor\'s drag');
    assert.deepEqual(writes, []);
    await visitor.close();
  });
  await check('15 no model route was called, no host other than the app and its own notebook frame was contacted, and no page error', async () => {
    assert.deepEqual(stray, []);
    assert.deepEqual(offOrigin, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
