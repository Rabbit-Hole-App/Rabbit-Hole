// Home ask (owner, 2026-10-04; docs/features/home-ask.md): a question asked on Home is answered in place from the
// user's own library; only an explicit learning request (or the answer's offer) starts a Rabbit Hole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEARN_INTENT, route } from './router.js';
import { teachPlan } from './teach-plan.js';
import { titleFromQuestion } from '../start.js';

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

// Tutor cleanup P4 (owner, 2026-11-05, Q1/Q3): teach prefills Chat and never sends. The canvas is titled with the learner's own
// sentence under the 80 character cap titleFromQuestion allows; no journey is read, started or planned.
test('teachPlan: the title is the raw sentence through titleFromQuestion, whatever the wording', () => {
  for (const text of ['I want to learn logistic regression', 'Show me how to build a tokenizer', 'teach me', 'What is softmax?', 'Skip setup and start', 'teach me CNNs', 'Teach me Node.js'])
    assert.deepEqual(teachPlan(text), { title: text }, text);
  assert.equal(teachPlan('teach me   logistic  regression please').title, 'teach me logistic regression please', 'whitespace collapses');
  assert.deepEqual(Object.keys(teachPlan('Teach me attention')), ['title'], 'no journey, needsTopic or other reading');
});

test('teachPlan: a long request still gets a canvas title the POST accepts (80 characters), the request itself is untouched', () => {
  const text = `I want to learn ${'logistic regression '.repeat(7).trim()}`;
  assert.ok(text.length >= 130, String(text.length));
  const plan = teachPlan(text);
  assert.equal(plan.title, titleFromQuestion(text));
  assert.equal(plan.title.length, 80);
  assert.ok(text.startsWith(plan.title), 'the title is a prefix of the full request, which keeps its every word');
});

test('teach-plan.js reads no journey intent', () => {
  const source = readFileSync(new URL('./teach-plan.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /learner-intent-journey|journeyIntent|STARTS|NEEDS_TOPIC/);
});

test('teach() creates the canvas titled by the sentence, prefills Chat through learnAction, and never calls the journey or ask routes', () => {
  const bar = readFileSync(new URL('./AgentBar.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const body = bar.slice(bar.indexOf('async function teach('), bar.indexOf('// Scope is frozen at Send'));
  assert.match(body, /runCommand\('create_canvas', \{ title: teachPlan\(text\)\.title \}, raw, scope, true\)/, 'an ordinary, undoable creation that keeps the draft');
  assert.match(body, /learnAction\('teach', \{ app, prompt: text \}, /, 'the full, unmodified request');
  assert.doesNotMatch(body, /\/api\/learn\/journey|\/api\/learn\/ask|api\(/);
  assert.ok(body.indexOf("runCommand('create_canvas'") < body.indexOf('learnAction('));
  // The draft clears only when Learn answered 'prefilled' (learnOutcome.done); otherwise it stays in this scope's draft.
  assert.match(body, /if \(outcome\.done\) clearDraft\(scope, raw\);/);
  assert.equal((body.match(/clearDraft\(/g) || []).length, 1);
  assert.match(bar, /async function runCommand\(name, args, raw, scope, keep = false, silent = false\)/);
});

test('the bar imports no journey helper', () => {
  const bar = readFileSync(new URL('./AgentBar.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(bar, /journeyMessage|journeyStarted|NEEDS_TOPIC|learner-intent-journey/);
});
