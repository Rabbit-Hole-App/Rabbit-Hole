// POST /api/telemetry/tutor: signed-in only, the tutor namespace only, server-stamped identity, server-sourced goal and activity,
// canvas references only for canvases the account owns, idempotent. Fixture evidence: the LEARN_DB is repository-schema.sql in
// node:sqlite and the events are hand-built; nothing here is a deployed lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { tutorTelemetryRoute, TUTOR_PATH } from '../src/telemetry-tutor-route.js';
import { clientTelemetryRoute } from '../src/telemetry-client-route.js';
import { makeEvent } from '../src/telemetry-contract.js';
import { tokenBucket } from '../src/telemetry-limit.js';
import { d1, migration, telemetryDb } from './telemetry-fixture.js';

let seq = 0;
const user = () => ({ userId: `user-${++seq}`, email: `learner${seq}@example.com`, org: 'org-1' });
const as = who => ({ identity: async () => who ?? new Response('no', { status: 401 }), now: () => 1_760_000_000_000 });
const decision = (payload = {}, fields = {}) => makeEvent('tutor.decision', { event_id: `tev-td_${++seq}`, feature: 'tutor', turn_id: 'turn-1', versions: { planner: 'tutor-planner-2', prompt: 'abcdef012345', mapping: 'assist-v1' },
  payload: { session_id: 'ts_00000000000000aa', scope: 'owned', mode: 'journey', canvas_ref: 'canvas-1', board: 'main', action_type: 'ask_question', assistance_offered: 'none', evidence_uncertain: 1, ...payload }, ...fields }, { environment: 'production', service: 'web' });
const hooks = (name, payload) => makeEvent(name, { event_id: `tev-td_${++seq}`, feature: 'tutor', payload: { set_id: 'ns_01020304', suggestion_ids: ['ns_01020304.1'], ...payload } }, { environment: 'production', service: 'web' });
const post = (events, headers = {}) => new Request(`https://rabbit.test${TUTOR_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ events }) });

function setup(t, who) {
  const telemetry = telemetryDb(t);
  const learn = new DatabaseSync(':memory:');
  t.after(() => learn.close());
  learn.exec(migration('repository-schema.sql'));
  const now = '2026-10-23T00:00:00.000Z';
  // The learner owns canvas-1/main, has an active goal with an activity naming one criterion.
  learn.prepare("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at) VALUES ('b1', ?, ?, 'canvas-1', 'main', '{}', ?)").run(who.org, who.email, now);
  learn.prepare("INSERT INTO learn_goals (id, org, owner_user_id, app, board, label, origin, created_at, updated_at) VALUES ('goal-1', ?, ?, 'canvas-1', 'main', 'PRIVATE GOAL LABEL', 'coaching', ?, ?)").run(who.org, who.userId, now, now);
  learn.prepare("INSERT INTO learn_activities (id, goal_id, org, owner_user_id, revision, status, objective, prompt, response_kind, criterion_refs_json, created_at, updated_at) VALUES ('act-1', 'goal-1', ?, ?, 3, 'in_progress', 'PRIVATE OBJECTIVE', 'PRIVATE PROMPT', 'text', '[{\"criterionId\":\"crit-1\",\"version\":2}]', ?, ?)").run(who.org, who.userId, now, now);
  learn.prepare("INSERT INTO learn_coaching_state (org, owner_user_id, app, board, active_goal_id, active_activity_id, created_at, updated_at) VALUES (?, ?, 'canvas-1', 'main', 'goal-1', 'act-1', ?, ?)").run(who.org, who.userId, now, now);
  const env = { TELEMETRY_DB: telemetry.db, TELEMETRY_ENVIRONMENT: 'dev', LEARN_DB: d1(learn) };
  return { env, ...telemetry, learn };
}
const call = (env, request, deps) => tutorTelemetryRoute(new URL(request.url).pathname, request, env, deps);
const rows = sqlite => sqlite.prepare('SELECT event_id, event_name, user_ref, occurred_at, body FROM telemetry_events ORDER BY occurred_at, rowid').all().map(row => ({ ...row, body: JSON.parse(row.body) }));

test('a signed-in learner\'s decision is stored under the server identity, with goal and activity from the server\'s own records', async t => {
  const who = user(), { env, sqlite } = setup(t, who);
  const forged = decision({ goal_id: 'goal-FORGED', activity_id: 'act-FORGED', activity_type: 'code', criteria: ['forged:1'] }, { user_ref: 'someone-else', environment: 'production', service: 'job', occurred_at: 1 });
  const response = await call(env, post([forged]), as(who));
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: 1, rejected: 0, deduped: 0 });
  const [row] = rows(sqlite);
  assert.deepEqual([row.event_name, row.user_ref, row.body.turn_id, row.occurred_at, row.body.environment, row.body.service], ['tutor.decision', who.userId, 'turn-1', 1_760_000_000_000, 'dev', 'web']);
  const p = row.body.payload;
  assert.deepEqual([p.canvas_ref, p.board, p.goal_id, p.activity_id, p.activity_revision, p.activity_type, p.criteria], ['canvas-1', 'main', 'goal-1', 'act-1', 3, 'text', ['crit-1:2']]);
  assert.equal(JSON.stringify(row).includes('PRIVATE'), false, 'no goal label, objective or prompt');
  assert.match(row.event_id, /^tv-/);
  assert.deepEqual(row.body.versions, { planner: 'tutor-planner-2', prompt: 'abcdef012345', mapping: 'assist-v1' });
});

test('a canvas the account does not own, a shared scope and an unknown board keep no canvas reference and no goal', async t => {
  const who = user(), other = user(), { env, sqlite } = setup(t, who);
  await call(env, post([decision({}, {}), decision({ canvas_ref: 'canvas-OTHER' }), decision({ scope: 'shared', mode: 'shared', share_key: 'sk_ab12cd34' }), decision({ board: 'draft' })]), as(who));
  const [owned, notOwned, shared, unknownBoard] = rows(sqlite).map(row => row.body.payload);
  assert.equal(owned.canvas_ref, 'canvas-1');
  for (const p of [notOwned, shared, unknownBoard]) assert.deepEqual([p.canvas_ref, p.goal_id, p.activity_id], [undefined, undefined, undefined]);
  assert.deepEqual([shared.share_key, shared.scope], ['sk_ab12cd34', 'shared']);
  // Another account claiming the first learner's canvas gets nothing from it.
  const stolen = await call(setup(t, who).env, post([decision()]), as(other));
  assert.equal(stolen.status, 202);
});

test('another account cannot claim the owner\'s canvas or goal', async t => {
  const who = user(), other = user(), { env, sqlite } = setup(t, who);
  await call(env, post([decision()]), as(other));
  const [row] = rows(sqlite);
  assert.deepEqual([row.user_ref, row.body.payload.canvas_ref, row.body.payload.goal_id], [other.userId, undefined, undefined]);
});

test('anonymous callers and failed session reads are refused with 401; nothing is stored', async t => {
  const who = user(), { env, sqlite } = setup(t, who);
  assert.equal((await call(env, post([decision()]), as(null))).status, 401);
  assert.equal((await call(env, post([decision()]), { identity: async () => { throw new Error('control plane down'); } })).status, 401);
  assert.equal((await call(env, post([decision()]), { identity: async () => ({ email: 'x@y.co', org: 'o' }) })).status, 401, 'a session with no stable user id is not a learner');
  assert.equal(rows(sqlite).length, 0);
});

test('only the tutor namespace is accepted: client, model-call and delivery events are refused, and the error route refuses tutor events', async t => {
  const who = user(), { env, sqlite } = setup(t, who);
  const client = makeEvent('client.error', { payload: { kind: 'uncaught', fingerprint: 'ab12cd34ef56ab78', route: '/apps/:id' } }, { environment: 'dev', service: 'web' });
  const model = makeEvent('model_call.finished', { payload: { task: 'chat', provider: 'anthropic' } }, { environment: 'dev', service: 'web' });
  const response = await call(env, post([client, model, decision()]), as(who));
  assert.deepEqual(await response.json(), { accepted: 1, rejected: 2, deduped: 0 });
  assert.deepEqual(rows(sqlite).map(row => row.event_name), ['tutor.decision']);
  const viaClient = await clientTelemetryRoute('/api/telemetry/client', new Request('https://rabbit.test/api/telemetry/client', { method: 'POST', body: JSON.stringify({ events: [decision()] }) }), env, { identity: async () => who });
  assert.deepEqual(await viaClient.json(), { accepted: 0, rejected: 1, deduped: 0 }, 'the anonymous error route can never accept a tutor event');
});

test('the learner\'s words cannot ride along: unknown fields, free text and a URL are refused whole', async t => {
  const who = user(), { env, sqlite } = setup(t, who);
  const leaky = [decision({ rationale: 'because they asked about their thesis' }), decision({ goal: 'Understand tidal power' }), decision({ reason_codes: ['advance goal now'] }), decision({ section_id: 'https://example.com/private' })];
  const response = await call(env, post(leaky), as(who));
  assert.deepEqual(await response.json(), { accepted: 0, rejected: 4, deduped: 0 });
  assert.equal(rows(sqlite).length, 0);
});

test('idempotent: a retried batch is one row, and two accounts with the same browser event id do not collide; a batch keeps its order', async t => {
  const a = user(), b = user(), { env, sqlite } = setup(t, a);
  const events = [decision({ action_type: 'respond_text' }), hooks('tutor.hooks_computed', { tier: 'routine' }), hooks('tutor.hooks_shown', {})];
  const first = await call(env, post(events), as(a));
  assert.deepEqual(await first.json(), { accepted: 3, rejected: 0, deduped: 0 });
  assert.deepEqual(await (await call(env, post(events), as(a))).json(), { accepted: 0, rejected: 0, deduped: 3 });
  assert.deepEqual(await (await call(env, post(events), as(b))).json(), { accepted: 3, rejected: 0, deduped: 0 }, 'another account is its own rows');
  const mine = rows(sqlite).filter(row => row.user_ref === a.userId);
  assert.deepEqual(mine.map(row => row.event_name), ['tutor.decision', 'tutor.hooks_computed', 'tutor.hooks_shown']);
  assert.deepEqual(mine.map(row => row.occurred_at - 1_760_000_000_000), [0, 1, 2], 'one millisecond apart, in batch order');
});

test('bounds: cross-site, oversized, bad JSON, more than 20 events, a flood, the wrong method; unprovisioned and outage never break the page', async t => {
  const who = user(), { env } = setup(t, who);
  const deps = as(who);
  assert.equal((await call(env, post([decision()], { 'sec-fetch-site': 'cross-site' }), deps)).status, 403);
  assert.equal((await call(env, post([decision()], { origin: 'https://evil.example' }), deps)).status, 403);
  assert.equal((await call(env, new Request(`https://rabbit.test${TUTOR_PATH}`, { method: 'POST', body: 'x'.repeat(70_000) }), deps)).status, 413);
  assert.equal((await call(env, new Request(`https://rabbit.test${TUTOR_PATH}`, { method: 'POST', body: '{nope' }), deps)).status, 400);
  assert.equal((await call(env, post(Array.from({ length: 21 }, () => decision())), deps)).status, 400);
  assert.equal((await call(env, new Request(`https://rabbit.test${TUTOR_PATH}`), deps)).status, 405);
  assert.equal(await tutorTelemetryRoute('/api/telemetry/other', post([]), env), null);
  assert.equal((await call({ TELEMETRY_ENVIRONMENT: 'dev' }, post([decision()]), deps)).status, 204);
  assert.equal((await call({ TELEMETRY_DB: env.TELEMETRY_DB }, post([decision()]), deps)).status, 204);
  const down = telemetryDb(t, { fail: () => true });
  assert.equal((await call({ ...env, TELEMETRY_DB: down.db }, post([decision()]), deps)).status, 503);
  const flooder = user(), statuses = [];
  const flood = setup(t, flooder);
  const bucket = tokenBucket({ capacity: 40, refillPerSec: 2, now: () => 1_000_000 }); // frozen clock: no refill on a slow machine
  for (let i = 0; i < 5; i++) statuses.push((await call(flood.env, post(Array.from({ length: 20 }, () => decision())), { ...as(flooder), limit: bucket })).status);
  assert.deepEqual(statuses, [202, 202, 429, 429, 429]);
});

test('without LEARN_DB the event is still kept, with no canvas reference or goal', async t => {
  const who = user(), { env, sqlite } = setup(t, who);
  await call({ ...env, LEARN_DB: undefined }, post([decision()]), as(who));
  const p = rows(sqlite)[0].body.payload;
  assert.deepEqual([p.canvas_ref, p.goal_id, p.action_type], [undefined, undefined, 'ask_question']);
});
