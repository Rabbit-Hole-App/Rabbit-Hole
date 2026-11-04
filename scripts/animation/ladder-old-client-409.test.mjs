// MVP3 smoke: the OLD-CLIENT path for the five new client features, through the real route and the real Durable Object (fake storage,
// fake model; no network, no model call). Run by ladder-smoke.mjs mvp3 (env LADDER_FLAGS and LADDER_GOLDEN come from ladder-smoke.json);
// runnable alone:  node --test scripts/animation/ladder-old-client-409.test.mjs
//
// The golden SGD artifact (packages/web/src/animation3d/testdata/sgd-golden.json, AN-19) uses all five features, so it is the one stored
// scene that needs every flag. For each flag F the reader that declares everything EXCEPT F must be refused with 409
// client_update_required (the ablation proves each of the five is gated, not just that some gate exists); the reader that declares all
// is served; a scene that predates MVP3 is still served to every reader. The same ablation is applied at authoring time (clientProblems).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactHashOf, artifactIntact, clientProblems } from '../../packages/control-plane/src/animation-author.js';
import { CLIENT_UPDATE, animationRoute } from '../../packages/control-plane/src/animation-job.js';
import { BOARD, OWNER, animationStack } from '../../packages/control-plane/test/animation-fixture.js';
import { ANIMATION_CLIENT_FEATURES } from '../../packages/web/src/animation3d/capabilities.js';
import { animationClient } from '../../packages/web/src/animation3d/client.js';
import { watchFixture } from '../../packages/web/src/animation3d/fixtures.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FLAGS = (process.env.LADDER_FLAGS || 'surface_grid,trail_points,text_readout,arrow_anchor,clamp').split(',').filter(Boolean);
const GOLDEN = process.env.LADDER_GOLDEN || 'packages/web/src/animation3d/testdata/sgd-golden.json';
const goldenPath = isAbsolute(GOLDEN) ? GOLDEN : resolve(ROOT, GOLDEN);
const ALL = [...ANIMATION_CLIENT_FEATURES];
const BASE = ALL.filter(f => !FLAGS.includes(f)); // what the build before MVP3 declares
const raw = existsSync(goldenPath) ? JSON.parse(readFileSync(goldenPath, 'utf8')) : null;
const golden = raw && (raw.artifact ?? raw); // sgd-golden.json wraps the artifact: { note, plan, artifact }

// A stack holding one saved result and the browser's fetch for it (animation-old-client.test.js stackWith, same shape).
async function stackWith(t, artifact) {
  const s = animationStack(t, { pipeline: { intact: artifactIntact } });
  s.state.data.set(`result:${artifact.artifactId}`, { kind: 'animation3d', artifact, identity: { artifactHash: await artifactHashOf(artifact) }, owner: { org: OWNER.org, email: OWNER.email }, boardId: BOARD.id, cardId: 'card_1' });
  const env = { ...s.env, ANIMATION_JOBS: { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) } };
  const read = async features => {
    const q = features === undefined ? '' : `&features=${encodeURIComponent(features.join(','))}`;
    const r = await animationRoute(`/api/learn/animation/jobs/results/${artifact.artifactId}`, new Request(`https://dev.test/api/learn/animation/jobs/results/${artifact.artifactId}?board=${BOARD.id}${q}`), env, { identity: async () => OWNER });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  return { read };
}

test('the client of this candidate declares the five features, and the base ones it had before', () => {
  assert.ok(FLAGS.length >= 1, 'LADDER_FLAGS is empty');
  for (const f of FLAGS) assert.ok(ALL.includes(f), `ANIMATION_CLIENT_FEATURES does not declare ${f}: ${ALL.join(', ')}`);
  const sent = [];
  const fetchJson = async (path, opts = {}) => { sent.push({ path, body: opts.body ? JSON.parse(opts.body) : null }); return {}; };
  animationClient(fetchJson, 'b1').create({ requestId: 'r', cardId: 'c', prompt: 'p' });
  animationClient(fetchJson, 'b1').result('ar_1');
  return Promise.resolve().then(() => {
    assert.deepEqual(sent[0].body.features, ALL, 'create declares every feature');
    for (const f of FLAGS) assert.match(sent[1].path, new RegExp(`features=[^&]*${f}`), `a result read declares ${f}`);
  });
});

test('the golden SGD artifact is in the candidate and valid for the candidate contract', async () => {
  assert.ok(golden, `missing ${GOLDEN}: MVP3 ships the golden SGD fixture (AN-19)`);
  assert.ok(golden.artifactId, 'the golden must carry an artifactId to be stored and read like a result');
  assert.equal(await artifactIntact(golden, await artifactHashOf(golden)), true, 'validateAnimationArtifact refuses the golden under the enabled capabilities');
});

test('loading: a reader that does not declare every feature the scene needs is refused with 409 client_update_required', { skip: !golden && 'no golden artifact' }, async t => {
  const s = await stackWith(t, golden);
  const refused = async (label, features) => {
    const r = await s.read(features);
    assert.deepEqual([r.status, r.body.code, r.body.error, r.body.artifact], [409, 'client_update_required', CLIENT_UPDATE, undefined], `${label}: declared ${JSON.stringify(features)}`);
  };
  await refused('no features parameter (the oldest build)', undefined);
  await refused('empty', []);
  await refused('unknown names only', ['bogus']);
  if (BASE.length) await refused('the build before MVP3', BASE);
  for (const f of FLAGS) await refused(`everything except ${f}`, ALL.filter(x => x !== f));
  const ok = await s.read(ALL);
  assert.equal(ok.status, 200, `a reader declaring all ${ALL.length} features is served: ${JSON.stringify(ok.body).slice(0, 120)}`);
  assert.equal(ok.body.artifact?.artifactId, golden.artifactId);
});

test('loading: a scene that predates MVP3 is still served to every reader, so nothing regresses', async t => {
  const old = { ...watchFixture.artifact, artifactId: watchFixture.artifact.artifactId || 'ar_ladder_smoke_watch' };
  const s = await stackWith(t, old);
  for (const features of [undefined, [], BASE, ALL]) assert.equal((await s.read(features)).status, 200, `declared ${JSON.stringify(features)}`);
});

test('authoring: a draft that uses a feature the asking browser did not declare is refused for repair, one flag at a time', { skip: !golden && 'no golden artifact' }, () => {
  assert.deepEqual(clientProblems(golden, { features: ALL }), [], 'declaring everything is never a problem');
  assert.ok(clientProblems(golden, { features: [] }).length >= 1, 'declaring nothing: refused');
  for (const f of FLAGS) assert.ok(clientProblems(golden, { features: ALL.filter(x => x !== f) }).length >= 1, `the golden uses ${f} and a browser without it is not refused`);
  assert.deepEqual(clientProblems(watchFixture.artifact, { features: [] }), [], 'a scene that uses none is never a problem');
});
