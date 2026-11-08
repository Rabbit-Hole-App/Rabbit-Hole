import test from 'node:test';
import assert from 'node:assert/strict';
import { anomalyIsolationFixture } from './ai-anomaly-isolation-fixture.js';
import { boostingFixture } from './ai-boosting-fixture.js';
import { parseGuestResult, resolveInputs, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { textOverlaps } from './frame-overlap.js';
import { LIMITS } from './limits.js';
import { loadEngine, runProgram } from './runtime.js';

async function frameAt(fixture, control, lastStep) {
  const { manifest, source, stamps } = fixture;
  const sealed = await sealProgram({ manifest, source }, stamps);
  assert.equal(sealed.ok, true, sealed.issue);
  const artifact = sealed.value;
  assert.equal(artifact.sdkVersion, 'sdk-2');
  assert.equal(artifact.manifest.inputs.length, 1);
  const [slider] = artifact.manifest.inputs;
  assert.deepEqual([slider.id, slider.min, slider.max, slider.step], [control, 0, lastStep, 1]);
  assert.deepEqual(resolveInputs(artifact.manifest), { [control]: 0 });
  const engine = await loadEngine();

  return step => {
    const request = { requestId: `${fixture.id}-${step}`, inputs: resolveInputs(artifact.manifest, { [control]: step }), time: 0, seed: 1, state: null };
    // Check rendered behavior independently of CPU contention during the full unit suite.
    const reply = runProgram(engine, { source: artifact.source, sdkVersion: artifact.sdkVersion, request }, { ...LIMITS, interruptMs: 5000 });
    assert.equal(reply.ok, true, reply.detail);
    const parsed = parseGuestResult(reply.value, artifact.manifest);
    assert.equal(parsed.ok, true, parsed.issue);
    const { frame } = parsed.value;
    const normalized = normalizeFrame(frame, artifact.manifest);
    assert.equal(normalized.ok, true, normalized.issue);
    assert.ok(frame.objects.length <= 60);
    assert.deepEqual(textOverlaps(frame), [], `${fixture.id} step ${step} keeps text readable`);
    return Object.fromEntries(frame.objects.map(object => [object.id, object]));
  };
}

test('the same valid isolation splits put E alone after one split and B alone after three', async () => {
  const draw = await frameAt(anomalyIsolationFixture, 'depth', 3);
  // For x = 1, 2, 3, 4, 9, the root cut at 6 sends E right. Cuts at
  // 2.5 and 1.5 then send B left and right respectively; C and D split at 3.5.
  const cases = [
    { typical: 'A, B, C, D, E at depth 0', outlier: 'A, B, C, D, E at depth 0', b: [], e: [], cuts: [] },
    { typical: 'A, B, C, D at depth 1', outlier: 'Alone at depth 1', b: ['root:left'], e: ['root:E'], cuts: [6] },
    { typical: 'A, B at depth 2', outlier: 'Alone at depth 1', b: ['root:left', 'left:low'], e: ['root:E'], cuts: [2.5, 6] },
    { typical: 'Alone at depth 3', outlier: 'Alone at depth 1', b: ['root:left', 'left:low', 'low:B'], e: ['root:E'], cuts: [1.5, 2.5, 3.5, 6] },
  ];

  for (const [step, expected] of cases.entries()) {
    const objects = draw(step);
    assert.equal(objects['typical-path'].text, `B · ${expected.typical}`);
    assert.equal(objects['outlier-path'].text, `E · ${expected.outlier}`);
    const arrows = Object.values(objects).filter(object => object.kind === 'arrow');
    for (const [role, edges] of [['learner', expected.b], ['warning', expected.e]]) {
      assert.deepEqual(arrows.filter(arrow => arrow.role === role).map(arrow => arrow.id).sort(), edges.map(edge => `tree.e.${edge}.a`).sort());
    }
    const axis = objects.axis;
    const valueAt = px => (px - axis.from.x) / (axis.to.x - axis.from.x) * 10;
    const observedCuts = Object.values(objects).filter(object => object.id.startsWith('cut-')).map(object => valueAt(object.from.x)).sort((a, b) => a - b);
    assert.deepEqual(observedCuts, expected.cuts);
    assert.deepEqual([...'ABCDE'].map(id => valueAt(objects[`point-${id}`].x)), [1, 2, 3, 4, 9]);
  }
  assert.deepEqual(draw(2.6), draw(3), 'fractional saved depth resolves to the nearest whole split');
});

test('AdaBoost reuses the previous normalized weights and emphasizes each round’s actual miss', async () => {
  const draw = await frameAt(boostingFixture, 'step', 2);
  const labels = ['−', '−', '+', '−', '+', '+'];
  // Misses and weights by hand: D weighs 1/6 in round 1, C weighs 1/10 in
  // round 2. After each update the mistake has half the mass; the examples
  // the stump got right share the other half in their previous proportions.
  const equal = Array(6).fill(1 / 6);
  const afterFirst = [1 / 10, 1 / 10, 1 / 10, 1 / 2, 1 / 10, 1 / 10];
  const afterSecond = [1 / 18, 1 / 18, 1 / 2, 5 / 18, 1 / 18, 1 / 18];
  const cases = [
    { before: equal },
    { before: equal, after: afterFirst, guesses: ['−', '−', '+', '+', '+', '+'], miss: 'D', error: 1 / 6, threshold: 2.5, alpha: Math.log(5) / 2 },
    { before: afterFirst, after: afterSecond, guesses: ['−', '−', '−', '−', '+', '+'], miss: 'C', error: 1 / 10, threshold: 4.5, alpha: Math.log(9) / 2 },
  ];
  const percentage = weight => `${(100 * weight).toFixed(1)}%`;
  const ids = [...'ABCDEF'];
  for (const [step, expected] of cases.entries()) {
    const objects = draw(step);
    assert.deepEqual(ids.map(id => objects[`label-${id}`].text.at(-1)), labels);
    assert.deepEqual(ids.filter(id => objects[`prediction-${id}`]?.role === 'warning'), expected.miss ? [expected.miss] : []);
    for (const column of ['before', 'after']) {
      if (!expected[column]) {
        assert.ok(ids.every(id => !objects[`weight-${id}-${column}`]));
        continue;
      }
      const rendered = ids.map((id, index) => {
        const bar = objects[`weight-${id}-${column}`];
        const fullScale = objects[`track-${id}-${column}`].w;
        const weight = bar.w / fullScale / 2; // The common bar scale ends at 50%.
        assert.ok(Math.abs(weight - expected[column][index]) < 1e-12, `${step}: ${id} ${column}`);
        assert.equal(objects[`value-${id}-${column}`].text, percentage(expected[column][index]));
        assert.equal(bar.role === 'warning', column === 'after' && id === expected.miss);
        return weight;
      });
      assert.ok(Math.abs(rendered.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
    }
    if (!step) continue;
    assert.deepEqual(ids.map(id => objects[`prediction-${id}`].text[0]), expected.guesses);
    assert.match(objects.rule.text, new RegExp(`≥ ${expected.threshold}`));
    assert.ok(objects.error.text.includes(percentage(expected.error)));
    assert.ok(objects.error.text.includes(expected.alpha.toFixed(3)));
  }
  assert.deepEqual(draw(1.2), draw(1), 'fractional saved step resolves to the nearest whole round');
});
