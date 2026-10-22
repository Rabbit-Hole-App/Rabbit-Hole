// UI-25 per-type right-click rows (lane U2; owner brief C:/s/spec/share/brief-ui25.md section 2; rows in
// src/canvas-actions-types.js, capability list C:/s/spec/share/ui25-capabilities.md), against the LOCAL stack only: local D1
// and fresh browser profiles. No model is called and nothing runs: /api/learn/ask and every generation route are aborted
// and counted, so opening and dismissing menus is proven to call none. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/canvas-type-menu-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-type-menu-check runs against the local stack only');
const SHOTS = process.argv[2] || 'canvas-type-menu-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const run = Date.now().toString(36);
const owner = { session: await sessionFor(`ctm-owner-${run}@example.com`, `ctm_${run}`) };
const api = async (who, path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json' } });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const BLOCKS = [
  { id: 't-exp', type: 'explanation', dx: 0, dy: 0, title: 'Tides', body: 'The moon pulls the near ocean more than the Earth.' },
  { id: 't-py', type: 'snippet', dx: 0, dy: 0, title: 'Loop', language: 'python', code: 'for i in range(3):\n    print(i)' },
  { id: 't-js', type: 'snippet', dx: 0, dy: 0, title: 'Log', language: 'javascript', code: 'console.log(1)' },
  { id: 't-head', type: 'heading', dx: 0, dy: 0, title: 'Part one' },
];
const ITEMS = [
  { id: 't-eq', kind: 'equation', x: 1100, y: 120, latex: 'e^{i\\pi}+1=0' },
  { id: 't-note', kind: 'sticky', x: 1100, y: 300, text: 'Spring tide', color: 'yellow' },
];
const SHAPES = [{ id: 't-rect', kind: 'rect', x1: 1100, y1: 560, x2: 1260, y2: 640, color: '#2383e2', width: 2, dash: 'solid', fill: '#e8f0fe', opacity: 1, round: true }];
const STATE = { strokes: [], shapes: SHAPES, items: ITEMS, links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Menus ${run}` }) })).body;
const catalog = (await api(owner, '/api/apps')).body;
const SEEDS = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`]: STATE };

const browser = await chromium.launch();
const errors = [], calls = [];
// Every model-capable or job route: a menu opening or closing must reach none of them.
const GUARDED = /\/api\/learn\/(ask|tutor|explain|cad|motion|scene|video|webpages|tts|inline|coaching|equation)/;
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
await context.route(GUARDED, route => { if (route.request().method() !== 'GET') calls.push(route.request().url()); return route.request().method() === 'GET' ? route.continue() : route.abort(); });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));

const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const menu = () => page.locator('[data-canvas-menu]');
const rowsText = async () => (await menu().locator('[role="menuitem"], [role="menuitemcheckbox"]').evaluateAll(items => items.map(item => (item.querySelector(':scope > span') || item).innerText.split('\n')[0].trim())));
const closeMenu = async () => { await page.keyboard.press('Escape'); await menu().waitFor({ state: 'detached' }); };
const strip = id => page.locator(`[data-block-id="${id}"] [data-drag-zone]`).last();
const rightClickCard = async id => { await strip(id).click({ button: 'right', position: { x: 30, y: 10 } }); await menu().waitFor(); };
const rightClickItem = async (selector, position = { x: 20, y: 20 }) => { await page.locator(selector).first().click({ button: 'right', position }); await menu().waitFor(); };
const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.waitForSelector('[data-block-id="t-exp"]', { timeout: 60000 });
await page.waitForTimeout(1200);

await check('1 a content card: Start Rabbit Hole and Copy text of the card itself', async () => {
  await rightClickCard('t-exp');
  const rows = await rowsText();
  for (const label of ['Start Rabbit Hole', 'Copy text']) assert.ok(rows.includes(label), `${label} in ${rows.join(', ')}`);
  for (const label of ['Copy code', 'Edit LaTeX', 'Open in notebook']) assert.ok(!rows.includes(label), `no ${label} on an explanation`);
  await shot('01-explanation');
  await menu().locator('[data-menu-copy-text]').click();
  await menu().waitFor({ state: 'detached' });
  assert.match(await clipboard(), /The moon pulls the near ocean/);
});

await check('1b selected text in a card: Copy selected text copies the selection, not the card', async () => {
  const body = page.locator('[data-block-id="t-exp"]').getByText('near ocean', { exact: false }).first();
  // Select the words, then right-click on them (the selection's own rectangle), as a learner does.
  const box = await body.evaluate(node => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && !text.textContent.includes('near ocean')) text = walker.nextNode();
    const at = text.textContent.indexOf('near ocean');
    const range = document.createRange(); range.setStart(text, at); range.setEnd(text, at + 'near ocean'.length);
    const picked = getSelection(); picked.removeAllRanges(); picked.addRange(range);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await menu().waitFor({ timeout: 8000 }).catch(async problem => { await shot('1b-no-menu'); throw problem; });
  const rows = await rowsText();
  assert.ok(rows.includes('Copy selected text') && rows.includes('Add selection to chat'), rows.join(', '));
  await menu().locator('[data-menu-copy-selection]').click();
  assert.equal(await clipboard(), 'near ocean');
});

await check('2 code: Copy code and Open in notebook for Python; JavaScript keeps the row disabled with its reason', async () => {
  await rightClickCard('t-py');
  assert.ok((await rowsText()).includes('Copy code'));
  assert.equal(await menu().locator('[data-menu-open-notebook]').isDisabled(), false);
  await menu().locator('[data-menu-copy-code]').click();
  assert.equal(await clipboard(), 'for i in range(3):\n    print(i)');
  await rightClickCard('t-js');
  const row = menu().locator('[data-menu-open-notebook]');
  assert.ok(await row.isDisabled(), 'disabled, name kept');
  assert.match(await row.innerText(), /Open in notebook[\s\S]*Notebooks run Python only/);
  await shot('02-code-js');
  await closeMenu();
});

await check('3 a heading: Mark done and Present from here, no Start Rabbit Hole', async () => {
  await rightClickCard('t-head');
  const rows = await rowsText();
  assert.ok(rows.includes('Mark done') && rows.includes('Present from here'), rows.join(', '));
  assert.ok(!rows.includes('Start Rabbit Hole'));
  await closeMenu();
});

await check('4 an equation: Edit LaTeX opens its editor, Copy LaTeX copies the formula, Size M is checked', async () => {
  await rightClickItem('[data-item-id="t-eq"]', { x: 10, y: 10 });
  const rows = await rowsText();
  for (const label of ['Edit LaTeX', 'Copy LaTeX', 'Size S', 'Size M', 'Size L', 'Size XL']) assert.ok(rows.includes(label), `${label} in ${rows.join(', ')}`);
  assert.ok(!rows.includes('Start Rabbit Hole'));
  assert.equal(await menu().locator('[role="menuitemcheckbox"][aria-checked="true"]').innerText().then(text => text.split('\n')[0].trim()), 'Size M');
  await shot('04-equation');
  await menu().locator('[data-menu-copy-latex]').click();
  assert.equal(await clipboard(), 'e^{i\\pi}+1=0');
  await rightClickItem('[data-item-id="t-eq"]', { x: 10, y: 10 });
  await menu().locator('[data-menu-edit-latex]').click();
  await page.locator('[data-item-id="t-eq"][data-equation="editing"]').waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.mouse.click(700, 860);
  await page.waitForTimeout(300);
});

await check('5 a sticky note: Edit text, Style and Copy text, no card rows', async () => {
  await rightClickItem('[data-item-id="t-note"]', { x: 30, y: 30 });
  const rows = await rowsText();
  for (const label of ['Edit text', 'Style', 'Copy text']) assert.ok(rows.includes(label), `${label} in ${rows.join(', ')}`);
  assert.ok(!rows.includes('Start Rabbit Hole'));
  await menu().locator('[data-menu-copy-text]').click();
  assert.equal(await clipboard(), 'Spring tide');
});

await check('6 a shape: Edit text and Style; Style opens the existing style panel', async () => {
  await rightClickItem('[data-shape-id="t-rect"]', { x: 40, y: 30 });
  const rows = await rowsText();
  assert.ok(rows.includes('Edit text') && rows.includes('Style'), rows.join(', '));
  await menu().locator('[data-menu-style]').click();
  await page.locator('[data-style-panel]').waitFor({ timeout: 5000 });
  await shot('06-shape-style');
  await page.keyboard.press('Escape');
});

await check('7 the empty canvas: Add text, Add sticky note and Fit canvas; a note lands where the menu opened', async () => {
  const s = await page.locator('[data-canvas-surface]').boundingBox();
  const at = { x: s.x + s.width / 2 + 80, y: s.y + s.height - 160 };
  const before = await page.locator('[data-item-id]').count();
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await menu().waitFor();
  const rows = await rowsText();
  for (const label of ['Add text', 'Add sticky note', 'Fit canvas']) assert.ok(rows.includes(label), `${label} in ${rows.join(', ')}`);
  await shot('07-empty-canvas');
  await menu().locator('[data-menu-add-sticky]').click();
  await page.waitForFunction(count => document.querySelectorAll('[data-item-id]').length === count + 1, before, { timeout: 5000 });
  await page.keyboard.press('Escape');
});

await check('no page errors; opening and dismissing menus made no model, job or execution call', async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(calls, []);
});
await browser.close();
const total = 9;
console.log(`${results.length}/${total} checks passed`);
process.exit(results.length === total ? 0 : 1);
