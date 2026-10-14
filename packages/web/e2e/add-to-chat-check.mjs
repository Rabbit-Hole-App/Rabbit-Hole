// Add to chat (owner brief 2026-10-13: "rename Ask in chat to Add to chat (ctrl + L) ...", docs/features/selection-action-bar.md), against
// the LOCAL stack only: local D1 and fresh browser profiles. The real composer and its context chip. No model is called: every
// model-capable request is aborted and counted, and none may happen - Add to chat never sends. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/add-to-chat-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('add-to-chat-check runs against the local stack only');
const SHOTS = process.argv[2] || 'add-to-chat-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `atc-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const shape = (id, x, y, extra = {}) => ({ id, kind: 'rect', x1: x, y1: y, x2: x + 150, y2: y + 70, color: '#2383e2', width: 2, dash: 'solid', fill: '#e8f0fe', opacity: 1, round: true, ...extra });
const BLOCKS = [
  { id: 'c-a', type: 'explanation', dx: 0, dy: 0, title: 'Card A: tides', body: 'The moon pulls the near ocean more than the Earth.', groupId: 'g1' },
  { id: 'c-b', type: 'explanation', dx: 0, dy: 0, title: 'Card B: bulges', body: 'Two bulges, one on each side of the Earth.', groupId: 'g1' },
  { id: 'c-c', type: 'explanation', dx: 0, dy: 0, title: 'Card C: springs', body: 'Sun and moon in line make spring tides.' },
];
const STATE = { strokes: [], shapes: [shape('s-1', 140, 760, { text: 'Gate' }), shape('s-2', 140, 900, { text: 'Latch' })], items: [], links: [], groups: [{ id: 'g1', label: 'Pair' }], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Add to chat ${Date.now().toString(36)}` }) });
const catalog = await api('/api/apps');
const SEEDS = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`]: STATE };

const browser = await chromium.launch();
const errors = [], sent = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
// A question the learner has not sent never leaves: any model-capable request is refused and counted.
for (const route of ['**/api/learn/ask', '**/api/learn/tutor/plan', '**/api/learn/artifact', '**/api/learn/home-ask']) await context.route(route, handler => { sent.push(handler.request().url()); return handler.abort(); });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[data-block-id="c-c"]').waitFor({ timeout: 60000 });
await page.waitForTimeout(1200);

const composer = () => page.locator('[data-canvas-composer] input:not([type="file"]), [data-canvas-composer] textarea').first();
const chips = () => page.locator('[data-canvas-target]');
const strip = id => page.locator(`[data-block-id="${id}"] [data-drag-zone]`).last();
const selectedCards = () => page.$$eval('[data-block-id][aria-current="true"]', nodes => nodes.map(node => node.dataset.blockId));
const settle = () => page.waitForTimeout(350);
const clearAll = async () => { await page.keyboard.press('Escape'); await page.mouse.click(1350, 330); await settle(); };
// Pan (wheel) until the thing sits in the open middle of the canvas, clear of the composer and the tools.
const reveal = async locator => {
  const view = page.viewportSize();
  for (let i = 0; i < 8; i += 1) {
    const b = await locator.boundingBox();
    if (b && b.y > 120 && b.y + b.height < view.height - 220 && b.x > 120 && b.x + b.width < view.width - 120) return b;
    const dy = b ? b.y + b.height / 2 - view.height * 0.4 : 0, dx = b ? b.x + b.width / 2 - view.width * 0.5 : 0;
    await page.mouse.move(view.width * 0.88, view.height * 0.5); await page.mouse.wheel(Math.round(dx), Math.round(dy)); // over empty canvas: over a card the wheel scrolls the card
    await page.waitForTimeout(150);
  }
  return locator.boundingBox();
};
const clickShape = async (id, modifiers = []) => { const b = await reveal(page.locator(`[data-shape-id="${id}"]`).first()); for (const key of modifiers) await page.keyboard.down(key); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); for (const key of modifiers) await page.keyboard.up(key); await settle(); };
const clickCard = async (id, modifiers = []) => { await reveal(page.locator(`[data-block-id="${id}"]`)); await strip(id).click({ position: { x: 12, y: 8 }, modifiers, force: true }); await settle(); }; // force: a group's box lies over its cards, and the press lands on it, as a real one does
const addToChat = () => page.getByRole('button', { name: 'Add to chat', exact: true });

await check('a typed draft, a selected card: Add to chat gives one chip, keeps the draft, sends nothing, keeps the selection, focuses the composer', async () => {
  await composer().fill('my own words, unsent');
  await clickCard('c-c');
  assert.equal(await addToChat().count(), 1, 'one Add to chat on the selected card');
  assert.equal(await page.locator('[data-selection-bar]:visible').count(), 1, 'one bar');
  await addToChat().click();
  await settle();
  assert.equal(await chips().count(), 1, 'one chip');
  assert.equal(await page.locator('[data-selected-card="c-c"]').count(), 1, 'the chip is the card\'s');
  assert.equal(await composer().inputValue(), 'my own words, unsent', 'the draft is exactly what it was: no question written');
  assert.deepEqual(await selectedCards(), ['c-c'], 'the selection stays');
  assert.ok(await composer().evaluate(node => node === document.activeElement), 'the composer has the focus');
  assert.equal(sent.length, 0, `nothing was sent: ${sent.join()}`);
});
await shot('01-card-chip-and-draft');

await check('the chip is removable', async () => {
  await page.getByRole('button', { name: 'Remove selected card context' }).click();
  await settle();
  assert.equal(await chips().count(), 0);
});

await check('a hidden composer comes back, with its draft, when Add to chat is pressed', async () => {
  await clickCard('c-a');
  await page.locator('[data-composer-hide]').click();
  assert.equal(await page.locator('[data-canvas-composer][data-composer-hidden]').count(), 1, 'hidden');
  await clickShape('s-1');
  await addToChat().click();
  await settle();
  assert.equal(await page.locator('[data-canvas-composer][data-composer-hidden]').count(), 0, 'revealed');
  assert.equal(await composer().inputValue(), 'my own words, unsent');
  assert.ok(await composer().evaluate(node => node === document.activeElement), 'and focused');
  assert.equal(await chips().count(), 1, 'one chip for the shape');
  assert.equal(sent.length, 0);
});
await shot('02-shape-chip-composer-revealed');

await check('a group is ONE chip, named Group: <name>; several objects are ONE chip with their count', async () => {
  await clearAll();
  await clickCard('c-a');
  assert.deepEqual((await selectedCards()).sort(), ['c-a', 'c-b'], 'a plain click picks the group');
  assert.equal(await page.locator('[data-selection-bar]:visible').count(), 1, 'one bar for the group');
  await addToChat().click();
  await settle();
  assert.equal(await chips().count(), 1);
  assert.match(await chips().innerText(), /Group: Pair/);
  await shot('03-group-chip');
  await clearAll();
  await clickShape('s-1');
  await clickShape('s-2', ['Shift']);
  assert.equal(await page.locator('[data-selection-bar]:visible').count(), 1, 'one bar for two shapes');
  await addToChat().click();
  await settle();
  assert.equal(await chips().count(), 1);
  assert.match(await chips().innerText(), /2 items/);
  await shot('04-selection-chip');
  assert.equal(sent.length, 0);
});

// Ctrl/Cmd+L: with a selection and the focus on the canvas it is Add to chat (the browser's own Ctrl+L is prevented only then); in the
// composer's field, or with nothing selected, it is left alone.
await check('Ctrl+L adds the selection from the keyboard; inside the composer it does nothing', async () => {
  await clearAll();
  await page.getByRole('button', { name: 'Clear block selection' }).click().catch(() => {});
  await clickShape('s-2');
  await composer().evaluate(node => node.blur());
  const press = init => page.evaluate(init => { const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); (document.activeElement || document.body).dispatchEvent(event); return event.defaultPrevented; }, init);
  const before = await chips().count();
  assert.equal(await press({ key: 'l', ctrlKey: true }), true, 'prevented: the app takes Ctrl+L');
  await settle();
  assert.equal(await chips().count(), 1, `one chip after Ctrl+L (had ${before})`);
  assert.ok(await composer().evaluate(node => node === document.activeElement), 'the composer has the focus');
  // Now typing in the composer: Ctrl+L is the browser's again.
  const chipBefore = await chips().innerText();
  assert.equal(await press({ key: 'l', ctrlKey: true }), false, 'not prevented in the composer\'s field');
  assert.equal(await chips().innerText(), chipBefore);
  assert.equal(sent.length, 0);
});

await check('no browser runtime errors, and nothing was ever sent', async () => {
  assert.deepEqual(errors, []);
  assert.equal(sent.length, 0);
});
await browser.close();
console.log(`${results.length} checks passed`);
