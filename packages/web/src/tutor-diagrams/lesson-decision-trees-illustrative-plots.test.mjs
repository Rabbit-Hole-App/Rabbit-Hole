import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { lessonDecisionTreesIllustrativeDemos } from './lesson-decision-trees-illustrative-demos.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const depths = ['overview', 'standard', 'deep'];

function plotAt(name, depth) {
  const demo = lessonDecisionTreesIllustrativeDemos.find(item => item.name === name);
  assert.ok(demo, name);
  const spec = { version: 1, diagram: demo.diagramAt(depth) };
  assert.deepEqual(lintDiagramContent(spec), []);
  const { diagram } = parseTutorDiagram(spec);
  assert.equal(diagram.kind, 'coordinate-plot');
  assert.equal(diagram.x.scale, 'log');
  assert.match(diagram.caption, /^Illustrative\./);
  return diagram;
}

for (const depth of depths) {
  test(`pruning marks the smallest tree on the best accuracy plateau at ${depth}`, () => {
    const { y, series: [leaves, accuracy], annotations } = plotAt('cost-complexity-pruning', depth);
    assert.equal(y.unit, '%');
    assert.match(leaves.label, /of 10/);
    assert.ok(leaves.points.every((point, i) => !i || point.y < leaves.points[i - 1].y));
    const bestAccuracy = Math.max(...accuracy.points.map(point => point.y));
    const best = accuracy.points.filter(point => point.y === bestAccuracy);
    assert.ok(best.length > 1 && accuracy.points.at(-1).y < bestAccuracy);
    assert.deepEqual(leaves.points.map(point => point.x), accuracy.points.map(point => point.x));
    assert.equal(annotations[0].value, best.at(-1).x);
  });

  test(`forest size keeps all five labeled accuracy samples at ${depth}`, () => {
    const { series: [accuracy] } = plotAt('forest-size-accuracy', depth);
    assert.deepEqual(accuracy.points.map(({ x, y }) => [x, y]), [
      [1, 0.78], [5, 0.86], [10, 0.89], [50, 0.92], [200, 0.925],
    ]);
    assert.ok(accuracy.points.every(point => point.label));
  });
}

test('the forest-size log axis uses decades and retains all five labeled markers', () => {
  const diagram = plotAt('forest-size-accuracy', 'standard');
  const svg = renderToStaticMarkup(renderTutorDiagram({ version: 1, diagram }, 408).element);
  const labels = [...svg.matchAll(/<text\b[^>]* y="([^"]+)"[^>]*><tspan\b[^>]*>([^<]+)<\/tspan><\/text>/g)];
  const rightTick = labels.find(([, , label]) => label === '200');
  assert.ok(rightTick, 'the upper axis endpoint is labeled');
  assert.deepEqual(labels.filter(([, y]) => y === rightTick[1]).map(([, , label]) => label), ['1', '10', '100', '200']);
  assert.deepEqual([...svg.matchAll(/data-tutor-coordinate-point="([^"]+)"/g)].map(([, point]) => point),
    ['1,0.78', '5,0.86', '10,0.89', '50,0.92', '200,0.925']);
});
