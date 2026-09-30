import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShadowGrader, parseVerdict } from './learn-grade-shadow.js';
import { challengePrompt, explainBackPrompt } from './learn-grade-prompts.js';

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

// Golden text of today's grading instructions (C6 in docs/features/learn-cleanup.md):
// moving them must not change a character. A deliberate change re-pins here and
// is recorded under Prompt changes in that doc.
const CHALLENGE_TAIL = [
  'Start your reply with a line reading exactly "VERDICT: good" when the answer covers the key ideas, or "VERDICT: partial" otherwise.',
  'Then reply in at most three short sentences: say which key ideas they already have, name what is missing or wrong, and end with one nudge about what to watch for next. Address the learner as "you". Do not give the full explanation away.',
];
const EXPLAIN_TAIL = [
  'Start your reply with a line reading exactly "VERDICT: good" only when every key idea is present and correct, otherwise "VERDICT: partial".',
  'Then in at most three short sentences: name the ideas they got right, name each missing or incorrect one explicitly, and ask one question that would settle the gap. Address the learner as "you". Do not restate the whole explanation for them.',
];
test('golden: the challenge instruction, with key ideas and with the empty-ideas fallback', () => {
  assert.equal(challengePrompt({ prompt: 'Why exp?', expects: ['positive', 'sums to one'] }, 'It "stays" positive.'), [
    "You are grading a learner's first-guess answer to a lesson challenge. Be encouraging and specific.",
    'Challenge: Why exp?',
    'Key ideas a good answer touches: positive; sums to one',
    'Learner\'s answer: "It "stays" positive."',
    ...CHALLENGE_TAIL,
  ].join('\n'));
  const fallback = [
    "You are grading a learner's first-guess answer to a lesson challenge. Be encouraging and specific.",
    'Challenge: Why exp?',
    'Key ideas a good answer touches: the main mechanism being asked about',
    'Learner\'s answer: "a guess"',
    ...CHALLENGE_TAIL,
  ].join('\n');
  assert.equal(challengePrompt({ prompt: 'Why exp?', expects: [] }, 'a guess'), fallback);
  assert.equal(challengePrompt({ prompt: 'Why exp?' }, 'a guess'), fallback);
});
test('golden: the explain-back instruction, with key ideas and with the empty-ideas fallback', () => {
  const block = { mode: 'explain_back', prompt: 'Explain softmax.' };
  assert.equal(challengePrompt({ ...block, expects: ['exp', 'normalise'] }, 'line one\nline two'), [
    'You are judging whether a learner can explain a concept in their own words. Be fair and concrete, not flattering.',
    'They were asked: Explain softmax.',
    'An explanation counts as sound when it covers: exp; normalise',
    'Learner\'s explanation: "line one\nline two"',
    ...EXPLAIN_TAIL,
  ].join('\n'));
  assert.equal(challengePrompt({ ...block, expects: [] }, 'x'), explainBackPrompt({ ...block }, 'x'));
  assert.equal(explainBackPrompt(block, 'x'), [
    'You are judging whether a learner can explain a concept in their own words. Be fair and concrete, not flattering.',
    'They were asked: Explain softmax.',
    'An explanation counts as sound when it covers: the mechanism being asked about',
    'Learner\'s explanation: "x"',
    ...EXPLAIN_TAIL,
  ].join('\n'));
});
test('golden: parseVerdict takes the first token anywhere, case-insensitive', () => {
  for (const [text, verdict] of [
    ['VERDICT: good\nNice.', 'good'], ['VERDICT:partial', 'partial'], ['Intro. verdict: GOOD then', 'good'],
    ['VERDICT: partial\nlater VERDICT: good', 'partial'], ['VERDICT: great', null], [null, null], [undefined, null],
  ]) assert.equal(parseVerdict(text), verdict, String(text));
});
