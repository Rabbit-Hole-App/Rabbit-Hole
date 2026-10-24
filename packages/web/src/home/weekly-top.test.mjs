import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EXPLORE_SORTS, EXPLORE_TABS } from './card-sort.js';
import { weeklyTopEmptyFixture, weeklyTopErrorFixture, weeklyTopFixture, weeklyTopPartialFixture } from './weekly-top-fixture.js';
import { analyticsTab, openedFields, readWeekly, starsSinceLabel, viewedFields, viewedOnce, weekLabel, weeklyList, weeklyVisible } from './weekly-top.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the section hides for any non-whitespace search and returns when it is cleared (brief 4.5)', () => {
  assert.equal(weeklyVisible(''), true);
  assert.equal(weeklyVisible('   '), true);
  assert.equal(weeklyVisible(undefined), true);
  assert.equal(weeklyVisible('a'), false);
  assert.equal(weeklyVisible('  ice '), false);
});

test('each tab reads its own list: Canvases keeps the internal id explainers; up to five; the empty message in place of rows', () => {
  assert.deepEqual(EXPLORE_TABS.map(([id]) => id), ['explainers', 'creators']);
  assert.equal(analyticsTab('explainers'), 'canvases');
  assert.equal(analyticsTab('creators'), 'creators');
  assert.deepEqual(weeklyList(weeklyTopFixture, 'explainers').entries.map(e => e.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(weeklyList(weeklyTopFixture, 'creators').entries.map(e => e.handle), ['ana', 'ben', 'cara', 'dev', 'eli']);
  assert.equal(weeklyList(weeklyTopPartialFixture, 'explainers').entries.length, 1, 'fewer than five show fewer, no filler');
  assert.equal(weeklyList(weeklyTopPartialFixture, 'creators').entries.length, 2);
  const empty = weeklyList(weeklyTopEmptyFixture, 'explainers');
  assert.deepEqual([empty.entries.length, empty.message], [0, 'No canvases have earned stars or forks yet this week.']);
  assert.equal(weeklyList(weeklyTopEmptyFixture, 'creators').message, 'No creators have earned stars or forks yet this week.');
  assert.equal(weeklyList({ ...weeklyTopFixture, canvases: { entries: Array.from({ length: 7 }, (_, i) => ({ rank: i + 1 })) } }, 'explainers').entries.length, 5, 'never more than five');
  assert.equal(weeklyList(weeklyTopErrorFixture, 'explainers'), null);
  assert.equal(weeklyList(null, 'creators'), null);
});

test('the week is labelled from the contract\'s Los Angeles dates, the exclusive end shown as the last day', () => {
  assert.equal(weekLabel(weeklyTopFixture), 'Oct 19 to Oct 25');
  assert.equal(weekLabel({ week_start_local: '2026-10-26', week_end_local: '2026-11-02' }), 'Oct 26 to Nov 1');
  assert.equal(weekLabel({ week_start_local: '2026-12-28', week_end_local: '2027-01-04' }), 'Dec 28 to Jan 3');
  assert.equal(weekLabel({}), null);
});

test('star history is mentioned only when it starts inside the shown week (brief 8.9)', () => {
  assert.equal(starsSinceLabel(weeklyTopFixture), 'Stars are counted from Oct 19.');
  assert.equal(starsSinceLabel({ ...weeklyTopFixture, star_history_since: '2026-10-22T19:30:12.004Z' }), 'Stars are counted from Oct 22.');
  assert.equal(starsSinceLabel({ ...weeklyTopFixture, star_history_since: '2026-09-01T00:00:00.000Z' }), null, 'recorded before the week: complete');
  assert.equal(starsSinceLabel(weeklyTopEmptyFixture), null);
});

test('readWeekly: a good answer, an error body, a network-shaped failure and a body without both lists', async () => {
  const answer = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  assert.equal((await readWeekly(answer(200, weeklyTopFixture))).data.ranking_version, 'weekly-top-v1');
  assert.deepEqual((await readWeekly(answer(500, weeklyTopErrorFixture))).failure, { status: 500, code: 'weekly_top_failed' });
  assert.deepEqual((await readWeekly(answer(200, 'not json'))).failure, { status: 200, code: 'unreadable' });
  assert.deepEqual((await readWeekly(answer(200, { canvases: {} }))).failure, { status: 200, code: 'unreadable' });
});

test('analytics: viewed once per tab per week per page load; fields carry no text, handle or token (brief 9)', () => {
  const once = viewedOnce();
  assert.equal(once('explainers', weeklyTopFixture), true);
  assert.equal(once('explainers', weeklyTopFixture), false, 'a rerender, or a search that hides and restores it');
  assert.equal(once('creators', weeklyTopFixture), true, 'the other tab is its own view');
  assert.equal(once('explainers', { ...weeklyTopFixture, week_start_local: '2026-10-26' }), true, 'a new week');
  const list = weeklyList(weeklyTopFixture, 'explainers');
  assert.deepEqual(viewedFields('explainers', weeklyTopFixture, list, 42), { tab: 'canvases', week_start_local: '2026-10-19', ranking_version: 'weekly-top-v1', entry_count: 5, duration_ms: 42 });
  assert.deepEqual(openedFields('creators', weeklyTopFixture, 3, 'profile'), { tab: 'creators', rank: 3, target: 'profile', week_start_local: '2026-10-19', ranking_version: 'weekly-top-v1' });
});

test('Explore wiring: the section sits after the toolbar and before the results, one request, no AI call, the sorts unchanged', () => {
  const home = read('../Home.jsx'), explore = home.slice(home.indexOf('function Explore()'));
  const order = ['data-explore-toolbar', '{weeklyVisible(typed) && <WeeklyTop weekly={weekly} tab={tab} />}', "tab === 'creators' ? ("].map(x => explore.indexOf(x));
  assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
  assert.equal(explore.split('useWeeklyTop()').length, 2, 'one request for both tabs, made once');
  assert.doesNotMatch(read('./WeeklyTop.jsx') + read('./weekly-top.js'), /published\/find|\/ask|credits/, 'no AI or credit call');
  assert.deepEqual(EXPLORE_SORTS.map(s => s.id), ['newest', 'updated', 'forks'], 'no Most starred sort');
});

test('the section is always open and its copy has no ellipsis (brief 4.2, owner rule)', () => {
  const src = read('./WeeklyTop.jsx');
  assert.doesNotMatch(src, /aria-expanded|<details|Chevron|Accordion|collapse/i);
  assert.doesNotMatch(src, /\w\.\.\.|…/);
  assert.match(src, /Top canvases this week/);
  assert.match(src, /Top creators this week/);
});

test('rows: real links, the row is not clickable, the action keeps its space and shows on hover, focus and touch (brief 6)', () => {
  const src = read('./WeeklyTop.jsx');
  assert.doesNotMatch(src, /<li[^>]*onClick|<li[^>]*role="link"/, 'the row background is not clickable');
  assert.match(src, /group-focus-within:opacity-100 group-hover:opacity-100/);
  assert.match(src, /\[@media\(hover:none\)\]:opacity-100/);
  assert.match(src, /transition-colors duration-150[^']*motion-reduce:transition-none/, 'a 150ms colour fade, off for reduced motion');
  assert.match(src, /cursor-default/);
  assert.doesNotMatch(src, /hover:(scale|-translate|translate)|shadow-/, 'no lift or move');
});

test('Canvases toolbar: Search, Filters, Sort, Size in one nowrap row, the search 280px (max 360, min 180), menus portaled', () => {
  const home = read('../Home.jsx'), explore = home.slice(home.indexOf('function Explore()'));
  const parts = ['data-explore-search', '<LibraryFilters portal', '<SortMenu portal', '<CardSize />'].map(x => explore.indexOf(x));
  assert.ok(parts.every(i => i > 0) && parts.every((i, k) => k === 0 || i > parts[k - 1]), JSON.stringify(parts));
  assert.match(explore, /flex-nowrap overflow-x-auto/);
  assert.match(explore, /max-w-\[360px\] min-w-\[180px\] flex-\[0_1_280px\]/);
  assert.doesNotMatch(explore, /justify-between/);
  assert.match(explore, /gap-3/);
});
