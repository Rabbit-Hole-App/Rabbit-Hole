// E3 (docs/features/explain.md EXP-12-C04, EX-03/EX-07): a flow may carry an ordered `highlightPath` of its own node IDs. The schema validates the route,
// the renderer draws it in the one fixed path style, and the accessible description names it. A diagram without the field is unchanged.
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderTutorDiagram } from './TutorDiagram.js';
import { describeTutorDiagram, parseTutorDiagram, tutorDiagramVisibleText } from './spec.js';
import { PATH } from './primitives.js';

const tree = {
  kind: 'flow', title: 'Toy approval rule', caption: 'A 25-year-old earning $60,000 answers Yes twice and is approved.',
  nodes: [
    { id: 'age', label: 'Age under 30?', role: 'decision' }, { id: 'inc', label: 'Income over $50k?', role: 'decision' },
    { id: 'ok', label: 'Approve', role: 'outcome' }, { id: 'no', label: 'Deny', role: 'outcome' }, { id: 'cs', label: 'Check credit score', role: 'outcome' },
  ],
  edges: [{ from: 'age', to: 'inc', label: 'Yes' }, { from: 'age', to: 'cs', label: 'No' }, { from: 'inc', to: 'ok', label: 'Yes' }, { from: 'inc', to: 'no', label: 'No' }],
};
const doc = diagram => ({ version: 1, diagram });
const markup = diagram => renderToStaticMarkup(renderTutorDiagram(doc(diagram), 408).element);
const problem = diagram => { try { parseTutorDiagram(doc(diagram)); return null; } catch (error) { return error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '); } };

test('the worked route Age under 30? -> Income over $50k? -> Approve is valid and draws exactly those two edges and three nodes in the path style', () => {
  const path = ['age', 'inc', 'ok'];
  assert.equal(problem({ ...tree, highlightPath: path }), null);
  const svg = markup({ ...tree, highlightPath: path });
  assert.deepEqual([...svg.matchAll(/<g data-tutor-edge="([^"]+)" data-tutor-path/g)].map(m => m[1]), ['age:inc', 'inc:ok']);
  assert.deepEqual([...svg.matchAll(/<g data-tutor-node="([^"]+)" data-tutor-path/g)].map(m => m[1]).sort(), ['age', 'inc', 'ok']);
  // The unselected branches stay neutral: no path attribute on them, and the path colour only on the route.
  for (const id of ['no', 'cs']) assert.doesNotMatch(svg, new RegExp(`data-tutor-node="${id}" data-tutor-path`));
  assert.doesNotMatch(svg, /data-tutor-edge="age:cs" data-tutor-path/);
  assert.doesNotMatch(svg, /data-tutor-edge="inc:no" data-tutor-path/);
  assert.ok(svg.split(PATH).length - 1 >= 5, 'two wires, two arrow heads and the rings use the one fixed colour');
  assert.ok(!markup(tree).includes(PATH), 'without the field nothing is drawn in the path style');
  // The route wires are drawn last (over any crossing wire).
  assert.ok(svg.indexOf('data-tutor-edge="age:cs"') < svg.indexOf('data-tutor-edge="age:inc"'));
});

test('the accessible description names the route; visible text and the caption are unchanged by it', () => {
  const withPath = doc({ ...tree, highlightPath: ['age', 'inc', 'ok'] });
  assert.match(describeTutorDiagram(parseTutorDiagram(withPath)), /Highlighted path: Age under 30\? → Income over \$50k\? → Approve/);
  assert.match(markup({ ...tree, highlightPath: ['age', 'inc', 'ok'] }), /aria-label="[^"]*Highlighted path: Age under 30\?/);
  assert.deepEqual(tutorDiagramVisibleText(parseTutorDiagram(withPath)), tutorDiagramVisibleText(parseTutorDiagram(doc(tree))), 'ids and the route are not teaching words');
  assert.doesNotMatch(describeTutorDiagram(parseTutorDiagram(doc(tree))), /Highlighted path/);
});

test('an unknown, disconnected, reversed, repeated, too short or mid-graph route is refused', () => {
  const bad = (highlightPath, expected) => assert.match(problem({ ...tree, highlightPath }), expected, JSON.stringify(highlightPath));
  bad(['age', 'ghost'], /unknown node/);
  bad(['age', 'ok'], /follow existing edges/);          // no direct edge: disconnected
  bad(['ok', 'inc', 'age'], /follow existing edges/);   // reversed
  bad(['age', 'inc', 'age'], /cannot repeat a node/);
  bad(['inc', 'ok'], /start at the start node/);        // not from the root
  bad(['age', 'inc'], /end at a node with no outgoing edge/);
  assert.ok(problem({ ...tree, highlightPath: ['age'] }), 'one node is not a route');
  assert.ok(problem({ ...tree, highlightPath: [] }));
  assert.ok(problem({ ...tree, highlightPath: ['age', 'inc', 'ok', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] }), 'bounded by the graph limit');
  assert.ok(problem({ ...tree, highlightPath: ['age', 'inc', 'ok'], color: 'red' }), 'no author-supplied colour field');
  assert.ok(problem({ ...tree, highlightPath: [{ id: 'age' }] }));
});

test('the other branch of the same flow is a valid route too, and every other kind refuses the field', () => {
  assert.equal(problem({ ...tree, highlightPath: ['age', 'inc', 'no'] }), null);
  assert.equal(problem({ ...tree, highlightPath: ['age', 'cs'] }), null);
  assert.ok(problem({ kind: 'timeline', title: 'T', events: [{ time: 'a', label: 'b' }, { time: 'c', label: 'd' }], highlightPath: ['a', 'b'] }));
});
