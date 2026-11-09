// R4.02 / R4.07 state and whole-step acceptance: one unfinished roadmap per learner and board, replay-safe actions, and an acceptance that is
// one transaction with its authorization. Real consolidated schema on node:sqlite; no provider is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoadmap, acceptRoadmapStep, readRoadmap, offerProposal } from '../src/roadmap/roadmap-store.js';
import { usageTotals, periodOf } from '../src/learn-usage.js';
import { StateError } from '../src/roadmap/roadmap-contract.js';
import { world, offered, accessFor, rows, usd, NEED } from './roadmap-fixture.js';

const PERIOD = periodOf(Math.floor(Date.now() / 1000));
const create = (w, access, key, over = {}) => createRoadmap(w.LEARN_DB, access, { actionKey: key, app: 'learn', instruction: 'Teach me Y', source: { key: 'file:fs_a', rev: 'rev1' }, scopeFingerprint: 'fp1', depth: 'balanced', ...over });
const rejects = (promise, code) => assert.rejects(promise, error => error instanceof StateError && error.code === code);

test('one unfinished roadmap per learner and board, enforced by the database; another learner is independent', async t => {
  const w = world(t);
  const first = await create(w, w.access, 'create-key-0001');
  assert.equal(first.status, 202);
  await rejects(create(w, w.access, 'create-key-0002'), 'roadmap_unfinished_exists');
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmaps').length, 1, 'the refused create left nothing behind');
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmap_instructions').length, 1);
  await create(w, accessFor('u-bob'), 'create-key-0003');
  await create(w, accessFor('u-alice', 'lb_other00000000000002'), 'create-key-0004');
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmaps').length, 3);
});

test('the learner instruction is stored verbatim as version 1', async t => {
  const w = world(t);
  await create(w, w.access, 'create-key-0001', { instruction: 'I already know X, teach me Y' });
  assert.equal(rows(w.sqlite, 'SELECT text, version, origin FROM learn_roadmap_instructions')[0].text, 'I already know X, teach me Y');
});

test('a repeated action key returns the recorded outcome; the same key with another payload is a 409', async t => {
  const w = world(t);
  const first = await create(w, w.access, 'create-key-0001');
  const again = await create(w, w.access, 'create-key-0001');
  assert.deepEqual(again, { ...first, replayed: true });
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmaps').length, 1);
  await rejects(create(w, w.access, 'create-key-0001', { scopeFingerprint: 'other' }), 'action_key_reused');
});

test('acceptance: one transaction writes the hold, authorization, allocation, result slot with a minted card id, accepted decision and the step move', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  const done = await acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001' });
  assert.equal(done.status, 202);
  const [slot] = done.body.slots;
  assert.match(slot.cardId, /^cd_[0-9a-f]{24}$/);
  const result = rows(w.sqlite, 'SELECT * FROM learn_step_results')[0];
  assert.deepEqual([result.card_id, result.decision, result.generation, result.validation, result.billing, result.delivery], [slot.cardId, 'accepted', 'pending', 'pending', 'pending', 'not_delivered']);
  assert.equal(result.body_json, null);
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_step_proposals')[0].state, 'accepted');
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_roadmap_steps WHERE id = ?', o.stepId)[0].state, 'generating');
  const [auth] = rows(w.sqlite, 'SELECT * FROM learn_step_authorizations');
  const [alloc] = rows(w.sqlite, 'SELECT * FROM learn_step_allocations');
  assert.equal(auth.state, 'admitted');
  assert.equal(alloc.bound_micros, auth.aggregate_micros);
  const hold = rows(w.sqlite, 'SELECT * FROM usage_attempts WHERE attempt_id = ?', auth.hold_attempt_id)[0];
  assert.deepEqual([hold.kind, hold.cost_state, hold.status, hold.reserved_micros], ['tool', 'reserved', 'running', auth.aggregate_micros]);
  const totals = await usageTotals(w.LEARN_DB, 'u-alice', PERIOD);
  assert.equal(totals.reserved, auth.aggregate_micros, 'the existing balance counts the step hold');
  assert.equal(totals.used, 0);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmap_outbox').length, 1, 'the event committed with the fact');
  assert.equal((await readRoadmap(w.LEARN_DB, w.access, o.roadmapId)).revision, o.revision + 1);
});

test('replay of the same acceptance returns the recorded outcome and buys nothing again', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  const args = { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001' };
  const first = await acceptRoadmapStep(w.env, w.access, args);
  const second = await acceptRoadmapStep(w.env, w.access, args);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.body, first.body);
  assert.equal(rows(w.sqlite, "SELECT * FROM usage_attempts WHERE kind = 'tool'").length, 1);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_authorizations').length, 1);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_results').length, 1);
});

test('duplicate acceptance from two devices (different keys, concurrent): one purchase, one result slot, the loser gets a 409 with the current state', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  const go = key => acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: key })
    .then(value => ({ value }), error => ({ error }));
  const [a, b] = await Promise.all([go('device-a-key-001'), go('device-b-key-001')]);
  const won = [a, b].filter(x => x.value), lost = [a, b].filter(x => x.error);
  assert.equal(won.length, 1);
  assert.equal(lost.length, 1);
  assert.equal(lost[0].error.status, 409);
  assert.equal(lost[0].error.reply.currentRevision, o.revision + 1);
  assert.equal(rows(w.sqlite, "SELECT * FROM usage_attempts WHERE kind = 'tool'").length, 1);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_authorizations').length, 1);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_results').length, 1);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmap_actions WHERE operation = ?', 'accept_proposal').length, 1);
});

test('a later device with a new key, after the version was accepted, is a 409 that names the current state and buys nothing', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  const args = { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion };
  await acceptRoadmapStep(w.env, w.access, { ...args, actionKey: 'device-a-key-001' });
  await assert.rejects(acceptRoadmapStep(w.env, w.access, { ...args, actionKey: 'device-b-key-001' }), error => error.status === 409 && error.reply.currentRevision === o.revision + 1);
  assert.equal(rows(w.sqlite, "SELECT * FROM usage_attempts WHERE kind = 'tool'").length, 1);
});

test('stale revision or proposal version: 409 with the current revision and proposal version, nothing written', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  const base = { roadmapId: o.roadmapId, proposalId: o.proposalId, actionKey: 'accept-key-0001' };
  await assert.rejects(acceptRoadmapStep(w.env, w.access, { ...base, revision: o.revision - 1, proposalVersion: o.proposalVersion }), e => e.status === 409 && e.code === 'stale_revision'
    && e.reply.currentRevision === o.revision && e.reply.currentProposalVersion === o.proposalVersion);
  await assert.rejects(acceptRoadmapStep(w.env, w.access, { ...base, revision: o.revision, proposalVersion: o.proposalVersion + 1 }), e => e.status === 409);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmap_actions WHERE operation = ?', 'accept_proposal').length, 0);
  assert.equal(rows(w.sqlite, 'SELECT * FROM usage_attempts').length, 0);
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_step_proposals')[0].state, 'pending');
});

test('insufficient allowance for the whole step: the proposal stays pending, acceptance is unconsumed, and the same key succeeds once credits exist', async t => {
  const w = world(t, { allowanceMicros: 100 });
  const o = await offered(w, w.access);
  const args = { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001' };
  const refused = await acceptRoadmapStep(w.env, w.access, args);
  assert.equal(refused.refusal.reason, 'allowance_insufficient');
  assert.equal(refused.refusal.period, PERIOD);
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_step_proposals')[0].state, 'pending');
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmap_actions WHERE operation = ?', 'accept_proposal').length, 0, 'no receipt: the action key is not consumed');
  for (const table of ['learn_step_authorizations', 'learn_step_allocations', 'learn_step_results', 'learn_roadmap_outbox']) assert.equal(rows(w.sqlite, `SELECT * FROM ${table}`).length, 0, table);
  assert.equal(rows(w.sqlite, "SELECT * FROM usage_attempts WHERE kind = 'tool'").length, 0);
  assert.equal((await readRoadmap(w.LEARN_DB, w.access, o.roadmapId)).revision, o.revision);
  // Credits arrive (a larger grant): the very same request now wins.
  w.sqlite.prepare('UPDATE usage_grants SET allowance_micros = ?').run(10_000_000);
  const ok = await acceptRoadmapStep({ ...w.env, AI_MONTHLY_ALLOWANCE_USD: usd(10_000_000) }, w.access, args);
  assert.equal(ok.status, 202);
});

test('the allowance must cover the WHOLE step: exactly the aggregate admits, one micro less admits nothing', async t => {
  const aggregate = 2 * NEED; // legacy callMicros = NEED: one call (CORE.04) times the legacy retry factor
  for (const [allowance, admits] of [[aggregate, true], [aggregate - 1, false]]) {
    const w = world(t, { allowanceMicros: allowance });
    const o = await offered(w, w.access);
    const out = await acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001', callMicros: NEED });
    assert.equal(!out.refusal, admits, `allowance ${allowance}`);
    assert.equal(rows(w.sqlite, "SELECT * FROM usage_attempts WHERE kind = 'tool'").length, admits ? 1 : 0);
  }
});

test('an ordinary call cannot spend credits a roadmap step has reserved', async t => {
  const aggregate = 2 * NEED;
  const w = world(t, { allowanceMicros: aggregate + 10 });
  const o = await offered(w, w.access);
  await acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001', callMicros: NEED });
  const { spendTransport } = await import('../src/learn-spend.js');
  const { withUsage, noteUsageIdentity } = await import('../src/learn-usage.js');
  const ordinary = withUsage(w.env, { feature: 'ask' });
  noteUsageIdentity(ordinary, { userId: 'u-alice', email: 'u-alice@example.test' });
  const { body, MODEL } = await import('./roadmap-fixture.js');
  const response = await spendTransport(ordinary, body, MODEL, null, async () => assert.fail('provider must not be called'));
  assert.equal(response.status, 429);
  assert.equal((await response.json()).reason, 'reserved');
});

test('the one-offered-step index: a second offer while one is pending is refused', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  const step2 = rows(w.sqlite, 'SELECT id FROM learn_roadmap_steps WHERE roadmap_id = ? AND position = 2', o.roadmapId)[0];
  await rejects(offerProposal(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, expectedRevision: o.revision, actionKey: 'offer-two-00001', stepId: step2.id, format: 'table', title: 'Two', description: 'd', contentHash: 'h2' }), 'proposal_not_pending');
  assert.equal(rows(w.sqlite, "SELECT * FROM learn_step_proposals WHERE state IN ('checking', 'held', 'pending')").length, 1);
});

test('another learner cannot name this roadmap or proposal: 404, nothing changes', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  await assert.rejects(acceptRoadmapStep(w.env, accessFor('u-mallory'), { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001' }), e => e.status === 404);
  await assert.rejects(acceptRoadmapStep(w.env, { ...w.access, role: 'editor' }, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0002' }), e => e.status === 403);
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_step_proposals')[0].state, 'pending');
});

test('a batch failure leaves no receipt, no hold and no orphan slot (injected failure on the last statement)', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  w.sqlite.exec("CREATE TRIGGER boom BEFORE INSERT ON learn_roadmap_outbox BEGIN SELECT RAISE(ABORT, 'synthetic outage'); END");
  await assert.rejects(acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001' }), /synthetic outage/);
  for (const table of ['learn_step_authorizations', 'learn_step_allocations', 'learn_step_results']) assert.equal(rows(w.sqlite, `SELECT * FROM ${table}`).length, 0, table);
  assert.equal(rows(w.sqlite, "SELECT * FROM usage_attempts WHERE kind = 'tool'").length, 0);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_roadmap_actions WHERE operation = ?', 'accept_proposal').length, 0);
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_step_proposals')[0].state, 'pending');
});
