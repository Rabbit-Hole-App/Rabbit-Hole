import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canCoach, canSuggest } from './learn-coaching-contract.js';

// Owner 2026-11-13: the Curious card shows at the canvas's lower right while the Chat panel is closed, in any mode, so it asks on
// "suggestions On, unpaused, state ready" alone; Tutor mode and an open Chat still gate the Tutor's own proactive material (canCoach).
test('canSuggest: On, unpaused and ready in any mode; off when paused, Off or not ready; canCoach is unchanged', () => {
  const on = { mode: 'auto', tutorEnabled: true, suggestionsPaused: false };
  assert.equal(canSuggest(on, { ready: true }), true);
  assert.equal(canSuggest({ ...on, mode: 'ask' }, { ready: true }), true);
  assert.equal(canSuggest(on, { ready: false }), false);
  assert.equal(canSuggest({ ...on, tutorEnabled: false }, { ready: true }), false);
  assert.equal(canSuggest({ ...on, suggestionsPaused: true }, { ready: true }), false);
  assert.equal(canSuggest(null, { ready: true }), false);
  assert.equal(canCoach(on, { chatOpen: true, ready: true }), false, 'the Tutor still needs Tutor mode');
});

// Owner 2026-11-13: a shown Curious with no saved set asks once by itself; the Suggest button is only for a later retry.
test('useNextSteps asks by itself when the card is shown with no saved set, and the card draws no empty state', () => {
  const hook = readFileSync(new URL('./LearnNextSteps.jsx', import.meta.url), 'utf8').split('\r\n').join('\n');
  assert.match(hook, /const auto = coaching\?\.allowed && coaching\?\.visible && shown && view\.status === 'unavailable' && view\.reason === 'curious_empty';/);
  assert.match(hook, /if \(auto\) \{ gate\.ask = true; asked\(n => n \+ 1\); \}/);
  const card = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8').split('\r\n').join('\n');
  assert.match(card, /if \(steps\.status === 'unavailable' && steps\.reason === 'curious_empty'\) return null;/);
  assert.doesNotMatch(card, /No suggestions yet|data-next-steps-request/, 'no Suggest button');
});
