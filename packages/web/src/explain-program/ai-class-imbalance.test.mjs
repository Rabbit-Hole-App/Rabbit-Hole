import test from 'node:test';
import assert from 'node:assert/strict';
import { classImbalanceFixture } from './ai-class-imbalance-fixture.js';
import { parseGuestResult, resolveInputs, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { textOverlaps } from './frame-overlap.js';
import { LIMITS } from './limits.js';
import { loadEngine, runProgram } from './runtime.js';

test('prevalence changes precision at fixed recall and false-positive rate', async () => {
  const { manifest, source, stamps } = classImbalanceFixture;
  const sealed = await sealProgram({ manifest, source }, stamps);
  assert.equal(sealed.ok, true, sealed.issue);
  const artifact = sealed.value;
  const engine = await loadEngine();
  assert.deepEqual(resolveInputs(artifact.manifest), { prevalence: 10 });

  let previousPrecision = 0;
  for (let prevalence = 1; prevalence <= 50; prevalence++) {
    const inputs = resolveInputs(artifact.manifest, { prevalence });
    const result = runProgram(engine, {
      source: artifact.source, sdkVersion: artifact.sdkVersion,
      request: { requestId: 'imbalance', inputs, time: 0, seed: 1, state: null },
    }, { ...LIMITS, interruptMs: 5000 });
    assert.equal(result.ok, true, result.detail);
    const parsed = parseGuestResult(result.value, artifact.manifest);
    assert.equal(parsed.ok, true, parsed.issue);
    const { frame } = parsed.value;
    assert.equal(normalizeFrame(frame, artifact.manifest).ok, true);
    assert.deepEqual(textOverlaps(frame), []);
    const byId = new Map(frame.objects.map(object => [object.id, object.text]));
    const [tp, fn, fp, tn] = ['tp', 'fn', 'fp', 'tn'].map(id => Number(byId.get(id)));
    assert.equal(tp + fn + fp + tn, 1000);
    assert.equal(tp + fn, 10 * prevalence);
    assert.equal(tp / (tp + fn), 0.8);
    assert.equal(fp / (fp + tn), 0.1);
    const precision = 100 * tp / (tp + fp);
    assert.ok(precision > previousPrecision);
    previousPrecision = precision;
    assert.equal(byId.get('precision'), 'Precision: ' + precision.toFixed(1) + ' %');
    assert.equal(byId.get('recall'), 'Recall: 80.0 %');
    assert.equal(byId.get('accuracy'), 'Accuracy: ' + ((tp + tn) / 10).toFixed(1) + ' %');
    if (prevalence === 1) assert.deepEqual([tp, fn, fp, tn], [8, 2, 99, 891]);
    if (prevalence === 50) assert.deepEqual([tp, fn, fp, tn], [400, 100, 50, 450]);
  }
});
