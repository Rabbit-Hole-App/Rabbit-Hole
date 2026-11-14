// INT-03 / INT-04 wiring (docs/features/interact.md): the shapes the SERVER emits parse in the UI adapters, with the same fixtures the server's end-to-end test
// uses (control-plane/test/interact-e2e.test.js): the signed proposal and the plan the job route serves for it, the stage words, the saved composition on the block,
// and the result-route client's panel argument. No browser, no model call, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planProposalFields, scenePlanView } from '../../control-plane/src/explain-job.js';
import { DESIGN_PUBLIC_STATE, DESIGN_STAGES } from '../../control-plane/src/interact-design.js';
import { fixtureDraft, sealEnvelope } from './interact-build-fixtures.js';
import { compileCardComposition, resolveTimeline } from './interact-composition.js';
import { compositionOf, experimentControls, normalizeComposition } from './interact-composition-adapter.js';
import { cardLayout, layoutProblems } from './interact-card-layout.js';
import { interactFixtures } from './interact-plan-fixtures.js';
import { planHash } from './interact-plan.js';
import { reviewModel } from './interact-plan-review.js';
import { INTERACT_STAGES, interactIdentity, interactStageText, isInteractJob, planOfProposal } from './interact-stage.js';
import { explainClient, explainStage, sharedProgramClient } from './explain-client.js';
import { clampTime, programDuration, savedTime, timeLabel } from './explain-program/program-card.js';
import { resolveSupportArtifact } from './interact-support-snapshots.js';

const { plans } = await interactFixtures();
const plan = plans.standard, hash = await planHash(plan);

// A job as ExplainJobs holds it once the design closed, and the proposal the server signs from it (planProposalFields).
const job = {
  id: 'ej_0123456789abcdef', boardId: 'board-1', app: 'canvas-a', revision: 'xr_1', prompt: 'Explain the top of a toss.', owner: { org: 'acme', email: 'learner@example.com' }, context: null,
  flow: { version: 1, profile: { id: 'opus-baseline', hash: 'b'.repeat(16) } }, reservation: { generationMicros: 1000 },
  design: { plan, finalHash: hash, runtimeHash: 'c'.repeat(64), approvalHash: 'd'.repeat(64), rev: 1, open: [], carried: [], reviews: [], revisions: [], fit: { styleVersion: 'card-description-v1:estimate' } },
};
const proposal = { proposal_id: 'gp-0123456789abcdef', version: 1, ...planProposalFields(job), usage: {} };

test('the proposal the server signs is a new-flow proposal, and the plan the job route serves for it is the one it reviews', () => {
  const served = scenePlanView(job);
  assert.deepEqual(interactIdentity(proposal), { version: 1, hash, profileHash: job.flow.profile.hash, revision: 1 });
  assert.equal(planOfProposal(proposal, served), plan);
  const model = reviewModel(proposal, planOfProposal(proposal, served));
  assert.equal(model.ready, true, model.reason);
  assert.equal(model.title, plan.title);
  assert.equal(model.cardDescription, plan.cardDescription);
  assert.equal(model.detail.story, plan.story, 'the full Story is in the plan detail');
});

test('Generate stays off until the plan is served, and a plan at another hash or revision is not this proposal\'s', () => {
  const served = scenePlanView(job);
  assert.equal(planOfProposal(proposal, null), null);
  assert.equal(reviewModel(proposal, null).ready, false, 'before the job route answered');
  assert.equal(planOfProposal(proposal, { ...served, hash: 'f'.repeat(64) }), null);
  assert.equal(planOfProposal(proposal, { ...served, revision: 2 }), null);
  assert.equal(planOfProposal({ ...proposal, command: 'motion' }, served), null);
  assert.equal(planOfProposal({ ...proposal, input: { job: 'x' } }, served), null, 'an older explain proposal has no plan');
});

test('the stage words are the server\'s own, and a job carrying the server\'s flow is a new-flow job', () => {
  for (const stage of DESIGN_STAGES) {
    assert.equal(INTERACT_STAGES[stage], DESIGN_PUBLIC_STATE[stage], stage);
    assert.equal(explainStage({ stage, flow: { version: 1 }, designState: DESIGN_PUBLIC_STATE[stage] }), DESIGN_PUBLIC_STATE[stage]);
    assert.equal(isInteractJob({ stage }), true, 'a design stage is the new flow\'s alone');
  }
  assert.equal(explainStage({ stage: 'awaiting_approval', flow: { version: 1 } }), DESIGN_PUBLIC_STATE.awaiting_approval);
  assert.equal(INTERACT_STAGES.awaiting_approval, DESIGN_PUBLIC_STATE.awaiting_approval);
  assert.equal(interactStageText({ stage: 'authoring', flow: { version: 1 } }), null, 'the build stages keep the existing words');
  assert.equal(explainStage({ stage: 'awaiting_approval' }), 'Review the explanation plan in Chat', 'the older flow keeps its words');
});

// The record the server saves with an accepted result, built from the same Standard fixtures the end-to-end test builds from.
const composition = await compileCardComposition(plan, await sealEnvelope(fixtureDraft('standard')));
const block = { type: 'animation', id: 'card-0001', explain: { resultId: 'er_1', revision: 'xr_1', cardId: 'card-0001', canvas: { boardId: 'board-1' } }, program: { kind: 'explain_program', resultId: 'er_1', bundleHash: composition.main.artifact.hash }, interact: { version: 1, planHash: composition.planHash, composition } };

test('the saved composition on the block parses in the card adapter, survives the canvas\'s JSON, and lays out the Standard card', () => {
  const value = compositionOf(JSON.parse(JSON.stringify(block)));
  assert.ok(!value.problems, JSON.stringify(value.problems));
  assert.equal(value.title, plan.title);
  assert.equal(value.cardDescription, plan.cardDescription);
  assert.equal(value.envelopeHash, composition.envelopeHash);
  assert.deepEqual(cardLayout(value).map(s => s.kind), ['title', 'description', 'support', 'scene', 'readouts', 'timeline', 'controls'], 'Three moments above the animation, its readouts row and its timeline directly under it, then only the Reset row');
  assert.deepEqual(layoutProblems(cardLayout(value)), []);
  assert.equal(value.supports[0].title, 'Three moments around the top');
  assert.deepEqual(value.supports[0].artifact.program, { bundleHash: composition.supporting[0].artifact.hash }, 'the panel is asked for from the result route by this hash');
  assert.deepEqual(experimentControls(value), [], 'Standard has playback and the scrubber only: no controls row');
  assert.equal(compositionOf({ type: 'animation', program: block.program }), null, 'a legacy block has none');
  assert.ok(normalizeComposition({ ...composition, version: 2 }).problems?.length, 'an unknown version is refused');
});

test('the card reads its time from the composition: the endpoint, the signed origin, the markers and the pacing of Standard', () => {
  const value = compositionOf(block), end = 6 / 9.8, apex = 3 / 9.8;
  const span = resolveTimeline(value, {});
  assert.deepEqual([span.start, span.end, span.displayOffset, span.playbackRate], [0, end, -apex, 0.1]);
  assert.deepEqual(span.markers.map(m => [m.id, m.time]), [['before', apex - 0.1], ['top', apex], ['after', apex + 0.1]]);
  // The helpers the player calls, on a manifest as the builder declares it (the fixture build is sealed with the same manifest).
  const manifest = fixtureDraft('standard').main.program.manifest;
  assert.equal(programDuration(manifest, value, {}), end);
  assert.equal(clampTime(manifest, apex + 0.1 + 1e-4, value, {}), apex + 0.1, 'a seek within half a step of a marker lands exactly on it');
  assert.equal(savedTime(manifest, apex, value, {}), Number(apex.toFixed(4)));
  assert.equal(timeLabel(manifest, 0, value, {}), '−0.31s');
  assert.equal(timeLabel(manifest, apex, value, {}), '0.00s');
  assert.equal(timeLabel(manifest, apex + 0.1, value, {}), '+0.10s');
});

test('the result client asks for a supporting panel by id, on the owner route and on a share link', async () => {
  const paths = [];
  const client = explainClient(path => { paths.push(path); return Promise.resolve({}); }, 'board-1');
  await client.result('er_1', 'card-0001');
  await client.result('er_1', 'card-0001', 'threeMoments');
  assert.deepEqual(paths, ['/api/learn/explain/jobs/results/er_1?board=board-1', '/api/learn/explain/jobs/results/er_1?board=board-1&panel=threeMoments']);
  const urls = [];
  const shared = sharedProgramClient('tok', async url => { urls.push(url); return { ok: true, json: async () => ({ artifact: {} }) }; });
  await shared.result('er_1', 'card-0001');
  await shared.result('er_1', 'card-0001', 'threeMoments');
  assert.deepEqual(urls, ['/api/learn/boards/shared/tok/cards/card-0001/program', '/api/learn/boards/shared/tok/cards/card-0001/program?panel=threeMoments']);
  // The card's support panel asks for itself by its own id (interact-support-snapshots.js).
  const asked = [];
  const value = compositionOf(block);
  await resolveSupportArtifact(value.supports[0], { block, client: { result: (...args) => { asked.push(args); return Promise.resolve({ artifact: null }); } }, fixtures: false, stamps: null }).catch(() => {});
  assert.deepEqual(asked.map(a => a[2]), ['threeMoments']);
});
