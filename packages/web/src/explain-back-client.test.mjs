import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttemptRequestError, bindCard, listAttempts, submitAnswer } from './explain-back-client.js';

const stub = (status, body) => {
  const calls = [];
  globalThis.fetch = async (path, init) => { calls.push({ path, init }); return { ok: status < 400, status, json: async () => body }; };
  return calls;
};

test('submit sends the contract envelope with the binding, key and server-repeated prior-feedback ref', async () => {
  const calls = stub(200, { attempt: { attemptId: 'a2' } });
  const answer = { v: 1, kind: 'explain_back', text: 'force points inward', voice: [], resources: [], assistance: [], baseline: { parentAttemptId: 'a1', parentAssessmentId: 's1' } };
  await submitAnswer({ app: 'demo', board: 'b', binding: { activityId: 'act', activityRevision: 3 }, submissionKey: 'eb_k', answer });
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].path, '/api/learn/tutor/attempts');
  assert.deepEqual([sent.app, sent.board, sent.activityId, sent.activityRevision, sent.submissionKey], ['demo', 'b', 'act', 3, 'eb_k']);
  assert.deepEqual(sent.submittedContent, answer);
  assert.deepEqual(sent.assistanceRefs, ['saw_prior_feedback:s1']);
});

test('errors surface the server code; listing reads only the card', async () => {
  stub(409, { error: 'stale_baseline', detail: { parentAssessmentId: 's2' } });
  await assert.rejects(bindCard({ app: 'demo', board: 'b', cardId: 'c', prompt: 'Why?' }), e => e instanceof AttemptRequestError && e.code === 'stale_baseline' && e.detail.parentAssessmentId === 's2');
  const calls = stub(200, { attempts: [{ attemptId: 'a1' }] });
  assert.deepEqual(await listAttempts({ app: 'demo', board: 'b', cardId: 'c' }), [{ attemptId: 'a1' }]);
  assert.equal(calls[0].path, '/api/learn/tutor/attempts?app=demo&board=b&cardId=c');
  assert.equal(calls[0].init.method, undefined);
});
