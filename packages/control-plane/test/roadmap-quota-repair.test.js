// The plan-quota defect (platformCallModel reserved the learner's quota before a local failure) and its one-off data repair
// (learn-repairs/roadmap-quota-repair.sql.txt, owner-run). Both a fresh roadmap and an already-stalled roadmap must recover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerRoadmapHandlers } from '../src/roadmap/roadmap-wire.js';
import { runDueRoadmapEvents } from '../src/roadmap/roadmap-events.js';
import { ROADMAP_LIMITS } from '../src/roadmap/roadmap-policy.js';
import { spendTransport } from '../src/learn-spend.js';
import { rows, MODEL } from './roadmap-fixture.js';
import { BOARD, FULL, ID_B, INSTRUCTION, KEY, classify, loop } from './roadmap-loop-fixture.js';

const sql = name => readFileSync(new URL(`../learn-repairs/${name}.sql.txt`, import.meta.url), 'utf8');
const REPAIR = sql('roadmap-quota-repair'), CHECK = sql('roadmap-quota-repair-check');
const REGISTRY = { roadmap_draft: { provider: 'anthropic', model: MODEL, effort: 'low', maxTokens: 12000 } };
const draftReply = () => Response.json({ model: MODEL, usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'tool_use', id: 'tu_1', name: 'submit_roadmap', input: FULL }] });
const transport = (env, body, model, org) => spendTransport(env, body, model, org, async () => draftReply(), { userId: 'provider:platform', category: 'roadmap' });
const nowSec = () => Math.floor(Date.now() / 1000);
const create = h => h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'balanced', actionKey: KEY('create') });
const quota = h => rows(h.w.sqlite, "SELECT scope, calls FROM learn_roadmap_quota WHERE owner_user_id = 'u-alice' ORDER BY scope").map(r => `${r.scope}=${r.calls}`).join();
// The real platform transport and quota path (no injected callModel), planning only.
const stage = async t => {
  const h = await loop(t);
  h.deps.startPlanning = async () => {};
  registerRoadmapHandlers({ registry: REGISTRY, transport, checkCallModel: h.m.callModel, classify, base: h.p.base });
  return h;
};

test('a fresh roadmap recovers: repeated local failures before dispatch leave the quota untouched and the plan is made when the fault clears', async t => {
  const h = await stage(t);
  await create(h);
  const fail = { ...h.env, LEARN_DB: { ...h.w.LEARN_DB, prepare: q => { if (q.includes('operation_key >= ?')) throw new Error('D1_ERROR: LIKE or GLOB pattern too complex'); return h.w.LEARN_DB.prepare(q); } } };
  const attempts = ROADMAP_LIMITS.quotas.perHour.plan + 4;
  for (let i = 0; i < attempts; i++) {
    const [event] = rows(h.w.sqlite, "SELECT next_at FROM learn_roadmap_outbox WHERE kind = 'plan_requested'");
    assert.equal(await runDueRoadmapEvents(fail, { now: event.next_at + 1 }), 1);
  }
  assert.equal(quota(h), '', 'more failures than the hourly allowance burned nothing');
  const [event] = rows(h.w.sqlite, "SELECT next_at, attempts FROM learn_roadmap_outbox WHERE kind = 'plan_requested'");
  assert.equal(event.attempts, attempts);
  await runDueRoadmapEvents(h.env, { now: event.next_at + 1 });
  assert.equal((await h.status()).roadmap.state, 'proposed');
  assert.equal(quota(h), 'plan.day=1,plan.hour=1');
});

test('an already-stalled roadmap recovers: burned units without a call row and an outbox row pushed an hour out are repaired, then the plan is made', async t => {
  const h = await stage(t);
  await create(h);
  const now = nowSec(), hour = Math.floor(now / 3600) * 3600, day = Math.floor(now / 86400) * 86400, S = h.w.sqlite;
  // The state the old code left: the allowance fully burned, no call ever dispatched, the event past its deadline so retryRoadmapEvent pushed it to now + 3600.
  S.prepare("INSERT INTO learn_roadmap_quota (org, owner_user_id, scope, window_start, calls, micros) VALUES ('team', 'u-alice', 'plan.hour', ?, 6, 0), ('team', 'u-alice', 'plan.day', ?, 6, 0)").run(hour, day);
  S.prepare("UPDATE learn_roadmap_outbox SET attempts = 7, next_at = ?, deadline_at = ? WHERE kind = 'plan_requested'").run(now + 3600, now - 1000);
  assert.equal(await runDueRoadmapEvents(h.env), 0, 'stalled: not due for an hour');
  assert.equal(rows(S, CHECK).filter(r => r.kind === 'event').length, 1);
  assert.deepEqual(rows(S, CHECK).filter(r => r.kind === 'quota').map(r => [r.a, r.b]), [[6, 0], [6, 0]]);
  S.exec(REPAIR);
  assert.equal(quota(h), 'plan.day=0,plan.hour=0');
  assert.equal(await runDueRoadmapEvents(h.env), 1, 'due again');
  assert.equal((await h.status()).roadmap.state, 'proposed');
  assert.equal(quota(h), 'plan.day=1,plan.hour=1', 'the successful call took exactly one unit');
});

test('the repair changes only rows matching its criteria, keeps call evidence, never refunds an unknown outcome, and a second run changes nothing', async t => {
  const h = await stage(t);
  const S = h.w.sqlite, now = nowSec(), hour = Math.floor(now / 3600) * 3600, day = Math.floor(now / 86400) * 86400;
  const quotaRow = (owner, scope, window, calls) => S.prepare("INSERT INTO learn_roadmap_quota (org, owner_user_id, scope, window_start, calls, micros) VALUES ('team', ?, ?, ?, ?, 0)").run(owner, scope, window, calls);
  const callRow = (owner, id, stage, checkpoint, at = now, roadmapId = 'rm_x') => S.prepare(`INSERT INTO learn_roadmap_calls (op_id, operation_key, roadmap_id, org, owner_user_id, board_id, stage, call_no, retry_no, payer, task, checkpoint, created_at)
    VALUES (?, ?, ?, 'team', ?, 'b', ?, 0, 0, 'platform', 't', ?, ?)`).run(id, `k.${id}`, roadmapId, owner, stage, checkpoint, at);
  const roadmap = (id, owner, state) => S.prepare(`INSERT INTO learn_roadmaps (id, org, owner_user_id, owner_email, board_id, app, state, depth, source_key, source_rev, scope_json, scope_fingerprint, ceiling, policy_version, created_at, updated_at)
    VALUES (?, 'team', ?, 'x@example.test', ?, 'learn', ?, 'balanced', 'k', 'r', '{}', 'f', 5, 'p', 1, 1)`).run(id, owner, `b_${id}`, state);
  const event = (id, owner, roadmapId, nextAt, deadlineAt, processed = null) => S.prepare(`INSERT INTO learn_roadmap_outbox (event_id, org, owner_user_id, scope, board_id, roadmap_id, kind, fact_id, fact_revision, payload_json, next_at, attempts, deadline_at, processed_at, created_at)
    VALUES (?, 'team', ?, 'roadmap', 'b', ?, 'plan_requested', ?, 1, '{}', ?, 7, ?, ?, 1)`).run(id, owner, roadmapId, id, nextAt, deadlineAt, processed);
  // burned: 6 reserved, one dispatched-and-failed call row, five reservations that never got a row
  quotaRow('burned', 'plan.hour', hour, 6); quotaRow('burned', 'plan.day', day, 6); callRow('burned', 'c1', 'draft', 'failed');
  // unknown: 2 reserved, 2 rows (one unknown): both units are real
  quotaRow('unknown', 'plan.hour', hour, 2); callRow('unknown', 'c2', 'draft', 'unknown', now, 'rm_unk'); callRow('unknown', 'c3', 'revise', 'settled');
  // honest: counter equals its rows. check and invite scopes are out of scope even when above their rows.
  quotaRow('honest', 'plan.hour', hour, 1); callRow('honest', 'c4', 'draft', 'settled'); quotaRow('honest', 'check.hour', hour, 9); quotaRow('honest', 'invite.hour', hour, 4);
  // a released row is not a unit, and a row outside the window is not a unit of this window
  quotaRow('released', 'plan.hour', hour, 0); callRow('released', 'c5', 'draft', 'released'); callRow('released', 'c6', 'draft', 'settled', hour - 10);
  roadmap('rm_stalled', 'burned', 'draft'); roadmap('rm_backoff', 'burned', 'draft'); roadmap('rm_unk', 'unknown', 'draft'); roadmap('rm_done', 'honest', 'draft'); roadmap('rm_active', 'honest', 'active');
  event('ev_stalled', 'burned', 'rm_stalled', now + 3500, now - 200); // pushed by the deadline branch (gap above 3600)
  event('ev_backoff', 'burned', 'rm_backoff', now + 200, now + 100); // an ordinary backoff inside its deadline: not touched
  event('ev_unknown', 'unknown', 'rm_unk', now + 3500, now - 200); // a call may have reached a provider: left for reconciliation
  event('ev_processed', 'honest', 'rm_done', now + 3500, now - 200, now); // already processed
  event('ev_active', 'honest', 'rm_active', now + 3500, now - 200); // the roadmap is past planning
  const calls = () => rows(S, 'SELECT * FROM learn_roadmap_calls ORDER BY op_id');
  const before = calls();
  const listed = rows(S, CHECK);
  assert.deepEqual(listed.map(r => `${r.kind} ${r.owner_user_id} ${r.ref.split(' ')[0]}`).sort(), ['event burned ev_stalled', `quota burned plan.day@${day}`, `quota burned plan.hour@${hour}`].sort(), 'the check lists exactly what will change');
  assert.deepEqual(listed.filter(r => r.kind === 'quota').map(r => [r.a, r.b]), [[6, 1], [6, 1]]);
  S.exec(REPAIR);
  const q = Object.fromEntries(rows(S, 'SELECT owner_user_id o, scope s, calls c FROM learn_roadmap_quota').map(r => [`${r.o} ${r.s}`, r.c]));
  assert.deepEqual(q, { 'burned plan.hour': 1, 'burned plan.day': 1, 'unknown plan.hour': 2, 'honest plan.hour': 1, 'honest check.hour': 9, 'honest invite.hour': 4, 'released plan.hour': 0 });
  const ev = Object.fromEntries(rows(S, 'SELECT event_id e, next_at n, deadline_at d, attempts a FROM learn_roadmap_outbox').map(r => [r.e, r]));
  assert.ok(Math.abs(ev.ev_stalled.n - now) <= 2 && ev.ev_stalled.d - ev.ev_stalled.n === 300 && ev.ev_stalled.a === 7, 'due now, fresh 300 s deadline, attempts kept');
  assert.deepEqual([ev.ev_backoff.n, ev.ev_unknown.n, ev.ev_processed.n, ev.ev_active.n], [now + 200, now + 3500, now + 3500, now + 3500]);
  assert.deepEqual(calls(), before, 'call evidence is untouched');
  assert.equal(rows(S, CHECK).length, 0, 'nothing left to repair');
  const snapshot = () => JSON.stringify([rows(S, 'SELECT * FROM learn_roadmap_quota ORDER BY owner_user_id, scope'), rows(S, 'SELECT * FROM learn_roadmap_outbox ORDER BY event_id')]);
  const after = snapshot();
  S.exec(REPAIR);
  assert.equal(snapshot(), after, 'idempotent');
});
