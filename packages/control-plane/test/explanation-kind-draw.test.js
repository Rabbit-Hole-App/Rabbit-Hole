import test from 'node:test';
import assert from 'node:assert/strict';
import { drawKind, KIND_FLOOR } from '../src/explanation-kind-draw.js';

const P = { flow: 0.5, tree: 0.3, cycle: 0.15, timeline: 0.05 };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('GEN-1 G4: the same seed draws the same kind and weights; no seed, no usable probabilities, a learner-named kind, a picture plan and two visuals are not drawn (null)', () => {
  const a = drawKind(P, { seed: 'request-1' }), b = drawKind(P, { seed: 'request-1' });
  assert.deepEqual(a, b);
  assert.ok(Object.keys(P).includes(a.drawn));
  assert.equal(drawKind(P, {}), null, 'no seed, no draw');
  assert.equal(drawKind(null, { seed: 's' }), null);
  assert.equal(drawKind({}, { seed: 's' }), null);
  assert.equal(drawKind({ flow: 0, tree: Number.NaN }, { seed: 's' }), null);
  assert.equal(drawKind(P, { seed: 's', requiredKinds: ['tree'] }), null, 'a learner-named kind is never drawn');
  assert.equal(drawKind(P, { seed: 's', visuals: [{ type: 'picture' }] }), null, 'a picture plan');
  assert.equal(drawKind(P, { seed: 's', visuals: [{ type: 'diagram', kind: 'flow' }, { type: 'diagram', kind: 'tree' }] }), null, 'two visuals');
  assert.ok(drawKind(P, { seed: 's', visuals: [{ type: 'diagram', choose: ['flow', 'tree'] }] }), 'one diagram visual is drawn');
});

test('GEN-1 G4: renormalised weights, the 0.2 floor drops a kind and the draw uses the weights as they stand', () => {
  const r = drawKind(P, { seed: 'request-1' });
  assert.deepEqual(Object.keys(r.weights).sort(), ['flow', 'tree'], 'cycle 0.15 and timeline 0.05 are under the floor');
  assert.ok(close(r.weights.flow, 0.5) && close(r.weights.tree, 0.3));
  assert.ok(Object.values(r.weights).every(w => w >= KIND_FLOOR));
  const flat = drawKind({ a: 1 / 6, b: 1 / 6, c: 1 / 6, d: 1 / 6, e: 1 / 6, f: 1 / 6 }, { seed: 'request-1' });
  assert.equal(Object.keys(flat.weights).length, 1, 'none over the floor: the top one is kept');
  assert.equal(flat.drawn, 'a', 'ties go to the first name, so the draw is deterministic');
});

test('GEN-1 G4: an on-topic reference adds 0.5 to its kind (1.0 more at an exact documented prompt), also for a kind the planner gave no probability', () => {
  const plain = { flow: 0.5, tree: 0.5 };
  const near = drawKind(plain, { seed: 'x', onTopicKind: 'tree' }).weights;
  assert.ok(close(near.tree, 1 / 1.5) && close(near.flow, 0.5 / 1.5));
  const exact = drawKind(plain, { seed: 'x', onTopicKind: 'tree', exact: true }).weights;
  assert.ok(close(exact.tree, 2 / 2.5) && close(exact.flow, 0.5 / 2.5));
  const absent = drawKind({ flow: 1 }, { seed: 'x', onTopicKind: 'heatmap' }).weights;
  assert.ok(close(absent.heatmap, 0.5 / 1.5) && close(absent.flow, 1 / 1.5));
});

test('GEN-1 G4: Brief keeps its exclusions (a plot kind is never drawn at Brief, and an on-topic plot reference adds nothing there)', () => {
  const probs = { 'coordinate-plot': 0.6, flow: 0.25, tree: 0.15 };
  for (let i = 0; i < 300; i++) {
    const r = drawKind(probs, { seed: `s${i}`, depth: 'brief', onTopicKind: 'bar-chart' });
    assert.ok(!['coordinate-plot', 'bar-chart'].includes(r.drawn), r.drawn);
    assert.deepEqual(Object.keys(r.weights).sort(), ['flow', 'tree']);
  }
  assert.ok(Object.hasOwn(drawKind(probs, { seed: 's1', depth: 'balanced' }).weights, 'coordinate-plot'), 'the same map at Balanced keeps it');
  assert.equal(drawKind({ 'coordinate-plot': 1 }, { seed: 's', depth: 'brief' }), null, 'nothing left at Brief: today\'s planning (the planner replaces the plot with a flow)');
});

test('GEN-1 G4: over many seeds the drawn kinds approach the weights', () => {
  const N = 4000, count = {};
  for (let i = 0; i < N; i++) { const { drawn } = drawKind({ flow: 0.5, tree: 0.3, cycle: 0.2 }, { seed: `request-${i}` }); count[drawn] = (count[drawn] ?? 0) + 1; }
  for (const [kind, want] of [['flow', 0.5], ['tree', 0.3], ['cycle', 0.2]]) assert.ok(Math.abs(count[kind] / N - want) < 0.03, `${kind}: ${count[kind] / N} against ${want}`);
  const boosted = {};
  for (let i = 0; i < N; i++) { const { drawn } = drawKind({ flow: 0.7, tree: 0.3 }, { seed: `request-${i}`, onTopicKind: 'tree', exact: true }); boosted[drawn] = (boosted[drawn] ?? 0) + 1; }
  assert.ok(Math.abs(boosted.tree / N - 1.8 / 2.5) < 0.03, `exact on-topic tree: ${boosted.tree / N}`);
});
