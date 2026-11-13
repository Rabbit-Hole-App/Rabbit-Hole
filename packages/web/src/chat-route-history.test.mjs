import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIPPED_FLAGS } from './agent/slash-flags-test-on.mjs';
import { CHAT_CAPABILITIES, CHAT_ROUTES, chatRouteRequest, chatRoutesWith, normalizeHistory } from './inline-ai-route.js';
import { SLASH_FLAGS } from './agent/slash.js';
import { routeHistory } from './generation-proposal-chat.js';

// Owner 2026-11-13: the chat router (JEV) reads the last 3 turns to understand a follow-up, and its options are only the commands whose flag is on.
test('routeHistory: the last 3 learner messages with the reply that followed and the command each ran, most recent last', () => {
  const msgs = [
    { role: 'user', content: 'one' }, { role: 'assistant', content: 'reply one' },
    { role: 'user', content: 'two', command: 'diagram' }, { role: 'assistant', content: '' },
    { role: 'user', content: 'three' }, { role: 'assistant', content: 'reply three' },
    { role: 'user', content: 'four' }, { role: 'assistant', content: 'reply four' },
  ];
  assert.deepEqual(routeHistory(msgs), [
    { user: 'two', reply: '', command: 'diagram' }, { user: 'three', reply: 'reply three', command: null }, { user: 'four', reply: 'reply four', command: null },
  ]);
  assert.deepEqual(routeHistory([]), []);
  assert.deepEqual(routeHistory([{ role: 'user', content: 'only' }]), [{ user: 'only', reply: '', command: null }]);
});

test('normalizeHistory: never trusts the browser: 3 turns, 200 characters, command tokens only, nothing without a learner line', () => {
  const long = 'x'.repeat(500);
  const out = normalizeHistory([{ user: 'a' }, { user: 'b' }, { user: long, reply: long, command: 'quiz' }, { user: 'd', reply: 'r', command: 'Not A Token!' }, { user: '   ', reply: 'dropped' }]);
  assert.equal(out.length, 2, 'only the last three are kept, and the blank one among them is dropped');
  assert.deepEqual(out.map(turn => turn.user.length), [200, 1]);
  assert.deepEqual(out.map(turn => turn.command), ['quiz', null]);
  assert.deepEqual(normalizeHistory(null), []);
  assert.deepEqual(normalizeHistory('nope'), []);
});

test('chatRouteRequest: earlier turns ride in the state as compact lines, and only when there are some', () => {
  const none = chatRouteRequest({ text: 'test me' }, 'm');
  assert.equal('earlier' in none.state, false);
  const some = chatRouteRequest({ text: 'test me', history: [{ user: 'What is bubble sort?', reply: 'It swaps neighbours.', command: null }, { user: 'draw it', reply: '', command: 'diagram' }] }, 'm');
  assert.equal(some.state.earlier, 'learner: What is bubble sort? | reply: It swaps neighbours.\nlearner: draw it | ran: /diagram');
  assert.match(some.questions.route.instructions, /earlier, when present, is only context for a follow-up/);
});

test('the router only offers commands whose flag is on, so an off command stays a chat answer', () => {
  // the shipped flags: goal, animation, whiteboard, motion, interactive (explain), image generation and cad are off
  const offered = flags => Object.keys(CHAT_ROUTES).filter(id => id !== 'answer' && flags[id]);
  assert.ok(!offered(SHIPPED_FLAGS).includes('motion') && !offered(SHIPPED_FLAGS).includes('generate-image'));
  for (const id of Object.keys(CHAT_CAPABILITIES)) if (!SHIPPED_FLAGS[id]) assert.ok(!(id in CHAT_ROUTES) || SLASH_FLAGS[id], `/${id} is off in the build`);
  // with every flag on (the test helper) the routable set is the declared one, minus explicit-only and guarded
  assert.deepEqual(Object.keys(CHAT_ROUTES).filter(id => id !== 'answer').sort(), Object.keys(CHAT_CAPABILITIES).filter(id => !CHAT_CAPABILITIES[id].explicit && !CHAT_CAPABILITIES[id].guarded).sort());
  assert.ok('explain' in chatRoutesWith(['explain']) && !('explain' in chatRoutesWith([])));
  // and a flag off removes it from both: the guarded one the server enables, and the declared ones
  SLASH_FLAGS.explain = false; SLASH_FLAGS.quiz = false;
  try {
    assert.ok(!('explain' in chatRoutesWith(['explain'])), 'a guarded command whose flag is off is not offered even where the server enables it');
    assert.ok(!('quiz' in chatRoutesWith([])));
  } finally { SLASH_FLAGS.explain = true; SLASH_FLAGS.quiz = true; }
});
