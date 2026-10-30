// The interactive program card in the real app (explain sandbox Task 4, plan section 8), against the LOCAL stack only: local D1,
// a fresh browser profile, no model call. A canvas is seeded with the hand-authored fixture program cards (fixtures.js, test data
// and not generation evidence) plus one old scene card; the dev build admits fixture cards (VITE_COACHING_DEV, program-card.js).
// Covers: the picture draws from the saved program, Play and Pause, the scrubber, a number control and a choice control, Reset,
// reload keeping the learner's values, the two fixed error messages with Restart, an old scene card still working, (Task 10.1) a
// playing card that leaves the view pauses and comes back at the same moment, delete and in-app navigation close its Worker, on the
// owner's View only shared page a program card saved with no dx/dy (as an /explain job places it) selected by a click, with Focus,
// and (Task 9.1) an Edit's Proposed program preview: its own player, never saved, Current back, Discard keeping the card. The edit
// job's ready answer is a route stand-in whose candidate names a fixture program (wiring only; the result-route resolution is unit-tested).
// Task 10.2 support matrix: Focus after Play, Pause, a scrub, a slider and Notes is placed on the pane (a native reveal had scrolled
// the clipped surface), and a control taking the keyboard focus under the minimap is revealed clear of it.
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
const TOTAL = 21; // bump with the checks below; the printed line is what CI reads
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
// Task 9.1: a second canvas with one accepted program card (the growth fixture, the learner's rate 8 at 2 s) and a ready Edit on it.
const EDIT = { id: 'ej_preview', boardId: 'board-preview', stage: 'ready', instruction: 'Show a sorted row instead' };
const editCanvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Program edit ${run}` }) });
const editKey = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${editCanvas.name}:ink`;
const editSeed = { ...seed, blocks: [{ ...program('p-edit', 'Balance over time', 'fixture-growth'), inputs: { rate: 8 }, inputRevision: 1, time: 2, explainEdit: EDIT }] };
// Task 10.1: a third canvas with one program card, the target of an in-app navigation.
const navCanvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Program navigation ${run}` }) });
const navKey = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${navCanvas.name}:ink`;
const navSeed = { ...seed, blocks: [program('p-nav', 'Halving a sorted row', 'fixture-search')] };
const editResult = { jobId: EDIT.id, resultId: 'er_preview', cardId: 'p-edit', canvas: { boardId: EDIT.boardId }, revision: 'xr_preview', baseRevision: 'xr_base', kind: 'program' };
const editAnswer = { job: { id: EDIT.id, version: 1, boardId: EDIT.boardId, cardId: 'p-edit', requestClass: 'edit', stage: 'ready', terminal: true, round: 0, stopReason: 'accepted', failure: null, recovery: [], usage: { credits: 0, unknown: false }, result: editResult },
  block: { type: 'animation', id: 'p-edit', title: 'Halving a sorted row', program: { fixtureId: 'fixture-search' }, explain: editResult } };
// The owner's View only page (/b/<token>): a lead program card, then one saved with no dx/dy, as an /explain job's card is placed.
const { dx: _dx, dy: _dy, ...placed } = program('v-placed', 'Halving a sorted row', 'fixture-search');
const viewCanvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Program view only ${run}` }) });
const viewShare = await api(`/api/learn/boards/${viewCanvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true,
  state: { ...seed, blocks: [program('v-lead', 'Balance over time', 'fixture-growth'), placed] } }) });
// Task 10.2: a fourth canvas for the support-matrix sequences (Focus after the learner's own changes; keyboard focus under the minimap).
const focusCanvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Program focus ${run}` }) });
const focusKey = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${focusCanvas.name}:ink`;
const focusSeed = { ...seed, blocks: [program('f-growth', 'Balance over time', 'fixture-growth'), program('f-search', 'Halving a sorted row', 'fixture-search'), program('f-sort', 'Sorting by neighbour swaps', 'fixture-sort')] };
const viewBoard = async () => JSON.stringify((await api(`/api/learn/boards/${viewCanvas.name}/main`))?.state ?? null);

const browser = await chromium.launch();
const errors = [], stray = [], offOrigin = [];
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(([storageKey, value]) => { if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(value)); }, [key, seed]);
  await context.addInitScript(([storageKey, value]) => { if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(value)); }, [editKey, editSeed]);
  await context.addInitScript(([storageKey, value]) => { if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(value)); }, [navKey, navSeed]);
  await context.addInitScript(([storageKey, value]) => { if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(value)); }, [focusKey, focusSeed]);
  // Playing, scrubbing and controls are local: no model route may be called. Any such POST fails the run.
  await context.route(/\/api\/learn\/(ask|tutor|artifact|home-ask|journeys?|explain)\b/, route => {
    if (route.request().method() === 'GET' || new URL(route.request().url()).pathname === '/api/learn/tutor/next-steps') return route.fallback();
    stray.push(route.request().url());
    return route.abort();
  });
  // The app page itself mounts the Learn notebook frame, which loads from the product's own notebook origin (src/learn-notebook*.js
  // NOTEBOOK_ORIGIN). That is the product, not the card: it is the one origin allowed. Any other host is a failure.
  const NOTEBOOK_ORIGIN = 'https://small-learn-canvas-notebook-dev.tryrabbithole.workers.dev';
  context.on('request', request => { const url = request.url(); if (!url.startsWith(BASE) && !url.startsWith(`${NOTEBOOK_ORIGIN}/`) && !/^(data|blob):/.test(url)) offOrigin.push(url); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  // Every program Worker the page starts (host.js: the built worker.js chunk, not the file parser's), and whether it has closed
  // (Task 10.1: a closed card leaves none running).
  const started = [];
  page.on('worker', worker => {
    if (!/\/worker-[^/]*\.js(\?|$)/.test(worker.url())) return;
    const record = { closed: false };
    started.push(record);
    worker.on('close', () => { record.closed = true; });
  });
  const running = () => started.filter(record => !record.closed).length;
  const until = async (ok, ms = 5000) => { for (const end = Date.now() + ms; !(await ok()) && Date.now() < end;) await page.waitForTimeout(100); return ok(); };
  // Animation frames in which the drawing changed, over ms: the frames the card actually drew (not the clock's ticks).
  const drawnFrames = (id, ms) => page.evaluate(([id, ms]) => new Promise(resolve => {
    const el = document.querySelector(`[data-block-id="${id}"] [data-program-frame]`);
    let changed = false, frames = 0, drawn = 0;
    const watch = new MutationObserver(() => { changed = true; });
    watch.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
    const t0 = performance.now();
    const tick = now => { frames++; if (changed) { drawn++; changed = false; } if (now - t0 < ms) requestAnimationFrame(tick); else { watch.disconnect(); resolve({ ms: Math.round(now - t0), frames, drawn }); } };
    requestAnimationFrame(tick);
  }), [id, ms]);
  // A point on the bare canvas, to pan from (the wheel pans 1:1 there; over a card it may scroll the card).
  const barePoint = () => page.evaluate(() => {
    const s = document.querySelector('[data-canvas-surface]').getBoundingClientRect();
    for (let y = s.top + 60; y < s.bottom - 60; y += 30) for (let x = s.left + 6; x < s.right - 6; x += 30) {
      const el = document.elementFromPoint(x, y);
      if (el?.closest('[data-canvas-surface]') && !el.closest('[data-block-id],[data-item-id],[data-shape-id],[data-canvas-bottom] button,[role="toolbar"],[data-zoom],[data-canvas-minimap],iframe,button')) return { x, y };
    }
    return null;
  });
  const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const card = id => page.locator(`[data-block-id="${id}"]`);
  const timeText = async id => (await card(id).locator('[data-program-time]').innerText()).trim();
  // The readouts are listed under Values in the card's collapsed Notes (owner, 2026-10-28: no strip under the drawing); this
  // opens Notes once and reads them there.
  const readouts = async id => {
    const toggle = card(id).locator('[data-program-notes-toggle]');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    return (await card(id).locator('[data-program-values] [data-program-value]').allInnerTexts()).map(text => text.trim()).join(' · ');
  };
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
    await card('p-growth').locator('[data-program-frame] [data-animation-object]').first().waitFor({ state: 'attached', timeout: 30000 }); // a horizontal axis line has no height, so Playwright calls its group hidden: wait for it to exist
    assert.ok(await card('p-growth').locator('[data-program-frame] polyline').count() >= 1, 'a plotted curve');
    assert.ok(await card('p-growth').locator('[data-program-frame] [data-animation-object="marker"]').count() === 1);
    assert.equal(await card('p-growth').locator('[data-program-readouts]').count(), 0, 'no readout strip under the drawing');
    assert.equal(await card('p-growth').locator('[data-program-notes-toggle]').getAttribute('aria-expanded'), 'false', 'Notes start collapsed');
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
    await card('p-growth').locator('[data-program-frame] [data-animation-object]').first().waitFor({ state: 'attached', timeout: 30000 }); // a horizontal axis line has no height, so Playwright calls its group hidden: wait for it to exist
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
  await check('14 a playing card that leaves the view pauses: no frame is drawn while away, and it returns paused at the moment it left', async () => {
    await scrub('p-growth', 0);
    await card('p-growth').locator('[data-animation-play]').click();
    await page.waitForTimeout(500);
    const playing = await drawnFrames('p-growth', 1000);
    console.log(`measure: p-growth playing in view, headless Chromium ${browser.version()}, 1600x1000: ${playing.drawn} drawn frames in ${playing.frames} animation frames over ${playing.ms} ms`);
    assert.ok(playing.drawn > 0, 'the card draws while it plays in view');
    const at = await barePoint();
    assert.ok(at, 'a bare canvas point to pan from');
    const left = Number((await timeText('p-growth')).replace('s', ''));
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, 5000);
    assert.ok(await until(async () => /Play|Replay/.test(await card('p-growth').locator('[data-animation-play]').innerText())), 'out of view, the card paused');
    const away = await drawnFrames('p-growth', 1500);
    assert.equal(away.drawn, 0, `no frame drawn while out of view (${JSON.stringify(away)})`);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Shift+Digit1');
    await page.waitForTimeout(900);
    const back = Number((await timeText('p-growth')).replace('s', ''));
    assert.ok(back >= left && back - left < 0.6, `returned at ${back}s, left at ${left}s: no fast-forward through the 1.5 s away`);
    assert.match(await card('p-growth').locator('[data-animation-play]').innerText(), /Play/);
    assert.ok(await card('p-growth').locator('[data-program-frame] polyline').count() >= 1, 'the same picture is drawn on return');
  });
  await check('15 deleting a card closes its Worker', async () => {
    await scrub('p-growth', 1); // a fresh evaluation, so the card holds a live Worker
    const before = running();
    assert.ok(before >= 1, 'the card holds a Worker');
    await card('p-growth').click({ button: 'right', position: { x: 20, y: 10 } });
    await page.locator('[data-canvas-menu]').getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await card('p-growth').waitFor({ state: 'detached', timeout: 10000 });
    assert.ok(await until(() => running() <= before - 1), `${before} Workers before, ${running()} after`);
  });
  await check('16 in-app navigation to another canvas closes every Worker the old canvas started', async () => {
    await scrub('p-search', 1);
    const old = started.filter(record => !record.closed);
    assert.ok(old.length >= 1, 'the search card holds a Worker');
    const t0 = Date.now();
    await page.evaluate(path => { history.pushState({ depth: (history.state?.depth || 0) + 1 }, '', path); dispatchEvent(new PopStateEvent('popstate')); }, `/apps/${navCanvas.name}`);
    assert.ok(await until(() => old.every(record => record.closed)), `${old.filter(record => !record.closed).length} of the old canvas's Workers still running`);
    await card('p-nav').locator('[data-program-frame] [data-animation-object^="cell-"]').first().waitFor({ state: 'attached', timeout: 60000 });
    console.log(`measure: in-app navigation to a canvas until its program card's first frame, cold Worker: ${Date.now() - t0} ms (headless Chromium, local stack)`);
  });
  await check("13b on the owner's View only page a click selects a program card saved with no dx/dy, and Focus opens it; nothing is saved", async () => {
    const before = await viewBoard();
    await page.goto(`${BASE}/b/${viewShare.sharing.view}`);
    const placedCard = card('v-placed');
    await placedCard.locator('[data-program-frame] [data-animation-object]').first().waitFor({ state: 'attached', timeout: 60000 });
    assert.equal(await page.locator('[data-view-only]').count(), 1, "the owner's own link is View only");
    await page.waitForTimeout(1500);
    if (await page.locator('[data-focus-back]').count()) { await page.locator('[data-focus-back]').first().click(); await page.waitForTimeout(1200); } // a lead program that cannot be whole opens in Focus
    const { width, height } = page.viewportSize();
    const title = () => placedCard.locator('p[data-drag-zone]').evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x + 30, y: r.y + Math.min(r.height / 2, 12) }; });
    for (let i = 0; i < 12; i++) { const { y } = await title(); if (y > 60 && y < height - 200) break; await page.mouse.move(width * 0.35, height - 120); await page.mouse.wheel(0, y >= height - 200 ? 250 : -250); await page.waitForTimeout(250); }
    const at = await title();
    await page.mouse.click(at.x, at.y);
    await page.locator('[data-focus-button]').waitFor({ timeout: 10000 });
    await page.locator('[data-focus-button]').click();
    await page.locator('[data-focus-host][data-block-id="v-placed"]').waitFor({ timeout: 10000 });
    await shot('F-view-only-focus');
    await page.locator('[data-focus-back]').first().click();
    await page.waitForTimeout(800);
    assert.equal(await viewBoard(), before, 'the View only page saved nothing');
  });
  await check("17 an Edit's Proposed program plays in its own player and saves nothing; Current returns; Discard keeps the card's inputs and time", async () => {
    // The edit job's ready answer (registered last, so it wins over the GET fallback above): a program candidate with no scene.
    await context.route(new RegExp(`/api/learn/explain/jobs/${EDIT.id}[?]`), route => route.fulfill({ json: editAnswer }));
    const workers = { opened: 0, closed: 0 };
    page.on('worker', worker => { workers.opened++; worker.on('close', () => { workers.closed++; }); });
    await page.goto(`${BASE}/apps/${editCanvas.name}`);
    const edit = card('p-edit');
    await edit.locator('[data-program-frame] polyline').first().waitFor({ state: 'attached', timeout: 60000 });
    await edit.locator('[data-explain-show="proposed"]').waitFor({ timeout: 30000 });
    assert.equal(await edit.locator('[data-explain-show="current"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await timeText('p-edit'), '2.0s');
    const live = page.workers().length;
    await edit.locator('[data-explain-show="proposed"]').click();
    await edit.locator('[data-program-frame] [data-animation-object^="cell-"]').first().waitFor({ state: 'attached', timeout: 30000 });
    assert.equal(await edit.locator('[data-program-frame] [data-animation-object^="cell-"]').count(), 15, 'the candidate program, not the accepted one');
    assert.equal(await edit.locator('[data-program-frame] polyline').count(), 0);
    assert.equal(await timeText('p-edit'), '0.0s', 'the preview starts at its own beginning');
    assert.ok(workers.closed >= 1, "the accepted card's host was disposed");
    assert.ok(page.workers().length <= live, 'no host left behind');
    // The preview's own controls and time move the preview only.
    await edit.locator('input[data-input-control="target"]').fill('3');
    await scrub('p-edit', 3);
    await shot('F-edit-proposed');
    await edit.locator('[data-explain-show="current"]').click();
    await edit.locator('[data-program-frame] polyline').first().waitFor({ state: 'attached', timeout: 30000 });
    assert.ok(page.workers().length <= live, 'the preview host was disposed');
    assert.equal(await timeText('p-edit'), '2.0s', "the accepted card's moment, untouched by the preview");
    assert.match(await edit.locator('[data-input-readout="rate"]').innerText(), /^8/);
    // Proposed again starts fresh: the preview's earlier changes were never saved anywhere.
    await edit.locator('[data-explain-show="proposed"]').click();
    await edit.locator('[data-program-frame] [data-animation-object^="cell-"]').first().waitFor({ state: 'attached', timeout: 30000 });
    assert.match(await edit.locator('[data-input-readout="target"]').innerText(), /^11/);
    // Discard: the bar goes, the accepted program, its inputs and its time stay.
    await edit.locator('[data-explain-discard]').click();
    await edit.locator('[data-explain-edit]').waitFor({ state: 'detached', timeout: 10000 });
    await edit.locator('[data-program-frame] polyline').first().waitFor({ state: 'attached', timeout: 30000 });
    assert.equal(await timeText('p-edit'), '2.0s');
    assert.match(await edit.locator('[data-input-readout="rate"]').innerText(), /^8/);
    assert.equal(await edit.locator('[data-program-error]').count(), 0);
  });
  // Task 10.2, the support matrix's own sequence at its own size (1440x900, 100%): each control pressed as a learner does (Playwright
  // scrolls a control into view the way the browser's own reveal does), then Focus from the card's menu.
  const surfaceBox = () => page.locator('[data-canvas-surface]').boundingBox();
  const panBy = async (dx, dy) => { const s = await surfaceBox(); await page.mouse.move(s.x + 8, s.y + s.height - 30); await page.mouse.wheel(dx, dy); await page.waitForTimeout(350); };
  const bring = async target => { for (let i = 0; i < 6; i++) { const r = await target.boundingBox(), s = await surfaceBox(); const dx = r.x + Math.min(r.width, s.width - 40) / 2 - (s.x + s.width / 2), dy = r.height > s.height - 120 ? r.y - (s.y + 70) : r.y + r.height / 2 - (s.y + s.height / 2); if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return; await panBy(dx, dy); } };
  await check('18 Focus after Play, Pause, a scrub, the slider at its maximum and Notes open is placed whole on the pane', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/apps/${focusCanvas.name}`);
    const growth = card('f-growth');
    await growth.locator('[data-program-frame] [data-animation-object]').first().waitFor({ state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await bring(growth);
    const play = growth.locator('[data-animation-play]');
    await bring(play); await play.click(); await page.waitForTimeout(1500); await play.click(); await page.waitForTimeout(600);
    await growth.locator('input[aria-label="Explanation time"]').fill('3'); await page.waitForTimeout(900);
    const rate = growth.locator('input[data-input-control="rate"]'); await rate.fill(await rate.getAttribute('max')); await page.waitForTimeout(900);
    await growth.locator('[data-program-notes-toggle]').click(); await page.waitForTimeout(900);
    await bring(growth);
    await growth.click({ button: 'right', position: { x: 30, y: 10 } });
    await page.locator('[data-menu-focus]').first().click();
    await page.locator('[data-focus-host][data-block-id="f-growth"]').waitFor({ timeout: 10000 });
    await page.waitForTimeout(1200);
    await shot('G-focus-after-changes');
    const s = await surfaceBox(), host = await growth.boundingBox(), drawing = await growth.locator('[data-program-frame]').boundingBox();
    assert.ok(host.x >= s.x - 1 && host.x + host.width <= s.x + s.width + 1, `the focused card on the pane: ${JSON.stringify({ host, surface: s })}`);
    assert.ok(drawing.x >= s.x - 1, `the drawing's left edge (its axis) on screen: ${JSON.stringify(drawing)}`);
    await page.locator('[data-focus-back]').first().click(); await page.waitForTimeout(800);
  });
  await check('19 a card control that takes the keyboard focus under the minimap is revealed clear of it', async () => {
    const button = card('f-sort').locator('[data-program-action="step"]');
    await button.waitFor({ timeout: 30000 });
    const map = await page.locator('[data-canvas-minimap]').boundingBox();
    assert.ok(map, 'the minimap is shown');
    // Pan the camera (wheel, as a learner) until the button sits in the middle of the minimap's box.
    for (let i = 0; i < 6; i++) { const b = await button.boundingBox(); const dx = b.x + b.width / 2 - (map.x + map.width / 2), dy = b.y + b.height / 2 - (map.y + map.height / 2); if (Math.abs(dx) < 4 && Math.abs(dy) < 4) break; await panBy(dx, dy); }
    const under = await button.evaluate(e => { const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && !(t === e || e.contains(t)); });
    assert.ok(under, 'set-up: the button is under the minimap');
    await page.keyboard.press('Shift'); // a keyboard user: the focus that follows is :focus-visible
    await button.focus();
    await page.waitForTimeout(600);
    assert.equal(await button.evaluate(e => e.matches(':focus-visible')), true);
    const reachable = await button.evaluate(e => { const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (t === e || e.contains(t)); });
    await shot('H-keyboard-focus-minimap');
    assert.ok(reachable, 'the focused button is not covered by the minimap');
    await page.setViewportSize({ width: 1600, height: 1000 });
  });
  await check('20 no model route was called, no host other than the app and its own notebook frame was contacted, and no page error', async () => {
    assert.deepEqual(stray, []);
    assert.deepEqual(offOrigin, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
