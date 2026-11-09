// Depth and Auto-suggest controls (Tutor ladder R2, decisions D11, D12, D22) in the real app, against the LOCAL stack only, with no model
// call: the settings API is a fake server in this browser (GET/POST /api/learn/user-settings, kept per canvas and learner), and every
// model-capable request is aborted and counted (none may come from these steps).
// Covers: the Chat composer shows a Depth control reading Standard; its menu offers Overview, Standard and Deep; the Auto-suggest switch (one control, beside the mode selector, not in the
// Depth menu) is shown in Auto and in Tutor and absent in Ask; choosing Deep posts { app, board, depth: "deep", expectedRevision: 0 } once and the control reads Deep;
// switching Auto-suggest off posts { autoSuggest: false } and the switch shows it off; a save the server refuses says "Not saved: this
// change applies in this tab only." with Retry, and the choice stays in the tab; no page error and no model request.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/depth-settings-command-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('depth-settings-command-check runs against the local stack only');
const SHOTS = process.argv[2] || 'depth-settings-command-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 6; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `depthcmd-${run}@example.com`, secret, handle: `depthcmd_${run}` }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } })).json().catch(() => null);
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Depth command ${run}` }) });

const MODEL = /^\/api\/(ask$|learn\/(ask|selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], errors = [], results = [], posts = [];
let refuse = false; // the fake server refuses the next POSTs (a save that fails)
const store = { depth: 'standard', autoSuggest: true, depthRevision: 0 };
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await page?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const router = async route => {
  const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
  if (path === '/api/learn/user-settings') {
    const answer = () => ({ settings: { depth: store.depth, autoSuggest: store.autoSuggest }, depthRevision: store.depthRevision, learner: 'aaaaaaaaaaaaaaaa' });
    if (method === 'GET') return route.fulfill({ json: answer() });
    const body = request.postDataJSON();
    posts.push(body);
    if (refuse) return route.fulfill({ status: 503, json: { error: 'settings_unavailable' } });
    if (body.depth !== undefined) {
      if (body.expectedRevision !== store.depthRevision) return route.fulfill({ status: 409, json: { error: 'stale_depth', ...answer() } });
      Object.assign(store, { depth: body.depth, depthRevision: store.depthRevision + 1 });
    }
    if (body.autoSuggest !== undefined) store.autoSuggest = body.autoSuggest;
    return route.fulfill({ json: answer() });
  }
  if (path === '/api/learn/chat/route' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not found' } });
  if (MODEL.test(path) && method !== 'GET') { stray.push(`${method} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/*', router);
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const pane = page.locator('[data-chat-pane]');
const depthButton = pane.getByRole('button', { name: /^Depth: / });
const modeButton = pane.getByRole('button', { name: 'Mode', exact: true });
const menu = page.getByRole('menu', { name: 'Depth' });
const suggestSwitch = pane.getByRole('switch', { name: 'Auto-suggest' }); // the one Auto-suggest control, beside the mode selector (not in the Depth menu)
const pickMode = async label => { await modeButton.click(); await page.getByRole('menuitemradio', { name: new RegExp(`^${label}`) }).click(); await page.waitForTimeout(300); };
const openMenu = async () => { if (!await menu.count()) await depthButton.click(); await menu.waitFor(); };

try {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await pane.waitFor({ timeout: 60000 });
  await pane.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
  await step('the composer shows Depth reading Standard, and its menu offers Overview, Standard and Deep with Standard checked', async () => {
    await depthButton.waitFor();
    assert.equal((await depthButton.getAttribute('aria-label')).replace('Depth: ', ''), 'Standard');
    await openMenu();
    assert.deepEqual(await menu.getByRole('menuitemradio').evaluateAll(nodes => nodes.map(n => n.dataset.depthOption)), ['overview', 'standard', 'deep']);
    assert.equal(await menu.locator('[data-depth-option="standard"]').getAttribute('aria-checked'), 'true');
    await page.screenshot({ path: `${SHOTS}/A-menu-auto.png` });
  });
  await step('the Auto-suggest switch is beside the mode selector in Auto and in Tutor, and the Depth menu holds Depth only', async () => {
    assert.match(await modeButton.innerText(), /Auto/);
    assert.equal(await suggestSwitch.count(), 1);
    assert.equal(await menu.locator('[data-auto-suggest]').count(), 0, 'no second Auto-suggest control in the menu');
    await page.keyboard.press('Escape');
    await pickMode('Tutor');
    assert.equal(await suggestSwitch.count(), 1);
  });
  await step('the Auto-suggest switch is not shown in Ask', async () => {
    await pickMode('Ask');
    assert.equal(await suggestSwitch.count(), 0);
    await openMenu();
    assert.equal(await menu.getByRole('menuitemradio').count(), 3, 'Depth is still offered in Ask');
    await page.screenshot({ path: `${SHOTS}/B-menu-ask.png` });
    await page.keyboard.press('Escape');
    await pickMode('Auto');
  });
  await step('choosing Deep posts the canvas and depth once, the menu closes and the control reads Deep', async () => {
    const before = posts.length;
    await openMenu();
    await menu.locator('[data-depth-option="deep"]').click();
    await until(async () => posts.length === before + 1, 'one POST');
    assert.deepEqual([posts.at(-1).app, posts.at(-1).board, posts.at(-1).depth, posts.at(-1).expectedRevision], [canvas.name, 'main', 'deep', 0]);
    await until(async () => (await depthButton.getAttribute('aria-label')).replace('Depth: ', '') === 'Deep', 'the control reads Deep');
    assert.equal(await menu.count(), 0);
  });
  await step('switching Auto-suggest off posts only that change and the switch shows it off', async () => {
    const before = posts.length;
    await suggestSwitch.click();
    await until(async () => posts.length === before + 1, 'one POST');
    assert.deepEqual(posts.at(-1), { app: canvas.name, board: 'main', autoSuggest: false });
    await until(async () => await pane.locator('[data-tutor-switch="off"]').count() === 1, 'shown off');
    await openMenu();
    assert.equal(await menu.locator('[data-depth-option="deep"]').getAttribute('aria-checked'), 'true', 'Depth kept');
    await page.screenshot({ path: `${SHOTS}/C-auto-suggest-off.png` });
    await page.keyboard.press('Escape');
  });
  await step('a refused save says it is not saved and keeps the choice in this tab; no model request and no page error', async () => {
    refuse = true;
    await openMenu();
    await menu.locator('[data-depth-option="overview"]').click();
    await until(async () => (await depthButton.getAttribute('aria-label')).replace('Depth: ', '') === 'Overview', 'applied in this tab');
    await openMenu();
    const note = menu.locator('[data-depth-status="error"]');
    await note.waitFor();
    assert.match(await note.innerText(), /Not saved: this change applies in this tab only\./);
    assert.equal(await note.getByRole('button', { name: 'Retry' }).count(), 1);
    await page.screenshot({ path: `${SHOTS}/D-not-saved.png` });
    refuse = false;
    assert.deepEqual(stray, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL && results.length === TOTAL ? 0 : 1);
