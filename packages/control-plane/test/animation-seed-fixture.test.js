// The dev-only seed-fixture route (owner 2026-11-02): the OFFLINE correction fixture stored as an ordinary saved result for the owner's canvas, so the
// dev preview can show it with no model call. It must be unreachable in production, owner-only, accept only a labelled offline fixture, and store
// what the normal result route then serves (and gates for an older browser). The production vars are pinned in rabbit-hole-prod-config.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { artifactIntact } from '../src/animation-author.js';
import { ANIMATION_SEED_FIXTURE_PATH, animationRoute } from '../src/animation-job.js';
import { BOARD, OWNER, animationStack } from './animation-fixture.js';

const artifact = JSON.parse(readFileSync(new URL('./fixtures/animation-mvp1-correction-artifact.json', import.meta.url), 'utf8'));
function stack(t) {
  const s = animationStack(t, { pipeline: { intact: artifactIntact } });
  const namespace = { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) };
  const env = { ...s.env, ANIMATION_DIAGNOSTICS: 'true', ANIMATION_JOBS: namespace };
  const seed = (body, { who = OWNER, e = env } = {}) => animationRoute(ANIMATION_SEED_FIXTURE_PATH, new Request(`https://dev.test${ANIMATION_SEED_FIXTURE_PATH}`, { method: 'POST', body: JSON.stringify(body) }), e, { identity: async () => who }).then(async r => ({ status: r.status, body: await r.json() }));
  const read = (id, query = '', who = OWNER) => animationRoute(`/api/learn/animation/jobs/results/${id}`, new Request(`https://dev.test/api/learn/animation/jobs/results/${id}?board=${BOARD.id}${query}`), env, { identity: async () => who }).then(async r => ({ status: r.status, body: await r.json() }));
  return { ...s, env, seed, read };
}

test('without ANIMATION_DIAGNOSTICS the route is not there, even for the canvas owner, and it never reaches the job object', async t => {
  const s = stack(t), trap = { ...s.env, ANIMATION_DIAGNOSTICS: undefined, ANIMATION_JOBS: { get: () => assert.fail('a refused request reached the job object') } };
  for (const e of [trap, { ...trap, ANIMATION_DIAGNOSTICS: 'false' }, { ...trap, ANIMATION_DIAGNOSTICS: '1' }]) assert.equal((await s.seed({ boardId: BOARD.id, artifact }, { e })).status, 404);
});

test('only the canvas owner, and only a valid, intact artifact that says it is an offline fixture', async t => {
  const s = stack(t);
  assert.equal((await s.seed({ boardId: BOARD.id, artifact }, { who: { ...OWNER, email: 'someone-else@dev.test' } })).status, 404, 'not their canvas');
  assert.equal((await s.seed({ artifact })).status, 400, 'a board is required');
  const refused = async (change, why) => { const r = await s.seed({ boardId: BOARD.id, artifact: change(structuredClone(artifact)) }); assert.equal(r.status, 400, why); return r.body.error; };
  assert.match(await refused(a => ({ ...a, title: 'Stochastic gradient descent' }), 'an unlabelled title'), /offline fixture in its title and description/);
  assert.match(await refused(a => ({ ...a, description: 'A bowl of tubes.' }), 'an unlabelled description'), /offline fixture/);
  assert.match(await refused(a => ({ ...a, readouts: 'x' }), 'an invalid artifact'), /does not validate/);
  assert.match(await refused(a => { a.program.source += '\n//changed'; return a; }, 'a tampered program'), /does not validate|not intact/);
  assert.equal((await s.seed({ boardId: BOARD.id })).status, 400, 'no artifact');
});

test('seeded, it is an ordinary saved result: the normal read serves it to its owner with the feature, answers an older browser 409 client_update_required, and nobody else may read it', async t => {
  const s = stack(t);
  const first = await s.seed({ boardId: BOARD.id, artifact }), again = await s.seed({ boardId: BOARD.id, artifact });
  assert.equal(first.status, 200);
  assert.deepEqual(again.body, first.body, 'seeding twice is the same result');
  assert.deepEqual([first.body.resultId, first.body.cardId], [artifact.artifactId, `fixture-${artifact.artifactId.slice(3, 15)}`]);
  const ok = await s.read(artifact.artifactId, '&features=curve_radius%2Caction_motion');
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.artifact, artifact, 'exactly the artifact that was seeded');
  assert.equal(ok.body.execution.allowed, true);
  const older = await s.read(artifact.artifactId);
  assert.deepEqual([older.status, older.body.code], [409, 'client_update_required'], 'the fixture uses tube curves: a browser that did not declare them is told to update');
  const tubesOnly = await s.read(artifact.artifactId, '&features=curve_radius');
  assert.deepEqual([tubesOnly.status, tubesOnly.body.code], [409, 'client_update_required'], 'and a build before the one-step declaration (tubes only) is told too');
  assert.equal((await s.read(artifact.artifactId, '&features=curve_radius%2Caction_motion', { ...OWNER, email: 'someone-else@dev.test' })).status, 404);
  const record = s.state.data.get(`result:${artifact.artifactId}`);
  assert.equal(record.fixture, true, 'marked as a fixture in storage');
  assert.deepEqual(record.owner, { org: OWNER.org, email: OWNER.email });
});
