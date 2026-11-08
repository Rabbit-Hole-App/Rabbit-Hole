// Fix A: a withheld card says why (source problem, check could not finish, genuine safety refusal), and the next-step indicator can be true.
// Same harness as roadmap-loop.test.js: real State/Tools/glue, only the outside doubled. No model, no network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRoadmapHandlers } from '../src/roadmap/roadmap-wire.js';
import { runDueRoadmapEvents } from '../src/roadmap/roadmap-events.js';
import { withheldCause } from '../src/roadmap/roadmap-check.js';
import { rows } from './roadmap-fixture.js';
import { withVisual } from './explanation-layout-fixture.js'; // EXP-13, owner 2026-11-08: prose, a visual, prose
import { STRINGS } from '../../web/src/roadmap-strings.js';
import { BOARD, FAIL, FULL, GOOD, ID_B, INSTRUCTION, KEY, answer, calm, loop, planInput } from './roadmap-loop-fixture.js';

async function toProposal(h) {
  const created = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'standard', actionKey: KEY('create') });
  const id = created.body.roadmapId;
  const accepted = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: created.body.roadmap.revision, actionKey: KEY('plan'), planVersion: created.body.roadmap.planVersion });
  return { id, view: accepted.body, first: created.body };
}
const acceptBody = (view, key) => ({ boardId: BOARD, revision: view.roadmap.revision, actionKey: key, proposalVersion: view.proposal.version });
const accept = async (h, id, view) => (await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')))).body.results[0];

// A card that quotes words the passage never says (a model's own example in double quotes looks the same to the verifier).
const INVENTED = answer('make_explanation', { title: 'The gradient', body: withVisual('The notes say "an invented sentence from nowhere" about it.') });

test('owner MVP: a card that quotes or paraphrases freely is not held by a citation check; it is delivered and recorded as not run', async t => {
  const h = await loop(t, { script: [INVENTED] });
  const { id, view } = await toProposal(h);
  const result = await accept(h, id, view);
  assert.equal(h.p.used.length, 1, 'one authoring call');
  assert.equal(result.generation, 'generated');
  assert.equal(result.failure, undefined);
  assert.ok((await h.totals()).used > 0, 'charged for the delivered card');
  const check = JSON.parse(rows(h.w.sqlite, 'SELECT check_json FROM learn_step_results')[0].check_json);
  assert.deepEqual([check.grounding.validation, check.grounding.reason, check.grounding.calls], ['not_run', 'owner_mvp_policy', 0], 'never claimed as passed');
  assert.equal(check.safety.decision, 'allow', 'safety still runs');
  // A row stored by an earlier build (policy_block for a grounding block) still reads honestly: no migration, no safety wording.
  h.w.sqlite.prepare("UPDATE learn_step_results SET failure_class = 'policy_block', validation = 'blocked', delivery = 'not_delivered', billing = 'refunded', check_json = ?").run(JSON.stringify({ grounding: { validation: 'blocked', reason: 'quote_not_in_passage' }, safety: { decision: 'allow', action: 'continue' } }));
  const old = (await h.status()).results[0];
  assert.deepEqual(old.failure, { code: 'source_check_failed', message: STRINGS.notInSource });
  assert.equal(old.recovery, undefined, 'no Retry, Replace or Omit (owner 2026-11-06)');
});

// Owner 2026-11-06: no recovery UI or code on explanation cards. A failed card closes its step, and the automatic next step follows it.
test('with the automatic switch on, a failed card closes its step and the next step is offered by itself, with no recovery set', async t => {
  const h = await loop(t, { script: [FAIL, FAIL], envExtra: { ROADMAP_AUTO_ENABLED: 'true' } });
  const { id, view } = await toProposal(h);
  const result = await accept(h, id, view);
  assert.equal(result.generation, 'failed');
  assert.equal(result.recovery, undefined);
  assert.equal((await h.totals()).used, 0, 'refunded');
  await runDueRoadmapEvents(h.env);
  const now = await h.status();
  assert.equal(now.steps[0].state, 'skipped');
  assert.equal(now.proposal?.stepId, now.steps[1].id, 'the card_failed event offered the next step');
  assert.equal(now.proposal.state, 'pending');
  assert.equal(now.nextStepReady, false, 'nothing was delivered: the indicator stays off');
});

test('after a learner\'s signs of danger (S27) nothing is offered automatically, even with the automatic switch on', async t => {
  const danger = async ({ role }) => ({ ...calm, scores: { ...calm.scores, self_harm_personal: role === 'learner' ? 0.9 : 0 } });
  const h = await loop(t, { script: [GOOD], classifier: danger, envExtra: { ROADMAP_AUTO_ENABLED: 'true' } });
  const { id, view } = await toProposal(h);
  const result = await accept(h, id, view);
  assert.equal(result.failure.code, 'personal_risk');
  await runDueRoadmapEvents(h.env);
  const now = await h.status();
  assert.equal(now.steps[0].state, 'skipped');
  assert.equal(now.proposal ?? null, null, 'no unsolicited proposal after the support message');
});

test('owner MVP: the citation checker being down does not hold an ordinary card (it is not called)', async t => {
  const h = await loop(t, { script: [GOOD] });
  let asked = 0;
  registerRoadmapHandlers({ callModel: h.m.callModel, checkCallModel: async () => { asked++; throw new Error('503'); }, classify: async () => calm, base: h.p.base });
  const { id, view } = await toProposal(h);
  const result = await accept(h, id, view);
  assert.equal(result.generation, 'generated');
  assert.equal(asked, 0, 'no grounding call');
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

// --- CORE.06: the accepted learner revisions reach the learner-intent screen by role; grounding is never called -----------------------------
const SIGN = 'I feel hopeless and want to hurt myself';
// A classifier double that scores only what it is shown, per role, and records every part it screened.
const roleAware = seen => async ({ role, text }) => { seen.push({ role, text }); return { ...calm, scores: { ...calm.scores, self_harm_personal: text.includes(SIGN) ? 0.9 : 0 } }; };
const noGrounding = async role => { if (String(role).startsWith('roadmap_grounding')) throw new Error('the ordinary path must never call a grounding role'); throw new Error(`unexpected ${role}`); };

test('CORE.06: an accepted learner revision is screened as the learner\'s own words; the same words quoted in the source are not personal risk', async t => {
  const seen = [];
  const h = await loop(t, { script: [GOOD], classifier: roleAware(seen) });
  const created = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'standard', actionKey: KEY('create') });
  const revised = await h.json('POST', `/api/learn/roadmap/${created.body.roadmapId}/revise`, { boardId: BOARD, revision: created.body.roadmap.revision, actionKey: KEY('rev'), instruction: `${SIGN}. Keep it short.` });
  const plan = await h.json('POST', `/api/learn/roadmap/${created.body.roadmapId}/accept-plan`, { boardId: BOARD, revision: revised.body.roadmap.revision, actionKey: KEY('plan'), planVersion: revised.body.roadmap.planVersion });
  assert.equal(plan.status, 200, JSON.stringify(plan.body).slice(0, 400));
  registerRoadmapHandlers({ callModel: h.m.callModel, checkCallModel: noGrounding, classify: roleAware(seen), base: h.p.base });
  const result = await accept(h, created.body.roadmapId, plan.body);
  const learner = seen.filter(p => p.role === 'learner');
  assert.ok(learner.some(p => p.text.includes(INSTRUCTION) && p.text.includes(SIGN)), 'original and accepted revision screened as learner words');
  assert.equal(result.failure?.code, 'personal_risk', 'the learner\'s own signs of danger pause with support');
  assert.equal(JSON.parse(rows(h.w.sqlite, 'SELECT check_json FROM learn_step_results')[0].check_json).grounding.calls, 0);
  // The same sentence quoted in the document: source role, educational content, delivered.
  const seen2 = [];
  const QMD = `# Notes\n\nA character says: "${SIGN}".\n\n## Slope\nThe gradient of the loss points uphill.\n`;
  const quoted = await loop(t, { script: [GOOD], md: QMD, plans: [planInput([['The gradient', 0, QMD.length]])], classifier: roleAware(seen2) });
  registerRoadmapHandlers({ callModel: quoted.m.callModel, checkCallModel: noGrounding, classify: roleAware(seen2), base: quoted.p.base });
  const { id, view } = await toProposal(quoted);
  const ok = await accept(quoted, id, view);
  assert.equal(ok.generation, 'generated');
  assert.equal(ok.failure, undefined, 'quoted sensitive source text is not the learner\'s danger');
  assert.ok(!seen2.some(p => p.role === 'learner' && p.text.includes(SIGN)));
});

test('CORE.06: an unknown safety screen is neither prohibited nor passed: withheld, unreadable, refunded once', async t => {
  const unsure = async () => ({ ...calm, uncertainty: 0.9 });
  const h = await loop(t, { script: [GOOD], classifier: unsure });
  registerRoadmapHandlers({ callModel: h.m.callModel, checkCallModel: noGrounding, classify: unsure, base: h.p.base });
  const { id, view } = await toProposal(h);
  const result = await accept(h, id, view);
  const check = JSON.parse(rows(h.w.sqlite, 'SELECT check_json FROM learn_step_results')[0].check_json);
  assert.equal(check.safety.decision, 'unknown');
  assert.notEqual(check.safety.decision, 'block', 'not counted as prohibited');
  assert.notEqual(rows(h.w.sqlite, 'SELECT validation FROM learn_step_results')[0].validation, 'passed');
  assert.equal((await h.json('GET', `/api/learn/roadmap/${id}/results/${result.id}?boardId=${BOARD}`)).status, 404, 'the withheld body is unreadable');
  assert.equal((await h.totals()).used, 0, 'refunded');
  assert.equal(rows(h.w.sqlite, "SELECT COUNT(*) AS n FROM learn_roadmap_actions WHERE operation = 'card_failed'")[0].n, 1);
});
