// The canvas's right panel header (docs/features/panel-header.md): Find, Table of contents and a Comments placeholder
// as icon tabs, then Pin and Close; a real find that frames and selects a card off screen. Against the LOCAL stack
// only: local D1 and fresh browser profiles. No model is called: /api/learn/ask is answered here and any other model
// route fails the run. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8888 SMALL_CP=http://127.0.0.1:8889 node e2e/panel-header-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8888';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8889';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('panel-header-check runs against the local stack only');
const SHOTS = process.argv[2] || 'panel-header-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`panel-owner-${run}@example.com`, `panel_${run}`) };
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${owner.session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };

// A section, two salt cards near the top, filler, and one card far down the column that only a find brings into view.
const filler = Array.from({ length: 8 }, (_, i) => ({ id: `k-fill-${i}`, type: 'explanation', dx: 0, dy: 0, title: `Filler card ${i + 1}`, body: 'Water molecules slow down and line up as they cool. '.repeat(6) }));
const BLOCKS = [
  { id: 'k-head', type: 'heading', dx: 0, dy: 0, level: 1, text: 'Kitchen chemistry' },
  { id: 'k-exp', type: 'explanation', dx: 0, dy: 0, title: 'Why salt melts ice', body: 'Salt dissolves into the thin film of water on ice and lowers its freezing point.' },
  { id: 'k-quiz', type: 'quiz', dx: 0, dy: 0, question: 'What does SALT do to the freezing point of water?', options: [{ key: 'A', text: 'Lowers it', correct: true }, { key: 'B', text: 'Raises it' }] },
  ...filler,
  { id: 'k-far', type: 'explanation', dx: 0, dy: 0, title: 'Zephyr ice cream', body: 'Churning while it freezes keeps the ice crystals small.' },
];
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Panel header ${run}` }) })).body;
const catalog = (await api('/api/apps')).body;
const inkKey = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
await context.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, [inkKey, STATE]);
const asks = [], stray = [], errors = [], hookBases = [];
await context.route('**/api/learn/ask', route => { asks.push(route.request().url()); return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'event: done\ndata: {}\n\n' }); });
await context.route(/\/api\/learn\/(tutor(?!\/next-steps)|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); stray.push(route.request().url()); return route.abort(); });
// Professor Next Steps (#46): opening the canvas asks for hooks. The request goes to the real route, whose planner the gate
// stack answers at the provider boundary with the journey fixture (e2e/provider-tripwire.js); its basis is recorded so the
// check holds it to the eligibility rules (docs/features/professor-next-steps.md §2.3).
// Counted per page load: check 12's reload is a fresh page, which may ask for its basis again (the server cache answers it).
let load = 0;
await context.route(/\/api\/learn\/tutor\/next-steps$/, route => { hookBases.push({ load, basis: JSON.parse(route.request().postData() || '{}')?.input?.basis ?? null }); return route.continue(); });
const page = await context.newPage();
page.on('domcontentloaded', () => { load++; }); // full document loads only, never an in-app route change
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const panel = () => page.locator('aside[aria-label="Learn agent chat"]');
const shot = async (name, clip = null) => {
  await page.waitForTimeout(400);
  const box = clip ? await clip.boundingBox() : null;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, ...(box ? { clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } } : {}) });
  console.log('shot', name);
};
const tab = name => page.getByRole('tab', { name, exact: true });
const card = id => page.locator(`[data-block-id="${id}"]`);
const isOpen = async () => (await page.getByRole('button', { name: 'Hide the right panel' }).count()) === 1;
const openPanel = async () => { if (!(await isOpen())) await page.getByRole('button', { name: 'Show the right panel' }).click(); await page.waitForTimeout(500); };
const selected = async () => page.locator('[role="tab"][aria-selected="true"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-panel-tab')));
const findInput = () => page.getByRole('textbox', { name: 'Find text on canvas' });
const count = () => page.locator('[data-find-count]').innerText();
const inCanvas = async id => {
  const frame = await page.locator('[data-canvas-surface]').boundingBox(), box = await card(id).boundingBox();
  return box.y >= frame.y && box.y + Math.min(box.height, 60) <= frame.y + frame.height && box.x >= frame.x && box.x + box.width <= frame.x + frame.width;
};
// A press on the canvas surface beside the cards: no card, no chrome.
const pressCanvas = async () => {
  const box = await card('k-exp').boundingBox();
  await page.mouse.click(box.x + box.width + 120, box.y + 20);
  await page.waitForTimeout(500);
};

await page.goto(`${BASE}/apps/${canvas.name}`);
await card('k-exp').waitFor({ timeout: 60000 });
await page.waitForTimeout(2500); // past the 1200 ms hook debounce
const hooksAtOpen = hookBases.length;

await check('1 the header is five icon buttons in the owner\'s order, no visible text', async () => {
  await openPanel();
  const header = page.locator('[data-panel-header]');
  const names = await header.locator('button').evaluateAll(nodes => nodes.map(node => [node.getAttribute('aria-label'), node.getAttribute('title')]));
  assert.deepEqual(names, [['Find text on canvas', 'Find text on canvas'], ['Table of contents', 'Table of contents'], ['Comments', 'Comments'], ['Keep sidebar open', 'Keep sidebar open'], ['Close sidebar', 'Close sidebar']]);
  assert.equal((await header.innerText()).trim(), '', 'icons only');
  assert.equal(await header.locator('button svg').count(), 5);
  assert.equal(await page.locator('[data-panel-header] [role="tablist"] [role="tab"]').count(), 3, 'the three tabs share one group');
  assert.equal(await page.locator('[data-panel-header] [role="tablist"] [data-panel-pin], [data-panel-header] [role="tablist"] [data-panel-close]').count(), 0, 'Pin and Close sit outside it');
});

await check('2 Table of contents is the default tab: violet with a white icon, its outline below the header', async () => {
  assert.deepEqual(await selected(), ['toc']);
  const [bg, fg] = await tab('Table of contents').evaluate(node => [getComputedStyle(node).backgroundColor, getComputedStyle(node).color]);
  assert.deepEqual([bg, fg], ['rgb(91, 33, 182)', 'rgb(255, 255, 255)']);
  assert.equal(await tab('Find text on canvas').evaluate(node => getComputedStyle(node).color) === 'rgb(255, 255, 255)', false, 'inactive icons are neutral');
  assert.ok(await panel().locator('[data-toc]').isVisible());
  assert.ok(await panel().getByRole('button', { name: 'Kitchen chemistry', exact: true }).isVisible(), 'the canvas heading is listed');
  assert.equal(await panel().locator('[data-canvas-find]').isVisible(), false);
});
await shot('01-header-toc-active', panel());
await shot('01b-page-toc-active');

// Comments is live on a saved canvas (docs/features/canvas-comments.md); comments-check.mjs covers the view itself.
await check('3 Comments selects on a saved canvas and shows the Comments view; the Table of contents comes back', async () => {
  const comments = tab('Comments');
  assert.equal(await comments.getAttribute('aria-disabled'), null);
  await comments.click();
  await page.locator('[data-comments-panel]').waitFor();
  assert.deepEqual(await selected(), ['comments']);
  await tab('Table of contents').click();
  assert.deepEqual(await selected(), ['toc']);
});
await shot('02-comments-tab', page.locator('[data-panel-header]'));

await check('4 one tab at a time: Find replaces the outline and takes the typing focus', async () => {
  await tab('Find text on canvas').click();
  await page.waitForTimeout(200);
  assert.deepEqual(await selected(), ['find']);
  assert.ok(await panel().locator('[data-canvas-find]').isVisible());
  assert.equal(await panel().locator('[data-toc]').isVisible(), false);
  assert.equal(await findInput().evaluate(node => node === document.activeElement), true);
});

await check('5 arrow keys move between the enabled tabs, Comments included on a saved canvas, and wrap', async () => {
  await tab('Find text on canvas').focus();
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selected(), ['toc']);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selected(), ['comments']);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selected(), ['find'], 'wraps');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await selected(), ['toc']);
  assert.equal(await tab('Table of contents').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('ArrowLeft');
  assert.deepEqual(await selected(), ['find']);
});

await check('6 find matches case-insensitively, one row per card, with a count', async () => {
  await findInput().fill('salt');
  await page.waitForTimeout(200);
  assert.equal(await count(), '2 found');
  assert.deepEqual(await page.locator('[data-find-match]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-find-match'))), ['k-exp', 'k-quiz']);
  assert.deepEqual(await page.locator('[data-find-match] mark').allInnerTexts(), ['salt', 'SALT']);
});

await check('7 Enter and Next frame and select each match in turn; Previous goes back', async () => {
  await findInput().press('Enter');
  await page.waitForTimeout(700);
  assert.equal(await count(), '1 of 2');
  assert.equal(await card('k-exp').getAttribute('aria-current'), 'true');
  await page.getByRole('button', { name: 'Next match' }).click();
  await page.waitForTimeout(700);
  assert.equal(await count(), '2 of 2');
  assert.equal(await card('k-quiz').getAttribute('aria-current'), 'true');
  assert.notEqual(await card('k-exp').getAttribute('aria-current'), 'true', 'one selection');
  await page.getByRole('button', { name: 'Previous match' }).click();
  await page.waitForTimeout(700);
  assert.equal(await count(), '1 of 2');
});

await check('8 a real find brings a card from off screen into view and selects it', async () => {
  assert.equal(await inCanvas('k-far'), false, 'starts below the visible canvas');
  await findInput().fill('zephyr');
  await page.waitForTimeout(200);
  assert.equal(await count(), '1 found');
  await findInput().press('Enter');
  await page.waitForTimeout(900);
  assert.equal(await card('k-far').getAttribute('aria-current'), 'true');
  assert.equal(await inCanvas('k-far'), true);
});

await check('8b a click on a match row frames that card: back up the column to the first salt card', async () => {
  assert.equal(await inCanvas('k-exp'), false, 'framing the far card moved the first one out of view');
  await findInput().fill('ice');
  await page.waitForTimeout(200);
  const rows = await page.locator('[data-find-match]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-find-match')));
  assert.deepEqual(rows, ['k-exp', 'k-far']);
  await page.locator('[data-find-match="k-exp"]').click();
  await page.waitForTimeout(900);
  assert.equal(await count(), '1 of 2');
  assert.equal(await page.locator('[data-find-match="k-exp"]').getAttribute('aria-current'), 'true');
  assert.equal(await card('k-exp').getAttribute('aria-current'), 'true');
  assert.equal(await inCanvas('k-exp'), true);
});
await shot('03-find-active-matches');
await shot('03b-find-panel', panel());

await check('9 Escape in the find input clears it', async () => {
  await findInput().focus();
  await page.keyboard.press('Escape');
  assert.equal(await findInput().inputValue(), '');
  assert.equal(await count(), '');
  assert.equal(await page.locator('[data-find-match]').count(), 0);
  assert.ok(await isOpen(), 'and leaves the panel open');
});

await check('10 pinned by default: a press on the canvas keeps the panel open', async () => {
  const pin = page.locator('[data-panel-pin]');
  assert.equal(await pin.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('small.learn-panel:pinned')), null, 'nothing stored until the learner chooses');
  await tab('Table of contents').click();
  await pressCanvas();
  assert.ok(await isOpen());
});
await shot('04a-pinned', page.locator('[data-panel-header]'));

await check('11 unpinned: the choice is stored, a find row keeps the panel, a press on the canvas closes it', async () => {
  await page.locator('[data-panel-pin]').click();
  assert.equal(await page.locator('[data-panel-pin]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('small.learn-panel:pinned')), 'false');
  await shot('04b-unpinned', page.locator('[data-panel-header]'));
  await tab('Find text on canvas').click();
  await findInput().fill('salt');
  await page.locator('[data-find-match="k-quiz"]').click();
  await page.waitForTimeout(700);
  assert.ok(await isOpen(), 'working in the panel is not a press on the canvas');
  assert.equal(await card('k-quiz').getAttribute('aria-current'), 'true');
  await pressCanvas();
  assert.equal(await isOpen(), false);
});

await check('12 the pin choice survives a reload', async () => {
  await page.reload();
  await card('k-exp').waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await openPanel();
  assert.equal(await page.locator('[data-panel-pin]').getAttribute('aria-pressed'), 'false');
  await page.locator('[data-panel-pin]').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('small.learn-panel:pinned')), 'true');
});

await check('13 Close shuts the panel and changes no canvas content', async () => {
  await page.waitForTimeout(600);
  const before = await page.evaluate(key => JSON.stringify(JSON.parse(localStorage.getItem(key)).blocks.map(block => [block.id, block.title || block.text || block.question])), inkKey);
  const cards = await page.locator('[data-block-id]').count();
  await page.locator('[data-panel-close]').click();
  await page.waitForTimeout(700);
  assert.equal(await isOpen(), false);
  assert.equal(await page.locator('[data-block-id]').count(), cards);
  const after = await page.evaluate(key => JSON.stringify(JSON.parse(localStorage.getItem(key)).blocks.map(block => [block.id, block.title || block.text || block.question])), inkKey);
  assert.equal(after, before);
});
await shot('05-closed');

await check('no model route was called and no page error', async () => {
  assert.deepEqual(asks, []);
  assert.deepEqual(stray, []);
  assert.deepEqual(errors, []);
});

await check('the canvas asked for hooks once on open, and nothing the panel did asked again (§2.3: never on selection, camera or panel)', async () => {
  const perLoad = Object.groupBy(hookBases, request => request.load);
  console.log(`hook requests: ${hookBases.length} (${hooksAtOpen} on open) by page load: ${JSON.stringify(Object.fromEntries(Object.entries(perLoad).map(([n, list]) => [n, list.map(r => r.basis)])))}`);
  assert.equal(hooksAtOpen, 1, 'one hook request for the opened canvas');
  assert.equal(perLoad[hookBases[0].load].length, 1, 'find, tabs, pin and close are not recompute triggers');
  for (const list of Object.values(perLoad)) assert.equal(new Set(list.map(r => r.basis)).size, list.length, 'never the same basis twice in one page');
  assert.ok(Object.values(perLoad).every(list => list.length === 1), 'one request per page load (check 12 reloads once)');
  assert.ok(hookBases.every(({ basis }) => /^nb_[0-9a-f]{8}$/.test(basis)), 'an owned basis');
});

await browser.close();
console.log(`${results.length}/16 checks passed`);
process.exit(results.length === 16 ? 0 : 1);
