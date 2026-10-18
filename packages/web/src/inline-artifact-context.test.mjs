import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactContext } from './inline-ai-transport.js';

test('oversized selected material discloses truncation before the retained excerpt', () => {
  const context = { target: { ids: ['first', 'second'], objects: [{ id: 'first', text: 'x'.repeat(9000) }, { id: 'second', text: 'unseen' }] }, complete: true };
  const result = artifactContext(context);
  assert.ok(result.length <= 8000);
  assert.match(result.slice(0, 400), /incomplete/i);
  assert.match(result.slice(0, 400), /do not infer/i);
  assert.equal(result.includes('unseen'), false);
});

test('complete selected material retains IDs, ranges and coverage metadata', () => {
  const context = { target: { ids: ['a', 'b'], objects: [{ id: 'a', range: { from: 2, to: 4, text: 'ab' } }, { id: 'b', text: 'cd' }] }, complete: false, omitted: { objects: 1 } };
  const result = artifactContext(context);
  const data = JSON.parse(result.slice(result.indexOf('\n') + 1));
  assert.deepEqual(data.target, context.target);
  assert.equal(data.complete, false);
  assert.deepEqual(data.omitted, { objects: 1 });
});
