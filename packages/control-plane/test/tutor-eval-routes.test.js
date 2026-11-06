// /api/learn/tutor-eval (src/tutor-eval-routes.js): owner-only by users.id, 404 for everyone else and while unset;
// declare, put, complete and retrieve exact bytes over HTTP, on node:sqlite from repository-schema.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { learnDb } from './learn-grade-fixture.js';
import { tutorEvalRoute, MAX_ARTIFACT_BYTES } from '../src/tutor-eval-routes.js';
import { CHUNK_BYTES } from '../src/tutor-eval-archive.js';

const OWNER = 'u_owner_0001';
const base = 'https://preview.digrabbithole.com/api/learn/tutor-eval/';
const sha = b => createHash('sha256').update(b).digest('hex');
const exec = { execution_id: 'paid-20261008T180918Z-01a7a508', run_id: 'paid-2026-10-08', run_started_at: '2026-10-08T18:09:18.000Z', run_finished_at: '2026-10-08T18:31:02.000Z',
  topic: 'logistic-regression', mode: 'real', status: 'completed', source_sha: '01a7a508'.padEnd(40, '0'), tested_tree: 'b'.repeat(40), harness_version: '2cb65b39'.padEnd(40, '0'),
  anthropic_usd: 2.24, anthropic_calls: 9, jev_cost_note: 'provider reports no cost; included nowhere', artifact_count: 2 };
function setup(t, { owner = OWNER, as = OWNER } = {}) {
  const { LEARN_DB } = learnDb(t);
  const env = { LEARN_DB, ...(owner === 'UNSET' ? {} : { TUTOR_EVAL_OWNER_USER_ID: owner }) }; // UNSET: a default parameter would swallow undefined
  const identity = async () => as === null ? Response.json({ error: 'Sign in' }, { status: 401 }) : { email: 'o@x', org: 'o', userId: as };
  const call = (method, path, body, headers = {}) => {
    const req = new Request(base + path, { method, body, headers });
    return tutorEvalRoute(new URL(req.url).pathname, req, env, { identity });
  };
  return { call, env };
}

test('only the configured owner reaches the archive; everyone else, and everyone while it is unset, gets 404', async t => {
  for (const [why, opts] of [['another user', { as: 'u_someone_else' }], ['signed out', { as: null }], ['owner unset', { owner: 'UNSET' }], ['owner empty', { owner: '' }]]) {
    const { call } = setup(t, opts);
    for (const [method, path, body] of [['GET', 'executions'], ['POST', 'executions', JSON.stringify(exec)], ['GET', `executions/${exec.execution_id}`], ['GET', `executions/${exec.execution_id}/artifacts/run.json`], ['PUT', `executions/${exec.execution_id}/artifacts/run.json?kind=manifest`, '{}'], ['POST', `executions/${exec.execution_id}/complete`]]) {
      const r = await call(method, path, body);
      assert.equal(r.status, 404, `${why}: ${method} ${path}`);
      assert.equal(await r.text(), 'Not found', 'the same body as any missing page: nothing disclosed');
    }
  }
  const { call } = setup(t);
  assert.equal((await call('GET', 'executions')).status, 200);
  assert.equal(await tutorEvalRoute('/api/learn/tutor/plan', new Request(base), {}), null, 'other paths are not this route');
});

test('the owner declares, puts, completes and retrieves exact bytes; ETag is the sha256; nothing is cached', async t => {
  const { call } = setup(t);
  const created = await call('POST', 'executions', JSON.stringify({ ...exec, imported_by: 'spoofed' }));
  assert.equal(created.status, 201);
  assert.equal((await created.json()).execution.imported_by, OWNER, 'imported_by is the signed-in owner, never the body');
  assert.equal((await call('POST', 'executions', JSON.stringify(exec))).status, 200, 'a resumed declaration');
  assert.equal((await call('POST', 'executions', JSON.stringify({ ...exec, status: 'failed' }))).status, 409);
  const session = Buffer.alloc(CHUNK_BYTES + 99, 7), manifest = Buffer.from('{"run_id":"paid-2026-10-08"}');
  assert.equal((await call('PUT', `executions/${exec.execution_id}/artifacts/run.json?kind=manifest`, manifest, { 'content-type': 'application/json' })).status, 204);
  let incomplete = await call('POST', `executions/${exec.execution_id}/complete`);
  assert.equal(incomplete.status, 409, 'one of two artifacts: refused, visibly');
  assert.match((await incomplete.json()).error, /1 of 2 artifacts verified/);
  assert.equal((await call('PUT', `executions/${exec.execution_id}/artifacts/logistic-regression-novice.json?kind=session`, session)).status, 204);
  assert.equal((await call('PUT', `executions/${exec.execution_id}/artifacts/logistic-regression-novice.json?kind=session`, session)).status, 204, 'identical bytes again: no-op');
  assert.equal((await call('PUT', `executions/${exec.execution_id}/artifacts/logistic-regression-novice.json?kind=session`, Buffer.alloc(10))).status, 409, 'different bytes: refused');
  const done = await call('POST', `executions/${exec.execution_id}/complete`);
  assert.equal(done.status, 200); assert.equal((await done.json()).import.complete, true);
  const got = await call('GET', `executions/${exec.execution_id}/artifacts/logistic-regression-novice.json`);
  assert.equal(got.status, 200);
  const back = Buffer.from(await got.arrayBuffer());
  assert.ok(back.equals(session), 'exact bytes');
  assert.equal(got.headers.get('etag'), `"${sha(session)}"`);
  assert.equal(got.headers.get('cache-control'), 'no-store');
  assert.match(got.headers.get('content-disposition'), /^attachment; filename="logistic-regression-novice.json"$/);
  const one = await (await call('GET', `executions/${exec.execution_id}?kind=session`)).json();
  assert.deepEqual(one.artifacts.map(a => a.key), ['logistic-regression-novice.json']);
  assert.equal(one.import.complete, true);
  const list = await (await call('GET', 'executions?topic=logistic-regression&mode=real&status=completed')).json();
  assert.deepEqual(list.executions.map(e => [e.execution_id, e.anthropic_usd, e.jev_cost_usd]), [[exec.execution_id, 2.24, null]]);
});

test('bad requests are 400, missing things 404, oversized bodies 413, and there is no bulk export route', async t => {
  const { call } = setup(t);
  assert.equal((await call('POST', 'executions', 'not json')).status, 400);
  assert.equal((await call('POST', 'executions', JSON.stringify({ ...exec, mode: 'guessed' }))).status, 400);
  assert.equal((await call('GET', 'executions/nope')).status, 404);
  await call('POST', 'executions', JSON.stringify(exec));
  assert.equal((await call('PUT', `executions/${exec.execution_id}/artifacts/agg.json?kind=aggregate`, '{}')).status, 400, 'an aggregate needs its analysis_version');
  assert.equal((await call('GET', `executions/${exec.execution_id}/artifacts/missing.json`)).status, 404);
  assert.equal((await call('GET', `executions/${exec.execution_id}/export`)).status, 404, 'no bulk export (Parallel amendment 1)');
  const big = await call('PUT', `executions/${exec.execution_id}/artifacts/huge.json?kind=session`, 'x', { 'content-length': String(MAX_ARTIFACT_BYTES + 1) });
  assert.equal(big.status, 413);
});

test('the preview and production workers route /api/learn/tutor-eval/ through the owner gate', () => {
  const worker = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /import \{ tutorEvalRoute \} from '\.\.\/control-plane\/src\/tutor-eval-routes\.js';/);
  assert.match(worker, /if \(path\.startsWith\('\/api\/learn\/tutor-eval\/'\)\) return tutorEvalRoute\(path, req, env\);/);
  assert.ok(worker.indexOf("path.startsWith('/api/learn/tutor-eval/')") < worker.indexOf("path.startsWith('/api/learn/tutor/')"), 'before the tutor routes, so tutor-eval is never mistaken for them');
});

test('the archive owner is independent of subscription-only mode and of canvas ownership: only users.id opens it', async t => {
  const { LEARN_DB, sqlite } = learnDb(t);
  // A canvas owned by the non-owner, and the subscription owner set to the non-owner's email: neither grants access.
  sqlite.exec("INSERT INTO canvases (org, name, owner_email, title) VALUES ('o', 'canvas-1', 'other@x', 'Mine')");
  const modes = [{}, { SUBSCRIPTION_ONLY: 'true', SUBSCRIPTION_OWNER_EMAIL: 'other@x' }, { SUBSCRIPTION_ONLY: 'false', SUBSCRIPTION_OWNER_EMAIL: 'other@x' }];
  const callers = [['anonymous', async () => Response.json({ error: 'Sign in' }, { status: 401 })], ['canvas owner and subscription owner', async () => ({ email: 'other@x', org: 'o', userId: 'u_other' })],
    ['owner email but another users.id', async () => ({ email: 'o@x', org: 'o', userId: 'u_lookalike' })], ['no users.id', async () => ({ email: 'o@x', org: 'o', userId: null })]];
  for (const mode of modes) {
    const env = { LEARN_DB, TUTOR_EVAL_OWNER_USER_ID: OWNER, ...mode };
    for (const [who, identity] of callers) {
      const r = await tutorEvalRoute('/api/learn/tutor-eval/executions', new Request(`${base}executions`), env, { identity });
      assert.equal(r.status, 404, `${who} in ${JSON.stringify(mode)}`);
    }
    const ok = await tutorEvalRoute('/api/learn/tutor-eval/executions', new Request(`${base}executions`), env, { identity: async () => ({ email: 'o@x', org: 'o', userId: OWNER }) });
    assert.equal(ok.status, 200, `the owner in ${JSON.stringify(mode)}`);
  }
});
