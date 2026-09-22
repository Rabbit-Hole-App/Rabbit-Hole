import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { setMomentFeedback } from '../src/learn-youtube.js';

// D1 on sqlite, the way learn-chat.test.js does it: enough shape for one UPDATE.
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE learn_moments (
    id INTEGER PRIMARY KEY, org TEXT NOT NULL, question TEXT NOT NULL, video_id TEXT NOT NULL,
    start INTEGER NOT NULL, end INTEGER, confidence REAL, accepted INTEGER, reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.prepare('INSERT INTO learn_moments (org, question, video_id, start, end) VALUES (?, ?, ?, ?, ?)')
    .run('workspace-a', 'how does backprop work', 'Ilg3gGewQ5U', 120, 210);
  const env = { DB: { prepare: sql => ({ bind: (...args) => ({
    run: async () => { const info = db.prepare(sql).run(...args); return { meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }; },
  }) }) } };
  return { db, env };
}

test('a keep and a dismiss both land, latest wins, scoped to the workspace', async () => {
  const { db, env } = fixture();
  assert.deepEqual(await setMomentFeedback(env, 'workspace-a', 1, true), { updated: true });
  assert.equal(db.prepare('SELECT accepted FROM learn_moments WHERE id = 1').get().accepted, 1);
  assert.deepEqual(await setMomentFeedback(env, 'workspace-a', 1, false), { updated: true });
  assert.equal(db.prepare('SELECT accepted FROM learn_moments WHERE id = 1').get().accepted, 0);
  assert.deepEqual(await setMomentFeedback(env, 'workspace-b', 1, true), { updated: false }, 'another workspace cannot grade this row');
  assert.equal(db.prepare('SELECT accepted FROM learn_moments WHERE id = 1').get().accepted, 0);
});

test('garbage never reaches the database', async () => {
  const { env } = fixture();
  await assert.rejects(() => setMomentFeedback(env, 'workspace-a', 'DROP TABLE', true), /Invalid moment id/);
  await assert.rejects(() => setMomentFeedback(env, 'workspace-a', 0, true), /Invalid moment id/);
  await assert.rejects(() => setMomentFeedback(env, 'workspace-a', 1.5, true), /Invalid moment id/);
  await assert.rejects(() => setMomentFeedback(env, 'workspace-a', 1, 'yes'), /true or false/);
});
