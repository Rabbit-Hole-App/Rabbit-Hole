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

test('Keep upserts the question vector; Dismiss withdraws it', async () => {
  const { db, env } = fixture();
  // the shim again, with first() support this test needs
  const prepare = sql => ({ bind: (...args) => ({
    run: async () => { const info = db.prepare(sql).run(...args); return { meta: { changes: info.changes } }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
  }) });
  env.DB = { prepare };
  env.AI = { run: async (model, { text }) => ({ data: text.map(() => [0.5, 0.5]) }) };
  env.MOMENTS = { ops: [], upsert: async rows => env.MOMENTS.ops.push(['upsert', rows]), deleteByIds: async ids => env.MOMENTS.ops.push(['delete', ids]) };
  await setMomentFeedback(env, 'workspace-a', 1, true);
  const [kind, rows] = env.MOMENTS.ops.at(-1);
  assert.equal(kind, 'upsert');
  assert.equal(rows[0].id, 'q:1');
  assert.equal(rows[0].namespace, 'questions:workspace-a');
  assert.deepEqual(rows[0].metadata, { momentId: 1 });
  await setMomentFeedback(env, 'workspace-a', 1, false);
  assert.deepEqual(env.MOMENTS.ops.at(-1), ['delete', ['q:1']]);
});

// C1 (docs/features/learn-cleanup.md): on the dev worker Keep/Dismiss goes through
// learnMomentsDb, which is LEARN_DB there, for every app kind the route authorizes.
// small-learn-dev has no learn_moments table yet, so a real dev press answers 400 and
// the card ignores it; this test adds the table to its own sqlite to see where the UPDATE lands.
test('dev Keep/Dismiss never touches the live DB, whatever the app kind', async t => {
  const { momentFeedback } = await import('../src/learn-board.js');
  const { learnDb } = await import('./learn-grade-fixture.js');
  const { liveDb, liveRuns, readOnlyControlPlane } = await import('./live-storage-spy.js');
  const { sqlite, LEARN_DB } = learnDb(t);
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(1,'team','repo-example','owner@test','example/project','main','${'a'.repeat(40)}','ready');
    INSERT INTO canvases(org,name,owner_email,title,project) VALUES('team','canvas-0a1b2c3d','owner@test','Standalone',NULL),('team','canvas-1a2b3c4d','owner@test','In a project','repo-example')`);
  const live = liveDb(), runs = liveRuns(), control = readOnlyControlPlane({ apps: { counter: { kind: 'server', hosting: 'fly' } } });
  const env = { DB: live, RUNS: runs, LEARN_DB, CONTROL_PLANE: control };
  const press = app => momentFeedback(new Request('https://dev.test/api/learn/moment-feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app, momentId: 1, accepted: true }) }), env);
  for (const app of ['canvas-0a1b2c3d', 'canvas-1a2b3c4d', 'repo-example', 'counter']) assert.equal((await press(app)).status, 400, `${app}: no learn_moments table in small-learn-dev yet`);
  sqlite.exec(`CREATE TABLE learn_moments (id INTEGER PRIMARY KEY, org TEXT NOT NULL, question TEXT NOT NULL, video_id TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER, confidence REAL, accepted INTEGER, reason TEXT);
    INSERT INTO learn_moments(org,question,video_id,start) VALUES('team','how does backprop work','Ilg3gGewQ5U',120)`);
  for (const app of ['canvas-0a1b2c3d', 'canvas-1a2b3c4d', 'repo-example', 'counter']) {
    assert.deepEqual(await (await press(app)).json(), { updated: true }, app);
  }
  assert.equal(sqlite.prepare('SELECT accepted FROM learn_moments WHERE id = 1').get().accepted, 1);
  assert.deepEqual([live.calls, runs.calls, control.refused], [[], [], []]);
});
