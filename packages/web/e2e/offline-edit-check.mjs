// Offline edits and unreadable storage on an open canvas (follow-up R3 items 1 and 3), on the LOCAL stack only: local D1,
// a test session, no model call (the Learn ask and the Tutor planner are aborted). Prints ids and counts, no secrets.
// 1 The owner's scenario: open a canvas, go offline, edit, trigger a feature whose code is not loaded yet (the equation
//   editor), reconnect, save, reload. The rejected import never reloads the page, never reaches the root crash screen and
//   never lands on the browser's network error page; the feature says so in its place with Retry; Retry waits while an
//   edit is not on the server, then reloads; the edit survives.
// 3 A malformed saved copy at canvas open, with this browser's version current: never saved as an empty board over the
//   server's content; the server's copy loads instead.
// Usage: BASE=http://127.0.0.1:8941 SMALL_CP=http://127.0.0.1:8943 VARS=<.dev.vars> OUT=<dir> node e2e/offline-edit-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('offline-edit-check runs against the local stack only');
const OUT = process.env.OUT || 'offline-edit-shots';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `offline-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const until = async (what, fn, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 250)); } throw Error(`timed out: ${what}`); };

const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Offline edit ${run}` }) });
assert.match(canvas.name || '', /^canvas-[0-9a-f]{8}$/, 'the canvas was created');
const BOARD = `/api/learn/boards/${canvas.name}/main`;
const created = await api(BOARD);
const EMPTY = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [] };
await api(BOARD, { method: 'PUT', body: JSON.stringify({ state: { ...EMPTY, blocks: [{ id: 'c1', type: 'explanation', dx: 0, dy: 0, title: 'Light reactions', body: 'Light splits water.' }] }, version: created.version ?? 0 }) });
const catalog = await api('/api/apps');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const board = () => api(BOARD);
const summary = state => ({ strokes: state?.strokes?.length ?? null, equations: (state?.items || []).filter(item => item.kind === 'equation').length, cards: (state?.blocks || []).length });

const browser = await chromium.launch();
const errors = [];
const profile = async (init = null) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(() => { window.__toasts = []; window.addEventListener('small:toast', event => window.__toasts.push(event.detail?.message ?? event.detail)); });
  if (init) await context.addInitScript(init.script, init.arg);
  await context.route(/\/api\/learn\/(ask|tutor\/plan)(\?|$)/, route => route.abort()); // no model call can leave this check
  const page = await context.newPage();
  const navigations = [], puts = [];
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === BOARD) puts.push(Date.now()); });
  page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
  return { context, page, navigations, puts };
};
const results = [];
const check = async (label, page, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${label}`); }
  catch (error) { results.push(false); console.log(`FAIL ${label}: ${String(error.message).split('\n')[0].slice(0, 400)}`); await page.screenshot({ path: `${OUT}/failed-${results.length}.png` }).catch(() => {}); }
};
const crashScreen = page => page.getByText("This page couldn't load").count();
const toasts = page => page.evaluate(() => window.__toasts);
const local = page => page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }, INK);
const open = async page => { await page.goto(`${BASE}/apps/${canvas.name}`); await page.locator('[data-block-id="c1"]').first().waitFor({ timeout: 60000 }); };
// A point of bare canvas: on the surface, on no card, note, equation, panel or control (as equation-check finds one).
const blank = async (page, from = 0) => {
  const point = await page.evaluate(start => {
    const found = [];
    for (let y = 200; y < 660; y += 40) for (let x = 420; x < 960; x += 40) {
      const element = document.elementFromPoint(x, y);
      if (element?.closest('[data-canvas-surface]') && !element.closest('[data-block-id],[data-item-id],[data-block],[data-equation-palette],[data-feature-unavailable],[role="dialog"],[data-chat-pane],button,a,iframe,input,textarea')) found.push({ x, y });
    }
    return found[start] || found[0] || null;
  }, from);
  assert.ok(point, 'a bare point of canvas');
  return point;
};
const draw = async (page, from = 0) => {
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  const { x, y } = await blank(page, from);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 120, y + 20, { steps: 8 }); await page.mouse.up();
  await page.keyboard.press('Escape');
};
const placeEquation = async (page, from) => {
  await page.getByRole('button', { name: 'Equation', exact: true }).click();
  const { x, y } = await blank(page, from);
  await page.mouse.click(x, y);
};

// ---------------------------------------------------------------- 1 the owner's scenario
{
  const A = await profile();
  const { page, context, navigations } = A;
  const unavailable = page.locator('[data-feature-unavailable]');
  const retry = unavailable.getByRole('button', { name: 'Retry', exact: true });
  let before;
  await check('1a offline: an edit, then the equation editor (not loaded yet) - no reload, no crash screen, Retry in its place', page, async () => {
    await open(page);
    before = await until('the seeded board', async () => { const b = await board(); return b.version >= 1 && b; });
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => /\/EquationEditor-[^/]*\.js$/.test(entry.name))), false, 'the equation editor is not loaded before going offline');
    const opened = navigations.length;
    await context.setOffline(true);
    await draw(page);
    await placeEquation(page, 6);
    await unavailable.waitFor({ timeout: 15000 });
    assert.match(await unavailable.innerText(), /You're offline, so the equation editor could not load\. Your edits stay on this page\./);
    await retry.waitFor();
    await page.waitForFunction(key => { try { const s = JSON.parse(localStorage.getItem(key) || '{}'); return s.strokes?.length === 1 && (s.items || []).some(i => i.kind === 'equation'); } catch { return false; } }, INK, { timeout: 10000 });
    assert.deepEqual(navigations.slice(opened), [], 'no navigation: no reload and no network error page');
    assert.equal(await crashScreen(page), 0, 'the root crash screen never replaced the page');
    assert.equal(await page.getByLabel('Lesson canvas').isVisible(), true, 'the canvas is still there');
    assert.equal((await board()).version, before.version, 'nothing reached the server offline');
    await page.screenshot({ path: `${OUT}/1a-offline-feature-unavailable.png` });
    // Retry offline: the import fails again and nothing reloads.
    await retry.click();
    await until('Retry settled', () => retry.isEnabled());
    assert.match(await unavailable.innerText(), /You're offline/);
    assert.deepEqual(navigations.slice(opened), [], 'Retry offline never reloads');
  });

  let held = [], hold = true;
  await check('1b reconnect while the save is still on its way: Retry does not reload, and says why', page, async () => {
    await context.route(url => url.pathname === BOARD, route => (route.request().method() === 'PUT' && hold ? held.push(route) : route.fallback()));
    const at = navigations.length;
    await context.setOffline(false);
    await until('the reconnect save, held', () => held.length > 0, 15000);
    await unavailable.getByText('The equation editor could not load. A newer version may be out.').waitFor({ timeout: 5000 });
    await retry.click();
    await unavailable.getByText('Your latest edits are not saved yet, so the page was not reloaded. Retry once they are saved.').waitFor({ timeout: 10000 });
    assert.deepEqual(navigations.slice(at), [], 'no reload while the edit is not on the server');
    assert.equal((await board()).version, before.version);
    await page.screenshot({ path: `${OUT}/1b-online-unsaved-retry.png` });
  });

  await check('1c the save lands through the existing path; Retry then reloads, the edit survives and the equation editor loads', page, async () => {
    hold = false;
    for (const route of held.splice(0)) await route.fallback();
    const saved = await until('the offline edit on the server', async () => { const b = await board(); return summary(b.state).strokes === 1 && summary(b.state).equations === 1 && b; });
    assert.equal(saved.version, before.version + 1, 'one save of the offline edit');
    const at = navigations.length;
    await until('Retry ready', () => retry.isEnabled());
    const loaded = page.waitForEvent('load', { timeout: 30000 });
    await retry.click();
    await loaded;
    await page.locator('[data-block-id="c1"]').first().waitFor({ timeout: 60000 });
    assert.deepEqual(navigations.slice(at), [`${BASE}/apps/${canvas.name}`], 'one reload, of the canvas');
    await until('the edit in this browser after the reload', async () => { const s = summary(await local(page)); return s.strokes === 1 && s.equations === 1; });
    assert.equal(await page.locator('[data-equation]').count() >= 1, true, 'the equation is on the canvas');
    // And a plain reload: still there, from the server's copy.
    await page.reload();
    await page.locator('[data-block-id="c1"]').first().waitFor({ timeout: 60000 });
    await until('the edit after a plain reload', async () => { const s = summary(await local(page)); return s.strokes === 1 && s.equations === 1; });
    const after = await board();
    assert.deepEqual(summary(after.state), { strokes: 1, equations: 1, cards: 1 });
    assert.equal(after.version, saved.version, 'opening again saves nothing');
    assert.equal(navigations.some(url => !url.startsWith(BASE)), false, `never the network error page: ${navigations.join(' ')}`);
    assert.equal(await crashScreen(page), 0);
    // The feature works once the page has its code: a new equation opens the editor.
    await placeEquation(page, 2);
    await page.locator('math-field').waitFor({ timeout: 20000 });
    assert.equal(await unavailable.count(), 0);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${OUT}/1c-after-reload.png` });
  });
  await context.close();
}
const saved = await board();

// ---------------------------------------------------------------- 3 a malformed saved copy at canvas open
{
  const C = await profile({ script: ([ink, version]) => {
    try { if (!sessionStorage.getItem('offline-edit-seeded')) { localStorage.setItem(ink, '{not json'); localStorage.setItem(`${ink}:v`, version); sessionStorage.setItem('offline-edit-seeded', '1'); } } catch { /* about:blank */ }
  }, arg: [INK, String(saved.version)] });
  const { page, context, puts } = C;
  await check('3 a malformed copy with a current version: the canvas overwrites it, the board answers after, and nothing empty is saved', page, async () => {
    // The board's answer waits until the canvas has written its first copy over the value it could not read: the order in
    // which this browser's copy once looked current and empty, and an empty board went up over the server's.
    let rewritten = false;
    await context.route(url => url.pathname === BOARD, async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      await until('the canvas wrote over the malformed copy', async () => { const s = await local(page).catch(() => null); return (rewritten = !!s); }, 20000).catch(() => {});
      return route.fallback();
    });
    await page.goto(`${BASE}/apps/${canvas.name}`);
    await page.locator('[data-block-id="c1"]').first().waitFor({ timeout: 60000 });
    assert.equal(rewritten, true, 'the board answered after the canvas rewrote the malformed copy');
    await until('the server copy loaded', async () => (await toasts(page)).includes('You are seeing the latest saved version of this board.'));
    await until('the server copy in this browser', async () => JSON.stringify(summary(await local(page))) === JSON.stringify(summary(saved.state)));
    assert.equal(puts.length, 0, 'no board PUT');
    const now = await board();
    assert.equal(now.version, saved.version, 'the saved board is untouched');
    assert.deepEqual(summary(now.state), summary(saved.state));
    assert.equal(await crashScreen(page), 0);
    await page.screenshot({ path: `${OUT}/3-malformed-copy.png` });
  });
  await context.close();
}

await browser.close();
const unexpected = errors.filter(message => !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED|ResizeObserver/.test(message));
if (unexpected.length) console.log('page errors:', unexpected);
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exitCode = passed === results.length && results.length === 4 && !unexpected.length ? 0 : 1;
