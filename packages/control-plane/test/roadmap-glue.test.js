// R4 integration glue, focused: the platform model transport (stable identity, checkpoints, quota, unknown outcomes, an injected registry), the
// per-learner quota counters, the safety classifier's request/coverage, invitations (two choices, dismissal scope, Auto-suggest, Ask, ownership),
// the scheduler hook and the preview write allowance. Doubles only: no model, no JEV, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platformCallModel, platformJevAsk, makeClassify, safetyRequest, ROLES } from '../src/roadmap/roadmap-models.js';
import { operationOf } from '../src/learn-spend-ledger.js';
import { reserveRoadmapQuota } from '../src/roadmap/roadmap-quota.js';
import { ROADMAP_LIMITS } from '../src/roadmap/roadmap-policy.js';
import { offerInvitation, pendingInvitation, dismissInvitation } from '../src/roadmap/roadmap-invitations.js';
import { scheduledRoadmapKick } from '../src/roadmap/roadmap-wire.js';
import { SAFETY_QUESTIONS } from '../src/agents/roadmap-check.js';
import { spendTransport } from '../src/learn-spend.js';
import { world, rows, MODEL } from './roadmap-fixture.js';
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

test('a quota refusal stops the model call before it is planned or dispatched', async t => {
  const w = world(t), seen = [];
  const hourStart = Math.floor(Date.now() / 1000 / 3600) * 3600;
  w.sqlite.prepare("INSERT INTO learn_roadmap_quota (org, owner_user_id, scope, window_start, calls, micros) VALUES ('team', 'u-alice', 'plan.hour', ?, ?, 0)").run(hourStart, ROADMAP_LIMITS.quotas.perHour.plan);
  const callModel = platformCallModel(w.env, w.access, { roadmapId: ROADMAP, version: 1, quota: 'plan', registry: REGISTRY, transport: ledgered(seen) });
  await assert.rejects(callModel('roadmap_draft', BODY), { code: 'quota_exhausted' });
  assert.equal(seen.length, 0);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmap_calls').length, 0);
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
    VALUES ('rm_x', 'team', 'u-alice', 'u-alice@example.test', ?, 'learn', 'paused', 1, 'standard', 'k', 'r', '{}', 'f', 10, 'p', 1, 1)`).run(w.access.boardId);
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
