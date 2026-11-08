import test from 'node:test';
import assert from 'node:assert/strict';
import { featureEliminationFixture } from './ai-feature-elimination-fixture.js';
import { hyperparameterSearchFixture } from './ai-hyperparameter-search-fixture.js';
import { parseGuestResult, resolveInputs, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { textOverlaps } from './frame-overlap.js';
import { LIMITS } from './limits.js';
import { loadEngine, runProgram } from './runtime.js';

async function fixtureFrames(fixture, initialStep, lastStep, otherSteps) {
  const sealed = await sealProgram({ manifest: fixture.manifest, source: fixture.source }, fixture.stamps);
  assert.equal(sealed.ok, true, sealed.issue);
  const { manifest, source, sdkVersion } = sealed.value;
  assert.equal(sdkVersion, 'sdk-2');
  assert.equal(manifest.inputs.length, 1);
  const [{ id, type, min, max, step }] = manifest.inputs;
  assert.deepEqual([type, min, max, step], ['number', initialStep, lastStep, 1]);
  assert.deepEqual(resolveInputs(manifest), { [id]: initialStep });
  const engine = await loadEngine();

  const steps = Array.from({ length: lastStep - initialStep + 1 }, (_, i) => initialStep + i);
  return [...steps, ...otherSteps].map(stage => {
    const request = { requestId: `${fixture.id}-${stage}`, inputs: resolveInputs(manifest, { [id]: stage }), time: 0, seed: 1, state: null };
    // Like the other fixture tests, verify the frame independently of CPU contention in the full suite.
    const reply = runProgram(engine, { source, sdkVersion, request }, { ...LIMITS, interruptMs: 5000 });
    assert.equal(reply.ok, true, reply.detail);
    const parsed = parseGuestResult(reply.value, manifest);
    assert.equal(parsed.ok, true, parsed.issue);
    const { frame } = parsed.value;
    const normalized = normalizeFrame(frame, manifest);
    assert.equal(normalized.ok, true, normalized.issue);
    assert.ok(frame.objects.length <= 60, `step ${stage} should fit the scene budget`);
    assert.deepEqual(textOverlaps(frame), [], `step ${stage} should keep scene text readable`);
    return {
      scene: normalized.scene.objects,
      byId: new Map(normalized.scene.objects.map(object => [object.id, object.initialState])),
      readouts: frame.readouts.map(({ id: readout, value }) => [readout, value]),
    };
  });
}

test('search reveals validation trials in order, then measures only the validation winner on holdout', async () => {
  const frames = await fixtureFrames(hyperparameterSearchFixture, 1, 5, [4.4, 4.6]);
  assert.deepEqual(frames.slice(5), [frames[3], frames[4]], 'saved fractional values snap to a whole step');
  const penalties = [0, 10, 30, 6];
  // The fitted slopes are 2, 1, 1/2, and 5/4. The validation target has slope 5/4
  // plus orthogonal residuals of ±1/4; the validation mean of x² is 13/4.
  const validation = [1.890625, 0.265625, 1.890625, 0.0625];
  const best = [0, 10, 10, 6, 6];
  const barScale = frames[0].byId.get('trial-bar-0').w / validation[0];
  for (const [i, { scene, byId, readouts }] of frames.slice(0, 5).entries()) {
    const visible = Math.min(i + 1, penalties.length);
    const expected = penalties.slice(0, visible).map((penalty, j) => [`validation_${penalty}`, validation[j]]);
    // Holdout y=x would favor λ=10. The selected λ=6 has mean squared error 45/128.
    if (i === 4) expected.push(['holdout', 45 / 128]);
    assert.deepEqual(readouts, expected);
    assert.deepEqual(scene.filter(object => object.id.startsWith('trial-bar-')).map(object => object.id),
      penalties.slice(0, visible).map(penalty => `trial-bar-${penalty}`));
    assert.deepEqual(scene.filter(object => object.id.startsWith('trial-bar-') && object.initialState.role === 'learner').map(object => object.id),
      [`trial-bar-${best[i]}`]);
    for (const [j, penalty] of penalties.entries()) {
      assert.equal(byId.get(`trial-score-${penalty}`)?.label, j < visible ? validation[j].toFixed(4) : 'Pending');
      if (j < visible) assert.ok(Math.abs(byId.get(`trial-bar-${penalty}`).w - barScale * validation[j]) < 1e-9);
    }
    assert.equal(byId.get('selection')?.label, (i === 4 ? 'Selected' : 'Best so far') + ` · λ = ${best[i]}`);
    assert.equal(byId.get('holdout')?.label, i === 4 ? 'Holdout MSE · 0.3516' : 'Holdout opens after selection');
  }
});

test('elimination breaks the weak-feature tie, refits, and scores the same held-out rows', async () => {
  const frames = await fixtureFrames(featureEliminationFixture, 0, 3, [0.4, 0.6]);
  assert.deepEqual(frames.slice(4), [frames[0], frames[1]], 'saved fractional values snap to a whole step');
  // The training columns have variance 1 and B/C covariance 1/2. Removing C transfers 1/4 to B.
  // On the held-out rows, the residual vectors give exact MSEs 19/64, 1/64, 17/64, and 49/32.
  const cases = [
    { ranks: [['A', 1.125], ['B', 1], ['D', 0.5], ['C', 0.5]], removed: 'None', next: 'C', loss: 19 / 64 },
    { ranks: [['B', 1.25], ['A', 1.125], ['D', 0.5]], removed: 'C', next: 'D', loss: 1 / 64 },
    { ranks: [['B', 1.25], ['A', 1.125]], removed: 'C, D', next: 'A', loss: 17 / 64 },
    { ranks: [['B', 1.25]], removed: 'C, D, A', next: null, loss: 49 / 32 },
  ];
  const barScale = frames[0].byId.get('feature-bar-A').w / 1.125;
  for (const [i, { scene, byId, readouts }] of frames.slice(0, 4).entries()) {
    const { ranks, removed, next, loss } = cases[i];
    assert.deepEqual(scene.filter(object => object.id.startsWith('feature-rank-')).map(object => object.initialState.label),
      ranks.map(([name], index) => `${index + 1} · Feature ${name}`));
    assert.deepEqual(scene.filter(object => object.id.startsWith('feature-bar-')).map(object => object.id),
      ranks.map(([name]) => `feature-bar-${name}`));
    assert.deepEqual(scene.filter(object => object.id.startsWith('feature-bar-') && object.initialState.role === 'warning').map(object => object.id),
      next === null ? [] : [`feature-bar-${next}`]);
    for (const [name, coefficient] of ranks) {
      assert.equal(byId.get(`feature-score-${name}`)?.label, coefficient.toFixed(3));
      assert.ok(Math.abs(byId.get(`feature-bar-${name}`).w - barScale * coefficient) < 1e-9);
    }
    assert.equal(byId.get('removed')?.label, `Removed · ${removed}`);
    assert.equal(byId.get('held-out')?.label, `Held-out MSE · ${loss.toFixed(4)}`);
    assert.deepEqual(readouts, [['holdout', loss]]);
  }
});
