// Explain-back EB-02/EB-04 (docs/superpowers/plans/2026-10-30-explain-back.md): card binding, combined-answer submission,
// pinned revision baselines, server-recorded prior-feedback help and owner-scoped history, on node:sqlite through the real
// routes. No evaluator is reachable: the assessment of an explain_back attempt is whatever learn-assessment.js returns
// without a model (never throws if one is attempted).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCoachingState } from '../src/learn-coaching-store.js';
import { attemptRoute } from '../src/learn-attempt-routes.js';
import { ANA, BEN, call, never, world } from './learn-attempt-fixture.js';

const CARD = 'card-eb-0001';
const PROMPT = 'Why does a pendulum bob keep turning?';
const EXPECTS = ['the string pulls the bob toward the pivot', 'velocity stays tangent to the arc'];
const bind = (env, actor = ANA, over = {}) => call(env, actor, 'POST', '/api/learn/tutor/attempts/bind', { cardId: CARD, prompt: PROMPT, expects: EXPECTS, ...over });
const answer = (over = {}) => ({ v: 1, kind: 'explain_back', text: 'The string pulls inward, so the velocity keeps turning.', voice: [], resources: [], assistance: [], ...over });
let n = 0;
const submit = (env, bound, content, actor = ANA, key = `eb-sub-${String(++n).padStart(4, '0')}`) => call(env, actor, 'POST', '/api/learn/tutor/attempts', {
  activityId: bound.activityId, activityRevision: bound.activityRevision, submissionKey: key, submittedContent: content,
}, never);
// The fixture's call() has no query for cardId; list through the route directly, as the browser does.
async function callList(env, actor, cardId) {
  const req = new Request(`https://app.test/api/learn/tutor/attempts?app=${actor.app}&board=${actor.board}&cardId=${cardId}`);
  const res = await attemptRoute('/api/learn/tutor/attempts', req, env, { authorize: async () => ({ kind: 'canvas', org: actor.org, user_id: actor.userId }) });
  return { status: res.status, body: await res.json() };
}
const complete = (sqlite, attemptId) => sqlite.prepare("UPDATE learn_assessments SET status = 'completed', reason = NULL WHERE attempt_id = ?").run(attemptId);

test('binding a card is idempotent, private to the learner, hidden from goals, and versions a changed wording', async t => {
  const w = world(t);
  const first = await bind(w.env), again = await bind(w.env);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(again.body, first.body);
  assert.equal(first.body.criterionRefs.length, 2);
  assert.equal(first.body.rubricVersion, 'eb-v1');
  assert.deepEqual((await readCoachingState(w.env, ANA)).goals, [], 'a card binding is not a learner goal');
  // Ben's binding of the same card id is his own goal and activity
  const ben = await bind(w.env, BEN);
  assert.notEqual(ben.body.goalId, first.body.goalId);
  // An edited card: a new activity; the unchanged idea keeps its criterion identity, the new one is new
  const edited = await bind(w.env, ANA, { expects: [EXPECTS[0], 'the speed is largest at the bottom'] });
  assert.equal(edited.body.goalId, first.body.goalId);
  assert.notEqual(edited.body.activityId, first.body.activityId);
  assert.equal(edited.body.criterionRefs[0].criterionId, first.body.criterionRefs[0].criterionId);
  assert.notEqual(edited.body.criterionRefs[1].criterionId, first.body.criterionRefs[1].criterionId);
  // concurrent binds of the same wording converge on one activity
  const [x, y] = await Promise.all([bind(w.env, ANA, { expects: ['one idea'] }), bind(w.env, ANA, { expects: ['one idea'] })]);
  assert.equal(x.body.activityId, y.body.activityId);
  assert.equal(w.sqlite.prepare('SELECT count(*) AS n FROM learn_activities WHERE id = ?').get(x.body.activityId).n, 1);
  for (const bad of [{ cardId: 'bad id!' }, { prompt: '' }, { expects: ['ok', ''] }, { expects: 'x' }]) assert.deepEqual((await bind(w.env, ANA, bad)).body.error, 'invalid_card');
});

test('a combined answer is saved, replays by key, conflicts on change; empty text needs other ready evidence', async t => {
  const w = world(t);
  const bound = (await bind(w.env)).body;
  const text = await submit(w.env, bound, answer(), ANA, 'eb-key-aaaa');
  assert.equal(text.status, 200, JSON.stringify(text.body));
  assert.equal(text.body.attempt.responseKind, 'explain_back');
  assert.deepEqual(text.body.attempt.criterionRefs, bound.criterionRefs);
  assert.equal(text.body.attempt.assistance, 'none');
  const replay = await submit(w.env, bound, answer(), ANA, 'eb-key-aaaa');
  assert.deepEqual([replay.body.replayed, replay.body.attempt.attemptId], [true, text.body.attempt.attemptId]);
  assert.equal((await submit(w.env, bound, answer({ text: 'changed' }), ANA, 'eb-key-aaaa')).status, 409);

  const notebook = { evidenceId: 'ev_nb', role: 'resource', media: 'notebook', state: 'ready', sourceKind: 'notebook', assetId: 'nb_1', revision: 3, hash: 'c'.repeat(64), board: ANA.board };
  assert.equal((await submit(w.env, bound, answer({ text: '', resources: [notebook] }))).status, 200, 'a resource alone is an answer');
  const refused = async (content, status, error) => {
    const r = await submit(w.env, bound, content);
    assert.deepEqual([r.status, r.body.error], [status, error], JSON.stringify(r.body));
  };
  await refused(answer({ text: '  ' }), 400, 'empty_answer');
  await refused(answer({ resources: [{ ...notebook, state: 'unavailable' }] }), 400, 'evidence_unavailable');
  await refused(answer({ resources: [{ ...notebook, board: 'other-board' }] }), 403, 'cross_scope_evidence');
  await refused(answer({ resources: [{ ...notebook, sourceKind: 'card', media: 'card', assetId: CARD }] }), 400, 'self_reference');
  await refused(answer({ voice: [{ evidenceId: 'ev_v', role: 'voice', media: 'audio', state: 'ready', assetId: 'aa_notmine00001', revision: 1, hash: 'a'.repeat(64) }] }), 404, 'unknown_asset');
  await refused(answer({ voice: [{ evidenceId: 'ev_v', role: 'voice', media: 'audio', state: 'ready', assetId: 'fs_board_audio', revision: 1, hash: 'a'.repeat(64) }] }), 400, 'invalid_content');
  await refused(answer({ text: 'x'.repeat(4001) }), 413, 'submission_too_large');
  assert.equal(w.sqlite.prepare('SELECT count(*) AS n FROM learn_attempts').get().n, 2, 'nothing refused was stored');
});

test('a revision pins its parent review; the server records the feedback it saw; a later reassessment cannot move the pin', async t => {
  const w = world(t);
  const bound = (await bind(w.env)).body;
  const parent = (await submit(w.env, bound, answer())).body;
  // the parent has no completed review: the baseline names none, and no feedback was seen
  const none = await submit(w.env, bound, answer({ text: 'Second try.', baseline: { parentAttemptId: parent.attempt.attemptId, parentAssessmentId: null } }));
  assert.equal(none.status, 200, JSON.stringify(none.body));
  assert.equal(none.body.attempt.assistance, 'none');

  complete(w.sqlite, parent.attempt.attemptId);
  const reviewed = parent.assessment.assessmentId;
  const stale = await submit(w.env, bound, answer({ baseline: { parentAttemptId: parent.attempt.attemptId, parentAssessmentId: null } }));
  assert.deepEqual([stale.status, stale.body.error, stale.body.detail], [409, 'stale_baseline', { parentAssessmentId: reviewed }]);
  // the client never decides whether feedback was seen: the server adds it even when the client leaves it out
  const revision = await submit(w.env, bound, answer({ text: 'Third try.', baseline: { parentAttemptId: parent.attempt.attemptId, parentAssessmentId: reviewed } }));
  assert.equal(revision.status, 200, JSON.stringify(revision.body));
  assert.equal(revision.body.attempt.assistance, 'assisted');
  assert.deepEqual(revision.body.attempt.assistanceRefs, [`saw_prior_feedback:${reviewed}`]);
  assert.deepEqual(revision.body.attempt.submittedContent.baseline, { parentAttemptId: parent.attempt.attemptId, parentAssessmentId: reviewed });

  // a newer review of the parent: the saved revision keeps its pin; a new revision must name the newer review
  const re = await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${parent.attempt.attemptId}/reassess`, { requestKey: 'reassess-0001' }, never);
  assert.equal(re.status, 200, JSON.stringify(re.body));
  complete(w.sqlite, parent.attempt.attemptId);
  const kept = await call(w.env, ANA, 'GET', `/api/learn/tutor/attempts/${revision.body.attempt.attemptId}`);
  assert.equal(kept.body.attempt.submittedContent.baseline.parentAssessmentId, reviewed);
  assert.equal((await submit(w.env, bound, answer({ baseline: { parentAttemptId: parent.attempt.attemptId, parentAssessmentId: reviewed } }))).body.error, 'stale_baseline');

  // another card's attempt, another learner's attempt, or a made-up id is no parent
  const other = (await bind(w.env, ANA, { cardId: 'card-eb-0002' })).body;
  const elsewhere = (await submit(w.env, other, answer())).body.attempt.attemptId;
  const benBound = (await bind(w.env, BEN)).body;
  const bens = (await submit(w.env, benBound, answer(), BEN)).body.attempt.attemptId;
  for (const parentAttemptId of [elsewhere, bens, 'at_made-up']) {
    const r = await submit(w.env, bound, answer({ baseline: { parentAttemptId, parentAssessmentId: null } }));
    assert.deepEqual([r.status, r.body.error], [404, 'baseline_not_found'], parentAttemptId);
  }
});

test('history lists only this learner\'s attempts at this card, newest first, with parent links; reading calls nothing', async t => {
  const w = world(t);
  const bound = (await bind(w.env)).body;
  const a1 = (await submit(w.env, bound, answer({ text: 'one' }))).body.attempt.attemptId;
  const a2 = (await submit(w.env, bound, answer({ text: 'two', baseline: { parentAttemptId: a1, parentAssessmentId: null } }))).body.attempt.attemptId;
  const other = (await bind(w.env, ANA, { cardId: 'card-eb-0002' })).body;
  await submit(w.env, other, answer({ text: 'elsewhere' }));
  const mine = await callList(w.env, ANA, CARD);
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.attempts.map(a => a.attemptId), [a2, a1]);
  const second = mine.body.attempts.find(a => a.attemptId === a2);
  assert.deepEqual([second.parentAttemptId, second.parentAssessmentId], [a1, null]);
  assert.equal(second.assessment.rating, null, 'no stored review, no number');
  assert.deepEqual((await callList(w.env, BEN, CARD)).body.attempts, []);
  assert.equal((await callList(w.env, ANA, 'bad id!')).body.error, 'invalid_card');
});

test('review findings: a saved card binds its own rubric; a replay survives bad snapshots; an oversize declared body is refused unread', async t => {
  const w = world(t);
  const { boardWith } = await import('./learn-rich-fixtures.js');
  boardWith(w.sqlite, [{ id: CARD, type: 'challenge', mode: 'explain_back', prompt: PROMPT, expects: EXPECTS }, { id: 'card-note', type: 'note', text: 'x' }]);
  const easy = await bind(w.env, ANA, { expects: ['say anything'] });
  const real = await bind(w.env, ANA, { expects: EXPECTS });
  assert.deepEqual(easy.body, real.body, 'the client cannot replace the saved rubric');
  assert.equal(easy.body.criterionRefs.length, 2);
  const row = w.sqlite.prepare('SELECT checkpoint_json FROM learn_activities WHERE id = ?').get(easy.body.activityId);
  assert.deepEqual(JSON.parse(row.checkpoint_json).explainBack, { cardId: CARD, source: 'board' });
  assert.equal((await bind(w.env, ANA, { cardId: 'card-note' })).body.error, 'invalid_card');
  const unsaved = await bind(w.env, ANA, { cardId: 'card-new-1' });
  assert.equal(JSON.parse(w.sqlite.prepare('SELECT checkpoint_json FROM learn_activities WHERE id = ?').get(unsaved.body.activityId).checkpoint_json).explainBack.source, 'client');

  const first = await submit(w.env, real.body, answer(), ANA, 'eb-replay-snap-1');
  const again = await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', { activityId: real.body.activityId, activityRevision: 1, submissionKey: 'eb-replay-snap-1', submittedContent: answer(), snapshots: 'not a list' }, never);
  assert.deepEqual([again.status, again.body.replayed, again.body.attempt.attemptId], [200, true, first.body.attempt.attemptId]);

  let read = false;
  const req = new Request('https://app.test/api/learn/tutor/attempts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(10 * 1024 * 1024) }, body: '{}' });
  Object.defineProperty(req, 'text', { value: async () => { read = true; return '{}'; } });
  const res = await attemptRoute('/api/learn/tutor/attempts', req, w.env, { authorize: async () => ({ kind: 'canvas', org: ANA.org, user_id: ANA.userId }) });
  assert.deepEqual([res.status, (await res.json()).error, read], [413, 'submission_too_large', false]);
});
