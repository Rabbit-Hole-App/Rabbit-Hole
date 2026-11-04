// Animation billing as an escrow (owner 2026-11-03): "a rejected generation is charged to the learner and the failure message doesn't
// state the charge. it should not be charged and should be refunded ... we put the credits in an escrow and if successful we charge,
// if not refunded." The real AnimationJobs object, ledger and refund writer on the animation-fixture stack; a stub pipeline and a
// fake provider, so no model is reached. Plan-phase calls (prepKey) stay charged by default; the generation-stage calls (actionKey) of
// an attempt that fails or is stopped are refunded when it ends, and nothing is ever taken back: a job that reaches ready is charged
// only its FINAL attempt (the calls whose record says attempt === the job's attempt at ready). One phrase everywhere (owner, same day).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as jobs from '../src/animation-job.js';
import * as policy from '../src/animation-policy.js';
import { usageTotals } from '../src/learn-usage.js';
import { animationReservation } from '../src/animation-policy.js';
import { PERIOD } from './explain-fixture.js';
import { NEEDS_PROPOSAL, OWNER, STUB_PIPELINE, TASKS, animationStack, rows, spent } from './animation-fixture.js';

const skip = NEEDS_PROPOSAL;
const NOT_CHARGED = 'You have not been charged.';
const tool = { name: 'x', input_schema: { type: 'object' } };
const TOO_LARGE = ['this artifact (18714 bytes with its program) is too large for the repair request: use fewer nodes, shorter labels or a shorter program'];
const failures = s => rows(s.sqlite, 'messages').filter(m => /was not finished/.test(m.content));

// One usage action per phase: the plan (job.prepKey) and the build (job.actionKey). cost: what the provider calls settled at;
// refunded: what was given back; calls: the settled attempts.
const phase = (s, key) => s.sqlite.prepare(`SELECT COUNT(t.attempt_id) AS calls, COALESCE(SUM(t.cost_micros), 0) AS cost, COALESCE(SUM(d.refunded_micros), 0) AS refunded
  FROM usage_actions a JOIN usage_attempts t ON t.action_id = a.action_id LEFT JOIN usage_attempt_detail d ON d.attempt_id = t.attempt_id
  WHERE a.user_id = ? AND a.client_key = ? AND t.cost_state = 'settled'`).get(OWNER.userId, key);
const net = async s => (await usageTotals(s.env.LEARN_DB, OWNER.userId, PERIOD)).used;
const refunds = s => rows(s.sqlite, 'usage_adjustments');

// The ways a generation ends rejected: the review three times, a candidate that never validates, one too large to check, the call ceiling.
const CASES = {
  rounds: { stop: 'rounds', opts: { reply: role => (role === 'review' ? { accepted: false } : {}) } },
  validation: { stop: 'rounds', opts: { pipeline: STUB_PIPELINE({ validate: async () => ({ problems: ['node n1 is not declared'], repairable: true }) }) } },
  size_limit: { stop: 'rounds', opts: { pipeline: STUB_PIPELINE({ validate: async () => ({ problems: TOO_LARGE, category: 'spec', repairable: true }) }) } },
  budget: { stop: 'budget', opts: { pipeline: STUB_PIPELINE({ review: async (job, ctx) => { for (let i = 0; i < 5; i++) await ctx.call('review', { system: 'review', tool, content: 'x' }); return { accepted: true, artifactHash: job.artifactHash }; } }) } },
};

for (const [name, { stop, opts }] of Object.entries(CASES)) {
  test(`a ${name} failure charges the plan only: the whole generation stage is refunded, once, and the card and Chat say so`, { skip }, async t => {
    const s = animationStack(t, opts);
    const { id, done } = await s.generated();
    assert.deepEqual([done.stage, done.stopReason, done.result], ['failed', stop, null]);
    const plan = phase(s, done.prepKey), build = phase(s, done.actionKey);
    assert.ok(plan.cost > 0 && build.cost > 0 && build.calls >= 2, 'both phases were charged by the provider');
    assert.deepEqual([build.refunded, plan.refunded], [build.cost, 0], 'the generation stage comes back in full; the plan the learner received stays charged');
    assert.equal(await net(s), plan.cost, 'the learner\'s net use for the whole job is the plan phase');
    assert.deepEqual([refunds(s).length, refunds(s).every(r => r.micros < 0 && r.reason === `${jobs.ANIMATION_REFUND}:1`)], [build.calls, true], 'one audit row per refunded call, naming the attempt');
    const { job } = await s.job(id);
    assert.match(job.failure.message, new RegExp(`\\. ${NOT_CHARGED.replace('.', '\\.')}( |$)`), 'the failure states the outcome in a few words');
    assert.doesNotMatch(job.failure.message, /[$]|US[$]|dollar|cents? |charged for it|It used|refunded/, 'credits only, one phrase');
    assert.equal(job.usage.credits, Math.ceil(plan.cost / 10000), 'the job view counts the credits it kept');
    assert.deepEqual(failures(s).map(m => m.content), [`"${s.stored(id).plan.title}" was not finished. ${job.failure.message} Your request and plan are kept.`]);
  });
}

test('a ready job is charged the actual cost of its generation once, nothing refunded', { skip }, async t => {
  const s = animationStack(t, { reply: role => (role === 'review' ? { accepted: true } : {}) });
  const { id, done } = await s.generated();
  assert.equal(done.stage, 'ready');
  const plan = phase(s, done.prepKey), build = phase(s, done.actionKey);
  assert.equal(build.cost, done.calls.filter(c => c.phase === 'generation').reduce((total, c) => total + c.costMicros, 0), 'the ledger holds exactly what the calls settled at');
  assert.deepEqual([build.refunded, refunds(s).length], [0, 0]);
  assert.equal(await net(s), plan.cost + build.cost);
  assert.equal((await s.job(id)).job.usage.note, undefined, 'a ready card says nothing about charges');
  // The end of the job again, and a restarted object: still charged once.
  await s.actor.finishUsage(done, 'completed'); await s.object().alarm();
  assert.equal(await net(s), plan.cost + build.cost);
});

test('a replayed terminal transition, a status read and a restarted object refund nothing twice, and give a lost refund back', { skip }, async t => {
  const s = animationStack(t);
  const { id, done } = await s.generated();
  assert.equal(done.stage, 'failed');
  const plan = phase(s, done.prepKey), build = phase(s, done.actionKey), once = refunds(s).length;
  assert.equal(build.refunded, build.cost);
  await s.actor.finishUsage(done, 'failed'); await s.actor.finishUsage(done, 'failed');
  const restarted = s.object();
  await restarted.alarm(); await s.send('get', {}, id, OWNER, restarted); await s.job(id);
  assert.deepEqual([refunds(s).length, await net(s)], [once, plan.cost], 'the same refunds, the same balance');
  // A refund that did not land (the write failed at the end of the job) is made by the next status read, once.
  s.sqlite.prepare('UPDATE usage_attempt_detail SET refunded_micros = 0, refunded_at = NULL, refund_reason = NULL').run();
  assert.equal(await net(s), plan.cost + build.cost);
  await s.job(id); await s.job(id);
  assert.deepEqual([await net(s), refunds(s).length], [plan.cost, once * 2]);
});

test('a job from before the escrow keeps the rules it was made under: no refund, no new words', { skip }, async t => {
  const s = animationStack(t);
  const { body } = await s.create();
  await s.run(body.job.id);
  delete s.stored(body.job.id).escrow;
  assert.equal((await s.approve(body.job.id)).status, 202);
  const failed = await s.run(body.job.id);
  assert.equal(failed.stage, 'failed');
  await s.job(body.job.id);
  const build = phase(s, failed.actionKey);
  assert.ok(build.cost > 0);
  assert.deepEqual([build.refunded, refunds(s).length], [0, 0], 'charged as before, and a status read refunds nothing');
  assert.doesNotMatch((await s.job(body.job.id)).job.failure.message, new RegExp(NOT_CHARGED.replace('.', '\\.')));
});

test('Stop with no result refunds the generation stage, including a call that settles after Stop', { skip }, async t => {
  const s = animationStack(t);
  const { body } = await s.create();
  await s.run(body.job.id);
  assert.equal((await s.approve(body.job.id)).status, 202);
  const release = s.model.hold();
  const running = s.actor.alarm();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(s.stored(body.job.id).inFlight.role, 'author');
  const stopped = await s.send('cancel', {}, body.job.id);
  assert.equal(stopped.body.job.stage, 'cancelled');
  release(); await running;
  const done = s.stored(body.job.id), plan = phase(s, done.prepKey), build = phase(s, done.actionKey);
  assert.equal(done.calls.at(-1).status, 'settled', 'the call finished and settled after Stop');
  assert.ok(build.cost > 0);
  assert.deepEqual([build.refunded, await net(s)], [build.cost, plan.cost]);
  assert.equal((await s.job(body.job.id)).job.usage.note, NOT_CHARGED, 'the stopped card says what happened to its credits');
  assert.equal(refunds(s).length, 1);
});

test('Stop at the plan, before Generate, changes nothing: the plan was delivered and stays charged', { skip }, async t => {
  const s = animationStack(t);
  const { body } = await s.create();
  const waiting = await s.run(body.job.id);
  assert.equal((await s.send('cancel', {}, body.job.id)).body.job.stage, 'cancelled');
  assert.deepEqual([refunds(s).length, await net(s)], [0, phase(s, waiting.prepKey).cost]);
  assert.equal((await s.job(body.job.id)).job.usage.note, undefined);
});

test('a provider interruption stays free and says so in the same words; an interrupted call is not charged', { skip }, async t => {
  const s = animationStack(t, { status: role => (role === 'author' ? 529 : 200) });
  const { id, done } = await s.generated();
  assert.deepEqual([done.stage, done.failure.category], ['failed', 'provider_unavailable']);
  assert.deepEqual([phase(s, done.actionKey).cost, refunds(s).length, await net(s)], [0, 0, phase(s, done.prepKey).cost]);
  assert.match((await s.job(id)).job.failure.message, new RegExp(`^The AI service was busy\\. ${NOT_CHARGED.replace('.', '\\.')} It was retried automatically\\.`));
  // The isolate died during the author call: its outcome was never recorded, and nothing was settled for the learner.
  const d = animationStack(t, { reply: role => (role === 'review' ? { accepted: true } : {}) });
  const { body } = await d.create();
  await d.run(body.job.id); await d.approve(body.job.id);
  const stuck = d.state.data.get(`job:${body.job.id}`);
  Object.assign(stuck, { inFlight: { key: 'k', role: 'author', at: Date.now() } });
  stuck.calls.push({ key: 'k', role: 'author', phase: 'generation', status: 'running', boundMicros: 1 });
  const out = await d.run(body.job.id, d.object());
  assert.equal(out.stage, 'failed');
  assert.match((await d.job(body.job.id)).job.failure.message, new RegExp(`^An AI step was interrupted\\. ${NOT_CHARGED.replace('.', '\\.')} Try again`));
  assert.deepEqual([refunds(d).length, await net(d)], [0, phase(d, out.prepKey).cost]);
});

// FINAL ATTEMPT (owner 2026-11-03): attempt 1 builds and fails at the sample render, and is refunded when it fails; Render again starts attempt 2,
// which reviews, repairs and reviews again and is accepted. The learner pays attempt 2's generation calls, not attempt 1's author call.
const flaky = () => {
  let renders = 0;
  return STUB_PIPELINE({ render: async (...a) => { if (renders++ < 2) throw Object.assign(new Error('The animation could not be rendered for review (render_failed). Retry rendering.'), { status: 503, code: 'render_failed', category: 'renderer' }); return STUB_PIPELINE().render(...a); } });
};
const attemptCost = (job, attempt) => job.calls.filter(c => c.phase === 'generation' && c.attempt === attempt).reduce((total, c) => total + c.costMicros, 0);
test('a build that fails, is retried and then succeeds is charged only its final attempt; the earlier attempt stays refunded', { skip }, async t => {
  const s = animationStack(t, { pipeline: flaky(), reply: (role, n) => (role === 'review' ? { accepted: n >= 2 } : {}) });
  const { id, done } = await s.generated();
  assert.deepEqual([done.stage, done.attempt, done.failure.stage], ['failed', 1, 'rendering']);
  const first = phase(s, done.actionKey);
  assert.deepEqual([first.calls, first.refunded], [1, first.cost], 'attempt 1 (the author call) is refunded the moment it fails');
  assert.match((await s.job(id)).job.failure.message, new RegExp(NOT_CHARGED.replace('.', '\\.')));
  assert.equal((await s.send('retry', { expectedAttempt: 1, action: 'retry_render' }, id)).status, 202);
  const ready = await s.run(id), plan = phase(s, ready.prepKey), build = phase(s, ready.actionKey);
  assert.deepEqual([ready.stage, ready.attempt, ready.calls.filter(c => c.phase === 'generation').map(c => [c.role, c.attempt])],
    ['ready', 2, [['author', 1], ['review', 2], ['repair', 2], ['review', 2]]], 'the final attempt is the job\'s attempt at ready: its review, repair and review');
  assert.equal(build.calls, 4);
  assert.equal(build.refunded, attemptCost(ready, 1), 'only attempt 1 is refunded, and it stays refunded');
  assert.equal(await net(s), plan.cost + attemptCost(ready, 2), 'the learner is charged the plan and attempt 2\'s generation calls, exactly');
  assert.equal((await s.job(id)).job.usage.credits, Math.ceil((plan.cost + attemptCost(ready, 2)) / 10000), 'and the job view agrees');
  assert.equal(refunds(s).length, 1, 'nothing was taken back: one refund row, no positive row');
  assert.ok(refunds(s).every(r => r.micros < 0 && r.reason === `${jobs.ANIMATION_REFUND}:1`));
  // Replays: the end of the job again, status reads and a restarted object change nothing.
  const settled = [await net(s), refunds(s).length];
  await s.actor.finishUsage(ready, 'completed'); await s.job(id); await s.job(id); await s.object().alarm();
  assert.deepEqual([await net(s), refunds(s).length], settled, 'charged once, refunded once');
});

test('a refund that did not land when an attempt failed is made before the next attempt starts', { skip }, async t => {
  const s = animationStack(t, { pipeline: flaky(), reply: (role, n) => (role === 'review' ? { accepted: n >= 2 } : {}) });
  const { id, done } = await s.generated();
  assert.equal(done.stage, 'failed');
  s.sqlite.prepare('UPDATE usage_attempt_detail SET refunded_micros = 0, refunded_at = NULL, refund_reason = NULL').run(); // the write was lost
  assert.equal((await s.send('retry', { expectedAttempt: 1, action: 'retry_render' }, id)).status, 202);
  assert.equal(phase(s, done.actionKey).refunded, attemptCost(s.stored(id), 1), 'refunded as the retry began, before attempt 2 made a call');
  const ready = await s.run(id);
  assert.equal(ready.stage, 'ready');
  assert.equal(await net(s), phase(s, ready.prepKey).cost + attemptCost(ready, 2));
});

test('every failed attempt is refunded and counts toward the daily limit; the attempt that succeeds is the only one charged', { skip }, async t => {
  let reviews = 0;
  const flakyReview = STUB_PIPELINE({ review: async (...a) => { const out = await STUB_PIPELINE().review(...a); if (reviews++ < 2) throw Object.assign(new Error('The review stopped.'), { status: 503, category: 'transport' }); return out; } });
  const s = animationStack(t, { pipeline: flakyReview, reply: role => (role === 'review' ? { accepted: true } : {}) });
  const { id, done } = await s.generated();
  assert.deepEqual([done.stage, done.attempt], ['failed', 1]);
  for (const attempt of [1, 2]) {
    assert.equal((await s.send('retry', { expectedAttempt: attempt, action: 'new_attempt' }, id)).status, 202, `retry ${attempt}`);
    const out = await s.run(id);
    assert.deepEqual([out.stage, out.attempt], [attempt === 1 ? 'failed' : 'ready', attempt + 1]);
  }
  const ready = s.stored(id), plan = phase(s, ready.prepKey), build = phase(s, ready.actionKey);
  assert.deepEqual(ready.calls.filter(c => c.phase === 'generation').map(c => [c.role, c.attempt]), [['author', 1], ['review', 1], ['review', 2], ['review', 3]]);
  assert.equal(build.refunded, attemptCost(ready, 1) + attemptCost(ready, 2));
  assert.equal(await net(s), plan.cost + attemptCost(ready, 3), 'only attempt 3 is charged');
  assert.deepEqual([...new Set(refunds(s).map(r => r.reason))].sort(), [`${jobs.ANIMATION_REFUND}:1`, `${jobs.ANIMATION_REFUND}:2`]);
  assert.equal(await s.actor.refundedToday(OWNER.userId), 2, 'two refunded attempts, though it is one job that reached ready');
});

test('at most freeFailuresPerDay refunded generations in 24 hours: the next Generate is refused in credits-only words, and the day resets it', { skip }, async t => {
  const cap = policy.ANIMATION_BILLING.freeFailuresPerDay;
  const s = animationStack(t);
  for (let i = 0; i < cap; i++) {
    const { done } = await s.generated({ requestId: `req-0000000${i}`, cardId: `card-000${i}` });
    assert.equal(done.stage, 'failed', `failure ${i + 1}`);
  }
  assert.equal(new Set(refunds(s).map(r => r.action_id)).size, cap, 'each failed generation counts once');
  const { body } = await s.create({ requestId: 'req-00000099', cardId: 'card-0099' });
  await s.run(body.job.id);
  const refused = await s.approve(body.job.id);
  assert.deepEqual([refused.status, refused.body.reason, refused.body.error], [429, 'free_retries_exhausted', 'You have reached today\'s limit of free retries. Try again tomorrow.']);
  assert.doesNotMatch(refused.body.error, /\$|US\$|dollars?/);
  assert.deepEqual([s.stored(body.job.id).stage, s.stored(body.job.id).proposal], ['awaiting_approval', null], 'a refused Generate consumes nothing');
  // 24 hours later the earliest ones no longer count.
  s.sqlite.prepare('UPDATE usage_adjustments SET created_at = created_at - 86401').run();
  assert.equal((await s.approve(body.job.id)).status, 202);
});

test('jobs that cost the learner nothing do not use the daily allowance of free retries', { skip }, async t => {
  const cap = policy.ANIMATION_BILLING.freeFailuresPerDay;
  const s = animationStack(t, { status: role => (role === 'author' ? 529 : 200) });
  for (let i = 0; i < cap + 1; i++) assert.equal((await s.generated({ requestId: `req-0000000${i}`, cardId: `card-000${i}` })).done.stage, 'failed');
  assert.equal(refunds(s).length, 0);
  const { body } = await s.create({ requestId: 'req-00000099', cardId: 'card-0099' });
  await s.run(body.job.id);
  assert.equal((await s.approve(body.job.id)).status, 202);
});

test('the allowance gate still needs the whole build\'s worst case at Generate, whatever was refunded', { skip }, async t => {
  const s = animationStack(t);
  assert.equal((await s.generated()).done.stage, 'failed');
  const { body } = await s.create({ requestId: 'req-00000002', cardId: 'card-0002' });
  await s.run(body.job.id);
  const need = animationReservation(TASKS).generationMicros, used = await net(s);
  spent(s.sqlite, 50e6 - used - need + 1);
  const refused = await s.approve(body.job.id);
  assert.deepEqual([refused.status, refused.body.reason], [429, 'insufficient']);
  assert.equal(s.stored(body.job.id).proposal, null);
  s.sqlite.prepare("UPDATE usage_attempts SET cost_micros = cost_micros - 1 WHERE attempt_id = 'seed-a'").run();
  assert.equal((await s.approve(body.job.id)).status, 202, 'exactly the worst case is enough');
});

test('the policy names its defaults: plan-phase calls stay charged, five free failures a day', () => {
  assert.deepEqual({ ...policy.ANIMATION_BILLING }, { planPhaseRefunded: false, freeFailuresPerDay: 5 });
});
