// Whole-canvas context payload check (owner brief 2026-10-14, agent-coordination/tasks/2026-10-14-whole-canvas-context-OWNER.md,
// contract v1.1; sub-lanes: tasks/canvas-context-SUBLANES.md). Against the LOCAL stack only: local D1 and fresh browser profiles.
// No model is ever called: the Learn ask (an SSE stream: chunk, answer_meta, done) and the Tutor planner (a plain JSON plan) are
// answered here with canned text, their request bodies are CAPTURED, and every other model-capable route is aborted and counted.
// The wiring under test: the package arrives as top-level `canvas_context` in the JSON body of /api/learn/ask and
// /api/learn/tutor/plan, and the "This canvas" chip ([data-canvas-context]) carries data-canvas-coverage = coverage.summary.
// Also covered: freehand ink (unavailable, never full), a repo-* project canvas (the repositoryAsk path, via the repository fixture
// nanogpt-repository-fixture.mjs: no clone, no D1 row) and a large package against that route's 64,000-character body gate.
// Prints `ok <label>` per check, counts and ids only (no cookies, no secrets, no request bodies); exits 1 on any failure.
// Evidence goes to OUT: request-<case>.json (canvas_context only), chip-*.png and results.json.
// Usage: BASE=http://127.0.0.1:8851 SMALL_CP=http://127.0.0.1:8853 VARS=<cp .dev.vars> OUT=<dir> node e2e/canvas-context-check.mjs
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { REPO, routeRepository } from './nanogpt-repository-fixture.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8851';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8853';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-context-check runs against the local stack only');
const OUT = process.env.OUT || 'C:/Users/cyudhist/Desktop/workspace/agent-coordination/tasks/canvas-context-handoff';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cc-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const catalog = await api('/api/apps');

// ---------------------------------------------------------------- the boards (seeded into localStorage, like the other e2e checks)
const SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><path d="M0 18 C 15 18, 25 2, 40 2" stroke="#2383e2" fill="none"/></svg>')}`;
const prose = (topic, n) => Array.from({ length: n }, (_, k) => `Worked example ${k + 1} of the ${topic} lecture adds one more ${topic} detail and its cost.`).join(' ');
const rect = (id, text, x1, y1, x2, y2, extra = {}) => ({ id, kind: 'rect', x1, y1, x2, y2, color: '#2383e2', width: 2, dash: 'solid', fill: null, opacity: 1, round: true, text, ...extra });
const arrow = (id, x1, y1, x2, y2) => ({ id, kind: 'arrow', x1, y1, x2, y2, color: '#37352f', width: 2, dash: 'solid', opacity: 1 });
const words = (id, text, x, y, w, extra = {}) => ({ id, kind: 'text', x, y, w, text, color: '#37352f', opacity: 1, level: 'body', ...extra });
const note = (id, text, x, y, extra = {}) => ({ id, kind: 'sticky', x, y, w: 160, text, color: '#f59e0b', opacity: 1, ...extra });
const card = (id, title, body) => ({ id, type: 'explanation', dx: 0, dy: 0, title, body });

// Two unrelated subjects with the same shape: an OLD relevant block first in the column, a heading, 18 long filler cards (more
// than the budget holds), an image, a newest card; a freeform diagram right of the column (three boxes, two DRAWN arrows with
// short text labels, one STORED link), two grouped stickies, a sticky to delete, a text box to edit, an equation and a chat card.
const SUBJECTS = {
  A: {
    title: 'Cell biology revision', // a stale title: the content is about something else
    old: ['Placing a new key', 'To add a key, compare it with the root. When it is smaller, step to the left child; when it is larger, step to the right child. Repeat until an empty slot appears, then attach the new key there as a leaf. The order the keys arrive in decides the final shape, so already-sorted input produces a long thin chain instead of a bushy tree.'],
    week: 'Week notes', last: ['Latest: amortised analysis', 'Spreading an occasional expensive step across many cheap ones gives a small average cost per operation.'],
    topics: ['hash tables', 'heaps', 'tries', 'queues', 'stacks', 'linked lists', 'sorting networks', 'graph traversal', 'shortest paths', 'dynamic programming', 'greedy methods', 'bloom filters', 'skip lists', 'b-trees', 'union-find', 'segment trees', 'suffix arrays', 'matrix chains'],
    diagram: ['root 8', 'left 3', 'right 10', 'smaller', 'larger', 'siblings'],
    notes: ['Remember that duplicate keys are usually rejected or stored in a counter, and that deleting a node with two children needs its in-order successor.', 'Ask the lecturer why rotations keep the tree balanced and whether the red-black rules differ from the AVL rules in practice.'],
    del: 'scratch: parking permit renewal due friday', edit: 'height grows with depth', eq: 'h \\approx \\log_2 n', group: 'Loose notes',
    image: ['Whiteboard photo', 'sketched tree', 'A photo of a sketched tree'], chat: ['Why does sorted input hurt?', 'Each key goes right, so the tree becomes a chain.'],
  },
  B: {
    title: 'Chess openings',
    old: ['Why the winds turn around', 'In summer the land heats faster than the sea, so warm air rises over the continent and moist ocean air is pulled in to replace it. This seasonal reversal of the prevailing wind carries heavy rain onto the coast and the plains for several months before it weakens again in autumn.'],
    week: 'Season notes', last: ['Latest: seasonal forecasting', 'Forecasters compare the sea surface temperature with the long run average to judge how wet the coming season will be.'],
    topics: ['Himalayan snowmelt', 'Arabian Sea currents', 'El Nino cycles', 'Tibetan plateau heating', 'rice paddy irrigation', 'cyclone tracks', 'dust aerosols', 'urban heat islands', 'ocean salinity', 'jet stream shifts', 'coastal erosion', 'mangrove belts', 'glacier lakes', 'drought indices', 'crop calendars', 'river deltas', 'tidal bores', 'trade winds'],
    diagram: ['warm land', 'rising air', 'moist inflow', 'pulls', 'brings', 'drives'],
    notes: ['Remember that the onset date shifts by a week or more between years, and that the retreat is gradual rather than abrupt, which makes averages misleading.', 'Check whether the rainfall totals in the table are for the whole season or only for the first month, because the sources do not say which.'],
    del: 'scratch: bus pass top up due monday', edit: 'rain peaks in july', eq: 'P = \\rho g h', group: 'Open questions',
    image: ['Satellite photo', 'cloud bands over a coast', 'A satellite photo of cloud bands'], chat: ['Why is the rain seasonal?', 'The wind direction reverses with the temperature difference.'],
  },
};

function boardOf(S) {
  const filler = (n, topic) => card(`f-${n}`, `Notes on ${topic}`, prose(topic, 20));
  const blocks = [
    card('old', S.old[0], S.old[1]),
    { id: 'wk', type: 'heading', dx: 0, dy: 0, level: 1, text: S.week },
    ...S.topics.slice(0, 9).map((topic, i) => filler(i + 1, topic)),
    { id: 'img', type: 'image', mode: 'url', dx: 0, dy: 0, title: S.image[0], src: SVG, alt: S.image[1], caption: S.image[2] },
    ...S.topics.slice(9).map((topic, i) => filler(i + 10, topic)),
    card('last', S.last[0], S.last[1]),
  ];
  const [root, left, right, labelA, labelB, linkLabel] = S.diagram;
  const shapes = [
    rect('n-root', root, 760, 120, 900, 176), rect('n-left', left, 640, 280, 780, 336), rect('n-right', right, 880, 280, 1020, 336),
    arrow('a-1', 810, 176, 710, 280), arrow('a-2', 850, 176, 950, 280),
  ];
  const items = [
    words('lbl-1', labelA, 735, 216, 50), words('lbl-2', labelB, 875, 216, 50),
    note('st-1', S.notes[0], 660, 420, { groupId: 'grp' }), note('st-2', S.notes[1], 840, 420, { groupId: 'grp' }),
    note('st-del', S.del, 660, 640), words('t-edit', S.edit, 660, 820, 300),
    { id: 'eq', kind: 'equation', x: 1080, y: 120, latex: S.eq, size: 28 },
  ];
  const links = [{ id: 'lk-1', from: 'n-left', fromSide: 'right', to: 'n-right', toSide: 'left', color: '#37352f', route: 'straight', head: true, label: linkLabel }];
  const exchanges = [{ id: 'ex', question: S.chat[0], answer: S.chat[1], status: 'done', dx: 0, dy: 0 }];
  // Freehand ink in two far-apart areas (two strokes each): the stroke shape AdaptiveCanvas stores in `strokes` (a pen stroke
  // is { tool, color, width, dash, opacity, points }, no id). Nothing describes it, so the package must call it unavailable.
  const pen = (...points) => ({ tool: 'pen', color: '#37352f', width: 2, dash: 'solid', opacity: 1, points });
  const strokes = [
    pen({ x: -500, y: 120 }, { x: -470, y: 160 }, { x: -440, y: 125 }, { x: -410, y: 170 }), pen({ x: -500, y: 190 }, { x: -450, y: 215 }, { x: -400, y: 195 }),
    pen({ x: 1250, y: 12400 }, { x: 1290, y: 12440 }, { x: 1330, y: 12410 }, { x: 1370, y: 12460 }), pen({ x: 1250, y: 12480 }, { x: 1310, y: 12500 }, { x: 1370, y: 12485 }),
  ];
  const ink = { strokes, shapes, items, links, groups: [{ id: 'grp', label: S.group }], areas: [], exchanges: [], blocks };
  // The full text length of every object that has text: what a partial excerpt's omitted_chars must add up to.
  const len = {};
  for (const block of blocks) len[block.id] = block.type === 'heading' ? block.text.length : block.title.length + 1 + (block.body || block.caption || '').length;
  for (const entry of [...shapes, ...items]) if (entry.text || entry.latex) len[entry.id] = (entry.text || entry.latex).length;
  len.ex = S.chat[0].length + 1 + S.chat[1].length;
  const ids = [...blocks.map(b => b.id), ...items.map(i => i.id), 'n-root', 'n-left', 'n-right', 'ex'];
  return { ink, chat: exchanges, ids, len, first: 'old', title: S.title };
}

// Budget pressure: one 20,000-character text box (the selection) beside a column with an OLDER relevant card that has a stored
// link to the next card.
function pressureBoard() {
  const big = 'Cooking log entry: simmer the lentils with onion and cumin for twenty minutes and stir often. '.repeat(250).slice(0, 20000);
  const blocks = [
    card('p-old', 'Turning light into sugar', 'In the light reactions chlorophyll captures sunlight and uses its energy to split water, releasing oxygen. The stored energy then drives the Calvin cycle, which builds sugar from carbon dioxide in the stroma.'),
    card('p-base', 'Inside the chloroplast', 'Thylakoid membranes hold the pigments, while the stroma is the fluid where sugar is assembled.'),
    ...['soil layers', 'root hairs', 'leaf veins', 'seed coats', 'pollen tubes', 'stem rings'].map((topic, i) => card(`p-${i + 3}`, `Notes on ${topic}`, `Short notes about ${topic} for the field trip, written down quickly and kept simple.`)),
  ];
  const items = [{ id: 'p-big', kind: 'text', x: 660, y: 100, w: 700, text: big, color: '#37352f', opacity: 1, level: 'body' }];
  const links = [{ id: 'p-lk', from: 'p-old', fromSide: 'bottom', to: 'p-base', toSide: 'top', color: '#37352f', route: 'straight', head: true, label: 'built from' }];
  const ink = { strokes: [], shapes: [], items, links, groups: [], areas: [], exchanges: [], blocks };
  return { ink, chat: [], ids: [...blocks.map(b => b.id), 'p-big'], len: { 'p-big': 20000 }, first: 'p-old', title: 'Garden planning' };
}

// Overflow: 420 small boxes plus 3 cards (423 objects, more than the 300 the inventory lists).
function overflowBoard() {
  const shapes = Array.from({ length: 420 }, (_, i) => rect(`o-${i + 1}`, `part ${i + 1} ${['alpha', 'beta', 'gamma', 'delta', 'omega'][i % 5]}`, 660 + (i % 30) * 130, 100 + Math.floor(i / 30) * 70, 750 + (i % 30) * 130, 140 + Math.floor(i / 30) * 70, { round: false }));
  const blocks = [1, 2, 3].map(n => card(`ob-${n}`, `Overview ${n}`, `A short overview card number ${n} that introduces a few of the parts drawn beside the column.`));
  return { ink: { strokes: [], shapes, items: [], links: [], groups: [], areas: [], exchanges: [], blocks }, chat: [], ids: [...blocks.map(b => b.id), ...shapes.map(s => s.id)], len: {}, first: 'ob-1', title: 'Parts list', total: 423 };
}

// Large: 330 boxes, 90 drawn arrows, 60 stored links and 14 long cards (494 objects): the inventory hits its 300 cap and the
// excerpts fill their share, so the package is as large as the builder makes one. Used on a repository canvas, whose ask
// route has the smallest body gate (64,000 characters).
function largeBoard() {
  const id = i => `node-${String(i + 1).padStart(4, '0')}-large-board-object`;
  const x = i => 660 + (i % 30) * 130, y = i => 100 + Math.floor(i / 30) * 70;
  const shapes = Array.from({ length: 330 }, (_, i) => rect(id(i), `object ${i + 1} ${'label words '.repeat(6)}`.slice(0, 80), x(i), y(i), x(i) + 90, y(i) + 40, { round: false }));
  // an arrow between each box and the next in its row, from the right edge to the next left edge
  shapes.push(...Array.from({ length: 90 }, (_, i) => arrow(`arrow-${i + 1}`, x(i) + 90, y(i) + 20, x(i) + 130, y(i) + 20)));
  const links = Array.from({ length: 60 }, (_, i) => ({ id: `link-${i + 1}`, from: id(i * 5), fromSide: 'bottom', to: id(i * 5 + 31), toSide: 'top', color: '#37352f', route: 'straight', head: true, label: `step ${i + 1}` }));
  const blocks = Array.from({ length: 14 }, (_, i) => card(`big-${i + 1}`, `Long notes ${i + 1}`, prose(`subject ${i + 1}`, 36)));
  const ink = { strokes: [], shapes, items: [], links, groups: [], areas: [], exchanges: [], blocks };
  return { ink, chat: [], ids: [...blocks.map(b => b.id), ...shapes.filter(s => s.kind !== 'arrow').map(s => s.id)], len: {}, first: 'big-1', title: 'Large board', total: 494 };
}

const boards = {};
for (const [key, make] of [['A', () => boardOf(SUBJECTS.A)], ['B', () => boardOf(SUBJECTS.B)], ['P', pressureBoard], ['O', overflowBoard]]) {
  const board = make();
  const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: board.title }) });
  const base = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}`;
  boards[key] = { ...board, name: canvas.name, inkKey: `${base}:ink`, seeds: { [`${base}:ink`]: board.ink, [`${base}:chat`]: board.chat } };
}
// A project (repo-*) canvas: the repository fixture (nanogpt-repository-fixture.mjs, as workspace-check and rabbit-hole-check use it)
// stubs the project's catalog row, snapshot and file reads in the browser, so no clone and no D1 row is needed. The page asks
// /api/learn/ask as on any canvas; the dev worker forwards a scope.app of repo-* to repositoryAsk (web/dev-worker.js).
for (const [key, make] of [['R', () => boardOf(SUBJECTS.A)], ['L', largeBoard]]) {
  const board = make(), base = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${REPO}`;
  boards[key] = { ...board, name: REPO, repo: true, inkKey: `${base}:ink`, seeds: { [`${base}:ink`]: board.ink, [`${base}:chat`]: board.chat } };
}

// ---------------------------------------------------------------- routes: capture and canned answers
const captured = [], refused = [], outside = [], errors = [];
let replies = 0, threads = 0, hooks = 0;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
// Model-capable routes other than the two answered here. The stack's own tripwire answers next-steps with fixtures (counted).
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/handoff|dive|explore))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  // fallback, not continue: a handler registered before this one (the repository fixture) sees the request next, then the stack.
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.fallback();
  const path = url.pathname;
  let body = {};
  const raw = request.postData() || '';
  try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = ++replies, messageId = `m-${reply}`;
    captured.push({ route: 'ask', path, body, raw, reply });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body:
      frame('chunk', { text: `Canned reply ${reply}.` })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: body.mode === 'tutor' ? 'clarify' : 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `cc-thread-${++threads}`, userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/tutor/plan') {
    const reply = ++replies;
    captured.push({ route: 'plan', path, body, raw, reply });
    return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', constraints_add: [], actions: [{ type: 'respond_text', text: `Canned reply ${reply}.` }] } });
  }
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path)) return route.fulfill({ json: { ok: true } }); // the canned thread ids exist nowhere
  if (path === '/api/learn/tutor/next-steps') { hooks += 1; return route.fallback(); }
  if (MODEL.test(path)) { refused.push(`${request.method()} ${path}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
let context = null, page = null;
const results = [], facts = {};
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 300);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};

async function openBoard(board) {
  await context?.close();
  context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, board.seeds);
  if (board.repo) await routeRepository(context); // registered first, so this file's router (below) runs first and falls back to it
  await context.route('**/*', router);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  await page.goto(`${BASE}/apps/${board.name}${board.repo ? '?tab=learn' : ''}`);
  await page.locator(`[data-block-id="${board.first}"]`).waitFor({ timeout: 60000 });
  await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
}

// ---------------------------------------------------------------- page helpers
const pane = () => page.locator('[data-chat-pane]');
const field = () => pane().locator('[data-chat-composer] textarea').first();
const chipOf = () => pane().locator('[data-canvas-context]').first();
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const currentMode = () => pane().locator('[data-chat-mode]').getAttribute('data-chat-mode');
const newChat = async () => { await pane().locator('[data-chat-new]').click(); await page.waitForTimeout(250); };
const setMode = async mode => {
  if (await currentMode() === mode) return;
  await pane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.locator(`[data-chat-mode-option="${mode}"]`).click();
  await page.waitForTimeout(200);
  assert.equal(await currentMode(), mode, `mode is ${mode}`);
};
// Pan (wheel, 1:1) until a thing sits in the open middle of the canvas, clear of the Chat pane; top: only its top-left corner must be.
const reveal = async (locator, top = false) => {
  const view = page.viewportSize(), right = (await pane().boundingBox()).x - 30;
  await locator.waitFor({ state: 'attached', timeout: 15000 });
  for (let i = 0; i < 12; i += 1) {
    const b = await locator.boundingBox();
    const w = top ? Math.min(b?.width ?? 0, 260) : b?.width ?? 0, h = top ? Math.min(b?.height ?? 0, 60) : b?.height ?? 0;
    if (b && b.x > 340 && b.x + w < right && b.y > 100 && b.y + h < view.height - 160) return b;
    const dx = b ? b.x + w / 2 - right / 2 : 0, dy = b ? b.y + h / 2 - view.height * 0.4 : 0;
    await page.mouse.move(right / 2, view.height * 0.4);
    await page.mouse.wheel(Math.round(dx), Math.round(dy));
    await frames();
  }
  return locator.boundingBox();
};
// A point of bare canvas: on the canvas surface, on no card, note, panel or control.
const blank = async () => {
  const right = (await pane().boundingBox()).x - 20;
  const point = await page.evaluate(limit => {
    for (let y = 120; y < 800; y += 40) for (let x = 360; x < limit; x += 40) {
      const element = document.elementFromPoint(x, y);
      if (element?.closest('[data-canvas-surface]') && !element.closest('[data-block-id],[data-item-id],[data-shape-id],[data-block],[data-view-selection],[data-group-box],[role="dialog"],[data-chat-pane],button,a,iframe')) return { x, y };
    }
    return null;
  }, right);
  assert.ok(point, 'a bare point of canvas');
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(250);
};
const clearSelection = async () => {
  if (await pane().locator('[data-canvas-target]').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
  if (await pane().locator('[data-canvas-target]').count()) await blank();
  assert.equal(await pane().locator('[data-canvas-target]').count(), 0, 'nothing selected');
};
// Select one card (a press on its top edge) or one note / text box (a press near its top-left corner).
const select = async (id, item = false) => {
  const b = await reveal(page.locator(item ? `[data-item-id="${id}"]` : `[data-block-id="${id}"]`).first(), true);
  await page.mouse.click(item ? b.x + 24 : b.x + Math.min(b.width, 400) / 2, item ? b.y + 24 : b.y + 8);
  await pane().locator(`[data-selected-card="${id}"]`).waitFor({ timeout: 5000 });
};
const waitFor = async (test, ms = 8000) => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error('timed out'); await page.waitForTimeout(100); } };

// One turn: a New chat (unless follow-up), the mode, the selection, the words, Send; returns the captured request and package.
async function turn(text, { mode = 'auto', pick = null, pickItem = false, fresh = true, before = null, viaForm = false } = {}) {
  if (fresh) { await newChat(); await setMode(mode); }
  await clearSelection();
  if (pick) await select(pick, pickItem);
  await field().fill(text);
  if (before) await before();
  const n = captured.length;
  if (viaForm) await pane().locator('form[data-chat-composer]').evaluate(form => form.requestSubmit());
  else await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  await waitFor(() => captured.length > n, 20000).catch(() => { throw Error('no model request was sent for the turn'); });
  const cap = captured[n];
  await pane().getByText(`Canned reply ${cap.reply}.`, { exact: true }).first().waitFor({ timeout: 15000 });
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').waitFor({ timeout: 10000 });
  assert.equal(captured.length, n + 1, 'one model request per turn');
  return { ...cap, size: cap.raw.length, bytes: Buffer.byteLength(cap.raw), pkg: cap.body.canvas_context };
}

// ---------------------------------------------------------------- the package contract
const TYPE = /^[a-z][a-z0-9_-]{0,39}$/;
const REGIONS = new Set(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right']);
const pair = (a, b) => [a, b].sort().join('|');
// Every server cap of contract v1.1 (version 1; items/excerpts/relations/coverage limits; labels + excerpts <= 16,000; JSON <= 64,000).
function validate(pkg) {
  assert.ok(pkg && typeof pkg === 'object', 'canvas_context is present in the body');
  assert.equal(pkg.version, 1, 'version 1');
  assert.ok(typeof pkg.built_at === 'string' && pkg.built_at.length >= 1 && pkg.built_at.length <= 40, 'built_at');
  assert.equal(pkg.includes_unsaved, true, 'includes_unsaved');
  assert.ok(pkg.title === null || (typeof pkg.title === 'string' && pkg.title.length <= 200), 'title is a weak hint: string or null');
  const { inventory: inv, excerpts, relations, coverage } = pkg;
  assert.ok(inv && Array.isArray(inv.items) && Array.isArray(excerpts) && relations && coverage, 'inventory, excerpts, relations, coverage');
  assert.ok(inv.items.length <= 300 && excerpts.length <= 200, 'at most 300 items and 200 excerpts');
  assert.ok(Object.keys(inv.counts).length <= 40 && Object.entries(inv.counts).every(([k, v]) => TYPE.test(k) && Number.isInteger(v) && v >= 0), 'counts');
  assert.equal(typeof inv.omitted_items, 'number', 'omitted_items');
  for (const item of inv.items) {
    assert.ok(typeof item.id === 'string' && item.id.length >= 1 && item.id.length <= 120 && TYPE.test(item.type), `item ${String(item.id).slice(0, 40)}: id and type`);
    assert.ok(typeof item.label === 'string' && item.label.length <= 80, `item ${item.id}: label <= 80`);
    assert.ok((item.kind === undefined || String(item.kind).length <= 40) && (item.group_id === undefined || item.group_id.length <= 120) && (item.region === undefined || REGIONS.has(item.region) || String(item.region).length <= 40), `item ${item.id}: kind, group_id, region`);
  }
  let excerptChars = 0;
  for (const e of excerpts) {
    assert.ok(typeof e.id === 'string' && TYPE.test(e.type) && typeof e.text === 'string' && e.text.length >= 1 && e.text.length <= 8000, `excerpt ${e.id}: id, type, text 1-8000`);
    assert.ok(['relevant', 'structural', 'recent'].includes(e.reason), `excerpt ${e.id}: reason`);
    assert.ok(['full', 'partial'].includes(e.inclusion) && Number.isInteger(e.omitted_chars) && e.omitted_chars >= 0, `excerpt ${e.id}: inclusion, omitted_chars`);
    if (e.inclusion === 'full') assert.ok(e.omitted_chars === 0 && !e.passages, `excerpt ${e.id}: full means nothing omitted and no passages`);
    else {
      assert.ok(e.omitted_chars > 0 && Array.isArray(e.passages) && e.passages.length >= 1, `excerpt ${e.id}: partial records what was omitted and its passages`);
      e.passages.forEach((p, i) => assert.ok(Number.isInteger(p.start) && Number.isInteger(p.end) && p.start >= 0 && p.end > p.start && (i === 0 || p.start >= e.passages[i - 1].end), `excerpt ${e.id}: passages ascending`));
    }
    excerptChars += e.text.length;
  }
  const labelChars = inv.items.reduce((sum, item) => sum + item.label.length, 0), used = labelChars + excerptChars;
  assert.ok(used <= 16000 && coverage.budget_chars <= 16000, `labels + excerpts <= 16,000 (${used})`);
  assert.ok(coverage.used_chars >= used && coverage.used_chars <= coverage.budget_chars, `used_chars ${coverage.used_chars} covers labels + excerpts ${used} within budget_chars ${coverage.budget_chars}`);
  assert.equal(typeof coverage.reserved_chars, 'number', 'reserved_chars');
  assert.ok(relations.explicit.length <= 600 && relations.inferred.length <= 600, 'at most 600 relations of each kind');
  relations.explicit.forEach(r => assert.ok(typeof r.from === 'string' && typeof r.to === 'string' && (r.label === undefined || r.label.length <= 80), 'explicit relation shape'));
  relations.inferred.forEach(r => assert.ok(typeof r.from === 'string' && typeof r.to === 'string' && ['contains', 'grouped', 'near', 'aligned', 'labels'].includes(r.kind) && typeof r.basis === 'string' && r.basis.length >= 1 && r.basis.length <= 120, 'inferred relation shape'));
  assert.ok(Array.isArray(coverage.items) && coverage.items.length <= 300, 'coverage.items <= 300');
  coverage.items.forEach(c => assert.ok(['listed', 'full', 'partial', 'media', 'omitted', 'unavailable'].includes(c.status), `coverage item ${c.id}: status`));
  for (const key of ['objects_total', 'listed', 'included_full', 'included_partial', 'media_inspected', 'unavailable_or_omitted']) assert.ok(Number.isInteger(coverage[key]) && coverage[key] >= 0, `coverage.${key}`);
  assert.equal(coverage.listed, inv.items.length, 'coverage.listed is the inventory length');
  assert.ok(typeof coverage.summary === 'string' && coverage.summary.length >= 1 && coverage.summary.length <= 200 && !/\bread\b/i.test(coverage.summary), 'summary: one line, <= 200, never the word read');
  assert.ok(JSON.stringify(pkg).length <= 64000, 'the package is <= 64,000 characters of JSON');
  // Never full for cut text: every partial excerpt is partial in coverage.items too, and counted.
  const status = new Map(coverage.items.map(c => [c.id, c.status]));
  for (const e of excerpts) if (status.has(e.id)) assert.equal(status.get(e.id), e.inclusion, `coverage.items status of ${e.id} matches its excerpt`);
  assert.equal(coverage.included_partial, excerpts.filter(e => e.inclusion === 'partial').length, 'included_partial counts the partial excerpts');
  assert.ok(coverage.included_full >= excerpts.filter(e => e.inclusion === 'full').length, 'included_full counts at least the full excerpts');
  return { used };
}
const idsOf = pkg => pkg.inventory.items.map(item => item.id);
const shapeOf = pkg => JSON.stringify([Object.keys(pkg).sort(), Object.keys(pkg.inventory).sort(), Object.keys(pkg.coverage).sort(), Object.keys(pkg.relations).sort(),
  [...new Set(pkg.inventory.items.flatMap(i => Object.keys(i)))].sort(), [...new Set(pkg.excerpts.flatMap(e => Object.keys(e)))].sort().filter(k => k !== 'passages')]);
// What two requests on the same board must share whatever their words: the inventory, the relations and the totals.
const sameBoard = pkg => JSON.stringify({
  items: pkg.inventory.items.map(i => [i.id, i.type, i.label, i.region ?? null, i.group_id ?? null]).sort(), counts: Object.entries(pkg.inventory.counts).sort(),
  explicit: pkg.relations.explicit.map(r => pair(r.from, r.to)).sort(), inferred: pkg.relations.inferred.map(r => `${pair(r.from, r.to)}|${r.kind}`).sort(),
  total: pkg.coverage.objects_total, listed: pkg.coverage.listed, omitted: pkg.inventory.omitted_items,
});
const DRAWN = [pair('n-root', 'n-left'), pair('n-root', 'n-right')], STORED = pair('n-left', 'n-right');

// Spread: every region (and the group) that holds an object whose text goes beyond its label keeps at least one excerpt, when
// the budget is not exhausted.
function assertSpread(pkg, len) {
  const region = new Map(pkg.inventory.items.map(i => [i.id, i.region]));
  const need = id => (len[id] || 0) > 80;
  const needed = new Set(pkg.inventory.items.filter(i => i.region && need(i.id)).map(i => i.region));
  const have = new Set(pkg.excerpts.map(e => region.get(e.id)).filter(Boolean));
  const missing = [...needed].filter(r => !have.has(r));
  const exhausted = pkg.coverage.used_chars >= pkg.coverage.budget_chars - 1500;
  if (!exhausted) assert.deepEqual(missing, [], `every region keeps a representative (${[...needed].join(',')}; missing ${missing.join(',')})`);
  else assert.ok(have.size >= Math.min(2, needed.size), 'at least two regions keep a representative when the budget is spent');
  const members = pkg.inventory.items.filter(i => i.group_id === 'grp' && need(i.id));
  if (members.length) assert.ok(members.some(m => pkg.excerpts.some(e => e.id === m.id)), 'the group keeps a representative');
  return { regions_needed: needed.size, regions_with_excerpt: have.size };
}
const excerptOf = (pkg, id) => pkg.excerpts.find(e => e.id === id);

// The chip: the same words as the package that was sent (data-canvas-coverage and the title carry coverage.summary).
async function assertChip(pkg) {
  const chip = chipOf();
  assert.equal((await chip.innerText()).trim(), 'This canvas', 'the chip keeps its text');
  await waitFor(async () => (await chip.getAttribute('data-canvas-coverage')) === pkg.coverage.summary, 6000)
    .catch(async () => { throw Error(`the chip shows "${String(await chip.getAttribute('data-canvas-coverage')).slice(0, 120)}" but the package says "${pkg.coverage.summary.slice(0, 120)}"`); });
  assert.ok((await chip.getAttribute('title') || '').includes(pkg.coverage.summary), 'the chip title carries the summary');
}
// Full-viewport evidence of the chip with its coverage description drawn beside it (a native tooltip is not captured by headless screenshots).
async function chipShot(name) {
  const chip = chipOf();
  await chip.hover();
  await page.waitForTimeout(500);
  const text = await chip.getAttribute('data-canvas-coverage');
  assert.ok(text, 'the chip has a coverage description to show');
  await page.evaluate(caption => {
    const r = document.querySelector('[data-chat-pane] [data-canvas-context]').getBoundingClientRect();
    const tip = document.createElement('div');
    tip.id = 'cc-tooltip-caption';
    tip.textContent = caption;
    Object.assign(tip.style, { position: 'fixed', left: `${Math.max(8, r.left)}px`, bottom: `${innerHeight - r.top + 6}px`, maxWidth: '380px', zIndex: 99999, background: '#fff', border: '1px solid #8a8a8a', borderRadius: '6px', padding: '4px 8px', font: '12px sans-serif', color: '#111', boxShadow: '0 2px 6px rgba(0,0,0,.25)' });
    document.body.append(tip);
  }, text);
  await pane().screenshot({ path: `${OUT}/${name}.png` });
  await page.evaluate(() => document.getElementById('cc-tooltip-caption')?.remove());
  return { description: text, title: await chip.getAttribute('title'), screenshot: `${name}.png`, note: 'tooltip text drawn by the check from data-canvas-coverage' };
}
const save = (name, cap, extra = {}) => writeFileSync(`${OUT}/request-${name}.json`, JSON.stringify({ route: cap.path, ...extra, canvas_context: cap.pkg }, null, 2));

// ================================================================ Board A
const A = boards.A, packs = {};
const ABOUT_OLD = 'Walk me through how a fresh key finds its slot and becomes a leaf.';
const WHOLE = 'Look across everything here and tell me what stands out.';
const SEL = 'f-16', X = 'f-14';
const NAME = { auto: 'Auto (Tutor plan)', ask: 'Ask', tutor: 'Tutor' };

await openBoard(A);

await check('board A: more than 6 blocks, an old relevant block first and far from the newest, a freeform diagram with drawn arrows and labels, a stored link, a group, an image', async () => {
  assert.ok(A.ink.blocks.length > 6 && A.ink.blocks[0].id === 'old' && A.ink.blocks.some(b => b.type === 'image'), 'blocks');
  assert.ok(A.ink.shapes.filter(s => s.kind === 'arrow').length === 2 && A.ink.items.filter(i => i.kind === 'text' && i.text.length <= 60).length >= 2 && A.ink.links.length === 1 && A.ink.groups.length === 1, 'diagram, link, group');
  for (const id of ['n-root', 'n-left', 'n-right', 'a-1', 'a-2']) await page.locator(`[data-shape-id="${id}"]`).waitFor({ state: 'attached', timeout: 10000 });
  for (const id of ['lbl-1', 'st-1', 't-edit']) await page.locator(`[data-item-id="${id}"]`).waitFor({ state: 'attached', timeout: 10000 });
  const oldBox = await page.locator('[data-block-id="old"]').boundingBox(), lastBox = await page.locator('[data-block-id="last"]').boundingBox();
  assert.ok(lastBox.y - oldBox.y > 4 * oldBox.height, 'the old block is far above the newest');
});

await check('the "This canvas" chip keeps its words and describes its coverage on hover, before any send', async () => {
  const chip = chipOf();
  assert.equal((await chip.innerText()).trim(), 'This canvas');
  await chip.hover();
  const text = await waitFor(() => chip.getAttribute('data-canvas-coverage'), 6000).catch(() => { throw Error('the chip has no data-canvas-coverage after a hover'); });
  assert.ok(/listed/i.test(text) && !/\bread\b/i.test(text) && text.length <= 200, `coverage description: ${text.slice(0, 80)}`);
  assert.ok(text.includes(String(A.ids.length)) || /\d+ objects/.test(text), 'it counts the objects');
});

// Auto (Tutor plan), Ask and Tutor, each with no selection and with a selection.
for (const mode of ['auto', 'ask', 'tutor']) {
  for (const selected of [false, true]) {
    const key = `${mode}-${selected ? 'selection' : 'no-selection'}`;
    await check(`${NAME[mode]}, ${selected ? `with ${SEL} selected and a whole-board request` : 'no selection, a request about the old block'}: the package is complete, valid and the chip agrees`, async () => {
      const before = { ask: captured.filter(c => c.route === 'ask').length, plan: captured.filter(c => c.route === 'plan').length };
      const cap = await turn(selected ? WHOLE : ABOUT_OLD, { mode, pick: selected ? SEL : null });
      packs[key] = cap;
      const pkg = cap.pkg, body = cap.body;
      // The route: Auto goes to the Tutor planner (beside its context), Ask and Tutor to /api/learn/ask with their mode.
      if (mode === 'auto') {
        assert.equal(cap.route, 'plan', 'Auto posts to /api/learn/tutor/plan');
        assert.ok(body.context && typeof body.context === 'object', 'the plan keeps its context');
        assert.ok(!body.context.canvas_context?.cards, 'the six-block cards slice is gone from the plan context');
      } else {
        assert.equal(cap.route, 'ask', `${mode} posts to /api/learn/ask`);
        assert.equal(body.mode, mode, 'the ask carries its mode');
      }
      assert.equal(captured.filter(c => c.route === 'ask').length + captured.filter(c => c.route === 'plan').length, before.ask + before.plan + 1, 'one model request');
      validate(pkg);
      // The inventory lists every seeded object; the selected card is excerpted; the old block is excerpted for a request about it.
      const listed = new Set(idsOf(pkg)), missing = A.ids.filter(id => !listed.has(id));
      assert.deepEqual(missing, [], `inventory lists every seeded object (missing ${missing.join(',')})`);
      assert.ok(pkg.coverage.objects_total >= A.ids.length, 'objects_total covers the board');
      if (selected) assert.ok(excerptOf(pkg, SEL), `the selected card ${SEL} is excerpted`);
      else {
        const old = excerptOf(pkg, 'old');
        assert.ok(old, 'the OLD relevant block (first in the column, far from the newest) is excerpted');
        facts.older_relevant = { ...(facts.older_relevant || {}), [mode]: { id: 'old', inclusion: old.inclusion, reason: old.reason, omitted_chars: old.omitted_chars, newest_six_would_have_missed_it: true } };
      }
      // Relations: drawn arrows only inferred (near), the stored link only explicit.
      const explicit = pkg.relations.explicit.map(r => pair(r.from, r.to));
      assert.deepEqual(explicit.sort(), [STORED], 'explicit holds the stored link and nothing else');
      assert.equal(pkg.relations.explicit[0].label, A.ink.links[0].label, 'the stored link keeps its label');
      for (const drawn of DRAWN) {
        const found = pkg.relations.inferred.find(r => pair(r.from, r.to) === drawn);
        assert.ok(found && found.kind === 'near' && /arrow|drawn/i.test(found.basis), `drawn arrow ${drawn} is inferred (near)`);
      }
      // The image was not inspected: unavailable, and no media counted.
      const image = pkg.coverage.items.find(c => c.id === 'img');
      assert.ok(image && image.status === 'unavailable', 'the image is unavailable (not inspected)');
      assert.equal(pkg.coverage.media_inspected, 0, 'no media inspected');
      assert.ok(/image/i.test(pkg.coverage.summary), 'the summary says an image was not inspected');
      await assertChip(pkg);
      save(key, cap, { mode, selection: selected ? SEL : null, message: selected ? WHOLE : ABOUT_OLD });
    });
  }
}

await check('Auto, Ask and Tutor carry the same inventory, relations and totals for the same request', async () => {
  const shapes = ['auto', 'ask', 'tutor'].map(mode => sameBoard(packs[`${mode}-no-selection`].pkg));
  assert.ok(shapes[0] === shapes[1] && shapes[1] === shapes[2], 'the three packages share one inventory, one set of relations and one total');
  const withSel = ['auto', 'ask', 'tutor'].map(mode => sameBoard(packs[`${mode}-selection`].pkg));
  assert.ok(withSel.every(s => s === shapes[0]), 'a selection removes nothing from the inventory or the relations, in every mode');
});

await check('inventory types follow the contract (card, heading, text, sticky, equation, shape, image, chat, group)', async () => {
  const pkg = packs['ask-no-selection'].pkg, type = id => pkg.inventory.items.find(i => i.id === id)?.type;
  const expected = { old: 'card', wk: 'heading', img: 'image', 'st-1': 'sticky', 't-edit': 'text', eq: 'equation', 'n-root': 'shape', ex: 'chat' };
  for (const [id, want] of Object.entries(expected)) assert.equal(type(id), want, `${id} is a ${want}`);
  assert.equal(pkg.inventory.items.find(i => i.id === 'old').kind, 'explanation', 'a card keeps its block type as kind');
  assert.ok(pkg.inventory.items.filter(i => i.group_id === 'grp').map(i => i.id).sort().join() === 'st-1,st-2', 'the group members carry group_id');
  assert.ok(pkg.inventory.items.some(i => i.type === 'group') || pkg.inventory.counts.group >= 1, 'the group is in the inventory');
});

await check('freehand ink in two areas: one ink entry per inked area, each unavailable (never full), and the summary says the ink is undescribed', async () => {
  assert.equal(A.ink.strokes.length, 4, 'four strokes seeded in two areas');
  for (const key of ['auto-no-selection', 'ask-no-selection', 'tutor-selection']) {
    const pkg = packs[key].pkg, inks = pkg.inventory.items.filter(i => i.type === 'ink');
    assert.equal(inks.length, 2, `${key}: one ink entry per inked area (found ${inks.length})`);
    assert.equal(pkg.inventory.counts.ink, 2, `${key}: counts.ink`);
    for (const ink of inks) {
      const status = pkg.coverage.items.find(c => c.id === ink.id)?.status;
      assert.equal(status, 'unavailable', `${key}: ink ${ink.id} is unavailable, not ${status}`);
      assert.ok(!pkg.excerpts.some(e => e.id === ink.id), `${key}: no excerpt claims to describe ink ${ink.id}`);
    }
    assert.ok(/ink/i.test(pkg.coverage.summary), `${key}: the summary mentions the undescribed ink`);
    assert.ok(pkg.coverage.unavailable_or_omitted >= 3, `${key}: two inks and the image are counted as unavailable`);
  }
  const pkg = packs['ask-no-selection'].pkg;
  facts.ink = { areas: 2, entries: pkg.inventory.items.filter(i => i.type === 'ink').map(i => ({ id: i.id, region: i.region ?? null, status: pkg.coverage.items.find(c => c.id === i.id)?.status })), summary: pkg.coverage.summary };
});

await check('a selection plus a whole-board request: the inventory still covers the whole board, and other regions and the group keep representatives', async () => {
  const pkg = packs['ask-selection'].pkg;
  assert.equal(sameBoard(pkg), sameBoard(packs['ask-no-selection'].pkg), 'the same whole-board inventory as without a selection');
  const spread = assertSpread(pkg, A.len);
  const region = new Map(pkg.inventory.items.map(i => [i.id, i.region]));
  const others = new Set(pkg.excerpts.filter(e => e.id !== SEL).map(e => region.get(e.id)).filter(r => r && r !== region.get(SEL)));
  assert.ok(others.size >= 1, 'excerpts reach regions other than the selected card\'s');
  facts.selection_plus_whole_board = { selected: SEL, listed: pkg.coverage.listed, objects_total: pkg.coverage.objects_total, ...spread, other_regions_with_excerpts: others.size, used_chars: pkg.coverage.used_chars };
});

await check('the chip for the small board shows its coverage description (screenshot)', async () => {
  facts.chips = { ...(facts.chips || {}), small_board: await chipShot('chip-small-board') };
  assert.ok(/listed/.test(facts.chips.small_board.description) && !/\b\d+ of \d+ objects listed\b/.test(facts.chips.small_board.description), 'every object listed, no overflow wording');
});

// Unseen paraphrases of review / completeness / what-next / contradiction intents, and an unrelated request.
const PARAPHRASES = {
  A: [['auto', 'Give these notes a once-over and say how solid they are.'], ['ask', 'Is anything important absent from what I have drawn and written?'], ['tutor', 'Where should my studying head after this?'], ['auto', 'Do any of these pieces disagree with each other?'], ['ask', 'Suggest a lentil soup recipe for six people.']],
  B: [['auto', 'Skim my board and let me know whether it holds together.'], ['ask', 'Have I left out anything this topic needs?'], ['tutor', 'What would be a sensible follow-up topic to chase?'], ['auto', 'Does any card here clash with another one?'], ['ask', 'Suggest a lentil soup recipe for six people.']],
};
const paraphrased = { A: [], B: [] };
for (const [index, [mode, text]] of PARAPHRASES.A.entries()) {
  await check(`board A, unseen request ${index + 1} via ${NAME[mode]} ("${text.slice(0, 40)}"): a package with the whole inventory and the spread`, async () => {
    const cap = await turn(text, { mode });
    paraphrased.A.push(cap);
    validate(cap.pkg);
    assert.deepEqual(A.ids.filter(id => !idsOf(cap.pkg).includes(id)), [], 'every seeded object is listed');
    assertSpread(cap.pkg, A.len);
    await assertChip(cap.pkg);
  });
}
await check('board A: every request, whatever its words or mode, got the same inventory, relations and totals', async () => {
  assert.equal(paraphrased.A.length, PARAPHRASES.A.length, 'every request produced a package');
  const baseline = sameBoard(packs['ask-no-selection'].pkg);
  paraphrased.A.forEach((cap, i) => assert.equal(sameBoard(cap.pkg), baseline, `request ${i + 1} shares the baseline inventory`));
});

// A follow-up: the ids cited in turn 1 are still excerpted in turn 2.
await check('follow-up: the card selected in turn 1 is still excerpted in turn 2 with no selection, and not without that history', async () => {
  const T2 = 'And how does that connect to the rest of it?';
  const control = await turn(T2, { mode: 'ask' });
  const one = await turn('Summarise this card for me.', { mode: 'ask', pick: X });
  assert.ok(excerptOf(one.pkg, X), `turn 1 excerpts the selected ${X}`);
  const two = await turn(T2, { fresh: false });
  validate(two.pkg);
  assert.ok(two.body.thread_id, 'turn 2 is a follow-up in the same thread');
  assert.ok(excerptOf(two.pkg, X), `turn 2 still excerpts ${X}, cited in turn 1`);
  assert.equal(excerptOf(control.pkg, X), undefined, `control: the same words without that history do not excerpt ${X}, so the effect is the history's`);
  assert.equal(sameBoard(two.pkg), sameBoard(control.pkg), 'the inventory is the same');
  facts.follow_up = { cited: X, turn1_inclusion: excerptOf(one.pkg, X).inclusion, turn2_inclusion: excerptOf(two.pkg, X).inclusion, control_excerpted: false };
  save('ask-follow-up', two, { mode: 'ask', selection: null, message: T2 });
});

// An unsaved edit (typed into a text box, no blur) appears in the next package.
await check('an unsaved edit (typed in an open text box, not blurred) is in the next package', async () => {
  const marker = 'zebra-quartz-77';
  const cap = await turn(WHOLE, {
    mode: 'ask', viaForm: true,
    before: async () => {
      const words = await reveal(page.locator('[data-item-id="t-edit"] [aria-label="Text"]'));
      await page.mouse.dblclick(words.x + 4, words.y + words.height / 2);
      await page.locator('[data-item-id="t-edit"] [data-rich-editor]').waitFor({ timeout: 8000 });
      await page.keyboard.press('End');
      await page.keyboard.type(` ${marker}`);
      const saved = await page.evaluate(key => localStorage.getItem(key) || '', A.inkKey);
      assert.ok(!saved.includes(marker), 'the words were not saved when Send was pressed');
    },
  });
  const pkg = cap.pkg;
  validate(pkg);
  assert.equal(packs['ask-no-selection'].pkg && JSON.stringify(packs['ask-no-selection'].pkg).includes(marker), false, 'the earlier package did not have it');
  assert.ok(JSON.stringify(pkg).includes(marker), 'the unsaved words are in the package');
  const label = pkg.inventory.items.find(i => i.id === 't-edit')?.label || '', ex = excerptOf(pkg, 't-edit');
  facts.unsaved_edit = { id: 't-edit', in: label.includes(marker) ? 'label' : ex?.text.includes(marker) ? 'excerpt' : 'elsewhere', saved_when_sent: false, includes_unsaved: pkg.includes_unsaved };
  await page.keyboard.press('Escape');
  await page.locator('[data-item-id="t-edit"] [data-rich-editor]').waitFor({ state: 'detached', timeout: 8000 });
  save('ask-unsaved-edit', cap, { mode: 'ask', selection: 't-edit', message: WHOLE });
});

// A deleted object is absent from the next package.
await check('a deleted object is absent from the next package, and the total drops by one', async () => {
  const before = packs['ask-no-selection'].pkg;
  assert.ok(idsOf(before).includes('st-del'), 'the sticky was listed before');
  const sticky = await reveal(page.locator('[data-item-id="st-del"]'), true);
  await page.mouse.click(sticky.x + 24, sticky.y + 24);
  await page.waitForTimeout(250);
  await page.keyboard.press('Delete');
  await page.locator('[data-item-id="st-del"]').waitFor({ state: 'detached', timeout: 8000 });
  const cap = await turn(WHOLE, { mode: 'ask' });
  const pkg = cap.pkg, text = JSON.stringify(pkg);
  validate(pkg);
  assert.ok(!idsOf(pkg).includes('st-del') && !pkg.excerpts.some(e => e.id === 'st-del') && !pkg.coverage.items.some(c => c.id === 'st-del'), 'st-del is nowhere in the package');
  assert.ok(!text.includes('parking permit'), 'its words are gone too');
  assert.equal(pkg.coverage.objects_total, before.coverage.objects_total - 1, 'objects_total dropped by exactly one');
  assert.deepEqual(A.ids.filter(id => id !== 'st-del' && !idsOf(pkg).includes(id)), [], 'everything else is still listed');
  facts.deleted_object = { id: 'st-del', total_before: before.coverage.objects_total, total_after: pkg.coverage.objects_total, absent_from_inventory: true, absent_from_excerpts: true, absent_from_coverage_items: true, words_absent: true };
});

// ================================================================ Board B: a second, unrelated subject
await openBoard(boards.B);
for (const [index, [mode, text]] of PARAPHRASES.B.entries()) {
  await check(`board B, unseen request ${index + 1} via ${NAME[mode]} ("${text.slice(0, 40)}"): a package with the whole inventory and the spread`, async () => {
    const cap = await turn(text, { mode });
    paraphrased.B.push(cap);
    validate(cap.pkg);
    assert.deepEqual(boards.B.ids.filter(id => !idsOf(cap.pkg).includes(id)), [], 'every seeded object is listed');
    assertSpread(cap.pkg, boards.B.len);
    await assertChip(cap.pkg);
  });
}
await check('board B: same inventory and relations for every request; the package has the same shape as board A\'s', async () => {
  assert.equal(paraphrased.B.length, PARAPHRASES.B.length, 'every request produced a package');
  const baseline = sameBoard(paraphrased.B[0].pkg);
  paraphrased.B.forEach((cap, i) => assert.equal(sameBoard(cap.pkg), baseline, `request ${i + 1} shares the inventory`));
  assert.equal(shapeOf(paraphrased.B[0].pkg), shapeOf(packs['ask-no-selection'].pkg), 'the same package shape on an unrelated subject');
  const spread = paraphrased.B[0].pkg.relations;
  assert.ok(spread.explicit.length === 1 && spread.inferred.some(r => pair(r.from, r.to) === DRAWN[0] && r.kind === 'near'), 'relations split the same way on board B');
  facts.paraphrases = { A: paraphrased.A.length, B: paraphrased.B.length, same_inventory: true };
});

// ================================================================ Board P: budget pressure
await openBoard(boards.P);
await check('budget pressure: a 20,000-character selection plus an older relevant card with a stored link; the whole-board request keeps the older card listed, partly included and linked', async () => {
  const request = 'Across this whole board, how does sunlight end up as sugar, and what is still missing?';
  const cap = await turn(request, { mode: 'ask', pick: 'p-big', pickItem: true });
  const pkg = cap.pkg;
  validate(pkg);
  assert.deepEqual(boards.P.ids.filter(id => !idsOf(pkg).includes(id)), [], 'the whole board is listed');
  const big = excerptOf(pkg, 'p-big'), old = excerptOf(pkg, 'p-old');
  assert.ok(big && big.inclusion === 'partial' && big.omitted_chars > 0, 'the huge selection is included partially, with what was omitted recorded');
  assert.equal(big.omitted_chars + big.passages.reduce((sum, p) => sum + (p.end - p.start), 0), 20000, 'omitted_chars + passages add up to the whole text');
  assert.ok(big.passages.at(-1).end <= 20000, 'passages stay inside the text');
  assert.ok(big.text.length <= pkg.coverage.budget_chars - pkg.coverage.reserved_chars, 'the selection stays inside the share left after the reserve');
  assert.ok(old && ['full', 'partial'].includes(old.inclusion), 'the older relevant card is included at least partially');
  assert.ok(pkg.relations.explicit.some(r => pair(r.from, r.to) === pair('p-old', 'p-base') && r.label === 'built from'), 'its explicit connection is kept');
  assert.equal(pkg.coverage.items.find(c => c.id === 'p-big')?.status, 'partial', 'coverage.items says partial for the selection');
  assert.ok(pkg.coverage.included_partial >= 1, 'included_partial counts it');
  assert.ok(!/\b(whole|entire) canvas\b/i.test(pkg.coverage.summary), 'the summary never claims the whole canvas');
  await assertChip(pkg);
  facts.budget_pressure = {
    selected: { id: 'p-big', chars: 20000, inclusion: big.inclusion, omitted_chars: big.omitted_chars, passages: big.passages.length, excerpt_chars: big.text.length },
    older_relevant: { id: 'p-old', listed: true, inclusion: old.inclusion, omitted_chars: old.omitted_chars, explicit_connection_kept: true },
    used_chars: pkg.coverage.used_chars, reserved_chars: pkg.coverage.reserved_chars, budget_chars: pkg.coverage.budget_chars, json_chars: JSON.stringify(pkg).length, summary: pkg.coverage.summary,
  };
  facts.chips = { ...(facts.chips || {}), partial_inclusion: await chipShot('chip-partial-inclusion') };
  save('budget-pressure', cap, { mode: 'ask', selection: 'p-big', message: request });
});

// ================================================================ Board O: an inventory past its cap
await openBoard(boards.O);
await check('overflow: 423 objects; listed < objects_total, the overflow is recorded as omitted/cap, counts are exact, and the summary never claims the whole canvas', async () => {
  const cap = await turn('What does this board cover?', { mode: 'ask' });
  const pkg = cap.pkg, total = boards.O.total, inv = pkg.inventory, cov = pkg.coverage;
  validate(pkg);
  assert.equal(cov.objects_total, total, 'objects_total is exact');
  assert.ok(cov.listed < cov.objects_total && cov.listed <= 300 && cov.listed === inv.items.length, `listed ${cov.listed} < objects_total ${cov.objects_total}`);
  assert.equal(inv.omitted_items, cov.objects_total - cov.listed, 'omitted_items is exact');
  const capped = cov.items.filter(c => c.status === 'omitted' && c.reason === 'cap');
  assert.ok(capped.length >= 1, 'coverage.items records omitted entries with reason cap');
  assert.equal(inv.counts.shape, 420, 'counts.shape is exact');
  assert.equal(inv.counts.card, 3, 'counts.card is exact');
  assert.equal(Object.values(inv.counts).reduce((sum, n) => sum + n, 0), total, 'the counts add up to objects_total');
  assert.ok(cov.unavailable_or_omitted >= cov.objects_total - cov.listed, 'unavailable_or_omitted includes the overflow');
  assert.ok(cov.summary.includes(String(total)) && cov.summary.includes(String(cov.listed)), 'the summary names both numbers');
  assert.ok(!/\b(whole|entire|all)\b[^;]*\b(canvas|objects?)\b/i.test(cov.summary), 'the summary never claims the whole canvas');
  await assertChip(pkg);
  facts.overflow = { objects_total: cov.objects_total, listed: cov.listed, omitted_items: inv.omitted_items, coverage_items: cov.items.length, omitted_cap_entries: capped.length, counts: inv.counts, summary: cov.summary };
  facts.chips = { ...(facts.chips || {}), overflowing_board: await chipShot('chip-overflow-board') };
  save('overflow', cap, { mode: 'ask', selection: null, message: 'What does this board cover?' });
});

// ================================================================ Board R: a repo-* canvas, the second Ask path
// On a project canvas the page posts the same /api/learn/ask; the dev worker (web/dev-worker.js) forwards a scope.app of repo-*
// to /api/repositories/<app>/ask, i.e. control-plane repositoryAsk. Answered here, so no model is called.
await openBoard(boards.R);
for (const mode of ['ask', 'tutor']) {
  await check(`repo-* canvas, ${NAME[mode]}: /api/learn/ask (repositoryAsk) carries canvas_context, valid, with the whole inventory and the chip agreeing`, async () => {
    const cap = await turn(mode === 'ask' ? ABOUT_OLD : WHOLE, { mode });
    assert.equal(cap.route, 'ask', 'posts to /api/learn/ask');
    assert.equal(cap.body.scope?.app, REPO, 'scoped to the repository canvas');
    assert.equal(cap.body.mode, mode, 'the ask carries its mode');
    const pkg = cap.pkg;
    validate(pkg);
    assert.deepEqual(boards.R.ids.filter(id => !idsOf(pkg).includes(id)), [], 'every seeded object is listed');
    if (mode === 'ask') assert.ok(excerptOf(pkg, 'old'), 'the old relevant block is excerpted');
    assert.ok(pkg.relations.explicit.some(r => pair(r.from, r.to) === STORED), 'the stored link is explicit');
    for (const drawn of DRAWN) assert.ok(pkg.relations.inferred.some(r => pair(r.from, r.to) === drawn && r.kind === 'near'), `drawn arrow ${drawn} is inferred (near)`);
    await assertChip(pkg);
    facts.repository_canvas = { ...(facts.repository_canvas || {}), [mode]: { app: REPO, listed: pkg.coverage.listed, objects_total: pkg.coverage.objects_total, body_chars: cap.size, package_chars: JSON.stringify(pkg).length } };
    save(`repo-${mode}`, cap, { mode, selection: null, app: REPO });
  });
}

// The smallest body gate on any ask route is the repository one: control-plane/src/repositories.js repositoriesFetch refuses a
// non-GET body over 64000 characters (content-length or text length) with 413 "Request exceeds 64 KB". It is a literal there;
// learn-tutor-handoff.js mirrors it as HANDOFF_BODY_CHARS = 64000. (A shared canvas's ask has its own MAX_ASK_BODY = 128 * 1024.)
const REPO_BODY_GATE = 64000;
await openBoard(boards.L);
await check('large package on a repo-* canvas: the whole body stays under the repository ask gate (64,000 characters) and the real route does not answer 413', async () => {
  const cap = await turn(WHOLE, { mode: 'ask' });
  const pkg = cap.pkg, cov = pkg.coverage;
  validate(pkg);
  assert.ok(cov.objects_total > 300 && cov.listed <= 300, `a large board: ${cov.objects_total} objects, ${cov.listed} listed`);
  assert.ok(pkg.excerpts.length >= 5, 'the excerpts fill their share too');
  assert.ok(cap.size <= REPO_BODY_GATE && cap.bytes <= REPO_BODY_GATE, `the request body is ${cap.size} characters (${cap.bytes} bytes), over the repository ask gate of ${REPO_BODY_GATE} (repositories.js repositoriesFetch)`);
  // The real route's size gate, probed without a model: the captured body with an empty message (refused as a question before any
  // model or storage is reached) must pass the gate, and the same body padded past 64,000 characters must be refused 413 by it.
  const probe = async text => (await fetch(`${BASE}/api/repositories/${REPO}/ask`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: text })).status;
  const sent = JSON.stringify({ ...cap.body, message: '' });
  const under = await probe(sent), over = await probe(JSON.stringify({ ...cap.body, message: '', pad: 'x'.repeat(Math.max(0, REPO_BODY_GATE + 1000 - sent.length)) }));
  assert.notEqual(under, 413, `the real repository ask route refused the large package's body with 413 (${sent.length} characters)`);
  assert.equal(over, 413, `control: the real route's gate refuses a body over ${REPO_BODY_GATE} characters (answered ${over})`);
  facts.large_repo_package = { objects_total: cov.objects_total, listed: cov.listed, items: pkg.inventory.items.length, excerpts: pkg.excerpts.length, explicit: pkg.relations.explicit.length, inferred: pkg.relations.inferred.length,
    package_chars: JSON.stringify(pkg).length, body_chars: cap.size, body_bytes: cap.bytes, gate_chars: REPO_BODY_GATE, real_route_status_for_this_body: under, real_route_status_over_gate: over, summary: cov.summary };
  save('repo-large', cap, { mode: 'ask', selection: null, app: REPO });
});

// ================================================================ the whole run
await check('no model-capable request other than the two answered here, and no page error', async () => {
  assert.deepEqual(refused, [], `refused routes: ${refused.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
});

await context?.close();
await browser.close();
const failed = results.filter(r => !r.ok);
let commit = null;
try { commit = execSync('git rev-parse HEAD', { cwd: new URL('.', import.meta.url), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a checkout */ }
writeFileSync(`${OUT}/results.json`, JSON.stringify({
  commit, base: BASE, passed: results.length - failed.length, failed: failed.length, checks: results, facts,
  model_capable_refused: refused, tutor_next_steps_requests_to_stack: hooks, outside_hosts: [...new Set(outside)], page_errors: errors,
}, null, 2));
console.log(failed.length ? `FAIL ${failed.length} of ${results.length} checks (see ${OUT}/results.json)` : `PASS ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
