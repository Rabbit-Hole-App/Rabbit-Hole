// Learn Walk (learn-walk-spec.md §1): stops, the contents button, start / continue / again, the last-stop rollover, the camera rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { walkBox, walkButton, walkCamera, walkNext, walkPrev, walkSections, walkStart, walkStops } from './learn-walk.js';

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

test('walkCamera: centred at zoom 1 when it fits; zoomed out to fit, but never below the reading size, where a taller box is top-aligned; centred on the composer when given', () => {
  const area = { left: 0, right: 1000, top: 100, bottom: 700 };
  assert.deepEqual(walkCamera({ x: 200, y: 300, w: 600, h: 200 }, area, 40), { x: 0, y: 0, z: 1 });
  assert.deepEqual(walkCamera({ x: 200, y: 300, w: 600, h: 200 }, area, 40, 600), { x: 100, y: 0, z: 1 }, 'its middle on the composer middle');
  const fits = walkCamera({ x: 200, y: 300, w: 600, h: 580 }, area, 40); // room 520 high: z 520 / 580 = 0.897, above the reading size
  assert.ok(fits.z > 0.85 && fits.z < 1 && 300 * fits.z + fits.y >= 139 && 880 * fits.z + fits.y <= 661, 'the whole box in view');
  const tall = walkCamera({ x: 200, y: 300, w: 600, h: 1040 }, area, 40); // would need 0.5: held at 0.85 and top-aligned
  assert.deepEqual([tall.z, 300 * tall.z + tall.y], [0.85, 140]);
  assert.equal(walkCamera({ x: 0, y: 0, w: 4000, h: 100 }, area, 40).z, 0.23, 'a box wider than the view is fitted to the width');
  assert.deepEqual(walkBox({ x: 0, y: 100, w: 640, h: 300 }, [{ x: 0, y: 40, w: 640, h: 40 }, { x: 0, y: 420, w: 640, h: 30 }]), { x: 0, y: 40, w: 640, h: 410 });
});
