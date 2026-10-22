// PDF-02 document states in the Context panel (owner brief 2026-10-22 section 5 "processing, failure and retry states";
// contract C:/s/spec/pdfctx/contract-pdf-status.md), against the LOCAL stack only: local D1 and R2, a fresh browser profile.
// No model is ever called: every model-capable route is aborted and counted, and none may happen. The PDFs are generated in
// code (long-pdf-fixture.mjs). Failed documents are stored through the real route the way an interrupted browser stores them
// (POST /api/learn/context with pages_error and page_count, no page text); Retry is the real one: the row's Retry button reads
// the stored PDF in this browser and sends PUT /api/learn/context/<id>/pages to the real server. One Retry PUT is answered
// here with a server error to prove a failed Retry keeps the row failed. The Context panel's DOM is SourcesPane.jsx's
// (UI-26): rows [data-material-row][data-source-id="doc:<id>"], their [data-material-meta] line ("Reading pages N of M" while
// this tab reads, else kind, pages, size, day), [data-material-doc-error] (the server's message, verbatim),
// [data-material-note] ("Questions read the relevant pages"), [data-material-action="retry"] and [data-material-error] (a
// failed Retry); Upload is the one input in [data-companion-header].
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets); `N/total passed`; exits 1 on any failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] [OUT=<dir>] node e2e/pdf-status-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { longPdf } from './long-pdf-fixture.mjs';

const total = 7; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('pdf-status-check runs against the local stack only');
const OUT = process.env.OUT || process.argv[2] || fileURLToPath(new URL('./shots/pdf-status', import.meta.url));
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const mint = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const session = await mint(`pdfstatus-${run}@example.com`);
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `PDF states ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
const docsNow = async () => (await api(`/api/learn/context?app=${canvas.name}`)).documents || [];
const byId = async id => (await docsNow()).find(d => d.id === id);

// Two 312-page PDFs stored as an interrupted browser stores them: bytes, page count and the reason, no page text.
const REASON = 'Reading the pages stopped after 120 seconds, at page 200 of 312.';
const BOOK = longPdf(312);
const storeFailed = async name => {
  const form = new FormData();
  form.append('app', canvas.name);
  form.append('file', new Blob([BOOK], { type: 'application/pdf' }), name);
  form.append('page_count', '312');
  form.append('pages_error', REASON);
  const doc = (await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json()).document;
  if (!/^ctx:[0-9a-f]{12}$/.test(doc?.id || '') || doc.status !== 'failed') throw Error(`the failed document ${name} was not stored as failed: ${JSON.stringify(doc).slice(0, 200)}`);
  return doc;
};
const FIXED = await storeFailed('retry-works.pdf'), STUCK = await storeFailed('retry-fails.pdf');
const BIG = { name: 'reading-1200.pdf', count: 1200, bytes: Buffer.from(longPdf(1200)) };

// ---------------------------------------------------------------- routes: count, one failing Retry, no model call
const refused = [], outside = [], errors = [], puts = [];
let failNextPutFor = null;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/(generate|route|decide)|journey|scene|transcribe|tts|voice\/|tutor\/(plan|handoff)|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  const path = decodeURIComponent(url.pathname), method = request.method();
  if (method === 'PUT' && /^\/api\/learn\/context\/ctx:[0-9a-f]{12}\/pages$/.test(path)) {
    const id = path.split('/')[4];
    puts.push(id);
    if (failNextPutFor === id) { failNextPutFor = null; return route.fulfill({ status: 500, json: { error: 'Fixture: storing the pages failed.' } }); }
    return route.fallback();
  }
  if (MODEL.test(path)) { refused.push(`${method} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
let page = null;
const results = [], facts = {};
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/*', router);
page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(100); } };
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const sourcesPane = () => page.locator('[data-sources-pane]');
const openCanvas = async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1000);
};
const openContext = async () => {
  if (await page.locator('[data-panel-companion]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-panel-companion]').click({ timeout: 5000 });
  await page.locator('[data-companion-view="context"]').click({ timeout: 5000 });
  await sourcesPane().waitFor({ state: 'visible', timeout: 10000 });
  const back = sourcesPane().locator('[data-back-to-files]');
  if (await back.count()) await back.click(); // a reader replaces the list (UI-26): back to the files
  await sourcesPane().locator('[data-context-files]').waitFor({ timeout: 10000 });
};
const row = id => sourcesPane().locator(`[data-material-row][data-source-id="doc:${id}"]`);
const rowByName = name => sourcesPane().locator('[data-material-row]').filter({ has: page.locator(`[data-material-name][title="${name}"]`) });
// What a row shows: its meta line, verbatim failure, note, Retry, row-level error.
const rowState = async locator => locator.evaluate(el => ({
  meta: el.querySelector('[data-material-meta]')?.innerText ?? null,
  docError: el.querySelector('[data-material-doc-error]')?.innerText ?? null,
  note: el.querySelector('[data-material-note]')?.innerText ?? null,
  retry: (() => { const b = el.querySelector('[data-material-action="retry"]'); return b ? { text: b.innerText.trim(), label: b.getAttribute('aria-label'), disabled: b.disabled } : null; })(),
  error: el.querySelector('[data-material-error]')?.innerText ?? null,
}));
const assertFailed = (state, name, what) => {
  assert.equal(norm(state.docError), REASON, `${what}: the server's message, verbatim`);
  assert.ok(state.retry, `${what}: a Retry button`);
  assert.equal(state.retry.text, 'Retry', `${what}: labelled Retry`);
  assert.equal(state.retry.label, `Retry reading the pages of ${name}`, `${what}: its accessible name names the file`);
  assert.doesNotMatch(String(state.note), /Questions read the relevant pages/, `${what}: not shown as readable`);
};
const assertReady = (state, pages, what) => {
  assert.match(String(state.meta), new RegExp(`\\b${pages} pages\\b`), `${what}: "${pages} pages" in "${state.meta}"`);
  assert.equal(norm(state.note), 'Questions read the relevant pages', `${what}: the note`);
  assert.equal(state.docError, null, `${what}: no failure message`);
  assert.equal(state.retry, null, `${what}: no Retry`);
};

// ================================================================ the run
await openCanvas();
await openContext();

await check('a failed document row shows the server\'s failure message verbatim and a labelled Retry', async () => {
  for (const doc of [FIXED, STUCK]) {
    await row(doc.id).waitFor({ timeout: 15000 }).catch(() => { throw Error(`no row for ${doc.name}`); });
    assertFailed(await rowState(row(doc.id)), doc.name, doc.name);
  }
  await shot('01-failed-rows');
});

await check('Retry (pressed twice at once) sends PUT /api/learn/context/<id>/pages exactly once, shows Reading pages while it reads, and the row returns to ready: "312 pages" and "Questions read the relevant pages"', async () => {
  const before = puts.length;
  const seen = new Set();
  const button = row(FIXED.id).locator('[data-material-action="retry"]');
  await button.dblclick();
  await waitFor(async () => {
    const state = await rowState(row(FIXED.id));
    if (/Reading pages/.test(state.meta || '')) seen.add(norm(state.meta));
    return state.retry === null && /Questions read the relevant pages/.test(state.note || '') && state;
  }, 60000, 'the row did not return to ready after Retry');
  facts.retry_meta_seen = [...seen];
  assert.equal(puts.length - before, 1, `one PUT for a double press (${puts.length - before})`);
  assert.equal(puts.at(-1), FIXED.id);
  assertReady(await rowState(row(FIXED.id)), 312, 'after Retry');
  const listed = await byId(FIXED.id);
  assert.deepEqual([listed.status, listed.pages, listed.reads, listed.error], ['ready', 312, 'pages', null], 'the server lists it ready');
  await shot('02-retry-ready');
});

await check('a Retry that fails again keeps the row failed, with the server\'s message and the reason the Retry failed, and Retry still offered', async () => {
  const before = puts.length;
  failNextPutFor = STUCK.id;
  await row(STUCK.id).locator('[data-material-action="retry"]').click();
  const state = await waitFor(async () => { const s = await rowState(row(STUCK.id)); return s.error && s; }, 60000, 'no row error after the failed Retry');
  assert.equal(puts.length - before, 1, 'one PUT');
  assert.equal(norm(state.error), `Could not read the pages of ${STUCK.name}: Fixture: storing the pages failed.`, 'the Retry failure, named on its row');
  assertFailed(state, STUCK.name, 'after a failed Retry');
  assert.equal(state.retry.disabled, false, 'Retry can be pressed again');
  assert.equal((await byId(STUCK.id)).status, 'failed', 'the server still lists it failed');
  await shot('03-retry-failed');
});

await check('reload keeps the failed document failed (message and Retry) and the retried one ready', async () => {
  await page.reload();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await openContext();
  await row(STUCK.id).waitFor({ timeout: 15000 });
  await row(FIXED.id).waitFor({ timeout: 15000 });
  const stuck = await waitFor(async () => { const s = await rowState(row(STUCK.id)); return s.docError && s; }, 15000, 'the failed row lost its message after reload');
  assertFailed(stuck, STUCK.name, 'failed after reload');
  assert.equal(stuck.error, null, 'the earlier Retry error is not kept past a reload');
  assertReady(await waitFor(async () => { const s = await rowState(row(FIXED.id)); return s.note && s; }, 15000, 'the ready row lost its note'), 312, 'ready after reload');
  await shot('04-reload');
});

await check(`uploading a ${BIG.count}-page PDF through the header Upload shows "Reading pages N of ${BIG.count}" on its row while this tab reads, counting up`, async () => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // the reading takes long enough to be seen mid-way
  const seen = [];
  try {
    await page.locator('[data-companion-header] input[type="file"]').first().setInputFiles({ name: BIG.name, mimeType: 'application/pdf', buffer: BIG.bytes });
    await waitFor(async () => {
      const meta = await rowByName(BIG.name).locator('[data-material-meta]').first().innerText({ timeout: 200 }).catch(() => '');
      const m = /Reading pages (\d+) of (\d+)/.exec(meta);
      if (m && (!seen.length || seen.at(-1)[0] !== Number(m[1]))) seen.push([Number(m[1]), Number(m[2])]);
      return seen.length >= 2;
    }, 90000, `no "Reading pages N of ${BIG.count}" progress seen (saw ${JSON.stringify(seen)})`);
  } finally { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {}); }
  facts.upload_progress = seen;
  assert.ok(seen.every(([, of]) => of === BIG.count), `the total is the page count: ${JSON.stringify(seen)}`);
  assert.ok(seen.every(([n], i) => i === 0 || n > seen[i - 1][0]), `the count goes up: ${JSON.stringify(seen)}`);
  assert.ok(seen[0][0] < BIG.count, 'seen while still reading');
  await shot('05-reading-pages');
});

await check(`the uploaded ${BIG.count}-page PDF becomes ready: "${BIG.count} pages" and "Questions read the relevant pages", listed ready by the server`, async () => {
  const listed = await waitFor(async () => (await docsNow()).find(d => d.name === BIG.name), 90000, `${BIG.name} was never listed`);
  assert.deepEqual([listed.status, listed.pages, listed.reads], ['ready', BIG.count, 'pages']);
  assertReady(await waitFor(async () => { const s = await rowState(row(listed.id)); return s.note && !/Reading pages/.test(s.meta || '') && s; }, 30000, 'the uploaded row did not settle'), BIG.count, 'after upload');
});

await check('no model call, no other model-capable request, no page error', async () => {
  assert.deepEqual(refused, [], `refused routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await context.close();
await browser.close();
const passed = results.filter(r => r.ok).length;
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvas: canvas.name, total, passed, failed: results.length - passed, checks: results, facts, puts: puts.length, model_capable_refused: refused, outside_hosts: [...new Set(outside)], page_errors: errors }, null, 2));
if (results.length !== total) console.log(`FAIL ran ${results.length} checks, but total says ${total}`);
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
