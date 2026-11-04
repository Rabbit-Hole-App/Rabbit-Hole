// Owner decision 35 (C12, g1; FX-AN-115): the repairs are capped PER KIND, two for a candidate that fails to validate or render ('run') and two for a review rejection ('review'),
// so a validation or render problem never takes a slot the review needs (C11 Gate 2, jobs 1, 3, 5 and 7: the one run repair was used, and the review's finding then went unrepaired).
// Every repaired candidate is still validated, rendered and reviewed again. Offline: the stub pipeline and the fake provider, no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STUB_PIPELINE, animationStack } from './animation-fixture.js';

const skip = false;
const problem = { problems: ['nodes.d0 is not a node of this artifact'], repairable: true };

// A pipeline whose validation, render check and review answer from lists, in the order they are asked: `true` passes, anything else is the stage's problem or rejection.
function scripted({ validate = [], render = [], review = [] }) {
  const next = list => (list.length ? list.shift() : true);
  return STUB_PIPELINE({
    validate: async (job, ctx) => { const v = next(validate); return v === true ? STUB_PIPELINE().validate(job, ctx) : v; },
    render: async job => { const v = next(render); return v === true ? STUB_PIPELINE().render(job) : v; },
    review: async (job, ctx) => { const v = next(review); return v === true ? { ...(await STUB_PIPELINE().review(job, ctx)), accepted: true, findings: [] } : { ...(await STUB_PIPELINE().review(job, ctx)), accepted: false }; },
  });
}

test('a validation problem, a render check problem, a review rejection and a review repair: four repairs and the build is accepted', { skip }, async t => {
  const s = animationStack(t, { pipeline: scripted({ validate: [problem], render: [problem], review: [false, false, true] }) });
  const { done } = await s.generated();
  assert.equal(done.stage, 'ready', JSON.stringify(done.failure));
  assert.deepEqual([done.repairs, done.repairKinds], [4, ['run', 'run', 'review', 'review']]);
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'repair', 'repair', 'review', 'repair', 'review', 'repair', 'review'], 'each repaired candidate is validated, rendered and reviewed again; the review runs only on candidates that passed');
  assert.deepEqual(done.findings.filter(f => f.stage === 'reviewing').map(f => f.accepted), [false, false, true]);
  assert.equal(done.result.artifactHash, done.artifactHash, 'the accepted artifact is the last repaired one');
});

test('a third run problem stops "rounds" although no review repair was used: the cap is by kind, not by the sum', { skip }, async t => {
  const s = animationStack(t, { pipeline: scripted({ validate: [problem], render: [problem, problem] }) });
  const { done } = await s.generated();
  assert.deepEqual([done.stage, done.stopReason, done.repairs, done.repairKinds], ['failed', 'rounds', 2, ['run', 'run']]);
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'repair', 'repair']);
  assert.match(done.failure.message, /even after a correction/);
});

test('a fifth problem stops "rounds": after four repairs, two of each kind, the next rejection is final and no fifth repair is asked', { skip }, async t => {
  const s = animationStack(t, { pipeline: scripted({ validate: [problem], render: [problem], review: [false, false, false] }) });
  const { done } = await s.generated();
  assert.deepEqual([done.stage, done.stopReason, done.result], ['failed', 'rounds', null]);
  assert.deepEqual([done.repairs, done.repairKinds], [4, ['run', 'run', 'review', 'review']]);
  assert.equal(s.model.roles().filter(r => r === 'repair').length, 4);
  assert.deepEqual(s.model.roles().filter(r => r === 'review').length, 3);
  assert.match((await s.job(done.id)).job.failure.message, /corrected automatically four times, but it still did not pass/);
});

test('a run problem after both review repairs is still repaired once the run kind has a slot, and a third review rejection stops although run slots remain', { skip }, async t => {
  // review rejects twice (two review repairs), the repaired candidate then fails to validate (run 1, a slot left), is repaired, and is rejected a third time: the review kind is full.
  const s = animationStack(t, { pipeline: scripted({ validate: [true, true, problem], review: [false, false, false] }) });
  const { done } = await s.generated();
  assert.deepEqual([done.stage, done.stopReason], ['failed', 'rounds']);
  assert.deepEqual([done.repairs, done.repairKinds], [3, ['review', 'review', 'run']]);
});
