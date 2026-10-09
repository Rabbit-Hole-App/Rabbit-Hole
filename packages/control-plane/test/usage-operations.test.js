// learn-migrations/0016-usage-operations.sql: additive, re-runnable, mirrored in repository-schema.sql, and its
// constraints carry the admission rules the Spend lane's metered() relies on. On node:sqlite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { learnDb } from './learn-grade-fixture.js';

const migration = readFileSync(new URL('../learn-migrations/0016-usage-operations.sql', import.meta.url), 'utf8');
const lf = s => s.replace(/\r\n/g, '\n');

test('0016 is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const fresh = new DatabaseSync(':memory:'); t.after(() => fresh.close());
  fresh.exec(migration); fresh.exec(migration);
  const names = fresh.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  assert.deepEqual(names, ['usage_operations', 'usage_operations_category', 'usage_operations_day', 'usage_operations_inflight', 'usage_operations_user']);
  const { sqlite } = learnDb(t);
  for (const n of names) assert.equal(lf(sqlite.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(n).sql), lf(fresh.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(n).sql), n);
  assert.ok(!/shared_ask_events/.test(migration.replace(/--.*$/gm, '')), 'no change to the existing admission log');
});

test('an op_id is admitted once; the status is one of five; unknown cost stays NULL', t => {
  const { sqlite } = learnDb(t);
  const admit = sqlite.prepare("INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at) VALUES (?, 'u1', 'o', 'tutor_plan', ?, 1000, 1120)");
  admit.run('op-1', 'admitted');
  assert.throws(() => admit.run('op-1', 'admitted'), /UNIQUE constraint failed/, 'a replay never admits twice');
  assert.throws(() => admit.run('op-2', 'pending'), /CHECK constraint failed/);
  assert.equal(sqlite.prepare("SELECT cost_usd FROM usage_operations WHERE op_id = 'op-1'").get().cost_usd, null);
});

test('one INSERT ... SELECT ... WHERE admits under the person, in-flight and platform caps, and refuses the last slot twice', t => {
  // The shape metered() is expected to use: every cap in one statement, so D1's single writer makes it atomic.
  const { sqlite } = learnDb(t);
  const admit = sqlite.prepare(`INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at)
    SELECT ?1, ?2, 'o', 'tutor_plan', 'admitted', ?3, ?3 + 120
    WHERE (SELECT COUNT(*) FROM usage_operations WHERE user_id = ?2 AND admitted_at > ?3 - 3600) < ?4
      AND (SELECT COUNT(*) FROM usage_operations WHERE user_id = ?2 AND status = 'admitted' AND deadline_at > ?3) < ?5
      AND (SELECT COUNT(*) FROM usage_operations WHERE admitted_at > ?3 - 86400) < ?6`);
  const caps = (op, user, now) => admit.run(op, user, now, 60, 2, 3).changes;
  assert.equal(caps('a', 'u1', 1000), 1);
  assert.equal(caps('b', 'u1', 1001), 1);
  assert.equal(caps('c', 'u1', 1002), 0, 'two in flight: the third waits');
  assert.equal(caps('d', 'u2', 1003), 1, 'another person still has room');
  assert.equal(caps('e', 'u3', 1004), 0, 'the platform day cap (3) is reached');
  const plan = sqlite.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM usage_operations WHERE user_id = 'u1' AND status = 'admitted' AND deadline_at > 1").all().map(r => r.detail).join(' ');
  assert.match(plan, /usage_operations_inflight/, 'the in-flight count uses its index');
});
