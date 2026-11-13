import test from 'node:test';
import assert from 'node:assert/strict';
import { programSdkSource } from './sdk.js';

// The guest SDK runs as script text defining `sdk`; evaluate it here to unit-test the physical-props helpers.
const sdk = new Function(`${programSdkSource('sdk-7')}\nreturn sdk;`)();
const kinds = objects => objects.map(o => o.kind);

test('sdk.vector at value 0 draws nothing: no arrow, no floating head', () => {
  assert.deepEqual(sdk.vector('v', { x: 100, y: 100 }, { value: 0, direction: 'up' }, { scale: 20 }), []);
  assert.deepEqual(sdk.vector('v', { x: 100, y: 100 }, { dx: 0, dy: 0 }), []);
});

test('sdk.vector below minLength is a plain line of its true length, never an arrowhead; the zero vector keeps its label', () => {
  const tiny = sdk.vector('v', { x: 100, y: 100 }, { value: 0.3, direction: 'up' }, { scale: 20 });
  assert.deepEqual(kinds(tiny), ['line']);
  assert.deepEqual([tiny[0].from, tiny[0].to], [{ x: 100, y: 100 }, { x: 100, y: 94 }]);
  assert.deepEqual(kinds(sdk.vector('v', { x: 0, y: 0 }, { value: 0.04, direction: 'up' }, { scale: 20 })), [], 'under 1 px: nothing');
  const labelled = sdk.vector('v', { x: 100, y: 100 }, { value: 0, direction: 'up' }, { scale: 20, label: 'v = 0' });
  assert.deepEqual(kinds(labelled), ['text'], 'only the label of a zero vector');
  assert.ok(labelled[0].y < 100, 'past the (zero) tip along its declared direction: above');
});

test('sdk.vector from minLength is an arrow of value x scale; a negative value reverses it; a long one is the whole length', () => {
  const up = sdk.vector('v', { x: 50, y: 200 }, { value: 5, direction: 'up' }, { scale: 10 })[0];
  assert.equal(up.kind, 'arrow'); assert.deepEqual([up.to.x, up.to.y], [50, 150]);
  const down = sdk.vector('v', { x: 50, y: 200 }, { value: -5, direction: 'up' }, { scale: 10 })[0];
  assert.deepEqual([down.kind, down.to.x, down.to.y], ['arrow', 50, 250], 'negative flips to down');
  const long = sdk.vector('v', { x: 0, y: 0 }, { dx: 300, dy: 400 }, { scale: 2 })[0];
  assert.deepEqual([long.kind, long.to.x, long.to.y], ['arrow', 600, 800]);
  assert.equal(sdk.vector('v', { x: 0, y: 0 }, { value: 12, direction: 'right' })[0].kind, 'arrow', 'exactly minLength is an arrow');
  assert.equal(sdk.vector('v', { x: 0, y: 0 }, { value: 11.9, direction: 'right' })[0].kind, 'line');
});

test('sdk.vector places its label just past the tip along the arrow direction, 8 px clear, never from the tail', () => {
  const [arrow, label] = sdk.vector('f', { x: 100, y: 300 }, { value: 4, direction: 'up' }, { scale: 20, label: 'v' });
  assert.equal(label.id, 'fL'); assert.equal(label.align, 'middle');
  assert.equal(label.x, 100); assert.ok(label.y <= arrow.to.y - 8 - 10 + 1e-9, 'above the tip: 8 px clear plus half a line');
  const [, right] = sdk.vector('f', { x: 100, y: 300 }, { value: 4, direction: 'right' }, { scale: 20, label: 'a = 2' });
  assert.equal(right.y, 300); assert.ok(right.x >= 180 + 8 + 4.5 * 5 - 1e-9, 'right of the tip by 8 px plus half the text width');
  const [, left] = sdk.vector('f', { x: 100, y: 300 }, { dx: -80, dy: 0 }, { label: 'L' });
  assert.ok(left.x <= 20 - 8 - 4.5 + 1e-9, 'left of a leftward tip');
  assert.equal(sdk.vector('f', { x: 0, y: 0 }, { value: 3, direction: 'up' }, { scale: 10, role: 'warning' })[0].role, 'warning');
  assert.throws(() => sdk.vector('f', { x: 0, y: 0 }, { value: 1, direction: 'sideways' }), /direction/);
});
