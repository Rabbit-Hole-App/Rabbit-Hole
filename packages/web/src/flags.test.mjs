import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiFindAllowed, aiReadsOnPreview, askLiveOnPreview, learnPreview, PRODUCT } from './flags.js';

// Node has no Vite env, which is the live build's view: no preview, today's name.
test('outside the dev build the preview is off and the product is small', () => {
  assert.equal(learnPreview, false);
  assert.equal(PRODUCT, 'small');
});

test('preview asks never write live chat history until the user chooses otherwise', () => {
  assert.equal(askLiveOnPreview, false);
});

test('model-backed live reads stay off on the preview until the user approves them (G5)', () => {
  assert.equal(aiReadsOnPreview, false);
  assert.equal(aiFindAllowed(false), true); // the live build keeps today's AI find
  assert.equal(aiFindAllowed(true), false); // the preview never calls the live model
});
