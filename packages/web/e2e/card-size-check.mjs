// Card size (owner, 2026-10-22: "Add a Card size slider beside Filters and Sort, from Small to Large ... remember the setting across
// these pages and after reload; resize the card grid only, not the whole page. Keep Start a rabbit hole as the creation button"),
// restyled by the owner brief of 2026-10-23 (Library header: title row Library / New folder / Start a rabbit hole; controls row
// Search by name + Filters on the left, Sort + a compact "Size" slider on the right; the visible label "Size", no Small or Large
// text, "Card size" and the current step kept for assistive tech; the same label on Home and Explore) and
// the removed composer ("Remove the composer completely from Home, Library and Explore ... Chat remains inside canvases"), against
// the LOCAL stack only. No model call: nothing here asks one, and every /api/ask and /api/learn/ask is refused and counted.
// Card contrast (owner brief, 2026-10-23: "improve card separation in light mode across Home, Library and Explore; page background a
// subtle light gray, card surface opaque white, a clearer outer border, a very subtle shadow, a lighter thumbnail border, quieter
// dots, darker secondary text; boundaries clear before hovering, keyboard focus distinct, dark mode and the canvas unchanged"):
// the last four steps assert computed styles, never pixels.
// Small-card layout (owner brief 2026-10-23): the last seven steps read the card's own boxes at all four sizes - no overlap, every control hit at its
// centre, nothing cut short without a Show full title button, hovered and focused cards unmoved - on Library, Explore and Home, a phone, a tablet and dark.
//   BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/card-size-check.mjs [shotsDir]
import { chromium, expect } from '@playwright/test';
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
  // Search expands to fill the left group (owner brief 2026-10-23), so Filters ends where the group ends and Sort starts the right group one group gap later: the groups are told apart by their containers and that gap, not by free space between Filters and Sort.
  assert.ok(await page.evaluate(() => { const left = document.querySelector('[data-library-controls] > div:first-child'); const right = document.querySelector('[data-library-view]'); return !!left && !!right && !left.contains(right) && right.contains(document.querySelector('[data-sort-control]')) && !left.contains(document.querySelector('[data-sort-control]')); }), 'Sort and Size are in the right group, Search and Filters in the left group');
  assert.ok(b.sort.x - b.filters.right >= 8 && b.sort.x - b.filters.right <= 24, `${b.sort.x - b.filters.right}px between the left group and the right group`);
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

// Card contrast (owner brief 2026-10-23). Computed styles, so a regression names the property. The values are index.css's scoped
// browse tokens (--browse-bg, --card-border, --card-shadow, --thumb-border, --dots, --browse-meta); browse-contrast.test.mjs holds the
// contrast arithmetic, these steps hold what the browser actually draws.
const LIGHT = { page: 'rgb(245, 246, 248)', surface: 'rgb(255, 255, 255)', edge: 'rgb(196, 203, 213)', edgeHover: 'rgb(170, 179, 192)', thumb: 'rgb(225, 229, 234)', dots: 'rgb(228, 231, 236)', meta: 'rgb(99, 97, 93)', focus: 'rgb(35, 131, 226)' };
const DARK = { surface: 'rgb(25, 25, 25)', edge: 'rgb(47, 47, 47)', edgeHover: 'rgb(74, 74, 74)', thumb: 'rgb(47, 47, 47)', dots: 'rgb(47, 47, 47)', meta: 'rgb(111, 111, 111)' };
const channels = (c) => c.match(/[\d.]+/g).map(Number);
// Everything a card shows at rest, as the browser computes it; the text contrast is against the card's own opaque surface.
const cardLook = (page, selector) => page.locator(selector).first().evaluate((card) => {
  const css = (el, p) => getComputedStyle(el)[p];
  const lum = (rgb) => { const [r, g, b] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const surface = css(card, 'backgroundColor');
  const secondary = [...card.querySelectorAll('[data-updated], [data-card-note], [data-fork-count], [data-card-description]')].map((n) => ({ what: n.hasAttribute('data-updated') ? 'updated' : n.tagName + (n.hasAttribute('data-card-note') ? ' note' : ''), color: css(n, 'color'), ratio: ratio(rgb(css(n, 'color')), rgb(surface)) }));
  const thumb = card.querySelector('[data-card-thumbnail]');
  const main = card.closest('main');
  const box = card.getBoundingClientRect();
  return { surface, edge: css(card, 'borderTopColor'), width: css(card, 'borderTopWidth'), shadow: css(card, 'boxShadow'), thumb: thumb && css(thumb, 'borderTopColor'), secondary, page: css(main, 'backgroundColor'), dots: css(main, 'backgroundImage'), left: box.left, right: box.right };
});
const assertLight = (look, where) => {
  assert.equal(look.page, LIGHT.page, `${where}: the page is the subtle grey`);
  assert.ok(look.dots.includes(LIGHT.dots) && !look.dots.includes('rgb(233, 233, 231)'), `${where}: the page dots are the quiet browse dots (${look.dots})`);
  assert.equal(look.surface, LIGHT.surface, `${where}: the card surface is opaque white`);
  assert.equal(look.edge, LIGHT.edge, `${where}: the card edge`);
  assert.equal(look.width, '1px', `${where}: the card edge is 1px`);
  assert.equal(look.shadow, 'rgba(16, 24, 40, 0.06) 0px 1px 2px 0px', `${where}: a hairline shadow at rest, before any hover`);
  assert.equal(look.thumb, LIGHT.thumb, `${where}: the thumbnail edge`);
  const lighter = (a, b) => a !== b && channels(a).every((c, i) => c >= channels(b)[i]);
  assert.ok(lighter(look.thumb, look.edge), `${where}: the thumbnail edge is lighter than the card edge`);
  assert.ok(lighter(LIGHT.dots, look.edge), `${where}: the dots are quieter than the card edge`);
  assert.ok(look.secondary.length > 0, `${where}: the card has secondary text to measure`);
  for (const t of look.secondary) assert.ok(t.ratio >= 4.5, `${where}: ${t.what} text ${t.color} is ${t.ratio.toFixed(2)}:1 on the card`);
  assert.ok(look.secondary.some((t) => t.what === 'updated' && t.color === LIGHT.meta), `${where}: Updated uses the readable secondary ink`);
};
const lightPage = async (viewport) => {
  const page = await fresh(viewport);
  await page.emulateMedia({ colorScheme: 'light' });
  return page;
};

await check('light: Library cards are separated before any hover (page grey, opaque white card, clear edge, hairline shadow, lighter thumbnail edge, quieter dots, readable times) at all four sizes; the hover keeps a darker edge and keyboard focus is distinct', async () => {
  const page = await lightPage();
  await onLibrary(page);
  const card = page.locator('[data-library-card]').first();
  for (const size of [3, 2, 1, 0]) {
    await slider(page).fill(String(size));
    await expect(slider(page)).toHaveValue(String(size));
    assertLight(await cardLook(page, '[data-library-card]'), `Library size ${size}`);
  }
  await page.mouse.move(0, 0);
  await card.hover();
  await expect(card).toHaveCSS('border-top-color', LIGHT.edgeHover); // after the 150ms transition: darker than at rest, never lighter
  await expect(card).toHaveCSS('border-top-width', '1px');
  await card.focus();
  await expect(card).toHaveCSS('border-top-color', LIGHT.focus);
  assert.ok((await card.evaluate((n) => getComputedStyle(n).boxShadow)).includes(LIGHT.focus), 'the focused card shows the accent ring');
  await page.screenshot({ path: `${SHOTS}/contrast-library-light.png` });
  await page.context().close();
});

await check('light: Home (Continue learning, Recent) and Explore use the same page grey and card look', async () => {
  const page = await lightPage();
  await page.goto(`${BASE}/apps/${made[0].name}`);
  await page.getByLabel('Lesson canvas').waitFor({ timeout: 60000 });
  await page.goto(`${BASE}/apps`);
  await page.locator('[data-recent-card], [data-continue-card]').first().waitFor({ timeout: 60000 });
  for (const sel of ['[data-continue-card]', '[data-recent-card]']) if (await page.locator(sel).count()) assertLight(await cardLook(page, sel), `Home ${sel}`);
  await page.screenshot({ path: `${SHOTS}/contrast-home-light.png` });
  await page.goto(`${BASE}/explore`);
  await slider(page).waitFor({ timeout: 60000 });
  assert.equal(await page.locator('main').first().evaluate((m) => getComputedStyle(m).backgroundColor), LIGHT.page, 'Explore: the page is the subtle grey');
  if (await page.locator('[data-explore-card]').count()) assertLight(await cardLook(page, '[data-explore-card]'), 'Explore');
  await page.screenshot({ path: `${SHOTS}/contrast-explore-light.png` });
  await page.context().close();
});

await check('light, 390 px phone: the same edge, surface and times, inside the screen', async () => {
  const page = await lightPage({ width: 390, height: 844 });
  await onLibrary(page);
  const look = await cardLook(page, '[data-library-card]');
  assertLight(look, 'phone Library');
  assert.ok(look.left >= 0 && look.right <= 390, `the card is on screen (${look.left}..${look.right})`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'the page does not scroll sideways');
  await page.screenshot({ path: `${SHOTS}/contrast-library-phone.png` });
  await page.context().close();
});

await check('dark theme keeps its browse values; the canvas page and the shared line token are unchanged in light', async () => {
  const dark = await fresh();
  await dark.emulateMedia({ colorScheme: 'dark' });
  await onLibrary(dark);
  const look = await cardLook(dark, '[data-library-card]');
  assert.equal(look.page, 'rgba(0, 0, 0, 0)', 'dark: the page keeps the body surface');
  assert.ok(look.dots.includes(DARK.dots) && !look.dots.includes(LIGHT.dots), `dark: the page dots are the line colour (${look.dots})`);
  assert.equal(look.surface, DARK.surface);
  assert.equal(look.edge, DARK.edge);
  assert.equal(look.shadow, 'none', 'dark: no resting shadow');
  assert.equal(look.thumb, DARK.thumb);
  assert.ok(look.secondary.some((t) => t.what === 'updated' && t.color === DARK.meta), 'dark: Updated keeps the tertiary ink');
  const card = dark.locator('[data-library-card]').first();
  await dark.mouse.move(0, 0);
  await card.hover();
  await expect(card).toHaveCSS('border-top-color', DARK.edgeHover);
  await dark.context().close();
  const light = await lightPage();
  await light.goto(`${BASE}/apps/${made[0].name}`);
  await light.getByLabel('Lesson canvas').waitFor({ timeout: 60000 });
  const canvas = await light.evaluate(() => ({ browse: document.querySelectorAll('.browse-page').length, greys: [...document.querySelectorAll('main')].filter((m) => getComputedStyle(m).backgroundColor === 'rgb(245, 246, 248)').length, body: getComputedStyle(document.body).backgroundColor, line: getComputedStyle(document.documentElement).getPropertyValue('--color-line').trim() }));
  assert.deepEqual(canvas, { browse: 0, greys: 0, body: 'rgb(255, 255, 255)', line: '#e9e9e7' }, 'the canvas page keeps its look and the shared line token');
  await light.context().close();
});

// Small-card layout (owner brief 2026-10-23: "Fix the small-card layout in the shared LearningCard ... Varies by canvas overlapping the
// project title, Public/Private pills squeezing canvas titles into narrow fragments, creator handles unreadable ... at narrow card
// widths move visibility metadata onto a separate row; keep the Card options button in its own reserved space; keep the full title
// reachable by an accessible disclosure; adapt to the card's own width (a container query, 22rem of card content; a Small card is
// 220px); no two controls overlap, every control's centre hits the control, text is not clipped without disclosure, hovered and
// focused states keep the same guarantees"). Every box is read from the page. The rows are the real Library and Explore data with long
// titles, a long name, 30-character handles and every access label swapped in, so no layout is inferred from class names.
const LONG_TITLE = 'miniGPT: building a small language model from scratch, one layer at a time, with every attention head and the whole training loop explained step by step';
const UNBROKEN = 'Supercalifragilisticexpialidocious_unbroken_title_word_that_never_wraps_at_all';
const LONG_NAME = 'Alexandrina Montgomery-Featherstonehaugh';
const LONG_HANDLE = 'abcdefghij_klmnopqrst_uvwxyz_1'; // 30 characters, the longest handle there is (control-plane handle.js)
const LONG_PROJECT = 'some-organisation-with-a-long-name/some-repository-with-a-long-name';
const LONG_START = LONG_TITLE.slice(0, 20);
const catalog = (await api('/api/apps')).body;
const canvasPatch = {
  [made[0].name]: { title: LONG_TITLE, owner_handle: LONG_HANDLE, owner_name: LONG_NAME, access: 'unlisted', description: 'A walk through the whole model, written down while it was built.', fork_count: 1240 },
  [made[1].name]: { title: 'miniGPT', access: 'public', description: 'Short.', fork_count: 3 },
  [made[2].name]: { title: UNBROKEN, owner_name: 'Ada', access: 'private', description: 'One unbroken word as a title.' },
  [made[3].name]: { title: 'Public canvas with a mid-length title that wraps', access: 'public' },
};
const project = (n, extra) => ({ kind: 'repository', hosting: 'repository', name: `repo-5ca1ab1e-${run}-${n}`.slice(0, 40), org: catalog.org, email: catalog.email, owner_email: catalog.email,
  owner_handle: LONG_HANDLE, owner_name: LONG_NAME, repo: 'karpathy/nanoGPT', branch: 'master', commit_sha: 'abc1234def', status: 'ready', created_at: '2026-10-01 09:00:00', updated_at: '2026-10-20 09:00:00',
  canEdit: true, canView: true, visibility: 'domain', description: 'Learn from karpathy/nanoGPT', url: `/apps/repo-5ca1ab1e-${run}-${n}`, members: [], inputs: {}, outputs: {}, canvas_count: 12, fork_count: 1240, ...extra });
const PROJECTS = [
  project(1, { title: 'miniGPT', access: 'mixed' }),
  project(2, { title: LONG_TITLE, access: 'private' }),
  project(3, { title: 'miniGPT, read only', access: 'mixed', canEdit: false }),
  project(4, { title: 'Public project', access: 'public' }),
  project(5, { title: 'Unlisted project', access: 'unlisted', owner_name: null, owner_handle: `cs_${run}` }),
];
const EXPLORE = {
  canvases: [
    { url: '/e/tokLong1', title: LONG_TITLE, description: 'A long walk.', creator: { handle: LONG_HANDLE, name: LONG_NAME }, fork_count: 1240, updated_at: '2026-10-20 09:00:00', project: LONG_PROJECT },
    { url: '/e/tokShort2', title: 'miniGPT', description: 'Short.', creator: { handle: 'ada', name: null }, fork_count: 3, updated_at: '2026-10-20 09:00:00' },
    { url: '/e/tokMine3', title: 'My own canvas', creator: { handle: `cs_${run}`, name: null }, fork_count: 2, updated_at: '2026-10-20 09:00:00' },
    { url: '/e/tokWord4', title: UNBROKEN, creator: { handle: 'bob_the_builder_of_things', name: 'Bob' }, updated_at: '2026-10-20 09:00:00', project: 'karpathy/nanoGPT' },
  ],
  projects: [
    { label: LONG_PROJECT, repo: LONG_PROJECT, boards: 12, url: '/explore?project=x', updated_at: '2026-10-20 09:00:00' },
    { label: 'karpathy/nanoGPT', repo: 'karpathy/nanoGPT', boards: 1, url: '/explore?project=y', updated_at: '2026-10-20 09:00:00' },
  ],
};
const seeded = async (viewport = { width: 1440, height: 900 }, { mobile = false } = {}) => {
  const context = await browser.newContext({ viewport, ...(mobile ? { hasTouch: true } : {}) });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript((recent) => localStorage.setItem('small.recent', JSON.stringify(recent)), [...made.map((c) => c.name), ...PROJECTS.map((p) => p.name)]);
  await context.route(/\/api\/(learn\/)?ask(\?|$)/, (route) => { asks.push(route.request().url()); return route.abort(); });
  await context.route((url) => new URL(url).pathname === '/api/apps', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    route.fulfill({ response, json: { ...body, apps: [...body.apps.map((a) => ({ ...a, ...(canvasPatch[a.name] || {}) })), ...PROJECTS] } });
  });
  await context.route((url) => new URL(url).pathname === '/api/learn/boards/published', (route) => route.fulfill({ json: EXPLORE }));
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
};

// One read of every matching card (or the card at `index`): the problems found, and each part's box relative to its card, so a hover
// or a focus is compared with the resting card and not with the page.
const measure = (page, selector, index = -1) => page.evaluate(({ selector, index }) => {
  const problems = [], rel = {};
  let narrow = 0;
  const cards = [...document.querySelectorAll(selector)];
  (index < 0 ? cards : [cards[index]]).filter(Boolean).forEach((card, n) => {
    card.scrollIntoView({ block: 'center' }); // a hit test only sees what is on screen
    const q = (s) => card.querySelector(s);
    const name = `${selector}[${index < 0 ? n : index}] ${(q('[data-card-title]')?.textContent || '?').slice(0, 18)}`;
    const box = card.getBoundingClientRect();
    const inner = box.width - 34; // 16px padding and a 1px border each side: the width the container query reads
    const parts = [
      ['icon', q('[data-type-icon]')], ['title', q('[data-card-title]')], ['visibility', q('[data-card-visibility]')], ['creator', q('[data-creator-link]') || q('[data-creator]')],
      ['project', q('[data-card-project]')], ['more', q('[title="Card options"]')], ['toggle', q('[data-card-title-toggle]')], ['forks', q('[data-fork-count]')],
      ['canvases', q('[data-canvas-count]')], ['updated', q('[data-updated]')], ['open', q('[data-card-open]') || q('[data-card-footer] > :last-child:not([data-card-spacer])')],
      ['start', q('[data-card-start-rabbit-hole]')],
    ].filter(([, el]) => el);
    const r = Object.fromEntries(parts.map(([k, el]) => [k, el.getBoundingClientRect()]));
    rel[name] = Object.fromEntries(parts.map(([k]) => [k, [r[k].x - box.x, r[k].y - box.y, r[k].width, r[k].height].map((v) => Math.round(v * 10) / 10)]));
    for (let i = 0; i < parts.length; i += 1) {
      const a = r[parts[i][0]];
      if (a.left < box.left - 0.5 || a.right > box.right + 0.5 || a.top < box.top - 0.5 || a.bottom > box.bottom + 0.5) problems.push(`${name}: ${parts[i][0]} is outside the card`);
      for (let j = i + 1; j < parts.length; j += 1) {
        const b = r[parts[j][0]];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) problems.push(`${name}: ${parts[i][0]} overlaps ${parts[j][0]}`);
      }
    }
    for (const [k, el] of parts) {
      if (['A', 'BUTTON'].includes(el.tagName)) {
        const hit = document.elementFromPoint(r[k].x + r[k].width / 2, r[k].y + r[k].height / 2);
        if (!(hit && (hit === el || el.contains(hit)))) problems.push(`${name}: the centre of ${k} hits ${hit?.tagName}.${String(hit?.className).slice(0, 40)} instead`);
      }
      if (['visibility', 'forks', 'canvases', 'updated', 'open', 'more'].includes(k) && el.scrollWidth > el.clientWidth + 1) problems.push(`${name}: ${k} is clipped (${el.scrollWidth} > ${el.clientWidth})`);
      if (parseFloat(getComputedStyle(el).fontSize) < 12) problems.push(`${name}: ${k} is ${getComputedStyle(el).fontSize}`);
    }
    // A title or creator that is cut short must offer the Show full title button (collapsed); an open card is cut nowhere.
    const toggle = q('[data-card-title-toggle]');
    for (const el of card.querySelectorAll('[data-clamp]')) {
      const cut = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
      if (cut && !(toggle && toggle.getAttribute('aria-expanded') === 'false')) problems.push(`${name}: ${el.hasAttribute('data-card-title') ? 'the title' : 'the creator'} is cut short and offers no way to read it`);
    }
    const mixed = q('[data-card-visibility="mixed"]');
    if (mixed && mixed.textContent.trim() !== 'Varies by canvas') problems.push(`${name}: the mixed pill reads ${mixed.textContent}`);
    if (inner < 352) {
      narrow += 1;
      const heading = q('[data-card-heading]').getBoundingClientRect(), meta = q('[data-card-meta]')?.getBoundingClientRect();
      if (heading.width < 120) problems.push(`${name}: the title has ${heading.width}px`);
      if (meta && meta.width < inner - 2) problems.push(`${name}: the creator row has ${meta.width} of ${inner}px`);
      for (const k of ['visibility', 'more']) if (r[k] && r[k].top < heading.bottom - 0.5) problems.push(`${name}: ${k} shares the title's row`);
    }
  });
  return { problems, rel, narrow };
}, { selector, index });
const settled = (page, selector, where, index = -1) => expect.poll(async () => (await measure(page, selector, index)).problems, { message: where, timeout: 20000 }).toEqual([]);
const drift = (a, b) => Object.entries(a).flatMap(([card, parts]) => Object.entries(parts).filter(([k, v]) => !b[card]?.[k] || v.some((x, i) => Math.abs(x - b[card][k][i]) > 1.5)).map(([k]) => `${card}: ${k} moved ${JSON.stringify(parts[k])} to ${JSON.stringify(b[card]?.[k])}`));
// The resting cards, then each of the first five hovered and then focused: the same guarantees, and nothing moves inside the card.
const stable = async (page, selector, where) => {
  await settled(page, selector, `${where} at rest`);
  const count = Math.min(await page.locator(selector).count(), 5);
  for (let i = 0; i < count; i += 1) {
    const card = page.locator(selector).nth(i);
    const rest = (await measure(page, selector, i)).rel;
    await card.hover();
    await settled(page, selector, `${where} hovered ${i}`, i);
    await expect.poll(async () => drift(rest, (await measure(page, selector, i)).rel), { message: `${where}: hovering card ${i} moved a part`, timeout: 10000 }).toEqual([]);
    await card.locator('[data-card-title]').focus();
    await settled(page, selector, `${where} focused ${i}`, i);
    await expect.poll(async () => drift(rest, (await measure(page, selector, i)).rel), { message: `${where}: focusing card ${i} moved a part`, timeout: 10000 }).toEqual([]);
  }
  await page.mouse.move(0, 0);
};
// All four steps of the slider. `narrow`: the sizes at which some card must be in the narrow layout (so the check cannot pass by
// looking at nothing); `largeWide`: a Large card at 1440 is wide.
const sweep = async (page, selector, where, { long = null, narrow = [0, 1], largeWide = true } = {}) => {
  for (const n of [3, 2, 1, 0]) {
    await slider(page).fill(String(n));
    await expect(slider(page)).toHaveValue(String(n));
    await stable(page, selector, `${where}, size ${n}`);
    const seen = (await measure(page, selector)).narrow;
    if (narrow.includes(n)) assert.ok(seen > 0, `${where}, size ${n}: no card was in the narrow layout, so the narrow layout was not tested`);
    if (n === 3 && largeWide) assert.equal(seen, 0, `${where}: Large cards are in the narrow layout`);
    if (long) await expect(page.locator(selector).filter({ hasText: long }).getByRole('button', { name: 'Show full title' }).first()).toBeVisible();
  }
};
const visibilities = (page, selector) => page.locator(selector).locator('[data-card-visibility]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-card-visibility') + (e.tagName === 'BUTTON' ? ':button' : '')))].sort());
const onProjects = async (page) => { await page.goto(`${BASE}/library?type=projects`); await slider(page).waitFor({ timeout: 60000 }); await page.locator('[data-library-card="project"]').nth(4).waitFor({ timeout: 30000 }); };
const onExplore = async (page, query = '') => { await page.goto(`${BASE}/explore${query}`); await slider(page).waitFor({ timeout: 60000 }); };

await check('Library canvases at 1440, all four sizes: Private, Unlisted and Public pills, a long title, a 30-character handle with a long name, one unbroken word; nothing overlaps, every control is hit at its centre, nothing is cut short without a way to read it, hovered and focused cards keep every part where it was', async () => {
  const page = await seeded();
  await onLibrary(page);
  assert.deepEqual(await visibilities(page, '[data-library-card="canvas"]'), ['private', 'public', 'unlisted']);
  await sweep(page, '[data-library-card="canvas"]', 'Library canvases', { long: LONG_START });
  await slider(page).fill('0');
  await page.screenshot({ path: `${SHOTS}/small-card-library-canvases.png` });
  await page.context().close();
});

await check('Library projects at 1440, all four sizes: Private, Unlisted, Public, and Varies by canvas as a button (editable) and as plain text (read only), whole and readable on its own row at Small', async () => {
  const page = await seeded();
  await onProjects(page);
  assert.deepEqual(await visibilities(page, '[data-library-card="project"]'), ['mixed', 'mixed:button', 'private', 'public', 'unlisted']);
  await sweep(page, '[data-library-card="project"]', 'Library projects', { long: LONG_START });
  await slider(page).fill('0');
  const pill = page.locator('[data-library-card="project"] button[data-card-visibility="mixed"]').first();
  await pill.scrollIntoViewIfNeeded();
  assert.equal((await pill.innerText()).trim(), 'Varies by canvas');
  assert.equal(await pill.evaluate((n) => n.scrollWidth <= n.clientWidth + 1 && parseFloat(getComputedStyle(n).fontSize) >= 12), true, 'Varies by canvas is whole and 12px or larger at Small');
  await page.screenshot({ path: `${SHOTS}/small-card-library-projects.png` });
  await page.context().close();
});

await check('Explore at 1440, all four sizes: public canvases (a long name and handle, a long project label, Start Rabbit Hole and Fork beside it, one of your own) and project cards', async () => {
  const page = await seeded();
  await onExplore(page);
  await page.locator('[data-explore-card]').nth(3).waitFor({ timeout: 30000 });
  assert.deepEqual(await visibilities(page, '[data-explore-card]'), ['public']);
  await sweep(page, '[data-explore-card]', 'Explore canvases', { long: LONG_START });
  await page.screenshot({ path: `${SHOTS}/small-card-explore.png` });
  await onExplore(page, '?type=projects');
  await page.locator('[data-explore-project]').nth(1).waitFor({ timeout: 30000 });
  await sweep(page, '[data-explore-project]', 'Explore projects');
  await page.context().close();
});

await check('Home (Recent) at 1440, all four sizes: the same cards, the same guarantees', async () => {
  const page = await seeded();
  await page.goto(`${BASE}/apps`);
  await page.locator('[data-recent-card]').nth(3).waitFor({ timeout: 60000 });
  await slider(page).waitFor({ timeout: 60000 });
  await sweep(page, '[data-recent-card]', 'Home Recent', { long: LONG_START });
  await page.screenshot({ path: `${SHOTS}/small-card-home.png` });
  await page.context().close();
});

await check('a phone (390) and a tablet (800): Library canvases, Library projects and Explore at all four sizes, with no sideways scroll', async () => {
  for (const [label, viewport, mobile, narrow] of [['phone', { width: 390, height: 844 }, true, [0, 1, 2, 3]], ['tablet', { width: 800, height: 900 }, false, []]]) {
    const page = await seeded(viewport, { mobile });
    const options = { narrow, largeWide: false };
    await onLibrary(page);
    await sweep(page, '[data-library-card="canvas"]', `${label} Library canvases`, { ...options, long: LONG_START });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, `${label}: the page scrolls sideways`);
    await onProjects(page);
    await sweep(page, '[data-library-card="project"]', `${label} Library projects`, options);
    await onExplore(page);
    await page.locator('[data-explore-card]').nth(3).waitFor({ timeout: 30000 });
    await sweep(page, '[data-explore-card]', `${label} Explore`, options);
    await slider(page).fill('0');
    await page.screenshot({ path: `${SHOTS}/small-card-${label}.png` });
    await page.context().close();
  }
});

await check('dark theme: the same cards at all four sizes keep every guarantee', async () => {
  const page = await seeded();
  await page.emulateMedia({ colorScheme: 'dark' });
  await onLibrary(page);
  await sweep(page, '[data-library-card="canvas"]', 'dark Library canvases', { long: LONG_START });
  await onProjects(page);
  await sweep(page, '[data-library-card="project"]', 'dark Library projects', { long: LONG_START });
  await slider(page).fill('0');
  await page.screenshot({ path: `${SHOTS}/small-card-dark.png` });
  await page.context().close();
});

await check('a clamped title keeps its full text: Show full title is a button with aria-expanded that the keyboard and a tap both work, the open card shows the whole title with no overlap, Show less closes it', async () => {
  for (const mobile of [false, true]) {
    const where = mobile ? 'phone' : 'desktop';
    const page = await seeded(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, { mobile });
    await onLibrary(page);
    await slider(page).fill('0');
    const card = page.locator('[data-library-card="canvas"]').filter({ hasText: LONG_START });
    const title = card.locator('[data-card-title]');
    const open = card.getByRole('button', { name: 'Show full title' });
    await expect(open).toHaveCount(1);
    assert.equal(await open.getAttribute('aria-expanded'), 'false');
    assert.equal(await title.evaluate((n) => n.scrollHeight > n.clientHeight + 1), true, `${where}: the title is clamped at Small`);
    assert.equal((await title.innerText()).replace(/\s+/g, ' ').trim(), LONG_TITLE, `${where}: the title link carries the whole title for assistive tech`);
    if (mobile) await open.tap(); else { await open.focus(); await page.keyboard.press('Enter'); }
    const close = card.getByRole('button', { name: 'Show less' });
    await expect(close).toHaveAttribute('aria-expanded', 'true');
    assert.equal(await title.evaluate((n) => n.scrollHeight <= n.clientHeight + 1), true, `${where}: the open card shows the whole title`);
    await settled(page, '[data-library-card="canvas"]', `${where}: the open card`);
    await page.screenshot({ path: `${SHOTS}/small-card-title-open-${where}.png` });
    if (mobile) await close.tap(); else await page.keyboard.press('Space');
    await expect(card.getByRole('button', { name: 'Show full title' })).toHaveAttribute('aria-expanded', 'false');
    await settled(page, '[data-library-card="canvas"]', `${where}: closed again`);
    await page.context().close();
  }
});

await browser.close();
assert.deepEqual(asks, [], 'no ask request was made');
assert.deepEqual(errors, [], 'no page errors');
const TOTAL = 21;
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
