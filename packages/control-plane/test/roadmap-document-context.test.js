// Owner MVP (2026-11-06): an accepted ordinary explanation is written from the whole document plus the step brief, in one authoring call,
// with no per-card citation gate; the passage offsets stay the highlight anchor. Same harness as roadmap-loop.test.js: real State, glue
// and generator, only the outside doubled. No model, no network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rows } from './roadmap-fixture.js';
import { BOARD, ID_B, INSTRUCTION, KEY, answer, loop, planInput } from './roadmap-loop-fixture.js';

// A document longer than the 8,000-character public artifact limit but inside the 40,000-character whole-source limit. The fact the
// first step needs ("Gini and entropy nearly always agree") sits far outside that step's highlighted passage.
const FILLER = 'Trees split the data by asking one question at a time about one feature. '.repeat(150);
const MD = `# Impurity\n\n## Gini\nGini impurity is one minus the sum of squared class shares.\n\n## Entropy\nEntropy is minus the sum of share times log share.\n\n## Notes\n${FILLER}\n\n## Comparison\nIn most cases Gini and entropy nearly always agree on the best split.\n`;
const AT = { entropy: MD.indexOf('## Entropy'), notes: MD.indexOf('## Notes'), half: MD.indexOf('Trees split', MD.indexOf('## Notes') + 5600), comparison: MD.indexOf('## Comparison') };
// The plan covers the whole document (passages within the 8,000-character passage limit); the first two steps are the ones bought here.
const PLAN = planInput([['Gini', 0, AT.entropy], ['Entropy', AT.entropy, AT.notes], ['Notes', AT.notes, AT.half], ['More notes', AT.half, AT.comparison], ['Comparison', AT.comparison, MD.length]]);
// Paraphrase plus a quoted illustrative phrase that the passage never says: under the old gate this card was withheld.
const CARD_1 = answer('make_explanation', { title: 'Gini impurity', body: 'Think of it as "how mixed the node is". Gini and entropy usually pick the same split.' });
const CARD_2 = answer('make_explanation', { title: 'Entropy', body: 'Entropy measures disorder; a pure node has zero.' });

const context = body => JSON.parse(typeof body.messages[0].content === 'string' ? body.messages[0].content : body.messages[0].content.at(-1).text).context;

async function start(h) {
  const created = await h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'standard', actionKey: KEY('create') });
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
  let ack = await ackOnce((await h.status()).roadmap.revision);
  if (ack.status === 409 && ack.body.code === 'stale_revision') ack = await ackOnce(ack.body.currentRevision); // as the client does: show the latest, act once more
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
  const next = await h.json('POST', `/api/learn/roadmap/${id}/steps/propose`, { boardId: BOARD, revision: acked.roadmap.revision, actionKey: KEY('propose2') });
  assert.equal(next.body.proposal.title, 'Entropy');
  const second = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${next.body.proposal.id}/accept`, acceptBody(next.body, KEY('accept2')));
  assert.equal(second.body.results.at(-1).generation, 'generated');
  assert.equal(h.p.bodies.length, 2, 'one authoring call per accepted card');
  await deliverAndAck(h, id, second.body, second.body.results.at(-1), 2);
  const stored = rows(h.w.sqlite, "SELECT delivery, billing FROM learn_step_results WHERE decision = 'accepted' ORDER BY created_at");
  assert.deepEqual(stored.map(r => [r.delivery, r.billing]), [['delivered', 'settled'], ['delivered', 'settled']]);
  assert.equal(rows(h.w.sqlite, "SELECT * FROM usage_actions WHERE client_key LIKE 'rmact_%'").length, 2, 'one learner action per accepted card');
  assert.ok((await h.totals()).used > charged, 'the second card is charged once');
  assert.ok(context(h.p.bodies[1]).includes(MD), 'the second step also reads the whole document');
});
