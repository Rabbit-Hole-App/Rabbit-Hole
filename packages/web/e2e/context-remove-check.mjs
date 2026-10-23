// The Context panel (UI-26, owner brief 2026-10-22 sections 1-4, addendum 1), against the LOCAL stack only: local D1 and a
// fresh browser profile. No model is ever called: /api/learn/ask is answered here with canned text and its request bodies
// CAPTURED; every other model-capable route is aborted and counted, and none may happen.
// Setup: a canvas with two context PDFs (remove-me.pdf, 3 pages, and one with a long name); remove-me.pdf's pages are added to
// the canvas from its File options. Covered: the header (Context, Upload, Close) and the file count; File options as a popover
// beside its button, inside the window (also in a short window), leaving the rows where they were, closed by a press outside
// and by Escape (focus back on its button), keyboard order inside it; Include in new chats apart from Use in this chat; the
// rows at rest in light and dark at a narrow and a wide panel; the reader replacing the list and Back to Files by keyboard;
// a failed removal keeping the row with an actionable error; a removal pending (one DELETE for a double press), its row gone
// at once without a reload while a list read sent before it lands after it (out of order) and cannot bring it back, the
// chat's chip and the popover gone, the count updated; removing the open, unattached, last file (back to Files, empty state);
// after a reload both stay gone, a new chat starts with neither, and the page cards still open their source at their page and
// ask with the page ref, never the whole document.
// Prints `ok <label>` per check and `N/total passed`; exits 1 on any failure. Evidence goes to OUT: results.json and *.png.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] [OUT=<dir>] node e2e/context-remove-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mockChatRoute } from './dev-cp.mjs';

const total = 12; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('context-remove-check runs against the local stack only');
const OUT = process.env.OUT || process.argv[2] || fileURLToPath(new URL('./shots/context-remove', import.meta.url));
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `ctxrm-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
const PDF = makePdf(3), NAME = 'remove-me.pdf';
const LONG = 'A deliberately long file name to check that Context rows give the name the width and keep both actions whole.pdf';

const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Context remove ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
const upload = async name => {
  const form = new FormData();
  form.append('app', canvas.name);
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), name);
  const doc = (await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json()).document;
  if (!/^ctx:[0-9a-f]{12}$/.test(doc?.id || '')) throw Error(`the context document ${name} was not stored`);
  return doc;
};
const LONG_DOC = await upload(LONG), DOC = await upload(NAME);
const KEY = `doc:${DOC.id}`, LONG_KEY = `doc:${LONG_DOC.id}`;
const listNow = () => api(`/api/learn/context?app=${canvas.name}`);

// ---------------------------------------------------------------- routes: capture, canned answers, slow and reordered responses
const captured = [], refused = [], errors = [], deletes = [];
let replies = 0, failDelete = false, delayDelete = 0, holdLists = false, held = 0, delivered = 0, deleteAnswered = null;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/(handoff|plan|evaluate)|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return route.abort();
  const path = url.pathname, method = request.method();
  if (method === 'DELETE' && path.startsWith('/api/learn/context/')) {
    deletes.push(path);
    if (failDelete) return route.fulfill({ status: 500, json: { error: 'The server is unavailable' } });
    if (delayDelete) await sleep(delayDelete);
    const response = await route.fetch();
    deleteAnswered?.();
    return route.fulfill({ response });
  }
  // A list read sent while the removal is pending: read from the server now (the document still listed), handed to the page
  // only after the DELETE has answered - an older response arriving last.
  if (method === 'GET' && path === '/api/learn/context' && holdLists) {
    held += 1;
    const response = await route.fetch(), answered = new Promise(resolve => { const was = deleteAnswered; deleteAnswered = () => { was?.(); resolve(); }; });
    await answered;
    await sleep(600);
    delivered += 1;
    return route.fulfill({ response });
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.fallback();
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `ctxrm-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path)) return route.fulfill({ json: { ok: true } });
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
const pane = () => page.locator('[data-chat-pane]');
const sources = () => page.locator('[data-sources-pane]');
const header = () => page.locator('[data-companion-header]');
const row = key => sources().locator(`[data-material-row][data-source-id="${key}"]`);
const options = key => row(key).locator('[data-material-action="more"]');
const popover = () => page.locator('[data-material-menu]');
const useInChat = key => row(key).locator('input[type="checkbox"][data-material-action="chat"]');
const chip = name => page.locator(`[data-chat-pane] [data-context-chip] button[title="Open ${name}"]`);
const count = () => sources().locator('[data-context-count]');
const sourcesOpen = () => page.evaluate(() => ['aside[data-companion]', '[data-context-panel]'].every(s => (document.querySelector(s)?.getBoundingClientRect().width || 0) > 50));
const chatTab = async () => { const tab = page.locator('[data-panel-tab="chat"]'); if (await tab.getAttribute('aria-selected') !== 'true') await tab.click(); };
const openCanvas = async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await pane().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
};
const openSources = async () => {
  if (!(await sourcesOpen())) await page.locator('[data-panel-companion]').click({ timeout: 5000 });
  await sources().waitFor({ state: 'visible', timeout: 10000 });
};
const box = locator => locator.evaluate(el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; });
const popBox = () => page.evaluate(() => { const b = document.querySelector('[data-material-menu]')?.parentElement?.getBoundingClientRect(); return b && { left: b.left, top: b.top, right: b.right, bottom: b.bottom, height: b.height }; });
const viewport = () => page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
const focused = () => page.evaluate(() => { const el = document.activeElement; return { action: el?.dataset?.materialAction || null, source: el?.closest?.('[data-source-id]')?.dataset.sourceId || null, tag: el?.tagName }; });
const rowTops = () => sources().locator('[data-material-row]').evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().top)));
const luminance = color => { const [r, g, b] = (color.match(/[\d.]+/g) || []).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const removeFromPopover = async () => {
  await popover().locator('[data-material-action="remove"]').click();
  await popover().locator('[data-material-remove-confirm]').waitFor({ timeout: 3000 });
  return popover().locator('[data-material-remove-yes]');
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
    // The middle of the block's part inside the canvas view: a corner can sit under the canvas's top menu or off screen.
    const b = await target.evaluate(el => { const r = el.getBoundingClientRect(), v = document.querySelector('[aria-label="Lesson canvas"]').getBoundingClientRect();
      const left = Math.max(r.left, v.left), right = Math.min(r.right, v.right), top = Math.max(r.top, v.top + 60), bottom = Math.min(r.bottom, v.bottom - 60);
      return { x: (left + right) / 2, y: (top + bottom) / 2 }; });
    await page.mouse.click(b.x, b.y);
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
const send = async text => {
  await chatTab();
  await pane().locator('[data-chat-composer] textarea').first().fill(text);
  const n = captured.length;
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000, 'no question was sent');
  return captured[n].body.context_refs || [];
};

// ================================================================ the run
await openCanvas();

await check('setup: the header reads Context, Upload and Close; two files listed and counted; their chips ride the new chat; the pages are added from File options', async () => {
  await waitFor(async () => (await chip(NAME).count()) > 0 && (await chip(LONG).count()) > 0, 15000, 'the new chat has no chips for the two documents');
  await openSources();
  await waitFor(async () => (await row(KEY).count()) === 1 && (await row(LONG_KEY).count()) === 1, 10000, 'the two rows did not show');
  assert.equal((await header().locator('[data-companion-view="context"]').innerText()).trim(), 'Context');
  assert.equal(await header().locator('[data-materials-upload]').count(), 1, 'Upload in the header');
  assert.equal(await sources().locator('[data-materials-upload]').count(), 0, 'never between the files');
  const order = await header().evaluate(el => [...el.querySelectorAll('[data-companion-view], [data-materials-upload], [data-companion-close]')].map(e => (e.matches('[data-materials-upload]') ? 'upload' : e.matches('[data-companion-close]') ? 'close' : 'view')));
  assert.deepEqual(order.slice(-2), ['upload', 'close'], 'Upload then Close on the right');
  assert.equal((await count().innerText()).trim(), '2 files');
  assert.equal(await useInChat(KEY).isChecked(), true, 'Use in this chat: checked for an attached file');
  await options(KEY).click();
  await popover().locator('[data-material-action="canvas"]').click({ timeout: 5000 });
  const dialog = page.locator('[data-pdf-add-dialog] [role="dialog"]');
  await dialog.waitFor({ timeout: 10000 });
  await waitFor(async () => (await dialog.locator('[data-pdf-total]').innerText().catch(() => '')).trim() === '3 pages', 20000, 'the dialog did not count 3 pages');
  await dialog.locator('[data-pdf-choice="pages"]').click();
  await dialog.locator('[data-pdf-choice="all"]').click();
  await dialog.locator('button').last().click();
  await page.locator('[data-pdf-add-dialog]').waitFor({ state: 'detached', timeout: 90000 });
  await waitFor(async () => (await slides()).filter(b => b.loaded).length === 3, 30000, 'the 3 page blocks did not draw');
  await waitFor(async () => {
    const blocks = ((await api(`/api/learn/boards/${canvas.name}/main`)).state?.blocks || []).filter(b => b.type === 'slide');
    const keys = new Set((await api(`/api/learn/boards/${canvas.name}/main/assets`)).keys || []);
    return blocks.length === 3 && blocks.every(b => keys.has(b.assetKey));
  }, 60000, 'the server board does not hold the 3 pages and their pictures');
  // A comment on the page 2 card, which Remove from context must leave alone (owner decision 2026-10-23, canvas-comments.md Q13).
  const board = await api(`/api/learn/boards/${canvas.name}/main`), page2 = board.state.blocks.find(b => b.type === 'slide' && b.slide === 2) || board.state.blocks.filter(b => b.type === 'slide')[1];
  const made = await api(`/api/learn/c/${board.board_id}/threads`, { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), anchor: { kind: 'object', object_id: page2.id, object_kind: 'block', dx: 10, dy: 10, label: 'Page 2' }, body: 'Keep me after Remove from context.', mentions: [] }) });
  assert.ok(made.thread?.id, `the comment on the page card: ${JSON.stringify(made).slice(0, 200)}`);
  facts.comment = { board: board.board_id, thread: made.thread.id, card: page2.id };
  await shot('01-list');
});

await check('File options: a popover beside its button, inside the window, the rows unmoved; the full name, Include in new chats, Add to canvas, Remove from context', async () => {
  await openSources();
  const before = await rowTops();
  await options(KEY).click();
  await popover().waitFor({ timeout: 3000 });
  const b = await box(options(KEY)), p = await popBox(), v = await viewport();
  facts.popover = { button: b, popover: p };
  assert.equal(await options(KEY).innerText(), 'File options', 'the visible label');
  assert.equal(await options(KEY).getAttribute('aria-expanded'), 'true');
  assert.ok(p.left >= 0 && p.top >= 0 && p.right <= v.w && p.bottom <= v.h, `inside the window (${JSON.stringify(p)})`);
  assert.ok(p.top >= b.bottom - 1 && p.top <= b.bottom + 12, `just below its button (${p.top} vs ${b.bottom})`);
  assert.ok(p.left <= b.right && p.right >= b.left, 'beside its button, not across the page');
  assert.deepEqual(await rowTops(), before, 'nothing inserted: the rows stay where they were');
  assert.equal((await popover().locator('[data-material-menu-name]').innerText()).trim(), NAME, 'the full name');
  assert.equal(await popover().getByRole('checkbox', { name: 'Include in new chats' }).isChecked(), true, 'the canvas default, on');
  assert.match(await popover().locator('[data-material-menu-note]').innerText(), /^New chats on this canvas start with this file\. Your current chat stays unchanged\.$/);
  assert.equal((await popover().locator('[data-material-action="canvas"]').innerText()).trim(), 'Add to canvas');
  assert.equal((await popover().locator('[data-material-action="remove"]').innerText()).trim(), 'Remove from context');
  await shot('02-popover');
});

await check('File options closes on a press outside and on Escape, which hands the focus back to its button; the keyboard walks it', async () => {
  // Open from the previous step: a press on the list outside it.
  await count().click();
  await waitFor(async () => (await popover().count()) === 0, 3000, 'a press outside left it open');
  assert.equal(await options(KEY).getAttribute('aria-expanded'), 'false');
  // By keyboard: Enter opens it with the focus inside, Tab walks it, Escape closes it and returns to the button.
  await options(KEY).focus();
  await page.keyboard.press('Enter');
  await popover().waitFor({ timeout: 3000 });
  await waitFor(async () => (await focused()).action === 'context', 3000, 'the focus did not move into the popover');
  const walk = [];
  for (let i = 0; i < 2; i += 1) { await page.keyboard.press('Tab'); walk.push((await focused()).action); }
  assert.deepEqual(walk, ['canvas', 'remove'], 'Tab: Include in new chats, Add to canvas, Remove from context');
  await page.keyboard.press('Escape');
  await waitFor(async () => (await popover().count()) === 0, 3000, 'Escape left it open');
  assert.deepEqual(await focused(), { action: 'more', source: KEY, tag: 'BUTTON' }, 'the focus is back on its File options');
});

await check('a short window: File options moves to stay inside it', async () => {
  await page.setViewportSize({ width: 1800, height: 300 });
  await page.waitForTimeout(400);
  await options(KEY).scrollIntoViewIfNeeded();
  await options(KEY).click();
  await popover().waitFor({ timeout: 3000 });
  await page.waitForTimeout(200);
  const p = await popBox(), v = await viewport();
  facts.short = p;
  assert.ok(p.top >= 0 && p.bottom <= v.h && p.left >= 0 && p.right <= v.w, `inside the 300 px window (${JSON.stringify(p)})`);
  assert.ok(p.top < facts.popover.popover.top, `moved up from where a tall window puts it (${p.top} vs ${facts.popover.popover.top})`);
  await shot('03-short-window');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.waitForTimeout(400);
});

await check('Include in new chats is its own setting: switching it off and on never changes Use in this chat', async () => {
  await options(KEY).click();
  await popover().getByRole('checkbox', { name: 'Include in new chats' }).click();
  await waitFor(async () => (await listNow()).documents.find(d => d.id === DOC.id)?.attached === false, 8000, 'the canvas default did not switch off');
  assert.equal(await useInChat(KEY).isChecked(), true, 'this chat still uses it');
  assert.equal(await chip(NAME).count(), 1, 'its chip stays');
  await waitFor(async () => (await popover().getByRole('checkbox', { name: 'Include in new chats' }).isChecked()) === false, 5000, 'the checkbox did not follow');
  await popover().getByRole('checkbox', { name: 'Include in new chats' }).click();
  await waitFor(async () => (await listNow()).documents.find(d => d.id === DOC.id)?.attached === true, 8000, 'the canvas default did not switch back on');
  assert.equal(await useInChat(KEY).isChecked(), true);
  await page.keyboard.press('Escape');
});

// The rows at rest (owner brief section 1): both themes, a narrow and a wide panel; the name takes the width, the actions whole.
await check('rows at rest: light and dark, narrow and wide: the name truncates, both actions whole and inside, the popover follows the theme', async () => {
  for (const [theme, width] of [['light', 320], ['dark', 320], ['light', 600], ['dark', 600]]) {
    await page.evaluate(([t, w]) => { localStorage.setItem('small.theme', t); localStorage.setItem('rh.companion.width', String(w)); }, [theme, width]);
    await openCanvas();
    await openSources();
    await waitFor(async () => (await sources().locator('[data-material-row]').count()) >= 2, 10000, 'the two rows did not show');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', `${theme}: the theme applied`);
    await page.mouse.move(5, 500);
    await page.waitForTimeout(300);
    await page.locator('aside[data-companion]').first().screenshot({ path: `${OUT}/rows-${theme}-${width}.png` });
    const name = await row(LONG_KEY).locator('[data-material-name]').evaluate(el => { const b = el.getBoundingClientRect(); return { clipped: el.scrollWidth > el.clientWidth, right: b.right, bottom: b.bottom, width: b.width }; });
    const actions = await row(LONG_KEY).locator('[data-material-actions] > *').evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { text: el.innerText.trim(), whole: el.scrollWidth <= el.clientWidth + 1, x: b.x, y: b.y, right: b.right }; }));
    const right = await sources().evaluate(el => el.getBoundingClientRect().right);
    assert.ok(name.clipped, `${theme} ${width}: the long name truncates`);
    assert.deepEqual(actions.map(a => a.text), ['Use in this chat', 'File options'], `${theme} ${width}: the two labelled actions`);
    assert.ok(actions.every(a => a.whole && a.right <= right), `${theme} ${width}: action labels whole and inside the panel`);
    assert.ok(actions.every(a => a.x >= name.right - 1 || a.y >= name.bottom - 1), `${theme} ${width}: no action over the name`);
    const second = actions[0].y >= name.bottom - 1;
    assert.equal(second, width < 480, `${theme} ${width}: the actions take ${width < 480 ? 'their own line' : 'the name line'}`);
    const upload = await box(header().locator('[data-materials-upload]')), head = await box(header());
    assert.ok(upload.right <= head.right && upload.left >= head.left, `${theme} ${width}: Upload whole in the header`);
    await options(LONG_KEY).click();
    await popover().waitFor({ timeout: 3000 });
    const surface = await popover().evaluate(el => getComputedStyle(el.parentElement).backgroundColor);
    assert.ok(theme === 'dark' ? luminance(surface) < 0.4 : luminance(surface) > 0.8, `${theme}: the popover surface (${surface})`);
    const p = await popBox(), v = await viewport();
    assert.ok(p.left >= 0 && p.right <= v.w && p.bottom <= v.h, `${theme} ${width}: the popover inside the window`);
    await popover().screenshot({ path: `${OUT}/popover-${theme}-${width}.png` });
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => { localStorage.setItem('small.theme', 'light'); localStorage.setItem('rh.companion.width', '400'); });
  await openCanvas();
  await openSources();
});

await check('the reader replaces the list, shows the title once, and Back to Files returns, all by keyboard', async () => {
  await row(KEY).locator('button').first().focus();
  await page.keyboard.press('Enter');
  const back = sources().locator('[data-back-to-files]');
  await back.waitFor({ timeout: 10000 });
  assert.equal(await sources().locator('[data-context-files]').count(), 0, 'no list under the reader');
  assert.equal((await back.innerText()).trim(), 'Back to Files');
  assert.equal((await sources().locator('h2[data-context-title]').innerText()).trim(), NAME);
  await waitFor(async () => /PAGE 1/.test(await page.locator('[aria-label="Paper page text"]').first().innerText().catch(() => '')), 20000, 'the reader did not draw page 1');
  const titles = await sources().evaluate((el, name) => [...el.querySelectorAll('h1, h2, h3')].filter(h => h.innerText.trim() === name).length, NAME);
  assert.equal(titles, 1, 'the document title once');
  assert.equal(await useInChat(KEY).isChecked(), true, 'Use in this chat in the reader, the same state');
  await shot('04-reader');
  await back.focus();
  await page.keyboard.press('Enter');
  await sources().locator('[data-context-files]').waitFor({ timeout: 5000 });
  assert.equal(await row(KEY).count(), 1, 'back on the list');
});

await check('a failed removal keeps the row and its chip, with an error that says what to do', async () => {
  failDelete = true;
  await options(KEY).click();
  await (await removeFromPopover()).click();
  const error = row(KEY).locator('[data-material-error]');
  await error.waitFor({ timeout: 8000 });
  assert.equal(await error.innerText(), `Could not remove ${NAME} from context: The server is unavailable. Try again from File options.`);
  assert.equal(await error.getAttribute('role'), 'alert');
  assert.equal(await row(KEY).count(), 1, 'the row stays');
  assert.equal(await chip(NAME).count(), 1, 'the chip stays');
  assert.equal((await count().innerText()).trim(), '2 files');
  assert.equal((await listNow()).documents.some(d => d.id === DOC.id), true, 'nothing changed on the server');
  await shot('05-failed');
  failDelete = false;
  await page.keyboard.press('Escape');
});

await check('a slow removal: pending, one DELETE for a double press; then the row, chip and popover go at once and an older list read landing after it cannot bring it back', async () => {
  deletes.length = 0;
  delayDelete = 2500; holdLists = true; held = 0; delivered = 0;
  await options(KEY).click();
  const yes = await removeFromPopover();
  await yes.dblclick();
  // Every list of the canvas re-reads now, while the DELETE is still on its way: that read sees the document still listed.
  await page.evaluate(app => window.dispatchEvent(new CustomEvent('small:context-docs', { detail: { app } })), canvas.name);
  await waitFor(async () => held > 0, 3000, 'no list read was sent while the removal was pending');
  assert.equal(await yes.isDisabled(), true, 'Remove is disabled while pending');
  assert.equal((await yes.innerText()).trim(), 'Removing');
  assert.equal(await row(KEY).getAttribute('aria-busy'), 'true', 'the row reads busy');
  await page.waitForTimeout(800);
  assert.equal(deletes.length, 1, `one DELETE for a double press (${deletes.length})`);
  await waitFor(async () => (await row(KEY).count()) === 0, 2500 + 1500, 'the row stayed after the DELETE answered');
  facts.row_gone_before_old_read = delivered === 0;
  assert.equal(await popover().count(), 0, 'its popover closed');
  await waitFor(async () => (await chip(NAME).count()) === 0, 3000, 'the chip stayed');
  await waitFor(async () => delivered === held, 5000, 'the held list reads were never delivered');
  await page.waitForTimeout(1000);
  assert.equal(await row(KEY).count(), 0, 'the older list read brought the row back');
  assert.equal(await chip(NAME).count(), 0, 'the older list read brought the chip back');
  assert.equal((await count().innerText()).trim(), '1 file', 'the count follows');
  assert.equal(deletes.length, 1, 'still one DELETE');
  const list = await listNow();
  assert.deepEqual([list.documents.some(d => d.id === DOC.id), list.removed.includes(DOC.id)], [false, true]);
  delayDelete = 0; holdLists = false;
  await shot('06-removed');
});

await check('removing the open, unattached, last file: back to Files and the empty state', async () => {
  await row(LONG_KEY).locator('button').first().click();
  await sources().locator('[data-back-to-files]').waitFor({ timeout: 10000 });
  await useInChat(LONG_KEY).uncheck();
  await waitFor(async () => (await chip(LONG).count()) === 0, 5000, 'switching Use in this chat off kept the chip');
  assert.equal(await sources().locator('[data-not-attached]').count(), 1, 'the reader says it is not attached');
  await options(LONG_KEY).click();
  await (await removeFromPopover()).click();
  await sources().locator('[data-context-empty]').waitFor({ timeout: 8000 });
  assert.equal(await sources().locator('[data-back-to-files]').count(), 0, 'its reader went back to Files');
  assert.equal(await count().count(), 0, 'no count over an empty list');
  assert.equal(await sources().locator('[data-material-row]').count(), 0);
  assert.equal(await popover().count(), 0);
  await shot('07-empty');
});

await check('after a reload: both stay removed; a new chat starts with neither; a question sends neither whole document', async () => {
  await openCanvas();
  await openSources();
  await page.waitForTimeout(1000);
  assert.equal(await sources().locator('[data-material-row]').count(), 0, 'nothing came back');
  assert.equal(await sources().locator('[data-context-empty]').count(), 1);
  assert.deepEqual([await chip(NAME).count(), await chip(LONG).count()], [0, 0], 'no chip came back');
  await setMode('ask');
  const refs = await send('What do my files say?');
  facts.reload_refs = refs.map(r => [r.sourceId, r.range]);
  assert.ok(!refs.some(r => [KEY, LONG_KEY].includes(r.sourceId) && !r.range), `no whole removed document rides (${JSON.stringify(facts.reload_refs)})`);
});

await check('the page cards still open their source at their page and ask with that page, never the whole document; their comments stay', async () => {
  await waitFor(async () => (await slides()).filter(b => b.loaded).length === 3, 30000, 'the page blocks did not draw');
  // Remove from context is membership only: the page card and its comment thread stay, on the server and on the canvas.
  const listed = (await api(`/api/learn/c/${facts.comment.board}/threads?status=all`)).threads || [];
  assert.deepEqual(listed.filter(t => t.id === facts.comment.thread).map(t => [t.anchor.object_id, t.preview]), [[facts.comment.card, 'Keep me after Remove from context.']], 'the thread is still served');
  await page.locator(`[data-comment-pin="${facts.comment.thread}"]`).waitFor({ timeout: 15000 });
  if (await sourcesOpen()) { await page.locator('[data-companion-close]').click(); await page.waitForTimeout(300); }
  const two = (await slides()).find(b => b.slide === 2);
  await selectBlock(two.id);
  const read = page.waitForResponse(r => r.url().includes('/api/learn/context/') && r.url().includes(encodeURIComponent(DOC.id)), { timeout: 20000 });
  await page.keyboard.press('Enter');
  assert.equal((await read).status(), 200, 'the reader opened the PDF bytes');
  await waitFor(async () => /PAGE 2/.test(await page.locator('[aria-label="Paper page text"]').first().innerText().catch(() => '')), 20000, 'the reader did not draw page 2');
  await shot('08-page-card-source');
  await selectBlock(two.id);
  const refs = await send('What is on this page?');
  facts.page2_refs = refs.map(r => [r.sourceId, r.kind, r.range]);
  assert.ok(refs.some(r => r.sourceId === KEY && r.kind === 'doc' && r.range?.page === 2), `the doc ref at page 2 rides (${JSON.stringify(facts.page2_refs)})`);
  assert.ok(!refs.some(r => r.sourceId === KEY && !r.range), 'the whole document does not');
  assert.equal(captured.length, 2, 'two canned questions, nothing else');
  assert.deepEqual(refused, [], `refused model-capable routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await browser.close();
const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvas: canvas.name, documents: [DOC.id, LONG_DOC.id], passed: results.length - failed.length, failed: failed.length, total, checks: results, facts, refused, page_errors: errors }, null, 2));
console.log(`${results.length - failed.length}/${total} passed`);
if (results.length !== total) console.log(`FAIL ran ${results.length} steps, expected ${total}`);
process.exit(failed.length || results.length !== total ? 1 : 0);
