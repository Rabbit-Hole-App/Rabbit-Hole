// BE.12 (checklist): "Reconcile uncertain outcomes before any further dispatch." The probe that found the gap: a provider call whose outcome is unknown
// (timeout after dispatch) fails the card terminally, the step is skipped, and the card_failed event used to offer a DISTINCT successor while the first
// call's charge outcome was still unresolved. Real store, lifecycle and outbox on the in-memory schema; no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptRoadmapStep, failCard } from '../src/roadmap/roadmap-store.js';
import { proposeNextStep } from '../src/roadmap/roadmap-lifecycle.js';
import { planCall, advanceCall, markCallUnknown } from '../src/roadmap/roadmap-money.js';
import { composeProposal } from '../src/roadmap/roadmap-compose.js';
import { world, offered, rows } from './roadmap-fixture.js';
import { flags, registerAutoHandlers, resetDoubles, run, offeredNow, T0 } from './roadmap-auto-fixture.js';

registerAutoHandlers();
test.beforeEach(() => resetDoubles());

// Step 1 accepted, its one author call dispatched and then lost (unknown), the card failed terminally. -> { w, access, o, env, opId }
async function unknownOutcome(t, { reconciled = null } = {}) {
  const w = world(t);
  const o = await offered(w, w.access);
  const done = await acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001', now: T0 });
  const { resultId } = done.body.slots[0];
  const opId = 'rm-generate-00000000000000000000000000000001';
  await planCall(w.LEARN_DB, w.access, { opId, key: 'op-key-1', roadmapId: o.roadmapId, resultId, authorizationId: done.body.authorizationId, stage: 'generate', call: 0, retry: 0, payer: 'learner', task: 'artifact', now: T0 });
  await advanceCall(w.LEARN_DB, opId, 'admitted', { now: T0 });
  await advanceCall(w.LEARN_DB, opId, 'dispatched', { now: T0 });
  await markCallUnknown(w.LEARN_DB, opId, T0);
  await failCard(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, failureClass: 'unknown_provider_outcome', retryNo: 0, allowAutomaticRetry: false, now: T0 });
  w.sqlite.prepare("DELETE FROM learn_roadmap_outbox WHERE kind = 'step_accepted'").run();
  return { w, access: w.access, o, env: flags(w.env), opId };
}
const access = w => w.access;
const checkpoint = (w, opId) => rows(w.sqlite, 'SELECT checkpoint FROM learn_roadmap_calls WHERE op_id = ?', opId)[0].checkpoint;
const eventPending = w => rows(w.sqlite, "SELECT processed_at FROM learn_roadmap_outbox WHERE kind = 'card_failed'")[0]?.processed_at ?? null;

test('an unknown provider outcome holds the automatic successor: nothing is offered, the event stays pending, then the offer follows reconciliation', async t => {
  const { w, access: acc, o, env, opId } = await unknownOutcome(t);
  assert.equal(checkpoint(w, opId), 'unknown', 'precondition: the first charge outcome is unresolved');
  await run(env, acc);
  assert.equal(offeredNow(w, o.roadmapId).length, 0, 'no distinct successor while the first outcome is unresolved');
  assert.equal(eventPending(w), null, 'the card_failed event is not consumed: it resumes after reconciliation');
  // Reconciliation settles the call (unknown -> reconciling -> released); the same pending event then offers the one successor.
  await advanceCall(w.LEARN_DB, opId, 'reconciling', { now: T0 + 6 });
  await run(env, acc, T0 + 400);
  assert.equal(offeredNow(w, o.roadmapId).length, 0, 'reconciling is still unresolved');
  await advanceCall(w.LEARN_DB, opId, 'released', { now: T0 + 7 });
  await run(env, acc, T0 + 4000);
  assert.equal(offeredNow(w, o.roadmapId).length, 1, 'exactly one successor after reconciliation');
  assert.ok(eventPending(w) > 0, 'the event is consumed once');
});

test('the manual Propose next step is refused with a typed error while the prior outcome is unresolved, and works after reconciliation', async t => {
  const { w, access: acc, o, opId } = await unknownOutcome(t);
  const revision = () => rows(w.sqlite, 'SELECT revision FROM learn_roadmaps WHERE id = ?', o.roadmapId)[0].revision;
  const propose = key => proposeNextStep(w.LEARN_DB, acc, { roadmapId: o.roadmapId, expectedRevision: revision(), actionKey: key, compose: (rm, step) => composeProposal(w.LEARN_DB, rm, step), now: T0 + 10 });
  await assert.rejects(propose('manual-key-0001'), error => error.code === 'outcome_unresolved' && error.status === 409);
  assert.equal(offeredNow(w, o.roadmapId).length, 0);
  await advanceCall(w.LEARN_DB, opId, 'reconciling', { now: T0 + 11 });
  await advanceCall(w.LEARN_DB, opId, 'released', { now: T0 + 12 });
  const out = await propose('manual-key-0002');
  assert.equal(out.body.offer ?? 'offered', 'offered');
  assert.equal(offeredNow(w, o.roadmapId).length, 1);
});

test('a settled or failed earlier call does not hold anything (only an unresolved one does)', async t => {
  const { w, access: acc, o, env, opId } = await unknownOutcome(t);
  await advanceCall(w.LEARN_DB, opId, 'reconciling', { now: T0 + 6 });
  await advanceCall(w.LEARN_DB, opId, 'failed', { now: T0 + 7 });
  await run(env, acc);
  assert.equal(offeredNow(w, o.roadmapId).length, 1, 'a call that settled as failed is resolved: the successor is offered');
});

test('no new step is dispatched while an earlier learner call is unresolved: acceptance is refused before any hold or charge', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  const opId = 'rm-generate-00000000000000000000000000000002';
  await planCall(w.LEARN_DB, w.access, { opId, key: 'op-key-2', roadmapId: o.roadmapId, stage: 'generate', call: 0, retry: 0, payer: 'learner', task: 'artifact', now: T0 });
  await advanceCall(w.LEARN_DB, opId, 'admitted', { now: T0 });
  await advanceCall(w.LEARN_DB, opId, 'dispatched', { now: T0 });
  const before = rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_results')[0].n;
  await assert.rejects(acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0009', now: T0 }), error => error.code === 'outcome_unresolved' && error.status === 409);
  assert.equal(rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_results')[0].n, before, 'no result slot, authorization or hold was written');
  await advanceCall(w.LEARN_DB, opId, 'failed', { now: T0 + 1 });
  const ok = await acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0009', now: T0 + 2 });
  assert.equal(ok.body.slots.length, 1, 'accepted once the call is resolved');
});
