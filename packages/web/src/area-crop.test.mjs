import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaTarget, cardRevision, cropBinding, within } from './area-crop.js';

const rect = (left, top, width, height) => ({ left, top, width, height });
const scene = { id: 'a1', type: 'animation', title: 'Pendulum', scene: { duration: 8 }, time: 2.5, inputs: { length: 0.25 }, dx: 10, dy: 20, marked: null, selectedObject: null };

test('the crop is bound to each card by id, revision, bounds and moment', () => {
  const card = rect(100, 100, 400, 200), crop = rect(300, 150, 400, 100);
  const objects = [{ id: 'bob', rect: rect(320, 160, 20, 20) }, { id: 'pivot', rect: rect(120, 110, 10, 10) }];
  const binding = cropBinding(scene, crop, { card, objects });
  assert.deepEqual(binding, { id: 'a1', type: 'animation', title: 'Pendulum', revision: cardRevision(scene), bounds: { x: 0.5, y: 0.25, w: 0.5, h: 0.5 }, time: 2.5, inputs: { length: 0.25 }, objects: ['bob'] });
  assert.equal(cropBinding(scene, rect(0, 0, 50, 50), { card }), null, 'a card the crop does not touch is not bound');
});

test('a revision changes with content, never with place, view state or inputs', () => {
  const moved = { ...scene, dx: 400, time: 7, inputs: { length: 1 }, selectedObject: 'bob' };
  assert.equal(cardRevision(moved), cardRevision(scene));
  assert.notEqual(cardRevision({ ...scene, title: 'Pendulum, edited' }), cardRevision(scene));
});

test('a crop on one paper page carries that page and region, so the server crops the page as before', () => {
  const paper = { id: 'p1', type: 'paper', title: 'Attention', paper: { id: '1706.03762', page: 4 } };
  const binding = cropBinding(paper, rect(150, 250, 100, 100), { card: rect(100, 100, 300, 500), page: rect(100, 200, 300, 400) });
  assert.deepEqual(binding.region, { x: 0.167, y: 0.125, w: 0.333, h: 0.25 });
  const target = areaTarget({ id: 'area:x', bindings: [binding], preview: 'data:image/png;base64,AAAA', at: 1 });
  assert.deepEqual(target.paper, { id: '1706.03762', page: 4, selection: { region: binding.region, preview: 'data:image/png;base64,AAAA' } });
  assert.equal(areaTarget({ id: 'area:x', bindings: [binding], preview: null }).paper, undefined, 'no pixels, no paper crop request the server would refuse');
});

test('the pill names the real cards with no ellipsis, and the text names each binding', () => {
  const bindings = ['One', 'Two', 'Three'].map((title, i) => ({ id: `c${i}`, type: 'note', title, revision: 'r0', bounds: { x: 0, y: 0, w: 1, h: 1 } }));
  const target = areaTarget({ id: 'area:y', bindings });
  assert.equal(target.title, 'Selected area · One, Two +1');
  assert.ok(!/…|\.\.\./.test(target.title));
  assert.deepEqual(target.crops, bindings);
  assert.match(target.text, /Card "Three" \(note, revision r0\)/);
  assert.equal(areaTarget({ id: 'area:z', bindings: [] }).title, 'Selected area');
});

test('within clips to the frame and refuses rectangles that do not meet', () => {
  assert.deepEqual(within(rect(0, 0, 100, 100), rect(-50, -50, 100, 100)), { x: 0, y: 0, w: 0.5, h: 0.5 });
  assert.equal(within(rect(0, 0, 100, 100), rect(100, 0, 10, 10)), null);
  assert.equal(within(null, rect(0, 0, 1, 1)), null);
});
