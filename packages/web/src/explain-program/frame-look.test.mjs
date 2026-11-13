import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampText, frameLook, lanesOf, vectorKind } from './frame-look.js';

test('a vector kind is read from the label first, then the id: v, a or F by their letters or words; anything else has none', () => {
  assert.deepEqual(['Motion', 'v = +4.0 m/s', 'Gravity pulls down', 'a', 'Force', 'F'].map(label => vectorKind(label, 'x')), ['v', 'v', 'a', 'a', 'F', 'F']);
  assert.deepEqual([undefined, undefined, undefined, undefined].map((label, index) => vectorKind(label, ['vec.v', 'vec.a', 'vec.F', 'tossedVelocity'][index])), ['v', 'a', 'F', 'v']);
  assert.equal(vectorKind(undefined, 'ground'), null);
  assert.equal(vectorKind('Gravity', 'vec.v'), 'a', 'the label wins over the id');
});

// frame-look.js is pure: it reads the conventions the sdk-8 helpers produce (sdk.panel's "<id>.title" and "<id>.state" beside a box) and hands the renderer the lanes and the objects to draw.
const lane = (id, x) => [{ kind: 'box', id, x, y: 50, w: 200, h: 300 }, { kind: 'text', id: `${id}.title`, x, y: 36, text: 'T' }, { kind: 'text', id: `${id}.state`, x: x + 60, y: 36, text: 'S' }];

test('a lane is a box with a title and a state text beside it; lanes are ordered left to right whatever the object order', () => {
  const objects = [...lane('b', 300), ...lane('a', 40), { kind: 'box', id: 'plain', x: 0, y: 0, w: 10, h: 10 }];
  assert.deepEqual(lanesOf(objects).map(l => [l.id, l.index]), [['a', 0], ['b', 1]]);
  assert.equal(lanesOf([{ kind: 'box', id: 'x', x: 0, y: 0, w: 5, h: 5 }]).length, 0);
});

test('the first y axis becomes every lane\'s axis and is hidden as an object; an x axis is left alone', () => {
  const y = { kind: 'axis', id: 'h', orientation: 'y', x: 30, y: 330, length: 200, min: 0, max: 2, label: 'Height' }, x = { kind: 'axis', id: 't', orientation: 'x', x: 30, y: 330, length: 200, min: 0, max: 2, label: 'T' };
  const { lanes, objects } = frameLook([y, x, ...lane('a', 40), ...lane('b', 260)]);
  assert.deepEqual(lanes.map(l => l.axis.id), ['h', 'h']);
  assert.equal(objects.find(o => o.id === 'h').look.part, 'hidden');
  assert.equal(objects.find(o => o.id === 't').look, undefined);
  assert.deepEqual(objects.filter(o => o.look).map(o => [o.id, o.look.part]), [['h', 'hidden'], ['a', 'lane'], ['a.title', 'lane-title'], ['a.state', 'lane-state'], ['b', 'lane'], ['b.title', 'lane-title'], ['b.state', 'lane-state']]);
});

test('the fixed ids keep their meaning whatever the order: ball.drop declared first is still the second hue; suffixed vector ids resolve their kind', () => {
  const { objects } = frameLook([{ kind: 'circle', id: 'ball.drop', x: 5, y: 5, w: 20 }, { kind: 'circle', id: 'ball.toss', x: 50, y: 5, w: 20 }, { kind: 'arrow', id: 'vec.v.toss', from: { x: 0, y: 0 }, to: { x: 0, y: -30 } }, { kind: 'arrow', id: 'vec.a.drop', from: { x: 0, y: 0 }, to: { x: 0, y: 30 } }, { kind: 'arrow', id: 'vec.F', from: { x: 0, y: 0 }, to: { x: 0, y: 30 } }]);
  assert.deepEqual(objects.map(o => o.identitySlot ?? o.look.kind), ['identity-2', 'identity-1', 'v', 'a', 'F']);
});

test('a frame without a lane comes back as the same array', () => {
  const objects = [{ kind: 'text', id: 't', x: 1, y: 1, text: 'hi' }];
  assert.equal(frameLook(objects).objects, objects);
});

test('a text anchored in a lane is clamped to it (start at its left edge, middle by its half width); a text outside every lane is untouched', () => {
  const { objects } = frameLook([...lane('a', 40), { kind: 'text', id: 'in', x: 235, y: 100, text: 'a long label here' }, { kind: 'text', id: 'out', x: 500, y: 100, text: 'far away' }]);
  const moved = objects.find(o => o.id === 'in'), out = objects.find(o => o.id === 'out');
  assert.ok(moved.x < 235 && moved.x >= 46, `moved x ${moved.x}`);
  assert.deepEqual([out.x, out.y], [500, 100]);
  const middle = clampText({ x: 239, y: 100, text: 'centre', align: 'middle' }, { x: 40, y: 50, w: 200, h: 300 });
  assert.ok(middle.x < 239 - 10, `middle x ${middle.x}`);
  assert.equal(clampText({ x: 100, y: 5, text: 'a' }, { x: 40, y: 50, w: 200, h: 300 }).y, 64, 'a text above the lane drops to its first line');
});
