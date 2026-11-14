import test from 'node:test';
import assert from 'node:assert/strict';
import { frameOverlaps, layoutProblems } from './frame-overlap.js';

// A lane is a container and a callout's own line boxes are its card: neither is an obstacle for the text inside it; every other box still is, and a body still is (text-body).
const text = (id, x, y, s = 'label') => ({ kind: 'text', id, x, y, text: s });
const box = (id, x, y, w, h) => ({ kind: 'box', id, x, y, w, h });
const pairs = objects => frameOverlaps({ objects }).map(o => [o.a, o.b, o.kind]);
const lane = [box('lane.toss', 20, 40, 300, 200), text('lane.toss.title', 20, 26, 'Toss'), text('lane.toss.state', 80, 26, 'At launch')];

test('text inside a lane passes', () => {
  assert.deepEqual(pairs([...lane, text('vec.vL', 100, 120, 'v')]), []);
});

test('text on another box still fails, and a box without a title and a state is not a lane', () => {
  assert.deepEqual(pairs([...lane, box('card', 90, 100, 60, 40), text('vec.vL', 100, 120, 'v')]), [['vec.vL', 'card', 'text-box']]);
  assert.deepEqual(pairs([box('plain', 20, 40, 300, 200), text('t', 100, 120, 'v')]), [['t', 'plain', 'text-box']]);
});

test('a callout text over its own line box passes; another text over that box still fails', () => {
  assert.deepEqual(pairs([...lane, box('callout.toss.l0', 100, 100, 80, 28), text('callout.toss', 105, 114, 'v = 0')]), []);
  assert.deepEqual(pairs([...lane, box('callout.toss.l0', 100, 100, 80, 28), text('other', 105, 114, 'v = 0')]), [['other', 'callout.toss.l0', 'text-box']]);
});

test('text on a body inside a lane is still a text-body problem', () => {
  const ball = { kind: 'circle', id: 'ball.toss', x: 100, y: 120, w: 30 };
  assert.deepEqual(layoutProblems({ objects: [...lane, ball, text('motion', 94, 120, 'Motion')] }).map(p => [p.a, p.b, p.kind]), [['motion', 'ball.toss', 'text-body']]);
});
