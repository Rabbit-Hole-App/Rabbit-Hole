// Remove from canvas context (docs/features/materials-remove.md), against the LOCAL stack only: local D1 and a fresh browser
// profile. No model is ever called: /api/learn/ask is answered here with canned text and its request bodies CAPTURED; every
// other model-capable route is aborted and counted, and none may happen.
// Setup: a canvas and a 3-page PDF (each page "PAGE n" and a blue bar) uploaded as its context document; its pages are added
// to the canvas through Sources' Add to canvas. Covered: the trash icon on the Materials row (label and tooltip "Remove from
// canvas context"); Cancel keeps it; a failed removal (the DELETE answered 500) shows the error and keeps the row; Remove takes
// the row and the chat's chip away; after a reload it is still gone, the page blocks still draw, the page's reader still
// opens the PDF, and a question about page 2 still sends the doc ref at page 2 (never the whole document).
// Prints `ok <label>` per check; exits 1 on any failure. Evidence goes to OUT: results.json and *.png.
// Usage: BASE=http://127.0.0.1:8881 SMALL_CP=http://127.0.0.1:8883 VARS=<cp .dev.vars> OUT=<dir> node e2e/materials-remove-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8881';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8883';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('materials-remove-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/materials-remove', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `matr-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

// ---------------------------------------------------------------- the PDF: 3 pages, "PAGE n" and a blue bar n/25 wide
function makePdf(count) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${count} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let n = 1; n <= count; n++) {
    const stream = `0 0 1 rg 0 728.64 ${(n * 612 / 25).toFixed(2)} 47.52 re f\n0 g BT /F1 96 Tf 60 396 Td (PAGE ${n}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${3 + n * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const PDF = makePdf(3), DOC_NAME = 'remove-me.pdf';

const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Materials remove ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
const form = new FormData();
form.append('app', canvas.name);
form.append('file', new Blob([PDF], { type: 'application/pdf' }), DOC_NAME);
const uploaded = await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json();
const DOC = uploaded.document, DOC_KEY = `doc:${DOC?.id}`;
if (!/^ctx:[0-9a-f]{12}$/.test(DOC?.id || '')) throw Error(`the context document was not stored: ${JSON.stringify(uploaded).slice(0, 200)}`);
const listNow = () => api(`/api/learn/context?app=${canvas.name}`);

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], errors = [];
let replies = 0, failDelete = false;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return route.abort();
  const path = url.pathname;
  if (request.method() === 'DELETE' && path.startsWith('/api/learn/context/') && failDelete) return route.fulfill({ status: 500, json: { error: 'The server is unavailable' } });
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `matr-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path)) return route.fulfill({ json: { ok: true } });
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/*', router);
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
const pane = () => page.locator('[data-chat-pane]');
const sourcesPane = () => page.locator('[data-sources-pane]');
const row = () => sourcesPane().locator('section').filter({ has: page.locator(`button[aria-expanded]:has-text("${DOC_NAME}")`) });
const trash = () => row().locator('[data-source-remove]');
const chip = () => page.locator(`[data-context-chip] button[title="Open ${DOC_NAME}"]:visible`);
const confirmDialog = () => page.getByRole('dialog', { name: 'Remove from canvas context?' });
const sourcesOpen = () => page.evaluate(() => (document.querySelector('[data-sources-pane]')?.closest('[aria-label="Sources"]')?.getBoundingClientRect().width || 0) > 50);
const openCanvas = async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await pane().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
};
const openSources = async () => {
  if (await sourcesOpen()) return;
  await page.locator('[data-chat-sources]:visible').first().click({ timeout: 5000 });
  await sourcesPane().waitFor({ state: 'visible', timeout: 10000 });
};
const slides = () => page.evaluate(() => [...document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]')]
  .map(el => ({ id: el.dataset.blockId, slide: Number(el.querySelector('[data-slide]')?.dataset.slide || 0), loaded: !!el.querySelector('[data-slide] img')?.naturalWidth }))
  .filter((b, i, all) => b.slide && all.findIndex(x => x.id === b.id) === i));
const selectBlock = async id => {
  const target = page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
  await target.scrollIntoViewIfNeeded().catch(() => {});
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForTimeout(350);
    const b = await target.boundingBox();
    await page.mouse.click(b.x + 60, b.y + 30);
    if (await pane().locator(`[data-selected-card="${id}"]`).waitFor({ timeout: 2500 }).then(() => true, () => false)) return;
  }
  throw Error(`selecting block ${id} showed no [data-selected-card] pill`);
};
const setMode = async mode => {
  if (await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === mode) return;
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator(`[data-chat-mode-option="${mode}"]`).click();
  await page.waitForTimeout(200);
};

// ================================================================ the run
await openCanvas();

await check('setup: the PDF is in Materials with its chip, and its 3 pages are added to the canvas', async () => {
  await waitFor(async () => (await chip().count()) > 0, 15000, 'the new chat has no chip for the context document');
  await openSources();
  await waitFor(async () => (await row().count()) === 1, 10000, 'Materials has no row for the document');
  await row().locator('button[aria-expanded]').click();
  await page.locator('[data-source-add-canvas]').click({ timeout: 10000 });
  const dialog = page.locator('[data-pdf-add-dialog] [role="dialog"]');
  await dialog.waitFor({ timeout: 10000 });
  await dialog.locator('[data-pdf-choice="pages"]').click();
  await dialog.locator('[data-pdf-choice="all"]').click();
  await dialog.locator('button').last().click();
  await page.locator('[data-pdf-add-dialog]').waitFor({ state: 'detached', timeout: 90000 });
  await waitFor(async () => (await slides()).filter(b => b.loaded).length === 3, 30000, 'the 3 page blocks did not draw');
  await shot('01-materials-row');
});

await check('the row has its own trash icon, labelled and titled "Remove from canvas context", beside Detach', async () => {
  assert.equal(await trash().count(), 1);
  assert.equal(await trash().getAttribute('aria-label'), 'Remove from canvas context');
  assert.equal(await trash().getAttribute('title'), 'Remove from canvas context');
  assert.equal(await row().getByRole('button', { name: `Detach ${DOC_NAME} from this chat` }).count(), 1, 'Detach stays beside it');
});

await check('Cancel in the confirmation keeps the document', async () => {
  await trash().click();
  await confirmDialog().waitFor({ timeout: 5000 });
  await shot('02-confirm');
  await confirmDialog().getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(500);
  assert.equal(await row().count(), 1, 'the row stays');
  assert.equal((await listNow()).documents.length, 1, 'the server list is unchanged');
});

await check('a failed removal shows the error and keeps the row for a retry', async () => {
  failDelete = true;
  await trash().click();
  await confirmDialog().getByRole('button', { name: 'Remove' }).click();
  const error = row().locator('[data-source-remove-error]');
  await error.waitFor({ timeout: 8000 });
  assert.match(await error.innerText(), /Could not remove remove-me\.pdf: The server is unavailable/);
  assert.equal(await trash().isEnabled(), true, 'the trash icon is there to retry');
  assert.equal((await listNow()).documents.length, 1, 'nothing changed on the server');
  await shot('03-failed');
  failDelete = false;
});

await check('Remove takes the row out of Materials and the chip out of the chat', async () => {
  await trash().click();
  await confirmDialog().getByRole('button', { name: 'Remove' }).click();
  await waitFor(async () => (await row().count()) === 0, 8000, 'the row stayed');
  await waitFor(async () => (await chip().count()) === 0, 8000, 'the chip stayed');
  const list = await listNow();
  facts.after_remove = list;
  assert.deepEqual([list.documents.length, list.removed], [0, [DOC.id]]);
  await shot('04-removed');
});

await check('after a reload: still gone; the page blocks draw; the page reader opens the PDF; page 2 still asks with its page', async () => {
  await openCanvas();
  await openSources();
  await page.waitForTimeout(1000);
  assert.equal(await row().count(), 0, 'not back in Materials');
  assert.equal(await chip().count(), 0, 'no chip came back');
  await waitFor(async () => (await slides()).filter(b => b.loaded).length === 3, 30000, 'the page blocks did not draw');
  if (await sourcesOpen()) { await page.locator('[data-sources-close]').click(); await page.waitForTimeout(300); }
  const two = (await slides()).find(b => b.slide === 2);
  await setMode('ask');
  await selectBlock(two.id);
  const read = page.waitForResponse(r => r.url().includes('/api/learn/context/') && r.url().includes(encodeURIComponent(DOC.id)), { timeout: 20000 });
  await page.keyboard.press('Enter');
  assert.equal((await read).status(), 200, 'the reader opened the PDF bytes');
  await waitFor(async () => /PAGE 2/.test(await page.locator('[aria-label="Paper page text"]').first().innerText().catch(() => '')), 20000, 'the reader did not draw page 2');
  await shot('05-reader-page-2');
  await selectBlock(two.id);
  await pane().locator('[data-chat-composer] textarea').first().fill('What is on this page?');
  const n = captured.length;
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000, 'no question was sent');
  const refs = captured[n].body.context_refs || [];
  facts.page2_refs = refs.map(r => [r.sourceId, r.kind, r.range]);
  assert.ok(refs.some(r => r.sourceId === DOC_KEY && r.kind === 'doc' && r.range?.page === 2), `the doc ref at page 2 rides (${JSON.stringify(facts.page2_refs)})`);
  assert.ok(!refs.some(r => r.sourceId === DOC_KEY && !r.range), 'the whole document does not');
});

await check('no model call beyond the canned question, no other model-capable request, no page error', async () => {
  assert.equal(captured.length, 1);
  assert.deepEqual(refused, [], `refused routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await browser.close();
const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvas: canvas.name, document: DOC.id, passed: results.length - failed.length, failed: failed.length, checks: results, facts, refused, page_errors: errors }, null, 2));
console.log(failed.length ? `FAIL ${failed.length} of ${results.length} checks (see ${OUT}/results.json)` : `PASS ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
