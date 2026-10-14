// Add to Chat's selection-to-ContextRef builder (selection-ref.js; chat-workspace-CONTRACT.md A2): card, passage, image/media and
// group refs, stable ids for de-duplication, the limits, and text read at Send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objectKind, REF_LIMITS, selectionRef } from './selection-ref.js';
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
