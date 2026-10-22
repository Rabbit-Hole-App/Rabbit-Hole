// EXP-T12 slice 2: the /explain durable job with its real handlers and storage. The real ExplainJobs object on a durable
// storage fixture (reloaded as a new instance for restarts), the real ledger (learn-migrations 0016 + 0022 in SQLite, admitted
// and settled by spendTransport through the real anthropic() dispatcher) and a recording fetch in place of the provider.
// The stage work is a stub pipeline (named PIPELINE below): T16-T19 supply the real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainRoute, explainPipeline } from '../src/explain-job.js';
import { explainReservation } from '../src/explain-policy.js';
import { BOARD, OWNER, explainStack, rows, spent } from './explain-fixture.js';
import { signProposal, publishRevision, proposalRecord, proposalState } from '../src/generation-proposal.js';

const tool = { name: 'explain_out', description: 'Output.', input_schema: { type: 'object' } };

// The provider: replies to each request with one tool call. A review answers per the scenario; hold() parks the next call.
function provider(t, { review = () => ({ accepted: true }) } = {}) {
  const calls = [], original = globalThis.fetch;
  let gate = null;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), role = body.system[0]?.text || body.system;
    calls.push({ host: new URL(url).host, model: body.model, role, toolChoice: body.tool_choice });
    if (gate) { const wait = gate; gate = null; await wait.promise; }
    const input = role === 'review' ? review(calls.filter(c => c.role === 'review').length) : { role, n: calls.length };
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: `t${calls.length}`, name: tool.name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 500 } });
  };
  return { calls, hold() { let release; const promise = new Promise(r => { release = r; }); gate = { promise }; return () => release(); } };
}

// PIPELINE: a stand-in for T16-T19's stage work, making the real paid calls through ctx.call.
const PIPELINE = (over = {}) => ({
  prepare: async (job, ctx) => ({ brief: { title: 'Pendulum', summary: (await ctx.call('brief', { system: 'brief', tool, content: job.prompt })).input.role } }),
  author: async (job, ctx) => ({ spec: { from: (await ctx.call('author', { system: 'author', tool, content: job.prompt })).input.n, version: 1 } }),
  validate: async job => ({ compiled: { scene: { objects: [], spec: job.spec }, componentVersions: { box: 1 } } }),
  render: async () => ({ captures: ['state-0'], renders: [{ ok: true }] }),
  review: async (job, ctx) => { const verdict = (await ctx.call('review', { system: 'review', tool, content: 'spec' })).input; return verdict.accepted ? { accepted: true } : { accepted: false, findings: [{ category: 'spec' }], repairable: verdict.repairable !== false }; },
  repair: async (job, ctx) => ({ spec: { ...job.spec, repaired: (await ctx.call('repair', { system: 'repair', tool, content: 'fix' })).input.n }, progress: true }),
  ...over,
});

function setup(t, { pipeline = PIPELINE(), review, used = 0 } = {}) {
  const stack = explainStack(t, { pipeline, used });
  return { ...stack, model: provider(t, { review }) };
}

test('exhausted or insufficient allowance refuses before any external call; nothing is stored', async t => {
  for (const [used, reason] of [[50e6, 'exhausted'], [50e6 - explainReservation().generationMicros + 1, 'insufficient']]) {
    const s = setup(t, { used });
    const refused = await s.create();
    assert.equal(refused.status, 429);
    assert.deepEqual([refused.body.code, refused.body.reason], ['allowance_limited', reason]);
    assert.equal(s.model.calls.length, 0);
    assert.equal(s.state.data.size, 0, 'no job and no request fence');
    assert.deepEqual(rows(s.sqlite, 'usage_operations'), []);
    assert.equal(rows(s.sqlite, 'usage_actions').length, 1, 'only the seeded month');
  }
});

test('concurrent duplicate submits make one job; a reused id with other words, or a second job on the card, is refused', async t => {
  const s = setup(t);
  const [a, b] = await Promise.all([s.create(), s.create()]);
  assert.deepEqual([a.status, b.status].sort(), [200, 202]);
  assert.equal(a.body.job.id, b.body.job.id);
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('job:')).length, 1);
  assert.equal((await s.create({ prompt: 'Something else.' })).status, 409);
  assert.equal((await s.create({ requestId: 'req-00000002' })).status, 409);
  assert.equal(s.model.calls.length, 0, 'submission alone calls nothing');
});

test('a direct job runs author -> validate -> render -> review to one saved result, settled once per call under one action', async t => {
  const s = setup(t);
  const { body } = await s.create();
  const done = await s.run(body.job.id);
  assert.equal(done.stage, 'ready');
  assert.deepEqual(s.model.calls.map(c => [c.role, c.model, c.toolChoice.type]), [['author', 'claude-opus-5-5', 'auto'], ['review', 'claude-opus-5-5', 'auto']]);
  const ops = rows(s.sqlite, 'usage_operations'), attempts = rows(s.sqlite, 'usage_attempts');
  assert.deepEqual(ops.map(o => [o.category, o.status, o.calls]), [['explain', 'settled', 1], ['explain', 'settled', 1]]);
  const paid = attempts.filter(a => a.provider === 'anthropic');
  assert.deepEqual(paid.map(a => [a.kind, a.cost_state, a.model]), [['generation', 'settled', 'claude-opus-5-5'], ['evaluation', 'settled', 'claude-opus-5-5']]);
  assert.equal(new Set(paid.map(a => a.action_id)).size, 1, 'one learner action for the job');
  const actions = rows(s.sqlite, 'usage_actions');
  const action = actions.find(a => a.action_id === paid[0].action_id);
  assert.deepEqual([action.feature, action.charge_class, action.status, action.result], ['artifact', 'would_charge', 'completed', 'full']);
  // The render is platform compute, recorded apart from the learner's allowance.
  assert.deepEqual(actions.filter(a => a.feature === 'render').map(a => [a.charge_class, a.status]), [['free', 'completed']]);
  const view = await s.job(body.job.id);
  assert.equal(view.job.terminal, true);
  assert.equal(view.job.usage.credits, Math.ceil(2 * (1000 * 4 + 500 * 20) / 10000));
  assert.deepEqual(Object.keys(view.job.result).sort(), ['baseRevision', 'canvas', 'cardId', 'compiledHash', 'componentVersions', 'jobId', 'policyVersion', 'promptRef', 'resultId', 'revision', 'specHash']);
  assert.deepEqual([view.job.result.cardId, view.job.result.canvas.boardId, view.job.result.componentVersions], ['card-0001', 'board-1', { box: 1 }]);
  assert.equal(view.block.type, 'animation');
  assert.equal(view.block.id, 'card-0001');
  assert.equal(JSON.stringify(view).includes('Explain a pendulum.'), false, 'the prompt stays private to the job');
  // A duplicate submit after completion returns the same job and result, with no new call.
  assert.equal((await s.create()).body.job.result.resultId, view.job.result.resultId);
  assert.equal(s.model.calls.length, 2);
  // Another learner cannot read it.
  assert.equal((await s.send('get', {}, body.job.id, { ...OWNER, email: 'other@example.com' })).status, 404);
});

test('Stop during a background call: the call settles, its late result is dropped, no paid step follows, and a restart keeps it stopped', async t => {
  const s = setup(t);
  const { body } = await s.create();
  const release = s.model.hold();
  await s.actor.alarm(); // queued -> authoring
  const running = s.actor.alarm(); // the author call, parked at the provider
  await new Promise(r => setTimeout(r, 20));
  assert.equal(s.state.data.get(`job:${body.job.id}`).inFlight.role, 'author');
  const stopped = await s.send('cancel', {}, body.job.id);
  assert.deepEqual([stopped.body.job.stage, stopped.body.job.stopReason], ['cancelled', 'stopped']);
  release(); await running;
  const after = s.state.data.get(`job:${body.job.id}`);
  assert.deepEqual([after.stage, after.spec, after.inFlight], ['cancelled', null, null]);
  assert.deepEqual(after.calls.map(c => [c.role, c.status]), [['author', 'settled']]);
  assert.deepEqual(rows(s.sqlite, 'usage_operations').map(o => o.status), ['settled'], 'the sent call is charged once');
  // A restarted object finds it stopped and starts nothing.
  const restarted = s.object();
  await s.run(body.job.id, restarted);
  assert.equal(s.state.data.get(`job:${body.job.id}`).stage, 'cancelled');
  assert.equal(s.model.calls.length, 1);
  assert.equal((await s.send('retry', { expectedAttempt: 1 }, body.job.id)).status, 409, 'a stopped job is not retried as if failed');
});

test('a call interrupted by a restart is reconciled as unknown, never resent, and its reservation stays held', async t => {
  const s = setup(t);
  const { body } = await s.create();
  const release = s.model.hold();
  await s.actor.alarm();
  const lost = s.actor.alarm(); // the original object's call never answers before the "restart"
  await new Promise(r => setTimeout(r, 20));
  const restarted = s.object();
  await restarted.alarm();
  const job = s.state.data.get(`job:${body.job.id}`);
  assert.deepEqual([job.stage, job.failure.category, job.inFlight], ['failed', 'transport', null]);
  assert.deepEqual(job.calls.map(c => [c.role, c.status]), [['author', 'unknown']]);
  assert.equal(s.model.calls.length, 1, 'not resent');
  const [op] = rows(s.sqlite, 'usage_operations');
  assert.equal(op.status, 'admitted', 'its reservation is kept until the cost is known');
  // The ceiling counts it: the job's single author call is spent, so only a new request is offered.
  assert.deepEqual((await s.job(body.job.id)).job.recovery, ['edit_request']);
  await restarted.alarm();
  assert.equal(s.model.calls.length, 1);
  release(); await lost;
  assert.equal(s.state.data.get(`job:${body.job.id}`).stage, 'failed', 'a late answer does not revive the job');
});

test('a render failure keeps the compiled result; Retry re-renders without reauthoring, and a duplicate Retry changes nothing', async t => {
  let renders = 0;
  const s = setup(t, { pipeline: PIPELINE({ render: async () => { if (renders++ === 0) throw Object.assign(new Error('The renderer is busy.'), { status: 503, category: 'renderer' }); return { captures: ['a'], renders: [{ ok: true }] }; } }) });
  const { body } = await s.create();
  const failed = await s.run(body.job.id);
  assert.deepEqual([failed.stage, failed.failure.stage, failed.failure.category], ['failed', 'rendering', 'renderer']);
  assert.deepEqual((await s.job(body.job.id)).job.recovery, ['retry_render', 'edit_request']);
  const [first, second] = [await s.send('retry', { expectedAttempt: 1 }, body.job.id), await s.send('retry', { expectedAttempt: 1 }, body.job.id)];
  assert.deepEqual([first.status, second.status], [202, 200]);
  assert.equal(second.body.job.stage, 'rendering');
  const done = await s.run(body.job.id);
  assert.equal(done.stage, 'ready');
  assert.deepEqual(s.model.calls.map(c => c.role), ['author', 'review'], 'one author call: the retained spec was not reauthored');
  assert.equal(renders, 2);
});

test('three correction rounds shared by all gates, then a stop; calls never exceed the policy', async t => {
  const s = setup(t, { review: () => ({ accepted: false }) });
  const { body } = await s.create();
  const done = await s.run(body.job.id, s.actor, 80);
  assert.deepEqual([done.stage, done.stopReason, done.round], ['failed', 'rounds', 3]);
  const count = role => s.model.calls.filter(c => c.role === role).length;
  assert.deepEqual([count('author'), count('review'), count('repair')], [1, 4, 3]);
  assert.equal(rows(s.sqlite, 'usage_operations').every(o => o.status === 'settled'), true);
  assert.deepEqual((await s.job(body.job.id)).job.recovery, ['edit_request']);
  // An unrepairable finding stops at once.
  const u = setup(t, { review: () => ({ accepted: false, repairable: false }) });
  const job = (await u.create()).body.job;
  assert.deepEqual([(await u.run(job.id)).stopReason, u.model.calls.length], ['unsupported_repair', 2]);
});

// The brief's proposal as T16 saves it: signed for the learner with the job, brief and canvas bound into its input, on the
// chat's answer row with its one state (MOT-22). Motion is unconfigured here: no MOTION_ORCHESTRATOR_TOKEN.
async function proposeBrief(s, job, { app = BOARD.app, briefHash = job.briefHash, messageId = 1 } = {}) {
  const p = await signProposal(s.env, { command: 'explain', title: 'Pendulum', description: 'One. Two. Three.', settings: {}, source_refs: [], input: { org: OWNER.org, app, job: job.id, brief_hash: briefHash } }, OWNER.email);
  s.sqlite.prepare("INSERT OR IGNORE INTO threads VALUES ('th1', ?, ?, ?)").run(OWNER.org, OWNER.email, app);
  s.sqlite.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, meta_json) VALUES (?, 'th1', 'assistant', ?)").run(messageId, JSON.stringify({ proposal: p, proposalState: proposalState(p) }));
  return p;
}
const stateOf = async (s, p) => (await proposalRecord(s.env.LEARN_DB, OWNER.email, BOARD.app, p.proposal_id)).state;

test('a prepared request: brief call, then Generate with the current signed proposal only, under its own action', async t => {
  const s = setup(t);
  assert.equal(s.env.MOTION_ORCHESTRATOR_TOKEN, undefined);
  const { body } = await s.create({ requestClass: 'researched' });
  const waiting = await s.run(body.job.id);
  assert.equal(waiting.stage, 'awaiting_approval');
  assert.deepEqual(s.model.calls.map(c => c.role), ['brief']);
  const p = await proposeBrief(s, waiting);
  assert.match(p.sig, /^v2\.[0-9a-f]{64}$/);
  // Tampered, for another brief, or for another canvas: refused, nothing consumed.
  for (const bad of [{ ...p, title: 'Changed' }, await proposeBrief(s, waiting, { briefHash: 'f'.repeat(64), messageId: 2 }), await proposeBrief(s, waiting, { app: 'canvas-b', messageId: 3 })])
    assert.equal((await s.send('approve', { proposal: bad }, body.job.id)).status, 409);
  assert.equal((await stateOf(s, p)).used, null);
  const approved = await s.send('approve', { proposal: p }, body.job.id);
  assert.equal(approved.status, 202);
  assert.deepEqual((await stateOf(s, p)).used, { version: 1, key: body.job.id });
  // The same Generate again (a double click, a resent request) is the same job, unchanged.
  assert.equal((await s.send('approve', { proposal: p }, body.job.id)).status, 200);
  assert.equal((await s.run(body.job.id)).stage, 'ready');
  assert.deepEqual(s.model.calls.map(c => c.role), ['brief', 'author', 'review']);
  const attempts = rows(s.sqlite, 'usage_attempts').filter(a => a.provider === 'anthropic');
  assert.equal(new Set(attempts.map(a => a.action_id)).size, 2, 'preparation and generation are separate actions');
  assert.deepEqual(rows(s.sqlite, 'usage_actions').filter(a => a.feature === 'artifact').map(a => a.status), ['completed', 'completed']);
  const timing = s.state.data.get(`job:${body.job.id}`).timing;
  assert.ok(timing.marks.proposalReady && timing.marks.generate && timing.marks.result);
});

test('a stale tab\'s first Generate, and a revision racing Generate: only the current revision starts, once', async t => {
  const s = setup(t);
  const job = (await s.create({ requestClass: 'researched' })).body.job;
  const waiting = await s.run(job.id);
  const v1 = await proposeBrief(s, waiting);
  // A refinement (new answer row) publishes v2 against the state its turn read; the stale tab still holds v1.
  const v2 = await signProposal(s.env, { ...v1, settings: { presentation: 'steps' } }, OWNER.email, { id: v1.proposal_id, version: 2 });
  s.sqlite.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, meta_json) VALUES (9, 'th1', 'assistant', ?)").run(JSON.stringify({ proposal: v2 }));
  const read = await proposalRecord(s.env.LEARN_DB, OWNER.email, BOARD.app, v1.proposal_id);
  assert.equal(await publishRevision(s.env.LEARN_DB, read, v2), true);
  const stale = await s.send('approve', { proposal: v1 }, job.id);
  assert.deepEqual([stale.status, stale.body.code], [409, 'proposal_stale']);
  assert.equal((await stateOf(s, v1)).used, null, 'the stale Generate consumed nothing');
  assert.equal(s.state.data.get(`job:${job.id}`).stage, 'awaiting_approval');
  assert.equal((await s.send('approve', { proposal: v2 }, job.id)).status, 202);
  // A refinement that read the state before that Generate landed loses: it is not published.
  const v3 = await signProposal(s.env, { ...v2 }, OWNER.email, { id: v1.proposal_id, version: 3 });
  assert.equal(await publishRevision(s.env.LEARN_DB, read, v3), false);
  assert.deepEqual((await stateOf(s, v1)).used, { version: 2, key: job.id });
  assert.equal(s.model.calls.filter(c => c.role === 'author').length, 0, 'no work before the alarm');
});

test('a Generate refused for allowance consumes nothing and keeps the proposal current', async t => {
  const s = setup(t);
  const job = (await s.create({ requestClass: 'researched' })).body.job; // preparation starts without the generation check
  const waiting = await s.run(job.id);
  const p = await proposeBrief(s, waiting);
  spent(s.sqlite, 49e6); // about $1 left: less than generation's worst case
  const refused = await s.send('approve', { proposal: p }, job.id);
  assert.deepEqual([refused.status, refused.body.code, refused.body.reason], [429, 'allowance_limited', 'insufficient']);
  assert.deepEqual(await stateOf(s, p), proposalState(p));
  assert.equal(s.state.data.get(`job:${job.id}`).stage, 'awaiting_approval');
  assert.deepEqual(s.model.calls.map(c => c.role), ['brief']);
});

// The production pipeline: T17's author and validate stages are real; rendering (T18) needs a browser this test worker
// does not have, so the job stops there with its compiled result kept (Retry re-renders it). The provider answers the author with a valid spec, then with a gap.
const SPEC = { version: 1, id: 'water', title: 'Where rain comes from', components: [
  { id: 'cycle', component: 'flow', version: 1, params: { steps: ['Sun warms the sea', 'Vapour rises and cools', 'Droplets form clouds', 'Rain falls'] } },
], presentation: { mode: 'static' } };
function authorReplies(t, replies) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: 't', name: body.tools[0].name, input: replies.shift() }], stop_reason: 'tool_use', usage: { input_tokens: 3000, output_tokens: 800 } });
  };
  return calls;
}
test('the production pipeline authors and compiles a real spec; with no browser bound it stops at rendering and keeps it', async t => {
  const s = setup(t, { pipeline: explainPipeline });
  const calls = authorReplies(t, [{ kind: 'spec', spec: SPEC }]);
  const { body } = await s.create({ prompt: 'Explain where rain comes from.' });
  const done = await s.run(body.job.id);
  // Rendering is not wired into the worker until @cloudflare/puppeteer and BROWSER land: the job says so and keeps its result.
  assert.deepEqual([done.stage, done.failure.stage, done.failure.category, done.failure.message], ['failed', 'rendering', 'renderer', 'Rendering explanations is not available here yet.']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'claude-opus-5-5');
  assert.equal(done.compiled.counts.authored, 1);
  assert.deepEqual((await s.job(body.job.id)).job.recovery, ['retry_render', 'edit_request']);
});
test('the production pipeline: a request needing math ends as a structured capability gap, with no repair and no card', async t => {
  const s = setup(t, { pipeline: explainPipeline });
  const math = { ...SPEC, components: [{ id: 'law', component: 'module', version: 1, params: { label: { runs: [{ kind: 'math', tex: 'T = 2\pi\sqrt{L/g}' }] } } }] };
  authorReplies(t, [{ kind: 'spec', spec: math }]);
  const { body } = await s.create({ prompt: 'Show the pendulum period formula.' });
  const done = await s.run(body.job.id);
  assert.deepEqual([done.stage, done.stopReason, done.failure.category, done.failure.gap.needs, done.failure.gap.source], ['failed', 'capability_gap', 'capability', ['math'], 'compiler']);
  assert.equal(done.compiled, null);
  const view = (await s.job(body.job.id)).job;
  assert.deepEqual(view.recovery, ['edit_request']);
  assert.equal(view.result, null);
  assert.match(view.failure.message, /typeset math/);
});

test('the route is off unless EXPLAIN_V2_ENABLED, owner-only, same-origin', async t => {
  const s = setup(t);
  const namespace = { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) };
  const identity = async () => OWNER;
  const post = (env, body, headers = {}) => explainRoute('/api/learn/explain/jobs', new Request('https://dev.test/api/learn/explain/jobs', { method: 'POST', headers, body: JSON.stringify(body) }), env, { identity });
  const payload = { boardId: BOARD.id, requestId: 'req-00000009', cardId: 'card-0009', prompt: 'Explain.', requestClass: 'simple' };
  assert.equal(await explainRoute('/api/learn/other', new Request('https://dev.test/x'), s.env), null);
  for (const off of [undefined, 'false', '1']) assert.equal((await post({ ...s.env, EXPLAIN_V2_ENABLED: off, EXPLAIN_JOBS: namespace }, payload)).status, 404);
  const env = { ...s.env, EXPLAIN_JOBS: namespace };
  assert.equal((await post(env, payload, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await post(env, { ...payload, boardId: 'someone-elses' })).status, 404);
  assert.equal((await post(env, payload)).status, 202);
  assert.equal(s.model.calls.length, 0);
});
