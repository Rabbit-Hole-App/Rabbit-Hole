// Study map defaults (docs/features/focus-study.md, WP1; src/widget-visibility.js, study-state.js maps, AdaptiveCanvas.jsx,
// StudyPane.jsx useStudy, LearnPage.jsx, ui-prefs.js), against the LOCAL keyless stack only (fresh browser contexts, local D1).
// In Study both the Minimap and the Rabbit Hole Map are hidden until the learner shows one in Study; View > Show / hide checks match
// what is visible; the Canvas preferences (ui-prefs) and the Study choice never write each other. No model is called: every
// model-capable non-GET route is aborted and counted (none may happen). Owner rule 2026-10-21: Claude does not run browser checks;
// CI runs this one (runner fork). The Rabbit Hole Map has no element on a canvas without a dive, so its visibility is read from
// its View checkbox and, where its wrapper exists, from that wrapper.
// Prints `ok <label>` per step, then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/study-maps-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { closeMenus, openMenu, setShown, showHideRow, openShowHide } from './canvas-menu-helpers.mjs';

const total = 8; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('study-maps-check runs against the local stack only');
const SHOTS = process.argv[2] || (process.env.PERSIST ? `${process.env.PERSIST}/../../study-maps-shots` : 'study-maps-shots');
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `studymaps-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const BLOCKS = [{ id: 'ex', type: 'explanation', dx: 0, dy: 0, title: 'Why tides rise', body: 'The moon pulls the near ocean more than the Earth, so the water bulges toward it.' }];
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Study maps ${run}` }) });
const catalog = await api('/api/apps');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const STUDY = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:study`;
const PREFS = 'rh.ui-prefs';
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
// A Study arrangement saved before Study map choices existed: a version 1 value with no maps field.
const OLDER = { v: 1, mode: 'study', work: 'canvas', pin: null, notebookId: null, split: 0.4, reader: null, canvasView: null };

const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course))/;
const model = [], errors = [];
const browser = await chromium.launch();
let page = null, context = null;
// A fresh browser profile: the board, plus (when given) the saved Study arrangement. Seeds are written only while the key is absent,
// so a reload keeps whatever the page has written since.
const open = async ({ study = null } = {}) => {
  await context?.close();
  context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(([entries]) => {
    try { for (const [key, value] of entries) if (value != null && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); } catch { /* a sandboxed frame */ }
    // Whether a minimap (or its loading placeholder) was ever put on the page: a hidden-by-default map must not flash in and then go.
    window.__minimapSeen = false;
    new MutationObserver(() => { if (document.querySelector('[data-canvas-minimap], [data-loading-minimap]')) window.__minimapSeen = true; }).observe(document, { childList: true, subtree: true });
  }, [[[INK, STATE], [STUDY, study]]]);
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== BASE) return route.abort();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    return route.fallback();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
  await load();
};
const ready = async () => { await page.locator('[data-block-id="ex"]').waitFor({ timeout: 60000 }); await page.locator('[data-zoom]').waitFor(); };
const load = async () => { await page.goto(`${BASE}/apps/${canvas.name}`); await ready(); };
const reload = async () => { await page.reload(); await ready(); };

const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page?.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); }
};
const shot = name => page.screenshot({ path: `${SHOTS}/${name}.png` });
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(100); } };
const stored = key => page.evaluate(k => localStorage.getItem(k), key);
const study = async () => JSON.parse((await stored(STUDY)) || 'null');
const view = async label => { const panel = await openMenu(page, 'View'); await panel.getByRole('menuitemradio', { name: label, exact: true }).first().click(); await closeMenus(page); };

// What the learner can see and what the View menu says, side by side.
const minimapShown = async () => (await page.locator('[data-canvas-minimap]').count()) === 1 && await page.locator('[data-canvas-minimap]').isVisible();
// The Rabbit Hole Map (Dive.jsx data-dive-navigator, inside the gutter top's hidden-when-off wrapper) exists only on a canvas with a
// dive; with none, its View checkbox is the whole signal. Never [data-gutter-top] itself: that slot is always drawn, 0 px wide.
const holeMapShown = async () => { const map = page.locator('[data-gutter-top] [data-dive-navigator]'); return (await map.count()) === 0 ? null : await map.first().isVisible(); };
const checks = async () => {
  await openShowHide(page);
  const out = {};
  for (const name of ['Minimap', 'Rabbit Hole Map']) out[name] = (await showHideRow(page, name).getAttribute('aria-checked')) === 'true';
  await closeMenus(page);
  return out;
};
// Both agree: the checkmarks are what is visible.
const expectMaps = async (label, { minimap, holeMap }) => {
  assert.equal(await minimapShown(), minimap, `${label}: the minimap is ${minimap ? 'shown' : 'hidden'}`);
  const hole = await holeMapShown();
  if (hole !== null) assert.equal(hole, holeMap, `${label}: the Rabbit Hole Map is ${holeMap ? 'shown' : 'hidden'}`);
  assert.deepEqual(await checks(), { Minimap: minimap, 'Rabbit Hole Map': holeMap }, `${label}: the View checkmarks match what is visible`);
};
// The zoom group has no empty room above it when the minimap is gone. The zoom row's own margins are counted as the row's: under a
// 1024 px canvas (Study's narrower canvas) it carries @max-[1024px]:mb-2, which is not the minimap's room.
const stackExtra = () => page.evaluate(() => {
  const stack = document.querySelector('[data-zoom-stack]'), zoom = document.querySelector('[data-zoom]');
  if (!stack || !zoom) return null;
  const style = getComputedStyle(zoom);
  return Math.round(stack.getBoundingClientRect().height - (zoom.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom)));
});

await open();

await check('1 Canvas shows both maps; the first View > Study hides both, with the checkmarks matching, and writes no Canvas preference', async () => {
  const prefsBefore = await stored(PREFS);
  await expectMaps('canvas', { minimap: true, holeMap: true });
  await view('Study');
  await page.locator('[data-study-pane]').waitFor({ timeout: 10000 });
  await expectMaps('first Study', { minimap: false, holeMap: false });
  assert.equal(await stored(PREFS), prefsBefore, 'entering Study wrote no Canvas preference');
  assert.deepEqual((await study()).maps ?? {}, {}, 'entering Study recorded no map choice');
  await shot('01-first-study');
});

await check('2 No empty layout space: with the minimap gone the zoom group is just the zoom row; with it shown the group is taller', async () => {
  assert.equal(await stackExtra(), 0, 'both hidden: no leftover room above the zoom controls');
  await setShown(page, 'Minimap', true);
  await until(async () => (await stackExtra()) > 0, 'the minimap takes its room back');
  await setShown(page, 'Minimap', false);
  await until(async () => (await stackExtra()) === 0, 'the minimap frees its room');
  assert.ok(await page.locator('[data-zoom]').isVisible(), 'the zoom controls stay');
});

await check('3 Each View checkbox shows and hides its own map in Study; the other map and the Canvas preferences are untouched', async () => {
  const prefsBefore = await stored(PREFS);
  await setShown(page, 'Minimap', true);
  await expectMaps('minimap on', { minimap: true, holeMap: false });
  await setShown(page, 'Rabbit Hole Map', true);
  await expectMaps('both on', { minimap: true, holeMap: true });
  await setShown(page, 'Minimap', false);
  await expectMaps('minimap off', { minimap: false, holeMap: true });
  await setShown(page, 'Rabbit Hole Map', false);
  await expectMaps('both off', { minimap: false, holeMap: false });
  assert.equal(await stored(PREFS), prefsBefore, 'Study toggles wrote no Canvas preference');
  assert.deepEqual((await study()).maps, { minimap: false, holeMap: false }, 'the Study choice is what was set');
});

await check('4 An explicit Study choice survives a reload (and the pane does not claim it unsaved)', async () => {
  await setShown(page, 'Minimap', true);
  assert.equal((await study()).maps.minimap, true);
  await reload();
  assert.equal((await study()).mode, 'study', 'still studying');
  await expectMaps('after reload', { minimap: true, holeMap: false });
  assert.equal(await page.getByText('Not saved: this browser is not allowing Rabbit Hole to store this', { exact: false }).count(), 0, 'saved, so no Not saved line');
  await shot('04-after-reload');
});

await check('5 Leaving Study gives back the Canvas maps exactly as the learner had them (both on), and Study keeps its own choice', async () => {
  const prefsBefore = await stored(PREFS);
  await view('Canvas');
  await until(async () => (await page.locator('[data-study-pane]').count()) === 0, 'Study closed');
  await expectMaps('back in Canvas', { minimap: true, holeMap: true });
  assert.equal(await stored(PREFS), prefsBefore, 'leaving Study wrote no Canvas preference');
  assert.equal((await study()).maps.minimap, true, 'the Study choice is remembered for the next visit');
});

await check('6 A Canvas toggle is a Canvas preference only: it never writes the Study choice', async () => {
  const studyBefore = await stored(STUDY);
  await setShown(page, 'Minimap', false);
  await expectMaps('canvas minimap off', { minimap: false, holeMap: true });
  assert.equal(JSON.parse(await stored(PREFS)).minimap, false, 'the Canvas preference is saved');
  assert.equal(await stored(STUDY), studyBefore, 'the Study arrangement is untouched');
  await setShown(page, 'Minimap', true);
  assert.equal(JSON.parse(await stored(PREFS)).minimap, true);
});

await check('7 An older saved Study arrangement with no maps field opens with both maps hidden and no map ever painted; leaving it keeps the Canvas maps', async () => {
  await open({ study: OLDER });
  await page.locator('[data-study-pane]').waitFor({ timeout: 10000 });
  await expectMaps('older arrangement', { minimap: false, holeMap: false });
  assert.equal(await stored(PREFS), null, 'restoring it wrote no Canvas preference');
  // Read after the hidden-maps assertions (so a flash does not hide their result) and before View > Canvas shows the minimap: the
  // flag is set once for the page's life, from its first node.
  assert.equal(await page.evaluate(() => window.__minimapSeen), false, 'neither the minimap nor its loading placeholder flashed in on load');
  await view('Canvas');
  await expectMaps('canvas after the older arrangement', { minimap: true, holeMap: true });
  await shot('07-older-arrangement');
});

await check('8 View > Show / hide > Toolbar is remembered across a reload (ui-prefs); no model call, no page error', async () => {
  await open();
  await setShown(page, 'Toolbar', false);
  await until(async () => (await page.locator('[role="toolbar"][aria-label="Canvas tools"]').count()) === 0, 'the toolbar hides');
  assert.equal(JSON.parse(await stored(PREFS)).toolbar, false, 'the choice is saved');
  await reload();
  assert.equal(await page.locator('[role="toolbar"][aria-label="Canvas tools"]').count(), 0, 'still hidden after a reload');
  assert.deepEqual(model, [], 'no model-capable request');
  assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
});

await browser.close();
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
