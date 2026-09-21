import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAnimation } from './scene-describe.js';

// Authored the way an author actually writes: no explicit opacity, because
// the schema defaults it to 1. The canvas validates; the tutor must too.
const block = (overrides = {}) => ({
  type: 'animation',
  title: 'One token, all the way through',
  time: 2,
  scene: {
    id: 'journey', duration: 8,
    objects: [
      { id: 'chars', type: 'tokens', semanticId: 'tokens', conceptId: 'tokenisation', initialState: { x: 40, y: 58, tokens: ['h', 'e'] } },
      { id: 'table', type: 'grid', semanticId: 'embedding-table', initialState: { x: 40, y: 140, rows: 2, cols: 2, values: [1, 2, 3, 4], matrixKind: 'input' } },
    ],
    timeline: [{ at: 1, action: 'highlight', target: 'table' }],
  },
  ...overrides,
});

test('an authored scene with defaulted opacity is reported as visible', () => {
  const described = describeAnimation(block());
  assert.match(described.text, /tokens/, 'the token row is on screen and must be named');
  assert.match(described.text, /embedding-table/);
  assert.doesNotMatch(described.text, /State at that moment: \[\]/);
});

test('the described state is the state at the paused moment', () => {
  assert.match(describeAnimation(block()).text, /"highlighted":true/, 'the highlight at 1s is active at 2s');
  assert.doesNotMatch(describeAnimation(block({ time: 0.5 })).text, /"highlighted":true/);
});

test('an unusable scene degrades to a sentence and never throws', () => {
  // `{ id: 'a', type: 'box' }` would NOT belong here: initialState carries
  // .default({}) and every inner field defaults, so it validates. An unknown
  // type is what actually fails the enum.
  for (const broken of [{ scene: null }, { scene: {} }, { scene: { id: 'x', duration: 2, objects: [{ id: 'a', type: 'nonsense' }], timeline: [] } }]) {
    const described = describeAnimation(block(broken));
    assert.equal(typeof described.text, 'string');
    assert.match(described.text, /cannot be read|Invalid animation/);
  }
});

test('concept ids reach the tutor', () => {
  assert.match(describeAnimation(block()).text, /tokenisation/);
});

test('a large array is shortened with its remainder counted, never silently', () => {
  const big = Array.from({ length: 200 }, (unused, index) => index);
  const described = describeAnimation(block({
    scene: { id: 'big', duration: 4, objects: [{ id: 'g', type: 'grid', semanticId: 'wide', initialState: { x: 0, y: 0, rows: 10, cols: 20, values: big, matrixKind: 'input' } }], timeline: [] },
  }));
  assert.match(described.text, /\+176 more/, 'the remainder is stated');
  assert.ok(described.text.length < 1200, `serialised state stayed bounded, got ${described.text.length}`);
  assert.doesNotMatch(described.text, /,199/, 'the tail is not present');
});
