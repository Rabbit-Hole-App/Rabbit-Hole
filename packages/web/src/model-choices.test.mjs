import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CHOICES } from './model-choices.js';
import { ASK_MODELS } from '../../control-plane/src/learn-models.js';

test('the picker offers the server allowlist keys but Opus 5 (chat runs on Gemini for now), each with a label and a hint, and no model ids', () => {
  assert.deepEqual(MODEL_CHOICES.map(choice => choice.key), Object.keys(ASK_MODELS).filter(key => key !== 'opus-5'));
  assert.equal(MODEL_CHOICES[0].hint, 'Gemini 3.5 Flash Lite');
  for (const choice of MODEL_CHOICES) {
    assert.deepEqual(Object.keys(choice), ['key', 'label', 'hint']);
    assert.ok(choice.label && choice.hint, choice.key);
  }
  assert.equal(JSON.stringify(MODEL_CHOICES).includes('claude-'), false);
});

test('a saved pick the picker no longer offers (the old opus-5) reads as Auto; the others are kept', async () => {
  const { savedModel } = await import('./model-choices.js');
  assert.deepEqual(['opus-5', null, '', 'gpt-5', 'auto', 'sonnet-5', 'haiku-4.5'].map(savedModel), ['auto', 'auto', 'auto', 'auto', 'auto', 'sonnet-5', 'haiku-4.5']);
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
  // The slot is "/" (not a model and not the mode: it opens the command palette; owner brief 2026-10-13 section 5) or the
  // chosen command as a pill whose × keeps the text, and a pill sends exactly "/command text".
  assert.match(ask, /data-command-slot aria-label="Commands" title="Choose a command"/);
  // The pill is the shared CommandPill (Release B): its x is "Remove <label>" and only drops the command. Since UI-16 (owner,
  // 2026-10-21) it is the composer's inline token, never in the toolbar slot.
  assert.match(ask, /const commandToken = slash && command \? <CommandPill name=\{command\} onOpen=\{openPalette\} onRemove=\{removeCommand\}/);
  assert.match(ask, /const removeCommand = \(\) => \{ changeCommand\(null\); inputRef\.current\?\.focus\(\); \};/);
  assert.match(ask, /onSubmit=\{send\} ready=\{!!command\} token=\{commandToken\}/);
  assert.doesNotMatch(ask.slice(ask.indexOf('const slashControl'), ask.indexOf('const commandToken')), /<CommandPill/);
  const pill = readFileSync(new URL('./CommandPill.jsx', import.meta.url), 'utf8');
  assert.match(pill, /data-command-pill=\{name\}/);
  assert.match(pill, /aria-label=\{`Remove \$\{label\}`\} title=\{`Remove \$\{label\}`\} onMouseDown=\{event => event\.preventDefault\(\)\} onClick=\{onRemove\}/);
  assert.match(ask, /const line = !regenerate && slash \? commandLine\(raw, \{ command, prompted \}\) : null;/); // learn-slash.js commandLine: \"/command text\"
});
