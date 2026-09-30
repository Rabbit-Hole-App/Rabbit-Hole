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
test('the Settings default model says the pick applies to chat answers only; Learn shows no model at all', async () => {
  const { readFileSync } = await import('node:fs');
  const { MODEL_SCOPE } = await import('./model-choices.js');
  assert.match(MODEL_SCOPE, /chat answers only/);
  assert.match(MODEL_SCOPE, /cards, the whiteboard and grading/i);
  const sidebar = readFileSync(new URL('./Sidebar.jsx', import.meta.url), 'utf8');
  assert.match(sidebar, /<SettingsRow title="Default model" desc=\{`New chats start on this model; you can still switch per message\. \$\{MODEL_SCOPE\}`\}>/);
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  // Users choose intent, Rabbit Hole chooses the model: Learn sends auto, and its / command button sits where the pill was.
  assert.match(ask, /useState\(\(\) => privateChat \|\| learnChat \? 'auto'/);
  assert.match(ask, /const chatControl = learnChat \? slashControl : modelControl;/);
  assert.doesNotMatch(ask, /\{dock && modelControl\}|trailing=\{dock \? null : modelControl\}/);
  // The slot is Auto (not a model: it opens the command palette) or the chosen command as a pill whose × keeps the text,
  // and a pill sends exactly "/command text".
  assert.match(ask, /aria-label="Auto" title="Auto: Rabbit Hole picks the action/);
  assert.match(ask, /data-command-pill/);
  assert.match(ask, /aria-label=\{`Remove \/\$\{command\}`\} title="Back to Auto" onMouseDown=\{event => event\.preventDefault\(\)\} onClick=\{\(\) => \{ setCommand\(null\); inputRef\.current\?\.focus\(\); \}\}/);
  assert.match(ask, /const line = `\/\$\{command\} \$\{raw\.trim\(\)\}`\.trim\(\);/);
});
