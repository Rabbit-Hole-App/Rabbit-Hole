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

// models-5: where the model is chosen, the copy says it reaches chat answers only.
test('the Settings default model and the Learn chat model pill say the pick applies to chat answers only', async () => {
  const { readFileSync } = await import('node:fs');
  const { MODEL_SCOPE } = await import('./model-choices.js');
  assert.match(MODEL_SCOPE, /chat answers only/);
  assert.match(MODEL_SCOPE, /cards, the whiteboard and grading/i);
  const sidebar = readFileSync(new URL('./Sidebar.jsx', import.meta.url), 'utf8');
  assert.match(sidebar, /<SettingsRow title="Default model" desc=\{`New chats start on this model; you can still switch per message\. \$\{MODEL_SCOPE\}`\}>/);
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  assert.match(ask, /title=\{privateChat \? chatConfig\.model : learnChat \? MODEL_SCOPE : undefined\}/);
});
