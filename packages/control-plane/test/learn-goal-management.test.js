// packages/control-plane/test/learn-goal-management.test.js
// /goal goal management (owner, 2026-10-21): add, edit, delete (active and inactive) and switch the current goal through the
// coaching store and route (learn-coaching-store.js edit_goal, delete_goal; create_goal and activate_goal as before), on
// node:sqlite from repository-schema.sql. Only the goal's owner may change it, an edit or delete made on an old goal revision
// is 409 with the current state, a retried action replays once, and deleting keeps every recorded attempt, assessment and
// criterion. No provider is reachable: fetch throws, so any model call fails the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { learnDb } from './learn-grade-fixture.js';
import { CoachingConflict, applyCoachingAction, readCoachingState } from '../src/learn-coaching-store.js';
import { coachingRoute } from '../src/learn-coaching-routes.js';
import { createJourney, loadJourney } from '../src/learn-journey-store.js';
import { acceptAttempt, claimAssessment, commitAssessment } from '../src/learn-attempt-store.js';
import { readProgress } from '../src/learn-progress.js';
import { resolveProgressQuestion } from '../src/learn-progress-context.js';

const A = { org: 'ws', userId: 'u-ana', app: 'canvas-0000aaaa', board: 'main' };
const B = { ...A, userId: 'u-ben' };
const scopeOf = a => ({ org: a.org, owner_user_id: a.userId, app: a.app, board: a.board });
const C = (criterionId, label) => ({ criterionId, label, requirement: `Show: ${label}`, requiresReasoning: true });
const TABLES = ['learn_goal_criteria', 'learn_activities', 'learn_attempts', 'learn_assessments', 'learn_observations'];
let seq = 0;
const act = async (env, actor, action, payload = {}, actionId = `goal-${++seq}`) =>
  applyCoachingAction(env, actor, { actionId, expectedRevision: (await readCoachingState(env, actor)).revision, action, payload });
const rejects = (code, status) => e => e instanceof CoachingConflict && e.code === code && e.status === status;
const goalOf = (state, goalId) => state.goals.find(g => g.goalId === goalId);
const shown = state => state.goals.filter(g => g.lifecycle !== 'archived').map(g => g.label);

function setup(t, file) {
  const { sqlite, LEARN_DB } = learnDb(t, file?.schema === false ? null : undefined, file?.path);
  if (file?.schema !== false) sqlite.prepare('INSERT INTO canvases(org, name, owner_email, title) VALUES (?, ?, ?, ?)').run(A.org, A.app, 'ana@test', 'Statistics');
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); throw new Error(`no network: goal management makes no call (${url})`); };
  t.after(() => { globalThis.fetch = original; });
  return { sqlite, env: { LEARN_DB }, calls };
}

test('add several goals, edit one, switch the current goal: every change is saved and read back', async t => {
  const { env, calls } = setup(t);
  const knn = (await act(env, A, 'create_goal', { label: 'Predict a class with KNN' })).state.activeGoalId;
  const reg = (await act(env, A, 'create_goal', { label: 'Logistic regression', outcome: 'Read a threshold' })).state.activeGoalId;
  let state = await readCoachingState(env, A);
  assert.deepEqual(shown(state), ['Predict a class with KNN', 'Logistic regression']);
  assert.equal(state.activeGoalId, reg, 'a new goal is the current one (create_goal, as before)');
  // Edit: the goal's own words; its revision moves on, nothing else changes.
  const before = goalOf(state, knn);
  state = (await act(env, A, 'edit_goal', { goalId: knn, revision: before.revision, label: '  Predict a class using KNN ', outcome: 'Explain the vote' })).state;
  assert.deepEqual([goalOf(state, knn).label, goalOf(state, knn).outcome, goalOf(state, knn).revision], ['Predict a class using KNN', 'Explain the vote', before.revision + 1]);
  assert.equal(state.activeGoalId, reg, 'editing never switches the current goal');
  // The same words again write nothing.
  const same = await act(env, A, 'edit_goal', { goalId: knn, revision: goalOf(state, knn).revision, label: 'Predict a class using KNN' });
  assert.equal(same.state.revision, state.revision);
  // Switch.
  state = (await act(env, A, 'activate_goal', { goalId: knn })).state;
  assert.deepEqual([state.activeGoalId, goalOf(state, reg).status], [knn, 'paused']);
  assert.deepEqual(calls, [], 'no model or network call');
});

test('delete an inactive goal: the current goal and every other goal stay', async t => {
  const { env } = setup(t);
  const one = (await act(env, A, 'create_goal', { label: 'One' })).state.activeGoalId;
  const two = (await act(env, A, 'create_goal', { label: 'Two' })).state.activeGoalId;
  const three = (await act(env, A, 'create_goal', { label: 'Three' })).state.activeGoalId;
  const state = (await act(env, A, 'delete_goal', { goalId: two, revision: goalOf(await readCoachingState(env, A), two).revision })).state;
  assert.deepEqual(shown(state), ['One', 'Three']);
  assert.deepEqual([state.activeGoalId, goalOf(state, two).status, goalOf(state, one).status], [three, 'archived', 'paused']);
});

test('delete the active goal: the pointer and its activity clear, the others stay to choose from, then the empty state', async t => {
  const { env } = setup(t);
  const keep = (await act(env, A, 'create_goal', { label: 'Keep me' })).state.activeGoalId;
  const gone = (await act(env, A, 'create_goal', { label: 'Delete me', criteria: [C('c1', 'Name the parts')] })).state.activeGoalId;
  let state = (await act(env, A, 'activate_activity', { activity: { goalId: gone, objective: 'Parts', prompt: 'Name the parts.', responseKind: 'text', criterionRefs: [{ criterionId: 'c1', version: 1 }], sourceRefs: [] } })).state;
  const activityId = state.activeActivityId;
  assert.ok(activityId);
  state = (await act(env, A, 'delete_goal', { goalId: gone, revision: goalOf(state, gone).revision })).state;
  assert.deepEqual([state.activeGoalId, state.activeActivityId], [null, null], 'no stale pointer');
  assert.deepEqual(shown(state), ['Keep me'], 'the remaining goal, to choose');
  assert.equal(state.activities.find(a => a.activityId === activityId)?.status, 'paused', 'its activity is no longer in progress');
  await assert.rejects(act(env, A, 'activate_goal', { goalId: gone }), rejects('goal_closed', 409), 'a deleted goal cannot become current');
  await assert.rejects(act(env, A, 'edit_goal', { goalId: gone, revision: goalOf(state, gone).revision, label: 'Back' }), rejects('goal_closed', 409));
  state = (await act(env, A, 'activate_goal', { goalId: keep })).state;
  assert.equal(state.activeGoalId, keep);
  state = (await act(env, A, 'delete_goal', { goalId: keep, revision: goalOf(state, keep).revision })).state;
  assert.deepEqual([shown(state), state.activeGoalId], [[], null], 'the empty state');
  // Deleting a goal already gone changes nothing (a second tab's late click).
  const again = await act(env, A, 'delete_goal', { goalId: keep, revision: 0 });
  assert.equal(again.state.revision, state.revision);
});

test('deleting a journey-backed goal parks its journey (never archives it) and leaves no live journey on the board', async t => {
  const { sqlite, env } = setup(t);
  const j = await createJourney(env, scopeOf(A), { request: { raw_user_message: 'Teach me graphs', topic: 'graphs', intent: { kind: 'learn', topic: 'graphs' }, channel: 'text' }, grounding: { kind: 'topic' }, intake: { slots: {} } });
  const state = await readCoachingState(env, A);
  assert.equal(state.activeGoalId, `lg_${j.id}`);
  const after = (await act(env, A, 'delete_goal', { goalId: `lg_${j.id}`, revision: goalOf(state, `lg_${j.id}`).revision })).state;
  assert.deepEqual([after.activeGoalId, shown(after)], [null, []]);
  assert.deepEqual({ ...sqlite.prepare('SELECT board, archived_at FROM learning_journeys WHERE id = ?').get(j.id) }, { board: `parked:${j.id}`, archived_at: null });
  assert.equal(await loadJourney(env, scopeOf(A)), null);
  assert.deepEqual(shown(await readCoachingState(env, A)), [], 'a reload does not bring the journey goal back');
});

test('only the goal\'s owner can edit or delete it; another learner\'s goal reads as missing', async t => {
  const { env } = setup(t);
  const state = (await act(env, A, 'create_goal', { label: 'Ana\'s goal' })).state;
  const goal = goalOf(state, state.activeGoalId);
  await assert.rejects(act(env, B, 'edit_goal', { goalId: goal.goalId, revision: goal.revision, label: 'Mine now' }), rejects('unknown_goal', 404));
  await assert.rejects(act(env, B, 'delete_goal', { goalId: goal.goalId, revision: goal.revision }), rejects('unknown_goal', 404));
  await assert.rejects(act(env, { ...A, app: 'canvas-0000bbbb' }, 'delete_goal', { goalId: goal.goalId, revision: goal.revision }), rejects('unknown_goal', 404), 'not from another canvas either');
  assert.deepEqual(shown(await readCoachingState(env, A)), ['Ana\'s goal']);
});

test('payloads are checked at the boundary: label size, unexpected fields, a missing revision', async t => {
  const { env } = setup(t);
  const state = (await act(env, A, 'create_goal', { label: 'Goal' })).state;
  const goal = goalOf(state, state.activeGoalId);
  for (const payload of [{ goalId: goal.goalId, revision: goal.revision, label: '   ' }, { goalId: goal.goalId, revision: goal.revision, label: 'x'.repeat(201) },
    { goalId: goal.goalId, revision: goal.revision, label: 'ok', outcome: 'y'.repeat(1001) }, { goalId: goal.goalId, label: 'ok' },
    { goalId: goal.goalId, revision: goal.revision, label: 'ok', lifecycle: 'open' }]) {
    await assert.rejects(act(env, A, 'edit_goal', payload), e => e instanceof CoachingConflict && e.status === 400, JSON.stringify(payload).slice(0, 80));
  }
  await assert.rejects(act(env, A, 'delete_goal', { goalId: goal.goalId }), e => e.status === 400);
  await assert.rejects(act(env, A, 'delete_goal', { goalId: goal.goalId, revision: goal.revision, cascade: true }), e => e.status === 400);
});

test('a stale goal revision is 409 goal_changed with the current state; a stale canvas revision is 409 revision', async t => {
  const { env } = setup(t);
  const made = (await act(env, A, 'create_goal', { label: 'Old words' })).state;
  const seen = goalOf(made, made.activeGoalId);
  await act(env, A, 'edit_goal', { goalId: seen.goalId, revision: seen.revision, label: 'Changed in another tab' });
  await assert.rejects(act(env, A, 'edit_goal', { goalId: seen.goalId, revision: seen.revision, label: 'My edit' }), rejects('goal_changed', 409));
  await assert.rejects(act(env, A, 'delete_goal', { goalId: seen.goalId, revision: seen.revision }), rejects('goal_changed', 409), 'nor deleted from what it was');
  assert.equal(goalOf(await readCoachingState(env, A), seen.goalId).label, 'Changed in another tab', 'nothing written over');
  // Through the route: the 409 carries the current state, so the browser can show it beside the learner's own edit.
  const req = body => new Request('https://app.test/api/learn/coaching', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app: A.app, board: 'main', ...body }) });
  const post = async body => { const res = await coachingRoute('/api/learn/coaching', req(body), env, { authorize: async () => ({ kind: 'canvas', org: A.org, user_id: A.userId, name: A.app }) }); return { status: res.status, body: await res.json() }; };
  const now = await readCoachingState(env, A);
  const stale = await post({ actionId: 'tab2-edit', expectedRevision: now.revision, action: 'edit_goal', payload: { goalId: seen.goalId, revision: seen.revision, label: 'My edit' } });
  assert.deepEqual([stale.status, stale.body.error, goalOf(stale.body.state, seen.goalId).label], [409, 'goal_changed', 'Changed in another tab']);
  const behind = await post({ actionId: 'tab2-edit-2', expectedRevision: now.revision - 1, action: 'edit_goal', payload: { goalId: seen.goalId, revision: goalOf(now, seen.goalId).revision, label: 'My edit' } });
  assert.deepEqual([behind.status, behind.body.error, behind.body.state.revision], [409, 'revision', now.revision]);
});

test('duplicate clicks: the same action id replays once; a second delete with a new id finds nothing more to do', async t => {
  const { env } = setup(t);
  const before = await readCoachingState(env, A);
  const create = { actionId: 'click-add-1', expectedRevision: before.revision, action: 'create_goal', payload: { label: 'Twice clicked' } };
  const first = await applyCoachingAction(env, A, create), second = await applyCoachingAction(env, A, create);
  assert.equal(second.replayed, true);
  assert.deepEqual(shown(second.state), ['Twice clicked'], 'one goal, not two');
  const goal = goalOf(first.state, first.state.activeGoalId);
  const del = { actionId: 'click-del-1', expectedRevision: first.state.revision, action: 'delete_goal', payload: { goalId: goal.goalId, revision: goal.revision } };
  const gone = await applyCoachingAction(env, A, del), replay = await applyCoachingAction(env, A, del);
  assert.deepEqual([replay.replayed, replay.state.revision], [true, gone.state.revision]);
  const late = await act(env, A, 'delete_goal', { goalId: goal.goalId, revision: goal.revision });
  assert.equal(late.state.revision, gone.state.revision, 'nothing written');
});

// History: an assessment is tied to the criterion version it assessed. Editing the goal's words or deleting it never
// rewrites a criterion, attempt, assessment or observation.
test('editing or deleting a goal keeps its recorded progress exactly as assessed', async t => {
  const { sqlite, env } = setup(t);
  const goalId = (await act(env, A, 'create_goal', { label: 'Logistic regression', criteria: [C('prob', 'Interpret probability')] })).state.activeGoalId;
  const state = (await act(env, A, 'activate_activity', { activity: { goalId, objective: 'Probability', prompt: 'What does 0.8 mean?', responseKind: 'text', criterionRefs: [{ criterionId: 'prob', version: 1 }], sourceRefs: [] } })).state;
  const activity = state.activities.find(a => a.activityId === state.activeActivityId);
  const now = () => '2026-10-21T10:00:00.000Z';
  const saved = await acceptAttempt(env, A, { activityId: activity.activityId, activityRevision: activity.revision, submissionKey: 'answer-0001', submittedContent: { text: 'An 80% chance.' }, sourceRefs: [], assistanceRefs: [] }, { now });
  const token = await claimAssessment(env, A, saved.assessmentId, { now });
  await commitAssessment(env, A, { assessmentId: saved.assessmentId, token, attemptId: saved.attemptId, goalId, status: 'completed', provenance: { route: 'keyed' },
    observations: [{ criterionId: 'prob', criterionVersion: 1, fit: 'met', reasoning: 'supported', assistance: 'none', validity: 'valid', application: 'not_assessed' }] }, { now });
  const snapshot = () => Object.fromEntries(TABLES.map(table => [table, JSON.stringify(sqlite.prepare(`SELECT * FROM ${table} WHERE ${table === 'learn_goal_criteria' || table === 'learn_activities' || table === 'learn_attempts' || table === 'learn_observations' ? 'goal_id' : 'attempt_id'} = ? ORDER BY rowid`).all(table === 'learn_assessments' ? saved.attemptId : goalId))]));
  const progressBefore = await readProgress(env, A, { goalId });
  assert.equal(progressBefore.criteria[0].status, 'demonstrated_independently');
  const recorded = snapshot();
  const fresh = await readCoachingState(env, A);
  await act(env, A, 'edit_goal', { goalId, revision: goalOf(fresh, goalId).revision, label: 'Logistic regression in practice' });
  assert.deepEqual(snapshot(), recorded, 'an edit rewrites no criterion or evidence');
  assert.deepEqual((await readProgress(env, A, { goalId })).criteria, progressBefore.criteria, 'the same progress, against the same criterion version');
  const edited = await readCoachingState(env, A);
  await act(env, A, 'delete_goal', { goalId, revision: goalOf(edited, goalId).revision });
  assert.deepEqual(snapshot(), { ...recorded, learn_activities: snapshot().learn_activities }, 'a delete keeps criteria, attempts, assessments and observations');
  // A progress chip attached before the delete no longer resolves to the goal.
  const resolved = await resolveProgressQuestion(env, { org: A.org, userId: A.userId, app: A.app, board: A.board }, { goalRefs: [{ goalId, scopeVersion: 1 }], criterionRefs: [], dimensions: ['fit'], observationIds: [], summaryRevision: 1 }, { canvasAccess: async () => ({ kind: 'canvas' }) });
  assert.ok(resolved.limitations.some(l => l.code === 'goal_unavailable'), JSON.stringify(resolved.limitations));
});

// Integration: a real database file through the real route. Each "reload" closes the database and opens the file again, so
// what Progress reads after it is what was saved, not what a connection held in memory.
test('integration: goals saved through the route survive a reload of the database file', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'goal-mgmt-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'learn.sqlite');
  const authorize = async () => ({ kind: 'canvas', org: A.org, user_id: A.userId, name: A.app });
  const open = schema => setup(t, { path, schema });
  const route = env => async (method, body) => {
    const url = method === 'GET' ? `https://app.test/api/learn/coaching?${new URLSearchParams(body)}` : 'https://app.test/api/learn/coaching';
    const res = await coachingRoute('/api/learn/coaching', new Request(url, { method, headers: { 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }), env, { authorize });
    return { status: res.status, body: await res.json() };
  };
  let db = open(true), call = route(db.env);
  let state = (await call('GET', { app: A.app, board: 'main' })).body.state;
  const post = async (action, payload, actionId = `int-${++seq}`) => {
    const out = await call('POST', { app: A.app, board: 'main', actionId, expectedRevision: state.revision, action, payload });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    state = out.body.state;
    return state;
  };
  await post('create_goal', { label: 'Vectors' });
  const vectors = state.activeGoalId;
  await post('create_goal', { label: 'Matrices' });
  const matrices = state.activeGoalId;
  await post('create_goal', { label: 'Eigenvalues' });
  await post('edit_goal', { goalId: vectors, revision: goalOf(state, vectors).revision, label: 'Vectors and dot products' });
  await post('activate_goal', { goalId: matrices });
  db.sqlite.close();

  db = open(false); call = route(db.env); // reload
  state = (await call('GET', { app: A.app, board: 'main' })).body.state;
  assert.deepEqual([shown(state), state.activeGoalId], [['Vectors and dot products', 'Matrices', 'Eigenvalues'], matrices]);
  await post('delete_goal', { goalId: matrices, revision: goalOf(state, matrices).revision });
  db.sqlite.close();

  db = open(false); call = route(db.env); // reload
  state = (await call('GET', { app: A.app, board: 'main' })).body.state;
  assert.deepEqual([shown(state), state.activeGoalId], [['Vectors and dot products', 'Eigenvalues'], null], 'the delete and the cleared pointer persisted');
  assert.deepEqual(db.calls, [], 'no model or network call');
  db.sqlite.close(); // before the folder is removed (Windows keeps an open file)
});
