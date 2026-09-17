import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_CRITERIA, validateEvaluation } from '../src/curriculum-evaluator.js';
import { runCurriculumWorkflow } from '../src/curriculum-workflow.js';
import { OUTLINE_EXAMPLES } from '../src/curriculum-outline-examples.js';

const input = { brief: { audience: 'Beginners', goal: 'Understand smoothing', knowledge: 'Arithmetic', duration: '20 minutes' },
  app: { name: 'sensor-viewer', evidence: 'Raw and smoothed plots; averages-only export.' }, clarification: '', references: [] };
const curriculum = OUTLINE_EXAMPLES[0].output;
const finding = { id: 'F1', severity: 'blocking', location: 'Module 2, lesson 1',
  problem: 'Averaging described as correcting the measurement.', basis: 'Averaging changes variation, not measurement truth.',
  requiredChange: 'Describe smoothing and delay rather than guaranteed accuracy.' };
const ready = () => ({ verdict: 'ready', checks: REVIEW_CRITERIA.map(criterion => ({ criterion, result: 'pass', findingIds: [] })),
  findings: [], resolvedFindingIds: [], ownerDecisions: [] });
const revise = () => {
  const review = ready(); review.verdict = 'revise'; review.findings = [structuredClone(finding)];
  Object.assign(review.checks.find(c => c.criterion === 'accuracy_evidence'), { result: 'fail', findingIds: ['F1'] });
  return review;
};
const generate = async () => ({ curriculum, model: 'generator-fixture' });

test('ready stops after one candidate and evaluator call, while preserving owner decisions', async () => {
  let calls = 0;
  const result = await runCurriculumWorkflow(input, { generate, evaluate: async (original, candidate, context) => {
    calls++; assert.deepEqual(original, input); assert.deepEqual(candidate, curriculum);
    assert.deepEqual(context, { iteration: 1, previousFindings: [] });
    return { evaluation: { ...ready(), ownerDecisions: ['Choose overview or longer format.'] } };
  } });
  assert.equal(calls, 1); assert.equal(result.status, 'ready'); assert.equal(result.history.length, 1);
  assert.equal(result.history[0].evaluation.ownerDecisions.length, 1);
});

test('feedback reaches the next generator; original brief and prior candidate stay intact', async () => {
  let candidates = 0;
  const result = await runCurriculumWorkflow(input, {
    generate: async (original, revision) => {
      assert.deepEqual(original, input);
      if (++candidates === 1) assert.equal(revision, null);
      else {
        assert.deepEqual(revision.feedback.findings, [finding]);
        assert.equal(revision.candidate.title, curriculum.title);
        revision.candidate.title = 'Revised smoothing course';
        return { curriculum: revision.candidate };
      }
      return { curriculum };
    },
    evaluate: async (original, candidate, context) => {
      assert.deepEqual(original, input);
      if (context.iteration === 1) return { evaluation: revise() };
      assert.deepEqual(context.previousFindings, [finding]);
      return { evaluation: { ...ready(), resolvedFindingIds: ['F1'] } };
    },
  });
  assert.equal(result.status, 'ready'); assert.equal(result.history.length, 2);
  assert.equal(result.history[0].curriculum.title, curriculum.title);
  assert.equal(result.curriculum.title, 'Revised smoothing course');
});

test('three rejected candidates exhaust the budget without becoming ready', async () => {
  let generationCalls = 0, evaluationCalls = 0;
  const result = await runCurriculumWorkflow(input, {
    generate: async () => { generationCalls++; return { curriculum }; },
    evaluate: async () => { evaluationCalls++; return { evaluation: revise() }; },
  });
  assert.equal(result.status, 'exhausted'); assert.equal(generationCalls, 3); assert.equal(evaluationCalls, 3);
  assert.equal(result.history.length, 3);
  assert.equal(result.history.at(-1).evaluation.findings[0].severity, 'blocking');
});

test('consequential missing information stops for the owner', async () => {
  const review = revise(); review.verdict = 'needs_input';
  review.checks.find(c => c.result === 'fail').result = 'unknown';
  review.ownerDecisions = ['Which incompatible learning goal should this course serve?'];
  const result = await runCurriculumWorkflow(input, { generate, evaluate: async () => ({ evaluation: review }) });
  assert.equal(result.status, 'needs_input'); assert.equal(result.history.length, 1);
});

test('inconsistent ready verdict fails closed and preserves candidate and raw review', async () => {
  const events = [], review = revise(); review.verdict = 'ready';
  await assert.rejects(runCurriculumWorkflow(input, {
    generate, evaluate: async () => ({ evaluation: review }), onEvent: event => events.push(event),
  }), error => {
    assert.match(error.message, /Verdict/); assert.equal(error.history.length, 1); return true;
  });
  assert.equal(events.find(e => e.phase === 'review_received').evaluation.verdict, 'ready');
  assert.equal(events.at(-1).phase, 'error');
});

test('provider failure preserves the completed draft and does not trigger implicit retries', async () => {
  let calls = 0;
  await assert.rejects(runCurriculumWorkflow(input, { generate, evaluate: async () => {
    calls++; throw new Error('provider unavailable');
  } }), error => { assert.equal(error.history[0].curriculum.title, curriculum.title); return true; });
  assert.equal(calls, 1);
});

test('checklist cannot omit criteria, invent references, or hide unresolved blockers', () => {
  const missing = ready(); missing.checks.pop();
  assert.throws(() => validateEvaluation(missing), /Incomplete/);
  const duplicate = ready(); duplicate.checks[1] = duplicate.checks[0];
  assert.throws(() => validateEvaluation(duplicate), /Incomplete/);
  const unlinked = revise(); unlinked.checks.find(c => c.result === 'fail').findingIds = ['missing'];
  assert.throws(() => validateEvaluation(unlinked), /references/);
  assert.throws(() => validateEvaluation(ready(), [finding]), /silently dropped/);
  const falseResolution = { ...ready(), resolvedFindingIds: ['never-existed'] };
  assert.throws(() => validateEvaluation(falseResolution), /resolved/);
});

test('minor findings alone do not require revision', () => {
  const review = ready(); review.findings = [{ ...finding, severity: 'minor' }];
  review.checks[0].findingIds = ['F1'];
  assert.equal(validateEvaluation(review).verdict, 'ready');
});
