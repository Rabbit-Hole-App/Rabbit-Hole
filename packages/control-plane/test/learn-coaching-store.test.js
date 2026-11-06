// packages/control-plane/test/learn-coaching-store.test.js
// Tutor Task 02 (C:/s/spec/tutor-workflow/draft.md; owner decision 5a): learn-migrations/0025 and the personal coaching
// store and route on node:sqlite, behind the D1 slice the stores use. The journey tables are not read (Tutor cleanup P6a); a
// goal an old journey made is a plain goal row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learnDb } from './learn-grade-fixture.js';
import { CoachingConflict, applyCoachingAction, readCoachingState } from '../src/learn-coaching-store.js';
import { coachingRoute } from '../src/learn-coaching-routes.js';

const MIGRATION = readFileSync(new URL('../learn-migrations/0025-tutor-coaching-state.sql', import.meta.url), 'utf8');
const SCHEMA = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const MARK = '-- learn-migrations/0025-tutor-coaching-state.sql';
const BEFORE_0025 = SCHEMA.slice(0, SCHEMA.indexOf(MARK));
const NEW_TABLES = ['learn_coaching_state', 'learn_goals', 'learn_goal_criteria', 'learn_activities'];

const A = { org: 'ws', userId: 'u-ana', app: 'canvas-0000aaaa', board: 'main' };
const B = { ...A, userId: 'u-ben' };
const CRITERIA = [
  { criterionId: 'prob', label: 'Interpret probability', requirement: 'Explain a prediction in context', requiresReasoning: true },
  { criterionId: 'thr', label: 'Use a decision threshold', requirement: 'Explain how a threshold changes the class', requiresReasoning: true },
];
let seq = 0;
const act = async (env, actor, action, payload = {}, expectedRevision) => {
  const rev = expectedRevision ?? (await readCoachingState(env, actor)).revision;
  return applyCoachingAction(env, actor, { actionId: `act-${++seq}`, expectedRevision: rev, action, payload });
};
const rejects = (code, status) => e => e instanceof CoachingConflict && e.code === code && (status == null || e.status === status);

// A goal row exactly as the retired journey code made it (origin 'journey', no criteria); the journey tables are not read.
function legacyGoal(sqlite, { id, actor = A, lifecycle = 'open' }) {
  sqlite.prepare(`INSERT INTO learn_goals (id, org, owner_user_id, app, board, label, outcome, origin, scope_version, lifecycle, journey_id, activity_id, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'logistic regression', '', 'journey', 0, ?, ?, NULL, 0, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`)
    .run(id, actor.org, actor.userId, actor.app, actor.board, lifecycle, id.replace(/^lg_/, ''));
}
const tableNames = sqlite => sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
// An old database (before 0025), then 0025 applied, as the integrator applies it to learn-dev.
function migrated(t, seed = () => {}) {
  const db = learnDb(t, BEFORE_0025);
  seed(db.sqlite);
  db.sqlite.exec(MIGRATION);
  return { ...db, env: { LEARN_DB: db.LEARN_DB } };
}

test('0025 is CREATE-only, re-runnable and exactly what repository-schema.sql applies', t => {
  const statements = MIGRATION.replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  for (const s of statements) assert.match(s, /^CREATE (TABLE|(UNIQUE )?INDEX) IF NOT EXISTS /i);
  assert.ok(SCHEMA.replace(/\r/g, '').includes(MIGRATION.replace(/\r/g, '').trim()), 'repository-schema.sql holds 0025 verbatim');
  const { sqlite } = learnDb(t, BEFORE_0025);
  for (const table of NEW_TABLES) assert.ok(!tableNames(sqlite).includes(table));
  sqlite.exec(MIGRATION); sqlite.exec(MIGRATION);
  for (const table of NEW_TABLES) assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, `${table} starts empty: no SQL backfill`);
});

test('first use makes a coaching row with no active goal; a new goal becomes active and the one it replaces waits, paused', async t => {
  const { env } = migrated(t);
  const s0 = await readCoachingState(env, A);
  assert.deepEqual([s0.goals, s0.activeGoalId], [[], null]);
  assert.deepEqual(s0.controls, { mode: 'auto', tutorEnabled: true, suggestionsPaused: false, revision: 0 });
  const first = (await act(env, A, 'create_goal', { label: 'Logistic regression' })).state.activeGoalId;
  const knn = (await act(env, A, 'create_goal', { label: 'Predict a class using KNN' })).state;
  assert.equal(knn.goals.find(g => g.goalId === first).status, 'paused');
  assert.equal(knn.goals.find(g => g.goalId === knn.activeGoalId).status, 'active');
  // Explicit return: the first goal is the active one again.
  const back = (await act(env, A, 'activate_goal', { goalId: first })).state;
  assert.deepEqual([back.activeGoalId, back.goals.find(g => g.goalId === first).status], [first, 'active']);
});

test('two_goals_resume_without_archive_loss', async t => {
  const { sqlite, env } = migrated(t);
  let s = (await act(env, A, 'create_goal', { label: 'Explain logistic regression predictions', criteria: CRITERIA })).state;
  const reg = s.activeGoalId;
  s = (await act(env, A, 'activate_activity', { activity: { goalId: reg, objective: 'Threshold', prompt: 'Move the threshold to 0.7. What changes?', responseKind: 'text', criterionRefs: [{ criterionId: 'thr', version: 1 }], sourceRefs: [{ kind: 'card', id: 'b1', version: 2 }], checkpoint: { step: 1 } } })).state;
  const threshold = s.activeActivityId;
  // A goal made while that goal is active becomes the active goal; the regression goal waits, paused.
  s = (await act(env, A, 'create_goal', { label: 'KNN' })).state;
  const knn = s.activeGoalId;
  assert.equal(s.goals.find(g => g.goalId === reg).status, 'paused');
  assert.equal(s.activeActivityId, null);
  // Back to the threshold exercise: same activity, criteria and checkpoint.
  s = (await act(env, A, 'activate_goal', { goalId: reg })).state;
  assert.deepEqual([s.activeGoalId, s.activeActivityId], [reg, threshold]);
  const activity = s.activities.find(a => a.activityId === threshold);
  assert.deepEqual([activity.status, activity.prompt, activity.checkpoint], ['in_progress', 'Move the threshold to 0.7. What changes?', { step: 1 }]);
  assert.deepEqual(s.goals.find(g => g.goalId === reg).criteria.map(c => c.criterionId), ['prob', 'thr']);
  // A third goal while the second waits: several open goals, one current.
  await act(env, A, 'create_goal', { label: 'decision trees' });
  s = (await act(env, A, 'activate_goal', { goalId: knn })).state;
  assert.deepEqual(s.goals.map(g => g.status).sort(), ['active', 'paused', 'paused']);
  assert.ok(sqlite.prepare("SELECT count(*) AS n FROM learn_goals WHERE lifecycle != 'open'").get().n === 0, 'nothing archived');
});

test('stale_revision_preserves_newer_state', async t => {
  const { sqlite, env } = migrated(t);
  const seen = (await readCoachingState(env, A)).revision; // two tabs read the same revision
  await act(env, A, 'create_goal', { label: 'Goal from tab 1' }, seen);
  await assert.rejects(act(env, A, 'create_goal', { label: 'Goal from tab 2' }, seen), rejects('revision', 409));
  await assert.rejects(act(env, A, 'save_controls', { event: { type: 'not_now' } }, seen), rejects('revision', 409));
  const s = await readCoachingState(env, A);
  assert.deepEqual(s.goals.map(g => g.label), ['Goal from tab 1']);
  assert.equal(s.controls.suggestionsPaused, false);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM learn_goals').get().n, 1, 'the stale batch wrote no orphan goal');
  // Truly concurrent: both tabs pass the revision read before either writes; only the batch guard decides.
  const now = (await readCoachingState(env, A)).revision;
  const race = await Promise.allSettled(['tab 1', 'tab 2'].map(tab => act(env, A, 'create_goal', { label: `Race ${tab}`, criteria: CRITERIA }, now)));
  assert.deepEqual(race.map(r => r.status).sort(), ['fulfilled', 'rejected']);
  assert.ok(rejects('revision')(race.find(r => r.status === 'rejected').reason));
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM learn_goals WHERE label LIKE 'Race%'").get().n, 1, 'the losing batch wrote no goal');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM learn_goal_criteria').get().n, 2, 'nor criteria');
  // Undo never overwrites a newer revision.
  const off = await act(env, A, 'save_controls', { event: { type: 'continue_own_work' } });
  const undo = off.effects.find(e => e.type === 'show_undo').undo;
  await act(env, A, 'save_controls', { event: { type: 'select_mode', mode: 'ask' } });
  await assert.rejects(act(env, A, 'save_controls', { event: { type: 'undo', undo } }), rejects('undo_stale', 409));
  assert.deepEqual([(await readCoachingState(env, A)).controls.tutorEnabled], [false]);
});

test('foreign_goal_reference_rejected: another learner, another canvas, another goal\'s criteria', async t => {
  const { env } = migrated(t);
  const s = (await act(env, A, 'create_goal', { label: 'Ana\'s goal', criteria: CRITERIA })).state;
  const goalId = s.activeGoalId;
  const withActivity = (await act(env, A, 'activate_activity', { activity: { goalId, objective: 'o', prompt: 'p', responseKind: 'text', criterionRefs: [{ criterionId: 'prob', version: 1 }] } })).state;
  for (const [action, payload] of [['activate_goal', { goalId }], ['change_scope', { goalId, criteria: CRITERIA }], ['activate_activity', { activityId: withActivity.activeActivityId }], ['activate_activity', { activity: { goalId, objective: 'o', prompt: 'p', responseKind: 'text', criterionRefs: [] } }]]) {
    await assert.rejects(act(env, B, action, payload), e => e instanceof CoachingConflict && e.status === 404, `${action} by another learner`);
    await assert.rejects(act(env, { ...A, board: 'other' }, action, payload), e => e instanceof CoachingConflict && e.status === 404, `${action} from another canvas`);
  }
  const other = (await act(env, A, 'create_goal', { label: 'Second', criteria: [{ criterionId: 'knn', label: 'Vote', requirement: 'Explain the vote', requiresReasoning: true }] })).state.activeGoalId;
  await assert.rejects(act(env, A, 'activate_activity', { activity: { goalId: other, objective: 'o', prompt: 'p', responseKind: 'text', criterionRefs: [{ criterionId: 'prob', version: 1 }] } }), rejects('criterionRefs must name criteria of the goal\'s current scope', 400));
});

test('two users on one canvas keep separate controls and goals', async t => {
  const { env } = migrated(t);
  await act(env, A, 'create_goal', { label: 'Ana\'s goal' });
  await act(env, A, 'save_controls', { event: { type: 'select_mode', mode: 'tutor' } });
  await act(env, A, 'save_controls', { event: { type: 'not_now' } });
  const ben = await readCoachingState(env, B);
  assert.deepEqual([ben.controls.mode, ben.controls.suggestionsPaused, ben.goals.length, ben.activeGoalId], ['auto', false, 0, null]);
  await act(env, B, 'create_goal', { label: 'Ben\'s goal' });
  const ana = await readCoachingState(env, A);
  assert.deepEqual([ana.controls.mode, ana.controls.suggestionsPaused, ana.goals.map(g => g.label)], ['tutor', true, ['Ana\'s goal']]);
});

test('legacy_session_record_is_not_mastery: a goal row an old journey made has no criterion or activity, and the client cannot send progress', async t => {
  const passes = { seq: 2, events: [{ seq: 1, concept: 'lr', claim: 'lr/sigmoid', result: 'pass', kind: 'demonstrated_in_transfer', settled: true, evaluator: 'jev' }] };
  const { sqlite, env } = migrated(t);
  legacyGoal(sqlite, { id: 'lg_lj_rich' });
  const s = await readCoachingState(env, A);
  assert.deepEqual(s.goals.map(g => [g.goalId, g.scopeVersion, g.criteria, g.journeyId]), [['lg_lj_rich', 0, [], 'lj_rich']]);
  for (const table of ['learn_goal_criteria', 'learn_activities']) assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, table);
  // The client cannot hand the server progress either.
  for (const payload of [{ label: 'x', evidence: passes }, { label: 'x', status: 'demonstrated_independently' }, { label: 'x', criteria: [{ ...CRITERIA[0], status: 'demonstrated_independently' }] }]) {
    await assert.rejects(act(env, A, 'create_goal', payload), e => e instanceof CoachingConflict && e.status === 400);
  }
});

test('a failed write changes nothing, and a retry with the same actionId replays once', async t => {
  const { LEARN_DB } = migrated(t);
  let fail = false;
  // D1 fails after the batch's statements ran: the transaction rolls back whole.
  const env = { LEARN_DB: { ...LEARN_DB, batch: statements => LEARN_DB.batch(fail ? [...statements, { runNow() { throw new Error('D1_ERROR: network lost'); } }] : statements) } };
  const before = await readCoachingState(env, A);
  fail = true;
  await assert.rejects(act(env, A, 'create_goal', { label: 'KNN', criteria: CRITERIA }), /network lost/);
  fail = false;
  assert.deepEqual(await readCoachingState(env, A), before);
  const request = { actionId: 'tab1-create-knn', expectedRevision: before.revision, action: 'create_goal', payload: { label: 'KNN' } };
  const first = await applyCoachingAction(env, A, request), again = await applyCoachingAction(env, A, request);
  assert.equal(again.replayed, true);
  assert.deepEqual(again.state, first.state);
  assert.equal(first.state.goals.filter(g => g.label === 'KNN').length, 1);
});

test('change_scope adds the next scope version and keeps every earlier criterion row', async t => {
  const { sqlite, env } = migrated(t);
  const goalId = (await act(env, A, 'create_goal', { label: 'Logistic regression', criteria: CRITERIA })).state.activeGoalId;
  const next = [{ ...CRITERIA[0] }, { ...CRITERIA[1], requirement: 'Explain a threshold change with a new example' }, { criterionId: 'code', label: 'Implement it', requirement: 'Write the training loop', requiresReasoning: false }];
  const goal = (await act(env, A, 'change_scope', { goalId, criteria: next })).state.goals[0];
  assert.equal(goal.scopeVersion, 2);
  assert.deepEqual(goal.criteria.map(c => [c.criterionId, c.version]), [['prob', 1], ['thr', 2], ['code', 1]]);
  assert.deepEqual(sqlite.prepare('SELECT scope_version, criterion_id, version FROM learn_goal_criteria ORDER BY scope_version, position').all().map(r => [r.scope_version, r.criterion_id, r.version]),
    [[1, 'prob', 1], [1, 'thr', 1], [2, 'prob', 1], [2, 'thr', 2], [2, 'code', 1]]);
  await assert.rejects(act(env, A, 'change_scope', { goalId, criteria: [] }), e => e.status === 400);
  // The transfer gate (integrator ruling Q1) is part of what a criterion asks: it persists, and turning it on is a new version.
  assert.deepEqual(goal.criteria.map(c => c.requiresTransfer), [false, false, false]);
  const gated = (await act(env, A, 'change_scope', { goalId, criteria: [{ ...next[0], requiresTransfer: true }, next[1], next[2]] })).state.goals[0];
  assert.deepEqual(gated.criteria.map(c => [c.criterionId, c.version, c.requiresTransfer]), [['prob', 2, true], ['thr', 2, false], ['code', 1, false]]);
  await assert.rejects(act(env, A, 'change_scope', { goalId, criteria: [{ ...next[0], requiresTransfer: 'yes' }] }), e => e.status === 400);
});

test('controls go through the shared reducer and read the same on another device', async t => {
  const { env } = migrated(t);
  await act(env, A, 'save_controls', { event: { type: 'select_mode', mode: 'tutor' } });
  const paused = await act(env, A, 'save_controls', { event: { type: 'not_now' } });
  assert.deepEqual(paused.effects.map(e => e.type), ['persist', 'suspend_coaching']);
  const other = await readCoachingState(env, A); // a second signed-in client
  assert.deepEqual([other.controls.mode, other.controls.tutorEnabled, other.controls.suggestionsPaused], ['tutor', true, true]);
  assert.equal(other.controls.revision, other.revision);
  const asked = await act(env, A, 'save_controls', { event: { type: 'question' } });
  assert.equal(asked.state.revision, other.revision, 'a plain question writes nothing');
  await assert.rejects(act(env, A, 'save_controls', { event: { type: 'select_mode', mode: 'syllabus' } }), e => e.status === 400);
  await act(env, A, 'pause_activity', { activityId: 'none' }).then(() => assert.fail('no active activity'), e => assert.equal(e.code, 'not_active_activity'));
});

test('a legacy journey goal whose lifecycle is archived (the backfill) is archived, not active, and cannot be reopened', async t => {
  const { sqlite, env } = migrated(t);
  legacyGoal(sqlite, { id: 'lg_lj_gone', lifecycle: 'archived' });
  const s = await readCoachingState(env, A);
  assert.deepEqual(s.goals.map(g => [g.lifecycle, g.status]), [['archived', 'archived']]);
  assert.equal(s.activeGoalId, null);
  await assert.rejects(act(env, A, 'activate_goal', { goalId: 'lg_lj_gone' }), rejects('goal_closed', 409));
});

// --- route ---
const route = (env, { user = 'u-ana', kind = 'canvas', origin } = {}) => async (method, body) => {
  const url = method === 'GET' ? `https://app.test/api/learn/coaching?${new URLSearchParams(body)}` : 'https://app.test/api/learn/coaching';
  const req = new Request(url, { method, headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
  const res = await coachingRoute('/api/learn/coaching', req, env, { authorize: async () => ({ kind, org: 'ws', user_id: user, name: A.app }) });
  return { status: res.status, body: await res.json() };
};

test('route: owner-scoped GET and POST, 409 with the current state, 404 for foreign goals', async t => {
  const { env } = migrated(t);
  const ana = route(env), ben = route(env, { user: 'u-ben' });
  const got = await ana('GET', { app: A.app, board: 'main' });
  assert.equal(got.status, 200);
  assert.equal(JSON.stringify(got.body).includes('u-ana'), false, 'users.id never leaves the server');
  const made = await ana('POST', { app: A.app, board: 'main', actionId: 'a1', expectedRevision: got.body.state.revision, action: 'create_goal', payload: { label: 'KNN' } });
  assert.equal(made.status, 200);
  const stale = await ana('POST', { app: A.app, board: 'main', actionId: 'a2', expectedRevision: got.body.state.revision, action: 'create_goal', payload: { label: 'again' } });
  assert.deepEqual([stale.status, stale.body.error, stale.body.state.revision], [409, 'revision', made.body.state.revision]);
  const foreign = await ben('POST', { app: A.app, board: 'main', actionId: 'b1', expectedRevision: 0, action: 'activate_goal', payload: { goalId: made.body.state.activeGoalId } });
  assert.deepEqual([foreign.status, foreign.body.error, foreign.body.state], [404, 'unknown_goal', undefined]);
  assert.equal((await ana('POST', { app: A.app, board: 'main', actionId: 'a3', expectedRevision: 1, action: 'archive_goal', payload: {} })).status, 400);
  assert.equal((await ana('GET', { app: A.app, board: 'parked:x' })).status, 400, 'a parked board name is unreachable');
  assert.equal((await route(env, { kind: 'live' })('GET', { app: A.app, board: 'main' })).status, 400);
  assert.equal((await route(env, { user: null })('GET', { app: A.app, board: 'main' })).status, 401);
  assert.equal((await route(env, { origin: 'https://evil.test' })('POST', { app: A.app, board: 'main' })).status, 403);
});

// Tutor T8 (draft Task 05 browser half): the activity card offers a drawing answer only where this deployment assesses
// drawings (T6's TUTOR_VISUAL_ASSESSMENT_ENABLED), read with the controls; nothing else about the deployment is said.
test('route: GET says whether submitted drawings are assessed here, from the visual assessment flag only', async t => {
  const { env } = migrated(t);
  assert.deepEqual((await route(env)('GET', { app: A.app, board: 'main' })).body.capabilities, { drawing: false });
  assert.deepEqual((await route({ ...env, TUTOR_VISUAL_ASSESSMENT_ENABLED: 'true' })('GET', { app: A.app, board: 'main' })).body.capabilities, { drawing: true });
});

test('route: a database without 0025 is coaching_unavailable, never an empty history', async t => {
  const { LEARN_DB } = learnDb(t, BEFORE_0025);
  const res = await route({ LEARN_DB })('GET', { app: A.app, board: 'main' });
  assert.deepEqual([res.status, res.body], [503, { error: 'coaching_unavailable' }]);
});
