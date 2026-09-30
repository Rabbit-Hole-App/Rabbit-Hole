import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CHOICES } from './model-choices.js';
import { ASK_MODELS } from '../../control-plane/src/learn-models.js';

test('the picker offers exactly the server allowlist keys, each with a label and a hint, and no model ids', () => {
  assert.deepEqual(MODEL_CHOICES.map(choice => choice.key), Object.keys(ASK_MODELS));
  for (const choice of MODEL_CHOICES) {
    assert.deepEqual(Object.keys(choice), ['key', 'label', 'hint']);
    assert.ok(choice.label && choice.hint, choice.key);
  }
  assert.equal(JSON.stringify(MODEL_CHOICES).includes('claude-'), false);
});
