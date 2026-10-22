// PDF to canvas (docs/features/pdf-to-canvas.md), against the LOCAL stack only: local D1 and fresh browser profiles. No model is
// ever called: /api/learn/ask (an SSE stream) and the Tutor planner are answered here with canned text and their request bodies
// CAPTURED; every other model-capable route is aborted and counted, and none may happen.
// Setup: a canvas, and a 20-page PDF built here (each page "PAGE n" and a blue bar n/25 of the page wide, so a drawn page image
// names its own page; pages 5 and 14 landscape) uploaded as the canvas's context document (POST /api/learn/context).
// Covered: Sources' Add to canvas and its dialog; one PDF card; all pages; a middle range 12-16; a single page 7-7; invalid ranges;
// Cancel and Escape (also while drawing); one Undo per inserted set; the board and its page images on the server, a reload and a
// fresh browser profile; a question about page 12 and Add to chat (Ctrl+L) on page 12 (the doc ref at page 12, never page 1);
// the context document unchanged; the upload/drop road (the same dialog, the upload posted only after the choice).
// Follow-ups 2-4: Add to chat on an uploaded-PDF page 12 (the paper at page 12, read after the selection is cleared); a set added
// between a page label and its page lands before the label; the owner's Duplicate reads both PDFs and asks page 12 from its home;
// another person's fork of the shared canvas gets the page pictures and is refused the bytes. Follow-up 5: in Auto the canvas's
// journey Tutor answers a one-page question and its plan carries the page (page_context); two pages stay on /api/learn/ask.
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets); exits 1 on any failure.
// Evidence goes to OUT: results.json (the captured context_refs and canvas_target, never cookies) and *.png.
// Usage: BASE=http://127.0.0.1:8881 SMALL_CP=http://127.0.0.1:8883 VARS=<cp .dev.vars> OUT=<dir> node e2e/pdf-to-canvas-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8881';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8883';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('pdf-to-canvas-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/pdf-to-canvas', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `p2c-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

// ---------------------------------------------------------------- the PDF: 20 pages, Helvetica text, a correct xref
const LANDSCAPE = { 5: [792, 612], 14: [842, 595] };
const SIZES = Array.from({ length: 20 }, (_, i) => LANDSCAPE[i + 1] || [612, 792]);
function makePdf(sizes) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${sizes.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${sizes.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  sizes.forEach(([w, h], i) => {
    const n = i + 1, f = v => v.toFixed(2);
    const stream = `0 0 1 rg 0 ${f(h * 0.92)} ${f(n * w / 25)} ${f(h * 0.06)} re f\n0 g BT /F1 96 Tf 60 ${f(h / 2)} Td (PAGE ${n}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const PDF = makePdf(SIZES), DOC_NAME = 'pages.pdf', DROP_NAME = 'dropped-pages.pdf';

// ---------------------------------------------------------------- setup: a canvas and its context document
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `PDF to canvas ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
const form = new FormData();
form.append('app', canvas.name);
form.append('file', new Blob([PDF], { type: 'application/pdf' }), DOC_NAME);
const uploaded = await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json();
if (!/^ctx:[0-9a-f]{12}$/.test(uploaded.document?.id || '')) throw Error(`the context document was not stored: ${JSON.stringify(uploaded).slice(0, 200)}`);
const DOC = uploaded.document, DOC_KEY = `doc:${DOC.id}`;
const docsNow = async () => (await api(`/api/learn/context?app=${canvas.name}`)).documents;
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const boardOf = () => api(`/api/learn/boards/${canvas.name}/main`);
const serverAssets = async () => (await api(`/api/learn/boards/${canvas.name}/main/assets`)).keys || [];

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], outside = [], errors = [], papers = [];
let replies = 0;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/handoff|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  const path = url.pathname;
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ route: 'ask', body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `p2c-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/tutor/plan') {
    const reply = ++replies;
    captured.push({ route: 'plan', body, reply });
    return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', constraints_add: [], actions: [{ type: 'respond_text', text: `Canned reply ${reply}.` }] } });
  }
  // MOCKED CR-1 route decision (chat-route-interface.md): an answer, as JEV would decide for a question. A code, page or file turn
  // in Auto asks it before /api/learn/ask, and CI has no JEV key, so the real route would fall back and send nothing.
  if (path === '/api/learn/chat/route') return route.fulfill({ json: { route: 'answer', via: 'jev', capability: null, flow: null, token: null } });
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path)) return route.fulfill({ json: { ok: true } }); // the canned thread ids exist nowhere
  if (path === '/api/learn/paper' && request.method() === 'POST') papers.push(path);
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
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
    console.log(`FAIL ${label} - ${message}${String(error?.stack || '').split(String.fromCharCode(10)).filter(line => line.includes('pdf-to-canvas-check.mjs')).slice(0, 3).map(line => ` @${line.trim().replace(/.*check\.mjs:/, '')}`).join('')}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const profile = async name => {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router);
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(`${name}: ${error.message.slice(0, 160)}`));
  return { context, page: p };
};
const openCanvas = async p => {
  await p.goto(`${BASE}/apps/${canvas.name}`);
  await p.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await p.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
  await p.waitForTimeout(1500);
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// ---------------------------------------------------------------- what the canvas shows, and what its blocks hold
// Every block on the canvas, once, in DOM order: its slide number, divider text, PDF iframe title and its top.
const blocksNow = (p = page) => p.evaluate(() => {
  const seen = new Set(), out = [];
  for (const el of document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]')) {
    if (seen.has(el.dataset.blockId)) continue;
    seen.add(el.dataset.blockId);
    const slide = el.querySelector('[data-slide]'), divider = el.querySelector('[data-slide-divider]'), frame = el.querySelector('iframe');
    out.push({ id: el.dataset.blockId, slide: slide ? Number(slide.dataset.slide) : null, divider: divider ? divider.textContent.trim() : null, frame: frame ? frame.title : null, frameSrc: frame ? frame.src.slice(0, 5) : null, y: el.getBoundingClientRect().y });
  }
  return out;
});
const inkBlocks = async (p = page) => (await p.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }, INK))?.blocks || [];
// Each page image: loaded, its aspect ratio, and the page its blue bar names (bar width / image width * 25).
const pageImages = (p = page) => p.evaluate(() => [...document.querySelectorAll('[aria-label="Lesson canvas"] [data-slide]')].map(el => {
  const img = el.querySelector('img'), slide = Number(el.dataset.slide), id = el.closest('[data-block-id]')?.dataset.blockId;
  if (!img || !img.complete || !img.naturalWidth) return { id, slide, loaded: false };
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const row = g.getImageData(0, Math.round(img.naturalHeight * 0.05), img.naturalWidth, 1).data;
  let blue = 0;
  for (let x = 0; x < img.naturalWidth; x++) { const [r, gr, b] = [row[x * 4], row[x * 4 + 1], row[x * 4 + 2]]; if (b > 160 && r < 100 && gr < 100) blue++; }
  return { id, slide, loaded: true, w: img.naturalWidth, h: img.naturalHeight, named: Math.round(25 * blue / img.naturalWidth) };
}));
const aspectOf = n => SIZES[n - 1][1] / SIZES[n - 1][0];
// Every page image loaded, at its own page's aspect ratio, showing its own page.
const assertImages = async (p = page, ids = null) => {
  const images = await waitFor(async () => { const all = (await pageImages(p)).filter(i => !ids || ids.includes(i.id)); return all.length && all.every(i => i.loaded) && all; }, 30000, 'page images did not all load (naturalWidth 0)')
    .catch(async error => { const all = (await pageImages(p)).filter(i => !ids || ids.includes(i.id)); throw Error(`${error.message}: ${all.filter(i => !i.loaded).map(i => i.slide).join(',')} of ${all.length} not loaded`); });
  for (const image of images) {
    assert.ok(Math.abs(image.h / image.w - aspectOf(image.slide)) < 0.01, `page ${image.slide} image is ${image.w}x${image.h}, not the page's aspect ratio ${aspectOf(image.slide).toFixed(3)}`);
    assert.equal(image.named, image.slide, `the image on page block ${image.slide} shows page ${image.named}`);
  }
  return images;
};

// ---------------------------------------------------------------- Sources, the dialog and the canvas
const pane = () => page.locator('[data-chat-pane]');
const sourcesPane = () => page.locator('[data-sources-pane]');
// Add to canvas is on the document's own Materials row (pdf-materials-refinement.md section 1), whatever the reader shows.
const addButton = () => sourcesPane().locator(`[data-material-row][data-source-id="${DOC_KEY}"] [data-material-action="canvas"]`);
const dialogRoot = () => page.locator('[data-pdf-add-dialog]');
const dialog = () => page.locator('[data-pdf-add-dialog] [role="dialog"]');
const confirmButton = () => dialog().locator('button').last();
const cancelButton = () => dialog().getByRole('button', { name: 'Cancel', exact: true });
// A closed Sources panel collapses to width 0 (ResizableSidePanel) but keeps its children, which Playwright still calls visible.
// Sources is the right panel's Context tab (docs/features/hide-right-panel.md): hidden on another tab or with the panel hidden.
// Context shows when the companion column is open on it (a collapsed column keeps its content's own width inside).
const sourcesOpen = () => page.evaluate(() => ['aside[data-companion]', '[data-context-panel]'].every(s => (document.querySelector(s)?.getBoundingClientRect().width || 0) > 50));
// Chat and Context share the panel: a step that needs the composer or the selection pill shows the Chat tab first.
const chatTab = async () => { const tab = page.locator('[data-panel-tab="chat"]'); if (await tab.getAttribute('aria-selected') !== 'true') await tab.click(); };
const openSources = async () => {
  // The composer's chip for the document opens Sources on it (ContextChips: chat.openSource), the way a learner reaches it.
  if (!(await sourcesOpen()) || !(await addButton().isVisible().catch(() => false))) {
    const chip = page.locator(`[data-context-chip] button[title="Open ${DOC_NAME}"]:visible`).first();
    if (await chip.count()) await chip.click({ timeout: 5000 });
    else {
      // The Chat header's one Context / Files / Graph control (owner brief 2026-10-16 item 4), then its Context tab.
      if (await page.locator('[data-panel-companion]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-panel-companion]').click({ timeout: 5000 });
      await page.locator('[data-companion-view="context"]').click({ timeout: 5000 });
      await sourcesPane().waitFor({ state: 'visible', timeout: 10000 });
      await sourcesPane().locator('section button[aria-expanded]').filter({ hasText: DOC_NAME }).first().click({ timeout: 5000 });
    }
  }
  await sourcesPane().waitFor({ state: 'visible', timeout: 10000 });
  await addButton().waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw Error('the Materials row of the PDF shows no [data-material-action="canvas"]'); });
};
const closeSources = async () => { if (await sourcesOpen()) { await page.locator('[data-companion-close]').click(); await page.waitForTimeout(300); } };
const openDialog = async () => {
  await openSources();
  await addButton().click();
  await dialog().waitFor({ timeout: 10000 });
  await waitFor(async () => (await dialog().locator('[data-pdf-total]').innerText()).trim() === '20 pages', 20000)
    .catch(async () => { throw Error(`[data-pdf-total] reads "${await dialog().locator('[data-pdf-total]').innerText().catch(() => '?')}", not "20 pages"`); });
};
const choose = async ({ mode = 'pdf', span = 'all', from, to } = {}) => {
  await dialog().locator(`[data-pdf-choice="${mode}"]`).click();
  if (mode !== 'pages') return;
  await dialog().locator(`[data-pdf-choice="${span}"]`).click();
  if (span !== 'range') return;
  await dialog().locator('[data-pdf-from]').fill(String(from));
  await dialog().locator('[data-pdf-to]').fill(String(to));
};
const label = async () => (await confirmButton().innerText()).trim();
const closed = (ms = 90000) => dialogRoot().waitFor({ state: 'detached', timeout: ms }).catch(() => { throw Error('the dialog did not close'); });
// One add through the dialog; returns the blocks it put on the canvas (DOM order) and their stored data.
const add = async (choice, expectLabel, open = openDialog) => {
  await open();
  await choose(choice);
  assert.equal(await label(), expectLabel, 'the confirm button names the count');
  assert.equal(await confirmButton().isEnabled(), true, 'the confirm button is enabled');
  const before = new Set((await blocksNow()).map(b => b.id));
  await confirmButton().click();
  await closed();
  await page.waitForTimeout(600);
  const added = (await blocksNow()).filter(b => !before.has(b.id));
  const stored = new Map((await waitFor(async () => { const ink = await inkBlocks(); return added.every(b => ink.some(x => x.id === b.id)) && ink; }, 8000, 'the new blocks are not in the saved ink')).map(b => [b.id, b]));
  return added.map(b => ({ ...b, data: stored.get(b.id) }));
};
// A set of pages: slides in page order, top to bottom, each with a "Page n" divider before it unless the set starts at page 1.
const assertPageSet = (added, from, to) => {
  const want = [];
  for (let n = from; n <= to; n++) { if (n !== 1) want.push(`divider Page ${n}`); want.push(`slide ${n}`); }
  assert.deepEqual(added.map(b => (b.slide ? `slide ${b.slide}` : b.divider ? `divider ${b.divider}` : `other ${b.id}`)), want, 'the inserted blocks, in order');
  for (let i = 1; i < added.length; i++) assert.ok(added[i].y > added[i - 1].y, `block ${i + 1} of the set sits below block ${i}`);
  for (const b of added.filter(x => x.slide)) {
    assert.equal(b.data?.type, 'slide', 'a page is a slide block');
    assert.equal(b.data.number, b.slide, 'the block keeps its original page number');
    assert.equal(b.data.pdf, DOC_KEY, `page ${b.slide} keeps its source key`);
    assert.equal(b.data.label, DOC_NAME, 'the block keeps the file name');
    assert.ok(b.data.assetKey && !String(b.data.assetKey).startsWith('blob:'), 'the image is an asset key, never a blob URL');
  }
};
// Pan (wheel, 1:1) until a thing sits in the open middle of the canvas, clear of the side panes.
const rightEdge = async () => Math.min(...(await Promise.all([pane(), sourcesPane()].map(async l => ((await l.isVisible().catch(() => false)) ? (await l.boundingBox()).x : 1e9))))) - 30;
const barePoint = async () => page.evaluate(limit => {
  for (let y = 120; y < 800; y += 40) for (let x = 360; x < limit; x += 40) {
    const element = document.elementFromPoint(x, y);
    if (element?.closest('[data-canvas-surface]') && !element.closest('[data-block-id],[data-item-id],[data-shape-id],[data-block],[data-view-selection],[data-group-box],[role="dialog"],[data-chat-pane],[data-sources-pane],button,a,iframe')) return { x, y };
  }
  return null;
}, await rightEdge());
const reveal = async locator => {
  const view = page.viewportSize(), right = await rightEdge();
  for (let i = 0; i < 14; i += 1) {
    const b = await locator.boundingBox();
    const w = Math.min(b?.width ?? 0, 260), h = Math.min(b?.height ?? 0, 120);
    if (b && b.x > 340 && b.x + w < right && b.y > 100 && b.y + h < view.height - 200) return b;
    const dx = b ? b.x + w / 2 - right / 2 : 0, dy = b ? b.y + h / 2 - view.height * 0.4 : 0;
    const at = await barePoint() || { x: right / 2, y: view.height * 0.4 };
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(Math.round(dx), Math.round(dy));
    await frames();
  }
  return locator.boundingBox();
};
const focusCanvas = async () => {
  const point = await barePoint();
  assert.ok(point, 'a bare point of canvas');
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(250);
};
// Select one page block: a press on its image near the top-left, until the composer shows its pill.
const selectBlock = async id => {
  await chatTab();
  const target = page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
  await reveal(target);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForTimeout(350);
    const b = await target.boundingBox();
    await page.mouse.click(b.x + 60, b.y + 30);
    if (await pane().locator(`[data-selected-card="${id}"]`).waitFor({ timeout: 2500 }).then(() => true, () => false)) return;
  }
  throw Error(`selecting block ${id} showed no [data-selected-card] pill`);
};
const field = () => pane().locator('[data-chat-composer] textarea').first();
const setMode = async mode => {
  if (await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === mode) return;
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator(`[data-chat-mode-option="${mode}"]`).click();
  await page.waitForTimeout(200);
};
const newChat = async () => { await chatTab(); await pane().locator('[data-chat-new]').click(); await page.waitForTimeout(300); };
const send = async text => {
  await field().fill(text);
  const n = captured.length;
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000, 'no model request was sent for the turn');
  const cap = captured[n];
  await pane().getByText(`Canned reply ${cap.reply}.`, { exact: true }).first().waitFor({ timeout: 15000 });
  return cap;
};
const PAGE12 = { sourceId: DOC_KEY, kind: 'doc', range: { page: 12 } };
const isPage = (ref, n) => ref?.sourceId === DOC_KEY && ref.kind === 'doc' && ref.range?.page === n;
const PAGE_ONE = /\bpage 1\b/i;

// ================================================================ the run
const A = await profile('A');
page = A.page;
await openCanvas(page);
const sets = {};

await check('Sources lists the PDF context document; its own Materials row offers Add to canvas', async () => {
  await openSources();
  assert.equal(await addButton().getAttribute('aria-label'), `Add ${DOC_NAME} to canvas`);
  assert.equal(await addButton().getAttribute('title'), `Add ${DOC_NAME} to canvas`);
  await shot('01-sources-add-to-canvas');
});

await check('the dialog: file name, "20 pages", PDF card chosen first, "Add PDF card", Cancel', async () => {
  await openDialog();
  assert.equal((await dialog().locator('[data-pdf-file]').innerText()).trim(), DOC_NAME);
  assert.equal(await dialog().locator('[data-pdf-choice="pdf"]').getAttribute('aria-checked'), 'true', 'PDF card is the default');
  assert.equal(await label(), 'Add PDF card');
  assert.equal(await cancelButton().count(), 1, 'a Cancel button');
  await choose({ mode: 'pages', span: 'all' });
  assert.equal(await label(), 'Add 20 pages', 'All pages names 20');
  await choose({ mode: 'pages', span: 'range', from: 12, to: 16 });
  assert.equal(await label(), 'Add 5 pages', 'pages 12-16 name 5');
  await shot('02-dialog-range-12-16');
});

await check('Cancel adds nothing', async () => {
  const before = (await blocksNow()).length;
  await cancelButton().click();
  await closed(5000);
  await page.waitForTimeout(800);
  assert.equal((await blocksNow()).length, before, 'no block added');
});

await check('Escape adds nothing', async () => {
  const before = (await blocksNow()).length;
  await openDialog();
  await choose({ mode: 'pages', span: 'all' });
  await page.keyboard.press('Escape');
  await closed(5000);
  await page.waitForTimeout(800);
  assert.equal((await blocksNow()).length, before, 'no block added');
});

await check('invalid ranges (0-3, 9-8, 3-21, empty) keep the button disabled and say why', async () => {
  await openDialog();
  await choose({ mode: 'pages', span: 'range', from: 1, to: 2 });
  assert.equal(await confirmButton().isEnabled(), true, 'control: 1-2 is valid');
  for (const [from, to] of [[0, 3], [9, 8], [3, 21], ['', 5], [4, '']]) {
    await dialog().locator('[data-pdf-from]').fill(String(from));
    await dialog().locator('[data-pdf-to]').fill(String(to));
    await page.waitForTimeout(100);
    assert.equal(await confirmButton().isEnabled(), false, `${from}-${to}: the button is disabled (label "${await label()}")`);
    const error = dialog().locator('[data-pdf-range-error]');
    assert.equal(await error.count(), 1, `${from}-${to}: [data-pdf-range-error] is shown`);
    assert.ok((await error.innerText()).trim().length > 0, `${from}-${to}: the error says why`);
  }
  facts.range_errors = await dialog().locator('[data-pdf-range-error]').innerText();
  await shot('03-dialog-invalid-range');
  const before = (await blocksNow()).length;
  await confirmButton().click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
  assert.equal(await dialogRoot().count(), 1, 'a press on the disabled button keeps the dialog');
  await cancelButton().click();
  await closed(5000);
  assert.equal((await blocksNow()).length, before, 'no block added');
});

await check('one PDF card: one card, an iframe titled with the file name, keyed by the context document', async () => {
  const added = await add({ mode: 'pdf' }, 'Add PDF card');
  assert.equal(added.length, 1, `one block added (${added.length})`);
  assert.equal(added[0].frame, DOC_NAME, 'the card\'s iframe is titled with the file name');
  assert.equal(added[0].data?.type, 'pdf', 'a pdf block');
  assert.equal(added[0].data.assetKey, DOC_KEY, 'its asset key is the source key');
  await waitFor(async () => (await blocksNow()).find(b => b.id === added[0].id)?.frameSrc === 'blob:', 10000, 'the card never loaded its PDF bytes');
  sets.card = added;
  await shot('04-pdf-card');
});

await check('all pages: 20 page blocks 1-20 in order with dividers Page 2-20, each image its own page at its own aspect ratio', async () => {
  const added = await add({ mode: 'pages', span: 'all' }, 'Add 20 pages');
  assertPageSet(added, 1, 20);
  await assertImages(page, added.map(b => b.id));
  sets.all = added;
  await shot('05-all-pages');
});

await check('a middle range 12-16: pages 12-16, dividers Page 12-16 (a leading one), landscape page 14 at its own ratio', async () => {
  const added = await add({ mode: 'pages', span: 'range', from: 12, to: 16 }, 'Add 5 pages');
  assertPageSet(added, 12, 16);
  await assertImages(page, added.map(b => b.id));
  sets.middle = added;
  await reveal(page.locator(`[data-block-id="${added[0].id}"]`).first());
  await shot('06-range-12-16');
});

await check('a single-page range 7-7: one page 7 with its Page 7 divider', async () => {
  const added = await add({ mode: 'pages', span: 'range', from: 7, to: 7 }, 'Add 1 page');
  assertPageSet(added, 7, 7);
  await assertImages(page, added.map(b => b.id));
  sets.single = added;
});

await check('Undo (Ctrl+Z on the canvas) removes a whole inserted set in one step and nothing else', async () => {
  const added = await add({ mode: 'pages', span: 'range', from: 3, to: 5 }, 'Add 3 pages');
  assertPageSet(added, 3, 5);
  const others = (await blocksNow()).map(b => b.id).filter(id => !added.some(a => a.id === id));
  await closeSources();
  await focusCanvas();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  const now = new Set((await blocksNow()).map(b => b.id));
  assert.deepEqual(added.filter(b => now.has(b.id)).map(b => b.slide ? `slide ${b.slide}` : b.divider), [], 'the whole set is gone after one undo');
  assert.deepEqual(others.filter(id => !now.has(id)), [], 'every other block stays');
});

await check('Escape while pages are drawing adds nothing', async () => {
  await openDialog();
  await choose({ mode: 'pages', span: 'all' });
  const before = new Set((await blocksNow()).map(b => b.id));
  await confirmButton().click();
  const busy = await waitFor(async () => /Drawing page/.test(await label().catch(() => '')) || !(await dialogRoot().count()), 10000, 'no progress shown').catch(() => false);
  assert.ok(busy && await dialogRoot().count(), 'the dialog showed "Drawing page" progress before it finished (too fast to press Escape during the drawing)');
  facts.progress_label = await label();
  await page.keyboard.press('Escape');
  await closed(5000);
  await page.waitForTimeout(6000);
  const added = (await blocksNow()).filter(b => !before.has(b.id));
  if (added.length) { await focusCanvas(); await page.keyboard.press('Control+z'); await page.waitForTimeout(600); }
  assert.equal(added.length, 0, `${added.length} blocks were added after Escape during the drawing`);
});

// The truth from here on: what the browser holds.
let slideIds = [], slideKeys = [];
await check('the board and every page image reach the server copy; no blob URL is stored', async () => {
  const ink = await inkBlocks();
  slideIds = ink.filter(b => b.type === 'slide').map(b => b.id);
  slideKeys = ink.filter(b => b.type === 'slide').map(b => b.assetKey);
  assert.ok(slideIds.length >= 5, `page blocks in this browser: ${slideIds.length}`);
  const end = Date.now() + 45000;
  let board, keys;
  for (;;) {
    board = await boardOf();
    keys = new Set(await serverAssets());
    const blocks = board.state?.blocks || [];
    if (slideIds.every(id => blocks.some(b => b.id === id)) && slideKeys.every(k => keys.has(k)) && keys.has(DOC_KEY)) break;
    if (Date.now() > end) throw Error(`server copy: ${blocks.filter(b => b.type === 'slide').length} of ${slideIds.length} pages, ${slideKeys.filter(k => keys.has(k)).length} of ${slideKeys.length} page images, PDF card bytes ${keys.has(DOC_KEY) ? 'saved' : 'missing'}`);
    await page.waitForTimeout(1000);
  }
  assert.ok(!JSON.stringify(board.state).includes('blob:'), 'the server copy holds no blob URL');
  assert.ok(!JSON.stringify(ink).includes('blob:'), 'this browser\'s copy holds no blob URL');
  facts.server = { version: board.version, slides: slideIds.length, asset_keys: keys.size };
});

await check('reload keeps the blocks and their images', async () => {
  const before = (await blocksNow()).map(b => b.id).sort();
  await page.reload();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await waitFor(async () => (await blocksNow()).length >= before.length, 30000, 'the blocks did not come back');
  assert.deepEqual((await blocksNow()).map(b => b.id).sort(), before, 'the same blocks');
  const images = await assertImages(page);
  assert.equal(images.length, slideIds.length, `${slideIds.length} page images (${images.length})`);
  await waitFor(async () => (await blocksNow()).find(b => b.id === sets.card?.[0]?.id)?.frameSrc === 'blob:', 10000, 'the PDF card did not reopen its bytes');
});

await check('a fresh browser profile (same account, empty storage) restores the blocks and images from the server copy', async () => {
  const B = await profile('B');
  try {
    await openCanvas(B.page);
    await B.page.waitForFunction(n => document.querySelectorAll('[aria-label="Lesson canvas"] [data-slide]').length >= n, slideIds.length, { timeout: 30000 })
      .catch(async () => { throw Error(`${await B.page.locator('[aria-label="Lesson canvas"] [data-slide]').count()} of ${slideIds.length} page blocks in the fresh profile`); });
    const images = await assertImages(B.page);
    assert.equal(images.length, slideIds.length, `${slideIds.length} page images (${images.length})`);
    const card = (await blocksNow(B.page)).find(b => b.frame);
    assert.ok(card, 'the PDF card is there');
    const deadline = Date.now() + 15000;
    while ((await blocksNow(B.page)).find(b => b.frame)?.frameSrc !== 'blob:' && Date.now() < deadline) await B.page.waitForTimeout(300);
    assert.equal((await blocksNow(B.page)).find(b => b.frame)?.frameSrc, 'blob:', 'the PDF card opened its bytes from the server copy');
    await B.page.screenshot({ path: `${OUT}/07-fresh-profile.png` });
  } finally { await B.context.close(); }
});

const page12 = () => sets.middle?.find(b => b.slide === 12)?.id;
await check('a question about the selected page 12 sends the doc ref at page 12, never page 1', async () => {
  await closeSources();
  await newChat();
  await setMode('ask');
  await selectBlock(page12());
  await shot('08-page-12-selected');
  const cap = await send('What is on this page?');
  assert.equal(cap.route, 'ask', 'Ask posts to /api/learn/ask');
  const refs = cap.body.context_refs || [];
  facts.page12_question = { context_refs: refs, canvas_target: cap.body.canvas_target ?? null, paper_context: cap.body.paper_context ?? null };
  assert.ok(refs.some(r => isPage(r, 12)), `context_refs holds ${JSON.stringify(PAGE12)} (got ${JSON.stringify(refs.map(r => [r.sourceId, r.kind, r.range]))})`);
  assert.ok(!refs.some(r => r.sourceId === DOC_KEY && r.range?.page && r.range.page !== 12), 'no other page of the document rides');
  const text = String(cap.body.canvas_target?.text || '');
  assert.ok(/\bpage 12\b/i.test(text), `canvas_target.text names page 12: "${text.slice(0, 120)}"`);
  assert.ok(!PAGE_ONE.test(text) && !PAGE_ONE.test(String(cap.body.canvas_target?.title || '')), 'canvas_target never names page 1');
  assert.ok(!cap.body.paper_context, 'a context document page sends no paper_context');
});

// Follow-up 5: in Auto this canvas's journey Tutor answers, and its plan request carries the one page (page_context).
await check('in the default Auto mode, a question about the selected page 12 keeps the journey Tutor and its plan carries page 12 of the document', async () => {
  await newChat();
  await setMode('auto');
  await selectBlock(page12());
  const cap = await send('What does this page say?');
  facts.page12_auto = { route: cap.route, page_context: cap.body.page_context ?? null, context_refs: cap.body.context_refs ?? null };
  assert.equal(cap.route, 'plan', `Auto posted to ${cap.route === 'ask' ? '/api/learn/ask' : cap.route}, not the Tutor plan`);
  assert.deepEqual(cap.body.page_context, { doc: { id: DOC.id, page: 12 } }, 'the plan carries page 12 of the context document, never page 1');
});

await check('Add to chat (Ctrl+L) on page 12 attaches the same doc page-12 ref', async () => {
  await newChat();
  await setMode('ask');
  await selectBlock(page12());
  const chips = pane().locator('[data-context-chip]');
  const before = await chips.count();
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Control+l');
  await waitFor(async () => (await chips.count()) > before, 5000, `no new chip after Ctrl+L (had ${before})`);
  await shot('09-add-to-chat-page-12');
  // Let go of the selection, so only the chip can carry the page.
  await focusCanvas();
  await page.keyboard.press('Escape');
  await waitFor(async () => (await pane().locator('[data-canvas-target]').count()) === 0, 5000, 'the selection pill stayed');
  const cap = await send('Explain the attached page.');
  const refs = cap.body.context_refs || [];
  facts.add_to_chat = { context_refs: refs, canvas_target: cap.body.canvas_target ?? null };
  assert.ok(refs.some(r => isPage(r, 12)), `context_refs holds the page-12 doc ref (got ${JSON.stringify(refs.map(r => [r.sourceId, r.kind, r.range]))})`);
  assert.ok(!refs.some(r => isPage(r, 1)), 'never page 1');
});

await check('deleting a page block leaves the context document as it was', async () => {
  const id = sets.middle.find(b => b.slide === 13).id;
  await selectBlock(id);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Delete');
  await waitFor(async () => !(await blocksNow()).some(b => b.id === id), 5000, 'the page block was not deleted');
  const docs = await docsNow();
  const doc = docs.find(d => d.id === DOC.id);
  assert.ok(doc, 'the document is still listed');
  assert.equal(doc.attached, DOC.attached, 'its attached flag is unchanged');
  const bytes = await fetch(`${BASE}/api/learn/context/${encodeURIComponent(DOC.id)}?app=${canvas.name}`, { headers: { cookie } });
  assert.equal(bytes.status, 200, 'its bytes are still served');
  assert.equal(Buffer.from(await bytes.arrayBuffer()).equals(PDF), true, 'the same bytes');
});

let dropped = null;
await check('the upload/drop road: a dropped PDF opens the same dialog; the upload is posted only after the choice; pages 2-3 land', async () => {
  const surface = page.locator('[aria-label="Lesson canvas"] div.touch-none').first();
  const drop = async () => {
    const box = await surface.boundingBox();
    await page.evaluate(([element, bytes, name, x, y]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }));
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y };
      element.dispatchEvent(new DragEvent('dragover', init));
      element.dispatchEvent(new DragEvent('drop', init));
    }, [await surface.elementHandle(), [...PDF], DROP_NAME, box.x + box.width * 0.4, box.y + box.height * 0.4]);
  };
  const opened = async () => {
    await drop();
    await dialog().waitFor({ timeout: 15000 });
    await waitFor(async () => (await dialog().locator('[data-pdf-total]').innerText()).trim() === '20 pages', 15000, 'the dropped PDF shows no "20 pages"');
    assert.equal((await dialog().locator('[data-pdf-file]').innerText()).trim(), DROP_NAME, 'the dialog names the dropped file');
    assert.equal(papers.length, 0, 'nothing is uploaded before the choice');
  };
  const added = await add({ mode: 'pages', span: 'range', from: 2, to: 3 }, 'Add 2 pages', opened);
  dropped = added;
  assert.equal(papers.length, 1, `one upload after the choice (${papers.length})`);
  assert.deepEqual(added.map(b => (b.slide ? `slide ${b.slide}` : `divider ${b.divider}`)), ['divider Page 2', 'slide 2', 'divider Page 3', 'slide 3']);
  for (const b of added.filter(x => x.slide)) assert.match(String(b.data?.pdf), /^pdf:/, 'an uploaded PDF\'s page keeps its paper key');
  await assertImages(page, added.map(b => b.id));
  await shot('10-dropped-pages-2-3');
  // The hidden file input (Insert > Upload a file) opens the same dialog; Cancel adds and uploads nothing.
  const count = (await blocksNow()).length;
  await page.locator('input[type="file"][accept*=".ipynb"]').setInputFiles({ name: DROP_NAME, mimeType: 'application/pdf', buffer: PDF });
  await dialog().waitFor({ timeout: 15000 });
  assert.equal((await dialog().locator('[data-pdf-file]').innerText()).trim(), DROP_NAME, 'the upload names its file');
  await cancelButton().click();
  await closed(5000);
  await page.waitForTimeout(800);
  assert.equal((await blocksNow()).length, count, 'Cancel adds nothing');
  assert.equal(papers.length, 1, 'Cancel uploads nothing');
});

// ================================================================ follow-ups 2-5 (docs/features/pdf-to-canvas.md)
// The upload/drop road's own page 12: the uploaded paper at page 12, for Add to chat and the copies below.
const dropPdf = async () => {
  const surface = page.locator('[aria-label="Lesson canvas"] div.touch-none').first();
  const box = await surface.boundingBox();
  await page.evaluate(([element, bytes, name, x, y]) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }));
    const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y };
    element.dispatchEvent(new DragEvent('dragover', init));
    element.dispatchEvent(new DragEvent('drop', init));
  }, [await surface.elementHandle(), [...PDF], DROP_NAME, box.x + box.width * 0.4, box.y + box.height * 0.4]);
  await dialog().waitFor({ timeout: 15000 });
  await waitFor(async () => (await dialog().locator('[data-pdf-total]').innerText()).trim() === '20 pages', 15000, 'the dropped PDF shows no "20 pages"');
};
let paper12 = null, PAPER_ID = null;
await check('the upload/drop road: page 12 alone lands as the uploaded paper at page 12, naming its home canvas', async () => {
  const added = await add({ mode: 'pages', span: 'range', from: 12, to: 12 }, 'Add 1 page', dropPdf);
  paper12 = added.find(b => b.slide === 12);
  assert.ok(paper12, 'page 12 landed');
  assert.match(String(paper12.data?.pdf), /^pdf:upload:[0-9a-f]{12}$/, 'it keeps its paper key');
  assert.equal(paper12.data.home, canvas.name, 'it names the canvas its upload is stored on');
  PAPER_ID = paper12.data.pdf.slice('pdf:'.length);
});

await check('follow-up 3: Add to chat (Ctrl+L) on the uploaded-PDF page 12 attaches that paper at page 12; with the selection cleared the question reads page 12', async () => {
  await closeSources();
  await newChat();
  await setMode('ask');
  await selectBlock(paper12.id);
  const chips = pane().locator('[data-context-chip]');
  const before = await chips.count();
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Control+l');
  await waitFor(async () => (await chips.count()) > before, 5000, `no new chip after Ctrl+L (had ${before})`);
  await shot('11-add-to-chat-uploaded-page-12');
  await focusCanvas();
  await page.keyboard.press('Escape');
  await waitFor(async () => (await pane().locator('[data-canvas-target]').count()) === 0, 5000, 'the selection pill stayed');
  const cap = await send('Explain the attached page.');
  const refs = cap.body.context_refs || [];
  facts.add_to_chat_uploaded = { context_refs: refs, paper_context: cap.body.paper_context ?? null, canvas_target: cap.body.canvas_target ?? null };
  assert.ok(refs.some(r => r.sourceId === `paper:${PAPER_ID}` && r.kind === 'web' && r.range?.page === 12), `context_refs holds the paper at page 12 (got ${JSON.stringify(refs.map(r => [r.sourceId, r.kind, r.range]))})`);
  assert.ok(!refs.some(r => r.kind === 'card'), 'no text-only card ref');
  assert.deepEqual(cap.body.paper_context, { id: PAPER_ID, page: 12, home: canvas.name }, 'the page is read as paper_context at page 12');
  assert.ok(!cap.body.canvas_target, 'only the chip carries the page');
  // Several pages (this chip and a selected page 12 of the document) keep the fallback in Auto: /api/learn/ask sends them all.
  await setMode('auto');
  await selectBlock(page12());
  const both = await send('Compare these two pages.');
  facts.two_pages_auto = { route: both.route, paper_context: both.body.paper_context ?? null, context_refs: (both.body.context_refs || []).map(r => [r.sourceId, r.range]) };
  assert.equal(both.route, 'ask', 'two pages post to /api/learn/ask');
  assert.ok((both.body.context_refs || []).some(r => isPage(r, 12)), 'the document page 12 rides');
  assert.deepEqual(both.body.paper_context, { id: PAPER_ID, page: 12, home: canvas.name }, 'and the uploaded page 12 rides');
});

// Coverage: one uploaded PDF is read per question; a page chip of another uploaded PDF is marked a label only.
await check('coverage: with page chips of two uploaded PDFs, the one not read is marked label only (visible text and tooltip); the first chip PDF is the paper_context', async () => {
  const other = dropped?.find(b => b.slide === 2);
  assert.ok(other, 'the dropped set holds page 2');
  const OTHER_ID = String(other.data?.pdf).slice('pdf:'.length);
  assert.notEqual(OTHER_ID, PAPER_ID, 'two different uploads');
  await closeSources();
  await newChat();
  await setMode('ask');
  const chips = pane().locator('[data-context-chip]');
  for (const id of [paper12.id, other.id]) {
    await selectBlock(id);
    const before = await chips.count();
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+l');
    await waitFor(async () => (await chips.count()) > before, 5000, `no new chip after Ctrl+L (had ${before})`);
  }
  await focusCanvas();
  await page.keyboard.press('Escape');
  await waitFor(async () => (await pane().locator('[data-canvas-target]').count()) === 0, 5000, 'the selection pill stayed');
  const marked = pane().locator('[data-context-chip][data-label-only]');
  await waitFor(async () => (await marked.count()) === 1, 5000, 'not exactly one chip marked label only');
  assert.match(await marked.innerText(), /label only/, 'the marker is visible text');
  assert.match(String(await marked.locator('button').first().getAttribute('title')), /sent as a label only/, 'its tooltip says why');
  await shot('11b-label-only-chip');
  const cap = await send('Compare the attached pages.');
  facts.label_only = { paper_context: cap.body.paper_context ?? null, context_refs: (cap.body.context_refs || []).map(r => [r.sourceId, r.range]) };
  assert.deepEqual(cap.body.paper_context, { id: PAPER_ID, page: 12, home: canvas.name }, 'the first chip PDF is the one read');
  assert.ok((cap.body.context_refs || []).some(r => r.sourceId === `paper:${OTHER_ID}` && r.range?.page === 2), 'the label-only page rides as a named ref');
});

await check('follow-up 4: a set added with the view centre between a page label and its page lands before the label; every pair stays together; one Undo removes only it', async () => {
  await openSources();
  const label15 = sets.middle.find(b => b.divider === 'Page 15').id;
  const divider = page.locator(`[aria-label="Lesson canvas"] [data-block-id="${label15}"]`).first();
  await reveal(divider);
  // Pan until the canvas's middle line runs just under the "Page 15" label, above the middle of page 15 itself.
  for (let i = 0; i < 8; i += 1) {
    const d = await divider.boundingBox(), s = await page.locator('[aria-label="Lesson canvas"] div.touch-none').first().boundingBox();
    const delta = d.y + d.height + 12 - (s.y + s.height / 2);
    if (Math.abs(delta) < 4) break;
    const at = await barePoint() || { x: 600, y: 400 };
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, Math.round(delta));
    await frames();
  }
  await shot('12-view-between-label-and-page');
  const added = await add({ mode: 'pages', span: 'range', from: 9, to: 9 }, 'Add 1 page');
  assertPageSet(added, 9, 9);
  const order = (await blocksNow()).map(b => ({ id: b.id, key: b.slide ? `slide ${b.slide}` : b.divider ? `divider ${b.divider}` : 'other' }));
  const at = order.findIndex(b => b.id === added[0].id);
  assert.deepEqual(order.slice(at, at + 4).map(b => b.key), ['divider Page 9', 'slide 9', 'divider Page 15', 'slide 15'], 'the new set sits in front of the Page 15 label, never between it and page 15');
  for (let i = 0; i < order.length; i += 1) {
    const n = Number(order[i].key.match(/^slide (\d+)$/)?.[1]);
    if (n && n !== 1) assert.equal(order[i - 1]?.key, `divider Page ${n}`, `page ${n} keeps its label right above it`);
  }
  const others = order.map(b => b.id).filter(id => !added.some(a => a.id === id));
  await closeSources();
  await focusCanvas();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  const now = new Set((await blocksNow()).map(b => b.id));
  assert.deepEqual(added.filter(b => now.has(b.id)).map(b => b.id), [], 'one undo removes the whole new set');
  assert.deepEqual(others.filter(id => !now.has(id)), [], 'every other block stays');
});

// The server board a Duplicate or a fork copies, once it holds page 12 of both sources.
// Every page picture too: this browser uploads them after the board, and leaving the canvas would stop that.
const serverHas = ids => waitFor(async () => {
  const blocks = (await boardOf()).state?.blocks || [], keys = new Set(await serverAssets());
  return ids.every(id => blocks.some(b => b.id === id)) && blocks.filter(b => b.type === 'slide').every(b => keys.has(b.assetKey)) && blocks;
}, 60000, 'the server board does not hold the page-12 blocks and every page picture yet');
await check('follow-up 2: the owner Duplicate keeps the reader and AI context of each page - both PDFs read on the copy, and page 12 there asks from its home', async () => {
  const doc12 = sets.middle.find(b => b.slide === 12);
  assert.equal(doc12?.data?.home, canvas.name, 'a context-document page names its canvas too');
  await serverHas([doc12.id, paper12.id]);
  const copy = await api('/api/learn/boards/duplicate', { method: 'POST', body: JSON.stringify({ source: { canvas: canvas.name }, key: `dup-${run}` }) });
  assert.match(String(copy.name), /^canvas-[a-f0-9]{8}$/, `the Duplicate was made (${JSON.stringify(copy).slice(0, 160)})`);
  facts.duplicate = copy.name;
  const bytes = async url => { const r = await fetch(`${BASE}${url}`, { headers: { cookie } }); return { status: r.status, same: r.ok && Buffer.from(await r.arrayBuffer()).equals(PDF) }; };
  assert.deepEqual(await bytes(`/api/learn/context/${encodeURIComponent(DOC.id)}?app=${copy.name}`), { status: 200, same: true }, 'the context document reads on the copy');
  assert.deepEqual(await bytes(`/api/learn/paper?app=${copy.name}&id=${encodeURIComponent(PAPER_ID)}&home=${canvas.name}`), { status: 200, same: true }, 'the uploaded paper reads on the copy from its home');
  assert.equal((await bytes(`/api/learn/paper?app=${copy.name}&id=${encodeURIComponent(PAPER_ID)}`)).status, 404, 'without its home the copy has no upload of that id');
  await page.goto(`${BASE}/apps/${copy.name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
  const copyInk = INK.replace(canvas.name, copy.name);
  const ink = await waitFor(async () => { const blocks = (await page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }, copyInk))?.blocks || []; return blocks.some(b => b.type === 'slide' && b.number === 12 && b.pdf === `pdf:${PAPER_ID}`) && blocks; }, 30000, 'the copy did not load its pages');
  const copied = ink.find(b => b.type === 'slide' && b.number === 12 && b.pdf === `pdf:${PAPER_ID}`);
  assert.equal(copied.home, canvas.name, 'the copied page names its home canvas');
  await newChat();
  await setMode('ask');
  await selectBlock(copied.id);
  // Open (Enter) opens its reader, which reads the upload from its home.
  const read = page.waitForResponse(r => r.url().includes('/api/learn/paper?') && r.url().includes(`home=${canvas.name}`), { timeout: 20000 });
  await page.keyboard.press('Enter');
  assert.equal((await read).status(), 200, 'the reader on the copy opened the PDF');
  // It draws page 12 itself: the page text layer reads PAGE 12.
  await waitFor(async () => /PAGE 12/.test(await page.locator('[aria-label="Paper page text"]').first().innerText().catch(() => '')), 20000, 'the reader on the copy did not draw page 12');
  await shot('13-duplicate-reader-page-12');
  await selectBlock(copied.id);
  const cap = await send('What is on this page?');
  facts.duplicate_question = { paper_context: cap.body.paper_context ?? null };
  assert.deepEqual(cap.body.paper_context, { id: PAPER_ID, page: 12, home: canvas.name }, 'the question on the copy reads page 12 from its home');
});

await check('follow-up 2: another person never reads the PDF - their fork of the shared canvas keeps the page pictures, the bytes are refused, and a page brought no whole PDF', async () => {
  const state = (await boardOf()).state;
  const shared = await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, state }) });
  assert.ok(shared.sharing?.view, 'the canvas is shared by link');
  const other = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `p2c-other-${run}@example.com`, secret }) })).json()).session;
  const as = (path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${other}`, 'content-type': 'application/json', ...init.headers } });
  try {
    const fork = await (await as('/api/learn/boards/fork', { method: 'POST', body: JSON.stringify({ source: { token: shared.sharing.view }, key: `other-${run}` }) })).json();
    assert.match(String(fork.name), /^canvas-[a-f0-9]{8}$/, `the other person forked it (${JSON.stringify(fork).slice(0, 160)})`);
    const blocks = (await (await as(`/api/learn/boards/${fork.name}/main`)).json()).state?.blocks || [];
    const pages = blocks.filter(b => b.type === 'slide');
    assert.ok(pages.some(b => b.pdf === `pdf:${PAPER_ID}` && b.number === 12 && b.home === canvas.name), 'the fork holds page 12 of the upload, naming its home');
    const keys = new Set((await (await as(`/api/learn/boards/${fork.name}/main/assets`)).json()).keys || []);
    const missing = pages.filter(b => !keys.has(b.assetKey));
    assert.deepEqual(missing.map(b => b.number), [], `every page picture travelled with the fork (${keys.size} files on the fork)`);
    const cardKeys = new Set(blocks.filter(b => b.type === 'pdf').map(b => b.assetKey));
    assert.deepEqual([...keys].filter(k => /^(doc|pdf):/.test(k) && !cardKeys.has(k)), [], 'no whole PDF travelled because a page was shared (only a PDF card the owner placed carries its PDF)');
    assert.equal(keys.has(`pdf:${PAPER_ID}`), false, 'the uploaded paper of page 12 did not travel');
    const refused = async url => { const r = await as(url); return { status: r.status, error: r.ok ? 'served' : (await r.json().catch(() => ({}))).error }; };
    const doc = await refused(`/api/learn/context/${encodeURIComponent(DOC.id)}?app=${fork.name}`);
    const paper = await refused(`/api/learn/paper?app=${fork.name}&id=${encodeURIComponent(PAPER_ID)}&home=${canvas.name}`);
    const direct = await refused(`/api/learn/paper?app=${canvas.name}&id=${encodeURIComponent(PAPER_ID)}`);
    facts.other_person = { fork: fork.name, doc, paper, direct: direct.status };
    assert.equal(doc.status, 404); assert.match(String(doc.error), /not available to you/);
    assert.equal(paper.status, 404); assert.match(String(paper.error), /not available to you/);
    assert.ok([403, 404].includes(direct.status), `the owner canvas itself is refused (${direct.status})`);
  } finally { await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: false }) }); }
});

await check('the context document is unchanged: listed once, same attached flag, same size; no new context document', async () => {
  const docs = await docsNow();
  assert.deepEqual(docs.map(d => d.id), [DOC.id], `only the one document (${docs.map(d => d.id).join(', ')})`);
  assert.equal(docs[0].attached, DOC.attached, 'the same attached flag');
  assert.equal(docs[0].size, PDF.length, 'the same size');
});

await check('no model call, no other model-capable request, no page error', async () => {
  assert.equal(captured.length, 7, `only the seven questions this check sent (${captured.map(c => c.route).join(', ')})`);
  assert.deepEqual(refused, [], `refused routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await A.context.close();
await browser.close();
const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvas: canvas.name, document: DOC.id, passed: results.length - failed.length, failed: failed.length, checks: results, facts,
  model_capable_refused: refused, paper_uploads: papers.length, outside_hosts: [...new Set(outside)], page_errors: errors }, null, 2));
console.log(failed.length ? `FAIL ${failed.length} of ${results.length} checks (see ${OUT}/results.json)` : `PASS ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
