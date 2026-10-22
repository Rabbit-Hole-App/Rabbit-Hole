// Long PDFs (PDF-02, owner brief 2026-10-22 section 5; addendum 1: 101- and 312-page PDFs, reading and excerpts after page 100,
// highlight/region -> canvas card -> precise source), against the LOCAL stack only: local D1 and R2, a fresh browser profile.
// No model is ever called: /api/learn/ask and the Tutor planner are answered here with canned text and their request bodies
// CAPTURED; every other model-capable route is aborted and counted, and none may happen. The PDFs are generated in code
// (long-pdf-fixture.mjs): every page reads "Page <n> of <total>", "Marker p<n>"; page 250 of the 312-page one alone carries
// DEEP_WORDS. Both go through the real UI: the Context panel's own file input (POST /api/learn/context) and the canvas drop road
// with the add dialog (POST /api/learn/paper). What the server sends a model for a long PDF (the relevant pages' text, never the
// whole file) is asserted by the unit tests (control-plane test/pdf-pages.test.js); here: the upload carries every page's text,
// the server lists the page count and status, every page opens in the reader, and highlights, text and region excerpts and
// chat refs past page 100 keep their exact page.
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets); `N/total passed`; exits 1 on any failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] [OUT=<dir>] node e2e/pdf-long-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chatRouteAnswer } from './dev-cp.mjs';
import { longPdf, DEEP_PAGE, DEEP_WORDS } from './long-pdf-fixture.mjs';

const total = 10; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('pdf-long-check runs against the local stack only');
const OUT = process.env.OUT || process.argv[2] || fileURLToPath(new URL('./shots/pdf-long', import.meta.url));
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const mint = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const session = await mint(`pdflong-${run}@example.com`);
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();
const getAs = async path => { const r = await fetch(`${BASE}${path}`, { headers: { cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const query = o => new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v != null))).toString();

const LONG = { name: 'long-312.pdf', count: 312, bytes: Buffer.from(longPdf(312, { [DEEP_PAGE]: DEEP_WORDS })) };
const PAST = { name: 'past-101.pdf', count: 101, bytes: Buffer.from(longPdf(101)) };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Long PDFs ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
const catalog = await api('/api/apps');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const docsNow = async () => (await api(`/api/learn/context?app=${canvas.name}`)).documents || [];
const highlightsOf = async (key, home = null) => (await getAs(`/api/learn/pdf-highlights?${query({ app: canvas.name, key, home })}`)).body.highlights || [];

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], outside = [], errors = [], uploads = [], crops = [];
let replies = 0;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route|decide)|journey|scene|transcribe|tts|voice\/|tutor\/handoff|dive|explore))/;
// The `pages` field of a multipart upload: the page texts the browser read, or null.
const pagesField = buffer => {
  const text = buffer ? buffer.toString('utf8') : '';
  const m = text.match(/name="pages"\r\n\r\n([\s\S]*?)\r\n--/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return 'unparsed'; }
};
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  const path = url.pathname, method = request.method();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.fallback();
  if (method === 'POST' && ['/api/learn/paper', '/api/learn/context'].includes(path)) uploads.push({ path, pages: pagesField(request.postDataBuffer()) });
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ route: 'ask', body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `pdflong-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/tutor/plan') {
    const reply = ++replies;
    captured.push({ route: 'plan', body, reply });
    return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', constraints_add: [], actions: [{ type: 'respond_text', text: `Canned reply ${reply}.` }] } });
  }
  if (path === '/api/learn/chat/route') return route.fulfill({ json: chatRouteAnswer(body) });
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path)) return route.fulfill({ json: { ok: true } });
  if (method === 'PUT' && /^\/api\/learn\/pdf-excerpts\/[^/]+\/crop$/.test(path)) crops.push({ key: url.searchParams.get('key'), page: url.searchParams.get('page') });
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
const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/*', router);
page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const openCanvas = async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(120); } };
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- the canvas and its cards (pdf-excerpt-check's helpers)
const pane = () => page.locator('[data-chat-pane]');
const sourcesPane = () => page.locator('[data-sources-pane]');
const inkBlocks = async () => (await page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }, INK))?.blocks || [];
const blockIds = () => page.evaluate(() => [...new Set([...document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]')].map(e => e.dataset.blockId))]);
const excerptCards = () => page.evaluate(() => {
  const seen = new Map();
  for (const el of document.querySelectorAll('[aria-label="Lesson canvas"] [data-excerpt-card]')) {
    const id = el.closest('[data-block-id]')?.dataset.blockId;
    if (!id || seen.has(id)) continue;
    const q = el.querySelector('[data-excerpt-quote]'), s = el.querySelector('[data-excerpt-source]');
    seen.set(id, { id, kind: el.dataset.excerptKind, quote: q ? q.innerText : null, source: s ? s.innerText : null, open: !!s?.querySelector('[aria-label="Open source"]') });
  }
  return [...seen.values()];
});
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
const cardLocator = id => page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();

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
let sends = 0;
const send = async text => {
  await chatTab();
  await field().fill(text);
  const n = captured.length;
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  sends += 1;
  await waitFor(() => captured.length > n, 20000, 'no model request was sent for the turn');
  return captured[n];
};

// ---------------------------------------------------------------- the companion reader
const reader = () => page.locator('[data-sources-pane] section[aria-label="Paper reader"]').first();
const row = sourceId => page.locator(`[data-sources-pane] [data-material-row][data-source-id="${sourceId}"]`).first();
const openCompanion = async () => {
  if (await page.locator('[data-panel-companion]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-panel-companion]').click({ timeout: 5000 });
  await page.locator('[data-companion-view="context"]').click({ timeout: 5000 });
  await sourcesPane().waitFor({ state: 'visible', timeout: 10000 });
};
const where = async () => {
  const text = await reader().locator('header').innerText({ timeout: 2000 }).catch(() => '');
  const m = text.match(/\((\d+) of (\d+)\)/) || text.match(/page (\d+) of (\d+)/);
  return m ? { index: Number(m[1]), of: Number(m[2]), text: norm(text) } : null;
};
const pageText = () => reader().locator('[aria-label="Paper page text"]').innerText().catch(() => '');
// Turn to a page with the reader's own Next / Previous buttons (no page is skipped on the way), then wait for its text layer.
const goTo = async index => {
  for (let i = 0; i < 700; i += 1) {
    const now = await where();
    if (now?.index === index) break;
    await reader().getByRole('button', { name: now.index < index ? 'Next paper page' : 'Previous paper page' }).click();
    await waitFor(async () => (await where())?.index !== now.index, 8000, `the page did not turn from ${now.index}`);
  }
  assert.equal((await where())?.index, index, `the reader is on page ${index}`);
  await waitFor(async () => norm(await pageText()).includes(`Page ${index} of `), 20000, `page ${index} drew no text layer`);
};
const openReader = async (sourceId, count, { cardId = null } = {}) => {
  await openCompanion();
  // UI-26: the reader replaces the file list. Already open on this source: its reader bar's row names it; else Back to Files.
  const readerOn = () => page.locator(`[data-sources-pane] [data-sources-header] [data-material-row][data-source-id="${sourceId}"]`);
  if (!(await readerOn().count())) {
    const back = page.locator('[data-sources-pane] [data-back-to-files]');
    if (await back.count()) await back.click();
    if (!(await row(sourceId).count()) && cardId) { await reveal(cardLocator(cardId)); }
    if (!(await readerOn().count())) {
      await row(sourceId).waitFor({ timeout: 15000 }).catch(() => { throw Error(`Sources shows no row for ${sourceId}`); });
      await row(sourceId).locator('button').first().click(); // the filename opens its reader
    }
  }
  await waitFor(async () => (await where())?.of === count, 30000, `the reader did not open the ${count}-page PDF`);
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
const selectText = async (start, end) => {
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
  if (picked.error) throw Error(`"${start}" to "${end}" is not in the page text layer ("${picked.sample}")`);
  const toolbar = page.locator('[data-pdf-selection-toolbar]');
  if (!(await toolbar.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false))) {
    await page.mouse.move(picked.from.x, picked.from.y); await page.mouse.down(); await page.mouse.move(picked.to.x, picked.to.y, { steps: 8 }); await page.mouse.up();
    picked.text = await page.evaluate(() => getSelection().toString());
  }
  await toolbar.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error('a nonempty selection showed no [data-pdf-selection-toolbar]'); });
  return picked.text;
};
const EMPHASIS = '[data-sources-pane] [data-pdf-emphasis]';
const coverage = (selector, start, end) => page.evaluate(`(() => { ${textLayerScript}
  const marks = boxOf([...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.getBoundingClientRect()));
  const range = spot(${JSON.stringify(start)}, ${JSON.stringify(end)}), text = range && boxOf(range.getClientRects());
  if (!marks || !text) return null;
  const ix = Math.max(0, Math.min(marks.x + marks.w, text.x + text.w) - Math.max(marks.x, text.x)), iy = Math.max(0, Math.min(marks.y + marks.h, text.y + text.h) - Math.max(marks.y, text.y));
  return { covered: (ix * iy) / (text.w * text.h), size: (marks.w * marks.h) / (text.w * text.h) };
})()`);
const addCard = async (scope, kind) => {
  const before = new Set(await blockIds());
  await page.locator(scope).getByRole('button', { name: 'Add to canvas', exact: true }).click();
  const card = await waitFor(async () => (await excerptCards()).find(c => !before.has(c.id) && c.kind === kind), 30000, `no new ${kind} excerpt card`);
  const data = await waitFor(async () => (await inkBlocks()).find(b => b.id === card.id && b.excerpt), 10000, 'the card is not in the saved ink with its excerpt');
  return { ...card, data };
};
const openSourceOf = async id => {
  const button = cardLocator(id).locator('[data-excerpt-source] [aria-label="Open source"]').first();
  await reveal(button);
  await page.evaluate(() => { window.__sourceOpened = false; window.addEventListener('small:excerpt-source', () => { window.__sourceOpened = true; }, { once: true }); });
  if (await button.evaluate(el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && el.contains(hit); })) await button.click();
  else { await button.focus(); await page.keyboard.press('Enter'); }
  await waitFor(() => page.evaluate(() => window.__sourceOpened), 10000, 'Open source did not open the reader');
};
const pdfPoint = (px, py) => page.evaluate(([px, py]) => {
  const c = document.querySelector('[data-sources-pane] section[aria-label="Paper reader"] [aria-label="Paper PDF page"]'), r = c.getBoundingClientRect();
  return { x: r.left + px / 612 * r.width, y: r.top + (792 - py) / 792 * r.height };
}, [px, py]);
const dialog = () => page.locator('[data-pdf-add-dialog] [role="dialog"]');
const dropPdf = async doc => {
  const surface = page.locator('[aria-label="Lesson canvas"] div.touch-none').first();
  const box = await surface.boundingBox();
  await page.evaluate(([element, bytes, name, x, y]) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }));
    const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y };
    element.dispatchEvent(new DragEvent('dragover', init));
    element.dispatchEvent(new DragEvent('drop', init));
  }, [await surface.elementHandle(), [...doc.bytes], doc.name, box.x + box.width * 0.4, box.y + box.height * 0.4]);
  await dialog().waitFor({ timeout: 15000 });
  await waitFor(async () => (await dialog().locator('[data-pdf-total]').innerText()).trim() === `${doc.count} pages`, 20000, `the dropped PDF shows no "${doc.count} pages"`);
};
// Upload through the Context panel's own file input, as the Upload button does; returns the listed document. UI-26: the
// input sits with Upload in the Context header (PanelHeader CompanionHeader), beside Close.
const uploadContext = async doc => {
  await openCompanion();
  const posts = uploads.length;
  await page.locator('[data-companion-header] input[type="file"]').first().setInputFiles({ name: doc.name, mimeType: 'application/pdf', buffer: doc.bytes });
  await waitFor(() => uploads.length > posts, 60000, `the ${doc.count}-page PDF was never uploaded (POST /api/learn/context)`);
  const listed = await waitFor(async () => (await docsNow()).find(d => d.name === doc.name), 30000, `${doc.name} is not listed`);
  return { listed, post: uploads[posts] };
};

// ================================================================ the run
await openCanvas();
const docs = {}, cards = {};

await check('a 312-page PDF uploaded through the Context panel is accepted whole: the upload carries every page\'s text read in the browser, and the server lists 312 pages, ready, read by page', async () => {
  const { listed, post } = await uploadContext(LONG);
  docs.long = listed;
  assert.ok(Array.isArray(post.pages), `the POST carries a pages field (${typeof post.pages})`);
  assert.equal(post.pages.length, 312, 'one text per page, none dropped');
  assert.match(post.pages[311], /^Page 312 of 312\s+Marker p312/);
  assert.ok(post.pages[DEEP_PAGE - 1].includes(DEEP_WORDS), `page ${DEEP_PAGE} carries its own words`);
  assert.deepEqual({ pages: listed.pages, status: listed.status, reads: listed.reads, noText: listed.noText, error: listed.error, size: listed.size },
    { pages: 312, status: 'ready', reads: 'pages', noText: 0, error: null, size: LONG.bytes.length });
  const raw = await fetch(`${BASE}/api/learn/context/${encodeURIComponent(listed.id)}?app=${canvas.name}`, { headers: { cookie } });
  assert.ok(Buffer.from(await raw.arrayBuffer()).equals(LONG.bytes), 'the stored bytes are the whole PDF');
  assert.equal(captured.length, 0, 'uploading made no model request');
});

await check('a 101-page PDF the same way: 101 pages, ready, read by page', async () => {
  const { listed, post } = await uploadContext(PAST);
  docs.past = listed;
  assert.equal(post.pages?.length, 101);
  assert.deepEqual([listed.pages, listed.status, listed.reads], [101, 'ready', 'pages']);
});

await check(`the reader opens the 312-page PDF and reaches page ${DEEP_PAGE} and page 312, each with its own text layer`, async () => {
  await openReader(`doc:${docs.long.id}`, 312);
  assert.equal((await where()).index, 1);
  await goTo(DEEP_PAGE);
  assert.match((await where()).text, new RegExp(`${DEEP_PAGE} of 312`));
  assert.ok(norm(await pageText()).includes(DEEP_WORDS), `page ${DEEP_PAGE}'s words are on the page`);
  await shot('01-page-250');
  await goTo(312);
  assert.ok(norm(await pageText()).includes('Marker p312'));
  await goTo(DEEP_PAGE);
  assert.equal(captured.length, 0, 'reading made no model request');
});

await check(`Highlight on page ${DEEP_PAGE}: saved for page index ${DEEP_PAGE} with the selected line, shown as a box on that page`, async () => {
  const line = `Line 1 of page ${DEEP_PAGE} keeps ordinary words here for length only.`;
  await selectText(`Line 1 of page ${DEEP_PAGE}`, 'length only.');
  await page.locator('[data-pdf-selection-toolbar]').getByRole('button', { name: 'Highlight', exact: true }).click();
  const saved = await waitFor(async () => (await highlightsOf(`doc:${docs.long.id}`))[0], 10000, 'Highlight saved no row');
  facts.highlight = { id: saved.id, page: saved.page };
  assert.equal(saved.page?.index ?? saved.page, DEEP_PAGE);
  assert.equal(norm(saved.quote?.exact), norm(line));
  await page.locator(`[data-sources-pane] [data-pdf-highlight][data-highlight-id="${saved.id}"]`).first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error('no [data-pdf-highlight] box on the page'); });
});

await check(`Add to canvas from page ${DEEP_PAGE}: a text card with the exact words, footer "p. ${DEEP_PAGE}", its anchor on page index ${DEEP_PAGE} in PDF points`, async () => {
  const selected = await selectText('Sedimentation', 'river delta.');
  assert.equal(norm(selected), norm(DEEP_WORDS), 'control: the browser selected the sentence');
  const card = await addCard('[data-pdf-selection-toolbar]', 'text');
  cards.deep = card;
  assert.equal(norm(card.quote), norm(DEEP_WORDS));
  assert.ok(card.source.includes(LONG.name), `the footer names the document ("${norm(card.source)}")`);
  assert.match(card.source, new RegExp(`p\\. ${DEEP_PAGE}\\b`), 'the footer shows the page');
  const x = card.data.excerpt;
  assert.equal(x.kind, 'text');
  assert.equal(x.source?.key, `doc:${docs.long.id}`);
  assert.equal(x.page?.index, DEEP_PAGE, 'the anchor is on page index 250, not clamped to 100');
  assert.ok(x.rects.length >= 1 && x.rects.every(r => r[0] >= 60 && r[2] <= 560 && r[1] >= 600 && r[3] <= 760), `rects on the sentence's line in PDF points: ${JSON.stringify(x.rects.map(r => r.map(Math.round)))}`);
  await reveal(cardLocator(card.id));
  await shot('02-excerpt-card-250');
});

await check(`Add to chat from page ${DEEP_PAGE}: a chip "${LONG.name} · p. ${DEEP_PAGE}", nothing sent; the turn carries the verbatim words as an excerpt ref at page ${DEEP_PAGE}`, async () => {
  await setMode('ask');
  const count = await chips().count(), asks = captured.length;
  await selectText('Sedimentation', 'river delta.');
  await page.locator('[data-pdf-selection-toolbar]').getByRole('button', { name: 'Add to chat', exact: true }).click();
  await waitFor(async () => (await chips().count()) > count, 5000, 'no chip');
  assert.ok(norm(await chips().last().innerText()).includes(`${LONG.name} · p. ${DEEP_PAGE}`), 'the chip names the document and page');
  await page.waitForTimeout(800);
  assert.equal(captured.length, asks, 'Add to chat sends nothing by itself');
  const cap = await send('What builds the delta?');
  const refs = (cap.body.context_refs || []).filter(r => r.kind === 'excerpt');
  facts.ask_refs = refs.map(r => ({ sourceId: r.sourceId, range: r.range }));
  assert.equal(refs.length, 1);
  assert.equal(refs[0].range?.page, DEEP_PAGE, 'the ref keeps page 250');
  assert.ok(norm(refs[0].text).includes(norm(DEEP_WORDS)), 'the ref carries the exact words');
});

await check('region on page 101 of the 101-page PDF -> Add to canvas: a region card, its crop stored for page 101 and its anchor on page index 101', async () => {
  await openReader(`doc:${docs.past.id}`, 101);
  await goTo(101);
  const before = crops.length;
  await reader().getByRole('button', { name: 'Select region', exact: true }).click();
  await page.locator('[data-sources-pane] [data-pdf-region-mode]').first().waitFor({ timeout: 5000 }).catch(() => { throw Error('Select region showed no [data-pdf-region-mode]'); });
  const a = await pdfPoint(60, 735), b = await pdfPoint(560, 640);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 }); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  await page.locator('[data-pdf-region-toolbar]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error('the region shows no [data-pdf-region-toolbar]'); });
  const card = await addCard('[data-pdf-region-toolbar]', 'region');
  const x = card.data.excerpt;
  assert.equal(x.kind, 'region');
  assert.equal(x.source?.key, `doc:${docs.past.id}`);
  assert.equal(x.page?.index, 101, 'the region anchor is on page index 101');
  assert.equal(x.rects?.length, 1);
  assert.ok(x.rects[0].every((v, i) => Math.abs(v - [60, 640, 560, 735][i]) <= 8), `the stored rect ${JSON.stringify(x.rects[0].map(Math.round))} is the drawn one in PDF points`);
  assert.equal(crops.length, before + 1, 'one crop PUT');
  assert.deepEqual(crops.at(-1), { key: `doc:${docs.past.id}`, page: '101' });
});

await check(`Open source on the page-${DEEP_PAGE} card, from the other PDF: the reader opens the 312-page PDF at page ${DEEP_PAGE} and emphasizes the sentence precisely`, async () => {
  await openSourceOf(cards.deep.id);
  const c = await waitFor(async () => (await page.locator(EMPHASIS).count()) && (await where())?.index === DEEP_PAGE && (await where())?.of === 312 && coverage(EMPHASIS, 'Sedimentation', 'river delta.'), 15000,
    `no [data-pdf-emphasis] on page ${DEEP_PAGE} of 312 (reader at ${JSON.stringify(await where())})`);
  assert.ok(c.covered >= 0.6, `the emphasis covers ${Math.round(c.covered * 100)}% of the sentence`);
  assert.ok(c.size <= 4, `the emphasis is ${c.size.toFixed(1)}x the sentence (not precise)`);
  await shot('03-open-source-250');
});

await check(`PDF to canvas: dropping the 312-page PDF and adding page ${DEEP_PAGE} uploads it with every page's text (POST /api/learn/paper), draws that page and opens the reader at page ${DEEP_PAGE} of 312`, async () => {
  const before = new Set(await blockIds()), posts = uploads.length;
  await dropPdf(LONG);
  await dialog().locator('[data-pdf-choice="pages"]').click();
  await dialog().locator('[data-pdf-choice="range"]').click();
  await dialog().locator('[data-pdf-from]').fill(String(DEEP_PAGE));
  await dialog().locator('[data-pdf-to]').fill(String(DEEP_PAGE));
  await dialog().locator('button').last().click();
  await page.locator('[data-pdf-add-dialog]').waitFor({ state: 'detached', timeout: 120000 }).catch(() => { throw Error('the add dialog did not close'); });
  const post = uploads.slice(posts).find(u => u.path === '/api/learn/paper');
  assert.ok(post, 'one POST /api/learn/paper');
  assert.equal(post.pages?.length, 312, 'the paper upload carries every page\'s text');
  const added = await waitFor(async () => (await blockIds()).filter(id => !before.has(id)), 15000, 'no page was drawn on the canvas');
  assert.ok(added.length >= 1, 'the page is on the canvas');
  await waitFor(async () => (await where())?.index === DEEP_PAGE && (await where())?.of === 312, 30000, `the reader is not on page ${DEEP_PAGE} of 312 (${JSON.stringify(await where())})`);
  await shot('04-paper-page-250');
});

await check('no model call beyond the turn this check sent, no other model-capable request, no page error', async () => {
  assert.equal(captured.length, sends, `${captured.length} captured for ${sends} sends`);
  assert.deepEqual(refused, [], `refused routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await context.close();
await browser.close();
const passed = results.filter(r => r.ok).length;
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvas: canvas.name, total, passed, failed: results.length - passed, checks: results, facts,
  uploads: uploads.map(u => ({ path: u.path, pages: Array.isArray(u.pages) ? u.pages.length : u.pages })), crops, model_capable_refused: refused, outside_hosts: [...new Set(outside)], page_errors: errors }, null, 2));
if (results.length !== total) console.log(`FAIL ran ${results.length} checks, but total says ${total}`);
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
