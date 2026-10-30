import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashAnimationPlan, hashProgramSource, resolveAnimationInputs, triangleCost, SNAPSHOT_SCHEMA,
  validateAnimationArtifact, validateAnimationEvent, validateAnimationFrame, validateAnimationPlan, validateAnimationPresentation, validateAnimationSnapshot,
} from './contract.js';
import { ANIMATION_FIXTURES, INVALID_ANIMATION_FIXTURES, experimentFixture, gameFixture, watchFixture } from './fixtures.js';
import { parseArtifact, PROGRAM_KIND } from '../explain-program/contract.js';
import { validateScene } from '../animation-scene.js';

// The fixture programs run in the real pinned QuickJS engine through the audited /explain runtime (same entry points), so the
// hand-calculated expected states are checked against actual guest output. Skipped where the engine is not installed.
let runtime = null;
try { runtime = await import('../explain-program/runtime.js'); } catch { runtime = null; }
const run = runtime ? test : test.skip;
let engine;
before(async () => { if (runtime) engine = await runtime.loadEngine(); });
after(() => engine?.dispose?.());

const near = (actual, expected, path) => {
  if (typeof expected === 'number') return assert.ok(Math.abs(actual - expected) < 1e-9, `${path}: ${actual} != ${expected}`);
  if (expected && typeof expected === 'object') for (const key of Object.keys(expected)) near(actual?.[key], expected[key], `${path}.${key}`);
  else assert.equal(actual, expected, path);
};
const issueAt = (result, code, path) => result.ok === false && result.issues.some(issue => issue.code === code && issue.path === path);

test('every valid fixture passes plan and artifact validation with matching hashes', async () => {
  for (const { name, plan, artifact } of ANIMATION_FIXTURES) {
    assert.deepEqual(validateAnimationPlan(plan).issues, undefined, name);
    const result = validateAnimationArtifact(artifact);
    assert.deepEqual(result.issues, undefined, name);
    assert.equal(result.value.provenance.origin, 'fixture');
    assert.equal(artifact.planHash, await hashAnimationPlan(plan), `${name} planHash`);
    assert.equal(artifact.program.sourceHash, await hashProgramSource(artifact.program.source), `${name} sourceHash`);
  }
});

run('fixture programs produce the hand-calculated states in the pinned engine', () => {
  const call = (artifact, operation, request) => {
    const out = runtime.runProgram(engine, { source: artifact.program.source, request: { seed: artifact.seed, time: 0, ...request }, operation });
    assert.equal(out.ok, true, out.detail);
    return out.value;
  };
  let checked = 0;
  for (const { name, artifact, expected: states } of ANIMATION_FIXTURES) {
    for (const expected of states) {
      const inputs = resolveAnimationInputs(artifact, expected.inputs);
      assert.deepEqual(inputs, { ...inputs, ...expected.inputs }, `${name}: expected inputs are valid`);
      let state = artifact.actions.length ? call(artifact, 'initialize', { inputs }) : null;
      for (const event of expected.events ?? []) {
        assert.equal(validateAnimationEvent(event, artifact).ok, true, `${name}: event`);
        state = call(artifact, 'reduce', { state, event, inputs, time: expected.time });
      }
      const frame = validateAnimationFrame(call(artifact, 'evaluate', { inputs, time: expected.time, state }), artifact);
      assert.deepEqual(frame.issues, undefined, `${name} ${expected.label}`);
      near(frame.value, expected.frame, `${name} ${expected.label}`);
      checked += 1;
    }
  }
  assert.equal(checked, 11);
});

test('every invalid fixture is rejected with its code at its path', () => {
  const validators = { plan: validateAnimationPlan, artifact: validateAnimationArtifact };
  for (const { name, kind, value, artifact, code, path } of INVALID_ANIMATION_FIXTURES) {
    const result = kind === 'frame' ? validateAnimationFrame(value, artifact) : kind === 'event' ? validateAnimationEvent(value, artifact) : validators[kind](value);
    assert.ok(issueAt(result, code, path), `${name}: expected ${code} at ${path}, got ${JSON.stringify(result.issues)}`);
  }
});

test('wrong schema strings, oversized payloads and prototype keys are refused before rendering', () => {
  assert.ok(issueAt(validateAnimationPlan({ ...watchFixture.plan, schema: 'animation-plan/2' }), 'unsupported_schema', 'schema'));
  assert.ok(issueAt(validateAnimationArtifact({ ...watchFixture.artifact, capabilityVersion: 'animation-capabilities/9' }), 'capability_version', 'capabilityVersion'));
  const huge = { nodes: Object.fromEntries(Array.from({ length: 20000 }, (_, i) => [`n${i}`, { position: [1, 2, 3] }])) };
  assert.ok(issueAt(validateAnimationFrame(huge, experimentFixture.artifact), 'over_limit', ''));
  const proto = validateAnimationFrame(JSON.parse('{"nodes":{"__proto__":{"visible":false}}}'), experimentFixture.artifact);
  assert.ok(issueAt(proto, 'invalid_value', 'nodes.__proto__'));
  const fn = validateAnimationFrame({ nodes: { beam: { visible: () => true } } }, experimentFixture.artifact);
  assert.ok(issueAt(fn, 'invalid_value', 'nodes.beam.visible'));
});

test('label text, selection and drag are allowed only where the artifact declares them', () => {
  const watch = watchFixture.artifact;
  assert.equal(validateAnimationFrame({ nodes: { moonTag: { text: 'Moon (90 deg)' } } }, watch).ok, true);
  assert.ok(issueAt(validateAnimationFrame({ nodes: { moon: { text: 'x' } } }, watch), 'not_declared', 'nodes.moon.text'));
  assert.ok(issueAt(validateAnimationFrame({ selection: 'moon' }, watch), 'not_declared', 'selection'));
  const draggable = structuredClone(experimentFixture.artifact);
  draggable.scene.nodes[2].selectable = true;
  draggable.scene.nodes[2].drag = { axis: 'x', min: -3, max: -0.5 };
  assert.equal(validateAnimationArtifact(draggable).ok, true);
  assert.equal(validateAnimationEvent({ type: 'drag_move', node: 'leftWeight', value: -2 }, draggable).ok, true);
  assert.ok(issueAt(validateAnimationEvent({ type: 'drag_move', node: 'leftWeight', value: 0 }, draggable), 'invalid_value', 'value'));
  assert.equal(validateAnimationEvent({ type: 'select', node: 'leftWeight' }, draggable).ok, true);
  assert.equal(validateAnimationFrame({ selection: 'leftWeight' }, draggable).ok, true);
  const inspectDrag = structuredClone(draggable);
  inspectDrag.controlProfile = 'inspect';
  assert.ok(issueAt(validateAnimationArtifact(inspectDrag), 'invalid_value', 'scene.nodes.2.drag'));
});

test('snapshots bind to one artifact revision with a complete, valid input set', () => {
  const artifact = experimentFixture.artifact;
  const snapshot = { schema: SNAPSHOT_SCHEMA, artifactId: artifact.artifactId, revision: 1, inputs: resolveAnimationInputs(artifact), state: null, seed: 1, time: 0, tick: 0, stamp: 3, paused: true };
  assert.equal(validateAnimationSnapshot(snapshot, artifact).ok, true);
  assert.ok(issueAt(validateAnimationSnapshot({ ...snapshot, revision: 2 }, artifact), 'artifact_mismatch', 'revision'));
  const { leftMass, ...missing } = snapshot.inputs;
  assert.ok(issueAt(validateAnimationSnapshot({ ...snapshot, inputs: missing }, artifact), 'invalid_value', 'inputs.leftMass'));
  assert.ok(issueAt(validateAnimationSnapshot({ ...snapshot, inputs: { ...snapshot.inputs, leftMass: 0 } }, artifact), 'invalid_value', 'inputs.leftMass'));
  assert.ok(issueAt(validateAnimationSnapshot({ ...snapshot, state: { big: 'x'.repeat(35000) } }, artifact), 'over_limit', 'state'));
  const game = gameFixture.artifact;
  const gameSnapshot = { ...snapshot, artifactId: game.artifactId, inputs: {}, state: { x: 3, z: 2, moves: 5, status: 'won' } };
  assert.equal(validateAnimationSnapshot(gameSnapshot, game).ok, true);
  assert.equal(resolveAnimationInputs(artifact, { leftMass: 99, rightMass: 7 }).leftMass, 4, 'an invalid saved value falls back to the default');
  assert.equal(validateAnimationPresentation({ revision: 0, camera: game.camera, selection: null }, game).ok, true);
  assert.ok(issueAt(validateAnimationPresentation({ revision: 0, camera: game.camera, selection: 'robot' }, game), 'not_declared', 'selection'));
});

test('triangle cost is deterministic per primitive', () => {
  assert.equal(triangleCost({ kind: 'box' }), 12);
  assert.equal(triangleCost({ kind: 'sphere', widthSegments: 32, heightSegments: 16 }), 960);
  assert.equal(triangleCost({ kind: 'cylinder', radialSegments: 24 }), 96);
  assert.equal(triangleCost({ kind: 'cone', radialSegments: 24 }), 72);
  assert.equal(triangleCost({ kind: 'line' }), 0);
});

test('the legacy 2D animation and explain_program contracts stay separate and unchanged', () => {
  assert.equal(PROGRAM_KIND, 'explain_program');
  // A 3D artifact is not a legacy /explain scene or program, and a legacy scene is not a 3D artifact.
  assert.throws(() => validateScene(watchFixture.artifact));
  assert.equal(parseArtifact(watchFixture.artifact.program).ok, false);
  assert.ok(issueAt(validateAnimationArtifact({ kind: 'explain_program', schemaVersion: 1 }), 'unsupported_schema', 'schema'));
  assert.ok(issueAt(validateAnimationArtifact({ id: 'legacy', title: 'Old 2D scene', timeline: [] }), 'unsupported_schema', 'schema'));
});
