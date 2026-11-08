import test from 'node:test';
import assert from 'node:assert/strict';
import { centreOf, estimateTextBox, labelAt } from '../scene-layout.js';
import { textStyle } from '../scene-style.js';
import { pipelineLeakageFixture } from './ai-pipeline-leakage-fixture.js';
import { stratifiedFoldsFixture } from './ai-stratified-folds-fixture.js';
import { parseGuestResult, resolveInputs, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { LIMITS } from './limits.js';
import { loadEngine, runProgram } from './runtime.js';

const engine = await loadEngine();

async function fixtureArtifact({ manifest, source, stamps }) {
  const sealed = await sealProgram({ manifest, source }, stamps);
  assert.equal(sealed.ok, true, sealed.issue);
  assert.equal(sealed.value.sdkVersion, 'sdk-2');
  assert.equal(sealed.value.manifest.inputs.length, 1);
  return sealed.value;
}

function draw({ source, sdkVersion, manifest }, inputs) {
  const reply = runProgram(engine, {
    source, sdkVersion, request: { requestId: 'example', inputs: resolveInputs(manifest, inputs), time: 0, seed: 1, state: null },
  }, { ...LIMITS, interruptMs: 5000 });
  assert.equal(reply.ok, true, reply.detail);
  const parsed = parseGuestResult(reply.value, manifest);
  assert.equal(parsed.ok, true, parsed.issue);
  const { frame } = parsed.value;
  assert.ok(frame.objects.length <= 60);
  const view = normalizeFrame(frame, manifest);
  assert.equal(view.ok, true, view.issue);

  // Use the shared Frame's label placement and font estimate for box captions as well as text objects.
  const objects = view.state.objects.filter(object => object.visible);
  const labels = objects.filter(object => object.label).map(object => {
    const position = labelAt(object, { text: object.type === 'text' }, centreOf(object), objects);
    const bounds = estimateTextBox({ text: object.label, fontSize: textStyle('body').fontSize, ...position });
    assert.ok(bounds.xMin >= 0 && bounds.xMax <= frame.width && bounds.yMin >= 0 && bounds.yMax <= frame.height, `${object.id} stays inside the scene`);
    if (object.type === 'box') {
      assert.ok(bounds.xMin >= object.x && bounds.xMax <= object.x + object.w && bounds.yMin >= object.y && bounds.yMax <= object.y + object.h, `${object.id} fits its box`);
    }
    return { id: object.id, ...bounds };
  });
  for (const [i, a] of labels.entries()) {
    for (const b of labels.slice(i + 1)) {
      assert.ok(a.xMax <= b.xMin || b.xMax <= a.xMin || a.yMax <= b.yMin || b.yMax <= a.yMin, `${a.id} overlaps ${b.id}`);
    }
  }
  return new Map(frame.objects.map(object => [object.id, object]));
}

test('stratified folds keep both classes in every test fold of the same dataset', async () => {
  const artifact = await fixtureArtifact(stratifiedFoldsFixture);
  assert.deepEqual(resolveInputs(artifact.manifest), { fold: 1 });
  const [{ type, min, max, step }] = artifact.manifest.inputs;
  assert.deepEqual([type, min, max, step], ['number', 1, 3, 1]);
  const regular = [
    ['A1', 'A2', 'A3', 'A4'], ['A5', 'A6', 'A7', 'A8'], ['A9', 'B1', 'B2', 'B3'],
  ];
  const stratified = [
    ['A1', 'A4', 'A7', 'B1'], ['A2', 'A5', 'A8', 'B2'], ['A3', 'A6', 'A9', 'B3'],
  ];
  const all = regular.flat();
  for (const fold of [1, 2, 3]) {
    const byId = draw(artifact, { fold });
    for (const [strategy, expected] of [['regular', regular], ['stratified', stratified]]) {
      const testSamples = [], trainSamples = [];
      for (const f of [1, 2, 3]) {
        const isTest = f === fold;
        const id = `${strategy}-fold-${f}`;
        assert.match(byId.get(`${id}-role`).text, isTest ? /test/i : /train/i);
        assert.equal(byId.get(`${id}-role`).role, isTest ? 'input' : 'neutral');
        const samples = [...byId.values()].filter(object => object.id.startsWith(`${id}-sample-`)).map(object => object.text);
        assert.deepEqual(samples, expected[f - 1]);
        (isTest ? testSamples : trainSamples).push(...samples);
      }
      assert.deepEqual([...testSamples, ...trainSamples].sort(), all);
      assert.ok(testSamples.every(sample => !trainSamples.includes(sample)));
      const minority = strategy === 'stratified' ? 1 : [0, 0, 3][fold - 1];
      assert.match(byId.get(`${strategy}-test-mix`).text, new RegExp(`${4 - minority} A.*${minority} B`));
      assert.equal(byId.get(`${strategy}-minority`).role === 'warning', minority === 0);
      const status = minority === 0 ? /minority.*missing/i : minority === 1 ? /matches dataset mix/i : /minority.*overrepresented/i;
      assert.match(byId.get(`${strategy}-minority`).text, status);
    }
  }
  assert.deepEqual(draw(artifact, { fold: 1.6 }), draw(artifact, { fold: 2 }), 'saved fractional inputs still select a whole fold');
});

test('including held-out rows in the scaler changes its fit, held-out outputs, and leakage status', async () => {
  const artifact = await fixtureArtifact(pipelineLeakageFixture);
  assert.deepEqual(resolveInputs(artifact.manifest), { fitOn: 'train' });
  const [{ type, options }] = artifact.manifest.inputs;
  assert.equal(type, 'select');
  assert.deepEqual(options.map(({ value }) => value), ['train', 'all']);
  // For [2, 4, 6], variance = 8/3; for [2, 4, 6, 8, 10], variance = 8.
  const cases = [
    { fitOn: 'train', mean: '4.00', std: '1.63', first: '2.45', second: '3.67', leaks: false },
    { fitOn: 'all', mean: '6.00', std: '2.83', first: '0.71', second: '1.41', leaks: true },
  ];
  for (const { fitOn, mean, std, first, second, leaks } of cases) {
    const byId = draw(artifact, { fitOn });
    assert.match(byId.get('fit-mean').text, new RegExp(`mean.*${mean.replace('.', '\\.')}$`, 'i'));
    assert.match(byId.get('fit-std').text, new RegExp(`population.*${std.replace('.', '\\.')}$`, 'i'));
    assert.match(byId.get('scaled-h1').text, new RegExp(`H1.*8.*${first.replace('.', '\\.')}$`));
    assert.match(byId.get('scaled-h2').text, new RegExp(`H2.*10.*${second.replace('.', '\\.')}$`));
    assert.match(byId.get('fit-heading').text, leaks ? /5 rows/ : /3 rows/);
    assert.match(byId.get('held-out-use').text, leaks ? /used in fit/i : /transformed only/i);
    assert.equal(byId.get('leakage-status').role, leaks ? 'warning' : 'success');
    assert.match(byId.get('leakage-status').text, leaks ? /^Leakage.*held-out/i : /^No leakage.*training/i);
    for (const [id, value] of [['t1', 2], ['t2', 4], ['t3', 6], ['h1', 8], ['h2', 10]]) {
      const row = byId.get(`row-${id}`);
      assert.match(row.text, new RegExp(`^${id.toUpperCase()}.*${value}$`));
      assert.equal(row.role, id.startsWith('t') ? 'input' : leaks ? 'warning' : 'observed');
    }
  }
});
