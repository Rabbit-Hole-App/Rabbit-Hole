// R4 integration glue: the bounded delivery deadline (v1.4 4.1 and 4.4). An accepted, checked card that was never placed is refunded after the deadline;
// one that is on the saved board (the acknowledgement was lost) is acknowledged instead, never refunded; before the deadline nothing changes; a repeat is a no-op.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepUndelivered } from '../src/roadmap/roadmap-sweep.js';
import { scheduledRoadmapKick } from '../src/roadmap/roadmap-wire.js';
import { ROADMAP_LIMITS } from '../src/roadmap/roadmap-policy.js';
import { rows, savedBlock } from './roadmap-fixture.js';
import { BOARD, KEY, ID_B, INSTRUCTION, loop } from './roadmap-loop-fixture.js';

const DEADLINE = ROADMAP_LIMITS.retention.deliveryDeadlineHours * 3600;

// A generated, checked, undelivered card, accepted at `at` (the result row's created_at).
async function undelivered(t, at = Math.floor(Date.now() / 1000)) {
  const h = await loop(t);
  const made = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'balanced', actionKey: KEY('create') });
  const id = made.body.roadmapId;
  const plan = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: made.body.roadmap.revision, actionKey: KEY('plan'), planVersion: 1 });
  const proposed = plan; // accepting the plan offers the first proposal
  const accept = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${proposed.body.proposal.id}/accept`, { boardId: BOARD, revision: proposed.body.roadmap.revision, actionKey: KEY('accept'), proposalVersion: 1 });
  assert.equal(accept.body.results[0].generation, 'generated');
  h.w.sqlite.prepare('UPDATE learn_step_results SET created_at = ?').run(at);
  return { h, id, result: accept.body.results[0] };
}

test('after the deadline an unplaced card is refunded: the learner nets zero, the card is no longer readable, the step is closed (no recovery, owner 2026-11-06)', async t => {
  const { h, id, result } = await undelivered(t, 1000);
  assert.ok((await h.totals()).used > 0, 'charged for the generation');
  assert.deepEqual(await sweepUndelivered(h.env, { now: 1000 + DEADLINE - 1 }), { acknowledged: 0, refunded: 0 }, 'before the deadline nothing changes');
  assert.deepEqual(await sweepUndelivered(h.env, { now: 1000 + DEADLINE }), { acknowledged: 0, refunded: 1 });
  assert.equal((await h.totals()).used, 0);
  const row = rows(h.w.sqlite, 'SELECT generation, billing, delivery FROM learn_step_results')[0];
  assert.deepEqual(row, { generation: 'failed', billing: 'refunded', delivery: 'not_delivered' });
  const view = await h.status();
  assert.equal(view.results[0].recovery, undefined);
  assert.equal(view.steps.find(s => s.id === result.stepId).state, 'skipped');
  assert.equal((await h.json('POST', `/api/learn/roadmap/${id}/results/${result.id}/deliver`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('deliver') })).status, 404, 'a refunded card is not served');
  assert.deepEqual(await sweepUndelivered(h.env, { now: 1000 + DEADLINE + 5 }), { acknowledged: 0, refunded: 0 }, 'a repeat finds nothing to do');
  assert.equal(rows(h.w.sqlite, "SELECT * FROM learn_roadmap_actions WHERE operation = 'delivery_expired'").length, 1);
});

test('a card that is on the saved board is acknowledged, never refunded, when its acknowledgement was lost', async t => {
  const { h, result } = await undelivered(t, 1000);
  const card = result.slot.cardId;
  h.w.sqlite.prepare('UPDATE learn_boards SET state_json = ? WHERE id = ?').run(JSON.stringify({ blocks: [savedBlock(h.w.sqlite, card)] }), BOARD);
  const spent = await h.totals();
  assert.deepEqual(await sweepUndelivered(h.env, { now: 1000 + DEADLINE }), { acknowledged: 1, refunded: 0 });
  assert.equal(rows(h.w.sqlite, 'SELECT delivery, billing FROM learn_step_results')[0].delivery, 'delivered');
  assert.deepEqual(await h.totals(), spent, 'no refund and no second purchase');
});

test('the scheduler hook runs the sweep and the object kick together', async t => {
  const { h } = await undelivered(t, 1000);
  assert.equal(await scheduledRoadmapKick(h.env), 0, 'no due events and no binding: nothing kicked');
  assert.equal(rows(h.w.sqlite, 'SELECT billing FROM learn_step_results')[0].billing, 'refunded', 'the sweep ran from the hook (the accepted result is older than the deadline)');
});
