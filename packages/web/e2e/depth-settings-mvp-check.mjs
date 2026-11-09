// Depth and Auto-suggest, end to end in the browser (Tutor ladder R2, decisions D11, D12, D22; roadmap 3.3 acceptance), against the LOCAL
// stack only, with no model call: the settings API is a fake server in this browser that keeps a value per learner canvas (Depth) and
// per learner (Auto-suggest) as the real route does, and every Chat turn is captured at /api/learn/ask and aborted.
// Covers: Detailed is kept across a reload; a second canvas shows Balanced while Auto-suggest, set off on the first, is off there too; a
// second tab of the same browser follows a change without a reload; a Chat turn in Auto sends depth "detailed", in Ask too (Ask stays an
// answer: its mode is ask and no plan is asked for), and Balanced sends no depth at all; Auto-suggest is not offered in Ask; no page
// error and no model request other than the captured turns.
// What it cannot show: that the model's answer is deeper. That is pinned by the server tests (learn-chat.test.js, explain-depth.test.js).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/depth-settings-mvp-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('depth-settings-mvp-check runs against the local stack only');
const SHOTS = process.argv[2] || 'depth-settings-mvp-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 6; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `depthmvp-${run}@example.com`, secret, handle: `depthmvp_${run}` }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } })).json().catch(() => null);
const first = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Depth one ${run}` }) });
const second = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Depth two ${run}` }) });

const MODEL = /^\/api\/(ask$|learn\/(selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], errors = [], results = [], turns = [];
const depthOf = {}, revisionOf = {}, learner = { autoSuggest: true }; // the fake server's rows: Depth and its revision per canvas, Auto-suggest per learner
const view = app => ({ settings: { depth: depthOf[app] || 'balanced', autoSuggest: learner.autoSuggest }, depthRevision: revisionOf[app] || 0, learner: 'aaaaaaaaaaaaaaaa' });
let current = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await current?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const router = async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  if (path === '/api/learn/user-settings') {
    if (method === 'GET') return route.fulfill({ json: view(url.searchParams.get('app')) });
    const body = request.postDataJSON();
    if (body.depth !== undefined) {
      if (body.expectedRevision !== (revisionOf[body.app] || 0)) return route.fulfill({ status: 409, json: { error: 'stale_depth', ...view(body.app) } });
      depthOf[body.app] = body.depth; revisionOf[body.app] = (revisionOf[body.app] || 0) + 1;
    }
    if (body.autoSuggest !== undefined) learner.autoSuggest = body.autoSuggest;
    return route.fulfill({ json: view(body.app) });
  }
  if (path === '/api/learn/chat/route' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not found' } });
  if (path === '/api/learn/ask' && method === 'POST') { turns.push(request.postDataJSON()); return route.abort(); }
  if (MODEL.test(path) && method !== 'GET') { stray.push(`${method} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/*', router);
const open = async (canvas, page = null) => {
  page ||= await context.newPage();
  page.setDefaultTimeout(15000);
  if (!page.listenerCount('pageerror')) page.on('pageerror', error => errors.push(error.message));
  current = page;
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
  return page;
};
const depthButton = page => page.locator('[data-chat-pane]').getByRole('button', { name: /^Depth: / });
const reads = async page => (await depthButton(page).getAttribute('aria-label')).replace('Depth: ', '');
const menuOf = page => page.getByRole('menu', { name: 'Depth' });
const switchOf = page => page.locator('[data-chat-pane]').getByRole('switch', { name: 'Auto-suggest' });
const openMenu = async page => { if (!await menuOf(page).count()) await depthButton(page).click(); await menuOf(page).waitFor(); };
const pickMode = async (page, label) => { await page.locator('[data-chat-pane]').getByRole('button', { name: 'Mode', exact: true }).click(); await page.getByRole('menuitemradio', { name: new RegExp(`^${label}`) }).click(); await page.waitForTimeout(300); };
const composer = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
const send = async (page, text) => { const before = turns.length; await composer(page).click(); await composer(page).fill(text); await composer(page).press('Enter'); await until(async () => turns.length === before + 1, `one Chat turn for "${text}"`); return turns.at(-1); };

try {
  let page = await open(first);
  await step('Detailed is chosen and kept across a reload', async () => {
    assert.equal(await reads(page), 'Balanced');
    await openMenu(page);
    await menuOf(page).locator('[data-depth-option="detailed"]').click();
    await until(async () => depthOf[first.name] === 'detailed', 'saved by the server');
    await page.reload();
    await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
    await until(async () => await reads(page) === 'Detailed', 'Detailed after reload');
  });
  await step('a second canvas shows Balanced; Auto-suggest set off here is off there too', async () => {
    await switchOf(page).click();
    await until(async () => learner.autoSuggest === false, 'Auto-suggest saved');
    const other = await open(second);
    await until(async () => await reads(other) === 'Balanced', 'Balanced on the second canvas');
    assert.equal(await other.locator('[data-chat-pane] [data-tutor-switch="off"]').count(), 1);
    await other.screenshot({ path: `${SHOTS}/A-second-canvas.png` });
    await other.close();
  });
  await step('a second tab follows a change without reloading', async () => {
    current = page;
    const tab = await open(first, await context.newPage());
    await until(async () => await reads(tab) === 'Detailed', 'the second tab reads Detailed');
    await openMenu(page);
    await menuOf(page).locator('[data-depth-option="brief"]').click();
    await until(async () => await reads(tab) === 'Brief', 'the second tab follows to Brief');
    await openMenu(page);
    await menuOf(page).locator('[data-depth-option="detailed"]').click();
    await until(async () => await reads(tab) === 'Detailed', 'and back to Detailed');
    await tab.close();
  });
  await step('a Chat turn in Auto sends depth deep, and asks for no plan', async () => {
    const turn = await send(page, 'How does backpropagation work?');
    assert.equal(turn.depth, 'detailed');
    assert.equal(turn.mode, 'auto');
    await page.screenshot({ path: `${SHOTS}/B-auto-turn.png` });
  });
  await step('in Ask the turn sends depth deep and mode ask, and the Auto-suggest switch is hidden', async () => {
    await pickMode(page, 'Ask');
    const turn = await send(page, 'How does backpropagation work?');
    assert.deepEqual([turn.depth, turn.mode], ['detailed', 'ask']);
    assert.equal(await switchOf(page).count(), 0);
  });
  await step('Balanced sends no depth, and no other model request or page error happened', async () => {
    await openMenu(page);
    await menuOf(page).locator('[data-depth-option="balanced"]').click();
    await until(async () => depthOf[first.name] === 'balanced', 'saved Balanced');
    const turn = await send(page, 'And what is a gradient?');
    assert.equal('depth' in turn, false);
    assert.deepEqual(stray, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL && results.length === TOTAL ? 0 : 1);
