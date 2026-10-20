// PDF highlights and excerpts (C:/s/spec/pdf-excerpts/brief.md section 15, contract.md), against the LOCAL stack only: local D1 and
// fresh browser profiles. No model is ever called: /api/learn/ask (an SSE stream) and the Tutor planner are answered here with
// canned text and their request bodies CAPTURED; every other model-capable route is aborted and counted, and none may happen.
// Setup: a canvas; a 7-page PDF built here with known text on known pages (page labels i, ii, then 1-5; a two-paragraph passage on
// page 3; a green figure on page 4; /Rotate 90 on page 5; no text on page 6; > 8,000 characters on page 7), stored once as the
// canvas's context document (POST /api/learn/context) and once as an uploaded paper (the canvas drop road, POST /api/learn/paper).
// Covers the brief's 17 items as far as the contract's DOM/event/route names allow; each step names its items in results.json.
// Payload-level only: a region crop riding as an image file ref proves the request carries it, NOT that a model understood it.
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets); `N/total passed`; exits 1 on any failure.
// Evidence goes to OUT: results.json (captured context_refs, never cookies) and *.png.
// Usage: BASE=http://127.0.0.1:8881 SMALL_CP=http://127.0.0.1:8883 VARS=<cp .dev.vars> OUT=<dir> node e2e/pdf-excerpt-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const total = 38; // the number of check() steps below; keep it equal (memory rule: totals must match)
const BASE = process.env.BASE || 'http://127.0.0.1:8881';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8883';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('pdf-excerpt-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/pdf-excerpt', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const mint = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const session = await mint(`pdfx-${run}@example.com`);
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

// ---------------------------------------------------------------- the PDF: known text on known pages, a correct xref
const PREFACE = 'Preface line for the highlight check on page i.';
const UNDO_TEXT = 'UNDO SENTENCE on the contents page for the lifecycle check.';
const PASSAGE_LINES = [[700, 'Rivers carry sediment from the hills toward the sea, and the'], [684, 'slow current lays it down where the channel widens.'],
  [648, 'Over many seasons those deposits build a delta whose shape'], [632, 'records the balance between the river and the tides.']];
const PASSAGE = `${PASSAGE_LINES[0][1]} ${PASSAGE_LINES[1][1]}\n\n${PASSAGE_LINES[2][1]} ${PASSAGE_LINES[3][1]}`;
const CLOSING = 'A closing line follows the passage.';
const SECOND = 'SECOND EXCERPT sits on page four for distinct refs.';
const CAPTION = 'Figure 1. A green block for the region check.';
const FIGURE = [150, 400, 450, 600], DRAWN = [140, 390, 460, 610]; // the green rect, and the region drawn around it (PDF points)
const ROTATED = 'ROTATED PASSAGE on the turned page five.';
const LONG_LINES = Array.from({ length: 100 }, (_, i) => `Line ${String(i + 1).padStart(3, '0')} carries words for the limit check: alpha beta gamma delta epsilon zeta eta theta iota.`);
const LONG = LONG_LINES.join(' ');
const esc = s => s.replace(/[\\()]/g, m => `\\${m}`);
const line = (x, y, size, s) => `BT /F1 ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET`;
const PAGES = [
  { label: 'i', ops: [line(72, 700, 14, PREFACE)] },
  { label: 'ii', ops: [line(72, 700, 12, UNDO_TEXT)] },
  { label: '1', ops: [line(72, 740, 18, 'Chapter 1'), ...PASSAGE_LINES.map(([y, s]) => line(72, y, 12, s)), line(72, 590, 12, CLOSING)] },
  { label: '2', ops: [line(72, 700, 12, SECOND), `0.1 0.6 0.2 rg ${FIGURE[0]} ${FIGURE[1]} ${FIGURE[2] - FIGURE[0]} ${FIGURE[3] - FIGURE[1]} re f`, '0 g', line(150, 375, 11, CAPTION)] },
  // Drawn turned a quarter left, so with /Rotate 90 it reads level on screen: in PDF space it runs up the page (tall, narrow rects).
  { label: '3', rotate: 90, ops: [`BT /F1 14 Tf 0 1 -1 0 300 100 Tm (${esc(ROTATED)}) Tj ET`] },
  { label: '4', ops: ['0.2 0.3 0.8 rg 100 200 400 400 re f'] }, // scanned-like: a shape, no text
  { label: '5', ops: LONG_LINES.map((s, i) => line(40, 770 - i * 7, 6, s)) },
];
function makePdf(pages) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R /PageLabels << /Nums [0 << /S /r >> 2 << /S /D >>] >> >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  pages.forEach(({ ops, rotate }, i) => {
    const stream = ops.join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]${rotate ? ` /Rotate ${rotate}` : ''} /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const PDF = makePdf(PAGES), PDF_SHA = createHash('sha256').update(PDF).digest('hex'), N = PAGES.length;
const DOC_NAME = 'excerpts.pdf', DROP_NAME = 'excerpt-paper.pdf';

// ---------------------------------------------------------------- setup: a canvas and its context document
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `PDF excerpts ${run}` }) });
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
const query = o => new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v != null))).toString();
const getAs = async (who, path) => { const r = await fetch(`${BASE}${path}`, { headers: { cookie: who } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const highlightsOf = (key, { who = cookie, app = canvas.name, home = null } = {}) => getAs(who, `/api/learn/pdf-highlights?${query({ app, key, home })}`);
const highlightIds = async (key, home = null) => ((await highlightsOf(key, { home })).body.highlights || []).map(h => h.id);
const pageOf = h => h?.page?.index ?? h?.page;
const REFUSED = 'This file is not available to you.'; // the one refusal of every pdf-excerpts route (contract; server report 6038a6a0)

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], outside = [], errors = [], uploads = [], crops = [], highlightPuts = [], routeErrors = [];
let replies = 0, fakeSha = false, failCrops = 0, failedCrops = 0, inlineSends = 0;
const inline = []; // Ctrl+K requests (/api/learn/inline/decide bodies), answered 'blocked' here: no generate, no model
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/handoff|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  const path = url.pathname, method = request.method();
  // Item 16: "the document changed" is the server's sha256 differing from the anchor's; bytes are never replaced in place
  // (contract), so this step rewrites the hash in the two GET replies the reader reads it from.
  if (fakeSha && method === 'GET' && /^\/api\/learn\/pdf-(source|highlights)$/.test(path)) {
    try { const response = await route.fetch(); const json = await response.json(); if (json.sha256) json.sha256 = 'f'.repeat(64); return route.fulfill({ response, json }); }
    catch (error) { routeErrors.push(String(error?.message || error).split('\n')[0].slice(0, 80)); return route.abort(); } // never print headers
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.fallback();
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ route: 'ask', body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `pdfx-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/tutor/plan') {
    const reply = ++replies;
    captured.push({ route: 'plan', body, reply });
    return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', constraints_add: [], actions: [{ type: 'respond_text', text: `Canned reply ${reply}.` }] } });
  }
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path)) return route.fulfill({ json: { ok: true } }); // the canned thread ids exist nowhere
  if (method === 'POST' && ['/api/learn/paper', '/api/learn/context'].includes(path)) uploads.push(path);
  if (path === '/api/learn/inline/decide') { inline.push(body); return route.fulfill({ json: { decision: 'blocked', message: 'Fixture inspection only', paid: false } }); }
  if (method === 'PUT' && /^\/api\/learn\/pdf-excerpts\/[^/]+\/crop$/.test(path)) {
    // Item 10 partial failure: the next crop upload fails once, as a server error would.
    if (failCrops > 0) { failCrops -= 1; failedCrops += 1; return route.fulfill({ status: 500, json: { error: 'Fixture: the crop upload failed.' } }); }
    crops.push({ id: path.split('/')[4], key: url.searchParams.get('key'), page: url.searchParams.get('page') });
  }
  if (method === 'PUT' && /^\/api\/learn\/pdf-highlights\/[^/]+$/.test(path)) highlightPuts.push(path.split('/').pop());
  if (MODEL.test(path)) { refused.push(`${method} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
let page = null;
const results = [], facts = {};
const ONLY = process.env.ONLY || ''; // debugging: run only the steps whose label contains one of these '|'-separated substrings
const check = async (label, items, fn) => {
  if (ONLY && !ONLY.split('|').some(part => label.includes(part))) return;
  try { await fn(); results.push({ label, items, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, items, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}${String(error?.stack || '').split('\n').filter(l => l.includes('pdf-excerpt-check.mjs')).slice(0, 3).map(l => ` @${l.trim().replace(/.*check\.mjs:/, '')}`).join('')}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const profile = async (name, sess = session) => {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: sess, url: BASE }]);
  await context.route('**/*', router);
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(`${name}: ${error.message.slice(0, 160)}`));
  return { context, page: p };
};
const openCanvas = async (p, name = canvas.name) => {
  await p.goto(`${BASE}/apps/${name}`);
  await p.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await p.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
  await p.waitForTimeout(1500);
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(120); } };
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
// Every string anywhere in a request body, whitespace-collapsed: does the body carry this text?
const strings = v => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const bodyHas = (body, text) => strings(body).some(s => norm(s).includes(norm(text)));

// ---------------------------------------------------------------- the canvas, its cards and their stored blocks
const inkBlocks = async (p = page) => (await p.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }, INK))?.blocks || [];
const blockIds = (p = page) => p.evaluate(() => [...new Set([...document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]')].map(e => e.dataset.blockId))]);
// Every excerpt card, once: its kind, quote, footer, Open source, unavailable notice and crop image.
const excerptCards = (p = page) => p.evaluate(() => {
  const seen = new Map();
  for (const el of document.querySelectorAll('[aria-label="Lesson canvas"] [data-excerpt-card]')) {
    const id = el.closest('[data-block-id]')?.dataset.blockId;
    if (!id || seen.has(id)) continue;
    const q = el.querySelector('[data-excerpt-quote]'), s = el.querySelector('[data-excerpt-source]'), img = el.querySelector('img[data-excerpt-crop]'), b = el.getBoundingClientRect();
    seen.set(id, { id, kind: el.dataset.excerptKind, quote: q ? q.innerText : null, source: s ? s.innerText : null, open: !!s?.querySelector('[aria-label="Open source"]'),
      unavailable: !!el.querySelector('[data-excerpt-source-unavailable]'), crop: img ? { loaded: img.complete && img.naturalWidth > 0, src: img.currentSrc || img.src } : null, cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
  }
  return [...seen.values()];
});
// The crop image of a region card: loaded, natural size, its share of figure green and of the old red outline.
const cropOf = (id, p = page) => p.evaluate(id => {
  const img = document.querySelector(`[aria-label="Lesson canvas"] [data-block-id="${id}"] img[data-excerpt-crop]`);
  if (!img) return { found: false };
  if (!img.complete || !img.naturalWidth) return { found: true, loaded: false };
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  let d; try { d = g.getImageData(0, 0, c.width, c.height).data; } catch (error) { return { found: true, loaded: true, w: c.width, h: c.height, src: img.currentSrc, tainted: String(error.message) }; }
  let green = 0, red = 0;
  for (let i = 0; i < d.length; i += 4) { const [r, gr, b] = [d[i], d[i + 1], d[i + 2]]; if (gr > 120 && r < 90 && b < 110) green++; if (r > 180 && gr < 90 && b < 90) red++; }
  return { found: true, loaded: true, w: c.width, h: c.height, src: img.currentSrc, green: green / (c.width * c.height), red };
}, id);

// Pan (wheel, 1:1) until a thing sits in the open middle of the canvas, clear of the side panes (pdf-to-canvas-check's helpers).
const pane = () => page.locator('[data-chat-pane]');
const sourcesPane = () => page.locator('[data-sources-pane]');
const rightEdge = async () => Math.min(...(await Promise.all([pane(), sourcesPane()].map(async l => ((await l.isVisible().catch(() => false)) ? (await l.boundingBox())?.x ?? 1e9 : 1e9))))) - 30;
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
const focusCanvas = async () => { const point = await barePoint(); assert.ok(point, 'a bare point of canvas'); await page.mouse.click(point.x, point.y); await page.waitForTimeout(250); };
const cardLocator = id => page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
const selectBlock = async id => {
  await chatTab();
  const target = cardLocator(id);
  await reveal(target);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForTimeout(350);
    const b = await target.boundingBox();
    await page.mouse.click(b.x + 60, b.y + 30);
    if (await pane().locator(`[data-selected-card="${id}"]`).waitFor({ timeout: 2500 }).then(() => true, () => false)) return;
  }
  throw Error(`selecting block ${id} showed no [data-selected-card] pill`);
};
const undo = async () => { await focusCanvas(); await page.keyboard.press('Control+z'); await page.waitForTimeout(800); };
const redo = async () => { await focusCanvas(); await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(800); };

// ---------------------------------------------------------------- Chat
const chatTab = async () => { const tab = page.locator('[data-panel-tab="chat"]'); if (await tab.count() && await tab.getAttribute('aria-selected') !== 'true') await tab.click(); };
const field = () => pane().locator('[data-chat-composer] textarea').first();
const chips = () => pane().locator('[data-context-chip]');
const setMode = async mode => {
  await chatTab();
  if (await pane().locator('[data-chat-mode]').getAttribute('data-chat-mode') === mode) return;
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator(`[data-chat-mode-option="${mode}"]`).click();
  await page.waitForTimeout(200);
};
const newChat = async () => { await chatTab(); await pane().locator('[data-chat-new]').click(); await page.waitForTimeout(300); };
let sends = 0;
const send = async text => {
  await chatTab();
  await field().fill(text);
  const n = captured.length;
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  sends += 1;
  await waitFor(() => captured.length > n, 20000, 'no model request was sent for the turn');
  const cap = captured[n];
  // Tutor mode may draw its own answer; the captured body is the evidence either way.
  await pane().getByText(`Canned reply ${cap.reply}.`, { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
  return cap;
};
const clearSelection = async () => { await focusCanvas(); await page.keyboard.press('Escape'); await waitFor(async () => (await pane().locator('[data-canvas-target]').count()) === 0, 5000, 'the selection pill stayed'); };
const excerptRefs = body => (body.context_refs || []).filter(r => r.kind === 'excerpt');

// ---------------------------------------------------------------- the companion reader
const reader = () => page.locator('[data-sources-pane] section[aria-label="Paper reader"]').first();
const row = sourceId => page.locator(`[data-sources-pane] [data-material-row][data-source-id="${sourceId}"]`).first();
const openCompanion = async () => {
  if (await page.locator('[data-panel-companion]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-panel-companion]').click({ timeout: 5000 });
  await page.locator('[data-companion-view="context"]').click({ timeout: 5000 });
  await sourcesPane().waitFor({ state: 'visible', timeout: 10000 });
};
// Header: `page <label> (<index> of <n>)` when a label differs from the index, else `page <index> of <n>`.
const where = async () => {
  const text = await reader().locator('header').innerText({ timeout: 2000 }).catch(() => '');
  const m = text.match(/\((\d+) of (\d+)\)/) || text.match(/page (\d+) of (\d+)/);
  return m ? { index: Number(m[1]), of: Number(m[2]), text: norm(text) } : null;
};
const readerReady = () => waitFor(async () => (await where())?.of === N, 30000, `the reader did not open the ${N}-page PDF`);
// The reader on one source (a Materials row), at a page; a source with no row is opened from its PDF card (Enter).
const openReader = async (sourceId, { index = null, cardId = null } = {}) => {
  await openCompanion();
  if (!(await row(sourceId).count()) && cardId) { await selectBlock(cardId); await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('Enter'); await openCompanion(); }
  await row(sourceId).waitFor({ timeout: 10000 }).catch(() => { throw Error(`Sources shows no row for ${sourceId}`); });
  const toggle = row(sourceId).locator('button[aria-expanded]').first();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await readerReady();
  if (index) await goTo(index);
};
const pageText = () => reader().locator('[aria-label="Paper page text"]').innerText().catch(() => '');
const goTo = async index => {
  let turned = false, before = await pageText();
  for (let i = 0; i < 2 * N; i += 1) {
    const now = await where();
    if (now?.index === index) break;
    before = await pageText(); turned = true;
    await reader().getByRole('button', { name: now.index < index ? 'Next paper page' : 'Previous paper page' }).click();
    await waitFor(async () => (await where())?.index !== now.index, 8000, 'the page did not turn');
  }
  assert.equal((await where())?.index, index, `the reader is on page ${index}`);
  // The header turns at once; the text layer is redrawn after the page renders, so wait for this page's own words (every page's
  // text differs), or for the no-text notice.
  await waitFor(async () => { const text = await pageText(); return (text.length > 0 && (!turned || text !== before)) || await page.locator('[data-sources-pane] [data-pdf-no-text]').count(); }, 15000, `page ${index} drew no text layer`);
};
const textLayerScript = `
  const layer = document.querySelector('[data-sources-pane] section[aria-label="Paper reader"] [aria-label="Paper page text"]');
  const spot = (start, end) => {
    if (!layer) return null;
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT), nodes = [];
    let all = '';
    for (let n; (n = walker.nextNode());) { if (n.parentElement?.closest('.endOfContent')) continue; nodes.push([n, all.length]); all += n.data; }
    const a = all.indexOf(start), b = a < 0 ? -1 : all.indexOf(end, a);
    if (a < 0 || b < 0) return null;
    const range = document.createRange(), z = b + end.length;
    const first = nodes.findLast(([, at]) => at <= a), last = nodes.find(([n, at]) => at < z && z <= at + n.data.length);
    range.setStart(first[0], a - first[1]); range.setEnd(last[0], z - last[1]);
    return range;
  };
  const boxOf = rects => { rects = [...rects].filter(r => r.width > 0 && r.height > 0); if (!rects.length) return null;
    const x1 = Math.min(...rects.map(r => r.left)), y1 = Math.min(...rects.map(r => r.top)), x2 = Math.max(...rects.map(r => r.right)), y2 = Math.max(...rects.map(r => r.bottom));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };`;
// Select a passage of the open page by its first and last words (a DOM range, then the pointer-up a drag ends with); returns
// what the browser reports as selected.
const selectText = async (start, end) => {
  // The text layer is redrawn after the page renders (a reader just opened or turned): wait up to 10 s for these words.
  let picked;
  for (const until = Date.now() + 10000; ;) {
    picked = await page.evaluate(`(() => { ${textLayerScript}
    const range = spot(${JSON.stringify(start)}, ${JSON.stringify(end)});
    if (!range) return { error: 'not found', sample: (layer?.textContent || '').slice(0, 160) };
    range.startContainer.parentElement.scrollIntoView({ block: 'center' });
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const rects = [...range.getClientRects()], tail = rects[rects.length - 1], target = range.endContainer.parentElement;
    const init = { bubbles: true, cancelable: true, button: 0, clientX: tail.right - 1, clientY: tail.top + tail.height / 2 };
    target.dispatchEvent(new PointerEvent('pointerup', init)); target.dispatchEvent(new MouseEvent('mouseup', init));
    const first = rects[0];
    return { text: selection.toString(), from: { x: first.left + 1, y: first.top + first.height / 2 }, to: { x: tail.right - 1, y: tail.top + tail.height / 2 } };
  })()`);
    if (!picked.error || Date.now() > until) break;
    await page.waitForTimeout(200);
  }
  if (picked.error) throw Error(`"${start}" ... "${end}" is not in the page text layer ("${picked.sample}")`);
  const toolbar = page.locator('[data-pdf-selection-toolbar]');
  if (!(await toolbar.isVisible().catch(() => false)) && !(await toolbar.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false))) {
    // A real drag over the same words, for a reader that listens to the pointer rather than the selection.
    await page.mouse.move(picked.from.x, picked.from.y); await page.mouse.down(); await page.mouse.move(picked.to.x, picked.to.y, { steps: 8 }); await page.mouse.up();
    picked.text = await page.evaluate(() => getSelection().toString());
  }
  await toolbar.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error('a nonempty selection showed no [data-pdf-selection-toolbar]'); });
  return picked.text;
};
// How much of a passage's on-screen box a set of marks covers, and how big they are against it (precise, not the page).
const coverage = (selector, start, end) => page.evaluate(`(() => { ${textLayerScript}
  const marks = boxOf([...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.getBoundingClientRect()));
  const range = spot(${JSON.stringify(start)}, ${JSON.stringify(end)}), text = range && boxOf(range.getClientRects());
  if (!marks || !text) return null;
  const ix = Math.max(0, Math.min(marks.x + marks.w, text.x + text.w) - Math.max(marks.x, text.x)), iy = Math.max(0, Math.min(marks.y + marks.h, text.y + text.h) - Math.max(marks.y, text.y));
  const scroller = layer.closest('.overflow-auto')?.getBoundingClientRect();
  const inView = !scroller || (marks.y + marks.h > scroller.top && marks.y < scroller.bottom);
  return { covered: (ix * iy) / (text.w * text.h), size: (marks.w * marks.h) / (text.w * text.h), inView };
})()`);
const EMPHASIS = '[data-sources-pane] [data-pdf-emphasis]';
const highlightBoxes = id => `[data-sources-pane] [data-pdf-highlight][data-highlight-id="${id}"]`;
const assertCovers = (c, what) => {
  assert.ok(c, `${what}: no marks or no target text on screen`);
  assert.ok(c.covered >= 0.6, `${what} covers ${Math.round(c.covered * 100)}% of the passage's box`);
  assert.ok(c.size <= 4, `${what} is ${c.size.toFixed(1)}x the passage's box (not precise)`);
  assert.ok(c.inView, `${what} is scrolled into view`);
};
// Open source on a card: the reader opens at that page and emphasizes the anchor (~2.5 s, so measured while it shows).
const openSourceOf = async id => {
  const button = cardLocator(id).locator('[data-excerpt-source] [aria-label="Open source"]').first();
  await reveal(button);
  // A card added later can lie over this one (the uploaded paper's PDF card is dropped mid-canvas): then the press would land on
  // that card, so the button is pressed from the keyboard instead.
  if (await button.evaluate(el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && el.contains(hit); })) await button.click();
  else { await button.focus(); await page.keyboard.press('Enter'); }
};
const emphasisOn = async (index, start, end, what = 'the emphasis') => {
  const c = await waitFor(async () => (await page.locator(EMPHASIS).count()) && (await where())?.index === index && coverage(EMPHASIS, start, end), 8000,
    `no [data-pdf-emphasis] on page ${index} (reader at ${JSON.stringify(await where())})`);
  assertCovers(c, what);
  return c;
};
const addCard = async (scope, kind) => {
  const before = new Set(await blockIds());
  // The highlight menu's entries are menu items (role menuitem); the toolbars' are buttons.
  await page.locator(scope).getByRole(scope.includes('highlight-menu') ? 'menuitem' : 'button', { name: 'Add to canvas', exact: true }).click();
  const card = await waitFor(async () => (await excerptCards()).find(c => !before.has(c.id) && c.kind === kind), 30000, `no new ${kind} excerpt card`);
  const data = await waitFor(async () => (await inkBlocks()).find(b => b.id === card.id && b.excerpt), 10000, 'the card is not in the saved ink with its excerpt');
  return { ...card, data };
};
const pdfPoint = (px, py) => page.evaluate(([px, py]) => {
  const c = document.querySelector('[data-sources-pane] section[aria-label="Paper reader"] [aria-label="Paper PDF page"]'), r = c.getBoundingClientRect();
  return { x: r.left + px / 612 * r.width, y: r.top + (792 - py) / 792 * r.height };
}, [px, py]);
const centerPdfY = py => page.evaluate(py => {
  const c = document.querySelector('[data-sources-pane] section[aria-label="Paper reader"] [aria-label="Paper PDF page"]'), box = c.closest('.overflow-auto');
  const r = c.getBoundingClientRect(), b = box.getBoundingClientRect();
  box.scrollTop += r.top + (792 - py) / 792 * r.height - (b.top + b.height / 2);
}, py);
// Select region on page 4: a small box first, then its bottom-right handle dragged out to the figure's corner (an adjustment).
const drawRegion = async () => {
  await reader().getByRole('button', { name: 'Select region', exact: true }).click();
  await page.locator('[data-sources-pane] [data-pdf-region-mode]').first().waitFor({ timeout: 5000 }).catch(() => { throw Error('Select region showed no [data-pdf-region-mode]'); });
  await centerPdfY(500); await frames();
  const a = await pdfPoint(DRAWN[0], DRAWN[3]), b = await pdfPoint(400, 450);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 }); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  await page.locator('[data-pdf-region]').first().waitFor({ timeout: 5000 }).catch(() => { throw Error('the drawn box shows no [data-pdf-region]'); });
  const handles = page.locator('[data-pdf-region-handle]');
  assert.equal(await handles.count(), 4, 'four corner handles');
  const boxes = await Promise.all([0, 1, 2, 3].map(i => handles.nth(i).boundingBox()));
  const i = boxes.reduce((best, h, k) => (h.x + h.y > boxes[best].x + boxes[best].y ? k : best), 0), h = boxes[i], to = await pdfPoint(DRAWN[2], DRAWN[1]);
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
  await page.locator('[data-pdf-region-toolbar]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error('the region shows no [data-pdf-region-toolbar]'); });
};
const figureCovered = () => page.evaluate(([fig]) => {
  const c = document.querySelector('[data-sources-pane] section[aria-label="Paper reader"] [aria-label="Paper PDF page"]'), r = c.getBoundingClientRect();
  const t = { x: r.left + fig[0] / 612 * r.width, y: r.top + (792 - fig[3]) / 792 * r.height, w: (fig[2] - fig[0]) / 612 * r.width, h: (fig[3] - fig[1]) / 792 * r.height };
  const marks = [...document.querySelectorAll('[data-sources-pane] [data-pdf-emphasis]')].map(e => e.getBoundingClientRect()).filter(m => m.width > 0);
  if (!marks.length) return null;
  const m = { x: Math.min(...marks.map(k => k.left)), y: Math.min(...marks.map(k => k.top)), r: Math.max(...marks.map(k => k.right)), b: Math.max(...marks.map(k => k.bottom)) };
  const ix = Math.max(0, Math.min(m.r, t.x + t.w) - Math.max(m.x, t.x)), iy = Math.max(0, Math.min(m.b, t.y + t.h) - Math.max(m.y, t.y));
  return { covered: ix * iy / (t.w * t.h), size: (m.r - m.x) * (m.b - m.y) / (t.w * t.h), inView: true };
}, [FIGURE]);
// A text excerpt as stored (contract "Excerpt"): kind, source, page, PDF-space rects, verbatim quote.
const assertTextExcerpt = (x, { key, index, label, sha }) => {
  assert.equal(x?.v, 1, 'excerpt v 1');
  assert.match(String(x.id), /^pdfx_[0-9a-f]{24}$/, 'pdfx id');
  assert.equal(x.kind, 'text');
  assert.equal(x.source?.key, key, 'the source key');
  assert.equal(x.source.sha256, sha, 'the server-verified sha256 of the bytes');
  assert.deepEqual(x.page, { index, label }, 'page index and label');
  assert.ok(Array.isArray(x.rects) && x.rects.length >= 1 && x.rects.length <= 64, 'one rect per line box');
  for (const r of x.rects) assert.ok(r.length === 4 && r.every(Number.isFinite) && r[0] < r[2] && r[1] < r[3], `a normalized PDF rect ${JSON.stringify(r)}`);
  assert.match(String(x.highlightId), /^pdfh_[0-9a-f]{24}$/, 'Add to canvas creates or reuses a highlight');
  assert.equal(x.crop ?? null, null, 'a text excerpt has no crop');
};
const unionOf = rects => [Math.min(...rects.map(r => r[0])), Math.min(...rects.map(r => r[1])), Math.max(...rects.map(r => r[2])), Math.max(...rects.map(r => r[3]))];
// The canvas drop road (pdf-to-canvas-check): a dropped PDF opens the add dialog; "Add PDF card" uploads it (POST /api/learn/paper).
const dialog = () => page.locator('[data-pdf-add-dialog] [role="dialog"]');
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
  await waitFor(async () => (await dialog().locator('[data-pdf-total]').innerText()).trim() === `${N} pages`, 15000, `the dropped PDF shows no "${N} pages"`);
};

// The camera: the world layer's translate/scale (AdaptiveCanvas worldRef), read as canvas-doc-check does.
const camera = () => page.evaluate(() => {
  const surface = document.querySelector('[aria-label="Lesson canvas"] [data-canvas-surface]') || document.querySelector('[data-canvas-surface]');
  const world = [...surface.children].find(el => /scale\(/.test(el.style.transform));
  const m = world.style.transform.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/), b = surface.getBoundingClientRect();
  return { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]), sx: b.x, sy: b.y };
});
// Drag from a reader toolbar onto a bare canvas point: dragstart on its drag handle, then dragenter/dragover/drop with the same
// DataTransfer at that point (contract: type application/x-rh-pdf-excerpt, value = draftId). Returns the drop point.
const dragOnto = async toolbar => {
  const at = await barePoint();
  assert.ok(at, 'a bare canvas point to drop on');
  const types = await page.evaluate(([sel, x, y]) => {
    const handle = document.querySelector(`${sel} [aria-label="Drag to canvas"], ${sel} [draggable="true"], ${sel}[draggable="true"]`);
    if (!handle) return null;
    const transfer = new DataTransfer();
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    const target = document.elementFromPoint(x, y), init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y };
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, init));
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
    return [...transfer.types];
  }, [toolbar, at.x, at.y]);
  assert.ok(types, `no drag handle ([aria-label="Drag to canvas"] or [draggable]) in ${toolbar}`);
  assert.ok(types.includes('application/x-rh-pdf-excerpt'), `the drag carries application/x-rh-pdf-excerpt (${types.join(', ')})`);
  return at;
};
// Ctrl+K on one card, Explain: the inline editor's modes as offered, and the /api/learn/inline/decide request it sent.
const inlineExplain = async id => {
  await selectBlock(id);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Control+k');
  const editor = page.locator('[data-inline-ai]');
  await editor.waitFor({ timeout: 10000 }).catch(() => { throw Error('Ctrl+K opened no [data-inline-ai] editor'); });
  let modes = [];
  if (await editor.locator('[data-inline-mode-toggle]').count()) {
    await editor.locator('[data-inline-mode-toggle]').click();
    modes = await page.locator('[data-inline-mode]').evaluateAll(els => els.map(e => ({ mode: e.dataset.inlineMode, off: e.disabled || e.getAttribute('aria-disabled') === 'true' })));
    await page.locator('[data-inline-mode="explain"]').click();
  }
  const n = inline.length;
  await editor.locator('[data-inline-prompt]').fill('Explain this excerpt.');
  await editor.locator('[data-inline-submit]').click();
  inlineSends += 1;
  await waitFor(() => inline.length > n, 15000, 'Ctrl+K Explain sent no /api/learn/inline/decide request');
  const request = inline[n].request || {};
  await page.keyboard.press('Escape');
  await waitFor(async () => !(await editor.count()), 5000, 'the inline editor did not close');
  return { request, modes };
};

// ================================================================ the run
const A = await profile('A');
page = A.page;
await openCanvas(page);
const cards = {}, H = {};
let sourceInfo = null;

await check('the server hashes the stored bytes: GET /api/learn/pdf-source gives the sha256 of the context document as uploaded', [6, 16], async () => {
  const reply = await getAs(cookie, `/api/learn/pdf-source?${query({ app: canvas.name, key: DOC_KEY })}`);
  assert.equal(reply.status, 200, `pdf-source answered ${reply.status}`);
  sourceInfo = reply.body;
  assert.equal(reply.body.key, DOC_KEY);
  assert.equal(reply.body.sha256, PDF_SHA, 'the hash of the bytes this check uploaded');
  assert.equal(reply.body.bytes, PDF.length);
  const none = await highlightsOf(DOC_KEY);
  assert.equal(none.status, 200);
  assert.deepEqual(none.body.highlights, [], 'no highlights yet');
});

await check('the reader shows page labels ("page 1 (3 of 7)"), and a page with no text says so ([data-pdf-no-text]) and offers Select region', [4, 16], async () => {
  await openReader(DOC_KEY, { index: 1 });
  assert.match((await where()).text, /page i \(1 of 7\)/, 'page index 1 is labelled i');
  await goTo(3);
  assert.match((await where()).text, /page 1 \(3 of 7\)/, 'page index 3 is labelled 1');
  await goTo(6);
  await page.locator('[data-sources-pane] [data-pdf-no-text]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw Error('the text-less page 6 shows no [data-pdf-no-text]'); });
  assert.equal(await reader().getByRole('button', { name: 'Select region', exact: true }).isEnabled(), true, 'Select region is offered on a page with no text');
  await shot('01-no-text-page');
});

await check('a selection alone saves nothing and calls nothing; Escape dismisses its toolbar; click-away dismisses it; nothing is created', [7], async () => {
  await goTo(3);
  const blocks = (await blockIds()).length, asks = captured.length;
  await selectText('Rivers carry', 'and the tides.');
  await page.waitForTimeout(600);
  assert.deepEqual(await highlightIds(DOC_KEY), [], 'selecting saves no highlight');
  await page.keyboard.press('Escape');
  await page.locator('[data-pdf-selection-toolbar]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { throw Error('Escape left the selection toolbar'); });
  await selectText('Rivers carry', 'and the tides.');
  await focusCanvas();
  await page.locator('[data-pdf-selection-toolbar]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { throw Error('a click away left the selection toolbar'); });
  await page.waitForTimeout(600);
  assert.equal((await blockIds()).length, blocks, 'no block added');
  assert.deepEqual(await highlightIds(DOC_KEY), [], 'no highlight row');
  assert.equal(captured.length, asks, 'no model request');
});

await check('exact text: select the two-paragraph passage -> the toolbar (Highlight, Add to canvas, Add to chat) inside the reader -> Add to canvas: one text card whose quote is the selection with its paragraphs, footer "excerpts.pdf" and "p. 1", in the visible canvas, anchored in PDF space', [1, 6, 9], async () => {
  const selected = await selectText('Rivers carry', 'and the tides.');
  assert.equal(norm(selected), norm(PASSAGE), 'control: the browser selected the passage');
  const toolbar = page.locator('[data-pdf-selection-toolbar]');
  for (const name of ['Highlight', 'Add to canvas', 'Add to chat']) assert.equal(await toolbar.getByRole('button', { name, exact: true }).count(), 1, `the toolbar offers ${name}`);
  const t = await toolbar.boundingBox(), r = await reader().boundingBox();
  assert.ok(t.x >= r.x - 1 && t.x + t.width <= r.x + r.width + 1 && t.y >= r.y - 1 && t.y + t.height <= r.y + r.height + 1, 'the toolbar stays inside the reader');
  await shot('02-selection-toolbar');
  const card = await addCard('[data-pdf-selection-toolbar]', 'text');
  cards.passage = card;
  assert.equal(norm(card.quote), norm(selected), 'the card quote is the selected text');
  assert.match(card.quote, /widens\.\n+\s*Over/, 'the paragraph break shows on the card');
  assert.ok(card.source.includes(DOC_NAME), `the footer names the document ("${norm(card.source)}")`);
  assert.match(card.source, /p\. 1\b/, 'the footer shows the printed label p. 1');
  assert.ok(card.open, 'the footer has Open source');
  const x = card.data.excerpt;
  assertTextExcerpt(x, { key: DOC_KEY, index: 3, label: '1', sha: PDF_SHA });
  assert.equal(norm(x.quote?.exact), norm(PASSAGE), 'quote.exact is the passage');
  assert.match(x.quote.exact, /widens\.\n\nOver/, 'quote.exact keeps the paragraph break as \\n\\n');
  assert.equal(x.rotate, 0); assert.deepEqual(x.view, [0, 0, 612, 792]);
  assert.ok(x.rects.length >= 4, `a rect per line (${x.rects.length})`);
  const u = unionOf(x.rects);
  assert.ok(u[0] >= 60 && u[2] <= 560 && u[1] >= 620 && u[3] <= 720, `the rects sit on the passage in PDF points, not screen pixels: ${JSON.stringify(u.map(Math.round))}`);
  assert.ok(!JSON.stringify(card.data).includes('blob:'), 'no blob URL is stored');
  assert.ok(card.cx > 0 && card.cx < await rightEdge() + 30 && card.cy > 0 && card.cy < page.viewportSize().height, 'the card lands in the visible canvas, not behind the panels');
  H.passage = x.highlightId;
  assert.deepEqual(await highlightIds(DOC_KEY), [H.passage], 'its reader highlight is saved');
  await reveal(cardLocator(card.id));
  await shot('03-text-excerpt-card');
});

await check('Highlight saves a reader highlight (GET lists it, page i) and creates no card; it shows as a box on the page', [5], async () => {
  await goTo(1);
  const blocks = (await blockIds()).length;
  await selectText('Preface line', 'on page i.');
  await page.locator('[data-pdf-selection-toolbar]').getByRole('button', { name: 'Highlight', exact: true }).click();
  const saved = await waitFor(async () => ((await highlightsOf(DOC_KEY)).body.highlights || []).find(h => h.id !== H.passage), 10000, 'Highlight saved no row');
  H.preface = saved.id;
  assert.match(saved.id, /^pdfh_[0-9a-f]{24}$/);
  assert.equal(pageOf(saved), 1, 'on page index 1');
  assert.equal(norm(saved.quote?.exact), norm(PREFACE));
  await page.locator(highlightBoxes(H.preface)).first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error('no [data-pdf-highlight] box for it'); });
  assert.equal((await blockIds()).length, blocks, 'no card');
  await shot('04-highlight');
});

await check('reload keeps both highlights, the card and its anchor', [5], async () => {
  await page.reload();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await waitFor(async () => (await excerptCards()).some(c => c.id === cards.passage.id), 30000, 'the excerpt card did not come back');
  assert.equal(norm((await excerptCards()).find(c => c.id === cards.passage.id).quote), norm(PASSAGE));
  assert.deepEqual((await inkBlocks()).find(b => b.id === cards.passage.id)?.excerpt, cards.passage.data.excerpt, 'the same stored excerpt');
  await openReader(DOC_KEY, { index: 1 });
  await page.locator(highlightBoxes(H.preface)).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw Error('the page i highlight did not come back'); });
  await goTo(3);
  await page.locator(highlightBoxes(H.passage)).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw Error('the passage highlight did not come back'); });
});

await check('a fresh browser profile (same account, empty storage) shows the card, both highlights and Open source from the server copy', [5, 4], async () => {
  await waitFor(async () => ((await boardOf()).state?.blocks || []).some(b => b.id === cards.passage.id), 30000, 'the server board does not hold the card yet');
  const B = await profile('B');
  const mine = page;
  try {
    page = B.page;
    await openCanvas(page);
    await waitFor(async () => (await excerptCards()).some(c => c.id === cards.passage.id), 30000, 'the fresh profile shows no excerpt card');
    await openReader(DOC_KEY, { index: 1 });
    await page.locator(highlightBoxes(H.preface)).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw Error('no page i highlight in the fresh profile'); });
    await openSourceOf(cards.passage.id);
    await emphasisOn(3, 'Rivers carry', 'and the tides.', 'the emphasis in the fresh profile');
    await page.locator(highlightBoxes(H.passage)).first().waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: `${OUT}/05-fresh-profile.png` });
  } finally { page = mine; await B.context.close(); }
});

await check('Open source opens page index 3 (not page 1, not the page the reader was on) and emphasizes the passage precisely, scrolled into view', [4], async () => {
  await openReader(DOC_KEY);
  await goTo(1);
  await openSourceOf(cards.passage.id);
  facts.open_source = await emphasisOn(3, 'Rivers carry', 'and the tides.');
  assert.match((await where()).text, /\(3 of 7\)/);
  await shot('06-open-source-emphasis');
});

await check('Open source keeps the canvas camera: the world layer\'s translate and scale are the same before and after', ['section 9', 4], async () => {
  await openReader(DOC_KEY, { index: 1 });
  const button = cardLocator(cards.passage.id).locator('[data-excerpt-source] [aria-label="Open source"]').first();
  await reveal(button);
  await page.waitForTimeout(400);
  const before = await camera();
  await button.click();
  await emphasisOn(3, 'Rivers carry', 'and the tides.');
  await page.waitForTimeout(600);
  const after = await camera();
  facts.camera = { before, after };
  assert.deepEqual([after.x, after.y, after.z], [before.x, before.y, before.z], 'the camera did not move');
});

await check('anchors after zoom: at reader zoom 200% the saved highlight box still covers the passage, and Open source emphasizes it', [3], async () => {
  for (let i = 0; i < 8 && (await reader().locator('[aria-label="Paper zoom"]').innerText()).trim() !== '200%'; i += 1) await reader().getByRole('button', { name: 'Zoom in paper' }).click();
  assert.equal((await reader().locator('[aria-label="Paper zoom"]').innerText()).trim(), '200%');
  await page.evaluate(`(() => { ${textLayerScript} spot('Rivers carry', 'and the tides.')?.startContainer.parentElement.scrollIntoView({ block: 'center' }); })()`);
  await frames();
  const c = await waitFor(() => coverage(highlightBoxes(H.passage), 'Rivers carry', 'and the tides.'), 10000, 'no highlight box at 200%');
  assertCovers(c, 'the highlight box at 200%');
  await openSourceOf(cards.passage.id);
  await emphasisOn(3, 'Rivers carry', 'and the tides.', 'the emphasis after a zoom change');
  facts.zoom_at_emphasis = (await reader().locator('[aria-label="Paper zoom"]').innerText()).trim();
});

await check('anchors after a panel resize: the viewer 150+ px narrower or wider, the highlight box and Open source still cover the passage', [3], async () => {
  const handle = page.locator('[role="separator"][aria-label="Resize viewer"]');
  const before = (await page.locator('aside[data-companion]').boundingBox()).width;
  await handle.focus();
  // The width follows the keys a frame later: read it once it has moved 150 px (or stopped at a limit).
  const widthAfter = () => waitFor(async () => { const w = (await page.locator('aside[data-companion]').boundingBox()).width; return Math.abs(w - before) >= 150 && w; }, 2000, 'still').catch(async () => (await page.locator('aside[data-companion]').boundingBox()).width);
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowLeft');
  let after = await widthAfter();
  if (Math.abs(after - before) < 150) { for (let i = 0; i < 16; i += 1) await page.keyboard.press('ArrowRight'); after = await widthAfter(); }
  assert.ok(Math.abs(after - before) >= 150, `the viewer width changed ${before} -> ${after}`);
  facts.resize = { before, after };
  await page.waitForTimeout(500);
  await page.evaluate(`(() => { ${textLayerScript} spot('Rivers carry', 'and the tides.')?.startContainer.parentElement.scrollIntoView({ block: 'center' }); })()`);
  assertCovers(await waitFor(() => coverage(highlightBoxes(H.passage), 'Rivers carry', 'and the tides.'), 10000, 'no highlight box after the resize'), 'the highlight box after the resize');
  await openSourceOf(cards.passage.id);
  await emphasisOn(3, 'Rivers carry', 'and the tides.', 'the emphasis after a resize');
});

await check('rotated page: an excerpt on the /Rotate 90 page stores rotate 90 and unrotated PDF rects (tall, narrow, on the drawn line); its box and Open source cover it', [3, 4], async () => {
  await goTo(5);
  const selected = await selectText('ROTATED PASSAGE', 'page five.');
  assert.equal(norm(selected), norm(ROTATED));
  const card = await addCard('[data-pdf-selection-toolbar]', 'text');
  cards.rotated = card;
  const x = card.data.excerpt;
  assertTextExcerpt(x, { key: DOC_KEY, index: 5, label: '3', sha: PDF_SHA });
  assert.equal(x.rotate, 90, 'rotate 90 at capture');
  assert.deepEqual(x.view, [0, 0, 612, 792], 'the unrotated page box');
  const u = unionOf(x.rects);
  assert.ok(u[3] - u[1] > 3 * (u[2] - u[0]), `PDF-space rects run up the page (tall, narrow), not the display's level line: ${JSON.stringify(u.map(Math.round))}`);
  assert.ok(u[0] > 270 && u[2] < 320 && u[1] > 80 && u[3] < 460, `on the drawn line x~290-300, y 100-430: ${JSON.stringify(u.map(Math.round))}`);
  assertCovers(await waitFor(() => coverage(highlightBoxes(x.highlightId), 'ROTATED PASSAGE', 'page five.'), 10000, 'no highlight box on the rotated page'), 'the rotated highlight box');
  await goTo(1);
  await openSourceOf(card.id);
  await emphasisOn(5, 'ROTATED PASSAGE', 'page five.', 'the emphasis on the rotated page');
  await shot('07-rotated-emphasis');
});

await check('region: Select region -> draw -> adjust a handle -> Add to canvas: a region card whose crop loads from the server at the drawn aspect ratio and readable size, figure green, no red outline; Open source emphasizes the figure', [2, 4], async () => {
  await goTo(4);
  const before = crops.length;
  await drawRegion();
  const toolbar = page.locator('[data-pdf-region-toolbar]');
  for (const name of ['Highlight region', 'Add to canvas', 'Add to chat', 'Cancel']) assert.equal(await toolbar.getByRole('button', { name, exact: true }).count(), 1, `the region toolbar offers ${name}`);
  await shot('08-region-drawn');
  const card = await addCard('[data-pdf-region-toolbar]', 'region');
  cards.region = card;
  const x = card.data.excerpt;
  assert.equal(x.kind, 'region'); assert.equal(x.source?.key, DOC_KEY); assert.equal(x.source.sha256, PDF_SHA);
  assert.deepEqual(x.page, { index: 4, label: '2' });
  assert.equal(x.rects?.length, 1, 'exactly one rect');
  const r = x.rects[0];
  assert.ok(r.every((v, i) => Math.abs(v - DRAWN[i]) <= 8), `the stored rect ${JSON.stringify(r.map(Math.round))} is the drawn one ${JSON.stringify(DRAWN)} in PDF points`);
  assert.match(String(x.crop?.source?.id), /^fs_[0-9a-f]{24}$/, 'the crop is a file source');
  assert.equal(card.data.type, 'file', 'a region card is an image file block (server report: fileCardFromSource)');
  assert.equal(card.data.fileRef?.family, 'image');
  assert.deepEqual(card.data.fileRef?.source, x.crop.source, 'its fileRef is the stored crop');
  assert.match(String(x.crop.source.rev), /^[0-9a-f]{64}$/);
  assert.equal(x.quote ?? null, null, 'a region has no quote');
  assert.equal(crops.length, before + 1, `one crop PUT (${crops.length - before})`);
  assert.equal(crops.at(-1).key, DOC_KEY);
  const crop = await waitFor(async () => { const c = await cropOf(card.id); return c.loaded && c; }, 30000, 'the crop <img data-excerpt-crop> did not load (naturalWidth 0)');
  facts.crop = crop;
  // The card draws its stored image from an object URL of the bytes (MediaCard ImageBody), so the durable copy is asserted on the
  // server: the owner's board save (file_source_refs) lets GET /api/learn/files/<crop id> serve it; the fresh-profile step reloads it.
  const served = await waitFor(async () => { const reply = await fetch(`${BASE}/api/learn/files/${encodeURIComponent(x.crop.source.id)}?${query({ app: canvas.name, board: 'main' })}`, { headers: { cookie } }); return reply.status === 200 && reply; }, 30000, 'the server does not serve the crop to its owner (GET /api/learn/files/<crop id>)');
  assert.match(String(served.headers.get('content-type')), /image\/png/, 'the stored crop is a PNG');
  assert.ok(Math.max(crop.w, crop.h) <= 4096 && crop.w >= DRAWN[2] - DRAWN[0] - 8, `readable: ${crop.w}x${crop.h} is at least 1x the 72-dpi size`);
  assert.ok(Math.abs(crop.w / crop.h - (r[2] - r[0]) / (r[3] - r[1])) < 0.03, `the crop ${crop.w}x${crop.h} keeps the rect's aspect ratio ${((r[2] - r[0]) / (r[3] - r[1])).toFixed(3)}`);
  assert.equal(crop.tainted, undefined, `the crop pixels are readable (${crop.tainted})`);
  assert.ok(crop.green > 0.6, `the crop is the figure: ${Math.round(crop.green * 100)}% figure green`);
  assert.equal(crop.red, 0, 'no red outline, handle or overlay in the crop');
  await reveal(cardLocator(card.id));
  await shot('09-region-excerpt-card');
  await goTo(1);
  await openSourceOf(card.id);
  const c = await waitFor(async () => (await where())?.index === 4 && figureCovered(), 8000, 'no [data-pdf-emphasis] on page 4 for the region');
  assertCovers(c, 'the region emphasis');
  await shot('10-region-open-source');
});

await check('region Cancel and Escape create nothing: no block, no highlight row, no crop; the reader leaves region mode', [7], async () => {
  await goTo(4);
  const blocks = (await blockIds()).length, rows = (await highlightIds(DOC_KEY)).length, before = crops.length;
  for (const how of ['Cancel', 'Escape']) {
    await drawRegion();
    if (how === 'Cancel') await page.locator('[data-pdf-region-toolbar]').getByRole('button', { name: 'Cancel', exact: true }).click();
    else await page.keyboard.press('Escape');
    await page.locator('[data-pdf-region]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => { throw Error(`${how} left the drawn region`); });
    await waitFor(async () => !(await page.locator('[data-sources-pane] [data-pdf-region-mode]').count()), 5000, `${how} left region mode on`);
    assert.notEqual(await reader().getByRole('button', { name: 'Select region', exact: true }).getAttribute('aria-pressed'), 'true', `${how}: Select region is no longer pressed`);
  }
  await page.waitForTimeout(800);
  assert.equal((await blockIds()).length, blocks, 'no block added');
  assert.equal((await highlightIds(DOC_KEY)).length, rows, 'no highlight row');
  assert.equal(crops.length, before, 'no crop upload');
});

for (const kind of ['text', 'region']) await check(`drag a ${kind} ${kind === 'text' ? 'selection' : 'region'} from the reader onto the canvas (application/x-rh-pdf-excerpt): the card lands at the drop point; one Undo removes it`, ['section 10 drag', 9], async () => {
  await openReader(DOC_KEY, { index: kind === 'text' ? 3 : 4 });
  if (kind === 'text') await selectText('Rivers carry', 'and the tides.'); else await drawRegion();
  const before = new Set(await blockIds());
  const at = await dragOnto(kind === 'text' ? '[data-pdf-selection-toolbar]' : '[data-pdf-region-toolbar]');
  const card = await waitFor(async () => (await excerptCards()).find(c => !before.has(c.id) && c.kind === kind), 30000, `the drop made no ${kind} card`);
  if (kind === 'region') await waitFor(async () => (await cropOf(card.id)).loaded, 30000, 'the dropped crop did not load');
  const cam = await camera(), box = await cardLocator(card.id).boundingBox();
  const world = q => ({ x: (q.x - cam.sx - cam.x) / cam.z, y: (q.y - cam.sy - cam.y) / cam.z });
  const drop = world(at), top = world({ x: box.x + box.width / 2, y: box.y });
  facts[`drop_${kind}`] = { drop, card_top_centre: top };
  // insertExcerpts places the card centred on the drop point's x with its top at its y (world units).
  assert.ok(Math.abs(top.x - drop.x) <= 40 && Math.abs(top.y - drop.y) <= 40, `the card's top centre ${JSON.stringify(top)} is not at the drop point ${JSON.stringify(drop)}`);
  assert.equal((await excerptCards()).filter(c => !before.has(c.id)).length, 1, 'one card per drop');
  await undo();
  assert.equal((await blockIds()).includes(card.id), false, 'one Undo removes the dropped card');
});

await check('a double-click on Add to canvas makes one card and one highlight', [8], async () => {
  await goTo(4);
  const before = new Set(await blockIds());
  await selectText('SECOND EXCERPT', 'distinct refs.');
  await page.locator('[data-pdf-selection-toolbar]').getByRole('button', { name: 'Add to canvas', exact: true }).dblclick();
  await waitFor(async () => (await excerptCards()).some(c => !before.has(c.id)), 30000, 'no card');
  await page.waitForTimeout(3000);
  const added = (await excerptCards()).filter(c => !before.has(c.id));
  assert.equal(added.length, 1, `one card (${added.length})`);
  cards.second = { ...added[0], data: (await inkBlocks()).find(b => b.id === added[0].id) };
  const rows = ((await highlightsOf(DOC_KEY)).body.highlights || []).filter(h => norm(h.quote?.exact) === norm(SECOND));
  assert.equal(rows.length, 1, `one highlight for it (${rows.length})`);
  assert.equal(cards.second.data?.excerpt?.highlightId, rows[0].id);
});

await check('Undo removes the card but keeps a highlight that existed before; Redo brings the card back with the same anchor', [9], async () => {
  await goTo(2);
  await selectText('UNDO SENTENCE', 'lifecycle check.');
  await page.locator('[data-pdf-selection-toolbar]').getByRole('button', { name: 'Highlight', exact: true }).click();
  const saved = await waitFor(async () => ((await highlightsOf(DOC_KEY)).body.highlights || []).find(h => norm(h.quote?.exact) === norm(UNDO_TEXT)), 10000, 'the highlight was not saved');
  H.undo = saved.id;
  await page.locator(highlightBoxes(H.undo)).first().click();
  await page.locator('[data-pdf-highlight-menu]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error('clicking the highlight opened no [data-pdf-highlight-menu]'); });
  for (const name of ['Add to canvas', 'Add to chat', 'Delete highlight']) assert.equal(await page.locator('[data-pdf-highlight-menu]').getByRole('menuitem', { name, exact: true }).count(), 1, `the menu offers ${name}`);
  const card = await addCard('[data-pdf-highlight-menu]', 'text');
  cards.undo = card;
  assert.equal(card.data.excerpt.highlightId, H.undo, 'the card reuses the highlight it came from');
  assert.match(card.source, /p\. ii\b/, 'the footer shows the roman label');
  const others = (await blockIds()).filter(id => id !== card.id);
  await undo();
  const now = await blockIds();
  assert.equal(now.includes(card.id), false, 'Undo removed the card');
  assert.deepEqual(others.filter(id => !now.includes(id)), [], 'every other block stays');
  assert.ok((await highlightIds(DOC_KEY)).includes(H.undo), 'the highlight that existed before stays');
  await redo();
  await waitFor(async () => (await blockIds()).includes(card.id), 5000, 'Redo did not bring the card back');
  assert.deepEqual((await inkBlocks()).find(b => b.id === card.id)?.excerpt, card.data.excerpt, 'the same excerpt');
});

await check('Undo then Redo of a region card makes no new crop PUT and uploads no PDF; the crop still loads', [9, 2], async () => {
  await openReader(DOC_KEY, { index: 4 });
  await drawRegion();
  const card = await addCard('[data-pdf-region-toolbar]', 'region');
  await waitFor(async () => (await cropOf(card.id)).loaded, 30000, 'the crop did not load');
  const puts = crops.length, posts = uploads.length;
  await undo();
  assert.equal((await blockIds()).includes(card.id), false, 'Undo removed the region card');
  await redo();
  await waitFor(async () => (await cropOf(card.id)).loaded, 30000, 'after Redo the crop did not load');
  await page.waitForTimeout(1500);
  assert.equal(crops.length, puts, `Redo made ${crops.length - puts} crop PUTs`);
  assert.equal(uploads.length, posts, 'no PDF was uploaded again');
  cards.region2 = card;
});

await check('a failed crop upload inserts no card and offers Retry; Retry makes exactly one region card whose crop loads', ['section 10 partial failure', 8], async () => {
  await openReader(DOC_KEY, { index: 4 });
  const before = new Set(await blockIds()), puts = crops.length, failed = failedCrops;
  failCrops = 1;
  try {
    await drawRegion();
    await page.locator('[data-pdf-region-toolbar]').getByRole('button', { name: 'Add to canvas', exact: true }).click();
    await waitFor(() => failedCrops > failed, 15000, 'no crop upload was attempted');
  } finally { failCrops = 0; }
  const retry = page.locator('button:visible', { hasText: /^\s*Retry\s*$/ }).last();
  await retry.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw Error('the failed insertion shows no Retry'); });
  await page.waitForTimeout(1500);
  assert.deepEqual((await blockIds()).filter(id => !before.has(id)), [], 'no card points at a crop that failed to upload');
  await shot('16-crop-failure-retry');
  await retry.click();
  const card = await waitFor(async () => (await excerptCards()).find(c => !before.has(c.id) && c.kind === 'region'), 30000, 'Retry made no region card');
  await waitFor(async () => (await cropOf(card.id)).loaded, 30000, 'the retried crop did not load');
  await page.waitForTimeout(1500);
  assert.equal((await excerptCards()).filter(c => !before.has(c.id)).length, 1, 'exactly one card after Retry');
  assert.equal(crops.length, puts + 1, `one stored crop after Retry (${crops.length - puts})`);
});

await check('deleting an excerpt card leaves its PDF: the context document listed as it was, its bytes still served, the same bytes', [10], async () => {
  const docs = await docsNow();
  await selectBlock(cards.undo.id);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Delete');
  await waitFor(async () => !(await blockIds()).includes(cards.undo.id), 5000, 'the card was not deleted');
  assert.deepEqual((await docsNow()).map(d => [d.id, d.attached, d.size]), docs.map(d => [d.id, d.attached, d.size]), 'the documents are unchanged');
  const bytes = await fetch(`${BASE}/api/learn/context/${encodeURIComponent(DOC.id)}?app=${canvas.name}`, { headers: { cookie } });
  assert.equal(bytes.status, 200, 'its bytes are still served');
  assert.equal(Buffer.from(await bytes.arrayBuffer()).equals(PDF), true, 'the same bytes');
  assert.ok((await highlightIds(DOC_KEY)).includes(H.undo), 'deleting a card does not delete its highlight either');
});

await check('deleting the reader highlight keeps the card, and Open source still emphasizes the passage from the card\'s own anchor', [11], async () => {
  await openSourceOf(cards.passage.id);
  await emphasisOn(3, 'Rivers carry', 'and the tides.');
  await waitFor(async () => !(await page.locator(EMPHASIS).count()), 8000, 'the emphasis did not fade');
  // The drag step's card saved its own highlight of the same passage (a card's highlight outlives the card), drawn over this one,
  // so a press would open that one's menu: this box is opened from the keyboard (it is a button).
  await page.locator(highlightBoxes(H.passage)).first().focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-pdf-highlight-menu]').getByRole('menuitem', { name: 'Delete highlight', exact: true }).click();
  await waitFor(async () => !(await highlightIds(DOC_KEY)).includes(H.passage), 10000, 'the highlight row was not deleted');
  await waitFor(async () => !(await page.locator(highlightBoxes(H.passage)).count()), 5000, 'the highlight box stayed');
  assert.ok((await excerptCards()).some(c => c.id === cards.passage.id), 'the card stays');
  await goTo(1);
  await openSourceOf(cards.passage.id);
  await emphasisOn(3, 'Rivers carry', 'and the tides.', 'the emphasis after the highlight was deleted');
});

await check('a note typed on the text card is saved on the block (block.note), never inside block.excerpt, and survives a reload', ['section 8', 5], async () => {
  const NOTE = `My note ${run}: compare with the delta chapter.`;
  const note = cardLocator(cards.passage.id).locator('[data-excerpt-note]').first();
  await reveal(note);
  await note.click();
  await note.fill(NOTE);
  await focusCanvas(); // leaving the field saves it
  const saved = await waitFor(async () => (await inkBlocks()).find(b => b.id === cards.passage.id && b.note === NOTE), 10000, 'the note is not on the saved block as block.note');
  assert.ok(!JSON.stringify(saved.excerpt).includes(NOTE), 'the note is not inside block.excerpt');
  assert.deepEqual(saved.excerpt, cards.passage.data.excerpt, 'the excerpt itself is unchanged');
  await waitFor(async () => ((await boardOf()).state?.blocks || []).some(b => b.id === cards.passage.id && b.note === NOTE), 30000, 'the server board does not hold the note');
  await page.reload();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  const back = cardLocator(cards.passage.id).locator('[data-excerpt-note]').first();
  await back.waitFor({ timeout: 30000 });
  assert.equal(await back.inputValue().catch(async () => (await back.innerText()).trim()), NOTE, 'the note is back after the reload');
  assert.equal(norm((await excerptCards()).find(c => c.id === cards.passage.id).quote), norm(PASSAGE), 'the quote is still the verbatim passage');
  cards.passage.note = NOTE;
});

await check('Add to chat on a text selection: a chip "excerpts.pdf · p. 1", nothing sent; the turn carries the verbatim text as one excerpt ref', [12], async () => {
  await newChat();
  await setMode('ask');
  await openReader(DOC_KEY, { index: 3 });
  const asks = captured.length, count = await chips().count();
  await selectText('Rivers carry', 'and the tides.');
  await page.locator('[data-pdf-selection-toolbar]').getByRole('button', { name: 'Add to chat', exact: true }).click();
  await waitFor(async () => (await chips().count()) > count, 5000, 'no chip');
  const chip = norm(await chips().last().innerText());
  assert.ok(chip.includes(`${DOC_NAME} · p.`), `the chip names the document and page ("${chip}")`);
  await page.waitForTimeout(800);
  assert.equal(captured.length, asks, 'Add to chat sends nothing by itself');
  const cap = await send('Explain this passage.');
  const refs = excerptRefs(cap.body);
  facts.add_to_chat_text = refs.map(r => ({ sourceId: r.sourceId, range: r.range, chars: String(r.text || '').length }));
  assert.equal(refs.length, 1, `one excerpt ref (${refs.length})`);
  assert.match(String(refs[0].sourceId), /^excerpt:pdfx_[0-9a-f]{24}$/);
  assert.ok([3, '1'].includes(refs[0].range?.page), `the ref keeps its page (${JSON.stringify(refs[0].range)})`);
  assert.match(String(refs[0].text), /^Verbatim excerpt from "excerpts\.pdf", page /, 'the ref says it is a verbatim excerpt of the named document');
  assert.ok(norm(refs[0].text).includes(norm(PASSAGE)), 'the ref carries the full exact passage');
  await shot('11-add-to-chat-chip');
});

await check('Add to chat on a region sends an image file ref (payload only: model understanding of the figure is NOT verified)', [12], async () => {
  await newChat();
  await setMode('ask');
  await openReader(DOC_KEY, { index: 4 });
  const count = await chips().count();
  await drawRegion();
  await page.locator('[data-pdf-region-toolbar]').getByRole('button', { name: 'Add to chat', exact: true }).click();
  await waitFor(async () => (await chips().count()) > count, 30000, 'no chip for the region');
  const cap = await send('What does this figure show?');
  assert.equal(cap.route, 'ask', 'a file ref rides /api/learn/ask');
  const files = (cap.body.context_refs || []).filter(r => r.kind === 'file');
  facts.add_to_chat_region = files.map(r => ({ sourceId: r.sourceId, range: r.range ?? null, family: r.family ?? r.file?.family ?? null }));
  assert.equal(files.length, 1, `one image file ref (${JSON.stringify((cap.body.context_refs || []).map(r => r.kind))})`);
  assert.match(String(files[0].sourceId), /^file:fs_[0-9a-f]{24}@[0-9a-f]{64}$/, 'the crop rides as file:<id>@<rev>');
  assert.equal(files[0].range ?? null, null, 'range null, so the server sends the picture itself (file-context.js)');
  console.log('note: the region crop rides as an image file ref; whether a model understands the figure is NOT verified here');
});

await check('two excerpts from one PDF stay two distinct refs, each with its own page', [13], async () => {
  await newChat();
  await setMode('ask');
  for (const card of [cards.passage, cards.second]) {
    await selectBlock(card.id);
    const before = await chips().count();
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+l');
    await waitFor(async () => (await chips().count()) > before, 5000, `no chip after Ctrl+L on ${card.id}`);
  }
  await clearSelection();
  const cap = await send('Compare these two excerpts.');
  const refs = excerptRefs(cap.body);
  facts.two_excerpts = refs.map(r => [r.sourceId, r.range]);
  assert.equal(new Set(refs.map(r => r.sourceId)).size, 2, `two distinct excerpt refs (${refs.length})`);
  const pages = refs.map(r => r.range?.page).sort();
  assert.ok(JSON.stringify(pages) === JSON.stringify([3, 4]) || JSON.stringify(pages) === JSON.stringify(['1', '2']), `pages ${JSON.stringify(pages)}`);
  assert.ok(refs.some(r => norm(r.text).includes(norm(PASSAGE))) && refs.some(r => norm(r.text).includes(norm(SECOND))), 'each carries its own text');
});

await check('Ask, Auto and Tutor each carry the selected text excerpt; a selected card plus Ctrl+L attaches it once; Auto with a region card is forced to /api/learn/ask with its file ref', [14, 12], async () => {
  facts.modes = {};
  for (const mode of ['ask', 'auto', 'tutor']) {
    await newChat();
    await setMode(mode);
    await selectBlock(cards.passage.id);
    const cap = await send('What is this passage about?');
    facts.modes[mode] = { route: cap.route, excerpt_refs: excerptRefs(cap.body).map(r => r.sourceId) };
    assert.ok(bodyHas(cap.body, PASSAGE), `${mode}: the ${cap.route} body carries the excerpt text`);
    if (cards.passage.note) assert.ok(bodyHas(cap.body, cards.passage.note), `${mode}: the learner's note rides with it`);
  }
  await newChat();
  await setMode('ask');
  await selectBlock(cards.passage.id);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Control+l');
  const once = await send('Once only?');
  const id = cards.passage.data.excerpt.id;
  assert.equal((once.body.context_refs || []).filter(r => r.sourceId === `excerpt:${id}`).length, 1, 'selected and attached, the excerpt rides once');
  await newChat();
  await setMode('auto');
  await selectBlock(cards.region.id);
  const auto = await send('What is in this figure?');
  facts.modes.auto_region = { route: auto.route, kinds: (auto.body.context_refs || []).map(r => r.kind) };
  assert.equal(auto.route, 'ask', 'Auto with a file ref goes to /api/learn/ask');
  const crop = cards.region.data.excerpt.crop.source;
  assert.ok((auto.body.context_refs || []).some(r => r.kind === 'file' && r.sourceId === `file:${crop.id}@${crop.rev}`), 'the region rides as the file ref of its own crop');
});

await check('Ctrl+K Explain on a region excerpt card sends the crop itself: context.image names the card and its crop\'s fileRef source (id and rev); no model call', [12, 'section 11 Ctrl+K'], async () => {
  const { request, modes } = await inlineExplain(cards.region.id);
  facts.ctrlk_region = { modes, image: request.context?.image ?? null };
  assert.equal(request.context?.image?.id, cards.region.id, 'context.image is the selected region card');
  assert.deepEqual(request.context.image.source, cards.region.data.excerpt.crop.source, 'context.image.source is the crop (fileRef source id and rev)');
  assert.deepEqual(request.context.image.source, cards.region.data.fileRef.source);
});

await check('Ctrl+K on a text excerpt card is Explain-only (no Edit offered for the quotation) and the request carries the verbatim quote', [12, 'section 8', 'section 11 Ctrl+K'], async () => {
  const { request, modes } = await inlineExplain(cards.passage.id);
  facts.ctrlk_text = { modes };
  assert.deepEqual(modes.filter(m => m.mode === 'edit' && !m.off), [], `Edit is not offered on a quotation (modes ${JSON.stringify(modes)})`);
  assert.ok(bodyHas(request, PASSAGE), 'the Explain request carries the verbatim passage');
});

let paperCard = null, PAPER_KEY = null;
await check('an uploaded paper (drop -> POST /api/learn/paper): a text excerpt keyed pdf:upload with its home, and Open source on page index 3', [6, 1, 4], async () => {
  const before = new Set(await blockIds()), posts = uploads.length;
  await dropPdf();
  await dialog().locator('[data-pdf-choice="pdf"]').click();
  await dialog().locator('button').last().click();
  await page.locator('[data-pdf-add-dialog]').waitFor({ state: 'detached', timeout: 90000 });
  assert.equal(uploads.length, posts + 1, 'one upload');
  const id = await waitFor(async () => (await blockIds()).find(b => !before.has(b)), 10000, 'no PDF card');
  paperCard = await waitFor(async () => (await inkBlocks()).find(b => b.id === id && b.type === 'pdf'), 10000, 'the PDF card is not saved');
  PAPER_KEY = paperCard.assetKey;
  assert.match(PAPER_KEY, /^pdf:upload:[0-9a-f]{12}$/);
  const src = await getAs(cookie, `/api/learn/pdf-source?${query({ app: canvas.name, key: PAPER_KEY, home: canvas.name })}`);
  assert.equal(src.body.sha256, PDF_SHA, 'the uploaded paper hashes to the same bytes');
  await openReader(`paper:${PAPER_KEY.slice('pdf:'.length)}`, { index: 3, cardId: id });
  await selectText('Rivers carry', 'and the tides.');
  const card = await addCard('[data-pdf-selection-toolbar]', 'text');
  cards.paper = card;
  assertTextExcerpt(card.data.excerpt, { key: PAPER_KEY, index: 3, label: '1', sha: PDF_SHA });
  assert.equal(card.data.excerpt.source.home, canvas.name, 'the source names the canvas its bytes are stored on');
  assert.equal(norm(card.quote), norm(PASSAGE));
  assert.ok((await highlightIds(PAPER_KEY, canvas.name)).includes(card.data.excerpt.highlightId), 'its highlight is listed for the paper');
  await openReader(DOC_KEY, { index: 1 });
  await openSourceOf(card.id);
  await emphasisOn(3, 'Rivers carry', 'and the tides.', 'the emphasis on the uploaded paper');
  assert.match(norm(await sourcesPane().innerText()), new RegExp(norm(paperCard.label || DROP_NAME).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the reader shows the uploaded paper, not the context document');
});

await check('an uploaded paper: a region crop is stored for it (crop PUT keyed pdf:upload) and loads', [6, 2], async () => {
  await goTo(4);
  await drawRegion();
  const card = await addCard('[data-pdf-region-toolbar]', 'region');
  assert.equal(card.data.excerpt.source.key, PAPER_KEY);
  assert.equal(crops.at(-1).key, PAPER_KEY, 'the crop PUT names the paper');
  const crop = await waitFor(async () => { const c = await cropOf(card.id); return c.loaded && c; }, 30000, 'the paper crop did not load');
  assert.ok(crop.green > 0.6 && crop.red === 0, `the figure, no outline (${Math.round(crop.green * 100)}% green, ${crop.red} red)`);
  cards.paperRegion = card;
});

await check('a changed source is reported: with the server\'s sha256 differing, Open source shows [data-pdf-source-changed] and no emphasis', [16], async () => {
  fakeSha = true;
  try {
    await page.reload();
    await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
    await waitFor(async () => (await excerptCards()).some(c => c.id === cards.passage.id), 30000, 'the card did not come back');
    await openSourceOf(cards.passage.id);
    await page.locator('[data-pdf-source-changed]').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw Error('no [data-pdf-source-changed] notice'); });
    await page.waitForTimeout(1500);
    assert.equal(await page.locator(EMPHASIS).count(), 0, 'no emphasis on what may be other text');
    await shot('12-source-changed');
  } finally { fakeSha = false; }
  assert.deepEqual(routeErrors, [], 'the hash rewrite reached the server');
  await page.reload();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
});

await check('an oversize selection (page 7, > 8,000 characters) shows [data-pdf-excerpt-limit] with Shorten, Split into N cards and Cancel before any insertion; Cancel creates nothing', ['decision 4', 7], async () => {
  assert.ok(LONG.length > 8000, 'control: the page holds more than 8,000 characters');
  await openReader(DOC_KEY, { index: 7 });
  const blocks = (await blockIds()).length, rows = (await highlightIds(DOC_KEY)).length;
  const selected = await selectText('Line 001', 'Line 100 carries words for the limit check: alpha beta gamma delta epsilon zeta eta theta iota.');
  assert.ok(norm(selected).length > 8000, `control: ${norm(selected).length} characters selected`);
  await page.locator('[data-pdf-selection-toolbar]').getByRole('button', { name: 'Add to canvas', exact: true }).click();
  const limit = page.locator('[data-pdf-excerpt-limit]');
  await limit.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw Error('no [data-pdf-excerpt-limit] dialog'); });
  assert.equal(await limit.getByRole('button', { name: 'Shorten selection', exact: true }).count(), 1);
  assert.equal(await limit.getByRole('button', { name: /^Split into \d+ cards$/ }).count(), 1);
  assert.equal(await limit.getByRole('button', { name: 'Cancel', exact: true }).count(), 1);
  assert.equal((await blockIds()).length, blocks, 'nothing inserted before the choice');
  await shot('13-oversize-limit');
  await limit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await limit.waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForTimeout(800);
  assert.equal((await blockIds()).length, blocks, 'Cancel adds nothing');
  assert.equal((await highlightIds(DOC_KEY)).length, rows, 'Cancel saves no highlight');
});

await check('Shorten selection closes the limit dialog, keeps the reader selection for the learner to shorten, and inserts nothing', ['decision 4', 7], async () => {
  const blocks = (await blockIds()).length, rows = (await highlightIds(DOC_KEY)).length;
  const selected = await selectText('Line 001', 'Line 100 carries words for the limit check: alpha beta gamma delta epsilon zeta eta theta iota.');
  await page.locator('[data-pdf-selection-toolbar]').getByRole('button', { name: 'Add to canvas', exact: true }).click();
  const limit = page.locator('[data-pdf-excerpt-limit]');
  await limit.waitFor({ state: 'visible', timeout: 10000 });
  await limit.getByRole('button', { name: 'Shorten selection', exact: true }).click();
  await limit.waitFor({ state: 'detached', timeout: 5000 }).catch(() => { throw Error('Shorten selection left the limit dialog open'); });
  await page.waitForTimeout(800);
  assert.equal(norm(await page.evaluate(() => getSelection().toString())), norm(selected), 'the selection is kept');
  assert.equal((await blockIds()).length, blocks, 'nothing inserted');
  assert.equal((await highlightIds(DOC_KEY)).length, rows, 'no highlight saved');
  await page.evaluate(() => getSelection().removeAllRanges());
});

await check('Split into N cards: N cards in order, each at most 8,000 characters, every character kept; one Undo removes them all', ['decision 4', 9], async () => {
  const before = new Set(await blockIds());
  const selected = await selectText('Line 001', 'Line 100 carries words for the limit check: alpha beta gamma delta epsilon zeta eta theta iota.');
  await page.locator('[data-pdf-selection-toolbar]').getByRole('button', { name: 'Add to canvas', exact: true }).click();
  const split = page.locator('[data-pdf-excerpt-limit]').getByRole('button', { name: /^Split into \d+ cards$/ });
  const n = Number((await split.innerText()).match(/\d+/)[0]);
  assert.ok(n >= 2, `split into ${n}`);
  await split.click();
  const added = await waitFor(async () => { const ink = (await inkBlocks()).filter(b => !before.has(b.id) && b.excerpt); return ink.length === n && ink; }, 30000, `not ${n} new excerpt cards`);
  const parts = added.map(b => b.excerpt).sort((a, b) => a.part.index - b.part.index);
  assert.deepEqual(parts.map(p => [p.part.index, p.part.of]), Array.from({ length: n }, (_, i) => [i + 1, n]), 'parts 1..N of N');
  for (const p of parts) assert.ok(p.quote.exact.length <= 8000, `part ${p.part.index} is ${p.quote.exact.length} characters`);
  assert.equal(norm(parts.map(p => p.quote.exact).join(' ')), norm(selected), 'every character kept, in order');
  await undo();
  const now = await blockIds();
  assert.deepEqual(added.filter(b => now.includes(b.id)).map(b => b.id), [], 'one Undo removes the whole split');
});

await check('Start Rabbit Hole on a text excerpt card: the child canvas holds the excerpt with its quote and an Open source that opens page index 3', [17], async () => {
  await waitFor(async () => ((await boardOf()).state?.blocks || []).some(b => b.id === cards.passage.id), 30000, 'the server board does not hold the card');
  const target = cardLocator(cards.passage.id);
  const b = await reveal(target);
  await page.mouse.click(b.x + 60, b.y + 30, { button: 'right' });
  await page.locator('[data-canvas-menu] [data-menu-start-rabbit-hole]').click({ timeout: 5000 });
  await page.waitForFunction(() => location.search.includes('hole='), null, { timeout: 15000 });
  facts.hole = new URL(page.url()).searchParams.get('hole');
  await page.locator('[data-dive-navigator]').waitFor({ timeout: 30000 });
  const child = await waitFor(async () => (await excerptCards()).find(c => c.kind === 'text' && norm(c.quote) === norm(PASSAGE)), 30000, 'the Rabbit Hole shows no excerpt card with the passage');
  assert.ok(child.source.includes(DOC_NAME) && child.open, 'the child keeps the source footer with Open source');
  facts.hole_pending = await page.evaluate(() => { try { return Object.keys(JSON.parse(sessionStorage.getItem('small.dive.pending') || '{}')); } catch { return null; } });
  await shot('14-rabbit-hole-child');
  await openSourceOf(child.id);
  await emphasisOn(3, 'Rivers carry', 'and the tides.', 'Open source from the Rabbit Hole');
  await page.locator('[data-dive-navigator]').getByRole('button', { name: 'Up to the parent hole' }).click();
  await page.waitForFunction(() => !location.search.includes('hole='), null, { timeout: 15000 });
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
});

await check('another person\'s fork of the shared canvas: the crop shows, Open source says the source is unavailable, and the owner\'s highlights and the PDF stay private', [15, 16], async () => {
  const ids = [cards.passage.id, cards.region.id];
  await waitFor(async () => { const blocks = (await boardOf()).state?.blocks || []; return ids.every(id => blocks.some(x => x.id === id)); }, 60000, 'the server board does not hold both cards');
  const state = (await boardOf()).state;
  const shared = await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, state }) });
  assert.ok(shared.sharing?.view, 'the canvas is shared by link');
  const otherSession = await mint(`pdfx-other-${run}@example.com`), other = `small_session=${otherSession}`;
  const O = await profile('other', otherSession);
  const mine = page;
  try {
    const fork = await (await fetch(`${BASE}/api/learn/boards/fork`, { method: 'POST', headers: { cookie: other, 'content-type': 'application/json' }, body: JSON.stringify({ source: { token: shared.sharing.view }, key: `pdfx-other-${run}` }) })).json();
    assert.match(String(fork.name), /^canvas-[a-f0-9]{8}$/, `the other person forked it (${JSON.stringify(fork).slice(0, 160)})`);
    facts.fork = fork.name;
    page = O.page;
    await openCanvas(page, fork.name);
    const region = await waitFor(async () => (await excerptCards()).find(c => c.kind === 'region'), 30000, 'the fork shows no region card');
    await waitFor(async () => (await cropOf(region.id)).loaded, 30000, 'the fork\'s crop did not load');
    const text = (await excerptCards()).find(c => c.kind === 'text' && norm(c.quote) === norm(PASSAGE));
    assert.ok(text, 'the fork shows the text excerpt');
    await openSourceOf(text.id);
    await waitFor(async () => (await page.locator('[data-excerpt-source-unavailable], [data-pdf-source-unavailable]').count()) > 0, 15000, 'no "source not available" state');
    if (await page.locator('[data-excerpt-source-unavailable]').count()) assert.match(norm(await page.locator('[data-excerpt-source-unavailable]').first().innerText()), /Source not available/);
    assert.equal(await page.locator(EMPHASIS).count(), 0, 'nothing emphasized');
    assert.equal(norm((await excerptCards()).find(c => c.id === text.id).quote), norm(PASSAGE), 'the excerpt itself stays');
    await page.screenshot({ path: `${OUT}/15-fork-source-unavailable.png` });
    const hs = [await highlightsOf(DOC_KEY, { who: other, app: fork.name }), await highlightsOf(DOC_KEY, { who: other, app: canvas.name })];
    facts.other_person = { highlights: hs.map(h => [h.status, (h.body.highlights || []).length]) };
    for (const h of hs) { assert.equal(h.status, 404, `another person's highlight GET: ${h.status} with ${(h.body.highlights || []).length} rows`); assert.equal(h.body.error, REFUSED); }
    const src = await getAs(other, `/api/learn/pdf-source?${query({ app: fork.name, key: DOC_KEY })}`);
    assert.equal(src.status, 404, 'pdf-source refuses another person');
    assert.equal(src.body.error, REFUSED);
    const bytes = await fetch(`${BASE}/api/learn/context/${encodeURIComponent(DOC.id)}?app=${fork.name}`, { headers: { cookie: other } });
    assert.equal(bytes.status, 404, 'the PDF bytes are refused');
    const del = await fetch(`${BASE}/api/learn/pdf-highlights/${H.preface}?${query({ app: fork.name, key: DOC_KEY })}`, { method: 'DELETE', headers: { cookie: other } });
    assert.ok([403, 404].includes(del.status), `another person cannot delete the owner's highlight (${del.status})`);
    facts.other_person.source = src.status; facts.other_person.bytes = bytes.status;
  } finally { page = mine; await O.context.close(); await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: false }) }); }
});

await check('no model call beyond the turns this check sent, no other model-capable request, no page error', ['no AI calls'], async () => {
  facts.turns = captured.map(c => c.route);
  assert.ok(captured.length >= sends, `${captured.length} captured for ${sends} sends`);
  assert.ok(captured.length <= sends + 2, `at most the Rabbit Hole's opening turn beyond the sends (${captured.length} for ${sends})`);
  assert.equal(inline.length, inlineSends, `${inline.length} Ctrl+K decide requests for ${inlineSends} submits (all answered here)`);
  assert.deepEqual(refused, [], `refused routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await A.context.close();
await browser.close();
const passed = results.filter(r => r.ok).length;
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvas: canvas.name, document: DOC.id, paper: PAPER_KEY, total, passed, failed: results.length - passed, checks: results, facts,
  crops, failed_crops: failedCrops, inline_requests: inline.map(b => ({ mode: b.request?.mode ?? null, image: b.request?.context?.image ?? null })), highlight_puts: highlightPuts.length, uploads, model_capable_refused: refused, outside_hosts: [...new Set(outside)], page_errors: errors,
  note: 'request payloads only: an image file ref proves the crop rode the request, not that a model understood the figure' }, null, 2));
if (results.length !== total) console.log(`FAIL ran ${results.length} checks, but total says ${total}`);
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
