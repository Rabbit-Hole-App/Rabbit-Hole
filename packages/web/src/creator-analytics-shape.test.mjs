// Creator analytics response shape (owner brief 2026-10-23; docs/features/creator-analytics-contract.md "Dashboard read
// contract"): the six states, the cohort rule per cell, missing-last sorting, today's payload and the dev fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGE, COHORT_MIN, DEFINITIONS, HEALTH, NO_COVERAGE, NO_ISSUES, PERIOD, STATE, TRAFFIC_SOURCES, comparePeriods, dashboard, finding, healthReport, metric, periodsOf, rangeOf, round1, sortRows, suppress, withComparison } from './creator-analytics-shape.js';
import { FIXTURES } from './creator-analytics-fixtures.dev.js';

const CANVASES = [{ canvas: 'a', title: 'A', fork_count: 4 }, { canvas: 'b', title: 'B', fork_count: 0 }];

test('analytics shape: a value only in ready / measured_zero; ready 0 is measured_zero; unknown states throw', () => {
  assert.deepEqual(metric(STATE.READY, 0), { state: STATE.ZERO, value: 0 });
  assert.deepEqual(metric(STATE.READY, 3, { period: PERIOD.SELECTED }), { period: 'selected', state: 'ready', value: 3 });
  for (const s of [STATE.NOT_COLLECTED, STATE.NOT_ENOUGH, STATE.LOADING, STATE.FAILED]) assert.equal(metric(s, 42).value, null, s);
  assert.throws(() => metric('zero', 0));
  assert.throws(() => metric(STATE.READY, null));
});

test('analytics shape: suppress() withholds the raw value below 10 learners, at 9 and at 0, and shows it at 10', () => {
  assert.equal(COHORT_MIN, 10);
  for (const n of [0, 1, 9]) assert.deepEqual(suppress(n, 0.5), { state: STATE.NOT_ENOUGH, value: null }, `cohort ${n}`);
  assert.deepEqual(suppress(10, 0.5), { state: STATE.READY, value: 0.5 });
  assert.deepEqual(suppress(10, 0), { state: STATE.ZERO, value: 0 });
  assert.deepEqual(suppress(12), { state: STATE.READY, value: 12 });
  assert.equal(suppress(null).state, STATE.NOT_COLLECTED);
  assert.doesNotMatch(JSON.stringify(suppress(7, 123)), /7|123/, 'neither the count nor the value travels');
});

test('analytics shape: comparison sorting puts missing cells last in both directions, never as zero', () => {
  const rows = [
    { title: 'x', forks: metric(STATE.READY, 0) },
    { title: 'y', forks: metric(STATE.NOT_ENOUGH) },
    { title: 'z', forks: metric(STATE.READY, 5) },
    { title: 'w', forks: metric(STATE.NOT_COLLECTED) },
  ];
  assert.deepEqual(sortRows(rows, 'forks', 'desc').map(r => r.title), ['z', 'x', 'y', 'w']);
  assert.deepEqual(sortRows(rows, 'forks', 'asc').map(r => r.title), ['x', 'z', 'y', 'w']);
  assert.deepEqual(sortRows(rows, 'title', 'asc').map(r => r.title), ['w', 'x', 'y', 'z']);
});

test('analytics shape: the range is today and the days before it in UTC; all time starts at collection start', () => {
  const now = Date.parse('2026-10-23T23:59:00Z');
  assert.deepEqual(rangeOf('7d', now), { id: '7d', from: '2026-10-17', to: '2026-10-23', timezone: 'UTC' });
  assert.equal(rangeOf('30d', now).from, '2026-09-24');
  assert.equal(rangeOf('all', now).from, null);
});

test('analytics shape: today only public canvases and canonical forks are numbers; the rest is not_collected with one reason', () => {
  const d = dashboard({ range: '7d', canvases: CANVASES, now: Date.parse('2026-10-23T12:00:00Z') });
  assert.deepEqual(d.overview.metrics.public_canvases, { period: 'current', state: 'ready', value: 2 });
  assert.deepEqual(d.overview.metrics.forks, { period: 'all_time', state: 'ready', value: 4 });
  for (const k of ['active_learners', 'avg_active_seconds', 'rabbit_holes_started', 'returning_learners', 'visit_to_learning']) {
    assert.equal(d.overview.metrics[k].state, STATE.NOT_COLLECTED, k);
    assert.equal(d.overview.metrics[k].value, null, k);
  }
  assert.equal(d.overview.state, STATE.NOT_COLLECTED);
  assert.equal(d.overview.reason, 'storage_not_approved');
  assert.equal(d.support.reason, 'assessment_evidence_unsupported');
  assert.equal(d.tools.requests.reason, 'requests_not_enabled');
  assert.deepEqual(d.series.points, [], 'no invented history');
  assert.deepEqual(d.comparison.rows[1].forks, { period: 'all_time', state: 'measured_zero', value: 0 });
  assert.deepEqual(d.traffic.rows.map(r => r.label), TRAFFIC_SOURCES.map(([, l]) => l));
  assert.equal(d.canvas_detail, null);
  const one = dashboard({ range: '30d', canvas: 'a', canvases: CANVASES });
  assert.equal(one.overview.metrics.public_canvases.value, 1);
  assert.equal(one.overview.metrics.forks.value, 4);
  assert.equal(one.canvas.title, 'A');
  assert.equal(one.canvas_detail.conversion.metrics.forks.value, 4);
  // No number other than the canonical counters: every other ready value would be invented.
  const numbers = [];
  JSON.stringify(d, (k, v) => { if (k === 'value' && typeof v === 'number') numbers.push(v); return v; });
  assert.deepEqual(numbers.sort(), [0, 2, 4, 4]);
});

test('analytics shape: every overview metric has a definition and a period label', () => {
  const d = dashboard({ canvases: CANVASES });
  for (const [k, m] of Object.entries(d.overview.metrics)) {
    assert.ok(DEFINITIONS[k]?.definition, k);
    assert.equal(m.period, DEFINITIONS[k].period, k);
  }
  assert.match(DEFINITIONS.returning_learners.definition, /30 days/);
  assert.match(DEFINITIONS.avg_active_seconds.definition, /60 s/);
});

test('analytics fixtures: labelled development data, one per state, and no suppressed cell holds a value', () => {
  for (const s of Object.values(STATE)) assert.ok(Object.values(FIXTURES).some(f => JSON.stringify(f).includes(`"${s}"`)), s);
  for (const [name, f] of Object.entries(FIXTURES)) {
    assert.match(f.fixture, /DEVELOPMENT FIXTURE/, name);
    JSON.stringify(f, (k, v) => {
      if (v && typeof v === 'object' && 'state' in v && 'value' in v && ![STATE.READY, STATE.ZERO].includes(v.state)) assert.equal(v.value, null, name);
      return v;
    });
  }
  // Production code never imports the fixtures.
  const src = fileURLToPath(new URL('.', import.meta.url));
  const files = dir => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  const importers = files(src).filter(f => /\.(jsx?|mjs)$/.test(f) && !/\.test\.mjs$|fixtures\.dev\.js$/.test(f) && /(from|import\()\s*['"][^'"]*creator-analytics-fixtures\.dev/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(importers, []);
});

// Compare with previous period (owner extension 2026-10-23).
const NOW_C = Date.parse('2026-10-23T12:00:00Z');
const COVERED = { since: '2026-01-01', through: '2026-10-23T11:00:00Z', partial: [] };
const P = periodsOf('7d', NOW_C, COVERED);
const days = p => (Date.parse(p.to) - Date.parse(p.from)) / 86400000 + 1;

test('compare: equal-length periods of whole days, the current one ending yesterday, contiguous; All time has none', () => {
  assert.deepEqual(P, { current: { from: '2026-10-16', to: '2026-10-22', complete: true }, previous: { from: '2026-10-09', to: '2026-10-15', complete: true }, tz: 'UTC' });
  const m = periodsOf('30d', NOW_C, COVERED);
  assert.deepEqual([days(m.current), days(m.previous)], [30, 30]);
  assert.equal(Date.parse(m.current.from) - Date.parse(m.previous.to), 86400000);
  assert.equal(periodsOf('all', NOW_C, COVERED), null);
  assert.equal(comparePeriods(metric(STATE.READY, 5), metric(STATE.READY, 4), 'count', null).state, CHANGE.NOT_APPLICABLE);
});

test('compare: absolute change and percentage, rounded half away from zero to one decimal', () => {
  assert.deepEqual(comparePeriods(metric(STATE.READY, 148), metric(STATE.READY, 126), 'count', P), { state: 'ready', current: 148, previous: 126, abs: 22, pct: 17.5, pp: null, reason: null, periods: P });
  assert.equal(comparePeriods(metric(STATE.READY, 100), metric(STATE.READY, 120), 'count', P).pct, -16.7);
  assert.equal(comparePeriods(metric(STATE.READY, 50), metric(STATE.READY, 50), 'count', P).pct, 0);
  assert.deepEqual([round1(17.45), round1(-17.45), round1(0.05), round1(2.25)], [17.5, -17.5, 0.1, 2.3]);
  assert.equal(comparePeriods(metric(STATE.READY, 312.6), metric(STATE.READY, 290.2), 'seconds', P).abs, 22);
});

test('compare: a conversion rate changes in percentage points, never a percentage, even from a 0% baseline', () => {
  const r = comparePeriods(metric(STATE.READY, 0.341), metric(STATE.READY, 0.29), 'rate', P);
  assert.deepEqual([r.state, r.pp, r.pct, r.abs], ['ready', 5.1, null, null]);
  const z = comparePeriods(metric(STATE.READY, 0.2), metric(STATE.ZERO, 0), 'rate', P);
  assert.deepEqual([z.state, z.pp, z.pct], ['ready', 20, null]);
});

test('compare: a zero baseline gives the absolute change and no percentage', () => {
  const z = comparePeriods(metric(STATE.READY, 37), metric(STATE.READY, 0), 'count', P);
  assert.deepEqual([z.state, z.abs, z.pct], [CHANGE.NO_BASELINE, 37, null]);
  assert.match(z.reason, /No baseline/);
});

test('compare: suppression on either side, a missing side, or a partial period explain instead of a change', () => {
  for (const [c, p] of [[suppress(4, 3), metric(STATE.READY, 20)], [metric(STATE.READY, 20), suppress(9, 9)]]) {
    const x = comparePeriods(c, p, 'count', P);
    assert.deepEqual([x.state, x.abs, x.pct, x.current, x.previous], [CHANGE.NOT_ENOUGH, null, null, null, null], 'no value of either side travels');
  }
  for (const s of [STATE.NOT_COLLECTED, STATE.FAILED, STATE.LOADING]) assert.equal(comparePeriods(metric(STATE.READY, 5), metric(s), 'count', P).state, CHANGE.UNAVAILABLE, s);
  // Collection started inside the previous period, yesterday not processed through, a marked gap, or no coverage: partial.
  for (const cov of [{ ...COVERED, since: '2026-10-12' }, { ...COVERED, through: '2026-10-22T23:00:00Z' }, { ...COVERED, partial: [{ from: '2026-10-10', to: '2026-10-10', reason: 'ingest outage' }] }, null]) {
    const x = comparePeriods(metric(STATE.READY, 9), metric(STATE.READY, 3), 'count', periodsOf('7d', NOW_C, cov));
    assert.deepEqual([x.state, x.abs], [CHANGE.PARTIAL, null], JSON.stringify(cov));
  }
  assert.equal(comparePeriods(metric(STATE.READY, 5), metric(STATE.READY, 4), 'total', P).state, CHANGE.NOT_APPLICABLE, 'an all-time total is not compared');
});

test('compare: the payload carries a change beneath each headline metric, the previous series by day index, both ranges', () => {
  const d = dashboard({ range: '7d', compare: true, canvases: CANVASES, now: NOW_C });
  assert.deepEqual(d.range, { id: '7d', from: '2026-10-16', to: '2026-10-22', timezone: 'UTC' });
  assert.equal(d.compare.state, CHANGE.PARTIAL, 'nothing is collected, so neither period is covered');
  assert.deepEqual(d.compare.periods.previous, { from: '2026-10-09', to: '2026-10-15', complete: false });
  assert.equal(d.overview.metrics.active_learners.change.state, CHANGE.UNAVAILABLE);
  assert.equal(d.overview.metrics.forks.change.state, CHANGE.NOT_APPLICABLE);
  assert.equal(d.audience.metrics.visits.change.state, CHANGE.UNAVAILABLE);
  assert.deepEqual([d.series.previous.label, d.series.previous.points], ['Previous period', []]);
  const all = dashboard({ range: 'all', compare: true, canvases: CANVASES, now: NOW_C });
  assert.deepEqual([all.compare.state, all.series.previous, all.overview.metrics.active_learners.change.state], ['not_applicable', null, 'not_applicable']);
  assert.equal(dashboard({ canvases: CANVASES }).overview.metrics.active_learners.change, undefined, 'off unless asked');
  const prev = structuredClone(d); prev.series.points = [{ day: '2026-10-09', visits: suppress(12) }];
  const cur = structuredClone(d); cur.series.points = [{ day: '2026-10-16', visits: suppress(15) }];
  const w = withComparison(cur, prev, P);
  assert.deepEqual([w.series.points[0].index, w.series.previous.points[0].index, w.series.previous.points[0].day], [0, 0, '2026-10-09']);
});

test('coverage: null with an explanation while nothing is collected, never the fetch time', () => {
  const d = dashboard({ canvases: CANVASES, now: NOW_C });
  assert.deepEqual(d.coverage, NO_COVERAGE);
  assert.deepEqual([d.coverage.since, d.coverage.through, d.coverage.partial], [null, null, []]);
  assert.match(d.coverage.message, /Nothing is collected yet/);
});

test('health: four statuses only, the honest summary line, and an unchecked count', () => {
  assert.throws(() => finding({ status: 'ok' }));
  const r = healthReport({ checked_at: 'T', groups: [
    { canvas: 'a', title: 'A', checked: 3, unchecked: 2, findings: [] },
    { canvas: 'b', title: 'B', checked: 0, unchecked: 1, findings: [] },
    { canvas: 'c', title: 'C', checked: 2, unchecked: 0, findings: [finding({ canvas: 'c', kind: 'resource', item_id: 'x', title: 'X', problem: 'p', status: HEALTH.CONFIRMED, checked_at: 'T', target: null })] },
  ] });
  assert.deepEqual(r.totals, { checked: 5, unchecked: 3, findings: 1 });
  assert.deepEqual(r.groups.map(g => g.message), [NO_ISSUES, 'Nothing on this canvas could be checked.', null]);
  assert.equal(NO_ISSUES, 'No issues found in checked items');
});
