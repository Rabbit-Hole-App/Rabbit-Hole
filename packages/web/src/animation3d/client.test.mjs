// The browser client for /animation jobs and results (AN-03/AN-05): request shapes against an injected fetchJson, stage words,
// and the binding of a result to the card, board, job and request it was made for (plan section 5 "State and recovery rules").
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_ROUTES, animationClient, animationPendingBlock, animationResultBlock, animationRetry, animationRunning, animationStage } from './client.js';

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

test('a pending card is the job\'s card, with the request it was made for', () => {
  const block = animationPendingBlock({ job: { id: 'j1', cardId: 'c1', boardId: 'b1', stage: 'queued' }, prompt: 'A lever balancing two masses', requestId: 'r1' });
  assert.deepEqual(block, { id: 'c1', type: 'animation3d', title: 'A lever balancing two masses', animationJob: { id: 'j1', boardId: 'b1', stage: 'queued', requestId: 'r1' } });
});

test('a result attaches only to its own card, board, job and request; placement and the saved prompt stay', () => {
  const card = { id: 'c1', type: 'animation3d', title: 'Lever', dx: 40, dy: 80, w: 600, promptUsed: '/animation a lever', animationJob: { id: 'j1', boardId: 'b1', stage: 'reviewing', requestId: 'r1' } };
  const job = { id: 'j1', cardId: 'c1', boardId: 'b1', requestId: 'r1', stage: 'ready' };
  const result = { cardId: 'c1', boardId: 'b1', artifactRef: { id: 'art-1', revision: 1, hash: 'h1' }, title: 'Balancing a lever' };
  assert.deepEqual(animationResultBlock(card, job, result), { id: 'c1', type: 'animation3d', title: 'Balancing a lever', dx: 40, dy: 80, w: 600, promptUsed: '/animation a lever', artifactRef: { id: 'art-1', revision: 1, hash: 'h1' } });
  assert.equal(animationResultBlock(card, { ...job, stage: 'reviewing' }, result), null, 'not ready');
  assert.equal(animationResultBlock(card, { ...job, id: 'j2' }, result), null, 'another job');
  assert.equal(animationResultBlock(card, { ...job, cardId: 'c2' }, result), null, 'another card');
  assert.equal(animationResultBlock(card, job, { ...result, cardId: 'c2' }), null, 'a result for another card');
  assert.equal(animationResultBlock(card, { ...job, boardId: 'b2' }, result), null, 'after a board switch');
  assert.equal(animationResultBlock(card, job, { ...result, boardId: 'b2' }), null);
  assert.equal(animationResultBlock(card, { ...job, requestId: 'r0' }, result), null, 'an older request');
  assert.equal(animationResultBlock(card, job, { ...result, artifactRef: null }), null, 'no accepted artifact');
  assert.equal(animationResultBlock({ ...card, animationJob: undefined }, job, result), null, 'a card no longer waiting');
});
