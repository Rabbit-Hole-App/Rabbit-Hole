import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DERIVATIONS, resolveDerived, round } from './scene-derive.js';
import { validateScene, getSceneState } from './animation-scene.js';

test('round normalises negative zero and quantises to three decimals', () => {
  assert.equal(round(-0.0001 * 1000 / 1000), 0);
  assert.equal(round(0.12345), 0.123);
  assert.ok(!Object.is(round(-0.00001), -0));
});

test('dot multiplies and sums componentwise, and refuses mismatched lengths', () => {
  assert.deepEqual(DERIVATIONS.dot.derive([[0.9, -0.4, 1.3], [0.6, 1.1, -0.7]]), { defined: true, value: -0.81 });
  const bad = DERIVATIONS.dot.derive([[1, 2], [1, 2, 3]]);
  assert.equal(bad.defined, false);
  assert.match(bad.reason, /equal-length/);
});

test('matmul dots every row of a against every row of b', () => {
  const result = DERIVATIONS.matmul.derive([[[1, 0], [0, 1]], [[2, 3], [4, 5]]]);
  assert.deepEqual(result, { defined: true, value: [[2, 4], [3, 5]] });
});

test('softmax normalises a row and a list of rows alike, and always sums to 1', () => {
  const single = DERIVATIONS.softmax.derive([[1, 2, 3]]);
  assert.ok(single.defined);
  assert.equal(round(single.value.reduce((a, b) => a + b, 0)), 1);
  const rows = DERIVATIONS.softmax.derive([[[1, 2, 3], [0, 0, 0]]]);
  assert.ok(rows.defined);
  assert.equal(rows.value.length, 2);
  assert.deepEqual(rows.value[1], [round(1 / 3), round(1 / 3), round(1 / 3)]);
});

test('sum adds a vector and refuses a non-vector', () => {
  assert.deepEqual(DERIVATIONS.sum.derive([[1, 2, 3.5]]), { defined: true, value: 6.5 });
  assert.equal(DERIVATIONS.sum.derive([42]).defined, false);
});

test('weighted_sum combines rows by weight, and refuses a weight/row count mismatch', () => {
  const result = DERIVATIONS.weighted_sum.derive([[0.5, 0.5], [[1, 0, 0], [0, 1, 0]]]);
  assert.deepEqual(result, { defined: true, value: [0.5, 0.5, 0] });
  const bad = DERIVATIONS.weighted_sum.derive([[1, 0], [[1, 2, 3]]]);
  assert.equal(bad.defined, false);
  assert.match(bad.reason, /one weight per row/);
});

test('scale multiplies a vector by a numeric factor', () => {
  assert.deepEqual(DERIVATIONS.scale.derive([[1, -2, 3], 0.5]), { defined: true, value: [0.5, -1, 1.5] });
  assert.equal(DERIVATIONS.scale.derive([[1, 2], 'not a number']).defined, false);
});

test('elementwise multiplies two equal-length vectors position by position', () => {
  assert.deepEqual(DERIVATIONS.elementwise.derive([[2, 3, 4], [1, 0, -1]]), { defined: true, value: [2, 0, -4] });
  assert.equal(DERIVATIONS.elementwise.derive([[1, 2], [1, 2, 3]]).defined, false);
});

test('concat combines named scalars and vectors into one row, in order', () => {
  assert.deepEqual(DERIVATIONS.concat.derive([1, [2, 3], 4]), { defined: true, value: [1, 2, 3, 4] });
  assert.equal(DERIVATIONS.concat.derive([1, 'nope']).defined, false);
});

test('a $derive marker can index a row out of a derived matrix, the same dotted-path convention as an exampleData row', () => {
  const scene = validateScene({
    id: 'row-index', duration: 1,
    exampleData: { Q: [[1, 0], [0, 1]], K: [[1, 0], [0, 1]] },
    derived: { scores: { op: 'matmul', args: ['Q', 'K'] } },
    objects: [{ id: 'row', type: 'strip', initialState: { values: { $derive: 'scores.1' } } }],
    timeline: [],
  });
  assert.deepEqual(scene.objects[0].initialState.values, [0, 1]);
});

test('a derivation may take a literal numeric argument alongside a named path', () => {
  const raw = {
    id: 'literal-arg', duration: 1,
    exampleData: { v: [2, 4, 6] },
    derived: { halved: { op: 'scale', args: ['v', 0.5] } },
    objects: [{ id: 's', type: 'strip', initialState: { values: { $derive: 'halved' } } }],
    timeline: [],
  };
  const scene = validateScene(raw);
  assert.deepEqual(scene.objects[0].initialState.values, [1, 2, 3]);
});

test('a derivation may reference an earlier derivation by name, chained through the same pool', () => {
  const raw = {
    id: 'chain', duration: 1,
    exampleData: { Q: [[1, 0], [0, 1]], K: [[1, 0], [0, 1]], V: [[10, 0], [0, 10]] },
    derived: {
      scores: { op: 'matmul', args: ['Q', 'K'] },
      weights: { op: 'softmax', args: ['scores.0'] },
      output: { op: 'weighted_sum', args: ['weights', 'V'] },
    },
    objects: [{ id: 'out', type: 'strip', initialState: { values: { $derive: 'output' } } }],
    timeline: [],
  };
  const scene = validateScene(raw);
  const out = scene.objects.find(o => o.id === 'out');
  // Q[0]=[1,0] dotted with K rows gives scores.0=[1,0]; softmax of that
  // favours the first row heavily, so the weighted mix of V leans towards V[0].
  assert.ok(out.initialState.values[0] > out.initialState.values[1]);
  assert.equal(out.initialState.provenance, 'derived');
});

test('resolveDerived materialises a $derive reference into a literal number', () => {
  const raw = {
    id: 'x', duration: 1,
    exampleData: { q: [0.9, -0.4, 1.3], k: [0.6, 1.1, -0.7] },
    derived: { qk: { op: 'dot', args: ['q', 'k'] } },
    objects: [{ id: 'eq', type: 'equation', initialState: { text: 'q . k = {{qk}}', w: 100, h: 20 } }],
    timeline: [],
  };
  const scene = validateScene(raw);
  const eq = scene.objects.find(o => o.id === 'eq');
  assert.equal(eq.initialState.text, 'q . k = -0.81');
  assert.equal(eq.initialState.provenance, 'derived', 'using $derive earns the provenance automatically');
});

test('a $derive reference flattens a matmul result into a flat values array', () => {
  const raw = {
    id: 'x', duration: 1,
    exampleData: { q: [[1, 0], [0, 1]], k: [[2, 3], [4, 5]] },
    derived: { scores: { op: 'matmul', args: ['q', 'k'] } },
    objects: [{ id: 'g', type: 'grid', initialState: { rows: 2, cols: 2, matrixKind: 'derived', values: { $derive: 'scores' } } }],
    timeline: [],
  };
  const scene = validateScene(raw);
  assert.deepEqual(getSceneState(scene, 0).objects[0].values, [2, 4, 3, 5]);
});

test('claiming provenance derived without a derive reference is refused', () => {
  assert.throws(() => validateScene({
    id: 'lying', duration: 1,
    objects: [{ id: 'eq', type: 'equation', initialState: { text: 'a . b = 1', w: 10, h: 10, provenance: 'derived' } }],
    timeline: [],
  }), /claims provenance "derived" but authors no derived reference/);
});

test('using a derive reference while declaring a conflicting provenance is refused', () => {
  assert.throws(() => validateScene({
    id: 'conflict', duration: 1,
    exampleData: { a: [1], b: [1] },
    derived: { ab: { op: 'dot', args: ['a', 'b'] } },
    objects: [{ id: 'eq', type: 'equation', initialState: { text: 'a . b = {{ab}}', w: 10, h: 10, provenance: 'illustrative' } }],
    timeline: [],
  }), /uses a derived value but declares provenance "illustrative"/);
});

test('an unknown derive op and a missing derived name both fail loudly', () => {
  assert.throws(() => resolveDerived({
    derived: { x: { op: 'nonsense', args: [] } },
    objects: [], timeline: [],
  }), /unknown op "nonsense"/);
  assert.throws(() => resolveDerived({
    objects: [{ id: 'a', initialState: { text: '{{missing}}' } }], timeline: [],
  }), /"\{\{missing\}\}" names no entry/);
});

test('a defined: false derivation is refused with its reason, not silently NaN', () => {
  assert.throws(() => resolveDerived({
    exampleData: { a: [1, 2], b: [1] },
    derived: { ab: { op: 'dot', args: ['a', 'b'] } },
    objects: [], timeline: [],
  }), /equal-length vectors/);
});
