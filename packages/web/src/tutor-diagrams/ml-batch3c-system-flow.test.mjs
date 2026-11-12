import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { references } from './ml-batch3c-system-flow-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

function diagramFor(id) {
  const reference = references.find(item => item.id === id);
  assert.ok(reference, `The worked ${id} reference is available`);
  return parseTutorDiagram(reference.spec).diagram;
}

test('the churn goal leads to a per-user 30-day prediction and a nightly offer decision', () => {
  const { nodes, edges, caption } = diagramFor('ml-churn-goal-prediction-decision');
  assert.deepEqual(edges.map(({ from, to }) => [from, to]), [['goal', 'predict'], ['predict', 'offer']]);
  const [goal, prediction, decision] = ['goal', 'predict', 'offer'].map(id => nodes.find(node => node.id === id));
  assert.match(goal.label, /reduce cancellations/i);
  assert.match(prediction.label, /each user.*30-day cancellation probability/);
  assert.match(decision.label, /nightly.*highest-risk 5%/);
  assert.equal(decision.role, 'outcome');
  const [, eligible, offers] = caption.match(/([\d,]+) eligible users, .*?(\d+) offers/);
  const rate = Number(decision.label.match(/(\d+)%/)[1]) / 100;
  assert.equal(Number(eligible.replaceAll(',', '')), 1_000);
  assert.equal(Number(eligible.replaceAll(',', '')) * rate, Number(offers));
  assert.match(caption, /random holdout.*cancellations/);
});

function scoringRoute({ nodes, edges }, batchSucceeded, lastGoodAgeHours) {
  const present = lastGoodAgeHours !== undefined;
  const conditions = new Map([
    ['Batch succeeded', batchSucceeded],
    ['Batch failed', !batchSucceeded],
    ['Present and at most 25 h old', present && lastGoodAgeHours <= 25],
    ['Missing or over 25 h old', !present || lastGoodAgeHours > 25],
  ]);
  const path = ['batch'];
  while (nodes.find(node => node.id === path.at(-1)).role === 'decision') {
    const applicable = edges.filter(edge => edge.from === path.at(-1) && conditions.get(edge.label));
    assert.equal(applicable.length, 1, `One branch from ${path.at(-1)}`);
    path.push(applicable[0].to);
  }
  assert.equal(nodes.find(node => node.id === path.at(-1)).role, 'outcome');
  assert.ok(!edges.some(edge => edge.from === path.at(-1)));
  return path;
}

test('the batch fallback serves fresh, still-valid or heuristic scores with the same offer cap', () => {
  const diagram = diagramFor('ml-batch-score-fallback');
  assert.deepEqual(scoringRoute(diagram, true, undefined), ['batch', 'fresh']);
  assert.deepEqual(scoringRoute(diagram, true, 26), ['batch', 'fresh']);
  for (const age of [24, 25]) assert.deepEqual(scoringRoute(diagram, false, age), ['batch', 'usable', 'last-good']);
  for (const age of [25.01, 26, undefined]) assert.deepEqual(scoringRoute(diagram, false, age), ['batch', 'usable', 'rule']);

  const terminalNodes = diagram.nodes.filter(node => node.role === 'outcome');
  assert.deepEqual(terminalNodes.map(node => node.id).sort(), ['fresh', 'last-good', 'rule']);
  assert.match(terminalNodes.find(node => node.id === 'fresh').label, /new scores/);
  assert.match(terminalNodes.find(node => node.id === 'last-good').label, /last good scores/);
  assert.match(terminalNodes.find(node => node.id === 'rule').label, /idle at least 14 days/);
  assert.match(diagram.caption, /5% of eligible users on all three routes/);
});

test('both Lesson 19 flows pass content lint and render every node and branch at three widths', () => {
  assert.equal(references.length, 2);
  for (const { lessons, spec } of references) {
    const saved = JSON.stringify(spec);
    assert.deepEqual(lessons, ['19']);
    assert.deepEqual(parseTutorDiagram(saved), spec);
    assert.deepEqual(lintDiagramContent(spec), []);
    assert.equal(spec.diagram.kind, 'flow');
    for (const width of [320, 408, 720]) {
      const rendered = renderTutorDiagram(saved, width);
      const svg = renderToStaticMarkup(rendered.element);
      const visible = svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(spec, width).element));
      assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
      assert.equal((svg.match(/data-tutor-arrowhead/g) ?? []).length, spec.diagram.edges.length);
      for (const { id, label } of spec.diagram.nodes) {
        assert.ok(svg.includes(`data-tutor-node="${id}"`));
        assert.ok(visible.includes(label), `${label} at ${width}px`);
      }
      for (const { from, to, label } of spec.diagram.edges) {
        assert.ok(svg.includes(`data-tutor-edge="${from}:${to}"`));
        if (label) assert.ok(visible.includes(label), `${label} at ${width}px`);
      }
    }
  }
});
