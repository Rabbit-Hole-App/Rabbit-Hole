import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShadowGrader, parseVerdict } from './learn-grade-shadow.js';
import { challengePrompt } from './learn-grade-prompts.js';

const app = { name: 'demo-app', hosting: null };
const block = { id: 'b1', attemptId: 'a1b2c3d4-0000', prompt: 'Why exp?', expects: ['positive'] };
function recorder(statuses) {
  const calls = [];
  let index = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const status = statuses[Math.min(index++, statuses.length - 1)];
    if (status instanceof Error) throw status;
    const body = [200, 202, 409, 502].includes(status) ? { grade_id: 7, status: 'x' } : { error: 'no' };
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

test('sends the attempt, the mode and the app name - never a source', async () => {
  const r = recorder([200]);
  const { shadowGrade } = createShadowGrader({ fetchImpl: r.fetchImpl, headers: () => ({ 'X-Small-Workspace': 'team' }) });
  assert.equal(await shadowGrade({ app, board: 'my-board', block, answer: 'because' }), 7);
  assert.equal(r.calls[0].url, '/api/learn/grade');
  assert.deepEqual(r.calls[0].body, { app: 'demo-app', attempt_id: 'a1b2c3d4-0000', board: 'my-board', block_id: 'b1', mode: 'challenge', prompt: 'Why exp?', expects: ['positive'], answer: 'because' });
  assert.equal(r.calls[0].init.headers['X-Small-Workspace'], 'team');
  assert.equal(r.calls[0].init.headers['Content-Type'], 'application/json');
});

test('explain_back passes through; anything else is challenge', async () => {
  const r = recorder([200, 200]);
  const { shadowGrade } = createShadowGrader({ fetchImpl: r.fetchImpl });
  await shadowGrade({ app, block: { ...block, mode: 'explain_back' }, answer: 'a' });
  await shadowGrade({ app, block: { ...block, mode: 'weird' }, answer: 'a' });
  assert.deepEqual(r.calls.map(call => call.body.mode), ['explain_back', 'challenge']);
  assert.equal(r.calls[0].body.board, null);
});

test('no request for AWS apps, blocks without key ideas, or without an attempt id', async () => {
  const r = recorder([200]);
  const { shadowGrade } = createShadowGrader({ fetchImpl: r.fetchImpl });
  assert.equal(await shadowGrade({ app: { name: 'x', hosting: 'aws' }, block, answer: 'a' }), null);
  assert.equal(await shadowGrade({ app, block: { ...block, expects: [] }, answer: 'a' }), null);
  assert.equal(await shadowGrade({ app, block: { ...block, attemptId: undefined }, answer: 'a' }), null);
  assert.equal(r.calls.length, 0);
});

test('resolves the grade id for 200, 202, 409 and 502; null otherwise; never throws', async () => {
  for (const status of [200, 202, 409, 502]) assert.equal(await createShadowGrader({ fetchImpl: recorder([status]).fetchImpl }).shadowGrade({ app, block, answer: 'a' }), 7, String(status));
  for (const status of [400, 401, 403, 500, 503]) assert.equal(await createShadowGrader({ fetchImpl: recorder([status]).fetchImpl }).shadowGrade({ app, block, answer: 'a' }), null, String(status));
  assert.equal(await createShadowGrader({ fetchImpl: recorder([new TypeError('offline')]).fetchImpl }).shadowGrade({ app, block, answer: 'a' }), null);
  assert.equal(await createShadowGrader({ fetchImpl: async () => new Response('not json', { status: 200 }) }).shadowGrade({ app, block, answer: 'a' }), null);
});

test('the baseline carries a rounded integer ms and never throws', async () => {
  const r = recorder([200]);
  const { recordBaseline } = createShadowGrader({ fetchImpl: r.fetchImpl });
  assert.equal(await recordBaseline({ app: 'demo-app', gradeId: 7, verdict: 'good', ms: 1234.6 }), true);
  assert.equal(r.calls[0].url, '/api/learn/grade/7/baseline');
  assert.deepEqual(r.calls[0].body, { app: 'demo-app', verdict: 'good', ms: 1235 });
  assert.equal(await recordBaseline({ app: 'demo-app', gradeId: null, verdict: 'good', ms: 1 }), false);
  assert.equal(await recordBaseline({ app: 'demo-app', gradeId: 7, verdict: null, ms: 700000 }), false, 'past the cap is dropped, never clamped');
  assert.equal(await createShadowGrader({ fetchImpl: async () => { throw new Error('offline'); } }).recordBaseline({ app: 'demo-app', gradeId: 7, verdict: 'partial', ms: 5 }), false);
  assert.equal(await createShadowGrader({ fetchImpl: recorder([404]).fetchImpl }).recordBaseline({ app: 'demo-app', gradeId: 7, verdict: 'good', ms: 5 }), false);
});

test('parseVerdict reads the tutor token', () => {
  assert.equal(parseVerdict('VERDICT: good\nNice.'), 'good');
  assert.equal(parseVerdict('verdict:   PARTIAL rest'), 'partial');
  assert.equal(parseVerdict('No token here'), null);
  assert.equal(parseVerdict(''), null);
});

test('the prompts moved unchanged', () => {
  assert.match(challengePrompt({ prompt: 'Why?', expects: ['a'] }, 'b'), /VERDICT: good/);
  assert.match(challengePrompt({ prompt: 'Why?', expects: ['a'], mode: 'explain_back' }, 'b'), /explain a concept in their own words/);
});
