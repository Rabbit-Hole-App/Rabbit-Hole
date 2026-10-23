// Card size (owner, 2026-10-22: "Add a Card size slider beside Filters and Sort, from Small to Large ... remember the setting across
// these pages and after reload; resize the card grid only, not the whole page. Keep Start a rabbit hole as the creation button") and
// the removed composer ("Remove the composer completely from Home, Library and Explore ... Chat remains inside canvases"), against
// the LOCAL stack only. No model call: nothing here asks one, and every /api/ask and /api/learn/ask is refused and counted.
//   BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/card-size-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || process.env.PRACTICE_BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('card-size-check runs against the local stack only');
const SHOTS = process.argv[2] || 'card-size-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cardsize-${run}@example.com`, secret, handle: `cs_${run}` }) })).json();
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const made = [];
for (let i = 1; i <= 4; i++) { const c = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Size canvas ${i} ${run}` }) })).body; assert.ok(c?.name, 'a canvas was created'); made.push(c); }

const browser = await chromium.launch();
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const asks = [], errors = [];
const fresh = async (viewport = { width: 1440, height: 900 }, init = null) => {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  if (init) await context.addInitScript(init);
  await context.route(/\/api\/(learn\/)?ask(\?|$)/, (route) => { asks.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
};
const slider = (page) => page.getByRole('slider', { name: 'Card size' });
const value = async (page) => Number(await slider(page).inputValue());
const columns = (page, selector) => page.locator(selector).evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
const thumb = (page, selector) => page.locator(selector).first().locator('[data-card-thumbnail]').evaluate((n) => n.getBoundingClientRect().width);
const onLibrary = async (page) => { await page.goto(`${BASE}/library?type=canvases`); await slider(page).waitFor({ timeout: 60000 }); await page.locator('[data-library-card]').nth(3).waitFor({ timeout: 30000 }); };
const noComposer = async (page, where) => {
  assert.equal(await page.locator('[data-agent-bar], main textarea, main [data-chat-composer]').count(), 0, `${where}: a composer shows`);
  const reserved = await page.evaluate(() => ({ h: getComputedStyle(document.documentElement).getPropertyValue('--agent-bar-h').trim(), pad: getComputedStyle(document.querySelector('main')).paddingBottom }));
  assert.ok(['', '0px'].includes(reserved.h) && parseFloat(reserved.pad) === 0, `${where}: space is reserved at the bottom (${reserved.h} / ${reserved.pad})`);
};

await check('Library: Card size sits in the Filters and Sort row, Small to Large, named for assistive tech, Large by default (one card per row)', async () => {
  const page = await fresh();
  await onLibrary(page);
  const control = page.locator('[data-card-size-control]');
  assert.ok(await control.getByText('Card size', { exact: true }).isVisible() && await control.getByText('Small', { exact: true }).isVisible() && await control.getByText('Large', { exact: true }).isVisible(), 'label and both end labels show');
  assert.equal(await slider(page).getAttribute('aria-valuetext'), 'Large');
  assert.equal(await value(page), 3);
  const sameRow = await page.evaluate(() => { const y = (el) => Math.round(el.getBoundingClientRect().top / 10); const c = document.querySelector('[data-card-size-control]'); const f = [...document.querySelectorAll('button')].find((b) => /^Filters/.test(b.textContent.trim())); return y(c) === y(f); });
  assert.ok(sameRow, 'in the Filters row');
  assert.equal(await columns(page, '[data-library-card]'), 1, 'Large is one card per row');
  await page.screenshot({ path: `${SHOTS}/library-large.png` });
  await page.context().close();
});

await check('Library: Small fits more columns, the picture shrinks with the card, titles keep their size, and only the grid changes (not the page or sidebar)', async () => {
  const page = await fresh();
  await onLibrary(page);
  const probe = () => page.evaluate(() => ({ side: document.querySelector('[data-shell-sidebar]').getBoundingClientRect().width, main: document.querySelector('main').clientWidth, root: getComputedStyle(document.documentElement).fontSize, title: getComputedStyle(document.querySelector('[data-library-card] [data-card-title]')).fontSize, h1: getComputedStyle(document.querySelector('h1')).fontSize }));
  const large = { ...(await probe()), cols: await columns(page, '[data-library-card]'), thumb: await thumb(page, '[data-library-card]') };
  await slider(page).focus();
  await page.keyboard.press('Home');
  assert.equal(await value(page), 0, 'Home key moves it to Small');
  assert.equal(await slider(page).getAttribute('aria-valuetext'), 'Small');
  await page.waitForTimeout(300);
  const small = { ...(await probe()), cols: await columns(page, '[data-library-card]'), thumb: await thumb(page, '[data-library-card]') };
  assert.ok(small.cols > large.cols && small.cols >= 3, `Small shows ${small.cols} columns, Large ${large.cols}`);
  assert.ok(small.thumb < large.thumb, `the picture scales with the card (${small.thumb} vs ${large.thumb})`);
  for (const k of ['side', 'main', 'root', 'title', 'h1']) assert.equal(small[k], large[k], `${k} changed with the card size`);
  assert.ok(parseFloat(small.title) >= 16, `titles stay readable (${small.title})`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `the page scrolls sideways by ${overflow}px`);
  const buttonsReadable = await page.locator('[data-library-card] button, [data-library-card] a').first().evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  assert.ok(buttonsReadable >= 12, `buttons and links stay readable (${buttonsReadable}px)`);
  await page.keyboard.press('ArrowRight');
  assert.equal(await value(page), 1, 'ArrowRight steps up');
  await page.keyboard.press('End');
  assert.equal(await value(page), 3, 'End moves it to Large');
  await page.context().close();
});

await check('the setting is remembered across Library, Explore and Home, and after a reload', async () => {
  const page = await fresh();
  await onLibrary(page);
  await slider(page).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); // 1, Medium small
  assert.equal(await value(page), 1);
  await page.screenshot({ path: `${SHOTS}/library-medium-small.png` });
  await page.reload();
  await slider(page).waitFor({ timeout: 60000 });
  assert.equal(await value(page), 1, 'after a reload');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.cardSize), '1');
  await page.goto(`${BASE}/explore`);
  await slider(page).waitFor({ timeout: 60000 });
  assert.equal(await value(page), 1, 'on Explore');
  await page.screenshot({ path: `${SHOTS}/explore.png` });
  await slider(page).fill('2');
  await page.goto(`${BASE}/apps/${made[0].name}`);
  await page.getByLabel('Lesson canvas').waitFor({ timeout: 60000 });
  await page.goto(`${BASE}/apps`);
  await slider(page).waitFor({ timeout: 60000 }); // Home shows it once a card is there (this canvas is in Recent)
  assert.equal(await value(page), 2, 'on Home, the value set on Explore');
  await page.screenshot({ path: `${SHOTS}/home.png` });
  await page.goto(`${BASE}/library?type=canvases`);
  await slider(page).waitFor({ timeout: 60000 });
  assert.equal(await value(page), 2, 'back on the Library');
  await page.context().close();
});

await check('blocked storage: the pages render, the slider works for the visit, nothing throws', async () => {
  const page = await fresh({ width: 1440, height: 900 }, () => {
    // Only this key is refused, as a full or blocked store would: the rest of the app keeps its storage.
    for (const k of ['getItem', 'setItem']) { const real = Storage.prototype[k]; Storage.prototype[k] = function (key, ...rest) { if (key === 'small.cardSize') throw new DOMException('blocked', 'SecurityError'); return real.call(this, key, ...rest); }; }
  });
  await page.goto(`${BASE}/library?type=canvases`);
  await slider(page).waitFor({ timeout: 60000 });
  assert.equal(await value(page), 3, 'defaults to Large');
  await slider(page).focus();
  await page.keyboard.press('Home');
  assert.equal(await value(page), 0);
  await page.context().close();
});

await check('on a phone the slider takes its own row inside the screen and the page does not scroll sideways, at every size', async () => {
  const page = await fresh({ width: 390, height: 844 });
  await onLibrary(page);
  const box = await page.locator('[data-card-size-control]').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, `the slider is on screen (${box.x}..${box.x + box.width})`);
  for (const key of ['Home', 'End']) {
    await slider(page).focus();
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `${key}: the page scrolls sideways by ${overflow}px`);
  }
  await page.screenshot({ path: `${SHOTS}/library-phone.png` });
  await page.context().close();
});

await check('dark theme: the slider and its labels are visible', async () => {
  const page = await fresh();
  await page.emulateMedia({ colorScheme: 'dark' });
  await onLibrary(page);
  assert.ok(await slider(page).isVisible() && await page.locator('[data-card-size-control]').getByText('Card size', { exact: true }).isVisible());
  await page.screenshot({ path: `${SHOTS}/library-dark.png` });
  await page.context().close();
});

await check('no composer, no bottom bar and no reserved space on Home, Library and Explore', async () => {
  const page = await fresh();
  for (const path of ['/apps', '/library', '/explore']) {
    await page.goto(`${BASE}${path}`);
    await page.locator('main').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    await noComposer(page, path);
  }
  await page.context().close();
});

await check('Start a rabbit hole still creates a canvas, which opens with its composer (Chat stays inside canvases)', async () => {
  const page = await fresh();
  await page.goto(`${BASE}/library?type=canvases`);
  await page.getByRole('button', { name: 'Start a rabbit hole' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start a rabbit hole', exact: true });
  await dialog.waitFor({ timeout: 30000 });
  await dialog.getByRole('tab', { name: 'Blank canvas' }).click();
  await dialog.getByPlaceholder('Untitled canvas').fill(`Fresh from Start ${run}`);
  await dialog.getByRole('button', { name: 'Create canvas' }).click();
  await page.waitForURL((u) => /^\/apps\/canvas-[a-f0-9]{8}$/.test(u.pathname), { timeout: 60000 });
  await page.getByLabel('Lesson canvas').waitFor({ timeout: 60000 });
  await page.locator('[data-chat-composer]').first().waitFor({ timeout: 60000 });
  assert.equal(await page.locator('[data-agent-bar]').count(), 0, 'no workspace bar on a canvas');
  await page.context().close();
});

await browser.close();
assert.deepEqual(asks, [], 'no ask request was made');
assert.deepEqual(errors, [], 'no page errors');
const TOTAL = 8;
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
