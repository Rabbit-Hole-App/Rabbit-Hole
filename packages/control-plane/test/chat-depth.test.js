// Tutor ladder R2: the Depth wording (chat-depth.js) and how a Chat request carries it (chat-modes.js chatFields, resolveMode,
// chatSystem). The Chat turn that reaches the model is pinned in learn-chat.test.js; the explanation job in explain-depth.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPTHS, DEPTH_COMMANDS, depthInstruction, validDepth } from '../src/chat-depth.js';
import { chatFields, chatSystem, resolveMode } from '../src/chat-modes.js';

test('Overview and Deep say different things, for an answer and for a card; Standard, nothing and junk say nothing', () => {
  assert.deepEqual(DEPTHS, ['brief', 'balanced', 'detailed']);
  for (const kind of ['answer', 'card']) {
    const [overview, deep] = [depthInstruction('brief', kind), depthInstruction('detailed', kind)];
    assert.match(overview, /^Depth: Brief\./); assert.match(deep, /^Depth: Detailed\./);
    assert.notEqual(overview, deep);
    for (const none of ['balanced', undefined, null, '', 'Deep', 'shallow', 7]) assert.equal(depthInstruction(none, kind), '', String(none));
  }
  assert.notEqual(depthInstruction('detailed', 'answer'), depthInstruction('detailed', 'card'));
  assert.equal(validDepth('detailed'), 'detailed'); assert.equal(validDepth('nope'), null);
  // Owner 2026-11-07: the written command (id explanation) takes the Depth too; explain is the playable one.
  assert.deepEqual([...DEPTH_COMMANDS], ['explain', 'explanation', 'walkthrough']);
});

test('depth-only body is retained: a request that sends only a Depth is a Chat turn and keeps it', () => {
  assert.equal(chatFields({ message: 'hi' }), null, 'an old client that sends none of the fields is unchanged');
  assert.deepEqual(chatFields({ depth: 'detailed' }), { mode: 'auto', command: null, contextRefs: null, regenerate: null, depth: 'detailed' });
  assert.equal(chatFields({ depth: 'balanced' }).depth, 'balanced');
});

test('default standard: no Depth key unless one was sent, and nothing is added to the prompt', () => {
  assert.deepEqual(chatFields({ mode: 'ask' }), { mode: 'ask', command: null, contextRefs: null, regenerate: null });
  assert.equal(chatSystem('BASE', 'META', resolveMode({ mode: 'ask', command: null }, 'x'), false), chatSystem('BASE', 'META', { mode: 'ask', maybe: false }, false));
});

test('invalid depth rejected: an explicit value that is not a Depth is an error, never normalized', () => {
  for (const depth of ['shallow', 5, null, 'DEEP', '', {}]) assert.throws(() => chatFields({ mode: 'ask', depth }), /depth must be/, JSON.stringify(depth));
  assert.throws(() => chatFields({ depth: 'shallow' }), /depth must be/, 'also on its own');
});

test('Ask remains answer only: Depth shapes the answer and never starts a plan, even beside a course request', () => {
  assert.deepEqual(resolveMode({ mode: 'auto', command: null }, 'hello'), { mode: 'ask', maybe: false }, 'unchanged without a Depth');
  assert.deepEqual(resolveMode({ mode: 'ask', command: null, depth: 'detailed' }, 'make me a course on KNN'), { mode: 'ask', maybe: false, depth: 'detailed' });
  assert.deepEqual(resolveMode({ mode: 'auto', command: 'quiz', depth: 'detailed' }, 'make me a course on KNN'), { mode: 'ask', maybe: false, depth: 'detailed' }, 'a command stays an answer');
  assert.deepEqual(resolveMode({ mode: 'tutor', command: null, depth: 'brief' }, 'x'), { mode: 'tutor', maybe: false, depth: 'brief' });
  const ask = chatSystem('BASE', 'META', resolveMode({ mode: 'ask', command: null, depth: 'detailed' }, 'make me a course on KNN'), false);
  assert.match(ask, /Depth: Detailed/); assert.doesNotMatch(ask, /Tutor mode: syllabus creation|propose_lesson_outline|roadmap/i);
});

test('overview/deep changes outgoing system: the sentence is added to an answer and not to the Tutor planner; no Depth is the existing string', () => {
  const base = chatSystem('BASE', 'META', { mode: 'ask', maybe: false }, false);
  assert.equal(chatSystem('BASE', 'META', { mode: 'ask', maybe: false, depth: 'balanced' }, false), base);
  assert.equal(chatSystem('BASE', 'META', { mode: 'ask', maybe: false, depth: 'detailed' }, false), `${base}
${depthInstruction('detailed')}`);
  assert.notEqual(chatSystem('BASE', 'META', { mode: 'ask', maybe: false, depth: 'brief' }, false), chatSystem('BASE', 'META', { mode: 'ask', maybe: false, depth: 'detailed' }, false));
  assert.doesNotMatch(chatSystem('BASE', 'META', { mode: 'tutor', maybe: false, depth: 'detailed' }, false), /Depth:/);
});
