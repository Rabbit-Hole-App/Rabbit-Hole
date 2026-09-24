import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askLiveOnPreview, learnHandoff, learnPreview, PRODUCT } from './flags.js';

// Node has no Vite env, which is the live build's view: no preview, today's name.
test('outside the dev build the preview is off and the product is small', () => {
  assert.equal(learnPreview, false);
  assert.equal(PRODUCT, 'small');
});

test('the Learn handoff stays off until the PR that merges it flips it (T02 §9)', () => {
  assert.equal(learnHandoff, false);
});

test('preview asks never write live chat history until the user chooses otherwise', () => {
  assert.equal(askLiveOnPreview, false);
});
