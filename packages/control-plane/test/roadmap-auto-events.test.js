// R6.01: versioned trigger facts. The Auto-suggest preference commits its revisioned fact and learner-scoped outbox event in its own batch; the event fans
// out durably to every unfinished roadmap of the learner; each child re-reads current state. In-memory schema plus migration 0040; no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveAutoSuggest } from '../src/learn-user-settings.js';
import { claimRoadmapEvent, dueRoadmapEvents } from '../src/roadmap/roadmap-events.js';
import { rows } from './roadmap-fixture.js';
import { delivered, doubles, flags, offeredNow, registerAutoHandlers, resetDoubles, T0 } from './roadmap-auto-fixture.js';

registerAutoHandlers();
test.beforeEach(() => resetDoubles());

const actorOf = access => ({ org: access.org, userId: access.actorUserId, app: 'learn', board: 'main' });
const events = (w, kind) => rows(w.sqlite, 'SELECT scope, board_id, roadmap_id, fact_id, fact_revision, processed_at FROM learn_roadmap_outbox WHERE kind = ? ORDER BY fact_revision, board_id', kind);
const pref = w => rows(w.sqlite, 'SELECT auto_suggest FROM learn_user_settings')[0]?.auto_suggest;

test('a change of Auto-suggest commits its fact revision and one learner-scoped event with the preference; repeating a value adds nothing', async t => {
  const { w, access, env } = await delivered(t);
  await saveAutoSuggest(env, actorOf(access), false);
  assert.equal(pref(w), 0);
  assert.deepEqual(rows(w.sqlite, 'SELECT revision, auto_suggest FROM learn_roadmap_settings_facts')[0], { revision: 1, auto_suggest: 0 });
  await saveAutoSuggest(env, actorOf(access), false);
  assert.equal(events(w, 'settings_changed').length, 1, 'same value: no new fact');
  await saveAutoSuggest(env, actorOf(access), true);
  await saveAutoSuggest(env, actorOf(access), false);
  const all = events(w, 'settings_changed');
  assert.deepEqual(all.map(e => [e.scope, e.fact_id, e.fact_revision]), [['learner', 'auto_suggest', 1], ['learner', 'auto_suggest', 2], ['learner', 'auto_suggest', 3]], 'off, on, off are three distinct events');
});

test('flags off, or a database without 0040: the preference still saves exactly as before and nothing roadmap-shaped is written', async t => {
  const { w, access, env } = await delivered(t);
  for (const off of [{ auto: null }, { roadmap: null }]) await saveAutoSuggest(flags(w.env, off), actorOf(access), false);
  assert.equal(pref(w), 0);
  assert.equal(rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_roadmap_settings_facts')[0].n, 0);
  assert.equal(events(w, 'settings_changed').length, 0);
  w.sqlite.exec('DROP TABLE learn_roadmap_settings_facts');
  await saveAutoSuggest(env, actorOf(access), true);
  assert.equal(pref(w), 1, 'the roadmap tables are never a reason to lose the setting');
  assert.equal(events(w, 'settings_changed').length, 0);
});

test('the event expands to every unfinished roadmap of the learner (two canvases), resumable after a crash, and the parent completes last', async t => {
  const { w, access, env, o } = await delivered(t);
  const second = { ...access, boardId: 'lb_board00000000000012' };
  w.sqlite.prepare("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at) VALUES (?, 'team', ?, 'learn', 'second', '{}', '2026-11-06')").run(second.boardId, access.actorEmail);
  w.sqlite.prepare(`INSERT INTO learn_roadmaps SELECT 'rm_second', org, owner_user_id, owner_email, ?, app, state, revision, plan_version, accepted_plan_version, depth, practice_mode, source_key, source_rev, scope_json, scope_fingerprint, scope_snapshot_key, language, ceiling, delivered_count, mode, mode_revision, paused_reason, policy_version, created_at, updated_at, ended_at FROM learn_roadmaps WHERE id = ?`).run(second.boardId, o.roadmapId);
  await saveAutoSuggest(env, actorOf(access), false); // the fan-out ran inline on the write
  const children = events(w, 'autosuggest_changed');
  assert.deepEqual(children.map(c => c.roadmap_id).sort(), [o.roadmapId, 'rm_second'].sort(), 'both canvases get the change');
  assert.ok(children.every(c => c.scope === 'roadmap' && c.fact_revision === 1));
  assert.deepEqual(doubles.kicks.map(k => k.boardId).sort(), [access.boardId, second.boardId].sort(), 'each board is woken');
  assert.ok(events(w, 'settings_changed')[0].processed_at, 'the parent is complete only after the expansion');

  // Crash recovery: parent pending again with one child already written; the next run writes only the missing child.
  w.sqlite.prepare("DELETE FROM learn_roadmap_outbox WHERE kind = 'autosuggest_changed' AND roadmap_id = 'rm_second'").run();
  w.sqlite.prepare("UPDATE learn_roadmap_outbox SET processed_at = NULL, lease_token = NULL, lease_until = NULL WHERE kind = 'settings_changed'").run();
  await saveAutoSuggest(env, actorOf(access), false); // same value: no new fact, but the pending parent is due and is run
  assert.equal(events(w, 'autosuggest_changed').length, 2, 'one child existed, one was added, none duplicated');
});

test('Auto-suggest off then on from another device: the canvas gets exactly one proposal, never a duplicate', async t => {
  const { w, access, env, o } = await delivered(t);
  // Auto-suggest is off while the cards are delivered: the delivery event finds nothing to do.
  doubles.autoSuggest = async () => false;
  await saveAutoSuggest(env, actorOf(access), false);
  const { runDueRoadmapEvents } = await import('../src/roadmap/roadmap-events.js');
  await runDueRoadmapEvents(env, { now: T0 + 5 });
  assert.equal(offeredNow(w, o.roadmapId).length, 0);
  // Back on from "the other device": the child events run through the same runner and re-read the preference.
  doubles.autoSuggest = async () => true;
  await saveAutoSuggest(env, actorOf(access), true);
  await runDueRoadmapEvents(env, { now: T0 + 10 });
  await runDueRoadmapEvents(env, { now: T0 + 11 });
  assert.equal(offeredNow(w, o.roadmapId).length, 1);
  assert.equal(rows(w.sqlite, "SELECT COUNT(*) AS n FROM learn_step_proposals WHERE state = 'pending'")[0].n, 1, 'no duplicate offers');
  const revisions = events(w, 'autosuggest_changed').map(e => e.fact_revision);
  assert.deepEqual([...new Set(revisions)].sort(), [1, 2]);
});

test('an event for an older preference revision is dropped: a newer write has its own event', async t => {
  const { w, access, env, o } = await delivered(t);
  await saveAutoSuggest(env, actorOf(access), false);
  await saveAutoSuggest(env, actorOf(access), true);
  // Rewind the clock of the world: the revision-1 child is pending while revision 2 is current.
  w.sqlite.prepare("UPDATE learn_roadmap_outbox SET processed_at = NULL, lease_token = NULL, lease_until = NULL WHERE kind = 'autosuggest_changed' AND fact_revision = 1").run();
  w.sqlite.prepare("UPDATE learn_roadmap_outbox SET processed_at = ? WHERE kind = 'autosuggest_changed' AND fact_revision = 2").run(T0);
  w.sqlite.prepare("UPDATE learn_roadmap_outbox SET processed_at = ? WHERE kind = 'card_delivered'").run(T0);
  const { runDueRoadmapEvents } = await import('../src/roadmap/roadmap-events.js');
  await runDueRoadmapEvents(env, { now: T0 + 20 });
  assert.equal(offeredNow(w, o.roadmapId).length, 0, 'the stale revision-1 event did nothing');
  assert.ok(events(w, 'autosuggest_changed').every(e => e.processed_at));
});

test('a crash after the claim but before the effect loses nothing: the lapsed lease is claimable and the replay offers once', async t => {
  const { w, access, env, o } = await delivered(t);
  const [event] = await dueRoadmapEvents(w.LEARN_DB, { now: T0 + 1, scope: { org: access.org, ownerUserId: access.actorUserId, boardId: access.boardId } });
  assert.equal(event.kind, 'card_delivered');
  assert.equal(await claimRoadmapEvent(w.LEARN_DB, { eventId: event.event_id, leaseToken: 'crashed', leaseUntil: T0 + 60, now: T0 + 1 }), true);
  const { runDueRoadmapEvents } = await import('../src/roadmap/roadmap-events.js');
  assert.equal(await runDueRoadmapEvents(env, { now: T0 + 10 }), 0, 'held: nobody else runs it');
  assert.equal(await runDueRoadmapEvents(env, { now: T0 + 70 }), 1, 'lapsed: replayed');
  assert.equal(offeredNow(w, o.roadmapId).length, 1);
});

test('flag off: a pending learner event is consumed without any fan-out, and the scheduled scan does no R6 work', async t => {
  const { w, access, env, o } = await delivered(t);
  await saveAutoSuggest(env, actorOf(access), false); // flags on: parent + children exist
  w.sqlite.prepare("DELETE FROM learn_roadmap_outbox WHERE kind = 'autosuggest_changed'").run();
  w.sqlite.prepare("UPDATE learn_roadmap_outbox SET processed_at = NULL, lease_token = NULL, lease_until = NULL WHERE kind = 'settings_changed'").run();
  doubles.kicks.length = 0;
  const { runDueRoadmapEvents } = await import('../src/roadmap/roadmap-events.js');
  await runDueRoadmapEvents(flags(w.env, { auto: null }), { now: T0 + 20 });
  assert.equal(events(w, 'autosuggest_changed').length, 0, 'no children without ROADMAP_AUTO_ENABLED');
  assert.equal(offeredNow(w, o.roadmapId).length, 0);
  assert.equal(doubles.kicks.length, 0);
});
