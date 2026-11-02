// Creator analytics end to end (docs/features/creator-analytics-contract.md; owner brief 2026-11-02 replaces the old check that
// no analytics request is made): visits through the real ingest route reach the owner's read and the centered dialog, against
// the LOCAL stack only: local D1 and fresh browser profiles. Learning outcomes are fixtures; no model is called and nothing is
// sent from a composer. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8838 SMALL_CP=http://127.0.0.1:8839 node e2e/analytics-ui-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { periodText } from '../src/creator-analytics.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8838';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8839';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('analytics-ui-check runs against the local stack only');
const SHOTS = process.argv[2] || 'analytics-ui-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const EMAIL = { owner: `an-owner-${run}@example.com`, viewer: `an-viewer-${run}@example.org` };
const H = { owner: `kvwriter_${run}`, viewer: `reader_${run}` };
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(EMAIL.owner, H.owner) };
const viewer = { session: await sessionFor(EMAIL.viewer, H.viewer) };
const api = async (who, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(who ? { cookie: `small_session=${who.session}` } : {}), 'content-type': 'application/json' } });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const post = (who, path, body = {}) => api(who, path, { method: 'POST', body: JSON.stringify(body) });
const STATE = (text, block = {}) => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'c1', type: 'explanation', dx: 0, dy: 0, title: text, body: `${text}, explained.`, ...block }] });
const canvas = async (who, title, block) => {
  const c = (await post(who, '/api/canvases', { title })).body;
  await api(who, `/api/learn/boards/${c.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE(title, block) }) });
  return c;
};
const publish = async (who, c) => { await post(who, `/api/apps/${c.name}/publish`); return (await api(who, `/api/apps/${c.name}`)).body.publication_token; };
// One batch through the real ingest route. who null is an anonymous browser.
const uuid = () => crypto.randomUUID();
const ingest = (who, token, visitor, session, events, extra = {}) => post(who, `/api/learn/boards/shared/${token}/events`, { visitor_id: visitor, session_id: session, ...extra, events });
const read = (who, canvasName, range = '30d', more = '') => api(who, `${canvasName ? `/api/analytics/publications/${canvasName}` : '/api/analytics/creator'}?range=${range}${more}`);

// Each run's owner is new, so plain titles are unique in their Library; Explore is matched by this run's @handle too.
const T = { kv: 'KV Cache', moe: 'Mixture of Experts', cohort: 'Learning rate', draft: 'Draft notes', unlisted: 'Shared notes' };
const kv = await canvas(owner, T.kv), moe = await canvas(owner, T.moe), draft = await canvas(owner, T.draft), unlisted = await canvas(owner, T.unlisted);
const cohort = await canvas(owner, T.cohort, { spec: { conceptIds: ['rate'] } });
const token = await publish(owner, kv), moeToken = await publish(owner, moe), cohortToken = await publish(owner, cohort);
const shareToken = (await post(owner, `/api/learn/boards/${unlisted.name}/main/share`, { shared: true, view: true, public_view: true, state: STATE(T.unlisted) })).body.sharing.view;
await post(viewer, '/api/learn/boards/fork', { source: { token }, key: `an-fork-a-${run}` });
await post(viewer, '/api/learn/boards/fork', { source: { token }, key: `an-fork-b-${run}` });
const forks = (await api(owner, `/api/apps/${kv.name}`)).body.fork_count;
assert.equal(forks, 2);

const browser = await chromium.launch();
const errors = [];
const contextFor = async (who, options = {}, init = null) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (page, name, locator = page) => { await page.waitForTimeout(400); await locator.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const card = (page, title) => page.locator('[data-library-card="canvas"]').filter({ has: page.locator('[data-card-title]', { hasText: new RegExp(`^${title}$`) }) });
const menuOf = async (page, title) => { await card(page, title).hover(); await card(page, title).getByTitle('Card options').click(); await page.getByRole('button', { name: 'Rename', exact: true }).waitFor(); };
const dialogOf = page => page.locator('[data-analytics-dialog]');
const settled = async page => { await dialogOf(page).waitFor({ timeout: 10000 }); await page.waitForFunction(() => { const d = document.querySelector('[data-analytics-dialog]'); return d && d.dataset.analyticsState !== 'loading' && !d.querySelector('[data-analytics-body][aria-busy="true"]'); }, null, { timeout: 15000 }); };
const openBoard = async (page, title) => { await menuOf(page, title); await page.locator('[data-menu-analytics]').click(); await settled(page); };
const tile = (page, key) => page.locator(`[data-metric="${key}"] [data-metric-value]`);
const closeDialog = async page => { await page.locator('[data-analytics-close]').click(); await dialogOf(page).waitFor({ state: 'detached' }); };

// ── Collection and reads through the routes ──
await check('1 launch: a public board with no audience reads as zero opens, hidden visitors and active collection', async () => {
  const { status, body } = await read(owner, moe.name);
  assert.equal(status, 200);
  assert.deepEqual([body.scope.kind, body.scope.canvas, body.range, body.period.timezone, body.threshold], ['publication', moe.name, '30d', 'UTC', 10]);
  assert.equal(body.collection.status, 'active');
  assert.equal(body.collection.own_visits_excluded, true);
  assert.equal(body.overview.total_opens.value, 0);
  assert.equal(body.overview.unique_visitors.value, null, 'below the cohort: hidden, never 0');
  assert.equal(body.overview.unique_visitors.reason, 'insufficient_cohort');
  for (const key of ['visits', 'active_time', 'cards', 'concepts', 'resources', 'next_steps', 'conversions', 'stars', 'outcomes', 'revisions', 'sources']) assert.ok(['live', 'partial', 'unavailable'].includes(body.producers[key]?.readiness), key);
});

const anon = { visitor: uuid(), session: uuid() };
const firstVisit = [{ id: uuid(), type: 'open', source: 'linkedin', campaign: 'launch' }, { id: uuid(), type: 'seen', material_id: 'c1' }, { id: uuid(), type: 'acted', material_id: 'c1' }];
await check('2 an anonymous and a signed-in visit are accepted and reach the owner\'s read: opens public, visitors hidden', async () => {
  const a = await ingest(null, token, anon.visitor, anon.session, firstVisit);
  assert.equal(a.status, 200);
  assert.equal(a.body.accepted, 3);
  const b = await ingest(viewer, token, uuid(), uuid(), [{ id: uuid(), type: 'open', source: 'direct' }]);
  assert.equal(b.body.accepted, 1);
  const { overview, boards, learning } = (await read(owner, kv.name)).body;
  assert.equal(overview.total_opens.value, 2);
  assert.equal(overview.unique_visitors.value, null);
  assert.equal(overview.canonical_forks.value, forks);
  assert.equal(boards.find(row => row.canvas === kv.name).opens.value, 2);
  assert.equal(learning.cards.find(c => c.material_id === 'c1').seen.value, null, 'one visitor saw it: hidden');
});
await check('3 a retried batch counts nothing again; a heartbeat with no new active time creates no open', async () => {
  const again = await ingest(null, token, anon.visitor, anon.session, firstVisit);
  assert.deepEqual([again.body.accepted, again.body.ignored], [0, 3]);
  await ingest(null, token, anon.visitor, anon.session, [{ id: uuid(), type: 'active', active_seconds: 0 }]);
  assert.equal((await read(owner, kv.name)).body.overview.total_opens.value, 2);
});
await check('4 the owner\'s own signed-in visit is dropped and changes nothing', async () => {
  const mine = await ingest(owner, token, uuid(), uuid(), [{ id: uuid(), type: 'open', source: 'direct' }]);
  assert.equal(mine.body.dropped, 'own_visit');
  assert.equal(mine.body.accepted, 0);
  assert.equal((await read(owner, kv.name)).body.overview.total_opens.value, 2);
});
await check('5 nobody else reads it: a viewer 404, signed out 401, the viewer\'s creator read has no owner board; an unlisted link collects nothing', async () => {
  assert.equal((await read(viewer, kv.name)).status, 404);
  assert.equal((await read(null, kv.name)).status, 401);
  assert.equal((await read(null, null)).status, 401);
  const theirs = await read(viewer, null);
  assert.equal(theirs.status, 200);
  assert.ok(!theirs.body.boards.some(row => row.canvas === kv.name), 'no owner board');
  assert.equal((await ingest(null, shareToken, uuid(), uuid(), [{ id: uuid(), type: 'open', source: 'direct' }])).status, 404);
});
await check('6 at 10 visitors the protected metrics appear, a small source stays hidden, and instant active time is not credited', async () => {
  for (let i = 0; i < 12; i++) {
    const events = [{ id: uuid(), type: 'open', source: 'linkedin', campaign: 'launch' }, { id: uuid(), type: 'seen', material_id: 'c1' }, { id: uuid(), type: 'acted', material_id: 'c1' }, { id: uuid(), type: 'active', active_seconds: 30 }];
    if (i < 4) events.push({ id: uuid(), type: 'step_selected', suggestion_id: 'step-1', position: 1, concept_ids: ['rate'] });
    assert.equal((await ingest(null, cohortToken, uuid(), uuid(), events)).status, 200);
  }
  const { overview, sources, learning, insights, boards } = (await read(owner, cohort.name)).body;
  assert.equal(overview.unique_visitors.value, 12);
  assert.ok(overview.avg_active_seconds.value < 30, 'a report cannot credit more than elapsed wall-clock time');
  assert.equal(learning.cards.find(c => c.material_id === 'c1').seen.value, 12);
  assert.equal(sources.visitors.find(s => s.source === 'linkedin').visitors.value, 12);
  assert.equal(sources.visitors.find(s => s.source === 'direct').visitors.value, null, 'hidden, never 0');
  assert.equal(sources.campaigns.find(c => c.campaign === 'launch').visitors.value, 12);
  assert.ok(insights.some(i => i.type === 'interest' && i.subject_id === 'rate'), 'an evidence-backed interest insight');
  assert.equal(boards.length, 1);
  const text = JSON.stringify(await read(owner, null));
  assert.doesNotMatch(text, /learner_key|visitor_id|an-viewer-/, 'aggregate only: no person');
});
await check('7 a synthetic check is accepted, excluded from audience reporting and identifiable', async () => {
  const before = (await read(owner, kv.name)).body;
  assert.equal((await ingest(null, token, uuid(), uuid(), [{ id: uuid(), type: 'open', source: 'direct' }], { synthetic: true })).body.accepted, 1);
  const after = (await read(owner, kv.name)).body;
  assert.equal(after.overview.total_opens.value, before.overview.total_opens.value);
  assert.equal(after.collection.synthetic_excluded, before.collection.synthetic_excluded + 1);
  assert.equal((await read(owner, kv.name, '30d', '&synthetic=only')).body.overview.total_opens.value, 1);
  assert.equal((await read(viewer, kv.name, '30d', '&synthetic=only')).status, 404);
});

// ── The dialog ──
const page = await contextFor(owner);
await page.goto(`${BASE}/library?type=canvases`);
await card(page, T.kv).waitFor({ timeout: 60000 });
await page.waitForTimeout(500);
await check('8 ⋮ → Analytics: on the owner\'s public canvas, after Change cover and Share; never on a private or unlisted one', async () => {
  for (const title of [T.draft, T.unlisted]) {
    await menuOf(page, title);
    assert.equal(await page.locator('[data-menu-analytics]').count(), 0, title);
    await page.keyboard.press('Escape');
  }
  await menuOf(page, T.kv);
  const labels = (await page.locator('.shadow-pop button, [role="menu"] button').allInnerTexts()).map(l => l.trim());
  // Owner brief 2026-10-22: Change cover closes the organization group, then Share and Analytics, then Move to Trash last.
  const coverAt = labels.indexOf('Change cover');
  assert.ok(coverAt >= 0, 'Change cover is present');
  assert.deepEqual(labels.slice(coverAt, coverAt + 4), ['Change cover', 'Share', 'Analytics', 'Move to Trash']);
  assert.equal(await page.locator('[data-menu-analytics]').count(), 1, 'one Analytics entry');
  await page.keyboard.press('Escape');
});
await shot(page, '00-library');
await check('9 the board entry opens that board in a centered dialog: the numbers, hidden as a dash, close focused, the page inert', async () => {
  await openBoard(page, T.kv);
  const dialog = dialogOf(page);
  assert.equal(await dialog.getAttribute('data-analytics-scope'), kv.name);
  assert.match(await dialog.innerText(), /Learning board analytics/);
  assert.match(await dialog.innerText(), /Private to you · aggregated audience activity/);
  assert.equal(await page.locator('[data-analytics-status]').getAttribute('data-analytics-status'), 'active');
  assert.match(await page.locator('[data-analytics-period]').innerText(), /· UTC$/);
  assert.equal(await tile(page, 'total_opens').innerText(), '2');
  assert.equal(await page.locator('[data-metric="unique_visitors"] [data-metric-hidden]').getAttribute('data-metric-hidden'), 'insufficient_cohort');
  assert.match(await tile(page, 'unique_visitors').innerText(), /^—/);
  assert.equal(await page.locator('[data-analytics-small]').count(), 1, 'the small-audience notice');
  assert.match(await page.locator('[data-analytics-freshness]').innerText(), /synthetic check/, 'identifiable, excluded');
  assert.deepEqual(await page.evaluate(() => [document.activeElement.getAttribute('aria-label'), document.getElementById('root').inert]), ['Close analytics', true]);
  const box = await dialog.boundingBox();
  assert.ok(box.width <= 1120 && box.height <= 900, 'viewport-bounded, up to 1120px wide');
  assert.ok(Math.abs(box.x + box.width / 2 - 720) < 2, 'centered');
  assert.equal(await dialog.evaluate(el => getComputedStyle(el).borderRadius), '16px');
});
await shot(page, 'A-board-overview', dialogOf(page));
await check('10 keyboard: Tab stays inside, arrow keys move the tabs, Escape closes and focus returns to the opener', async () => {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('[data-analytics-dialog]')), true, `tab ${i}`);
  }
  // Radix moves focus to the next tab on its next task and selects on focus, so the selection is awaited, not read at once.
  const selected = key => page.locator(`[data-analytics-tab="${key}"][aria-selected="true"]`).waitFor({ timeout: 3000 });
  await page.locator('[data-analytics-tab="overview"]').focus();
  await page.keyboard.press('ArrowRight');
  await selected('boards');
  await page.keyboard.press('End');
  await selected('sources');
  await page.keyboard.press('Home');
  await selected('overview');
  await page.keyboard.press('Escape');
  await dialogOf(page).waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => [document.activeElement.getAttribute('title'), document.getElementById('root').inert]), ['Card options', false]);
});
await check('11 range and scope: each read follows the control; a late answer for an earlier range is disregarded', async () => {
  await openBoard(page, T.kv);
  const dialog = dialogOf(page);
  const asked = page.waitForRequest(request => request.url().includes(`/api/analytics/publications/${kv.name}?range=7d`));
  await dialog.getByRole('tab', { name: '7 days' }).click();
  await asked;
  await settled(page);
  assert.equal(await page.locator('[data-analytics-range]').getAttribute('data-analytics-range'), '7d');
  await dialog.getByRole('tab', { name: '30 days' }).click();
  await settled(page);
  // The 7-day answer arrives after All time was chosen: the screen keeps All time's dates.
  await page.route('**/api/analytics/publications/*range=7d*', async route => { await new Promise(done => setTimeout(done, 1500)); await route.continue().catch(() => {}); });
  await dialog.getByRole('tab', { name: '7 days' }).click();
  await dialog.getByRole('tab', { name: 'All time' }).click();
  await settled(page);
  await page.waitForTimeout(2000);
  await page.unroute('**/api/analytics/publications/*range=7d*');
  assert.equal(await page.locator('[data-analytics-period]').innerText(), periodText((await read(owner, kv.name, 'all')).body.period));
  await page.locator('[data-analytics-board-scope]').selectOption(moe.name);
  await settled(page);
  assert.equal(await dialog.getAttribute('data-analytics-scope'), moe.name);
  await dialog.getByRole('tab', { name: '30 days' }).click();
  await settled(page);
});
await check('12 launch copy on the board with no audience; the canonical and audience forks are labelled apart on Boards', async () => {
  const launch = page.locator('[data-analytics-launch]');
  assert.match((await launch.innerText()).replace(/\s+/g, ' '), /Ready for your first audience Collection is active\. Your own visits do not count\. Share a public learning board to begin collecting audience activity\./);
  assert.equal(await dialogOf(page).getAttribute('data-analytics-state'), 'no_audience');
  assert.equal(await page.locator('[data-trend-empty]').count(), 1);
  await shot(page, 'B-launch', dialogOf(page));
  await page.locator('[data-analytics-board-scope]').selectOption(kv.name);
  await settled(page);
  await page.locator('[data-analytics-tab="boards"]').click();
  const text = await dialogOf(page).innerText();
  for (const label of ['Forks by this audience', 'Canonical forks · all', 'Star additions · selected range', 'Voluntary star removals', 'Net star actions (additions − removals)', 'Opens from Stars', 'Stars now']) assert.ok(text.includes(label), label);
  await shot(page, 'C-boards', dialogOf(page));
  await closeDialog(page);
});
await check('13 failed reads: an error with Retry and no numbers; a failed refetch keeps the last good read and says it is stale', async () => {
  const fail = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'down', code: 'analytics_unavailable' }) });
  await page.route('**/api/analytics/**', fail);
  await openBoard(page, T.kv);
  assert.equal(await dialogOf(page).getAttribute('data-analytics-state'), 'failed');
  assert.equal(await page.locator('[data-analytics-error]').count(), 1);
  assert.equal(await page.locator('[data-metric]').count(), 0, 'no tile, so no zero');
  assert.equal(await page.locator('[data-analytics-status]').getAttribute('data-analytics-status'), 'failure');
  await shot(page, 'D-failed', dialogOf(page));
  await page.unroute('**/api/analytics/**', fail);
  await page.locator('[data-analytics-retry]').click();
  await settled(page);
  assert.equal(await tile(page, 'total_opens').innerText(), '2');
  await page.route('**/api/analytics/**', fail);
  await dialogOf(page).getByRole('tab', { name: '7 days' }).click();
  await page.locator('[data-analytics-error]').waitFor();
  await dialogOf(page).getByRole('tab', { name: '30 days' }).click();
  await page.locator('[data-analytics-stale]').waitFor();
  assert.equal(await tile(page, 'total_opens').innerText(), '2', 'the last good number, marked stale');
  await page.unroute('**/api/analytics/**', fail);
  await dialogOf(page).getByRole('tab', { name: '7 days' }).click();
  await settled(page);
  await dialogOf(page).getByRole('tab', { name: '30 days' }).click();
  await settled(page);
});
await check('14 the export is the screen\'s read: scope, range, coverage, and a hidden value empty with its reason, never 0', async () => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-analytics-export]').click()]);
  assert.match(download.suggestedFilename(), new RegExp(`^creator-analytics-${kv.name}-30d\\.csv$`));
  const csv = readFileSync(await download.path(), 'utf8');
  assert.match(csv, new RegExp(`"Scope","${T.kv}","${kv.name}"`));
  assert.match(csv, /"Range","30d"/);
  assert.match(csv, /"Overview","","total_opens","2",""/);
  assert.match(csv, /"Overview","","unique_visitors","","Hidden: fewer than 10 visitors"/);
  assert.doesNotMatch(csv, /"unique_visitors","0"/);
  assert.match(csv, /"Coverage","visits"/);
  assert.ok(!csv.includes(token), 'no publication token in the file');
  await closeDialog(page);
});
await check('15 the profile entry opens all public boards; choosing a board shows its protected metrics, cards and sources', async () => {
  await page.goto(`${BASE}/@${H.owner}`);
  await page.locator('[data-creator-analytics-open]').click();
  await settled(page);
  const dialog = dialogOf(page);
  assert.equal(await dialog.getAttribute('data-analytics-scope'), 'all');
  assert.match(await dialog.innerText(), /Creator analytics/);
  assert.equal(await tile(page, 'total_opens').innerText(), '14', 'kv 2 + cohort 12; deduplicated visitors below');
  assert.equal(await tile(page, 'unique_visitors').innerText(), '14');
  const boards = await page.locator('[data-board]').evaluateAll(list => list.map(el => el.dataset.board));
  assert.deepEqual([...boards].sort(), [kv.name, moe.name, cohort.name].sort());
  await page.locator('[data-analytics-tab="learning"]').click();
  assert.equal(await page.locator('[data-scope-callout]').count(), 1, 'cards belong to one board');
  await shot(page, 'E-creator-learning', dialog);
  await page.locator('[data-analytics-board-scope]').selectOption(cohort.name);
  await settled(page);
  await page.locator('[data-analytics-tab="overview"]').click();
  assert.equal(await tile(page, 'unique_visitors').innerText(), '12');
  await page.locator('[data-analytics-tab="learning"]').click();
  assert.match(await page.locator('[data-analytics-cards]').innerText(), /Card reach and interaction[\s\S]*fixed reading order[\s\S]*12/);
  assert.equal(await page.locator('[data-insight="interest"]').count(), 1);
  await shot(page, 'F-board-learning', dialog);
  await page.locator('[data-analytics-tab="sources"]').click();
  assert.match(await page.locator('[data-analytics-sources]').innerText(), /LinkedIn[\s\S]*12/);
  await shot(page, 'G-sources', dialog);
});
await check('16 Draft a follow-up board: a new private canvas with the composer prefilled, nothing sent, nothing published', async () => {
  const sent = [];
  page.on('request', request => { if (request.method() === 'POST' && /\/api\/(learn\/(ask|tutor|board$|chat)|ask)/.test(new URL(request.url()).pathname)) sent.push(request.url()); });
  await page.locator('[data-analytics-tab="learning"]').click();
  await page.locator('[data-draft-follow-up]').first().click();
  await page.waitForURL(/\/apps\/canvas-[a-f0-9]+\?tab=learn/, { timeout: 30000 });
  assert.equal(await dialogOf(page).count(), 0);
  const name = new URL(page.url()).pathname.split('/').pop();
  const COMPOSER = '[data-chat-pane] [data-chat-composer] :is(textarea, input:not([type="file"]))';
  const field = page.locator(COMPOSER).first();
  await field.waitFor({ timeout: 60000 });
  await page.waitForFunction(selector => /^Create a short interactive learning board about .+, informed by what visitors explored in my /.test(document.querySelector(selector)?.value || ''), COMPOSER, { timeout: 30000 });
  await page.waitForTimeout(1000);
  assert.deepEqual(sent, [], 'no prompt submitted');
  const made = (await api(owner, `/api/apps/${name}`)).body;
  assert.equal(made.publication_token ?? null, null, 'private');
  assert.equal(made.access, 'private');
  await shot(page, 'H-follow-up');
});

// ── Phone and dark ──
const phone = await contextFor(owner, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await check('17 on a phone the dialog is full screen, close stays reachable, touch targets are 44px and the page does not scroll sideways', async () => {
  await phone.goto(`${BASE}/@${H.owner}`);
  await phone.locator('[data-creator-analytics-open]').tap();
  await settled(phone);
  const box = await dialogOf(phone).boundingBox();
  assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 390, 844], 'full screen');
  const close = await phone.locator('[data-analytics-close]').boundingBox();
  assert.ok(close.y >= 0 && close.x + close.width <= 390, 'close is on screen');
  assert.ok(close.width >= 44 && close.height >= 44, `close ${close.width}x${close.height}`);
  assert.equal(await phone.locator('[data-analytics-metrics]').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2, 'two metric columns');
  assert.equal(await dialogOf(phone).evaluate(el => el.scrollWidth <= el.clientWidth), true, 'tables scroll inside their own container');
  await phone.locator('[data-analytics-body]').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.equal(await phone.locator('[data-analytics-close]').isVisible(), true, 'the header stays when the body scrolls');
  await shot(phone, 'I-phone', phone);
  await phone.locator('[data-analytics-close]').tap();
});
const dark = await contextFor(owner, {}, () => { try { localStorage.setItem('small.theme', 'dark'); } catch { /* a blocked storage fails the assertion below */ } });
await check('18 dark: the dialog follows the theme', async () => {
  await dark.goto(`${BASE}/@${H.owner}`);
  await dark.locator('[data-creator-analytics-open]').click();
  await settled(dark);
  assert.equal(await dark.evaluate(() => document.documentElement.classList.contains('dark')), true);
  assert.notEqual(await dialogOf(dark).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  await shot(dark, 'J-dark', dialogOf(dark));
  await dark.locator('[data-analytics-close]').click();
});

const other = await contextFor(viewer);
await check('19 nobody else sees Analytics: not on the owner\'s Explore card, not on their profile, not on the viewer\'s own private canvas', async () => {
  await other.goto(`${BASE}/explore`);
  const theirs = other.locator('[data-explore-card]').filter({ has: other.locator('[data-card-title]', { hasText: new RegExp(`^${T.kv}$`) }) }).filter({ has: other.locator(`[data-creator-link][href="/@${H.owner}"]`) });
  await theirs.waitFor({ timeout: 60000 });
  await theirs.getByTitle('Card options').click();
  assert.deepEqual((await other.locator('[data-menu-copy-link]').count()), 1);
  assert.equal(await other.getByText('Analytics', { exact: true }).count(), 0);
  await other.keyboard.press('Escape');
  await other.goto(`${BASE}/@${H.owner}`);
  await other.locator('[data-profile-card]').first().waitFor({ timeout: 60000 });
  assert.equal(await other.locator('[data-creator-analytics-open], [data-edit-profile]').count(), 0);
  const mine = await canvas(viewer, `Reader notes ${run}`);
  await other.goto(`${BASE}/library?type=canvases`);
  const own = other.locator('[data-library-card="canvas"]').filter({ has: other.locator('[data-card-title]', { hasText: new RegExp(`^Reader notes ${run}$`) }) });
  await own.waitFor({ timeout: 60000 });
  await own.hover(); await own.getByTitle('Card options').click();
  await other.getByRole('button', { name: 'Rename', exact: true }).waitFor();
  assert.equal(await other.locator('[data-menu-analytics]').count(), 0, mine.name);
});
await check('20 a real visit: the signed-out page itself sends the open, its source and the card events; a reload adds no open; the owner\'s visit is dropped; an unlisted link sends nothing', async () => {
  const visited = await canvas(owner, 'Browser visit');
  const visitedToken = await publish(owner, visited);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const sent = [];
  const watch = (target, list, url) => target.on('response', async response => { if (response.request().method() === 'POST' && response.url().endsWith(url)) list.push({ body: response.request().postDataJSON(), answer: await response.json().catch(() => null) }); });
  watch(page, sent, `/shared/${visitedToken}/events`);
  const typesSent = () => sent.flatMap(batch => batch.body.events.map(event => event.type));
  const until = async (ok, what, ms = 30000) => { const end = Date.now() + ms; while (!ok()) { if (Date.now() > end) throw Error(`${what}: sent ${JSON.stringify(typesSent())}`); await page.waitForTimeout(250); } };
  await page.goto(`${BASE}/e/${visitedToken}?utm_source=linkedin&utm_campaign=Browser-Check&private=dropped`);
  await until(() => typesSent().includes('open'), 'the open');
  const open = sent.flatMap(batch => batch.body.events).find(event => event.type === 'open');
  assert.deepEqual([open.source, open.campaign], ['linkedin', 'browser-check'], 'the source from the arrival, the tag sanitized');
  assert.ok(!JSON.stringify(sent).includes('private=dropped'), 'no other query is sent');
  assert.match(sent[0].body.visitor_id, /^[0-9a-f-]{36}$/);
  assert.equal(sent[0].answer.accepted >= 1, true, 'the server accepted it');
  const card = page.locator('[data-block-id]').first();
  await card.waitFor({ timeout: 60000 });
  await card.click();
  await until(() => typesSent().includes('acted') && typesSent().includes('seen') && typesSent().includes('active'), 'the card events and active time');
  assert.equal((await read(owner, visited.name, '7d')).body.overview.total_opens.value, 1, 'the visit reached the owner\'s read');
  const before = sent.length;
  await page.reload();
  await until(() => sent.length > before, 'the reload\'s batch');
  assert.equal((await read(owner, visited.name, '7d')).body.overview.total_opens.value, 1, 'a reload inside the visit adds no open');
  await context.close();
  const mine = await contextFor(owner), ownSent = [];
  watch(mine, ownSent, `/shared/${visitedToken}/events`);
  await mine.goto(`${BASE}/e/${visitedToken}`);
  for (let i = 0; i < 120 && !ownSent.length; i += 1) await mine.waitForTimeout(250);
  assert.equal(ownSent[0]?.answer?.dropped, 'own_visit', 'the owner\'s own visit is dropped');
  assert.equal((await read(owner, visited.name, '7d')).body.overview.total_opens.value, 1);
  const shared = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sharedPage = await shared.newPage(), sharedSent = [];
  sharedPage.on('request', request => { if (request.url().endsWith('/events')) sharedSent.push(request.url()); });
  await sharedPage.goto(`${BASE}/b/${shareToken}`);
  await sharedPage.locator('[data-block-id]').first().waitFor({ timeout: 60000 });
  await sharedPage.waitForTimeout(1500);
  assert.deepEqual(sharedSent, [], 'an unlisted link collects nothing');
  await shared.close();
});
await check('21 no email shown, no page errors', async () => {
  assert.ok(!(await other.content()).includes(EMAIL.owner));
  assert.deepEqual(errors, []);
});
await browser.close();
const TOTAL = 21;
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
