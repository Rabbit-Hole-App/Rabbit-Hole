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
  for (const phrase of ['internal account and canvas identifiers', 'the kind of Tutor action taken and its reason code', 'the type of help it offered', 'which suggestions were shown and which one you chose',
    'met, partly met or not met', 'whether help was involved', 'a rubric match, or an AI evaluator and its version', 'AI credit usage', 'never the error message or page content',
    'do not include the text of your messages, questions or answers', 'about analytics only', 'are still stored in your account', 'Only the Rabbit Hole owner can view analytics']) assert.ok(text.includes(phrase), phrase);
  assert.equal(/\.\.\.|\u2026/.test(text), false, 'no ellipsis in UI text');
  assert.equal(/never stores|stores no|nothing is stored|we do not store/i.test(text), false);
});

test('what the notice lists is what the registered Tutor events carry, and what it excludes is not a field of any of them', () => {
  const fields = new Set(['tutor.decision', 'tutor.hooks_computed', 'tutor.hooks_shown'].flatMap(name => Object.keys(EVENTS[name])));
  const words = field => (field === 'first_text_ms' ? [] : field.split('_')); // a timing of when the first reply text appeared, not text
  for (const field of ['action_type', 'reason_codes', 'assistance_offered', 'suggestion_ids', 'selected_hook', 'usage', 'planner_ms']) assert.ok(fields.has(field), field);
  for (const forbidden of ['text', 'message', 'question', 'answer', 'goal', 'hook', 'rationale', 'prompt', 'content', 'title', 'file', 'drawing', 'url', 'email', 'name']) {
    assert.equal([...fields].some(field => field === forbidden || (words(field).includes(forbidden) && !['hook', 'goal'].includes(forbidden))), false, `a registered Tutor field names ${forbidden}`);
  }
  assert.deepEqual([...fields].filter(field => field.includes('goal')), ['goal_id'], 'only the internal goal id, never goal wording');
  assert.deepEqual([...fields].filter(field => field.includes('hook')), ['selected_hook'], 'only the chosen suggestion id, never its wording');
});
