// Learn Walk (learn-walk-spec.md §1): stops, the contents button, start / continue / again, the last-stop rollover, the camera rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { walkButton, walkNext, walkPrev, walkProgress, walkSections, walkStart, walkStops } from './learn-walk.js';

const card = (id, sectionId, order, extra = {}) => ({ id, type: 'doc', learn: { sectionId, itemId: `i${order}`, role: 'card', slot: true, order, ...extra } });
const blocks = [
  card('c2', '1.1', 1), card('c1', '1.1', 0), card('c1b', '1.1', 0, { part: 1 }), { id: 'notes', type: 'doc', learn: { sectionId: '1.1', itemId: 'notes', role: 'card', slot: true, order: 2 } },
  { id: 'lead', type: 'doc', learn: { sectionId: '1.1', itemId: 'i0', role: 'lead', slot: true, order: 0 } }, { id: 'ch', type: 'doc', learn: { sectionId: '1', role: 'chapter', slot: true } },
  card('d1', '1.10', 0), card('e1', '1.2', 0), { id: 'free', type: 'doc' },
];

test('walkStops: the section\'s cards and notes in chip order; a lead, a chapter and an unplanned card are never stops', () => {
  assert.deepEqual(walkStops(blocks, '1.1'), ['c1', 'c1b', 'c2', 'notes']);
  assert.deepEqual(walkStops(blocks, '1'), []);
  assert.deepEqual(walkSections(blocks), ['1.1', '1.2', '1.10']);
});

test('walkButton and walkStart: Start at the first card, Continue at the first not done, Start again at the first; none for a section with no cards', () => {
  assert.equal(walkButton(blocks, '1'), null);
  assert.equal(walkButton(blocks, '9.9'), null);
  assert.equal(walkButton(blocks, '1.1'), 'Start');
  assert.equal(walkStart(blocks, '1.1').at, 0);
  const some = blocks.map(b => (b.id === 'c1' || b.id === 'c1b' ? { ...b, learn: { ...b.learn, done: true } } : b));
  assert.equal(walkButton(some, '1.1'), 'Continue');
  assert.deepEqual(walkStart(some, '1.1'), { sectionId: '1.1', stops: ['c1', 'c1b', 'c2', 'notes'], at: 2 });
  const all = blocks.map(b => (b.learn?.sectionId === '1.1' && b.learn.role === 'card' ? { ...b, learn: { ...b.learn, done: true } } : b));
  assert.equal(walkButton(all, '1.1'), 'Start again');
  assert.equal(walkStart(all, '1.1').at, 0);
});

test('walkNext: marks the card done and advances; past the last stop the section is done and the walk goes into the next section with cards, or ends; walkPrev stops at 0', () => {
  const start = walkStart(blocks, '1.1');
  assert.deepEqual(walkNext(start, blocks), { done: 'c1', sectionDone: null, state: { ...start, at: 1 } });
  const last = { ...start, at: 3 };
  assert.deepEqual(walkNext(last, blocks), { done: 'notes', sectionDone: '1.1', state: { sectionId: '1.2', stops: ['e1'], at: 0 } });
  assert.deepEqual(walkNext(walkStart(blocks, '1.10'), blocks), { done: 'd1', sectionDone: '1.10', state: null });
  assert.equal(walkPrev(start).at, 0);
  assert.equal(walkPrev(last).at, 2);
});

test('walkProgress: per card, from the stop and the count', () => {
  assert.deepEqual([walkProgress({ at: 0, total: 4 }), walkProgress({ at: 3, total: 4 }), walkProgress(null)], [0.25, 1, 0]);
});
