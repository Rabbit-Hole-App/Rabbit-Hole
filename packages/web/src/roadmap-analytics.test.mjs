// D21: the roadmap analytics event carries an action and a step state as tokens and nothing else. Part of the Lead patch usage-analytics.js (EVENTS entry rh_roadmap_step).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from './usage-analytics.js';

test('rh_roadmap_step keeps an action and a step state as tokens and drops source text, titles, ids and anything free', () => {
  assert.deepEqual(sanitize('rh_roadmap_step', { action: 'proposal_accepted', step_state: 'generating' }), { action: 'proposal_accepted', step_state: 'generating' });
  assert.deepEqual(sanitize('rh_roadmap_step', { action: 'card_delivered', step_state: 'delivered', title: 'Gradient descent notes', source: 'file:fs_abc', instruction: 'I already know X', roadmap_id: 'rm_1' }),
    { action: 'card_delivered', step_state: 'delivered' });
  assert.deepEqual(sanitize('rh_roadmap_step', { action: 'Plan accepted by me', step_state: 'x'.repeat(41) }), {}, 'a value that is not a token is dropped');
});
