// Home ask (owner, 2026-10-04; docs/features/home-ask.md): a question asked on Home is answered in place from the
// user's own library; only an explicit learning request (or the answer's offer) starts a Rabbit Hole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEARN_INTENT, route } from './router.js';
import { journeyMessage, journeyStarted, NEEDS_TOPIC, teachPlan } from './teach-plan.js';

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

test('teachPlan: skip setup with a topic is a journey titled by the topic', () => {
  assert.deepEqual(teachPlan('Teach me transformers, skip setup'), { journey: true, title: 'Transformers' });
});

// Controller ruling (Task 10 review): "Skip setup and start" names nothing to learn, so Home never creates a canvas for it.
test('teachPlan: skip setup with no topic starts nothing and creates no canvas; the bar asks for a topic', () => {
  assert.deepEqual(teachPlan('Skip setup and start'), { journey: false, title: 'Skip setup and start', needsTopic: true });
  assert.match(NEEDS_TOPIC, /^Tell me what you want to learn, for example: Teach me logistic regression, skip setup\.$/);
});

test('teachPlan: the title keeps the learner casing, first letter capitalized', () => {
  assert.equal(teachPlan('teach me CNNs').title, 'CNNs');
  assert.equal(teachPlan('I want to learn SQL window functions').title, 'SQL window functions');
  assert.equal(teachPlan('Teach me Node.js').title, 'Node.js');
  assert.equal(teachPlan('I want to learn C++').title, 'C++');
  assert.equal(teachPlan('teach me   logistic  regression please').title, 'Logistic regression');
  assert.equal(teachPlan('teach me JAVASCRIPT').title, 'JAVASCRIPT');
  assert.deepEqual(teachPlan('teach me transformers'), { journey: true, title: 'Transformers' });
});

test('teachPlan: a long request still gets a canvas title the POST accepts (80 characters, journey kept)', () => {
  const text = `I want to learn ${'logistic regression '.repeat(7).trim()}`;
  assert.ok(text.length >= 130, String(text.length));
  const plan = teachPlan(text);
  assert.equal(plan.journey, true);
  assert.ok(plan.title.length <= 80, String(plan.title.length));
  assert.ok(plan.title.startsWith('Logistic regression logistic'));
});

test('journeyMessage turns a server code into a one-line fix', () => {
  assert.equal(journeyMessage({ message: 'topic_required' }), NEEDS_TOPIC);
  assert.match(journeyMessage({ message: 'live_journey' }), /already/);
  assert.equal(journeyMessage({ message: 'Board not found' }), 'Board not found');
});

test('a planner failure after the journey was created is a started journey with a one-line message, never the raw planner text', () => {
  const failed = Object.assign(new Error('Planner returned invalid JSON at position 4'), { status: 502, data: { journey: { id: 'j1' } } });
  assert.equal(journeyStarted(failed), true);
  assert.match(journeyMessage(failed), /Open Learn to retry/);
  assert.doesNotMatch(journeyMessage(failed), /JSON|position/);
  // A refusal creates no journey: the draft is kept.
  for (const e of [{ status: 400, message: 'topic_required', data: { error: 'topic_required' } }, { status: 409, message: 'live_journey', data: { journey: { id: 'old' } } }, new Error('offline')])
    assert.equal(journeyStarted(e), false);
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

test('teach() journey path: the draft clears only after the await succeeds, a failure toasts, and Learn opens after the try', () => {
  const bar = readFileSync(new URL('./AgentBar.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const body = bar.slice(bar.indexOf('async function teach('), bar.indexOf('// Scope is frozen at Send'));
  const call = body.indexOf("await api('/api/learn/journey'"), caught = body.indexOf('} catch (e) {', call), nav = body.indexOf('navigate(`/apps/${app}?tab=learn`)');
  assert.ok(call > 0 && caught > call && nav > caught);
  const tried = body.slice(call, caught), failed = body.slice(caught, nav);
  assert.equal((tried.match(/clearDraft\(scope, raw\)/g) || []).length, 1); // after the await, inside the try
  assert.ok(tried.indexOf('clearDraft(') > tried.indexOf('\n'));
  assert.match(failed, /toast\(`✗ \$\{journeyMessage\(e\)\}`, \{ tone: 'error' \}\)/);
  assert.match(failed, /if \(journeyStarted\(e\)\) clearDraft\(scope, raw\)/); // the journey exists: a resend would make a second canvas
  assert.ok(failed.trimEnd().endsWith('}')); // navigate is after the whole try/catch, so Learn opens on success and failure
});

test('teach() creates no canvas for a topicless request and leaves no Undo behind for a journey canvas', () => {
  const bar = readFileSync(new URL('./AgentBar.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const body = bar.slice(bar.indexOf('async function teach('), bar.indexOf('// Scope is frozen at Send'));
  const asked = body.slice(body.indexOf('if (plan?.needsTopic)'), body.indexOf("runCommand('create_canvas'"));
  assert.ok(asked.length > 0 && body.indexOf('plan?.needsTopic') < body.indexOf("runCommand('create_canvas'"));
  assert.match(asked, /toast\(`✗ \$\{NEEDS_TOPIC\}`, \{ tone: 'error' \}\)/);
  assert.match(asked, /return;/);
  assert.doesNotMatch(asked, /clearDraft/); // the draft stays
  // The Canvas created note carries Undo, which deletes the row and would orphan the server journey: a journey canvas is silent.
  assert.match(body, /runCommand\('create_canvas', \{ title: plan\.title \}, raw, scope, true, plan\.journey\)/);
  assert.match(bar, /async function runCommand\(name, args, raw, scope, keep = false, silent = false\)/);
  assert.match(bar, /if \(!silent\) report\(scope, name, result, ctx, raw\);/);
});
