import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderTutorDiagram } from './TutorDiagram.js';
import { lintDiagramContent } from './content-contract.js';
import { apronFabricStock, exhibitTankVolume, triviaTeamScore } from './gen-1-waterfall-data.js';
import { references } from './gen-1-waterfall-references.js';
import { parseTutorDiagram } from './spec.js';

const cases = [
  {
    id: 'pool-exhibit-tank-refill',
    data: exhibitTankVolume,
    unit: 'L',
    opening: 4 * 20,
    amounts: [4 * 12, -3 * 8],
    closing: 104,
  },
  {
    id: 'pool-trivia-team-score',
    data: triviaTeamScore,
    unit: 'points',
    opening: 6 * 5,
    amounts: [3 * 4, 2, -4 * 5],
    closing: 24,
  },
  {
    id: 'pool-apron-fabric-stock',
    data: apronFabricStock,
    unit: 'm',
    opening: 2 * 6,
    amounts: [6, -9 * 2],
    closing: 0,
  },
];

for (const { id, data, unit, opening, amounts, closing } of cases) {
  test(`${id} independently reconciles opening stock, changes and close`, () => {
    assert.equal(data.opening, opening);
    assert.deepEqual(data.changes.map(({ amount }) => amount), amounts);
    assert.deepEqual(data.balances, [opening, ...amounts.map((_, index) =>
      opening + amounts.slice(0, index + 1).reduce((sum, amount) => sum + amount, 0))]);
    assert.equal(data.closing, closing);
    assert.equal(data.balances.at(-1), closing);
  });

  test(`${id} renders matching opening and closing values at every depth`, () => {
    const reference = references.find(item => item.id === id);
    assert.ok(reference);
    assert.deepEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
    assert.equal(reference.spec, reference.depths.standard.spec);
    for (const [depth, { spec }] of Object.entries(reference.depths)) {
      const { diagram } = parseTutorDiagram(spec);
      assert.deepEqual(lintDiagramContent(spec), []);
      assert.equal(diagram.kind, 'waterfall');
      assert.equal(diagram.opening, opening);
      assert.equal(diagram.unit, unit);
      const moves = id === 'pool-trivia-team-score' && depth === 'overview'
        ? [amounts[0] + amounts[1], amounts[2]]
        : amounts;
      assert.deepEqual(diagram.changes.map(({ amount }) => amount), moves);
      assert.equal(diagram.changes.reduce((total, { amount }) => total + amount, diagram.opening), closing);

      const { element, width } = renderTutorDiagram(spec, 408);
      const svg = renderToStaticMarkup(element);
      assert.equal(width, moves.length === 2 ? 408 : 442);
      assert.doesNotMatch(svg, /NaN|Infinity/);
      assert.equal([...svg.matchAll(/data-balance-step="/g)].length, moves.length + 2);
      assert.ok(svg.includes(`>${opening.toFixed(2)}</tspan>`));
      assert.ok(svg.includes(`>${closing.toFixed(2)}</tspan>`));
    }
  });
}
