// tests/evals/explain-back/run.test.mjs
// The Explain-back quality runner without a provider: every case builds a real request through the real path, the scorer
// reads reviews correctly, and the cap stops a run before a case could pass it.
//   node --test tests/evals/explain-back/run.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CASES, WORST_CASE_USD, runCases, score, standIn } from './run.mjs';

test('dry run: every case reaches the evaluator with its own evidence, at an estimated cost', async () => {
  const seen = standIn();
  const run = await runCases({ callModel: seen.callModel });
  assert.equal(run.stopped, null);
  assert.equal(seen.calls.length, CASES.cases.length, 'one evaluator request per case (a wrong-prior parent uses its own stand-in)');
  const byCase = Object.fromEntries(CASES.cases.map((c, i) => [c.id, JSON.parse(String(seen.calls[i].body.messages[0].content[0]?.text ?? seen.calls[i].body.messages[0].content).replace(/^[^\n]*\n/, ''))]));
  const kinds = id => byCase[id].current.evidence.map(p => p.kind);
  assert.deepEqual(kinds('voice-only'), ['voice_transcript']);
  assert.deepEqual(kinds('text-sketch-complementary'), ['typed_text', 'sketch']);
  assert.deepEqual(kinds('recording-self-correction'), ['sketch_recording']);
  assert.ok(byCase['recording-self-correction'].current.evidence[0].steps.some(s => s.text.includes('F outward')), 'the mistaken step is in the timeline');
  assert.deepEqual(byCase['unclear-speech'].current.evidence[0].uncertainWords, ['tangle']);
  assert.ok(kinds('reference-only').includes('resource'));
  assert.equal(byCase['wrong-prior-review'].previousAttempt.review.criteria.find(c => c.judgment === 'contradicted') != null, true, 'the wrong prior review is in the request');
  for (const i of [4, 5]) assert.equal(seen.calls[i].body.messages[0].content.filter(b => b.type === 'image').length, 1);
});

test('the run stops before a case whose worst cost could pass the cap', async () => {
  const run = await runCases({ cases: CASES.cases.slice(0, 3), maxUsd: WORST_CASE_USD + 0.01 });
  assert.equal(run.results.length, 1);
  assert.equal(run.stopped.before, CASES.cases[1].id);
});

test('the scorer: allowed judgments, questions, coverage, comparison and rating bounds', () => {
  const c = CASES.cases.find(x => x.id === 'wrong-prior-review'), card = CASES.cards.circle;
  const id = idea => `k_${createHash('sha256').update(card.ideas[idea]).digest('hex').slice(0, 16)}`;
  const review = { judgments: [{ criterionId: id('force'), judgment: 'demonstrated' }, { criterionId: id('velocity'), judgment: 'demonstrated' }], comparison: { items: [{ criterionId: id('force'), change: 'resolved' }] }, rating: { status: 'rated', score: 10 } };
  const s = score(c, card, review);
  assert.equal(s.pass, false, 'a corrected prior review is not learner improvement');
  assert.deepEqual(s.checks.filter(x => !x.ok).map(x => x.what), ['comparison force']);
  review.comparison.items[0].change = 'prior_feedback_corrected';
  assert.equal(score(c, card, review).pass, true);
});

