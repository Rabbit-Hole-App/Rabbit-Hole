// R4 integration glue, focused: the platform model transport (stable identity, checkpoints, quota, unknown outcomes, an injected registry), the
// per-learner quota counters, the safety classifier's request/coverage, invitations (two choices, dismissal scope, Auto-suggest, Ask, ownership),
// the scheduler hook and the preview write allowance. Doubles only: no model, no JEV, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platformCallModel, platformJevAsk, makeClassify, safetyRequest, ROLES } from '../src/roadmap/roadmap-models.js';
import { operationOf } from '../src/learn-spend-ledger.js';
import { reserveRoadmapQuota, releaseCallQuota } from '../src/roadmap/roadmap-quota.js';
import { ROADMAP_LIMITS } from '../src/roadmap/roadmap-policy.js';
import { offerInvitation, pendingInvitation, dismissInvitation, roadmapOnDropEnabled } from '../src/roadmap/roadmap-invitations.js';
import { scheduledRoadmapKick } from '../src/roadmap/roadmap-wire.js';
import { SAFETY_QUESTIONS } from '../src/agents/roadmap-check.js';
import { spendTransport } from '../src/learn-spend.js';
import { world, rows, MODEL, likePatterns } from './roadmap-fixture.js';
import { ID_A, ID_B, sha } from './roadmap-loop-fixture.js';

const ROADMAP = 'rm_000000000000000000000001';
const REGISTRY = { roadmap_draft: { provider: 'anthropic', model: MODEL, effort: 'low', maxTokens: 12000 }, roadmap_grounding_check: { provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', maxTokens: 1500 } };
const reply = () => Response.json({ model: MODEL, usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }] });
// The transport double goes through the real spend path as the platform, so the ledger sees the stable operation id.
const ledgered = (seen = []) => (env, body, model, org) => { seen.push({ body, model }); return spendTransport(env, body, model, org, async () => reply(), { userId: 'provider:platform', category: 'roadmap' }); };
const BODY = { max_tokens: 200, messages: [{ role: 'user', content: 'x' }] };

test('the platform model transport: registered role, stable operation id, platform payer, effort carried, checkpoints end settled', async t => {
  const w = world(t), seen = [];
  const callModel = platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, registry: REGISTRY, transport: ledgered(seen) });
  const message = await callModel('roadmap_draft', BODY);
  assert.equal(message.content[0].type, 'tool_use');
  assert.equal(seen[0].model, MODEL);
  assert.deepEqual(seen[0].body.output_config, { effort: 'low' });
  const [call] = rows(w.sqlite, 'SELECT op_id, stage, call_no, retry_no, payer, task, checkpoint FROM learn_roadmap_calls');
  assert.deepEqual([call.stage, call.call_no, call.retry_no, call.payer, call.task, call.checkpoint], ['draft', 0, 0, 'platform', 'roadmap_draft', 'settled']);
  assert.match(call.op_id, /^rm-draft-[0-9a-f]{32}$/);
  assert.equal(rows(w.sqlite, 'SELECT * FROM usage_operations WHERE op_id = ?', call.op_id).length, 1, 'the ledger holds exactly that id');
  assert.equal(rows(w.sqlite, "SELECT * FROM usage_actions WHERE user_id = 'u-alice'").length, 0, 'the learner is never charged for planning');
  // A second call of the same stage is call 1: its own identity.
  await callModel('roadmap_draft', BODY);
  assert.deepEqual(rows(w.sqlite, 'SELECT call_no FROM learn_roadmap_calls ORDER BY call_no').map(r => r.call_no), [0, 1]);
});

test('an unregistered role fails closed with no provider call and no ledger row (the Lead adds the rows)', async t => {
  const w = world(t), seen = [];
  const callModel = platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, registry: {}, transport: ledgered(seen) });
  await assert.rejects(callModel('roadmap_draft', BODY), { code: 'role_not_registered' });
  await assert.rejects(callModel('chat', BODY), { code: 'role_not_registered' }, 'only the roadmap roles exist here');
  assert.equal(seen.length, 0);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmap_calls').length, 0);
  assert.deepEqual([...ROLES].sort(), ['roadmap_draft', 'roadmap_grounding_check', 'roadmap_grounding_escalation', 'roadmap_proposal', 'roadmap_revise', 'roadmap_safety_adjudicate', 'roadmap_subject']);
});

test('a thrown transport is an unknown outcome: marked unknown, and the same call is never sent blind again', async t => {
  const w = world(t);
  const boom = () => { throw new Error('connection dropped'); };
  const first = platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, registry: REGISTRY, transport: boom });
  await assert.rejects(first('roadmap_draft', BODY), { code: 'unknown_provider_outcome' });
  assert.equal(rows(w.sqlite, 'SELECT checkpoint FROM learn_roadmap_calls')[0].checkpoint, 'unknown');
  // A fresh attempt (a handler retry) reaches call 0 of the same stage again: it must reconcile first.
  const seen = [];
  const again = platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, registry: REGISTRY, transport: ledgered(seen) });
  await assert.rejects(again('roadmap_draft', BODY), { code: 'unknown_provider_outcome' });
  assert.equal(seen.length, 0);
});

test('a refusal is a known failure: the next attempt gets a fresh retry number', async t => {
  const w = world(t);
  const refuse = () => Response.json({ error: 'busy' }, { status: 529 });
  await assert.rejects(platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, registry: REGISTRY, transport: refuse })('roadmap_draft', BODY), { code: 'model_unavailable' });
  assert.equal(rows(w.sqlite, 'SELECT checkpoint FROM learn_roadmap_calls')[0].checkpoint, 'failed');
  await platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, registry: REGISTRY, transport: ledgered() })('roadmap_draft', BODY);
  assert.deepEqual(rows(w.sqlite, 'SELECT retry_no, checkpoint FROM learn_roadmap_calls ORDER BY retry_no').map(r => [r.retry_no, r.checkpoint]), [[0, 'failed'], [1, 'settled']]);
});

test('per-learner quota counters: both windows, the last slot has one winner, a refused hour or day makes no call, another learner is unaffected', async t => {
  const w = world(t), now = 1_800_000_000;
  const limits = { ...ROADMAP_LIMITS, quotas: { ...ROADMAP_LIMITS.quotas, perHour: { ...ROADMAP_LIMITS.quotas.perHour, plan: 2 }, perDay: { ...ROADMAP_LIMITS.quotas.perDay, plan: 3 } } };
  const take = (access = w.access, at = now) => reserveRoadmapQuota(w.LEARN_DB, access, 'plan', { now: at, limits });
  assert.equal((await take()).ok, true);
  const [x, y] = await Promise.all([take(), take()]);
  assert.deepEqual([x.ok, y.ok].sort(), [false, true], 'two contenders for the last hourly slot: one wins');
  assert.deepEqual(await take(), { ok: false, window: 'hour' });
  assert.equal((await take(w.access, now + 3600)).ok, true, 'the next hour has its own counter');
  assert.deepEqual(await take(w.access, now + 3600 * 2), { ok: false, window: 'day' }, 'the day cap holds across hours');
  assert.equal(rows(w.sqlite, "SELECT calls FROM learn_roadmap_quota WHERE scope = 'plan.hour' ORDER BY window_start").map(r => r.calls).join(), '2,1,0', 'a day refusal gave its hour slot back (the third hour holds 0)');
  assert.equal((await take({ ...w.access, actorUserId: 'u-bob' })).ok, true);
  await assert.rejects(reserveRoadmapQuota(w.LEARN_DB, w.access, 'banana'), /unknown quota stage/);
});

test('a quota refusal stops the model call before it is dispatched: the planned row is released, the counter is not touched', async t => {
  const w = world(t), seen = [];
  const hourStart = Math.floor(Date.now() / 1000 / 3600) * 3600;
  w.sqlite.prepare("INSERT INTO learn_roadmap_quota (org, owner_user_id, scope, window_start, calls, micros) VALUES ('team', 'u-alice', 'plan.hour', ?, ?, 0)").run(hourStart, ROADMAP_LIMITS.quotas.perHour.plan);
  const callModel = platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, quota: 'plan', registry: REGISTRY, transport: ledgered(seen) });
  await assert.rejects(callModel('roadmap_draft', BODY), { code: 'quota_exhausted' });
  assert.equal(seen.length, 0);
  assert.deepEqual(rows(w.sqlite, 'SELECT checkpoint FROM learn_roadmap_calls').map(r => r.checkpoint), ['released']);
  assert.equal(rows(w.sqlite, "SELECT calls FROM learn_roadmap_quota WHERE scope = 'plan.hour'")[0].calls, ROADMAP_LIMITS.quotas.perHour.plan, 'a refusal must not hand back a unit it never took');
});

// A db whose statements matching `when` throw, the way D1 rejects the over-long LIKE (found on the dev clone 2026-11-06): the fault is local, nothing is dispatched.
const faulty = (w, when) => ({ ...w.env, LEARN_DB: { ...w.LEARN_DB, prepare: sql => { if (when(sql)) throw new Error('D1_ERROR: LIKE or GLOB pattern too complex'); return w.LEARN_DB.prepare(sql); } } });
const units = w => rows(w.sqlite, "SELECT scope, calls FROM learn_roadmap_quota WHERE owner_user_id = 'u-alice' ORDER BY scope").map(r => `${r.scope}=${r.calls}`).join();

test('a local failure before dispatch consumes no quota however often it is retried, and the first healthy call takes one unit', async t => {
  const w = world(t), seen = [];
  const env = faulty(w, sql => sql.includes('operation_key >= ?')); // the prior-call lookup
  for (let attempt = 0; attempt < ROADMAP_LIMITS.quotas.perHour.plan + 3; attempt++) {
    await assert.rejects(platformCallModel(env, w.access, { roadmapId: ROADMAP, version: 1, quota: 'plan', registry: REGISTRY, transport: ledgered(seen) })('roadmap_draft', BODY), /too complex/);
  }
  assert.equal(units(w), '', 'no counter row was even created');
  assert.equal(seen.length, 0);
  await platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, quota: 'plan', registry: REGISTRY, transport: ledgered(seen) })('roadmap_draft', BODY);
  assert.equal(units(w), 'plan.day=1,plan.hour=1');
});

test('a failure between the reservation and the dispatch gives the unit back once, keeps the call row, and a replayed release is a no-op', async t => {
  const w = world(t), seen = [];
  const env = faulty(w, sql => sql.includes('COALESCE(?, output_ref)')); // advanceCall: the 'dispatched' checkpoint cannot be written
  await assert.rejects(platformCallModel(env, w.access, { roadmapId: ROADMAP, version: 1, quota: 'plan', registry: REGISTRY, transport: ledgered(seen) })('roadmap_draft', BODY), /too complex/);
  assert.equal(seen.length, 0, 'nothing reached the provider');
  assert.equal(units(w), 'plan.day=0,plan.hour=0');
  const [call] = rows(w.sqlite, 'SELECT op_id, checkpoint, quota_scope FROM learn_roadmap_calls');
  assert.deepEqual([call.checkpoint, call.quota_scope], ['released', 'plan'], 'the call row stays as evidence');
  // Another call takes a unit; replaying the first release must not hand that one back.
  await reserveRoadmapQuota(w.LEARN_DB, w.access, 'plan');
  assert.equal(await releaseCallQuota(w.LEARN_DB, w.access, call.op_id), false);
  assert.equal(units(w), 'plan.day=1,plan.hour=1');
});

test('an unknown provider outcome keeps its unit, is never released and is never sent again', async t => {
  const w = world(t), seen = [];
  const boom = () => { throw new Error('connection dropped'); };
  await assert.rejects(platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, quota: 'plan', registry: REGISTRY, transport: boom })('roadmap_draft', BODY), { code: 'unknown_provider_outcome' });
  const [call] = rows(w.sqlite, 'SELECT op_id, checkpoint FROM learn_roadmap_calls');
  assert.equal(call.checkpoint, 'unknown');
  assert.equal(units(w), 'plan.day=1,plan.hour=1', 'the call may have cost money: its unit stays');
  assert.equal(await releaseCallQuota(w.LEARN_DB, w.access, call.op_id), false, 'compensation does not apply to an unknown outcome');
  await assert.rejects(platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, quota: 'plan', registry: REGISTRY, transport: ledgered(seen) })('roadmap_draft', BODY), { code: 'unknown_provider_outcome' });
  assert.equal(seen.length, 0, 'never re-dispatched');
  assert.equal(units(w), 'plan.day=1,plan.hour=1', 'and the blocked retry did not take another unit');
});

test('a provider refusal was dispatched, so its unit stays', async t => {
  const w = world(t);
  await assert.rejects(platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, quota: 'plan', registry: REGISTRY, transport: () => Response.json({ error: 'busy' }, { status: 529 }) })('roadmap_draft', BODY), { code: 'model_unavailable' });
  assert.equal(units(w), 'plan.day=1,plan.hour=1');
});

test('the safety classifier asks every category independently in one request per chunk and reports coverage honestly', async () => {
  const requests = [];
  const answers = value => Object.fromEntries(Object.keys(SAFETY_QUESTIONS).map(k => [k, { type: 'noul', noul: k === 'violence' ? value : 0.01 }]));
  const classify = makeClassify({ ask: async request => { requests.push(request); return { answers: answers(requests.length === 2 ? 0.8 : 0.2) }; }, chunkChars: 10, maxChunks: 2 });
  const got = await classify({ role: 'output', text: 'x'.repeat(15) });
  assert.equal(requests.length, 2);
  assert.deepEqual(Object.keys(requests[0].questions), Object.keys(SAFETY_QUESTIONS));
  assert.ok(Object.values(requests[0].questions).every(q => q.type === 'noul' && /quoted data/.test(q.instructions)));
  assert.equal(got.scores.violence, 0.8, 'the worst chunk decides');
  assert.deepEqual(got.coverage, { complete: true, chars: 15, chunks: 2 });
  const long = await classify({ role: 'source', text: 'x'.repeat(35) });
  assert.equal(long.coverage.complete, false, 'text beyond the chunk bound is incomplete coverage, never a pass');
  await assert.rejects(makeClassify({ ask: async () => ({ answers: {} }) })({ role: 'output', text: 'hi' }), { code: 'bad_response' });
  assert.equal(safetyRequest('t', 'learner').state.author_role, 'learner');
});

// --- invitations ----------------------------------------------------------------------------------------------------------------------
async function withFiles(t) {
  const w = world(t), rev = await sha('# Notes');
  const add = (id, name, family = 'markdown', owner = 'u-alice@example.test') => w.sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at) VALUES (?, 'team', ?, 'learn', 'b', ?, ?, 'text/markdown', 7, ?, 'k', 'stored', 1)").run(id, owner, family, name, rev);
  add(ID_A, 'First notes.md'); add(ID_B, 'Second notes.md'); add('fs_pdfpdfpdfpdfpdfpdfpdfpdf', 'Paper.pdf', 'pdf'); add('fs_foreignforeignforeignfor', 'Theirs.md', 'markdown', 'u-bob@example.test');
  return w;
}
const offer = (w, keys, extra = {}) => offerInvitation(w.LEARN_DB, w.access, { sourceKeys: keys, idleKey: 'idle-0001-aaaa', ...extra });

test('invitations: two choices, titled by the file, one row per source set; a reload and a repeated idle window return the same invitation', async t => {
  const w = await withFiles(t);
  const a = (await offer(w, [`file:${ID_A}`])).body.invitation;
  assert.deepEqual([a.state, a.choices, a.title], ['offered', ['explain_on_canvas', 'keep_here'], 'First notes.md']);
  assert.equal((await offer(w, [`file:${ID_A}`], { idleKey: 'idle-0002-aaaa' })).body.invitation.id, a.id);
  assert.equal((await pendingInvitation(w.LEARN_DB, w.access)).body.invitation.id, a.id);
  const both = (await offer(w, [`file:${ID_B}`, `file:${ID_A}`])).body.invitation;
  assert.equal(both.title, 'First notes.md, Second notes.md', 'sources that became ready in one idle window are one grouped invitation');
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmap_invitations').length, 2);
});

test('dismissal is that invitation only: the same source set is not offered again, another set is, and another learner cannot dismiss it', async t => {
  const w = await withFiles(t);
  const a = (await offer(w, [`file:${ID_A}`])).body.invitation;
  assert.deepEqual((await dismissInvitation(w.LEARN_DB, w.access, { invitationId: a.id, actionKey: 'dismiss-0001' })).body, { invitation: { id: a.id, state: 'dismissed' } });
  assert.deepEqual((await dismissInvitation(w.LEARN_DB, w.access, { invitationId: a.id, actionKey: 'dismiss-0002' })).body.invitation.state, 'dismissed', 'a repeat answers the same');
  assert.deepEqual((await offer(w, [`file:${ID_A}`])).body, { invitation: null, suppressed: { reason: 'already_offered' } });
  assert.equal((await pendingInvitation(w.LEARN_DB, w.access)).body.invitation, null);
  assert.equal((await offer(w, [`file:${ID_B}`])).body.invitation.state, 'offered', 'nothing global changed');
  await assert.rejects(dismissInvitation(w.LEARN_DB, { ...w.access, actorUserId: 'u-bob' }, { invitationId: a.id, actionKey: 'dismiss-0003' }), { status: 404 });
});

test('Auto-suggest off, Ask mode, an unfinished roadmap and unsupported or foreign sources suppress an invitation without a row; Ask never starts anything', async t => {
  const w = await withFiles(t);
  assert.deepEqual((await offer(w, [`file:${ID_A}`], { settings: async () => ({ autoSuggest: false, mode: 'tutor' }) })).body.suppressed, { reason: 'auto_suggest_off' });
  assert.deepEqual((await offer(w, [`file:${ID_A}`], { settings: async () => ({ autoSuggest: true, mode: 'ask' }) })).body.suppressed, { reason: 'ask_mode' });
  assert.deepEqual((await offer(w, [`file:${ID_A}`], { mode: 'ask' })).body.suppressed, { reason: 'ask_mode' }, 'a client hint can only suppress');
  assert.deepEqual((await offer(w, [`file:${ID_A}`], { mode: 'tutor', settings: async () => ({ mode: 'ask' }) })).body.suppressed, { reason: 'ask_mode' }, 'the stored mode wins over the hint');
  assert.deepEqual((await offer(w, ['file:fs_pdfpdfpdfpdfpdfpdfpdfpdf'])).body.suppressed, { reason: 'unsupported_source' });
  assert.deepEqual((await offer(w, ['file:fs_foreignforeignforeignfor'])).body.suppressed, { reason: 'unsupported_source' }, 'another learner\'s file is no source');
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmap_invitations').length, 0, 'nothing suppressed leaves a row');
  w.sqlite.prepare(`INSERT INTO learn_roadmaps (id, org, owner_user_id, owner_email, board_id, app, state, revision, depth, source_key, source_rev, scope_json, scope_fingerprint, ceiling, policy_version, created_at, updated_at)
    VALUES ('rm_x', 'team', 'u-alice', 'u-alice@example.test', ?, 'learn', 'paused', 1, 'balanced', 'k', 'r', '{}', 'f', 10, 'p', 1, 1)`).run(w.access.boardId);
  assert.deepEqual((await offer(w, [`file:${ID_B}`])).body.suppressed, { reason: 'unfinished_roadmap' });
  await assert.rejects(offer(w, []), { code: 'invalid_request' });
  await assert.rejects(offerInvitation(w.LEARN_DB, w.access, { sourceKeys: [`file:${ID_A}`], idleKey: 'no' }), { code: 'invalid_request' });
});

test('the scheduler hook kicks each board that has a due event, once', async t => {
  const w = world(t), kicked = [];
  w.sqlite.prepare("INSERT INTO learn_roadmap_outbox (event_id, org, owner_user_id, scope, board_id, roadmap_id, kind, fact_id, fact_revision, payload_json, next_at, attempts, deadline_at, created_at) VALUES ('ev_1', 'team', 'u-alice', 'roadmap', ?, 'rm_1', 'step_accepted', 'f', 1, '{}', 1, 0, 9, 1)").run(w.access.boardId);
  const binding = { idFromName: name => name, get: name => ({ fetch: async (url, init) => { kicked.push([name, JSON.parse(init.body)]); return Response.json({ ok: true }); } }) };
  assert.equal(await scheduledRoadmapKick({ ...w.env, ROADMAP_JOBS: binding }), 1);
  assert.deepEqual(kicked, [['team:u-alice:lb_board00000000000001', { org: 'team', ownerUserId: 'u-alice', boardId: 'lb_board00000000000001' }]]);
  assert.equal(await scheduledRoadmapKick(w.env), 0, 'without the binding nothing is kicked and nothing throws');
});

test('the JEV safety ask is platform-funded with its own stable operation per POST, checkpointed, and an outage is an unknown outcome that blocks a blind repeat', async t => {
  const w = world(t), seen = [];
  const answers = Object.fromEntries(Object.keys(SAFETY_QUESTIONS).map(k => [k, { type: 'noul', noul: 0.02 }]));
  const ask = async (env, request) => { seen.push({ op: operationOf(env), request }); return { body: { answers } }; };
  const classify = makeClassify({ ask: platformJevAsk(w.env, w.access, { roadmapId: ROADMAP, version: 1, anchor: 'cd_000000000000000000000001', ask }) });
  const got = await classify({ role: 'output', text: 'a short card' });
  assert.equal(got.coverage.complete, true);
  const [call] = rows(w.sqlite, 'SELECT op_id, stage, payer, task, checkpoint FROM learn_roadmap_calls');
  assert.deepEqual([call.stage, call.payer, call.task, call.checkpoint], ['safety', 'platform', 'jev_safety', 'settled']);
  assert.equal(seen[0].op.opId, call.op_id, 'askJev receives the stable id');
  assert.match(call.op_id, /^rm-safety-[0-9a-f]{32}$/);
  // The transport dying after dispatch: unknown, and the same call number is not repeated blind.
  const dead = platformJevAsk(w.env, w.access, { roadmapId: ROADMAP, version: 2, anchor: 'cd_000000000000000000000001', ask: async () => { throw new Error('socket closed'); } });
  await assert.rejects(dead(safetyRequest('x', 'output')), { code: 'unknown_provider_outcome' });
  const again = platformJevAsk(w.env, w.access, { roadmapId: ROADMAP, version: 2, anchor: 'cd_000000000000000000000001', ask });
  await assert.rejects(again(safetyRequest('x', 'output')), { code: 'unknown_provider_outcome' });
  assert.equal(seen.length, 1);
});

// D1 refuses a LIKE pattern over 50 bytes, so the call-identity lookup is a range query. These keys have the exact shape and length of production keys
// (rm.<proposal>.<version>.<anchor>.<stage>.<call>.<retry>.<authorization>); the neighbours share a long prefix with the one under test.
const ANCHOR = 'cd_000000000000000000000001';
const seedCall = (w, key, checkpoint) => w.sqlite.prepare(`INSERT INTO learn_roadmap_calls (op_id, operation_key, roadmap_id, org, owner_user_id, board_id, stage, call_no, payer, task, checkpoint, created_at)
  VALUES (?, ?, ?, 'team', 'u-alice', 'lb_board00000000000001', 'draft', 0, 'platform', 'x', ?, 1)`).run(`op-${key}`, key, ROADMAP, checkpoint);
const neighbours = (stage, call) => [`rm.${ROADMAP}.1.${ANCHOR}.${stage}.${call}0.0.${ROADMAP}`, `rm.${ROADMAP}.11.${ANCHOR}.${stage}.${call}.0.${ROADMAP}`, `rm.${ROADMAP}.1.${ANCHOR.slice(0, -1)}2.${stage}.${call}.0.${ROADMAP}`,
  `rm.${ROADMAP}.1.${ANCHOR}.${stage}.${call + 1}.0.${ROADMAP}`, `rm.${ROADMAP}.1.${ANCHOR}x.${stage}.${call}.0.${ROADMAP}`, `rm.${ROADMAP}.1.${ANCHOR}.${stage}.${call}`];

test('the call-identity lookup finds exactly the same-identity rows: neighbours sharing a long prefix neither block nor are counted', async t => {
  const w = world(t), seen = [];
  for (const key of neighbours('draft', 0)) seedCall(w, key, 'dispatched');
  const callModel = platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, anchor: ANCHOR, registry: REGISTRY, transport: ledgered(seen) });
  await callModel('roadmap_draft', BODY);
  assert.equal(seen.length, 1, 'no neighbour blocked the call');
  assert.equal(rows(w.sqlite, 'SELECT retry_no FROM learn_roadmap_calls WHERE operation_key = ?', `rm.${ROADMAP}.1.${ANCHOR}.draft.0.0.${ROADMAP}`).length, 1, 'retry 0: no neighbour counted as an earlier attempt');
  const jevSeen = [];
  for (const key of neighbours('safety', 0)) seedCall(w, key, 'dispatched');
  const jev = platformJevAsk(w.env, w.access, { roadmapId: ROADMAP, version: 1, anchor: ANCHOR, ask: async () => { jevSeen.push(1); return { body: { answers: {} } }; } });
  await jev(safetyRequest('x', 'output'));
  assert.equal(jevSeen.length, 1);
  assert.equal(rows(w.sqlite, 'SELECT retry_no FROM learn_roadmap_calls WHERE operation_key = ?', `rm.${ROADMAP}.1.${ANCHOR}.safety.0.0.${ROADMAP}`).length, 1);
});

test('the call-identity lookup still finds a prior in-flight or unknown call of the same identity: blocked, no second provider call (model and JEV)', async t => {
  for (const checkpoint of ['admitted', 'dispatched', 'unknown', 'reconciling']) {
    const w = world(t), seen = [], jevSeen = [];
    seedCall(w, `rm.${ROADMAP}.1.${ANCHOR}.draft.0.2.${ROADMAP}`, checkpoint); // an earlier attempt with another retry number
    seedCall(w, `rm.${ROADMAP}.1.${ANCHOR}.safety.0.0.${ROADMAP}`, checkpoint);
    await assert.rejects(platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, anchor: ANCHOR, registry: REGISTRY, transport: ledgered(seen) })('roadmap_draft', BODY), { code: 'unknown_provider_outcome' }, checkpoint);
    await assert.rejects(platformJevAsk(w.env, w.access, { roadmapId: ROADMAP, version: 1, anchor: ANCHOR, ask: async () => { jevSeen.push(1); return { body: {} }; } })(safetyRequest('x', 'output')), { code: 'unknown_provider_outcome' }, checkpoint);
    assert.deepEqual([seen.length, jevSeen.length], [0, 0], `${checkpoint}: nothing was dispatched`);
  }
});

test('the test database refuses only a LIKE or GLOB whose pattern is over 50 bytes, as D1 does', t => {
  const long = 'x'.repeat(80), w = world(t);
  assert.deepEqual(likePatterns('SELECT 1 FROM t WHERE k LIKE ?', [long]), [long]);
  assert.deepEqual(likePatterns('SELECT 1 FROM t WHERE c = ? AND k = ?', [long, long]), [], 'long parameters that are not patterns');
  assert.deepEqual(likePatterns('SELECT 1 FROM t WHERE c = ? AND k GLOB ?', [long, 'ab']), ['ab'], 'the pattern is the one named, not the long neighbour');
  assert.deepEqual(likePatterns("SELECT 1 FROM t WHERE c = ?2 AND k LIKE ?1 ESCAPE '\\'", ['ab', long]), ['ab']);
  assert.deepEqual(likePatterns("SELECT 1 FROM t WHERE c = ? AND j LIKE '%x%'", [long]), ['%x%']);
  assert.doesNotThrow(() => w.LEARN_DB.prepare('SELECT checkpoint FROM learn_roadmap_calls WHERE roadmap_id = ? AND task LIKE ?').bind(long, 'ab%'));
  assert.throws(() => w.LEARN_DB.prepare('SELECT checkpoint FROM learn_roadmap_calls WHERE operation_key LIKE ?').bind(`${long}%`), /too complex/);
});

// UI.01 / roadmap 3.3 (chat lane): an explicit drop ('drop-' key) is acknowledged in every mode; an unfinished roadmap still suppresses it.
test('an explicit drop is offered in Ask and with Auto-suggest off; an unsolicited report still is not; an unfinished roadmap suppresses both', async t => {
  const w = await withFiles(t);
  assert.deepEqual((await offer(w, [`file:${ID_A}`], { settings: async () => ({ autoSuggest: false, mode: 'ask' }) })).body.suppressed, { reason: 'ask_mode' });
  const drop = await offer(w, [`file:${ID_A}`], { idleKey: `drop-file-${ID_A}`, settings: async () => ({ autoSuggest: false, mode: 'ask' }) });
  assert.equal(drop.body.invitation.state, 'offered', 'the drop is acknowledged in Ask with Auto-suggest off');
  assert.deepEqual((await offer(w, [`file:${ID_A}`], { idleKey: `drop-file-${ID_A}` })).body.invitation.id, drop.body.invitation.id, 'a repeated drop report returns the same invitation');
  w.sqlite.prepare(`INSERT INTO learn_roadmaps (id, org, owner_user_id, owner_email, board_id, app, state, revision, depth, source_key, source_rev, scope_json, scope_fingerprint, ceiling, policy_version, created_at, updated_at)
    VALUES ('rm_y', 'team', 'u-alice', 'u-alice@example.test', ?, 'learn', 'active', 1, 'balanced', 'k', 'r', '{}', 'f', 10, 'p', 1, 1)`).run(w.access.boardId);
  assert.deepEqual((await offer(w, [`file:${ID_B}`], { idleKey: `drop-file-${ID_B}` })).body.suppressed, { reason: 'unfinished_roadmap' });
});

// ROADMAP_ON_DROP_ENABLED (global): 'false' makes a dropped source start nothing; unset or anything else is today's behavior.
test('on-drop off: a drop report answers a quiet not-started with no row; unset and true offer; typed requests and idle reports are not the drop', async t => {
  const w = await withFiles(t), count = () => rows(w.sqlite, 'SELECT * FROM learn_roadmap_invitations').length;
  const drop = (extra = {}) => offer(w, [`file:${ID_A}`], { idleKey: `drop-file-${ID_A}`, ...extra });
  assert.equal(roadmapOnDropEnabled({}), true); assert.equal(roadmapOnDropEnabled({ ROADMAP_ON_DROP_ENABLED: 'true' }), true); assert.equal(roadmapOnDropEnabled({ ROADMAP_ON_DROP_ENABLED: '0' }), true); assert.equal(roadmapOnDropEnabled({ ROADMAP_ON_DROP_ENABLED: 'false' }), false);
  const off = await drop({ onDrop: roadmapOnDropEnabled({ ROADMAP_ON_DROP_ENABLED: 'false' }) });
  assert.deepEqual([off.status, off.body], [200, { invitation: null, suppressed: { reason: 'on_drop_off' } }]);
  assert.equal(count(), 0, 'nothing was written and no quota was reserved');
  assert.equal((await drop({ onDrop: roadmapOnDropEnabled({}) })).body.invitation.state, 'offered', 'unset: today');
  assert.equal(count(), 1);
  // Only the drop is gated: the unsolicited idle report keeps its own rules, and an offered invitation is still read back after the flag is turned off.
  assert.equal((await offer(w, [`file:${ID_B}`], { onDrop: false })).body.invitation.state, 'offered', 'an idle report is not a drop');
  assert.equal((await pendingInvitation(w.LEARN_DB, w.access)).body.invitation.state, 'offered');
});
