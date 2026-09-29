// packages/control-plane/test/learn-grade-routes.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { learnGradeRoute } from '../src/learn-grade-routes.js';

globalThis.__realFetch ??= globalThis.fetch;

// A learner world: sqlite LEARN_DB, a control plane that vouches for the
// caller (cookie `who=<email>`), and a stubbed Jev gateway on global fetch.
export function world(t, { envExtra = {} } = {}) {
  const { sqlite, LEARN_DB } = learnDb(t);
  const jevBodies = [];
  const jevCalls = [];
  // Direct TypeSafe answers without gateway metadata; the gateway adds cost and a generation id.
  const defaultReply = (request, signal, url = '') => ({
    model: url.startsWith('https://api.typesafe.ai') ? 'jev-1.13.0' : 'typesafe-ai/jev',
    answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { type: 'noul', noul: id.startsWith('idea_') ? 0.9 : 0.05 }])),
    usage: { input_tokens: 321 },
    ...(url.startsWith('https://api.typesafe.ai') ? {} : { provider_metadata: { gateway: { cost: '0.0000135', generationId: `gen_${jevBodies.length}` } } }),
  });
  let reply = defaultReply;
  globalThis.fetch = async (url, init) => {
    assert.ok(['https://ai-gateway.vercel.sh/typesafe/v1/systemone', 'https://api.typesafe.ai/v1/systemone'].includes(String(url)), String(url));
    jevCalls.push({ url: String(url), auth: init.headers.Authorization });
    const request = JSON.parse(init.body);
    jevBodies.push(request);
    const out = await reply(request, init.signal, String(url));
    return out instanceof Response ? out : Response.json(out);
  };
  t.after(() => { globalThis.fetch = globalThis.__realFetch; });
  const env = {
    LEARN_DB,
    VERCEL_TYPESAFE_API_KEY: 'vck_test',
    TYPESAFE_API_KEY: 'ts_test',
    LEARN_BENCH_SECRET: 'bench-secret-0123',
    CONTROL_PLANE: {
      fetch: async req => {
        const email = (req.headers.get('cookie') || 'who=learner@test').replace('who=', '');
        const name = decodeURIComponent(new URL(req.url).pathname.split('/').pop());
        return Response.json({ name, org: 'team', email, hosting: name === 'aws-app' ? 'aws' : null });
      },
    },
    ...envExtra,
  };
  const post = (path, body, headers = {}) => learnGradeRoute(path, new Request(`https://dev.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }), env);
  const get = (pathWithQuery, headers = {}) => learnGradeRoute(pathWithQuery.split('?')[0], new Request(`https://dev.test${pathWithQuery}`, { headers }), env);
  return { sqlite, env, jevBodies, jevCalls, post, get, defaultReply, setReply: next => { reply = next; } };
}

export const gradeBody = (overrides = {}) => ({
  app: 'demo-app', attempt_id: 'attempt-0001', board: null, block_id: 'b1', mode: 'challenge',
  prompt: 'Why does softmax use exp? ```js\nMath.exp(1)\n```',
  expects: ['exp makes every score positive', 'dividing by the sum makes them add to one'],
  answer: 'exp makes them positive and then we divide by the sum', ...overrides,
});
const count = w => w.sqlite.prepare('SELECT COUNT(*) AS n FROM learn_grades').get().n;
const BENCH = { 'X-Learn-Bench-Secret': 'bench-secret-0123' };

test('a canvas shadow grade calls direct TypeSafe once with pinned jev-1.13.0, never the gateway, and stores the row', async t => {
  const w = world(t);
  const response = await w.post('/api/learn/grade', gradeBody());
  assert.deepEqual(w.jevCalls, [{ url: 'https://api.typesafe.ai/v1/systemone', auth: 'Bearer ts_test' }]);
  assert.equal(w.jevBodies[0].model, 'jev-1.13.0');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, 'done');
  assert.equal(data.duplicate, false);
  assert.deepEqual(data.jev.ideas, [{ text: 'exp makes every score positive', p: 0.9 }, { text: 'dividing by the sum makes them add to one', p: 0.9 }]);
  assert.equal(data.jev.verdict, 'good');
  assert.equal(data.transport, 'direct');
  assert.equal(data.model, 'jev-1.13.0');
  assert.equal(data.generation_id, null);
  assert.equal(data.grader_protocol_version, 'jev-grade-p1');
  assert.equal(data.cost, null, 'direct TypeSafe reports no cost');
  assert.equal(data.input_tokens, 321);
  assert.equal(data.retries, 0);
  const row = w.sqlite.prepare('SELECT * FROM learn_grades').get();
  assert.equal(row.source, 'canvas');
  assert.equal(row.email, 'learner@test');
  assert.equal(row.jev_tokens, 321);
  assert.equal(row.jev_model, 'jev-1.13.0');
  assert.equal(row.grader_protocol_version, 'jev-grade-p1');
  assert.equal(w.jevBodies.length, 1);
});

test('only challenge, key ideas and the answer reach Jev - no identity, no fenced prompt code', async t => {
  const w = world(t);
  await w.post('/api/learn/grade', gradeBody({ board: 'my-board', block_id: 'block-secret' }));
  const sent = JSON.stringify(w.jevBodies[0]);
  assert.deepEqual(Object.keys(w.jevBodies[0].state), ['challenge', 'key_ideas', 'learner_answer']);
  for (const leak of ['learner@test', '"team"', 'demo-app', 'my-board', 'block-secret', 'Math.exp(1)']) assert.ok(!sent.includes(leak), leak);
});

// Review focus 4: the answer goes verbatim; a code-only idea is refused.
test('a fenced answer is sent verbatim, while a code-only idea is refused', async t => {
  const w = world(t);
  const answer = 'like ```py\nz = exp(x)\n``` then divide';
  await w.post('/api/learn/grade', gradeBody({ answer }));
  assert.equal(w.jevBodies[0].state.learner_answer, answer);
  assert.equal((await w.post('/api/learn/grade', gradeBody({ attempt_id: 'attempt-0002', expects: ['```js\ncode\n```'] }))).status, 400);
});

test('the body cannot label a row bench', async t => {
  const w = world(t);
  await w.post('/api/learn/grade', gradeBody({ source: 'bench', set: 'benchmark-v1', bench_run: 'benchmark-v1-x' }));
  assert.deepEqual({ ...w.sqlite.prepare('SELECT source, bench_run, bench_set FROM learn_grades').get() }, { source: 'canvas', bench_run: null, bench_set: null });
});

test('input limits answer 400 and store and call nothing', async t => {
  const w = world(t);
  const bad = [
    { attempt_id: 'short' }, { attempt_id: 'has space in it' }, { mode: 'quiz' }, { mode: undefined },
    { prompt: 'x'.repeat(4001) }, { expects: [] }, { expects: Array(9).fill('idea') }, { expects: ['x'.repeat(301)] },
    { expects: [''] }, { expects: ['```js\ncode\n```'] }, { answer: '' }, { answer: 'x'.repeat(4001) },
  ];
  for (const overrides of bad) assert.equal((await w.post('/api/learn/grade', gradeBody(overrides))).status, 400, JSON.stringify(overrides).slice(0, 60));
  assert.equal(w.jevBodies.length, 0);
  assert.equal(count(w), 0);
});

test('no TypeSafe key: a canvas grade is 503 with the fix, no row, no prune, no call', async t => {
  const w = world(t, { envExtra: { TYPESAFE_API_KEY: '' } });
  w.sqlite.exec("INSERT INTO learn_grades (org, email, app, mode, attempt_id, grader_protocol_version, prompt, expects, answer, created_at) VALUES ('team','learner@test','demo-app','challenge','attempt-ancient','jev-grade-p1','p','[]','a', datetime('now','-100 days'))");
  const response = await w.post('/api/learn/grade', gradeBody());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'Direct TypeSafe is not configured: set TYPESAFE_API_KEY on this worker.');
  assert.equal(count(w), 1, 'no row written and no prune run');
  assert.equal(w.jevBodies.length, 0);
});

test('a canvas grade does not need the gateway key; a gateway bench grade still does', async t => {
  const w = world(t, { envExtra: { VERCEL_TYPESAFE_API_KEY: '' } });
  assert.equal((await w.post('/api/learn/grade', gradeBody())).status, 200);
  const run = 'benchmark-v1-2026-09-28-z';
  const bench = await w.post('/api/learn/grade/bench', gradeBody({ attempt_id: `${run}:c01`, set: 'benchmark-v1', bench_run: run }), BENCH);
  assert.equal(bench.status, 503);
  assert.equal((await bench.json()).error, 'Jev is not configured: set VERCEL_TYPESAFE_API_KEY on this worker.');
  assert.deepEqual(w.jevCalls.map(call => call.url), ['https://api.typesafe.ai/v1/systemone']);
});

test('subscription-only mode: 503, nothing called', async t => {
  const w = world(t, { envExtra: { SUBSCRIPTION_ONLY: 'true' } });
  const response = await w.post('/api/learn/grade', gradeBody());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'Jev is off in subscription-only mode.');
  assert.equal(count(w), 0);
  assert.equal(w.jevCalls.length, 0);
});

test('a grade prunes rows older than 90 days first', async t => {
  const w = world(t);
  w.sqlite.exec("INSERT INTO learn_grades (org, email, app, mode, attempt_id, grader_protocol_version, prompt, expects, answer, created_at) VALUES ('team','learner@test','demo-app','challenge','attempt-ancient','jev-grade-p1','p','[]','a', datetime('now','-91 days'))");
  await w.post('/api/learn/grade', gradeBody());
  assert.equal(w.sqlite.prepare("SELECT COUNT(*) AS n FROM learn_grades WHERE attempt_id = 'attempt-ancient'").get().n, 0);
});

test('duplicates never call Jev again: done, failed, pending, incomplete', async t => {
  const w = world(t);
  const first = await (await w.post('/api/learn/grade', gradeBody())).json();
  const again = await w.post('/api/learn/grade', gradeBody());
  assert.equal(again.status, 200);
  const duplicate = await again.json();
  assert.equal(duplicate.grade_id, first.grade_id);
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.jev, first.jev);
  assert.equal(duplicate.generation_id, first.generation_id);
  assert.equal(duplicate.cost, first.cost);
  assert.equal(duplicate.input_tokens, 321);
  assert.equal(w.jevBodies.length, 1);

  w.setReply(() => new Response(JSON.stringify({ message: 'bad key' }), { status: 401 }));
  const failed = await w.post('/api/learn/grade', gradeBody({ attempt_id: 'attempt-0002' }));
  assert.equal(failed.status, 502);
  const failedBody = await failed.json();
  assert.equal(failedBody.status, 'failed');
  assert.equal(failedBody.duplicate, false);
  assert.equal(failedBody.error, 'Jev 401: bad key');
  const failedAgain = await w.post('/api/learn/grade', gradeBody({ attempt_id: 'attempt-0002' }));
  assert.equal(failedAgain.status, 502);
  assert.deepEqual(await failedAgain.json(), { grade_id: failedBody.grade_id, status: 'failed', duplicate: true, error: 'Jev 401: bad key' });
  assert.equal(w.jevBodies.length, 2);

  w.sqlite.exec("INSERT INTO learn_grades (org, email, app, mode, attempt_id, grader_protocol_version, prompt, expects, answer) VALUES ('team','learner@test','demo-app','challenge','attempt-pend','jev-grade-p1','p','[\"x\"]','a')");
  const pendingId = w.sqlite.prepare("SELECT id FROM learn_grades WHERE attempt_id = 'attempt-pend'").get().id;
  const pending = await w.post('/api/learn/grade', gradeBody({ attempt_id: 'attempt-pend' }));
  assert.equal(pending.status, 202);
  assert.deepEqual(await pending.json(), { grade_id: pendingId, status: 'pending' });
  w.sqlite.exec("UPDATE learn_grades SET created_at = datetime('now','-3 minutes') WHERE attempt_id = 'attempt-pend'");
  const incomplete = await w.post('/api/learn/grade', gradeBody({ attempt_id: 'attempt-pend' }));
  assert.equal(incomplete.status, 409);
  assert.deepEqual(await incomplete.json(), { grade_id: pendingId, status: 'incomplete', error: 'This attempt never finished. A new attempt needs a new attempt_id.' });
  assert.equal(w.jevBodies.length, 2);
});

test('a duplicate recomputes the verdict from stored probabilities', async t => {
  const w = world(t);
  const first = await (await w.post('/api/learn/grade', gradeBody())).json();
  w.sqlite.exec(`UPDATE learn_grades SET jev = '{"ideas":[0.9,0.5],"misconception":0.05,"non_attempt":0.05,"verdict":"good"}' WHERE id = ${first.grade_id}`);
  const duplicate = await (await w.post('/api/learn/grade', gradeBody())).json();
  assert.equal(duplicate.jev.verdict, 'unsure');
});

test('two concurrent posts of one attempt make one Jev call', async t => {
  const w = world(t);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  w.setReply(async request => { await gate; return w.defaultReply(request); });
  const first = w.post('/api/learn/grade', gradeBody());
  while (count(w) === 0) await new Promise(resolve => setTimeout(resolve, 1));
  const second = await w.post('/api/learn/grade', gradeBody());
  assert.equal(second.status, 202);
  release();
  assert.equal((await first).status, 200);
  assert.equal(w.jevBodies.length, 1);
});

// Review focus 1: a missing idea fails the row instead of scoring 0.
test('a Jev reply missing an idea fails the row', async t => {
  const w = world(t);
  w.setReply(() => ({ answers: { idea_0: { type: 'noul', noul: 0.9 }, misconception: { type: 'noul', noul: 0.1 }, non_attempt: { type: 'noul', noul: 0.1 } } }));
  const response = await w.post('/api/learn/grade', gradeBody());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'Jev returned no usable answer for idea_1');
  assert.equal(w.sqlite.prepare('SELECT jev_error FROM learn_grades').get().jev_error, 'Jev returned no usable answer for idea_1');
});

// Review focus 3: a 402 is stored once, with its message.
test('an out-of-credit gateway fails once and keeps the reason', async t => {
  const w = world(t);
  w.setReply(() => new Response(JSON.stringify({ message: 'insufficient credits' }), { status: 402 }));
  const response = await w.post('/api/learn/grade', gradeBody());
  assert.equal(response.status, 502);
  assert.equal(w.jevBodies.length, 1);
  assert.equal(w.sqlite.prepare('SELECT jev_error FROM learn_grades').get().jev_error, 'Jev 402: insufficient credits');
});

test('a Jev timeout is recorded as a failure, not retried, and logged as an Opus-only grade', async t => {
  const w = world(t);
  const logged = t.mock.method(console, 'log', () => {});
  w.setReply((request, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  const response = await w.post('/api/learn/grade', gradeBody());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'Jev timed out after 3000 ms');
  assert.equal(w.sqlite.prepare('SELECT jev_error FROM learn_grades').get().jev_error, 'Jev timed out after 3000 ms');
  assert.equal(w.jevBodies.length, 1);
  assert.match(logged.mock.calls.map(call => call.arguments.join(' ')).join('\n'), /learn-grade: Jev unavailable; Opus stood alone, grade \d+: Jev timed out after 3000 ms/);
});

test('an AWS-hosted app is refused before anything is stored', async t => {
  const w = world(t);
  assert.equal((await w.post('/api/learn/grade', gradeBody({ app: 'aws-app' }))).status, 403);
  assert.equal(count(w), 0);
  assert.equal(w.jevCalls.length, 0, 'no Jev call on any transport');
});

test('bench rows need the bench secret; the deployed app cannot make them', async t => {
  const w = world(t);
  const run = 'benchmark-v1-2026-09-25-a';
  const body = gradeBody({ attempt_id: `${run}:c01-all`, set: 'benchmark-v1', bench_run: run });
  assert.equal((await w.post('/api/learn/grade/bench', body)).status, 403);
  assert.equal((await w.post('/api/learn/grade/bench', body, { 'X-Learn-Bench-Secret': 'wrong' })).status, 403);
  const response = await w.post('/api/learn/grade/bench', body, BENCH);
  assert.equal(response.status, 200);
  assert.deepEqual({ ...w.sqlite.prepare('SELECT source, bench_run, bench_set FROM learn_grades').get() }, { source: 'bench', bench_run: run, bench_set: 'benchmark-v1' });
  assert.equal((await w.post('/api/learn/grade/bench', { ...body, attempt_id: 'other-run-000:c01' }, BENCH)).status, 400);
  assert.equal((await w.post('/api/learn/grade/bench', { ...body, set: 'benchmark-v9' }, BENCH)).status, 400);
  assert.equal((await w.post('/api/learn/grade/bench', { ...body, bench_run: 'x' }, BENCH)).status, 400);
  assert.equal((await w.post('/api/learn/grade/bench', body, BENCH)).status, 200, 'a re-run of the same bench_run replays');
  assert.equal(w.jevBodies.length, 1);
});

test('a bench grade for a repo-* app authorizes through repositoryAccess, with org/email from that path, and never forwards the bench secret to CONTROL_PLANE', async t => {
  const seenBenchSecret = [];
  const w = world(t, {
    envExtra: {
      CONTROL_PLANE: {
        fetch: async req => {
          seenBenchSecret.push(req.headers.get('x-learn-bench-secret'));
          return Response.json({ org: 'team', email: 'repo-owner@test' });
        },
      },
    },
  });
  w.sqlite.exec("INSERT INTO repository_apps(id, org, name, owner_email, repo, branch, commit_sha, status) VALUES(1,'team','repo-example','repo-owner@test','example/project','main','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','ready')");
  const run = 'benchmark-v1-2026-09-25-a';
  const body = gradeBody({ app: 'repo-example', attempt_id: `${run}:c01-all`, set: 'benchmark-v1', bench_run: run });
  const response = await w.post('/api/learn/grade/bench', body, BENCH);
  assert.equal(response.status, 200);
  const { grade_id: id } = await response.json();
  assert.deepEqual({ ...w.sqlite.prepare('SELECT org, email, source FROM learn_grades').get() }, { org: 'team', email: 'repo-owner@test', source: 'bench' });
  assert.ok(seenBenchSecret.length > 0, 'CONTROL_PLANE was called for identity');
  assert.ok(seenBenchSecret.every(value => value === null), 'the bench secret never reached CONTROL_PLANE');

  const baseline = await w.post(`/api/learn/grade/${id}/baseline`, { app: 'repo-example', verdict: 'good', ms: 10 });
  assert.equal(baseline.status, 200);
  assert.deepEqual({ ...w.sqlite.prepare('SELECT baseline_verdict, baseline_ms FROM learn_grades').get() }, { baseline_verdict: 'good', baseline_ms: 10 });
});

test('the bench route is absent when no bench secret is set', async t => {
  const w = world(t, { envExtra: { LEARN_BENCH_SECRET: '' } });
  assert.equal((await w.post('/api/learn/grade/bench', gradeBody(), { 'X-Learn-Bench-Secret': '' })).status, 404);
});

test('holdout rows keep only hashes of their text', async t => {
  const w = world(t);
  const run = 'benchmark-v1-holdout-2026-09-25-a';
  const body = gradeBody({ attempt_id: `${run}:h01-all`, set: 'benchmark-v1-holdout', bench_run: run });
  const data = await (await w.post('/api/learn/grade/bench', body, BENCH)).json();
  assert.equal(data.jev.ideas[0].text, body.expects[0], 'the caller still gets its own idea text back');
  const row = w.sqlite.prepare('SELECT prompt, expects, answer FROM learn_grades').get();
  assert.match(row.prompt, /^sha256:[0-9a-f]{64}$/);
  assert.match(row.answer, /^sha256:[0-9a-f]{64}$/);
  for (const idea of JSON.parse(row.expects)) assert.match(idea, /^sha256:[0-9a-f]{64}$/);
  assert.equal(w.jevBodies[0].state.learner_answer, body.answer, 'Jev still grades the real text');
  const duplicate = await (await w.post('/api/learn/grade/bench', body, BENCH)).json();
  assert.equal(duplicate.jev.ideas[0].text, body.expects[0], 'a holdout duplicate names ideas from the request, not the hashes');
});

test('unknown paths are not ours', async t => {
  const w = world(t);
  assert.equal(await w.post('/api/learn/grades', gradeBody()), null);
});

test('a baseline is recorded once, with validated ms, only for the owner', async t => {
  const w = world(t);
  const { grade_id: id } = await (await w.post('/api/learn/grade', gradeBody())).json();
  const baseline = (body, headers) => w.post(`/api/learn/grade/${id}/baseline`, { app: 'demo-app', ...body }, headers);
  for (const ms of [-1, 1.5, 600001, '100', null, Infinity]) assert.equal((await baseline({ verdict: 'good', ms })).status, 400, String(ms));
  assert.equal((await baseline({ verdict: 'maybe', ms: 10 })).status, 400);
  assert.equal((await baseline({ ms: 10 })).status, 400, 'verdict must be present');
  assert.equal((await w.post('/api/learn/grade/abc/baseline', { app: 'demo-app', verdict: 'good', ms: 10 })).status, 400);
  assert.equal((await baseline({ verdict: 'good', ms: 10 }, { cookie: 'who=someone@test' })).status, 404);
  assert.equal((await baseline({ verdict: null, ms: 600000 })).status, 200);
  assert.equal((await baseline({ verdict: 'good', ms: 10 })).status, 404, 'one-shot');
  assert.deepEqual({ ...w.sqlite.prepare('SELECT baseline_verdict, baseline_ms FROM learn_grades').get() }, { baseline_verdict: null, baseline_ms: 600000 });
});

test('the report reads app from the query, covers only my canvas rows, and prunes', async t => {
  const w = world(t);
  await w.post('/api/learn/grade', gradeBody());
  w.sqlite.exec("INSERT INTO learn_grades (org, email, app, mode, attempt_id, grader_protocol_version, prompt, expects, answer, created_at) VALUES ('team','learner@test','demo-app','challenge','attempt-stuck','jev-grade-p1','p','[\"x\"]','a', datetime('now','-20 minutes'))");
  w.sqlite.exec("INSERT INTO learn_grades (org, email, app, mode, attempt_id, grader_protocol_version, prompt, expects, answer, created_at) VALUES ('team','learner@test','demo-app','challenge','attempt-ancient','jev-grade-p1','p','[\"x\"]','a', datetime('now','-91 days'))");
  w.sqlite.exec("INSERT INTO learn_grades (org, email, app, mode, attempt_id, grader_protocol_version, prompt, expects, answer) VALUES ('team','someone@test','demo-app','challenge','attempt-theirs','jev-grade-p1','p','[\"x\"]','a')");
  const response = await w.get('/api/learn/grade/report?app=demo-app');
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.app, 'demo-app');
  assert.equal(report.overall.total, 2, 'mine only: the fresh grade and the stuck one');
  assert.equal(report.overall.eligible, 1);
  assert.deepEqual(report.overall.jev.incomplete, { k: 1, n: 1, pct: 100 });
  assert.equal(w.sqlite.prepare("SELECT COUNT(*) AS n FROM learn_grades WHERE attempt_id = 'attempt-ancient'").get().n, 0, 'report pruned');
  assert.equal((await w.get('/api/learn/grade/report')).status, 400, 'no app in the query');
  assert.ok(!JSON.stringify(report).includes('exp makes'), 'no answer or idea text in the report');
});

test('the bench route prunes too', async t => {
  const w = world(t);
  w.sqlite.exec("INSERT INTO learn_grades (org, email, app, mode, attempt_id, grader_protocol_version, prompt, expects, answer, created_at) VALUES ('team','learner@test','demo-app','challenge','attempt-ancient','jev-grade-p1','p','[]','a', datetime('now','-91 days'))");
  const run = 'benchmark-v1-2026-09-25-a';
  await w.post('/api/learn/grade/bench', gradeBody({ attempt_id: `${run}:c01-all`, set: 'benchmark-v1', bench_run: run }), BENCH);
  assert.equal(w.sqlite.prepare("SELECT COUNT(*) AS n FROM learn_grades WHERE attempt_id = 'attempt-ancient'").get().n, 0);
});

test('the bench can grade through either transport with the same request body; the gateway stays for diagnostics', async t => {
  const w = world(t);
  const run = 'transport-ab-2026-09-28-a';
  const body = transport => gradeBody({ attempt_id: `${run}:${transport}:c01`, set: 'benchmark-v1', bench_run: run, transport });
  const gateway = await (await w.post('/api/learn/grade/bench', body('gateway'), BENCH)).json();
  const direct = await (await w.post('/api/learn/grade/bench', body('direct'), BENCH)).json();
  assert.deepEqual(w.jevCalls, [
    { url: 'https://ai-gateway.vercel.sh/typesafe/v1/systemone', auth: 'Bearer vck_test' },
    { url: 'https://api.typesafe.ai/v1/systemone', auth: 'Bearer ts_test' },
  ]);
  const [a, b] = w.jevBodies;
  assert.equal(a.model, 'typesafe-ai/jev');
  assert.equal(b.model, 'jev-1.13.0');
  assert.deepEqual({ ...a, model: null }, { ...b, model: null }, 'state and questions are identical');
  assert.equal(gateway.transport, 'gateway');
  assert.equal(direct.transport, 'direct');
  assert.equal(direct.status, 'done');
  // A canvas grade cannot pick the transport: asking for the gateway still goes direct.
  await w.post('/api/learn/grade', { ...gradeBody({ attempt_id: 'attempt-canvas-1' }), transport: 'gateway' });
  assert.equal(w.jevCalls.at(-1).url, 'https://api.typesafe.ai/v1/systemone');
});

test('direct transport: 503 and no row without TYPESAFE_API_KEY; only benchmark-v1; unknown transport is 400', async t => {
  const w = world(t, { envExtra: { TYPESAFE_API_KEY: '' } });
  const run = 'transport-ab-2026-09-28-a';
  const body = (transport, extra = {}) => gradeBody({ attempt_id: `${run}:${transport}:c01`, set: 'benchmark-v1', bench_run: run, transport, ...extra });
  const missing = await w.post('/api/learn/grade/bench', body('direct'), BENCH);
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error, 'Direct TypeSafe is not configured: set TYPESAFE_API_KEY on this worker.');
  assert.equal(count(w), 0);
  assert.equal((await w.post('/api/learn/grade/bench', body('direct', { set: 'benchmark-v1-holdout' }), BENCH)).status, 400);
  assert.equal((await w.post('/api/learn/grade/bench', body('carrier-pigeon'), BENCH)).status, 400);
  assert.equal(w.jevCalls.length, 0);
});

test('a failed Jev call reports its transport, error code and status', async t => {
  const w = world(t, { envExtra: { TYPESAFE_API_KEY: 'ts_test' } });
  w.setReply(() => Response.json({ message: 'nope', error_type: 'invalid_request' }, { status: 400 }));
  const run = 'transport-ab-2026-09-28-a';
  const failed = await (await w.post('/api/learn/grade/bench', gradeBody({ attempt_id: `${run}:direct:c01`, set: 'benchmark-v1', bench_run: run, transport: 'direct' }), BENCH)).json();
  assert.deepEqual({ transport: failed.transport, error_code: failed.error_code, error_status: failed.error_status }, { transport: 'direct', error_code: 'http', error_status: 400 });
});
