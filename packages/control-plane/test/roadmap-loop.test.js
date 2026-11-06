// R4 integration: the complete bounded-Markdown explanation loop through the HTTP routes, the real State store/money/lifecycle, Tools' planners,
// generator and checks, and the glue (invitations, planning from the outbox, compose, generation from step_accepted, request-less source rereads).
// Only the outside is doubled (roadmap-loop-fixture.js): no model, no JEV, no network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roadmapRoute } from '../src/roadmap/roadmap-routes.js';
import { registerRoadmapHandlers } from '../src/roadmap/roadmap-wire.js';
import { runDueRoadmapEvents } from '../src/roadmap/roadmap-events.js';
import { forkState } from '../src/learn-boards.js';
import { sharedState } from '../src/shared-privacy.js';
import { rows } from './roadmap-fixture.js';
import { BAD, BOARD, FAIL, FULL, GOOD, ID_A, ID_B, INSTRUCTION, KEY, ORIGIN, SHORT, TABLE, loop } from './roadmap-loop-fixture.js';

// Brings a roadmap to an accepted plan with one pending proposal.
async function toProposal(h, { revise = false } = {}) {
  const created = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'standard', actionKey: KEY('create') });
  assert.equal(created.status, 202);
  let view = created.body, id = created.body.roadmapId;
  assert.equal(view.roadmap.state, 'proposed', 'planning ran from the outbox event');
  if (revise) {
    const revised = await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('revise'), instruction: 'Make it shorter.' });
    assert.equal(revised.status, 202);
    view = revised.body;
  }
  const accepted = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('plan'), planVersion: view.roadmap.planVersion });
  assert.equal(accepted.status, 200);
  const proposed = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: accepted.body.roadmap.revision, actionKey: KEY('propose') });
  assert.equal(proposed.status, 200);
  return { id, view: proposed.body };
}
const acceptBody = (view, key) => ({ boardId: BOARD, revision: view.roadmap.revision, actionKey: key, proposalVersion: view.proposal.version });

test('the complete loop: invitation, dismiss, accept, plan, revise, accept plan, proposal, Tab, one purchase, repair, checks, delivery, board ack, next step, stopping point, End', async t => {
  const h = await loop(t, { plans: [FULL, SHORT], script: [BAD, GOOD, TABLE] });
  // 1 Two sources become ready: the first is offered and dismissed; dismissal is that invitation only.
  const first = (await h.json('POST', '/api/learn/roadmap/invitations', { boardId: BOARD, sourceKeys: [`file:${ID_A}`], idleKey: 'idle-1-aaaaaaaa' })).body.invitation;
  assert.equal(first.state, 'offered');
  assert.deepEqual(first.choices, ['explain_on_canvas', 'keep_here']);
  assert.equal(first.title, 'First notes.md');
  assert.equal((await h.json('POST', `/api/learn/roadmap/invitations/${first.id}/dismiss`, { boardId: BOARD, actionKey: KEY('dismiss') })).body.invitation.state, 'dismissed');
  assert.equal((await h.json('GET', `/api/learn/roadmap/invitations?boardId=${BOARD}`)).body.invitation, null, 'a reload does not bring it back');
  assert.deepEqual((await h.json('POST', '/api/learn/roadmap/invitations', { boardId: BOARD, sourceKeys: [`file:${ID_A}`], idleKey: 'idle-2-aaaaaaaa' })).body.suppressed, { reason: 'already_offered' });
  const second = (await h.json('POST', '/api/learn/roadmap/invitations', { boardId: BOARD, sourceKeys: [`file:${ID_B}`], idleKey: 'idle-3-aaaaaaaa' })).body.invitation;
  assert.equal(second.state, 'offered');
  // 2 Explain on canvas: the roadmap is created from that invitation with the learner's words verbatim; planning ran from its event.
  const created = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, invitationId: second.id, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'standard', actionKey: KEY('create') });
  assert.equal(created.status, 202);
  const id = created.body.roadmapId;
  assert.equal(rows(h.w.sqlite, 'SELECT state FROM learn_roadmap_invitations WHERE id = ?', second.id)[0].state, 'accepted');
  let view = created.body;
  assert.equal(view.roadmap.state, 'proposed');
  assert.equal(view.roadmap.instruction, INSTRUCTION);
  assert.equal(view.plan.steps.length, 3);
  assert.equal(view.roadmap.scope.source.name, 'Gradient descent notes.md');
  // 3 Revise once through the ToC conversation: a new plan version that needs acceptance; the original instruction row is untouched.
  const revised = await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('revise'), instruction: 'Make it shorter.' });
  assert.equal(revised.status, 202);
  view = revised.body;
  assert.equal(view.roadmap.planVersion, 2);
  assert.equal(view.plan.steps.length, 2);
  assert.equal(view.roadmap.acceptedPlanVersion, null, 'a revision is not accepted by being made');
  assert.equal(view.roadmap.instruction, INSTRUCTION);
  assert.deepEqual(rows(h.w.sqlite, 'SELECT version, origin FROM learn_roadmap_instructions ORDER BY version'), [{ version: 1, origin: 'create' }, { version: 2, origin: 'revise' }]);
  // 4 Accept the plan: nothing is generated, nothing is charged.
  const plan = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('plan'), planVersion: 2 });
  assert.equal(plan.status, 200);
  assert.equal(plan.body.roadmap.state, 'active');
  assert.equal((await h.totals()).used, 0);
  assert.equal(h.p.used.length, 0, 'plan acceptance buys nothing');
  // 5 One proposal, then Tab: one purchase, the card is made from the accepted records (one schema repair on the way).
  const proposed = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: plan.body.roadmap.revision, actionKey: KEY('propose') });
  view = proposed.body;
  assert.equal(view.proposal.state, 'pending');
  assert.equal(view.proposal.acceptable, true);
  assert.equal(view.proposal.sourceRelation.source.name, 'Gradient descent notes.md');
  assert.deepEqual(view.results, []);
  const accept = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  assert.equal(accept.status, 202);
  view = accept.body;
  const result = view.results[0];
  assert.equal(result.generation, 'generated', 'generation ran from the step_accepted event');
  assert.equal(result.billing, 'settled');
  assert.equal(h.p.used.length, 2, 'initial call plus the one repair');
  assert.deepEqual(rows(h.w.sqlite, "SELECT stage, retry_no, payer, checkpoint FROM learn_roadmap_calls ORDER BY stage").map(r => [r.stage, r.retry_no, r.payer, r.checkpoint]), [['generate', 0, 'learner', 'settled'], ['repair', 0, 'learner', 'settled']]);
  assert.equal(rows(h.w.sqlite, "SELECT * FROM usage_actions WHERE client_key LIKE 'rmact_%'").length, 1, 'one learner action for the accepted version');
  const spent = await h.totals();
  assert.ok(spent.used > 0 && spent.reserved === 0, `charged once and the unused hold released: ${JSON.stringify(spent)}`);
  assert.ok(h.m.calls.includes('roadmap_grounding_check'), 'the support check ran');
  // Polling never carries the text; the entitled route does, only now that the checks passed.
  assert.doesNotMatch(JSON.stringify(view), /points uphill/);
  // 6 Delivery: the server-minted card id, the adapter's metadata; the board save acknowledges it.
  const deliver = await h.json('POST', `/api/learn/roadmap/${id}/results/${result.id}/deliver`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('deliver') });
  assert.equal(deliver.status, 200);
  const card = deliver.body.cards[0].block;
  assert.equal(card.id, result.slot.cardId);
  assert.match(card.id, /^cd_[0-9a-f]{24}$/);
  assert.equal(card.type, 'explanation');
  assert.ok(card.stepId, 'the delivered card names its step');
  assert.equal(deliver.body.ackRequired, true);
  const again = await h.json('POST', `/api/learn/roadmap/${id}/results/${result.id}/deliver`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('deliver2') });
  assert.deepEqual(again.body.cards, deliver.body.cards, 'idempotent: reload and a second device get the same block');
  const ack = await h.json('POST', `/api/learn/roadmap/${id}/results/${result.id}/ack`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('ack'), resultVersion: 1, cardId: card.id, boardRevision: 7 });
  assert.equal(ack.status, 200);
  assert.equal(ack.body.roadmap.deliveredCount, 1);
  assert.equal(ack.body.steps[0].state, 'delivered');
  // A share or a fork of the board carries the card, never the step relationship.
  const board = { blocks: [card] };
  assert.equal(forkState(board).blocks[0].stepId, undefined);
  assert.equal(sharedState(board, 'viewer').blocks[0].stepId, undefined);
  assert.equal(sharedState(board, 'viewer').blocks[0].title, card.title);
  // 7 Manual next step, then Cancel pauses it (the learner decides when to continue).
  view = ack.body;
  const next = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('propose2') });
  view = next.body;
  assert.equal(view.proposal.title, 'Choosing a rate');
  const cancelled = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/cancel`, acceptBody(view, KEY('cancel')));
  assert.equal(cancelled.body.roadmap.state, 'paused');
  assert.equal(h.p.used.length, 2, 'cancel buys nothing');
  // 8 Nothing planned is left: asking for the next step reaches the stopping point. Then End; delivered cards and history stay.
  const done = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: cancelled.body.roadmap.revision, actionKey: KEY('propose3') });
  assert.equal(done.body.roadmap.state, 'completed');
  const ended = await h.json('POST', `/api/learn/roadmap/${id}/end`, { boardId: BOARD, revision: done.body.roadmap.revision, actionKey: KEY('end') });
  assert.equal(ended.body.roadmap.state, 'ended');
  const history = await h.json('GET', `/api/learn/roadmap?boardId=${BOARD}&history=1`);
  assert.equal(history.body.roadmaps[0].state, 'ended');
  assert.equal(history.body.roadmaps[0].instruction, INSTRUCTION);
  assert.equal(history.body.roadmaps[0].deliveredCount, 1);
});

test('duplicate accept from two devices: two keys at once, one purchase, one card slot, the loser a 409 that names the current state', async t => {
  const h = await loop(t);
  const { id, view } = await toProposal(h);
  const [a, b] = await Promise.all([KEY('deviceA'), KEY('deviceB')].map(k => h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, k))));
  assert.deepEqual([a.status, b.status].sort(), [202, 409]);
  assert.equal(rows(h.w.sqlite, 'SELECT * FROM learn_step_authorizations').length, 1);
  assert.equal(rows(h.w.sqlite, 'SELECT * FROM learn_step_results').length, 1);
  assert.equal(h.p.used.length, 1, 'one generation call: nothing bought twice');
  const loser = a.status === 409 ? a : b;
  assert.equal(loser.body.current.roadmap.id, id);
});

test('insufficient allowance leaves the proposal pending and the same key succeeds once credits exist', async t => {
  const h = await loop(t, { allowanceMicros: 1000 });
  const { id, view } = await toProposal(h);
  const refused = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  assert.equal(refused.status, 429);
  assert.equal(refused.body.current.proposal.state, 'pending');
  assert.equal(refused.body.current.proposal.acceptable, true);
  assert.equal(h.p.used.length, 0);
  assert.equal(rows(h.w.sqlite, 'SELECT * FROM learn_step_results').length, 0);
  assert.equal((await h.totals()).used, 0);
  h.env.AI_MONTHLY_ALLOWANCE_USD = '10'; // credits arrive: the same key is still unconsumed
  const retried = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  assert.equal(retried.status, 202);
  assert.equal(retried.body.results[0].generation, 'generated');
});

test('a failed card is refunded: the transient failure earns one automatic retry after the refund, the second failure is terminal, the learner nets zero', async t => {
  const h = await loop(t, { script: [FAIL, FAIL] });
  const { id, view } = await toProposal(h);
  const accept = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  const result = accept.body.results[0];
  assert.equal(result.generation, 'failed');
  assert.equal(result.billing === 'refunded' || result.billing === 'failed', true, result.billing);
  assert.deepEqual(result.recovery, ['retry', 'replace', 'omit']);
  assert.equal(h.p.used.length, 2, 'the first call and exactly one automatic retry');
  const spent = await h.totals();
  assert.equal(spent.used, 0, 'the learner is charged nothing for a failed card');
  assert.equal(spent.reserved, 0, 'the hold is released');
  assert.equal(accept.body.steps[0].state, 'incomplete');
  // Omit is the learner's choice from Chat or the ToC; the step is skipped, nothing is charged.
  const omit = await h.json('POST', `/api/learn/roadmap/${id}/steps/${accept.body.steps[0].id}/omit`, { boardId: BOARD, revision: accept.body.roadmap.revision, actionKey: KEY('omit') });
  assert.equal(omit.body.steps[0].state, 'skipped');
});

test('End while a card is generating is refused with a 409 that carries the current state (State keeps this guard)', async t => {
  const h = await loop(t);
  const { id, view } = await toProposal(h);
  // Accept with the handlers unregistered, so the step stays generating (the event is durable and waits).
  registerRoadmapHandlers({ callModel: async () => assert.fail('no model'), base: () => assert.fail('no provider') });
  const stop = h.deps.onAccepted;
  h.deps.onAccepted = async () => {};
  const accept = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  assert.equal(accept.status, 202);
  const end = await h.json('POST', `/api/learn/roadmap/${id}/end`, { boardId: BOARD, revision: accept.body.roadmap.revision, actionKey: KEY('end') });
  assert.equal(end.status, 409);
  assert.equal(end.body.current.roadmap.state, 'active');
  h.deps.onAccepted = stop;
});

test('flag off during generation: routes 404 while the accepted work still completes server-side; restoring delivers the same card once, no second charge', async t => {
  const h = await loop(t);
  const { id, view } = await toProposal(h);
  const live = h.deps.onAccepted;
  h.deps.onAccepted = async () => {}; // the accept commits its event; nothing has run yet
  const accept = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  assert.equal(accept.status, 202);
  const resultId = accept.body.results[0].id;
  // The flag is switched off, then the durable event runs: generation does not read the flag.
  const dark = { ...h.env, ROADMAP_ENABLED: undefined };
  assert.equal((await roadmapRoute('/api/learn/roadmap', new Request(`${ORIGIN}/api/learn/roadmap?boardId=${BOARD}`), dark, h.deps)).status, 404);
  assert.equal(await runDueRoadmapEvents(dark), 1);
  assert.equal(rows(h.w.sqlite, 'SELECT generation, validation FROM learn_step_results')[0].generation, 'generated');
  const charged = await h.totals();
  assert.equal(h.p.used.length, 1);
  // Restored: deliver returns the same minted card, and nothing is charged again.
  h.deps.onAccepted = live;
  const deliver = await h.json('POST', `/api/learn/roadmap/${id}/results/${resultId}/deliver`, { boardId: BOARD, revision: accept.body.roadmap.revision, actionKey: KEY('deliver') });
  assert.equal(deliver.body.cards[0].block.id, accept.body.results[0].slot.cardId);
  assert.deepEqual(await h.totals(), charged);
  assert.equal(await runDueRoadmapEvents(h.env), 0, 'nothing left to run');
  assert.equal(h.p.used.length, 1);
});

test('a source that changed after the plan stops generation before admission: nothing is spent and the learner is refunded', async t => {
  const h = await loop(t);
  const { id, view } = await toProposal(h);
  h.deps.onAccepted = async () => {};
  const accept = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  h.w.sqlite.prepare("UPDATE file_sources SET sha256 = 'changed' WHERE id = ?").run(ID_B);
  await runDueRoadmapEvents(h.env);
  assert.equal(h.p.used.length, 0, 'no provider call');
  assert.equal(rows(h.w.sqlite, 'SELECT generation FROM learn_step_results')[0].generation, 'failed');
  assert.equal((await h.totals()).used, 0);
  assert.equal((await h.status()).results[0].failure.code, 'generation_failed');
});
