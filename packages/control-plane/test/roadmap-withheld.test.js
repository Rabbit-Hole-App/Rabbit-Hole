// Fix A: a withheld card says why (source problem, check could not finish, genuine safety refusal), and the next-step indicator can be true.
// Same harness as roadmap-loop.test.js: real State/Tools/glue, only the outside doubled. No model, no network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRoadmapHandlers } from '../src/roadmap/roadmap-wire.js';
import { withheldCause } from '../src/roadmap/roadmap-check.js';
import { rows } from './roadmap-fixture.js';
import { STRINGS } from '../../web/src/roadmap-strings.js';
import { BOARD, FULL, GOOD, ID_B, INSTRUCTION, KEY, answer, calm, loop } from './roadmap-loop-fixture.js';

async function toProposal(h) {
  const created = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'standard', actionKey: KEY('create') });
  const id = created.body.roadmapId;
  const accepted = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: created.body.roadmap.revision, actionKey: KEY('plan'), planVersion: created.body.roadmap.planVersion });
  return { id, view: accepted.body, first: created.body };
}
const acceptBody = (view, key) => ({ boardId: BOARD, revision: view.roadmap.revision, actionKey: key, proposalVersion: view.proposal.version });
const accept = async (h, id, view) => (await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')))).body.results[0];

// A card that quotes words the passage never says (a model's own example in double quotes looks the same to the verifier).
const INVENTED = answer('make_explanation', { title: 'The gradient', body: 'The notes say "an invented sentence from nowhere" about it.' });

test('a source-grounding failure is not the safety refusal: honest wording, Retry offered, refunded, never published', async t => {
  const h = await loop(t, { script: [INVENTED] });
  const { id, view } = await toProposal(h);
  const result = await accept(h, id, view);
  assert.equal(h.p.used.length, 1, 'one generation, no automatic retry');
  assert.equal((await h.totals()).used, 0, 'refunded');
  assert.equal(result.delivery, 'not_delivered');
  assert.equal(rows(h.w.sqlite, 'SELECT failure_class FROM learn_step_results')[0].failure_class, 'terminal_validation_failure');
  assert.equal(JSON.parse(rows(h.w.sqlite, 'SELECT check_json FROM learn_step_results')[0].check_json).grounding.reason, 'quote_not_in_passage', 'the reason is kept in the private record');
  assert.deepEqual(result.failure, { code: 'source_check_failed', message: STRINGS.notInSource });
  assert.deepEqual(result.recovery, ['retry', 'replace', 'omit']);
  assert.doesNotMatch(result.failure.message, /outside what I can create/);
  // A row stored by the earlier build (policy_block for the same grounding block) reads the same way: no new migration, no safety wording.
  h.w.sqlite.prepare("UPDATE learn_step_results SET failure_class = 'policy_block'").run();
  const old = (await h.status()).results[0];
  assert.deepEqual(old.failure, { code: 'source_check_failed', message: STRINGS.notInSource });
  assert.deepEqual(old.recovery, ['retry', 'replace', 'omit']);
});

test('a check that could not finish says so (not a refusal, not a source verdict), refunded, Retry offered', async t => {
  const h = await loop(t, { script: [GOOD] });
  registerRoadmapHandlers({ callModel: h.m.callModel, checkCallModel: async () => { throw new Error('503'); }, classify: async () => calm, base: h.p.base });
  const { id, view } = await toProposal(h);
  const result = await accept(h, id, view);
  assert.equal((await h.totals()).used, 0, 'refunded');
  assert.equal(rows(h.w.sqlite, 'SELECT failure_class FROM learn_step_results')[0].failure_class, 'checking_unavailable');
  assert.deepEqual(result.failure, { code: 'checking_unavailable', message: STRINGS.checkUnavailable });
  assert.deepEqual(result.recovery, ['retry', 'replace', 'omit']);
});

test('withheldCause: only a genuine safety block or personal risk is a refusal', () => {
  const g = (validation, reason) => ({ validation, reason });
  const s = (decision, action = 'continue') => ({ decision, action });
  assert.equal(withheldCause({ grounding: g('blocked', 'quote_not_in_passage'), safety: s('allow') }), 'source');
  assert.equal(withheldCause({ grounding: g('blocked', 'contradicts_source'), safety: s('allow') }), 'source');
  assert.equal(withheldCause({ grounding: g('held', 'unsupported_claims'), safety: s('allow') }), 'source');
  assert.equal(withheldCause({ grounding: g('held', 'checking_unavailable'), safety: s('allow') }), 'unavailable');
  assert.equal(withheldCause({ grounding: g('passed'), safety: s('unknown', 'terminate') }), 'unavailable');
  assert.equal(withheldCause({ grounding: g('blocked', 'quote_not_in_passage'), safety: s('block', 'refuse') }), 'safety');
  assert.equal(withheldCause({ grounding: g('passed'), safety: s('restrain', 'pause_support') }), 'personal_risk');
});

test('nextStepReady: true only for an acceptable pending proposal after a delivery with nothing in flight', async t => {
  const h = await loop(t, { plans: [FULL], script: [GOOD] });
  const { id, view, first } = await toProposal(h);
  assert.equal(first.nextStepReady, false, 'no proposal yet');
  assert.equal(view.nextStepReady, false, 'the first proposal follows no delivery');
  const result = await accept(h, id, view);
  assert.equal((await h.status()).nextStepReady, false, 'still being delivered, no new proposal');
  const revision = (await h.status()).roadmap.revision;
  const deliver = await h.json('POST', `/api/learn/roadmap/${id}/results/${result.id}/deliver`, { boardId: BOARD, revision, actionKey: KEY('deliver') });
  const card = deliver.body.cards[0].block;
  h.w.sqlite.prepare('UPDATE learn_boards SET state_json = ?, version = 7 WHERE id = ?').run(JSON.stringify({ blocks: [card] }), BOARD);
  const ack = await h.json('POST', `/api/learn/roadmap/${id}/results/${result.id}/ack`, { boardId: BOARD, revision, actionKey: KEY('ack'), resultVersion: 1, cardId: card.id, boardRevision: 7 });
  const next = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: ack.body.roadmap.revision, actionKey: KEY('propose') });
  assert.equal(next.body.proposal.acceptable, true);
  assert.equal(next.body.nextStepReady, true, 'acceptable pending proposal after a completed delivery');
  const set = sql => h.w.sqlite.prepare(sql).run();
  set("UPDATE learn_step_proposals SET state = 'held' WHERE state = 'pending'");
  assert.equal((await h.status()).nextStepReady, false, 'held proposal');
  set("UPDATE learn_step_proposals SET state = 'pending' WHERE state = 'held'");
  set("UPDATE learn_step_results SET delivery = 'not_delivered', generation = 'generating'");
  assert.equal((await h.status()).nextStepReady, false, 'prior work still generating');
  set("UPDATE learn_step_results SET delivery = 'delivered', generation = 'generated'");
  set("UPDATE learn_roadmaps SET state = 'paused'");
  assert.equal((await h.status()).nextStepReady, false, 'paused roadmap');
});
