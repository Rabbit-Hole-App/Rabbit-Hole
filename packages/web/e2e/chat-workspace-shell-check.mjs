// The right-side Chat workspace shell (owner brief 2026-10-13 sections 2-7; agent-coordination/tasks/chat-workspace-CONTRACT.md),
// against the LOCAL stack only: local D1 and a fresh browser profile. No model is called: every model-capable request is
// aborted and counted, and none may happen - nothing here sends. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8851 SMALL_CP=http://127.0.0.1:8853 VARS=<cp .dev.vars> node e2e/chat-workspace-shell-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8851';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8853';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('chat-workspace-shell-check runs against the local stack only');
const SHOTS = process.argv[2] || 'chat-workspace-shots';
mkdirSync(SHOTS, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cws-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const BLOCKS = [
  { id: 'c-a', type: 'explanation', dx: 0, dy: 0, title: 'Card A: tides', body: 'The moon pulls the near ocean more than the Earth.' },
  { id: 'c-c', type: 'explanation', dx: 0, dy: 0, title: 'Card C: springs', body: 'Sun and moon in line make spring tides.' },
];
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Chat workspace ${Date.now().toString(36)}` }) });
const catalog = await api('/api/apps');
const SEEDS = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`]: STATE };

const browser = await chromium.launch();
const errors = [], sent = [];
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
for (const route of ['**/api/learn/ask', '**/api/learn/tutor/plan', '**/api/learn/artifact', '**/api/learn/home-ask']) await context.route(route, handler => { sent.push(handler.request().url()); return handler.abort(); });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const settle = () => page.waitForTimeout(350);

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[data-block-id="c-c"]').waitFor({ timeout: 60000 });
await page.waitForTimeout(1200);
const pane = page.locator('[data-chat-pane]');
const field = () => pane.locator('[data-chat-composer] textarea').first();
const box = async locator => (await locator.boundingBox()) || { x: -1, y: -1, width: 0, height: 0 };

await check('Chat is open by default on the right with one multiline composer, and the canvas dock is gone', async () => {
  await pane.waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await page.locator('[data-learn-dock]').count(), 0, 'no canvas dock');
  assert.equal(await page.locator('[data-chat-composer] textarea:visible').count(), 1, 'exactly one visible main composer');
  const p = await box(pane), c = await box(page.locator('[data-block-id="c-c"]'));
  assert.ok(p.x > c.x, 'Chat sits to the right of the canvas');
  for (const name of ['History', 'New chat', 'Mode', 'Commands']) assert.ok(await pane.getByRole('button', { name, exact: true }).count() >= 1, `${name} control`);
  // Owner brief 2026-10-16 item 6: no Explore codebase or Open Context shortcut in the composer (the panel header's one control
  // opens Context, Files and Graph); its + menu's upload entry reads exactly "Upload Context", with the upload icon.
  const composer = pane.locator('[data-chat-composer]');
  assert.equal(await composer.locator('[data-chat-sources], [data-explore-codebase], button[aria-label="Context"], button[aria-label="Explore codebase"]').count(), 0, 'no Context or Explore codebase shortcut');
  await composer.getByRole('button', { name: 'Add', exact: true }).click();
  const upload = pane.locator('[data-upload-context]');
  await upload.waitFor({ state: 'visible', timeout: 5000 });
  assert.equal((await upload.innerText()).trim(), 'Upload Context');
  assert.equal(await upload.locator('svg').count(), 1, 'the upload icon stays');
  await page.keyboard.press('Escape');
  await upload.waitFor({ state: 'hidden', timeout: 5000 });
});
await shot('01-chat-alone');

await check('modes switch without touching the draft; the / slot is separate', async () => {
  await field().fill('my own words, unsent');
  await pane.getByRole('button', { name: 'Mode', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Ask/ }).click();
  await settle();
  assert.equal(await field().inputValue(), 'my own words, unsent');
  await pane.getByRole('button', { name: 'Mode', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Tutor/ }).click();
  await settle();
  assert.equal(await field().inputValue(), 'my own words, unsent');
  assert.match(await pane.getByRole('button', { name: 'Mode', exact: true }).innerText(), /Tutor/);
  assert.equal(await pane.getByRole('button', { name: 'Commands', exact: true }).innerText().then(text => text.trim()), '/', 'the command slot reads /');
});

await check('Add to chat attaches the card to Chat in Ask, keeps the draft, focuses the composer and sends nothing', async () => {
  await page.locator('[data-block-id="c-c"] [data-drag-zone]').last().click({ position: { x: 12, y: 8 }, force: true });
  await settle();
  await page.getByRole('button', { name: 'Add to chat', exact: true }).click();
  await settle();
  assert.ok(await pane.locator('[data-context-chip]').count() >= 1, 'a chip in Chat');
  assert.match(await pane.getByRole('button', { name: 'Mode', exact: true }).innerText(), /Ask/, 'mode is Ask');
  assert.equal(await field().inputValue(), 'my own words, unsent', 'the draft is kept');
  assert.ok(await field().evaluate(node => node === document.activeElement), 'the composer has the focus');
  assert.equal(sent.length, 0, `nothing was sent: ${sent.join()}`);
});

await check('a chip opens its source in the Context tab of the same panel, and back on Chat the draft is kept', async () => {
  await pane.locator('[data-context-chip]').last().click();
  await settle();
  const sources = page.locator('[data-sources-pane]');
  await sources.waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await page.locator('[data-companion-view="context"]').getAttribute('aria-pressed'), 'true', 'the companion column shows Context');
  assert.equal(await page.locator('[data-pane-switch]').count(), 0, 'no Chat | Sources switch');
  await shot('02-context-tab');
  await page.locator('[data-panel-tab="chat"]').click();
  await settle();
  assert.ok(await pane.isVisible(), 'Chat is back');
  assert.equal(await field().inputValue(), 'my own words, unsent', 'opening a source keeps the draft');
});

await check('History opens a list inside Chat; New chat starts a fresh conversation without deleting the canvas cards', async () => {
  await pane.getByRole('button', { name: 'History', exact: true }).click();
  await page.locator('[data-chat-history-search]').waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await settle();
  await pane.getByRole('button', { name: 'New chat', exact: true }).click();
  await settle();
  assert.match(await pane.locator('[data-chat-title]').innerText(), /New chat/);
  // Owner decision 1a (2026-10-20, Tutor workflow): the mode is the learner's canvas preference, not a thread's, so New chat
  // keeps it (Ask, from Add to chat above); a canvas with no saved choice starts in Auto.
  assert.match(await pane.getByRole('button', { name: 'Mode', exact: true }).innerText(), /Ask/, 'a new chat keeps the canvas mode');
  assert.equal(await page.locator('[data-block-id="c-c"]').count(), 1, 'the canvas card is still there');
});

await check('narrow: one navigation row, no page-wide horizontal scroll, the draft survives Context and back', async () => {
  await field().fill('narrow draft');
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.waitForTimeout(800);
  await pane.locator('[data-context-chip]').first().click().catch(() => {});
  await settle();
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(scroll <= 1, `no horizontal page scroll (${scroll}px)`);
  assert.equal(await page.locator('[data-panel-header]').count(), 1, 'one navigation row');
  assert.equal(await page.locator('[data-pane-switch]').count(), 0, 'no Chat | Sources switch');
  const chatTab = page.locator('[data-panel-tab="chat"]');
  if (await chatTab.getAttribute('aria-selected') !== 'true') {
    await shot('03-narrow-context');
    await chatTab.click();
    await settle();
  }
  assert.equal(await field().inputValue(), 'narrow draft', 'the draft survives');
});
await shot('04-narrow-chat');

assert.equal(sent.length, 0, `no model-capable request: ${sent.join()}`);
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
console.log(`PASS ${results.length} checks`);
await browser.close();
