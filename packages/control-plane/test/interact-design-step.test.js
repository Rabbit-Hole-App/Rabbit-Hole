import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicExplainJob } from '../src/explain-job.js';
import { freshDesign } from '../src/interact-design.js';
import { newTiming } from '../src/explain-policy.js';

// Owner, 2026-11-24: the pending card shows which step a blueprint job is on. The server sends the step key only, derived from the job's stage and the calls of this attempt.
const call = (role, status = 'settled') => ({ key: `${role}-${Math.random()}`, role, attempt: 1, status, costMicros: 1, startedAt: 1, endedAt: status === 'running' ? null : 2 });
const job = (stage, calls, flow = { version: 1, designKind: 'blueprint', seed: 7 }) => ({ id: 'ej_t', boardId: 'b', cardId: 'c', requestClass: 'explain', stage, attempt: 1, round: 0, calls, flow, design: freshDesign(), timing: newTiming('simple', 0), createdAt: 1, updatedAt: 2 });
const stepOf = (stage, calls) => publicExplainJob(job(stage, calls)).designStep;

test('a blueprint job sends the step key of the call in flight, and nothing else about it', () => {
  assert.deepEqual(stepOf('design_authoring', []), { step: 'plan', correcting: false }, 'no blueprint call yet');
  assert.deepEqual(stepOf('design_authoring', [call('blueprint_quantities', 'running')]), { step: 'plan', correcting: false });
  assert.deepEqual(stepOf('design_authoring', [call('blueprint_quantities')]), { step: 'plan', correcting: false }, 'between the quantities call and the design call');
  assert.deepEqual(stepOf('design_authoring', [call('blueprint_quantities'), call('blueprint_design', 'running')]), { step: 'design', correcting: false });
  assert.deepEqual(stepOf('design_authoring', [call('blueprint_quantities'), call('blueprint_design')]), { step: 'design', correcting: false }, 'the checks run inside Design');
  assert.deepEqual(stepOf('design_authoring', [call('blueprint_quantities'), call('blueprint_design'), call('blueprint_build', 'running')]), { step: 'build', correcting: false });
  assert.deepEqual(stepOf('design_authoring', [call('blueprint_quantities'), call('blueprint_design'), call('blueprint_build')]), { step: 'check', correcting: false }, 'the build call ended');
  for (const stage of ['design_verifying', 'authoring', 'validating']) assert.equal(stepOf(stage, []).step, 'check', stage);
  const sent = JSON.stringify(publicExplainJob(job('design_authoring', [call('blueprint_design', 'running')])));
  assert.doesNotMatch(sent, /blueprint_|hydrogen|gemini/i, 'no role id and no model name reaches the learner');
});

test('the second call of a role in this attempt is a correction; one of an earlier attempt is not', () => {
  assert.deepEqual(stepOf('design_authoring', [call('blueprint_quantities'), call('blueprint_design'), call('blueprint_design', 'running')]), { step: 'design', correcting: true }, 'the design correction');
  assert.deepEqual(stepOf('design_authoring', [call('blueprint_quantities'), call('blueprint_design'), call('blueprint_build'), call('blueprint_build', 'running')]), { step: 'build', correcting: true }, 'the build repair');
  assert.equal(stepOf('design_authoring', [call('blueprint_quantities'), call('blueprint_design'), call('blueprint_design')]).correcting, false, 'a correction that ended is not correcting any more');
  const earlier = { ...call('blueprint_design'), attempt: 0 };
  assert.deepEqual(stepOf('design_authoring', [earlier, call('blueprint_quantities', 'running')]), { step: 'plan', correcting: false }, 'calls of an earlier attempt do not count');
});

test('a job that is not a blueprint job has no designStep', () => {
  for (const flow of [null, { version: 1 }, { version: 1, designKind: 'fast' }]) assert.equal('designStep' in publicExplainJob(job('design_authoring', [], flow)), false, JSON.stringify(flow));
});
