// Rabbit Hole right-click menus (owner, 2026-10-27; docs/features/card-context-menu.md "Enter and Delete Rabbit Hole"), against
// the LOCAL stack only: local D1, fresh browser profiles, holes made through the dives API (no model, no provider). Covers both
// entry points: a card that opens a kept hole (Enter Rabbit Hole, Delete Rabbit Hole) and the empty canvas inside a kept hole
// (Delete Rabbit Hole), the dialog's words, Cancel (no request, nothing changed, focus back) and Yes, delete (the existing
// DELETE /api/canvases/dives, the parent after a delete from inside, no portal left, the sibling and the parent kept).
// /api/learn/ask is aborted as a guard and no composer question is sent. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/rabbit-hole-menu-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('rabbit-hole-menu-check runs against the local stack only');
const SHOTS = process.argv[2] || 'rabbit-hole-menu-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `rhm-${run}@example.com`, secret, handle: `rhm_${run}` }) })).json()).session;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
  return { status: response.status, body: await response.json().catch(() => null) };
};

// The parent canvas: three cards; A and B each open a kept hole, C opens none.
const BLOCKS = [
  { id: 'm-a', type: 'explanation', dx: 0, dy: 0, title: 'Card A: tides', body: 'The moon pulls the near ocean more than the Earth.' },
  { id: 'm-b', type: 'explanation', dx: 0, dy: 0, title: 'Card B: bulges', body: 'Two bulges, one on each side of the Earth.' },
  { id: 'm-c', type: 'explanation', dx: 0, dy: 0, title: 'Card C: springs', body: 'Sun and moon in line make spring tides.' },
];
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Tides ${run}` }) })).body;
const catalog = (await api('/api/apps')).body;
const SEEDS = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`]: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS } };
const ROOT = `/apps/${canvas.name}`;
const slug = () => `canvas-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
const HOLE_A = slug(), HOLE_B = slug();
for (const [name, title, origin] of [[HOLE_A, 'Hole A: the moon', 'm-a'], [HOLE_B, 'Hole B: the bulge', 'm-b']]) {
  const made = await api('/api/canvases/dives', { method: 'POST', body: JSON.stringify({ name, title, parent: { app: canvas.name, board: 'main' }, origin_block_id: origin, dive: {} }) });
  assert.equal(made.status, 201, `hole ${title}: ${JSON.stringify(made.body)}`);
}
const tree = async app => api(`/api/canvases/dives?app=${app}&board=main`);

const browser = await chromium.launch();
const errors = [], asks = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
await context.route('**/api/learn/ask', route => { asks.push(route.request().url()); return route.abort(); });
await context.route('**/api/learn/tutor/plan', route => route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: 'What would you like to explore first?' }] } }));
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
// Every request that is not a read, from the moment a watch starts. ponytail: a board autosave (PUT /api/learn/boards/...) is the
// canvas saving its own cards, never a delete; it is left out so a late save of the seeded parent cannot fail Cancel's check.
const writes = [];
page.on('request', request => {
  const { pathname, search } = new URL(request.url());
  if (request.method() !== 'GET' && !(request.method() === 'PUT' && pathname.startsWith('/api/learn/boards/'))) writes.push(`${request.method()} ${pathname}${search}`);
});

const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const url = () => new URL(page.url());
const menu = () => page.locator('[data-canvas-menu]');
const dialog = () => page.getByRole('dialog', { name: 'Delete this Rabbit Hole?' });
const strip = id => page.locator(`[data-block-id="${id}"] [data-drag-zone]`).last();
const rightClick = async id => { await strip(id).click({ button: 'right', position: { x: 30, y: 10 } }); await menu().waitFor(); await page.waitForTimeout(150); };
const closeMenu = async () => { await page.keyboard.press('Escape'); await menu().waitFor({ state: 'detached' }); };
const rowNames = () => menu().locator('[role^="menuitem"]').evaluateAll(items => items.map(item => (item.querySelector(':scope > span') || item).innerText.split('\n')[0].trim()));
// A point on the bare canvas: no object, group, control or minimap under it (as card-context-menu-check finds one).
const barePoint = () => page.evaluate(() => {
  const s = document.querySelector('[data-canvas-surface]').getBoundingClientRect();
  for (let y = s.top + 40; y < s.bottom - 40; y += 24) for (let x = s.left + 40; x < s.right - 40; x += 24) {
    const hit = document.elementFromPoint(x, y);
    if (hit?.closest('[data-canvas-surface]') && !hit.closest('[data-block-id],[data-item-id],[data-shape-id],[data-connection],[data-group-box],[data-group-chip],button,a,[role="toolbar"],[role="dialog"],[data-minimap],[data-canvas-doc],[data-selection-bar],[data-dive-navigator]')) return { x, y };
  }
  return null;
});
const rightClickBare = async () => { const bare = await barePoint(); assert.ok(bare, 'a bare canvas point'); await page.mouse.click(bare.x, bare.y, { button: 'right' }); await menu().waitFor(); await page.waitForTimeout(150); };
// The Rabbit Holes tree of this level has loaded (the navigator shows it), so the portals and the menu rows are current.
const levelLoaded = name => page.waitForFunction(app => [...document.querySelectorAll('[data-dive-navigator] [aria-current="location"] [data-dive-level]')].some(level => level.dataset.diveLevel === app), name, { timeout: 30000 });
const openRoot = async () => {
  await page.goto(`${BASE}${ROOT}`);
  await page.waitForSelector('[data-block-id="m-b"]', { timeout: 60000 });
  await levelLoaded(canvas.name); await page.waitForTimeout(800);
};
// The dialog says exactly what the existing delete does (Dive.jsx confirmDialog over DELETE /api/canvases/dives).
const dialogSays = async title => {
  await dialog().waitFor({ timeout: 10000 });
  const text = await dialog().innerText();
  for (const words of [title, 'and everything on its canvas are deleted permanently. It does not go to Trash.', 'The card it opens from stays, without its Rabbit Hole outline.', 'Links to it from other canvases show as Unavailable.'])
    assert.ok(text.includes(words), `"${words}" in ${JSON.stringify(text)}`);
  assert.deepEqual(await dialog().getByRole('button').allInnerTexts(), ['Cancel', 'Yes, delete']);
};

await openRoot();

await check('1 a card that opens a kept hole offers Enter Rabbit Hole and Delete Rabbit Hole, its portal tab the same; a card without one Start only; the root canvas none', async () => {
  await page.locator(`[data-dive-portal="${HOLE_A}"]`).waitFor({ timeout: 15000 });
  await rightClick('m-a');
  const names = await rowNames();
  // Enter first; Delete Rabbit Hole with the deletes, above the card's own Delete.
  assert.equal(names[0], 'Enter Rabbit Hole', names.join(', '));
  assert.deepEqual(names.slice(-2), ['Delete Rabbit Hole', 'Delete'], names.join(', '));
  assert.equal(await menu().locator('[data-menu-delete-rabbit-hole]').getAttribute('data-origin'), 'm-a');
  assert.ok(!names.includes('Start Rabbit Hole'), names.join(', '));
  await shot('01-card-with-a-hole');
  await closeMenu();
  // The "↓ title" tab on the card is the link into the hole: its right-click is the card's menu.
  await page.locator(`[data-dive-portal="${HOLE_A}"]`).click({ button: 'right' }); await menu().waitFor();
  const tab = await rowNames();
  assert.ok(tab[0] === 'Enter Rabbit Hole' && tab.includes('Delete Rabbit Hole'), tab.join(', '));
  await closeMenu();
  await rightClick('m-c');
  const plain = await rowNames();
  assert.ok(plain.includes('Start Rabbit Hole') && !plain.includes('Enter Rabbit Hole') && !plain.includes('Delete Rabbit Hole'), plain.join(', '));
  await closeMenu();
  await rightClickBare();
  assert.ok(!(await rowNames()).includes('Delete Rabbit Hole'), 'a root canvas has no Rabbit Hole to delete');
  await closeMenu();
  assert.ok(!url().search.includes('hole='), 'opening menus started nothing');
});

await check('2 card: Delete Rabbit Hole asks first; Cancel sends no request, changes nothing and gives the focus back to the card', async () => {
  await rightClick('m-a');
  await menu().locator('[data-menu-delete-rabbit-hole]').click();
  await dialogSays('Hole A: the moon');
  await shot('02-delete-from-card-dialog');
  writes.length = 0;
  await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await page.waitForTimeout(1500);
  assert.deepEqual(writes, [], 'Cancel sent nothing');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-block-id]')?.dataset.blockId || null), 'm-a', 'focus is back on the card');
  assert.deepEqual((await tree(canvas.name)).body.children.map(child => child.name).sort(), [HOLE_A, HOLE_B].sort(), 'both holes kept');
  assert.equal(await page.locator(`[data-dive-portal="${HOLE_A}"]`).count(), 1, 'the portal stays');
  assert.equal(url().pathname, ROOT);
});

await check('3 card: Enter Rabbit Hole opens the linked canvas, and Up returns', async () => {
  await rightClick('m-a');
  await menu().locator('[data-menu-start-rabbit-hole]').click();
  await page.waitForFunction(name => location.pathname.endsWith(name), HOLE_A, { timeout: 15000 });
  await levelLoaded(HOLE_A);
  assert.equal(writes.filter(line => line.includes('/api/canvases/dives')).length, 0, 'entered, nothing made or deleted');
  await page.locator('[data-dive-navigator]').getByRole('button', { name: 'Up to the parent hole' }).click();
  await page.waitForFunction(root => location.pathname === root, ROOT, { timeout: 15000 });
  await page.waitForSelector('[data-block-id="m-a"]', { timeout: 30000 });
  await levelLoaded(canvas.name); await page.waitForTimeout(800);
});

await check('4 card: Yes, delete runs the existing delete for that hole alone; the card stays as a plain card, the sibling hole and the parent stay', async () => {
  await page.locator(`[data-dive-portal="${HOLE_A}"]`).waitFor({ timeout: 15000 });
  await rightClick('m-a');
  await menu().locator('[data-menu-delete-rabbit-hole]').click();
  await dialogSays('Hole A: the moon');
  writes.length = 0;
  await dialog().getByRole('button', { name: 'Yes, delete', exact: true }).click();
  await page.locator(`[data-dive-portal="${HOLE_A}"]`).waitFor({ state: 'detached', timeout: 15000 });
  assert.deepEqual(writes.filter(line => line.includes('/api/canvases/dives')), [`DELETE /api/canvases/dives/${HOLE_A}`], 'one delete, no subtree');
  assert.equal(url().pathname, ROOT, 'a delete from the parent stays on the parent');
  assert.equal((await tree(HOLE_A)).status, 404, 'the hole is gone');
  const root = await tree(canvas.name);
  assert.equal(root.status, 200, 'the parent stays');
  assert.deepEqual(root.body.children.map(child => [child.name, child.origin_block_id]), [[HOLE_B, 'm-b']], 'the sibling stays');
  assert.equal(await page.locator('[data-block-id="m-a"]').count(), 1, 'the card stays');
  assert.equal(await page.locator(`[data-dive-portal="${HOLE_B}"]`).count(), 1, 'the sibling\'s portal stays');
  await rightClick('m-a');
  const names = await rowNames();
  assert.ok(names.includes('Start Rabbit Hole') && !names.includes('Enter Rabbit Hole') && !names.includes('Delete Rabbit Hole'), `no dead link on the card: ${names.join(', ')}`);
  await closeMenu();
  await shot('03-card-deleted-hole');
});

await check('5 inside a kept hole the empty canvas offers Delete Rabbit Hole for it, last', async () => {
  await page.goto(`${BASE}/apps/${HOLE_B}`);
  await page.waitForSelector('[data-canvas-surface]', { timeout: 60000 });
  await levelLoaded(HOLE_B); await page.waitForTimeout(800);
  await rightClickBare();
  const names = await rowNames();
  assert.equal(names.at(-1), 'Delete Rabbit Hole', names.join(', '));
  await shot('04-inside-menu');
});

await check('6 inside: Cancel (and Escape) send no request, change nothing and stay in the hole', async () => {
  await menu().locator('[data-menu-delete-rabbit-hole]').click();
  await dialogSays('Hole B: the bulge');
  await shot('05-delete-from-inside-dialog');
  writes.length = 0;
  await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await rightClickBare();
  await menu().locator('[data-menu-delete-rabbit-hole]').click();
  await dialog().waitFor();
  await page.keyboard.press('Escape');
  await dialog().waitFor({ state: 'detached' });
  await page.waitForTimeout(1500);
  assert.deepEqual(writes, [], 'nothing sent');
  assert.ok(url().pathname.endsWith(HOLE_B), 'still in the hole');
  assert.equal((await tree(HOLE_B)).status, 200, 'the hole is kept');
});

await check('7 inside: Yes, delete deletes the hole open now and goes back to its parent, where its card is a plain card again', async () => {
  await rightClickBare();
  await menu().locator('[data-menu-delete-rabbit-hole]').click();
  await dialogSays('Hole B: the bulge');
  writes.length = 0;
  await dialog().getByRole('button', { name: 'Yes, delete', exact: true }).click();
  await page.waitForFunction(root => location.pathname === root && !location.search.includes('hole='), ROOT, { timeout: 15000 });
  assert.deepEqual(writes.filter(line => line.includes('/api/canvases/dives')), [`DELETE /api/canvases/dives/${HOLE_B}`]);
  await page.waitForSelector('[data-block-id="m-b"]', { timeout: 30000 });
  await levelLoaded(canvas.name); await page.waitForTimeout(800);
  assert.equal((await tree(HOLE_B)).status, 404, 'the hole is gone');
  assert.deepEqual((await tree(canvas.name)).body.children, [], 'the parent stays, with no hole left');
  assert.equal(await page.locator('[data-dive-portal]').count(), 0, 'no portal left');
  await rightClick('m-b');
  const names = await rowNames();
  assert.ok(names.includes('Start Rabbit Hole') && !names.includes('Delete Rabbit Hole'), names.join(', '));
  await closeMenu();
  await shot('06-back-on-the-parent');
});

await check('no page errors, no model call', async () => { assert.deepEqual(errors, []); assert.deepEqual(asks, []); });
await browser.close();
const total = 8;
console.log(`${results.length}/${total} checks passed`);
process.exit(results.length === total ? 0 : 1);
