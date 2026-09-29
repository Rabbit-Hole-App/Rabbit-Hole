// packages/control-plane/test/learn-grade-store.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb, baseRow } from './learn-grade-fixture.js';
import { pruneLearnGrades, reserveGrade, completeGrade, failGrade, setBaseline, reportRows } from '../src/learn-grade-store.js';

test('reserve inserts once; the same attempt again is a duplicate of that row', async t => {
  const { LEARN_DB } = learnDb(t);
  const env = { LEARN_DB };
  const first = await reserveGrade(env, baseRow());
  const second = await reserveGrade(env, baseRow());
  assert.equal(first.duplicate, false);
  assert.equal(first.existing, null);
  assert.equal(second.duplicate, true);
  assert.equal(second.id, first.id);
  assert.equal(second.existing.status, 'pending');
  const otherLearner = await reserveGrade(env, baseRow({ email: 'someone@test' }));
  assert.equal(otherLearner.duplicate, false);
  assert.notEqual(otherLearner.id, first.id);
});

// Review focus 2: the 2-minute pending window is judged by the database clock.
test('status is done, failed, pending or incomplete', async t => {
  const { sqlite, LEARN_DB } = learnDb(t);
  const env = { LEARN_DB };
  const done = await reserveGrade(env, baseRow({ attempt_id: 'attempt-done' }));
  await completeGrade(env, done.id, { jev: { ideas: [0.9], misconception: 0.1, non_attempt: 0.1, verdict: 'good' }, ms: 120, inputTokens: 300, cost: 0.0000126, model: 'typesafe-ai/jev', generationId: 'gen_1' });
  const failed = await reserveGrade(env, baseRow({ attempt_id: 'attempt-fail' }));
  await failGrade(env, failed.id, { error: 'Jev 401: bad key', ms: 90 });
  const pending = await reserveGrade(env, baseRow({ attempt_id: 'attempt-pend' }));
  sqlite.exec(`UPDATE learn_grades SET created_at = datetime('now', '-30 seconds') WHERE id = ${pending.id}`);
  const stale = await reserveGrade(env, baseRow({ attempt_id: 'attempt-stale' }));
  sqlite.exec(`UPDATE learn_grades SET created_at = datetime('now', '-3 minutes') WHERE id = ${stale.id}`);
  const status = async attemptId => (await reserveGrade(env, baseRow({ attempt_id: attemptId }))).existing.status;
  assert.equal(await status('attempt-done'), 'done');
  assert.equal(await status('attempt-fail'), 'failed');
  assert.equal(await status('attempt-pend'), 'pending');
  assert.equal(await status('attempt-stale'), 'incomplete');
  const row = sqlite.prepare('SELECT * FROM learn_grades WHERE id = ?').get(done.id);
  assert.deepEqual(JSON.parse(row.jev), { ideas: [0.9], misconception: 0.1, non_attempt: 0.1, verdict: 'good' });
  assert.equal(row.jev_generation_id, 'gen_1');
  assert.equal(row.jev_tokens, 300);
});

test('the prune removes rows older than 90 days and keeps the rest', async t => {
  const { sqlite, LEARN_DB } = learnDb(t);
  const env = { LEARN_DB };
  const old = await reserveGrade(env, baseRow({ attempt_id: 'attempt-old1' }));
  const recent = await reserveGrade(env, baseRow({ attempt_id: 'attempt-new1' }));
  sqlite.exec(`UPDATE learn_grades SET created_at = datetime('now', '-91 days') WHERE id = ${old.id}`);
  sqlite.exec(`UPDATE learn_grades SET created_at = datetime('now', '-89 days') WHERE id = ${recent.id}`);
  await pruneLearnGrades(env);
  assert.deepEqual(sqlite.prepare('SELECT id FROM learn_grades').all().map(row => row.id), [recent.id]);
});

test('a baseline is recorded once, and only by the learner who owns the row', async t => {
  const { LEARN_DB } = learnDb(t);
  const env = { LEARN_DB };
  const { id } = await reserveGrade(env, baseRow());
  const who = { id, org: 'team', app: 'demo-app', verdict: 'good', ms: 1000 };
  assert.equal(await setBaseline(env, { ...who, email: 'someone@test' }), 0);
  assert.equal(await setBaseline(env, { ...who, email: 'learner@test' }), 1);
  assert.equal(await setBaseline(env, { ...who, email: 'learner@test', verdict: 'partial' }), 0);
});

test('report rows are the caller\'s canvas rows, with status and age', async t => {
  const { sqlite, LEARN_DB } = learnDb(t);
  const env = { LEARN_DB };
  await reserveGrade(env, baseRow({ attempt_id: 'attempt-mine' }));
  await reserveGrade(env, baseRow({ attempt_id: 'attempt-bench', source: 'bench' }));
  await reserveGrade(env, baseRow({ attempt_id: 'attempt-other', email: 'someone@test' }));
  sqlite.exec(`UPDATE learn_grades SET created_at = datetime('now', '-16 minutes') WHERE attempt_id = 'attempt-mine'`);
  const rows = await reportRows(env, { org: 'team', email: 'learner@test', app: 'demo-app' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'incomplete');
  assert.equal(rows[0].old_enough, 1);
});
