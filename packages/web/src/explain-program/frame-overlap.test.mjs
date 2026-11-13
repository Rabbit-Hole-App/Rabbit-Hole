import test from 'node:test';
import assert from 'node:assert/strict';
import { frameOverlaps, traceObjects } from './frame-overlap.js';

const text = (id, x, y, s = 'label') => ({ kind: 'text', id, x, y, text: s });
const circle = (id, x, y, w = 24) => ({ kind: 'circle', id, x, y, w });
const pairs = frame => frameOverlaps(frame).map(o => [o.a, o.b, o.kind]);

test('a text over a circle, a box or an arrowhead, and an arrowhead over a circle are overlaps; any intersection counts', () => {
  assert.deepEqual(pairs({ objects: [circle('ball', 100, 100), text('t', 95, 100, 'v = 0')] }), [['t', 'ball', 'text-circle']]);
  assert.deepEqual(pairs({ objects: [{ kind: 'box', id: 'b', x: 80, y: 80, w: 60, h: 30 }, text('t', 90, 95, 'in the box')] }), [['t', 'b', 'text-box']]);
  assert.deepEqual(pairs({ objects: [{ kind: 'arrow', id: 'a', from: { x: 50, y: 100 }, to: { x: 150, y: 100 } }, text('t', 146, 100, 'v')] }), [['t', 'a', 'text-arrowhead']]);
  assert.deepEqual(pairs({ objects: [{ kind: 'arrow', id: 'a', from: { x: 50, y: 100 }, to: { x: 150, y: 100 } }, circle('ball', 156, 100)] }), [['a', 'ball', 'arrowhead-circle']]);
  assert.deepEqual(pairs({ objects: [text('t1', 20, 20, 'one label'), text('t2', 25, 22, 'another')] }), [['t1', 't2', 'text-text']]);
});

test('clear objects are not overlaps: a label past the tip, a text beside a ball, a box with its own label, a point-length arrow', () => {
  assert.deepEqual(pairs({ objects: [{ kind: 'arrow', id: 'a', from: { x: 50, y: 100 }, to: { x: 150, y: 100 } }, text('t', 175, 100, 'v')] }), [], 'a label 8 px past the head');
  assert.deepEqual(pairs({ objects: [circle('ball', 100, 100), text('t', 130, 100, 'v = 0')] }), []);
  assert.deepEqual(pairs({ objects: [{ kind: 'box', id: 'b', x: 80, y: 80, w: 60, h: 30, text: 'its own label' }] }), [], 'a box own label is not a separate object');
  assert.deepEqual(pairs({ objects: [{ kind: 'arrow', id: 'a', from: { x: 5, y: 5 }, to: { x: 5, y: 5 } }, circle('ball', 5, 5)] }), []);
  assert.deepEqual(pairs({ objects: [{ kind: 'line', id: 'l', from: { x: 0, y: 100 }, to: { x: 300, y: 100 } }, text('t', 100, 100)] }), [], 'a line is not checked');
});

test('traceObjects keeps only the geometry the check needs and is bounded', () => {
  const objects = [circle('c', 1, 2), text('t', 3, 4, 'hi'), { kind: 'polyline', id: 'p', points: [[0, 0], [1, 1]] }, ...Array.from({ length: 100 }, (_, i) => circle('c' + i, i, i))];
  const out = traceObjects(objects);
  assert.equal(out.length, 80); assert.ok(!out.some(o => o.kind === 'polyline'));
  assert.deepEqual(out[1], { id: 't', kind: 'text', x: 3, y: 4, text: 'hi', align: undefined });
});
