// The Table of contents' empty state and Links in Search (owner UI brief 2026-10-20 sections 6 and 7, clarification 10;
// required validation items 13, 14 and 15). Against the LOCAL stack only: local D1, fresh browser profiles. No model is
// called: /api/learn/ask is answered here, every other model route is aborted and counted. Prints no secrets.
//   1-2 (item 14) no Links tab; Search's Links filter lists links from this canvas and backlinks by canvas title, with counts,
//       in All and its counts, matched by canvas and card titles, never by a raw id
//   3   an unavailable (trashed) target: labelled, no destination, no new tab; selecting it says so and stays
//   4   an origin card chip frames that card; Enter in the field steps through link results without leaving the canvas
//   5   a link opens its canvas in this tab; a backlink chip opens the source canvas at its card
//   6   (item 15) keyboard and names: the filter and the new-tab buttons
//   7   (item 13) went with the TOC conversation (owner 2026-11-18)
//   8   dark: the Links results
// Usage: BASE=http://127.0.0.1:9171 SMALL_CP=http://127.0.0.1:9173 VARS=<cp .dev.vars> OUT=<dir> node e2e/toc-links-search-check.mjs
import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9171';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9173';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('toc-links-search-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/toc-links-search', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `tls-${run}@example.com`, secret, handle: `tls_${run}` }) })).json();
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', origin: BASE } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const card = (id, title, body, refs) => ({ id, type: 'explanation', dx: 0, dy: 0, title, body, ...(refs ? { refs } : {}) });
const makeCanvas = async (title, state) => {
  const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).body;
  if (!/^canvas-[a-f0-9]{8}$/.test(canvas?.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
  const path = `/api/learn/boards/${canvas.name}/main`, now = (await api(path)).body;
  const saved = (await api(path, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], blocks: [], groups: [], areas: [], ...state }, version: now.exists === false ? 0 : now.version ?? 0 }) })).body;
  if (!saved?.board_id) throw Error(`the seed board was not saved: ${JSON.stringify(saved).slice(0, 200)}`);
  return { name: canvas.name, id: saved.board_id, title };
};
const T = await makeCanvas(`Graph traversal ${run}`, { blocks: [card('t1', 'Breadth-first search', 'Level by level.')] });
const X = await makeCanvas(`Retired notes ${run}`, { blocks: [card('x1', 'Old card', 'Soon in the trash.')] });
const A1 = `Recursive traversal ${run}`, A2 = `Leftover link ${run}`, B1 = `Depth of a tree ${run}`;
const A = await makeCanvas(`Recursion ${run}`, { blocks: [card('a1', A1, 'Visit each node, then its children.', [{ id: crypto.randomUUID(), target: T.id }]), card('a2', A2, 'Points at a canvas that is gone.', [{ id: crypto.randomUUID(), target: X.id }])] });
const B = await makeCanvas(`Tree algorithms ${run}`, { blocks: [card('b1', B1, 'The longest path from the root.', [{ id: crypto.randomUUID(), target: A.id }])] });
assert.ok((await api(`/api/apps/${X.name}/trash`, { method: 'POST', body: '{}' })).status < 300, 'trash X');
const linksOf = async id => (await api(`/api/learn/links/${id}`)).body;
assert.equal((await linksOf(A.id))?.from?.find(group => group.target === X.id)?.unavailable, true, 'the server lists the trashed target as unavailable');

const browser = await chromium.launch();
const results = [], stray = [], errors = [], asks = [];
const total = 8;
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const contextFor = async theme => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(value => localStorage.setItem('small.theme', value), theme);
  // /api/learn/ask is answered here; any other model route is refused.
  await context.route('**/api/learn/ask', route => { asks.push(JSON.parse(route.request().postData() || '{}')); return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: 'Canned outline reply.' }) + frame('done', { ok: true, threadId: `toc-l4-${run}`, userMessageId: 'u-1', messageId: 'm-1' }) }); });
  await context.route(/\/api\/learn\/(tutor(?!\/next-steps)|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); stray.push(route.request().url()); return route.abort(); });
  await context.route(/\/api\/learn\/chat\//, route => (route.request().method() === 'GET' ? route.continue() : route.fulfill({ json: { ok: true } }))); // the canned thread exists nowhere
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};
let { context, page } = await contextFor('light');
const panel = () => page.locator('aside[aria-label="Learn agent chat"]');
const search = () => panel().locator('[data-canvas-search]');
const linkResult = id => search().locator(`[data-search-result="${id}"]`);
// The Filter dropdown (owner 2026-10-22): one button, its menu of checkbox rows with counts. pick(id) leaves exactly that
// category picked ('all' clears the pick) and closes the menu; countOf(id) reads a row's count ('all': the unfiltered
// result count, read with nothing picked).
const filterButton = () => search().locator('[data-search-filter-button]');
const menu = () => page.locator('[data-search-filter-menu]');
const row = id => menu().locator(`[data-search-filter="${id}"]`);
const closeMenu = async () => { await page.keyboard.press('Escape'); await menu().waitFor({ state: 'detached' }); };
const pick = async id => {
  await filterButton().click(); const clear = menu().locator('[data-search-filter-clear]'); await clear.waitFor();
  if (await clear.isEnabled()) await clear.click();
  if (id !== 'all') await row(id).click();
  await closeMenu();
};
const countOf = async id => {
  if (id === 'all') { const text = await search().locator('[data-find-count]').innerText(); return Number((text.match(/of (\d+)/) || text.match(/^(\d+)/))[1]); }
  await filterButton().click(); const value = Number(await row(id).locator('[data-menu-hint]').innerText()); await closeMenu(); return value;
};
const selected = () => page.$$eval('[data-block-id][aria-current="true"]', nodes => nodes.map(node => node.dataset.blockId));
const waitFor = async (fn, ms, what) => { for (const end = Date.now() + ms; ; await page.waitForTimeout(100)) { const value = await fn().catch(() => false); if (value) return value; if (Date.now() > end) throw Error(what); } };
// The opening toast (bottom right) passes over the panel's foot; shots wait for it to go.
const shot = async (name, on = panel()) => { await page.getByText('You are seeing the latest saved version', { exact: false }).waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {}); await page.waitForTimeout(300); await on.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const open = async (canvas, id) => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator(`[data-block-id="${id}"]`).waitFor({ timeout: 60000 });
  if (!(await page.getByRole('button', { name: 'Hide the right panel' }).count())) await page.getByRole('button', { name: 'Show the right panel' }).click();
};
const openLinks = async () => {
  await page.locator('[data-panel-tab="find"]').click();
  await pick('links');
  await waitFor(async () => (await search().locator('[data-search-result^="link:"]').count()) === 3, 15000, 'the Links filter never showed three links');
};

await open(A, 'a1');
await check('1 no Links tab: five tray tabs (Search last, owner 2026-11-07), nothing named Links in the header', async () => {
  const tabs = await page.locator('[data-panel-header] [role="tab"]').evaluateAll(nodes => nodes.map(node => node.dataset.panelTab));
  assert.deepEqual(tabs, ['chat', 'toc', 'progress', 'comments', 'find']);
  assert.equal(await page.locator('[data-panel-header]').getByRole('button', { name: 'Links' }).count(), 0);
  assert.equal(await page.locator('[data-panel-tab="links"], [data-links-panel]').count(), 0);
});

await check('2 Search lists the links and backlinks by canvas title, counted under Links and in All, and matches them by title', async () => {
  await openLinks();
  assert.equal(await countOf('links'), 3);
  const text = await search().locator('ol[aria-label="Search results"]').innerText();
  for (const label of [T.title, B.title, 'Unavailable canvas', A1, A2, B1, 'Linked from this canvas', 'Links here (backlink)']) assert.ok(text.includes(label), `the Links results lack "${label}"`);
  for (const id of [T.id, X.id, B.id, X.title]) assert.ok(!text.includes(id), `the Links results show "${id}"`);
  assert.equal(await linkResult(`link:to:${B.id}`).getAttribute('data-links-direction'), 'to');
  await pick('all');
  assert.equal(await countOf('all'), (await search().locator('[data-search-result^="object:"]').count()) + 3, 'All counts the cards and the three links');
  assert.equal(await search().locator('[data-search-result^="link:"]').count(), 3, 'All lists the links');
  await search().getByRole('textbox', { name: 'Find text on canvas' }).fill('Graph traversal');
  // The link, and the card whose reference chip names that canvas (an existing References match).
  await waitFor(async () => (await countOf('links')) === 1 && (await countOf('all')) === 2, 5000, 'a canvas title does not match its link and its origin card');
  assert.equal(await linkResult(`link:from:${T.id}`).count(), 1);
  await search().getByRole('textbox', { name: 'Find text on canvas' }).fill(B1);
  await waitFor(async () => (await countOf('links')) === 1, 5000, 'a backlink is not matched by its card title');
  await search().getByRole('textbox', { name: 'Find text on canvas' }).fill('');
  await pick('links');
  await shot('01-links-in-search-light');
});

await check('3 an unavailable target: labelled, no destination or new tab; selecting it says so and stays on this canvas', async () => {
  const gone = linkResult(`link:from:${X.id}`);
  assert.equal(await gone.getAttribute('data-unavailable'), 'true');
  assert.equal(await gone.getByRole('button', { name: /in new tab$/ }).count(), 0);
  const url = page.url();
  await gone.locator('[data-search-index]').click();
  await search().getByRole('status').filter({ hasText: 'This canvas is unavailable.' }).waitFor();
  assert.equal(page.url(), url);
});

await check('4 an origin chip frames its card; Enter in the field steps through link results without leaving the canvas', async () => {
  await linkResult(`link:from:${T.id}`).locator('[data-links-origin="a1"]').click();
  await waitFor(async () => (await selected()).join() === 'a1', 8000, 'the origin chip did not select its card');
  const url = page.url(), field = search().getByRole('textbox', { name: 'Find text on canvas' });
  await field.focus();
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  assert.equal(page.url(), url, 'stepping opened a link');
  assert.ok(await search().locator('[data-search-result] [aria-current="true"]').count(), 'a result is current');
});

await check('5 a link opens its canvas in this tab; a backlink chip opens the source canvas at its card', async () => {
  await linkResult(`link:from:${T.id}`).locator('[data-search-index]').click();
  await page.waitForURL(url => url.pathname === `/apps/${T.name}`, { timeout: 30000 });
  await page.locator('[data-block-id="t1"]').waitFor({ timeout: 60000 });
  await open(A, 'a1');
  await openLinks();
  const chip = linkResult(`link:to:${B.id}`).locator('[data-links-backlink="b1"]');
  assert.equal(new URL(await chip.getAttribute('href'), BASE).searchParams.get('card'), 'b1', 'the backlink names its card');
  await chip.click();
  await page.waitForURL(url => url.pathname === `/apps/${B.name}`, { timeout: 30000 });
  await page.locator('[data-block-id="b1"]').waitFor({ timeout: 60000 });
  await waitFor(async () => (await selected()).join() === 'b1', 8000, 'the backlink did not select its card');
});

await check('6 keyboard and names: the Links filter and the new-tab buttons', async () => {
  await open(A, 'a1');
  await page.locator('[data-panel-tab="find"]').click();
  // The Filter dropdown by keyboard: Enter opens it on its first row, End reaches the last enabled row (Rabbit Holes; Clear is
  // greyed out with nothing picked), ArrowUp reaches Links, Space toggles it, Escape closes the menu back onto the button.
  await pick('all');
  await filterButton().focus(); await page.keyboard.press('Enter');
  await expect(menu().locator('[role="menuitemcheckbox"]').first()).toBeFocused();
  await page.keyboard.press('End'); await expect(row('rabbit-holes')).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(row('links')).toBeFocused();
  assert.equal(await row('links').getAttribute('title'), 'Other canvases this one links to or from', 'Links explains itself');
  await page.keyboard.press('Space');
  await expect(row('links')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape'); await menu().waitFor({ state: 'detached' });
  await expect(filterButton()).toBeFocused(); await expect(filterButton()).toHaveText('Filter (1)');
  await waitFor(async () => (await search().locator('[data-search-result^="link:"]').count()) === 3, 15000, 'Links by keyboard');
  for (const [id, name] of [[`link:from:${T.id}`, `Open ${T.title} in new tab`], [`link:to:${B.id}`, `Open ${B.title} in new tab`], [`link:to:${B.id}`, `Open ${B1} in new tab`]]) {
    const button = linkResult(id).getByRole('button', { name, exact: true });
    assert.equal(await button.getAttribute('title'), name, `${name}: a tooltip`);
  }
  const popup = page.waitForEvent('popup');
  await linkResult(`link:from:${T.id}`).getByRole('button', { name: `Open ${T.title} in new tab`, exact: true }).click();
  const tab = await popup;
  await tab.waitForURL(url => url.pathname === `/apps/${T.name}`);
  await tab.close();
  assert.equal(new URL(page.url()).pathname, `/apps/${A.name}`, 'a new tab leaves this canvas');
  // step 6's TOC entry and its close button went with the TOC conversation (owner 2026-11-18).
});

// 7 went with the TOC conversation (owner 2026-11-18).
// 8's TOC conversation restore and dark empty entry went with the TOC conversation (owner 2026-11-18).
await check('8 dark: the Links results', async () => {
  await context.close();
  ({ context, page } = await contextFor('dark'));
  await open(A, 'a1');
  await openLinks();
  await shot('05-links-in-search-dark');
});

await check('9 no other model route and no page error', async () => {
  assert.deepEqual(stray, []);
  assert.deepEqual(errors, []);
});
await browser.close();
console.log(`${results.length}/${total} checks passed`);
if (results.length !== total) process.exit(1);
