// Canvas references and backlinks (C:/s/spec/canvas-references-mvp.md section 15 items 1-7 and 10; the binding contract,
// with its exact DOM names, endpoints and URLs, is C:/s/spec/references-plan.md): right-click linking from the right-clicked
// card only (1), standalone reference cards from the empty-canvas menu and Insert, with placement, Cancel/Escape and Undo (2),
// forward and backlink navigation to the exact source card, from a new tab, out of Editor view and to a missing card (3),
// same tab, the new-tab button, Ctrl-click, middle-click and the native link menu (4), reload and a second browser context (5),
// rename, Already linked, removal, Undo and source deletion (6), two chips plus "+N more" and grouped backlinks (7), a duplicated
// card's new reference ids (9, card level), and the card menu, panel tabs and BlockNote Canvas/Editor regressions (10).
// Permissions with separate users (8) and canvas duplicate/fork (9) are canvas-refs-permissions-check.mjs.
// LOCAL stack only (app-worker.js, SMALL_ENV=test): local D1, fresh browser profiles, a test session. No model is called: every
// model-capable route is aborted and counted, and none may happen; navigating a link sends no chat or AI request.
// Setup (only in this check's own canvases): a target T, three more targets C, D, E, and a source A whose cards a1-a4 sit in
// the column with a sticky beside them and a short document; a3 is seeded with references to C, D and E.
// Prints `ok <label>` per check, ids and counts only (no cookies, no secrets); exits 1 on any failure.
// Evidence goes to OUT: results.json and *.png (the picker, chips, the standalone card, grouped backlinks).
// Usage: BASE=http://127.0.0.1:8931 SMALL_CP=http://127.0.0.1:8933 VARS=<cp .dev.vars> OUT=<dir> node e2e/canvas-refs-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8933';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-refs-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/canvas-refs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `crefs-${run}@example.com`, secret, handle: `crefs_${run}` }) })).json();
const cookie = `small_session=${session}`;
const call = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', origin: BASE, ...init.headers } });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: response.status, body };
};
const api = async (path, init) => (await call(path, init)).body;
const catalog = await api('/api/apps');

// ---------------------------------------------------------------- the canvases, seeded through the board route
const card = (id, title, body, refs) => ({ id, type: 'explanation', dx: 0, dy: 0, title, body, ...(refs ? { refs } : {}) });
const note = (id, text, x, y) => ({ id, kind: 'sticky', x, y, w: 160, text, color: '#f59e0b', opacity: 1 });
const run1 = text => [{ type: 'text', text, styles: {} }];
const makeCanvas = async (title, state) => {
  const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) });
  if (!/^canvas-[a-f0-9]{8}$/.test(canvas?.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
  const path = `/api/learn/boards/${canvas.name}/main`, now = await api(path);
  const saved = await api(path, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], blocks: [], groups: [], areas: [], ...state }, version: now.exists === false ? 0 : now.version ?? 0 }) });
  if (!saved?.version || !saved.board_id) throw Error(`the seed board was not saved: ${JSON.stringify(saved).slice(0, 200)}`);
  return { name: canvas.name, id: saved.board_id, title };
};
const T = await makeCanvas(`Refs target ${run}`, { blocks: [card('t1', 'Target card', 'The canvas the source links to.')] });
const C = await makeCanvas(`Refs C ${run}`, { blocks: [card('c1', 'C card', 'Third canvas.')] });
const D = await makeCanvas(`Refs D ${run}`, { blocks: [card('d1', 'D card', 'Fourth canvas.')] });
const E = await makeCanvas(`Refs E ${run}`, { blocks: [card('e1', 'E card', 'Fifth canvas.')] });
const seeded = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
const DOC = { v: 1, x: 1400, y: 40, w: 760, blocks: [{ id: 'doc-1', type: 'paragraph', content: run1(`Document kept ${run}`), children: [] }] };
const A1 = `Recursive traversal ${run}`, A2 = `Tree depth ${run}`, A3 = `Three links ${run}`, A4 = `Double click ${run}`;
const A = await makeCanvas(`Refs source ${run}`, {
  blocks: [card('a1', A1, 'Visit each node, then its children.'), card('a2', A2, 'The longest path from the root.'),
    card('a3', A3, 'Linked to three canvases.', [C, D, E].map((x, i) => ({ id: seeded[i], target: x.id }))), card('a4', A4, 'Linked once, however often Add link is pressed.')],
  items: [note('n1', 'Side note', -260, 60)],
  doc: DOC,
});
const keyOf = name => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}`;
const boardOf = async name => api(`/api/learn/boards/${name}/main`);
const refsOn = async (name, id) => (await boardOf(name))?.state?.blocks?.find(b => b.id === id)?.refs || [];
const links = async id => api(`/api/learn/links/${id}`);
const backlinkRefs = async (target, source) => ((await links(target.id))?.to || []).find(group => group.source === source.id)?.refs || [];

// ---------------------------------------------------------------- routes: no model, no other origin
const refused = [], outside = [], errors = [], chat = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/(plan|handoff|evaluate)|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  const path = url.pathname;
  // Next Steps' hook on canvas open is expected (professor-next-steps.md); aborted, never counted against navigation.
  if (path === '/api/learn/tutor/next-steps') return route.abort();
  // A conversation or a message written (not /chat/active, the open canvas's pointer to its thread).
  if (/^\/api\/learn\/chat\/(threads|messages)\b/.test(path)) chat.push(`${request.method()} ${path}`);
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
let page = null, context = null;
const results = [], facts = {};
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}${String(error?.stack || '').split('\n').filter(line => line.includes('canvas-refs-check.mjs')).slice(0, 3).map(line => ` @${line.trim().replace(/.*check\.mjs:/, '')}`).join('')}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
    // A failed step can leave a menu or the picker open; the next check starts clean.
    if (page) { await page.mouse.up().catch(() => {}); for (let i = 0; i < 2; i++) await page.keyboard.press('Escape').catch(() => {}); }
  }
};
const shot = (name, clip = null) => (clip
  ? clip.boundingBox().then(b => page.screenshot({ path: `${OUT}/${name}.png`, ...(b ? { clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: b.width + 24, height: b.height + 24 } } : {}) }))
  : page.screenshot({ path: `${OUT}/${name}.png` })).catch(() => {});
// A poll that throws (a transient 5xx page from the local D1) is not an answer yet.
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await Promise.resolve().then(test).catch(() => null); if (value) return value; if (Date.now() > end) throw Error(what); await new Promise(resolve => setTimeout(resolve, 150)); } };
const profile = async ({ view = null } = {}) => {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  if (view) await context.addInitScript(([key, value]) => { try { localStorage.setItem(key, value); } catch { /* the default */ } }, [`${keyOf(A.name)}:view`, view]);
  await context.route('**/*', router);
  page = await newPage();
};
const newPage = async () => {
  const p = await context.newPage();
  p.setDefaultTimeout(10000);
  p.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  return p;
};
const loaded = async (p, blockId) => {
  await p.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  if (blockId) await p.locator(`[data-block-id="${blockId}"]`).first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(1200);
};
const openCanvas = async (canvas, blockId) => { await page.goto(`${BASE}/apps/${canvas.name}`); await loaded(page, blockId); };

// ---------------------------------------------------------------- the contract's handles
const blockEl = (id, p = page) => p.locator(`[data-block-id="${id}"]`).first();
const strip = (id, p = page) => p.locator(`[data-block-id="${id}"] [data-drag-zone]`).last();
const menu = (p = page) => p.locator('[data-canvas-menu]');
const linkItem = (p = page) => menu(p).getByRole('menuitem', { name: 'Link to canvas', exact: true });
const picker = (p = page) => p.getByRole('dialog', { name: 'Link to canvas', exact: true });
const search = (p = page) => picker(p).getByPlaceholder('Search canvases');
const pickerState = (p = page) => picker(p).evaluate(el => (el.matches('[data-picker-state]') ? el : el.querySelector('[data-picker-state]'))?.getAttribute('data-picker-state') ?? null);
const option = (title, p = page) => picker(p).getByRole('option').filter({ hasText: title }).first();
const addLink = (p = page) => picker(p).getByRole('button', { name: 'Add link', exact: true });
const chips = (id, p = page) => p.locator(`[data-block-id="${id}"] [data-ref-chips] [data-ref-chip]`);
const chipFor = (id, title, p = page) => chips(id, p).filter({ hasText: title }).first();
const chipLink = (id, title, p = page) => chipFor(id, title, p).locator('a[href]').first();
const newTab = (id, title, p = page) => chipFor(id, title, p).getByRole('button', { name: 'Open canvas in new tab', exact: true });
const refCards = (p = page) => p.locator('[data-canvas-ref-card]');
const selected = (p = page) => p.$$eval('[data-block-id][aria-current="true"]', nodes => nodes.map(node => node.dataset.blockId));
const inkOf = (name, p = page) => p.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }, `${keyOf(name)}:ink`);
const liveRefs = async (name, id) => ((await inkOf(name))?.blocks || []).find(b => b.id === id)?.refs || [];
const objectsOf = async name => { const ink = await inkOf(name) || {}; return JSON.stringify(['blocks', 'items', 'shapes'].map(k => (ink[k] || []).map(o => [o.id, o.x, o.y, o.dx, o.dy]))); };
const surfaceBox = (p = page) => p.locator('[data-canvas-surface]').first().boundingBox();
// The canvas room: the surface minus whatever of the right panel overlaps it.
const room = async (p = page) => {
  const s = await surfaceBox(p), pane = p.locator('[data-chat-pane], [data-canvas-search]').first();
  const b = await pane.isVisible().catch(() => false) ? await pane.boundingBox() : null;
  return { left: s.x, top: s.y, bottom: s.y + s.height, right: b && b.x < s.x + s.width ? b.x : s.x + s.width };
};
const inRoom = async (box, p = page) => { const r = await room(p); return box && box.x >= r.left - 1 && box.y >= r.top - 1 && box.x + box.width <= r.right + 1 && box.y + box.height <= r.bottom + 1; };
const barePoint = async (p = page) => p.evaluate(([right]) => {
  for (let y = 160; y < 820; y += 40) for (let x = 140; x < right; x += 40) {
    const el = document.elementFromPoint(x, y);
    if (el?.closest('[data-canvas-surface]') && !el.closest('[data-canvas-doc],[data-block-id],[data-item-id],[data-shape-id],[data-block],[data-canvas-ref-card],[role="toolbar"],[data-zoom],[data-zoom-stack],[data-chat-pane],button,a,iframe,[data-canvas-composer]')) return { x, y };
  }
  return null;
}, [(await room(p)).right - 40]);
const rightClick = async (id, p = page) => { await strip(id, p).click({ button: 'right', position: { x: 30, y: 10 } }); await menu(p).waitFor(); await p.waitForTimeout(150); };
const select = async (id, modifiers = []) => { await strip(id).click({ position: { x: 12, y: 8 }, modifiers }); await page.waitForTimeout(250); };
const canvasKeys = async () => { const at = await barePoint(); assert.ok(at, 'no bare canvas point'); await page.mouse.click(at.x, at.y); await page.waitForTimeout(150); return at; };
const pick = async (title, p = page) => {
  await picker(p).waitFor();
  await search(p).fill(title);
  await waitFor(async () => (await pickerState(p)) === 'ready' && (await option(title, p).count()) > 0, 10000, `the picker found no "${title}" (state ${await pickerState(p).catch(() => 'absent')})`);
  await option(title, p).click();
  await waitFor(async () => await addLink(p).isEnabled(), 3000, '"Add link" stays disabled after choosing a canvas');
};
const linkFromMenu = async (title, p = page) => { await linkItem(p).click(); await pick(title, p); await addLink(p).click(); await picker(p).waitFor({ state: 'hidden' }); };
// Owner UI brief 2026-10-20 section 7: the Links tab moved into Search's Links filter (toc-links-search-check.mjs).
const linksPanel = (p = page) => p.locator('[data-canvas-search]');
const linksTab = async (p = page) => {
  await p.locator('[data-panel-tab="find"]').click();
  // The Filter dropdown (owner 2026-10-22): Links alone picked, then the menu closed.
  await linksPanel(p).locator('[data-search-filter-button]').click();
  const menu = p.locator('[data-search-filter-menu]'), clear = menu.locator('[data-search-filter-clear]'); await clear.waitFor();
  if (await clear.isEnabled()) await clear.click();
  await menu.locator('[data-search-filter="links"]').click();
  await p.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
  await waitFor(async () => (await linksPanel(p).locator('[data-search-result^="link:"]').count()) > 0 && !(await linksPanel(p).getByText('references are still loading').count()), 15000, 'Search never listed the Links results');
};
const savedRefs = (name, id, test, what) => waitFor(async () => { const refs = await refsOn(name, id); return test(refs) && refs; }, 15000, what);

await profile();
await openCanvas(A, 'a1');

// ================================================================ 1: the right-clicked card, never the whole selection
await check('1 right-click linking: the menu and a cancelled picker create nothing; with two cards selected only the right-clicked card gets the reference', async () => {
  await select('a1');
  await select('a2', ['Shift']);
  assert.deepEqual((await selected()).sort(), ['a1', 'a2'], 'two cards selected first');
  const before = await objectsOf(A.name);
  await rightClick('a2');
  assert.ok(await linkItem().locator(':scope > svg').count() > 0, '"Link to canvas" has its icon');
  await linkItem().click();
  await picker().waitFor();
  assert.equal(await addLink().isDisabled(), true, '"Add link" is disabled until a canvas is chosen');
  await search().fill(T.title);
  await waitFor(async () => (await pickerState()) === 'ready', 10000, 'no ready state');
  await shot('01-picker', picker());
  await picker().getByRole('button', { name: 'Cancel', exact: true }).click();
  await picker().waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-ref-chip]').filter({ hasText: T.title }).count(), 0, 'Cancel created a chip');
  assert.equal(await objectsOf(A.name), before, 'opening the menu and cancelling changed the board');
  assert.equal((await liveRefs(A.name, 'a2')).length, 0, 'Cancel left a reference');
  await rightClick('a2');
  await linkFromMenu(T.title);
  await chipFor('a2', T.title).waitFor();
  assert.equal(await chips('a1').count(), 0, 'the other selected card got a reference too');
  const refs = await savedRefs(A.name, 'a2', r => r.length === 1, 'the server board never held a2\'s reference');
  assert.equal(refs[0].target, T.id, 'the reference targets the board id, not a title or URL');
  assert.equal((await refsOn(A.name, 'a1')).length, 0, 'a1 holds a reference on the server');
  await waitFor(async () => (await backlinkRefs(T, A)).some(r => r.object === 'a2'), 15000, 'T has no backlink from a2');
  await shot('02-chip', blockEl('a2'));
});
await check('1 keyboard: Shift+F10 on a focused card reaches "Link to canvas"; the picker searches, selects and confirms by keys; Escape closes it without a change', async () => {
  await canvasKeys();
  await page.evaluate(() => document.querySelector('[data-block-id="a1"]').focus());
  await page.keyboard.press('Shift+F10');
  if (!(await menu().waitFor({ timeout: 1500 }).then(() => true, () => false))) {
    // A browser that does not turn the key into the event: send the event the key would send, at the card.
    await page.evaluate(() => { const el = document.querySelector('[data-block-id="a1"]'), r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 12, clientY: r.top + 12 })); });
    await menu().waitFor();
  }
  await linkItem().focus();
  await page.keyboard.press('Enter');
  await picker().waitFor();
  await page.keyboard.type(`${T.title}`);
  await waitFor(async () => (await pickerState()) === 'ready' && (await option(T.title).count()) > 0, 10000, 'no result for the typed search');
  await page.keyboard.press('Escape');
  await picker().waitFor({ state: 'hidden' });
  assert.equal((await liveRefs(A.name, 'a1')).length, 0, 'Escape left a reference');
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'BODY', 'Escape left focus nowhere');
  await page.evaluate(() => document.querySelector('[data-block-id="a1"]').focus());
  await page.keyboard.press('Shift+F10');
  if (!(await menu().waitFor({ timeout: 1500 }).then(() => true, () => false))) {
    await page.evaluate(() => { const el = document.querySelector('[data-block-id="a1"]'), r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 12, clientY: r.top + 12 })); });
    await menu().waitFor();
  }
  await linkItem().focus();
  await page.keyboard.press('Enter');
  await picker().waitFor();
  await page.keyboard.type(T.title);
  await waitFor(async () => (await pickerState()) === 'ready' && (await option(T.title).count()) > 0, 10000, 'no result for the typed search');
  await page.keyboard.press('ArrowDown');
  await waitFor(async () => (await picker().locator('[role="option"][aria-selected="true"]').count()) === 1, 2000, 'ArrowDown selected no option');
  await page.keyboard.press('Enter'); // choose the highlighted canvas (and confirm, if Enter confirms)
  for (let i = 0; i < 8 && await picker().isVisible(); i++) {
    if (await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Add link')) { await page.keyboard.press('Enter'); break; }
    await page.keyboard.press('Tab');
  }
  await picker().waitFor({ state: 'hidden' });
  await chipFor('a1', T.title).waitFor();
  await savedRefs(A.name, 'a1', r => r.length === 1 && r[0].target === T.id, 'a1\'s keyboard-made reference never reached the server');
});

// ================================================================ 2: standalone reference cards
let menuCard = null;
await check('2 empty-canvas menu: a reference card near the right-click, selected, with icon, title, path and the new-tab button; Undo and Redo', async () => {
  const before = await refCards().count(), at = await barePoint();
  assert.ok(at, 'no bare canvas point');
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await menu().waitFor();
  await linkFromMenu(C.title);
  await waitFor(async () => (await refCards().count()) === before + 1, 5000, 'no reference card appeared');
  const cardEl = refCards().filter({ hasText: C.title }).first(), box = await cardEl.boundingBox();
  menuCard = await cardEl.evaluate(el => el.closest('[data-block-id]')?.dataset.blockId);
  assert.ok(menuCard, 'the reference card is a canvas block');
  assert.ok(Math.hypot(box.x - at.x, box.y - at.y) < 260, `the card landed far from the right-click (${Math.round(box.x)},${Math.round(box.y)} vs ${at.x},${at.y})`);
  assert.ok(await inRoom(box), 'the card is not inside the visible canvas room');
  assert.deepEqual(await selected(), [menuCard], 'the new card is the selection');
  assert.ok(await cardEl.locator('svg').count() > 0, 'no canvas icon');
  assert.equal(await cardEl.getByRole('button', { name: 'Open canvas in new tab', exact: true }).count(), 1, 'no new-tab button');
  await shot('03-standalone-card', cardEl);
  const saved = await waitFor(async () => (await boardOf(A.name))?.state?.blocks?.find(b => b.id === menuCard), 15000, 'the reference card never reached the server');
  assert.equal(saved.type, 'canvas-ref');
  assert.equal(saved.refs?.length, 1, 'a reference card holds exactly one reference');
  assert.equal(saved.refs[0].target, C.id);
  await canvasKeys();
  await page.keyboard.press('Control+z');
  await waitFor(async () => (await page.locator(`[data-block-id="${menuCard}"]`).count()) === 0, 4000, 'Undo did not remove the reference card');
  await page.keyboard.press('Control+y');
  await waitFor(async () => (await page.locator(`[data-block-id="${menuCard}"] [data-canvas-ref-card], [data-block-id="${menuCard}"][data-canvas-ref-card]`).count()) === 1, 4000, 'Redo did not bring the reference card back');
  await savedRefs(A.name, menuCard, r => r.length === 1, 'the redone card is not on the server');
});
await check('2 Insert > Link to canvas…: Escape creates nothing; confirming places a selected card in a visible free spot overlapping nothing', async () => {
  const insert = async () => { await page.locator('[role="menubar"][aria-label="Canvas menu"]').getByRole('menuitem', { name: 'Insert', exact: true }).click(); await page.locator('[role="menubar"]').getByRole('menuitem', { name: 'Link to canvas', exact: true }).click(); await picker().waitFor(); };
  const before = await refCards().count(), objects = await objectsOf(A.name);
  await insert();
  await page.keyboard.press('Escape');
  await picker().waitFor({ state: 'hidden' });
  assert.equal(await refCards().count(), before, 'Escape created a card');
  assert.equal(await objectsOf(A.name), objects, 'Escape changed the board');
  await insert();
  await pick(D.title);
  await addLink().click();
  await picker().waitFor({ state: 'hidden' });
  await waitFor(async () => (await refCards().count()) === before + 1, 5000, 'no reference card appeared');
  const cardEl = refCards().filter({ hasText: D.title }).first(), first = await cardEl.boundingBox();
  // A spot off screen is revealed by moving the camera: measure where the card comes to rest.
  let box = first;
  await waitFor(async () => { const now = await cardEl.boundingBox(); const still = now && box && Math.abs(now.x - box.x) < 1 && Math.abs(now.y - box.y) < 1; box = now; return still; }, 4000, 'the inserted card never came to rest');
  facts.insert_box = { first, rest: box };
  const id = await cardEl.evaluate(el => el.closest('[data-block-id]')?.dataset.blockId);
  assert.ok(await inRoom(box), `the card is not in the visible room (${JSON.stringify(box)})`);
  assert.deepEqual(await selected(), [id], 'the new card is the selection');
  const overlaps = await page.evaluate(own => {
    const mine = document.querySelector(`[data-block-id="${own}"]`).getBoundingClientRect();
    return [...document.querySelectorAll('[data-block-id], [data-item-id]')].filter(el => !el.contains(document.querySelector(`[data-block-id="${own}"]`)) && el.dataset.blockId !== own && !el.closest(`[data-block-id="${own}"]`))
      .map(el => [el.dataset.blockId || el.dataset.itemId, el.getBoundingClientRect()]).filter(([, r]) => r.width && r.left < mine.right && r.right > mine.left && r.top < mine.bottom && r.bottom > mine.top).map(([key]) => key);
  }, id);
  assert.deepEqual(overlaps, [], `the inserted card overlaps ${overlaps.join(', ')}`);
  assert.equal(await page.locator('[data-canvas-ref-card]').count(), before + 1, 'linking created more than one card');
  // Clicking its background selects it (not its title, which navigates).
  await canvasKeys();
  const at = await cardEl.boundingBox();
  facts.insert_click = { at, hit: await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName} ${el.getAttribute('aria-label') || el.className.toString().slice(0, 60)} card=${!!el.closest('[data-canvas-ref-card]')}` : null; }, [at.x + at.width - 6, at.y + at.height - 6]) };
  await page.mouse.click(at.x + at.width - 6, at.y + at.height - 6);
  await waitFor(async () => (await selected()).includes(id), 2000, `a click on the card background did not select it (hit ${facts.insert_click.hit})`);
});

// ================================================================ 3: forward and backlink navigation to the exact card
await check('3 forward: a same-tab click on a chip title opens the target; its Links results group the backlinks by source; a backlink returns to the exact card', async () => {
  const calls = refused.length + chat.length;
  await savedRefs(A.name, 'a1', r => r.length === 1, 'a1 has no saved reference');
  await chipLink('a1', T.title).click();
  await page.waitForURL(url => url.pathname === `/apps/${T.name}`, { timeout: 30000 });
  await loaded(page, 't1');
  await linksTab();
  const to = linksPanel().locator(`[data-search-result="link:to:${A.id}"]`);
  await to.waitFor();
  const text = await to.innerText();
  assert.ok(text.includes(A.title), `the backlink does not name its source canvas: ${JSON.stringify(text.slice(0, 200))}`);
  assert.ok(text.includes(A1) && text.includes(A2), `the backlinks lack the origin cards: ${JSON.stringify(text.slice(0, 200))}`);
  assert.equal((await backlinkRefs(T, A)).length, 2, 'the server does not count 2 references from A');
  await shot('04-backlinks-grouped', linksPanel());
  await to.getByRole('link', { name: new RegExp(A1) }).first().click();
  await page.waitForURL(url => url.pathname === `/apps/${A.name}`, { timeout: 30000 });
  await loaded(page, 'a1');
  await waitFor(async () => (await selected()).join() === 'a1', 8000, `the backlink did not select the origin card (${(await selected()).join(',')})`);
  assert.ok(await inRoom(await blockEl('a1').boundingBox()), 'the origin card is not in view');
  await waitFor(async () => !new URL(page.url()).searchParams.has('card'), 4000, 'card= stays in the address');
  assert.equal(refused.length + chat.length, calls, 'navigating sent an AI or chat request');
});
await check('3 a backlink in a new tab, out of Editor view, and to a card that is gone', async () => {
  const href = (await backlinkRefs(T, A)).find(r => r.object === 'a2')?.href;
  assert.ok(href && new URL(href, BASE).searchParams.get('card') === 'a2', `the backlink href does not name the card: ${href}`);
  const fresh = await newPage();
  await fresh.goto(new URL(href, BASE).href);
  await loaded(fresh, 'a2');
  await waitFor(async () => (await selected(fresh)).join() === 'a2', 8000, 'a new tab did not select the origin card');
  await fresh.close();
  // Editor view on: the link shows Canvas view and keeps the document.
  await profile({ view: 'editor' });
  await page.goto(new URL(href, BASE).href);
  await loaded(page, 'a2');
  await waitFor(async () => (await selected()).join() === 'a2', 8000, 'out of Editor view the origin card was not selected');
  assert.equal(await page.locator('[data-canvas-doc]').count(), 0, 'Editor view still covers the canvas');
  assert.ok(JSON.stringify((await boardOf(A.name)).state.doc?.blocks || []).includes(`Document kept ${run}`), 'the document was lost');
  await profile();
  await page.goto(`${BASE}/apps/${A.name}?card=gone-${run}`);
  await loaded(page, 'a1');
  await page.getByText('That card is no longer on this canvas.').waitFor();
  assert.deepEqual(await selected(), [], 'a missing card selected something else');
  await waitFor(async () => !new URL(page.url()).searchParams.has('card'), 4000, 'card= stays in the address');
});

// ================================================================ 4: tabs and the browser's own link behaviour
await check('4 chip links: the new-tab button, Ctrl-click and middle-click open a new tab and leave the source; right-click keeps the browser\'s link menu', async () => {
  await openCanvas(A, 'a1');
  const link = chipLink('a1', T.title), objects = await objectsOf(A.name), here = page.url(), calls = refused.length + chat.length;
  assert.equal(new URL(await link.getAttribute('href'), BASE).pathname, `/apps/${T.name}`, 'the chip link is not the canonical canvas URL');
  assert.equal(await chipFor('a1', T.title).locator('a button, button a, a a').count(), 0, 'nested interactive elements in a chip');
  const opens = async (how, act) => {
    const [tab] = await Promise.all([context.waitForEvent('page', { timeout: 8000 }).catch(() => null), act()]);
    assert.ok(tab, `${how} opened no new tab`);
    // A Ctrl- or middle-click popup starts on about:blank and navigates after: wait for that (8 s), then assert its URL.
    await tab.waitForURL(url => url.href !== 'about:blank', { timeout: 8000 }).catch(() => {});
    await tab.waitForLoadState('domcontentloaded');
    assert.equal(new URL(tab.url()).pathname, `/apps/${T.name}`, `${how} opened ${tab.url()}`);
    await tab.close();
    assert.equal(page.url(), here, `${how} navigated the source tab`);
  };
  await opens('the new-tab button', () => newTab('a1', T.title).click());
  await opens('Ctrl-click', () => link.click({ modifiers: ['Control'] }));
  await opens('middle-click', () => link.click({ button: 'middle' }));
  // Read after dispatch, so a handler that stops propagation still cannot hide a cancelled menu.
  await page.evaluate(() => { window.__menuPrevented = null; window.addEventListener('contextmenu', event => { setTimeout(() => { window.__menuPrevented = event.defaultPrevented; }); }, { once: true, capture: true }); });
  await link.click({ button: 'right' });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__menuPrevented), false, 'the app cancelled the browser\'s link menu');
  assert.equal(await menu().count(), 0, 'the canvas menu opened over the link');
  await page.keyboard.press('Escape');
  assert.equal(await objectsOf(A.name), objects, 'clicking the chip moved or edited a card');
  assert.equal(refused.length + chat.length, calls, 'a link click sent an AI or chat request');
});

// ================================================================ 5: persistence
await check('5 persistence: after a reload, and in a second browser context with nothing stored locally, the chips and cards come from the server', async () => {
  await page.reload();
  await loaded(page, 'a1');
  for (const [id, title] of [['a1', T.title], ['a2', T.title]]) await chipFor(id, title).waitFor();
  await refCards().filter({ hasText: C.title }).first().waitFor();
  const second = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  await second.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await second.route('**/*', router);
  const other = await second.newPage();
  other.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  await other.goto(`${BASE}/apps/${A.name}`);
  await loaded(other, 'a1');
  assert.equal(await inkOf(A.name, other).then(ink => !!ink), true, 'the second context loaded no board');
  for (const [id, title] of [['a1', T.title], ['a2', T.title], ['a3', C.title]]) await chipFor(id, title, other).waitFor({ timeout: 15000 });
  await refCards(other).filter({ hasText: D.title }).first().waitFor();
  await second.close();
});

// ================================================================ 6: rename, duplicates, removal, Undo, deletion
await check('6 renaming the target keeps the link and shows the new title; the picker marks it "Already linked" and adds no duplicate', async () => {
  const renamed = `Refs target renamed ${run}`;
  assert.ok((await call(`/api/apps/${T.name}`, { method: 'PATCH', body: JSON.stringify({ title: renamed }) })).status < 300, 'the rename was refused');
  T.title = renamed;
  await page.reload();
  await loaded(page, 'a1');
  await waitFor(async () => (await chipFor('a1', renamed).count()) === 1, 15000, 'the chip does not show the renamed title');
  assert.ok((await backlinkRefs(T, A)).some(r => r.object === 'a1'), 'the rename broke the backlink');
  await rightClick('a1');
  await linkItem().click();
  await search().fill(renamed);
  await waitFor(async () => (await option(renamed).count()) > 0, 10000, 'the renamed canvas is not in the picker');
  assert.match(await option(renamed).innerText(), /Already linked/, 'the target a1 already references is not marked "Already linked"');
  await option(renamed).click().catch(() => {});
  if (await addLink().isEnabled()) await addLink().click();
  await page.keyboard.press('Escape');
  await picker().waitFor({ state: 'hidden' });
  await page.waitForTimeout(1500);
  assert.equal((await liveRefs(A.name, 'a1')).filter(r => r.target === T.id).length, 1, 'a duplicate reference was added');
  // A double click on Add link makes one reference.
  await rightClick('a4');
  await linkItem().click();
  await pick(E.title);
  await addLink().dblclick();
  await picker().waitFor({ state: 'hidden' });
  const refs = await savedRefs(A.name, 'a4', r => r.length >= 1, 'a4\'s reference never reached the server');
  await page.waitForTimeout(1500);
  assert.equal((await refsOn(A.name, 'a4')).length, 1, `a double click made ${refs.length} references`);
});
await check('6 Remove reference drops the chip and the backlink; Undo brings both back once', async () => {
  const removeChip = async (id, title) => {
    const chip = chipFor(id, title), opener = chip.locator('button[aria-haspopup], button:not([aria-label="Open canvas in new tab"])').first();
    if (await opener.count()) await opener.click(); else await chip.click({ button: 'right', position: { x: 4, y: 4 } });
    await page.getByRole('menuitem', { name: 'Remove reference', exact: true }).click();
  };
  await removeChip('a1', T.title);
  await waitFor(async () => (await chipFor('a1', T.title).count()) === 0, 4000, 'the chip stayed');
  await savedRefs(A.name, 'a1', r => r.length === 0, 'the server still holds a1\'s reference');
  await waitFor(async () => !(await backlinkRefs(T, A)).some(r => r.object === 'a1'), 15000, 'the backlink from a1 stayed');
  assert.ok(await blockEl('a1').isVisible(), 'removing a reference removed the card');
  await canvasKeys();
  await page.keyboard.press('Control+z');
  await chipFor('a1', T.title).waitFor();
  await savedRefs(A.name, 'a1', r => r.length === 1, 'Undo did not restore exactly one reference on the server');
  await waitFor(async () => (await backlinkRefs(T, A)).filter(r => r.object === 'a1').length === 1, 15000, 'Undo did not bring the backlink back exactly once');
});
await check('6 deleting the source card drops its backlinks; Undo brings them back without duplicates', async () => {
  await select('a2');
  await page.keyboard.press('Delete');
  await waitFor(async () => (await page.locator('[data-block-id="a2"]').count()) === 0, 4000, 'the card was not deleted');
  await waitFor(async () => !(await backlinkRefs(T, A)).some(r => r.object === 'a2'), 15000, 'a deleted card still shows as a backlink');
  await canvasKeys();
  await page.keyboard.press('Control+z');
  await blockEl('a2').waitFor();
  await waitFor(async () => (await backlinkRefs(T, A)).filter(r => r.object === 'a2').length === 1, 15000, 'Undo did not bring the backlink back exactly once');
});

// ================================================================ 7: grouping and the two-chip presentation
await check('7 several references: two chips, "+1 more" opens the rest; the Links results from this canvas group by target', async () => {
  await chips('a3').first().waitFor();
  assert.equal(await chips('a3').count(), 2, `${await chips('a3').count()} chips shown, not two`);
  const more = page.locator('[data-block-id="a3"] [data-ref-more]');
  assert.equal((await more.innerText()).trim(), '+1 more');
  await shot('05-chips-more', blockEl('a3'));
  const shown = await chips('a3').allInnerTexts();
  const rest = [C, D, E].find(x => !shown.some(text => text.includes(x.title)));
  assert.ok(rest, 'every target already had a chip');
  await more.click();
  await page.locator('[data-block-id="a3"] [data-ref-more-list] [data-ref-more-item]').filter({ hasText: rest.title }).waitFor();
  await page.keyboard.press('Escape');
  await linksTab();
  const text = (await linksPanel().locator('[data-search-result^="link:from:"]').allInnerTexts()).join('\n');
  for (const x of [T, C, D, E]) assert.ok(text.includes(x.title), `Links from this canvas lacks ${x.title}`);
  const server = (await links(A.id)).from;
  assert.equal(server.find(g => g.target === C.id)?.refs.length, 2, 'C is not grouped with its two references (a3 and the reference card)');
  await shot('06-links-from', linksPanel());
});

// ================================================================ 9 (card level): a duplicated card owns new reference ids
await check('9 card duplicate: Ctrl+D gives the copy new reference ids with the same targets, and the target lists the copy as its own origin', async () => {
  await page.locator('[data-panel-tab="chat"]').click();
  await select('a3');
  const original = await liveRefs(A.name, 'a3');
  const before = new Set(((await inkOf(A.name)).blocks || []).map(b => b.id));
  await page.keyboard.press('Control+d');
  const copy = await waitFor(async () => ((await inkOf(A.name)).blocks || []).find(b => !before.has(b.id) && b.refs?.length), 4000, 'no duplicated card with references');
  assert.deepEqual(copy.refs.map(r => r.target).sort(), original.map(r => r.target).sort(), 'the copy lost or changed targets');
  assert.equal(copy.refs.filter(r => original.some(o => o.id === r.id)).length, 0, 'the copy reuses the original reference ids');
  await waitFor(async () => (await backlinkRefs(C, A)).some(r => r.object === copy.id), 15000, 'C does not list the copy as an origin');
  assert.equal((await backlinkRefs(C, A)).filter(r => r.object === 'a3').length, 1, 'the original origin is no longer listed once');
});

// ================================================================ 10: regressions
await check('10 the card menu keeps its items, each with an icon; panel tabs keep their order, with no Links tab (now in Search); BlockNote Canvas/Editor still switches', async () => {
  await rightClick('a1');
  const labels = await menu().locator('[role="menuitem"]').evaluateAll(rows => rows.map(row => ({ text: (row.querySelector(':scope > span') || row).innerText.split('\n')[0].trim(), icon: !!row.querySelector(':scope > svg, :scope > img') })));
  // UI-25 (owner brief 2026-10-22): a card's whole-card copy reads Copy card, apart from Copy text, code or LaTeX.
  for (const label of ['Add to chat', 'Cut', 'Copy card', 'Paste', 'Duplicate', 'Delete', 'Link to canvas']) assert.ok(labels.some(row => row.text === label), `the card menu lost "${label}"`);
  assert.deepEqual(labels.filter(row => !row.icon).map(row => row.text), [], 'menu items without an icon');
  await page.keyboard.press('Escape');
  const tabs = await page.locator('[data-panel-header] [role="tablist"] [role="tab"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-panel-tab')));
  assert.deepEqual(tabs, ['chat', 'find', 'toc', 'comments', 'progress'], `panel tabs: ${tabs.join(',')}`);
  assert.equal(await page.locator('[data-panel-tab="links"]').count(), 0, 'Links is a Search filter, not a tab');
  const viewMenu = page.locator('[role="menubar"][aria-label="Canvas menu"]').getByRole('menuitem', { name: 'View', exact: true });
  const mode = page.locator('[role="menubar"] select').filter({ has: page.locator('option', { hasText: /^Editor$/ }) });
  await viewMenu.click();
  await mode.selectOption({ label: 'Editor' });
  await waitFor(async () => (await page.locator('[data-canvas-doc]').getAttribute('data-doc-state').catch(() => null)) === 'ready', 20000, 'Editor view never got ready');
  assert.ok((await page.locator('[data-canvas-doc]').innerText()).includes(`Document kept ${run}`), 'the document is not shown');
  await viewMenu.click();
  await mode.selectOption({ label: 'Canvas' });
  await waitFor(async () => (await page.locator('[data-canvas-doc]').count()) === 0, 5000, 'Canvas view still shows the document');
});

await check('no AI or model-capable request, no chat write from navigation, no page error, no other origin', async () => {
  assert.deepEqual(refused, [], `model-capable requests: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvases: { A: A.name, T: T.name, C: C.name, D: D.name, E: E.name }, checks: results, facts, refused, chat, outside: [...new Set(outside)], errors }, null, 2));
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(failed.length ? `FAIL ${failed.length} of ${results.length} checks (see ${OUT}/results.json)` : `canvas-refs-check: ${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
