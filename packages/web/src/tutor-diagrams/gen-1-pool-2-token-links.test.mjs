import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { derived, repairCafeTally } from './gen-1-pool-2-token-links-data.js';
import { references } from './gen-1-pool-2-token-links-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const { days, stations, ballotsByDay } = repairCafeTally;
const counts = days.map(day => {
  const tally = Object.fromEntries(stations.map(station => [station, 0]));
  for (const choice of ballotsByDay[day]) tally[choice]++;
  return stations.map(station => tally[station]);
});
const [reference] = references;

test('station weights and the caption come from each day’s choice slips', () => {
  const numbers = derived();
  assert.deepEqual(numbers.queries.map(query => query.weights), counts);
  const { day, station, count, total, share } = numbers.leadingStation;
  const row = counts[days.indexOf(day)];
  assert.equal(row[stations.indexOf(station)], count);
  assert.equal(count, Math.max(...row));
  assert.equal(total, row.reduce((sum, value) => sum + value, 0));
  assert.equal(share, count / total);
  const shown = [...reference.depths.deep.spec.diagram.caption.matchAll(/\d+(?:\.\d+)?/g)].map(([number]) => Number(number));
  assert.deepEqual(shown, [count, total, share]);
});

test('all depths send counts through the parser and render per-day shares at 408 px', () => {
  assert.deepEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
  for (const [depth, { spec }] of Object.entries(reference.depths)) {
    const indices = depth === 'overview' ? [0] : [0, 1];
    const expected = indices.map(index => ({ index, weights: counts[index] }));
    assert.equal(spec.diagram.normalized, true);
    assert.deepEqual(spec.diagram.queries, expected);
    assert.deepEqual(lintDiagramContent(spec), []);
    const resolved = parseTutorDiagram(spec).diagram.queries;
    assert.deepEqual(resolved.map(query => query.index), indices);
    const { element, width } = renderTutorDiagram(spec, 408);
    const markup = renderToStaticMarkup(element);
    assert.equal(width, 408);
    for (const { index, weights } of resolved) {
      const shares = counts[index].map(count => count / ballotsByDay[days[index]].length);
      assert.deepEqual(weights, shares);
      assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
      weights.forEach((weight, target) => assert.ok(markup.includes(
        `data-tutor-token-link="${index}:${target}" data-tutor-token-weight="${weight}"`,
      )));
      assert.ok(markup.includes(`data-tutor-token-largest-weight="${Math.max(...weights)}"`));
    }
    assert.deepEqual(spec.diagram.queries, expected);
  }
});
