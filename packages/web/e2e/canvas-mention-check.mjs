// "Mention a canvas" in the canvas Chat composer (r2 lane L8, owner request 2026-10-22), against the LOCAL stack only: local D1
// and a fresh browser profile. The + menu offers Mention a canvas (never Mention an app); its picker lists the canvases this
// person can read, a Rabbit Hole too, with the parent shown only where two titles are the same; Up/Down choose and Enter adds;
// a pick adds a named, removable pill and makes no navigation, no send and no model request. x drops the ref from the next
// request, which carries the canvas id only (never a title). A canvas the learner can no longer read (here: moved to Trash)
// shows "Canvas unavailable" with no title once the server refuses the turn (the refusal itself is unit-tested in
// control-plane learn-chat.test.js: the keyless stack answers every ask "not configured" before it). Light and dark themes.
// Prints `ok <label>` per check and `PASS <n> checks`; no cookies or secrets. Exits 1 on any failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] [OUT=<dir>] node e2e/canvas-mention-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mockChatRoute } from './dev-cp.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-mention-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/canvas-mention', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `mention-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${r.status}`);
  return body;
};
const made = async title => { const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) }); if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error('the canvas was not created'); return canvas.name; };
const boardId = async name => (await api(`/api/learn/boards/${name}/main`)).board_id;

// The canvas the Chat is on; two others, one of them titled like a Rabbit Hole inside a third.
const WORK = await made(`Mention work ${run}`), TIDES = await made(`Tides ${run}`), NOTES = await made(`Notes ${run}`), PHYSICS = await made(`Physics ${run}`);
const HOLE = `canvas-${crypto.randomUUID().slice(0, 8)}`;
await api('/api/canvases/dives', { method: 'POST', body: JSON.stringify({ name: HOLE, title: `Notes ${run}`, parent: { app: PHYSICS, board: 'main' }, origin_block_id: 'c1', dive: {} }) });
await api(`/api/learn/boards/${HOLE}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], sources: [], blocks: [] }, version: 0 }) });
const IDS = { tides: await boardId(TIDES), notes: await boardId(NOTES), hole: await boardId(HOLE) };

const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask$|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|chat\/route))/;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const model = [], sends = [], errors = [];
let answer = null; // 'canned' | 'refuse' while one deliberate send is answered
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/api/**', route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (path === '/api/learn/ask' && request.method() === 'POST' && answer) {
    let body = {}; try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
    sends.push(body);
    // The server's own refusal shape (control-plane index.js, canvas-refs.js CANVAS_UNAVAILABLE).
    if (answer === 'refuse') return route.fulfill({ status: 403, json: { error: 'A canvas you mentioned is not available to you. Remove it and send again.', code: 'canvas_unavailable', refused: (body.context_refs || []).filter(r => r.kind === 'canvas').map(r => r.sourceId) } });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: 'Canned reply.' })
      + frame('done', { ok: true, threadId: body.thread_id || `mention-${run}`, userMessageId: 'u-1', messageId: 'm-1' }) });
  }
  if (/^\/api\/learn\/chat\/(threads|messages)\/mention-/.test(path)) return route.fulfill({ json: { ok: true } });
  // Professor Next Steps asks for hooks on opening a canvas (panel-header-check lets it through); it is never a pick's or a pill's.
  if (path === '/api/learn/tutor/next-steps') return route.continue();
  if (MODEL.test(path) && request.method() !== 'GET') { model.push(`${request.method()} ${path}`); return route.abort(); }
  return route.continue();
});
const routed = [];
await mockChatRoute(context, routed); // registered last, so it answers POST /api/learn/chat/route (no model) and counts it
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const navigations = [];
page.on('framenavigated', f => { if (f === page.mainFrame()) navigations.push(f.url()); });

const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    results.push({ label, ok: false });
    console.log(`FAIL ${label} - ${String(error?.message || error).split('\n')[0].slice(0, 400)}`);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const settle = (ms = 300) => page.waitForTimeout(ms);
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const pane = () => page.locator('[data-chat-pane]');
const field = () => pane().locator('[data-chat-composer] textarea').first();
const picker = () => page.locator('[data-mention-picker]');
const pills = () => pane().locator('[data-canvas-mention]');
const openMenu = async () => { await pane().locator('[data-chat-composer]').getByRole('button', { name: 'Add', exact: true }).dispatchEvent('mousedown'); await settle(); };
const quiet = (what, at) => {
  assert.deepEqual(model.slice(at.model), [], `${what}: model-capable requests ${model.slice(at.model).join(', ')}`);
  assert.equal(sends.length, at.sends, `${what}: a message was sent`);
  assert.equal(routed.length, at.routed, `${what}: a turn was routed`);
  assert.deepEqual(navigations.slice(at.navigations), [], `${what}: navigated`);
  assert.equal(new URL(page.url()).pathname, `/apps/${WORK}`, `${what}: left the canvas`);
};
const mark = () => ({ model: model.length, sends: sends.length, routed: routed.length, navigations: navigations.length });

await page.goto(`${BASE}/apps/${WORK}`);
await pane().waitFor({ state: 'visible', timeout: 60000 });
await field().waitFor({ timeout: 30000 });
await settle(1200);

await check('the + menu offers Mention a canvas, never Mention an app', async () => {
  await openMenu();
  assert.equal(await page.getByRole('button', { name: 'Mention an app' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Mention a canvas' }).isEnabled(), true);
});

await check('the picker lists readable canvases and a Rabbit Hole; equal titles are told apart by the parent only', async () => {
  const at = mark();
  await page.getByRole('button', { name: 'Mention a canvas' }).click();
  await picker().waitFor();
  assert.equal(await page.getByRole('dialog', { name: 'Mention a canvas' }).count(), 1);
  await page.getByRole('combobox', { name: 'Search canvases' }).fill(`Notes ${run}`);
  await waitFor(async () => (await picker().locator('[data-picker-option]').count()) === 2, 8000, 'two Notes canvases are not listed');
  const hole = picker().locator(`[data-picker-option="${IDS.hole}"]`), top = picker().locator(`[data-picker-option="${IDS.notes}"]`);
  assert.equal((await hole.locator('[data-picker-path]').innerText()).trim(), `Physics ${run}`, 'the hole shows its parent canvas');
  assert.equal(await top.locator('[data-picker-path]').count(), 0, 'a top-level canvas has no parent to show');
  await page.getByRole('combobox', { name: 'Search canvases' }).fill(`Tides ${run}`);
  await waitFor(async () => (await picker().locator('[data-picker-option]').count()) === 1, 8000, 'Tides is not listed');
  assert.equal(await picker().locator('[data-picker-path]').count(), 0, 'a unique title shows no parent');
  quiet('opening and searching the picker', at);
});

await check('keyboard: Down and Up move the choice, Enter mentions it; the picker closes and focus returns to the composer', async () => {
  const at = mark();
  const search = page.getByRole('combobox', { name: 'Search canvases' });
  await search.fill(`Notes ${run}`);
  await waitFor(async () => (await picker().locator('[data-picker-option]').count()) === 2, 8000, 'two Notes canvases are not listed');
  const options = picker().locator('[data-picker-option]');
  const chosen = async () => picker().locator('[role="option"][aria-selected="true"]').getAttribute('data-picker-option');
  await search.press('ArrowDown');
  const first = await chosen();
  assert.equal(first, await options.nth(0).getAttribute('data-picker-option'));
  await search.press('ArrowDown');
  assert.equal(await chosen(), await options.nth(1).getAttribute('data-picker-option'));
  await search.press('ArrowUp');
  assert.equal(await chosen(), first);
  await search.press('ArrowDown');
  const picked = await chosen();
  await search.press('Enter');
  await picker().waitFor({ state: 'detached' });
  await waitFor(async () => (await pills().count()) === 1, 5000, 'no pill');
  assert.equal(await pills().first().getAttribute('data-canvas-mention'), picked);
  assert.equal((await pills().first().innerText()).trim(), `Notes ${run}`, 'the pill is named by the canvas title');
  assert.equal(await field().evaluate(el => el === document.activeElement), true, 'focus is back in the composer');
  quiet('mentioning by keyboard', at);
});

await check('a second, different canvas by mouse: two named pills, still no navigation, send or model request', async () => {
  const at = mark();
  await openMenu();
  await page.getByRole('button', { name: 'Mention a canvas' }).click();
  await picker().waitFor();
  await page.getByRole('combobox', { name: 'Search canvases' }).fill(`Tides ${run}`);
  await picker().locator(`[data-picker-option="${IDS.tides}"]`).click();
  await picker().getByRole('button', { name: 'Mention', exact: true }).click();
  await picker().waitFor({ state: 'detached' });
  await waitFor(async () => (await pills().count()) === 2, 5000, 'the second pill is missing');
  assert.equal((await pane().locator(`[data-canvas-mention="${IDS.tides}"]`).innerText()).trim(), `Tides ${run}`);
  // Pressing a pill opens nothing.
  await pane().locator(`[data-canvas-mention="${IDS.tides}"]`).locator('span').first().click();
  await settle();
  quiet('mentioning by mouse and pressing the pill', at);
  await page.screenshot({ path: `${OUT}/01-two-pills-light.png` });
});

await check('both themes: the picker and the pills follow light and dark', async () => {
  const colors = {};
  for (const theme of ['light', 'dark']) {
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
    await openMenu();
    await page.getByRole('button', { name: 'Mention a canvas' }).click();
    await picker().waitFor();
    await settle();
    const lum = locator => locator.evaluate(el => { const m = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; });
    colors[theme] = { picker: await lum(picker()), pill: await lum(pills().first()) };
    await page.screenshot({ path: `${OUT}/02-picker-${theme}.png` });
    await page.keyboard.press('Escape');
    await picker().waitFor({ state: 'detached' });
  }
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  assert.ok(colors.light.picker > 0.8 && colors.light.pill > 0.8, `light surfaces are light: ${JSON.stringify(colors.light)}`);
  assert.ok(colors.dark.picker < 0.35 && colors.dark.pill < 0.35, `dark surfaces are dark: ${JSON.stringify(colors.dark)}`);
});

await check('x removes a pill, and the next request carries only the remaining canvas, by id, with no title', async () => {
  await pane().getByRole('button', { name: `Remove Notes ${run} from this chat` }).click();
  await waitFor(async () => (await pills().count()) === 1, 5000, 'the pill was not removed');
  // Ask mode: an Auto turn on a fresh canvas goes to the Tutor's plan route; Ask sends to /api/learn/ask, which reads the refs.
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Ask/ }).click();
  await waitFor(async () => /Ask/.test(await pane().getByRole('button', { name: 'Mode', exact: true }).innerText()), 5000, 'Ask mode was not chosen');
  answer = 'canned';
  await field().fill('Compare the canvas I mentioned');
  await field().press('Enter');
  await waitFor(() => sends.length === 1, 10000, 'the send did not reach /api/learn/ask');
  answer = null;
  const canvases = (sends[0].context_refs || []).filter(ref => ref.kind === 'canvas');
  assert.deepEqual(canvases, [{ sourceId: `canvas:${IDS.tides}`, kind: 'canvas', name: 'Canvas', version: '', range: null }]);
  assert.doesNotMatch(JSON.stringify(sends[0]), new RegExp(`Notes ${run}|Tides ${run}`), 'no canvas title in the request');
});

await check('revoked: once the server refuses, the pill shows Canvas unavailable with no title, and the words come back', async () => {
  await api(`/api/apps/${TIDES}/trash`, { method: 'POST', body: '{}' });
  answer = 'refuse';
  await field().fill('Ask again about it');
  await field().press('Enter');
  await waitFor(() => sends.length === 2, 10000, 'the second send did not reach /api/learn/ask');
  answer = null;
  const pill = pane().locator(`[data-canvas-mention="${IDS.tides}"]`);
  await waitFor(async () => (await pill.getAttribute('data-unavailable')) === 'true', 8000, 'the pill did not turn unavailable');
  assert.equal((await pill.innerText()).trim(), 'Canvas unavailable');
  assert.doesNotMatch(`${await pill.innerText()} ${await pill.getAttribute('title')} ${await pill.locator('button').getAttribute('aria-label')}`, new RegExp(`Tides ${run}`));
  assert.equal(await field().inputValue(), 'Ask again about it');
  await page.screenshot({ path: `${OUT}/03-unavailable-light.png` });
  await pill.getByRole('button', { name: 'Remove unavailable canvas from this chat' }).click();
  await waitFor(async () => (await pills().count()) === 0, 5000, 'the unavailable pill was not removed');
});

await check('no model request outside the two answered sends, and no page error', async () => {
  assert.deepEqual(model, [], `model-capable requests: ${model.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(failed.length ? `FAIL ${failed.length} of ${results.length}` : `PASS ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
