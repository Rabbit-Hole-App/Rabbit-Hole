import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupShot } from './learn-group-shot.js';

// The group picture is drawn from the data, not the DOM, so No stroke has to be honoured here too (owner, 2026-10-13).
async function strokesDrawn(shapes) {
  let strokes = 0;
  const ctx = new Proxy({ stroke: () => { strokes += 1; } }, { get: (target, key) => (key in target ? target[key] : () => {}), set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => ctx, toBlob: done => done(null) }) };
  await groupShot({ box: { left: 0, top: 0, right: 200, bottom: 100 }, members: new Set(shapes.map(shape => shape.id)), strokes: [], shapes, items: [], blocks: [], bounds: {} });
  return strokes;
}
const rect = (id, extra = {}) => ({ id, kind: 'rect', x1: 0, y1: 0, x2: 80, y2: 40, color: '#b42318', width: 3.5, ...extra });

test('a shape with No stroke is drawn without an outline, and its neighbours keep theirs', async () => {
  assert.equal(await strokesDrawn([rect('a')]), 1);
  assert.equal(await strokesDrawn([rect('a', { noStroke: true })]), 0);
  assert.equal(await strokesDrawn([rect('a', { noStroke: true, fill: '#2383e2' }), rect('b')]), 1);
});
