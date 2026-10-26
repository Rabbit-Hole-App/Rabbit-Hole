// Failure handling of the Motion orchestrator (owner brief 2026-10-25, failed production job 61f70171): every way a job stops on one of OUR
// limits has its own machine-readable code; a job that cannot fit its ceiling is refused before any paid work; every refusal is logged with
// its job, stage, need and left; recovery is offered only for the next stage it can actually run. Fake transports only: no model, no render,
// no money.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requestSpendBound } from '../../control-plane/src/learn-spend.js';
import { PRODUCTION_POLICY, RECOVERY_POLICY, motionOrchestrator, nextStage, preflight, recoveryActions, requestSize, requiredPath, sealCheckpoint, signGrant } from './orchestrator.mjs';
import { MANDATORY_PATH, modelsFor, pathBound, pathFloor } from './spend-bound.mjs';

const TOKEN = 'o'.repeat(40);
const MODEL = 'claude-opus-5-5';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 500; i++) { if (await fn()) return; await sleep(10); } assert.fail(`timed out waiting for ${what}`); };
let keys = 0;
const grantFor = (boot, { micros = 8_958_600, key = `op-fail-${++keys}-key` } = {}) => {
  const at = Math.floor(Date.now() / 1000);
  return { idempotency_key: key, grant: { micros, issued_at: at, boot, sig: signGrant(TOKEN, key, micros, at, boot) } };
};
async function start(t, { call = async () => new Response('{}'), ...options } = {}) {
  const lines = [];
  const o = motionOrchestrator({ token: TOKEN, service: { health: async () => ({ ok: true, busy: false, sandbox: 'linux' }), submit: async () => new Response('{}') }, call, outDir: mkdtempSync(join(tmpdir(), 'motion-fail-')), log: line => lines.push(line), ...options });
  const server = createServer(o.handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); o.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, { method = 'GET', body } = {}) => fetch(base + path, { method, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return {
    o, req, lines,
    post: async (opts, path = '/jobs', extra = {}) => { const r = await req(path, { method: 'POST', body: { ...(path === '/jobs' ? { request: '/motion 15s explain me softmax func' } : {}), ...grantFor(o.boot, opts), ...extra } }); return { status: r.status, body: await r.json() }; },
    view: async id => (await req(`/jobs/${id}`)).json(),
    artifacts: async id => (await req(`/jobs/${id}/artifacts`)).json(),
    failed: async id => { await until(async () => (await (await req(`/jobs/${id}`)).json()).status !== 'running', 'the job to end'); return (await req(`/jobs/${id}`)).json(); },
  };
}
const body = (kind, text = kind, extra = {}) => {
  const base = { max_tokens: PRODUCTION_POLICY[kind].max_tokens, tools: [{ name: kind }], messages: [{ role: 'user', content: text }], ...extra };
  base.messages[0].content = text.padEnd(text.length + PRODUCTION_POLICY[kind].bytes - requestSize(base).bytes, '.');
  return base;
};
const reply = (out, extra = {}) => new Response(JSON.stringify({ model: MODEL, usage: { input_tokens: 0, output_tokens: out, ...extra } }));
const bound = b => Math.round(requestSpendBound(b, MODEL) * 1e6);
// A pipeline stand-in that makes the listed calls in order, as the stages do, and stops at the first refusal (as a stage does).
const steps = list => async ({ call, onStage }) => {
  for (const [stage, b] of list) { onStage(stage); const r = await call({}, b, MODEL); await r.text(); if (!r.ok) return { status: 'failed', failure_reason: `${stage}: refused` }; }
  return { status: 'failed', failure_reason: 'end of path' };
};

test('the mandatory path and its numbers: the least it can cost is US$2.56, the sum of the policy-cap bounds is more, so US$2.00 can never hold it', () => {
  const floor = pathFloor(MANDATORY_PATH, PRODUCTION_POLICY, modelsFor({}));
  // brief 16000 + storyboard 16000 + Author 64000 + two reviewers 2 x 16000 output tokens at US$20 per million: input only adds to it.
  assert.equal(floor.micros, (16000 + 16000 + 64000 + 2 * 16000) * 20);
  assert.equal(floor.micros, 2_560_000);
  assert.deepEqual(floor.lines.map(l => [l.kind, l.calls, l.per_call_micros]), [['motion_brief', 1, 320_000], ['motion_storyboard', 1, 320_000], ['motion_composition', 1, 1_280_000], ['motion_review', 2, 320_000]]);
  assert.equal(floor.calls, 5);
  // At the policy's caps (the most any real request can be) the same path is US$3.8: above every ceiling the owner has set so far.
  const caps = pathBound(MANDATORY_PATH, PRODUCTION_POLICY, modelsFor({}));
  assert.equal(caps.micros, 445_000 + 565_000 + 1_845_000 + 2 * 923_400);
  assert.ok(floor.micros < 3_000_000 && caps.micros > 3_000_000);
});

test('preflight: a ceiling below the least the required calls cost, a missing stage, too few calls and an unpriced model are each refused with their own code', () => {
  const ok = { policy: PRODUCTION_POLICY, maxCalls: 9, ceilingMicros: 3_500_000 };
  assert.deepEqual([preflight(ok).ok, preflight(ok).floor_micros], [true, 2_560_000]);
  assert.equal(preflight({ ...ok, ceilingMicros: 2_560_000 }).ok, true, 'the exact floor is allowed');
  const c = preflight({ ...ok, ceilingMicros: 2_000_000 });
  assert.deepEqual([c.ok, c.code], [false, 'job_ceiling_insufficient']);
  assert.match(c.reason, /the least the 5 required calls can cost \(\$2\.5600\) is more than the \$2\.0000 job ceiling/);
  const { motion_review, ...noReview } = PRODUCTION_POLICY;
  assert.equal(preflight({ ...ok, policy: noReview }).code, 'policy_rejected');
  assert.equal(preflight({ ...ok, policy: { ...PRODUCTION_POLICY, motion_review: { ...motion_review, calls: 1 } } }).code, 'policy_rejected', 'one review call is not the two reviewers');
  assert.equal(preflight({ ...ok, maxCalls: 4 }).code, 'call_limit');
  assert.equal(preflight({ ...ok, env: { MOTION_AUTHOR_MODEL: 'no-such-model' } }).code, 'unknown_cost_bound');
  assert.equal(preflight({ policy: null, maxCalls: 1, ceilingMicros: 1 }).ok, true, 'no policy: the other behaviour tests are not preflighted');
  // Recovery: a render calls no model; a fix needs only what its checkpoint still has to run.
  assert.deepEqual(requiredPath({ mode: 'render' }), []);
  assert.deepEqual(requiredPath({ mode: 'fix', checkpoint: { composition: { state: 'unreviewed' } } }), [['motion_review', 2]]);
  assert.deepEqual(requiredPath({ mode: 'fix', checkpoint: { composition: { state: 'blocking' } } }), [['motion_composition', 1], ['motion_review', 2]]);
  assert.deepEqual(requiredPath({ mode: 'fix', checkpoint: {} }), [['motion_composition', 1], ['motion_review', 2]]);
});

test('insufficient mandatory budget: POST /jobs is refused before any model call, any job or any renderer work, and the answer carries a code and no amount', async t => {
  let sent = 0, renders = 0;
  const { post, o, lines } = await start(t, { policy: PRODUCTION_POLICY, ceilingMicros: 2_000_000, call: async () => { sent++; return reply(1); } });
  const answer = await post();
  assert.equal(answer.status, 503);
  assert.deepEqual([answer.body.error, answer.body.code], ['not_configured', 'job_ceiling_insufficient']);
  assert.doesNotMatch(JSON.stringify(answer.body), /\$|\d\.\d\d/, 'no amount in what the Worker relays');
  assert.deepEqual([sent, renders, o.jobs.size], [0, 0, 0]);
  assert.equal(o.active, null);
  assert.match(lines.at(-1), /refused job_ceiling_insufficient before starting: the least the 5 required calls can cost \(\$2\.5600\) is more than the \$2\.0000 job ceiling; least needed \$2\.56, ceiling \$2 \(grant \$8\.9586\); nothing was spent/);
  // The same key answers the same refusal: nothing was remembered, nothing started.
  const again = await post({ key: 'op-fail-same-key' });
  const twice = await post({ key: 'op-fail-same-key' });
  assert.deepEqual([again.body.code, twice.body.code, o.jobs.size], ['job_ceiling_insufficient', 'job_ceiling_insufficient', 0]);
});

test('the grant is part of the ceiling: a hold the Worker admitted below the mandatory path is refused the same way, whatever the configured ceiling', async t => {
  const { post, o } = await start(t, { policy: PRODUCTION_POLICY, ceilingMicros: 3_500_000, call: async () => assert.fail('no model call') });
  const refused = await post({ micros: 1_000_000 });
  assert.deepEqual([refused.status, refused.body.code, o.jobs.size], [503, 'job_ceiling_insufficient', 0]);
  const started = await post({ micros: 3_500_000 });
  assert.equal(started.status, 202, 'a grant that holds the least the path costs starts');
});

test('a recovery with too little budget for its next stage is refused before any call; a render needs none', async t => {
  const checkpoint = { request: '/motion 15s explain me softmax func', brief: {}, storyboard: {}, composition: { state: 'blocking', output: { source: 'x' } } };
  const { post, o } = await start(t, { policy: PRODUCTION_POLICY, ceilingMicros: 3_500_000, run: async () => ({ status: 'failed', failure_reason: 'x' }), call: async () => assert.fail('no model call') });
  const seal = sealCheckpoint(TOKEN, checkpoint);
  // A repair and two reviews need at least 24000 + 2 x 16000 output tokens = US$1.12.
  const thin = await post({ micros: 1_000_000 }, '/recover', { mode: 'fix', checkpoint, seal });
  assert.deepEqual([thin.status, thin.body.code, o.jobs.size], [503, 'job_ceiling_insufficient', 0]);
  const enough = await post({ micros: 1_200_000 }, '/recover', { mode: 'fix', checkpoint, seal });
  assert.equal(enough.status, 202);
  const render = await post({ micros: 1 }, '/recover', { mode: 'render', checkpoint: { ...checkpoint, composition: { state: 'accepted', output: { source: 'x' } } }, seal: sealCheckpoint(TOKEN, { ...checkpoint, composition: { state: 'accepted', output: { source: 'x' } } }) });
  assert.equal(render.status, 202, 'a render calls no model: its 1 micro-dollar grant is enough');
});

test('mid-job: the Author is refused BEFORE it is paid for when the reviews after it could not fit; the refusal is logged with its job, stage, need and left', async t => {
  const sent = [];
  const small = kind => ({ max_tokens: PRODUCTION_POLICY[kind].max_tokens, tools: [{ name: kind }], messages: [{ role: 'user', content: kind }] });
  const path = [['directing', small('motion_brief')], ['storyboarding', small('motion_storyboard')], ['authoring', body('motion_composition')], ['reviewing', small('motion_review')], ['reviewing', body('motion_review', 'two')]];
  const { post, failed, lines } = await start(t, { policy: PRODUCTION_POLICY, ceilingMicros: 2_600_000, run: steps(path), call: async (_, b) => { sent.push(b.tools[0].name); return reply(15000); } });
  const { body: started } = await post();
  const v = await failed(started.job_id);
  assert.deepEqual(sent, ['motion_brief', 'motion_storyboard'], 'the Author was never sent');
  assert.deepEqual([v.status, v.cause, v.failure_code], ['failed', 'limit', 'job_ceiling_insufficient']);
  assert.equal(v.spend.calls, 2);
  assert.equal(v.spend.cost_usd, 0.6, 'only the two cheap calls (US$0.30 each) were paid for');
  assert.deepEqual([v.failure.code, v.failure.stage, v.failure.kind], ['job_ceiling_insufficient', 'authoring', 'motion_composition']);
  assert.ok(v.failure.need_usd > 1.7 && v.failure.need_usd < 1.8 && v.failure.ahead_usd === 0.64 && v.failure.left_usd === 2 && v.failure.ceiling_usd === 2.6, JSON.stringify(v.failure));
  assert.ok(v.failure.need_usd < v.failure.left_usd, 'the Author alone would have fit; it is the reviews after it that would not');
  const refusal = lines.find(l => l.includes('refused job_ceiling_insufficient during authoring'));
  assert.ok(refusal?.startsWith(`job ${started.job_id}: refused`), refusal);
  assert.match(refusal, /\(motion_composition, call 3\).*; need \$1\.\d+ \+ least-ahead \$0\.64, left \$2 of \$2\.6 \(grant \$8\.9586\)/);
  assert.match(lines.at(-1), new RegExp(`job ${started.job_id}: failed \\[job_ceiling_insufficient\\] \\(calls 2,`));
});

test('the repair is a bounded extra: it is checked before it is sent, and refused when the reviews that must follow it could not fit even though it fits alone', async t => {
  const small = (kind, max_tokens = PRODUCTION_POLICY[kind].max_tokens) => ({ max_tokens, tools: [{ name: kind }], messages: [{ role: 'user', content: `${kind} ${max_tokens} ${Math.random()}` }] });
  const outs = [1000, 1000, 64000, 15000, 15000]; // brief, storyboard, Author (at its cap: US$1.28), the two reviews (US$0.30 each): US$1.92 in all
  let n = 0;
  const path = [['directing', small('motion_brief')], ['storyboarding', small('motion_storyboard')], ['authoring', small('motion_composition')], ['reviewing', small('motion_review')], ['reviewing', small('motion_review')], ['author_repair', small('motion_composition', 24000)]];
  const sent = [];
  const { post, failed, lines } = await start(t, { policy: PRODUCTION_POLICY, ceilingMicros: 2_600_000, run: steps(path), call: async (_, b) => { sent.push(b.tools[0].name); return reply(outs[n++]); } });
  const { body: started } = await post();
  const v = await failed(started.job_id);
  assert.equal(sent.length, 5, 'the repair was never sent');
  assert.equal(v.spend.cost_usd, 1.92);
  const repair = path.at(-1)[1];
  assert.ok(bound(repair) / 1e6 < v.failure.left_usd, `the repair alone (${bound(repair)}) fits the ${v.failure.left_usd} left`);
  assert.deepEqual([v.cause, v.failure_code, v.failure.stage, v.failure.ahead_usd], ['limit', 'job_ceiling_insufficient', 'author_repair', 0.64]);
  assert.ok(lines.some(l => /refused job_ceiling_insufficient during author_repair \(motion_composition, call 6\).*least-ahead \$0\.64/.test(l)));
});

test('policy rejection and spending rejection are different codes, as are the call-count limit and an unbounded cost', async t => {
  const cases = [
    ['an unknown tool is outside the policy', [{ max_tokens: 100, tools: [{ name: 'web_search' }], messages: [{ role: 'user', content: 'x' }] }], 'policy_rejected', {}],
    ['an oversized call is outside the policy', [{ ...body('motion_brief'), max_tokens: 64000 }], 'policy_rejected', {}],
    ['a schema re-ask is outside the policy', [{ ...body('motion_brief'), messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }] }], 'policy_rejected', {}],
    ['the per-job ceiling is spending', [body('motion_composition'), body('motion_composition', 'second')], 'job_ceiling_insufficient', { ceilingMicros: 3_000_000, call: async () => new Response('not json') }],
    ['the configured call limit', [body('motion_brief'), body('motion_storyboard'), body('motion_composition'), body('motion_review', 'a'), body('motion_review', 'b'), body('motion_review', 'c')], 'call_limit', { maxCalls: 5 }],
    ['the policy per-stage call count', [body('motion_brief'), body('motion_brief', 'again')], 'call_limit', {}],
    ['a server tool cannot be bounded', [{ max_tokens: 100, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [{ role: 'user', content: 'x' }] }], 'unknown_cost_bound', { policy: null }],
  ];
  for (const [name, bodies, code, extra] of cases) {
    const { post, failed, lines } = await start(t, { policy: PRODUCTION_POLICY, call: async () => reply(10), run: steps(bodies.map(b => ['stage', b])), ...extra });
    const { body: started } = await post({ micros: 8_958_600 });
    const v = await failed(started.job_id);
    assert.deepEqual([v.cause, v.failure_code], ['limit', code], name);
    assert.equal(v.failure.code, code, name);
    assert.ok(lines.some(l => l.startsWith(`job ${started.job_id}: refused ${code} during stage`)), `${name}: every refusal is logged with its job and stage`);
  }
});

test('every refusal is logged, not only the first (the second call refused after the job already failed is still a line)', async t => {
  const { post, failed, lines } = await start(t, { policy: PRODUCTION_POLICY, call: async () => reply(10), run: async ({ call, onStage }) => {
    onStage('authoring');
    for (const b of [{ ...body('motion_brief'), max_tokens: 64000 }, { max_tokens: 100, tools: [{ name: 'web_search' }], messages: [{ role: 'user', content: 'x' }] }]) await (await call({}, b, MODEL)).text();
    return { status: 'failed', failure_reason: 'x' };
  } });
  const { body: started } = await post({ micros: 8_958_600 });
  const v = await failed(started.job_id);
  assert.equal(lines.filter(l => l.includes(': refused ')).length, 2);
  assert.equal(v.failure_code, 'policy_rejected', 'the first refusal names the failure');
});

test('the overall timeout is job_timeout (cause limit, never a spending limit), with the stage it stopped in', async t => {
  const { post, failed, lines } = await start(t, { jobTimeoutMs: 40, run: async ({ signal, onStage }) => { onStage('review_and_render'); await new Promise(r => signal.addEventListener('abort', r)); return { status: 'cancelled', failure_reason: 'stopped during review_and_render', cause: 'stopped' }; } });
  const { body: started } = await post({ micros: 2_000_000 });
  const v = await failed(started.job_id);
  assert.deepEqual([v.status, v.cause, v.failure_code, v.failure.stage], ['failed', 'limit', 'job_timeout', 'review_and_render']);
  assert.match(v.failure_reason, /ran past 0 minutes|ran past/);
  assert.ok(lines.some(l => l.includes(`job ${started.job_id}: timeout during review_and_render`)));
});

test('other failures keep their cause and now carry the matching code', async t => {
  for (const [cause, code] of [['renderer', 'renderer_failed'], ['infra', 'infrastructure'], ['content', 'content_rejected'], ['model', 'model_failed']]) {
    const { post, failed } = await start(t, { run: async () => ({ status: 'failed', failure_reason: 'x', cause }) });
    const { body: started } = await post({ micros: 2_000_000 });
    const v = await failed(started.job_id);
    assert.deepEqual([v.cause, v.failure_code], [cause, code]);
  }
  const { post, failed } = await start(t, { run: async () => { throw new Error('boom'); } });
  const v = await failed((await post({ micros: 2_000_000 })).body.job_id);
  assert.deepEqual([v.cause, v.failure_code], ['infra', 'infrastructure']);
});

// The failed production job's exact numbers (diagnosis 2026-10-25): ceiling US$2.00, three calls costing US$1.278157 in all (Director 0.06,
// storyboard 0.14, Author 1.078157), then a next call whose bound did not fit the US$0.721843 left. The guard alone (no policy, as the
// orchestrator that refused it had it) reproduces the numbers; what changed is what is reported and what is offered.
const FIXTURE_COSTS = [[3000, 0], [7000, 0], [53907, 85]]; // output tokens, cache-read tokens: 60000 + 140000 + 1078140 + 17 micro-dollars
test('fixture: job 61f70171 (ceiling 2.00, cost 1.278157, calls 3) is classified job_ceiling_insufficient, not a spending limit, and offers no blind retry', async t => {
  const review = { max_tokens: 16000, system: [{ type: 'text', text: 'x', cache_control: { type: 'ephemeral' } }], tools: [{ name: 'motion_review' }], messages: [{ role: 'user', content: Array.from({ length: 17 }, () => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } })) }] };
  assert.ok(bound(review) > 2_000_000 - 1_278_157, `the next call's bound ${bound(review)} does not fit the 721843 left`);
  const stages = ['directing', 'storyboarding', 'authoring'];
  const calls = [...FIXTURE_COSTS.entries()].map(([i]) => [stages[i], { max_tokens: 16000, tools: [{ name: 'k' }], messages: [{ role: 'user', content: stages[i] }] }]);
  let n = 0;
  const { post, failed, artifacts, lines } = await start(t, { ceilingMicros: 2_000_000, run: steps([...calls, ['review_and_render', review]]),
    call: async () => { const [out, cache] = FIXTURE_COSTS[n++]; return reply(out, { cache_read_input_tokens: cache }); } });
  const { body: started } = await post({ micros: 8_958_600 });
  const v = await failed(started.job_id);
  assert.deepEqual([v.status, v.cause, v.failure_code, v.spend.calls, v.spend.cost_usd, v.spend.bound_usd, v.spend.ceiling_usd], ['failed', 'limit', 'job_ceiling_insufficient', 3, 1.278157, 1.278157, 2]);
  assert.deepEqual([v.failure.stage, v.failure.kind, v.failure.left_usd], ['review_and_render', 'motion_review', 0.721843]);
  assert.ok(v.failure.need_usd > 0.721843);
  assert.ok(lines.some(l => /refused job_ceiling_insufficient during review_and_render \(motion_review, call 4\).*left \$0\.721843 of \$2/.test(l)), lines.join('\n'));
  // Offers no blind retry: a limit with nothing saved (the job crashed before a checkpoint) has no recovery action.
  const a = await artifacts(started.job_id);
  assert.deepEqual([a.failure_code, a.actions], ['job_ceiling_insufficient', []]);
});

test('recovery is offered by the NEXT stage a fresh attempt must run, not by budget left: a review fits US$2.00, an Author does not, a render always can', () => {
  const brief = { id: 'b' }, storyboard = { id: 's' };
  const cp = composition => ({ brief, storyboard, ...(composition ? { composition: { state: composition, output: {} } } : { composition: null }) });
  const limits = { ceilingMicros: 2_000_000, maxCalls: 9, env: {} };
  const need = state => nextStage(cp(state), limits);
  // Two reviewers at the policy caps are 1.8468; the Author at its caps is 1.845 and the reviews after it make 3.69.
  assert.deepEqual([need('unreviewed').micros, need('unreviewed').fits], [2 * 923_400, true]);
  assert.deepEqual([need(null).micros, need(null).fits, need(null).reason], [1_845_000 + 2 * 923_400, false, 'job_ceiling_insufficient']);
  assert.equal(need('blocking').micros, Math.ceil((112000 + 1000) * 5) + 24000 * 20 + 2 * 923_400, 'a repair is a patch: capped at 24000 output tokens');
  assert.equal(need('blocking').fits, false, 'a patch and two reviews do not fit 2.00 either');
  assert.deepEqual(recoveryActions('limit', cp('unreviewed'), 'job_ceiling_insufficient', limits), ['fix']);
  assert.deepEqual(recoveryActions('limit', cp(null), 'job_ceiling_insufficient', limits), [], 'the Author would be refused again');
  assert.deepEqual(recoveryActions('limit', cp('blocking'), 'job_ceiling_insufficient', limits), []);
  assert.deepEqual(recoveryActions('limit', cp('blocking'), 'job_ceiling_insufficient', { ...limits, ceilingMicros: 3_500_000 }), ['fix']);
  assert.deepEqual(recoveryActions('limit', cp('accepted'), 'job_timeout', limits), ['render'], 'rendering alone repeats no model generation');
  assert.deepEqual(recoveryActions('limit', cp('accepted'), 'job_ceiling_insufficient', { ...limits, ceilingMicros: 1 }), ['render']);
  for (const code of ['policy_rejected', 'unknown_cost_bound']) assert.deepEqual(recoveryActions('limit', cp('unreviewed'), code, limits), [], `${code}: the same attempt is refused the same way`);
  assert.deepEqual(recoveryActions('limit', cp('unreviewed')), [], 'a limit from an orchestrator that named no code and gave no limits keeps offering nothing');
  assert.deepEqual(recoveryActions('limit', cp('unreviewed'), 'job_timeout', { ...limits, maxCalls: 1 }), [], 'two reviews do not fit a one-call cap');
  assert.deepEqual(recoveryActions('renderer', cp('unreviewed')), ['fix'], 'other causes are unchanged');
  assert.equal(RECOVERY_POLICY.fix.motion_review.calls, 4);
});

test('the artifacts of a job that stopped on its ceiling name the code, the recovery that fits and what its next stage needs', async t => {
  const checkpoint = { request: 'r', brief: { id: 'b' }, storyboard: { id: 's' }, composition: { state: 'unreviewed', output: {} }, findings: [], frames: [] };
  const { post, failed, artifacts } = await start(t, { policy: null, ceilingMicros: 2_000_000, run: async ({ call, onStage }) => {
    onStage('review_and_render', { checkpoint });
    for (const text of ['one', 'two']) await (await call({}, { max_tokens: 64000, tools: [{ name: 'k' }], messages: [{ role: 'user', content: text }] }, MODEL)).text(); // the first is unreadable (held at its bound), the second cannot fit
    return { status: 'failed', failure_reason: 'review: refused', checkpoint };
  }, call: async () => new Response('not json') });
  const { body: started } = await post({ micros: 2_000_000 });
  await failed(started.job_id);
  const a = await artifacts(started.job_id);
  assert.deepEqual([a.status, a.cause, a.failure_code, a.actions], ['failed', 'limit', 'job_ceiling_insufficient', ['fix']]);
  assert.equal(a.next_need_usd, 1.8468);
  assert.ok(a.hold_usd.fix > 7);
});
