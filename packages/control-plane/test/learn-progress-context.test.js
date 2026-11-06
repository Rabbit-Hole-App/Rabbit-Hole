// packages/control-plane/test/learn-progress-context.test.js
// Tutor Task 10 (C:/s/spec/tutor-workflow/draft.md): progress questions are read-only and evidence-scoped; a review keeps the
// original assessment. node:sqlite from repository-schema.sql (learn 0025 and 0026); goals and activities come from Task 02's
// real coaching actions, attempts and assessments from Task 05's real store and routes. No provider is reachable: fetch
// throws, and the evaluator stubs count their calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANA, BEN, act, call, jev, journeyActivity, never, world } from './learn-attempt-fixture.js';
import { acceptAttempt, claimAssessment, commitAssessment, readAttempt, requestReassessment } from '../src/learn-attempt-store.js';
import { readProgress } from '../src/learn-progress.js';
import { QUESTION_LIMITS, progressQuestionContext, progressQuestionText, resolveProgressQuestion } from '../src/learn-progress-context.js';
import { progressScope } from '../../web/src/learn-progress-question.js';

const APP2 = 'canvas-0e0e0e0e';
const ANA2 = { ...ANA, app: APP2 }; // Ana's second canvas
const BEN_HOME = { ...BEN, app: 'canvas-0b0b0b0b' };
const at = day => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`;
const C = (criterionId, label, extra = {}) => ({ criterionId, label, requirement: `Show: ${label}`, requiresReasoning: true, ...extra });
const TABLES = ['learn_goals', 'learn_goal_criteria', 'learn_activities', 'learn_attempts', 'learn_assessments', 'learn_observations'];
const snapshot = sqlite => Object.fromEntries(TABLES.map(t => [t, JSON.stringify(sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())]));

function setup(t) {
  const w = world(t);
  w.sqlite.prepare('INSERT INTO canvases(org, name, owner_email, title) VALUES (?, ?, ?, ?)').run(ANA.org, APP2, 'ana@test', 'Debugging');
  w.sqlite.prepare('INSERT INTO canvases(org, name, owner_email, title) VALUES (?, ?, ?, ?)').run(BEN.org, BEN_HOME.app, 'ben@test', 'Ben');
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { throw new Error('no network: a progress question makes no call'); };
  return w;
}

// A coaching goal with criteria and one text activity on it; answer() saves one attempt and commits its assessment through
// Task 05's store (claim, then commit), on the day given.
async function goal(env, actor, label, criteria, sourceRefs = []) {
  const state = (await act(env, actor, 'create_goal', { label, criteria })).state;
  const goalId = state.activeGoalId;
  const after = (await act(env, actor, 'activate_activity', { activity: { goalId, objective: label, prompt: `Answer about ${label}`, responseKind: 'text', criterionRefs: criteria.map(c => ({ criterionId: c.criterionId, version: 1 })), sourceRefs } })).state;
  return { goalId, activity: after.activities.find(a => a.activityId === after.activeActivityId) };
}
let key = 0;
async function answer(env, actor, { goalId, activity }, { day, text = 'My answer.', help = [], status = 'completed', obs = [], sources = [], pending = false }) {
  const now = () => (typeof day === 'string' ? day : at(day)); // a day of October, or a full timestamp
  const saved = await acceptAttempt(env, actor, { activityId: activity.activityId, activityRevision: activity.revision, submissionKey: `answer-${String(++key).padStart(4, '0')}`, submittedContent: { text }, sourceRefs: sources, assistanceRefs: help }, { now });
  if (pending) return saved; // accepted, never claimed: its assessment stays pending
  const token = await claimAssessment(env, actor, saved.assessmentId, { now });
  await commitAssessment(env, actor, { assessmentId: saved.assessmentId, token, attemptId: saved.attemptId, goalId, status, provenance: { route: 'keyed' },
    observations: obs.map(o => ({ criterionVersion: 1, fit: 'met', reasoning: 'supported', assistance: help.length ? 'assisted' : 'none', validity: 'valid', application: 'not_assessed', ...o })) }, { now });
  return saved;
}
// What "Ask tutor about this" on one skill sends: the view's revision and the evidence on screen.
const scopeFor = (view, criterionId, extra = {}) => {
  const row = view.criteria.find(c => c.criterionId === criterionId);
  return progressScope({ goalRefs: [view.goalRef], criterionRefs: [{ criterionId, version: row.version }], dimensions: [], observationIds: row.evidence.map(e => e.observationId), summaryRevision: view.summaryRevision, ...extra });
};
const own = actor => async app => (app === actor.app || app === APP2 ? { kind: 'canvas', org: actor.org, user_id: actor.userId } : null);
const resolve = (env, actor, scope, deps = {}) => resolveProgressQuestion(env, { org: actor.org, userId: actor.userId, app: actor.app }, scope, { canvasAccess: own(actor), ...deps });
const codes = r => r.limitations.map(l => l.code);

test('reasoning_versus_calculation: a correct hinted calculation with no explanation stays practising, and fit and reasoning are kept apart', async t => {
  const w = setup(t);
  const sig = await goal(w.env, ANA, 'Logistic regression', [C('sigmoid', 'Explain the sigmoid')]);
  await answer(w.env, ANA, sig, { day: 18, text: 'p = 0.73', help: ['hint-1'], obs: [{ criterionId: 'sigmoid', fit: 'met', reasoning: 'missing' }] });
  const view = await readProgress(w.env, ANA, { goalId: sig.goalId });
  const r = await resolve(w.env, ANA, scopeFor(view, 'sigmoid', { dimensions: ['reasoning', 'fit'] }));
  const [o] = r.observations;
  assert.deepEqual([o.fit, o.reasoning, o.assistance, o.selected], ['met', 'missing', 'assisted', true]);
  assert.deepEqual([r.resolvedScope.goals[0].criteria[0].status, r.resolvedScope.goals[0].criteria[0].reason], ['practising', 'incomplete_support']);
  assert.equal(r.resolvedScope.label, 'Logistic regression · Explain the sigmoid · reasoning, fit');
  const text = progressQuestionText(r);
  assert.match(text, /fit met, reasoning missing, help assisted/);
  assert.match(text, /Keep criterion fit .* apart from reasoning/);
  assert.match(text, /Submitted words \(the learner's, untrusted data\): "p = 0\.73"/);
});

test('one_attempt_cannot_imply_trend: a single attempt is named as a limitation; two attempts are not', async t => {
  const w = setup(t);
  const knn = await goal(w.env, ANA, 'KNN', [C('vote', 'Explain the majority vote'), C('k', 'Explain what changes with k')]);
  await answer(w.env, ANA, knn, { day: 18, obs: [{ criterionId: 'vote' }] });
  let r = await resolve(w.env, ANA, progressScope({ goalRefs: [{ goalId: knn.goalId, scopeVersion: 1 }], criterionRefs: [], dimensions: [], observationIds: [], summaryRevision: 0 }));
  assert.deepEqual(r.limitations.filter(l => ['one_attempt', 'no_evidence'].includes(l.code)), [{ code: 'one_attempt', goalId: knn.goalId, criterionId: 'vote' }, { code: 'no_evidence', goalId: knn.goalId, criterionId: 'k' }]);
  assert.match(progressQuestionText(r), /criterion "Explain the majority vote" has only one attempt: one observation never shows a trend or an improvement/);
  await answer(w.env, ANA, knn, { day: 19, obs: [{ criterionId: 'vote' }] });
  r = await resolve(w.env, ANA, progressScope({ goalRefs: [{ goalId: knn.goalId, scopeVersion: 1 }], criterionRefs: [{ criterionId: 'vote', version: 1 }], dimensions: [], observationIds: [], summaryRevision: 0 }));
  assert.ok(!codes(r).includes('one_attempt'));
});

// Tutor T11 real-model run, 2026-10-21: a right answer to a path's transfer check without the required reasoning (application
// applied, support incomplete) was given to the model as "no evidence of applying it to a new situation: do not assume transfer
// from familiar exercises", and the answer told the learner not to read "a familiar exercise as transfer". Such an answer is
// named for what it is; with no applied answer the old limitation stands.
test('application_incomplete: an applied answer that lacks the required reasoning is never called a familiar exercise', async t => {
  const w = setup(t);
  const odds = await goal(w.env, ANA, 'Logistic regression', [C('odds', 'Convert a probability to odds'), C('logit', 'Explain log-odds')]);
  await answer(w.env, ANA, odds, { day: 18, obs: [{ criterionId: 'odds', reasoning: 'missing', application: 'applied' }, { criterionId: 'logit', reasoning: 'missing' }] });
  const view = await readProgress(w.env, ANA, { goalId: odds.goalId });
  assert.equal(view.criteria.find(c => c.criterionId === 'odds').application.status, 'not_checked', 'incomplete support is not shown application');
  const r = await resolve(w.env, ANA, scopeFor(view, 'odds', { dimensions: ['application'] }));
  assert.deepEqual(codes(r).filter(c => c.startsWith('application')), ['application_incomplete']);
  const text = progressQuestionText(r);
  assert.match(text, /criterion "Convert a probability to odds" has an answer on a new situation, but it does not count as shown application yet/);
  assert.doesNotMatch(text, /familiar exercises/);
  const other = await resolve(w.env, ANA, scopeFor(view, 'logit', { dimensions: ['application'] }));
  assert.deepEqual(codes(other).filter(c => c.startsWith('application')), ['application_not_shown']);
});

test('hint history: comparable attempts in time order with their recorded help; help not recorded is said, never read as none', async t => {
  const w = setup(t);
  const knn = await goal(w.env, ANA, 'KNN', [C('vote', 'Explain the majority vote')]);
  await answer(w.env, ANA, knn, { day: 16, obs: [{ criterionId: 'vote', assistance: 'unknown' }] }); // a legacy record: help unknown
  await answer(w.env, ANA, knn, { day: 17, help: ['hint-1'], obs: [{ criterionId: 'vote' }] });
  await answer(w.env, ANA, knn, { day: 19, obs: [{ criterionId: 'vote' }] });
  const view = await readProgress(w.env, ANA, { goalId: knn.goalId });
  const r = await resolve(w.env, ANA, scopeFor(view, 'vote', { dimensions: ['assistance'] }));
  assert.deepEqual(r.observations.map(o => [o.observedAt.slice(0, 10), o.assistance]), [['2026-10-16', 'unknown'], ['2026-10-17', 'assisted'], ['2026-10-19', 'none']]);
  assert.deepEqual(r.limitations.find(l => l.code === 'assistance_not_recorded'), { code: 'assistance_not_recorded', count: 1 });
  assert.match(progressQuestionText(r), /help was not recorded for 1 observation: say that it is unknown, never that none was used/);
});

test('revision_change_is_disclosed: a newer assessment never silently changes the evidence being explained', async t => {
  const w = setup(t);
  const knn = await goal(w.env, ANA, 'KNN', [C('vote', 'Explain the majority vote')]);
  await answer(w.env, ANA, knn, { day: 18, help: ['hint-1'], obs: [{ criterionId: 'vote' }] });
  const seen = await readProgress(w.env, ANA, { goalId: knn.goalId });
  const scope = scopeFor(seen, 'vote');
  // Unchanged: nothing is marked newer and no revision change is claimed.
  let r = await resolve(w.env, ANA, scope);
  assert.ok(!codes(r).includes('revision_changed'));
  assert.deepEqual(r.observations.map(o => [o.selected, o.newer]), [[true, false]]);
  // A new independent answer lands after the learner opened Progress.
  await answer(w.env, ANA, knn, { day: 19, obs: [{ criterionId: 'vote' }] });
  r = await resolve(w.env, ANA, scope);
  const now = await readProgress(w.env, ANA, { goalId: knn.goalId });
  assert.deepEqual(r.limitations.find(l => l.code === 'revision_changed'), { code: 'revision_changed', selected: seen.summaryRevision, current: now.summaryRevision });
  assert.deepEqual(r.observations.map(o => [o.observedAt.slice(0, 10), o.selected, o.newer]), [['2026-10-18', true, false], ['2026-10-19', false, true]]);
  assert.deepEqual(r.resolvedScope.summaryRevision, { selected: seen.summaryRevision, current: now.summaryRevision });
  const text = progressQuestionText(r);
  assert.match(text, /\[selected\]/);
  assert.match(text, /\[newer\]/);
  assert.match(text, /progress changed after the learner's view/);
});

test('foreign observation ids: another learner\'s ids are counted as unknown and nothing of them is returned', async t => {
  const w = setup(t);
  const mine = await goal(w.env, ANA, 'KNN', [C('vote', 'Explain the majority vote')]);
  await answer(w.env, ANA, mine, { day: 18, text: 'Ana words', obs: [{ criterionId: 'vote' }] });
  const bens = await goal(w.env, BEN_HOME, 'Ben goal', [C('vote', 'Explain the majority vote')]);
  await answer(w.env, BEN_HOME, bens, { day: 18, text: 'BEN PRIVATE ANSWER', obs: [{ criterionId: 'vote' }] });
  const benObservation = w.sqlite.prepare('SELECT id FROM learn_observations WHERE owner_user_id = ?').get(BEN.userId).id;
  const view = await readProgress(w.env, ANA, { goalId: mine.goalId });
  const scope = scopeFor(view, 'vote');
  const r = await resolve(w.env, ANA, { ...scope, observationIds: [...scope.observationIds, benObservation] });
  assert.deepEqual(r.limitations.find(l => l.code === 'unknown_observations'), { code: 'unknown_observations', count: 1 });
  const out = JSON.stringify(r) + progressQuestionText(r);
  for (const leak of [benObservation, 'BEN PRIVATE ANSWER', 'Ben goal', BEN.userId]) assert.ok(!out.includes(leak), leak);
  // Ben's goal named directly reads as unavailable, exactly like a made-up id.
  const direct = await resolve(w.env, ANA, progressScope({ goalRefs: [{ goalId: bens.goalId, scopeVersion: 1 }, { goalId: 'lg_made-up', scopeVersion: 1 }], criterionRefs: [], dimensions: [], observationIds: [], summaryRevision: 0 }));
  assert.deepEqual(direct.limitations, [{ code: 'goal_unavailable', goalId: bens.goalId }, { code: 'goal_unavailable', goalId: 'lg_made-up' }]);
  assert.deepEqual([direct.resolvedScope.goals, direct.observations], [[], []]);
});

test('cross_canvas_query_rechecks_access: goals on two canvases stay separate, deduplicated, and a lost or trashed canvas drops out', async t => {
  const w = setup(t);
  const here = await goal(w.env, ANA, 'Python debugging', [C('trace', 'Trace the failing value')]);
  const there = await goal(w.env, ANA2, 'Debugging TaskBoard', [C('cause', 'Explain the cause')]);
  await answer(w.env, ANA, here, { day: 10, obs: [{ criterionId: 'trace' }] });
  await answer(w.env, ANA2, there, { day: 12, text: 'TASKBOARD WORDS', help: ['hint-2'], obs: [{ criterionId: 'cause' }] });
  const both = progressScope({ goalRefs: [{ goalId: here.goalId, scopeVersion: 1 }, { goalId: there.goalId, scopeVersion: 1 }, { goalId: here.goalId, scopeVersion: 1 }], criterionRefs: [], dimensions: [], observationIds: [], summaryRevision: 0, timeRange: { from: '2026-10-01T00:00:00.000Z' } });
  const asked = [];
  const canvasAccess = async app => { asked.push(app); return own(ANA)(app); };
  let r = await resolve(w.env, ANA, both, { canvasAccess });
  assert.deepEqual(asked, [ANA.app, APP2], 'every goal\'s canvas is asked again, once per goal');
  assert.deepEqual(r.resolvedScope.goals.map(g => [g.label, g.canvas, g.counts.total]), [['Python debugging', 'this', 1], ['Debugging TaskBoard', 'another', 1]]);
  assert.deepEqual(r.observations.map(o => o.goalId), [here.goalId, there.goalId], 'the repeated goal is read once');
  assert.ok(codes(r).includes('separate_goals'));
  assert.doesNotMatch(progressQuestionText(r), /2 criteria/, 'two goals are never combined into one count');
  // Access is asked on every question: the second canvas lost, or in Trash, drops out with nothing of it returned.
  for (const lose of [() => ({ canvasAccess: async app => (app === APP2 ? null : own(ANA)(app)) }),
    () => { w.sqlite.prepare("INSERT INTO library_trash (org, name, trashed_at) VALUES ('team-ws', ?, '2026-10-20')").run(APP2); return {}; }]) {
    r = await resolve(w.env, ANA, both, lose());
    assert.deepEqual(r.resolvedScope.goals.map(g => g.label), ['Python debugging']);
    assert.deepEqual(r.limitations.filter(l => l.code === 'goal_unavailable'), [{ code: 'goal_unavailable', goalId: there.goalId }]);
    assert.ok(!(JSON.stringify(r) + progressQuestionText(r)).includes('TASKBOARD WORDS'));
  }
  // The chat path authorizes every other canvas again for this learner, and only answers for the same users.id.
  w.sqlite.prepare('DELETE FROM library_trash').run();
  const authorized = [];
  const ref = { kind: 'progress', range: both };
  const text = await progressQuestionContext(new Request('https://app.test/api/learn/ask'), w.env, [ref], { kind: 'canvas', org: ANA.org, name: ANA.app, user_id: ANA.userId },
    { authorize: async (req, env, app) => { authorized.push(app); return { kind: 'canvas', org: ANA.org, user_id: app === APP2 ? 'u-someone-else' : ANA.userId }; } });
  assert.deepEqual(authorized, [APP2], 'the asking canvas is the one the request authorized; the other is asked again');
  assert.match(text, /Goal "Python debugging" \(this canvas/);
  assert.doesNotMatch(text, /TaskBoard/, 'an access that names another account is refused');
});

test('progress_question_does_not_assess: resolving, wording and the chat path write nothing and call nothing', async t => {
  const w = setup(t);
  const knn = await goal(w.env, ANA, 'KNN', [C('vote', 'Explain the majority vote')]);
  await answer(w.env, ANA, knn, { day: 18, obs: [{ criterionId: 'vote' }] });
  await answer(w.env, ANA, knn, { day: 19, status: 'unavailable' }); // saved, unassessed
  const before = snapshot(w.sqlite);
  const view = await readProgress(w.env, ANA, { goalId: knn.goalId });
  const r = await resolve(w.env, ANA, scopeFor(view, 'vote'));
  assert.ok(codes(r).includes('assessment_unavailable'));
  const app = { kind: 'canvas', org: ANA.org, name: ANA.app, user_id: ANA.userId };
  const text = await progressQuestionContext(new Request('https://app.test/api/learn/ask'), w.env, [{ kind: 'progress', range: scopeFor(view, 'vote') }], app);
  assert.match(text, /You cannot assess work, change a status or record evidence/);
  assert.deepEqual(snapshot(w.sqlite), before, 'no attempt, assessment, observation, goal or activity changed');
  // Not on a canvas, no learner id, or a failed read: the model is told progress is unavailable, never that it is empty.
  for (const [env, at] of [[w.env, { ...app, kind: 'repository' }], [w.env, { ...app, user_id: null }], [{ LEARN_DB: { prepare: () => { throw new Error('D1 down'); } } }, app]]) {
    assert.match(await progressQuestionContext(new Request('https://app.test/x'), env, [{ kind: 'progress', range: scopeFor(view, 'vote') }], at), /not available for this conversation now.*never call it empty/);
  }
  assert.equal(await progressQuestionContext(null, w.env, [{ kind: 'card' }], app), null);
});

test('review_preserves_original_assessment: a dispute keeps the original judgment, shows Needs review while pending, and a validated review becomes a new version', async t => {
  const w = setup(t);
  const { goalId, activity } = await journeyActivity(w.env);
  const sent = await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', { activityId: activity.activityId, activityRevision: activity.revision, submissionKey: 'sub-0001-aaaa', submittedContent: { text: 'The weighted score goes through the sigmoid.' } }, jev({ c0_idea0: 0.95 }));
  assert.equal(sent.body.assessment.status, 'completed');
  const original = sent.body.assessment;
  const originalRows = JSON.stringify(w.sqlite.prepare('SELECT id, fit, reasoning, assistance, application, reason, observed_at FROM learn_observations WHERE assessment_id = ?').all(original.assessmentId));
  const confirmed = await readProgress(w.env, ANA, { goalId });
  assert.equal(confirmed.criteria[0].status, 'demonstrated_independently');

  // Filed, still pending: the original is labelled disputed and Progress says Needs review; nothing is lost.
  const filed = await requestReassessment(w.env, ANA, sent.body.attempt.attemptId, 'dispute-0001', { dispute: true });
  assert.equal(filed.status, 'pending');
  const pending = await readProgress(w.env, ANA, { goalId });
  assert.deepEqual([pending.criteria[0].status, pending.criteria[0].reason], ['needs_review', 'disputed']);
  assert.deepEqual(pending.pendingAssessments, [filed.assessmentId]);
  assert.deepEqual(pending.criteria[0].evidence.map(e => [e.assessmentId, e.validity, e.fit]), [[original.assessmentId, 'disputed', 'met']]);
  const asked = await resolve(w.env, ANA, progressScope({ ...scopeFor(confirmed, 'mech'), review: { attemptId: sent.body.attempt.attemptId, assessmentId: original.assessmentId, board: 'main' } }));
  assert.equal(asked.resolvedScope.review.state, 'review_requested');
  assert.ok(codes(asked).includes('under_review') && codes(asked).includes('pending_assessment'));
  assert.match(progressQuestionText(asked), /The original judgment is kept unchanged and shows as Needs review/);

  // The review runs (the one stub call) and saves a validated result as a new version that supersedes the original.
  const stub = jev({ c0_idea0: 0.95 });
  const { assessAttempt } = await import('../src/learn-assessment.js');
  await assessAttempt(w.env, ANA, sent.body.attempt.attemptId, { ask: stub.ask, callModel: never.callModel });
  assert.equal(stub.asked.length, 1);
  const { assessments } = await readAttempt(w.env, ANA, sent.body.attempt.attemptId);
  assert.deepEqual(assessments.map(a => [a.assessmentId, a.status, a.supersedesAssessmentId ?? null]), [[original.assessmentId, 'completed', null], [filed.assessmentId, 'completed', original.assessmentId]]);
  assert.equal(JSON.stringify(w.sqlite.prepare('SELECT id, fit, reasoning, assistance, application, reason, observed_at FROM learn_observations WHERE assessment_id = ?').all(original.assessmentId)), originalRows, 'every original finding is kept');
  const reviewed = await readProgress(w.env, ANA, { goalId });
  assert.equal(reviewed.criteria[0].status, 'demonstrated_independently');
  assert.deepEqual(reviewed.criteria[0].evidence.map(e => [e.assessmentId, e.validity]), [[original.assessmentId, 'superseded'], [filed.assessmentId, 'valid']], 'the original stays in the history, labelled');
  assert.equal((await resolve(w.env, ANA, progressScope({ ...scopeFor(confirmed, 'mech'), review: { attemptId: sent.body.attempt.attemptId, assessmentId: original.assessmentId, board: 'main' } }))).resolvedScope.review.state, 'reviewed');
});

test('a dispute through the route: filed once per key, refused review leaves Needs review, and a plain reassessment labels nothing', async t => {
  const w = setup(t);
  const { goalId, activity } = await journeyActivity(w.env);
  const sent = await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', { activityId: activity.activityId, activityRevision: activity.revision, submissionKey: 'sub-0002-bbbb', submittedContent: { text: 'The weighted score goes through the sigmoid.' } }, jev({ c0_idea0: 0.95 }));
  const path = `/api/learn/tutor/attempts/${sent.body.attempt.attemptId}/reassess`;
  // The review's evaluator refuses (JEV unavailable): the original stays, disputed, and Progress keeps Needs review.
  const refused = { ask: async () => { throw Object.assign(new Error('jev down'), { name: 'TypeError' }); }, callModel: never.callModel };
  const first = await call(w.env, ANA, 'POST', path, { requestKey: 'dispute-as_original', dispute: true }, refused);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.notEqual(first.body.assessment.status, 'completed');
  const again = await call(w.env, ANA, 'POST', path, { requestKey: 'dispute-as_original', dispute: true }, refused);
  assert.deepEqual([again.body.replayed, again.body.assessments.length], [true, 2], 'the same key replays: one review, not two');
  const view = await readProgress(w.env, ANA, { goalId });
  assert.deepEqual([view.criteria[0].status, view.criteria[0].evidence.map(e => e.validity)], ['needs_review', ['disputed']]);
  // Another learner cannot file a dispute on it.
  assert.equal((await call(w.env, BEN, 'POST', path, { requestKey: 'dispute-as_other', dispute: true }, refused)).status, 404);

  // Task 05's plain reassessment is unchanged: it supersedes, and labels nothing disputed.
  const other = await journeyActivity(w.env, ANA2);
  const plain = await call(w.env, ANA2, 'POST', '/api/learn/tutor/attempts', { activityId: other.activity.activityId, activityRevision: other.activity.revision, submissionKey: 'sub-0003-cccc', submittedContent: { text: 'The weighted score goes through the sigmoid.' } }, jev({ c0_idea0: 0.95 }));
  await call(w.env, ANA2, 'POST', `/api/learn/tutor/attempts/${plain.body.attempt.attemptId}/reassess`, { requestKey: 'review-0001' }, refused);
  assert.deepEqual(w.sqlite.prepare('SELECT DISTINCT validity FROM learn_observations WHERE assessment_id = ?').all(plain.body.assessment.assessmentId).map(r => r.validity), ['valid']);
});

// Owner finding 5C (2026-10-21): the 9,000-character prefix cut ran over the whole block, and the limitations come last, so a
// long history cut every limitation away. The scope and every limitation are kept whole; evidence records are kept or omitted
// whole, and the block says how many were left out.
const recordLine = (r, o) => progressQuestionText({ resolvedScope: r.resolvedScope, observations: [o], limitations: [] }).split('\n').find(l => l.startsWith(`    ${o.observationId} `));
const listed = (text, r) => r.observations.filter(o => text.includes(`    ${o.observationId} `));

test('progress_text_budget: 60 observations over three goals keep the scope, every limitation and whole records, and count what was left out', async t => {
  const w = setup(t);
  const lost = [0, 5, 10, 15].map(i => ({ kind: 'file', id: `fs-lost-${i}`, version: 'v1' })); // sources the learner can no longer open
  const knn = await goal(w.env, ANA, 'KNN', [C('vote', 'Explain the majority vote'), C('k', 'Explain what changes with k')], lost);
  const lr = await goal(w.env, ANA, 'Logistic regression', [C('sigmoid', 'Explain the sigmoid'), C('odds', 'Convert a probability to odds'), C('logit', 'Explain log-odds')]);
  const tree = await goal(w.env, ANA, 'Decision trees', [C('split', 'Choose a split')]);
  const words = n => `Answer ${n}: ${'the class with most of the k nearest points wins the vote, so a larger k smooths the boundary and a smaller k follows noise. '.repeat(3)}`;
  const stamp = n => `2026-10-${String(1 + Math.floor(n / 24)).padStart(2, '0')}T${String(n % 24).padStart(2, '0')}:00:00.000Z`;
  let n = 0;
  const submit = (g, criterionId, extra = {}) => answer(w.env, ANA, g, { day: stamp(n), text: words(n++), obs: [{ criterionId }], ...extra });
  for (let i = 0; i < 20; i++) await submit(knn, i % 2 ? 'k' : 'vote', i % 5 === 0 ? { sources: [lost[i / 5]] } : {});
  const seen = await readProgress(w.env, ANA, { goalId: knn.goalId, scopeVersion: 1 }); // the learner opens Progress here
  const selected = seen.criteria.find(c => c.criterionId === 'vote').evidence.map(e => e.observationId);
  for (let i = 0; i < 4; i++) await submit(knn, 'vote'); // a newer revision lands afterwards
  for (let i = 0; i < 25; i++) await submit(lr, ['sigmoid', 'odds', 'logit'][i % 3], i === 7 ? { status: 'unavailable', obs: [] } : {});
  for (let i = 0; i < 12; i++) await submit(tree, 'split');
  await answer(w.env, ANA, knn, { day: stamp(n++), pending: true });
  await answer(w.env, ANA, tree, { day: stamp(n++), pending: true });

  const scope = progressScope({ goalRefs: [knn, lr, tree].map(g => ({ goalId: g.goalId, scopeVersion: 1 })), criterionRefs: [], dimensions: [], observationIds: selected, summaryRevision: seen.summaryRevision });
  const r = await resolve(w.env, ANA, scope, { sourceReader: () => async ref => !ref.id.startsWith('fs-lost') });
  assert.equal(r.observations.length, 60, '20 + 4 + 24 (one more answer is unassessed) + 12 observations');
  const state = Object.fromEntries(r.limitations.filter(l => l.count).map(l => [l.code, l.count]));
  assert.deepEqual(state, { source_withheld: 4, pending_assessment: 2, assessment_unavailable: 1, separate_goals: 3 });
  assert.ok(codes(r).includes('revision_changed'));
  assert.ok(r.observations.some(o => o.newer), 'the changed revision marks the records the learner did not see');

  const text = progressQuestionText(r);
  // The scope, every goal and criterion, and every limitation in words, including the ones that used to be cut.
  assert.match(text, /Scope: KNN \+ Logistic regression \+ Decision trees\./);
  for (const g of ['KNN', 'Logistic regression', 'Decision trees']) assert.match(text, new RegExp(`Goal "${g}" `));
  for (const c of ['Explain the majority vote', 'Explain what changes with k', 'Explain the sigmoid', 'Convert a probability to odds', 'Explain log-odds', 'Choose a split']) assert.match(text, new RegExp(`Criterion "${c}" `));
  const said = text.slice(text.indexOf('\nLimitations:\n') + '\nLimitations:\n'.length).split('\n');
  assert.equal(said.length, r.limitations.length + 1, 'every limitation, then the omitted count');
  assert.match(text, /progress changed after the learner's view/);
  assert.match(text, /4 observations' source content is withheld/);
  assert.match(text, /2 assessments are still pending/);
  assert.match(text, /1 assessment could not be completed/);
  assert.match(text, /3 goals are in scope: report each separately/);
  assert.ok(text.length <= QUESTION_LIMITS.text, `the block is ${text.length} characters`);
  assert.doesNotMatch(text, /\[progress records truncated\]/);
  // Whole records only: each listed line is byte-for-byte the line a full render gives that record.
  const kept = listed(text, r);
  for (const o of kept) assert.ok(text.split('\n').includes(recordLine(r, o)), `${o.observationId} is whole`);
  for (const o of r.observations.filter(o => o.selected)) assert.ok(kept.includes(o), `${o.observationId} was selected and is kept`);
  assert.ok(kept.length > 0 && kept.length < r.observations.length, `${kept.length} of ${r.observations.length} are listed`);
  const omitted = r.observations.length - kept.length;
  assert.equal(said.at(-1), `- ${omitted} of ${r.observations.length} observation records are left out of this text for length, so the records listed under a criterion may be incomplete: say so, and never read fewer listed records as less evidence`);
});

test('progress_text_budget: questioned, then selected, then newer, then the latest records are kept; a fixed part over the budget is sent whole with no records', () => {
  const criterion = (i, goalId) => ({ criterionId: `c${i}`, version: 1, label: `Criterion ${i}`, requirement: '', requiresReasoning: false, requiresTransfer: false, status: 'practising', reason: 'incomplete_support', application: 'not_checked', retention: 'not_checked', goalId });
  const goalOf = (g, n) => ({ goalId: `lg_${g}`, label: `Goal ${g}`, canvas: 'this', scopeVersion: 1, currentScopeVersion: 1, summaryRevision: 'r', counts: { total: n, practising: n }, pendingAssessments: 0, unavailableAssessments: 0, criteria: Array.from({ length: n }, (_, i) => criterion(i, `lg_${g}`)) });
  const scopeOf = goals => ({ label: 'Synthetic', goals, criterionRefs: [], dimensions: ['fit'], timeRange: null, summaryRevision: { selected: 'r', current: 'r' } });
  const ob = (i, extra = {}) => ({ observationId: `ob_${String(i).padStart(2, '0')}`, goalId: 'lg_0', criterionId: 'c0', criterionVersion: 1, attemptId: `at_${i}`, assessmentId: `as_${i}`, observedAt: `2026-10-01T00:${String(i).padStart(2, '0')}:00.000Z`,
    fit: 'met', reasoning: 'supported', assistance: 'none', application: 'not_assessed', validity: 'valid', conflict: false, excerpt: 'x'.repeat(280), selected: false, newer: false, ...extra });
  const observations = Array.from({ length: 40 }, (_, i) => ob(i, i === 3 ? { questioned: true } : i === 5 || i === 6 ? { selected: true } : i === 10 ? { newer: true } : {}));
  const text = progressQuestionText({ resolvedScope: scopeOf([goalOf(0, 1)]), observations, limitations: [{ code: 'one_attempt', goalId: 'lg_0', criterionId: 'c0' }] });
  assert.ok(text.length <= QUESTION_LIMITS.text);
  const ids = [...text.matchAll(/^ {4}ob_(\d+) /gm)].map(m => Number(m[1]));
  const latest = ids.filter(i => ![3, 5, 6, 10].includes(i));
  assert.ok(latest.length > 0 && latest.length < 36, `${latest.length} of the 36 plain records`);
  assert.deepEqual(ids, [3, 5, 6, 10, ...latest.map((_, k) => 39 - k).reverse()].sort((a, b) => a - b), 'questioned, selected and newer kept; then the latest, with no gap');
  assert.ok(text.endsWith(`- ${40 - ids.length} of 40 observation records are left out of this text for length, so the records listed under a criterion may be incomplete: say so, and never read fewer listed records as less evidence`));
  assert.match(text, /- criterion "Criterion 0" has only one attempt/);

  // 8 goals of 20 criteria, each with a limitation: the fixed part alone is over the budget. Nothing in it is cut, and no record is listed.
  const goals = Array.from({ length: 8 }, (_, g) => goalOf(g, 20));
  const limitations = goals.flatMap(g => g.criteria.map(c => ({ code: 'no_evidence', goalId: g.goalId, criterionId: c.criterionId })));
  const big = progressQuestionText({ resolvedScope: scopeOf(goals), observations, limitations });
  assert.ok(big.length > QUESTION_LIMITS.text);
  assert.equal(big.split('\n').filter(l => /^- criterion "Criterion \d+" has no assessed evidence yet$/.test(l)).length, 160);
  assert.equal(big.split('\n').filter(l => /^ {2}Criterion "Criterion \d+" /.test(l)).length, 160);
  assert.doesNotMatch(big, /^ {4}ob_/m);
  assert.ok(big.endsWith('- 40 of 40 observation records are left out of this text for length, so the records listed under a criterion may be incomplete: say so, and never read fewer listed records as less evidence'));
});
