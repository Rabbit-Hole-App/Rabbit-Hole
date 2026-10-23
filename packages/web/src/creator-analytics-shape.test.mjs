// Creator analytics response shape (owner brief 2026-10-23; docs/features/creator-analytics-contract.md "Dashboard read
// contract"): the six states, the cohort rule per cell, missing-last sorting, today's payload and the dev fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COHORT_MIN, DEFINITIONS, PERIOD, STATE, TRAFFIC_SOURCES, dashboard, metric, rangeOf, sortRows, suppress } from './creator-analytics-shape.js';
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
