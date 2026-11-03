// The deletion tool's SQL on a real schema: exactly that person's rows go, in every table that holds them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { countSql, deleteSql, learnerKeys } from './analytics-delete.mjs';
import { accountKey, LEARNER_TABLES, visitorKey } from '../packages/control-plane/src/publication-analytics-purge.js';

const VISITOR = '11111111-2222-4333-8444-555555555555';
const seed = (db, key) => {
  db.prepare("INSERT INTO publication_events VALUES (?, 'o', 'c', ?, ?, 'open', 'now')").run(`e-${key}`, `s-${key}`, key);
  db.prepare("INSERT INTO publication_sessions (session_key, org, canvas, learner_key, started_at) VALUES (?, 'o', 'c', ?, 'now')").run(`s-${key}`, key);
  db.prepare("INSERT INTO publication_learners (org, canvas, learner_key, first_seen_at, last_seen_at) VALUES ('o', 'c', ?, 'now', 'now')").run(key);
  db.prepare("INSERT INTO publication_learner_days (org, canvas, learner_key, day, segment) VALUES ('o', 'c', ?, '2026-11-02', 1)").run(key);
  db.prepare("INSERT INTO publication_learner_items (org, canvas, learner_key, day, segment, kind, item_id) VALUES ('o', 'c', ?, '2026-11-02', 1, 'card_seen', 'b1')").run(key);
};
const schema = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../packages/control-plane/learn-migrations/0035-publication-analytics.sql', import.meta.url), 'utf8'));
  return db;
};

test('deletes one account and one visitor in every table and leaves everyone else and the counters; the count SQL reports it', async () => {
  const db = schema();
  const ben = await accountKey({ userId: 'u-ben' }), anon = await visitorKey(VISITOR), cara = await accountKey({ userId: 'u-cara' });
  for (const key of [ben, anon, cara]) seed(db, key);
  db.exec("INSERT INTO publication_board_days (org, canvas, day, opens) VALUES ('o', 'c', '2026-11-02', 3)");
  const count = keys => db.prepare(countSql(keys)).get().analytics_rows;
  const keys = await learnerKeys({ userId: 'u-ben', visitor: VISITOR });
  assert.deepEqual(keys, [ben, anon]);
  assert.equal(count(keys), LEARNER_TABLES.length * 2);
  db.exec(deleteSql(keys));
  assert.equal(count(keys), 0);
  assert.equal(count([cara]), LEARNER_TABLES.length);
  assert.equal(db.prepare('SELECT opens FROM publication_board_days').get().opens, 3);
  db.close();
});
test('refuses what is not an identifier, so nothing unchecked reaches SQL', async () => {
  await assert.rejects(learnerKeys({}), /Name an account or a visitor/);
  await assert.rejects(learnerKeys({ visitor: "x'; DROP TABLE users; --" }), /not an rh-visitor-id/);
  await assert.rejects(learnerKeys({ userId: "a' OR '1'='1" }), /not a users.id/);
  await assert.rejects(learnerKeys({ email: "a'@b" }), /not an address/);
  assert.throws(() => countSql(['nope']), /not a learner key/);
});
test('the command line prints SQL and nothing else, touching no database', () => {
  const out = execFileSync(process.execPath, [fileURLToPath(new URL('./analytics-delete.mjs', import.meta.url)), 'delete', '--visitor', VISITOR], { encoding: 'utf8', env: { PATH: '' } });
  assert.equal(out.trim().split('\n').length, LEARNER_TABLES.length);
  assert.ok(out.split('\n').filter(Boolean).every(line => line.startsWith('DELETE FROM publication_')));
  assert.ok(!out.includes(VISITOR), 'the identifier itself is not in the SQL');
});
