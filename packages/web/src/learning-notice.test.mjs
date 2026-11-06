// The learner notice in Settings, Privacy & security (owner decision F, 2026-10-23): what analytics record, scoped to analytics.
// A source check: the browser check (tutor-telemetry-check.mjs) renders it; this keeps the claims honest against the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVENTS } from '../../control-plane/src/telemetry-contract.js';

const source = readFileSync(new URL('./RabbitHoleSettings.jsx', import.meta.url), 'utf8');
const start = source.indexOf('data-learning-analytics-notice');
const notice = source.slice(start, source.indexOf('</div>', start));
const text = notice.replace(/<[^>]+>/g, ' ').replace(/&apos;/g, "'").replace(/\{PRODUCT\}/g, 'Rabbit Hole').replace(/\s+/g, ' ');

test('the notice names what is recorded, says it is about analytics only and does not claim the product stores no conversations', () => {
  assert.ok(start > 0, 'the notice is in the Privacy pane');
  for (const phrase of ['internal account and canvas identifiers', 'met, partly met or not met', 'whether help was involved', 'a rubric match, or an AI evaluator and its version', 'AI credit usage', 'never the error message or page content',
    'do not include the text of your messages, questions or answers', 'about analytics only', 'are still stored in your account', 'Only the Rabbit Hole owner can view analytics']) assert.ok(text.includes(phrase), phrase);
  assert.equal(/\.\.\.|\u2026/.test(text), false, 'no ellipsis in UI text');
  assert.equal(/never stores|stores no|nothing is stored|we do not store/i.test(text), false);
});

test('the notice names no Tutor event and none is registered: what it lists is what is still recorded', () => {
  assert.deepEqual(Object.keys(EVENTS).filter(name => name.startsWith('tutor.')), [], 'the Tutor events were removed with the Tutor (cleanup P3)');
  for (const gone of ['Tutor action', 'reason code', 'type of help it offered', 'suggestions were shown', 'claims were in each state']) assert.equal(text.includes(gone), false, gone);
  const fields = new Set(Object.keys(EVENTS).filter(name => name.startsWith('client.')).flatMap(name => Object.keys(EVENTS[name])));
  for (const forbidden of ['text', 'message', 'question', 'answer', 'goal', 'prompt', 'content', 'title', 'file', 'drawing', 'url', 'email']) assert.equal(fields.has(forbidden), false, `a client event field names ${forbidden}`);
});
