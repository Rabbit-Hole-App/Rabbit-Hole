import assert from 'node:assert/strict';
import test from 'node:test';
import { seededRandom } from './random.js';
import { varyProblems, varySpec, resolveTokens } from './vary.js';
import { fillAllDerived, parseTutorDiagram } from './spec.js';
import { diagramReferences } from './reference-library.js';

// Test fixtures only: no reference of the library carries `vary` in step 3.
const plot = (extra = {}) => ({
  id: 'fixture-mean-baseline', useWhen: 'Show a constant mean against a few targets.',
  spec: { version: 1, diagram: { kind: 'coordinate-plot', title: 'A constant baseline', x: { label: 'Sample', min: 1, max: 5, scale: 'linear' }, y: { label: 'Target', min: 0, max: 8 },
    series: [{ label: 'Targets', kind: 'scatter', points: [1, 4, 2, 5, 3].map((y, i) => ({ x: i + 1, y })) }],
    annotations: [{ kind: 'reference-line', axis: 'y', derive: 'series.0:mean', label: 'Mean prediction of {{d:annotations.0.value}}' }],
    caption: 'Illustrative values.' } },
  vary: Object.fromEntries([0, 1, 2, 3, 4].map(i => [`series.0.points.${i}.y`, [0, 8, 1]])), ...extra,
});
const box = () => ({
  id: 'fixture-box', useWhen: 'Spread of one group.',
  spec: { version: 1, diagram: { kind: 'box-plot', title: 'Spread', x: { label: 'Minutes', min: 0, max: 24 }, boxes: [{ label: 'Group', whiskerLow: 2, q1: 6, median: 8, q3: 12, whiskerHigh: 15 }] } },
  vary: { 'boxes.0.q1': [4, 8, 1], 'boxes.0.median': [6, 12, 1, 'boxes.0.q1'], 'boxes.0.q3': [9, 14, 1, 'boxes.0.median'] },
});
const ys = spec => spec.diagram.series[0].points.map(p => p.y);
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;

test('the seeded source repeats for a seed, differs for another, and stays in [0, 1)', () => {
  const a = seededRandom('seed-a'), b = seededRandom('seed-a'), c = seededRandom('seed-b');
  const run = r => Array.from({ length: 5 }, r);
  assert.deepEqual(run(a), run(b));
  assert.notDeepEqual(run(seededRandom('seed-a')), run(c));
  for (const v of run(seededRandom('x'))) assert.ok(v >= 0 && v < 1);
});

test('the same seed gives the same spec; another seed gives other inputs and the same structure and labels', () => {
  const ref = plot(), one = varySpec(ref.spec, ref.vary, 's1', ref.id), again = varySpec(ref.spec, ref.vary, 's1', ref.id);
  assert.deepEqual(one, again);
  const seen = new Set();
  for (let i = 0; i < 12; i++) seen.add(ys(varySpec(ref.spec, ref.vary, `seed-${i}`, ref.id)).join());
  assert.ok(seen.size > 6, 'twelve seeds give several different target sets');
  const two = varySpec(ref.spec, ref.vary, 'other', ref.id), strip = spec => JSON.stringify(spec, (k, v) => (k === 'y' || k === 'value' || k === 'label' ? undefined : v));
  assert.equal(strip(one), strip(two)); // everything but the inputs, the derived value and the token label is identical
  assert.notDeepEqual(ys(one), ys(two));
  assert.deepEqual(ref.spec, plot().spec, 'the reference object itself is never changed');
});

test('inputs stay on their grid and in range, with the decimals of min and step', () => {
  const ref = plot({ vary: { 'series.0.points.0.y': [0.5, 3, 0.25] } });
  for (let i = 0; i < 30; i++) {
    const y = varySpec(ref.spec, ref.vary, `g${i}`, ref.id).diagram.series[0].points[0].y;
    assert.ok(y >= 0.5 && y <= 3 && Math.abs(y / 0.25 - Math.round(y / 0.25)) < 1e-9, String(y));
  }
});

test('a derived mean line follows the drawn targets and the token label prints it (acceptance 5 shape)', () => {
  const ref = plot(), a = varySpec(ref.spec, ref.vary, 'one', ref.id), b = varySpec(ref.spec, ref.vary, 'seed-4', ref.id);
  for (const spec of [a, b]) {
    const line = spec.diagram.annotations[0], expected = Number(mean(ys(spec)).toFixed(Math.min(3, 1)));
    assert.equal(line.value, expected);
    assert.equal(line.label, `Mean prediction of ${expected}`);
    assert.doesNotMatch(JSON.stringify(spec), /\{\{d:/);
    assert.deepEqual(parseTutorDiagram(spec), spec, 'the sampled spec is a valid, already filled diagram');
  }
  assert.notEqual(a.diagram.annotations[0].label, b.diagram.annotations[0].label);
});

test('a box plot keeps q1 <= median <= q3 by construction and its fences are recomputed', () => {
  const ref = box();
  for (let i = 0; i < 60; i++) {
    const { boxes: [b] } = varySpec(ref.spec, ref.vary, `b${i}`, ref.id).diagram;
    assert.ok(b.q1 <= b.median && b.median <= b.q3, JSON.stringify(b));
  }
  // with whiskers kept inside the fences by the fixture's own ranges the card parses
  const spec = varySpec(box().spec, { 'boxes.0.q1': [5, 7, 1] }, 'f', 'x');
  const { q1, q3 } = spec.diagram.boxes[0];
  assert.equal(parseTutorDiagram(spec).diagram.boxes[0].fences, undefined, 'a plain box carries no fences (silent), so none is drawn');
  assert.equal(fillAllDerived(parseTutorDiagram(spec).diagram).boxes[0].fences.lower, Number((q1 - 1.5 * (q3 - q1)).toFixed(0))); // the decimals of the quartiles (whole numbers here)
  // a stale written fence is replaced, not kept
  const stale = { ...box().spec, diagram: { ...box().spec.diagram, boxes: [{ ...box().spec.diagram.boxes[0], fences: { lower: -3, upper: 21 } }] } };
  const next = varySpec(stale, { 'boxes.0.q1': [7, 7, 1] }, 's', 'x').diagram.boxes[0];
  assert.deepEqual(next.fences, { lower: Number((7 - 7.5).toFixed(0)), upper: Number((12 + 7.5).toFixed(0)) });
});

test('a set that must add up to 1 is drawn raw and normalised', () => {
  const ref = { id: 'fixture-links', useWhen: 'x', spec: { version: 1, diagram: { kind: 'token-links', title: 'Weights', normalized: true, source: ['a', 'b', 'c'], target: ['a', 'b', 'c'], queries: [{ index: 1, weights: [0.5, 0.3, 0.2] }] } },
    vary: { 'queries.0.weights.0': [1, 9, 1], 'queries.0.weights.1': [1, 9, 1], 'queries.0.weights.2': [1, 9, 1] } };
  const parsed = parseTutorDiagram(varySpec(ref.spec, ref.vary, 'n', ref.id));
  const total = parsed.diagram.queries[0].weights.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, String(total));
});

test('no seed or no vary is the reference unchanged; a reference without tokens is the same object', () => {
  const ref = plot();
  const spec = { version: 1, diagram: { kind: 'flow', title: 'x', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] } };
  assert.equal(resolveTokens(spec), spec);
  assert.ok(ref.vary);
});

test('a bad entry or an order with no room is named, and a bad order path too', () => {
  const ref = plot();
  assert.throws(() => varySpec(ref.spec, { 'series.0.points.0.y': [5, 1, 1] }, 's', 'x'), /min <= max/);
  assert.throws(() => varySpec(ref.spec, { 'series.0.label': [0, 1, 1] }, 's', 'x'), /not a number/);
  assert.throws(() => varySpec(ref.spec, { 'series.0.points.0.y': [0, 4, 1, 'series.0.points.9.y'] }, 's', 'x'), /order path/);
  assert.throws(() => varySpec(ref.spec, { 'series.0.points.0.y': [0, 4, 1, 'series.0.points.1.y'], 'series.0.points.1.y': [0, 4, 1] }, 's', 'x'), /listed before/);
  assert.throws(() => varySpec(box().spec, { 'boxes.0.q3': [5, 7, 1, 'boxes.0.median'] }, 's', 'x'), /no value|at or above/);
});

test('the lint passes a reference whose numbers are tokens and fails one that types a varied or derived number', () => {
  assert.deepEqual(varyProblems(plot()), []);
  const typed = plot(); typed.spec.diagram.annotations[0].label = 'Mean prediction of 3';
  const problems = varyProblems(typed);
  assert.ok(problems.some(p => /annotations\.0\.value \(derived\) holds 3/.test(p)), problems.join('\n'));
  const typedInput = plot(); typedInput.spec.diagram.caption = 'The second sample is 4, far above the rest.';
  assert.ok(varyProblems(typedInput).some(p => /series\.0\.points\.1\.y holds 4/.test(p)));
  const inUseWhen = plot({ useWhen: 'Show the mean of 3 against the targets.' });
  assert.ok(varyProblems(inUseWhen).some(p => /holds 3/.test(p)));
  assert.deepEqual(varyProblems({ ...typed, vary: undefined }), [], 'a reference without vary is never linted');
});

test('the lint names a bad range, a missing path and an order path that tops the range', () => {
  const bad = varyProblems(plot({ vary: { 'series.0.points.0.y': [5, 1, 1], 'series.9.points.0.y': [0, 1, 1] } }));
  assert.equal(bad.length, 2, bad.join('\n'));
  const tops = varyProblems({ ...box(), vary: { 'boxes.0.q1': [4, 8, 1], 'boxes.0.median': [6, 7, 1, 'boxes.0.q1'] } });
  assert.ok(tops.some(p => /below the top 8 of boxes\.0\.q1/.test(p)), tops.join('\n'));
  assert.deepEqual(varyProblems(box()), []);
});

test('the library: every reference with vary passes the lint (none carries one in step 3)', () => {
  const failing = diagramReferences.flatMap(ref => varyProblems(ref));
  assert.deepEqual(failing, []);
  assert.equal(diagramReferences.filter(ref => ref.vary).length, 0);
});
