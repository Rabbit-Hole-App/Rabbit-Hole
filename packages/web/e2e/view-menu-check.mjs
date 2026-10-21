// The canvas View menu's widget switches (owner brief 2026-10-21 item 3; src/CanvasMenubar.jsx, LearnPage.jsx, AdaptiveCanvas.jsx,
// ui-prefs.js): Minimap, Rabbit Hole Map and Curious are three identical switch rows, all on by default, each remembered on this
// device across a reload. Off hides the widget and frees its room without resetting it; Curious on still shows only what
// Tutor allows (Off, or paused, shows nothing). Toggling makes no request a model could answer. Against the LOCAL keyless
// stack only (toc-up.sh: JOURNEY_MODEL_STUB=fixtures, no model key): the hook planner answers from its fixtures, the one
// learner turn per hook set is answered here, and every other model-capable route is aborted and counted. Prints no secrets.
// Usage: BASE=http://127.0.0.1:9631 SMALL_CP=http://127.0.0.1:9633 VARS=<cp .dev.vars> node e2e/view-menu-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { usageFeature } from '../../control-plane/src/learn-usage.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9631';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9633';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('view-menu-check runs against the local stack only');
const SHOTS = process.argv[2] || 'view-menu-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `viewmenu-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const BLOCKS = [
  { id: 'c-1', type: 'explanation', dx: 0, dy: 0, title: 'Why bread rises', body: 'Yeast ferments sugar into carbon dioxide, which the gluten traps.' },
  { id: 'c-2', type: 'explanation', dx: 0, dy: 0, title: 'What kneading does', body: 'Kneading aligns gluten strands into a stretchy network.' },
];
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `How bread rises ${run}` }) });
const catalog = await api('/api/apps');
const seed = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`]: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS } };
// Owner 3a: hooks are proactive Tutor suggestions, so the canvas selects Tutor (On and unpaused by default).
const control = async event => {
  const { state } = await api(`/api/learn/coaching?app=${canvas.name}&board=main`);
  const saved = await api('/api/learn/coaching', { method: 'POST', body: JSON.stringify({ app: canvas.name, board: 'main', actionId: `${event.type}-${Date.now()}`, expectedRevision: state.revision, action: 'save_controls', payload: { event } }) });
  assert.ok(saved.state, `coaching ${event.type} saved`);
  return saved.state.controls;
};
await control({ type: 'select_mode', mode: 'tutor' });

const browser = await chromium.launch();
const errors = [], model = [], hooksAsked = [], turns = [];
// Every model-capable route (the accounting list, learn-usage.js usageFeature, plus /api/ask) is aborted and counted, except
// the hooks (answered by the keyless stack's fixtures, counted apart) and the one learner turn per set, answered here.
// Reading the Chat pane's threads (GET /api/ask/threads...) is not a question: it passes.
const modelRoute = (method, path) => (/^\/api\/ask(\/|$)/.test(path) && !(method === 'GET' && path.startsWith('/api/ask/threads'))) || !!usageFeature(method, path);
const REPLY = 'Yeast makes gas and the gluten traps it.';
const fresh = async (viewport = { width: 1600, height: 900 }) => {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(entries => { for (const [key, value] of Object.entries(entries)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, seed);
  await context.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/learn/tutor/plan') { turns.push(path); return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: REPLY }] } }); }
    if (/\/next-steps$/.test(path)) { hooksAsked.push(path); return route.fallback(); }
    if (modelRoute(request.method(), path)) { model.push(`${request.method()} ${path}`); return route.abort(); }
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
  return page;
};
const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); } catch (error) { failures.push(label); console.log(`FAIL ${label}: ${error.message.split('\n').slice(0, 6).join(' / ')}`); }
};
const shot = async (page, name) => { await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const box = (page, selector) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width || r.height ? { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } : null; }, selector);
const waitBox = (page, selector, shown) => page.waitForFunction(([sel, on]) => { const e = document.querySelector(sel), r = e?.getBoundingClientRect(); return on ? !!r && r.width > 0 && r.height > 0 : !r || (!r.width && !r.height); }, [selector, shown], { timeout: 10000 });
// No request is the thing asserted: a quiet window, then the counts.
const quiet = async (page, label, before) => { await page.waitForTimeout(2500); assert.deepEqual([model.length, hooksAsked.length], before, `${label}: model ${model.slice(before[0]).join()} hooks ${hooksAsked.length - before[1]}`); };
const counts = () => [model.length, hooksAsked.length];

const menubar = page => page.locator('[role="menubar"][aria-label="Canvas menu"]');
const viewButton = page => menubar(page).getByRole('menuitem', { name: 'View', exact: true });
const NAMES = ['Minimap', 'Rabbit Hole Map', 'Curious'];
const KEYS = { Minimap: 'minimap', 'Rabbit Hole Map': 'holeMap', Curious: 'curious' };
const sw = (page, name) => menubar(page).getByRole('switch', { name, exact: true });
const openView = async page => { if (!(await sw(page, 'Minimap').count())) await viewButton(page).click(); await sw(page, 'Minimap').waitFor({ timeout: 5000 }); };
const closeView = async page => { if (await sw(page, 'Minimap').count()) await page.keyboard.press('Escape'); await sw(page, 'Minimap').waitFor({ state: 'detached', timeout: 5000 }); };
const states = async page => { await openView(page); const out = []; for (const name of NAMES) out.push(await sw(page, name).getAttribute('aria-checked')); return out; };
// Sets one switch by clicking its row's label text (the switch takes the click), the menu staying open.
const setSwitch = async (page, name, on) => {
  await openView(page);
  if ((await sw(page, name).getAttribute('aria-checked')) !== String(on)) await menubar(page).locator('[data-menu-switch]', { hasText: name }).locator('span', { hasText: name }).click();
  await checked(page, name, on);
};
const checked = (page, name, on) => page.waitForFunction(([n, v]) => [...document.querySelectorAll('[role="menubar"] [role="switch"]')].find(e => e.getAttribute('aria-label') === n)?.getAttribute('aria-checked') === v, [name, String(on)], { timeout: 5000 });
const saved = page => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('rh.ui-prefs') || '{}'); } catch { return {}; } });
const MINIMAP = '[data-canvas-minimap] [aria-label="Canvas overview"]', MAP = '[data-dive-navigator]', HOOKS = '[data-hooks-slot] section[data-next-steps]';
const open = async page => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-block-id="c-1"]').waitFor({ timeout: 60000 });
  await page.locator(MAP).first().waitFor({ timeout: 30000 });
};
// One learner turn, the Tutor plan answered here; turn() then waits for the hook set from the stack's fixtures.
const ask = async (page, question) => {
  await page.locator('[data-chat-pane] [data-tutor-switch="on"] [role="switch"]:enabled').waitFor({ timeout: 60000 });
  const answers = await page.locator('[data-chat-pane] [data-answer]').filter({ hasText: REPLY }).count();
  const field = page.locator('[data-chat-pane] [data-chat-composer] textarea').first();
  await field.fill(question);
  await field.press('Enter');
  await page.waitForFunction(([n, text]) => [...document.querySelectorAll('[data-chat-pane] [data-answer]')].filter(e => e.textContent.includes(text)).length > n, [answers, REPLY], { timeout: 30000 });
};
const turn = async (page, question) => {
  await ask(page, question);
  await page.locator('[data-hooks-slot] section[data-next-steps="ready"]').waitFor({ timeout: 60000 });
};
const hookTexts = page => page.locator('[data-hooks-slot] [data-next-step]').allInnerTexts();

const page = await fresh();
await check('1 defaults: View lists Minimap, Rabbit Hole Map and Curious as switches, all on, the three widgets shown; opening makes no model request', async () => {
  const before = counts();
  await open(page);
  assert.deepEqual(await states(page), ['true', 'true', 'true']);
  assert.ok(await box(page, MINIMAP), 'the minimap');
  assert.ok(await box(page, MAP), 'the Rabbit Hole Map');
  await shot(page, 'view-01-defaults-light');
  await closeView(page);
  await quiet(page, 'open', before);
});

await check('2 the three rows are identical: one height, one switch size, switches and labels on one edge', async () => {
  await openView(page);
  const rows = await menubar(page).locator('[data-menu-switch]').evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect(), s = el.querySelector('[role="switch"]').getBoundingClientRect(), t = [...el.querySelectorAll('span')].find(e => e.textContent.trim()).getBoundingClientRect();
    return { name: el.textContent.trim(), h: r.height, w: r.width, sw: s.width, sh: s.height, sr: Math.round(r.right - s.right), tx: Math.round(t.left - r.left), cls: el.className };
  }));
  assert.deepEqual(rows.map(row => row.name), NAMES);
  for (const row of rows.slice(1)) for (const key of ['h', 'w', 'sw', 'sh', 'sr', 'tx', 'cls']) assert.equal(row[key], rows[0][key], `${row.name} ${key} differs from Minimap`);
  await closeView(page);
});

await check('3 a learner turn brings the Curious set (fixtures; the turn answered here)', async () => {
  await turn(page, 'Why does bread dough rise?');
  assert.equal((await hookTexts(page)).length, 3);
  assert.deepEqual(model, [], 'no model-capable request was let through');
  await shot(page, 'view-03-all-on');
});

await check('4 Minimap off alone: the minimap leaves and the zoom stack shrinks to the zoom row; the map and Curious stay; on again: same view', async () => {
  const before = counts();
  const zoomBefore = await box(page, '[data-zoom]'), stackBefore = await box(page, '[data-zoom-stack]'), mini = await box(page, MINIMAP);
  const view = await page.locator('[data-zoom] button[title="Reset zoom"]').innerText();
  const drawn = await page.locator(MINIMAP).evaluate(el => el.innerHTML);
  await setSwitch(page, 'Minimap', false);
  assert.deepEqual(await states(page), ['false', 'true', 'true']);
  await waitBox(page, '[data-canvas-minimap]', false);
  const stackAfter = await box(page, '[data-zoom-stack]'), zoomAfter = await box(page, '[data-zoom]');
  assert.ok(stackBefore.h - stackAfter.h >= mini.h - 1, `the stack kept the minimap's room: ${stackBefore.h} -> ${stackAfter.h}`);
  assert.ok(Math.abs(zoomAfter.bottom - zoomBefore.bottom) <= 1, 'the zoom row moved');
  assert.ok(await box(page, MAP) && await box(page, HOOKS), 'the others stay shown');
  await shot(page, 'view-04-minimap-off');
  await setSwitch(page, 'Minimap', true);
  await waitBox(page, MINIMAP, true);
  assert.equal(await page.locator('[data-zoom] button[title="Reset zoom"]').innerText(), view, 'the zoom changed');
  assert.equal(await page.locator(MINIMAP).evaluate(el => el.innerHTML), drawn, 'the minimap shows another view');
  await closeView(page);
  await quiet(page, 'Minimap', before);
});

await check('5 Rabbit Hole Map off alone: its 92 px column leaves and the canvas widens; a moved map comes back where it was', async () => {
  const before = counts();
  // Move the map one step with its grip's arrow key (Dive.jsx): a learner's own spot, kept while hidden.
  await page.locator('[data-dive-grip]').focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('[data-dive-map]')?.hasAttribute('data-moved'), null, { timeout: 5000 });
  const at = await box(page, '[data-dive-map]'), surfaceBefore = await box(page, '[data-canvas-surface]'), column = await box(page, '[data-dive-gutter]');
  assert.ok(column && column.w >= 90, `the map's own column: ${JSON.stringify(column)}`);
  await setSwitch(page, 'Rabbit Hole Map', false);
  assert.deepEqual(await states(page), ['true', 'false', 'true']);
  await waitBox(page, MAP, false);
  await waitBox(page, '[data-dive-gutter]', false);
  await page.waitForFunction(w => document.querySelector('[data-canvas-surface]').getBoundingClientRect().width >= w + 90, surfaceBefore.w, { timeout: 5000 });
  assert.ok(await box(page, MINIMAP) && await box(page, HOOKS), 'the others stay shown');
  await shot(page, 'view-05-map-off');
  await setSwitch(page, 'Rabbit Hole Map', true);
  await waitBox(page, MAP, true);
  await page.waitForFunction(x => Math.abs(document.querySelector('[data-dive-map]').getBoundingClientRect().x - x) <= 1, at.x, { timeout: 5000 });
  assert.ok(await page.locator('[data-dive-map]').evaluate(el => el.hasAttribute('data-moved')), 'the moved map went back to its slot');
  await page.locator('[data-dive-grip]').dblclick(); // back to its slot for the rest
  await closeView(page);
  await quiet(page, 'Rabbit Hole Map', before);
});

await check('6 Curious off alone: the card leaves and its corner is free; on again: the same minimized card, then the same three hooks, never a new set', async () => {
  const before = counts();
  const hooks = await hookTexts(page);
  await page.locator('[data-next-steps-minimize]').click();
  await page.locator('[data-hooks-slot] [data-next-steps-minimized]').waitFor({ timeout: 5000 });
  await setSwitch(page, 'Curious', false);
  assert.deepEqual(await states(page), ['true', 'true', 'false']);
  await waitBox(page, '[data-hooks-slot]', false);
  assert.equal(await page.locator('[data-canvas-lower-right]').evaluate(el => [...el.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height; }).length), 0, 'something still takes the lower-right corner');
  assert.ok(await box(page, MINIMAP) && await box(page, MAP), 'the others stay shown');
  await shot(page, 'view-06-curious-off');
  await setSwitch(page, 'Curious', true);
  await page.locator('[data-hooks-slot] [data-next-steps-minimized]').waitFor({ timeout: 5000 });
  await closeView(page);
  await page.locator('[data-next-steps-restore]').click();
  await page.locator('[data-hooks-slot] section[data-next-steps="ready"]').waitFor({ timeout: 5000 });
  assert.deepEqual(await hookTexts(page), hooks, 'the suggestions changed');
  await quiet(page, 'Curious', before);
});

await check('7 the choices are remembered: Minimap and Curious off survive a reload (this device), then all on again', async () => {
  const before = counts();
  await setSwitch(page, 'Minimap', false);
  await setSwitch(page, 'Curious', false);
  assert.deepEqual(await saved(page), { textSize: 'default', reduceMotion: false, chatSend: 'enter', minimap: false, holeMap: true, curious: false });
  await page.reload();
  await page.locator('[data-block-id="c-1"]').waitFor({ timeout: 60000 });
  await page.locator(MAP).first().waitFor({ timeout: 30000 });
  assert.deepEqual(await states(page), ['false', 'true', 'false']);
  assert.equal(await box(page, '[data-canvas-minimap]'), null, 'the minimap came back');
  await shot(page, 'view-07-reloaded');
  for (const name of NAMES) await setSwitch(page, name, true);
  assert.deepEqual(await saved(page), { textSize: 'default', reduceMotion: false, chatSend: 'enter', minimap: true, holeMap: true, curious: true });
  await waitBox(page, MINIMAP, true);
  await closeView(page);
  await quiet(page, 'reload', before);
});

await check('8 keyboard: Tab reaches the Minimap switch with a visible focus, Space and Enter flip it with the menu open, Tab moves on, Escape closes', async () => {
  const before = counts();
  await viewButton(page).focus();
  await page.keyboard.press('Enter');
  await sw(page, 'Minimap').waitFor({ timeout: 5000 });
  for (let i = 0; i < 12 && !(await sw(page, 'Minimap').evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  assert.ok(await sw(page, 'Minimap').evaluate(el => el === document.activeElement && el.matches(':focus-visible')), 'Minimap switch focused, focus visible');
  await shot(page, 'view-08-keyboard-focus');
  await page.keyboard.press('Space');
  await checked(page, 'Minimap', false);
  await waitBox(page, '[data-canvas-minimap]', false);
  await page.keyboard.press('Enter');
  await checked(page, 'Minimap', true);
  await page.keyboard.press('Tab');
  assert.ok(await sw(page, 'Rabbit Hole Map').evaluate(el => el === document.activeElement), 'Tab moves to Rabbit Hole Map');
  await page.keyboard.press('Space');
  await checked(page, 'Rabbit Hole Map', false);
  await waitBox(page, MAP, false);
  await page.keyboard.press('Space');
  await checked(page, 'Rabbit Hole Map', true);
  await waitBox(page, MAP, true);
  await page.keyboard.press('Tab');
  assert.ok(await sw(page, 'Curious').evaluate(el => el === document.activeElement), 'Tab moves to Curious');
  await page.keyboard.press('Escape');
  await sw(page, 'Minimap').waitFor({ state: 'detached', timeout: 5000 });
  await waitBox(page, MINIMAP, true);
  await quiet(page, 'keyboard', before);
});

// Owner brief 2026-10-21 message 25 item 2: hidden, Curious asks nothing in the background; shown again, the saved set at once.
await check('8a Curious hidden: learner turns ask for no set; shown again: the saved set at once, still no request', async () => {
  await turn(page, 'What does salt do to bread?'); // the reload in 7 left this mount with no set: one, with Curious shown
  const hooks = await hookTexts(page);
  assert.equal(hooks.length, 3);
  const before = counts();
  await setSwitch(page, 'Curious', false);
  await closeView(page);
  await ask(page, 'Does salt slow the yeast?');
  await ask(page, 'Why does dough need to rest?');
  await quiet(page, 'hidden turns', before);
  await setSwitch(page, 'Curious', true);
  await closeView(page);
  await page.locator('[data-hooks-slot] section[data-next-steps="ready"]').waitFor({ timeout: 5000 });
  assert.deepEqual(await hookTexts(page), hooks, 'not the saved set');
  await shot(page, 'view-08a-saved-set-back');
  await quiet(page, 'shown again', before);
});

await check('8b nothing saved: hidden from the start, a turn, then shown: a compact empty state; only its button asks, once', async () => {
  const empty = await fresh();
  await empty.addInitScript(() => localStorage.setItem('rh.ui-prefs', JSON.stringify({ curious: false })));
  await open(empty);
  const before = counts();
  await ask(empty, 'How warm should the proofing spot be?');
  await quiet(empty, 'hidden turn on a fresh page', before);
  await setSwitch(empty, 'Curious', true);
  await closeView(empty);
  const state = empty.locator('[data-hooks-slot] section[data-next-steps="empty"]');
  await state.waitFor({ timeout: 5000 });
  assert.match(await state.innerText(), /No suggestions yet/);
  await shot(empty, 'view-08b-empty-state');
  await quiet(empty, 'empty state shown', before);
  await state.getByRole('button', { name: 'Suggest next steps' }).click();
  await empty.locator('[data-hooks-slot] section[data-next-steps="ready"]').waitFor({ timeout: 60000 });
  await empty.waitForTimeout(2500); // a second request would come within the debounce
  assert.deepEqual([model.length - before[0], hooksAsked.length - before[1]], [0, 1], 'exactly one hook request, on the click');
  await setSwitch(empty, 'Curious', false); // leave this device's choice as found
  await setSwitch(empty, 'Curious', true);
  await empty.context().close();
});

await check('9 Tutor Off: the set leaves; Curious off and on again shows nothing and asks nothing', async () => {
  const before = counts();
  await page.locator('[data-chat-pane]').getByRole('switch', { name: 'Proactive Tutor suggestions' }).click();
  await page.locator('[data-chat-pane] [data-tutor-switch="off"]').waitFor({ timeout: 10000 });
  await page.locator(HOOKS).waitFor({ state: 'detached', timeout: 10000 });
  await setSwitch(page, 'Curious', false);
  await setSwitch(page, 'Curious', true);
  await closeView(page);
  assert.equal(await page.locator('[data-next-steps]').count(), 0, 'Curious on brought back a set Tutor Off hides');
  await shot(page, 'view-09-tutor-off');
  await quiet(page, 'Tutor Off', before);
  await page.locator('[data-chat-pane]').getByRole('switch', { name: 'Proactive Tutor suggestions' }).click();
  await page.locator('[data-chat-pane] [data-tutor-switch="on"]').waitFor({ timeout: 10000 });
});

await check('10 suggestions paused: a new set leaves when Tutor is paused; Curious off and on again shows nothing and asks nothing', async () => {
  await turn(page, 'What does kneading change?');
  const before = counts();
  // Paused from another place (the saved control), which the page reads back as it does when it becomes visible again.
  assert.equal((await control({ type: 'not_now' })).suggestionsPaused, true);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.locator('[data-tutor-status="resume"]').waitFor({ timeout: 10000 });
  await page.locator(HOOKS).waitFor({ state: 'detached', timeout: 10000 });
  await setSwitch(page, 'Curious', false);
  await setSwitch(page, 'Curious', true);
  await closeView(page);
  assert.equal(await page.locator('[data-next-steps]').count(), 0, 'Curious on brought back a set paused suggestions hide');
  await shot(page, 'view-10-paused');
  await quiet(page, 'paused', before);
  await control({ type: 'resume' });
});

// The switch's track and knob read on the menu in both themes: on is the accent, off is not, the knob differs from both.
const colours = page => menubar(page).locator('[data-menu-switch]').evaluateAll(els => els.map(el => {
  const s = el.querySelector('[role="switch"]'), k = s.querySelector('span'), menu = el.parentElement;
  return { on: s.getAttribute('aria-checked'), track: getComputedStyle(s).backgroundColor, knob: getComputedStyle(k).backgroundColor, menu: getComputedStyle(menu).backgroundColor, text: getComputedStyle(el).color };
}));
await check('11 light and dark: on and off tracks differ, the knob stands out on both, the label reads on the menu', async () => {
  for (const theme of ['light', 'dark']) {
    const themed = await fresh();
    await themed.addInitScript(t => localStorage.setItem('small.theme', t), theme);
    await open(themed);
    assert.equal(await themed.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
    await setSwitch(themed, 'Rabbit Hole Map', false);
    // The track eases between colours (Toggle: transition-colors): wait for the off track to settle before reading.
    await themed.waitForFunction(() => { const s = [...document.querySelectorAll('[role="menubar"] [data-menu-switch] [role="switch"]')]; const on = s.find(e => e.getAttribute('aria-checked') === 'true'), off = s.find(e => e.getAttribute('aria-checked') === 'false'); return on && off && getComputedStyle(on).backgroundColor !== getComputedStyle(off).backgroundColor; }, null, { timeout: 5000 }).catch(() => {});
    const rows = await colours(themed);
    const on = rows.find(row => row.on === 'true'), off = rows.find(row => row.on === 'false');
    assert.notEqual(on.track, off.track, `${theme}: on and off tracks look the same`);
    for (const row of rows) { assert.notEqual(row.knob, row.track, `${theme}: knob on track`); assert.notEqual(row.text, row.menu, `${theme}: label on menu`); }
    assert.notEqual(off.track, off.menu, `${theme}: the off track vanishes into the menu`);
    await shot(themed, `view-11-menu-${theme}`);
    await setSwitch(themed, 'Rabbit Hole Map', true);
    await themed.context().close();
  }
});

await check('12 narrow panel (1200 wide, Chat open): the map sits atop the tools; off, it leaves and the tools take its room; phone: Minimap off drops the overview button', async () => {
  const narrow = await fresh({ width: 1200, height: 800 });
  await open(narrow);
  // The canvas measures its width once laid out; the map then joins the tools (mapBeside, canvas-clipping.md).
  await waitBox(narrow, '[data-gutter-top] [data-dive-navigator]', true);
  assert.equal(await box(narrow, '[data-dive-gutter]'), null, 'at 1200 the map has no column of its own');
  const top = await box(narrow, '[data-gutter-top]');
  await setSwitch(narrow, 'Rabbit Hole Map', false);
  await waitBox(narrow, MAP, false);
  const after = await box(narrow, '[data-gutter-top]');
  assert.ok(!after || after.h < top.h - 40, `the tools gutter top kept the map's room: ${top.h} -> ${after?.h}`);
  await shot(narrow, 'view-12-narrow-map-off');
  await setSwitch(narrow, 'Rabbit Hole Map', true);
  await waitBox(narrow, MAP, true);
  await closeView(narrow);
  await narrow.context().close();
  const phone = await fresh({ width: 390, height: 844 });
  await phone.goto(`${BASE}/apps/${canvas.name}`);
  await phone.locator('[data-block-id="c-1"]').waitFor({ timeout: 60000 });
  await phone.getByRole('button', { name: 'Show overview' }).waitFor({ timeout: 10000 });
  await setSwitch(phone, 'Minimap', false);
  await closeView(phone);
  await phone.getByRole('button', { name: 'Show overview' }).waitFor({ state: 'detached', timeout: 5000 });
  await shot(phone, 'view-12-phone-minimap-off');
  await setSwitch(phone, 'Minimap', true);
  await closeView(phone);
  await phone.getByRole('button', { name: 'Show overview' }).waitFor({ timeout: 5000 });
  await phone.context().close();
});

await check('13 no model-capable request was let through, and hook sets came only after learner turns with Curious shown or the empty state request', async () => {
  assert.deepEqual(model, []);
  // The no-request windows themselves are asserted in 4-10; here only the totals: three shown turns and the one click asked.
  assert.ok(turns.length >= 3, `Tutor turns ${turns.length}`);
  assert.ok(hooksAsked.length >= 4 && hooksAsked.length <= 5, `hook requests ${hooksAsked.length}`);
});

await browser.close();
const fatal = errors.filter(e => !/ResizeObserver/.test(e));
if (fatal.length) { console.log(`page errors:\n${fatal.join('\n')}`); process.exitCode = 1; }
const total = 15;
console.log(`${results.length}/${total} view menu checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
if (results.length !== total) process.exitCode = 1;
