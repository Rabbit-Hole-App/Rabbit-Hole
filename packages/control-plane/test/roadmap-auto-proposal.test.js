// R6.02: the automatic next proposal. Real store/lifecycle/outbox on the in-memory schema; the only doubles are the preference reader and the source
// recheck. There is no model in this path at all, so "zero generation calls and zero learner charge" is asserted on the records that a generation or a
// purchase would write (authorizations, results, provider calls, usage rows).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setMode, cancelProposal, proposeNextStep, endRoadmap } from '../src/roadmap/roadmap-lifecycle.js';
import { ensureNextProposal } from '../src/roadmap/roadmap-auto.js';
import { composeProposal } from '../src/roadmap/roadmap-compose.js';
import { roadmapRoute } from '../src/roadmap/roadmap-routes.js';
import { rows } from './roadmap-fixture.js';
import { delivered, doubles, flags, offeredNow, proposals, registerAutoHandlers, resetDoubles, run, spendRows, T0 } from './roadmap-auto-fixture.js';

registerAutoHandlers();
test.beforeEach(() => resetDoubles());

test('a delivered card makes one pending proposal for the next step, with no generation, no authorization and no charge', async t => {
  const { w, access, o, env } = await delivered(t);
  const before = spendRows(w);
  assert.equal(offeredNow(w, o.roadmapId).length, 0, 'nothing is offered before the event runs');
  await run(env, access);
  const now = offeredNow(w, o.roadmapId);
  assert.equal(now.length, 1);
  assert.equal(now[0].state, 'pending');
  assert.notEqual(now[0].step_id, o.stepId, 'the NEXT step, not the delivered one');
  assert.deepEqual(spendRows(w), before, 'composition writes no authorization, result, provider call or usage');
  assert.equal(rows(w.sqlite, 'SELECT processed_at FROM learn_roadmap_outbox WHERE kind = ?', 'card_delivered')[0].processed_at, T0 + 5);
  assert.equal(doubles.timings.length, 1);
  assert.equal(doubles.timings[0].status, 'offered');
  assert.ok(doubles.timings[0].composeEndedAt >= doubles.timings[0].composeStartedAt);
});

test('migration 0040 absent: the delivery trigger still offers the next step once (the Auto-suggest reader falls back to the default)', async t => {
  const { w, access, o, env } = await delivered(t, { withSettings: false });
  await run(env, access);
  assert.equal(offeredNow(w, o.roadmapId).length, 1);
  await run(env, access);
  assert.equal(proposals(w, o.roadmapId).length, 1, 'no duplicate');
});

test('replaying the same event, or a second trigger, never makes a second offer', async t => {
  const { w, access, o, env } = await delivered(t);
  await run(env, access);
  w.sqlite.prepare("UPDATE learn_roadmap_outbox SET processed_at = NULL, lease_token = NULL, lease_until = NULL WHERE kind = 'card_delivered'").run();
  await run(env, access);
  assert.equal(proposals(w, o.roadmapId).length, 1, 'the recorded outcome replays');
  // A mode change event arrives while the proposal is pending: reuse the valid offer.
  await setMode(w.LEARN_DB, access, { roadmapId: o.roadmapId, mode: 'auto', actionKey: 'mode-auto-00001', now: T0 + 6 });
  await run(env, access, T0 + 7);
  assert.equal(proposals(w, o.roadmapId).length, 1);
  assert.equal(doubles.timings.at(-1).reason, 'proposal_not_pending');
});

for (const [name, off] of [['ROADMAP_AUTO_ENABLED unset', { auto: null }], ['ROADMAP_ENABLED unset', { roadmap: null }], ['ROADMAP_AUTO_ENABLED not true', { auto: 'false' }]]) {
  test(`flag matrix: ${name} writes no proposal, no timing record, and the event is simply consumed`, async t => {
    const { w, access, o } = await delivered(t);
    await run(flags(w.env, off), access);
    assert.equal(proposals(w, o.roadmapId).length, 0);
    assert.equal(doubles.timings.length, 0);
    const manual = await proposeNextStep(w.LEARN_DB, access, { roadmapId: o.roadmapId, expectedRevision: rows(w.sqlite, 'SELECT revision FROM learn_roadmaps')[0].revision, actionKey: 'manual-next-0001', compose: (rm, step) => composeProposal(w.LEARN_DB, rm, step), now: T0 + 6 });
    assert.equal(manual.body.version, 1, 'the manual Propose next step is untouched');
  });
}

test('Ask pauses it; returning to Tutor offers the step from the durable state; a stale Tutor event cannot resume after a newer Ask', async t => {
  const { w, access, o, env } = await delivered(t);
  await setMode(w.LEARN_DB, access, { roadmapId: o.roadmapId, mode: 'ask', actionKey: 'mode-ask-000001', now: T0 + 1 });
  await run(env, access);
  assert.equal(offeredNow(w, o.roadmapId).length, 0, 'delivery arrived while Ask: no unsolicited proposal');
  assert.equal(doubles.timings.at(-1).reason, 'ask');
  await setMode(w.LEARN_DB, access, { roadmapId: o.roadmapId, mode: 'tutor', actionKey: 'mode-tutor-0001', now: T0 + 6 });
  await run(env, access, T0 + 7);
  assert.equal(offeredNow(w, o.roadmapId).length, 1, 'restored Tutor evaluates the existing state and offers once');
  // Ask -> Tutor -> Ask quickly, nothing processed in between: only the last fact counts.
  const second = await delivered(t, { n: 2, boardId: 'lb_board00000000000009' });
  await setMode(second.w.LEARN_DB, second.access, { roadmapId: second.o.roadmapId, mode: 'ask', actionKey: 'mode-ask-000002', now: T0 + 1 });
  await setMode(second.w.LEARN_DB, second.access, { roadmapId: second.o.roadmapId, mode: 'tutor', actionKey: 'mode-tutor-0002', now: T0 + 2 });
  await setMode(second.w.LEARN_DB, second.access, { roadmapId: second.o.roadmapId, mode: 'ask', actionKey: 'mode-ask-000003', now: T0 + 3 });
  await run(second.env, second.access);
  assert.equal(offeredNow(second.w, second.o.roadmapId).length, 0);
  const modeEvents = rows(second.w.sqlite, "SELECT fact_revision FROM learn_roadmap_outbox WHERE kind = 'mode_changed' ORDER BY fact_revision");
  assert.deepEqual(modeEvents.map(e => e.fact_revision), [1, 2, 3], 'Ask, Tutor, Ask are three distinct facts');
});

test('Auto-suggest off, Cancel and End stop unsolicited work; Cancel then an explicit Propose next step resumes it', async t => {
  const { w, access, o, env } = await delivered(t);
  doubles.autoSuggest = async () => false;
  await run(env, access);
  assert.equal(offeredNow(w, o.roadmapId).length, 0);
  assert.equal(doubles.timings.at(-1).reason, 'auto_suggest_off');
  doubles.autoSuggest = async () => true;
  await setMode(w.LEARN_DB, access, { roadmapId: o.roadmapId, mode: 'auto', actionKey: 'mode-auto-00002', now: T0 + 6 });
  await run(env, access, T0 + 7);
  const [offer] = offeredNow(w, o.roadmapId);
  assert.ok(offer, 'preference restored: offered');
  const rm = () => rows(w.sqlite, 'SELECT revision, state FROM learn_roadmaps')[0];
  const proposalRow = rows(w.sqlite, "SELECT id, version FROM learn_step_proposals WHERE state = 'pending'")[0];
  await cancelProposal(w.LEARN_DB, access, { roadmapId: o.roadmapId, expectedRevision: rm().revision, proposalId: proposalRow.id, proposalVersion: proposalRow.version, actionKey: 'cancel-key-0001', now: T0 + 8 });
  assert.equal(rm().state, 'paused');
  await setMode(w.LEARN_DB, access, { roadmapId: o.roadmapId, mode: 'tutor', actionKey: 'mode-tutor-0003', now: T0 + 9 });
  w.sqlite.prepare("UPDATE learn_roadmaps SET state = 'paused'").run(); // setMode keeps the pause; belt and braces for the fixture's revision bump
  await run(env, access, T0 + 10);
  assert.equal(offeredNow(w, o.roadmapId).length, 0, 'Cancel: no automatic re-proposal, whatever the mode events say');
  assert.equal(doubles.timings.at(-1).reason, 'not_active');
  // The learner's explicit Propose next step is the resume; the pause lifts and the next automatic trigger works again.
  w.sqlite.prepare(`INSERT INTO learn_roadmap_steps (id, roadmap_id, org, owner_user_id, board_id, position, plan_version, state, title, goal, format, passage_start, passage_end, created_at, updated_at)
    SELECT 'st_extra_three', roadmap_id, org, owner_user_id, board_id, 3, plan_version, 'planned', 'Step three', 'g3', 'explanation', 200, 300, created_at, updated_at FROM learn_roadmap_steps WHERE roadmap_id = ? AND position = 2`).run(o.roadmapId);
  const manual = await proposeNextStep(w.LEARN_DB, access, { roadmapId: o.roadmapId, expectedRevision: rm().revision, actionKey: 'manual-next-0002', compose: (r, s) => composeProposal(w.LEARN_DB, r, s), now: T0 + 11 });
  assert.equal(rows(w.sqlite, "SELECT step_id FROM learn_step_proposals WHERE state = 'pending'")[0].step_id, 'st_extra_three', 'the cancelled position is not silently re-offered; the next step is');
  assert.equal(manual.body.version, 1);
  assert.equal(rm().state, 'active');
  await endRoadmap(w.LEARN_DB, access, { roadmapId: o.roadmapId, expectedRevision: rm().revision, actionKey: 'end-key-000001', now: T0 + 12 });
  await setMode(w.LEARN_DB, access, { roadmapId: o.roadmapId, mode: 'auto', actionKey: 'mode-auto-00003', now: T0 + 13 }).catch(() => null);
  await run(env, access, T0 + 14);
  assert.equal(offeredNow(w, o.roadmapId).length, 0, 'End: blocked');
});

test('concurrent manual Next and the automatic trigger converge on one proposal (either order)', async t => {
  const first = await delivered(t);
  const revisionOf = w => rows(w.sqlite, 'SELECT revision FROM learn_roadmaps')[0].revision;
  const manual = await proposeNextStep(first.w.LEARN_DB, first.access, { roadmapId: first.o.roadmapId, expectedRevision: revisionOf(first.w), actionKey: 'manual-next-0003', compose: (r, s) => composeProposal(first.w.LEARN_DB, r, s), now: T0 + 2 });
  await run(first.env, first.access);
  assert.equal(proposals(first.w, first.o.roadmapId).length, 1);
  assert.equal(doubles.timings.at(-1).reason, 'proposal_not_pending');
  assert.equal(manual.body.version, 1);
  // The other order, with the competing manual call landing between the automatic read and its offer (compose is the seam between the two).
  const second = await delivered(t, { n: 2, boardId: 'lb_board00000000000008' });
  doubles.compose = async (roadmap, step) => {
    await proposeNextStep(second.w.LEARN_DB, second.access, { roadmapId: roadmap.id, expectedRevision: roadmap.revision, actionKey: 'manual-next-0004', compose: (r, s) => composeProposal(second.w.LEARN_DB, r, s), now: T0 + 2 });
    return composeProposal(second.w.LEARN_DB, roadmap, step);
  };
  await run(second.env, second.access);
  assert.equal(proposals(second.w, second.o.roadmapId).length, 1, 'the automatic offer lost the race and wrote nothing');
});

test('a mode change between the decision and the reveal blocks the reveal (the offer is guarded by the revision)', async t => {
  const { w, access, o, env } = await delivered(t);
  doubles.compose = async (roadmap, step) => {
    await setMode(w.LEARN_DB, access, { roadmapId: roadmap.id, mode: 'ask', actionKey: 'mode-ask-000009', now: T0 + 3 });
    return composeProposal(w.LEARN_DB, roadmap, step);
  };
  await run(env, access);
  assert.equal(proposals(w, o.roadmapId).length, 0);
  assert.equal(doubles.timings.at(-1).reason, 'ask', 'the second look reads Ask');
});

test('unfinished, failed or retrying accepted work is not finished; a changed source stops it; the first proposal stays manual', async t => {
  // 1 The step is still being made: no step is delivered yet.
  const a = await delivered(t);
  a.w.sqlite.prepare("UPDATE learn_roadmap_steps SET state = 'incomplete' WHERE id = ?").run(a.o.stepId);
  await run(a.env, a.access);
  assert.equal(proposals(a.w, a.o.roadmapId).length, 0);
  assert.equal(doubles.timings.at(-1).reason, 'nothing_delivered');
  // 2 A delivered step but another step is retrying or incomplete: the lifecycle's busy rule holds.
  const b = await delivered(t, { n: 2, boardId: 'lb_board00000000000007' });
  b.w.sqlite.prepare("UPDATE learn_roadmap_steps SET state = 'generating' WHERE roadmap_id = ? AND position = 2").run(b.o.roadmapId);
  await run(b.env, b.access);
  assert.equal(proposals(b.w, b.o.roadmapId).length, 0);
  assert.equal(doubles.timings.at(-1).reason, 'proposal_not_pending');
  // 3 The source changed since the plan: nothing is composed from the stale scope.
  const c = await delivered(t, { n: 3, boardId: 'lb_board00000000000006' });
  doubles.revalidate = async () => ({ ok: false, code: 'source_changed' });
  await run(c.env, c.access);
  assert.equal(proposals(c.w, c.o.roadmapId).length, 0);
  assert.equal(doubles.timings.at(-1).reason, 'source_changed');
  // 4 Right after Accept plan nothing is delivered, so a mode flip does not offer step one by itself.
  const d = await delivered(t, { n: 4, boardId: 'lb_board00000000000005' });
  d.w.sqlite.prepare("UPDATE learn_roadmap_steps SET state = 'planned'").run();
  doubles.revalidate = async () => ({ ok: true });
  await run(d.env, d.access);
  assert.equal(proposals(d.w, d.o.roadmapId).length, 0);
});

test('no next step (or the ceiling reached): the roadmap completes at its stopping point and nothing is offered', async t => {
  const { w, access, o, env } = await delivered(t);
  w.sqlite.prepare("UPDATE learn_roadmap_steps SET state = 'skipped' WHERE roadmap_id = ? AND position = 2").run(o.roadmapId);
  await run(env, access);
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_roadmaps')[0].state, 'completed');
  assert.equal(doubles.timings.at(-1).status, 'completed');
  assert.equal(proposals(w, o.roadmapId).length, 0);
});

test('ensureNextProposal is itself safe to call repeatedly and reports why it skipped', async t => {
  const { w, access, o, env } = await delivered(t);
  const call = key => ensureNextProposal(env, access, { roadmapId: o.roadmapId, triggerEventId: key, autoSuggest: true, revalidate: doubles.revalidate, now: T0 + 3 });
  assert.equal((await call('ev_one')).status, 'offered');
  const second = await call('ev_two');
  assert.deepEqual([second.status, second.reason], ['skipped', 'proposal_not_pending']);
  assert.equal((await call('ev_one')).status, 'skipped', 'the same trigger again offers nothing new');
  assert.equal(proposals(w, o.roadmapId).length, 1);
});

test('the routes wake the outbox once after a delivery acknowledgment and after a mode change, never on a replay', async t => {
  const { w, access, o, env, slot } = await delivered(t, { ack: false });
  const woken = [];
  const deps = { identity: async () => ({ org: access.org, email: access.actorEmail, userId: access.actorUserId }), onFact: async (_e, _a, body) => woken.push(body) };
  const post = (path, payload) => roadmapRoute(`/api/learn/roadmap/${o.roadmapId}/${path}`, new Request(`https://rabbit.test/api/learn/roadmap/${o.roadmapId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ boardId: access.boardId, ...payload }) }), env, deps);
  const revision = () => rows(w.sqlite, 'SELECT revision FROM learn_roadmaps')[0].revision;
  w.sqlite.prepare('UPDATE learn_boards SET state_json = ?, version = 3 WHERE id = ?').run(JSON.stringify({ blocks: [{ id: slot.cardId }] }), access.boardId); // delivered needs the card in a saved board
  const ack = { revision: revision(), actionKey: 'ack-route-0001', cardId: slot.cardId, boardRevision: 3 };
  assert.equal((await post(`results/${slot.resultId}/ack`, ack)).status, 200);
  assert.equal((await post(`results/${slot.resultId}/ack`, ack)).status, 200, 'replay');
  assert.equal(woken.length, 1);
  assert.equal((await post('mode', { mode: 'ask' })).status, 200);
  assert.equal(woken.length, 2);
  assert.equal((await post('mode', { mode: 'ask' })).status, 200, 'same value');
  const flagOff = await roadmapRoute(`/api/learn/roadmap/${o.roadmapId}/mode`, new Request('https://rabbit.test/x', { method: 'POST', body: '{}' }), flags(env, { roadmap: null }), deps);
  assert.equal(flagOff.status, 404, 'flag off: 404 before identity or any read');
});
