import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGuestResult, resolveInputs, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { textBoxes, textOverlaps } from './frame-overlap.js';
import { LIMITS } from './limits.js';
import { loadEngine, runProgram } from './runtime.js';

const engine = await loadEngine();

async function artifactFor(fixture) {
  const sealed = await sealProgram({ manifest: fixture.manifest, source: fixture.source }, fixture.stamps);
  assert.equal(sealed.ok, true, sealed.issue);
  assert.equal(sealed.value.sdkVersion, 'sdk-2');
  assert.equal(sealed.value.manifest.inputs.length, 1);
  assert.ok(sealed.value.manifest.cardDescription && sealed.value.manifest.instructions);
  return sealed.value;
}

function draw({ manifest, source, sdkVersion }, saved) {
  const inputs = resolveInputs(manifest, saved);
  assert.deepEqual(inputs, saved);
  const request = { requestId: 'bayes-drift', inputs, time: 0, seed: 1, state: null };
  // Allow suite contention without confusing it with a calculation or layout failure.
  const result = runProgram(engine, { source, sdkVersion, request }, { ...LIMITS, interruptMs: 5000 });
  assert.equal(result.ok, true, result.detail);
  const parsed = parseGuestResult(result.value, manifest);
  assert.equal(parsed.ok, true, parsed.issue);
  const { frame } = parsed.value;
  const normalized = normalizeFrame(frame, manifest);
  assert.equal(normalized.ok, true, normalized.issue);
  assert.ok(frame.objects.length <= 60);
  assert.deepEqual(textOverlaps(frame), [], JSON.stringify(inputs));
  for (const { id, box } of textBoxes(frame)) {
    assert.ok(box.xMin >= 0 && box.xMax <= frame.width && box.yMin >= 0 && box.yMax <= frame.height, `${id} must fit in the frame`);
  }
  return { objects: new Map(frame.objects.map(object => [object.id, object])),
    values: new Map(frame.readouts.map(({ id, value }) => [id, value])),
    formatted: new Map(normalized.readouts.map(({ id, text }) => [id, text])) };
}

function near(actual, expected, name) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-10, `${name}: expected ${expected}, got ${actual}`);
}

test('additive smoothing restores the unseen word likelihood and normalizes the two class scores', async () => {
  const { bayesSmoothingFixture } = await import('./ai-bayes-smoothing-fixture.js');
  const artifact = await artifactFor(bayesSmoothingFixture);
  const { manifest } = artifact;
  const [slider] = manifest.inputs;
  assert.equal(slider.type, 'number');
  assert.deepEqual(resolveInputs(manifest), { alpha: 0 });

  // Counts for offer are 3/6 and 0/8, V = 3, and the fixed priors are 2/5 and 3/5.
  // Each row is alpha, likelihoods (Spam / Not spam), evidence, posteriors (Spam / Not spam).
  const cases = [
    [0,   1 / 2,    0,     1 / 5,      1,         0],
    [0.5, 7 / 15,   1 / 19, 311 / 1425, 266 / 311, 45 / 311],
    [1,   4 / 9,    1 / 11, 23 / 99,    88 / 115,  27 / 115],
    [1.5, 3 / 7,    3 / 25, 213 / 875,  50 / 71,   21 / 71],
    [2,   5 / 12,   1 / 7,  53 / 210,   35 / 53,   18 / 53],
  ];
  assert.deepEqual(cases.map(([alpha]) => alpha), Array.from({ length: (slider.max - slider.min) / slider.step + 1 }, (_, i) => slider.min + i * slider.step));
  for (const [alpha, ...expected] of cases) {
    const { objects, values, formatted } = draw(artifact, { alpha });
    for (const [i, name] of ['likelihoodSpam', 'likelihoodNotSpam', 'evidence', 'posteriorSpam', 'posteriorNotSpam'].entries()) {
      near(values.get(name), expected[i], `${name} at α=${alpha}`);
      assert.equal(formatted.get(name), expected[i].toFixed(3));
    }
    const counts = [0, 1].map(row => [0, 1, 2, 3, 4].map(col => objects.get(`counts.r${row}c${col}`)?.text));
    assert.deepEqual(counts, [['3', '1', '2', '6', '40%'], ['0', '5', '3', '8', '60%']]);
    assert.ok(objects.get('evidence')?.text.endsWith(expected[2].toFixed(3)));
    const classes = [['spam', 0.4, expected[0], expected[3]], ['not-spam', 0.6, expected[1], expected[4]]];
    for (const [id, prior, likelihood, probability] of classes) {
      assert.ok(objects.get(`${id}-likelihood`)?.text.endsWith(likelihood === 0 ? ' = 0' : likelihood.toFixed(3)));
      assert.ok(objects.get(`${id}-score`)?.text.endsWith(likelihood === 0 ? ' = 0' : (prior * likelihood).toFixed(3)));
      const track = objects.get(`${id}-posterior-track`);
      const bar = objects.get(`${id}-posterior-bar`);
      near((bar?.w ?? 0) / track?.w, probability, `${id} posterior bar at α=${alpha}`);
      assert.ok(objects.get(`${id}-posterior`)?.text.endsWith(`${(probability * 100).toFixed(1)}%`));
    }
    if (alpha === 0) assert.match(objects.get('not-spam-likelihood')?.text, /0 \/ 8 = 0$/);
    if (alpha === 1) assert.match(objects.get('alpha-state')?.text, /Laplace/);
  }
});

test('comparable windows separate a feature mix change from a conditional label change', async () => {
  const { dataConceptDriftFixture } = await import('./ai-data-concept-drift-fixture.js');
  const artifact = await artifactFor(dataConceptDriftFixture);
  const { manifest } = artifact;
  const [preset] = manifest.inputs;
  assert.equal(preset.type, 'select');
  assert.deepEqual(resolveInputs(manifest), { scenario: 'baseline' });

  // 200 examples in each window. The frozen rule predicts 0 for low and 1 for high.
  // Baseline mistakes: 15 low positives + 15 high negatives = 30.
  const baseline = [75, 25, 10, 70];
  const cases = [
    ['baseline', baseline, 30, 'Unchanged', 'Unchanged'],
    ['data-drift', [25, 75, 10, 70], 50, 'Changed', 'Unchanged'], // 5 + 45
    ['concept-drift', [75, 25, 60, 40], 120, 'Unchanged', 'Changed'], // 90 + 30
  ];
  assert.deepEqual(preset.options.map(({ value }) => value), cases.map(([value]) => value));
  for (const [scenario, recent, mistakes, mixState, rateState] of cases) {
    const { objects, values, formatted } = draw(artifact, { scenario });
    for (const [window, probabilities, wrong] of [['baseline', baseline, 30], ['recent', recent, mistakes]]) {
      assert.match(objects.get(`${window}-heading`)?.text, /200 examples/);
      for (const [i, row] of ['mix-low', 'mix-high', 'label-low', 'label-high'].entries()) {
        const id = `${window}-${row}`;
        assert.equal(objects.get(`${id}-value`)?.text, `${probabilities[i]}%`);
        const track = objects.get(`${id}-track`);
        assert.equal(track?.w, objects.get(`baseline-mix-low-track`)?.w);
        const bar = objects.get(`${id}-bar`);
        near(bar?.w / track?.w, probabilities[i] / 100, `${id} in ${scenario}`);
        assert.equal(bar?.role === 'learner', window === 'recent' && probabilities[i] !== baseline[i]);
      }
      const error = wrong / 2;
      assert.equal(values.get(`${window}Error`), error);
      assert.equal(formatted.get(`${window}Error`), `${error} %`);
      assert.equal(objects.get(`${window}-error`)?.text, `${wrong} / 200 wrong · ${error}%`);
    }
    assert.ok(objects.get('mix-heading')?.text.endsWith(` · ${mixState}`));
    assert.ok(objects.get('rate-heading')?.text.endsWith(` · ${rateState}`));
  }
});
