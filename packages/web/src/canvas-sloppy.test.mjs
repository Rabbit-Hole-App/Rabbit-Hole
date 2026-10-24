import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUGHNESS, jitterPoint, outlineOf, pointsOfPath, roughnessOf, roughnessPatch, seedOf, sloppyLink, sloppyPaths, sloppyShape } from './canvas-sloppy.js';
import { boardFromText, boardText } from './canvas-persist.js';

const rect = (extra = {}) => ({ id: 'r1', kind: 'rect', x1: 100, y1: 100, x2: 300, y2: 220, ...extra });
const arrow = (extra = {}) => ({ id: 'a1', kind: 'arrow', x1: 40, y1: 60, x2: 440, y2: 160, ...extra });
const numbers = d => d.match(/-?\d+(?:\.\d+)?/g).map(Number);
const first = d => numbers(d).slice(0, 2);
const last = d => numbers(d).slice(-2);

test('three levels: Clean 0, Sketchy 1, Rough 2, and anything else reads as Clean', () => {
  assert.deepEqual(ROUGHNESS.map(entry => entry.value), [0, 1, 2]);
  assert.deepEqual(ROUGHNESS.map(entry => entry.label), ['Clean', 'Sketchy', 'Rough']);
  for (const entry of ROUGHNESS) assert.ok(entry.tip.startsWith(entry.label) && !/\.\.\.|…/.test(entry.tip));
  assert.equal(roughnessOf({}), 0);
  assert.equal(roughnessOf({ roughness: 1 }), 1);
  assert.equal(roughnessOf({ roughness: 2 }), 2);
  assert.equal(roughnessOf({ roughness: 7 }), 0);
  assert.equal(roughnessOf(null), 0);
});

test('Clean draws nothing here, so an old canvas renders exactly as before', () => {
  assert.equal(sloppyShape(rect()), null);
  assert.equal(sloppyShape(rect({ roughness: 0 })), null);
  assert.equal(sloppyLink('M0 0 L10 10', { id: 'l' }), null);
  assert.equal(sloppyPaths([{ x: 0, y: 0 }, { x: 9, y: 9 }], { roughness: 0, seed: 5 }), null);
});

test('the same geometry, roughness and seed give the same path every time; another seed gives another', () => {
  const a = sloppyShape(rect({ roughness: 1, seed: 11 }));
  assert.deepEqual(sloppyShape(rect({ roughness: 1, seed: 11 })), a);
  assert.deepEqual(sloppyShape({ ...rect({ roughness: 1, seed: 11 }) }), a);
  assert.notDeepEqual(sloppyShape(rect({ roughness: 1, seed: 12 })), a);
  assert.notDeepEqual(sloppyShape(rect({ roughness: 2, seed: 11 })), a);
});

test('a missing seed falls back to one from the id, stable and different per object', () => {
  assert.equal(seedOf({ id: 'x' }), seedOf({ id: 'x' }));
  assert.notEqual(seedOf({ id: 'x' }), seedOf({ id: 'y' }));
  assert.equal(seedOf({ id: 'x', seed: 42 }), 42);
  assert.deepEqual(roughnessPatch({ id: 'x' }, 1), { roughness: 1, seed: seedOf({ id: 'x' }) });
  assert.deepEqual(roughnessPatch({ id: 'x', seed: 9 }, 2), { roughness: 2, seed: 9 }, 'an object keeps the seed it has');
  assert.deepEqual(roughnessPatch({ id: 'x', seed: 9 }, 0), { roughness: 0 });
});

test('Sketchy is one stroke, Rough is two overlapping strokes', () => {
  assert.equal(sloppyShape(rect({ roughness: 1 })).length, 1);
  assert.equal(sloppyShape(rect({ roughness: 2 })).length, 2);
});

test('the ends of an open path stay exactly where they were, so an arrowhead stays attached', () => {
  for (const roughness of [1, 2]) {
    for (const seed of [1, 2, 3, 99, 12345]) {
      for (const d of sloppyShape(arrow({ roughness, seed }))) {
        assert.deepEqual(first(d), [40, 60]);
        assert.deepEqual(last(d), [440, 160]);
      }
    }
  }
  const link = sloppyLink('M10 10 C60 10,60 200,110 200', { id: 'l', roughness: 2, seed: 4 });
  for (const d of link) { assert.deepEqual(first(d), [10, 10]); assert.deepEqual(last(d), [110, 200]); }
  const elbow = sloppyLink('M0 0 L50 0 L50 80 L120 80', { id: 'e', roughness: 1, seed: 8 });
  assert.deepEqual(last(elbow[0]), [120, 80]);
  assert.deepEqual(first(elbow[0]), [0, 0]);
});

test('the wobble is small: every point stays within a few pixels of the real outline', () => {
  const real = outlineOf(arrow()).points;
  const away = ([x, y]) => Math.abs((real[1].x - real[0].x) * (real[0].y - y) - (real[0].x - x) * (real[1].y - real[0].y)) / Math.hypot(real[1].x - real[0].x, real[1].y - real[0].y);
  for (const roughness of [1, 2]) {
    for (const d of sloppyShape(arrow({ roughness, seed: 5 }))) {
      const n = numbers(d);
      for (let i = 0; i < n.length; i += 2) assert.ok(away([n[i], n[i + 1]]) <= (roughness === 1 ? 2.2 : 4.6), `${roughness}: ${n[i]},${n[i + 1]}`);
    }
  }
});

test('a tiny shape wobbles in proportion instead of turning into a scribble', () => {
  const tiny = { id: 't', kind: 'rect', x1: 10, y1: 10, x2: 16, y2: 16, roughness: 2, seed: 3 };
  for (const d of sloppyShape(tiny)) for (const value of numbers(d)) assert.ok(value > 8 && value < 18, String(value));
});

test('a closed shape is a closed path with no seam, and the fill can follow it', () => {
  for (const kind of ['rect', 'ellipse']) {
    const [d] = sloppyShape({ id: 'c', kind, x1: 0, y1: 0, x2: 160, y2: 100, roughness: 1, seed: 6 });
    assert.ok(d.startsWith('M') && d.endsWith('Z'), kind);
  }
  const polygon = [[0.5, 0], [1, 1], [0, 1]];
  const triangle = sloppyShape({ id: 'p', kind: 'triangle', x1: 0, y1: 0, x2: 100, y2: 100, roughness: 1, seed: 2 }, { polygon });
  assert.ok(triangle[0].endsWith('Z'));
  assert.equal(outlineOf({ kind: 'triangle', x1: 0, y1: 0, x2: 100, y2: 100 }, { polygon }).points.length, 3);
});

test('rounded and sharp rectangles, curves and elbows each sample their real geometry', () => {
  assert.equal(outlineOf(rect()).points.length, 4);
  assert.ok(outlineOf(rect({ round: true })).points.length > 4);
  const curve = outlineOf({ kind: 'curve', x1: 0, y1: 0, x2: 100, y2: 0 }, { control: { x: 50, y: 40 } }).points;
  assert.deepEqual(curve[0], { x: 0, y: 0 });
  assert.deepEqual(curve[curve.length - 1], { x: 100, y: 0 });
  assert.equal(outlineOf({ kind: 'elbow' }, { elbow: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 9 }] }).points.length, 3);
});

test('a connector path of lines and curves is read back to its anchors', () => {
  assert.deepEqual(pointsOfPath('M1 2 L3 4 L5 6'), [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]);
  const curve = pointsOfPath('M0 0 C0 50,100 50,100 0');
  assert.deepEqual(curve[0], { x: 0, y: 0 });
  assert.deepEqual(curve[curve.length - 1], { x: 100, y: 0 });
  assert.ok(curve.length > 8);
});

test('moving a shape moves its sketch with it, shape unchanged', () => {
  const a = numbers(sloppyShape(arrow({ roughness: 1, seed: 21 }))[0]);
  const moved = numbers(sloppyShape(arrow({ roughness: 1, seed: 21, x1: 540, y1: 160, x2: 940, y2: 260 }))[0]);
  assert.equal(moved.length, a.length);
  moved.forEach((value, index) => assert.ok(Math.abs(value - a[index] - (index % 2 ? 100 : 500)) < 0.02, 'every point shifted by the same offset'));
});

test('an arrowhead arm wobbles, a Clean one does not move', () => {
  assert.deepEqual(jitterPoint({ x: 5, y: 5 }, 0, 3), { x: 5, y: 5 });
  const a = jitterPoint({ x: 5, y: 5 }, 1, 3), b = jitterPoint({ x: 5, y: 5 }, 1, 3);
  assert.deepEqual(a, b);
  assert.ok(Math.hypot(a.x - 5, a.y - 5) < 3);
});

test('roughness and seed survive a save and reload of the board, on shapes and connectors', () => {
  const state = { shapes: [rect({ roughness: 2, seed: 77 })], links: [{ id: 'l', from: 'a', to: 'b', roughness: 1, seed: 5 }] };
  const back = boardFromText(boardText(state));
  assert.equal(back.shapes[0].roughness, 2);
  assert.equal(back.shapes[0].seed, 77);
  assert.deepEqual(back.links[0], state.links[0]);
  assert.deepEqual(sloppyShape(back.shapes[0]), sloppyShape(state.shapes[0]), 'the same look after reload');
});
