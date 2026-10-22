// Remove from context under races (UI-26 section 4; addendum 1 coverage), against the LOCAL stack only: local D1, a fresh
// browser profile. No model is ever called: every model-capable route is aborted and counted, and none may happen. Only the
// DELETE is slowed and the list re-read failed here; every answer that reaches the page is the real server's.
// Covered: a removal still pending while the learner switches to another canvas inside the app (no reload) - the other canvas's
// list, chip and open reader stay as they are, and back on the first canvas the file is gone; a removal whose every list
// re-read fails afterwards - the row stays gone, no stale row returns and no error shows, also after a reload.
// Prints `ok <label>` per check and `N/total passed`; exits 1 on any failure. Evidence goes to OUT: results.json and *.png.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] [OUT=<dir>] node e2e/context-remove-race-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mockChatRoute } from './dev-cp.mjs';
import { longPdf } from './long-pdf-fixture.mjs';

const total = 4; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('context-remove-race-check runs against the local stack only');
const OUT = process.env.OUT || process.argv[2] || fileURLToPath(new URL('./shots/context-remove-race', import.meta.url));
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `ctxrace-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------- fixtures: two canvases and their documents
const SHORT = longPdf(3);
const newCanvas = async title => {
  const made = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `${title} ${run}` }) });
  if (!/^canvas-[a-f0-9]{8}$/.test(made.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(made).slice(0, 200)}`);
  return made.name;
};
const upload = async (app, name, bytes) => {
  const form = new FormData();
  form.append('app', app);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
  const doc = (await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json()).document;
  if (!/^ctx:[0-9a-f]{12}$/.test(doc?.id || '')) throw Error(`the context document ${name} was not stored`);
  return doc;
};
const A = await newCanvas('Context race A'), B = await newCanvas('Context race B');
const KEEP = await upload(A, 'reread-me.pdf', SHORT), SWITCH = await upload(A, 'switch-me.pdf', SHORT);
const OTHER = await upload(B, 'b-file.pdf', SHORT);
const listOf = app => api(`/api/learn/context?app=${app}`);

// ---------------------------------------------------------------- routes: slow or failing calls, everything else through
const refused = [], errors = [], deletes = [], failedReads = [];
let delayDelete = 0, deleteAnswered = 0, failLists = false;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask$|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/(handoff|plan|evaluate)|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return route.abort();
  const path = url.pathname, method = request.method();
  if (method === 'DELETE' && path.startsWith('/api/learn/context/')) {
    deletes.push(path);
    if (delayDelete) await sleep(delayDelete);
    const response = await route.fetch();
    deleteAnswered += 1;
    return route.fulfill({ response });
  }
  if (method === 'GET' && path === '/api/learn/context' && failLists) { failedReads.push(url.search); return route.fulfill({ status: 500, json: { error: 'The list is unavailable' } }); }
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path) && method !== 'GET') return route.fulfill({ json: { ok: true } });
  // Reads go through, as in context-remove-check: a GET (the Journey state, a list) calls no model; model-capable calls are writes.
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.fallback();
  if (MODEL.test(path)) { refused.push(`${method} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/*', router);
await mockChatRoute(context); // CR-1: the Chat's route decision, registered last so it wins (dev-cp.mjs). CI has no model key.
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const results = [], facts = {};
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});

// ---------------------------------------------------------------- the Context panel's DOM (SourcesPane.jsx, PanelHeader.jsx)
const sources = () => page.locator('[data-sources-pane]');
const row = doc => sources().locator(`[data-material-row][data-source-id="doc:${doc.id}"]`);
const popover = () => page.locator('[data-material-menu]');
const chip = name => page.locator(`[data-chat-pane] [data-context-chip] button[title="Open ${name}"]`);
const count = () => sources().locator('[data-context-count]');
const back = () => sources().locator('[data-back-to-files]');
const sourcesOpen = () => page.evaluate(() => ['aside[data-companion]', '[data-context-panel]'].every(s => (document.querySelector(s)?.getBoundingClientRect().width || 0) > 50));
const openSources = async () => {
  if (!(await sourcesOpen())) await page.locator('[data-panel-companion]').click({ timeout: 5000 });
  await sources().waitFor({ state: 'visible', timeout: 10000 });
};
const waitCanvas = async app => {
  await waitFor(async () => new URL(page.url()).pathname === `/apps/${app}`, 10000, `the address is not /apps/${app}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1200);
};
const openCanvas = async app => { await page.goto(`${BASE}/apps/${app}`); await waitCanvas(app); };
// A switch inside the app, as its own links do (api.js navigate): no reload, so a request in flight keeps running.
const switchTo = async app => {
  await page.evaluate(to => { window.history.pushState({ depth: (window.history.state?.depth || 0) + 1 }, '', to); window.dispatchEvent(new PopStateEvent('popstate')); }, `/apps/${app}`);
  await waitCanvas(app);
};
const reread = app => page.evaluate(to => window.dispatchEvent(new CustomEvent('small:context-docs', { detail: { app: to } })), app);
const removeFile = async doc => {
  await row(doc).locator('[data-material-action="more"]').click();
  await popover().locator('[data-material-action="remove"]').click();
  await popover().locator('[data-material-remove-yes]').click();
};

// ================================================================ the run
await check('setup: canvas A lists its two files with their chips', async () => {
  await openCanvas(A);
  await openSources();
  await waitFor(async () => (await row(KEEP).count()) === 1 && (await row(SWITCH).count()) === 1, 10000, 'canvas A does not list its two files');
  await waitFor(async () => (await chip(SWITCH.name).count()) === 1, 15000, 'the new chat on A has no chip for switch-me.pdf');
  assert.equal((await count().innerText()).trim(), '2 files');
});

await check('a removal pending while the learner switches canvas: B keeps its list, chip and open reader; back on A the file is gone', async () => {
  delayDelete = 10000; // long enough to load B and open its reader first (asserted below)
  const answered = deleteAnswered, before = deletes.length;
  await removeFile(SWITCH);
  await waitFor(() => deletes.length > before, 3000, 'no DELETE was sent');
  await switchTo(B);
  await openSources();
  await waitFor(async () => (await row(OTHER).count()) === 1, 10000, 'canvas B does not list its file');
  await row(OTHER).locator('button').first().click(); // B's reader, open while A's DELETE is still on its way
  await back().waitFor({ timeout: 10000 });
  assert.equal(deleteAnswered, answered, 'B was set up before the DELETE answered');
  await waitFor(() => deleteAnswered > answered, 15000, 'the DELETE never answered');
  await page.waitForTimeout(1200);
  assert.equal(new URL(page.url()).pathname, `/apps/${B}`, 'still on B');
  assert.equal(await back().count(), 1, "B's reader stays open");
  assert.equal((await sources().locator('h2[data-context-title]').innerText()).trim(), OTHER.name, "B's reader shows B's file");
  assert.equal(await chip(OTHER.name).count(), 1, "B's chip stays");
  assert.equal(await sources().locator(`[data-source-id="doc:${SWITCH.id}"]`).count(), 0, "A's file never shows on B");
  await back().click();
  assert.equal(await row(OTHER).count(), 1, "B's row stays");
  assert.equal((await count().innerText()).trim(), '1 file', "B's count is unchanged");
  assert.deepEqual((await listOf(B)).documents.map(d => d.id), [OTHER.id], "B's server list is unchanged");
  await shot('01-b-untouched');
  await switchTo(A);
  await openSources();
  await waitFor(async () => (await row(KEEP).count()) === 1, 10000, 'A shows no list');
  assert.equal(await row(SWITCH).count(), 0, 'the removed file is gone from A');
  assert.equal((await count().innerText()).trim(), '1 file');
  assert.equal(await chip(SWITCH.name).count(), 0, 'its chip is gone from A');
  const list = await listOf(A);
  assert.deepEqual([list.documents.some(d => d.id === SWITCH.id), list.removed.includes(SWITCH.id)], [false, true]);
  delayDelete = 0;
});

await check('a removal whose list re-reads all fail: the row goes at once and no stale row returns, also after a reload', async () => {
  failLists = true;
  const reads = failedReads.length;
  await removeFile(KEEP);
  await sources().locator('[data-context-empty]').waitFor({ timeout: 5000 });
  for (let i = 0; i < 3; i += 1) { await reread(A); await page.waitForTimeout(400); }
  await waitFor(() => failedReads.length > reads, 3000, 'no list re-read was attempted');
  await page.waitForTimeout(800);
  assert.equal(await row(KEEP).count(), 0, 'a failed re-read brought the row back');
  assert.equal(await sources().locator('[data-material-row]').count(), 0);
  assert.equal(await sources().locator('[data-context-empty]').count(), 1, 'the empty state stays');
  assert.equal(await sources().locator('[role="alert"]').count(), 0, 'the removal itself succeeded: no error on the panel');
  facts.failed_rereads = failedReads.length - reads;
  failLists = false;
  await openCanvas(A);
  await openSources();
  await page.waitForTimeout(1000);
  assert.equal(await sources().locator('[data-material-row]').count(), 0, 'nothing came back after a reload');
  assert.equal(await chip(KEEP.name).count(), 0);
  await shot('02-reread-failed');
});

await check('no model-capable request and no page error', async () => {
  assert.deepEqual(refused, [], `refused model-capable routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await browser.close();
const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvases: [A, B], passed: results.length - failed.length, failed: failed.length, total, checks: results, facts, refused, page_errors: errors, deletes }, null, 2));
console.log(`${results.length - failed.length}/${total} passed`);
if (results.length !== total) console.log(`FAIL ran ${results.length} steps, expected ${total}`);
process.exit(failed.length || results.length !== total ? 1 : 0);
