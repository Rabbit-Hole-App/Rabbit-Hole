// The Table of contents row menu's Move up / Move down (owner approved 2026-11-07): where a heading can move one step, among siblings only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { moveTargets } from './toc-move.js';
import { moveSection } from './learn-outline-model.js';

const heading = (id, level) => ({ id, level, type: 'heading' });
const order = rows => rows.map(row => row.id).join(',');

test('siblings: the first has no Move up and the last no Move down; a middle one moves before its previous or next-but-one', () => {
  const list = [heading('a', 1), heading('b', 1), heading('c', 1)];
  assert.deepEqual(moveTargets(list, 'a'), { up: null, down: { before: 'c' } });
  assert.deepEqual(moveTargets(list, 'b'), { up: { before: 'a' }, down: { before: null } });
  assert.deepEqual(moveTargets(list, 'c'), { up: { before: 'b' }, down: null });
});

test('sub-sections travel with their heading: the target skips the neighbouring sibling own sub-sections', () => {
  const list = [heading('a', 1), heading('a1', 2), heading('a2', 2), heading('b', 1), heading('b1', 2), heading('c', 1)];
  assert.deepEqual(moveTargets(list, 'b'), { up: { before: 'a' }, down: { before: null } }, 'before the previous sibling a, not inside its section; after c at the end');
  assert.deepEqual(moveTargets(list, 'a'), { up: null, down: { before: 'c' } }, 'down jumps over all of b and b1');
  // Applying the targets with the real moveSection keeps the children with their heading.
  assert.equal(order(moveSection(list, 'a', moveTargets(list, 'a').down.before)), 'b,b1,a,a1,a2,c');
  assert.equal(order(moveSection(list, 'b', moveTargets(list, 'b').up.before)), 'b,b1,a,a1,a2,c');
  assert.equal(order(moveSection(list, 'b', moveTargets(list, 'b').down.before)), 'a,a1,a2,c,b,b1');
});

test('a heading never leaves or enters another heading section: the first and last child of a parent stop there', () => {
  const list = [heading('p', 1), heading('x', 2), heading('y', 2), heading('q', 1), heading('z', 2)];
  assert.deepEqual(moveTargets(list, 'x'), { up: null, down: { before: 'q' } }, 'x is first under p: no Move up (it would leave p); down passes y');
  assert.deepEqual(moveTargets(list, 'y'), { up: { before: 'x' }, down: null }, 'y is last under p: no Move down (the next heading is q, a level up)');
  assert.deepEqual(moveTargets(list, 'z'), { up: null, down: null }, 'the only child of q');
  assert.equal(order(moveSection(list, 'x', moveTargets(list, 'x').down.before)), 'p,y,x,q,z', 'applied: x moves after y, still under p');
});

test('three levels, an unknown id, an empty or missing list', () => {
  const list = [heading('a', 1), heading('a1', 2), heading('a1x', 3), heading('a1y', 3), heading('a2', 2)];
  assert.deepEqual(moveTargets(list, 'a1x'), { up: null, down: { before: 'a2' } });
  assert.deepEqual(moveTargets(list, 'a1y'), { up: { before: 'a1x' }, down: null });
  assert.deepEqual(moveTargets(list, 'a1'), { up: null, down: { before: null } });
  assert.deepEqual(moveTargets(list, 'nope'), { up: null, down: null });
  assert.deepEqual(moveTargets([], 'a'), { up: null, down: null });
  assert.deepEqual(moveTargets(undefined, 'a'), { up: null, down: null });
});
