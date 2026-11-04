// AN-18 (owner decisions 11 and 12): the five client features surface_grid, trail_points, text_readout, arrow_anchor and clamp, declared the way
// curve_radius and action_motion are. A client that did not declare one is never given a scene that uses it (the validate stage refuses the draft,
// repairably, one line per field) and a stored scene that uses one answers 409 client_update_required to it. Real functions throughout; no model, no
// network, no browser. Written up in docs/features/animation/old-client-compatibility.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactHashOf, artifactIntact, clientProblems, validateStage } from '../src/animation-author.js';
import { clientFeatures } from '../src/animation-brief.js';
import { CLIENT_UPDATE, needsFeatures } from '../src/animation-job.js';
import { ARTIFACT_DRAFT } from '../src/agents/animation-author.js';
import { GEOMETRY_KINDS, validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';
import { gameFixture, primitivesFixture, watchFixture } from '../../web/src/animation3d/fixtures.js';
import { BOARD, OWNER, animationStack } from './animation-fixture.js';

const FIVE = ['surface_grid', 'trail_points', 'text_readout', 'arrow_anchor', 'clamp'];
const THE_TWO = ['curve_radius', 'action_motion'];
const primitives = () => structuredClone(primitivesFixture.artifact);
const edit = (artifact, change) => { const copy = structuredClone(artifact); change(copy); return copy; };

// The fixture with each feature's minimum: one use of just that feature on a scene that otherwise needs none.
const ONLY = {
  surface_grid: edit(watchFixture.artifact, a => { a.scene.geometries.push({ id: 'floor', kind: 'surface', heights: Array.from({ length: 4 }, () => [0, 0, 0, 0]), width: 4, depth: 4 }); a.scene.nodes.push({ id: 'floorNode', geometry: 'floor' }); }),
  trail_points: edit(watchFixture.artifact, a => { a.scene.geometries.push({ id: 'path', kind: 'trail', max: 8, style: 'ghost' }); a.scene.nodes.push({ id: 'pathNode', geometry: 'path' }); }),
  text_readout: edit(watchFixture.artifact, a => { a.readouts[0] = { id: 'angle', label: 'Orbit angle', kind: 'text' }; }),
  arrow_anchor: edit(gameFixture.artifact, a => { a.scene.geometries.find(g => g.kind === 'arrow').offset = 0.2; }),
};

test('the client declares the five features after the two it already had, and the server keeps only those it knows', () => {
  assert.deepEqual(ANIMATION_CLIENT_FEATURES, [...THE_TWO, ...FIVE]);
  assert.deepEqual(clientFeatures([...FIVE, 'teleport']), FIVE);
  assert.deepEqual(clientFeatures(['clamp']), ['clamp']);
  assert.deepEqual(clientFeatures(undefined), []);
});

test('generation: a draft that uses a feature the client did not declare is refused, one line per field, and repairable', () => {
  const artifact = primitives();
  const lines = clientProblems(artifact, {});
  assert.deepEqual(lines, [
    'scene.geometries.0.kind: the browser that asked for this scene cannot draw surface geometry; remove it',
    'scene.geometries.1.kind: the browser that asked for this scene cannot draw trail geometry; remove it',
    'scene.geometries.2.kind: the browser that asked for this scene cannot draw trail geometry; remove it',
    'scene.geometries.4.offset: the browser that asked for this scene cannot offset an arrow; remove offset',
    'scene.geometries.5.anchor: the browser that asked for this scene cannot anchor a label to an arrow; remove anchor',
    'scene.nodes.3.clampTo: the browser that asked for this scene cannot clamp a marker to a surface; remove clampTo',
    'readouts.1.kind: the browser that asked for this scene cannot show text readouts; remove kind',
  ]);
  for (const features of [undefined, null, [], THE_TWO, ['bogus']]) assert.equal(clientProblems(artifact, { features }).length, 7, JSON.stringify(features));
  assert.deepEqual(clientProblems(artifact, { features: ANIMATION_CLIENT_FEATURES }), []);
  assert.deepEqual(clientProblems(artifact, { features: FIVE }), []);
  // Declaring one feature excuses only its own fields.
  const left = feature => clientProblems(artifact, { features: FIVE.filter(f => f !== feature) }).map(p => p.split(':')[0]);
  assert.deepEqual(left('surface_grid'), ['scene.geometries.0.kind']);
  assert.deepEqual(left('trail_points'), ['scene.geometries.1.kind', 'scene.geometries.2.kind']);
  assert.deepEqual(left('arrow_anchor'), ['scene.geometries.4.offset', 'scene.geometries.5.anchor']);
  assert.deepEqual(left('clamp'), ['scene.nodes.3.clampTo']);
  assert.deepEqual(left('text_readout'), ['readouts.1.kind']);
  // The two existing checks keep their words and still run beside the new ones.
  const both = edit(artifact, a => { a.actions = [{ id: 'step', label: 'Step', startsMotion: false }]; });
  assert.equal(clientProblems(both, {}).length, 8);
  assert.equal(clientProblems(both, { features: FIVE }).length, 1);
  // A scene made before AN-18 never needs one.
  for (const old of [watchFixture.artifact, gameFixture.artifact]) assert.deepEqual(clientProblems(old, {}), []);
});

test('the validate stage refuses the draft for a client without the features and accepts it with them', async () => {
  const { plan, artifact } = primitivesFixture;
  const job = features => ({ prompt: 'a ball in a bowl', plan, planHash: artifact.planHash, resultId: artifact.artifactId, approval: { at: '2026-11-03T00:00:00Z' }, draft: structuredClone(artifact),
    evidence: [], attempt: 1, repairs: 0, counts: { review: 0 }, calls: [{ role: 'author', status: 'settled', served: 'claude-opus-5-5' }], ...(features === undefined ? {} : { features }) });
  const env = { ANTHROPIC_API_KEY: 'offline' };
  for (const features of [undefined, [], THE_TWO]) {
    const out = await validateStage(job(features), { env });
    assert.deepEqual([out.category, out.repairable, out.problems.length], ['spec', true, 7], JSON.stringify(features));
    assert.ok(out.problems.every(p => /the browser that asked for this scene cannot /.test(p)));
  }
  const ok = await validateStage(job(ANIMATION_CLIENT_FEATURES), { env });
  assert.deepEqual(ok.problems ?? [], []);
  assert.equal(validateAnimationArtifact(ok.artifact, undefined, { draft: true }).ok, true);
});

test('loading: needsFeatures names every feature a stored scene uses, and a scene that uses none is served to every reader', () => {
  assert.deepEqual([...needsFeatures(primitives())].sort(), [...FIVE].sort());
  assert.deepEqual(needsFeatures(ONLY.surface_grid), ['surface_grid']);
  assert.deepEqual(needsFeatures(ONLY.trail_points), ['trail_points']);
  assert.deepEqual(needsFeatures(ONLY.text_readout), ['text_readout']);
  assert.deepEqual(needsFeatures(ONLY.arrow_anchor), ['arrow_anchor']);
  assert.ok(needsFeatures(edit(primitives(), a => { a.actions = [{ id: 'step', label: 'Step', startsMotion: false }]; })).includes('action_motion'), 'the two earlier features are still named');
  for (const old of [watchFixture.artifact, gameFixture.artifact]) assert.deepEqual(needsFeatures(old), []);
  assert.deepEqual(needsFeatures(null), []);
  for (const [name, artifact] of Object.entries(ONLY)) assert.equal(validateAnimationArtifact(artifact).ok, true, `${name} fixture is a valid scene`);
});

// A stack holding one saved result, as animation-old-client.test.js: the real Durable Object read.
async function stackWith(t, artifact) {
  const s = animationStack(t, { pipeline: { intact: artifactIntact } });
  const identity = { artifactHash: await artifactHashOf(artifact) };
  s.state.data.set(`result:${artifact.artifactId}`, { kind: 'animation3d', artifact, identity, owner: { org: OWNER.org, email: OWNER.email }, boardId: BOARD.id, cardId: 'card_1' });
  return s;
}
const read = (s, artifact, features) => s.send('result', features === undefined ? {} : { features }, artifact.artifactId);

test('loading: a reader that did not declare a feature the stored scene uses gets 409 client_update_required and no artifact; one that did gets the scene', async t => {
  const artifact = primitives();
  const s = await stackWith(t, artifact);
  const missingOne = feature => ANIMATION_CLIENT_FEATURES.filter(f => f !== feature);
  for (const features of [undefined, [], THE_TWO, ['bogus'], ...FIVE.map(missingOne)]) {
    const r = await read(s, artifact, features);
    assert.deepEqual([r.status, r.body.code, r.body.error, r.body.artifact], [409, 'client_update_required', CLIENT_UPDATE, undefined], JSON.stringify(features));
  }
  const ok = await read(s, artifact, ANIMATION_CLIENT_FEATURES);
  assert.deepEqual([ok.status, ok.body.artifact.artifactId], [200, artifact.artifactId]);
  assert.equal((await read(s, artifact, FIVE)).status, 200, 'this scene has no tube and no startsMotion, so the five alone are enough');
});

test('loading: a scene that uses one feature needs just that one; an older stored scene is served to a reader that declares nothing', async t => {
  for (const [feature, artifact] of Object.entries(ONLY)) {
    const s = await stackWith(t, artifact);
    assert.equal((await read(s, artifact, THE_TWO)).status, 409, `${feature}: a reader without it`);
    assert.equal((await read(s, artifact, [...THE_TWO, ...FIVE.filter(f => f !== feature)])).status, 409, `${feature}: a reader with the other four`);
    assert.equal((await read(s, artifact, [feature])).status, 200, `${feature}: a reader with it`);
  }
  for (const old of [watchFixture.artifact, gameFixture.artifact]) {
    const s = await stackWith(t, old);
    for (const features of [undefined, [], THE_TWO]) assert.equal((await read(s, old, features)).status, 200, `${old.artifactId} ${JSON.stringify(features)}`);
  }
});

test('the author tool schema carries every field the contract added, and nothing in the fixture falls outside it', () => {
  const geometry = ARTIFACT_DRAFT.properties.scene.properties.geometries.items, node = ARTIFACT_DRAFT.properties.scene.properties.nodes.items, readout = ARTIFACT_DRAFT.properties.readouts.items;
  assert.deepEqual(geometry.properties.kind.enum, [...GEOMETRY_KINDS]);
  assert.deepEqual(geometry.properties.style.enum, ['trail', 'ghost']);
  assert.deepEqual(geometry.properties.anchor.enum, ['origin', 'tip']);
  assert.deepEqual(readout.properties.kind.enum, ['number', 'text']);
  for (const key of ['heights', 'depth', 'contours', 'max', 'style', 'offset', 'anchor']) assert.ok(geometry.properties[key], `geometry ${key}`);
  assert.ok(node.properties.clampTo && node.properties.clampTo.required.includes('node'));
  assert.match(geometry.description, /surface \{.*\}.*trail \{.*\}/);
  const { geometries, nodes } = primitives().scene;
  for (const g of geometries) for (const key of Object.keys(g)) assert.ok(key in geometry.properties, `geometry ${g.kind} field ${key} is in the tool schema`);
  for (const n of nodes) for (const key of Object.keys(n)) assert.ok(key in node.properties, `node field ${key} is in the tool schema`);
  for (const r of primitives().readouts) for (const key of Object.keys(r)) assert.ok(key in readout.properties, `readout field ${key} is in the tool schema`);
});
