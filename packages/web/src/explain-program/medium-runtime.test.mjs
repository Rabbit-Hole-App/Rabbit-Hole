import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { CONTRACT_LIMITS, parseFrame, parseGuestResult, resolveInputs, verifyHashes } from './contract.js';
import { normalizeFrame } from './frame.js';
import { MEDIUM_FIXTURES } from './medium-fixtures.js';
import { programStateFor, resetProgram, resolveProgram } from './program-card.js';
import { loadEngine, runProgram as runWithDefaultLimits } from './runtime.js';
import { programSdkSource } from './sdk.js';
import { MEDIUM_CAPABILITY, MEDIUM_PROGRAM_STAMPS, PROGRAM_STAMPS, VISUAL_PROGRAM_STAMPS } from './stamps.js';
import { LIMITS as DEFAULT_LIMITS } from './limits.js';
// These tests check numbers, not the evaluation deadline: a loaded machine can pass the default 50 ms (genuine-card.test.mjs does the same).
const runProgram = (engine, input) => runWithDefaultLimits(engine, input, { ...DEFAULT_LIMITS, interruptMs: 5000 });

const engine = await loadEngine();
const base = { requestId: 'fixture', time: 0, seed: 1, state: null };
function run(artifact, operation, request) {
  const out = runProgram(engine, { source: artifact.source, sdkVersion: artifact.sdkVersion, operation, request: { ...base, ...request } });
  assert.equal(out.ok, true, `${artifact.manifest.title} ${operation}: ${out.detail}`);
  return out.value;
}

test('the Medium SDK is opt-in and older saved source keeps its pinned hash', async () => {
  for (const stamps of [VISUAL_PROGRAM_STAMPS, MEDIUM_PROGRAM_STAMPS]) {
    assert.equal(createHash('sha256').update(programSdkSource(stamps.sdkVersion)).digest('hex'), stamps.fingerprints.sdk);
  }
  const { manifest, source } = MEDIUM_FIXTURES[1];
  const legacy = await buildProgramArtifact({ manifest: { ...manifest, capabilities: [] }, source });
  assert.equal(legacy.sdkVersion, VISUAL_PROGRAM_STAMPS.sdkVersion);
  await assert.rejects(buildProgramArtifact({ manifest, source }, VISUAL_PROGRAM_STAMPS), { code: 'invalid_program' });
});

for (const { id, manifest, source } of MEDIUM_FIXTURES) {
  test(`${id} seals, reopens and renders with the existing card contract`, async () => {
    const artifact = await buildProgramArtifact({ manifest, source });
    assert.equal(artifact.sdkVersion, MEDIUM_PROGRAM_STAMPS.sdkVersion);
    assert.equal(await verifyHashes(artifact), true);
    const block = { id: 'card', type: 'animation', program: { fixtureId: id } };
    const resolved = await resolveProgram(block, { fixtures: true, stamps: PROGRAM_STAMPS });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.artifact.bundleHash, artifact.bundleHash);

    const evaluate = request => {
      const reply = parseGuestResult(run(artifact, 'evaluate', request), artifact.manifest);
      assert.equal(reply.ok, true, reply.issue);
      const view = normalizeFrame(reply.value.frame, artifact.manifest);
      assert.equal(view.ok, true, view.issue);
      return view.state.objects;
    };
    const inputs = resolveInputs(manifest);
    if (!manifest.viewport) {
      const before = evaluate({ inputs });
      const input = manifest.inputs[0];
      for (const option of input.options.slice(1)) {
        const saved = { ...block, inputs: { [input.id]: option.value } };
        assert.notDeepEqual(evaluate({ inputs: resolveInputs(manifest, saved.inputs) }), before);
      }
      return;
    }
    const initial = run(artifact, 'initialize', { inputs });
    const first = evaluate({ inputs, state: initial });
    const state = run(artifact, 'reduce', { inputs, state: initial, event: { type: 'select', target: manifest.targets[0].id } });
    const saved = { ...block, programState: { bundleHash: artifact.bundleHash, state, revision: 1, seed: 1, inputs } };
    const restored = programStateFor(saved, resolved.artifact);
    assert.deepEqual(restored.state, state);
    const next = evaluate({ inputs: restored.inputs, state: restored.state, time: manifest.duration ?? 0 });
    assert.notDeepEqual(next, first);
    if (id.endsWith('image-views')) {
      const details = next.filter(item => item.type === 'image' && item.crop);
      assert.equal(details.length, 2);
      assert.deepEqual(details[0].crop, details[1].crop);
      assert.equal(details[0].src, '/lesson-assets/vlm-patch-source.jpg');
    }
  });
}

test('linked comparison selects from either view, restores the selection, and resets both views', async () => {
  const block = { id: 'compare', type: 'animation', program: { fixtureId: 'fixture-medium-linked-comparison' } };
  const resolve = saved => resolveProgram(saved, { fixtures: true, stamps: PROGRAM_STAMPS });
  const resolved = await resolve(block);
  assert.equal(resolved.ok, true, resolved.error?.detail);
  const { artifact } = resolved;
  const { manifest } = artifact;
  const inputs = resolveInputs(manifest);
  const initial = run(artifact, 'initialize', { inputs });
  const select = (state, target) => run(artifact, 'reduce', { inputs, state, event: { type: 'select', target } });
  const view = (state, reopened = artifact) => {
    const reply = parseGuestResult(run(reopened, 'evaluate', { inputs, state }), reopened.manifest);
    assert.equal(reply.ok, true, reply.issue);
    const scene = normalizeFrame(reply.value.frame, reopened.manifest);
    assert.equal(scene.ok, true, scene.issue);
    const objects = scene.state.objects;
    return {
      highlighted: objects.filter(object => object.role === 'learner').map(object => object.id).sort(),
      readout: objects.find(object => object.id === 'compare:reading').label,
    };
  };
  const overview = { highlighted: [], readout: 'Select a sample' };
  assert.deepEqual(view(initial), overview);
  const fromPoint = select(initial, 'samples:point:b');
  assert.deepEqual(view(fromPoint), { highlighted: ['compare:row:b', 'samples:point:b'], readout: 'Sample B: 24 °C' });
  const fromRow = select(fromPoint, 'compare:row:c');
  const selected = { highlighted: ['compare:row:c', 'samples:point:c'], readout: 'Sample C: 31 °C' };
  assert.deepEqual(view(fromRow), selected);

  const saved = { ...block, programState: { bundleHash: artifact.bundleHash, state: fromRow, revision: 2, seed: 1, inputs } };
  const reopened = await resolve(saved);
  assert.equal(reopened.ok, true, reopened.error?.detail);
  const restored = programStateFor(saved, reopened.artifact);
  assert.deepEqual(view(restored.state, reopened.artifact), selected);

  const reset = resetProgram(saved);
  assert.equal(programStateFor(reset, reopened.artifact), null);
  assert.deepEqual(view(run(reopened.artifact, 'initialize', { inputs }), reopened.artifact), overview);
});

test('a guest image must name a trusted asset, fit its crop, and declare Medium', () => {
  const image = { kind: 'image', id: 'photo', asset: 'vlm-patch-source', x: 0, y: 0, w: 120, h: 120 };
  const frame = object => ({ width: 220, height: 220, objects: [object] });
  assert.equal(parseGuestResult({ frame: frame(image) }, { capabilities: [] }).ok, false);
  assert.equal(parseGuestResult({ frame: frame(image) }, { capabilities: [MEDIUM_CAPABILITY] }).ok, true);
  for (const override of [
    { src: '/api/private-image' }, { asset: 'https://example.com/image.jpg' }, { asset: '/api/private-image' },
    { crop: { x: 0.75, y: 0, w: 0.5, h: 0.5 } }, { w: 220, h: 120 }, { x: -1 }, { w: CONTRACT_LIMITS.size + 1 },
  ]) assert.equal(parseFrame(frame({ ...image, ...override })).ok, false);
});
