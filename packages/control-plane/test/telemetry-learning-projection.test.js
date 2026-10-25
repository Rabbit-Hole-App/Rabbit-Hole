// Learning evidence projections: the Tutor's own LEARN_DB records (repository-schema.sql: learn 0025 and 0026) copied into the
// telemetry database as ids, enums and counts. Fixture evidence: synthetic learner, goal and answers; a real learner's records
// and the deployed lifecycle are not exercised here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { projectLearning } from '../src/telemetry-learning-projection.js';
import { d1, migration, telemetryDb } from './telemetry-fixture.js';

const SECRET_ANSWER = 'My private answer about tides and my thesis', SECRET_LABEL = 'Explain tides to my private study group', SECRET_REASON = 'The learner wrote that they were confused about their own thesis';
const NOW_S = Math.floor(Date.parse('2026-10-23T12:00:00Z') / 1000), NOW_MS = NOW_S * 1000;
const iso = seconds => new Date(seconds * 1000).toISOString();

function learnDb(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(migration('repository-schema.sql'));
  const q = (sql, ...args) => sqlite.prepare(sql).run(...args);
  const seed = {
    goal: () => {
      q("INSERT INTO learn_goals (id, org, owner_user_id, app, board, label, outcome, origin, created_at, updated_at) VALUES ('goal-1', 'org-1', 'user-1', 'canvas-1', 'main', ?, 'PRIVATE OUTCOME', 'coaching', ?, ?)", SECRET_LABEL, iso(NOW_S - 9000), iso(NOW_S - 9000));
      q("INSERT INTO learn_goal_criteria (goal_id, scope_version, criterion_id, version, position, label, requirement, requires_reasoning, requires_transfer, rubric_version, created_at) VALUES ('goal-1', 1, 'crit-1', 1, 0, ?, 'PRIVATE REQUIREMENT', 1, 1, 'rubric-3', ?)", SECRET_LABEL, iso(NOW_S - 9000));
    },
    attempt: (id, at, assistance = 'none') => q(`INSERT INTO learn_attempts (id, org, owner_user_id, app, board, goal_id, activity_id, activity_revision, submission_key, response_kind, content_json, content_hash, criterion_refs_json, source_refs_json, assistance, assistance_refs_json, submitted_at)
      VALUES (?, 'org-1', 'user-1', 'canvas-1', 'main', 'goal-1', 'act-1', 2, ?, 'text', ?, 'h', '[]', '[{"kind":"file","id":"f1"},{"kind":"file","id":"f2"}]', ?, ?, ?)`, id, `key-${id}`, JSON.stringify({ text: SECRET_ANSWER }), assistance, assistance === 'assisted' ? '["hint-1"]' : '[]', iso(at)),
    assessment: (id, attempt, at, over = {}) => q(`INSERT INTO learn_assessments (id, attempt_id, org, owner_user_id, request_key, status, route, reason, rubric_version, evaluator_version, provenance_json, created_at, updated_at)
      VALUES (?, ?, 'org-1', 'user-1', 'submit', ?, ?, ?, 'rubric-3', 'tutor-protocol-2', ?, ?, ?)`, id, attempt, over.status ?? 'completed', over.route ?? 'jev', over.reason ?? SECRET_REASON,
      JSON.stringify({ route: over.route ?? 'jev', calls: [{ role: 'jev', servedModel: 'jev-1.13.0', latencyMs: 400, costUsd: 0.001, outcome: 'ok' }, { role: 'tutor_evaluator', servedModel: 'claude-opus-5-5', latencyMs: 2100, outcome: 'ok' }], prompt: SECRET_ANSWER }), iso(at), iso(at)),
    observation: (id, assessment, attempt, at, over = {}) => q(`INSERT INTO learn_observations (id, assessment_id, attempt_id, org, owner_user_id, goal_id, criterion_id, criterion_version, fit, reasoning, assistance, validity, conflict, application, retention_of, reason, observed_at)
      VALUES (?, ?, ?, 'org-1', 'user-1', 'goal-1', 'crit-1', 1, ?, 'supported', ?, ?, 0, ?, ?, ?, ?)`, id, assessment, attempt, over.fit ?? 'met', over.assistance ?? 'none', over.validity ?? 'valid', over.application ?? 'not_assessed', over.retentionOf ?? null, SECRET_REASON, iso(at)),
  };
  return { sqlite, db: d1(sqlite), q, seed };
}
const dump = sqlite => JSON.stringify(['learning_attempts', 'learning_assessments', 'learning_observations', 'learning_criteria'].map(table => sqlite.prepare(`SELECT * FROM ${table}`).all()));
const one = (sqlite, sql) => ({ ...sqlite.prepare(sql).get() });

test('attempts, assessments, observations and criteria are copied as ids, enums and counts; no answer, label, requirement, reason or prompt', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  learn.seed.goal(); learn.seed.attempt('att-1', NOW_S - 3000, 'assisted'); learn.seed.assessment('asm-1', 'att-1', NOW_S - 2900); learn.seed.observation('obs-1', 'asm-1', 'att-1', NOW_S - 2900, { assistance: 'assisted', application: 'applied' });
  assert.deepEqual(await projectLearning(learn.db, telemetry.db, { now: NOW_MS }), { copied: { learning_attempts: 1, learning_assessments: 1, learning_observations: 1, learning_criteria: 1 }, done: true });
  const text = dump(telemetry.sqlite);
  for (const secret of [SECRET_ANSWER, SECRET_LABEL, SECRET_REASON, 'PRIVATE OUTCOME', 'PRIVATE REQUIREMENT', 'hint-1', 'f1']) assert.equal(text.includes(secret), false, secret);
  assert.deepEqual(one(telemetry.sqlite, 'SELECT user_ref, canvas_ref, goal_id, assistance, assistance_ref_count, source_ref_count, response_kind FROM learning_attempts'),
    { user_ref: 'user-1', canvas_ref: 'canvas-1', goal_id: 'goal-1', assistance: 'assisted', assistance_ref_count: 1, source_ref_count: 2, response_kind: 'text' });
  assert.deepEqual(one(telemetry.sqlite, 'SELECT status, route, reason, rubric_version, evaluator_version, escalated, call_count, call_ms, served_models FROM learning_assessments'),
    { status: 'completed', route: 'jev', reason: null, rubric_version: 'rubric-3', evaluator_version: 'tutor-protocol-2', escalated: 1, call_count: 2, call_ms: 2500, served_models: 'jev-1.13.0,claude-opus-5-5' });
  assert.deepEqual(one(telemetry.sqlite, 'SELECT fit, reasoning, assistance, validity, conflict, application, criterion_id, criterion_version FROM learning_observations'),
    { fit: 'met', reasoning: 'supported', assistance: 'assisted', validity: 'valid', conflict: 0, application: 'applied', criterion_id: 'crit-1', criterion_version: 1 });
  assert.deepEqual(one(telemetry.sqlite, 'SELECT user_ref, requires_reasoning, requires_transfer, rubric_version FROM learning_criteria'), { user_ref: 'user-1', requires_reasoning: 1, requires_transfer: 1, rubric_version: 'rubric-3' });
});

test('replay and a full rebuild change nothing, and LEARN_DB is only read', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  learn.seed.goal(); learn.seed.attempt('att-1', NOW_S - 3000); learn.seed.assessment('asm-1', 'att-1', NOW_S - 2900); learn.seed.observation('obs-1', 'asm-1', 'att-1', NOW_S - 2900);
  const before = JSON.stringify(learn.sqlite.prepare('SELECT * FROM learn_observations').all());
  await projectLearning(learn.db, telemetry.db, { now: NOW_MS });
  const once = dump(telemetry.sqlite);
  await projectLearning(learn.db, telemetry.db, { now: NOW_MS + 1000 });
  await projectLearning(learn.db, telemetry.db, { now: NOW_MS + 2000, from: 0 });
  assert.equal(dump(telemetry.sqlite).replace(/"projected_at":\d+/g, ''), once.replace(/"projected_at":\d+/g, ''));
  assert.equal(JSON.stringify(learn.sqlite.prepare('SELECT * FROM learn_observations').all()), before);
  assert.equal(telemetry.sqlite.prepare('SELECT COUNT(*) AS n FROM learning_observations').get().n, 1, 'counted once');
});

test('a later settlement and a later dispute are picked up: an assessment that completes, a recent observation that is disputed', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  learn.seed.goal(); learn.seed.attempt('att-1', NOW_S - 3000); learn.seed.assessment('asm-1', 'att-1', NOW_S - 2900, { status: 'pending', route: null });
  learn.seed.observation('obs-1', 'asm-1', 'att-1', NOW_S - 2900);
  await projectLearning(learn.db, telemetry.db, { now: NOW_MS });
  assert.equal(one(telemetry.sqlite, 'SELECT status FROM learning_assessments').status, 'pending');
  learn.q("UPDATE learn_assessments SET status = 'completed', route = 'larger', updated_at = ? WHERE id = 'asm-1'", iso(NOW_S - 100));
  learn.q("UPDATE learn_observations SET validity = 'disputed', conflict = 1 WHERE id = 'obs-1'");
  await projectLearning(learn.db, telemetry.db, { now: NOW_MS + 5000 });
  assert.deepEqual(one(telemetry.sqlite, 'SELECT status, route FROM learning_assessments'), { status: 'completed', route: 'larger' });
  assert.deepEqual(one(telemetry.sqlite, 'SELECT validity, conflict FROM learning_observations'), { validity: 'disputed', conflict: 1 });
});

test('an observation older than the sweep window changes only on a full rebuild, which is documented', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  learn.seed.goal(); learn.seed.attempt('att-1', NOW_S - 40 * 86400); learn.seed.assessment('asm-1', 'att-1', NOW_S - 40 * 86400); learn.seed.observation('obs-1', 'asm-1', 'att-1', NOW_S - 40 * 86400);
  learn.seed.attempt('att-2', NOW_S - 20 * 86400); learn.seed.assessment('asm-2', 'att-2', NOW_S - 20 * 86400);
  learn.seed.observation('obs-2', 'asm-2', 'att-2', NOW_S - 20 * 86400); // newer, so obs-1 is no longer at the cursor
  await projectLearning(learn.db, telemetry.db, { now: NOW_MS });
  learn.q("UPDATE learn_observations SET validity = 'superseded' WHERE id = 'obs-1'");
  await projectLearning(learn.db, telemetry.db, { now: NOW_MS + 1000 });
  const validity = () => one(telemetry.sqlite, "SELECT validity FROM learning_observations WHERE id = 'obs-1'").validity;
  assert.equal(validity(), 'valid');
  await projectLearning(learn.db, telemetry.db, { now: NOW_MS + 2000, from: 0 });
  assert.equal(validity(), 'superseded');
});

test('a LEARN_DB without the coaching or attempt tables reports those sources as null and does not fail', async t => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('CREATE TABLE unrelated (id TEXT)');
  const telemetry = telemetryDb(t);
  assert.deepEqual(await projectLearning(d1(sqlite), telemetry.db, { now: NOW_MS }), { copied: { learning_attempts: null, learning_assessments: null, learning_observations: null, learning_criteria: null }, done: true });
});

test('a bounded pass says when more remain, and the cursor advances', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  learn.seed.goal();
  for (let i = 0; i < 3; i++) learn.seed.attempt(`att-${i}`, NOW_S - 3000 + i);
  assert.equal((await projectLearning(learn.db, telemetry.db, { limit: 2, now: NOW_MS })).done, false);
  let passes = 1;
  while (!(await projectLearning(learn.db, telemetry.db, { limit: 2, now: NOW_MS })).done) assert.ok(++passes < 5, 'the cursor advances');
  assert.equal(telemetry.sqlite.prepare('SELECT COUNT(*) AS n FROM learning_attempts').get().n, 3);
});
