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
// centre, nothing cut short, hovered and focused cards unmoved - on Library, Explore and Home, a phone, a tablet and dark.
// Card size and description (owner brief 2026-10-23, replacing the Show full title button): no disclosure button anywhere; at Small and Medium small
// a card is as tall as its content, with no blank band above the footer or below it. Every size (0 to 3) shows the whole description (up to 340
// characters, or an older longer one; owner decision, task 2f608983-76d4-4bab-9609-3e837a05f5c8, replacing the three-line clamp at Medium large and
// Large) with no clipped text, no overlap and no sideways overflow; a longer description makes the card taller and the picture keeps its place.
// Clipping is read from the boxes (scrollHeight against clientHeight), never inferred from textContent.
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
  // Combined sources (owner brief 2026-10-23): the three adds and the blank shortcut; Blank imports nothing and makes the canvas.
  for (const name of ['Add files', 'Add link', 'Connect repository', 'Start with a blank canvas']) assert.equal(await dialog.getByRole('button', { name, exact: true }).count(), 1, `${name} is still offered`);
  assert.equal(await dialog.getByRole('button', { name: 'Start rabbit hole', exact: true }).isDisabled(), true, 'Start rabbit hole needs a source');
  await dialog.getByRole('button', { name: 'Start with a blank canvas', exact: true }).click();
  await page.waitForURL((u) => /^\/apps\/canvas-[a-f0-9]{8}$/.test(u.pathname), { timeout: 60000 });
  await page.getByLabel('Lesson canvas').waitFor({ timeout: 60000 });
  await page.locator('[data-chat-composer]').first().waitFor({ timeout: 60000 });
  assert.equal(await page.locator('[data-agent-bar]').count(), 0, 'no workspace bar on a canvas');
  await page.context().close();
});

await check('Start a rabbit hole keeps one list: files and links are added, never replaced; each source has its own Use as context and Add to canvas; a source with neither is named and blocks Start; nothing is written', async () => {
  const page = await fresh();
  const writes = [];
  page.on('request', (r) => { const path = new URL(r.url()).pathname; if (r.method() !== 'GET' && /^[/]api[/](canvases|repositories|learn[/](context|files|webpages|paper|media))/.test(path)) writes.push(`${r.method()} ${path}`); });
  await page.goto(`${BASE}/library?type=canvases`);
  await page.getByRole('button', { name: 'Start a rabbit hole' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start a rabbit hole', exact: true });
  await dialog.waitFor({ timeout: 30000 });
  const rows = dialog.locator('[data-start-row]');
  const box = (row, name) => row.getByRole('checkbox', { name, exact: true });
  await dialog.locator('[data-start-file-input]').setInputFiles([
    { name: `notes-${run}.txt`, mimeType: 'text/plain', buffer: Buffer.from('hello') },
    { name: `deck-${run}.docx`, mimeType: 'application/octet-stream', buffer: Buffer.from('not read here') },
  ]);
  await rows.nth(1).waitFor({ timeout: 10000 });
  assert.equal(await rows.count(), 2, 'both files are listed');
  assert.equal(await dialog.getByText('Context lets Chat and Tutor use a source.').count(), 1, 'the context line shows once');
  assert.equal(await dialog.getByText('Canvas shows it as a card in your workspace.').count(), 1, 'the canvas line shows once');
  // A text file defaults to both; a Word document has no context road, so that choice is greyed with its name kept.
  assert.deepEqual([await box(rows.nth(0), 'Use as context').isChecked(), await box(rows.nth(0), 'Add to canvas').isChecked()], [true, true], 'a text file defaults to both');
  assert.deepEqual([await box(rows.nth(1), 'Use as context').isDisabled(), await box(rows.nth(1), 'Add to canvas').isChecked()], [true, true], 'a Word document is canvas only');
  assert.equal(await dialog.locator('[data-start-summary]').innerText(), '1 context source, 2 canvas cards');
  // A link adds to the list; its type shows at once and an article says it is resolved at Start.
  await dialog.getByRole('button', { name: 'Add link', exact: true }).click();
  await dialog.getByPlaceholder('https://', { exact: true }).fill('https://arxiv.org/abs/1706.03762');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await rows.nth(2).waitFor({ timeout: 5000 });
  assert.match(await rows.nth(2).innerText(), /arXiv paper/);
  assert.equal(await rows.count(), 3, 'the link was added to the files, not instead of them');
  await dialog.getByRole('button', { name: 'Add link', exact: true }).click();
  await dialog.getByPlaceholder('https://', { exact: true }).fill('https://example.com/an-article');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  assert.match(await rows.nth(3).innerText(), /Will be resolved when you start/);
  // Cancel on an input keeps the whole list.
  await dialog.getByRole('button', { name: 'Connect repository', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await rows.count(), 4, 'cancelling the repository input kept the list');
  // Both choices off on one source (owner decisions 2026-10-23): it is named and left out, the other sources can still start.
  await box(rows.nth(0), 'Use as context').uncheck();
  await box(rows.nth(0), 'Add to canvas').uncheck();
  assert.equal(await rows.nth(0).getByText('Choose context, canvas, or both. This source will not be added.').count(), 1, 'the source with no destination is named and left out');
  assert.equal(await dialog.getByRole('button', { name: 'Start rabbit hole', exact: true }).isEnabled(), true, 'the other sources can start without it');
  assert.equal(await dialog.getByRole('button', { name: 'Start with a blank canvas', exact: true }).isEnabled(), true, 'the blank shortcut stays available');
  await box(rows.nth(0), 'Add to canvas').check();
  assert.equal(await box(rows.nth(0), 'Use as context').isChecked(), false, 'checking one option left the other as it was');
  assert.equal(await dialog.getByRole('button', { name: 'Start rabbit hole', exact: true }).isEnabled(), true, 'Start is available');
  // A link's two options are independent: its card choice leaves its context as it was, and the other way round.
  await box(rows.nth(3), 'Add to canvas').uncheck();
  assert.equal(await box(rows.nth(3), 'Use as context').isEnabled(), true, 'a link keeps its context when its card is off');
  assert.equal(await box(rows.nth(3), 'Use as context').isChecked(), true);
  await box(rows.nth(3), 'Add to canvas').check();
  await rows.nth(3).getByRole('button', { name: /^Remove / }).click();
  assert.equal(await rows.count(), 3, 'Remove takes the source out of the list');
  assert.deepEqual(writes, [], `listing sources created or stored something: ${writes}`);
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
// Explore carries the same quiet dot grid as Home and Library (owner 2026-10-23, reversing the earlier no-dots brief).
const assertLight = (look, where, dots = true) => {
  assert.equal(look.page, LIGHT.page, `${where}: the page is the subtle grey`);
  if (dots) assert.ok(look.dots.includes(LIGHT.dots) && !look.dots.includes('rgb(233, 233, 231)'), `${where}: the page dots are the quiet browse dots (${look.dots})`);
  else assert.equal(look.dots, 'none', `${where}: no dot grid`);
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
// 340 characters exactly (the description limit), an unbroken address, and a description saved before the limit (480, over it).
const DESC340 = 'A full-length description that uses every one of the 340 characters a card may carry, written as plain sentences so that it wraps over several lines at the smallest size. '.repeat(3).slice(0, 340);
const ADDRESS_DESC = `See https://example.com/${'a'.repeat(110)}/end for the whole address, which has no place to break.`;
const LEGACY_DESC = 'A description saved before the limit was 340 characters, which a card still shows whole. '.repeat(6).slice(0, 480);
assert.equal(DESC340.length, 340);
const catalog = (await api('/api/apps')).body;
const canvasPatch = {
  [made[0].name]: { title: LONG_TITLE, owner_handle: LONG_HANDLE, owner_name: LONG_NAME, access: 'unlisted', description: DESC340, fork_count: 1240 },
  [made[1].name]: { title: 'miniGPT', access: 'public', description: LEGACY_DESC, fork_count: 3 },
  [made[2].name]: { title: UNBROKEN, owner_name: 'Ada', access: 'private', description: ADDRESS_DESC },
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
    { url: '/e/tokLong1', title: LONG_TITLE, description: DESC340, creator: { handle: LONG_HANDLE, name: LONG_NAME }, fork_count: 1240, updated_at: '2026-10-20 09:00:00', project: LONG_PROJECT },
    { url: '/e/tokShort2', title: 'miniGPT', description: 'Short.', creator: { handle: 'ada', name: null }, fork_count: 3, updated_at: '2026-10-20 09:00:00' },
    { url: '/e/tokMine3', title: 'My own canvas', creator: { handle: `cs_${run}`, name: null }, fork_count: 2, updated_at: '2026-10-20 09:00:00' },
    { url: '/e/tokWord4', title: UNBROKEN, description: ADDRESS_DESC, creator: { handle: 'bob_the_builder_of_things', name: 'Bob' }, updated_at: '2026-10-20 09:00:00', project: 'karpathy/nanoGPT' },
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
      ['project', q('[data-card-project]')], ['more', q('[title="Card options"]')], ['description', q('[data-card-description]')], ['forks', q('[data-fork-count]')],
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
    // There is no disclosure button (owner brief 2026-10-23): the title, the creator and the project are cut nowhere, at any size; the
    // description is whole at every size (owner decision, task 2f608983). The card never scrolls sideways.
    const size = document.documentElement.dataset.cardSize;
    const wholeText = [['the title', q('[data-card-title]')], ['the creator', q('[data-creator] > span')], ['the project', q('[data-card-project] > span')], ['the description', q('[data-card-description]')]];
    for (const [what, el] of wholeText) {
      if (el && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) problems.push(`${name}: ${what} is cut short (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`);
    }
    if (card.scrollWidth > card.clientWidth + 1) problems.push(`${name}: the card scrolls sideways (${card.scrollWidth} > ${card.clientWidth})`);
    if (q('[data-card-title-toggle]') || [...card.querySelectorAll('button')].some((b) => /^Show (full title|less)$/.test(b.getAttribute('aria-label') || ''))) problems.push(`${name}: a Show full title button is still there`);
    // Small and Medium small are as tall as their content: the footer follows the text (or the actions) with no blank band above it,
    // and the card ends one padding below the footer, so a short card has no description-sized hole.
    if (size === '0' || size === '1') {
      const footer = q('[data-card-footer]'), before = footer?.previousElementSibling;
      if (footer && before) {
        const gap = footer.getBoundingClientRect().top - before.getBoundingClientRect().bottom;
        if (gap > 4) problems.push(`${name}: ${Math.round(gap)}px of blank above the footer`);
      }
      if (footer) {
        const tail = box.bottom - footer.getBoundingClientRect().bottom;
        if (tail > 20) problems.push(`${name}: ${Math.round(tail)}px of blank below the footer`);
      }
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
    await expect(page.locator('[data-card-title-toggle], button[aria-label="Show full title"], button[aria-label="Show less"]')).toHaveCount(0);
    // The long title is on the page whole, and (measure) cut nowhere.
    if (long) await expect.poll(async () => (await page.locator(selector).filter({ hasText: long }).first().locator('[data-card-title]').innerText()).replace(/\s+/g, ' ').trim(), { message: `${where}, size ${n}: the whole title` }).toBe(LONG_TITLE);
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

const DESCRIPTION = '[data-card-description]';
// A card's text and the boxes it must not leave: the description is read from the page and compared with its own text.
const descriptionOf = (page, selector, hasText) => page.locator(selector).filter({ hasText }).first().locator(DESCRIPTION);
const whole = async (locator, text, where) => {
  await locator.scrollIntoViewIfNeeded();
  assert.equal((await locator.innerText()).replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim(), `${where}: the description text`);
  assert.deepEqual(await locator.evaluate((n) => ({ clip: n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1, clamp: getComputedStyle(n).webkitLineClamp, overflow: getComputedStyle(n).overflowY })), { clip: false, clamp: 'none', overflow: 'visible' }, `${where}: the description is not clamped or clipped`);
};

await check('All four sizes show the whole description: 340 characters, an unbroken address and one saved over the limit, on Library, Explore and Home; light, dark and a phone; no chevron, no clipping; no blank band at Small and Medium small; it survives a size change and a reload', async () => {
  for (const [label, viewport, mobile, scheme] of [['desktop', { width: 1440, height: 900 }, false, 'light'], ['dark', { width: 1440, height: 900 }, false, 'dark'], ['phone', { width: 390, height: 844 }, true, 'light']]) {
    const page = await seeded(viewport, { mobile });
    await page.emulateMedia({ colorScheme: scheme });
    await onLibrary(page);
    for (const n of [0, 1, 2, 3]) {
      await slider(page).fill(String(n));
      const where = `${label} Library, size ${n}`;
      await whole(descriptionOf(page, '[data-library-card="canvas"]', LONG_START), DESC340, `${where}, 340 characters`);
      await whole(descriptionOf(page, '[data-library-card="canvas"]', LEGACY_DESC.slice(0, 30)), LEGACY_DESC, `${where}, saved over the limit`);
      await whole(descriptionOf(page, '[data-library-card="canvas"]', ADDRESS_DESC.slice(0, 30)), ADDRESS_DESC, `${where}, an unbroken address`);
      assert.equal(await page.locator('[data-library-card="canvas"]').filter({ hasText: 'Public canvas with a mid-length title' }).locator(DESCRIPTION).count(), 0, `${where}: an empty description reserves no hole`);
      await settled(page, '[data-library-card="canvas"]', where);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, `${where}: the page scrolls sideways`);
    }
    await page.screenshot({ path: `${SHOTS}/card-description-${label}-library-size1.png` });
    await slider(page).fill('0');
    await page.screenshot({ path: `${SHOTS}/card-description-${label}-library-size0.png` });
    // Reload: the size and the whole description are still there.
    await page.reload();
    await slider(page).waitFor({ timeout: 60000 });
    assert.equal(await slider(page).inputValue(), '0', `${label}: the size survives a reload`);
    await page.locator('[data-library-card="canvas"]').nth(3).waitFor({ timeout: 30000 });
    await whole(descriptionOf(page, '[data-library-card="canvas"]', LONG_START), DESC340, `${label} Library after a reload`);
    await settled(page, '[data-library-card="canvas"]', `${label} Library after a reload`);
    // Explore (public cards carrying actions and counts), then Home.
    await onExplore(page);
    await page.locator('[data-explore-card]').nth(3).waitFor({ timeout: 30000 });
    for (const n of [0, 1, 2, 3]) {
      await slider(page).fill(String(n));
      await whole(descriptionOf(page, '[data-explore-card]', LONG_START), DESC340, `${label} Explore, size ${n}`);
      await whole(descriptionOf(page, '[data-explore-card]', ADDRESS_DESC.slice(0, 30)), ADDRESS_DESC, `${label} Explore, size ${n}, an unbroken address`);
      assert.equal(await page.locator('[data-explore-card]').filter({ hasText: LONG_START }).locator('[data-card-start-rabbit-hole]').count() > 0, true, `${label} Explore: the actions are on the card`);
      await settled(page, '[data-explore-card]', `${label} Explore, size ${n}`);
    }
    await page.screenshot({ path: `${SHOTS}/card-description-${label}-explore.png` });
    await page.goto(`${BASE}/apps`);
    await page.locator('[data-recent-card]').nth(3).waitFor({ timeout: 60000 });
    for (const n of [0, 1, 2, 3]) {
      await slider(page).fill(String(n));
      await whole(descriptionOf(page, '[data-recent-card]', LONG_START), DESC340, `${label} Home, size ${n}`);
      await settled(page, '[data-recent-card]', `${label} Home, size ${n}`);
    }
    await page.screenshot({ path: `${SHOTS}/card-description-${label}-home.png` });
    await page.context().close();
  }
});

await check('sizes 2 and 3 keep the picture where it was while the whole description grows the card: stacked above the text at Medium large, beside it at Large, 2:1, no chevron (owner decision, task 2f608983, replacing the clamp this check asserted)', async () => {
  const page = await seeded();
  await onLibrary(page);
  for (const n of [2, 3]) {
    await slider(page).fill(String(n));
    await expect(page.locator('[data-card-title-toggle]')).toHaveCount(0);
    await settled(page, '[data-library-card="canvas"]', `Library, size ${n}`);
    const boxes = await page.locator('[data-library-card="canvas"]').evaluateAll((els) => els.map((e) => { const t = e.querySelector('[data-card-thumbnail]').getBoundingClientRect(), x = e.querySelector('[data-card-text]').getBoundingClientRect(), c = e.getBoundingClientRect(); return { thumb: { w: t.width, h: t.height, top: t.top, inset: t.top - c.top, left: t.left, right: t.right }, text: { left: x.left, right: x.right, top: x.top, bottom: x.bottom }, card: { h: c.height } }; }));
    for (const [i, b] of boxes.entries()) {
      assert.ok(Math.abs(b.thumb.w / b.thumb.h - 2) < 0.05, `size ${n} card ${i}: the picture is 2:1 (${b.thumb.w} x ${b.thumb.h})`);
      if (n === 3) assert.ok(b.text.right <= b.thumb.left + 1 && Math.abs(b.thumb.inset - 17) <= 1, `size ${n} card ${i}: the picture stays beside the text at the top`);
      else assert.ok(b.text.top >= b.thumb.top + b.thumb.h - 1, `size ${n} card ${i}: the picture stays above the text`);
    }
    await whole(descriptionOf(page, '[data-library-card="canvas"]', LONG_START), DESC340, `Library, size ${n}`);
  }
  await page.context().close();
});

await browser.close();
assert.deepEqual(asks, [], 'no ask request was made');
assert.deepEqual(errors, [], 'no page errors');
const TOTAL = 22;
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
