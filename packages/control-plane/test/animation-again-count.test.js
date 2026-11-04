// FX-AN-060 (Gate 2 on C6, preview c894e9e7, job 7 and C4 job 6): the first repair's same-turn correction ask (FX-AN-043, PROGRAM_CORRECTION) took the second repair slot, because the
// repair ceiling counted calls, so when validation then rejected the repaired draft there was no repair left and the build stopped "budget" with 2.56M of the 3.73M micro-USD ceiling
// used: the COUNT limit, worded as a spending limit. A correction ask (spec.again) is a call of its own: recorded, billed and bounded by the spending ceiling like any other, but it does
// not use a slot of the role's ceiling, and a role gets one such ask per build. Offline: fake provider, no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_LIMITS, animationReservation } from '../src/animation-policy.js';
import { ANIMATION_REPAIR_SYSTEM, repairTool } from '../src/agents/animation-author.js';
import { animationPipeline, failureText } from '../src/animation-job.js';
import { repairStage } from '../src/animation-repair.js';
import { experimentFixture } from '../../web/src/animation3d/fixtures.js';
import { STUB_PIPELINE, TASKS, animationStack } from './animation-fixture.js';

const planReply = (fixture, extra = {}) => { const { schema: _s, sourceRefs: _r, ...p } = fixture.plan; return { ...p, requested: { features: [] }, ...extra }; };

const withProgram = n => ({ scene: `beam ${n}`, program: { source: `export function evaluate(){return {}} // ${n}` } });
const noProgram = n => ({ scene: `beam ${n}` });

// The build of job 7: the review rejects the first draft (repair kind review); repair 1 answers without a program, is asked again and answers; validation rejects the repaired draft
// (repair kind run); repair 2 answers; validation rejects it again and the build ends. `repairs`: what each repair call answers, in order.
async function build(t, repairs) {
  let validations = 0;
  const pipeline = STUB_PIPELINE({
    validate: async (job, ctx) => (++validations === 1 ? STUB_PIPELINE().validate(job, ctx) : { problems: ['scene: a stand-in problem'], category: 'spec', repairable: true }),
    repair: repairStage,
  });
  const s = animationStack(t, { pipeline, reply: (role, n) => (role === 'review' ? { accepted: false } : role === 'repair' ? { operation: 'artifact', artifact: repairs[n - 1] } : {}) });
  const { body } = await s.create(); await s.run(body.job.id);
  await s.approve(body.job.id);
  const job = await s.run(body.job.id);
  return { s, job, repairCalls: s.model.roles().filter(r => r === 'repair').length };
}

test('FX-AN-060: a first repair that needs the correction ask still gets its second repair', async t => {
  // repair 1: no program, then (asked again) a complete draft; validation rejects it; repair 2: a new draft; validation rejects it: the build ends on its rounds, not on a limit.
  const { job, repairCalls } = await build(t, [noProgram(1), withProgram(2), withProgram(3)]);
  assert.equal(repairCalls, 3, 'three repair calls were made and recorded: repair 1, its correction ask, repair 2');
  assert.deepEqual(job.calls.filter(c => c.role === 'repair').map(c => [c.status, c.again === true]), [['settled', false], ['settled', true], ['settled', false]]);
  assert.equal(job.counts.repair, 2, 'the ceiling counts repairs, not asks');
  assert.equal(job.repairs, 2);
  assert.equal(job.stopReason, 'rounds', JSON.stringify(job.failure));
});

test('FX-AN-060: two repairs and one correction ask are three repair calls, never a fourth', async t => {
  // Both repairs lack a program the first time: the second repair's correction ask is refused (one ask per build), its first reply stands, and no fourth call is made.
  const { job, repairCalls } = await build(t, [noProgram(1), withProgram(2), noProgram(3), withProgram(4)]);
  assert.equal(repairCalls, 3);
  assert.equal(job.calls.filter(c => c.role === 'repair' && c.again).length, 1);
  assert.equal(job.counts.repair, 2);
});

test('FX-AN-060: the spending ceiling still refuses a correction ask that would pass it, and says so', async t => {
  const s = animationStack(t, { pipeline: animationPipeline, reply: (role, n) => (role === 'brief' ? planReply(experimentFixture) : {}) });
  const { body } = await s.create(); await s.run(body.job.id);
  await s.approve(body.job.id);
  const id = body.job.id, stored = () => s.stored(id), ceiling = stored().reservation.generationMicros;
  const spec = { system: ANIMATION_REPAIR_SYSTEM, tool: repairTool({ program: true }), content: 'x', again: true };
  Object.assign(stored(), { stage: 'repairing', counts: { ...stored().counts, repair: 1 }, bounds: { ...stored().bounds, generation: ceiling - 1 } });
  await assert.rejects(s.actor.paidCall(stored(), 'repair', spec), error => error.stopReason === 'budget' && /spending limit/.test(error.message), 'money, not count');
  Object.assign(stored(), { bounds: { ...stored().bounds, generation: 0 } });
  await assert.doesNotReject(s.actor.paidCall(stored(), 'repair', spec), 'with room, the ask is admitted although the ceiling of two is counted at one');
  assert.equal(stored().counts.repair, 1, 'and it did not take a slot');
  await assert.rejects(s.actor.paidCall(stored(), 'repair', spec), error => error.code === 'count_limit' && /repair limit/.test(error.message), 'one ask per build');
});

test('FX-AN-060: the call limits are unchanged, and the displayed ceiling is the C9 one (decision 28 raised it, FX-AN-060 did not)', () => {
  assert.deepEqual(ANIMATION_LIMITS.calls, { brief: 1, author: 1, review: 3, repair: 2 });
  const reservation = animationReservation(TASKS);
  assert.equal(reservation.generationMicros, 3846240, 'the worst case of one author, three reviews and two repairs: 3,726,240 before C9 plus 3 x 40,000 for the review at 8,000 output tokens (decision 28, FX-AN-102)');
  assert.deepEqual(Object.keys(reservation), ['version', 'preparationMicros', 'generationMicros', 'calls']);
});

test('FX-AN-060: a refused COUNT says which count, a refused spending ceiling says spending', () => {
  const base = { stage: 'failed', stopReason: 'budget', repairs: 1, findings: [], approval: { at: 1 }, plan: experimentFixture.plan, counts: { author: 1, review: 3, repair: 2 }, reservation: { preparationMicros: 1, generationMicros: 1 } };
  const count = failureText({ ...base, failure: { stage: 'repairing', category: 'budget', code: 'count_limit', message: 'This animation reached its repair limit.', retryable: true } });
  assert.match(count, /^The build reached its repair limit\./);
  const money = failureText({ ...base, failure: { stage: 'repairing', category: 'budget', message: 'This animation reached its spending limit.', retryable: true } });
  assert.match(money, /^The build reached its spending limit\./);
});
