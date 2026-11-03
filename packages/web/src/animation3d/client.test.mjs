// The browser client for /animation jobs and results (AN-03/AN-05): request shapes against an injected fetchJson and the stage
// words. A result's binding to its card is storage.js settleAnimationJob's (storage.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { animationAsks, choiceAction, ANIMATION_ROUTES, animationClient, animationProgress, animationProposalStatus, animationRetry, animationRunning, animationStage, readyResult, requestRef } from './client.js';
import { experimentFixture } from './fixtures.js';
import { refProblem, settleAnimationJob, withJob } from './storage.js';

const recorder = () => { const calls = []; const fetchJson = async (path, options = {}) => { calls.push({ path, ...options, body: options.body ? JSON.parse(options.body) : undefined }); return { ok: true }; }; return { calls, fetchJson }; };

test('request shapes (lane G routes): create, get, action and result, scoped to the board, ids encoded', async () => {
  assert.deepEqual(ANIMATION_ROUTES, { jobs: '/api/learn/animation/jobs', results: '/api/learn/animation/jobs/results' });
  const { calls, fetchJson } = recorder();
  const client = animationClient(fetchJson, 'board 1');
  await client.create({ requestId: 'req-1', cardId: 'card-1', prompt: 'a lever', context: 'selected text' });
  await client.get('job/1');
  await client.action('job/1', 'retry', { expectedAttempt: 2 });
  await client.action('job/1', 'cancel');
  const signal = new AbortController().signal;
  await client.result('res 1', { signal });
  await client.result('res2');
  assert.deepEqual(calls, [
    { path: ANIMATION_ROUTES.jobs, method: 'POST', body: { boardId: 'board 1', requestId: 'req-1', cardId: 'card-1', prompt: 'a lever', context: 'selected text', features: ['curve_radius'] } },
    { path: `${ANIMATION_ROUTES.jobs}/job%2F1?board=board%201`, body: undefined },
    { path: `${ANIMATION_ROUTES.jobs}/job%2F1/retry`, method: 'POST', body: { boardId: 'board 1', expectedAttempt: 2 } },
    { path: `${ANIMATION_ROUTES.jobs}/job%2F1/cancel`, method: 'POST', body: { boardId: 'board 1' } },
    // What this build can draw (capabilities.js ANIMATION_CLIENT_FEATURES, owner 2026-11-02): asked for and read with, so the server never
    // gives it a scene it cannot draw.
    { path: `${ANIMATION_ROUTES.results}/res%201?board=board%201&features=curve_radius`, signal, body: undefined },
    { path: `${ANIMATION_ROUTES.results}/res2?board=board%201&features=curve_radius`, body: undefined },
  ]);
});

test('progress: Build, Check, Render, Review follow the running stages; a correction starts over and is named; everything else keeps the spinner', () => {
  const steps = ['Build', 'Check', 'Render', 'Review'];
  [['authoring', 0], ['validating', 1], ['rendering', 2], ['reviewing', 3]].forEach(([stage, current]) => {
    assert.deepEqual(animationProgress({ stage }), { steps, current, correcting: false }, stage);
  });
  assert.deepEqual(animationProgress({ stage: 'repairing' }), { steps, current: 0, correcting: true }, 'never forward past Review');
  for (const stage of ['queued', 'preparing', 'awaiting_approval', 'ready', 'failed', 'cancelled', 'unknown']) assert.equal(animationProgress({ stage }), null, stage);
  assert.equal(animationProgress({ stage: 'authoring', terminal: true }), null);
  assert.equal(animationProgress(null), null);
});

test('a refusal from fetchJson reaches the caller unchanged (status and data kept)', async () => {
  const refusal = Object.assign(new Error('Not yours'), { status: 403, data: { code: 'forbidden' } });
  const client = animationClient(async () => { throw refusal; }, 'b');
  await assert.rejects(client.get('j'), error => error === refusal);
});

test('stage words: the server\'s stage, no ellipsis, a failure\'s own message; running and retry follow the job', () => {
  for (const stage of ['queued', 'preparing', 'awaiting_approval', 'authoring', 'validating', 'rendering', 'reviewing', 'repairing', 'ready', 'cancelled', 'unknown']) {
    assert.doesNotMatch(animationStage({ stage }), /\.\.\.|…/, stage);
  }
  assert.equal(animationStage({ stage: 'failed', failure: { message: 'The scene could not be checked.' } }), 'The scene could not be checked.');
  assert.equal(animationStage({ stage: 'failed' }), 'The scene could not be made.');
  assert.equal(animationRunning({ stage: 'authoring' }), true);
  assert.equal(animationRunning({ stage: 'awaiting_approval' }), false, 'a plan waits on the learner');
  assert.equal(animationRunning({ stage: 'authoring', terminal: true }), false);
  assert.equal(animationRunning(null), false);
  assert.equal(animationRetry({ stage: 'failed', recovery: ['retry_render'] }), 'retry_render');
  // Only what the server offers (owner 2026-11-01: a failed job offering only edit_request, or not read yet, offered a Try again the
  // server then refused).
  assert.equal(animationRetry({ stage: 'failed' }), null);
  assert.equal(animationRetry({ stage: 'failed', recovery: [] }), null);
  assert.equal(animationRetry({ stage: 'failed', recovery: ['edit_request'] }), null);
  assert.equal(animationRetry({ stage: 'failed', recovery: ['revise_plan', 'edit_request'] }), 'revise_plan');
  assert.equal(animationRetry({ stage: 'failed', recovery: ['new_attempt', 'edit_request'] }), 'new_attempt');
  assert.equal(animationRetry({ stage: 'authoring' }), null);
});

// Lane G's ready job (animation-job.js accept): its result names the sealed artifact by resultId (= the artifact's artifactId).
const art = () => structuredClone(experimentFixture.artifact);
const readyJob = (over = {}) => ({ id: 'j1', boardId: 'b1', cardId: 'c1', stage: 'ready', terminal: true,
  result: { jobId: 'j1', resultId: art().artifactId, cardId: 'c1', canvas: { boardId: 'b1' }, requestRef: 'ref16', revision: 'av_1', planHash: art().planHash, artifactHash: 'x', experience: 'experiment' }, ...over });

test('requestRef is lane G\'s: sha256 of "requestId|trimmed words", first 16 hex', async () => {
  assert.equal(await requestRef('r1', '  a lever  '), createHash('sha256').update('r1|a lever').digest('hex').slice(0, 16));
});

test('a ready job maps onto the board\'s reference (storage.js): the artifact\'s own identity, read once, and it lands on its card', async () => {
  const reads = [];
  const mapped = await readyResult(readyJob(), async id => { reads.push(id); return { artifact: art(), execution: { allowed: true } }; });
  assert.deepEqual(reads, ['fixture-beam-balance']);
  const card = withJob({ id: 'c1', type: 'animation3d', title: 'Lever' }, { job: { id: 'j1', stage: 'authoring' }, boardId: 'b1', requestId: 'r1', sourceKey: 'ref16' });
  const out = settleAnimationJob(card, mapped, { boardId: 'b1' });
  assert.equal(out.action, 'apply');
  const { ref } = out.block.animation3d;
  assert.equal(refProblem(ref), null, 'a valid storage.js reference');
  assert.deepEqual([ref.artifactId, ref.revision, ref.planHash, ref.sourceHash, ref.boardId, ref.cardId], ['fixture-beam-balance', 1, art().planHash, art().program.sourceHash, 'b1', 'c1']);
  assert.equal(out.block.animation3dJob, undefined);
  // Another request's result (requestRef) never lands; nor one for another board.
  assert.equal(settleAnimationJob({ ...card, animation3dJob: { ...card.animation3dJob, sourceKey: 'other' } }, mapped, { boardId: 'b1' }).action, 'ignore');
  assert.equal(settleAnimationJob(card, mapped, { boardId: 'b2' }).action, 'ignore');
});

test('a ready job whose artifact is not the one it names, or no job result, maps to null; a job not ready is not read', async () => {
  const read = async () => ({ artifact: { ...art(), artifactId: 'someone-else' } });
  assert.equal(await readyResult(readyJob(), read), null);
  assert.equal(await readyResult(readyJob(), async () => ({ artifact: { ...art(), planHash: 'f'.repeat(64) } })), null);
  assert.equal(await readyResult(readyJob(), async () => ({})), null);
  let reads = 0;
  assert.equal(await readyResult(readyJob({ stage: 'reviewing' }), async () => { reads += 1; return {}; }), null);
  assert.equal(await readyResult(readyJob({ result: null }), async () => { reads += 1; return {}; }), null);
  assert.equal(reads, 0);
});

test('an approved plan shows its job and card in Chat, never "Added to the canvas" for a failed job or a missing card', () => {
  const failed = { stage: 'failed', failure: { message: 'The scene was too large to check.' } };
  assert.equal(animationProposalStatus({ job: null }), null, 'nothing claimed before the read');
  assert.deepEqual([animationProposalStatus({ job: failed, cardId: 'c' }).phase, animationProposalStatus({ job: failed, cardId: 'c' }).detail, animationProposalStatus({ job: failed, cardId: 'c' }).cardId, animationProposalStatus({ job: failed, cardId: 'c' }).label], ['failed', 'The scene was too large to check.', 'c', null]);
  const gone = animationProposalStatus({ job: failed, onCanvas: false, cardId: 'c' });
  assert.match(gone.detail, /too large to check\. Its card is not on this canvas\. Send the request again/);
  assert.equal(gone.cardId, null, 'nothing to go to');
  assert.deepEqual([animationProposalStatus({ job: { stage: 'ready' }, cardId: 'c' }).label, animationProposalStatus({ job: { stage: 'ready' }, cardId: 'c' }).cardId], ['Added to the canvas', 'c']);
  assert.equal(animationProposalStatus({ job: { stage: 'ready' }, onCanvas: false, cardId: 'c' }).label, null, 'a made scene with no card is not "added"');
  assert.deepEqual([animationProposalStatus({ job: { stage: 'reviewing' }, cardId: 'c' }).active, animationProposalStatus({ job: { stage: 'reviewing' }, cardId: 'c' }).detail], [true, 'Reviewing the render']);
  assert.equal(animationProposalStatus({ job: { stage: 'cancelled' }, cardId: 'c' }).phase, 'stopped');
  assert.equal(animationProposalStatus({ unread: true }).phase, 'unknown');
});

// FX-AN-031: what the card and Chat say before Generate and at a change offered in Chat.
test('a plan waiting on a change says so; a change says what it costs; no words carry dollars or an ellipsis', () => {
  assert.equal(animationStage({ stage: 'awaiting_approval', choiceOpen: true }), 'Choose a change to the plan in Chat');
  assert.equal(animationStage({ stage: 'awaiting_approval', choiceOpen: false }), 'Review the scene plan above the chat box');
  assert.equal(animationAsks({ stage: 'failed', stopReason: 'needs_clarification' }), true);
  assert.equal(animationAsks({ stage: 'failed', stopReason: 'rounds' }), false);
  assert.deepEqual(choiceAction({ id: 'watch', credits: 56 }), { label: 'Plan this', cost: 'Uses up to 56 AI credits to write the plan. Nothing is built until you press Generate.' });
  assert.deepEqual(choiceAction({ id: 'fewer_markers' }), { label: 'Use this plan', cost: 'Uses no AI credits. Nothing is built until you press Generate.' });
  assert.equal(choiceAction({ id: 'keep' }).label, 'Keep my plan');
});
