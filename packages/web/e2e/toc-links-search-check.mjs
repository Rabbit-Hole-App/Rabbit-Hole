// The Table of contents' empty state and Links in Search (owner UI brief 2026-10-20 sections 6 and 7, clarification 10;
// required validation items 13, 14 and 15). Against the LOCAL stack only: local D1, fresh browser profiles. No model is
// called: the TOC's one Tutor turn is answered here, every other model route is aborted and counted. Prints no secrets.
//   1-2 (item 14) no Links tab; Search's Links filter lists links from this canvas and backlinks by canvas title, with counts,
//       in All and its counts, matched by canvas and card titles, never by a raw id
//   3   an unavailable (trashed) target: labelled, no destination, no new tab; selecting it says so and stays
//   4   an origin card chip frames that card; Enter in the field steps through link results without leaving the canvas
//   5   a link opens its canvas in this tab; a backlink chip opens the source canvas at its card
//   6   (item 15) keyboard and names: the filter, the new-tab buttons, the TOC entry and its close button
//   7   (item 13) no TOC messages: no "TOC conversation" section or composer, one entry; a sent turn shows the section;
//       a reload restores it from the saved TOC thread with no press
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
const total = 9;
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const contextFor = async theme => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(value => localStorage.setItem('small.theme', value), theme);
  // The TOC's one Tutor turn (mode tutor on /api/learn/ask) is answered here; any other model route is refused.
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
const filter = id => search().locator(`[data-search-filter="${id}"]`);
const countOf = async id => Number((await filter(id).innerText()).match(/(\d+)\s*$/)[1]);
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
  await filter('links').click();
  await waitFor(async () => (await search().locator('[data-search-result^="link:"]').count()) === 3, 15000, 'the Links filter never showed three links');
};

await open(A, 'a1');
await check('1 no Links tab: four tray tabs, nothing named Links in the header', async () => {
  const tabs = await page.locator('[data-panel-header] [role="tab"]').evaluateAll(nodes => nodes.map(node => node.dataset.panelTab));
  assert.deepEqual(tabs, ['chat', 'find', 'toc', 'comments']);
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
  await filter('all').click();
  assert.equal(await countOf('all'), (await countOf('cards')) + 3, 'All counts the cards and the three links');
  assert.equal(await search().locator('[data-search-result^="link:"]').count(), 3, 'All lists the links');
  await search().getByRole('textbox', { name: 'Find text on canvas' }).fill('Graph traversal');
  // The link, and the card whose reference chip names that canvas (an existing References match).
  await waitFor(async () => (await countOf('links')) === 1 && (await countOf('all')) === 2, 5000, 'a canvas title does not match its link and its origin card');
  assert.equal(await linkResult(`link:from:${T.id}`).count(), 1);
  await search().getByRole('textbox', { name: 'Find text on canvas' }).fill(B1);
  await waitFor(async () => (await countOf('links')) === 1, 5000, 'a backlink is not matched by its card title');
  await search().getByRole('textbox', { name: 'Find text on canvas' }).fill('');
  await filter('links').click();
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

await check('6 keyboard and names: the Links filter, the new-tab buttons, the TOC entry and its close button', async () => {
  await open(A, 'a1');
  await page.locator('[data-panel-tab="find"]').click();
  await filter('all').focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(filter('links')).toBeFocused();
  await page.keyboard.press('Enter');
  assert.equal(await filter('links').getAttribute('aria-pressed'), 'true');
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
  await page.locator('[data-panel-tab="toc"]').click();
  const entry = panel().getByRole('button', { name: 'Ask the Tutor about this outline', exact: true });
  assert.equal(await entry.getAttribute('title'), 'Ask the Tutor about this outline');
  await entry.focus();
  await page.keyboard.press('Enter');
  await expect(panel().locator('[data-toc-ask] [data-toc-composer] textarea').first()).toBeFocused();
  const close = panel().getByRole('button', { name: 'Close the Tutor composer', exact: true });
  assert.equal(await close.getAttribute('title'), 'Close the Tutor composer');
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(entry).toBeFocused();
  assert.equal(await panel().locator('[data-toc-ask], [data-toc-composer]').count(), 0, 'closed: the composer is gone');
});

await check('7 no TOC messages: no "TOC conversation" section or composer; a sent turn shows the section with its reply', async () => {
  await page.reload();
  await page.locator('[data-block-id="a1"]').waitFor({ timeout: 60000 });
  await page.locator('[data-panel-tab="toc"]').click();
  await panel().locator('[data-toc-start]').waitFor();
  assert.equal(await panel().locator('[data-toc-conversation], [data-toc-ask], [data-toc-composer]').count(), 0);
  assert.equal(await panel().getByText('TOC conversation', { exact: true }).count(), 0);
  await shot('02-toc-empty-light');
  await panel().locator('[data-toc-start] button').click();
  await panel().locator('[data-toc-ask] [data-toc-composer] textarea').first().fill('Add a part on graphs');
  await panel().locator('[data-toc-composer] button[aria-label="Send"]').click();
  await panel().locator('[data-toc-conversation]').getByText('Canned outline reply.', { exact: true }).waitFor({ timeout: 15000 });
  assert.ok(await panel().getByRole('button', { name: 'TOC conversation' }).isVisible(), 'the section header shows');
  assert.equal(asks.length, 1); assert.equal(asks[0].mode, 'tutor');
  await shot('03-toc-conversation-light');
});

await check('8 a reload restores the TOC conversation from the saved TOC thread, with no press', async () => {
  const threadId = `toc-l4-${run}`;
  await page.route(/\/api\/learn\/chat\/active\?.*slot=toc/, route => (route.request().method() === 'GET' ? route.fulfill({ json: { threadId } }) : route.fallback()));
  await page.route(new RegExp(`/api/ask/threads/${threadId}$`), route => route.fulfill({ json: { id: threadId, title: 'Add a part on graphs', mode: 'tutor', contextRefs: [], draft: null, messages: [{ role: 'user', content: 'Add a part on graphs', status: 'done' }, { role: 'assistant', content: 'Canned outline reply.', status: 'done' }] } }));
  await page.reload();
  await page.locator('[data-block-id="a1"]').waitFor({ timeout: 60000 });
  await page.locator('[data-panel-tab="toc"]').click();
  await panel().locator('[data-toc-conversation]').getByText('Canned outline reply.', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await panel().locator('[data-toc-start]').count(), 0, 'no entry over a restored conversation');
  assert.equal(asks.length, 1, 'restoring sent nothing');
  // The same in dark: the empty entry on another canvas, and the Links results.
  await context.close();
  ({ context, page } = await contextFor('dark'));
  await open(B, 'b1');
  await page.locator('[data-panel-tab="toc"]').click();
  await panel().locator('[data-toc-start]').waitFor();
  await shot('04-toc-empty-dark');
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
