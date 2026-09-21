import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScene } from './animation-scene.js';
import { checkLayoutLint } from './scene-layout-lint.js';

const CASE_01_PATH = new URL(
  '../../../viz-benchmarks/illustrated-transformer/cases/01-self-attention-computation-flow/generated/latest/scene-spec.json',
  import.meta.url,
);
const loadCase01 = () => JSON.parse(readFileSync(CASE_01_PATH, 'utf8'));

test('an arrow whose tip lands inside a label is flagged, generically - no scene-specific wording', () => {
  const scene = validateScene({
    id: 'collide', duration: 1,
    objects: [
      { id: 'caption', type: 'text', initialState: { text: 'careful here', x: 100, y: 100 } },
      { id: 'incoming', type: 'arrow', initialState: { from: { x: 0, y: 100 }, to: { x: 104, y: 100 } } },
    ],
    timeline: [],
  });
  const { passed, issues } = checkLayoutLint(scene);
  assert.equal(passed, false);
  assert.equal(issues[0].check, 'edge-intersects-label');
  assert.match(issues[0].message, /"incoming" lands its arrowhead/);
});

test('an arrow that clears every label passes', () => {
  const scene = validateScene({
    id: 'clear', duration: 1,
    objects: [
      { id: 'caption', type: 'text', initialState: { text: 'careful here', x: 100, y: 100 } },
      { id: 'away', type: 'arrow', initialState: { from: { x: 0, y: 400 }, to: { x: 200, y: 400 } } },
    ],
    timeline: [],
  });
  assert.deepEqual(checkLayoutLint(scene), { passed: true, issues: [] });
});

test('a grid row label sitting right where an arrow terminates is caught, using the same geometry the renderer draws', () => {
  const scene = validateScene({
    id: 'grid-collide', duration: 1,
    // The row label renders at object.x - ROW_LABEL_GAP, anchored 'end'
    // (extending left) - the arrow lands squarely inside that span rather
    // than at the grid's own edge, so this proves the collision LOGIC
    // itself rather than re-deriving today's gap value by hand.
    objects: [
      { id: 'g', type: 'grid', initialState: { x: 200, y: 0, rows: 1, cols: 1, cell: 40, rowLabels: ['a row'], values: [1] } },
      { id: 'in', type: 'arrow', initialState: { from: { x: 0, y: 20 }, to: { x: 160, y: 20 } } },
    ],
    timeline: [],
  });
  const { passed, issues } = checkLayoutLint(scene);
  assert.equal(passed, false);
  assert.ok(issues.some(issue => issue.message.includes('"a row"')));
});

test('an arrow is never flagged against its own caption', () => {
  const scene = validateScene({
    id: 'self', duration: 1,
    objects: [{ id: 'labelled', type: 'arrow', semanticId: 'labelled', initialState: { label: 'skip', from: { x: 0, y: 0 }, to: { x: 5, y: 0 } } }],
    timeline: [],
  });
  assert.deepEqual(checkLayoutLint(scene), { passed: true, issues: [] });
});

test('evidence: the committed case 01 scene-spec passes the layout lint, after the shared gap fix', () => {
  const scene = validateScene(loadCase01());
  assert.deepEqual(checkLayoutLint(scene), { passed: true, issues: [] });
});
