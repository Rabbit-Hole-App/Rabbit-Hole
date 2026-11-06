// R4.11 recovery: Retry, Replace and Omit are the same authorized actions from Chat or the ToC. Retry and Replace are a new proposal version with its
// own checked offer, authorization and operation identities; none reuses the earlier charge, and a replay of any half is recorded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptRoadmapStep, failCard, offerProposal } from '../src/roadmap/roadmap-store.js';
import { retryStep, replaceStep, omitStep } from '../src/roadmap/roadmap-lifecycle.js';
import { withRoadmapProviderCall, learnerUsageEnv, planCall } from '../src/roadmap/roadmap-money.js';
import { spendTransport } from '../src/learn-spend.js';
import { usageTotals, periodOf } from '../src/learn-usage.js';
import { world, offered, rows, provider, body, MODEL } from './roadmap-fixture.js';

const PERIOD = periodOf(Math.floor(Date.now() / 1000));
async function failedCard(t) {
  const w = world(t);
  const o = await offered(w, w.access);
  const done = await acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-key-0001' });
  const { resultId, cardId } = done.body.slots[0];
  const usage = learnerUsageEnv(w.env, w.access, o.proposalId, o.proposalVersion);
  const { env, opId, key } = await withRoadmapProviderCall(usage, { proposalId: o.proposalId, proposalVersion: o.proposalVersion, cardId, stage: 'generate', call: 0, retry: 0, authorizationId: done.body.authorizationId }, { kind: 'generation' });
  await planCall(w.LEARN_DB, w.access, { opId, key, roadmapId: o.roadmapId, resultId, authorizationId: done.body.authorizationId, stage: 'generate', call: 0, retry: 0, payer: 'learner', task: 'artifact', now: 1 });
  await spendTransport(env, body, MODEL, 'team', provider().reply(), { userId: 'u-alice', category: 'roadmap' });
  await failCard(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, resultId, failureClass: 'terminal_validation_failure' });
  const revision = rows(w.sqlite, 'SELECT revision FROM learn_roadmaps')[0].revision;
  return { w, o, resultId, revision, totals: () => usageTotals(w.LEARN_DB, 'u-alice', PERIOD) };
}

test('Retry: a new proposal version is offered and accepted with its own authorization; the refunded charge is not resurrected; a replay buys nothing', async t => {
  const { w, o, revision, totals } = await failedCard(t);
  assert.equal((await totals()).used, 0);
  const args = { roadmapId: o.roadmapId, stepId: o.stepId, expectedRevision: revision, actionKey: 'retry-key-00001' };
  const first = await retryStep(w.env, w.access, args);
  assert.equal(first.status, 202);
  assert.equal(rows(w.sqlite, 'SELECT proposal_version FROM learn_step_authorizations ORDER BY created_at').length, 2, 'a second, separate authorization');
  assert.deepEqual(rows(w.sqlite, 'SELECT version, state FROM learn_step_proposals ORDER BY version'), [{ version: 1, state: 'accepted' }, { version: 2, state: 'accepted' }]);
  assert.equal(rows(w.sqlite, "SELECT COUNT(*) AS n FROM usage_attempts WHERE kind = 'tool' AND status = 'running'")[0].n, 1, 'one live hold: the first was released');
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_results').length, 2);
  assert.equal(rows(w.sqlite, 'SELECT billing FROM learn_step_results ORDER BY created_at')[0].billing, 'refunded', 'the old result stays refunded');
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_roadmap_steps WHERE id = ?', o.stepId)[0].state, 'generating');
  const again = await retryStep(w.env, w.access, args);
  assert.equal(again.replayed, true);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_authorizations').length, 2);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_proposals').length, 2);
});

test('Replace: a new checked proposal for only the failed card, pending until accepted; the old one stays history', async t => {
  const { w, o, revision } = await failedCard(t);
  const compose = async () => ({ format: 'table', title: 'A table instead', description: 'Same idea as a table', contentHash: 'hash-table' });
  const out = await replaceStep(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, stepId: o.stepId, expectedRevision: revision, actionKey: 'replace-key-001', compose });
  assert.equal(out.body.version, 2);
  assert.deepEqual(rows(w.sqlite, 'SELECT version, state, format FROM learn_step_proposals ORDER BY version'), [{ version: 1, state: 'accepted', format: 'explanation' }, { version: 2, state: 'pending', format: 'table' }]);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_authorizations').length, 1, 'nothing is bought until the learner accepts the replacement');
  const replay = await replaceStep(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, stepId: o.stepId, expectedRevision: revision, actionKey: 'replace-key-001', compose });
  assert.equal(replay.replayed, true);
  assert.equal(rows(w.sqlite, 'SELECT * FROM learn_step_proposals').length, 2);
});

test('Omit skips the failed step and nothing else; a step that is not incomplete cannot be omitted', async t => {
  const { w, o, revision } = await failedCard(t);
  const out = await omitStep(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, stepId: o.stepId, expectedRevision: revision, actionKey: 'omit-key-0001' });
  assert.equal(out.status, 200);
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_roadmap_steps WHERE id = ?', o.stepId)[0].state, 'skipped');
  assert.equal(rows(w.sqlite, 'SELECT state FROM learn_roadmap_steps WHERE roadmap_id = ? AND position = 2', o.roadmapId)[0].state, 'planned');
  await assert.rejects(omitStep(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, stepId: o.stepId, expectedRevision: revision + 1, actionKey: 'omit-key-0002' }), e => e.status === 409);
});

test('an offer replayed after the version moved on is a replay, not a key reuse (minted values stay out of the fingerprint)', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  const again = await offerProposal(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, expectedRevision: 3, actionKey: 'offer-1-000001', stepId: o.stepId, format: 'explanation', title: 'Step one', description: 'About Y', contentHash: 'hash1' });
  assert.equal(again.replayed, true);
  assert.equal(again.body.proposalId, o.proposalId);
});
