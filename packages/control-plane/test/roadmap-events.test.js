// R4.05: the durable outbox, leases, the RoadmapJobs alarm and recovery of a commit-before-notify gap, with a fake clock and a fake object state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptRoadmapStep } from '../src/roadmap/roadmap-store.js';
import { setMode } from '../src/roadmap/roadmap-lifecycle.js';
import { claimRoadmapEvent, commitRoadmapEventEffect, dueRoadmapEvents, retryRoadmapEvent, nextRoadmapWake, boardsWithDueEvents, registerRoadmapHandler, BACKOFF_SECONDS } from '../src/roadmap/roadmap-events.js';
import { RoadmapJobs, kickRoadmapJobs } from '../src/roadmap/roadmap-jobs.js';
import { world, offered, rows } from './roadmap-fixture.js';

const T0 = Math.floor(Date.now() / 1000);
const accepted = async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  await acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001', now: T0 });
  const [event] = rows(w.sqlite, 'SELECT * FROM learn_roadmap_outbox');
  return { w, o, event };
};
const objectState = () => { const calls = []; let alarm = null; const store = new Map();
  return { calls, get alarm() { return alarm; }, storage: { get: async k => store.get(k), put: async (k, v) => store.set(k, v), setAlarm: async at => { alarm = at; calls.push(['set', at]); }, deleteAlarm: async () => { alarm = null; calls.push(['delete']); }, getAlarm: async () => alarm } }; };
const scopeOf = w => ({ org: w.access.org, ownerUserId: w.access.actorUserId, boardId: w.access.boardId });

test('a lease is a claim, not completion: a held lease blocks others, a lapsed one is claimable again, a late commit changes nothing', async t => {
  const { w, event } = await accepted(t);
  const db = w.LEARN_DB;
  assert.equal(await claimRoadmapEvent(db, { eventId: event.event_id, leaseToken: 'A', leaseUntil: T0 + 60, now: T0 }), true);
  assert.equal(await claimRoadmapEvent(db, { eventId: event.event_id, leaseToken: 'B', leaseUntil: T0 + 60, now: T0 + 10 }), false, 'held');
  assert.equal((await dueRoadmapEvents(db, { now: T0 + 10 })).length, 0);
  // A crashed after claiming. At lease expiry the event is due again and B takes it over.
  assert.equal(await claimRoadmapEvent(db, { eventId: event.event_id, leaseToken: 'B', leaseUntil: T0 + 200, now: T0 + 61 }), true);
  let applied = 0;
  const effect = guard => [w.LEARN_DB.prepare(`UPDATE learn_roadmaps SET paused_reason = 'x' WHERE id = ? AND ${guard.and}`).bind(event.roadmap_id, ...guard.binds)];
  assert.equal(await commitRoadmapEventEffect(db, { eventId: event.event_id, leaseToken: 'A', effects: g => { applied++; return effect(g); }, now: T0 + 62 }), false, 'A\'s late commit is refused');
  assert.equal(rows(w.sqlite, 'SELECT paused_reason FROM learn_roadmaps')[0].paused_reason, null, 'and its effect did not apply');
  assert.equal(await commitRoadmapEventEffect(db, { eventId: event.event_id, leaseToken: 'B', effects: effect, now: T0 + 63 }), true);
  assert.equal(rows(w.sqlite, 'SELECT paused_reason FROM learn_roadmaps')[0].paused_reason, 'x');
  assert.equal(rows(w.sqlite, 'SELECT processed_at FROM learn_roadmap_outbox')[0].processed_at, T0 + 63);
  assert.equal(applied, 1);
});

test('the effect and the processed marker are one batch: a failing effect leaves the event pending', async t => {
  const { w, event } = await accepted(t);
  await claimRoadmapEvent(w.LEARN_DB, { eventId: event.event_id, leaseToken: 'A', leaseUntil: T0 + 60, now: T0 });
  await assert.rejects(commitRoadmapEventEffect(w.LEARN_DB, { eventId: event.event_id, leaseToken: 'A', effects: () => [w.LEARN_DB.prepare('UPDATE no_such_table SET x = 1')], now: T0 + 1 }));
  assert.equal(rows(w.sqlite, 'SELECT processed_at FROM learn_roadmap_outbox')[0].processed_at, null);
});

test('retries back off, bounded, and an unprocessed event always has a wake time', async t => {
  const { w, event } = await accepted(t);
  const db = w.LEARN_DB;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(BACKOFF_SECONDS), [5, 10, 20, 40, 80, 160, 300, 300]);
  await claimRoadmapEvent(db, { eventId: event.event_id, leaseToken: 'A', leaseUntil: T0 + 60, now: T0 });
  await retryRoadmapEvent(db, { eventId: event.event_id, leaseToken: 'A', now: T0 });
  assert.equal(await nextRoadmapWake(db, { scope: scopeOf(w) }), T0 + 5);
  assert.equal((await dueRoadmapEvents(db, { now: T0 + 4 })).length, 0);
  assert.equal((await dueRoadmapEvents(db, { now: T0 + 5 })).length, 1);
});

test('crash after the fact committed and before any notification: the scan finds the board, the object runs the handler once, the event is processed', async t => {
  const { w, o } = await accepted(t); // no kick was ever sent
  const handled = [];
  registerRoadmapHandler('step_accepted', async (env, row) => { handled.push(JSON.parse(row.payload_json).proposalId); });
  assert.deepEqual(await boardsWithDueEvents(w.LEARN_DB, { now: T0 + 1 }), [scopeOf(w)]);
  const state = objectState();
  let clock = T0 + 1;
  const jobs = new RoadmapJobs(state, w.env, { clock: () => clock });
  await jobs.fetch(new Request('https://roadmap/kick', { method: 'POST', body: JSON.stringify(scopeOf(w)) }));
  assert.equal(state.alarm, clock * 1000, 'an overdue event arms the alarm for now');
  await jobs.alarm();
  assert.deepEqual(handled, [o.proposalId]);
  assert.notEqual(rows(w.sqlite, 'SELECT processed_at FROM learn_roadmap_outbox')[0].processed_at, null);
  assert.equal(state.alarm, null, 'nothing pending: no alarm');
  await jobs.alarm();
  assert.equal(handled.length, 1, 'a duplicate alarm does nothing');
});

test('a handler that fails is retried on the fake clock, never lost; a handler that succeeds on the retry completes it', async t => {
  const { w } = await accepted(t);
  let attempts = 0;
  registerRoadmapHandler('step_accepted', async () => { attempts++; if (attempts < 3) throw new Error('provider down'); });
  const state = objectState();
  let clock = T0 + 1;
  const jobs = new RoadmapJobs(state, w.env, { clock: () => clock });
  await jobs.fetch(new Request('https://roadmap/kick', { method: 'POST', body: JSON.stringify(scopeOf(w)) }));
  await jobs.alarm();
  assert.equal(attempts, 1);
  assert.equal(state.alarm, (T0 + 1 + 5) * 1000, 'retry armed with the first backoff');
  clock = T0 + 6; await jobs.alarm();
  assert.equal(attempts, 2);
  assert.equal(state.alarm, (T0 + 6 + 10) * 1000);
  clock = T0 + 16; await jobs.alarm();
  assert.equal(attempts, 3);
  assert.notEqual(rows(w.sqlite, 'SELECT processed_at FROM learn_roadmap_outbox')[0].processed_at, null);
  assert.equal(state.alarm, null);
});

test('flag off does not stop accepted work: the object runs the handler without reading ROADMAP_ENABLED', async t => {
  const { w } = await accepted(t);
  let ran = 0;
  registerRoadmapHandler('step_accepted', async () => { ran++; });
  const jobs = new RoadmapJobs(objectState(), { ...w.env, ROADMAP_ENABLED: 'false' }, { clock: () => T0 + 1 });
  await jobs.fetch(new Request('https://roadmap/kick', { method: 'POST', body: JSON.stringify(scopeOf(w)) }));
  await jobs.alarm();
  assert.equal(ran, 1);
});

test('kickRoadmapJobs is best effort: without the binding or on a failing object it reports false and throws nothing', async () => {
  assert.equal(await kickRoadmapJobs({}, { org: 'o', ownerUserId: 'u', boardId: 'b' }), false);
  const env = { ROADMAP_JOBS: { idFromName: n => n, get: () => ({ fetch: async () => { throw new Error('down'); } }) } };
  assert.equal(await kickRoadmapJobs(env, { org: 'o', ownerUserId: 'u', boardId: 'b' }), false);
});

test('mode changes are facts with their own revision: Ask, Tutor, Ask is three distinct events; the same mode again writes nothing', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  for (const [mode, key] of [['ask', 'mode-key-0001'], ['tutor', 'mode-key-0002'], ['ask', 'mode-key-0003'], ['ask', 'mode-key-0004']]) await setMode(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, mode, actionKey: key });
  const events = rows(w.sqlite, "SELECT fact_revision, payload_json FROM learn_roadmap_outbox WHERE kind = 'mode_changed' ORDER BY fact_revision");
  assert.deepEqual(events.map(e => [e.fact_revision, JSON.parse(e.payload_json).mode]), [[1, 'ask'], [2, 'tutor'], [3, 'ask']]);
});
