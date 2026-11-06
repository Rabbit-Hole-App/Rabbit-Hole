// Tutor ladder R2: the Depth wording (chat-depth.js) and how a Chat request carries it (chat-modes.js chatFields, resolveMode,
// chatSystem). The Chat turn that reaches the model is pinned in learn-chat.test.js; the explanation job in explain-depth.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPTHS, DEPTH_COMMANDS, depthInstruction, validDepth } from '../src/chat-depth.js';
import { chatFields, chatSystem, resolveMode } from '../src/chat-modes.js';

test('Overview and Deep say different things, for an answer and for a card; Standard, nothing and junk say nothing', () => {
  assert.deepEqual(DEPTHS, ['overview', 'standard', 'deep']);
  for (const kind of ['answer', 'card']) {
    const [overview, deep] = [depthInstruction('overview', kind), depthInstruction('deep', kind)];
    assert.match(overview, /^Depth: Overview\./); assert.match(deep, /^Depth: Deep\./);
    assert.notEqual(overview, deep);
    for (const none of ['standard', undefined, null, '', 'Deep', 'shallow', 7]) assert.equal(depthInstruction(none, kind), '', String(none));
  }
  assert.notEqual(depthInstruction('deep', 'answer'), depthInstruction('deep', 'card'));
  assert.equal(validDepth('deep'), 'deep'); assert.equal(validDepth('nope'), null);
  assert.deepEqual([...DEPTH_COMMANDS], ['explain', 'walkthrough']);
});

test('a Chat request carries Depth only when it sends one, and refuses a value that is not a Depth', () => {
  assert.deepEqual(chatFields({ mode: 'ask' }), { mode: 'ask', command: null, contextRefs: null, regenerate: null }, 'no key for an old client');
  assert.equal(chatFields({ mode: 'ask', depth: 'deep' }).depth, 'deep');
  for (const depth of ['shallow', 5, null, 'DEEP']) assert.throws(() => chatFields({ mode: 'ask', depth }), /depth must be/, String(depth));
});

test('resolveMode keeps the mode it always chose and adds the Depth; Ask never becomes a plan', () => {
  assert.deepEqual(resolveMode({ mode: 'auto', command: null }, 'hello'), { mode: 'ask', maybe: false }, 'unchanged without a Depth');
  assert.deepEqual(resolveMode({ mode: 'ask', command: null, depth: 'deep' }, 'make me a course on KNN'), { mode: 'ask', maybe: false, depth: 'deep' });
  assert.deepEqual(resolveMode({ mode: 'tutor', command: null, depth: 'overview' }, 'x'), { mode: 'tutor', maybe: false, depth: 'overview' });
});

test('chatSystem adds the Depth sentence to an answer and not to the Tutor planner; no Depth is today\'s string', () => {
  const base = chatSystem('BASE', 'META', { mode: 'ask', maybe: false }, false);
  assert.equal(chatSystem('BASE', 'META', { mode: 'ask', maybe: false, depth: 'standard' }, false), base);
  assert.equal(chatSystem('BASE', 'META', { mode: 'ask', maybe: false, depth: 'deep' }, false), `${base}\n${depthInstruction('deep')}`);
  assert.notEqual(chatSystem('BASE', 'META', { mode: 'ask', maybe: false, depth: 'overview' }, false), chatSystem('BASE', 'META', { mode: 'ask', maybe: false, depth: 'deep' }, false));
  assert.doesNotMatch(chatSystem('BASE', 'META', { mode: 'tutor', maybe: false, depth: 'deep' }, false), /Depth:/);
});
