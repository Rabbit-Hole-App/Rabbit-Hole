// Owner MVP (2026-11-06): an accepted ordinary explanation is written from the whole document plus the step brief, in one authoring call,
// with no per-card citation gate; the passage offsets stay the highlight anchor. Same harness as roadmap-loop.test.js: real State, glue
// and generator, only the outside doubled. No model, no network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rows } from './roadmap-fixture.js';
import { BOARD, ID_B, INSTRUCTION, KEY, answer, loop, planInput } from './roadmap-loop-fixture.js';
import { runDueRoadmapEvents } from '../src/roadmap/roadmap-events.js';
import { withVisual } from './explanation-layout-fixture.js'; // EXP-13, owner 2026-11-08: prose, a visual, prose
import { authorRoute, requestFingerprint } from '../src/roadmap/roadmap-generate.js';

// A document longer than the 8,000-character public artifact limit but inside the 40,000-character whole-source limit. The fact the
// first step needs ("Gini and entropy nearly always agree") sits far outside that step's highlighted passage.
const FILLER = 'Trees split the data by asking one question at a time about one feature. '.repeat(150);
const MD = `# Impurity\n\n## Gini\nGini impurity is one minus the sum of squared class shares.\n\n## Entropy\nEntropy is minus the sum of share times log share.\n\n## Notes\n${FILLER}\n\n## Comparison\nIn most cases Gini and entropy nearly always agree on the best split.\n`;
const AT = { entropy: MD.indexOf('## Entropy'), notes: MD.indexOf('## Notes'), half: MD.indexOf('Trees split', MD.indexOf('## Notes') + 5600), comparison: MD.indexOf('## Comparison') };
// The plan covers the whole document (passages within the 8,000-character passage limit); the first two steps are the ones bought here.
const PLAN = planInput([['Gini', 0, AT.entropy], ['Entropy', AT.entropy, AT.notes], ['Notes', AT.notes, AT.half], ['More notes', AT.half, AT.comparison], ['Comparison', AT.comparison, MD.length]]);
// Paraphrase plus a quoted illustrative phrase that the passage never says: under the old gate this card was withheld.
const CARD_1 = answer('make_explanation', { title: 'Gini impurity', body: withVisual('Think of it as "how mixed the node is". Gini and entropy usually pick the same split.') });
const CARD_2 = answer('make_explanation', { title: 'Entropy', body: withVisual('Entropy measures disorder; a pure node has zero.') });

const context = body => JSON.parse(typeof body.messages[0].content === 'string' ? body.messages[0].content : body.messages[0].content.at(-1).text).context;

async function start(h) {
  const created = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'balanced', actionKey: KEY('create') });
  assert.ok([200, 202].includes(created.status), JSON.stringify(created.body).slice(0, 300));
  if (created.body.roadmap.state !== 'proposed') console.log('STATE', created.body.roadmap.state, JSON.stringify(created.body.question || created.body.limitation || created.body).slice(0, 600));
  const id = created.body.roadmapId;
  const accepted = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: created.body.roadmap.revision, actionKey: KEY('plan'), planVersion: created.body.roadmap.planVersion });
  return { id, view: accepted.body };
}
const acceptBody = (view, key) => ({ boardId: BOARD, revision: view.roadmap.revision, actionKey: key, proposalVersion: view.proposal.version });
async function deliverAndAck(h, id, view, result, n) {
  const deliver = await h.json('POST', `/api/learn/roadmap/${id}/results/${result.id}/deliver`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY(`deliver${n}`) });
  assert.equal(deliver.status, 200);
  const card = deliver.body.cards[0].block;
  const blocks = JSON.parse(rows(h.w.sqlite, 'SELECT state_json FROM learn_boards WHERE id = ?', BOARD)[0]?.state_json || '{"blocks":[]}').blocks || [];
  h.w.sqlite.prepare('UPDATE learn_boards SET state_json = ?, version = ? WHERE id = ?').run(JSON.stringify({ blocks: [...blocks, card] }), 7 + n, BOARD);
  const ackOnce = revision => h.json('POST', `/api/learn/roadmap/${id}/results/${result.id}/ack`, { boardId: BOARD, revision, actionKey: KEY(`ack${n}`), resultVersion: 1, cardId: card.id, boardRevision: 7 + n });
  // As the client does: on stale_revision show the latest and act again (background events may bump the revision more than once).
  let ack = await ackOnce((await h.status()).roadmap.revision);
  for (let i = 0; i < 5 && ack.status === 409 && ack.body.code === 'stale_revision'; i++) ack = await ackOnce(ack.body.currentRevision);
  assert.equal(ack.status, 200, JSON.stringify(ack.body).slice(0, 300));
  return ack.body;
}

test('the writer gets the whole document (over 8,000 characters) and the step brief, intact; the passage stays the anchor', async t => {
  assert.ok(MD.length > 8000 && MD.length < 40000);
  const h = await loop(t, { plans: [PLAN], script: [CARD_1], md: MD });
  const { id, view } = await start(h);
  const accepted = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  assert.equal(accepted.status, 202);
  assert.equal(h.p.bodies.length, 1, 'one authoring call');
  const ctx = context(h.p.bodies[0]);
  assert.ok(ctx.includes(MD), 'the whole document reaches the author request intact');
  assert.ok(ctx.includes('Gini and entropy nearly always agree'), 'information outside the highlighted passage is available to the writer');
  assert.match(ctx, /Step: Gini\nGoal: Explain gini\.\nClaims to cover:\n- the main claim\nLearning outcome of the roadmap: /);
  assert.ok(ctx.includes(`<passage>\n${MD.slice(0, AT.entropy)}\n</passage>`), 'the highlighted passage is named separately');
  // The accept request carries no context: the source card's collapse or scroll on screen cannot change what the writer reads.
  assert.deepEqual(Object.keys(acceptBody(view, 'k')).sort(), ['actionKey', 'boardId', 'proposalVersion', 'revision']);
  assert.match(h.p.bodies[0].system, /using the whole document/);
});

test('paraphrase and a quoted illustrative phrase are not held: no citation call, recorded as not run, delivered', async t => {
  const h = await loop(t, { plans: [PLAN], script: [CARD_1], md: MD });
  const { id, view } = await start(h);
  const result = (await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')))).body.results[0];
  assert.equal(result.generation, 'generated');
  assert.equal(result.failure, undefined);
  assert.ok(!h.m.calls.includes('roadmap_grounding_check') && !h.m.calls.includes('roadmap_grounding_escalation'), 'no citation check');
  assert.equal(JSON.parse(rows(h.w.sqlite, 'SELECT check_json FROM learn_step_results')[0].check_json).grounding.validation, 'not_run');
});

test('the first and second accepted steps both generate and persist, one authoring call each; a repeated accept buys nothing more', async t => {
  const h = await loop(t, { plans: [PLAN], script: [CARD_1, CARD_2], md: MD });
  const { id, view } = await start(h);
  const first = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept1')));
  const again = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept1')));
  assert.equal(again.body.results[0].id, first.body.results[0].id, 'the repeat replays the same result');
  assert.equal(h.p.bodies.length, 1, 'no second authoring call for a repeated accept');
  const charged = (await h.totals()).used;
  const acked = await deliverAndAck(h, id, first.body, first.body.results[0], 1);
  const proposeOnce = revision => h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision, actionKey: KEY('propose2') });
  let next = await proposeOnce(acked.roadmap.revision);
  for (let i = 0; i < 5 && next.status === 409 && next.body.code === 'stale_revision'; i++) next = await proposeOnce(next.body.currentRevision);
  assert.equal(next.body.proposal.title, 'Entropy');
  const second = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${next.body.proposal.id}/accept`, acceptBody(next.body, KEY('accept2')));
  const secondResult = second.body.results.find(r => r.id !== first.body.results[0].id); // results created in the same second have no stable order
  assert.equal(secondResult.generation, 'generated');
  assert.equal(h.p.bodies.length, 2, 'one authoring call per accepted card');
  await deliverAndAck(h, id, second.body, secondResult, 2);
  const stored = rows(h.w.sqlite, "SELECT delivery, billing FROM learn_step_results WHERE decision = 'accepted' ORDER BY created_at");
  assert.deepEqual(stored.map(r => [r.delivery, r.billing]), [['delivered', 'settled'], ['delivered', 'settled']]);
  assert.equal(rows(h.w.sqlite, "SELECT * FROM usage_actions WHERE client_key LIKE 'rmact_%'").length, 2, 'one learner action per accepted card');
  assert.ok((await h.totals()).used > charged, 'the second card is charged once');
  assert.ok(context(h.p.bodies[1]).includes(MD), 'the second step also reads the whole document');
});

// --- CORE.03 + CORE.05: the writer reads its own accepted step and the accepted history; the quote is the dispatched body ----------------
// Plan versions told apart by their claims and outcome; the learner revises twice before accepting the third.
const claimed = n => { const p = planInput([['Gini', 0, AT.entropy], ['Entropy', AT.entropy, AT.notes], ['Notes', AT.notes, AT.half], ['More notes', AT.half, AT.comparison], ['Comparison', AT.comparison, MD.length]]);
  return { ...p, outcome: `Outcome of plan ${n}.`, steps: p.steps.map(s => ({ ...s, claimsToCover: [`claim of plan ${n}`] })) }; };

async function revisedAndAccepted(h) {
  const made = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'balanced', actionKey: KEY('create') });
  const id = made.body.roadmapId;
  let view = made.body;
  for (const [n, text] of [[1, 'Spend longer on entropy.'], [2, 'Compare them at the end.']]) view = (await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY(`rev${n}`), instruction: text })).body;
  assert.equal(view.roadmap.planVersion, 3);
  const accepted = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('plan'), planVersion: 3 });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body).slice(0, 300));
  return { id, view: accepted.body };
}
const snapshotOf = h => JSON.parse(rows(h.w.sqlite, "SELECT payload_json FROM learn_roadmap_outbox WHERE kind = 'step_accepted'")[0].payload_json).snapshot;

test('CORE.03/05: one request carries the accepted plan version, the original instruction and accepted revisions only, frozen Depth; quote = dispatch', async t => {
  const h = await loop(t, { plans: [claimed(1), claimed(2), claimed(3)], script: [CARD_1], md: MD });
  const { id, view } = await revisedAndAccepted(h);
  h.deps.onAccepted = async () => true; // generation waits so later changes can be made before it runs
  const accepted = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  assert.equal(accepted.status, 202);
  // After acceptance: a later instruction the learner never accepted, and a live Depth change.
  h.w.sqlite.prepare("INSERT INTO learn_roadmap_instructions (roadmap_id, version, org, owner_user_id, board_id, text, origin, created_at) VALUES (?, 4, 'team', 'u-alice', ?, 'A LATER UNACCEPTED WISH', 'revise', 1)").run(id, BOARD);
  h.w.sqlite.prepare("UPDATE learn_roadmaps SET depth = 'detailed' WHERE id = ?").run(id);
  await runDueRoadmapEvents(h.env, {});
  assert.equal(h.p.bodies.length, 1, 'exactly one authoring call');
  const body = h.p.bodies[0], ctx = context(body);
  assert.ok(ctx.includes(MD), 'the whole document');
  assert.ok(ctx.includes('claim of plan 3') && !ctx.includes('claim of plan 2'), 'the accepted plan version claims');
  assert.ok(ctx.includes('Outcome of plan 3.'));
  assert.ok(ctx.includes(`The learner's original request:\n${INSTRUCTION}`));
  assert.ok(ctx.includes("The learner's accepted changes to the roadmap, in order:\n- Spend longer on entropy.\n- Compare them at the end."));
  assert.ok(!ctx.includes('A LATER UNACCEPTED WISH'), 'a later unaccepted instruction is not sent');
  assert.ok(ctx.includes('Teaching scope of the roadmap: the whole document'));
  assert.doesNotMatch(body.system, /Depth: deep/i, 'the Depth frozen at acceptance, not the live one');
  // The snapshot, the quote, the call row and the hold all name the same request.
  const snap = snapshotOf(h);
  assert.deepEqual([snap.planVersion, snap.position, snap.instructionVersion, snap.depth, snap.format, snap.title], [3, 1, 3, 'balanced', 'explanation', 'Gini']);
  assert.deepEqual(snap.learnerInstruction.revisions.map(r => r.text), ['Spend longer on entropy.', 'Compare them at the end.']);
  const route = authorRoute(h.env, h.p.models[0]);
  assert.deepEqual([snap.provider, snap.model], [route.provider, route.model]);
  assert.equal(await requestFingerprint(body, route), snap.requestFingerprint, 'the dispatched body hashes to the quoted fingerprint');
  const [call] = rows(h.w.sqlite, "SELECT provider, model, request_fingerprint, op_id FROM learn_roadmap_calls WHERE payer = 'learner'");
  assert.deepEqual([call.provider, call.model, call.request_fingerprint], [snap.provider, snap.model, snap.requestFingerprint]);
  const [auth] = rows(h.w.sqlite, 'SELECT per_card_bound_micros, aggregate_micros, content_fingerprint FROM learn_step_authorizations');
  assert.deepEqual([auth.per_card_bound_micros, auth.aggregate_micros], [snap.boundMicros, snap.boundMicros], 'one exact one-call bound');
  assert.notEqual(auth.content_fingerprint, rows(h.w.sqlite, 'SELECT content_hash FROM learn_step_proposals')[0].content_hash);
  assert.equal(rows(h.w.sqlite, 'SELECT reserved_micros FROM usage_attempts WHERE attempt_id = ?', call.op_id)[0].reserved_micros, snap.boundMicros, 'the call reserved exactly the quoted bound');
  assert.equal(rows(h.w.sqlite, 'SELECT generation FROM learn_step_results')[0].generation, 'generated');
});

test('CORE.03: a missing or inconsistent accepted plan row refuses before any hold or author call', async t => {
  const h = await loop(t, { plans: [claimed(1)], script: [CARD_1], md: MD });
  const { id, view } = await start(h);
  h.w.sqlite.prepare("UPDATE learn_roadmap_plan_versions SET plan_json = '{\"steps\":[]}' WHERE roadmap_id = ?").run(id);
  const refused = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'step_unavailable');
  assert.equal(h.p.used.length, 0);
  assert.equal(rows(h.w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_authorizations')[0].n, 0, 'no hold');
  // After acceptance, a plan row that no longer matches the snapshot fails the slot with zero author calls and no charge.
  const h2 = await loop(t, { plans: [claimed(1)], script: [CARD_1], md: MD });
  const s2 = await start(h2);
  h2.deps.onAccepted = async () => true;
  assert.equal((await h2.json('POST', `/api/learn/roadmap/${s2.id}/proposals/${s2.view.proposal.id}/accept`, acceptBody(s2.view, KEY('accept')))).status, 202);
  h2.w.sqlite.prepare("UPDATE learn_roadmap_plan_versions SET plan_hash = 'tampered' WHERE roadmap_id = ?").run(s2.id);
  await runDueRoadmapEvents(h2.env, {});
  assert.equal(h2.p.used.length, 0, 'no author dispatch');
  const [r] = rows(h2.w.sqlite, 'SELECT generation, failure_class FROM learn_step_results');
  assert.deepEqual([r.generation, r.failure_class], ['failed', 'terminal_validation_failure']);
  assert.equal((await h2.totals()).used, 0);
});

test('CORE.05: an allowance of exactly the quoted bound admits the card; one micro less refuses with no hold and no call', async t => {
  const probe = await loop(t, { plans: [claimed(1)], script: [CARD_1], md: MD });
  const p = await start(probe);
  probe.deps.onAccepted = async () => true;
  await probe.json('POST', `/api/learn/roadmap/${p.id}/proposals/${p.view.proposal.id}/accept`, acceptBody(p.view, KEY('accept')));
  const bound = snapshotOf(probe).boundMicros;
  // Phase 02 diagram library (2026-11-08): the whole diagram schema raised this plan-model bound from 304,195 to 685,300 micro-USD. Owner C: the limit stays;
  // the roadmap gets the same schema-bundle logic as the fast chain (learn-artifact.js bundledAuthorSchema) when it is turned back on.
  assert.ok(bound > 0 && bound < 800000, `a real-body bound: ${bound}`);
  for (const [allowance, status] of [[bound - 1, 429], [bound, 202]]) {
    const h = await loop(t, { plans: [claimed(1)], script: [CARD_1], md: MD, allowanceMicros: allowance });
    const s = await start(h);
    const res = await h.json('POST', `/api/learn/roadmap/${s.id}/proposals/${s.view.proposal.id}/accept`, acceptBody(s.view, KEY('accept')));
    assert.equal(res.status, status, `allowance ${allowance}`);
    if (status === 429) {
      assert.equal(h.p.used.length, 0);
      assert.equal(rows(h.w.sqlite, "SELECT COUNT(*) AS n FROM usage_attempts WHERE kind = 'tool'")[0].n, 0, 'no hold');
    } else assert.equal(h.p.used.length, 1);
  }
});

// --- UI.03 / BE.03: Edit roadmap after acceptance is a draft of future work; delivered and in-flight work keep their frozen inputs -------------
test('BE.03: with a delivered card and an accepted in-flight card, an edit makes a separate draft; a race refuses the stale draft; reacceptance keeps history', async t => {
  const REVISED = planInput([['Gini', 0, AT.entropy], ['Entropy', AT.entropy, AT.notes], ['Why trees grow', AT.notes, AT.comparison - 1], ['Comparison', AT.comparison, MD.length]]);
  REVISED.steps[2].passage.end = AT.half; REVISED.coverage.uncovered = [{ start: AT.half, end: AT.comparison, reason: 'repetition' }];
  const h = await loop(t, { plans: [PLAN, REVISED, REVISED], script: [CARD_1, CARD_2], md: MD });
  const { id, view } = await start(h);
  const first = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept1')));
  const acked = await deliverAndAck(h, id, first.body, first.body.results[0], 1);
  let proposed = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: acked.roadmap.revision, actionKey: KEY('propose2') });
  for (let i = 0; i < 5 && proposed.status === 409 && proposed.body.code === 'stale_revision'; i++) proposed = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: proposed.body.currentRevision, actionKey: KEY(`propose2${i}`) });
  const stepIds = proposed.body.steps.map(s => s.id);
  // Edit while step 2 is only offered: the draft keeps the one delivered step.
  const edit1 = await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: proposed.body.roadmap.revision, actionKey: KEY('edit1'), instruction: 'Explain why trees grow instead of the notes.', settings: { depth: 'brief' } });
  assert.equal(edit1.status, 202);
  assert.deepEqual([edit1.body.planDraft.version, edit1.body.planDraft.acceptable, edit1.body.plan.version], [2, true, 1], 'a separate draft; the ToC stays on the accepted plan');
  assert.equal(edit1.body.proposal.version, proposed.body.proposal.version, 'the offered card of the accepted plan is untouched');
  // The learner accepts the offered step 2 first (the accepted plan is still authoritative): it is bought and made with ITS inputs.
  const second = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${proposed.body.proposal.id}/accept`, acceptBody(edit1.body, KEY('accept2')));
  assert.equal(second.status, 202);
  const snap2 = JSON.parse(rows(h.w.sqlite, "SELECT payload_json FROM learn_roadmap_outbox WHERE kind = 'step_accepted' ORDER BY created_at DESC, rowid DESC")[0].payload_json).snapshot;
  assert.deepEqual([snap2.planVersion, snap2.depth], [1, 'balanced'], 'the in-flight card keeps the accepted plan and Depth');
  assert.ok(!context(h.p.bodies[1]).includes('why trees grow'), 'the unaccepted edit never reaches the in-flight request');
  // The draft no longer matches what happened: its acceptance is refused, nothing changes.
  const race = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: second.body.roadmap.revision, actionKey: KEY('race'), planVersion: 2 });
  assert.deepEqual([race.status, race.body.code], [409, 'stale_draft']);
  // A fresh revision keeps both steps that happened; accepting it moves them (same ids, results, charges) and offers the next new step.
  const charged = (await h.totals()).used;
  const latest = await h.status();
  const edit2 = await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: latest.roadmap.revision, actionKey: KEY('edit2'), instruction: 'Explain why trees grow instead of the notes.', settings: { depth: 'brief' } });
  assert.equal(edit2.body.planDraft.acceptable, true);
  const re = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: edit2.body.roadmap.revision, actionKey: KEY('reaccept'), planVersion: edit2.body.planDraft.version });
  assert.equal(re.status, 200, JSON.stringify(re.body).slice(0, 300));
  assert.deepEqual(re.body.steps.slice(0, 2).map(s => s.id), stepIds.slice(0, 2), 'delivered and in-flight steps keep their identity');
  assert.deepEqual(re.body.steps.map(s => s.title), ['Gini', 'Entropy', 'Why trees grow', 'Comparison']);
  assert.deepEqual([re.body.roadmap.depth, re.body.roadmap.acceptedPlanVersion, re.body.planDraft], ['brief', edit2.body.planDraft.version, null]);
  assert.equal(re.body.proposal, null, 'no second active offer while the in-flight card is unfinished');
  assert.equal(re.body.results.length, 2, 'both results stay');
  const result2 = re.body.results.find(r => r.id !== first.body.results[0].id);
  const acked2 = await deliverAndAck(h, id, re.body, result2, 2);
  let next = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: acked2.roadmap.revision, actionKey: KEY('propose3') });
  for (let i = 0; i < 5 && next.status === 409 && next.body.code === 'stale_revision'; i++) next = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: next.body.currentRevision, actionKey: KEY(`propose3${i}`) });
  assert.equal(next.body.proposal?.title, 'Why trees grow', 'the next eligible step comes from the new accepted plan');
  assert.equal((await h.totals()).used, charged, 'no charge moved');
  assert.equal(h.p.bodies.length, 2, 'no author call from editing or reaccepting');
});

test('contract 4: the view projects one lifecycle stage per step and result, with the accepted proposal words on the result', async t => {
  const h = await loop(t, { plans: [PLAN], script: [CARD_1], md: MD });
  const { id, view } = await start(h);
  assert.deepEqual([view.proposal.stage, view.steps[0].stage, view.steps[1].stage], ['proposed', 'proposed', 'planned']);
  h.w.sqlite.prepare("UPDATE learn_step_proposals SET title = 'Gini, edited', description = 'An edited description'").run(); // as an applied Edit card leaves it
  h.deps.onAccepted = async () => true;
  const accepted = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept')));
  assert.deepEqual([accepted.body.results[0].stage, accepted.body.steps[0].stage], ['generating', 'generating']);
  assert.deepEqual([accepted.body.results[0].title, accepted.body.results[0].description, accepted.body.results[0].format], ['Gini, edited', 'An edited description', 'explanation']);
  await runDueRoadmapEvents(h.env, {});
  const generated = await h.status();
  assert.deepEqual([generated.results[0].stage, generated.steps[0].stage], ['saving', 'saving'], 'generated and checked, waiting for the board save and acknowledgement');
  const acked = await deliverAndAck(h, id, generated, generated.results[0], 1);
  assert.deepEqual([acked.results[0].stage, acked.steps[0].stage], ['ready', 'ready']);
  assert.ok(!JSON.stringify(acked).includes('Gini impurity is one minus'), 'polling still carries no source text');
});

test('verify-to-be-1: a revised draft whose steps are exactly the steps that already happened can be accepted (no future step rows)', async t => {
  const SAME = planInput([['Gini', 0, AT.entropy], ['Entropy', AT.entropy, AT.notes]]);
  SAME.coverage.uncovered = [{ start: AT.notes, end: MD.length, reason: 'enough for now' }];
  const h = await loop(t, { plans: [PLAN, SAME], script: [CARD_1, CARD_2], md: MD });
  const { id, view } = await start(h);
  const first = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${view.proposal.id}/accept`, acceptBody(view, KEY('accept1')));
  const acked = await deliverAndAck(h, id, first.body, first.body.results[0], 1);
  let next = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: acked.roadmap.revision, actionKey: KEY('propose2') });
  for (let i = 0; i < 5 && next.status === 409 && next.body.code === 'stale_revision'; i++) next = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: next.body.currentRevision, actionKey: KEY(`propose2${i}`) });
  const second = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${next.body.proposal.id}/accept`, acceptBody(next.body, KEY('accept2')));
  const edit = await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: second.body.roadmap.revision, actionKey: KEY('edit'), instruction: 'That is enough, stop after these two.' });
  assert.equal(edit.body.planDraft.acceptable, true);
  const re = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: edit.body.roadmap.revision, actionKey: KEY('reaccept'), planVersion: edit.body.planDraft.version });
  assert.equal(re.status, 200, JSON.stringify(re.body).slice(0, 300));
  assert.deepEqual(re.body.steps.map(s => s.title), ['Gini', 'Entropy']);
});
