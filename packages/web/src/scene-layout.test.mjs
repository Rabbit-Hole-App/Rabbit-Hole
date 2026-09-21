import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScene, getSceneState } from './animation-scene.js';
import { COLUMN_LABEL_GAP, centreOf, labelAt, nearestAboveBottom, requiredLeftMargin } from './scene-layout.js';

// A grid with column headers treats its header row, not its cell top, as
// "its own content" for squeeze purposes - see labelAt's ownEdge. Mirrored
// here rather than exported, so this test proves the PUBLIC contract
// (labelAt's actual y) rather than reaching into a private detail.
const ownEdgeOf = object => (object.type === 'grid' && object.columnLabels?.length ? object.y - COLUMN_LABEL_GAP : object.y);

// Two systemic, generic-fix regressions (not per-case nudges):
//
// Finding A - a stacked strip/grid label positioned a fixed gap below its OWN
// content, with no awareness of how little room the PREVIOUS object in the
// stack left above it, so tightly packed groups (a template property, not a
// one-off scene mistake) drew the label closer to the wrong neighbour - four
// cases badly enough to be literally illegible.
//
// Finding B - a grid's row labels draw leftward (anchor 'end') from
// `object.x - ROW_LABEL_GAP`, with nothing stopping that text running off the
// canvas's left edge when the grid sits near the standard x=40 margin used
// throughout this vocabulary - "river" rendering as "ver".

const DATA_TYPES = ['grid', 'strip', 'bars', 'tokens'];

const load = relativePath => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
const evaluatedObjects = sceneJson => {
  const scene = validateScene(sceneJson);
  return getSceneState(scene, scene.duration).objects.filter(object => object.visible);
};

const illustratedTransformerCase = name =>
  load(`../../../viz-benchmarks/illustrated-transformer/cases/${name}/generated/latest/scene-spec.json`);
const gradientAlignmentCase = () =>
  load('../../../viz-benchmarks/gradient-alignment/cases/01-dot-product-alignment/generated/latest/scene-spec.json');

// ---------------------------------------------------------------------------
// Finding A
// ---------------------------------------------------------------------------

test('nearestAboveBottom only counts objects that are actually above and horizontally overlapping', () => {
  const objects = [
    { id: 'a', x: 0, y: 0, w: 40, h: 20 }, // above and overlapping - the answer
    { id: 'b', x: 100, y: 0, w: 40, h: 20 }, // above, but no horizontal overlap
    { id: 'c', x: 0, y: 200, w: 40, h: 20 }, // below, not above at all
  ];
  const target = { id: 'target', x: 10, y: 40, w: 20, h: 20 };
  assert.equal(nearestAboveBottom(target, objects), 20);
});

test('a tightly stacked label sits equidistant, not closer to the element above than to its own content', () => {
  // Same shape as the real bug: two labelled strips 80 scene-units apart,
  // each 42 tall - not enough room for a full gap on both sides of the
  // second label.
  const objects = evaluatedObjects({
    id: 'stack', duration: 1,
    objects: [
      { id: 'g1', type: 'strip', initialState: { label: 'gradient 1', x: 30, y: 110, cell: 42, values: [0.8, 0.6] } },
      { id: 'g2', type: 'strip', initialState: { label: 'gradient 2', x: 30, y: 190, cell: 42, values: [-0.5, 0.9] } },
    ],
    timeline: [],
  });
  const g2 = objects.find(object => object.id === 'g2');
  const label = labelAt(g2, { above: true }, centreOf(g2), objects);
  const aboveBottom = nearestAboveBottom(g2, objects);
  const distanceToOwnContent = Math.abs(g2.y - label.y);
  const distanceToAbove = Math.abs(label.y - aboveBottom);
  assert.ok(
    distanceToOwnContent <= distanceToAbove + 0.001,
    `label sat ${distanceToOwnContent}px from its own content but only ${distanceToAbove}px from the element above it`,
  );
  assert.ok(Math.abs(distanceToOwnContent - distanceToAbove) < 0.001, 'a too-tight stack should split the room evenly');
});

test('plenty of room leaves the label exactly where it always sat - no behaviour change for the common case', () => {
  const objects = evaluatedObjects({
    id: 'roomy', duration: 1,
    objects: [
      { id: 'g1', type: 'strip', initialState: { x: 30, y: 40, cell: 42, values: [1] } },
      { id: 'g2', type: 'strip', initialState: { label: 'far below', x: 30, y: 300, cell: 42, values: [1] } },
    ],
    timeline: [],
  });
  const g2 = objects.find(object => object.id === 'g2');
  const label = labelAt(g2, { above: true }, centreOf(g2), objects);
  assert.equal(label.y, g2.y - 24); // ABOVE_LABEL_GAP, untouched when nothing crowds it
});

// Regression evidence: every 'above' label in every previously-affected real
// case now sits no closer to the object above it than to its own content.
const findingACases = [
  ['illustrated-transformer/01-self-attention-computation-flow', () => illustratedTransformerCase('01-self-attention-computation-flow')],
  ['illustrated-transformer/02-qkv-projection (severe, 3 overlaps)', () => illustratedTransformerCase('02-qkv-projection')],
  ['illustrated-transformer/04-softmax-attention-weights', () => illustratedTransformerCase('04-softmax-attention-weights')],
  ['illustrated-transformer/07-multi-head-attention (severe, 3 overlaps)', () => illustratedTransformerCase('07-multi-head-attention')],
  ['illustrated-transformer/10-positional-encoding (worst instance)', () => illustratedTransformerCase('10-positional-encoding')],
  ['gradient-alignment/01-dot-product-alignment', gradientAlignmentCase],
];

for (const [name, loadCase] of findingACases) {
  test(`Finding A regression: ${name} - no stacked label sits closer to the object above than to its own content`, () => {
    const objects = evaluatedObjects(loadCase());
    let checked = 0;
    for (const object of objects) {
      const isData = DATA_TYPES.includes(object.type);
      const isImage = object.type === 'image';
      if (!(isData || isImage) || !object.label) continue;
      const aboveBottom = nearestAboveBottom(object, objects);
      if (aboveBottom == null) continue; // nothing above this one - not at risk
      const label = labelAt(object, { above: true }, centreOf(object), objects);
      const distanceToOwnContent = Math.abs(ownEdgeOf(object) - label.y);
      const distanceToAbove = Math.abs(label.y - aboveBottom);
      assert.ok(
        distanceToOwnContent <= distanceToAbove + 0.001,
        `${name}: "${object.id}" label sat ${distanceToOwnContent}px from its own content but only ${distanceToAbove}px from the element above it`,
      );
      checked += 1;
    }
    assert.ok(checked > 0, `${name}: expected at least one stacked 'above' label with something above it to check`);
  });
}

// ---------------------------------------------------------------------------
// Finding B
// ---------------------------------------------------------------------------

test('requiredLeftMargin is 0 when no row label would clip', () => {
  const objects = evaluatedObjects({
    id: 'safe', duration: 1,
    objects: [{ id: 'g', type: 'grid', initialState: { x: 400, y: 0, rows: 1, cols: 1, cell: 40, matrixKind: 'input', rowLabels: ['a row'], values: [1] } }],
    timeline: [],
  });
  assert.equal(requiredLeftMargin(objects), 0);
});

test('requiredLeftMargin is positive when a row label would run off the canvas left edge', () => {
  const objects = evaluatedObjects({
    id: 'clips', duration: 1,
    objects: [{ id: 'g', type: 'grid', initialState: { x: 40, y: 0, rows: 3, cols: 3, cell: 30, matrixKind: 'input', rowLabels: ['river', 'flows', 'south'], values: Array(9).fill(0) } }],
    timeline: [],
  });
  const margin = requiredLeftMargin(objects);
  assert.ok(margin > 0, 'a grid at x=40 with "river"/"flows"/"south" row labels needs a margin');
  // With the margin applied, the canvas's visible left edge moves to -margin;
  // the label must fit inside it.
  assert.ok(-margin <= (40 - 24 - 'river'.length * 11 * 0.6) + 0.001);
});

// Regression evidence: the three cases blind review named for row-label
// clipping ("river/flows/south" -> "ver/ows/uth", "pos0..pos7" -> "os0..os7")
// now report a margin, proving the vocabulary would have clipped them
// without this fix.
const findingBCases = [
  ['illustrated-transformer/03-attention-score-matrix', () => illustratedTransformerCase('03-attention-score-matrix')],
  ['illustrated-transformer/06-matrix-self-attention', () => illustratedTransformerCase('06-matrix-self-attention')],
  ['illustrated-transformer/10-positional-encoding', () => illustratedTransformerCase('10-positional-encoding')],
];

for (const [name, loadCase] of findingBCases) {
  test(`Finding B regression: ${name} - needs (and gets) a left-margin allowance for its row labels`, () => {
    const objects = evaluatedObjects(loadCase());
    assert.ok(requiredLeftMargin(objects) > 0, `${name}: expected a positive required left margin`);
  });
}

test('Finding B does not falsely trigger on a case with no row-labelled grid near the edge', () => {
  const objects = evaluatedObjects(illustratedTransformerCase('02-qkv-projection'));
  assert.equal(requiredLeftMargin(objects), 0);
});
