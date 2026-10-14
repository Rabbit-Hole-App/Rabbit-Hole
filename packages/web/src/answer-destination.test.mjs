import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinationOf, teaching } from './answer-destination.js';

// Beta item 2 (owner 2026-10-09, docs/features/learn-chat-sheet.md "Where an answer goes"): the destination is read from the
// resolved plan, never chosen at Send.
const say = text => ({ type: 'respond_text', text });
const make = (command = 'explain') => ({ type: 'create_material', command, request: 'the sigmoid' });
const turn = (raw, extra = {}) => ({ raw_user_message: raw, ...extra });
const result = (actions, { raw = 'what is a sigmoid?', text, ...extra } = {}) => ({
  actions, turn: turn(raw, extra.turn), reading: extra.reading || null,
  text: text ?? actions.filter(action => action.type === 'respond_text' || action.type === 'ask_question').map(action => action.text).join('\n\n'),
});
const selected = { id: 'b1', card: true, kind: 'Explanation', title: 'Sigmoid' };

test('material made: the card is the answer, the planner words beside it are not repeated', () => {
  assert.deepEqual(destinationOf(result([say('It squashes a sum.'), make()])), { material: true, to: null, text: '' });
  assert.deepEqual(destinationOf(result([say('It squashes a sum.'), make()]), selected), { material: true, to: null, text: '' });
  // Ask in chat + /teach this: the material card only, no linked chat card (the second duplicate in the board).
  assert.deepEqual(destinationOf(result([say('Here.'), make()]), { ...selected, asked: true }), { material: true, to: null, text: '' });
});

test('a card shown on the canvas is material; a Show chip is not', () => {
  assert.equal(destinationOf(result([say('Look.'), { type: 'show_authored_card', card: 'c1', mode: 'navigate' }])).material, true);
  assert.equal(destinationOf(result([say('Look.'), { type: 'focus_part', card: 'c1', part_id: 'p', mode: 'navigate' }])).material, true);
  assert.deepEqual(destinationOf(result([say('Look.'), { type: 'show_authored_card', card: 'c1', mode: 'chip' }])), { material: false, to: 'card', text: 'Look.' });
});

test('a question the Tutor asks stays beside its material: the next turn answers it', () => {
  const asked = { type: 'ask_question', text: 'Which part feels unclear?', claim: 'c' };
  assert.deepEqual(destinationOf(result([say('It squashes.'), make(), asked])), { material: true, to: 'tray', text: 'Which part feels unclear?' });
  // A selected card changes nothing here (owner 2026-10-13: no Card Conversation panel): the same place as with no selection.
  assert.deepEqual(destinationOf(result([make(), asked]), selected), { material: true, to: 'tray', text: 'Which part feels unclear?' });
  assert.deepEqual(destinationOf(result([make(), asked])), { material: true, to: 'tray', text: 'Which part feels unclear?' });
});

test('words only: a card, with or without a selected card, and a linked card for a region', () => {
  assert.deepEqual(destinationOf(result([say('A curve.')])), { material: false, to: 'card', text: 'A curve.' });
  // Owner 2026-10-13: "we do not need Card Conversation in right side panel". A question about a selected card is answered
  // where an ordinary chat answer goes, a card; the selection only scopes the question.
  assert.deepEqual(destinationOf(result([say('A curve.')]), selected), { material: false, to: 'card', text: 'A curve.' });
  assert.deepEqual(destinationOf(result([say('A curve.')]), { ...selected, asked: true }), { material: false, to: 'card', text: 'A curve.' });
  assert.deepEqual(destinationOf(result([say('A curve.')]), { id: 'area:1', kind: 'area', title: 'Area' }), { material: false, to: 'card', text: 'A curve.' });
});

test('a clear teaching request answered in words alone still becomes a card', () => {
  assert.equal(teaching(turn('the sigmoid', { mode: 'teach' })), true);
  assert.equal(teaching(turn('Explain the sigmoid')), true);
  assert.equal(teaching(turn('can you explain softmax')), true);
  assert.equal(teaching(turn('teach me attention')), true);
  assert.equal(teaching(turn('what does explain mean here?')), false);
  assert.deepEqual(destinationOf(result([say('A curve.')], { raw: 'explain the sigmoid' })), { material: false, to: 'card', text: 'A curve.' });
  assert.deepEqual(destinationOf(result([say('A curve.')], { raw: 'the sigmoid', turn: { mode: 'teach' } }), selected), { material: false, to: 'card', text: 'A curve.' });
  // Before a journey's path is accepted no card is made (LP1): the words stay in the sheet.
  assert.deepEqual(destinationOf(result([say('A curve.')], { raw: 'explain the sigmoid' }), null, { setup: true }), { material: false, to: 'tray', text: 'A curve.' });
});

test('a clarification goes to the window above chat, never a card', () => {
  const asking = result([say('Do you mean the logistic sigmoid or tanh?')], { reading: { clarification_requested: true } });
  assert.deepEqual(destinationOf(asking), { material: false, to: 'tray', text: 'Do you mean the logistic sigmoid or tanh?' });
  assert.equal(destinationOf(asking, selected).to, 'tray');
});

test('no words: chips alone draw nothing here; a turn with no action says so above chat', () => {
  assert.deepEqual(destinationOf(result([{ type: 'suggest_journey', request: 'sigmoid' }], { text: '' })), { material: false, to: null, text: '' });
  assert.deepEqual(destinationOf(result([{ type: 'no_action' }], { text: '' })), { material: false, to: 'tray', text: 'Nothing to add here yet.' });
  assert.deepEqual(destinationOf(null), { material: false, to: 'tray', text: 'Nothing to add here yet.' });
});

test('option B: an answer creates one card, selected or not, even after Ask in chat; no answer ever routes to a card conversation', () => {
  assert.equal(destinationOf(result([say('A curve.')])).to, 'card');
  assert.equal(destinationOf(result([say('A curve.')]), { ...selected, asked: true }).to, 'card');
  // The old destination is gone for every kind of turn (owner 2026-10-13).
  for (const target of [null, selected, { ...selected, asked: true }]) {
    for (const reply of [result([say('A curve.')]), result([make(), { type: 'ask_question', text: 'Which part?', claim: 'c' }]), { ...result([say('Here.'), make()]), sourceAnswer: 'From the source.' }]) {
      assert.notEqual(destinationOf(reply, target).to, 'conversation');
    }
  }
});

test('a planner-declared teaching request creates a card, without matching English keywords', () => {
  const planned = result([say('A curve.')], { raw: 'Make a short lesson about this', reading: { inferred_intent: 'teach', clarification_requested: false } });
  assert.equal(destinationOf(planned, selected).to, 'card');
});

test('failed or refused source retrieval is clarification/error above chat, never a permanent card', () => {
  for (const outcome of ['failed', 'refused']) for (const target of [null, selected]) {
    const reply = { ...result([say('Source retrieval failed.')], { raw: 'Explain this code' }), bench: { handoff: { outcome } } };
    assert.deepEqual(destinationOf(reply, target), { material: false, to: 'tray', text: 'Source retrieval failed.' });
  }
});

test('material suppresses planner narration but preserves a distinct retrieved source answer', () => {
  const reply = { ...result([say('Here is the lesson.'), make(), { type: 'handoff' }]), sourceAnswer: 'The source calls normalize first.', bench: { handoff: { outcome: 'ok' } } };
  assert.deepEqual(destinationOf(reply, selected), { material: true, to: 'card', text: reply.sourceAnswer });
  assert.deepEqual(destinationOf(reply), { material: true, to: 'card', text: reply.sourceAnswer });
});

test('automatic hole openings stay above chat instead of keeping an empty hole with a card', () => {
  const opening = result([say('What would you like to explore first?')], {
    raw: 'Take me into Attention.', turn: { opening: true },
  });
  assert.deepEqual(destinationOf(opening), { material: false, to: 'tray', text: opening.text });
  // A learner-selected Next Step carried into the hole remains an intentional answer.
  const carried = { ...opening, turn: { ...opening.turn, next_step: { suggestion_id: 'hook-1' } } };
  assert.equal(destinationOf(carried).to, 'card');
  assert.equal(destinationOf({ ...opening, turn: { raw_user_message: 'Explain attention' } }).to, 'card');
});

test('a proposed learning path is setup before a journey exists: no canvas card', () => {
  const proposal = result([say('Let us build a learning path.'), { type: 'suggest_journey', request: 'logistic regression' }], {
    raw: 'I want to learn logistic regression',
  });
  for (const target of [null, selected]) {
    assert.deepEqual(destinationOf(proposal, target), { material: false, to: 'tray', text: proposal.text });
  }
});
