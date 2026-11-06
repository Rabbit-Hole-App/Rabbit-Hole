// The Tutor's reserved card slot (docs/features/canvas-skeleton-cards.md): which turns hold a card's place
// before the model answers (wantsCard), that the decision comes before any request (runTurn onTurn), and
// that the card the plan shows takes that place - with its part set, framed once laid out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardBlock } from './nanogpt/board.js';
import { cardModule } from './learn-tutor-claims.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { partIndex } from './nanogpt/depth/board.js';
import { executeActions, runTurn, wantsCard } from './learn-tutor.js';

const PARENT = { app: 'canvas-aaaa1111', board: 'nanogpt-attention-tutor' };
const turn = (raw, extra = {}) => ({ raw_user_message: raw, slash: null, ...extra });

test('a skeleton only when the learner clearly asks to see a card', () => {
  for (const raw of ['Show me this', 'show me visually', 'Make a card for this', 'Explain this on the canvas', 'Show me the mechanism',
    'Can you show me how the mask works?', 'can you draw the attention pattern?', 'Please walk me through it visually'])
    assert.equal(wantsCard(turn(raw)), true, raw);
  for (const raw of ['Why does softmax sum to one?', 'How does the mechanism work?', 'Explain why the weights add to one', 'Tell me more',
    "Don't show me any more cards", 'Stop drawing', 'What does this card show?', 'The mask hides the future positions.'])
    assert.equal(wantsCard(turn(raw)), false, raw);
  assert.equal(wantsCard(turn('/deeper', { slash: 'deeper' })), true);
  assert.equal(wantsCard(turn('/simplify', { slash: 'simplify' })), true);
  // An answer to the Tutor's open question, a hole's opening and a turn back from a hole are not requests.
  assert.equal(wantsCard(turn('Show me the mask', { answering: 'q-1' })), false);
  assert.equal(wantsCard(turn('Show me the mask', { opening: true })), false);
  assert.equal(wantsCard(turn('Show me the mask', { returned_from: { dive_id: 'd' } })), false);
});

test('the turn is decided before any request: onTurn sees the LearnerTurn first', async () => {
  const sent = [], seen = [];
  const post = async (path, body) => { sent.push(path); return path.endsWith('/evaluate') ? { status: 'settled', evaluator: 'jev', events: [] } : { strategy: 'none', move: 'explain', reason: '', actions: [{ type: 'respond_text', text: 'Here it is.' }] }; };
  const block = cardBlock(cardModule('depth-attention-overview'));
  await runTurn({ raw: 'Show me this visually', canvas: PARENT, access: {}, block, store: emptyStore(), post, onTurn: built => seen.push([built.raw_user_message, sent.length, wantsCard(built)]) });
  assert.deepEqual(seen, [['Show me this visually', 0, true]]);
  assert.ok(sent.length >= 1, 'the model routes ran after');
});

// The canvas as React runs it: an inserted card is not readable until the next commit, and a card is
// framed only once it is laid out. updateBlock on a card inserted this tick finds nothing.
function deferredCanvas(blocks) {
  const calls = [], pending = [];
  return {
    calls, blocks: () => blocks,
    insertBlock: (inserted, options = {}) => { const id = `b${calls.length}`; pending.push({ ...inserted, id }); calls.push(['insert', inserted.scene.id, options.into ?? null, inserted.inputs?.part ?? null]); return id; },
    updateBlock: (id, change) => { const at = blocks.findIndex(entry => entry.id === id); if (at < 0) { calls.push(['update-missed', id]); return false; } blocks[at] = change(blocks[at]); calls.push(['update', id]); return true; },
    revealBlock: (id, slot = null) => calls.push(slot ? ['focus', id, slot] : ['focus', id]),
    commit: () => blocks.push(...pending.splice(0)),
  };
}

test('a new card takes the held slot, opens at its part with no late update, and is focused', () => {
  const canvas = deferredCanvas([]);
  const part = 'memory';
  executeActions([{ type: 'focus_part', card: 'depth-attention-deep', part_id: part, mode: 'navigate' }, { type: 'respond_text', text: 'Here.' }], { canvas, suggestDive: () => {}, slot: 'slot:1' });
  assert.deepEqual(canvas.calls, [['insert', cardModule('depth-attention-deep').scene.id, 'slot:1', partIndex(cardModule('depth-attention-deep'), part)], ['focus', 'b0']]);
  canvas.commit();
  assert.equal(canvas.blocks()[0].inputs.part, partIndex(cardModule('depth-attention-deep'), part), 'the part is on the card itself');
});

test('only the first new card takes the slot; a card already on the canvas and a chip never do', () => {
  const overview = cardBlock(cardModule('depth-attention-overview'));
  const canvas = deferredCanvas([overview]);
  const chips = executeActions([
    { type: 'show_authored_card', card: 'depth-attention-overview', mode: 'navigate' },
    { type: 'show_authored_card', card: 'depth-attention-guided', mode: 'navigate' },
    { type: 'show_authored_card', card: 'depth-attention-deep', mode: 'navigate' },
    { type: 'show_authored_card', card: 'c11-causal-mask', mode: 'suggest' },
  ], { canvas, suggestDive: () => {}, slot: 'slot:1' });
  assert.deepEqual(canvas.calls.map(call => call.slice(0, 3)), [
    ['focus', overview.id, 'slot:1'], // already there: revealed as that slot's answer (the learner's camera wins), the slot left for the caller to release
    ['insert', cardModule('depth-attention-guided').scene.id, 'slot:1'], ['focus', 'b1'],
    ['insert', cardModule('depth-attention-deep').scene.id, null], ['focus', 'b3'],
  ]);
  chips[0].run();
  assert.equal(canvas.calls.at(-2)[2], null, 'a chip clicked later lands where the learner looks');
});

test('a turn that ends in words only inserts nothing: the held slot is the caller\'s to release', () => {
  const canvas = deferredCanvas([]);
  executeActions([{ type: 'respond_text', text: 'Softmax divides by the sum.' }, { type: 'ask_question', text: 'Why?' }], { canvas, suggestDive: () => {}, slot: 'slot:1' });
  assert.deepEqual(canvas.calls, []);
});
