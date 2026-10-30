// The browser client for /animation jobs and results (AN-03/AN-05): request shapes against an injected fetchJson and the stage
// words. A result's binding to its card is storage.js settleAnimationJob's (storage.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_ROUTES, animationClient, animationRetry, animationRunning, animationStage } from './client.js';

const recorder = () => { const calls = []; const fetchJson = async (path, options = {}) => { calls.push({ path, ...options, body: options.body ? JSON.parse(options.body) : undefined }); return { ok: true }; }; return { calls, fetchJson }; };

test('request shapes: create, get, action and result, scoped to the board, ids encoded', async () => {
  const { calls, fetchJson } = recorder();
  const client = animationClient(fetchJson, 'board 1');
  await client.create({ proposalId: 'gp-1', version: 3, cardId: 'card-1', requestId: 'req-1' });
  await client.get('job/1');
  await client.action('job/1', 'retry', { expectedAttempt: 2 });
  await client.action('job/1', 'cancel');
  const signal = new AbortController().signal;
  await client.result('res 1', { signal });
  await client.result('res2');
  assert.deepEqual(calls, [
    { path: ANIMATION_ROUTES.jobs, method: 'POST', body: { boardId: 'board 1', proposalId: 'gp-1', version: 3, cardId: 'card-1', requestId: 'req-1' } },
    { path: `${ANIMATION_ROUTES.jobs}/job%2F1?board=board%201`, body: undefined },
    { path: `${ANIMATION_ROUTES.jobs}/job%2F1/retry`, method: 'POST', body: { boardId: 'board 1', expectedAttempt: 2 } },
    { path: `${ANIMATION_ROUTES.jobs}/job%2F1/cancel`, method: 'POST', body: { boardId: 'board 1' } },
    { path: `${ANIMATION_ROUTES.results}/res%201?board=board%201`, signal, body: undefined },
    { path: `${ANIMATION_ROUTES.results}/res2?board=board%201`, body: undefined },
  ]);
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
  assert.equal(animationRetry({ stage: 'failed' }), 'new_attempt');
  assert.equal(animationRetry({ stage: 'authoring' }), null);
});
