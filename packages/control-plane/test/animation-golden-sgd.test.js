// The golden SGD artifact (web testdata/sgd-golden.json; AN-19, owner decisions 11 to 13) through the real server paths, with no model and no
// network: it seals and validates for a client that declares all seven features, the dev seed-fixture route stores it as a saved result, the
// normal result route serves it to its owner with the features and answers 409 client_update_required to a client missing any one of the five
// (the old-client path the MVP3 smoke names), and the generation-side refusal names every field. The browser half is e2e/animation-primitives-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { artifactHashOf, artifactIntact, clientProblems } from '../src/animation-author.js';
import { ANIMATION_SEED_FIXTURE_PATH, animationRoute, needsFeatures } from '../src/animation-job.js';
import { validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';
import { BOARD, OWNER, animationStack } from './animation-fixture.js';

const { artifact } = JSON.parse(readFileSync(new URL('../../web/src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8'));
const FIVE = ['surface_grid', 'trail_points', 'text_readout', 'arrow_anchor', 'clamp'];
const THE_TWO = ['curve_radius', 'action_motion'];

function stack(t) {
  const s = animationStack(t, { pipeline: { intact: artifactIntact } });
  const namespace = { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) };
  const env = { ...s.env, ANIMATION_DIAGNOSTICS: 'true', ANIMATION_JOBS: namespace };
  const seed = body => animationRoute(ANIMATION_SEED_FIXTURE_PATH, new Request(`https://dev.test${ANIMATION_SEED_FIXTURE_PATH}`, { method: 'POST', body: JSON.stringify(body) }), env, { identity: async () => OWNER }).then(async r => ({ status: r.status, body: await r.json() }));
  const read = (features = []) => animationRoute(`/api/learn/animation/jobs/results/${artifact.artifactId}`, new Request(`https://dev.test/api/learn/animation/jobs/results/${artifact.artifactId}?board=${BOARD.id}${features.length ? `&features=${encodeURIComponent(features.join(','))}` : ''}`), env, { identity: async () => OWNER }).then(async r => ({ status: r.status, body: await r.json() }));
  return { ...s, seed, read };
}

test('the golden artifact is intact for the enabled phase and needs the five new features and action_motion', async () => {
  assert.equal(await artifactIntact(artifact, await artifactHashOf(artifact)), true);
  assert.deepEqual(needsFeatures(artifact).sort(), ['action_motion', ...FIVE].sort(), 'the five, and startsMotion on three actions');
  assert.deepEqual(clientProblems(artifact, { features: ANIMATION_CLIENT_FEATURES }), [], 'a client declaring all seven is given it');
});

test('generation: a client that declared only the two it had before would be refused every field, once each, so the repair is told what to remove', () => {
  const lines = clientProblems(artifact, { features: THE_TWO });
  assert.equal(lines.length, 8, 'surface, 2 trails, the arrow offset, 2 tip anchors, the clamp, the text readout');
  for (const line of lines) assert.match(line, /^(scene|readouts)\./);
  assert.ok(lines.every(line => !line.includes('\n')));
});

test('seeded, it is an ordinary saved result: served with all seven features, 409 client_update_required without any one of the five', async t => {
  const s = stack(t);
  const seeded = await s.seed({ boardId: BOARD.id, artifact });
  assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
  const all = await s.read(ANIMATION_CLIENT_FEATURES);
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.artifact, validateAnimationArtifact(artifact).value, 'the artifact that was seeded, as the contract stores it (defaults filled)');
  const older = await s.read();
  assert.deepEqual([older.status, older.body.code], [409, 'client_update_required'], 'a browser that declares nothing');
  const before = await s.read(THE_TWO);
  assert.deepEqual([before.status, before.body.code], [409, 'client_update_required'], 'a build before the five (curve_radius and action_motion only)');
  for (const missing of FIVE) {
    const result = await s.read(ANIMATION_CLIENT_FEATURES.filter(f => f !== missing));
    assert.deepEqual([result.status, result.body.code], [409, 'client_update_required'], `without ${missing}`);
  }
});
