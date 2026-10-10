// The private Analytics UI (docs/features/creator-analytics-contract.md "Analytics UI", owner analytics UI and feedback-loop
// briefs) in its typed not_collected state, against the LOCAL stack only: local D1 and fresh browser profiles. Storage is
// not approved, so the views fetch nothing and show only canonical public counters as numbers. No model is called and
// nothing is sent from a composer. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8838 SMALL_CP=http://127.0.0.1:8839 node e2e/analytics-ui-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

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
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json' } });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const post = (who, path, body = {}) => api(who, path, { method: 'POST', body: JSON.stringify(body) });
const STATE = text => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'c1', type: 'explanation', dx: 0, dy: 0, title: text, body: `${text}, explained.` }] });
const canvas = async (who, title) => {
  const c = (await post(who, '/api/canvases', { title })).body;
  await api(who, `/api/learn/boards/${c.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE(title) }) });
  return c;
};
// Each run's owner is new, so plain titles are unique in their Library; Explore is matched by this run's @handle too.
const T = { kv: 'KV Cache', moe: 'Mixture of Experts', draft: 'Draft notes' };
const kv = await canvas(owner, T.kv), moe = await canvas(owner, T.moe), draft = await canvas(owner, T.draft);
await post(owner, `/api/apps/${kv.name}/publish`);
await post(owner, `/api/apps/${moe.name}/publish`);
const token = (await api(owner, `/api/apps/${kv.name}`)).body.publication_token;
await post(viewer, '/api/learn/boards/fork', { source: { token }, key: `an-fork-a-${run}` });
await post(viewer, '/api/learn/boards/fork', { source: { token }, key: `an-fork-b-${run}` });
const forks = (await api(owner, `/api/apps/${kv.name}`)).body.fork_count;
assert.equal(forks, 2);

const browser = await chromium.launch();
const errors = [], analyticsCalls = [];
const contextFor = async (who) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/api\/analytics/.test(new URL(request.url()).pathname)) analyticsCalls.push(request.url()); });
  return page;
};
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (page, name, locator = page) => { await page.waitForTimeout(400); await locator.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const card = (page, title) => page.locator('[data-library-card="canvas"]').filter({ has: page.locator('[data-card-title]', { hasText: new RegExp(`^${title}$`) }) });
const menuOf = async (page, title) => { await card(page, title).hover(); await card(page, title).getByTitle('More').click(); await page.getByRole('button', { name: 'Rename', exact: true }).waitFor(); };
// What every metric row shows: its typed state, or a canonical public counter.
const values = async scope => scope.locator('[data-metric]').evaluateAll(rows => rows.map(r => [r.dataset.metric, r.lastElementChild.textContent.trim()]));

const page = await contextFor(owner);
await page.goto(`${BASE}/library?type=canvases`);
await card(page, T.kv).waitFor({ timeout: 60000 });
await page.waitForTimeout(500);
await check('1 ⋮ → Analytics: on the owner\'s public canvas, after the link rows (Share / Manage link, Copy link); never on a private one', async () => {
  await menuOf(page, T.draft);
  assert.equal(await page.locator('[data-menu-analytics]').count(), 0, 'private');
  await page.keyboard.press('Escape');
  await menuOf(page, T.kv);
  const labels = (await page.locator('.shadow-pop button, [role="menu"] button').allInnerTexts()).map(l => l.trim());
  // Copy link joined the link rows (owner, 2026-10-08; visibility-menu.md); Analytics follows them.
  assert.equal(labels[labels.indexOf('Share / Manage link') + 1], 'Copy link');
  assert.equal(labels[labels.indexOf('Copy link') + 1], 'Analytics');
});
await shot(page, '00-menu-analytics');
let panel;
await check('2 per-explainer Analytics opens in its typed not_collected state: banner, 7d / 30d / All time, private', async () => {
  await page.locator('[data-menu-analytics]').click();
  panel = page.locator(`[data-explainer-analytics="${kv.name}"]`);
  await panel.waitFor({ timeout: 10000 });
  assert.equal(await panel.getAttribute('data-analytics-state'), 'not_collected');
  assert.match(await panel.locator('[data-analytics-banner]').innerText(), /^Not collected yet\. .*nothing here is counted or estimated/);
  assert.match(await panel.innerText(), /Private · only you see this\./);
  const range = panel.locator('[data-analytics-range]');
  assert.deepEqual((await range.locator('button').allInnerTexts()).map(t => t.trim()), ['7 days', '30 days', 'All time']);
  await range.getByText('7 days').click();
  assert.equal(await range.getAttribute('data-analytics-range'), '7d');
  await range.getByText('30 days').click();
});
await shot(page, 'A-per-explainer', page.getByRole('dialog'));
await check('3 every section and label of the contract; every metric not collected except the canonical fork count', async () => {
  const text = await panel.innerText();
  for (const label of ['What your audience is telling you', 'Audience', 'Unique visitors', 'Signed-in learners', 'Total opens', 'Average active learning time', 'Engaged learners (more than 2 min)',
    'Concepts', 'Concept exploration rates', 'Deeper-branch rate', 'Highest-friction concept', 'Rabbit Holes and forks', 'Start Rabbit Hole count', 'Start Rabbit Hole conversion', 'Canonical forks', 'Fork conversion',
    'Professor Next Steps', 'Impressions', 'Selections', 'Most-selected Next Step', 'Option-position statistics', 'Outbound resources', 'Traffic sources', 'LinkedIn', 'Explore', 'Creator profile', 'Direct', 'Other referrer',
    'Revision comparison', 'Before / after', 'How to read this']) assert.ok(text.includes(label), label);
  const rows = await values(panel.locator(':scope > section:not([data-analytics-legend])'));
  const numbers = rows.filter(([state]) => state === 'value');
  assert.deepEqual(numbers, [['value', String(forks)]], 'the only number is FORK_COUNT');
  assert.ok(rows.filter(([state]) => state !== 'value').every(([state, shown]) => state === 'not_collected' && shown === 'Not collected yet'));
  assert.match(text, /Canonical forks · all time/);
});
await check('4 Insights and Create next explainer render their typed empty state: no insight without evidence', async () => {
  const insights = panel.locator('[data-analytics-insights]');
  assert.match(await insights.locator('[data-insights-empty]').innerText(), /^No insights yet\./);
  assert.equal(await panel.locator('[data-create-next]').isDisabled(), true);
});
await shot(page, 'B-C-insights-create-next', panel.locator('[data-analytics-insights]'));
await check('5 the suppressed state (< 10 learners) is shown as words, never as 0', async () => {
  const legend = await values(panel.locator('[data-analytics-legend]'));
  assert.deepEqual(legend, [['not_collected', 'Not collected yet'], ['insufficient_cohort', 'Not enough learners yet (fewer than 10)']]);
});
await panel.locator('[data-analytics-traffic]').scrollIntoViewIfNeeded();
await shot(page, 'F-traffic-sources', panel.locator('[data-analytics-traffic]'));
await shot(page, 'G-revision-comparison', panel.locator('[data-analytics-revisions]'));
await shot(page, 'H-suppressed-state', panel.locator('[data-analytics-legend]'));
await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

await check('6 creator analytics: your own profile only, beside it - totals, comparison of your explainers, the public counters only', async () => {
  await page.goto(`${BASE}/@${H.owner}`);
  await page.locator('[data-creator-analytics-open]').click();
  const dash = page.locator('[data-creator-analytics]');
  await dash.waitFor({ timeout: 10000 });
  assert.equal(await dash.getAttribute('data-analytics-state'), 'not_collected');
  const totals = Object.fromEntries((await values(dash.locator(':scope > section').first())).map(([s, v], i) => [i, [s, v]]));
  assert.deepEqual(Object.values(totals), [['not_collected', 'Not collected yet'], ['not_collected', 'Not collected yet'], ['not_collected', 'Not collected yet'], ['value', String(forks)], ['value', '2']]);
  const rows = await dash.locator('[data-analytics-comparison] tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));
  assert.deepEqual(rows, [[T.moe, 'Not collected', 'Not collected', 'Not collected', '0'], [T.kv, 'Not collected', 'Not collected', 'Not collected', '2']]);
  for (const label of ['Audience wants next', 'Highest-friction concepts', 'Learning Board comparison', 'Traffic sources', 'Recent trend']) assert.ok((await dash.innerText()).includes(label), label);
});
await shot(page, 'D-creator-analytics', page.getByRole('dialog'));
await shot(page, 'E-explainer-comparison', page.locator('[data-analytics-comparison]'));
await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

const other = await contextFor(viewer);
await check('7 nobody else sees Analytics: not on the owner\'s Explore card, not on their profile, not on the viewer\'s own private canvas', async () => {
  await other.goto(`${BASE}/explore`);
  const theirs = other.locator('[data-explore-card]').filter({ has: other.locator('[data-card-title]', { hasText: new RegExp(`^${T.kv}$`) }) }).filter({ has: other.locator(`[data-creator-link][href="/@${H.owner}"]`) });
  await theirs.waitFor({ timeout: 60000 });
  await theirs.getByTitle('More').click();
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
  await own.hover(); await own.getByTitle('More').click();
  await other.getByRole('button', { name: 'Rename', exact: true }).waitFor();
  assert.equal(await other.locator('[data-menu-analytics]').count(), 0, mine.name);
});
await check('8 no analytics request was made, and no email shown', async () => {
  assert.deepEqual(analyticsCalls, [], 'no analytics route exists until #62 storage has a GO');
  assert.ok(!(await other.content()).includes(EMAIL.owner));
});
await check('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(`${results.length}/9 checks passed`);
process.exit(results.length === 9 ? 0 : 1);
