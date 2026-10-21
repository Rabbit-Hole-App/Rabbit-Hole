// packages/control-plane/test/learn-rubric-assessment.test.js
// Tutor Task 13 (C:/s/spec/tutor-workflow/draft.md; owner decision 7a): rich-rubric assessment of saved text and code
// attempts, through the real attempt route, store and capability gate on node:sqlite. The Opus 5.5 rubric role is a stub
// (deps.callModel) behind the real spend admission; no provider is reached. Stubs prove wiring, never rubric quality.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCriterionSummary, deriveGoalCounts } from '../../web/src/learn-coaching-contract.js';
import { CLAIM_TTL_MS, acceptAttempt, readAttempt } from '../src/learn-attempt-store.js';
import { assessAttempt } from '../src/learn-assessment.js';
import { EVALUATOR_TIMEOUT_MS, LIMITS, RUBRIC_SYSTEM, carriesRubric, locate, readRubricReply } from '../src/learn-rubric-assessment.js';
import { ANA, call, never, submit, world } from './learn-attempt-fixture.js';
import { PYTHON, PYTHON_CASE, PYTHON_PROMPT, SURVEY_CARD, WRITING, WRITING_CASES, WRITING_PROMPT, boardWith, coachingActivity, dataOf, replying } from './learn-rich-fixtures.js';

const ON = { TUTOR_RUBRIC_ASSESSMENT_ENABLED: 'true' };
const SURVEY_REF = { kind: 'card', id: SURVEY_CARD.id, version: 1 };
const statusOf = (body, criteria = WRITING) => Object.fromEntries(criteria.map(c => [c.criterionId, deriveCriterionSummary({ criterion: { ...c, version: 1 }, observations: body.assessments.flatMap(a => a.observations) }).status]));
const fits = assessment => Object.fromEntries(assessment.observations.map(o => [o.criterionId, o.fit]));

async function writingWorld(t, { env = {}, checkpoint, sourceRefs = [SURVEY_REF] } = {}) {
  const w = world(t, { ...ON, ...env });
  boardWith(w.sqlite, [SURVEY_CARD]);
  const { activity, goalId } = await coachingActivity(w.env, { sourceRefs, checkpoint });
  return { ...w, activity, goalId };
}
const send = (w, text, deps, extra = {}) => submit(w.env, ANA, w.activity, { submissionKey: extra.key ?? `sub-${Math.random().toString(36).slice(2, 12)}`, submittedContent: { text }, sourceRefs: extra.sourceRefs ?? [SURVEY_REF], ...extra.body }, deps);

test('alternative_argument_can_meet_rubric: two different defensible proposals meet the same rubric; there is no preferred answer in the prompt', async t => {
  const w = await writingWorld(t);
  const a = replying(WRITING_CASES.proposalA.reply), b = replying(WRITING_CASES.proposalB.reply);
  const first = await send(w, WRITING_CASES.proposalA.text, { ...never, callModel: a.callModel });
  const second = await send(w, WRITING_CASES.proposalB.text, { ...never, callModel: b.callModel });
  for (const [r, stub] of [[first, a], [second, b]]) {
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(stub.calls.length, 1, 'one rubric call');
    assert.equal(stub.calls[0].model, 'claude-opus-5-5', 'the configured Opus 5.5 rubric role, never a fallback');
    assert.deepEqual([r.body.assessment.status, r.body.assessment.route, r.body.assessment.provenance.route], ['completed', 'larger', 'rubric']);
    assert.deepEqual(fits(r.body.assessment), { claim: 'met', support: 'met', connection: 'met', limitation: 'met' });
    assert.deepEqual(Object.values(statusOf(r.body)), Array(4).fill('demonstrated_independently'));
  }
  // Both prompts carry the same rubric, the task and the source, and nothing that names a preferred position.
  const [pa, pb] = [dataOf(a.calls[0].body), dataOf(b.calls[0].body)];
  assert.deepEqual(pa.rubric, pb.rubric);
  assert.deepEqual(pa.rubric.map(c => c.criterionId), ['claim', 'support', 'connection', 'limitation']);
  assert.equal(pa.task, WRITING_PROMPT);
  assert.deepEqual(Object.keys(pa).sort(), ['rubric', 'sources', 'submission', 'task']);
  assert.match(a.calls[0].body.system, /There is no preferred answer to compare against/);
  assert.equal(pa.submission.text, WRITING_CASES.proposalA.text, 'the exact submitted version');
  // The different position is recorded as a valid alternative, with spans located in the learner's own words.
  const claimB = second.body.assessment.observations.find(o => o.criterionId === 'claim');
  assert.equal(claimB.reason, 'valid_alternative');
  const span = second.body.assessment.provenance.criteria.find(c => c.criterionId === 'claim').spans[0];
  assert.equal(WRITING_CASES.proposalB.text.slice(span.start, span.end), 'the library should open for one extra hour after school on Tuesdays and Thursdays');
  // A reply that calls a valid alternative "not met" is contradictory: an unresolved conflict, never a fail.
  const forced = structuredClone(WRITING_CASES.proposalB.reply);
  Object.assign(forced.criteria[0], { fit: 'not_met', evidence: [], alternative: true });
  const third = await send(w, `${WRITING_CASES.proposalB.text} `, { ...never, callModel: replying(forced).callModel });
  const claim = third.body.assessment.observations.find(o => o.criterionId === 'claim');
  assert.deepEqual([claim.fit, claim.conflict, claim.reason], ['unclear', true, 'alternative_conflict']);
  assert.equal(statusOf(third.body).claim, 'needs_review');
});

test('style_preference_is_not_failure: style remarks stay notes; an invented style criterion is rejected and nothing fails for style', async t => {
  const w = await writingWorld(t);
  const reply = structuredClone(WRITING_CASES.proposalB.reply);
  reply.criteria.push({ criterionId: 'grammar', version: 1, fit: 'not_met', reasoning: 'missing', evidence: [], alternative: false, uncertain: false, explanation: 'Informal voice.' });
  reply.notes = ['The voice is informal.', 'Consider a stronger opening sentence.'];
  const r = await send(w, WRITING_CASES.proposalB.text, { ...never, callModel: replying(reply).callModel });
  const a = r.body.assessment;
  assert.deepEqual(fits(a), { claim: 'met', support: 'met', connection: 'met', limitation: 'met' });
  assert.ok(!a.observations.some(o => o.fit === 'not_met'), 'nothing is marked wrong for style');
  assert.deepEqual(a.provenance.rejected, [{ criterionId: 'grammar', version: 1, reason: 'unknown_criterion' }]);
  assert.deepEqual(a.provenance.notes, reply.notes, 'style feedback is kept apart from the evidence');
  assert.match(RUBRIC_SYSTEM, /Grammar, polish, style, voice, length and the position the learner takes are not criteria/);
});

test('unsupported_fact_is_unverified: a claim no authorized source states is unverified, never false; the fictional source keeps its label', async t => {
  const w = await writingWorld(t);
  const stub = replying(WRITING_CASES.unsupportedFact.reply);
  const r = await send(w, WRITING_CASES.unsupportedFact.text, { ...never, callModel: stub.callModel });
  const a = r.body.assessment;
  assert.equal(a.status, 'completed');
  const claims = a.provenance.factualClaims.map(c => [WRITING_CASES.unsupportedFact.text.slice(c.span.start, c.span.end).slice(0, 15), c.status, c.sourceLabel ?? null]);
  assert.deepEqual(claims, [['Research proves', 'unverified', null], ['18 of 30 studen', 'source_cited', 'Fictional school scenario']]);
  assert.ok(!JSON.stringify(a).includes('"false"'), 'no claim is ever judged false');
  // The authorized source reaches the prompt verbatim with its fictional label, and its hash is recorded.
  const data = dataOf(stub.calls[0].body);
  assert.deepEqual(data.sources, [{ id: 'S1', label: 'Fictional school scenario', text: `${SURVEY_CARD.title}\n${SURVEY_CARD.body}` }]);
  assert.match(a.provenance.sources[0].sha256, /^[0-9a-f]{64}$/);
  // A claim quoting words the learner never wrote is dropped; a source the learner may not read is never sent.
  const read = readRubricReply({ criteria: [], factualClaims: [{ quote: 'Libraries cure boredom', sourceId: null, sourceQuote: null }] }, { criteria: WRITING, fields: [{ field: 'text', text: 'x' }], sources: [], assistance: 'none' });
  assert.deepEqual(read.factualClaims, []);
  const gone = await writingWorld(t, { sourceRefs: [SURVEY_REF, { kind: 'file', id: 'fs-1', version: 1 }] });
  const stub2 = replying(WRITING_CASES.unsupportedFact.reply);
  const r2 = await send(gone, WRITING_CASES.unsupportedFact.text, { ...never, callModel: stub2.callModel }, { sourceRefs: [{ kind: 'file', id: 'fs-1', version: 1 }] });
  assert.deepEqual(dataOf(stub2.calls[0].body).sources, []);
  assert.deepEqual(r2.body.assessment.provenance.sourcesUnavailable, [{ kind: 'file', id: 'fs-1', reason: 'source_unavailable' }]);
  assert.deepEqual(r2.body.assessment.provenance.factualClaims.map(c => c.status), ['unverified', 'unverified'], 'nothing is verified against a source that was not read');
});

test('generated_rewrite_is_assisted: a tutor-written rewrite the learner submits is assisted whatever the reply says; it is never independent', async t => {
  const w = await writingWorld(t, { checkpoint: { assistanceRefs: WRITING_CASES.rewrite.assistanceRefs } });
  const r = await send(w, WRITING_CASES.rewrite.text, { ...never, callModel: replying(WRITING_CASES.rewrite.reply).callModel });
  assert.equal(r.body.attempt.assistance, 'assisted', 'the server recorded the help');
  assert.deepEqual(r.body.assessment.observations.map(o => o.assistance), Array(4).fill('assisted'), 'the reply\'s "assistance": "none" is ignored');
  assert.deepEqual(Object.values(statusOf(r.body)), Array(4).fill('demonstrated_with_help'));
});

test('unknown_criterion_is_rejected: invented, wrong-version, duplicated and evidence-free judgements are never stored', async t => {
  const w = await writingWorld(t);
  const text = WRITING_CASES.proposalA.text;
  const reply = {
    criteria: [
      { criterionId: 'claim', version: 1, fit: 'met', reasoning: 'not_required', evidence: ['Our library should stay open later.'], explanation: 'ok' },
      { criterionId: 'claim', version: 1, fit: 'not_met', reasoning: 'missing', evidence: [], explanation: 'duplicate' },
      { criterionId: 'support', version: 2, fit: 'met', reasoning: 'not_required', evidence: ['18 of 30 students'], explanation: 'wrong version' },
      { criterionId: 'mastery', version: 1, fit: 'met', reasoning: 'supported', evidence: ['Our library'], explanation: 'invented' },
      { criterionId: 'connection', version: 1, fit: 'met', reasoning: 'supported', evidence: ['Words the learner never wrote.'], explanation: 'no evidence' },
      { criterionId: 'limitation', version: 1, fit: 'excellent', reasoning: 'supported', evidence: ['A short trial'], explanation: 'bad value' },
    ],
  };
  const r = await send(w, text, { ...never, callModel: replying(reply).callModel });
  const a = r.body.assessment;
  assert.deepEqual(fits(a), { claim: 'met' });
  assert.deepEqual(a.provenance.rejected.map(x => [x.criterionId, x.version, x.reason]), [
    ['claim', 1, 'duplicate_criterion'], ['support', 2, 'unknown_criterion'], ['mastery', 1, 'unknown_criterion'],
    ['connection', 1, 'unsupported_evidence'], ['limitation', 1, 'malformed_criterion'],
  ]);
  assert.deepEqual(a.provenance.unassessed.map(x => [x.criterionId, x.reason]), [['support', 'not_returned'], ['connection', 'unsupported_evidence'], ['limitation', 'malformed_criterion']]);
  assert.deepEqual(statusOf(r.body), { claim: 'demonstrated_independently', support: 'not_checked', connection: 'not_checked', limitation: 'not_checked' });
  // Nothing valid at all: the operation fails and observes nothing.
  const none = await send(w, `${text} `, { ...never, callModel: replying({ criteria: [reply.criteria[3]] }).callModel });
  assert.deepEqual([none.body.assessment.status, none.body.assessment.reason, none.body.assessment.observations], ['failed', 'no_supported_observations', []]);
});

test('failed_rubric_call_does_not_mark_wrong: error, malformed output, timeout, refusal and a missing key observe nothing; the confirmed summary stays', async t => {
  const w = await writingWorld(t);
  const good = await send(w, WRITING_CASES.proposalA.text, { ...never, callModel: replying(WRITING_CASES.proposalA.reply).callModel });
  const confirmed = statusOf(good.body);
  const id = good.body.attempt.attemptId;
  const review = (key, deps) => call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${id}/reassess`, { requestKey: key }, { ...never, ...deps });
  const hang = { calls: 0, callModel: () => { hang.calls++; return new Promise(() => {}); } };
  const cases = [
    ['review-http-01', { callModel: replying(null, { status: 500 }).callModel }, ['failed', 'evaluator_error']],
    ['review-junk-01', { callModel: replying(null, { text: 'I think it is pretty good overall.' }).callModel }, ['failed', 'malformed_evaluation']],
    ['review-time-01', { callModel: hang.callModel, timeoutMs: 20 }, ['unknown', 'completion_unknown']],
  ];
  for (const [key, deps, expected] of cases) {
    const r = await review(key, deps);
    assert.deepEqual([r.body.assessment.status, r.body.assessment.reason, r.body.assessment.observations], [...expected, []], key);
    assert.equal(r.body.assessment.provenance.calls.length, 1, key);
    assert.deepEqual(statusOf(r.body), confirmed, `${key}: the confirmed summary stays`);
  }
  assert.equal(hang.calls, 1);
  // The spend guard refuses before transport: no call is made.
  const capped = await writingWorld(t, { env: { SMALL_ENV: 'dev' } });
  const blocked = replying(WRITING_CASES.proposalA.reply);
  const refused = await send(capped, WRITING_CASES.proposalA.text, { ...never, callModel: blocked.callModel });
  assert.deepEqual([refused.body.assessment.status, refused.body.assessment.reason, refused.body.assessment.provenance.calls[0].outcome, blocked.calls.length], ['unavailable', 'allowance_refused', 'refused', 0]);
  // No key and no injected transport: the real anthropic() says not configured; nothing is sent anywhere.
  const bare = await writingWorld(t);
  const unkeyed = await send(bare, WRITING_CASES.proposalA.text, { ask: never.ask });
  assert.deepEqual([unkeyed.body.assessment.status, unkeyed.body.assessment.reason], ['unavailable', 'evaluator_unconfigured']);
});

test('incomplete reasoning stays practising: a claim with its support but no explanation or limitation demonstrates only what it shows', async t => {
  const w = await writingWorld(t);
  const r = await send(w, WRITING_CASES.incomplete.text, { ...never, callModel: replying(WRITING_CASES.incomplete.reply).callModel });
  assert.deepEqual(fits(r.body.assessment), { claim: 'met', support: 'met', connection: 'partial', limitation: 'not_met' });
  assert.deepEqual(statusOf(r.body), { claim: 'demonstrated_independently', support: 'demonstrated_independently', connection: 'practising', limitation: 'practising' });
  const counts = deriveGoalCounts({ criteria: WRITING.map(c => ({ ...c, version: 1 })), observations: r.body.assessment.observations });
  assert.deepEqual([counts.total, counts.counts.demonstrated_independently, counts.counts.practising], [4, 2, 2]);
});

test('a substantial code explanation is assessed by the rubric: spans point into the explanation and the code; the model is told nothing ran', async t => {
  const w = world(t, ON);
  const { activity } = await coachingActivity(w.env, { label: 'Debug a Python loop', criteria: PYTHON, prompt: PYTHON_PROMPT, responseKind: 'code' });
  const stub = replying(PYTHON_CASE.reply);
  const r = await submit(w.env, ANA, activity, { submissionKey: 'sub-code-0001', submittedContent: PYTHON_CASE.content }, { ...never, callModel: stub.callModel });
  const a = r.body.assessment;
  assert.deepEqual(fits(a), { trace: 'met', repair: 'met' });
  const spans = a.provenance.criteria.find(c => c.criterionId === 'repair').spans;
  assert.deepEqual(spans.map(s => s.field), ['explanation', 'explanation', 'code']);
  assert.equal(PYTHON_CASE.content.code.slice(spans[2].start, spans[2].end), 'return result');
  const data = dataOf(stub.calls[0].body);
  assert.deepEqual(data.submission, { responseKind: 'code', explanation: PYTHON_CASE.content.explanation, code: PYTHON_CASE.content.code, language: 'python' });
  assert.match(stub.calls[0].body.system, /you have not run it/i);
  assert.equal(stub.calls[0].body.max_tokens, 4000);
});

test('the capability gate: off by default, only criteria that carry a rubric, the rest listed unassessed; a stale task is withheld', async t => {
  assert.deepEqual([carriesRubric({ rubricVersion: 'rubric-writing-1' }), carriesRubric({ rubricVersion: 'r1' }), carriesRubric({})], [true, false, false]);
  // Disabled: a coaching text answer stays unassessed as before, and code is rubric_not_supported; no call either way.
  const off = world(t);
  boardWith(off.sqlite, [SURVEY_CARD]);
  const { activity } = await coachingActivity(off.env);
  const text = await submit(off.env, ANA, activity, { submissionKey: 'sub-off-0001' }, never);
  assert.deepEqual([text.body.assessment.status, text.body.assessment.reason], ['unavailable', 'no_registered_claims']);
  const { activity: code } = await coachingActivity(off.env, { label: 'Python', criteria: PYTHON, responseKind: 'code' });
  const c = await submit(off.env, ANA, code, { submissionKey: 'sub-off-0002', submittedContent: PYTHON_CASE.content }, never);
  assert.deepEqual([c.body.assessment.status, c.body.assessment.reason, c.body.assessment.provenance.gate], ['unavailable', 'rubric_not_supported', 'disabled']);
  // Enabled, mixed criteria: only those with a rubric are judged; a plain criterion is listed, never guessed.
  const w = world(t, ON);
  const plain = { criterionId: 'tone', label: 'Tone', requirement: 'Polite', requiresReasoning: false };
  const { activity: mixed } = await coachingActivity(w.env, { criteria: [...WRITING, plain] });
  const stub = replying(WRITING_CASES.proposalA.reply);
  const r = await submit(w.env, ANA, mixed, { submissionKey: 'sub-mix-0001', submittedContent: { text: WRITING_CASES.proposalA.text } }, { ...never, callModel: stub.callModel });
  assert.deepEqual(dataOf(stub.calls[0].body).rubric.map(x => x.criterionId), ['claim', 'support', 'connection', 'limitation']);
  assert.deepEqual(r.body.assessment.provenance.unassessed[0], { criterionId: 'tone', version: 1, reason: 'no_rubric' });
  assert.equal(r.body.assessment.rubricVersion, 'rubric-writing-1');
  assert.equal(dataOf(stub.calls[0].body).sources.length, 0, 'no source was named, none is read');
  // The prompt the learner answered goes only while it is that version.
  w.sqlite.prepare('UPDATE learn_activities SET revision = 2 WHERE id = ?').run(mixed.activityId);
  const saved = await acceptAttempt(w.env, ANA, { activityId: mixed.activityId, activityRevision: 2, submissionKey: 'sub-mix-0002', submittedContent: { text: WRITING_CASES.proposalB.text }, sourceRefs: [], assistanceRefs: [] });
  w.sqlite.prepare('UPDATE learn_activities SET revision = 3 WHERE id = ?').run(mixed.activityId);
  const late = replying(WRITING_CASES.proposalB.reply);
  await assessAttempt(w.env, ANA, saved.attemptId, { ...never, callModel: late.callModel });
  assert.match(dataOf(late.calls[0].body).task, /^not available/);
});

test('bounds: a long source is cut and says so, quotes must be the learner\'s words, and the evaluator timeout is inside the claim time limit', async t => {
  assert.ok(EVALUATOR_TIMEOUT_MS < CLAIM_TTL_MS, 'a slow call is not reconciled to unknown while it runs');
  const w = world(t, ON);
  boardWith(w.sqlite, [{ ...SURVEY_CARD, body: `${SURVEY_CARD.body} ${'More notes. '.repeat(400)}` }]);
  const { activity } = await coachingActivity(w.env, { sourceRefs: [SURVEY_REF] });
  const stub = replying(WRITING_CASES.proposalA.reply);
  const r = await submit(w.env, ANA, activity, { submissionKey: 'sub-long-0001', submittedContent: { text: WRITING_CASES.proposalA.text }, sourceRefs: [SURVEY_REF] }, { ...never, callModel: stub.callModel });
  const sent = dataOf(stub.calls[0].body).sources[0];
  assert.deepEqual([sent.text.length, sent.truncated], [LIMITS.sourceChars, true]);
  assert.equal(r.body.assessment.provenance.sources[0].truncated, true);
  // Whitespace may differ; the words may not.
  assert.deepEqual(locate('a  b\n c', 'a b c'), { start: 0, end: 7 });
  assert.equal(locate('a b c', 'a b d'), null);
  // The saved record replays on read, with no further call.
  const again = await readAttempt(w.env, ANA, r.body.attempt.attemptId);
  assert.deepEqual([again.assessment.status, stub.calls.length], ['completed', 1]);
});
