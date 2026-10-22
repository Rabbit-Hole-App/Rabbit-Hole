// Add to Chat's selection-to-ContextRef builder (selection-ref.js; chat-workspace-CONTRACT.md A2): card, passage, image/media and
// group refs, stable ids for de-duplication, the limits, and text read at Send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objectKind, objectName, REF_LIMITS, selectionName, selectionRef } from './selection-ref.js';
import { sameRef } from './chat-context.js';

test('one card is card:<id>, the whole card, with a content fingerprint as its version', () => {
  const ref = selectionRef({ ids: ['shape:a'], name: 'Gradient descent', content: 'Card text' });
  assert.equal(ref.sourceId, 'card:shape:a');
  assert.equal(ref.kind, 'card');
  assert.equal(ref.range, null);
  assert.equal(ref.name, 'Gradient descent');
  assert.match(ref.version, /^[0-9a-f]{8}$/);
  assert.notEqual(ref.version, selectionRef({ ids: ['shape:a'], content: 'Changed text' }).version, 'an edit is a new version');
});

test('text selected inside the one card makes it a passage; image and media objects keep their own kind and no quote', () => {
  assert.deepEqual(selectionRef({ ids: ['b1'], quote: '  the chain rule  ' }).range, { quote: 'the chain rule' });
  assert.equal(selectionRef({ ids: ['b1'], quote: 'x'.repeat(900) }).range.quote.length, REF_LIMITS.quote);
  const image = selectionRef({ ids: ['f1'], kind: 'image', quote: 'ignored' });
  assert.equal(image.sourceId, 'image:f1');
  assert.equal(image.range, null);
  assert.equal(selectionRef({ ids: ['v1'], kind: 'media' }).sourceId, 'media:v1');
});

test('several objects are ONE group ref: the first sorted id, members in range.cardIds, the same ref whatever the order', () => {
  const ref = selectionRef({ ids: ['c', 'a', 'b'], kind: 'image', name: 'Group: Loss' });
  assert.equal(ref.sourceId, 'group:a');
  assert.equal(ref.kind, 'group', 'kind is the group, never the first object');
  assert.deepEqual(ref.range, { cardIds: ['a', 'b', 'c'] });
  assert.ok(sameRef(ref, selectionRef({ ids: ['b', 'c', 'a'] })), 'Add to chat twice attaches it once');
  assert.ok(!sameRef(ref, selectionRef({ ids: ['a', 'b'] })), 'another set is another ref');
  assert.equal(selectionRef({ ids: Array.from({ length: 80 }, (_, i) => `id${String(i).padStart(2, '0')}`) }).range.cardIds.length, REF_LIMITS.cardIds);
});

test('text is read when it is read (at Send), capped; the name is capped and never empty', () => {
  let live = 'first';
  const ref = selectionRef({ ids: ['a'], content: 'first', text: () => live });
  live = 'after an edit';
  assert.equal(ref.text, 'after an edit');
  assert.equal(JSON.parse(JSON.stringify(ref)).text, 'after an edit', 'a serialised ref carries the resolved text');
  assert.equal(selectionRef({ ids: ['a'], text: () => 'y'.repeat(9000) }).text.length, REF_LIMITS.text);
  assert.equal(selectionRef({ ids: ['a'], name: 'n'.repeat(200) }).name.length, REF_LIMITS.name);
  assert.equal(selectionRef({ ids: ['a'] }).name, 'Selection');
});

test('objectKind: uploaded images, video and audio objects, else a card', () => {
  assert.equal(objectKind({ type: 'file', kind: 'image' }), 'image');
  assert.equal(objectKind({ type: 'image' }), 'image');
  assert.equal(objectKind({ type: 'video' }), 'media');
  assert.equal(objectKind({ type: 'file', kind: 'audio' }), 'media');
  assert.equal(objectKind({ type: 'file', kind: 'pdf' }), 'card');
  assert.equal(objectKind({ kind: 'sticky' }), 'card');
  assert.equal(objectKind(null), 'card');
});

// Owner brief UI-09 (2026-10-21): a single selection is named from its source object, never "1 item"; a group by its name, several
// objects by their names with an ellipsis for the rest (the chip shows the count beside it).
test('objectName: the described title, else the object own words, else what it is; never a count', () => {
  assert.equal(objectName({ type: 'snippet', title: 'model.py' }, { kind: 'Code sample', title: 'model.py' }), 'model.py');
  assert.equal(objectName({ type: 'repo-code', title: 'bpe.py', source: { kind: 'repository', path: 'mingpt/bpe.py' } }, null), 'bpe.py', 'a code card with no description is its file name');
  assert.equal(objectName({ type: 'explanation', title: '', body: 'Softmax turns scores into weights\nand more' }, { kind: 'Explanation', title: '' }), 'Softmax turns scores into weights', 'untitled: the first line');
  assert.equal(objectName({ id: 's-1', kind: 'rect', x1: 0, y1: 0, x2: 1, y2: 1, text: 'Gate' }, null), 'Gate', 'a shape by its text');
  assert.equal(objectName({ id: 's-3', kind: 'rect', x1: 0, y1: 0, x2: 1, y2: 1 }, null), 'Shape', 'a blank shape by its type');
  assert.equal(objectName({ type: 'whiteboard', title: '' }, { kind: 'Whiteboard', title: '' }), 'Whiteboard', 'untitled with no words: the described kind');
  assert.equal(objectName({ type: 'repo-graph' }, null), 'Graph');
  assert.equal(objectName({ type: 'cad' }, null), 'Cad');
  assert.equal(objectName(null, null), 'Card');
  for (const object of [{ type: 'explanation' }, { kind: 'rect', x1: 0 }, { type: 'repo-code' }]) assert.doesNotMatch(objectName(object), /item/);
});

test('selectionName: a group is its name (or Group), several objects their first two names and an ellipsis', () => {
  assert.equal(selectionName(['Card A', 'Card B'], { id: 'g1', label: 'Pair' }), 'Pair');
  assert.equal(selectionName(['Card A', 'Card B'], { id: 'g1' }), 'Group');
  assert.equal(selectionName(['Gate', 'Latch']), 'Gate, Latch');
  assert.equal(selectionName(['Gate', 'Latch', 'Valve', 'Pipe']), 'Gate, Latch, …');
  assert.equal(selectionName(['Gate']), 'Gate', 'one object (a shape) is its own name');
  const ref = selectionRef({ ids: ['a', 'b', 'c'], name: selectionName(['A long title '.repeat(20), 'B']) });
  assert.equal(ref.name.length, REF_LIMITS.name, 'the chip name stays capped');
});
