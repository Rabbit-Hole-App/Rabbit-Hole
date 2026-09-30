import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyInputToBlock, evaluateScene } from './scene-evaluate.js';
import { DERIVATIONS } from './scene-derive.js';

// T02: one evaluation path. Raw learner values are coerced ONCE, the coerced
// values join the derive pool, and every consumer - derived math, rendered
// values, captions, highlights - reads the same effective snapshot. The test
// scene is deliberately synthetic: renaming its ids must not break anything
// (proved below), and no shared logic may ever mention them.

const scene = () => ({
  id: 'evaluate-contract',
  duration: 4,
  width: 400,
  height: 300,
  inputs: [
    { name: 'rowIndex', type: 'index', label: 'Row', of: 'table', default: 0 },
    { name: 'gateOn', type: 'bool', label: 'Gate', default: true },
  ],
  exampleData: {
    table: [[1, 2], [3, 4], [5, 6]],
  },
  derived: {
    chosen: { op: 'pick', args: ['table', 'rowIndex'] },
    total: { op: 'sum', args: ['chosen'] },
  },
  objects: [
    { id: 'source', type: 'grid', initialState: { rows: 3, cols: 2, values: [1, 2, 3, 4, 5, 6], matrixKind: 'input', cellHighlight: { row: { $derive: 'rowIndex' } }, cellHighlightKind: 'highlight' } },
    { id: 'picked', type: 'strip', initialState: { values: { $derive: 'chosen' }, opacity: 0 } },
    { id: 'caption', type: 'text', initialState: { text: 'row {{rowIndex}} sums to {{total}}' } },
  ],
  timeline: [{ at: 2, action: 'appear', target: 'picked', duration: 0.2 }],
});

test('the same coerced value reaches derive, display, caption and highlight', () => {
  // Raw 9.9 is outside the 3-row domain: the declaration resets it to the
  // default 0. If coercion happened for rendering but raw reached derive (or
  // the reverse), these four readings would disagree - that disagreement is
  // exactly what this test exposes.
  const { inputs, derived, state } = evaluateScene(scene(), 1, { rowIndex: 9.9 });
  assert.equal(inputs.rowIndex, 0);
  assert.deepEqual(derived.chosen, [1, 2]);
  assert.equal(derived.total, 3);
  const objects = Object.fromEntries(state.objects.map(object => [object.id, object]));
  assert.deepEqual(objects.picked.values, [1, 2]);
  assert.equal(objects.caption.label, 'row 0 sums to 3');
  assert.deepEqual(objects.source.cellHighlight, { row: 0 });
});

test('a changed input drives every bound view from one snapshot', () => {
  const { inputs, derived, state } = evaluateScene(scene(), 1, { rowIndex: 2 });
  assert.equal(inputs.rowIndex, 2);
  assert.deepEqual(derived.chosen, [5, 6]);
  const objects = Object.fromEntries(state.objects.map(object => [object.id, object]));
  assert.deepEqual(objects.picked.values, [5, 6]);
  assert.equal(objects.caption.label, 'row 2 sums to 11');
  assert.deepEqual(objects.source.cellHighlight, { row: 2 });
  // the untouched input keeps its default alongside
  assert.equal(inputs.gateOn, true);
});

test('replay time and learning inputs are separate axes', () => {
  const early = evaluateScene(scene(), 0, { rowIndex: 1 });
  const late = evaluateScene(scene(), 4, { rowIndex: 1 });
  assert.deepEqual(early.inputs, late.inputs);
  assert.deepEqual(early.derived, late.derived);
  assert.notEqual(early.state.objects.find(o => o.id === 'picked').visible,
    late.state.objects.find(o => o.id === 'picked').visible);
});

test('deterministic and mode-blind: same scene, time, raw inputs - same evaluation', () => {
  const a = evaluateScene(scene(), 2.5, { rowIndex: 1, gateOn: false });
  const b = evaluateScene(scene(), 2.5, { rowIndex: 1, gateOn: false });
  assert.deepEqual(a.inputs, b.inputs);
  assert.deepEqual(a.derived, b.derived);
  assert.deepEqual(a.state, b.state);
});

test('a scene with no inputs evaluates exactly as the passive path', () => {
  const passive = { id: 'plain', duration: 2, objects: [{ id: 'box', type: 'box', initialState: { label: 'x' } }], timeline: [] };
  const { inputs, state } = evaluateScene(passive, 1, { anything: 5 });
  assert.deepEqual(inputs, {});
  assert.equal(state.objects[0].label, 'x');
});

test('pick: array by integer, record map by choice id, refusals carry reasons', () => {
  assert.deepEqual(DERIVATIONS.pick.derive([[[1, 2], [3, 4]], 1]), { defined: true, value: [3, 4] });
  assert.deepEqual(DERIVATIONS.pick.derive([{ A: [9], B: [7] }, 'B']), { defined: true, value: [7] });
  assert.equal(DERIVATIONS.pick.derive([[[1]], 5]).defined, false);
  assert.equal(DERIVATIONS.pick.derive([[[1]], 0.5]).defined, false);
  assert.equal(DERIVATIONS.pick.derive([{ A: [1] }, 'Z']).defined, false);
  assert.equal(DERIVATIONS.pick.derive([null, 0]).defined, false);
});

test('an unresolvable binding rejects the whole evaluation with a diagnostic', () => {
  const broken = scene();
  broken.derived.chosen = { op: 'pick', args: ['absent', 'rowIndex'] };
  assert.throws(() => evaluateScene(broken, 0, {}), /absent/);
});

test('an input-driven highlight does not force value provenance', () => {
  // `source` binds only its highlight to an input; its values stay authored
  // ground truth. A selection is not a claim about where the numbers came from.
  const { state } = evaluateScene(scene(), 0, {});
  assert.equal(state.objects.find(o => o.id === 'source').provenance, 'literal');
  assert.equal(state.objects.find(o => o.id === 'picked').provenance, 'derived');
});

test('renamed ids, labels and input names still bind - nothing keys on the fixture words', () => {
  const renamed = JSON.parse(JSON.stringify(scene())
    .replaceAll('rowIndex', 'zeile').replaceAll('table', 'tafel')
    .replaceAll('chosen', 'gewaehlt').replaceAll('total', 'summe')
    .replaceAll('source', 'quelle').replaceAll('picked', 'gewaehlte').replaceAll('caption', 'beschriftung'));
  const { derived, state } = evaluateScene(renamed, 1, { zeile: 2 });
  assert.deepEqual(derived.gewaehlt, [5, 6]);
  assert.deepEqual(state.objects.find(o => o.id === 'gewaehlte').values, [5, 6]);
  assert.equal(state.objects.find(o => o.id === 'beschriftung').label, 'row 2 sums to 11');
});

test('applyInputToBlock: canonical value stored, revision monotonic, no-ops spend nothing', () => {
  const block = { id: 'b1', type: 'animation', scene: scene(), time: 0 };
  const first = applyInputToBlock(block, 'rowIndex', 2);
  assert.equal(first.inputs.rowIndex, 2);
  assert.equal(first.inputRevision, 1);
  // out-of-domain resets to the default - which IS a change from 2, so it counts
  const second = applyInputToBlock(first, 'rowIndex', 99);
  assert.equal(second.inputs.rowIndex, 0);
  assert.equal(second.inputRevision, 2);
  // the same effective value again is a no-op: same object, no revision spent
  assert.equal(applyInputToBlock(second, 'rowIndex', 0), second);
  assert.equal(applyInputToBlock(second, 'rowIndex', 0.4), second);
  // an undeclared name changes nothing
  assert.equal(applyInputToBlock(second, 'ghost', 5), second);
  // untouched block fields ride along
  assert.equal(second.time, 0);
});

test('evaluateScene mutates neither the scene nor the raw inputs', () => {
  const original = scene();
  const snapshot = JSON.parse(JSON.stringify(original));
  const raw = Object.freeze({ rowIndex: 2 });
  evaluateScene(original, 1, raw);
  assert.deepEqual(original, snapshot);
});
