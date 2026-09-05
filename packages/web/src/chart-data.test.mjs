// node --test packages/web/src/chart-data.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenRuns, parseOutput, columns, toNivo } from './chart-data.js';

const runs = [
  { run_id: 'b2c3d4e5f6', status: 'failed', started_at: '2026-09-05 10:00:00', finished_at: '2026-09-05 10:00:03', inputs: { threshold: 0.5, account: 'acme' } },
  { run_id: 'a1b2c3d4e5', status: 'finished', started_at: '2026-09-04 09:00:00', finished_at: '2026-09-04 09:00:14', inputs: { threshold: 0.7, account: 'acme' } },
];

test('flattenRuns: oldest first, duration computed, inputs spread', () => {
  const rows = flattenRuns(runs);
  assert.equal(rows[0].run, 'a1b2c3d');
  assert.equal(rows[0].duration_s, 14);
  assert.equal(rows[1].duration_s, 3);
  assert.equal(rows[0].threshold, 0.7);
  assert.equal(flattenRuns([{ run_id: 'x', status: 'running', started_at: '2026-09-05 10:00:00', finished_at: null }])[0].duration_s, null);
});

test('columns: numeric detection ignores nulls, rejects mixed', () => {
  const { all, numeric } = columns(flattenRuns(runs));
  assert.ok(all.includes('account') && all.includes('threshold'));
  assert.ok(numeric.includes('duration_s') && numeric.includes('threshold'));
  assert.ok(!numeric.includes('status'));
});

test('parseOutput: json array, json object, csv', () => {
  assert.deepEqual(parseOutput('a.json', '[{"day":"mon","n":2}]'), [{ day: 'mon', n: 2 }]);
  assert.deepEqual(parseOutput('a.json', '{"people":2,"cars":3,"meta":{"x":1}}'), [{ key: 'people', value: 2 }, { key: 'cars', value: 3 }]);
  assert.deepEqual(parseOutput('a.csv', 'day,n\nmon,2\ntue,3'), [{ day: 'mon', n: 2 }, { day: 'tue', n: 3 }]);
});

test('toNivo: line raw points, bar/pie aggregate, empty-safe', () => {
  const rows = flattenRuns(runs);
  const line = toNivo('line', rows, 'run', 'duration_s');
  assert.equal(line[0].data.length, 2);
  assert.deepEqual(line[0].data[0], { x: 'a1b2c3d', y: 14 });
  const bar = toNivo('bar', rows, 'account', 'duration_s');
  assert.deepEqual(bar, [{ account: 'acme', duration_s: 17 }]); // sums repeated category
  const pie = toNivo('pie', rows, 'status', '');
  assert.deepEqual(pie.sort((a, b) => a.id.localeCompare(b.id)), [{ id: 'failed', value: 1 }, { id: 'finished', value: 1 }]); // counts without y
  assert.equal(toNivo('line', [], 'x', 'y'), null);
  assert.equal(toNivo('line', rows, 'run', 'status'), null); // non-numeric y
});
