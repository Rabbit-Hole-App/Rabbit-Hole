// Home ask (owner, 2026-10-04; docs/features/home-ask.md): a question asked on Home is answered in place from the
// user's own library; only an explicit learning request (or the answer's offer) starts a Rabbit Hole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEARN_INTENT, route } from './router.js';
import { journeyMessage, teachPlan } from './teach-plan.js';

const at = (text) => route(text, { mode: 'auto', catalog: [], scope: { kind: 'workspace' } });

test('normal and ambiguous questions stay questions: answered in place, never a new canvas', () => {
  for (const text of ['What canvases do I have?', 'Where did I learn about softmax?', 'What is softmax?', 'Explain attention',
    'tell me about attention', 'softmax?', 'Can you teach?', 'I learned softmax last week', 'how do I learn faster', 'learn attention'])
    assert.deepEqual(at(text), { type: 'ask', mode: 'ask', text }, text);
});

test('an explicit learning request starts a Rabbit Hole and keeps the whole question as its learning intent', () => {
  for (const text of ['Teach me attention', 'teach me causal masking', 'Walk me through transformers', 'I want to learn causal masking',
    'Help me learn softmax', 'Please teach me attention', 'Start a Rabbit Hole about attention', 'start a rabbit hole on softmax'])
    assert.deepEqual(at(text), { type: 'mode', mode: 'teach', text }, text);
  // The list is literal and short; nothing fuzzy.
  assert.equal(String(LEARN_INTENT).length < 220, true);
});

test('repository links keep their own rule: creation wording with owner/repo still connects', () => {
  assert.equal(at('start a rabbit hole with karpathy/nanoGPT').type, 'command');
});

test('the bar sends a Home question to /api/learn/home-ask, never the old apps agent or a new canvas', () => {
  const bar = readFileSync(new URL('./AgentBar.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(bar, /if \(scope\.kind === 'workspace'\) return homeAsk\(text, raw, scope, from\);/);
  const home = bar.slice(bar.indexOf('async function homeAsk('), bar.indexOf('// §6.4 /teach through the Learn hook'));
  assert.match(home, /api\('\/api\/learn\/home-ask', \{ method: 'POST', body: JSON\.stringify\(\{ message: text \}\) \}\)/);
  assert.doesNotMatch(home, /\/api\/ask|create_canvas|streamAsk/);
  // The only way from an answer to a Rabbit Hole is its offer button, which the learner presses.
  assert.match(home, /offer: d\.offer_rabbit_hole \? \{ label: 'Start a Rabbit Hole', run: \(\) => teach\(text, '', scope\) \} : null/);
  assert.equal((home.match(/teach\(/g) || []).length, 1);
});

// LP1 D4: a learning request typed on Home starts the journey on the server with the learner's exact words; a
// factual question never reaches teach(), and a teach with no journey reading keeps today's learnAction path.
test('teachPlan: a journey request starts a journey and titles the canvas by its topic', () => {
  assert.deepEqual(teachPlan('I want to learn logistic regression'), { journey: true, title: 'Logistic regression' });
  assert.deepEqual(teachPlan('Give me a 10-minute visual overview of attention'), { journey: true, title: 'Attention' });
  assert.deepEqual(teachPlan('Show me how to build a tokenizer'), { journey: true, title: 'Tokenizer' });
});

test('teachPlan: no topic, no journey reading, or a question keeps the raw sentence as the title and starts no journey', () => {
  assert.deepEqual(teachPlan('teach me'), { journey: false, title: 'teach me' });
  assert.deepEqual(teachPlan('What is softmax?'), { journey: false, title: 'What is softmax?' });
  assert.deepEqual(teachPlan('Teach me this'), { journey: false, title: 'Teach me this' });
  // The router's Start a Rabbit Hole offer re-teaches the question that was asked.
  assert.deepEqual(teachPlan('Explain attention'), { journey: false, title: 'Explain attention' });
});

test('teachPlan: skip setup with no topic is a journey the server refuses (topic_required), titled by the sentence', () => {
  assert.deepEqual(teachPlan('Skip setup and start'), { journey: true, title: 'Skip setup and start' });
  assert.deepEqual(teachPlan('Teach me transformers, skip setup'), { journey: true, title: 'Transformers' });
});

test('journeyMessage turns a server code into a one-line fix', () => {
  assert.match(journeyMessage({ message: 'topic_required' }), /what you want to learn/);
  assert.match(journeyMessage({ message: 'live_journey' }), /already/);
  assert.equal(journeyMessage({ message: 'Board not found' }), 'Board not found');
});

test('teach() starts the journey on the server with the exact typed text and never hands cards to Learn', () => {
  const bar = readFileSync(new URL('./AgentBar.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const body = bar.slice(bar.indexOf('async function teach('), bar.indexOf('// Scope is frozen at Send'));
  assert.match(body, /teachPlan\(text\)/);
  assert.match(body, /api\('\/api\/learn\/journey', \{ method: 'POST', body: JSON\.stringify\(\{ app, board: 'main', action: 'start', text, channel: 'text' \}\) \}\)/);
  // The journey path opens Learn itself, on the tray; only a non-journey teach goes through learnAction.
  assert.match(body, /navigate\(`\/apps\/\$\{app\}\?tab=learn`\)/);
  assert.equal((body.match(/learnAction\(/g) || []).length, 1);
  assert.ok(body.indexOf("'/api/learn/journey'") < body.indexOf('learnAction('));
});
