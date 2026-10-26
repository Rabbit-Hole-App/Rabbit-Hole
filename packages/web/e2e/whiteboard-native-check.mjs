// The native Whiteboard card, without tldraw (docs/features/tldraw-removal.md, workstream A), against a LOCAL stack only, on a
// dev-flag build. The card is switched on for this browser with localStorage 'rh.nativeWhiteboard' (whiteboard-flag.js). It
// covers: the seeded sigmoid, the canvas toolbar drawing in the card (pen, highlighter, shapes, text, sticky), select, move,
// resize, delete, undo and redo, save and reload, Fit / 100% / focus, a board saved by tldraw (kept layer, downloads, the
// snapshot never rewritten), a board with a saved drawing, a read-only share view never writing, and no request to tldraw.
// No model is called. Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/whiteboard-native-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { digestOf } from '../src/whiteboard-sketch.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('whiteboard-native-check runs against the local stack only');
const OUT = process.argv[2] || 'whiteboard-native-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `wbn-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

// What a tldraw-era board holds, written by tldraw's own schema (src/__fixtures__/tldraw), and one the native editor saved.
const SNAPSHOT = JSON.parse(readFileSync(new URL('../src/__fixtures__/tldraw/whiteboard-editor.json', import.meta.url), 'utf8'));
const SNAPSHOT_TEXT = JSON.stringify(SNAPSHOT);
const box = (id, x, y, extra = {}) => ({ id, kind: 'rect', x1: x, y1: y, x2: x + 100, y2: y + 60, color: '#2383e2', width: 2, ...extra });
const BLOCKS = [
  { id: 'wb-empty', type: 'whiteboard', dx: 0, dy: 0, title: 'Empty board', narration: '', snapshot: null },
  { id: 'wb-legacy', type: 'whiteboard', dx: 0, dy: 0, title: 'Old tldraw board', narration: '', snapshot: SNAPSHOT },
  { id: 'wb-converted', type: 'whiteboard', dx: 0, dy: 0, title: 'Converted board', narration: '', snapshot: SNAPSHOT, sketch: { strokes: [], shapes: [box('keep-1', 30, 30, { text: 'Kept' })], items: [] }, sketchFrom: { digest: digestOf(SNAPSHOT), v: 1 } },
  { id: 'wb-big', type: 'whiteboard', dx: 0, dy: 0, title: 'Large board', narration: '', snapshot: null, sketch: { strokes: [], shapes: [box('big-a', 20, 20), box('big-b', 1500, 900, { text: 'Far corner' })], items: [] } },
];
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Native whiteboard ${Date.now().toString(36)}` }) });
const catalog = await api('/api/apps');
const KEY = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const CHAT_KEY = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:chat`;
// A saved chat answer that came from the empty board: the Tutor draws it back on that board ("Explain in canvas").
const EXCHANGES = [{ id: 'ex-1', question: 'What does the flat part of this curve mean?', answer: 'The flat part is where the output saturates near 0 or 1.', status: 'done', dx: 0, dy: 0, linkFrom: 'wb-empty' }];
// The board plan the Tutor would return: prose, an equation, a diagram, and a picture that becomes a card beside the board.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PLAN = { blocks: [
  { kind: 'text', text: 'The flat parts are where the sigmoid saturates, so a big change in the score barely moves the probability.', fromObjectId: null },
  { kind: 'equation', text: 'σ(x) = 1 / (1 + e^-x)', fromObjectId: null },
  { kind: 'diagram', text: 'Score to probability', nodes: [{ id: 'a', label: 'Score' }, { id: 'b', label: 'Sigmoid' }, { id: 'c', label: 'Probability' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }], fromObjectId: null },
  { kind: 'image', text: 'A single pixel stands in for the picture.', photo: { src: PIXEL, url: 'https://www.pexels.com/photo/1', alt: 'A pixel', width: 1, height: 1, photographer: 'Ada' }, annotations: [{ kind: 'box', x: 0.1, y: 0.1, w: 0.3, h: 0.2 }], fromObjectId: null },
] };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, state, chatKey, exchanges]) => {
  localStorage.setItem('rh.nativeWhiteboard', '1');
  if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
  if (!localStorage.getItem(chatKey)) localStorage.setItem(chatKey, JSON.stringify(exchanges));
}, [KEY, STATE, CHAT_KEY, EXCHANGES]);
const boardRequests = [];
await context.route('**/api/learn/board', route => { boardRequests.push(route.request().postDataJSON()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: PLAN }) }); });
// Nothing here asks a model: any model-capable request is refused and counted.
const asked = [];
for (const route of ['**/api/learn/ask', '**/api/learn/tutor/plan', '**/api/learn/artifact', '**/api/learn/home-ask']) await context.route(route, handler => { asked.push(handler.request().url()); return handler.abort(); });
const page = await context.newPage();
const errors = [], requested = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/tldraw/i.test(request.url())) requested.push(request.url()); });

const results = [], failures = [];
// A failing step is reported and the rest still run (a later step may stand on its own), so one run shows every defect.
const check = async (label, fn) => {
  try { await fn(); } catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n')[0].slice(0, 600)}`); await page.screenshot({ path: `${OUT}/FAIL-${label.split(' ')[0]}.png` }).catch(() => {}); return; }
  results.push(label); console.log(`ok ${label}`);
};
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const tool = name => page.locator(`[aria-label="Canvas tools"] button[aria-label="${name}"]`);
const target = () => page.locator('[aria-label="Canvas tools"]').getAttribute('data-draw-target');
const card = id => page.locator(`[data-block-id="${id}"]`);
const frame = id => page.locator(`[data-sketch="${id}"]`);
const bounds = locator => locator.boundingBox();
const chromeFloor = async () => (await bounds(page.locator('[data-canvas-surface]')));
// The canvas has its own camera: a wheel over empty canvas pans it until the card's frame is fully on screen.
const reveal = async id => {
  const surface = await chromeFloor();
  for (let tries = 0; tries < 12; tries += 1) {
    const b = await bounds(frame(id));
    if (b && b.y > surface.y + 90 && b.y + b.height < surface.y + surface.height - 220 && b.x > surface.x + 60 && b.x + b.width < surface.x + surface.width - 60) return b;
    const dy = b ? b.y + b.height / 2 - (surface.y + surface.height * 0.4) : 200;
    await page.mouse.move(surface.x + surface.width - 40, surface.y + surface.height / 2);
    await page.mouse.wheel(0, Math.max(-600, Math.min(600, dy)));
    await page.waitForTimeout(200);
  }
  return bounds(frame(id));
};
// A point in a frame, as fractions of its size: the card's height is whatever the layout gives it.
const at = (f, x, y) => ({ x: f.x + f.width * x, y: f.y + f.height * y });
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + (to.x - from.x) * step / 8, from.y + (to.y - from.y) * step / 8);
  await page.mouse.up(); await page.waitForTimeout(200);
};
// What the frame draws, read from the DOM, and what the board saved (the canvas writes the block to storage a moment later).
const counts = id => page.evaluate(sketchId => {
  const el = document.querySelector(`[data-sketch="${sketchId}"]`);
  return { strokes: el.querySelectorAll('svg > path').length, shapes: el.querySelectorAll('[data-shape-id]').length, items: el.querySelectorAll('[data-item-id]').length };
}, id);
// The canvas writes the block to storage a moment after a change: wait for the stored block to satisfy `until`.
const saved = async (id, until = () => true) => {
  for (let waited = 0; waited < 8000; waited += 200) {
    const block = await storedBlock(id).catch(() => null);
    if (block && until(block)) return block;
    await page.waitForTimeout(200);
  }
  const last = await storedBlock(id).catch(() => null);
  const summary = !last?.sketch ? { hasSketch: false, keys: Object.keys(last || {}), tooLarge: last?.tooLarge, target: await target().catch(() => '?'), domMarks: await counts(id).catch(() => '?') } : { strokes: last.sketch.strokes.length, shapes: last.sketch.shapes.map(shape => [shape.id.slice(0, 6), shape.kind, ...['x1', 'y1', 'x2', 'y2'].map(key => Math.round(shape[key]))]), items: last.sketch.items.length, tooLarge: last.tooLarge };
  throw Error(`the stored ${id} never reached the expected state: ${JSON.stringify(summary)}`);
};
const storedBlock = id => page.evaluate(([key, blockId]) => JSON.parse(localStorage.getItem(key)).blocks.find(entry => entry.id === blockId), [KEY, id]);

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 });
await card('wb-empty').waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);

// ---- the card: native, no tldraw ----
await check('1 the card is native: our drawing frame, no tldraw editor, Fit and 100%', async () => {
  const wb = card('wb-empty');
  await frame('wb-empty').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.tl-canvas, .tlui-toolbar, .tl-container').count(), 0, 'no tldraw DOM');
  for (const selector of ['[data-board-fit]', '[data-board-reset]']) assert.equal(await wb.locator(selector).count(), 1, selector);
  assert.equal(await wb.locator('[data-board-download-drawing]').count(), 0, 'nothing drawn yet, nothing to download');
  assert.equal(await wb.locator('[data-board-kept]').count(), 0);
});

// ---- the seeded sigmoid (a new card from the Insert menu) ----
await page.locator('[aria-label="Insert lesson block"]').click();
await page.getByRole('menuitem', { name: 'Whiteboard', exact: true }).click();
await page.waitForTimeout(800);
const seededId = await page.locator('[data-block-id]:not([data-chat-block])').last().getAttribute('data-block-id');
await check('2 a new Whiteboard opens with the native sigmoid, whole at 100 percent', async () => {
  await frame(seededId).waitFor({ timeout: 30000 });
  assert.deepEqual(await counts(seededId), { strokes: 1, shapes: 4, items: 6 });
  assert.match(await frame(seededId).innerText(), /sigmoid squashes any score/);
  const content = await frame(seededId).locator('[data-sketch-content]').getAttribute('style');
  assert.ok(!/scale/.test(content || ''), `nothing is clipped, so the view is the identity (style ${content}, frame ${JSON.stringify(await bounds(frame(seededId)))})`);
  assert.equal((await saved(seededId)).sketch, undefined, 'opening saves nothing');
});
await shot('01-seeded-sigmoid');

// ---- drawing with the canvas toolbar ----
const empty = 'wb-empty';
let f = await reveal(empty);
await check('3 pressing the card makes the one toolbar draw there', async () => {
  assert.equal(await target(), 'canvas');
  await tool('Pen').click();
  await drag(at(f, 0.05, 0.15), at(f, 0.25, 0.3));
  assert.equal(await target(), 'sketch');
  assert.equal(await page.locator('[data-sketch-badge]').count(), 1);
  assert.equal(await page.locator('[role="toolbar"]').count(), 1, 'one toolbar on the page');
  assert.equal(await frame(empty).locator('button').count(), 0, 'no drawing controls inside the frame');
  assert.deepEqual(await counts(empty), { strokes: 1, shapes: 0, items: 0 });
});
await check('4 highlighter, rectangle, ellipse, arrow and line', async () => {
  await tool('Highlighter').click();
  await drag(at(f, 0.05, 0.42), at(f, 0.3, 0.42));
  await tool('Rectangle').click();
  await drag(at(f, 0.4, 0.1), at(f, 0.58, 0.38));
  await tool('Ellipse').click();
  await drag(at(f, 0.62, 0.1), at(f, 0.78, 0.38));
  await tool('Arrow').click();
  await drag(at(f, 0.4, 0.62), at(f, 0.6, 0.62));
  await tool('Line').click();
  await drag(at(f, 0.64, 0.5), at(f, 0.82, 0.62));
  assert.deepEqual(await counts(empty), { strokes: 2, shapes: 4, items: 0 });
});
await check('5 text and a sticky note', async () => {
  const free = at(f, 0.93, 0.9), words = at(f, 0.05, 0.62), note = at(f, 0.4, 0.68);
  await tool('Text').click();
  await page.mouse.click(words.x, words.y);
  await page.keyboard.type('sigmoid');
  await page.mouse.click(free.x, free.y); // commits the text; Select is armed again
  await tool('Sticky note').click();
  await page.mouse.click(note.x, note.y);
  await page.keyboard.type('remember');
  await page.mouse.click(free.x, free.y);
  await page.waitForTimeout(300);
  assert.deepEqual(await counts(empty), { strokes: 2, shapes: 4, items: 2 });
  assert.match(await frame(empty).innerText(), /sigmoid/);
});
await shot('02-drawn');
await check('6 select and move a shape, resize it, delete it, undo and redo', async () => {
  const first = (await saved(empty, block => block.sketch.shapes.some(shape => shape.kind === 'rect'))).sketch.shapes.find(shape => shape.kind === 'rect');
  // the card may have moved a little since the drawing started (a typed text scrolls the canvas): press the shape where it is now
  const found = await bounds(frame(empty).locator(`[data-shape-id="${first.id}"]`));
  const edge = { x: found.x + found.width / 2, y: found.y + found.height / 2 };
  await tool('Select and move').click();
  await page.mouse.click(edge.x, edge.y);
  await drag(edge, { x: edge.x, y: edge.y + 30 });
  const moved = (await saved(empty, block => block.sketch.shapes.find(shape => shape.id === first.id).y1 > first.y1 + 20)).sketch.shapes.find(shape => shape.id === first.id);
  assert.ok(moved.y1 > first.y1 + 20, `moved down (${first.y1} to ${moved.y1})`);
  const grip = await bounds(frame(empty).locator(`[data-shape-id="${first.id}"] [data-handle="11"]`));
  const topmost = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName} ${el.getAttribute('data-handle') || ''} ${(el.closest('[data-shape-id],[data-item-id]')?.getAttribute('data-shape-id') || el.closest('[data-item-id]')?.getAttribute('data-item-id') || '')}`.trim() : 'nothing'; }, [grip.x + grip.width / 2, grip.y + grip.height / 2]);
  assert.match(topmost, /^circle 11/, `the resize handle is not on top: ${topmost}`);
  await drag({ x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, { x: grip.x + grip.width / 2 + 40, y: grip.y + grip.height / 2 + 20 });
  const resized = (await saved(empty, block => { const r = block.sketch.shapes.find(shape => shape.id === first.id); return r.x2 - r.x1 > first.x2 - first.x1 + 20; })).sketch.shapes.find(shape => shape.id === first.id);
  assert.ok(resized.x2 - resized.x1 > first.x2 - first.x1 + 20, 'wider after the resize');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  assert.equal((await counts(empty)).shapes, 3, 'Delete removed the selected shape');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert.equal((await counts(empty)).shapes, 4, 'undo brings it back');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(300);
  assert.equal((await counts(empty)).shapes, 3, 'redo deletes it again');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert.equal((await counts(empty)).shapes, 4);
  await page.keyboard.press('Escape');
  assert.equal(await target(), 'canvas');
});

// ---- save and reload: marks and ids in the block, the tldraw snapshot field untouched ----
await check('7 the drawing is saved in the block and survives a reload', async () => {
  const block = await saved(empty, entry => entry.sketch.strokes.length === 2 && entry.sketch.shapes.length === 4 && entry.sketch.items.length === 2);
  assert.equal(block.snapshot, null);
  assert.ok(block.sketch.strokes.every(stroke => typeof stroke.id === 'string' && stroke.id), 'every stroke carries an id');
  assert.equal(block.tooLarge, undefined);
  assert.equal(block.toolsHidden, undefined);
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 });
  await frame(empty).waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  assert.deepEqual(await counts(empty), { strokes: 2, shapes: 4, items: 2 });
  assert.match(await frame(empty).innerText(), /remember/);
  assert.equal(await target(), 'canvas');
});

// ---- a board saved by tldraw: original kept whole, kept layer, downloads ----
await check('8 an old tldraw board opens with its kept objects listed and the original untouched', async () => {
  const legacy = card('wb-legacy');
  await frame('wb-legacy').waitFor({ timeout: 30000 });
  assert.equal(await legacy.locator('[data-board-kept] summary').innerText(), 'Kept from the original board (4)');
  await legacy.locator('[data-board-kept]').evaluate(details => { details.open = true; });
  const names = await legacy.locator('[data-board-kept] li span').allInnerTexts();
  assert.ok(names.some(name => /Gradient descent surface at 700, 40/.test(name)), names.join(' | '));
  assert.equal(await frame('wb-legacy').locator('[data-board-kept-picture]').count(), 1, 'a read-only picture of what was kept');
  assert.equal(await legacy.locator('[data-board-download-original]').count(), 1);
  const stored = await storedBlock('wb-legacy');
  assert.equal(JSON.stringify(stored.snapshot), SNAPSHOT_TEXT, 'opening rewrites nothing');
  assert.equal(stored.sketch, undefined, 'opening saves no sketch');
});
await check('9 Download original gives the snapshot exactly, Download my drawing gives the marks', async () => {
  const original = page.waitForEvent('download');
  await card('wb-legacy').locator('[data-board-download-original]').evaluate(button => button.click());
  const file = await original;
  assert.match(file.suggestedFilename(), /original\.json$/);
  const path = await file.path();
  assert.equal(readFileSync(path, 'utf8'), SNAPSHOT_TEXT);
  const drawing = page.waitForEvent('download');
  await card('wb-converted').locator('[data-board-download-drawing]').evaluate(button => button.click());
  const mine = JSON.parse(readFileSync(await (await drawing).path(), 'utf8'));
  assert.deepEqual(mine.sketch.shapes.map(shape => shape.id), ['keep-1']);
});
await check('10 a converted board edits its sketch and the snapshot stays byte-identical', async () => {
  const id = 'wb-converted';
  const g = await reveal(id);
  await tool('Rectangle').click();
  await drag(at(g, 0.5, 0.4), at(g, 0.7, 0.7));
  const block = await saved(id, entry => entry.sketch.shapes.length === 2);
  assert.equal(JSON.stringify(block.snapshot), SNAPSHOT_TEXT);
  assert.equal(block.sketchFrom.digest, digestOf(SNAPSHOT));
  await page.keyboard.press('Escape');
});
await shot('03-kept-layer');

// ---- Fit, focus and reset: a large drawing is never clipped, and the view is never saved ----
await check('11 a large board opens fitted, 100% and Fit move the view, nothing is written', async () => {
  const id = 'wb-big', before = JSON.stringify(await storedBlock(id));
  await reveal(id);
  const style = async () => (await frame(id).locator('[data-sketch-content]').getAttribute('style')) || '';
  assert.match(await style(), /scale\(0\.\d+\)/, 'fitted on open');
  const farCorner = await bounds(frame(id).locator('[data-shape-id="big-b"]'));
  const area = await bounds(frame(id));
  assert.ok(farCorner.x + farCorner.width <= area.x + area.width + 1 && farCorner.y + farCorner.height <= area.y + area.height + 1, 'the far corner is inside the frame');
  await card(id).locator('[data-board-reset]').evaluate(button => button.click());
  await page.waitForTimeout(300);
  assert.ok(!/scale/.test(await style()), '100% is the identity');
  await card(id).locator('[data-board-fit]').evaluate(button => button.click());
  await page.waitForTimeout(300);
  assert.match(await style(), /scale\(0\.\d+\)/);
  assert.equal(JSON.stringify(await storedBlock(id)), before, 'the view is not saved');
});
await check('12 a mark drawn in a fitted view lands where it appears', async () => {
  const id = 'wb-big';
  const area = await reveal(id);
  await tool('Rectangle').click();
  const from = at(area, 0.3, 0.3);
  await drag(from, { x: from.x + 100, y: from.y + 60 });
  const block = await saved(id, entry => entry.sketch.shapes.length === 3);
  const made = block.sketch.shapes.find(shape => !['big-a', 'big-b'].includes(shape.id));
  assert.ok(made.x2 - made.x1 > 130, `saved in sketch space, larger than the 100 px dragged (${made.x2 - made.x1})`);
  await page.keyboard.press('Escape'); // lets go of the selection handles before measuring
  const drawn = await bounds(frame(id).locator(`[data-shape-id="${made.id}"]`));
  assert.ok(Math.abs(drawn.x - from.x) < 10 && Math.abs(drawn.y - from.y) < 10, `drawn at ${drawn.x},${drawn.y}, pressed at ${from.x},${from.y}`);
});
await shot('04-fitted');

await check('10b editing a tldraw board saves the converted drawing beside the untouched original', async () => {
  const id = 'wb-legacy';
  const g = await reveal(id);
  const marksBefore = (await counts(id)).shapes;
  await tool('Rectangle').click();
  const press = at(g, 0.1, 0.1), top = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName}.${String(el.className?.baseVal ?? el.className).slice(0, 40)}` : 'nothing'; }, [press.x, press.y]);
  await drag(press, at(g, 0.3, 0.3));
  const block = await saved(id, entry => entry.sketch && entry.sketch.shapes.length >= marksBefore + 1).catch(async error => { throw Error(`${error.message} (pressed on ${top}; frame ${JSON.stringify(g)}; draw target ${await target()})`); });
  assert.equal(JSON.stringify(block.snapshot), SNAPSHOT_TEXT, 'the original is byte-identical');
  assert.equal(block.sketchFrom.digest, digestOf(SNAPSHOT));
  assert.ok(block.sketch.strokes.length > 0 && block.sketch.items.length > 0, 'the converted drawing was saved with the edit');
  assert.ok(block.sketch.strokes.every(stroke => stroke.id), 'converted strokes have ids');
  await page.keyboard.press('Escape');
});

// ---- the Tutor draws its answer back on the board: one update, one undo step, cards beside it ----
await check('13b the Tutor draws the answer on the board in one undo step, and replaying adds nothing', async () => {
  const g = await reveal(empty);
  const before = await storedBlock(empty);
  await page.keyboard.press('Escape');
  await tool('Select and move').click();
  const exchange = page.locator('[data-chat-block]').first();
  await exchange.locator('[data-drag-zone]').first().click({ force: true });
  const button = page.locator('[data-explain-canvas]');
  await button.waitFor({ timeout: 15000 });
  await button.click();
  const after = await saved(empty, entry => entry.sketch.items.some(item => item.author === 'assistant'));
  assert.equal(boardRequests.length, 1, 'one planning request');
  const assistant = [...after.sketch.strokes, ...after.sketch.shapes, ...after.sketch.items].filter(mark => mark.author === 'assistant');
  assert.ok(assistant.length >= 5, `${assistant.length} Tutor marks`);
  assert.equal(new Set(assistant.map(mark => mark.explanationId)).size, 1);
  assert.equal(after.sketch.shapes.filter(shape => shape.author !== 'assistant').length, before.sketch.shapes.length, 'the learner\'s own marks are untouched');
  const linked = async () => (await page.evaluate(key => JSON.parse(localStorage.getItem(key)).blocks.filter(block => block.whiteboardLink), KEY));
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).blocks.some(block => block.whiteboardLink), KEY, { timeout: 8000 });
  const cards = await linked();
  assert.equal(cards.length, 1, 'the picture became one card');
  assert.equal(cards[0].whiteboardLink.whiteboard, empty);
  assert.equal(cards[0].type, 'image');
  await frame(empty).waitFor();
  const label = await card(empty).getByText(/\d+ (shapes|marks) drawn by the tutor/).first().innerText();
  assert.match(label, /^[1-9]\d* /);
  // replaying the same answer (a retry or a second press) is already drawn: no new request, nothing added
  await exchange.locator('[data-drag-zone]').first().click({ force: true });
  await button.click();
  await page.waitForTimeout(1200);
  assert.equal(boardRequests.length, 1, 'no paid request for an answer that is already drawn');
  assert.equal((await linked()).length, 1);
  // one undo step takes marks and card away together; redo brings both back
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  assert.equal((await linked()).length, 0, 'undo removed the card');
  assert.equal(await card(empty).getByText(/drawn by the tutor/).count(), 0, 'and the marks');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(500);
  assert.equal((await linked()).length, 1, 'redo brought the card back');
  // Remove explanation takes the Tutor's marks out, keeps the learner's and the card
  await card(empty).locator('[data-board-clear-explanation]').evaluate(el => el.click());
  const cleared = await saved(empty, entry => ![...entry.sketch.strokes, ...entry.sketch.shapes, ...entry.sketch.items].some(mark => mark.author === 'assistant'));
  assert.equal(cleared.sketch.shapes.length, before.sketch.shapes.length);
  assert.equal((await linked()).length, 1, 'the card stays');
});
await shot('05-tutor-answer');

// ---- Ask about selection names the card ----
await check('13 the toolbar crop over the card arms one pill', async () => {
  const g = await reveal(empty);
  await page.getByRole('button', { name: 'Ask about selection — drag over any part of the canvas' }).click();
  await page.mouse.move(g.x + g.width * 0.1, g.y + g.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width * 0.6, g.y + g.height * 0.7, { steps: 10 });
  await page.mouse.up();
  const pill = page.locator('[data-canvas-target]');
  await pill.first().waitFor({ timeout: 20000 });
  assert.equal(await pill.count(), 1);
  assert.match(await pill.getAttribute('title') || '', /Selected area · /);
});

// ---- no tldraw anywhere in what the page asked for ----
await check('14 no request to tldraw and no page error', async () => {
  assert.deepEqual(requested, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(asked, [], 'no model request');
});
console.log(`${results.length}/${results.length + failures.length} checks passed`);
await browser.close();
if (failures.length) { console.log(`FAILED: ${failures.join('; ')}`); process.exit(1); }
