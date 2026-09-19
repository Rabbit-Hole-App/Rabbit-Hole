import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentsEntries } from './learn-contents.js';

const lessons = [{ title: 'Tokens' }, { title: 'Attention' }, { title: 'Embeddings' }];

test('every lesson becomes a numbered entry, counting from one', () => {
  const entries = contentsEntries(lessons, [null, null, null]);
  assert.deepEqual(entries.map(entry => entry.n), [1, 2, 3]);
  assert.deepEqual(entries.map(entry => entry.label), ['Tokens', 'Attention', 'Embeddings']);
});

// The rail greys out what the panel would refuse to open, so the two agree.
test('an entry is available only when its content exists', () => {
  const entries = contentsEntries(lessons, [{ id: 'a' }, null, { id: 'c' }]);
  assert.deepEqual(entries.map(entry => entry.available), [true, false, true]);
});

test('the entry holding the active lesson is the active one', () => {
  const entries = contentsEntries(lessons, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'b');
  assert.deepEqual(entries.map(entry => entry.active), [false, true, false]);
});

test('no active lesson marks nothing active rather than defaulting to the first', () => {
  const entries = contentsEntries(lessons, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], null);
  assert.deepEqual(entries.map(entry => entry.active), [false, false, false]);
});

// An id that is not on the canvas must not silently light up an unrelated row.
test('an unknown active id matches nothing', () => {
  const entries = contentsEntries(lessons, [{ id: 'a' }, { id: 'b' }], 'zz');
  assert.equal(entries.some(entry => entry.active), false);
});

test('content is carried through so a click can open it without a second lookup', () => {
  const content = { id: 'a', pages: [] };
  assert.equal(contentsEntries(lessons, [content, null, null])[0].content, content);
});

test('a lesson with no title still gets a row rather than a blank one', () => {
  const entries = contentsEntries([{}, { title: '' }], [null, null]);
  assert.deepEqual(entries.map(entry => entry.label), ['Lesson 1', 'Lesson 2']);
});

test('no lessons gives no entries', () => {
  assert.deepEqual(contentsEntries([], []), []);
  assert.deepEqual(contentsEntries(undefined, undefined), []);
});

// contents may be shorter than lessons while a course is still generating.
test('a short contents array is treated as absent content, not a crash', () => {
  const entries = contentsEntries(lessons, [{ id: 'a' }]);
  assert.deepEqual(entries.map(entry => entry.available), [true, false, false]);
});
