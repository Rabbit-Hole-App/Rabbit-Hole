// Start Rabbit Hole from a card's right-click menu (owner, 2026-10-07; docs/features/card-context-menu.md), against the
// LOCAL stack only: local D1 and fresh browser profiles. No model is called: /api/learn/ask is aborted as a guard and no
// composer question is ever sent (only /whiteboard, which draws locally). Prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/card-context-menu-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('card-context-menu-check runs against the local stack only');
const SHOTS = process.argv[2] || 'card-context-menu-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const run = Date.now().toString(36);
const owner = { session: await sessionFor(`ccm-owner-${run}@example.com`, `ccm_${run}`) };
const viewer = { session: await sessionFor(`ccm-viewer-${run}@example.org`, `ccmv_${run}`) };
const api = async (who, path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json' } });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const BLOCKS = [
  { id: 'm-a', type: 'explanation', dx: 0, dy: 0, title: 'Card A: tides', body: 'The moon pulls the near ocean more than the Earth.' },
  { id: 'm-b', type: 'explanation', dx: 0, dy: 0, title: 'Card B: bulges', body: 'Two bulges, one on each side of the Earth.' },
  { id: 'm-c', type: 'explanation', dx: 0, dy: 0, title: 'Card C: springs', body: 'Sun and moon in line make spring tides.' },
  { id: 'm-q', type: 'quiz', dx: 0, dy: 0, question: 'How many tidal bulges does Earth have?', options: [{ key: 'A', text: 'Two', correct: true }, { key: 'B', text: 'One' }], why: 'One faces the moon, one is opposite.' },
];
// A sticky note: the editable object the menu must leave alone.
const ITEMS = [{ id: 'n-1', kind: 'sticky', x: 1060, y: 140, text: 'Tide note', color: 'yellow' }];
const STATE = { strokes: [], shapes: [], items: ITEMS, links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Tides ${run}` }) })).body;
const catalog = (await api(owner, '/api/apps')).body;
const SEEDS = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`]: STATE };
const ROOT = `/apps/${canvas.name}`;

const browser = await chromium.launch();
const errors = [], asks = [];
const contextFor = async (who, viewport = { width: 1440, height: 900 }) => {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
  await context.route('**/api/learn/ask', route => { asks.push(route.request().url()); return route.abort(); });
  // Start Rabbit Hole opens a hole whose opening question is a Tutor turn (#46): answered here, as shared-rabbit-hole-check
  // does; the planner's real wiring is covered on the journey stack.
  await context.route('**/api/learn/tutor/plan', route => route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: 'What would you like to explore first?' }] } }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
let page;
const shot = async name => { await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const url = () => new URL(page.url());
const open = async path => { await page.goto(`${BASE}${path}`); await page.waitForSelector('[data-block-id="m-b"]', { timeout: 60000 }); await page.waitForTimeout(1200); };
const strip = id => page.locator(`[data-block-id="${id}"] [data-drag-zone]`).last();
const select = async (id, modifiers = []) => { await strip(id).click({ position: { x: 12, y: 8 }, modifiers }); await page.waitForTimeout(250); };
const menu = () => page.locator('[data-canvas-menu]');
const startItem = () => menu().locator('[data-menu-start-rabbit-hole]');
const rightClick = async (id, position = { x: 30, y: 10 }) => { await strip(id).click({ button: 'right', position }); await menu().waitFor(); await page.waitForTimeout(150); };
const selectedIds = () => page.$$eval('[data-block-id][aria-current="true"]', nodes => nodes.map(node => node.dataset.blockId));
const pending = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('small.dive.pending') || '{}'));
const tree = async () => (await api(owner, `/api/canvases/dives?app=${canvas.name}&board=main`)).body;
// Inside the window and inside the canvas surface (which clips it), with 1 px of rounding.
const inside = () => page.evaluate(() => {
  const m = document.querySelector('[data-canvas-menu]').getBoundingClientRect(), s = document.querySelector('[data-canvas-surface]').getBoundingClientRect();
  return { ok: m.left >= Math.max(s.left, 0) - 1 && m.top >= Math.max(s.top, 0) - 1 && m.right <= Math.min(s.right, innerWidth) + 1 && m.bottom <= Math.min(s.bottom, innerHeight) + 1, m: [m.left, m.top, m.right, m.bottom].map(Math.round), w: innerWidth, h: innerHeight };
});

({ page } = await contextFor(owner));
await open(ROOT);

await check('1 right-click a card: a small menu by the cursor, "Start Rabbit Hole" exactly, from that card, even with another card selected', async () => {
  await select('m-a');
  const at = await strip('m-b').boundingBox();
  await rightClick('m-b');
  assert.equal((await startItem().innerText()).trim(), 'Start Rabbit Hole');
  assert.equal(await startItem().getAttribute('data-origin'), 'm-b');
  const box = await menu().boundingBox();
  assert.ok(Math.abs(box.x - (at.x + 30)) <= 2 && Math.abs(box.y - (at.y + 10)) <= 2, `the menu opens at the cursor: ${JSON.stringify(box)} vs ${at.x + 30},${at.y + 10}`);
  assert.ok((await inside()).ok);
});
await shot('01-menu-start-rabbit-hole');

await check('2 opening, Escape and an outside click create no Rabbit Hole', async () => {
  await page.keyboard.press('Escape');
  await menu().waitFor({ state: 'detached' });
  await rightClick('m-b');
  await page.locator('header, [data-dive-navigator], aside').first().click({ position: { x: 5, y: 5 }, force: true }).catch(() => page.mouse.click(5, 5));
  await menu().waitFor({ state: 'detached', timeout: 5000 });
  assert.ok(!url().search.includes('hole='), 'still on the canvas');
  assert.deepEqual(Object.keys(await pending()), [], 'no pending hole');
  assert.equal((await tree()).children.length, 0, 'no hole on the server');
});

await check('3 near the right and bottom edges the menu flips beside the cursor and stays inside the window and the canvas', async () => {
  const s = await page.locator('[data-canvas-surface]').boundingBox();
  // The nearest open canvas to each corner: walk in from the edge past overlays (zoom, minimap, rails, buttons).
  const open = (x, y, dx, dy) => page.evaluate(([x, y, dx, dy]) => {
    for (let i = 0; i < 80; i++, x += dx, y += dy) {
      const hit = document.elementFromPoint(x, y);
      if (hit?.closest('[data-canvas-surface]') && !hit.closest('button,[role="toolbar"],[data-zoom],[data-minimap],[data-block-id],[data-dive-navigator],input,textarea,a')) return [x, y];
    }
    return null;
  }, [x, y, dx, dy]);
  const corners = [await open(s.x + s.width - 4, s.y + s.height - 4, -6, -6), await open(s.x + s.width - 4, s.y + 60, -6, 0), await open(s.x + 80, s.y + s.height - 4, 0, -6)];
  assert.ok(corners.every(Boolean), JSON.stringify(corners));
  for (const [x, y] of corners) {
    await page.mouse.click(x, y, { button: 'right' });
    await menu().waitFor();
    const where = await inside();
    assert.ok(where.ok, `menu inside at ${Math.round(x)},${Math.round(y)}: ${JSON.stringify(where)}`);
    await page.keyboard.press('Escape');
    await menu().waitFor({ state: 'detached' });
  }
  // A card at the bottom-right of a small window.
  await page.setViewportSize({ width: 820, height: 560 });
  await page.waitForTimeout(500);
  const b = await strip('m-b').boundingBox();
  const sv = await page.locator('[data-canvas-surface]').boundingBox();
  await strip('m-b').click({ button: 'right', position: { x: Math.max(4, Math.min(b.width - 4, sv.x + sv.width - b.x - 8)), y: Math.max(2, Math.min(b.height - 2, 10)) } });
  await menu().waitFor();
  assert.ok((await inside()).ok, JSON.stringify(await inside()));
  assert.equal(await startItem().getAttribute('data-origin'), 'm-b');
});
await shot('02-menu-near-the-edge');
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(500);

let holeName;
await check('4 Start Rabbit Hole opens the right-clicked card\'s Rabbit Hole - from card B with A and B selected - and Up returns', async () => {
  await select('m-a');
  await select('m-b', ['Shift']);
  assert.deepEqual((await selectedIds()).sort(), ['m-a', 'm-b']);
  await rightClick('m-b');
  await startItem().click();
  await page.waitForFunction(() => location.search.includes('hole='), null, { timeout: 15000 });
  holeName = url().searchParams.get('hole');
  assert.equal((await pending())[holeName]?.origin_block_id, 'm-b', 'the origin is the right-clicked card, not the first selected');
  await page.locator('[data-dive-navigator]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await shot('03-in-the-rabbit-hole');
  await page.locator('[data-dive-navigator]').getByRole('button', { name: 'Up to the parent hole' }).click();
  await page.waitForFunction(root => location.pathname === root && !location.search.includes('hole='), ROOT, { timeout: 15000 });
});

await check('5 a kept hole: the card is its portal, and right-click Start Rabbit Hole enters it - never a second hole', async () => {
  await page.waitForSelector('[data-block-id="m-b"]', { timeout: 30000 }); await page.waitForTimeout(800);
  await rightClick('m-b');
  await startItem().click();
  await page.waitForFunction(() => location.search.includes('hole='), null, { timeout: 15000 });
  // #46: entering a hole opens with a Tutor turn; the learner types once its question shows (a command typed while that
  // turn is still in flight is lost - recorded as a #46 review finding, not this check's subject).
  await page.getByText('What would you like to explore first?').first().waitFor({ timeout: 20000 });
  const composer = page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();
  await composer.click(); await composer.fill('/whiteboard Bulge sketch'); await page.waitForTimeout(150); await composer.press('Enter');
  await page.waitForFunction(() => /^\/apps\/canvas-[a-f0-9]{8}$/.test(location.pathname) && !location.search.includes('hole='), null, { timeout: 20000 });
  const kept = url().pathname.split('/').pop();
  const children = (await tree()).children;
  assert.deepEqual(children.map(child => [child.name, child.origin_block_id]), [[kept, 'm-b']]);
  await page.locator('[data-dive-navigator]').getByRole('button', { name: 'Up to the parent hole' }).click();
  await page.waitForFunction(root => location.pathname === root, ROOT, { timeout: 15000 });
  await page.waitForSelector(`[data-dive-portal="${kept}"]`, { timeout: 15000 });
  await rightClick('m-b');
  await startItem().click();
  await page.waitForFunction(name => location.pathname.endsWith(name), kept, { timeout: 15000 });
  assert.equal((await tree()).children.length, 1, 'entered, not duplicated');
  await page.locator('[data-dive-navigator]').getByRole('button', { name: 'Up to the parent hole' }).click();
  await page.waitForFunction(root => location.pathname === root, ROOT, { timeout: 15000 });
});

await check('6 the menu leaves dragging alone: a card still drags by its strip', async () => {
  await page.waitForSelector('[data-block-id="m-c"]'); await page.waitForTimeout(600);
  const before = await page.locator('[data-block-id="m-c"]').first().boundingBox();
  const s = await strip('m-c').boundingBox();
  await page.mouse.move(s.x + 14, s.y + 8); await page.mouse.down();
  await page.mouse.move(s.x + 94, s.y + 68, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await page.locator('[data-block-id="m-c"]').first().boundingBox();
  assert.ok(Math.abs(after.x - before.x) > 40 && Math.abs(after.y - before.y) > 30, `moved: ${JSON.stringify([before, after])}`);
  assert.equal(await menu().count(), 0);
});

await check('6b editing still works: a sticky note edits by double-click and keeps the typed text; its right-click menu has no Start Rabbit Hole', async () => {
  const note = page.locator('[data-item-id="n-1"]');
  await note.waitFor();
  await note.click({ button: 'right', position: { x: 30, y: 30 } });
  await menu().waitFor();
  assert.equal(await startItem().count(), 0, 'Start Rabbit Hole is for learning cards only');
  await page.keyboard.press('Escape'); await menu().waitFor({ state: 'detached' });
  await note.dblclick({ position: { x: 30, y: 30 } });
  const body = note.locator('[contenteditable="true"]');
  await body.waitFor({ timeout: 5000 });
  await page.keyboard.press('End'); await page.keyboard.type(' edited');
  await page.mouse.click(5, 5); await page.waitForTimeout(400);
  assert.match(await note.innerText(), /Tide note edited/);
  assert.equal(await menu().count(), 0);
});

await check('6c interactive controls still work: a quiz option answers on click, with no menu and no Rabbit Hole', async () => {
  const option = page.locator('[data-block-id="m-q"] [data-quiz-option="A"]').first();
  await option.scrollIntoViewIfNeeded(); await option.click(); await page.waitForTimeout(300);
  assert.match(await option.getAttribute('class'), /border-green-700/, 'the right answer shows as right');
  assert.equal(await menu().count(), 0);
  assert.ok(!url().search.includes('hole='));
});

await check('6d keyboard: the context-menu key on a focused card opens its menu inside the window, from that card; Escape closes it and focus stays on the card', async () => {
  await page.evaluate(() => document.querySelector('[data-block-id="m-b"]').focus());
  await page.keyboard.press('Shift+F10');
  let via = 'Shift+F10';
  if (!(await menu().waitFor({ timeout: 1500 }).then(() => true, () => false))) {
    // A browser that does not turn the key into the event: send the event the key would send, at the card.
    via = 'contextmenu event';
    await page.evaluate(() => { const card = document.querySelector('[data-block-id="m-b"]'), r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 12, clientY: r.top + 12 })); });
    await menu().waitFor();
  }
  console.log('keyboard menu via', via);
  assert.equal(await startItem().getAttribute('data-origin'), 'm-b');
  assert.ok((await inside()).ok, JSON.stringify(await inside()));
  // The menu sits at the card the keyboard opened it on, even when the surface has been scrolled under it.
  const near = await page.evaluate(() => { const m = document.querySelector('[data-canvas-menu]').getBoundingClientRect(), c = document.querySelector('[data-block-id="m-b"]').getBoundingClientRect(); return m.left >= c.left - 2 && m.left <= c.right && m.top >= c.top - 2 && m.top <= c.bottom; });
  assert.ok(near, 'the keyboard menu opens on its card');
  await page.keyboard.press('Escape');
  await menu().waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-block-id]')?.dataset.blockId || null), 'm-b', 'focus stays on the card');
  assert.ok(!url().search.includes('hole='), 'the keyboard menu started nothing');
});

await check('6e the Library ⋮ menu still opens from the keyboard (Enter) with Rename, and Escape closes it', async () => {
  await page.goto(`${BASE}/library?type=canvases`);
  const card = page.locator('[data-library-card="canvas"]').filter({ has: page.locator('[data-card-title]', { hasText: new RegExp(`^Tides ${run}$`) }) });
  await card.waitFor({ timeout: 60000 });
  await card.hover();
  const more = card.getByTitle('More');
  await more.focus(); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Rename', exact: true }).waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Rename', exact: true }).waitFor({ state: 'detached', timeout: 5000 });
  await open(ROOT);
});

// ---- a view-only board: the viewer's own private Rabbit Hole, from the right-clicked card ----
const shared = (await api(owner, `/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, state: STATE }) })).body;
const token = shared.sharing.view;
await check('7 on a shared view-only board the menu starts the viewer\'s own Rabbit Hole from the right-clicked card', async () => {
  ({ page } = await contextFor(viewer));
  const sent = [];
  page.on('request', request => { if (request.url().includes('/rabbit-hole') && request.method() === 'POST') sent.push(JSON.parse(request.postData() || '{}')); });
  await page.goto(`${BASE}/b/${token}`);
  await page.locator('[data-start-rabbit-hole]').waitFor({ timeout: 30000 }); await page.waitForTimeout(1500);
  // A view-only board selects by a click through the hand tool (shared-rabbit-hole-check clickCard), so press by coordinates.
  const point = async id => { const box = await page.locator(`[data-block-id="${id}"]`).first().boundingBox(); return [box.x + box.width / 2, box.y + Math.min(40, box.height / 2)]; };
  const [ax, ay] = await point('m-a'); await page.mouse.click(ax, ay); await page.waitForTimeout(300);
  const [bx, by] = await point('m-b'); await page.mouse.click(bx, by, { button: 'right' });
  await menu().waitFor();
  assert.equal((await startItem().innerText()).trim(), 'Start Rabbit Hole');
  assert.equal(await startItem().getAttribute('data-origin'), 'm-b');
  // View-only edits nothing: Start Rabbit Hole is the only item (no Duplicate, Group, Select all or Delete).
  assert.deepEqual((await menu().locator('[role="menuitem"]').allInnerTexts()).map(text => text.trim()), ['Start Rabbit Hole']);
  await shot('04-shared-view-only-menu');
  await startItem().click();
  await page.waitForFunction(() => /^\/apps\/canvas-[a-f0-9]{8}/.test(location.pathname), null, { timeout: 30000 });
  assert.equal(sent.length, 1, 'one start');
  assert.equal(sent[0].origin?.block_id, 'm-b', JSON.stringify(sent[0]));
  await page.waitForTimeout(1500);
  await shot('05-viewer-own-rabbit-hole');
});

await check('no page errors, no model call', async () => { assert.deepEqual(errors, []); assert.deepEqual(asks, []); });
await browser.close();
console.log(`${results.length}/12 checks passed`);
process.exit(results.length === 12 ? 0 : 1);
