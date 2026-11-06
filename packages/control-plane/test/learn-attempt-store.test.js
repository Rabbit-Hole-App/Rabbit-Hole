// packages/control-plane/test/learn-attempt-store.test.js
// Tutor Task 05 (C:/s/spec/tutor-workflow/draft.md): learn 0026 and the attempt store and routes on node:sqlite.
// Attempts are saved before any evaluator is dispatched, retries replay, and every dispatch is counted. JEV and the larger
// evaluator are stubs; no provider is reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ATTEMPT_LIMITS, CLAIM_TTL_MS, acceptAttempt, claimAssessment, readAttempt } from '../src/learn-attempt-store.js';
import { assessAttempt } from '../src/learn-assessment.js';
import { JevError } from '../src/learn-grade-jev.js';
import { ANA, BEN, act, call, jev, journeyActivity, never, submit, world } from './learn-attempt-fixture.js';

const MIGRATION = readFileSync(new URL('../learn-migrations/0026-tutor-attempts.sql', import.meta.url), 'utf8');
const SCHEMA = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const STATED = { c0_idea0: 0.95 }; // MECH's one idea stated, everything else a confident no
const count = (sqlite, table) => sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

test('learn 0026 is CREATE-only, re-runnable, applies on top of 0025, and is mirrored verbatim in repository-schema.sql', () => {
  const statements = MIGRATION.replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  for (const s of statements) assert.match(s, /^CREATE (TABLE|(UNIQUE )?INDEX) IF NOT EXISTS /i);
  assert.ok(SCHEMA.replace(/\r/g, '').includes(MIGRATION.replace(/\r/g, '').trim()), 'repository-schema.sql holds 0026 verbatim');
  assert.ok(SCHEMA.indexOf('-- learn-migrations/0025-') < SCHEMA.indexOf('-- learn-migrations/0026-'), '0026 after 0025');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA.slice(0, SCHEMA.indexOf('-- learn-migrations/0026-')));
  sqlite.exec(MIGRATION); sqlite.exec(MIGRATION);
  const names = sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'learn_attempts%' OR name LIKE 'learn_assessments%' OR name LIKE 'learn_observations%' ORDER BY name").all().map(r => r.name);
  assert.deepEqual(names.filter(n => !n.startsWith('sqlite_')), ['learn_assessments', 'learn_assessments_request', 'learn_attempts', 'learn_attempts_goal', 'learn_attempts_key', 'learn_observations', 'learn_observations_goal']);
  // Private by users.id, never by email; the submission key is unique per learner.
  const columns = sqlite.prepare('PRAGMA table_info(learn_attempts)').all().map(c => c.name);
  assert.deepEqual(columns.slice(0, 5), ['id', 'org', 'owner_user_id', 'app', 'board']);
  assert.ok(!columns.some(c => /email/.test(c)));
  assert.deepEqual(sqlite.prepare('PRAGMA index_info(learn_attempts_key)').all().map(c => c.name), ['org', 'owner_user_id', 'submission_key']);
  sqlite.close();
});

test('submission_saved_before_dispatch: the attempt and its claimed operation exist before the evaluator runs; a failed save dispatches nothing', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  const seenAtDispatch = [];
  const { ask } = jev(STATED);
  const watching = async (env, request, options) => {
    seenAtDispatch.push({ attempts: count(w.sqlite, 'learn_attempts'), claimed: w.sqlite.prepare("SELECT count(*) AS n FROM learn_assessments WHERE status = 'pending' AND claim_token IS NOT NULL").get().n });
    return ask(env, request, options);
  };
  const r = await submit(w.env, ANA, activity, {}, { ask: watching, callModel: never.callModel });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(seenAtDispatch, [{ attempts: 1, claimed: 1 }]);
  assert.equal(r.body.assessment.status, 'completed');
  assert.deepEqual(r.body.attempt.submittedContent, { text: 'The weighted score goes through the sigmoid.' });

  // A save that fails: nothing stored, nothing dispatched, and the response never claims a save.
  const f = world(t);
  const { activity: other } = await journeyActivity(f.env);
  const batch = f.env.LEARN_DB.batch;
  f.env.LEARN_DB.batch = async statements => { if (statements.length === 2) throw new Error('D1 unavailable'); return batch(statements); };
  const dispatched = jev(STATED);
  const failed = await submit(f.env, ANA, other, {}, { ask: dispatched.ask, callModel: never.callModel });
  assert.deepEqual([failed.status, failed.body.error], [503, 'attempts_unavailable']);
  assert.deepEqual([count(f.sqlite, 'learn_attempts'), count(f.sqlite, 'learn_assessments'), dispatched.asked.length], [0, 0, 0]);
});

test('same_key_same_hash_replays: a double click or a retry after a lost response is one attempt and one dispatch', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  const stub = jev(STATED);
  const first = await submit(w.env, ANA, activity, {}, { ask: stub.ask, callModel: never.callModel });
  const again = await submit(w.env, ANA, activity, { submittedContent: { text: 'The weighted score goes through the sigmoid.' } }, { ask: stub.ask, callModel: never.callModel });
  assert.equal(again.status, 200);
  assert.deepEqual([again.body.replayed, again.body.attempt.attemptId, again.body.assessment.assessmentId], [true, first.body.attempt.attemptId, first.body.assessment.assessmentId]);
  assert.deepEqual([count(w.sqlite, 'learn_attempts'), count(w.sqlite, 'learn_assessments'), stub.asked.length], [1, 1, 1]);
  // Key order in the content is not a different submission.
  const reordered = await acceptAttempt(w.env, ANA, { activityId: activity.activityId, activityRevision: activity.revision, submissionKey: 'sub-0002-bbbb', submittedContent: { b: 1, text: 'x' }, sourceRefs: [], assistanceRefs: [] });
  const same = await acceptAttempt(w.env, ANA, { activityId: activity.activityId, activityRevision: activity.revision, submissionKey: 'sub-0002-bbbb', submittedContent: { text: 'x', b: 1 }, sourceRefs: [], assistanceRefs: [] });
  assert.deepEqual([same.replayed, same.attemptId], [true, reordered.attemptId]);
});

test('same_key_changed_hash_conflicts: one key with different content is a 409 and the saved attempt is unchanged', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  const stub = jev(STATED);
  const first = await submit(w.env, ANA, activity, {}, { ask: stub.ask, callModel: never.callModel });
  const changed = await submit(w.env, ANA, activity, { submittedContent: { text: 'Something else entirely.' } }, never);
  assert.deepEqual([changed.status, changed.body.error], [409, 'submission_key_conflict']);
  const view = await call(w.env, ANA, 'GET', `/api/learn/tutor/attempts/${first.body.attempt.attemptId}`);
  assert.deepEqual(view.body.attempt, first.body.attempt);
  assert.equal(stub.asked.length, 1);
});

test('concurrent_claim_has_one_dispatch: parallel dispatches and parallel same-key submissions call the evaluator once', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  const accepted = await acceptAttempt(w.env, ANA, { activityId: activity.activityId, activityRevision: 1, submissionKey: 'sub-race-0001', submittedContent: { text: 'The weighted score goes through the sigmoid.' }, sourceRefs: [], assistanceRefs: [] });
  const stub = jev(STATED);
  const records = await Promise.all(Array.from({ length: 5 }, () => assessAttempt(w.env, ANA, accepted.attemptId, { ask: stub.ask, callModel: never.callModel })));
  assert.equal(stub.asked.length, 1, 'one claim, one dispatch');
  assert.ok(records.every(r => r.assessmentId === accepted.assessmentId));
  assert.equal((await readAttempt(w.env, ANA, accepted.attemptId)).assessment.status, 'completed');

  const tabs = jev(STATED);
  const both = await Promise.all([1, 2].map(() => submit(w.env, ANA, activity, { submissionKey: 'sub-two-tabs' }, { ask: tabs.ask, callModel: never.callModel })));
  assert.deepEqual(both.map(r => r.status), [200, 200]);
  assert.equal(both[0].body.attempt.attemptId, both[1].body.attempt.attemptId);
  assert.equal(tabs.asked.length, 1);
  assert.equal(w.sqlite.prepare("SELECT count(*) AS n FROM learn_attempts WHERE submission_key = 'sub-two-tabs'").get().n, 1);
});

test('unknown_completion_is_not_auto_retried: a timeout or an abandoned claim is unknown; replays and reads call nothing until an explicit review', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  let calls = 0;
  const timeout = async () => { calls++; throw new JevError('timeout', 'Jev timed out after 800 ms'); };
  const first = await submit(w.env, ANA, activity, {}, { ask: timeout, callModel: never.callModel });
  assert.deepEqual([first.body.assessment.status, first.body.assessment.reason, first.body.assessment.observations], ['unknown', 'completion_unknown', []]);
  const replay = await submit(w.env, ANA, activity, {}, { ask: timeout, callModel: never.callModel });
  await call(w.env, ANA, 'GET', `/api/learn/tutor/attempts/${first.body.attempt.attemptId}`);
  assert.deepEqual([replay.body.replayed, replay.body.assessment.status, calls], [true, 'unknown', 1]);

  // A worker that claimed the operation and died: past CLAIM_TTL_MS the read reconciles it to unknown, and a dispatch
  // finds nothing to claim.
  const crashed = await acceptAttempt(w.env, ANA, { activityId: activity.activityId, activityRevision: 1, submissionKey: 'sub-crash-0001', submittedContent: { text: 'abc' }, sourceRefs: [], assistanceRefs: [] });
  assert.ok(await claimAssessment(w.env, ANA, crashed.assessmentId));
  assert.equal((await readAttempt(w.env, ANA, crashed.attemptId)).assessment.status, 'pending', 'still within its claim');
  const later = Date.now() + CLAIM_TTL_MS + 1000;
  assert.deepEqual((({ status, reason }) => [status, reason])((await readAttempt(w.env, ANA, crashed.attemptId, { now: () => later })).assessment), ['unknown', 'completion_unknown']);
  const stub = jev(STATED);
  await assessAttempt(w.env, ANA, crashed.attemptId, { ask: stub.ask, callModel: never.callModel });
  assert.equal(stub.asked.length, 0);
  // Only an explicit review calls again: one new operation, one dispatch.
  const review = await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${crashed.attemptId}/reassess`, { requestKey: 'review-0001' }, { ask: stub.ask, callModel: never.callModel });
  assert.deepEqual([review.status, review.body.assessments.map(a => a.status), stub.asked.length], [200, ['unknown', 'completed'], 1]);
});

test('draft_edit_does_not_mutate_attempt: later edits of the object, the activity checkpoint or a new submission leave the saved attempt as submitted', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env, ANA, { checkpoint: { draft: 'first draft' } });
  const content = { text: 'The weighted score goes through the sigmoid.' };
  const accepted = await acceptAttempt(w.env, ANA, { activityId: activity.activityId, activityRevision: 1, submissionKey: 'sub-draft-0001', submittedContent: content, sourceRefs: [], assistanceRefs: [] });
  const before = (await readAttempt(w.env, ANA, accepted.attemptId)).attempt;
  content.text = 'edited after submitting';
  w.sqlite.prepare("UPDATE learn_activities SET checkpoint_json = ? WHERE id = ?").run(JSON.stringify({ draft: 'a newer draft' }), activity.activityId);
  const next = await acceptAttempt(w.env, ANA, { activityId: activity.activityId, activityRevision: 1, submissionKey: 'sub-draft-0002', submittedContent: { text: 'a second answer' }, sourceRefs: [], assistanceRefs: [] });
  assert.notEqual(next.attemptId, accepted.attemptId);
  const after = (await readAttempt(w.env, ANA, accepted.attemptId)).attempt;
  assert.deepEqual(after, before);
  assert.equal(after.submittedContent.text, 'The weighted score goes through the sigmoid.');
});

test('unicode_limit_preserves_draft: an over-limit answer is refused with both sizes and stores nothing; an at-limit emoji answer is kept whole', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  const stub = jev(STATED);
  const over = '😀'.repeat(2001); // 2001 code points, 4002 UTF-16 units
  const refused = await submit(w.env, ANA, activity, { submissionKey: 'sub-uni-0001', submittedContent: { text: over } }, { ask: stub.ask, callModel: never.callModel });
  assert.deepEqual([refused.status, refused.body.error, refused.body.detail], [413, 'submission_too_large', { field: 'text', unit: 'characters', max: ATTEMPT_LIMITS.textChars, actual: 4002 }]);
  assert.deepEqual([count(w.sqlite, 'learn_attempts'), stub.asked.length], [0, 0]);
  const atLimit = 'é😀'.repeat(1333) + 'é'; // 4000 UTF-16 units, 9331 UTF-8 bytes
  assert.equal(atLimit.length, 4000);
  const kept = await submit(w.env, ANA, activity, { submissionKey: 'sub-uni-0002', submittedContent: { text: atLimit } }, { ask: stub.ask, callModel: never.callModel });
  assert.equal(kept.status, 200, JSON.stringify(kept.body));
  assert.equal(kept.body.attempt.submittedContent.text, atLimit, 'stored whole, never truncated');
  // The byte bound counts UTF-8 bytes, not characters.
  const code = (await act(w.env, ANA, 'activate_activity', { activity: { goalId: activity.goalId, objective: 'Code it', prompt: 'Write the sigmoid.', responseKind: 'code', criterionRefs: [{ criterionId: 'mech', version: 1 }] } })).state.activeActivityId;
  const big = await submit(w.env, ANA, { activityId: code, revision: 1 }, { submissionKey: 'sub-uni-0003', submittedContent: { text: 'x', notes: 'é'.repeat(9000) } }, never);
  assert.deepEqual([big.status, big.body.detail.unit, big.body.detail.max, big.body.detail.actual > ATTEMPT_LIMITS.contentBytes], [413, 'bytes', ATTEMPT_LIMITS.contentBytes, true]);
});

test('references are resolved on the server: another learner, another canvas, a stale activity revision or an unknown source is refused', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env, ANA, { sourceRefs: [{ kind: 'card', id: 'b1', version: 2 }] });
  const ben = await submit(w.env, BEN, activity, {}, never);
  assert.deepEqual([ben.status, ben.body.error], [404, 'unknown_activity']);
  const elsewhere = await submit(w.env, { ...ANA, board: 'other' }, activity, {}, never);
  assert.deepEqual([elsewhere.status, elsewhere.body.error], [404, 'unknown_activity']);
  const unknownSource = await submit(w.env, ANA, activity, { sourceRefs: [{ kind: 'card', id: 'b9', version: 1 }] }, never);
  assert.deepEqual([unknownSource.status, unknownSource.body.error], [400, 'unknown_source']);
  w.sqlite.prepare('UPDATE learn_activities SET revision = 2 WHERE id = ?').run(activity.activityId);
  const stale = await submit(w.env, ANA, activity, {}, never);
  assert.deepEqual([stale.status, stale.body.error, stale.body.detail], [409, 'stale_activity', { activityRevision: 2 }]);
  w.sqlite.prepare('UPDATE learn_activities SET revision = 1 WHERE id = ?').run(activity.activityId);
  const stub = jev(STATED);
  const mine = await submit(w.env, ANA, activity, { sourceRefs: [{ kind: 'card', id: 'b1', version: 2 }] }, { ask: stub.ask, callModel: never.callModel });
  assert.equal(mine.status, 200);
  // Ben cannot read or review Ana's attempt; to him it does not exist.
  for (const [method, path, body] of [['GET', `/api/learn/tutor/attempts/${mine.body.attempt.attemptId}`], ['POST', `/api/learn/tutor/attempts/${mine.body.attempt.attemptId}/reassess`, { requestKey: 'review-ben-01' }]]) {
    const r = await call(w.env, BEN, method, path, body, never);
    assert.deepEqual([r.status, r.body.error], [404, 'unknown_attempt'], `${method} ${path}`);
  }
  assert.equal(stub.asked.length, 1);
});

test('known help is resolved on the server: refs from the learner or the activity checkpoint make the attempt assisted; none is none', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env, ANA, { checkpoint: { assistanceRefs: ['hint-1'] } });
  const hinted = await acceptAttempt(w.env, ANA, { activityId: activity.activityId, activityRevision: 1, submissionKey: 'sub-help-0001', submittedContent: { text: 'a' }, sourceRefs: [], assistanceRefs: [] });
  assert.deepEqual((({ assistance, assistanceRefs }) => [assistance, assistanceRefs])((await readAttempt(w.env, ANA, hinted.attemptId)).attempt), ['assisted', ['hint-1']], 'the client cannot drop the recorded hint');
  const w2 = world(t);
  const { activity: plain } = await journeyActivity(w2.env);
  const alone = await acceptAttempt(w2.env, ANA, { activityId: plain.activityId, activityRevision: 1, submissionKey: 'sub-help-0002', submittedContent: { text: 'a' }, sourceRefs: [], assistanceRefs: [] });
  assert.equal((await readAttempt(w2.env, ANA, alone.attemptId)).attempt.assistance, 'none');
});

test('the routes refuse bad input before anything is saved', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  for (const [extra, error] of [[{ submissionKey: 'short' }, 'invalid_submission'], [{ activityRevision: 'one' }, 'invalid_submission'], [{ submittedContent: { optionId: 'y' } }, 'invalid_content'], [{ sourceRefs: 'x' }, 'invalid_submission']]) {
    const r = await submit(w.env, ANA, activity, extra, never);
    assert.deepEqual([r.status, r.body.error], [400, error], JSON.stringify(extra));
  }
  assert.equal((await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', 'not json', never)).status, 400);
  assert.equal((await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', JSON.stringify({ app: ANA.app, board: ANA.board, pad: 'x'.repeat(70000) }), never)).status, 413);
  const badKey = await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts/at_x/reassess', { requestKey: 'bad key!' }, never);
  assert.deepEqual([badKey.status, badKey.body.error], [400, 'invalid_request_key']);
  assert.equal((await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts/at_x/reassess', { requestKey: 'review-0001' }, never)).status, 404);
  assert.equal((await call(w.env, ANA, 'GET', '/api/learn/tutor/attempts', {}, never)).status, 405);
  assert.equal(count(w.sqlite, 'learn_attempts'), 0);
});
