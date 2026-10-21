// packages/control-plane/test/learn-progress.test.js
// The Progress read model (C:/s/spec/tutor-workflow/draft.md Task 08; integrator rulings Q1, Q2) on the draft's three-goal
// canvas: a canvas titled Logistic Regression holding a paused regression goal, an active KNN goal and a paused TaskBoard
// goal. LEARN_DB is node:sqlite from repository-schema.sql (canvases, Trash, holes, files, boards: the real access paths);
// the goal and evidence records sit behind the store adapter (learn 0025/0026 are other lanes'), held in memory and scoped
// by the actor exactly as the D1 adapter must be. The route runs as the dev worker mounts it, with /api/me scripted. No
// model is bound, so none can be called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { ProgressError, progressRoute, readProgress } from '../src/learn-progress.js';

const PEOPLE = {
  ana: { email: 'ana@test', org: 'team-ws', user_id: 'u-ana-5d1e' }, ben: { email: 'ben@test', org: 'team-ws', user_id: 'u-ben-9a2b' },
  anaAlt: { email: 'ana@test', org: 'team-ws', user_id: 'u-ana-other' }, // another account behind ana's email
};
const IDS = Object.values(PEOPLE).map(p => p.user_id);
const APP = 'canvas-0a1b2c3d', BEN_APP = 'canvas-0b0b0b0b', HOLE = 'canvas-0c0c0c0c', BOARD = 'main';
const ANA = { org: 'team-ws', userId: 'u-ana-5d1e', app: APP, board: BOARD };
const BEN = { org: 'team-ws', userId: 'u-ben-9a2b', app: BEN_APP, board: BOARD };
const at = day => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`;
const C = (criterionId, label, extra = {}) => ({ criterionId, version: 1, label, requirement: `Show: ${label}`, requiresReasoning: true, rubricVersion: 'r1', ...extra });
const counts = c => ({ total: 0, not_checked: 0, practising: 0, demonstrated_with_help: 0, demonstrated_independently: 0, needs_review: 0, ...c });
const code = expected => error => error instanceof ProgressError && error.code === expected;

// The store adapter (learn-progress.js header) over plain records. Evidence is read by goal, as a D1 adapter reads
// learn_evidence_links by goal_id, so a row a partial delete left behind still reaches readProgress.
function memoryStore() {
  const goals = new Map(), attempts = [], assessments = [], observations = [];
  let n = 0;
  const owns = (actor, g) => ['org', 'userId', 'app', 'board'].every(k => g[k] === actor[k]);
  const store = {
    goal: async (env, actor, goalId) => (goals.has(goalId) && owns(actor, goals.get(goalId).record) ? { ...goals.get(goalId).record } : null),
    criteria: async (env, actor, goalId, sv) => ((await store.goal(env, actor, goalId)) && goals.get(goalId).scopes[sv]) || null,
    evidence: async (env, actor, goalId) => {
      const ok = !!(await store.goal(env, actor, goalId)), of = list => (ok ? list.filter(r => r.goalId === goalId) : []);
      return { attempts: of(attempts), assessments: of(assessments), observations: of(observations) };
    },
  };
  const addGoal = (goalId, criteria, actor = ANA) => goals.set(goalId, { record: { goalId, ...actor, scopeVersion: 1, revision: 1, updatedAt: at(1) }, scopes: { 1: criteria } });
  const changeScope = (goalId, scopeVersion, criteria) => {
    const g = goals.get(goalId);
    g.scopes[scopeVersion] = criteria;
    g.record = { ...g.record, scopeVersion, revision: g.record.revision + 1, updatedAt: at(19) };
  };
  // One assessment of an attempt; each observation links it to one criterion of the goal.
  const assess = (attemptId, goalId, { status = 'completed', day = 18, supersedes, obs = [] } = {}) => {
    const assessmentId = `asm-${++n}`;
    assessments.push({ assessmentId, attemptId, goalId, status, updatedAt: at(day) });
    obs.forEach((o, k) => observations.push({
      goalId, observationId: `obs-${n}-${k}`, attemptId, assessmentId, assessmentStatus: status, criterionVersion: 1,
      fit: 'met', reasoning: 'supported', assistance: 'none', validity: 'valid', observedAt: at(day), reason: 'Explained it in their own words.',
      ...(supersedes ? { supersedesAssessmentId: supersedes } : {}), ...o,
    }));
    return assessmentId;
  };
  const submit = (goalId, { day = 18, excerpt = 'My answer.', sourceRefs = [], ...rest } = {}) => {
    const attemptId = `att-${++n}`;
    attempts.push({ attemptId, goalId, submittedAt: at(day), sourceRefs, excerpt });
    return { attemptId, assessmentId: assess(attemptId, goalId, { day, ...rest }) };
  };
  const complete = assessmentId => {
    for (const a of assessments) if (a.assessmentId === assessmentId) a.status = 'completed';
    for (const o of observations) if (o.assessmentId === assessmentId) o.assessmentStatus = 'completed';
  };
  const deleteAttempt = attemptId => attempts.splice(attempts.findIndex(a => a.attemptId === attemptId), 1);
  return { store, observations, addGoal, changeScope, assess, submit, complete, deleteAttempt };
}

// The draft's "Progress across several goals" table, as records.
function threeGoals(s) {
  s.addGoal('g-reg', [C('probability', 'Interpret probability'), C('threshold', 'Use a decision threshold', { requiresTransfer: true }), C('sigmoid', 'Explain the sigmoid'), C('log-loss', 'Explain log loss')]);
  s.addGoal('g-knn', [C('knn-predict', 'Predict a class from its neighbours'), C('knn-vote', 'Explain the majority vote'), C('knn-k', 'Choose k')]);
  s.addGoal('g-task', [C('trace', 'Trace the intermediate rounded value'), C('cause', 'Explain the cause of the percentage error')]);
  // Logistic regression: 2 of 4 demonstrated independently; 1 practising with help; 1 not checked (log loss only viewed).
  s.submit('g-reg', { day: 10, obs: [{ criterionId: 'probability' }] });
  s.submit('g-reg', { day: 11, obs: [{ criterionId: 'threshold', assistance: 'assisted' }] }); // yesterday: needed a hint
  s.submit('g-reg', { day: 12, obs: [{ criterionId: 'threshold', application: 'applied' }] }); // today: a different case, alone
  s.submit('g-reg', { day: 12, obs: [{ criterionId: 'sigmoid', reasoning: 'partial', assistance: 'assisted' }] }); // right number after a hint
  // KNN: 1 of 3 demonstrated independently; 1 demonstrated with help; 1 not checked.
  s.submit('g-knn', { day: 13, obs: [{ criterionId: 'knn-predict' }] });
  s.submit('g-knn', { day: 14, excerpt: 'Two of the three nearest are red, so red.', obs: [{ criterionId: 'knn-vote', assistance: 'assisted' }] });
  // TaskBoard: 0 of 2 demonstrated independently; 1 practising; 1 not checked.
  s.submit('g-task', { day: 15, obs: [{ criterionId: 'trace', fit: 'partial', reasoning: 'partial' }] });
}

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const CONTROL_PLANE = {
    fetch: async request => {
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      return new URL(request.url).pathname === '/api/me' ? Response.json({ ...who, orgName: null }) : new Response('no', { status: 404 });
    },
  };
  for (const [name, owner, title] of [[APP, 'ana@test', 'Logistic Regression'], [BEN_APP, 'ben@test', 'KNN'], [HOLE, 'ana@test', 'Neighbours']]) {
    sqlite.prepare('INSERT INTO canvases(org, name, owner_email, title) VALUES (?, ?, ?, ?)').run('team-ws', name, owner, title);
  }
  const env = { LEARN_DB, CONTROL_PLANE };
  const s = memoryStore();
  threeGoals(s);
  const read = (goalId, extra = {}, { actor = ANA, store = s.store } = {}) => readProgress(env, actor, { goalId, ...extra }, { store });
  const call = async (as, query, store = s.store) => {
    const req = new Request(`https://app.test/api/learn/progress?${new URLSearchParams({ app: APP, board: BOARD, ...query })}`, { headers: { cookie: `small_session=${as}` } });
    const response = await progressRoute('/api/learn/progress', req, env, { store });
    const text = await response.text();
    for (const id of IDS) assert.equal(text.includes(id), false, 'a response carried a users.id');
    return { status: response.status, body: JSON.parse(text), text };
  };
  return { env, sqlite, s, read, call };
}

test('knn_update_leaves_other_goals_unchanged', async t => {
  const { s, read } = setup(t);
  const before = { reg: await read('g-reg'), knn: await read('g-knn'), task: await read('g-task') };
  assert.deepEqual(before.reg.counts, counts({ total: 4, demonstrated_independently: 2, practising: 1, not_checked: 1 }));
  assert.deepEqual(before.knn.counts, counts({ total: 3, demonstrated_independently: 1, demonstrated_with_help: 1, not_checked: 1 }));
  assert.deepEqual(before.task.counts, counts({ total: 2, practising: 1, not_checked: 1 }));
  assert.deepEqual(before.reg.criteria.map(c => c.status), ['demonstrated_independently', 'demonstrated_independently', 'practising', 'not_checked']);
  // Each conclusion links to the observations behind it.
  const threshold = before.reg.criteria[1];
  assert.deepEqual(threshold.evidence.map(e => [e.observedAt, e.assistance, e.application]), [[at(11), 'assisted', 'not_assessed'], [at(12), 'none', 'applied']]);
  assert.deepEqual(threshold.evidenceIds, [threshold.evidence[1].observationId]);

  // A fresh neighbour arrangement explained without a hint, supporting the criterion that was assisted before.
  s.submit('g-knn', { day: 20, obs: [{ criterionId: 'knn-vote' }] });
  const knn = await read('g-knn');
  assert.deepEqual(knn.counts, counts({ total: 3, demonstrated_independently: 2, not_checked: 1 }));
  const vote = knn.criteria.find(c => c.criterionId === 'knn-vote');
  assert.equal(vote.status, 'demonstrated_independently');
  assert.deepEqual(vote.evidence.map(e => e.assistance), ['assisted', 'none'], 'the earlier assisted answer stays in its history');
  assert.deepEqual(vote.evidenceIds, [vote.evidence[1].observationId]);
  assert.equal(vote.retention.status, 'not_checked', 'not a later retention check');
  assert.notEqual(knn.summaryRevision, before.knn.summaryRevision);
  assert.deepEqual(await read('g-reg'), before.reg);
  assert.deepEqual(await read('g-task'), before.task);
});

test('duplicate_evidence_does_not_inflate_counts', async t => {
  const { s, read } = setup(t);
  const before = await read('g-knn');
  const predict = s.observations.find(o => o.criterionId === 'knn-predict');
  s.observations.push({ ...predict }); // the same observation read twice
  s.assess(predict.attemptId, 'g-knn', { day: 16, obs: [{ criterionId: 'knn-predict' }] }); // a retried assessment of the same answer
  const after = await read('g-knn');
  assert.deepEqual(after.counts, before.counts);
  const row = after.criteria.find(c => c.criterionId === 'knn-predict');
  assert.equal(row.status, 'demonstrated_independently');
  const ids = row.evidence.map(e => e.observationId);
  assert.equal(new Set(ids).size, ids.length, 'each observation listed once');
  assert.deepEqual([...new Set(row.evidence.map(e => e.attemptId))], [predict.attemptId], 'still one submitted answer');
});

test('scope_change_is_explicit', async t => {
  const { s, read } = setup(t);
  const v1 = await read('g-reg');
  // The learner accepts six criteria instead of four: two new ones, and the sigmoid criterion reworded (a new version).
  s.changeScope('g-reg', 2, [C('probability', 'Interpret probability'), C('threshold', 'Use a decision threshold', { requiresTransfer: true }),
    C('sigmoid', 'Connect the score to the probability', { version: 2 }), C('log-loss', 'Explain log loss'), C('regularisation', 'Explain regularisation'), C('multiclass', 'Extend to several classes')]);
  const v2 = await read('g-reg');
  assert.deepEqual([v2.goalRef, v2.currentScopeVersion], [{ goalId: 'g-reg', scopeVersion: 2 }, 2]);
  // A wider scope, not a loss of skill: the independent count stays; the reworded criterion starts unchecked.
  assert.deepEqual(v2.counts, counts({ total: 6, demonstrated_independently: 2, not_checked: 4 }));
  assert.deepEqual(v2.criteria[2].evidence, []);
  // The earlier scope stays readable exactly as it was, with its evidence under its original criterion version.
  const old = await read('g-reg', { scopeVersion: 1 });
  assert.deepEqual([old.goalRef, old.currentScopeVersion], [{ goalId: 'g-reg', scopeVersion: 1 }, 2]);
  assert.deepEqual([old.criteria, old.counts], [v1.criteria, v1.counts]);
  await assert.rejects(read('g-reg', { scopeVersion: 3 }), code('unknown_scope'));
});

test('pending_keeps_confirmed_summary', async t => {
  const { s, read } = setup(t);
  const before = await read('g-knn');
  const vote = s.observations.find(o => o.criterionId === 'knn-vote');
  // A requested reassessment of the assisted vote answer is still running; its unconfirmed result would supersede the original.
  const review = s.assess(vote.attemptId, 'g-knn', { status: 'pending', day: 21, supersedes: vote.assessmentId, obs: [{ criterionId: 'knn-vote', fit: 'not_met' }] });
  const unknown = s.submit('g-knn', { status: 'unknown', day: 21, obs: [{ criterionId: 'knn-k' }] }).assessmentId;
  const unavailable = s.submit('g-knn', { status: 'unavailable', day: 21 }).assessmentId;
  const failed = s.submit('g-knn', { status: 'failed', day: 21 }).assessmentId;
  const view = await read('g-knn');
  assert.deepEqual([view.criteria, view.counts, view.summaryRevision, view.savedAt], [before.criteria, before.counts, before.summaryRevision, before.savedAt]);
  assert.equal(view.savedAt, at(14));
  assert.deepEqual(view.pendingAssessments, [review, unknown]);
  assert.deepEqual(view.unavailableAssessments, [unavailable, failed]);
  // Only a saved result changes the summary, and the result it replaced stays explainable.
  s.complete(review);
  const done = (await read('g-knn')).criteria.find(c => c.criterionId === 'knn-vote');
  assert.equal(done.status, 'practising');
  assert.deepEqual(done.evidence.map(e => [e.assessmentId, e.validity]), [[vote.assessmentId, 'superseded'], [review, 'valid']]);
});

test('foreign_learner_cannot_read', async t => {
  const { env, s, call } = setup(t);
  const own = await call('ana', { goalId: 'g-knn' });
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.progress.goalRef, { goalId: 'g-knn', scopeVersion: 1 });
  // Ben shares ana's workspace, not her canvas; another account behind her email has no goals of its own there.
  const ben = await call('ben', { goalId: 'g-knn' });
  assert.equal(ben.status, 403);
  const alt = await call('anaAlt', { goalId: 'g-knn' });
  assert.deepEqual([alt.status, alt.body], [404, { error: 'unknown_goal' }]);
  // Ben's goal on his own canvas, asked for by id through ana's canvas, reads as missing.
  s.addGoal('g-ben', [C('knn-predict', 'Predict a class from its neighbours')], BEN);
  s.submit('g-ben', { excerpt: 'Ben private answer', obs: [{ criterionId: 'knn-predict' }] });
  const cross = await call('ana', { goalId: 'g-ben' });
  assert.deepEqual([cross.status, cross.body], [404, { error: 'unknown_goal' }]);
  for (const r of [ben, alt, cross]) for (const leak of ['neighbour', 'Ben private', 'obs-', 'att-']) assert.equal(r.text.includes(leak), false, leak);
  // An adapter that ignored the actor would still be refused: the goal's owner is rechecked on every read.
  const leaky = { ...s.store, goal: async (e, actor, goalId) => s.store.goal(e, ANA, goalId) };
  await assert.rejects(readProgress(env, BEN, { goalId: 'g-knn' }, { store: leaky }), code('unknown_goal'));
});

test('revoked_source_snippet_is_not_returned', async t => {
  const { sqlite, s, call } = setup(t);
  const file = (id, owner, app) => sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, bytes, sha256, r2_key, status, created_at) VALUES (?, 'team-ws', ?, ?, 'document', 'people.csv', 'text/csv', 10, 'sha', 'k', 'stored', 0)").run(id, owner, app);
  file('fs-ben-1', 'ben@test', BEN_APP);
  file('fs-ana-1', 'ana@test', APP);
  // Ben's dataset reaches ana only through her board's reference to it (file-access.js).
  sqlite.prepare("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at) VALUES ('lb-ana', 'team-ws', 'ana@test', ?, 'main', '{}', '2026-10-01')").run(APP);
  sqlite.prepare("INSERT INTO file_source_refs (source_id, board_id) VALUES ('fs-ben-1', 'lb-ana')").run();
  const benQuote = 'Row 17 of the shared people.csv is Alice, 42, Leeds', benReason = 'Used row 17 of the dataset correctly.';
  s.submit('g-knn', { day: 20, excerpt: benQuote, sourceRefs: [{ kind: 'file', id: 'fs-ben-1', version: 'sha', locator: { row: 17 } }], obs: [{ criterionId: 'knn-k', reason: benReason }] });
  s.submit('g-knn', { day: 20, excerpt: 'My own notes say k = 3.', sourceRefs: [{ kind: 'file', id: 'fs-ana-1', version: 'sha' }], obs: [{ criterionId: 'knn-k' }] });
  s.submit('g-knn', { day: 20, excerpt: 'From the repository README.', sourceRefs: [{ kind: 'repository', id: 'repo-0a1b2c3d-x', version: 'abc' }], obs: [{ criterionId: 'knn-k' }] });
  const evidence = body => body.progress.criteria.find(c => c.criterionId === 'knn-k').evidence;

  const open = await call('ana', { goalId: 'g-knn' });
  assert.equal(open.status, 200);
  assert.deepEqual(evidence(open.body).map(e => e.excerpt), [benQuote, 'My own notes say k = 3.', null]);
  assert.deepEqual(evidence(open.body)[0].sources, [{ kind: 'file', id: 'fs-ben-1', version: 'sha', locator: { row: 17 } }]);
  // A kind with no access check here is withheld, never shown on trust.
  assert.deepEqual(evidence(open.body)[2].sources, [{ kind: 'repository', available: false }]);

  sqlite.prepare('DELETE FROM file_source_refs').run(); // the reference that granted access is gone
  const closed = await call('ana', { goalId: 'g-knn' });
  assert.equal(closed.status, 200);
  for (const leak of ['Row 17', 'Alice', 'fs-ben-1', benReason, 'From the repository', 'repo-0a1b2c3d-x']) assert.equal(closed.text.includes(leak), false, leak);
  const [ben, own] = evidence(closed.body);
  assert.deepEqual([ben.excerpt, ben.reason, ben.withheld, ben.sources], [null, null, 'source_unavailable', [{ kind: 'file', available: false }]]);
  assert.equal(own.excerpt, 'My own notes say k = 3.');
  // The observation itself is kept: the status and counts do not change with access to its source.
  assert.deepEqual(closed.body.progress.counts, open.body.progress.counts);
});

test('deletion_removes_derived_content', async t => {
  const { s, read } = setup(t);
  const before = await read('g-knn');
  const said = 'Majority of the 5 nearest: 3 blue beat 2 red.';
  const { attemptId } = s.submit('g-knn', { day: 20, excerpt: said, obs: [{ criterionId: 'knn-vote', reason: 'Counted the vote correctly.' }] });
  const added = await read('g-knn');
  assert.equal(added.criteria.find(c => c.criterionId === 'knn-vote').status, 'demonstrated_independently');
  assert.equal(JSON.stringify(added).includes(said), true);
  // The learner's submission is deleted. Its assessment and evidence link are left behind, as a partial delete would.
  s.deleteAttempt(attemptId);
  const after = await read('g-knn');
  assert.deepEqual(after, before, 'nothing derived from the deleted answer survives: no cache, no count, no snippet');
  for (const gone of [said, 'Counted the vote', attemptId]) assert.equal(JSON.stringify(after).includes(gone), false, gone);
});

test('trashed canvas hides progress until restored; a purged canvas has none (Q2)', async t => {
  const { sqlite, s, read } = setup(t);
  const before = await read('g-knn');
  sqlite.prepare("INSERT INTO library_trash (org, name, trashed_at) VALUES ('team-ws', ?, '2026-10-20')").run(APP);
  await assert.rejects(read('g-knn'), code('canvas_in_trash'));
  // A Rabbit Hole under the trashed canvas sleeps with it.
  sqlite.prepare("INSERT INTO canvas_dives (org, owner_email, child, parent_app, origin_block_id, dive_json) VALUES ('team-ws', 'ana@test', ?, ?, 'b1', '{}')").run(HOLE, APP);
  const inHole = { ...ANA, app: HOLE };
  s.addGoal('g-hole', [C('knn-k', 'Choose k')], inHole);
  await assert.rejects(read('g-hole', {}, { actor: inHole }), code('canvas_in_trash'));
  sqlite.prepare('DELETE FROM library_trash').run(); // Restore
  assert.deepEqual(await read('g-knn'), before, 'restored with the canvas, nothing lost');
  assert.deepEqual((await read('g-hole', {}, { actor: inHole })).goalRef, { goalId: 'g-hole', scopeVersion: 1 });
  sqlite.prepare('DELETE FROM canvases WHERE name = ?').run(APP);
  await assert.rejects(read('g-knn'), code('canvas_in_trash'));
});

test('transfer-required criterion stays practising until a transfer observation exists (Q1)', async t => {
  const { s, read } = setup(t);
  s.addGoal('g-thr', [C('threshold', 'Use a decision threshold', { requiresTransfer: true })]);
  const row = async () => (await read('g-thr')).criteria[0];
  s.submit('g-thr', { day: 10, obs: [{ criterionId: 'threshold' }] }); // the familiar example, alone
  assert.deepEqual([(await row()).status, (await row()).reason], ['practising', 'transfer_not_shown']);
  s.submit('g-thr', { day: 11, obs: [{ criterionId: 'threshold', application: 'applied', assistance: 'assisted' }] });
  assert.deepEqual([(await row()).status, (await row()).application.status], ['demonstrated_with_help', 'applied']);
  s.submit('g-thr', { day: 12, obs: [{ criterionId: 'threshold', application: 'applied' }] });
  assert.equal((await row()).status, 'demonstrated_independently');
});

test('an empty goal has no denominator', async t => {
  const { s, read } = setup(t);
  s.addGoal('g-empty', []);
  const view = await read('g-empty');
  assert.deepEqual([view.criteria, view.counts, view.pendingAssessments], [[], {}, []]);
});

test('a load error is never an empty history; the route reads only', async t => {
  const { s, call } = setup(t);
  const broken = { ...s.store, evidence: async () => { throw new Error('D1_ERROR: no such table: learn_evidence_links'); } };
  const failed = await call('ana', { goalId: 'g-knn' }, broken);
  assert.deepEqual([failed.status, failed.body], [503, { error: 'progress_unavailable' }]);
  const unwired = await call('ana', { goalId: 'g-knn' }, null); // the default store until learn 0025/0026 are wired
  assert.deepEqual([unwired.status, unwired.body], [503, { error: 'progress_unavailable' }]);
  assert.deepEqual((await call('ana', { goalId: 'g-knn', scopeVersion: 'x' })).body, { error: 'invalid_scopeVersion' });
  assert.deepEqual((await call('ana', {})).body, { error: 'goalId_required' });
  const post = await progressRoute('/api/learn/progress', new Request('https://app.test/api/learn/progress', { method: 'POST', body: '{}' }), {});
  assert.equal(post.status, 405);
});
