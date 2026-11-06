// R4.06 / R4.07 / R4.11 money: stable provider identity, the step hold's per-call transfer (never a double reservation), release on completion,
// failure refunds, unknown outcomes and the entitlement predicate. Real schema on node:sqlite; the provider is a counting mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptRoadmapStep, recordGenerated, readEntitledResult, failCard, acknowledgeDelivery } from '../src/roadmap/roadmap-store.js';
import { withRoadmapProviderCall, learnerUsageEnv, planCall, callMayBeSent, markCallUnknown, advanceCall } from '../src/roadmap/roadmap-money.js';
import { spendTransport } from '../src/learn-spend.js';
import { admitSpend } from '../src/learn-spend-ledger.js';
import { usageTotals, periodOf } from '../src/learn-usage.js';
import { world, offered, accessFor, rows, provider, body, MODEL, NEED } from './roadmap-fixture.js';

const PERIOD = periodOf(Math.floor(Date.now() / 1000));
const AGG = 4 * NEED; // callMicros = NEED: two generation calls and one automatic retry

// A roadmap accepted with a step hold; the helpers a job would use for its calls.
async function accepted(t, { allowance = 10_000_000 } = {}) {
  const w = world(t, { allowanceMicros: allowance });
  const o = await offered(w, w.access);
  const done = await acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001', callMicros: NEED });
  const { resultId, cardId } = done.body.slots[0];
  const authorizationId = done.body.authorizationId;
  const totals = () => usageTotals(w.LEARN_DB, 'u-alice', PERIOD);
  const call = async (n, retry, transport, { platform = false } = {}) => {
    const usage = learnerUsageEnv(w.env, w.access, o.proposalId, o.proposalVersion);
    const { env, opId, key } = await withRoadmapProviderCall(usage, { proposalId: o.proposalId, proposalVersion: o.proposalVersion, cardId, stage: n === 0 ? 'generate' : 'repair', call: n, retry, authorizationId }, { kind: n === 0 ? 'generation' : 'repair', platform });
    await planCall(w.LEARN_DB, w.access, { opId, key, roadmapId: o.roadmapId, resultId, authorizationId, stage: n === 0 ? 'generate' : 'repair', call: n, retry, payer: 'learner', task: 'artifact', now: 1 });
    const response = await spendTransport(env, body, MODEL, w.access.org, transport, { userId: 'u-alice', category: 'roadmap' });
    return { response, opId };
  };
  return { w, o, resultId, cardId, authorizationId, totals, call };
}

test('a stable identity: the same fields give the same ledger id, any changed field a different one, and a malformed id is refused', async t => {
  const w = world(t);
  const fields = { proposalId: 'pr_000000000000000000000001', proposalVersion: 1, cardId: 'cd_000000000000000000000001', stage: 'generate', call: 0, retry: 0, authorizationId: 'az_000000000000000000000001' };
  const a = await withRoadmapProviderCall(w.env, fields), b = await withRoadmapProviderCall(w.env, fields);
  assert.equal(a.opId, b.opId);
  assert.match(a.opId, /^rm-generate-[0-9a-f]{32}$/);
  for (const change of [{ retry: 1 }, { call: 1 }, { stage: 'repair' }, { proposalVersion: 2 }, { cardId: 'cd_000000000000000000000002' }])
    assert.notEqual((await withRoadmapProviderCall(w.env, { ...fields, ...change })).opId, a.opId, JSON.stringify(change));
  await assert.rejects(withRoadmapProviderCall(w.env, { ...fields, cardId: 'x y' }), /server ids/);
});

test('a public client cannot choose an operation id: request headers and bodies never reach the ledger id', async t => {
  const { w, resultId, totals } = await accepted(t);
  const { withUsage, noteUsageIdentity } = await import('../src/learn-usage.js');
  const forged = withUsage({ ...w.env, 'x-rh-operation-id': 'rm-generate-forged00000000000000000000000000' }, { feature: 'ask', req: new Request('https://x.test', { headers: { 'x-rh-operation-id': 'rm-generate-forged00000000000000000000000000' } }) });
  noteUsageIdentity(forged, { userId: 'u-alice', email: 'u-alice@example.test' });
  const { calls, reply } = provider();
  await spendTransport(forged, body, MODEL, 'team', reply(), { userId: 'u-alice', category: 'ask' });
  assert.equal(calls.length, 1);
  assert.deepEqual(rows(w.sqlite, "SELECT op_id FROM usage_operations WHERE op_id LIKE 'rm-%'"), []);
  assert.ok(resultId && await totals());
  // and the ledger refuses a stable id that does not match the server pattern
  const bad = await admitSpend(w.LEARN_DB, w.env, { opId: 'Not A Server Id!', userId: 'u', org: 'team', category: 'roadmap', reservedUsd: 0.001, stable: true });
  assert.equal(bad.refused, true);
});

test('per-call transfer: the hold moves into the call reservation, held plus reserved never grows, and a replay never reaches the provider', async t => {
  const { w, totals, authorizationId, call } = await accepted(t);
  assert.equal((await totals()).reserved, AGG);
  const { calls, reply } = provider();
  const seen = [];
  const watched = async () => { seen.push({ ...(await totals()), alloc: rows(w.sqlite, 'SELECT remaining_micros FROM learn_step_allocations')[0].remaining_micros }); return reply()(); };
  const first = await call(0, 0, watched);
  assert.equal(first.response.status, 200);
  assert.deepEqual(seen.map(s => [s.reserved, s.alloc]), [[AGG, AGG - NEED]], 'during the call: still the aggregate reserved, the allocation shrank by exactly one reservation');
  const after = await totals();
  assert.equal(after.reserved, AGG - NEED, 'after settlement the transferred part became the actual charge, the rest of the hold remains');
  assert.ok(after.used > 0 && after.used < NEED);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_allocation_transfers').length, 1);
  assert.equal(rows(w.sqlite, 'SELECT remaining_micros FROM learn_step_authorizations WHERE id = ?', authorizationId)[0].remaining_micros, AGG - NEED);
  // The same call again (a restart, a double dispatch): the first admission stands and the provider is not asked twice.
  const again = await call(0, 0, reply());
  assert.equal(again.response.status, 409);
  assert.equal((await again.response.json()).code, 'operation_replayed');
  assert.equal(calls.length, 1);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_allocation_transfers').length, 1);
  assert.equal((await totals()).reserved, AGG - NEED);
});

test('the allocation is the bound: four calls fit, the fifth is refused and never falls back to the allowance', async t => {
  const { w, totals, call } = await accepted(t);
  const { calls, reply } = provider();
  for (let n = 0; n < 4; n++) assert.equal((await call(n % 2, Math.floor(n / 2), reply())).response.status, 200);
  assert.equal(calls.length, 4);
  const fifth = await call(2, 1, reply());
  assert.equal(fifth.response.status, 429);
  assert.equal(calls.length, 4, 'refused before the provider');
  assert.equal((await totals()).reserved, 0);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_allocation_transfers').length, 4);
});

test('a transfer that fails part way writes nothing: no platform row, no reservation, the hold is intact', async t => {
  const { w, totals, call } = await accepted(t);
  w.sqlite.exec("CREATE TRIGGER boom BEFORE INSERT ON learn_step_allocation_transfers BEGIN SELECT RAISE(ABORT, 'synthetic outage'); END");
  const { calls, reply } = provider();
  const out = await call(0, 0, reply());
  assert.equal(out.response.status, 503);
  assert.equal(calls.length, 0);
  assert.deepEqual(rows(w.sqlite, "SELECT * FROM usage_operations WHERE op_id LIKE 'rm-%'"), []);
  assert.equal((await totals()).reserved, AGG);
});

test('another learner cannot draw on this learner\'s step hold', async t => {
  const { w, o, cardId, authorizationId, totals } = await accepted(t);
  const { withUsage, noteUsageIdentity } = await import('../src/learn-usage.js');
  const mallory = withUsage(w.env, { feature: 'artifact', req: new Request('https://x.test', { headers: { 'x-rh-action-key': `rmact_${o.proposalId}_${o.proposalVersion}` } }) });
  noteUsageIdentity(mallory, { userId: 'u-mallory', email: 'm@example.test' });
  const { env } = await withRoadmapProviderCall(mallory, { proposalId: o.proposalId, proposalVersion: o.proposalVersion, cardId, stage: 'generate', call: 0, retry: 0, authorizationId });
  const { calls, reply } = provider();
  const response = await spendTransport(env, body, MODEL, 'team', reply(), { userId: 'u-mallory', category: 'roadmap' });
  assert.equal(response.status, 429);
  assert.equal(calls.length, 0);
  assert.equal((await totals()).reserved, AGG);
});

test('completion releases the unused allocation: the hold is sealed at zero, only the actual charge remains', async t => {
  const { w, resultId, totals, call } = await accepted(t);
  const { reply } = provider();
  await call(0, 0, reply());
  assert.equal(await recordGenerated(w.LEARN_DB, w.access, { resultId, primitive: 'explanation', body: { type: 'explanation', title: 't', body: 'b' }, validation: 'passed' }), true);
  const t1 = await totals();
  assert.equal(t1.reserved, 0);
  assert.ok(t1.used > 0);
  const [hold] = rows(w.sqlite, "SELECT status, cost_state, cost_micros, reserved_micros FROM usage_attempts WHERE kind = 'tool'");
  assert.deepEqual(hold, { status: 'settled', cost_state: 'settled', cost_micros: 0, reserved_micros: 0 });
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_step_authorizations')[0].state, 'released');
  // a second completion changes nothing
  assert.equal(await recordGenerated(w.LEARN_DB, w.access, { resultId, primitive: 'explanation', body: { type: 'explanation' }, validation: 'passed' }), false);
});

test('a terminal failure refunds the card once, keeps the provider expense, releases the hold and closes the step (skipped: no recovery, owner 2026-11-06)', async t => {
  const { w, o, resultId, totals, call } = await accepted(t);
  const { reply } = provider();
  const { opId } = await call(0, 0, reply());
  const cost = rows(w.sqlite, 'SELECT cost_micros FROM usage_attempts WHERE attempt_id = ?', opId)[0].cost_micros;
  const providerBefore = rows(w.sqlite, 'SELECT cost_usd FROM usage_operations WHERE op_id = ?', opId)[0].cost_usd;
  assert.equal((await totals()).used, cost);
  const failed = await failCard(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, failureClass: 'terminal_validation_failure' });
  assert.deepEqual(failed.body, { resultId, failureClass: 'terminal_validation_failure', retry: false, retryNo: null });
  assert.equal((await totals()).used, 0, 'the learner is no longer charged');
  assert.equal((await totals()).reserved, 0);
  assert.equal(rows(w.sqlite, 'SELECT refunded_micros FROM usage_attempt_detail WHERE attempt_id = ?', opId)[0].refunded_micros, cost);
  assert.equal(rows(w.sqlite, 'SELECT cost_usd FROM usage_operations WHERE op_id = ?', opId)[0].cost_usd, providerBefore, 'provider expense is unchanged');
  assert.equal(rows(w.sqlite, 'SELECT cost_micros, cost_state FROM usage_attempts WHERE attempt_id = ?', opId)[0].cost_micros, cost);
  const [result] = rows(w.sqlite, 'SELECT generation, billing, failure_class FROM learn_step_results');
  assert.deepEqual(result, { generation: 'failed', billing: 'refunded', failure_class: 'terminal_validation_failure' });
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_roadmap_steps WHERE id = ?', o.stepId)[0].state, 'skipped');
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_step_authorizations')[0].state, 'released');
  // replay: nothing is refunded twice, no second adjustment
  const again = await failCard(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, failureClass: 'terminal_validation_failure' });
  assert.equal(again.replayed, true);
  assert.equal(rows(w.sqlite, 'SELECT * FROM usage_adjustments').length, 1);
  assert.equal((await totals()).used, 0);
});

test('a transient failure refunds before its one automatic retry; the second failure is terminal', async t => {
  const { w, o, resultId, totals, call } = await accepted(t);
  const { reply } = provider();
  await call(0, 0, reply());
  const first = await failCard(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, failureClass: 'transient_provider_failure' });
  assert.deepEqual([first.body.retry, first.body.retryNo], [true, 1]);
  assert.equal((await totals()).used, 0, 'refunded before the retry is dispatched');
  assert.deepEqual(rows(w.sqlite, 'SELECT generation, billing FROM learn_step_results')[0], { generation: 'pending', billing: 'pending' });
  assert.notEqual(rows(w.sqlite, 'SELECT state FROM learn_roadmap_steps WHERE id = ?', o.stepId)[0].state, 'incomplete');
  // the retry runs under a fresh operation identity and is charged again
  assert.equal((await call(0, 1, reply())).response.status, 200);
  assert.ok((await totals()).used > 0);
  const second = await failCard(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, failureClass: 'transient_provider_failure' });
  assert.equal(second.body.retry, false, 'one automatic retry only');
  assert.equal((await totals()).used, 0);
  assert.equal(rows(w.sqlite, 'SELECT generation, billing FROM learn_step_results')[0].billing, 'refunded');
  assert.equal(rows(w.sqlite, 'SELECT * FROM usage_adjustments').length, 2, 'one adjustment per refunded attempt');
});

test('a clarification or policy failure never earns an automatic retry', async t => {
  const { w, o, resultId, call } = await accepted(t);
  await call(0, 0, provider().reply());
  for (const failureClass of ['clarification', 'policy_block']) {
    const out = await failCard(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, failureClass });
    assert.equal(out.body.retry, false, failureClass);
    break;
  }
});

test('an unknown provider outcome: the learner is charged zero, nothing is refunded, the call is never resent blindly', async t => {
  const { w, o, resultId, totals, call } = await accepted(t);
  const { opId } = await call(0, 0, async () => { throw new Error('connection dropped'); }).catch(async () => ({ opId: rows(w.sqlite, "SELECT op_id FROM usage_operations WHERE op_id LIKE 'rm-%'")[0].op_id }));
  const [attempt] = rows(w.sqlite, 'SELECT cost_state, cost_micros FROM usage_attempts WHERE attempt_id = ?', opId);
  assert.deepEqual(attempt, { cost_state: 'unknown', cost_micros: null });
  assert.equal((await totals()).used, 0);
  assert.ok(rows(w.sqlite, 'SELECT cost_usd FROM usage_operations WHERE op_id = ?', opId)[0].cost_usd > 0, 'the provider bound stays on the platform ledger, never rewritten as zero');
  await advanceCall(w.LEARN_DB, opId, 'admitted', { now: 2 });
  await advanceCall(w.LEARN_DB, opId, 'dispatched', { now: 3 });
  assert.equal(await callMayBeSent(w.LEARN_DB, opId), false, 'dispatched: a retry must reconcile first');
  assert.equal(await markCallUnknown(w.LEARN_DB, opId, 4), true);
  assert.equal(await callMayBeSent(w.LEARN_DB, opId), false);
  const out = await failCard(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, failureClass: 'unknown_provider_outcome' });
  assert.equal(out.body.retry, false);
  assert.equal(rows(w.sqlite, 'SELECT * FROM usage_adjustments').length, 0, 'zero charged, so zero refunded');
});

test('entitlement: nothing is served before acceptance, checks and billing; the same predicate for another learner is a no', async t => {
  const { w, o, resultId, call } = await accepted(t);
  const ask = who => readEntitledResult(w.LEARN_DB, who, { roadmapId: o.roadmapId, resultId });
  assert.equal(await ask(w.access), null, 'generation pending');
  await call(0, 0, provider().reply());
  await recordGenerated(w.LEARN_DB, w.access, { resultId, primitive: 'explanation', body: { type: 'explanation', title: 'T', body: 'secret body' }, validation: 'held' });
  assert.equal(await ask(w.access), null, 'held for checking: withheld');
  assert.equal(await acknowledgeDelivery(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, expectedRevision: o.revision + 1, actionKey: 'ack-key-00001', cardIds: ['cd_none'] }).catch(e => e.code), 'held_for_checking');
  w.sqlite.prepare("UPDATE learn_step_results SET validation = 'passed'").run();
  const served = await ask(w.access);
  assert.equal(served.block.body, 'secret body');
  assert.equal(await ask(accessFor('u-mallory')), null, 'a result id is never access');
  assert.equal(await ask({ ...w.access, boardId: 'lb_other00000000000002' }), null);
  w.sqlite.prepare("UPDATE learn_step_results SET billing = 'refunded'").run();
  assert.equal(await ask(w.access), null, 'a refunded result is not served again without a new authorized recovery');
});

test('delivery: the acknowledgement must name exactly the minted card and is replay-safe', async t => {
  const { w, o, resultId, cardId, call } = await accepted(t);
  await call(0, 0, provider().reply());
  await recordGenerated(w.LEARN_DB, w.access, { resultId, primitive: 'table', body: { type: 'table' }, validation: 'passed' });
  const ack = (cardIds, key = 'ack-key-00001', boardVersion = 7) => acknowledgeDelivery(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, expectedRevision: o.revision + 1, actionKey: key, cardIds, boardVersion });
  await assert.rejects(ack(['cd_forged00000000000000000']), e => e.code === 'invalid_request');
  // Delivered needs the card in a SAVED board at the named revision: no revision, an unsaved card and a revision newer than the save are all refused.
  await assert.rejects(ack([cardId], 'ack-key-00002', null), e => e.code === 'invalid_request' && e.status === 400);
  await assert.rejects(ack([cardId]), e => e.code === 'card_not_saved', 'the board does not hold the card yet');
  w.sqlite.prepare('UPDATE learn_boards SET state_json = ?, version = 6 WHERE id = ?').run(JSON.stringify({ blocks: [{ id: cardId }] }), w.access.boardId);
  await assert.rejects(ack([cardId]), e => e.code === 'card_not_saved', 'revision 7 is not saved yet (the board is at 6)');
  assert.equal(rows(w.sqlite, 'SELECT delivery FROM learn_step_results')[0].delivery, 'not_delivered', 'a refused acknowledgement delivers nothing');
  w.sqlite.prepare('UPDATE learn_boards SET version = 7 WHERE id = ?').run(w.access.boardId);
  const done = await ack([cardId]);
  assert.equal(done.body.delivery, 'delivered');
  assert.equal((await ack([cardId])).replayed, true);
  assert.equal(rows(w.sqlite, 'SELECT delivered_count FROM learn_roadmaps')[0].delivered_count, 1);
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_roadmap_steps WHERE id = ?', o.stepId)[0].state, 'delivered');
});
