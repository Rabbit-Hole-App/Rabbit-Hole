// The creator analytics dialog's pure half (creator-analytics.js): a hidden value is never 0, on screen or in the export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasPrefill, LAUNCH_COPY, PREFILL_KEY, RANGES, TABS, analyticsCsv, analyticsUrl, followUpPrompt, hidden, hiddenReason, metricText, noAudience, periodText, takePrefill } from './creator-analytics.js';

const HIDDEN = { value: null, reason: 'insufficient_cohort' };
const parse = csv => csv.split('\r\n').map(line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replaceAll('""', '"')));

test('metricText: numbers by kind; a hidden metric is a dash whatever its kind, and a real zero stays 0', () => {
  assert.equal(metricText({ value: 1234, reason: null }), '1,234');
  assert.equal(metricText({ value: 0, reason: null, public: true }), '0');
  assert.equal(metricText({ value: 125, reason: null }, 'seconds'), '2m 05s');
  assert.equal(metricText({ value: 0.123, reason: null }, 'rate'), '12.3%');
  for (const kind of ['count', 'seconds', 'rate']) assert.equal(metricText(HIDDEN, kind), '—');
  assert.equal(metricText(undefined), '—');
  assert.equal(hidden({ value: 0 }), false);
});

test('hiddenReason says why in words for each reason', () => {
  assert.equal(hiddenReason(HIDDEN), 'Hidden: fewer than 10 visitors');
  assert.match(hiddenReason({ value: null, reason: 'complementary' }), /subtraction/);
  assert.equal(hiddenReason({ value: null, reason: 'not_collected' }), 'Not collected yet');
  assert.equal(hiddenReason({ value: null, reason: 'unavailable' }), 'Unavailable');
});

test('the read URL: creator or one board, with the range; the tabs and ranges are the brief\'s', () => {
  assert.equal(analyticsUrl(null, '7d'), '/api/analytics/creator?range=7d');
  assert.equal(analyticsUrl('canvas-ab12cd34', 'all'), '/api/analytics/publications/canvas-ab12cd34?range=all');
  assert.deepEqual(RANGES.map(r => r.id), ['7d', '30d', 'all']);
  assert.deepEqual(TABS.map(t => t.label), ['Overview', 'Boards', 'Learning', 'Sources']);
});

test('noAudience: zero opens is the launch state; any open is not', () => {
  assert.equal(noAudience({ overview: { total_opens: { value: 0 }, unique_visitors: HIDDEN } }), true);
  assert.equal(noAudience({ overview: { total_opens: { value: 3 }, unique_visitors: HIDDEN } }), false);
  assert.equal(noAudience(null), false);
  assert.match(LAUNCH_COPY, /^Ready for your first audience\. Collection is active\. Your own visits do not count\. Share a public learning board/);
});

test('periodText: explicit dates and timezone', () => {
  assert.equal(periodText({ from: '2026-10-04', to: '2026-11-02', timezone: 'UTC' }), 'Oct 4 – Nov 2, 2026 · UTC');
  assert.equal(periodText({ from: null, to: '2026-11-02', timezone: 'UTC' }), 'Through Nov 2, 2026 · UTC');
});

test('the follow-up prompt holds labels and the title only; the prefill is taken once and survives a blocked storage', () => {
  assert.equal(followUpPrompt('learning rate', 'Gradient descent'), 'Create a short interactive learning board about learning rate, informed by what visitors explored in my Gradient descent board.');
  const store = new Map([[PREFILL_KEY('canvas-1'), 'hello']]);
  const storage = { getItem: k => store.get(k) ?? null, removeItem: k => store.delete(k) };
  assert.equal(takePrefill('canvas-1', storage), 'hello');
  assert.equal(takePrefill('canvas-1', storage), null, 'taken once');
  assert.equal(takePrefill('canvas-1', { getItem() { throw new Error('blocked'); } }), null);
});

test('the export: same scope, range, coverage and definitions as the response; a hidden value is an empty cell with its reason, never 0', () => {
  const rows = parse(analyticsCsv({
    scope: { kind: 'publication', canvas: 'canvas-1', title: 'A "quoted" board' }, range: '30d', period: { from: '2026-10-04', to: '2026-11-02', timezone: 'UTC', partial: true }, threshold: 10,
    overview: { total_opens: { value: 3, reason: null, public: true }, unique_visitors: HIDDEN, rabbit_holes_started: { value: 0, reason: null, public: true } },
    stars: { additions: { value: null, reason: 'not_collected' } },
    boards: [{ canvas: 'canvas-1', title: 'B', url: '/e/SECRET', published: true, visitors: HIDDEN, forks_all: { value: 2, reason: null } }],
    trend: [{ day: '2026-11-01', opens: { value: 3, reason: null } }],
    learning: { cards: [{ material_id: 'c1', label: 'Card', seen: HIDDEN, interacted: HIDDEN }], concepts: [], next_steps: { impressions: HIDDEN, selections: HIDDEN, positions: [] }, resources: null, friction: [], revisions: null },
    sources: { visitors: [{ source: 'direct', visitors: { value: null, reason: 'complementary' } }], campaigns: [], referrers: [] },
    producers: { visits: { readiness: 'live', started_at: '2026-11-02T00:00:00Z', note: null } }, definitions: { opens: 'Distinct visits.' },
  }));
  const find = (section, item, metric) => rows.find(r => r[0] === section && r[1] === item && r[2] === metric);
  assert.deepEqual(rows[1].slice(0, 3), ['Scope', 'A "quoted" board', 'canvas-1']);
  assert.match(rows[2].join(), /Range,30d,2026-10-04 to 2026-11-02,UTC,Partial coverage/);
  assert.deepEqual(find('Overview', '', 'unique_visitors').slice(3), ['', 'Hidden: fewer than 10 visitors']);
  assert.deepEqual(find('Overview', '', 'rabbit_holes_started').slice(3), ['0', ''], 'a public zero is a real zero');
  assert.deepEqual(find('Stars', '', 'additions').slice(3), ['', 'Not collected yet']);
  assert.deepEqual(find('Boards', 'B', 'visitors').slice(3), ['', 'Hidden: fewer than 10 visitors']);
  assert.deepEqual(find('Sources', 'Direct / unknown', 'visitors').slice(3), ['', 'Hidden so a small group cannot be worked out by subtraction']);
  assert.deepEqual(find('Coverage', 'visits', 'live').slice(3, 4), ['2026-11-02T00:00:00Z']);
  assert.ok(rows.some(r => r[0] === 'Definition' && r[1] === 'opens'));
  assert.ok(!rows.flat().some(v => v.includes('SECRET')), 'no publication token in an export');
});

test('the dialog: one modal for both entry points, no sample or preview data, no ellipsis labels', () => {
  const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const dialog = read('./CreatorAnalytics.jsx');
  assert.match(read('./home/CardMenu.jsx'), /<CreatorAnalyticsDialog canvas=\{dialog\.a\.name\} opener=\{dialog\.opener\} /);
  assert.match(read('./CreatorProfile.jsx'), /\{own && analytics && <CreatorAnalyticsDialog onClose=/);
  assert.doesNotMatch(dialog, /SlidePanel|Preview only|Illustrative|Example data|rh-demo|Gradient descent/, 'none of the reference\'s sample data or preview controls');
  assert.doesNotMatch(dialog, /\.\.\.[<'"]|…/, 'no ellipsis in labels');
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.match(dialog, /root\.inert = true/);
});

test('the export keeps formula characters as text and carries the revision comparison, hidden values empty', () => {
  const metric = value => ({ value, reason: null });
  const csv = analyticsCsv({ scope: { title: '=HYPERLINK("x")', canvas: 'canvas-1' }, range: '30d', period: { from: '2026-11-01', to: '2026-11-02', timezone: 'UTC', partial: false },
    sources: { campaigns: [{ campaign: '-cmd', visitors: metric(12), start_rate: metric(0.5) }] },
    learning: { revisions: { status: 'insufficient', before: { from: '2026-10-01', to: '2026-10-02', visitors: { value: null, reason: 'insufficient_cohort' }, avg_active_seconds: metric(60), start_rate: metric(0.1) }, after: null } } });
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'), 'a title cannot run as a formula');
  assert.ok(csv.includes('"\'-cmd"'), 'a campaign tag cannot either');
  assert.ok(csv.includes('"Revision","before 2026-10-01 to 2026-10-02","visitors","","Hidden: fewer than 10 visitors"'));
  assert.ok(csv.includes('"Revision","before 2026-10-01 to 2026-10-02","avg_active_seconds","60",""'));
});

test('a waiting prompt is seen without being taken, then taken once', () => {
  const held = new Map([[PREFILL_KEY('canvas-1'), 'words']]);
  const storage = { getItem: k => held.get(k) ?? null, removeItem: k => held.delete(k) };
  assert.equal(hasPrefill('canvas-1', storage), true);
  assert.equal(hasPrefill('canvas-2', storage), false);
  assert.equal(hasPrefill('canvas-1', { getItem: () => { throw new Error('blocked'); } }), false);
  assert.equal(takePrefill('canvas-1', storage), 'words');
  assert.equal(hasPrefill('canvas-1', storage), false);
});
