// Card size (owner, 2026-10-22: "Add a Card size slider beside Filters and Sort, from Small to Large ... remember the setting across
// these pages and after reload; resize the card grid only, not the whole page. Keep Start a rabbit hole as the creation button"),
// restyled by the owner brief of 2026-10-23 (Library header: title row Library / New folder / Start a rabbit hole; controls row
// Search by name + Filters on the left, Sort + a compact "Size" slider on the right; the visible label "Size", no Small or Large
// text, "Card size" and the current step kept for assistive tech; the same label on Home and Explore) and
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

const sizeLabel = async (page, where) => {
  const control = page.locator('[data-card-size-control]');
  assert.equal((await control.innerText()).trim(), 'Size', `${where}: the visible label is Size and nothing else (no Small or Large)`);
  assert.equal(await control.getByText(/^(Small|Large|Card size)$/).count(), 0, `${where}: no Small, Large or Card size text`);
  assert.equal(await slider(page).getAttribute('aria-label'), 'Card size', `${where}: assistive tech still hears Card size`);
};

await check('Library: the Size slider has the label Size and no Small or Large text, is named Card size for assistive tech, announces the step, and is Large by default (one card per row)', async () => {
  const page = await fresh();
  await onLibrary(page);
  await sizeLabel(page, 'Library');
  assert.equal(await slider(page).getAttribute('aria-valuetext'), 'Large');
  assert.equal(await value(page), 3);
  assert.equal(await columns(page, '[data-library-card]'), 1, 'Large is one card per row');
  await page.screenshot({ path: `${SHOTS}/library-large.png` });
  await page.context().close();
});

// The geometry the brief names: every box is read from the page, nothing is inferred from class names.
const boxOf = (locator) => locator.evaluate((n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, right: r.right, bottom: r.bottom }; });
const headerBoxes = async (page) => ({
  h1: await boxOf(page.locator('h1').first()),
  folder: await boxOf(page.locator('[data-new-folder]')),
  start: await boxOf(page.getByRole('button', { name: 'Start a rabbit hole', exact: true })),
  search: await boxOf(page.locator('[data-library-search]')),
  filters: await boxOf(page.getByRole('button', { name: /^Filters/ })),
  sort: await boxOf(page.locator('[data-sort-control]')),
  size: await boxOf(page.locator('[data-card-size-control]')),
});

await check('Library header at desktop width: title row (Library left; New folder then Start a rabbit hole right, centred on the heading), controls row (search expands, Filters after it; Sort then Size at the far right), consistent heights, spacing, icons', async () => {
  const page = await fresh();
  await onLibrary(page);
  const b = await headerBoxes(page);
  assert.equal(await page.locator('h1').first().innerText(), 'Library');
  for (const k of ['folder', 'start']) assert.ok(Math.abs(b[k].cy - b.h1.cy) <= 1, `${k} is ${b[k].cy - b.h1.cy}px off the heading centre`);
  assert.ok(b.folder.x > b.h1.right && b.start.x > b.folder.right, 'Library, then New folder, then Start a rabbit hole, left to right');
  assert.ok(b.start.x - b.folder.right >= 8 && b.start.x - b.folder.right <= 12, `the two buttons are ${b.start.x - b.folder.right}px apart`);
  for (const k of ['search', 'filters', 'sort', 'size']) assert.equal(Math.round(b[k].h), 32, `${k} is ${b[k].h}px tall`);
  assert.equal(Math.round(b.folder.h), 32, 'New folder is 32px tall');
  assert.equal(Math.round(b.start.h), 32, 'Start a rabbit hole is 32px tall');
  const ys = ['search', 'filters', 'sort', 'size'].map((k) => b[k].cy);
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 1, `the controls share one centre line (${ys})`);
  const gap = b.search.y - b.h1.bottom;
  assert.ok(gap >= 20 && gap <= 24, `${gap}px between the title row and the controls row`);
  assert.ok(b.filters.x - b.search.right >= 8 && b.filters.x - b.search.right <= 12, `Filters ${b.filters.x - b.search.right}px after the search`);
  assert.ok(b.search.w >= 240, `the search expands into the free space (${b.search.w}px)`);
  assert.ok(b.sort.x > b.filters.right && b.size.x > b.sort.right, 'Sort then Size, after the left group');
  assert.ok(b.sort.x - b.filters.right > 100, 'Sort belongs to the right group, not beside Filters');
  assert.ok(b.size.x - b.sort.right >= 8 && b.size.x - b.sort.right <= 12, `Size ${b.size.x - b.sort.right}px after Sort`);
  assert.ok(Math.abs(b.size.right - b.start.right) <= 1, `Size is at the far right, in line with Start (${b.size.right} vs ${b.start.right})`);
  assert.equal(await page.locator('[data-sort-control]').innerText().then((t) => /Last updated/.test(t)), true, 'the sort defaults to Last updated');
  for (const [label, locator] of [['Search by name', page.locator('label:has([data-library-search])')], ['New folder', page.locator('[data-new-folder]')], ['Start a rabbit hole', page.getByRole('button', { name: 'Start a rabbit hole', exact: true })], ['Filters', page.getByRole('button', { name: /^Filters/ })], ['Sort', page.locator('[data-sort-control]')]]) assert.ok(await locator.locator('svg').count() >= 1, `${label} has an icon`);
  assert.equal(await page.locator('[data-card-size-control] svg').count(), 0, 'Size has no icon');
  await page.screenshot({ path: `${SHOTS}/library-header.png` });
  await page.context().close();
});

await check('Library header: search, Filters and Sort still work, the Filters menu opens inside the screen, the four steps each announce their name', async () => {
  const page = await fresh();
  await onLibrary(page);
  await page.locator('[data-library-search]').fill(`Size canvas 2 ${run}`);
  await page.waitForFunction(() => document.querySelectorAll('[data-library-card]').length === 1, null, { timeout: 30000 });
  await page.locator('[data-library-search]').fill('');
  await page.waitForFunction(() => document.querySelectorAll('[data-library-card]').length >= 4, null, { timeout: 30000 });
  await page.locator('[data-sort-control]').click();
  await page.locator('[data-sort-option="name"]').click();
  assert.equal(await page.locator('[data-sort-control]').getAttribute('data-sort-control'), 'name');
  await page.getByRole('button', { name: /^Filters/ }).click();
  const menu = await boxOf(page.getByRole('button', { name: /^Filters/ }).locator('xpath=../div').first());
  assert.ok(menu.x >= 0 && menu.right <= 1440, `the Filters menu is on screen (${menu.x}..${menu.right})`);
  await page.getByRole('button', { name: /^Filters/ }).click();
  const names = ['Small', 'Medium small', 'Medium large', 'Large'];
  for (let n = 0; n < 4; n++) {
    await slider(page).fill(String(n));
    assert.equal(await slider(page).getAttribute('aria-valuetext'), names[n]);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.cardSize), String(n));
  }
  await slider(page).fill('3');
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
  await sizeLabel(page, 'Explore');
  await page.screenshot({ path: `${SHOTS}/explore.png` });
  await slider(page).fill('2');
  await page.goto(`${BASE}/apps/${made[0].name}`);
  await page.getByLabel('Lesson canvas').waitFor({ timeout: 60000 });
  await page.goto(`${BASE}/apps`);
  await slider(page).waitFor({ timeout: 60000 }); // Home shows it once a card is there (this canvas is in Recent)
  assert.equal(await value(page), 2, 'on Home, the value set on Explore');
  await sizeLabel(page, 'Home');
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

await check('on a phone (390 wide) the header groups wrap into orderly rows, every control is on screen and readable, and the page does not scroll sideways, at every size', async () => {
  const page = await fresh({ width: 390, height: 844 });
  await onLibrary(page);
  const b = await headerBoxes(page);
  for (const [k, v] of Object.entries(b)) if (k !== 'h1') assert.ok(v.x >= 0 && v.right <= 390 && v.w > 0, `${k} is on screen (${v.x}..${v.right})`);
  assert.ok(b.search.y > b.h1.bottom, 'the controls row is beneath the title row');
  assert.ok(Math.abs(b.sort.cy - b.size.cy) <= 1 && b.size.x > b.sort.right, 'Sort and Size stay together in one row, Size last');
  assert.ok(Math.abs(b.search.cy - b.filters.cy) <= 1 && b.filters.x > b.search.right, 'Search and Filters stay together in one row');
  assert.ok(b.sort.y > b.filters.y, 'the right group wraps beneath the left group as a whole');
  assert.ok(await page.locator('[data-new-folder]').innerText().then((t) => t.trim() === 'New folder'), 'New folder keeps its text (and so its name) on a phone');
  assert.ok(await page.locator('[data-library-search]').evaluate((n) => n.getBoundingClientRect().width >= 150), 'the search stays usable');
  for (const key of ['Home', 'End']) {
    await slider(page).focus();
    await page.keyboard.press(key);
    await page.waitForFunction((k) => document.documentElement.dataset.cardSize === (k === 'Home' ? '0' : '3'), key, { timeout: 5000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `${key}: the page scrolls sideways by ${overflow}px`);
  }
  await page.getByRole('button', { name: /^Filters/ }).click();
  const menu = await boxOf(page.getByRole('button', { name: /^Filters/ }).locator('xpath=../div').first());
  assert.ok(menu.x >= 0 && menu.right <= 390, `the Filters menu is on screen (${menu.x}..${menu.right})`);
  await page.keyboard.press('Escape');
  await page.locator('[data-sort-control]').click();
  const sortMenu = await boxOf(page.locator('[data-sort-control]').locator('xpath=../div').first());
  assert.ok(sortMenu.x >= 0 && sortMenu.right <= 390, `the Sort menu is on screen (${sortMenu.x}..${sortMenu.right})`);
  await page.screenshot({ path: `${SHOTS}/library-phone.png` });
  await page.context().close();
});

await check('dark theme: the Size label and slider are visible and the header keeps its alignment', async () => {
  const page = await fresh();
  await page.emulateMedia({ colorScheme: 'dark' });
  await onLibrary(page);
  assert.ok(await slider(page).isVisible() && await page.locator('[data-card-size-control]').getByText('Size', { exact: true }).isVisible());
  await sizeLabel(page, 'dark Library');
  const b = await headerBoxes(page);
  assert.ok(Math.abs(b.start.cy - b.h1.cy) <= 1 && Math.abs(b.folder.cy - b.h1.cy) <= 1, 'the title row buttons stay centred on the heading');
  assert.ok(Math.abs(b.sort.cy - b.size.cy) <= 1 && Math.abs(b.search.cy - b.filters.cy) <= 1 && Math.abs(b.sort.cy - b.filters.cy) <= 1, 'the controls share a centre line');
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
  assert.equal(await dialog.getByRole('tab', { name: 'Repository' }).count(), 1, 'the repository choice is still offered');
  assert.equal(await dialog.getByRole('tab', { name: 'Blank canvas' }).count(), 1, 'the blank canvas choice is still offered');
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
const TOTAL = 10;
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
