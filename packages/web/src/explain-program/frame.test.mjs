import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFrame } from './frame.js';
import { parseManifest, resolveInputs } from './contract.js';
import { SDK_SOURCE, sdkFingerprint } from './sdk.js';
import { getSceneState, validateScene } from '../animation-scene.js';
import { causalAttentionScene } from '../reference-scenes.js';
import { transformerBlockScene, vlmScene, worldModelScene, codebaseOrientationScene } from '../gallery-scenes.js';
import { axisScene, residualScene, sigmoidScene } from '../demo-scenes.js';
import { FIXTURES, growthFixture, searchFixture } from './fixtures.js';

// Trusted hand-authored fixtures only: evaluated natively here because no host exists in this file. Generated or hostile source
// never runs this way (plan section 9); that belongs to the isolated interpreter.
function runFixture(fixture, request) {
  const run = new Function(`${SDK_SOURCE}\n${fixture.source.replace('export function evaluate', 'function evaluate')}\nreturn evaluate;`)();
  const manifest = parseManifest(fixture.manifest).value;
  return run({ inputs: resolveInputs(manifest, request.inputs), time: request.time, seed: 1, state: null });
}

test('both fixture manifests satisfy the contract', () => {
  for (const fixture of FIXTURES) assert.equal(parseManifest(fixture.manifest).ok, true, fixture.id);
});

test('two unrelated fixtures render through one contract, at every sampled request', () => {
  for (const fixture of FIXTURES) {
    const manifest = parseManifest(fixture.manifest).value;
    for (const request of fixture.requests) {
      const result = normalizeFrame(runFixture(fixture, request).frame, manifest);
      assert.equal(result.ok, true, `${fixture.id}: ${result.issue}`);
      assert.ok(result.state.objects.length > 0);
      assert.equal(result.readouts.length, 1);
    }
  }
});

test('the polyline carries its points, clip and a bounding box; point count follows the program', () => {
  const manifest = parseManifest(growthFixture.manifest).value;
  const at = request => normalizeFrame(runFixture(growthFixture, request).frame, manifest).state.objects.find(object => object.id === 'balance-curve');
  const curve = at({ inputs: {}, time: 4 });
  assert.equal(curve.type, 'polyline');
  assert.equal(curve.points.length, 61);
  assert.deepEqual(curve.clip, { x: 80, y: 60, w: 800, h: 380 });
  assert.ok(curve.w > 1 && curve.h > 1);
  assert.ok(curve.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  // A different input moves the geometry; the contract and renderer inputs are the same shape.
  assert.notDeepEqual(at({ inputs: { rate: 15, mode: 'simple' }, time: 4 }).points, curve.points);
});

test('the math run keeps the hardened path and the readout is formatted from the manifest', () => {
  const manifest = parseManifest(growthFixture.manifest).value;
  const result = normalizeFrame(runFixture(growthFixture, { inputs: {}, time: 4 }).frame, manifest);
  const formula = result.state.objects.find(object => object.id === 'formula');
  assert.deepEqual(formula.runs, [{ kind: 'math', tex: 'B = 1000(1+r)^t' }]);
  assert.equal(formula.type, 'text');
  assert.deepEqual(result.readouts, [{ id: 'balance', label: 'Balance', text: '1629' }]);
  const search = normalizeFrame(runFixture(searchFixture, { inputs: { target: 11 }, time: 4 }).frame, parseManifest(searchFixture.manifest).value);
  assert.equal(search.state.objects.find(object => object.id === 'cell-11').role, 'success');
});

test('invalid frames are refused: untrusted math, undeclared readout, unknown key', () => {
  const manifest = parseManifest(growthFixture.manifest).value;
  const one = (object, extra = {}) => ({ objects: [object], ...extra });
  const text = { kind: 'text', id: 't', x: 0, y: 0, runs: [{ kind: 'math', tex: '\\href{https://example.com}{x}' }] };
  const bad = normalizeFrame(one(text));
  assert.equal(bad.ok, false, 'an untrusted KaTeX command is refused by the scene gate');
  assert.equal(bad.error.code, 'invalid_output');
  assert.equal(normalizeFrame(one({ kind: 'box', id: 'b', x: 0, y: 0, w: 5, h: 5 }, { readouts: [{ id: 'nope', value: 1 }] }), manifest).ok, false);
  assert.equal(normalizeFrame(one({ kind: 'box', id: 'b', x: 0, y: 0, w: 5, h: 5, html: '<b>' })).ok, false);
});

test('the SDK exposes only generic helpers and has a stable fingerprint', async () => {
  const sdk = new Function(`${SDK_SOURCE}\nreturn sdk;`)();
  assert.deepEqual(Object.keys(sdk).sort(), ['arrow', 'box', 'circle', 'clamp', 'format', 'frame', 'lerp', 'line', 'linear', 'math', 'polyline', 'sample', 'text']);
  assert.equal(sdk.linear([0, 0], [5, 9])(3), 5);
  assert.equal(sdk.sample(x => x * 2, 0, 1, 4).length, 5);
  assert.equal(await sdkFingerprint(), await sdkFingerprint());
});

test('old scenes are untouched by the polyline addition: no new keys on their evaluated objects, none of them a polyline', () => {
  const keys = new Set();
  for (const scene of [causalAttentionScene, transformerBlockScene, vlmScene, worldModelScene, codebaseOrientationScene, axisScene, residualScene, sigmoidScene]) {
    const state = getSceneState(validateScene(scene), 0);
    for (const object of state.objects) { assert.notEqual(object.type, 'polyline'); Object.keys(object).forEach(key => keys.add(key)); }
  }
  assert.equal(keys.has('points'), false);
  assert.equal(keys.has('clip'), false);
});
