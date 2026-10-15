// BlockNote document on the canvas (C:/s/spec/blocknote-canvas-mvp.md; UI contract in blocknote-plan.md "Exact UI contract
// for checks"): appearance and first placement (brief 4), a definite start and a continuous document (5), scrolling, panning
// and zooming (6), keyboard focus and event isolation (9), and acceptance scenarios 1, 2, 5, 6, 7, 9 and 12 of section 15.
// LOCAL stack only: local D1, fresh browser profiles, test sessions. No model is ever called: /api/learn/ask (SSE) and the Tutor
// planner are answered here with canned text and their request bodies CAPTURED; every other model-capable route is aborted and
// counted, and none may happen. Typing, scrolling, toggling Editor and opening its menus must send no AI request at all.
// Setup (only in this check's own canvases): canvas A has two cards in the column, a sticky, a text box and a box beside them,
// and no document; canvas B adds a 200-block document (headings, paragraphs, lists, checklists, quotes, code) at a stored spot.
// Prints `ok <label>` per check, ids and counts only (no cookies, no secrets); exits 1 on any failure.
// Evidence goes to OUT: results.json (facts, the captured document parts of canvas_context) and *.png.
// Usage: BASE=http://127.0.0.1:8931 SMALL_CP=http://127.0.0.1:8933 VARS=<cp .dev.vars> OUT=<dir> node e2e/canvas-doc-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8933';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-doc-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/canvas-doc', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cdoc-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();
const catalog = await api('/api/apps');

// ---------------------------------------------------------------- the canvases, seeded through the board route
const card = (id, title, body) => ({ id, type: 'explanation', dx: 0, dy: 0, title, body });
const note = (id, text, x, y) => ({ id, kind: 'sticky', x, y, w: 160, text, color: '#f59e0b', opacity: 1 });
const words = (id, text, x, y) => ({ id, kind: 'text', x, y, w: 260, text, color: '#37352f', opacity: 1, level: 'body' });
const rect = (id, text, x1, y1, x2, y2) => ({ id, kind: 'rect', x1, y1, x2, y2, color: '#2383e2', width: 2, dash: 'solid', fill: null, opacity: 1, round: true, text });
const run1 = text => [{ type: 'text', text, styles: {} }];
// 200 mixed blocks, every one with its own id; the first and last say where they are.
const LONG = Array.from({ length: 200 }, (_, i) => {
  const n = i + 1, id = `long-${n}`;
  if (n === 1) return { id, type: 'heading', props: { level: 1 }, content: run1('Long document start'), children: [] };
  if (n === 200) return { id, type: 'paragraph', content: run1('Final block 200: the end of the long document.'), children: [] };
  if (n % 25 === 0) return { id, type: 'heading', props: { level: 2 }, content: run1(`Section ${n / 25}`), children: [] };
  const text = `Line ${n}: the water cycle moves heat from the oceans to the land, and this line keeps the long fixture readable.`;
  const kind = ['paragraph', 'paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem', 'paragraph', 'quote', 'paragraph', 'codeBlock'][n % 9];
  if (kind === 'codeBlock') return { id, type: 'codeBlock', props: { language: 'javascript' }, content: run1(`const line${n} = ${n}; // code block`), children: [] };
  if (kind === 'checkListItem') return { id, type: 'checkListItem', props: { checked: n % 2 === 0 }, content: run1(text), children: [] };
  return { id, type: kind, content: run1(text), children: [] };
});
const LONG_TEXT_CHARS = LONG.reduce((sum, b) => sum + b.content[0].text.length, 0);
const makeCanvas = async (title, state) => {
  const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) });
  if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
  const path = `/api/learn/boards/${canvas.name}/main`, now = await api(path);
  const saved = await api(path, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], blocks: [], groups: [], areas: [], ...state }, version: now.exists === false ? 0 : now.version ?? 0 }) });
  if (!saved.version) throw Error(`the seed board was not saved: ${JSON.stringify(saved).slice(0, 200)}`);
  return canvas.name;
};
const SIDE = { blocks: [card('c1', 'Light reactions', 'Light splits water in the thylakoids, releasing oxygen and making ATP and NADPH.'), card('c2', 'Calvin cycle', 'In the stroma, RuBisCO fixes CO2; ATP and NADPH reduce 3-PGA to G3P.')] };
const A = await makeCanvas(`Doc check A ${run}`, { ...SIDE, items: [note('n1', 'Ask about RuBisCO', -260, 60), words('t1', 'Side note beside the column', -300, 300)], shapes: [rect('r1', 'chloroplast', -320, 460, -80, 560)] });
const B = await makeCanvas(`Doc check B ${run}`, { ...SIDE, items: [note('n2', 'Long document neighbour', -260, 60)], doc: { v: 1, x: 1000, y: 40, w: 760, blocks: LONG } });
const keyOf = name => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}`;
const boardOf = async name => api(`/api/learn/boards/${name}/main`);
const textOf = blocks => (blocks || []).map(b => {
  const c = b.content, inline = list => (list || []).map(x => x.text ?? inline(x.content)).join('');
  const own = Array.isArray(c) ? inline(c) : c?.rows ? c.rows.map(r => r.cells.map(cell => inline(Array.isArray(cell) ? cell : cell.content)).join(' | ')).join('\n') : '';
  return `${own}\n${textOf(b.children)}`;
}).join('');

// ---------------------------------------------------------------- routes: capture, canned answers, held saves
const captured = [], refused = [], outside = [], errors = [];
let replies = 0, holdSaves = null; // holdSaves: a canvas name whose board PUTs wait until released
const held = [];
const frameOf = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/handoff|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  const path = url.pathname;
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (holdSaves && request.method() === 'PUT' && path === `/api/learn/boards/${holdSaves}/main`) return new Promise(resolve => held.push(() => resolve(route.fallback())));
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ route: 'ask', body, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frameOf('chunk', { text: `Canned reply ${reply}.` })
      + frameOf('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frameOf('done', { ok: true, threadId: body.thread_id || `cdoc-thread-${reply}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/tutor/plan') {
    const reply = ++replies;
    captured.push({ route: 'plan', body, reply });
    return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', constraints_add: [], actions: [{ type: 'respond_text', text: `Canned reply ${reply}.` }] } });
  }
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path)) return route.fulfill({ json: { ok: true } }); // the canned thread ids exist nowhere
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
  return route.fallback();
};
const release = () => { holdSaves = null; while (held.length) held.shift()(); };

const browser = await chromium.launch();
let page = null, context = null;
const results = [], facts = {};
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}${String(error?.stack || '').split('\n').filter(line => line.includes('canvas-doc-check.mjs')).slice(0, 3).map(line => ` @${line.trim().replace(/.*check\.mjs:/, '')}`).join('')}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
    // A failed step can leave a menu open or a mouse button down; the next check starts clean.
    if (page) { await page.mouse.up().catch(() => {}); for (let i = 0; i < 2; i++) await page.keyboard.press('Escape').catch(() => {}); }
    release();
  }
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
// A poll that throws (a transient 5xx page from the local D1) is not an answer yet.
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await Promise.resolve().then(test).catch(() => null); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const profile = async ({ view = null, canvas = null } = {}) => {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  if (view && canvas) await context.addInitScript(([key, value]) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, value); } catch { /* the default */ } }, [`${keyOf(canvas)}:view`, view]);
  await context.route('**/*', router);
  page = await context.newPage();
  page.setDefaultTimeout(10000); // a missing handle fails in 10 s, not 30
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
};
const openCanvas = async name => {
  await page.goto(`${BASE}/apps/${name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
};

// ---------------------------------------------------------------- the contract's handles
const paper = () => page.locator('[data-canvas-doc]');
const editorRoot = () => page.locator('[data-canvas-doc-editor]');
const editable = () => page.locator('[data-canvas-doc-editor] .bn-editor');
const status = () => page.locator('[data-doc-save-status]');
const pane = () => page.locator('[data-chat-pane]');
// The app's Menu panel has no role, so look inside the menubar it opens in.
const menubar = () => page.locator('[role="menubar"][aria-label="Canvas menu"]');
const viewMenu = () => menubar().getByRole('menuitem', { name: 'View', exact: true });
const viewChoice = () => menubar().locator('select').filter({ has: page.locator('option', { hasText: /^Editor$/ }) });
const setView = async value => {
  await viewMenu().click();
  await viewChoice().waitFor({ timeout: 5000 }).catch(() => { throw Error('the View menu has no choice with an "Editor" option'); });
  await viewChoice().selectOption({ label: value });
  await page.waitForTimeout(300);
  if (value === 'Editor') await waitFor(async () => (await paper().getAttribute('data-doc-state').catch(() => null)) === 'ready', 20000, `[data-canvas-doc] is not data-doc-state="ready" (${await paper().getAttribute('data-doc-state').catch(() => 'absent')})`);
  else await waitFor(async () => (await paper().count()) === 0, 5000, '[data-canvas-doc] is still in the DOM in Canvas view');
};
const viewValue = async () => { await viewMenu().click(); const value = await viewChoice().evaluate(s => s.selectedOptions[0]?.textContent); await page.keyboard.press('Escape'); await page.waitForTimeout(150); return value; };
const surfaceSpacePan = () => page.evaluate(() => document.querySelector('[data-canvas-surface]')?.hasAttribute('data-space-pan') || false);
const goToStart = async () => { await viewMenu().click(); await menubar().getByRole('menuitem', { name: 'Go to document start', exact: true }).click(); await page.waitForTimeout(700); };
// The camera: the world layer's translate/scale (AdaptiveCanvas worldRef), and the surface it sits in.
const camera = () => page.evaluate(() => {
  const surface = document.querySelector('[data-canvas-surface]'), world = [...surface.children].find(el => /scale\(/.test(el.style.transform));
  const m = world.style.transform.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/);
  const s = surface.getBoundingClientRect();
  return { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]), surface: { x: s.x, y: s.y, w: s.width, h: s.height } };
});
// The paper's world position, from its screen box and the camera: what must not change when the side panel moves.
const paperWorld = async () => { const b = await paper().boundingBox(), c = await camera(); return { x: (b.x - c.surface.x - c.x) / c.z, y: (b.y - c.surface.y - c.y) / c.z, w: b.width / c.z, h: b.height / c.z, z: c.z }; };
// The canvas room left for the paper: the surface minus whatever of the right panel overlaps it.
const available = async () => {
  const c = await camera(), p = await pane().isVisible().catch(() => false) ? await pane().boundingBox() : null;
  const right = p && p.x < c.surface.x + c.surface.w ? p.x : c.surface.x + c.surface.w;
  return { left: c.surface.x, right, top: c.surface.y, bottom: c.surface.y + c.surface.h };
};
const blockWith = text => page.locator('[data-canvas-doc] .bn-block-outer[data-id]').filter({ hasText: text }).last().getAttribute('data-id');
// The page colour: the paper's own background, or the first inner layer that paints most of it (the editor may paint it).
const paperBg = () => paper().evaluate(el => {
  const w = el.getBoundingClientRect().width;
  for (const node of [el, ...el.querySelectorAll('*')]) {
    const bg = getComputedStyle(node).backgroundColor, a = bg.match(/[\d.]+/g)?.map(Number) || [];
    if ((a[3] === undefined || a[3] > 0) && node.getBoundingClientRect().width >= w * 0.9) return bg;
  }
  return 'rgba(0, 0, 0, 0)';
});
const blockIds = () =>page.locator('[data-canvas-doc] .bn-block-outer[data-id]').evaluateAll(list => list.map(el => el.dataset.id));
const docTextNow = () => editable().innerText();
const inkOf = name => page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }, `${keyOf(name)}:ink`);
// Every canvas object that is not the document: ids and places. What keys inside the editor must never change.
const objectsOf = async name => { const ink = await inkOf(name) || {}; return JSON.stringify(['blocks', 'items', 'shapes', 'links', 'groups', 'areas', 'strokes'].map(k => (ink[k] || []).map(o => [o.id, o.x, o.y, o.x1, o.y1, o.dx, o.dy]))); };
const pressedTool = () => page.locator('button[aria-keyshortcuts][aria-pressed="true"]').evaluateAll(list => list.map(b => b.getAttribute('aria-keyshortcuts')).join(','));
const caretBox = () => page.evaluate(() => { const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0).getClientRects()[0] || s.getRangeAt(0).getBoundingClientRect(); return r ? { x: r.x, y: r.y, h: r.height, inEditor: !!s.anchorNode?.parentElement?.closest('[data-canvas-doc-editor]') } : null; });
const scrolls = () => page.evaluate(() => [document.scrollingElement.scrollTop, document.scrollingElement.scrollLeft, ...[...document.querySelectorAll('main, [data-canvas-surface], [data-canvas-doc], [data-canvas-doc] *')].filter(el => el.scrollTop || el.scrollLeft).map(el => `${el.tagName}.${el.className}`.slice(0, 60) + `:${el.scrollTop},${el.scrollLeft}`)]);
// A menu is usable: on screen, inside the canvas room (not under the panel), and on top at its middle (not behind the paper).
const assertUsable = async (selector, what) => {
  const menu = page.locator(selector).first();
  await menu.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error(`${what} (${selector}) did not open`); });
  await page.waitForTimeout(200);
  const b = await menu.boundingBox(), room = await available(), vp = page.viewportSize();
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1, `${what} is off screen (${JSON.stringify(b)})`);
  assert.ok(b.x >= room.left - 1 && b.x + b.width <= room.right + 1, `${what} runs under the side panel or off the canvas (${Math.round(b.x)}..${Math.round(b.x + b.width)} vs ${Math.round(room.left)}..${Math.round(room.right)})`);
  const top = await page.evaluate(([sel, x, y]) => !!document.elementFromPoint(x, y)?.closest(sel), [selector, b.x + Math.min(b.width / 2, 40), b.y + Math.min(b.height / 2, 14)]);
  assert.ok(top, `${what} is covered at its own top-left (something else is on top of it)`);
  return b;
};
const clickBlock = async (id, where = 'end') => {
  const el = page.locator(`[data-canvas-doc] .bn-block-outer[data-id="${id}"] .bn-inline-content`).first();
  const b = await el.boundingBox();
  await page.mouse.click(where === 'end' ? b.x + b.width - 2 : b.x + 2, b.y + b.height / 2);
  if (where === 'end') await page.keyboard.press('End');
  await page.waitForTimeout(150);
};
const barePoint = async () => page.evaluate(([right]) => {
  for (let y = 140; y < 820; y += 40) for (let x = 120; x < right; x += 40) {
    const el = document.elementFromPoint(x, y);
    if (el?.closest('[data-canvas-surface]') && !el.closest('[data-canvas-doc],[data-block-id],[data-item-id],[data-shape-id],[data-block],[role="toolbar"],[data-zoom],[data-zoom-stack],[data-chat-pane],button,a,iframe,[data-canvas-composer]')) return { x, y };
  }
  return null;
}, [(await available()).right - 30]);
const chatTab = async () => { const tab = page.locator('[data-panel-tab="chat"]'); if (await tab.count() && await tab.getAttribute('aria-selected') !== 'true') await tab.click(); };
const setMode = async mode => {
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
  await waitFor(() => captured.length > n, 20000, 'no model request was sent for the turn');
  const cap = captured[n];
  await pane().getByText(`Canned reply ${cap.reply}.`, { exact: true }).first().waitFor({ timeout: 15000 });
  return cap;
};
// The document's parts of a captured canvas_context: inventory entry, excerpt and coverage entry (id 'doc' or type 'document').
const docParts = body => {
  const pkg = body.canvas_context || body.context?.canvas_context || {};
  const isDoc = e => e && (e.id === 'doc' || e.type === 'document' || e.kind === 'document');
  return { pkg, inventory: (pkg.inventory?.items || []).filter(isDoc), excerpt: (pkg.excerpts || []).filter(isDoc), coverage: (pkg.coverage?.items || []).filter(isDoc) };
};
const aiCalls = () => captured.length + refused.length;

// ================================================================ Scenario 1: first opening (brief 3, 4, 5)
await profile();
await openCanvas(A);
let firstObjects = null, firstWorld = null;
await check('scenario 1: Canvas is the default - no [data-canvas-doc] in the DOM and the View choice reads Canvas', async () => {
  assert.equal(await paper().count(), 0, 'the paper is rendered in Canvas view');
  assert.equal(await viewValue(), 'Canvas');
  await shot('01-canvas-view-doc-hidden');
});
await check('scenario 1: Editor on first open shows the paper top edge and its first block, centred in the canvas room beside the open Chat', async () => {
  firstObjects = await objectsOf(A);
  await setView('Editor');
  await page.waitForTimeout(800);
  const b = await paper().boundingBox(), room = await available(), first = await page.locator('[data-canvas-doc] .bn-block-outer').first().boundingBox();
  facts.first_open = { paper: b, room };
  assert.ok(await pane().isVisible(), 'Chat is open');
  assert.ok(b.y >= room.top - 1 && b.y < room.top + (room.bottom - room.top) * 0.35, `the paper top edge is not near the top of the canvas (${Math.round(b.y - room.top)} px down)`);
  assert.ok(first && first.y >= room.top && first.y + first.height <= room.bottom, 'the first editable block is on screen');
  const centre = b.x + b.width / 2, roomCentre = (room.left + room.right) / 2;
  assert.ok(Math.abs(centre - roomCentre) <= 48, `the paper centre ${Math.round(centre)} is not the canvas room centre ${Math.round(roomCentre)}`);
  assert.ok(b.x >= room.left && b.x + b.width <= room.right, 'the paper fits beside the Chat panel, with canvas visible around it');
  assert.equal(await objectsOf(A), firstObjects, 'no canvas object moved to make room');
  await shot('02-editor-at-start');
});
await check('brief 4-5: about 760 px wide at 100%, 48-64 px padding, opaque white page, thin border or shadow, a page-tall minimum, one empty block and no title field', async () => {
  const w = await paperWorld();
  firstWorld = w;
  assert.ok(w.w >= 700 && w.w <= 800, `the paper is ${Math.round(w.w)} world px wide`);
  const look = { bg: await paperBg(), ...await paper().evaluate(el => { const s = getComputedStyle(el); return { shadow: s.boxShadow, border: s.borderTopWidth }; }) };
  const first = await page.locator('[data-canvas-doc] .bn-block-outer').first().boundingBox(), b = await paper().boundingBox();
  facts.look = { ...look, pad_left: (first.x - b.x) / w.z, pad_top: (first.y - b.y) / w.z, height: w.h };
  assert.equal(look.bg, 'rgb(255, 255, 255)', `the light page is ${look.bg}`);
  assert.ok(look.shadow !== 'none' || parseFloat(look.border) > 0, 'neither a border nor a shadow');
  assert.ok(parseFloat(look.border) <= 2, `the border is ${look.border}`);
  assert.ok(facts.look.pad_left >= 40 && facts.look.pad_left <= 72, `left padding ${Math.round(facts.look.pad_left)} px`);
  assert.ok(facts.look.pad_top >= 24 && facts.look.pad_top <= 80, `top padding ${Math.round(facts.look.pad_top)} px`);
  const c = await camera();
  assert.ok(w.h * w.z >= (c.surface.h - (b.y - c.surface.y)) * 0.6, `an empty page ${Math.round(w.h * w.z)} px tall is not near the visible writing area`);
  assert.deepEqual((await blockIds()).length, 1, 'one empty block');
  assert.equal(await paper().locator('input, textarea').count(), 0, 'no separate title field');
  assert.equal((await docTextNow()).trim(), '', 'no seeded or topic content');
});
await check('brief 4: the first placement is saved as the board document position { v: 1, x, y, w } and the camera does not chase it', async () => {
  const doc = await waitFor(async () => { const d = (await boardOf(A)).state?.doc; return d && Number.isFinite(d.x) && Number.isFinite(d.y) && d; }, 15000, 'GET board state.doc has no saved x/y');
  facts.first_doc = { v: doc.v, x: doc.x, y: doc.y, w: doc.w, blocks: doc.blocks?.length };
  assert.equal(doc.v, 1);
  assert.ok(Math.abs(doc.x - firstWorld.x) < 2 && Math.abs(doc.y - firstWorld.y) < 2, `the saved spot ${doc.x},${doc.y} is not where the paper is drawn ${Math.round(firstWorld.x)},${Math.round(firstWorld.y)}`);
  const before = await camera();
  await page.waitForTimeout(1200);
  assert.deepEqual(await camera(), before, 'the camera moved by itself after the first placement');
});

// ================================================================ Scenario 2: type and format with BlockNote's own menus; hide; move a card; reopen
let ids2 = null, text2 = null;
const MARK = `Photosynthesis ${run}`;
await check('scenario 2: the slash menu makes a heading, the formatting toolbar bolds a word, a bullet list follows; Saved only after the server holds it', async () => {
  const before = aiCalls();
  await clickBlock((await blockIds())[0]);
  await page.keyboard.type('/');
  await assertUsable('.bn-suggestion-menu', 'the slash menu');
  await page.keyboard.type('heading');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter'); // the highlighted Heading item; clicking it is its own check below
  await page.keyboard.type(MARK);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Light reactions make ATP');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft'); // selects "ATP"
  await assertUsable('.bn-formatting-toolbar', 'the formatting toolbar');
  await page.keyboard.press('Control+b'); // clicking Bold is its own check below
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/bullet');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Water is split');
  await shot('03-typed-and-formatted');
  await waitFor(async () => (await status().getAttribute('data-state')) === 'saved', 15000, `save status is ${await status().getAttribute('data-state').catch(() => 'absent')}, not saved`);
  assert.equal((await status().innerText()).trim(), 'Saved');
  const doc = (await boardOf(A)).state?.doc;
  const heading = doc?.blocks?.find(b => b.type === 'heading'), bold = doc?.blocks?.flatMap(b => (Array.isArray(b.content) ? b.content : [])).find(c => c.styles?.bold);
  assert.equal(textOf([heading]).trim(), MARK, 'the server document has the heading');
  assert.equal(bold?.text, 'ATP', 'the server document keeps the bold run as native styles');
  assert.ok(doc.blocks.some(b => b.type === 'bulletListItem' && textOf([b]).includes('Water is split')), 'the bullet list item');
  assert.ok(doc.blocks.every(b => typeof b.id === 'string' && b.id), 'every saved block keeps its id');
  ids2 = await blockIds(); text2 = await docTextNow();
  assert.deepEqual(doc.blocks.map(b => b.id), ids2.filter(id => doc.blocks.some(b => b.id === id)), 'saved ids are the editor ids');
  assert.equal(aiCalls(), before, 'typing and the editor menus sent an AI request');
});
await check('scenario 2 + brief 3: hide Editor (nothing left intercepting the canvas), move the sticky, reopen - both changes kept, no recentre, toggle not in undo', async () => {
  const paperBox = await paper().boundingBox();
  await setView('Canvas');
  const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return { surface: !!el?.closest('[data-canvas-surface]'), doc: !!el?.closest('[data-canvas-doc],[data-canvas-doc-editor],.bn-container') }; }, [paperBox.x + paperBox.width / 2, paperBox.y + 120]);
  assert.deepEqual(hit, { surface: true, doc: false }, 'something of the document is still under the pointer in Canvas view');
  assert.equal(await page.locator('.bn-container, .bn-editor, .bn-formatting-toolbar, .bn-side-menu').count(), 0, 'editor menus or text are still mounted in Canvas view');
  // Move the sticky away from where the paper was, so it never lands under it.
  const sticky = page.locator('[data-item-id="n1"]').first();
  // Framing the document can leave the sticky off screen: wheel the bare canvas until it is in view.
  const off = await sticky.boundingBox(), room = await available();
  if (off && off.x < room.left + 200) { await page.mouse.move(paperBox.x + paperBox.width / 2, paperBox.y + 120); await page.mouse.wheel(off.x - (room.left + 300), 0); await page.waitForTimeout(400); }
  const s = await sticky.boundingBox();
  assert.ok(s && s.x >= room.left && s.x + s.width <= room.right, 'the sticky n1 is on screen');
  const dx = s.x + s.width / 2 < paperBox.x + paperBox.width / 2 ? -140 : 140;
  const fromItems = (await inkOf(A)).items.find(i => i.id === 'n1');
  await page.mouse.move(s.x + 30, s.y + 12);
  await page.mouse.down();
  await page.mouse.move(s.x + 30 + dx / 2, s.y + 52, { steps: 6 });
  await page.mouse.move(s.x + 30 + dx, s.y + 92, { steps: 6 });
  await page.mouse.up();
  const moved = await waitFor(async () => { const n = (await inkOf(A)).items.find(i => i.id === 'n1'); return n && (n.x !== fromItems.x || n.y !== fromItems.y) && n; }, 5000, 'the sticky did not move');
  const camBefore = await camera();
  await setView('Editor');
  assert.deepEqual(await camera(), camBefore, 'reopening Editor moved the camera (a recentre)');
  assert.deepEqual(await blockIds(), ids2, 'the same blocks, the same ids');
  assert.equal(await docTextNow(), text2, 'the same text');
  assert.deepEqual((await inkOf(A)).items.find(i => i.id === 'n1'), moved, 'the moved sticky stays moved');
  await waitFor(async () => { const st = (await boardOf(A)).state; const n = st?.items?.find(i => i.id === 'n1'); return n?.x === moved.x && n?.y === moved.y && textOf(st.doc?.blocks).includes(MARK); }, 15000, 'the server board does not hold both the moved sticky and the document');
  // A canvas Undo walks back the sticky move, never the view toggle; the document stays.
  const at = await barePoint();
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Control+z');
  await waitFor(async () => { const n = (await inkOf(A)).items.find(i => i.id === 'n1'); return n.x === fromItems.x && n.y === fromItems.y; }, 5000, 'canvas Undo did not undo the sticky move');
  assert.equal(await paper().count(), 1, 'canvas Undo switched Editor off');
  assert.equal(await docTextNow(), text2, 'canvas Undo changed the document');
  await page.keyboard.press('Control+y');
  await waitFor(async () => (await inkOf(A)).items.find(i => i.id === 'n1').x === moved.x, 5000, 'canvas Redo did not redo the sticky move');
});
await check('brief 3 / decision B1: the view choice is remembered per user and canvas in localStorage `${canvasKey}:view`, and survives a reload', async () => {
  assert.equal(await page.evaluate(key => localStorage.getItem(key), `${keyOf(A)}:view`), 'editor');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), `${keyOf(B)}:view`), null, 'another canvas has no choice');
  await page.reload();
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await waitFor(async () => (await paper().getAttribute('data-doc-state').catch(() => null)) === 'ready', 20000, 'Editor did not come back after a reload');
  assert.deepEqual(await blockIds(), ids2, 'the same document after a reload');
});

// ================================================================ Scenario 7 + brief 9: keys inside the editor never reach the canvas
await check('scenario 7 + brief 9: Space, tool letters, Backspace on a selected card, Ctrl+A, Delete, Ctrl+Z/Y, paste and IME stay in the editor', async () => {
  const before = await objectsOf(A), tool = await pressedTool(), calls = aiCalls();
  // A selected card first: its selection must not be what Delete acts on once the editor has the caret.
  const sticky = page.locator('[data-item-id="n1"]').first();
  const s = await sticky.boundingBox();
  await page.mouse.click(s.x + 20, s.y + 10);
  await page.waitForTimeout(200);
  await clickBlock(await blockWith('Water is split'));
  await page.keyboard.press('Backspace');
  await page.keyboard.type(' vhrotnpe');
  assert.equal(await surfaceSpacePan(), false, 'Space started a canvas pan');
  assert.equal(await pressedTool(), tool, 'a single-letter key changed the canvas tool');
  assert.ok((await docTextNow()).includes('Water is spli vhrotnpe'), 'the keys went into the document');
  assert.equal(await objectsOf(A), before, 'Backspace with a card selected touched the canvas');
  // IME composition (CDP), committed into the same block.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
  await cdp.send('Input.insertText', { text: '日本' });
  assert.ok((await docTextNow()).includes('vhrotnpe日本'), 'IME composition did not commit into the document');
  // Select all, Delete, Undo, Redo, Undo: editor history only. (BlockNote may select the block first, then the document.)
  const full = await docTextNow(), marked = () => page.locator('[data-item-id].ring-2, [data-block-id].ring-select, [data-shape-id][data-selected]').count();
  const selectedBefore = await marked();
  await page.keyboard.press('Control+a');
  const sel = await page.evaluate(() => ({ text: getSelection().toString(), inEditor: !!getSelection().anchorNode?.parentElement?.closest('[data-canvas-doc-editor]') }));
  facts.select_all = { chars: sel.text.length, doc_chars: full.length };
  assert.ok(sel.inEditor && sel.text.trim().length > 3, 'Ctrl+A did not select text in the document');
  assert.equal(await marked(), selectedBefore, 'Ctrl+A selected canvas objects');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  const cleared = await docTextNow();
  assert.ok(cleared.length < full.length && !cleared.includes(sel.text.trim()), 'Delete did not remove the selected text');
  assert.equal(await objectsOf(A), before, 'Delete touched the canvas');
  await page.keyboard.press('Control+z');
  await waitFor(async () => (await docTextNow()) === full, 3000, 'Ctrl+Z did not restore the text (editor history)');
  await page.keyboard.press('Control+y');
  await waitFor(async () => (await docTextNow()) === cleared, 3000, 'Ctrl+Y did not redo the delete');
  await page.keyboard.press('Control+z');
  await waitFor(async () => (await docTextNow()) === full, 3000, 'the second Ctrl+Z did not restore the text');
  assert.equal(await objectsOf(A), before, 'Undo/Redo inside the editor touched the canvas');
  // Paste text: into the document, never a new canvas object.
  await page.evaluate(text => navigator.clipboard.writeText(text), `Pasted line ${run}`);
  await clickBlock((await blockIds()).at(-1));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+v');
  await waitFor(async () => (await docTextNow()).includes(`Pasted line ${run}`), 3000, 'Ctrl+V did not paste into the document');
  await page.keyboard.press('Control+c');
  assert.equal(await objectsOf(A), before, 'clipboard keys touched the canvas');
  assert.equal(aiCalls(), calls, 'editing sent an AI request');
});
await check('scenario 7: native block reorder (Shift+Ctrl+ArrowUp and the side-menu drag handle) moves blocks in the flow, never a canvas card', async () => {
  const before = await objectsOf(A), ids = await blockIds();
  await clickBlock(ids.at(-1));
  await page.keyboard.press('Shift+Control+ArrowUp');
  await page.waitForTimeout(200);
  const after = await blockIds();
  assert.equal(after.indexOf(ids.at(-1)), ids.length - 2, `the last block did not move up one place (${after.join(',')})`);
  // Drag the second block above the first by its side-menu handle.
  const second = page.locator(`[data-canvas-doc] .bn-block-outer[data-id="${after[1]}"]`).first(), top = await page.locator(`[data-canvas-doc] .bn-block-outer[data-id="${after[0]}"]`).first().boundingBox();
  await second.hover();
  const handle = page.locator('.bn-side-menu [data-test="dragHandle"]').first();
  await handle.waitFor({ state: 'visible', timeout: 4000 });
  await assertUsable('.bn-side-menu', 'the block side menu');
  const h = await handle.boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(top.x + 40, top.y + 6, { steps: 10 });
  await page.mouse.move(top.x + 40, top.y + 3, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const dragged = await blockIds();
  assert.equal(dragged[0], after[1], `the dragged block is not first (${dragged.slice(0, 3).join(',')})`);
  assert.equal(dragged.length, after.length, 'a block was lost or duplicated by the drag');
  assert.equal(await objectsOf(A), before, 'the block drag created or moved a canvas object');
  await page.keyboard.press('Control+z'); // the drag
  await page.keyboard.press('Control+z'); // the keyboard move
  await waitFor(async () => (await blockIds()).join() === ids.join(), 3000, 'Undo did not restore the block order');
});
await check('brief 9: Escape closes the slash menu first and keeps Editor and the text; Ctrl+K in the editor never opens Quick Edit', async () => {
  const text = await docTextNow(), calls = aiCalls();
  await clickBlock((await blockIds()).at(-1));
  await page.keyboard.type('/');
  await assertUsable('.bn-suggestion-menu', 'the slash menu');
  await page.keyboard.press('Escape');
  await waitFor(async () => (await page.locator('.bn-suggestion-menu').count()) === 0 || !(await page.locator('.bn-suggestion-menu').first().isVisible()), 2000, 'Escape did not close the slash menu');
  assert.equal(await paper().count(), 1, 'Escape switched Editor off');
  assert.ok((await docTextNow()).startsWith(text.trimEnd().slice(0, 40)), 'Escape deleted content');
  await page.keyboard.press('Backspace'); // the "/" Escape left behind
  await page.keyboard.press('Control+Shift+ArrowLeft');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-inline-ai]').count(), 0, 'Ctrl+K inside the editor opened Quick Edit');
  assert.equal(await page.locator('[data-inline-hint]').count(), 0, 'Ctrl+K inside the editor showed the Quick Edit hint');
  assert.equal(aiCalls(), calls, 'Ctrl+K sent an AI request');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  assert.equal(await paper().count(), 1, 'Escape after the link popover switched Editor off');
});
await check('brief 9: with the Hand tool a drag over the paper pans the camera; with Select a click puts the caret back', async () => {
  await page.locator('button[aria-keyshortcuts="H"]').first().click();
  const b = await paper().boundingBox(), c0 = await camera();
  await page.mouse.move(b.x + b.width / 2, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + 140, { steps: 8 });
  await page.mouse.up();
  const c1 = await camera();
  assert.ok(Math.abs(c1.x - c0.x - 60) < 4 && Math.abs(c1.y - c0.y - 60) < 4, `the Hand drag over the paper did not pan 60,60 (${Math.round(c1.x - c0.x)},${Math.round(c1.y - c0.y)})`);
  await page.locator('button[aria-keyshortcuts="V"]').first().click();
  await clickBlock((await blockIds())[0]);
  const caret = await caretBox();
  assert.ok(caret?.inEditor, 'the Select tool click did not put the caret in the document');
});
await check('brief 9: canvas Select all + Delete outside the editor never deletes the document; Undo brings the cards back', async () => {
  const before = await objectsOf(A), ids = await blockIds();
  const at = await barePoint();
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(400);
  assert.equal(await paper().count(), 1, 'the paper was deleted');
  assert.deepEqual(await blockIds(), ids, 'the document lost blocks');
  await page.keyboard.press('Control+z');
  await waitFor(async () => (await objectsOf(A)) === before, 5000, 'Undo did not bring the canvas objects back');
});

// ================================================================ Scenario 9: Chat open/resize/close and theme keep the editor
await check('scenario 9: closing, reopening and resizing Chat keeps the same editor (no remount), the same block ids and the stored world position', async () => {
  const ids = await blockIds(), world = await paperWorld(), stored = (await boardOf(A)).state.doc;
  await editable().evaluate(el => { el.dataset.cdocTag = 'kept'; });
  const toggle = page.locator('button[aria-label="Hide the right panel"], button[aria-label="Show the right panel"]').first();
  await toggle.click();
  await waitFor(async () => !(await pane().isVisible().catch(() => false)) || (await pane().boundingBox())?.width < 10, 4000, 'Chat did not close');
  await page.waitForTimeout(400);
  const closed = await paperWorld();
  await toggle.click();
  await pane().waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  const handle = page.locator('[role="separator"][aria-label="Resize Learn panel"]').first();
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 120, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const resized = await paperWorld();
  for (const [what, w] of [['closing Chat', closed], ['resizing Chat', resized]]) assert.ok(Math.abs(w.x - world.x) < 1 && Math.abs(w.y - world.y) < 1, `${what} moved the paper in the world (${Math.round(w.x - world.x)},${Math.round(w.y - world.y)})`);
  assert.equal(await editable().getAttribute('data-cdoc-tag'), 'kept', 'the editor was remounted');
  assert.deepEqual(await blockIds(), ids);
  await page.waitForTimeout(2500);
  const now = (await boardOf(A)).state.doc;
  assert.deepEqual([now.x, now.y], [stored.x, stored.y], 'opening or resizing a side panel changed the stored world position');
  await shot('06-chat-open-beside');
});
await check('scenario 9 + brief 4: dark theme gives an opaque dark page unlike the canvas, light gives white, without a remount', async () => {
  const theme = dark => page.evaluate(on => { localStorage.setItem('small.theme', on ? 'dark' : 'light'); document.documentElement.classList.toggle('dark', on); window.dispatchEvent(new CustomEvent('small:theme', { detail: on })); }, dark);
  const colours = async () => {
    const p = await paperBg();
    return page.evaluate(p => {
      const rgb = s => s.match(/[\d.]+/g).map(Number);
      let el = document.querySelector('[data-canvas-surface]'), bg = getComputedStyle(el).backgroundColor;
      while (el && rgb(bg)[3] === 0) { el = el.parentElement; bg = el ? getComputedStyle(el).backgroundColor : 'rgb(255,255,255)'; }
      return { paper: rgb(p), canvas: rgb(bg) };
    }, p);
  };
  await theme(true);
  await page.waitForTimeout(500);
  const dark = await colours();
  facts.dark = dark;
  assert.ok(dark.paper[3] === undefined || dark.paper[3] === 1, 'the dark page is not opaque');
  assert.ok(dark.paper.slice(0, 3).reduce((a, b) => a + b, 0) / 3 < 80, `the dark page is not dark (${dark.paper})`);
  assert.ok(dark.paper.slice(0, 3).some((v, i) => Math.abs(v - dark.canvas[i]) >= 6), `the dark page ${dark.paper} matches the canvas ${dark.canvas}`);
  await shot('07-dark');
  await theme(false);
  await page.waitForTimeout(500);
  assert.deepEqual((await colours()).paper.slice(0, 3), [255, 255, 255], 'the light page is not white');
  assert.equal(await editable().getAttribute('data-cdoc-tag'), 'kept', 'a theme change remounted the editor');
  await shot('08-light');
});

// ================================================================ Scenario 6: menus at 64% and 156% and near the edges
// The zoom buttons step by 1.25 around the middle (64% = 100% / 1.25^2, 156% = 100% * 1.25^2); then the first block is brought
// back to the upper part of the canvas room by wheeling over bare canvas (1:1 pan), never by Go to document start (it may zoom).
const zoomTo = async target => {
  await page.locator('button[title="Reset zoom"]').click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 6; i++) {
    const z = Math.round((await camera()).z * 100);
    if (z === target) break;
    await page.locator(`[data-zoom] button[title="${z > target ? 'Zoom out' : 'Zoom in'}"]`).first().click();
    await page.waitForTimeout(250);
  }
  const first = page.locator('[data-canvas-doc] .bn-block-outer').first();
  for (let i = 0; i < 10; i++) {
    const b = await first.boundingBox(), room = await available();
    const dx = b.x - (room.left + (room.right - room.left) * 0.3), dy = b.y - (room.top + 160);
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) break;
    const at = await barePoint();
    assert.ok(at, 'no bare canvas point to pan from');
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(Math.round(dx), Math.round(dy));
    await frames();
  }
  return Math.round((await camera()).z * 100);
};
for (const target of [64, 156]) {
  await check(`scenario 6: at ${target}% the slash menu, formatting toolbar and side menu are on screen, above the paper and clear of Chat; a wheel over the menu scrolls the menu, not the board`, async () => {
    const z = await zoomTo(target);
    facts[`zoom_${target}`] = z;
    assert.equal(z, target, `the zoom reads ${z}%`);
    const ids = await blockIds();
    const visible = await page.locator(`[data-canvas-doc] .bn-block-outer[data-id="${ids[0]}"]`).first().boundingBox(), room = await available();
    assert.ok(visible && visible.y > room.top && visible.y < room.bottom - 40, 'the first block could not be brought on screen at this zoom');
    await clickBlock(ids[0]);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const menu = await assertUsable('.bn-suggestion-menu', `the slash menu at ${target}%`);
    const cam = await camera(), list = page.locator('.bn-suggestion-menu').first();
    await page.mouse.move(menu.x + menu.width / 2, menu.y + menu.height / 2);
    const scrollable = await list.evaluate(el => el.scrollHeight > el.clientHeight + 2);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(250);
    assert.deepEqual(await camera(), cam, 'a wheel over the slash menu moved the board');
    if (scrollable) assert.ok(await list.evaluate(el => el.scrollTop > 0), 'the long slash menu did not scroll itself');
    await shot(`05-slash-menu-zoom-${target}`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('End');
    await page.keyboard.press('Control+Shift+ArrowLeft');
    await assertUsable('.bn-formatting-toolbar', `the formatting toolbar at ${target}%`);
    await page.keyboard.press('ArrowRight');
    await page.locator(`[data-canvas-doc] .bn-block-outer[data-id="${ids[0]}"]`).first().hover();
    await assertUsable('.bn-side-menu', `the side menu at ${target}%`);
  });
}
await check('scenario 6: near the bottom and right edges of the canvas room the slash menu still opens on screen and clear of Chat', async () => {
  await zoomTo(100);
  const ids = await blockIds(), room = await available();
  // Bottom edge: pan (wheel on the bare canvas) until the last block sits about 50 px above the bottom of the room.
  const target = page.locator(`[data-canvas-doc] .bn-block-outer[data-id="${ids.at(-1)}"]`).first();
  for (let i = 0; i < 8; i++) {
    const b = await target.boundingBox(), delta = b.y + b.height - (room.bottom - 50);
    if (Math.abs(delta) < 6) break;
    const at = await barePoint();
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, Math.round(delta));
    await frames();
  }
  await clickBlock(ids.at(-1));
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  await assertUsable('.bn-suggestion-menu', 'the slash menu near the bottom edge');
  await shot('05-slash-menu-bottom-edge');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  // Right edge: the paper's left text column about 120 px from the panel.
  const p = await paper().boundingBox(), shift = (room.right - 160) - (p.x + 70);
  const at = await barePoint();
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(-Math.round(shift), 0);
  await frames();
  await clickBlock(ids[0]);
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  await assertUsable('.bn-suggestion-menu', 'the slash menu near the Chat panel');
  await shot('05-slash-menu-right-edge');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
});

// ================================================================ Scenario 12 (part 1): a chat question carries the unsaved document text
await check('scenario 12: with a save still in flight, Chat carries the current unsaved document text as a document object with full coverage, in one request', async () => {
  const UNSAVED = `Unsaved marker ${run}`;
  holdSaves = A;
  await clickBlock((await blockIds()).at(-1));
  await page.keyboard.press('Enter');
  await page.keyboard.type(UNSAVED);
  await waitFor(async () => (await status().getAttribute('data-state')) === 'saving', 6000, `save status is ${await status().getAttribute('data-state')}, not saving, while the server has not answered`);
  assert.notEqual((await status().innerText()).trim(), 'Saved', 'Saved shown before the server acknowledged');
  const calls = aiCalls();
  await setMode('ask');
  const cap = await send('What does my document say about ATP?');
  const parts = docParts(cap.body);
  facts.chat_a = { route: cap.route, inventory: parts.inventory, coverage: parts.coverage, excerpt: parts.excerpt.map(e => ({ id: e.id, type: e.type, inclusion: e.inclusion, chars: String(e.text || '').length })), includes_unsaved: parts.pkg.includes_unsaved };
  assert.equal(aiCalls(), calls + 1, 'more than the one chat request');
  assert.equal(parts.inventory.length, 1, 'the inventory has no single document object');
  assert.ok(parts.excerpt.some(e => String(e.text || '').includes(UNSAVED) && String(e.text).includes(MARK)), 'the document excerpt lacks the unsaved text');
  assert.ok(parts.excerpt.every(e => e.inclusion === 'full'), 'a short document is not included in full');
  assert.ok(parts.coverage.length === 0 || parts.coverage.every(c => c.status === 'full'), `coverage calls the short document ${parts.coverage.map(c => c.status)}`);
  assert.equal(parts.pkg.includes_unsaved, true, 'includes_unsaved is not true');
  assert.ok((parts.pkg.inventory?.items || []).some(e => e.id === 'c1') && (parts.pkg.inventory?.items || []).some(e => e.id === 'n1'), 'the cards and the sticky left the inventory');
  release();
  await waitFor(async () => (await status().getAttribute('data-state')) === 'saved', 15000, 'the held save did not finish as Saved');
  assert.ok(textOf((await boardOf(A)).state.doc.blocks).includes(UNSAVED), 'the released save does not hold the marker');
});
release();

await check('scenario 2 + brief 6: a click on a slash menu item and on the formatting toolbar Bold button applies it and keeps the caret in the document', async () => {
  const where = async () => page.evaluate(() => { const a = document.activeElement; return a?.closest('[data-canvas-doc-editor]') ? 'the editor' : `${a?.tagName}${a?.getAttribute('aria-label') ? `[aria-label="${a.getAttribute('aria-label')}"]` : ''}`; });
  const tool = await pressedTool(), objects = await objectsOf(A);
  await clickBlock((await blockIds()).at(-1));
  await page.keyboard.press('Enter');
  await page.keyboard.type('/heading');
  await assertUsable('.bn-suggestion-menu', 'the slash menu');
  await page.locator('.bn-suggestion-menu-item').first().click();
  await page.waitForTimeout(200);
  const after = (await docTextNow()).trim(), focus = await where();
  assert.ok(!after.includes('/heading') && focus === 'the editor', `a click on the slash menu's first item did not apply it (the document still reads "/heading", focus is on ${focus})`);
  await page.keyboard.type('Click test ATP');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft');
  await assertUsable('.bn-formatting-toolbar', 'the formatting toolbar');
  await page.locator('.bn-formatting-toolbar [data-test="bold"]').click();
  await page.waitForTimeout(200);
  assert.equal(await where(), 'the editor', 'a click on Bold took the caret out of the document');
  assert.ok(await page.locator('[data-canvas-doc-editor] strong, [data-canvas-doc-editor] [data-style-type="bold"]').filter({ hasText: /^ATP$/ }).count() > 0, 'a click on Bold did not bold the selection');
  assert.equal(await pressedTool(), tool, 'typing after the clicks changed the canvas tool');
  assert.equal(await objectsOf(A), objects, 'the clicks or the typing changed a canvas object');
});
release();

// ================================================================ Scenario 5: a 200-block document - wheel to the end and back, keys reveal the caret
await profile({ view: 'editor', canvas: B });
await openCanvas(B);
await check('scenario 5: the 200-block document opens in Editor; Go to document start frames its top at a readable zoom, not the whole height', async () => {
  await waitFor(async () => (await paper().getAttribute('data-doc-state').catch(() => null)) === 'ready', 30000, 'the long document did not load');
  assert.equal((await blockIds()).length >= 200, true, `only ${(await blockIds()).length} blocks rendered`);
  await goToStart();
  const c = await camera(), b = await paper().boundingBox(), w = await paperWorld();
  facts.long = { z: c.z, height_world: Math.round(w.h), stored: { x: 1000, y: 40 }, drawn: { x: Math.round(w.x), y: Math.round(w.y) } };
  assert.ok(Math.abs(w.x - 1000) < 1 && Math.abs(w.y - 40) < 1, 'the stored position was not used');
  assert.ok(c.z >= 0.75, `Go to document start zoomed out to ${c.z}`);
  assert.ok(w.h > 3000, `the paper is ${Math.round(w.h)} world px tall: it does not grow with 200 blocks`);
  assert.ok(b.y >= c.surface.y - 1 && b.y < c.surface.y + c.surface.h * 0.3, 'the paper top is not near the top of the canvas');
  const scrollers = await page.locator('[data-canvas-doc], [data-canvas-doc] *').evaluateAll(list => list.filter(el => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4 && !el.closest('.bn-suggestion-menu,pre,table,.tableWrapper'); }).length);
  assert.equal(scrollers, 0, 'the document scrolls inside a fixed-height box');
  await shot('04a-long-start');
});
await check('scenario 5 + brief 6: the wheel over the paper reads to the end and back by moving the camera; the page and the paper never scroll', async () => {
  const s0 = await scrolls(), lastId = 'long-200', last = page.locator(`[data-canvas-doc] .bn-block-outer[data-id="${lastId}"]`).first();
  const room = await available();
  let steps = 0, ms = 0;
  const p = await paper().boundingBox();
  await page.mouse.move(p.x + p.width / 2, room.top + 300);
  for (; steps < 120; steps++) {
    const b = await last.boundingBox();
    if (b && b.y + b.height < room.bottom && b.y > room.top) break;
    const c = await camera(), t = Date.now();
    await page.mouse.wheel(0, 400);
    await frames();
    ms += Date.now() - t;
    assert.ok((await camera()).y < c.y, `wheel ${steps + 1} over the paper did not move the camera down the document`);
  }
  facts.wheel = { steps_down: steps, ms_per_wheel: Math.round(ms / Math.max(1, steps)) };
  assert.ok(steps < 120, 'the end of the document was never reached');
  assert.deepEqual(await scrolls(), s0, 'the page, the shell or the paper scrolled');
  await shot('04-scrolled-to-end');
  for (steps = 0; steps < 120; steps++) {
    const top = await paper().boundingBox();
    if (top.y >= room.top) break;
    await page.mouse.wheel(0, -400);
    await frames();
  }
  assert.ok(steps < 120, 'the start of the document was never reached again');
  assert.deepEqual(await scrolls(), s0, 'the page, the shell or the paper scrolled on the way back');
  // Outside the paper the wheel still pans the canvas.
  const at = await barePoint(), c = await camera();
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, 120);
  await frames();
  assert.ok((await camera()).y !== c.y, 'the wheel over the bare canvas no longer pans');
});
await check('scenario 5 + brief 6: Ctrl+End and Ctrl+Home reveal the caret; typing at the end keeps it visible; Saved', async () => {
  await goToStart();
  await clickBlock('long-1');
  const s0 = await scrolls();
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(500);
  const s1 = await scrolls();
  assert.deepEqual(s1, s0, `Ctrl+End scrolled the page, the shell or the paper instead of moving the camera: ${JSON.stringify(s0)} -> ${JSON.stringify(s1)}`);
  const room = await available();
  let caret = await caretBox();
  assert.ok(caret?.inEditor && caret.y >= room.top && caret.y + caret.h <= room.bottom, `Ctrl+End left the caret off screen (${JSON.stringify(caret)})`);
  const t = Date.now();
  await page.keyboard.press('Enter');
  const typed = 'Typed at the end of the long document and it stays in view.';
  await page.keyboard.type(typed);
  facts.long_typing = { chars: typed.length + 1, ms: Date.now() - t };
  for (let i = 0; i < 6; i++) await page.keyboard.press('Enter');
  caret = await caretBox();
  assert.ok(caret && caret.y + caret.h <= room.bottom && caret.y >= room.top, `typing near the bottom hid the caret (${JSON.stringify(caret)})`);
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(500);
  caret = await caretBox();
  assert.ok(caret?.inEditor && caret.y >= room.top && caret.y + caret.h <= room.bottom, `Ctrl+Home left the caret off screen (${JSON.stringify(caret)})`);
  const s = Date.now();
  await waitFor(async () => (await status().getAttribute('data-state')) === 'saved', 20000, 'the long document did not save');
  facts.long_save_ms = Date.now() - s;
  assert.ok(textOf((await boardOf(B)).state.doc.blocks).includes(typed), 'the server does not hold the typed line');
});

// ================================================================ Scenario 12 (part 2): a long document is partial, honestly, and leaves room for the rest
await check('scenario 12: on the 200-block canvas Chat carries the document as partial with passages, coverage says partial, and the cards keep their place', async () => {
  const calls = aiCalls();
  await setMode('ask');
  const cap = await send('Summarise my long document.');
  const parts = docParts(cap.body);
  const chars = parts.excerpt.reduce((sum, e) => sum + String(e.text || '').length + (e.passages || []).reduce((s, p) => s + String(p.text || p || '').length, 0), 0);
  facts.chat_b = { inventory: parts.inventory, coverage: parts.coverage, excerpt: parts.excerpt.map(e => ({ id: e.id, inclusion: e.inclusion, chars: String(e.text || '').length, passages: (e.passages || []).length, omitted: e.omitted_chars })), sent_chars: chars, document_chars: LONG_TEXT_CHARS, budget: parts.pkg.coverage?.budget_chars, reserved: parts.pkg.coverage?.reserved_chars };
  assert.equal(aiCalls(), calls + 1, 'more than the one chat request');
  assert.equal(parts.inventory.length, 1, 'the inventory has no single document object');
  assert.ok(parts.excerpt.length && parts.excerpt.every(e => e.inclusion === 'partial'), 'the long document is not marked partial');
  assert.ok(parts.coverage.length && parts.coverage.every(c => c.status === 'partial'), `coverage calls the long document ${parts.coverage.map(c => c.status).join(',') || 'nothing'}`);
  assert.ok(chars < LONG_TEXT_CHARS, 'the whole long document was sent');
  const inv = parts.pkg.inventory?.items || [];
  assert.ok(['c1', 'c2', 'n2'].every(id => inv.some(e => e.id === id)), 'the long document pushed the cards out of the inventory');
});

await check('no AI request other than the chat questions this check sent, no other model-capable request, no page error', async () => {
  assert.equal(captured.length, 2, `requests: ${captured.map(c => c.route).join(', ')}`);
  assert.deepEqual(refused, [], `refused routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await context.close();
await browser.close();
const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvases: { A, B }, passed: results.length - failed.length, failed: failed.length, checks: results, facts,
  model_capable_refused: refused, outside_hosts: [...new Set(outside)], page_errors: errors }, null, 2));
console.log(failed.length ? `FAIL ${failed.length} of ${results.length} checks (see ${OUT}/results.json)` : `PASS ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
