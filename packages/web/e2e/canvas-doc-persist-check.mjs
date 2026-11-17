// BlockNote on the canvas: persistence and permissions (C:/s/spec/blocknote-canvas-mvp.md, owner decisions A1 checks 1-6 and
// section 15 scenarios 3, 4, 8, 10, 11), against the LOCAL stack only: local D1 and fresh browser profiles. Coded to the
// "Exact UI contract for checks" in the BlockNote plan: [data-canvas-doc] (data-doc-state), [data-canvas-doc-editor] .bn-editor,
// [data-doc-save-status] (data-state saving|saved|error), [data-board-size-warning], [data-doc-conflict], [data-doc-restore],
// no [data-doc-drop-hint] (a card dropped on the page stays there), the View menu's Canvas / Editor choice, and the server board's state.doc = { v: 1, x, y, w, blocks }.
// No model is ever called: every model-capable route is aborted and counted, and none may happen.
// Covered: write, hide, reopen, reload (block ids kept); a hide while a save is pending; another browser profile; canvas and
// document edits alternated; an unsupported card-onto-paper drop; a second canvas and a child Rabbit Hole with their own
// documents, and a late save of canvas A held until canvas B is open; Duplicate and another person's fork copy it
// independently; Trash and Restore keep it; two tabs in conflict; the 85% size warning, a real 413 and its retry; a failed
// load with Retry; the read-only shared view (another person, no saves); no document for an unauthorized person.
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets); exits 1 on any failure.
// Evidence goes to OUT: results.json and *.png.
// Usage: BASE=http://127.0.0.1:8901 SMALL_CP=http://127.0.0.1:8903 VARS=<cp .dev.vars> OUT=<dir> node e2e/canvas-doc-persist-check.mjs
import { chooseWorkspace } from './canvas-menu-helpers.mjs';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8901';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8903';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-doc-persist-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/canvas-doc-persist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const OWNER = await sessionFor(`cdp-${run}@example.com`), OTHER = await sessionFor(`cdp-other-${run}@example.com`);
const call = async (session, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...init.headers } });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const api = async (path, init) => (await call(OWNER, path, init)).body;
const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });

// ---------------------------------------------------------------- setup: canvases and their server boards
const MAX_STATE = 1_900_000; // learn-boards.js
const catalog = await api('/api/apps');
const otherCatalog = (await call(OTHER, '/api/apps')).body;
const newCanvas = async title => {
  const made = await post('/api/canvases', { title: `${title} ${run}` });
  if (!/^canvas-[a-f0-9]{8}$/.test(made?.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(made).slice(0, 200)}`);
  return made.name;
};
const EMPTY = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] };
const CARD = { id: 'c1', type: 'explanation', dx: 0, dy: 0, title: 'Tides', body: 'Two bulges of water, one on each side.' };
const para = (id, text) => ({ id, type: 'paragraph', props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' }, content: [{ type: 'text', text, styles: {} }], children: [] });
const seed = async (name, state) => {
  const r = await call(OWNER, `/api/learn/boards/${name}/main`, { method: 'PUT', body: JSON.stringify({ state: { ...EMPTY, ...state } }) });
  if (r.status !== 200) throw Error(`seeding ${name} failed: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
};
// The local D1 now and then answers a read with a 500 (Failed to get session commit token); retry those, never a 4xx.
const boardOf = async (name, session = OWNER) => {
  let r;
  for (let i = 0; i < 4; i++) { r = await call(session, `/api/learn/boards/${name}/main`); if (r.status < 500) break; await new Promise(go => setTimeout(go, 500)); }
  return r.body;
};
const docOf = async (name, session) => (await boardOf(name, session))?.state?.doc;
const has = (doc, marker) => JSON.stringify(doc?.blocks || []).includes(marker);
const idsOf = blocks => (blocks || []).flatMap(b => [b.id, ...idsOf(b.children)]);

const A = await newCanvas('Doc persist A');      // the main canvas: one card, no document yet
const B = await newCanvas('Doc persist B');      // a second canvas, empty
const C = await newCanvas('Doc persist conflict');
const BIG = await newCanvas('Doc persist size');
await seed(A, { blocks: [CARD] });
await seed(C, { blocks: [CARD], doc: { v: 1, x: 0, y: 0, w: 760, blocks: [para('base-1', `Base paragraph ${run}.`)] } });
const CHILD = `canvas-${randomBytes(4).toString('hex')}`;
const child = await post('/api/canvases/dives', { name: CHILD, title: `Doc persist hole ${run}`, parent: { app: A, board: 'main' }, origin_block_id: 'c1' });
if (child?.name !== CHILD) throw Error(`the child Rabbit Hole was not created: ${JSON.stringify(child).slice(0, 200)}`);
const viewKey = (cat, name) => `small.adaptive-canvas:${cat.org}:${cat.email}:${name}:view`;

// ---------------------------------------------------------------- routes: no model, every board save recorded
const refused = [], background = [], outside = [], errors = [], puts = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|tutor|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|dive|explore))/;
const BOARD_PUT = /^\/api\/learn\/boards\/(canvas-[a-f0-9]{8})\/main$/;
const router = who => async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  // Professor Next Steps asks once when a canvas opens (not a document action): aborted, and counted apart.
  if (url.pathname === '/api/learn/tutor/next-steps') { background.push(who); return route.abort(); }
  if (MODEL.test(url.pathname)) { refused.push(`${who} ${request.method()} ${url.pathname}`); return route.abort(); }
  const board = request.method() === 'PUT' && url.pathname.match(BOARD_PUT)?.[1];
  if (board) puts.push({ who, board, body: request.postData() || '' });
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
    console.log(`FAIL ${label} - ${message}${String(error?.stack || '').split('\n').filter(line => line.includes('canvas-doc-persist-check.mjs')).slice(0, 3).map(line => ` @${line.trim().replace(/.*check\.mjs:/, '')}`).join('')}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
// A browser profile: a person (owner or other) with empty storage; `editor` lists canvases whose view starts as Editor.
const profile = async (name, { session = OWNER, cat = catalog, editor = [] } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(keys => { try { for (const key of keys) if (localStorage.getItem(key) == null) localStorage.setItem(key, 'editor'); } catch { /* a sandboxed frame */ } }, editor.map(c => viewKey(cat, c)));
  await context.route('**/*', router(name));
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(`${name}: ${error.message.slice(0, 160)}`));
  return { context, page: p };
};
const until = async (test, ms = 15000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await new Promise(r => setTimeout(r, 200)); } };
const shot = (name, p = page) => p.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});

// ---------------------------------------------------------------- the document as the page shows it
const paper = p => p.locator('[data-canvas-doc]');
const editorOf = p => p.locator('[data-canvas-doc-editor] .bn-editor');
const status = p => p.locator('[data-doc-save-status]');
const openCanvas = async (p, name, { path = `/apps/${name}` } = {}) => {
  await p.goto(`${BASE}${path}`);
  await p.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await p.waitForTimeout(1200);
};
const inApp = (p, to) => p.evaluate(to => { window.history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')); }, to);
const ready = p => p.locator('[data-canvas-doc][data-doc-state="ready"]').waitFor({ timeout: 30000 });
// The View menu's Canvas / Editor choice: View > Workspace.
const setView = async (p, label) => {
  await chooseWorkspace(p, label); // Owner brief 2026-10-22: View > Workspace > Canvas | Editor (two radio rows)
  if (label === 'Editor') await ready(p);
  else await until(async () => (await paper(p).count()) === 0, 8000, 'the paper is still in the DOM in Canvas view');
};
const typeAtEnd = async (p, text) => {
  // Focus, not a click: a card may lie over the editor's middle, and cards sit above the document (blocknote-layers-minimap.md).
  await editorOf(p).focus();
  await p.keyboard.press('Control+End');
  await p.keyboard.type(text);
};
const editorText = p => editorOf(p).innerText();
const domIds = p => p.locator('[data-canvas-doc-editor] .bn-block-outer[data-id]').evaluateAll(els => els.map(el => el.dataset.id));
// Saved, as the server holds it: the board's doc carries the marker, and the page says Saved.
const savedWith = async (p, name, marker, ms = 20000) => {
  const doc = await until(async () => { const d = await docOf(name); return has(d, marker) && d; }, ms, `the server document of ${name} never held ${marker}`);
  await until(async () => (await status(p).getAttribute('data-state').catch(() => null)) === 'saved', 10000, 'the save status never said saved');
  assert.match(await status(p).innerText(), /Saved/);
  return doc;
};
const card = (p, id = 'c1') => p.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
const drag = async (p, from, to) => {
  await p.mouse.move(from.x, from.y); await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(from.x + (to.x - from.x) * i / 12, from.y + (to.y - from.y) * i / 12);
  await p.mouse.up();
};
const centre = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const handleOf = async p => centre(await card(p).locator('[data-drag-handle]').boundingBox());
// Editor view frames the paper, which can leave the card off the left edge; wheel the camera (over the canvas) until the
// whole card sits right of the tools gutter.
const cardInView = async p => {
  for (let i = 0; i < 6; i++) {
    const box = await card(p).boundingBox();
    if (box && box.x >= 120) return;
    const at = await p.locator('[aria-label="Lesson canvas"]').boundingBox();
    await p.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await p.mouse.wheel(-((box ? 160 - box.x : 400)), 0);
    await p.waitForTimeout(250);
  }
  throw Error('the card could not be brought into view');
};
const cardOf = async name => (await boardOf(name))?.state?.blocks?.find(b => b.id === 'c1');

// ================================================================ 1. write, hide, reopen, reload
const one = await profile('owner');
page = one.page;
const M1 = `First line ${run}`, M2 = `Second line ${run}`;
await check('decision 1: a canvas opens in Canvas view by default; Editor shows the paper, ready, with its editor', async () => {
  await openCanvas(page, A);
  assert.equal(await paper(page).count(), 0, 'no paper in Canvas view');
  await setView(page, 'Editor');
  assert.equal(await page.evaluate(k => localStorage.getItem(k), viewKey(catalog, A)), 'editor', 'the view choice is kept per user and canvas');
  await shot('1-editor-first-open');
});
let firstIds = [];
await check('decision 1: write, then the server holds state.doc = { v: 1, x, y, w, blocks } with the text', async () => {
  await typeAtEnd(page, M1);
  await page.keyboard.press('Enter');
  await page.keyboard.type(M2);
  const doc = await savedWith(page, A, M2);
  assert.equal(doc.v, 1); assert.ok(Number.isFinite(doc.x) && Number.isFinite(doc.y) && Number.isFinite(doc.w), `x, y, w are numbers (${doc.x}, ${doc.y}, ${doc.w})`);
  assert.ok(Array.isArray(doc.blocks) && has(doc, M1), 'blocks hold both lines');
  firstIds = idsOf(doc.blocks);
  facts.first = { x: doc.x, y: doc.y, w: doc.w, ids: firstIds.length };
});
// Amended contract (Parallel, 2026-10-15 12:03 AM PT): the editor root does not carry data-rich-editor, since that attribute
// turns Ctrl+K inline AI on; the editor sits in the paper and canvas keys and Ctrl+K stand down inside it.
await check('contract: the editor is inside the paper; Delete, Space and Ctrl+A in it leave the cards alone; Ctrl+K opens no inline AI', async () => {
  assert.equal(await page.locator('[data-canvas-doc] [data-canvas-doc-editor]').count(), 1, 'the editor root is inside the paper');
  const inkKey = viewKey(catalog, A).replace(/:view$/, ':ink');
  const objects = () => page.evaluate(key => { let ink = {}; try { ink = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {} return JSON.stringify(['blocks', 'items', 'shapes', 'links', 'groups', 'areas', 'strokes'].map(k => (ink[k] || []).map(o => [o.id, o.x, o.y, o.dx, o.dy]))); }, inkKey);
  const marked = () => page.locator('[data-item-id].ring-2, [data-block-id].ring-select, [data-shape-id][data-selected]').count();
  // A selected card first: once the editor has the caret, Delete must not act on it.
  await cardInView(page);
  const h = await handleOf(page);
  await page.mouse.click(h.x, h.y);
  await page.waitForTimeout(200);
  const chosen = () => card(page).getAttribute('aria-current');
  if (await chosen() !== 'true') { const b = await card(page).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + Math.min(40, b.height / 2)); await page.waitForTimeout(200); }
  assert.equal(await chosen(), 'true', 'card c1 is selected before the keys (aria-current)');
  const before = await objects(), text = await editorText(page);
  await typeAtEnd(page, '');
  facts.keys = { card_selected_with_caret_in_editor: await chosen() === 'true' };
  const selectedBefore = await marked();
  await page.keyboard.press('Delete'); // at the end of the document: nothing to delete there
  await page.keyboard.down(' ');
  assert.equal(await page.evaluate(() => document.querySelector('[data-canvas-surface]')?.hasAttribute('data-space-pan') || false), false, 'Space started a canvas pan');
  await page.keyboard.up(' ');
  await page.keyboard.press('Backspace'); // the space
  await page.keyboard.press('Control+a');
  const sel = await page.evaluate(() => ({ text: getSelection().toString(), inEditor: !!getSelection().anchorNode?.parentElement?.closest('[data-canvas-doc-editor]') }));
  assert.ok(sel.inEditor && sel.text.trim().length > 0, 'Ctrl+A selected text in the document');
  assert.equal(await marked(), selectedBefore, 'Ctrl+A selected no canvas objects');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-inline-ai]').count(), 0, 'Ctrl+K inside the editor opened no inline AI');
  assert.equal(await page.locator('[data-inline-hint]').count(), 0, 'Ctrl+K inside the editor showed no Quick Edit hint');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  assert.equal(await card(page).count(), 1, 'the card is still on the canvas');
  assert.equal(await objects(), before, 'no canvas object changed');
  assert.equal(await editorText(page), text, 'the document text is unchanged');
});
await check('decision 1: hide (Canvas) leaves nothing in the DOM; reopen (Editor) shows the same text and block ids', async () => {
  await setView(page, 'Canvas');
  await setView(page, 'Editor');
  const text = await editorText(page);
  assert.ok(text.includes(M1) && text.includes(M2), 'both lines after reopening');
  assert.deepEqual(await domIds(page), firstIds, 'the same block ids');
});
const M3 = `Typed then hidden ${run}`;
await check('decision 1: an edit typed just before hiding is saved anyway (hiding does not cancel the pending save)', async () => {
  await typeAtEnd(page, ` ${M3}`);
  await setView(page, 'Canvas');
  await until(async () => has(await docOf(A), M3), 20000, 'the edit typed before hiding never reached the server');
  await setView(page, 'Editor');
  await savedWith(page, A, M3);
});
await check('decision 1: reload keeps Editor (remembered) and the document, block ids unchanged on the server and the page', async () => {
  const before = idsOf((await docOf(A)).blocks);
  await page.reload();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await ready(page);
  const text = await editorText(page);
  assert.ok([M1, M2, M3].every(m => text.includes(m)), 'all three edits after reload');
  assert.deepEqual(idsOf((await docOf(A)).blocks), before, 'server block ids unchanged by the reload');
  assert.deepEqual(await domIds(page), before, 'the page shows the same block ids');
  await shot('1-after-reload');
});

// ================================================================ 3. another authenticated browser
await check('scenario 3: another browser profile of the same person opens the canvas (Canvas by default) and, in Editor, sees the saved document', async () => {
  const two = await profile('owner-device-2');
  try {
    await openCanvas(two.page, A);
    assert.equal(await paper(two.page).count(), 0, 'the view choice does not travel to another device');
    await setView(two.page, 'Editor');
    const text = await editorText(two.page);
    assert.ok([M1, M2, M3].every(m => text.includes(m)), 'the saved text');
    assert.deepEqual(await domIds(two.page), idsOf((await docOf(A)).blocks), 'the same block ids');
    await shot('3-other-device', two.page);
  } finally { await two.context.close(); }
});

// ================================================================ 2. canvas and document edits alternated
const D1 = `Doc edit one ${run}`, D2 = `Doc edit two ${run}`;
await check('decision 2: document edit, card move, document edit, card move - the server keeps both final edits', async () => {
  const start = await cardOf(A);
  await typeAtEnd(page, ` ${D1}`);
  await cardInView(page);
  let h = await handleOf(page);
  await drag(page, h, { x: h.x, y: h.y + 120 });
  await typeAtEnd(page, ` ${D2}`);
  await cardInView(page);
  h = await handleOf(page);
  await drag(page, h, { x: h.x + 10, y: h.y + 100 });
  const moved = await until(async () => {
    const board = (await boardOf(A)).state;
    const c = board?.blocks?.find(b => b.id === 'c1');
    return has(board?.doc, D1) && has(board?.doc, D2) && c && (c.dx !== start.dx || c.dy !== start.dy) && c;
  }, 20000, 'the server never held both document edits and the moved card together');
  // A read the local D1 answers with a 500 (no body) is retried, not taken as a moved card.
  await until(async () => { const c = await cardOf(A); await page.waitForTimeout(2500); const again = await cardOf(A); return c && again && c.dx === again.dx && c.dy === again.dy; }, 15000, 'the card position kept changing');
  const final = (await boardOf(A)).state;
  assert.ok(has(final.doc, D1) && has(final.doc, D2), 'no later canvas save dropped a document edit');
  const c = final.blocks.find(b => b.id === 'c1');
  assert.ok(c.dx !== start.dx || c.dy !== start.dy, 'no later document save put the card back');
  facts.alternate = { from: [start.dx, start.dy], to: [c.dx, c.dy], seenMid: [moved.dx, moved.dy] };
});

// ================================================================ 8. card onto the paper
// Owner, 2026-10-15 (C:/s/spec/blocknote-layers-minimap.md): users control placement - a card dropped onto the page is NOT
// refused or moved back; it stays where it was dropped, above the document, and stays a canvas object.
await check('scenario 8: a card dropped onto the paper stays where it was dropped, above the document; the document is unchanged', async () => {
  await page.keyboard.press('Escape');
  await cardInView(page);
  const beforeCard = await cardOf(A), beforeDoc = await docOf(A);
  const beforeBox = await card(page).boundingBox();
  const target = centre(await paper(page).boundingBox());
  await drag(page, await handleOf(page), target);
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-doc-drop-hint]').count(), 0, 'the drop was refused');
  const afterBox = await card(page).boundingBox();
  assert.ok(Math.abs(afterBox.x - beforeBox.x) > 20 || Math.abs(afterBox.y - beforeBox.y) > 20, 'the card went back where it was');
  const at = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.closest('[data-block-id="c1"]') ? 'card' : el?.closest('[data-canvas-doc]') ? 'doc' : el?.tagName; }, [afterBox.x + afterBox.width / 2, afterBox.y + afterBox.height / 2]);
  assert.notEqual(at, 'doc', 'the dropped card is under the document');
  await shot('8-card-on-paper');
  await page.waitForTimeout(3500);
  const afterCard = await cardOf(A), afterDoc = await docOf(A);
  assert.notDeepEqual([afterCard.dx, afterCard.dy], [beforeCard.dx, beforeCard.dy], 'the saved card position did not follow the drop');
  assert.deepEqual(afterDoc.blocks, beforeDoc.blocks, 'the document neither gained nor lost content');
  assert.equal((await page.locator('[aria-label="Lesson canvas"] [data-block-id="c1"]').evaluateAll(els => new Set(els.map(e => e.dataset.blockId)).size)), 1, 'one card, not a copy');
});

// ================================================================ 4. two canvases, a child Rabbit Hole, a late save
const BM = `Canvas B text ${run}`, HM = `Hole text ${run}`, LATE = `Late save ${run}`;
await check('scenario 4: canvas B starts with an empty document of its own, and its text stays on B', async () => {
  await inApp(page, `/apps/${B}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await setView(page, 'Editor');
  const text = await editorText(page);
  assert.ok(![M1, M2, D1].some(m => text.includes(m)), 'none of canvas A\'s text');
  await typeAtEnd(page, BM);
  await savedWith(page, B, BM);
  assert.equal(has(await docOf(A), BM), false, 'canvas A never got B\'s text');
});
await check('scenario 4: the child Rabbit Hole does not copy the parent document; its own text stays in the hole; the parent keeps its own', async () => {
  await inApp(page, `/apps/${CHILD}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  if (!(await paper(page).count())) await setView(page, 'Editor');
  await ready(page);
  const text = await editorText(page);
  assert.ok(![M1, M2, D1, BM].some(m => text.includes(m)), 'the hole starts without the parent\'s (or B\'s) text');
  await typeAtEnd(page, HM);
  await savedWith(page, CHILD, HM);
  await inApp(page, `/apps/${A}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await ready(page);
  const back = await editorText(page);
  assert.ok(back.includes(M1) && !back.includes(HM), 'the parent shows its own document again');
  assert.equal(has(await docOf(A), HM), false, 'the parent\'s server document has no hole text');
});
await check('scenario 4: a save of canvas A held until canvas B is open lands on A only - B\'s page and server document never get it', async () => {
  let release, held = 0;
  const gate = new Promise(r => { release = r; });
  const hold = async route => { held++; await gate; return route.fallback(); };
  await one.context.route(`${BASE}/api/learn/boards/${A}/main`, async route => (route.request().method() === 'PUT' ? hold(route) : route.fallback()));
  try {
    await typeAtEnd(page, ` ${LATE}`);
    await until(async () => held > 0, 15000, 'canvas A never sent its save');
    await inApp(page, `/apps/${B}`);
    await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
    await ready(page);
    release();
    await page.waitForTimeout(4000);
    const text = await editorText(page);
    assert.ok(text.includes(BM) && !text.includes(LATE), 'B\'s page shows B\'s text only');
    assert.equal(has(await docOf(B), LATE), false, 'B\'s server document never got A\'s late text');
    assert.deepEqual(puts.filter(p => p.board === B && p.body.includes(LATE)).length, 0, 'no PUT to B carried A\'s text');
    await until(async () => has(await docOf(A), LATE), 15000, 'canvas A\'s held edit never reached A');
  } finally { release(); await one.context.unroute(`${BASE}/api/learn/boards/${A}/main`); }
  await inApp(page, `/apps/${A}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await ready(page);
  assert.ok((await editorText(page)).includes(LATE), 'back on A, the late edit is there');
});

// ================================================================ 4 (decision). Duplicate, fork, trash and restore
const COPY = `Edited on the copy ${run}`;
await check('decision 4: Duplicate copies the document; editing the copy leaves the original unchanged', async () => {
  const original = await docOf(A);
  assert.ok(original?.blocks, 'canvas A has a saved document');
  const copy = await post('/api/learn/boards/duplicate', { source: { canvas: A }, key: `dup-${run}` });
  assert.match(String(copy?.name), /^canvas-[a-f0-9]{8}$/, `the Duplicate was made (${JSON.stringify(copy).slice(0, 160)})`);
  facts.duplicate = copy.name;
  assert.deepEqual((await docOf(copy.name))?.blocks, original.blocks, 'the copy holds the same document');
  await inApp(page, `/apps/${copy.name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  if (!(await paper(page).count())) await setView(page, 'Editor');
  await ready(page);
  assert.ok((await editorText(page)).includes(M1), 'the copy shows the document');
  await typeAtEnd(page, ` ${COPY}`);
  await savedWith(page, copy.name, COPY);
  assert.deepEqual((await docOf(A)).blocks, original.blocks, 'the original document is unchanged');
});
let share = null;
await check('decision 4: another person\'s fork of the shared canvas copies the document; their edit leaves the original unchanged', async () => {
  const state = (await boardOf(A)).state;
  share = await post(`/api/learn/boards/${A}/main/share`, { shared: true, view: true, state });
  assert.ok(share?.sharing?.view, 'the canvas is shared by link');
  const original = await docOf(A);
  assert.ok(original?.blocks, 'canvas A has a saved document');
  const fork = (await call(OTHER, '/api/learn/boards/fork', { method: 'POST', body: JSON.stringify({ source: { token: share.sharing.view }, key: `fork-${run}` }) })).body;
  assert.match(String(fork?.name), /^canvas-[a-f0-9]{8}$/, `the other person forked it (${JSON.stringify(fork).slice(0, 160)})`);
  facts.fork = fork.name;
  const theirs = await boardOf(fork.name, OTHER);
  assert.deepEqual(theirs.state?.doc?.blocks, original.blocks, 'the fork holds the same document');
  const edited = { ...theirs.state, doc: { ...theirs.state.doc, blocks: [...theirs.state.doc.blocks, para(`fork-${run}`, `Fork edit ${run}`)] } };
  const saved = await call(OTHER, `/api/learn/boards/${fork.name}/main`, { method: 'PUT', body: JSON.stringify({ state: edited, version: theirs.version }) });
  assert.equal(saved.status, 200, `the fork saves (${JSON.stringify(saved.body).slice(0, 120)})`);
  assert.ok(has(await docOf(fork.name, OTHER), `Fork edit ${run}`), 'the fork has the edit');
  assert.deepEqual((await docOf(A)).blocks, original.blocks, 'the original document is unchanged');
});
await check('decision 4: Trash and Restore keep the document', async () => {
  const before = await docOf(A);
  assert.ok(before?.blocks, 'canvas A has a saved document');
  const trashed = await call(OWNER, `/api/apps/${A}/trash`, { method: 'POST', body: '{}' });
  assert.ok(trashed.status < 300, `trashed (${trashed.status} ${JSON.stringify(trashed.body).slice(0, 120)})`);
  const restored = await call(OWNER, `/api/apps/${A}/untrash`, { method: 'POST', body: '{}' });
  assert.ok(restored.status < 300, `restored (${restored.status} ${JSON.stringify(restored.body).slice(0, 120)})`);
  assert.deepEqual((await docOf(A)).blocks, before.blocks, 'the same document after Restore');
});

// ================================================================ 11. read-only and unauthorized
await check('scenario 11: the read-only shared view shows the document, not editable, and sends no save', async () => {
  const viewer = await profile('other-viewer', { session: OTHER, cat: otherCatalog });
  try {
    const sent = () => puts.filter(p => p.who === 'other-viewer').length;
    await viewer.page.goto(`${BASE}/b/${share.sharing.view}`);
    await viewer.page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
    await viewer.page.waitForTimeout(1500);
    // The shared page shows the document on request (a Show document toggle).
    const toggle = viewer.page.locator('[data-doc-toggle]');
    if (!(await paper(viewer.page).count()) && await toggle.count()) await toggle.first().click();
    if (!(await paper(viewer.page).count()) && await viewer.page.getByRole('menubar', { name: 'Canvas menu' }).count()) await setView(viewer.page, 'Editor');
    await ready(viewer.page);
    assert.ok((await editorText(viewer.page)).includes(M1), 'the document is visible');
    assert.equal(await editorOf(viewer.page).getAttribute('contenteditable'), 'false', 'the editor is not editable');
    await editorOf(viewer.page).click();
    await viewer.page.keyboard.type('viewer typing');
    await viewer.page.waitForTimeout(2500);
    assert.equal((await editorText(viewer.page)).includes('viewer typing'), false, 'typing changes nothing');
    assert.equal(await viewer.page.locator('[data-doc-save-status][data-state="saving"]').count(), 0, 'no saving state');
    assert.equal(sent(), 0, 'no board save was sent');
    await shot('11-read-only', viewer.page);
  } finally { await viewer.context.close(); }
});
await check('scenario 11: an unauthorized person gets no document data for the owner\'s canvas', async () => {
  const theirs = await call(OTHER, `/api/learn/boards/${A}/main`);
  assert.equal(JSON.stringify(theirs.body || {}).includes(run), false, `no owner content reached the other person (${theirs.status})`);
  await post(`/api/learn/boards/${A}/main/share`, { shared: false });
  const gone = await call(OTHER, `/api/learn/boards/shared/${share.sharing.view}`);
  assert.ok(gone.status >= 400 && !JSON.stringify(gone.body || {}).includes(run), `the dead link exposes nothing (${gone.status})`);
});
await one.context.close();

// ================================================================ 10. load failure
await check('scenario 10: a failed board load shows Retry on the paper, saves nothing blank, and Retry brings back the saved document', async () => {
  const fresh = await profile('owner-load-fail', { editor: [A] });
  page = fresh.page;
  try {
    const saved = await docOf(A);
    let failing = true;
    await fresh.context.route(`${BASE}/api/learn/boards/${A}/main`, route => (failing && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { error: 'Board unavailable (test)' } }) : route.fallback()));
    await openCanvas(page, A);
    await page.locator('[data-canvas-doc][data-doc-state="error"]').waitFor({ timeout: 20000 });
    await shot('10-load-failure');
    await page.waitForTimeout(3000);
    assert.equal(puts.filter(p => p.who === 'owner-load-fail').length, 0, 'no save while the load failed');
    assert.deepEqual((await docOf(A)).blocks, saved.blocks, 'the saved document is untouched');
    failing = false;
    await paper(page).getByRole('button', { name: 'Retry' }).click();
    await ready(page);
    assert.ok((await editorText(page)).includes(M1), 'Retry shows the saved document');
    await page.waitForTimeout(2500);
    assert.deepEqual((await docOf(A)).blocks, saved.blocks, 'still the same document on the server');
  } finally { await fresh.context.close(); }
});

// ================================================================ 3 (decision). two tabs in conflict
const ALPHA = `Alpha tab ${run}`, BRAVO = `Bravo tab ${run}`, CHARLIE = `Charlie tab ${run}`;
await check('decision 3: two tabs - the second save is a 409 that keeps its text and shows [data-doc-conflict]', async () => {
  const t1 = await profile('tab-1', { editor: [C] }), t2 = await profile('tab-2', { editor: [C] });
  facts.tabs = { t1, t2 };
  page = t2.page;
  await openCanvas(t1.page, C); await ready(t1.page);
  await openCanvas(t2.page, C); await ready(t2.page);
  await typeAtEnd(t1.page, ` ${ALPHA}`);
  await savedWith(t1.page, C, ALPHA);
  await typeAtEnd(t2.page, ` ${BRAVO}`);
  const conflict = t2.page.locator('[data-doc-conflict]');
  await conflict.waitFor({ state: 'visible', timeout: 20000 });
  assert.match(await conflict.innerText(), /This canvas changed elsewhere\./);
  assert.ok((await editorText(t2.page)).includes(BRAVO), 'the second tab keeps its text');
  assert.equal(has(await docOf(C), BRAVO), false, 'nothing overwrote the first tab silently');
  assert.ok(has(await docOf(C), ALPHA), 'the first tab\'s save stands');
  await shot('3-conflict', t2.page);
});
await check('decision 3: Reload and keep my document saves the second tab\'s text; the first tab\'s text is kept somewhere the person can get it', async () => {
  const { t2 } = facts.tabs;
  await t2.page.locator('[data-doc-conflict]').getByRole('button', { name: 'Reload and keep my document' }).click();
  await savedWith(t2.page, C, BRAVO);
  const server = await docOf(C);
  const replaced = await t2.page.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith(':replaced')).map(k => localStorage.getItem(k)).join('\n'));
  const offered = await t2.page.locator('[data-doc-restore]').count();
  const where = has(server, ALPHA) ? 'server' : offered ? 'restore' : replaced.includes(ALPHA) ? 'replaced' : null;
  facts.conflict = { alpha_kept_in: where };
  assert.ok(where, 'the first tab\'s text is neither on the server, nor offered, nor kept under :replaced');
});
await check('decision 3: the first tab, now stale, gets the conflict too instead of overwriting; a plain reload offers Restore my unsaved document', async () => {
  const { t1 } = facts.tabs;
  page = t1.page;
  await typeAtEnd(t1.page, ` ${CHARLIE}`);
  await t1.page.locator('[data-doc-conflict]').waitFor({ state: 'visible', timeout: 20000 });
  assert.ok(has(await docOf(C), BRAVO) && !has(await docOf(C), CHARLIE), 'the second tab\'s saved text was not overwritten');
  await t1.page.waitForTimeout(800); // the local copy (400 ms debounce)
  await t1.page.reload();
  await t1.page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await ready(t1.page);
  const restore = t1.page.locator('[data-doc-restore]');
  await restore.waitFor({ state: 'visible', timeout: 15000 });
  await shot('3-restore-offered', t1.page);
  await restore.getByRole('button', { name: 'Restore my unsaved document' }).click();
  await until(async () => (await editorText(t1.page)).includes(CHARLIE), 8000, 'Restore did not bring the unsaved text back');
  await savedWith(t1.page, C, CHARLIE);
});
if (facts.tabs) { await facts.tabs.t1.context.close(); await facts.tabs.t2.context.close(); delete facts.tabs; }

// ================================================================ 5 (decision). the size limit
// About 89% of 1.9 MB of document text, so the warning shows; a paste of 300 kB then takes the board over the limit.
const BIG_PARAS = Array.from({ length: 210 }, (_, i) => para(`big-${i}`, `Paragraph ${i} ${'lorem ipsum dolor sit amet '.repeat(292)}`));
await seed(BIG, { doc: { v: 1, x: 0, y: 0, w: 760, blocks: BIG_PARAS } });
facts.size = { seeded: JSON.stringify((await boardOf(BIG)).state).length, limit: MAX_STATE };
const TAIL = `Over the limit ${run}`, SMALL = `Reduced ${run}`;
await check('decision 5: a board past 85% of 1.9 MB shows [data-board-size-warning]', async () => {
  assert.ok(facts.size.seeded > MAX_STATE * 0.85 && facts.size.seeded < MAX_STATE, `the seeded board is ${facts.size.seeded} characters`);
  const big = await profile('owner-size', { editor: [BIG] });
  facts.big = big;
  page = big.page;
  await openCanvas(page, BIG); await ready(page);
  await page.locator('[data-board-size-warning]').waitFor({ state: 'visible', timeout: 15000 });
  await shot('5-size-warning');
});
await check('decision 5: a save over the limit is refused (413): Couldn\'t save / Not saved, the text stays, nothing truncated', async () => {
  const statuses = [];
  page.on('response', r => { if (r.request().method() === 'PUT' && r.url().endsWith(`/api/learn/boards/${BIG}/main`)) statuses.push(r.status()); });
  await editorOf(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(` ${'x'.repeat(300000)} ${TAIL}`);
  await until(async () => statuses.includes(413), 30000, `no 413 (${statuses.join(',')})`);
  await page.locator('[data-doc-save-status][data-state="error"]').waitFor({ timeout: 10000 });
  assert.match(await status(page).innerText(), /Not saved/);
  assert.ok((await editorText(page)).includes(TAIL), 'the unsaved text is still in the editor');
  assert.equal(has(await docOf(BIG), TAIL), false, 'the server never took a truncated or partial copy');
  assert.equal((await docOf(BIG)).blocks.length, BIG_PARAS.length, 'the server document is the seeded one');
  await shot('5-not-saved');
});
await check('decision 5: after reducing (Undo the paste) Retry saves', async () => {
  await page.keyboard.press('Control+z');
  await until(async () => !(await editorText(page)).includes(TAIL), 8000, 'Undo did not remove the paste');
  await page.keyboard.type(` ${SMALL}`);
  const retry = status(page).getByRole('button', { name: 'Retry' });
  if (await retry.count()) await retry.click();
  await savedWith(page, BIG, SMALL, 30000);
  assert.equal(has(await docOf(BIG), TAIL), false, 'the oversized paste is not on the server');
});
if (facts.big) { await facts.big.context.close(); delete facts.big; }

await check('no model call or model-capable request, no page error', async () => {
  assert.deepEqual(refused, [], `refused routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await browser.close();
const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvases: { A, B, C, BIG, CHILD }, passed: results.length - failed.length, failed: failed.length, checks: results, facts,
  board_puts: puts.map(p => ({ who: p.who, board: p.board, size: p.body.length })), model_capable_refused: refused, next_steps_on_open: background.length, outside_hosts: [...new Set(outside)], page_errors: errors }, null, 2));
console.log(failed.length ? `FAIL ${failed.length} of ${results.length} checks (see ${OUT}/results.json)` : `PASS ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
