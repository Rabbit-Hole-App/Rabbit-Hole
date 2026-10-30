// EB-02.4: an Explain-back card leaves the learner's own state behind wherever anyone else, or a copy, receives it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPLAIN_BACK_PRIVATE, publicExplainBack } from './explain-back-private.js';

const card = {
  id: 'eb1', type: 'challenge', mode: 'explain_back', prompt: 'Why does the period not depend on amplitude?', hint: 'Think about small angles.', expects: ['restoring force'], dx: 4, dy: 8, groupId: 'g1',
  answer: 'PRIVATE answer', attemptId: 'at_1', verdict: 'PRIVATE verdict', grading: false, reviewFailed: false, history: [{ attemptId: 'at_0', answer: 'PRIVATE old' }],
  draft: 'PRIVATE draft', voice: [{ assetId: 'aa_voice00000001' }], recording: { assetId: 'aa_rec000000001' }, activityId: 'act_1', activityRevision: 2, goalId: 'goal_1',
  sketch: { draftId: 'd1', strokes: [{ points: [] }], shapes: [], items: [] }, sketchOpen: true, sketchSubmitted: true, sketchPinned: true, sketchWidth: 480,
};

test('the public exercise stays; every private field goes', () => {
  const shown = publicExplainBack(card);
  assert.deepEqual(shown, { id: 'eb1', type: 'challenge', mode: 'explain_back', prompt: card.prompt, hint: card.hint, expects: card.expects, dx: 4, dy: 8, groupId: 'g1' });
  assert.doesNotMatch(JSON.stringify(shown), /PRIVATE|aa_|at_|d1/);
  assert.equal(card.answer, 'PRIVATE answer', 'the original is not changed');
  assert.ok(EXPLAIN_BACK_PRIVATE.every(key => key in card), 'the fixture carries every private key');
});

test('other cards, a plain Challenge included, come back as they were', () => {
  const plain = { id: 'c1', type: 'challenge', prompt: 'Guess', answer: 'kept here; sharedState drops it by its own list', draft: 'x' };
  assert.equal(publicExplainBack(plain), plain);
  const code = { id: 'k1', type: 'code', draft: 'print(1)' };
  assert.equal(publicExplainBack(code), code);
  const bare = { id: 'eb2', type: 'challenge', mode: 'explain_back', prompt: 'Q' };
  assert.equal(publicExplainBack(bare), bare);
});

test('the canvas copies, duplicates and pastes an Explain-back card as its exercise', () => {
  const source = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.ok(/const copyNode = node => \(\{ \.\.\.publicExplainBack\(node\)/.test(source), 'pasteIds copies through publicExplainBack');
});
