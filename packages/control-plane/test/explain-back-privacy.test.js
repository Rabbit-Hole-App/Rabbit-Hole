// EB-02.4: a share link, a member's view and every fork carry an Explain-back card's exercise and its Input wiring, never
// the learner's answer, drafts, attempts, reviews, Sketch or store binding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedState } from '../src/shared-privacy.js';
import { forkState } from '../src/learn-boards.js';

const SECRET = 'LEARNER-PRIVATE';
const board = {
  blocks: [
    { id: 'eb1', type: 'challenge', mode: 'explain_back', prompt: 'Why does the period not depend on amplitude?', hint: 'Small angles.', expects: ['restoring force'],
      answer: `${SECRET}-answer`, attemptId: `${SECRET}-attempt`, verdict: `${SECRET}-verdict`, history: [{ answer: `${SECRET}-old`, verdict: `${SECRET}-old-review` }], reviewFailed: false,
      draft: `${SECRET}-draft`, voice: [{ assetId: `aa_${SECRET}` }], activityId: `${SECRET}-activity`, sketch: { draftId: `${SECRET}-draft-id`, strokes: [] }, sketchPinned: true, sketchWidth: 500, sketchOpen: true },
    { id: 'nb1', type: 'notebook', notebook_id: 'n1', ipynb: { cells: [] } },
    { id: 'c1', type: 'challenge', prompt: 'Plain challenge', answer: `${SECRET}-plain` },
  ],
  links: [{ id: 'L1', kind: 'explain-input', from: 'nb1', fromSide: 'bottom', to: 'eb1', toSide: 'input', scope: { cells: ['c1'] } }],
  groups: [],
};

test('a shared view and a link visitor\'s fork keep the exercise and its Input wiring, not the learner\'s state', () => {
  const shown = sharedState(board);
  assert.doesNotMatch(JSON.stringify(shown), new RegExp(SECRET));
  const eb = shown.blocks.find(block => block.id === 'eb1');
  assert.deepEqual([eb.prompt, eb.hint, eb.expects], [board.blocks[0].prompt, 'Small angles.', ['restoring force']]);
  assert.deepEqual(shown.links, board.links);
});

test('an owner\'s duplicate or fork copies the Explain-back exercise only; other cards keep their state as before', () => {
  const copy = forkState(board);
  const eb = copy.blocks.find(block => block.id === 'eb1');
  assert.doesNotMatch(JSON.stringify(eb), new RegExp(SECRET));
  assert.equal(eb.prompt, board.blocks[0].prompt);
  assert.equal(copy.blocks.find(block => block.id === 'c1').answer, `${SECRET}-plain`, 'a plain Challenge in an owner duplicate is unchanged');
  assert.deepEqual(copy.links, board.links);
  assert.equal(board.blocks[0].answer, `${SECRET}-answer`, 'the source board is not changed');
});
