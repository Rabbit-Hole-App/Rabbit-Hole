// packages/control-plane/test/learn-goal-archive-backfill.test.js
// Tutor cleanup 10 ("Regression check for the D1 ordering"), post-removal form (P6a). Until P6a a goal's archived status came
// from a join to its journey; the join is gone, so the goal reads archived only once the owner script's backfill has written
// the status to the goal itself. The SQL is the script's own (scripts/learn-retire-tutor-data.mjs), run on node:sqlite.
// The journey table is rebuilt here with the two columns the script reads, so this file survives the P6b table drop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { readCoachingState } from '../src/learn-coaching-store.js';
import { backfillSql, verifySql } from '../../../scripts/learn-retire-tutor-data.mjs';

const A = { org: 'ws', userId: 'u-ana', app: 'canvas-0000aaaa', board: 'main' };

function world(t) {
  const { sqlite, LEARN_DB } = learnDb(t);
  sqlite.exec('DROP TABLE IF EXISTS learning_journeys; CREATE TABLE learning_journeys (id TEXT PRIMARY KEY, archived_at TEXT);');
  const journey = (id, archived = null) => sqlite.prepare('INSERT INTO learning_journeys (id, archived_at) VALUES (?, ?)').run(id, archived);
  const goal = (journeyId, lifecycle = 'open') => sqlite.prepare(`INSERT INTO learn_goals (id, org, owner_user_id, app, board, label, outcome, origin, scope_version, lifecycle, journey_id, activity_id, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '', 'journey', 0, ?, ?, NULL, 0, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`).run(`lg_${journeyId}`, A.org, A.userId, A.app, A.board, journeyId, lifecycle, journeyId);
  const verify = () => sqlite.prepare(verifySql()).get().unarchived_goals;
  const lifecycles = async () => Object.fromEntries((await readCoachingState({ LEARN_DB }, A)).goals.map(g => [g.label, g.lifecycle]));
  return { sqlite, journey, goal, verify, lifecycles };
}

test('P6a: with the join gone a goal of an archived journey reads archived only after the backfill; verify counts it before and not after', async t => {
  const { sqlite, journey, goal, verify, lifecycles } = world(t);
  journey('lj_old', '2026-09-01T00:00:00Z'); goal('lj_old');
  journey('lj_done', '2026-09-02T00:00:00Z'); goal('lj_done', 'completed');
  journey('lj_live'); goal('lj_live');
  assert.deepEqual(await lifecycles(), { lj_old: 'open', lj_done: 'completed', lj_live: 'open' }, 'no backfill yet: nothing derives archived from the journey any more');
  assert.equal(verify(), 2);
  sqlite.exec(backfillSql());
  assert.equal(verify(), 0);
  assert.deepEqual(await lifecycles(), { lj_old: 'archived', lj_done: 'archived', lj_live: 'open' }, 'a goal of a live journey is untouched');
  assert.equal(sqlite.prepare(backfillSql()).run().changes, 0, 'idempotent: a second run changes nothing');
});

test('P6a: a goal with no journey row, and a coaching goal, are never touched by the backfill', async t => {
  const { sqlite, goal, verify, lifecycles } = world(t);
  goal('lj_missing'); // journey row long gone
  sqlite.exec(backfillSql());
  assert.equal(verify(), 0);
  assert.deepEqual(await lifecycles(), { lj_missing: 'open' });
});
