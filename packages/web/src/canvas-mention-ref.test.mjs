import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_SOURCE, canvasBoardId, canvasMentionRef } from './canvas-mention-ref.js';
import { attachedReducer } from './chat-context.js';
import { refsForSend } from './chat-draft.js';

const A = '0b5e0d6e-0000-4000-8000-000000000001', B = '0b5e0d6e-0000-4000-8000-000000000002';

test('a mentioned canvas is its board id only: no title, no range, no text, and it round-trips to the id', () => {
  const ref = canvasMentionRef(A.toUpperCase());
  assert.deepEqual(ref, { sourceId: `canvas:${A}`, kind: 'canvas', name: 'Canvas', version: '', range: null });
  assert.ok(CANVAS_SOURCE.test(ref.sourceId));
  assert.equal(canvasBoardId(ref.sourceId), A);
  assert.equal(canvasBoardId('canvas:canvas-0a1b2c3d'), null);
  assert.deepEqual(refsForSend([{ ...ref, text: () => 'never sent' }]), [ref], 'Send carries no browser text for a canvas');
});

test('two canvases are two refs; mentioning one again is one ref; removing its pill drops it from the outgoing refs', () => {
  let refs = [];
  for (const id of [A, B, A]) refs = attachedReducer(refs, { type: 'attach', ref: canvasMentionRef(id) });
  assert.deepEqual(refs.map(ref => ref.sourceId), [`canvas:${A}`, `canvas:${B}`]);
  refs = attachedReducer(refs, { type: 'detach', ref: canvasMentionRef(A) });
  assert.deepEqual(refsForSend(refs).map(ref => ref.sourceId), [`canvas:${B}`]);
});
