// GEN1 (checklist 2.1.3 "Bounded source, accepted input, one author and Explanation", "Offer, slots, ToC and delivery"; CORE.03-05, BE.05a, BE.12):
// the pinned source and the accepted plan are validated before an author call is priced or sent, and the source is checked again before a card is
// published. Real routes, store, money and outbox through the BE workflow harness (roadmap-workflow-fixture.js); the outside is doubled. No model,
// no network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { routes } from '../../web/src/roadmap-client.js';
import { AT, KEY, MD, STEPS, USERS, acceptCard, deliver, explanation, planOf, started, status, table, workflow } from './roadmap-workflow-fixture.js';

const authorizations = h => h.rows('SELECT * FROM learn_step_authorizations');
const learnerActions = h => h.rows("SELECT * FROM usage_actions WHERE client_key LIKE 'rmact_%'");
const pending = h => h.rows("SELECT id, version, state FROM learn_step_proposals WHERE state IN ('checking', 'held', 'pending')");
const resultRow = h => h.rows('SELECT * FROM learn_step_results')[0];
const noWork = (h, totalsBefore) => assert.deepEqual([h.authorCalls.length, authorizations(h).length, learnerActions(h).length, JSON.stringify(h.totals())], [0, 0, 0, totalsBefore], 'zero author dispatch, hold and debit');
const gone = h => { delete h.objects[`r2/${USERS.alice.fileId}`]; };
const changed = h => h.sqlite.prepare('UPDATE file_sources SET sha256 = ? WHERE id = ?').run('f'.repeat(64), USERS.alice.fileId);
const TABLE_FIRST = planOf([{ ...STEPS[1], passage: { start: 0, end: AT.entropy } }, { ...STEPS[0], passage: { start: AT.entropy, end: AT.background } }], { coverage: { uncovered: [{ start: AT.background, end: MD.length, reason: 'The learner asked to focus on the criteria.' }] } });

test('GEN1 acceptance when the pinned source is gone: typed offer recovery in Chat, nothing priced, held, sent or debited', async t => {
  const h = await workflow(t, { script: [explanation()] });
  const view = await started(h);
  const before = JSON.stringify(h.totals());
  gone(h);
  const refused = await acceptCard(h, view, 'gone');
  assert.deepEqual([refused.status, refused.body.code], [409, 'offer_unready'], JSON.stringify(refused.body).slice(0, 200));
  noWork(h, before);
  const now = await status(h);
  assert.equal(now.offerRecovery?.reason, 'source_unavailable', 'Chat gets the recovery fact for the same step');
  assert.equal(now.offerRecovery?.stepId, view.proposal.stepId);
  assert.equal(pending(h).length, 0, 'the stale offer was taken back, no new offer over a missing source');
});

test('GEN1 acceptance when the pinned source changed: the same typed recovery, nothing priced, held, sent or debited', async t => {
  const h = await workflow(t, { script: [explanation()] });
  const view = await started(h);
  const before = JSON.stringify(h.totals());
  changed(h);
  const refused = await acceptCard(h, view, 'changed');
  assert.deepEqual([refused.status, refused.body.code], [409, 'offer_unready']);
  noWork(h, before);
  assert.equal((await status(h)).offerRecovery?.reason, 'source_unavailable');
});

test('GEN1 the accepted plan must carry valid claims and an outcome before anything is quoted', async t => {
  for (const [name, edit] of [['no claims', plan => { for (const s of plan.steps) delete s.claimsToCover; }], ['an empty claim', plan => { plan.steps[0].claimsToCover = ['  ']; }], ['no outcome', plan => { plan.outcome = ''; }]]) {
    await t.test(name, async () => {
      const h = await workflow(t, { script: [explanation()] });
      const view = await started(h);
      const before = JSON.stringify(h.totals());
      const row = h.rows('SELECT version, plan_json FROM learn_roadmap_plan_versions WHERE accepted_at IS NOT NULL ORDER BY version DESC')[0];
      const plan = JSON.parse(row.plan_json); edit(plan);
      h.sqlite.prepare('UPDATE learn_roadmap_plan_versions SET plan_json = ? WHERE version = ?').run(JSON.stringify(plan), row.version);
      const refused = await acceptCard(h, view, 'plan-binding');
      assert.deepEqual([refused.status, refused.body.code], [409, 'step_unavailable'], JSON.stringify(refused.body).slice(0, 200));
      noWork(h, before);
    });
  }
});

test('GEN1 the source vanishes after acceptance and before dispatch: no author call, the learner is refunded, Chat gets the recovery', async t => {
  const h = await workflow(t, { script: [explanation()], hold: true });
  const view = await started(h);
  const before = JSON.stringify(h.totals());
  assert.equal((await acceptCard(h, view, 'accept')).status, 202);
  gone(h);
  await h.run();
  assert.equal(h.authorCalls.length, 0, 'no author dispatch over a missing source');
  const row = resultRow(h);
  assert.equal(row.generation, 'failed');
  assert.notEqual(row.billing, 'settled');
  assert.equal(JSON.stringify(h.totals()), before, 'the hold was refunded');
  const next = await h.route('alice', routes.proposeNext(await status(h), KEY('next')));
  assert.equal(next.status, 200, JSON.stringify(next.body).slice(0, 160));
  assert.equal((await status(h)).offerRecovery?.reason, 'source_unavailable', 'the next offer is not made over a missing source: Chat recovery');
  assert.equal(h.authorCalls.length, 0);
});

test('GEN1 the source changes while the author call runs: nothing is published, the learner is refunded, no card can be delivered', async t => {
  const swap = async (model, body) => { changed(h); return explanation()(model, body); };
  const h = await workflow(t, { script: [swap] });
  const view = await started(h);
  const before = JSON.stringify(h.totals());
  const accepted = await acceptCard(h, view, 'accept');
  assert.equal(accepted.status, 202);
  assert.equal(h.authorCalls.length, 1, 'the call had already been dispatched');
  const row = resultRow(h);
  assert.deepEqual([row.generation, row.failure_class], ['failed', 'denied_access'], 'the stale card is refused, not recorded');
  assert.notEqual(row.billing, 'settled');
  assert.equal(JSON.stringify(h.totals()), before, 'the learner is refunded');
  assert.notEqual((await deliver(h, row.id)).status, 200, 'no readable body for a refused card');
  assert.deepEqual(h.handlerErrors, []);
});

test('GEN1 a table step carries the explicit Depth objective, Standard included', async t => {
  for (const [depth, objective] of [['balanced', /Depth: Balanced\. Explain how and why/], ['brief', /Depth: Brief\. Explain the central idea/], ['detailed', /Depth: Detailed\. Develop the reasoning/]]) {
    await t.test(depth, async () => {
      const h = await workflow(t, { plans: [TABLE_FIRST], script: [table()] });
      const view = await started(h, { depth });
      assert.equal(view.proposal.format, 'table');
      assert.equal((await acceptCard(h, view, 'accept')).status, 202);
      assert.equal(h.authorCalls.length, 1);
      assert.match(h.authorCalls[0].text, objective, `the ${depth} table author input names its Depth objective`);
      assert.ok(MD.length > 0);
    });
  }
});
