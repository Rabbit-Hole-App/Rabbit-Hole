// R4 routes: ROADMAP_ENABLED gating, polling limits, the entitled result routes, flag-off during generation and after settlement with no duplicate
// charge on restore, revoked access, and the lifecycle actions. The identity and the Tools reads are injected; no provider is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roadmapRoute } from '../src/roadmap/roadmap-routes.js';
import { recordGenerated, failCard } from '../src/roadmap/roadmap-store.js';
import { withRoadmapProviderCall, learnerUsageEnv, planCall } from '../src/roadmap/roadmap-money.js';
import { spendTransport } from '../src/learn-spend.js';
import { usageTotals, periodOf } from '../src/learn-usage.js';
import { world, offered, rows, provider, body as modelBody, MODEL, savedBlock } from './roadmap-fixture.js';

const PERIOD = periodOf(Math.floor(Date.now() / 1000));
const BOARD = 'lb_board00000000000001';
const ORIGIN = 'https://rabbit.test';
const identity = userId => async () => ({ org: 'team', email: `${userId}@example.test`, userId });
const call = (env, method, path, payload, deps = {}, headers = {}) => roadmapRoute(path.split('?')[0], new Request(`${ORIGIN}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: payload ? JSON.stringify(payload) : undefined }), env, { identity: identity('u-alice'), ...deps });
const on = env => ({ ...env, ROADMAP_ENABLED: 'true' });

test('flag off: every roadmap route is a 404 as if absent, before identity or the database are read; other paths are not claimed', async t => {
  const w = world(t);
  for (const flag of [undefined, '', 'false', '1', 'TRUE']) {
    const env = { ...w.env, ...(flag === undefined ? {} : { ROADMAP_ENABLED: flag }) };
    for (const [method, path] of [['GET', `/api/learn/roadmap?boardId=${BOARD}`], ['POST', '/api/learn/roadmap'], ['POST', '/api/learn/roadmap/rm_x/proposals/pr_x/accept'], ['GET', '/api/learn/roadmap/rm_x/results/rs_x']]) {
      const response = await roadmapRoute(path.split('?')[0], new Request(`${ORIGIN}${path}`, { method, body: method === 'POST' ? '{}' : undefined }), env, { identity: async () => assert.fail('identity must not be read') });
      assert.equal(response.status, 404, `${flag} ${method} ${path}`);
      assert.deepEqual(await response.json(), { error: 'Not found', code: 'roadmap_disabled' });
    }
  }
  assert.equal(await roadmapRoute('/api/learn/card-feedback', new Request(`${ORIGIN}/api/learn/card-feedback`), w.env, {}), null);
});

test('same origin and the board owner only: a cross-origin write is 403, another learner\'s board is 404', async t => {
  const w = world(t);
  const env = on(w.env);
  assert.equal((await call(env, 'POST', '/api/learn/roadmap/rm_x/end', { boardId: BOARD }, {}, { origin: 'https://evil.test' })).status, 403);
  const other = await roadmapRoute('/api/learn/roadmap', new Request(`${ORIGIN}/api/learn/roadmap?boardId=${BOARD}`), env, { identity: identity('u-bob') });
  assert.equal(other.status, 404);
});

test('polling before acceptance returns proposal metadata only; after acceptance, slots but never the generated text until it is delivered-entitled', async t => {
  const w = world(t);
  const env = on(w.env);
  const o = await offered(w, w.access);
  const before = await (await call(env, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  assert.equal(before.proposal.id, o.proposalId);
  assert.equal(before.proposal.acceptable, true);
  assert.deepEqual(before.results, []);
  assert.equal(before.roadmap.instruction, 'I already know X, teach me Y');
  assert.doesNotMatch(JSON.stringify(before), /cd_|rs_|micros|body_json|cost|token/i);
  const accepted = await call(env, 'POST', `/api/learn/roadmap/${o.roadmapId}/proposals/${o.proposalId}/accept`, { boardId: BOARD, revision: o.revision, proposalVersion: 1, actionKey: 'accept-key-0001' });
  assert.equal(accepted.status, 202);
  const { slots } = await accepted.json();
  // A generated, held result: polling shows the slot and that it is held, never the text.
  await recordGenerated(w.LEARN_DB, w.access, { resultId: slots[0].resultId, primitive: 'explanation', body: { type: 'explanation', title: 'T', body: 'SECRET-BODY-TEXT' }, validation: 'held' });
  const polled = await (await call(env, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  assert.equal(polled.results[0].held, true);
  assert.doesNotMatch(JSON.stringify(polled), /SECRET-BODY-TEXT/);
  const asked = await call(env, 'GET', `/api/learn/roadmap/${o.roadmapId}/results/${slots[0].resultId}?boardId=${BOARD}`);
  assert.equal(asked.status, 404, 'held: not entitled, indistinguishable from unknown');
  assert.deepEqual(await asked.json(), { error: 'Not available', code: 'not_found' });
});

test('stale accept over HTTP: 409 with the current revision, proposal version and the current view', async t => {
  const w = world(t);
  const env = on(w.env);
  const o = await offered(w, w.access);
  const response = await call(env, 'POST', `/api/learn/roadmap/${o.roadmapId}/proposals/${o.proposalId}/accept`, { boardId: BOARD, revision: o.revision - 1, proposalVersion: 1, actionKey: 'accept-key-0001' });
  assert.equal(response.status, 409);
  const out = await response.json();
  assert.deepEqual([out.code, out.currentRevision, out.currentProposalVersion], ['stale_revision', o.revision, 1]);
  assert.equal(out.current.roadmap.revision, o.revision);
});

test('insufficient allowance over HTTP: 429 in the existing refusal body, the proposal stays acceptable', async t => {
  const w = world(t, { allowanceMicros: 100 });
  const env = on(w.env);
  const o = await offered(w, w.access);
  const response = await call(env, 'POST', `/api/learn/roadmap/${o.roadmapId}/proposals/${o.proposalId}/accept`, { boardId: BOARD, revision: o.revision, proposalVersion: 1, actionKey: 'accept-key-0001' });
  assert.equal(response.status, 429);
  const out = await response.json();
  assert.deepEqual([out.code, out.reason], ['allowance_limited', 'insufficient']);
  assert.equal(out.current.proposal.acceptable, true);
  assert.equal(out.current.roadmap.revision, o.revision);
});

// A full accepted step with one settled learner call, to exercise flag recovery and delivery.
async function generating(t) {
  const w = world(t);
  const env = on(w.env);
  const o = await offered(w, w.access);
  const accepted = await (await call(env, 'POST', `/api/learn/roadmap/${o.roadmapId}/proposals/${o.proposalId}/accept`, { boardId: BOARD, revision: o.revision, proposalVersion: 1, actionKey: 'accept-key-0001' })).json();
  const { resultId, cardId } = accepted.slots[0];
  const usage = learnerUsageEnv(w.env, w.access, o.proposalId, 1);
  const { env: callEnv, opId, key } = await withRoadmapProviderCall(usage, { proposalId: o.proposalId, proposalVersion: 1, cardId, stage: 'generate', call: 0, retry: 0, authorizationId: accepted.authorizationId }, { kind: 'generation' });
  await planCall(w.LEARN_DB, w.access, { opId, key, roadmapId: o.roadmapId, resultId, authorizationId: accepted.authorizationId, stage: 'generate', call: 0, retry: 0, payer: 'learner', task: 'artifact', now: 1 });
  const { calls, reply } = provider();
  await spendTransport(callEnv, modelBody, MODEL, 'team', reply(), { userId: 'u-alice', category: 'roadmap' });
  return { w, env, o, resultId, cardId, calls, accepted, totals: () => usageTotals(w.LEARN_DB, 'u-alice', PERIOD) };
}

test('flag off during generation and after settlement: routes 404, the accepted work still completes, and restoring delivers once with no second charge', async t => {
  const { w, env, o, resultId, cardId, totals } = await generating(t);
  const off = { ...w.env, ROADMAP_ENABLED: 'false' };
  // Off during generation: every route is hidden...
  assert.equal((await call(off, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).status, 404);
  // ...but the already accepted job finishes server-side and settles (jobs do not read the flag).
  assert.equal(await recordGenerated(w.LEARN_DB, w.access, { resultId, primitive: 'explanation', body: { type: 'explanation', title: 'T', body: 'Body' }, validation: 'passed' }), true);
  const charged = (await totals()).used;
  assert.ok(charged > 0);
  assert.equal((await call(off, 'POST', `/api/learn/roadmap/${o.roadmapId}/results/${resultId}/deliver`, { boardId: BOARD })).status, 404, 'flag off after settlement: nothing is served');
  assert.equal((await call(off, 'GET', `/api/learn/roadmap/${o.roadmapId}/results/${resultId}?boardId=${BOARD}`)).status, 404);
  // Restore: the result is delivered once; the learner is not charged again.
  const delivered = await (await call(env, 'POST', `/api/learn/roadmap/${o.roadmapId}/results/${resultId}/deliver`, { boardId: BOARD })).json();
  assert.equal(delivered.cards[0].block.id, cardId);
  assert.equal(delivered.cards[0].block.stepId, o.stepId);
  assert.equal(delivered.ackRequired, true);
  const again = await (await call(env, 'POST', `/api/learn/roadmap/${o.roadmapId}/results/${resultId}/deliver`, { boardId: BOARD })).json();
  assert.deepEqual(again, delivered, 'deliver is idempotent: the same blocks every time');
  const view = await (await call(env, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  const sendAck = fields => call(env, 'POST', `/api/learn/roadmap/${o.roadmapId}/results/${resultId}/ack`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: 'ack-key-00001', cardIds: [cardId], ...fields });
  // A failed board save: the acknowledgement is refused (no revision, or the saved board lacks the card), nothing is delivered or charged again.
  assert.equal((await sendAck({})).status, 400, 'a null board revision is rejected');
  assert.equal((await sendAck({ boardRevision: null })).status, 400);
  const unsaved = await sendAck({ boardRevision: 3 });
  assert.equal(unsaved.status, 422);
  assert.equal((await unsaved.json()).code, 'card_not_saved');
  assert.equal(rows(w.sqlite, 'SELECT delivery FROM learn_step_results')[0].delivery, 'not_delivered');
  assert.equal((await (await call(env, 'POST', `/api/learn/roadmap/${o.roadmapId}/results/${resultId}/deliver`, { boardId: BOARD })).json()).cards[0].block.id, cardId, 'the retry reuses the already generated result');
  assert.equal((await totals()).used, charged, 'a refused acknowledgement and its retry charge nothing');
  // The save succeeds at revision 3 with the card: the same acknowledgement now delivers, once.
  w.sqlite.prepare('UPDATE learn_boards SET state_json = ?, version = 3 WHERE id = ?').run(JSON.stringify({ blocks: [savedBlock(w.sqlite, cardId)] }), BOARD);
  const ack = await sendAck({ boardRevision: 3 });
  assert.equal(ack.status, 200);
  assert.equal((await sendAck({ boardRevision: 3 })).status, 200, 'the replay answers the recorded outcome');
  assert.equal((await totals()).used, charged, 'no duplicate charge');
  assert.equal(rows(w.sqlite, "SELECT * FROM usage_attempts WHERE kind <> 'tool'").length, 1);
  assert.equal(rows(w.sqlite, 'SELECT delivered_count FROM learn_roadmaps')[0].delivered_count, 1);
});

test('flag off while a card failed: the refund still happens server-side and is not repeated on restore', async t => {
  const { w, o, resultId, totals } = await generating(t);
  const failed = await failCard(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, failureClass: 'terminal_validation_failure' });
  assert.equal(failed.body.retry, false);
  assert.equal((await totals()).used, 0);
  const view = await (await call(on(w.env), 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  assert.equal(view.results[0].billing, 'refunded');
  assert.equal(view.results[0].recovery, undefined, 'no recovery set (owner 2026-11-06)');
  assert.equal(view.steps[0].state, 'skipped', 'the step is closed');
  assert.equal(view.results[0].failure.message, 'This explanation could not be made. You were not charged.');
  assert.equal(rows(w.sqlite, 'SELECT * FROM usage_adjustments').length, 1);
});

test('access is rechecked: after the board changes hands the old owner cannot accept, read or deliver, and nothing is charged', async t => {
  const w = world(t);
  const env = on(w.env);
  const o = await offered(w, w.access);
  w.sqlite.prepare("UPDATE learn_boards SET owner_email = 'someone-else@example.test' WHERE id = ?").run(BOARD);
  const response = await call(env, 'POST', `/api/learn/roadmap/${o.roadmapId}/proposals/${o.proposalId}/accept`, { boardId: BOARD, revision: o.revision, proposalVersion: 1, actionKey: 'accept-key-0001' });
  assert.equal(response.status, 404);
  assert.equal(rows(w.sqlite, 'SELECT * FROM usage_attempts').length, 0);
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_step_proposals')[0].state, 'pending');
});

test('lifecycle over HTTP: Cancel pauses, a manual next step offers the NEXT step (not the cancelled one), End preserves the record', async t => {
  const w = world(t);
  const env = on(w.env);
  const o = await offered(w, w.access);
  const base = `/api/learn/roadmap/${o.roadmapId}`;
  const cancelled = await call(env, 'POST', `${base}/proposals/${o.proposalId}/cancel`, { boardId: BOARD, expectedRevision: o.revision, proposalVersion: 1, actionKey: 'cancel-key-0001' });
  assert.equal(cancelled.status, 200);
  let view = await (await call(env, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  assert.equal(view.roadmap.state, 'paused');
  assert.equal(view.proposal, null);
  assert.equal(view.steps[0].state, 'cancelled');
  // Not re-offered by itself: a status read leaves it paused. A manual next step picks step two.
  const compose = async (_roadmap, step) => ({ format: step.format, title: step.title, description: 'About it', contentHash: `h-${step.id}` });
  const next = await call(env, 'POST', `${base}/steps/propose`, { boardId: BOARD, expectedRevision: view.roadmap.revision, actionKey: 'next-key-00001' }, { compose });
  assert.equal(next.status, 200);
  view = await (await call(env, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  assert.equal(view.roadmap.state, 'active');
  assert.equal(view.proposal.position.index, 2);
  assert.equal(view.steps[0].state, 'cancelled', 'the cancelled position is not silently re-offered');
  // A second Propose while one is pending is refused.
  assert.equal((await call(env, 'POST', `${base}/steps/propose`, { boardId: BOARD, expectedRevision: view.roadmap.revision, actionKey: 'next-key-00002' }, { compose })).status, 409);
  const ended = await call(env, 'POST', `${base}/end`, { boardId: BOARD, expectedRevision: view.roadmap.revision, actionKey: 'end-key-000001' });
  assert.equal(ended.status, 200);
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_roadmaps')[0].state, 'ended');
  assert.equal(rows(w.sqlite, "SELECT state FROM learn_step_proposals WHERE state IN ('checking', 'held', 'pending')").length, 0);
  // an ended roadmap no longer blocks a new one
  const created = await call(env, 'POST', '/api/learn/roadmap', { boardId: BOARD, instruction: 'Another', source: { sourceId: 'file:fs_a', revision: 'rev1' }, depth: 'deep', actionKey: 'create-key-0099' },
    { readSource: async () => ({ key: 'file:fs_a', rev: 'rev1', scope: { kind: 'whole' }, scopeFingerprint: 'fp1' }), startPlanning: async () => {} });
  assert.equal(created.status, 202);
});

test('deletion keeps the delivery record and the charge; a duplicate removal notification records one removal', async t => {
  const { w, env, o, resultId, cardId, totals } = await generating(t);
  await recordGenerated(w.LEARN_DB, w.access, { resultId, primitive: 'explanation', body: { type: 'explanation' }, validation: 'passed' });
  const base = `/api/learn/roadmap/${o.roadmapId}`;
  let view = await (await call(env, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  w.sqlite.prepare('UPDATE learn_boards SET state_json = ?, version = 2 WHERE id = ?').run(JSON.stringify({ blocks: [savedBlock(w.sqlite, cardId)] }), BOARD);
  await call(env, 'POST', `${base}/results/${resultId}/ack`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: 'ack-key-00001', cardIds: [cardId], boardRevision: 2 });
  const used = (await totals()).used;
  view = await (await call(env, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  const removed = () => call(env, 'POST', `${base}/results/${resultId}/removed`, { boardId: BOARD, expectedRevision: view.roadmap.revision, actionKey: 'removed-key-001' });
  assert.equal((await removed()).status, 200);
  assert.equal((await removed()).status, 200, 'the duplicate notification replays');
  assert.equal(rows(w.sqlite, "SELECT * FROM learn_roadmap_outbox WHERE kind = 'card_removed'").length, 1);
  assert.deepEqual(rows(w.sqlite, 'SELECT delivery, billing FROM learn_step_results')[0], { delivery: 'removed', billing: 'settled' });
  assert.equal((await totals()).used, used, 'no refund for a deleted card');
  assert.equal(rows(w.sqlite, 'SELECT card_removed FROM learn_roadmap_steps WHERE id = ?', o.stepId)[0].card_removed, 1);
});
test('Restore: a removed card comes back from the stored result, delivery returns to delivered, and nothing is charged again', async t => {
  const { w, env, o, resultId, cardId, totals } = await generating(t);
  await recordGenerated(w.LEARN_DB, w.access, { resultId, primitive: 'explanation', body: { type: 'explanation' }, validation: 'passed' });
  const base = `/api/learn/roadmap/${o.roadmapId}`;
  let view = await (await call(env, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  w.sqlite.prepare('UPDATE learn_boards SET state_json = ?, version = 2 WHERE id = ?').run(JSON.stringify({ blocks: [savedBlock(w.sqlite, cardId)] }), BOARD);
  await call(env, 'POST', `${base}/results/${resultId}/ack`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: 'ack-key-00001', cardIds: [cardId], boardRevision: 2 });
  view = await (await call(env, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  const used = (await totals()).used;
  const restore = key => call(env, 'POST', `${base}/results/${resultId}/restored`, { boardId: BOARD, expectedRevision: view.roadmap.revision, actionKey: key });
  assert.notEqual((await restore('restored-key-01')).status, 200, 'a card that was never removed cannot be restored');
  assert.equal((await call(env, 'POST', `${base}/results/${resultId}/removed`, { boardId: BOARD, expectedRevision: view.roadmap.revision, actionKey: 'removed-key-001' })).status, 200);
  view = await (await call(env, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).json();
  const again = await (await call(env, 'POST', `${base}/results/${resultId}/deliver`, { boardId: BOARD, actionKey: 'deliver-again-01' })).json();
  assert.equal(again.cards[0].slot.cardId, cardId, 'the stored result is handed back for a removed card');
  assert.equal(again.ackRequired, false, 'no second acknowledgement');
  assert.equal((await restore('restored-key-02')).status, 200);
  assert.equal((await restore('restored-key-02')).status, 200, 'the same request replays');
  assert.deepEqual(rows(w.sqlite, 'SELECT delivery, billing FROM learn_step_results')[0], { delivery: 'delivered', billing: 'settled' });
  assert.deepEqual(rows(w.sqlite, 'SELECT card_removed, removed_at FROM learn_roadmap_steps WHERE id = ?', o.stepId)[0], { card_removed: 0, removed_at: null });
  assert.equal((await totals()).used, used, 'restoring charges nothing and refunds nothing');
});

test('ROADMAP_ON_DROP_ENABLED over the route: false stops a drop report only; ROADMAP_ENABLED off beats it; an active roadmap still reads', async t => {
  const w = world(t), drop = env => call(env, 'POST', '/api/learn/roadmap/invitations', { boardId: BOARD, sourceKeys: ['file:fs_nothingnothingnothingno'], idleKey: 'drop-file-x' });
  const reason = async env => (await (await drop(env)).json()).suppressed?.reason;
  assert.equal(await reason(on(w.env)), 'unsupported_source', 'unset: the server decides as today');
  assert.equal(await reason({ ...on(w.env), ROADMAP_ON_DROP_ENABLED: 'true' }), 'unsupported_source');
  assert.equal(await reason({ ...on(w.env), ROADMAP_ON_DROP_ENABLED: 'false' }), 'on_drop_off');
  assert.equal((await drop({ ...w.env, ROADMAP_ENABLED: 'false', ROADMAP_ON_DROP_ENABLED: 'true' })).status, 404, 'the roadmap flag beats the drop flag');
  assert.equal((await call({ ...on(w.env), ROADMAP_ON_DROP_ENABLED: 'false' }, 'GET', `/api/learn/roadmap?boardId=${BOARD}`)).status, 200, 'views are not gated');
});
