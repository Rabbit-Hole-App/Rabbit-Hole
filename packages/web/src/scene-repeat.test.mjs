import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScene } from './animation-scene.js';
import { chainSequential, stackSilhouettes } from './scene-repeat.js';

test('stackSilhouettes is pure: same input, same output, called twice', () => {
  const args = { unitBox: { x: 10, y: 20, w: 100, h: 50 }, count: 4, idPrefix: 'ghost' };
  assert.deepEqual(stackSilhouettes(args), stackSilhouettes(args));
});

test('a count of 1 draws nothing - there is nothing to stack behind', () => {
  assert.deepEqual(stackSilhouettes({ unitBox: { x: 0, y: 0, w: 10, h: 10 }, count: 1 }), { objects: [] });
});

test('stackSilhouettes produces count-1 ghosts plus one caption, each with a distinct id', () => {
  const { objects } = stackSilhouettes({ unitBox: { x: 0, y: 0, w: 100, h: 40 }, count: 4, idPrefix: 'e' });
  assert.equal(objects.length, 4); // 3 ghosts + 1 caption
  const ids = objects.map(o => o.id);
  assert.equal(new Set(ids).size, ids.length, 'every generated object needs a unique id');
});

test('the repetition is a real shape, not only a caption: at least one ghost box exists, offset from the unit', () => {
  const unitBox = { x: 0, y: 0, w: 100, h: 40 };
  const { objects } = stackSilhouettes({ unitBox, count: 3 });
  const ghosts = objects.filter(o => o.type === 'box');
  assert.equal(ghosts.length, 2);
  for (const ghost of ghosts) {
    assert.notDeepEqual({ x: ghost.initialState.x, y: ghost.initialState.y }, { x: unitBox.x, y: unitBox.y }, 'a ghost must not sit exactly on top of the real unit');
    assert.equal(ghost.initialState.w, unitBox.w, 'a ghost keeps the unit\'s own size - it is the same thing, reduced in detail, not a different shape');
  }
});

test('the resulting objects are generic scene objects a real scene can embed and validate', () => {
  const { objects: stack } = stackSilhouettes({ unitBox: { x: 100, y: 100, w: 160, h: 60 }, count: 3, idPrefix: 'block' });
  const scene = validateScene({
    id: 'embedded', duration: 1,
    objects: [{ id: 'unit', type: 'box', initialState: { x: 100, y: 100, w: 160, h: 60, label: 'the real one' } }, ...stack],
    timeline: [],
  });
  assert.equal(scene.objects.length, 1 + stack.length);
});

test('chainSequential connects every consecutive pair of anchors and nothing else', () => {
  const anchors = [{ out: { x: 0, y: 0 } }, { in: { x: 0, y: 10 }, out: { x: 0, y: 10 } }, { in: { x: 0, y: 20 } }];
  const arrows = chainSequential(anchors);
  assert.equal(arrows.length, 2);
  assert.deepEqual(arrows.map(a => [a.initialState.from, a.initialState.to]), [[{ x: 0, y: 0 }, { x: 0, y: 10 }], [{ x: 0, y: 10 }, { x: 0, y: 20 }]]);
  const ids = arrows.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('chainSequential on a single anchor draws nothing - there is no pair to connect', () => {
  assert.deepEqual(chainSequential([{ out: { x: 0, y: 0 } }]), []);
});
