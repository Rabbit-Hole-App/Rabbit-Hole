// Release 118 (owner): a log axis is labelled at its powers of ten and its exact endpoints; fewer than three ticks are completed with a 1-2-5 progression inside the range.
// Three or more ticks get no sub-ticks, so a five-decade axis keeps its six ticks (upper bound 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plotTicks } from './plot-ticks.js';

const ticksFor = (min, max, width = 600) => {
  const position = v => 40 + (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)) * width;
  const ticks = plotTicks({ min, max, scale: 'log' }, position, { horizontal: true, labelWidth: 200 });
  return ticks.map(t => ({ at: t.at, text: t.lines.join('') }));
};

for (const [min, max, expected] of [
  [1, 9, ['1', '2', '5', '9']],
  [1, 30, ['1', '10', '30']],
  [3, 300, ['3', '10', '100', '300']],
  [1, 100000, ['1', '10', '100', '1000', '10000', '100000']],
  [0.001, 100, ['0.001', '0.01', '0.1', '1', '10', '100']],
  [2, 8, ['2', '5', '8']],
]) {
  test(`log axis ${min}..${max}: ${expected.join(' ')} (3 to 7 ticks, sorted, endpoints included)`, () => {
    const ticks = ticksFor(min, max);
    assert.ok(ticks.length >= 3 && ticks.length <= 7, `found ${ticks.length}`);
    assert.deepEqual(ticks.map(t => t.text), expected);
    assert.deepEqual(ticks.map(t => t.at), ticks.map(t => t.at).sort((a, b) => a - b), 'sorted left to right');
    assert.equal(new Set(ticks.map(t => t.text)).size, ticks.length, 'distinct labels');
    assert.deepEqual([Number(ticks[0].text), Number(ticks.at(-1).text)], [min, max], 'exact endpoints');
  });
}

test('the same axis gives the same ticks every time (deterministic)', () => {
  assert.deepEqual(ticksFor(1, 9), ticksFor(1, 9));
});
