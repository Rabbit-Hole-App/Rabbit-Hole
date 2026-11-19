import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { doubleGlazing, gravity, hangingSign, slidingCrate } from './gen-1-figure-data.js';
import { references } from './gen-1-figure-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const byDirection = ({ vectors }) => Object.fromEntries(vectors.map(({ direction, magnitude }) => [direction, magnitude]));

test('the hanging sign balances tension and weight', () => {
  const sign = byDirection(hangingSign);
  assert.deepEqual(sign, { up: 60, down: 60 });
  assert.equal(sign.down, hangingSign.mass * gravity);
  assert.equal(sign.up, sign.down);
  assert.equal(hangingSign.netVertical, sign.up - sign.down);
});

test('the sliding crate balances vertically and accelerates horizontally', () => {
  const crate = byDirection(slidingCrate);
  assert.deepEqual(crate, { right: 60, left: 20, up: 80, down: 80 });
  assert.equal(crate.down, slidingCrate.mass * gravity);
  assert.equal(crate.up, crate.down);
  assert.equal(crate.left, crate.up * slidingCrate.frictionCoefficient);
  assert.equal(slidingCrate.netHorizontal, crate.right - crate.left);
  assert.equal(slidingCrate.acceleration, (crate.right - crate.left) / slidingCrate.mass);
  assert.equal(slidingCrate.acceleration, 5);
});

test('the glass and air thicknesses give the depth and share of the gap', () => {
  const [outside, gap, inside] = doubleGlazing.layers.map(({ thickness }) => thickness);
  const total = outside + gap + inside;
  assert.deepEqual([outside, gap, inside], [4, 12, 4]);
  assert.equal(doubleGlazing.totalThickness, total);
  assert.equal(doubleGlazing.interfaceDepth, outside);
  assert.equal(doubleGlazing.gapPercent, gap / total * 100);
});

const exemplars = new Map([
  ['pool-hanging-shop-sign', { figure: 'free-body', vectors: hangingSign.vectors }],
  ['pool-sliding-shipping-crate', { figure: 'free-body', vectors: slidingCrate.vectors }],
  ['pool-double-glazed-window', { figure: 'cross-section' }],
]);

for (const ref of references) {
  test(`${ref.id} renders each depth as a single figure with matching labels and badges at 408 px`, () => {
    const exemplar = exemplars.get(ref.id);
    assert.equal(ref.spec, ref.depths.standard.spec);
    assert.deepEqual(Object.keys(ref.depths), ['overview', 'standard', 'deep']);
    for (const { spec } of Object.values(ref.depths)) {
      const { diagram } = parseTutorDiagram(spec);
      assert.equal(diagram.kind, 'figure');
      assert.equal(diagram.figure, exemplar.figure);
      assert.deepEqual(diagram.vectors, exemplar.vectors);
      assert.deepEqual(lintDiagramContent(spec), []);
      const { element, width } = renderTutorDiagram(spec, 408);
      assert.equal(width, 408);
      const svg = renderToStaticMarkup(element);
      assert.doesNotMatch(svg, /NaN|Infinity|minimum arrow length/);
      for (const [index, { anchor, label }] of diagram.callouts.entries()) {
        const number = index + 1;
        assert.ok(svg.includes(`data-figure-anchor="${anchor}" data-figure-number="${number}"`));
        assert.ok(svg.includes(`data-figure-callout="${anchor}" data-figure-number="${number}"`));
        assert.ok(svg.includes(`>${label}</tspan>`));
      }
      for (const { label, direction, magnitude } of diagram.vectors ?? []) {
        assert.ok(svg.includes(`data-figure-vector="${direction}"`));
        assert.ok(svg.includes(`${label} · ${magnitude} N`));
      }
      assert.equal((svg.match(/data-tutor-arrowhead/g) ?? []).length, diagram.vectors?.length ?? 0);
    }
  });
}
