import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURES, GEOMETRY_KINDS, PLAN_ARCHETYPES, clientFeatureUses, hashAnimationPlan, hashProgramSource, linePoints, resolveAnimationInputs, triangleCost, SNAPSHOT_SCHEMA,
  validateAnimationArtifact, validateAnimationEvent, validateAnimationFrame, validateAnimationPlan, validateAnimationPresentation, validateAnimationSnapshot,
} from './contract.js';
import { ANIMATION_CAPABILITIES, ANIMATION_CLIENT_FEATURES } from './capabilities.js';
import { ANIMATION_FIXTURES, INVALID_ANIMATION_FIXTURES, experimentFixture, gameFixture, primitivesFixture, watchFixture } from './fixtures.js';
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

test('a new draft may not declare the card\'s own Reset or Reset view, by id or label; a stored artifact with one still validates', () => {
  const withAction = action => { const copy = structuredClone(gameFixture.artifact); copy.actions.push(action); return copy; };
  for (const action of [{ id: 'reset', label: 'Reset' }, { id: 'reset_game', label: 'Again' }, { id: 'startOver', label: 'Go' }, { id: 'again', label: 'Reset game!' },
    { id: 'again', label: 'RESTART' }, { id: 'again', label: 'Reset view' }, { id: 'again', label: 'Reset-Experiment' }, { id: 'again', label: 'Start over' }]) {
    assert.ok(issueAt(validateAnimationArtifact(withAction(action), undefined, { draft: true }), 'host_control', 'actions.4'), JSON.stringify(action));
    assert.equal(validateAnimationArtifact(withAction(action)).ok, true, `stored: ${JSON.stringify(action)}`);
  }
  assert.equal(validateAnimationArtifact(withAction({ id: 'resetBall', label: 'Reset ball' }), undefined, { draft: true }).ok, true, 'a scene\'s own named move is not the card\'s reset');
  assert.equal(validateAnimationArtifact(gameFixture.artifact, undefined, { draft: true }).ok, true);
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

test('label placement is optional, defaults to above and is a closed set', () => {
  const placed = validateAnimationArtifact(watchFixture.artifact).value.scene.geometries.find(g => g.kind === 'label');
  assert.equal(placed.placement, 'above');
  const bad = structuredClone(watchFixture.artifact);
  bad.scene.geometries.find(g => g.kind === 'label').placement = 'floating';
  assert.ok(issueAt(validateAnimationArtifact(bad), 'invalid_value', 'scene.geometries.3.placement'));
});

test('triangle cost is deterministic per primitive', () => {
  assert.equal(triangleCost({ kind: 'box' }), 12);
  assert.equal(triangleCost({ kind: 'sphere', widthSegments: 32, heightSegments: 16 }), 960);
  assert.equal(triangleCost({ kind: 'cylinder', radialSegments: 24 }), 96);
  assert.equal(triangleCost({ kind: 'cone', radialSegments: 24 }), 48);
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

// startsMotion (aj_086fd46 owner review): an optional boolean on an action; absent is every artifact made before it (hashes unchanged).
test('an action may declare startsMotion as a boolean; absent is allowed and the field is strict', () => {
  const declared = structuredClone(gameFixture.artifact);
  assert.ok(declared.actions.length > 0 && declared.actions.every(action => !('startsMotion' in action)), 'the shipped game declares nothing');
  assert.equal(validateAnimationArtifact(declared).ok, true);
  declared.actions[0].startsMotion = false;
  const ok = validateAnimationArtifact(declared);
  assert.equal(ok.ok, true, JSON.stringify(ok.issues));
  assert.equal(ok.value.actions[0].startsMotion, false);
  for (const bad of ['false', 0, null]) {
    const wrong = structuredClone(declared);
    wrong.actions[0].startsMotion = bad;
    assert.equal(validateAnimationArtifact(wrong).ok, false, JSON.stringify(bad));
  }
});

// ---- AN-18: the five client features (surface_grid, trail_points, text_readout, arrow_anchor, clamp); owner decisions 11 and 12 ----
const prim = () => structuredClone(primitivesFixture.artifact);
const geometryOf = (artifact, id) => artifact.scene.geometries.find(g => g.id === id);
const nodeOf = (artifact, id) => artifact.scene.nodes.find(n => n.id === id);
const nodeIndex = id => primitivesFixture.artifact.scene.nodes.findIndex(n => n.id === id);
const changed = change => { const copy = prim(); change(copy); return copy; };
const grid = (rows, cols) => Array.from({ length: rows }, () => Array(cols).fill(0));
const points = count => Array.from({ length: count }, (_, i) => [i * 0.01, 0, 0]);

test('the primitives fixture validates and its counts are the hand-calculated ones', async () => {
  const { plan, artifact, counts } = primitivesFixture;
  assert.deepEqual(validateAnimationPlan(plan).issues, undefined);
  assert.deepEqual(validateAnimationArtifact(artifact).issues, undefined);
  assert.equal(artifact.planHash, await hashAnimationPlan(plan));
  assert.equal(artifact.program.sourceHash, await hashProgramSource(artifact.program.source));
  const { geometries, nodes } = artifact.scene, used = nodes.map(n => geometries.find(g => g.id === n.geometry)).filter(Boolean);
  assert.equal(used.reduce((sum, g) => sum + triangleCost(g), 0), counts.triangles);
  assert.equal(used.reduce((sum, g) => sum + linePoints(g), 0), counts.linePoints);
  assert.equal(used.filter(g => g.kind === 'label').length + artifact.readouts.length, counts.labels);
  assert.equal(nodes.length, counts.nodes);
  assert.deepEqual(clientFeatureUses(artifact).map(u => u.feature).sort(), ['arrow_anchor', 'arrow_anchor', 'clamp', 'surface_grid', 'text_readout', 'trail_points', 'trail_points']);
});

run('the primitives programme gives the hand-calculated frames, and each validates (a trail node takes points, a text readout a word)', () => {
  const { artifact, expected } = primitivesFixture;
  for (const state of expected) {
    const out = runtime.runProgram(engine, { source: artifact.program.source, request: { seed: artifact.seed, time: state.time, inputs: {} }, operation: 'evaluate' });
    assert.equal(out.ok, true, out.detail);
    const frame = validateAnimationFrame(out.value, artifact);
    assert.deepEqual(frame.issues, undefined, state.label);
    near(frame.value, state.frame, state.label);
  }
});

test('surface_grid: 4 to 64 rectangular rows and columns, triangleCost 2(rows-1)(cols-1), contours 0 to 16 counted as line points', () => {
  const surface = artifact => geometryOf(artifact, 'bowlGrid');
  const withGrid = heights => changed(a => { surface(a).heights = heights; });
  assert.equal(triangleCost(surface(prim())), 40);
  assert.equal(triangleCost({ kind: 'surface', heights: grid(64, 64) }), 2 * 63 * 63);
  assert.equal(triangleCost({ kind: 'surface', heights: grid(4, 7) }), 2 * 3 * 6);
  assert.equal(linePoints(surface(prim())), 108, '3 contours x 4 x (5 + 6 - 2)');
  assert.equal(linePoints({ kind: 'surface', heights: grid(5, 6) }), 0, 'no contours, no line points');
  assert.equal(linePoints({ kind: 'surface', heights: grid(24, 24), contours: 8 }), 8 * 4 * 46);
  for (const [rows, cols] of [[4, 4], [64, 64], [4, 64], [64, 4]]) assert.deepEqual((validateAnimationArtifact(withGrid(grid(rows, cols))).issues ?? []).filter(i => i.path.includes('heights')), [], `${rows} x ${cols}`);
  for (const [rows, cols] of [[3, 5], [5, 3], [65, 5], [5, 65], [0, 0]]) {
    const result = validateAnimationArtifact(withGrid(grid(rows, cols)));
    assert.equal(result.ok, false, `${rows} x ${cols}`);
    assert.ok(result.issues.some(i => i.path.startsWith('scene.geometries.0.heights')), `${rows} x ${cols}: ${JSON.stringify(result.issues)}`);
  }
  const ragged = grid(5, 6);
  ragged[2] = [0, 0, 0, 0, 0];
  assert.ok(issueAt(validateAnimationArtifact(withGrid(ragged)), 'invalid_value', 'scene.geometries.0.heights'), 'rows of different lengths');
  for (const contours of [-1, 17, 1.5]) assert.equal(validateAnimationArtifact(changed(a => { surface(a).contours = contours; })).ok, false, `contours ${contours}`);
  for (const contours of [0, 16]) assert.equal(validateAnimationArtifact(changed(a => { surface(a).contours = contours; })).ok, true, `contours ${contours}`);
  assert.ok(issueAt(validateAnimationArtifact(changed(a => { surface(a).heights[0][0] = Number.NaN; })), 'invalid_value', 'scene.geometries.0.heights.0.0'));
  for (const bad of [{ width: 0 }, { depth: -1 }, { extra: 1 }]) assert.equal(validateAnimationArtifact(changed(a => { Object.assign(surface(a), bad); })).ok, false, JSON.stringify(bad));
});

test('the limits count the new kinds: a surface and a trail are triangles and line points like any other geometry', () => {
  // 61 bowls: 61 x 108 + 150 = 6,738 line points, over 4,096; 61 x 40 + 2,642 = 5,082 triangles, within 100,000.
  const contoured = changed(a => { for (let i = 0; i < 60; i += 1) a.scene.nodes.push({ id: `copy${i}`, geometry: 'bowlGrid' }); });
  assert.deepEqual(validateAnimationArtifact(contoured).issues.map(i => [i.code, i.path]), [['over_limit', 'scene.geometries']]);
  // 13 full 64 x 64 surfaces: 13 x 7,938 = 103,194 triangles, over 100,000.
  const huge = changed(a => {
    Object.assign(geometryOf(a, 'bowlGrid'), { heights: grid(64, 64), contours: 0 });
    for (let i = 0; i < 12; i += 1) a.scene.nodes.push({ id: `copy${i}`, geometry: 'bowlGrid' });
  });
  assert.deepEqual(validateAnimationArtifact(huge).issues.map(i => [i.code, i.path]), [['over_limit', 'scene.nodes']]);
  assert.equal(triangleCost({ kind: 'trail', max: 512, radius: 0.1, style: 'trail' }), 2 * 8 * 511);
  assert.equal(triangleCost({ kind: 'trail', max: 512, style: 'trail' }), 0, 'a trail without a radius is a line');
  assert.equal(linePoints({ kind: 'trail', max: 512, style: 'ghost' }), 512);
  // Existing kinds are unchanged.
  assert.equal(linePoints({ kind: 'curve', segments: 96 }), 97);
  assert.equal(linePoints({ kind: 'line', points: [[0, 0, 0], [1, 1, 1]] }), 2);
  assert.equal(linePoints({ kind: 'box' }), 0);
});

test('trail_points: max 2 to 512, a fixed style, and frame points only on a trail node, at most max', () => {
  const trail = artifact => geometryOf(artifact, 'pathTrail');
  for (const bad of [{ max: 1 }, { max: 513 }, { max: 2.5 }, { style: 'dots' }, { radius: 0 }, { points: [[0, 0, 0]] }]) assert.equal(validateAnimationArtifact(changed(a => { Object.assign(trail(a), bad); })).ok, false, JSON.stringify(bad));
  assert.equal(validateAnimationArtifact(changed(a => { delete trail(a).style; })).ok, false, 'style is required');
  assert.equal(validateAnimationArtifact(changed(a => { Object.assign(trail(a), { max: 512 }); delete trail(a).radius; })).ok, true);
  assert.equal(validateAnimationArtifact(changed(a => { Object.assign(trail(a), { max: 2, style: 'ghost' }); })).ok, true);
  const artifact = validateAnimationArtifact(prim()).value;
  assert.equal(validateAnimationFrame({ nodes: { trail: { points: points(100) } } }, artifact).ok, true, 'exactly max');
  assert.equal(validateAnimationFrame({ nodes: { trail: { points: [] } } }, artifact).ok, true, 'an empty trail clears it');
  assert.ok(issueAt(validateAnimationFrame({ nodes: { trail: { points: points(101) } } }, artifact), 'over_limit', 'nodes.trail.points'));
  assert.ok(issueAt(validateAnimationFrame({ nodes: { ghost: { points: points(51) } } }, artifact), 'over_limit', 'nodes.ghost.points'));
  assert.ok(issueAt(validateAnimationFrame({ nodes: { trail: { points: points(513) } } }, artifact), 'over_limit', 'nodes.trail.points'), 'never more than 512');
  for (const id of ['ball', 'bowl', 'slope', 'slopeTag', 'group']) assert.ok(issueAt(validateAnimationFrame({ nodes: { [id]: { points: points(2) } } }, artifact), 'not_declared', `nodes.${id}.points`), `${id} is not a trail node`);
  assert.equal(validateAnimationFrame({ nodes: { trail: { points: [[0, 0, Number.NaN]] } } }, artifact).ok, false);
  assert.equal(validateAnimationFrame({ nodes: { trail: { points: [[0, 0]] } } }, artifact).ok, false);
});

test('text_readout: kind text takes a word of at most 40 characters and no unit or decimals; a number for a text readout, or a word for a number, is invalid_value', () => {
  const artifact = validateAnimationArtifact(prim()).value;
  assert.equal(validateAnimationFrame({ readouts: { status: 'x'.repeat(40) } }, artifact).ok, true);
  assert.equal(validateAnimationFrame({ readouts: { status: '' } }, artifact).ok, true);
  assert.ok(issueAt(validateAnimationFrame({ readouts: { status: 'x'.repeat(41) } }, artifact), 'over_limit', 'readouts.status'), 'a 41 character word');
  assert.ok(issueAt(validateAnimationFrame({ readouts: { status: 3 } }, artifact), 'invalid_value', 'readouts.status'), 'a number for a text readout');
  assert.ok(issueAt(validateAnimationFrame({ readouts: { loss: 'high' } }, artifact), 'invalid_value', 'readouts.loss'), 'a word for a number readout');
  assert.ok(issueAt(validateAnimationFrame({ readouts: { status: null } }, artifact), 'invalid_value', 'readouts.status'));
  assert.ok(issueAt(validateAnimationFrame({ readouts: { status: Number.NaN } }, artifact), 'invalid_value', 'readouts.status'));
  const readout = change => changed(a => change(a.readouts[1]));
  assert.ok(issueAt(validateAnimationArtifact(readout(r => { r.unit = 'deg'; })), 'invalid_value', 'readouts.1.unit'));
  assert.ok(issueAt(validateAnimationArtifact(readout(r => { r.decimals = 2; })), 'invalid_value', 'readouts.1.decimals'));
  assert.ok(issueAt(validateAnimationArtifact(readout(r => { r.kind = 'html'; })), 'invalid_value', 'readouts.1.kind'));
  assert.equal(validateAnimationArtifact(changed(a => { a.readouts[0].kind = 'number'; })).ok, true, 'kind number is the default, stated');
  // The sealed value is what is stored and validated again later: a text readout gains no decimals, and a number readout keeps the default.
  const sealed = validateAnimationArtifact(prim()).value;
  assert.deepEqual(sealed.readouts[1], { id: 'status', label: 'Status', kind: 'text' });
  assert.deepEqual(validateAnimationArtifact(sealed).value, sealed, 'validating a validated artifact changes nothing');
  assert.equal(validateAnimationArtifact(changed(a => { delete a.readouts[0].decimals; })).value.readouts[0].decimals, 2);
  assert.equal('kind' in validateAnimationArtifact(watchFixture.artifact).value.readouts[0], false, 'a readout that names no kind gains none, so older clients still read it');
  assert.equal(validateAnimationFrame({ readouts: { angle: 1 } }, watchFixture.artifact).ok, true);
  assert.ok(issueAt(validateAnimationFrame({ readouts: { angle: 'x' } }, watchFixture.artifact), 'invalid_value', 'readouts.angle'));
});

test('arrow_anchor: an arrow offset below its length, and a label anchor only under an arrow', () => {
  const arrow = artifact => geometryOf(artifact, 'slopeArrow');
  const arrowAt = primitivesFixture.artifact.scene.geometries.findIndex(g => g.id === 'slopeArrow');
  for (const offset of [0, 0.1, 0.49]) assert.equal(validateAnimationArtifact(changed(a => { arrow(a).offset = offset; })).ok, true, `offset ${offset}`);
  for (const offset of [0.5, 0.6]) assert.ok(issueAt(validateAnimationArtifact(changed(a => { arrow(a).offset = offset; })), 'invalid_value', `scene.geometries.${arrowAt}.offset`), `offset ${offset}`);
  assert.equal(validateAnimationArtifact(changed(a => { arrow(a).offset = -0.1; })).ok, false);
  assert.equal(validateAnimationArtifact(changed(a => { delete arrow(a).offset; })).ok, true);
  assert.equal(validateAnimationArtifact(changed(a => { geometryOf(a, 'slopeText').anchor = 'origin'; })).ok, true);
  assert.equal(validateAnimationArtifact(changed(a => { geometryOf(a, 'slopeText').anchor = 'middle'; })).ok, false);
  // The anchored label under a node that is not an arrow, or under nothing.
  const tag = nodeIndex('slopeTag');
  for (const parent of ['ball', 'group', null]) assert.ok(issueAt(validateAnimationArtifact(changed(a => { nodeOf(a, 'slopeTag').parent = parent; })), 'invalid_value', `scene.nodes.${tag}.geometry`), `parent ${parent}`);
  assert.ok(issueAt(validateAnimationArtifact(changed(a => { geometryOf(a, 'slopeText').anchor = 'origin'; nodeOf(a, 'slopeTag').parent = 'ball'; })), 'invalid_value', `scene.nodes.${tag}.geometry`), 'origin is an anchor too');
  assert.equal(validateAnimationArtifact(changed(a => { delete geometryOf(a, 'slopeText').anchor; nodeOf(a, 'slopeTag').parent = 'ball'; })).ok, true, 'no anchor, any parent');
});

test('clamp: a sphere node names one surface node; max is a number; anything else is refused', () => {
  const clamp = value => changed(a => { nodeOf(a, 'ball').clampTo = value; });
  const ball = nodeIndex('ball');
  assert.equal(validateAnimationArtifact(clamp({ node: 'bowl' })).ok, true, 'max is optional');
  assert.equal(validateAnimationArtifact(clamp({ node: 'bowl', max: 2 })).ok, true);
  assert.equal(validateAnimationArtifact(clamp({ node: 'bowl', max: -1 })).ok, true);
  assert.ok(issueAt(validateAnimationArtifact(clamp({ node: 'nowhere' })), 'unknown_id', `scene.nodes.${ball}.clampTo.node`));
  for (const target of ['trail', 'ball', 'slope', 'slopeTag', 'group']) assert.ok(issueAt(validateAnimationArtifact(clamp({ node: target })), 'invalid_value', `scene.nodes.${ball}.clampTo.node`), `target ${target} is not a surface node`);
  for (const holder of ['bowl', 'trail', 'slope', 'slopeTag', 'group']) assert.ok(issueAt(validateAnimationArtifact(changed(a => { nodeOf(a, holder).clampTo = { node: 'bowl' }; })), 'invalid_value', `scene.nodes.${nodeIndex(holder)}.clampTo`), `${holder} is not a sphere`);
  for (const bad of [[{ node: 'bowl' }, { node: 'bowl' }], { node: 'bowl', max: 'high' }, { node: 'bowl', other: 1 }, { max: 2 }, 'bowl', null]) assert.equal(validateAnimationArtifact(clamp(bad)).ok, false, `one clamp per node: ${JSON.stringify(bad)}`);
});

test('a pre-AN-18 artifact validates unchanged: the new fields are optional and add nothing to what was stored', () => {
  for (const { name, artifact } of ANIMATION_FIXTURES) {
    const result = validateAnimationArtifact(artifact);
    assert.equal(result.ok, true, name);
    assert.deepEqual(result.value.readouts, artifact.readouts.map(r => ({ decimals: 2, ...r })), `${name}: the same readouts as before`);
    assert.deepEqual(clientFeatureUses(artifact), [], name);
  }
  assert.deepEqual([...GEOMETRY_KINDS], ['box', 'sphere', 'cylinder', 'cone', 'plane', 'line', 'curve', 'arrow', 'label', 'surface', 'trail']);
  assert.ok(['surface_grid', 'trail_points', 'text_readout', 'arrow_anchor', 'clamp'].every(f => ANIMATION_CLIENT_FEATURES.includes(f) && !FEATURES.includes(f)), 'client features, not plan features: the planner schema is unchanged');
  assert.deepEqual(ANIMATION_CLIENT_FEATURES.slice(0, 2), ['curve_radius', 'action_motion']);
  assert.ok(ANIMATION_CAPABILITIES.geometry.includes('surface') && ANIMATION_CAPABILITIES.geometry.includes('trail'));
});

test('clientFeatureUses names each use of the five features with its path, once per field, and tolerates a draft that is not valid', () => {
  const uses = clientFeatureUses(prim());
  assert.deepEqual(uses.map(u => u.path), ['scene.geometries.0.kind', 'scene.geometries.1.kind', 'scene.geometries.2.kind', 'scene.geometries.4.offset', 'scene.geometries.5.anchor', `scene.nodes.${nodeIndex('ball')}.clampTo`, 'readouts.1.kind']);
  assert.ok(uses.every(u => /^the browser that asked for this scene cannot /.test(u.message) && !u.message.includes('\n')));
  for (const junk of [undefined, null, 1, {}, { scene: 1 }, { scene: { geometries: [null, 3, 'x'], nodes: [null] }, readouts: [null, 4] }]) assert.deepEqual(clientFeatureUses(junk), []);
});

// ---- AN-18 plan fields (owner decision 13): archetype and assertions, both optional ----
test('a plan may name an archetype and carry up to four assertions; a plan that carries neither is unchanged', async () => {
  const plan = experimentFixture.plan;
  const withFields = fields => ({ ...plan, ...fields });
  assert.equal(validateAnimationPlan(plan).ok, true);
  assert.equal(await hashAnimationPlan(plan), experimentFixture.artifact.planHash, 'an existing plan hashes as before');
  assert.deepEqual([...PLAN_ARCHETYPES], ['loss_surface']);
  assert.equal(validateAnimationPlan(withFields({ archetype: 'loss_surface' })).ok, true);
  assert.ok(issueAt(validateAnimationPlan(withFields({ archetype: 'bowl' })), 'invalid_value', 'archetype'), 'only a listed archetype');
  const good = [{ kind: 'clamp', node: 'ball' }, { kind: 'compare', parameter: 'leftMass', values: [2, 8] }, { kind: 'pathLength', min: 40 }];
  const ok = validateAnimationPlan(withFields({ assertions: good }));
  assert.deepEqual(ok.issues, undefined);
  assert.deepEqual(ok.value.assertions, good);
  assert.equal(validateAnimationPlan(withFields({ assertions: [] })).ok, true);
  assert.equal(validateAnimationPlan(withFields({ assertions: [...good, { kind: 'clamp', node: 'a' }] })).ok, true, 'four');
  assert.ok(issueAt(validateAnimationPlan(withFields({ assertions: [...good, { kind: 'clamp', node: 'a' }, { kind: 'clamp', node: 'b' }] })), 'over_limit', 'assertions'), 'five');
  for (const bad of [{ kind: 'overshoot' }, { kind: 'clamp' }, { kind: 'clamp', node: 'ball', extra: 1 }, { kind: 'compare', parameter: 'leftMass', values: [2] }, { kind: 'compare', parameter: 'leftMass', values: [2, 8, 9] },
    { kind: 'compare', parameter: 'leftMass', values: [2, Number.NaN] }, { kind: 'pathLength', min: 0 }, { kind: 'pathLength', min: 513 }, { kind: 'pathLength', min: 1.5 }, { kind: 'pathLength' }, 'clamp', null]) {
    assert.equal(validateAnimationPlan(withFields({ assertions: [bad] })).ok, false, JSON.stringify(bad));
  }
  // compare names a number parameter of this plan, and two different values.
  assert.ok(issueAt(validateAnimationPlan(withFields({ assertions: [{ kind: 'compare', parameter: 'nowhere', values: [1, 2] }] })), 'unknown_id', 'assertions.0.parameter'));
  assert.ok(issueAt(validateAnimationPlan(withFields({ assertions: [{ kind: 'compare', parameter: 'leftMass', values: [3, 3] }] })), 'invalid_value', 'assertions.0.values'));
  assert.ok(issueAt(validateAnimationPlan({ ...watchFixture.plan, assertions: [{ kind: 'compare', parameter: 'leftMass', values: [1, 2] }] }), 'unknown_id', 'assertions.0.parameter'), 'a plan with no parameters');
});
