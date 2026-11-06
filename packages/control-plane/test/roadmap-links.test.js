// R5.04: link an existing board card as the next step. The proposal is offered and accepted through the same position, versions and Accept gesture as any
// proposal, but the acceptance is zero-priced: no authorization, no hold, no generation, no model. The card is re-read at acceptance. In-memory schema
// plus migration 0041; no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { offerLinkProposal, acceptLinkProposal, readBoardCard } from '../src/roadmap/roadmap-links.js';
import { proposeNextStep } from '../src/roadmap/roadmap-lifecycle.js';
import { composeProposal } from '../src/roadmap/roadmap-compose.js';
import { roadmapRoute } from '../src/roadmap/roadmap-routes.js';
import { rows, accessFor } from './roadmap-fixture.js';
import { delivered, spendRows, T0 } from './roadmap-auto-fixture.js';

const MIGRATION = readFileSync(new URL('../learn-migrations/0041-roadmap-proposal-drafts.sql', import.meta.url), 'utf8');
const CARD = { id: 'cd_existing000000000001', type: 'explanation', title: 'Gradient basics', body: 'The gradient points uphill.', x: 10, y: 20, w: 300, h: 200 };
async function setup(t, { blocks = [CARD] } = {}) {
  const ctx = await delivered(t);
  ctx.w.sqlite.exec(MIGRATION);
  ctx.w.sqlite.prepare('UPDATE learn_boards SET state_json = ? WHERE id = ?').run(JSON.stringify({ blocks }), ctx.access.boardId);
  const revision = () => rows(ctx.w.sqlite, 'SELECT revision FROM learn_roadmaps')[0].revision;
  const offer = (extra = {}) => offerLinkProposal(ctx.w.LEARN_DB, ctx.access, { roadmapId: ctx.o.roadmapId, expectedRevision: revision(), actionKey: 'link-offer-00001', cardId: CARD.id, reason: 'This card already covers the gradient.', now: T0 + 1, ...extra });
  const accept = (offered, extra = {}) => acceptLinkProposal(ctx.w.LEARN_DB, ctx.access, { roadmapId: ctx.o.roadmapId, revision: revision(), proposalId: offered.body.proposalId, proposalVersion: offered.body.version, actionKey: 'link-accept-0001', now: T0 + 2, ...extra });
  return { ...ctx, revision, offer, accept };
}

test('offer: one pending link proposal in the proposal position, with the reason and the card named, and nothing bought', async t => {
  const { w, o, offer } = await setup(t);
  const before = spendRows(w);
  const made = await offer();
  const row = rows(w.sqlite, 'SELECT p.state, p.version, p.step_id, l.card_id, l.origin, l.reason FROM learn_step_proposals p JOIN learn_proposal_links l ON l.proposal_id = p.id WHERE p.id = ?', made.body.proposalId)[0];
  assert.deepEqual([row.state, row.card_id, row.origin], ['pending', CARD.id, 'learner']);
  assert.equal(rows(w.sqlite, "SELECT COUNT(*) AS n FROM learn_step_proposals WHERE state IN ('checking', 'held', 'pending')")[0].n, 1);
  assert.equal(rows(w.sqlite, 'SELECT position FROM learn_roadmap_steps WHERE id = ?', row.step_id)[0].position, 2, 'the next planned step');
  assert.deepEqual(spendRows(w), before);
  await assert.rejects(offer({ actionKey: 'link-offer-00002' }), e => e.code === 'proposal_not_pending', 'one offered step at a time');
  void o;
});

test('accept: a zero-priced delivered result for the existing card, the step delivered, the count up, no authorization, no provider call', async t => {
  const { w, o, offer, accept } = await setup(t);
  const before = spendRows(w);
  const done = await accept(await offer());
  assert.equal(done.body.billing, 'zero_priced');
  const result = rows(w.sqlite, "SELECT card_id, billing, delivery, generation, validation, primitive, body_json, decision FROM learn_step_results WHERE billing = 'zero_priced'")[0];
  assert.deepEqual(result, { card_id: CARD.id, billing: 'zero_priced', delivery: 'delivered', generation: 'generated', validation: 'passed', primitive: null, body_json: null, decision: 'accepted' });
  assert.deepEqual([rows(w.sqlite, 'SELECT state FROM learn_roadmap_steps WHERE position = 2')[0].state, rows(w.sqlite, 'SELECT delivered_count FROM learn_roadmaps')[0].delivered_count], ['delivered', 2]);
  const after = spendRows(w);
  assert.deepEqual({ ...after, results: after.results - 1 }, before, 'only the result row is new: no authorization, call or usage');
  assert.equal(rows(w.sqlite, "SELECT COUNT(*) AS n FROM learn_roadmap_outbox WHERE kind = 'card_delivered'")[0].n, 2, 'step one delivery plus the link delivery (R6 trigger)');
  assert.equal(rows(w.sqlite, "SELECT COUNT(*) AS n FROM learn_roadmap_outbox WHERE kind = 'step_accepted' AND fact_id LIKE 'pr_%' AND fact_revision > 1")[0].n, 0, 'no generation event');
  // Replay and a duplicate acceptance: one result.
  assert.equal((await accept({ body: { proposalId: done.body.proposalId, version: done.body.proposalVersion } })).replayed, true);
  await assert.rejects(accept({ body: { proposalId: done.body.proposalId, version: done.body.proposalVersion } }, { actionKey: 'link-accept-0002' }), e => e.status === 409);
  assert.equal(rows(w.sqlite, "SELECT COUNT(*) AS n FROM learn_step_results WHERE billing = 'zero_priced'")[0].n, 1);
  void o;
});

test('only a card on THIS board, of a linkable type, is offered; an id alone is never access', async t => {
  const { w, access, offer } = await setup(t, { blocks: [CARD, { id: 'cd_picture0000000000001', type: 'image', title: 'Photo' }] });
  await assert.rejects(offer({ cardId: 'cd_picture0000000000001' }), e => e.code === 'card_unavailable' && e.status === 404);
  await assert.rejects(offer({ cardId: 'cd_unknown000000000001' }), e => e.code === 'card_unavailable');
  w.sqlite.prepare("UPDATE learn_boards SET state_json = ? WHERE id = 'lb_board00000000000003'").run(JSON.stringify({ blocks: [{ id: 'cd_bobs00000000000000001', type: 'explanation', title: 'Bob' }] }));
  await assert.rejects(offer({ cardId: 'cd_bobs00000000000000001' }), e => e.code === 'card_unavailable', 'another learner board');
  assert.equal(await readBoardCard(w.LEARN_DB, accessFor('u-bob', 'lb_board00000000000003'), CARD.id), null, 'and alice card is not visible to bob');
  assert.ok(await readBoardCard(w.LEARN_DB, access, CARD.id));
});

test('deleted or materially edited between offer and accept: the link is stale, nothing is accepted or charged, the step is planned again for a fresh proposal', async t => {
  for (const change of [blocks => [], blocks => [{ ...blocks[0], body: 'Rewritten.' }]]) {
    const { w, o, access, offer, accept, revision } = await setup(t);
    const made = await offer();
    w.sqlite.prepare('UPDATE learn_boards SET state_json = ? WHERE id = ?').run(JSON.stringify({ blocks: change([CARD]) }), access.boardId);
    const before = spendRows(w);
    await assert.rejects(accept(made), e => e.status === 409 && e.reply.code === 'link_stale');
    assert.deepEqual(spendRows(w), before);
    assert.equal(rows(w.sqlite, "SELECT COUNT(*) AS n FROM learn_step_results WHERE billing = 'zero_priced'")[0].n, 0);
    assert.equal(rows(w.sqlite, 'SELECT state FROM learn_step_proposals WHERE id = ?', made.body.proposalId)[0].state, 'superseded');
    assert.equal(rows(w.sqlite, 'SELECT state FROM learn_roadmap_steps WHERE position = 2')[0].state, 'planned');
    // A newly composed (checked) proposal can now be offered and is an ordinary one: no link row.
    const fresh = await proposeNextStep(w.LEARN_DB, access, { roadmapId: o.roadmapId, expectedRevision: revision(), actionKey: 'manual-fresh-0001', compose: (r, s) => composeProposal(w.LEARN_DB, r, s), now: T0 + 3 });
    assert.equal(rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_proposal_links WHERE proposal_id = ?', fresh.body.proposalId)[0].n, 0);
  }
});

test('moving or resizing the card is not an edit, but the ceiling is still enforced', async t => {
  const a = await setup(t);
  const made = await a.offer();
  a.w.sqlite.prepare('UPDATE learn_boards SET state_json = ? WHERE id = ?').run(JSON.stringify({ blocks: [{ ...CARD, x: 999, y: 5, w: 10, h: 10 }] }), a.access.boardId);
  assert.equal((await a.accept(made)).body.billing, 'zero_priced');
  const b = await setup(t);
  b.w.sqlite.prepare('UPDATE learn_roadmaps SET delivered_count = ceiling').run();
  await assert.rejects(b.offer(), e => e.code === 'ceiling_reached', 'a revised plan is needed for another step');
});

test('routes: link routes are gated; Accept on a link proposal takes the zero-priced path; the view names the existing card', async t => {
  const { w, access, o } = await setup(t);
  const deps = { identity: async () => ({ org: access.org, email: access.actorEmail, userId: access.actorUserId }) };
  const post = (env, path, payload) => roadmapRoute(`/api/learn/roadmap/${o.roadmapId}/${path}`, new Request(`https://rabbit.test/api/learn/roadmap/${o.roadmapId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ boardId: access.boardId, ...payload }) }), env, deps);
  const on = { ...w.env, ROADMAP_ENABLED: 'true', ROADMAP_EDIT_ENABLED: 'true' };
  assert.equal((await post({ ...w.env, ROADMAP_ENABLED: 'true' }, 'steps/link', {})).status, 404);
  const revision = rows(w.sqlite, 'SELECT revision FROM learn_roadmaps')[0].revision;
  const offered = await post(on, 'steps/link', { revision, actionKey: 'route-link-0001', cardId: CARD.id, reason: 'It covers this.' });
  assert.equal(offered.status, 200);
  const view = await offered.json();
  assert.deepEqual([view.proposal.link.cardId, view.proposal.link.origin, view.proposal.acceptable], [CARD.id, 'learner', true]);
  const accepted = await post(on, `proposals/${view.proposal.id}/accept`, { revision: view.roadmap.revision, proposalVersion: view.proposal.version, actionKey: 'route-link-accept1' });
  assert.equal(accepted.status, 200);
  const after = await accepted.json();
  assert.equal(after.results.find(r => r.billing === 'zero_priced').existingCard, true);
  assert.equal(after.roadmap.deliveredCount, 2);
});
