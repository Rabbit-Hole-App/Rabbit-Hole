// Provider-cap resilience (owner, 2026-10-22; r2-kickoff sections 3-4; EXP-T12/T19): the real ExplainJobs object and storage,
// the real ledger admitted and settled by spendTransport through the real anthropic() dispatcher, and a provider that
// refuses with its spend cap (HTTP 400 "usage limits"), rate limit (429) or overload (529) until access returns. The stage
// work is a stand-in pipeline making the real paid calls through ctx.call (as explain-job.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_UNAVAILABLE } from '../src/explain-policy.js';
import { providerUnavailable } from '../src/learn-spend.js';
import { usageTotals } from '../src/learn-usage.js';
import { OWNER, PERIOD, explainStack, rows } from './explain-fixture.js';

const tool = { name: 'explain_out', description: 'Output.', input_schema: { type: 'object' } };
const REFUSALS = {
  cap: () => Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.' } }, { status: 400 }),
  rate: () => Response.json({ type: 'error', error: { type: 'rate_limit_error', message: 'Number of request tokens has exceeded your per-minute rate limit.' } }, { status: 429 }),
  overload: () => Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, { status: 529 }),
};

// The provider. down: role -> refusal kind while access is out (null: answered). Every request is recorded, refused or not.
function provider(t, { review = () => ({ accepted: true }) } = {}) {
  const calls = [], down = {}, original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), role = body.system[0]?.text || body.system;
    const refused = down[role] || down.all;
    calls.push({ role, refused: refused || null });
    if (refused) return REFUSALS[refused]();
    const input = role === 'review' ? review(calls.filter(c => c.role === 'review' && !c.refused).length) : { role, n: calls.length };
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: `t${calls.length}`, name: tool.name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 500 } });
  };
  const answered = role => calls.filter(c => c.role === role && !c.refused).length;
  return { calls, down, answered };
}

// Stand-in stages; renders are counted so a resume can prove it reused the completed render.
function pipeline() {
  const seen = { renders: 0 };
  return { seen, stages: {
    author: async (job, ctx) => ({ spec: { from: (await ctx.call('author', { system: 'author', tool, content: job.prompt })).input.n, version: 1 } }),
    validate: async job => ({ compiled: { scene: { objects: [], spec: job.spec }, componentVersions: { box: 1 } } }),
    render: async () => { seen.renders++; return { captures: [{ id: 'light', key: `k${seen.renders}` }], renders: [{ ok: true }] }; },
    review: async (job, ctx) => { const v = (await ctx.call('review', { system: 'review', tool, content: 'spec' })).input; return v.accepted ? { accepted: true } : { accepted: false, findings: [{ category: 'spec', severity: 'major', specRepairable: true }], repairable: true }; },
    repair: async (job, ctx) => ({ spec: { ...job.spec, repaired: (await ctx.call('repair', { system: 'repair', tool, content: JSON.stringify(job.findings.at(-1)) })).input.n }, progress: true }),
  } };
}
function setup(t, opts = {}) {
  const p = pipeline();
  return { ...explainStack(t, { pipeline: p.stages }), model: provider(t, opts), seen: p.seen };
}
const held = async s => (await usageTotals(s.env.LEARN_DB, OWNER.userId, PERIOD)).reserved;
const paused = (job, stage) => {
  assert.deepEqual([job.stage, job.stopReason, job.terminal, job.failure], ['failed', 'provider_unavailable', true, { stage, category: 'provider_unavailable', message: PROVIDER_UNAVAILABLE, retryable: true }]);
  assert.deepEqual(job.recovery, ['new_attempt', 'edit_request'], 'Retry is offered (and the request kept for an edit)');
  assert.equal(job.usage.unknown, false, 'nothing is left uncertain');
};

test('provider refusals are classified: usage limit, rate limit and overload; not our own admission refusals or other errors', async () => {
  for (const kind of Object.keys(REFUSALS)) assert.equal(await providerUnavailable(REFUSALS[kind]()), true, kind);
  assert.equal(await providerUnavailable(Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'messages: field required' } }, { status: 400 })), false);
  assert.equal(await providerUnavailable(Response.json({ error: 'Not enough AI allowance.', code: 'allowance_limited' }, { status: 429 })), false);
  assert.equal(await providerUnavailable(Response.json({ error: 'Paused.', code: 'spend_limited' }, { status: 429 })), false);
  assert.equal(await providerUnavailable(Response.json({ type: 'error', error: { type: 'api_error' } }, { status: 500 })), false);
});

test('cap reached before generation: the job pauses with nothing charged or held, and Retry after access returns finishes it once', async t => {
  const s = setup(t);
  s.model.down.all = 'cap';
  const { body } = await s.create();
  await s.run(body.job.id);
  const view = await s.job(body.job.id);
  paused(view.job, 'authoring');
  assert.equal(view.job.usage.credits, 0);
  const job = s.state.data.get(`job:${body.job.id}`);
  assert.deepEqual([job.counts.author, job.calls.map(c => [c.role, c.status, c.costMicros])], [0, [['author', 'refused', 0]]], 'the refused call does not use the ceiling');
  assert.deepEqual(rows(s.sqlite, 'usage_operations').map(o => [o.status, o.cost_usd]), [['failed', 0]]);
  assert.equal(await held(s), 0, 'no allowance stays held for a call the provider refused');
  // Access returns; Retry resumes at authoring.
  delete s.model.down.all;
  const retried = await s.send('retry', { expectedAttempt: 1 }, body.job.id);
  assert.deepEqual([retried.status, retried.body.job.stage, retried.body.job.failure], [202, 'authoring', null]);
  const done = await s.run(body.job.id);
  assert.equal(done.stage, 'ready');
  assert.deepEqual([s.model.answered('author'), s.model.answered('review')], [1, 1]);
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('job:')).length, 1, 'one job');
  const paid = rows(s.sqlite, 'usage_attempts').filter(a => a.provider === 'anthropic');
  assert.deepEqual(paid.map(a => [a.kind, a.cost_state, a.cost_micros]), [['generation', 'settled', 0], ['generation', 'settled', 14000], ['evaluation', 'settled', 14000]]);
  assert.equal(new Set(paid.map(a => a.action_id)).size, 1, 'one learner action');
  assert.equal((await s.job(body.job.id)).job.usage.credits, Math.ceil(2 * 14000 / 10000), 'charged for the two answered calls only');
});

test('cap reached during generation: completed stages are kept and Retry resumes where it paused, at review and at repair', async t => {
  for (const [kind, role, stage] of [['overload', 'review', 'reviewing'], ['rate', 'repair', 'repairing']]) {
    const s = setup(t, { review: n => ({ accepted: role === 'review' || n > 1 }) }); // the repair case: the first review asks for one repair
    const { body } = await s.create();
    s.model.down[role] = kind;
    await s.run(body.job.id);
    const before = s.state.data.get(`job:${body.job.id}`);
    paused((await s.job(body.job.id)).job, stage);
    assert.ok(before.spec && before.compiled && before.captures.length, 'spec, compiled result and captures stay');
    const renders = s.seen.renders;
    delete s.model.down[role];
    assert.equal((await s.send('retry', { expectedAttempt: 1 }, body.job.id)).body.job.stage, stage);
    const done = await s.run(body.job.id);
    assert.equal(done.stage, 'ready', kind);
    assert.equal(s.model.answered('author'), 1, 'never reauthored');
    if (role === 'review') assert.equal(s.seen.renders, renders, 'the completed render is reviewed, not rendered again');
    else assert.equal(done.spec.repaired > 0, true, 'the paused repair got the review findings it was given');
    assert.equal(rows(s.sqlite, 'usage_attempts').filter(a => a.provider === 'anthropic' && a.cost_state !== 'settled').length, 0);
    assert.equal(await held(s), 0);
  }
});

test('a restart while paused: the stored job resumes on the new object, a resent submit is the same job, nothing runs twice', async t => {
  const s = setup(t);
  s.model.down.all = 'cap';
  const { body } = await s.create();
  await s.run(body.job.id);
  const restarted = s.object();
  await restarted.alarm(); // a recovery turn on the new object starts nothing for a paused job
  assert.equal(s.model.calls.length, 1);
  assert.deepEqual([(await s.create()).status, (await s.create()).body.job.id], [200, body.job.id], 'the resent request id is the same job');
  delete s.model.down.all;
  assert.equal((await s.send('retry', { expectedAttempt: 1 }, body.job.id, OWNER, restarted)).status, 202);
  assert.equal((await s.run(body.job.id, restarted)).stage, 'ready');
  assert.deepEqual([s.model.answered('author'), s.model.answered('review')], [1, 1]);
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('job:')).length, 1);
});

test('repeated Retry while the cap holds and after: duplicates change nothing, no hold accumulates, each answered call settles once', async t => {
  const s = setup(t);
  s.model.down.all = 'cap';
  const { body } = await s.create();
  await s.run(body.job.id);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const [first, again] = [await s.send('retry', { expectedAttempt: attempt }, body.job.id), await s.send('retry', { expectedAttempt: attempt }, body.job.id)];
    assert.deepEqual([first.status, again.status, again.body.job.attempt], [202, 200, attempt + 1], 'a double click is one Retry');
    await s.run(body.job.id);
    paused((await s.job(body.job.id)).job, 'authoring');
    assert.equal(await held(s), 0, `nothing held after retry ${attempt}`);
  }
  assert.equal(s.model.calls.filter(c => c.refused).length, 4);
  assert.equal(s.state.data.get(`job:${body.job.id}`).counts.author, 0);
  delete s.model.down.all;
  assert.equal((await s.send('retry', { expectedAttempt: 4 }, body.job.id)).status, 202);
  assert.equal((await s.run(body.job.id)).stage, 'ready');
  assert.equal((await s.send('retry', { expectedAttempt: 4 }, body.job.id)).status, 200, 'a late duplicate Retry of a finished job changes nothing');
  const paid = rows(s.sqlite, 'usage_attempts').filter(a => a.provider === 'anthropic');
  assert.deepEqual(paid.filter(a => a.cost_micros > 0).map(a => a.kind), ['generation', 'evaluation'], 'charged once per answered call');
  assert.equal(paid.filter(a => a.cost_micros === 0).length, 4);
  assert.equal(await held(s), 0);
});
