// Remove from Materials (docs/features/materials-remove.md), against the LOCAL stack only: local D1 and a fresh browser
// profile. No model is ever called: /api/learn/ask is answered here with canned text and its request bodies CAPTURED; every
// other model-capable route is aborted and counted, and none may happen.
// Setup: a canvas and a 3-page PDF (each page "PAGE n" and a blue bar) uploaded as its context document; its pages are added
// to the canvas through Sources' Add to canvas. Covered: the trash icon on the Materials row (label and tooltip "Remove <file>
// from Materials"); Cancel keeps it; a failed removal (the DELETE answered 500) shows the error and keeps the row; Remove takes
// the row and the chat's chip away; after a reload it is still gone, the page blocks still draw, the page's reader still
// opens the PDF, and a question about page 2 still sends the doc ref at page 2 (never the whole document).
// Prints `ok <label>` per check; exits 1 on any failure. Evidence goes to OUT: results.json and *.png.
// Usage: BASE=http://127.0.0.1:8881 SMALL_CP=http://127.0.0.1:8883 VARS=<cp .dev.vars> OUT=<dir> node e2e/materials-remove-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mockChatRoute } from './dev-cp.mjs';

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
const listed = async () => (await listNow()).documents.some(d => d.id === DOC.id);
// A second document with a long name: the rows' truncation and their narrow layout are drawn beside the first.
const LONG_NAME = 'A deliberately long file name to check that Materials rows truncate and keep their actions visible.pdf';
const longForm = new FormData();
longForm.append('app', canvas.name);
longForm.append('file', new Blob([PDF], { type: 'application/pdf' }), LONG_NAME);
await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: longForm, headers: { cookie } });

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], errors = [];
let replies = 0, failDelete = false;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
// As pdf-to-canvas-check: Next Steps falls through to the keyless local stack, which answers without a model.
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/(handoff|plan|evaluate)|dive|explore))/;
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
// CR-1: a Chat line (any mode) asks POST /api/learn/chat/route first; a contract-valid answer decision (dev-cp.mjs), registered last so it wins. CI has no JEV key.
await mockChatRoute(context);
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
const row = () => sourcesPane().locator(`[data-material-row][data-source-id="${DOC_KEY}"]`);
const trash = () => row().locator('[data-material-action="remove"]');
// The main chat's chip, whichever tab is showing (Chat and Context share the right panel, docs/features/hide-right-panel.md).
const chip = () => page.locator(`[data-chat-pane] [data-context-chip] button[title="Open ${DOC_NAME}"]`);
const confirmDialog = () => page.getByRole('dialog', { name: 'Remove from Materials?' });
// Sources is the right panel's Context tab: open when that tabpanel is on screen.
// Context shows when the companion column is open on it (a collapsed column keeps its content's own width inside).
const sourcesOpen = () => page.evaluate(() => ['aside[data-companion]', '[data-context-panel]'].every(s => (document.querySelector(s)?.getBoundingClientRect().width || 0) > 50));
const chatTab = async () => { const tab = page.locator('[data-panel-tab="chat"]'); if (await tab.getAttribute('aria-selected') !== 'true') await tab.click(); };
const openCanvas = async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await pane().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
};
const openSources = async () => {
  if (await sourcesOpen()) return;
  await page.locator('[data-panel-companion]').click({ timeout: 5000 });
  await sourcesPane().waitFor({ state: 'visible', timeout: 10000 });
};
const slides = () => page.evaluate(() => [...document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]')]
  .map(el => ({ id: el.dataset.blockId, slide: Number(el.querySelector('[data-slide]')?.dataset.slide || 0), loaded: !!el.querySelector('[data-slide] img')?.naturalWidth }))
  .filter((b, i, all) => b.slide && all.findIndex(x => x.id === b.id) === i));
const selectBlock = async id => {
  const target = page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
  await chatTab();
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
  await chatTab();
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
  await row().locator('[data-material-action="canvas"]').click({ timeout: 10000 });
  const dialog = page.locator('[data-pdf-add-dialog] [role="dialog"]');
  await dialog.waitFor({ timeout: 10000 });
  await waitFor(async () => (await dialog.locator('[data-pdf-total]').innerText().catch(() => '')).trim() === '3 pages', 20000, 'the dialog did not count 3 pages');
  await dialog.locator('[data-pdf-choice="pages"]').click();
  await dialog.locator('[data-pdf-choice="all"]').click();
  await dialog.locator('button').last().click();
  await page.locator('[data-pdf-add-dialog]').waitFor({ state: 'detached', timeout: 90000 });
  await waitFor(async () => (await slides()).filter(b => b.loaded).length === 3, 30000, 'the 3 page blocks did not draw');
  // The board and its page pictures reach the server before any reload below (a reload sooner can lose the fresh insert).
  await waitFor(async () => {
    const blocks = ((await api(`/api/learn/boards/${canvas.name}/main`)).state?.blocks || []).filter(b => b.type === 'slide');
    const keys = new Set((await api(`/api/learn/boards/${canvas.name}/main/assets`)).keys || []);
    return blocks.length === 3 && blocks.every(b => keys.has(b.assetKey));
  }, 60000, 'the server board does not hold the 3 pages and their pictures');
  await shot('01-materials-row');
});

await check('the row has its own trash icon, labelled and titled "Remove remove-me.pdf from Materials", after the other row actions', async () => {
  assert.equal(await trash().count(), 1);
  assert.equal(await trash().getAttribute('aria-label'), `Remove ${DOC_NAME} from Materials`);
  assert.equal(await trash().getAttribute('title'), `Remove ${DOC_NAME} from Materials`);
  // Owner review UI-10 (2026-10-21): one Use in this chat toggle on the row; the canvas default (new chats) in the row's More menu.
  assert.equal(await row().getByRole('button', { name: `Use ${DOC_NAME} in this chat` }).getAttribute('aria-pressed'), 'true', 'the chat attachment stays beside it, pressed');
  await row().locator('[data-material-action="more"]').click();
  assert.equal(await page.locator('[data-material-menu]').getByRole('menuitemcheckbox', { name: `Include ${DOC_NAME} in new chats on this canvas` }).getAttribute('aria-checked'), 'true', 'and the canvas default, on');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-material-menu]').count(), 0, 'Escape closes the menu');
});

// The normal, non-hovered rows (owner hand-off): light and dark, at the default and the narrowest Sources width.
await check('the rows at rest: light and dark, default and narrow width, actions visible and the long name truncated', async () => {
  for (const [theme, width] of [['light', 400], ['dark', 400], ['light', 320], ['dark', 320]]) {
    await page.evaluate(([t, w]) => { localStorage.setItem('small.theme', t); localStorage.setItem('rh.companion.width', String(w)); }, [theme, width]);
    await openCanvas();
    await openSources();
    await waitFor(async () => (await sourcesPane().locator('[data-material-row]').count()) >= 2, 10000, 'the two rows did not show');
    await page.mouse.move(5, 500);
    await page.waitForTimeout(400);
    const panel = page.locator('aside[data-companion]').first(); // Context's own column, left of Chat
    await panel.screenshot({ path: `${OUT}/rows-${theme}-${width}.png` });
    const long = sourcesPane().locator('[data-material-row]').filter({ has: page.locator(`[data-material-name][title="${LONG_NAME}"]`) });
    const name = await long.locator('[data-material-name]').evaluate(el => { const b = el.getBoundingClientRect(); return { clipped: el.scrollWidth > el.clientWidth, right: b.right, bottom: b.bottom, y: b.y }; });
    assert.ok(name.clipped, `${theme} ${width}: the long name truncates`);
    const actions = await long.locator('[data-material-action]').evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { action: el.dataset.materialAction, x: b.x, y: b.y, right: b.right, w: b.width }; }));
    const pane = await sourcesPane().evaluate(el => el.getBoundingClientRect().right);
    assert.deepEqual(actions.map(a => a.action), ['chat', 'canvas', 'more', 'remove'], `${theme} ${width}: the four actions in order`);
    assert.ok(actions.every(a => a.w >= 27 && a.right <= pane), `${theme} ${width}: every action whole and inside the pane`);
    assert.ok(actions.every(a => a.y === actions[0].y), `${theme} ${width}: the actions share one line`);
    assert.ok(actions.every(a => a.x >= name.right - 1 || a.y >= name.bottom - 1), `${theme} ${width}: no action over the name`);
    (facts.rows ||= {})[`${theme}-${width}`] = { second_line: actions[0].y >= name.bottom - 1 };
  }
  // Owner review UI-10: the labelled Use in this chat and Add to canvas take their own line under the name below 34rem (544 px).
  assert.deepEqual([facts.rows['light-400'].second_line, facts.rows['light-320'].second_line], [true, true], 'a second action line at 400 and 320 px');
  await page.evaluate(() => { localStorage.setItem('small.theme', 'light'); localStorage.setItem('rh.companion.width', '400'); });
  await openCanvas();
  await openSources();
});

await check('Cancel in the confirmation keeps the document', async () => {
  await trash().click();
  await confirmDialog().waitFor({ timeout: 5000 });
  await shot('02-confirm');
  await confirmDialog().getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(500);
  assert.equal(await row().count(), 1, 'the row stays');
  assert.equal(await listed(), true, 'the server list is unchanged');
});

await check('a failed removal shows the error and keeps the row for a retry', async () => {
  failDelete = true;
  await trash().click();
  await confirmDialog().getByRole('button', { name: 'Remove from Materials', exact: true }).click();
  const error = row().locator('[data-material-error]');
  await error.waitFor({ timeout: 8000 });
  assert.match(await error.innerText(), /Could not remove remove-me\.pdf: The server is unavailable/);
  assert.equal(await trash().isEnabled(), true, 'the trash icon is there to retry');
  assert.equal(await listed(), true, 'nothing changed on the server');
  await shot('03-failed');
  failDelete = false;
});

await check('Remove takes the row out of Materials and the chip out of the chat', async () => {
  await trash().click();
  await confirmDialog().getByRole('button', { name: 'Remove from Materials', exact: true }).click();
  await waitFor(async () => (await row().count()) === 0, 8000, 'the row stayed');
  await waitFor(async () => (await chip().count()) === 0, 8000, 'the chip stayed');
  const list = await listNow();
  facts.after_remove = list;
  assert.deepEqual([list.documents.some(d => d.id === DOC.id), list.removed], [false, [DOC.id]]);
  await shot('04-removed');
});

await check('after a reload: still gone; the page blocks draw; the page reader opens the PDF; page 2 still asks with its page', async () => {
  await openCanvas();
  await openSources();
  await page.waitForTimeout(1000);
  assert.equal(await row().count(), 0, 'not back in Materials');
  assert.equal(await chip().count(), 0, 'no chip came back');
  await waitFor(async () => (await slides()).filter(b => b.loaded).length === 3, 30000, 'the page blocks did not draw');
  if (await sourcesOpen()) { await page.locator('[data-companion-close]').click(); await page.waitForTimeout(300); }
  const two = (await slides()).find(b => b.slide === 2);
  await setMode('ask');
  await selectBlock(two.id);
  const read = page.waitForResponse(r => r.url().includes('/api/learn/context/') && r.url().includes(encodeURIComponent(DOC.id)), { timeout: 20000 });
  await page.keyboard.press('Enter');
  assert.equal((await read).status(), 200, 'the reader opened the PDF bytes');
  await waitFor(async () => /PAGE 2/.test(await page.locator('[aria-label="Paper page text"]').first().innerText().catch(() => '')), 20000, 'the reader did not draw page 2');
  await shot('05-reader-page-2');
  await selectBlock(two.id);
  await chatTab();
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
