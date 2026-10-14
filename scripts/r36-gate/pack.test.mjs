import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pack, UNITS, cost, chooseK, kTable } from './pack.mjs';
import { ORDER, UNIT_STAGES, SHARDS } from './shards.mjs';
const durations = JSON.parse(readFileSync(new URL('./durations.json', import.meta.url), 'utf8'));
const browser = ORDER.filter(s => !UNIT_STAGES.includes(s));
const K = SHARDS.length;
test('every browser stage lands in exactly one shard, units stay whole, ORDER is kept inside a shard', () => {
  for (const k of [4, 5, 6, 7]) {
    const shards = pack(durations, k);
    assert.equal(shards.length, k);
    assert.deepEqual(shards.flat().sort(), [...browser].sort());
    for (const u of UNITS) assert.equal(new Set(u.map(s => shards.findIndex(sh => sh.includes(s)))).size, 1, u.join(','));
    for (const sh of shards) assert.deepEqual(sh, [...sh].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)));
  }
});
test('the committed SHARDS are the packer output (no hand edits drift from durations.json)', () => {
  assert.deepEqual(SHARDS, pack(durations, K));
});
test('the committed shard count is the smallest K within 0.5 min of the best predicted wall', () => {
  assert.equal(K, chooseK(durations));
  const table = kTable(durations);
  const best = Math.min(...table.map(r => r.wall));
  assert.equal(table.find(r => r.wall <= best + 0.5).k, K);
});
test('the slowest shard is within 25% of the mean, unless one indivisible unit is itself larger', () => {
  const costs = pack(durations, K).map(sh => cost(sh, durations));
  const mean = costs.reduce((a, b) => a + b) / costs.length;
  const biggestUnit = Math.max(...UNITS.map(u => cost(u, durations)));
  assert.ok(Math.max(...costs) <= Math.max(mean * 1.25, biggestUnit), costs.join(' '));
});
test('a shard pays for each stack it starts: the same stages cost more when they need a second stack', () => {
  const d = Object.fromEntries(browser.map(s => [s, 1]));
  assert.ok(cost(['sketch', 'fork'], d) < cost(['sketch', 'bundle(dist)'], d));
  assert.ok(cost(['bundle(dist)', 'journey J1-J8'], d) > cost(['bundle(dist)'], d) + cost(['journey J1-J8'], d) - 1e-9, 'a prod build before the journey stack means the dev flavor is rebuilt');
});
test('glob edge: a stage-free durations entry never crashes the packer', () => {
  assert.doesNotThrow(() => pack({}, K));
});
