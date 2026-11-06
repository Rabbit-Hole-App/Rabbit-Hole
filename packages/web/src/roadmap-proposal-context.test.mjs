// R5.03: the learner's drag position of the proposal strip is kept per proposal version and clamped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDragStore, dragged } from './roadmap-proposal-context.js';
import { overlayPosition } from './roadmap-placement.js';

test('a position belongs to one proposal version and is dropped for the next', () => {
  const store = createDragStore();
  const v1 = { proposalId: 'pr_a', version: 1 }, v2 = { proposalId: 'pr_a', version: 2 };
  assert.deepEqual(store.get(v1), { dx: 0, dy: 0 });
  store.set(v1, { dx: 40.4, dy: -12.6 });
  assert.deepEqual(store.get(v1), { dx: 40, dy: -13 });
  assert.deepEqual(store.get(v2), { dx: 0, dy: 0 }, 'an edited version starts at its default place');
  store.prune(v2);
  assert.deepEqual(store.get(v1), { dx: 0, dy: 0 });
  store.set(v2, { dx: 5, dy: 5 }); store.prune(null);
  assert.deepEqual(store.get(v2), { dx: 0, dy: 0 });
});

test('dragging stays inside the surface and never changes the anchor-derived default', () => {
  const surface = { left: 0, top: 0, width: 1000, height: 700 };
  const base = overlayPosition({ left: 100, top: 100, width: 200, height: 100 }, surface);
  assert.deepEqual(dragged(base, { dx: 0, dy: 0 }, surface), base);
  const far = dragged(base, { dx: 5000, dy: 5000 }, surface);
  assert.ok(far.left + far.width <= 1000 - 8 && far.top <= 700 - 60);
  const back = dragged(base, { dx: -5000, dy: -5000 }, surface);
  assert.deepEqual([back.left, back.top], [8, 8]);
});
