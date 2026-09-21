import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentSteps } from './learn-present.js';

const heading = (id, text = '') => ({ id, type: 'heading', level: 1, text });
const card = id => ({ id, type: 'explanation' });
const boxesFor = (...ids) => Object.fromEntries(ids.map((id, i) => [id, { x: 0, y: i * 100, w: 560, h: 80 }]));

test('an empty canvas has nothing to present', () => {
  assert.deepEqual(presentSteps([], {}), []);
  assert.deepEqual(presentSteps(undefined, undefined), []);
});

// Without headings there is no grouping to infer, so each card stands alone.
test('with no headings, every card is its own step', () => {
  const blocks = [card('a'), card('b')];
  const steps = presentSteps(blocks, boxesFor('a', 'b'));
  assert.equal(steps.length, 2);
  assert.deepEqual(steps.map(step => step.ids), [['a'], ['b']]);
});

test('a heading opens a step and gathers what follows it', () => {
  const blocks = [heading('h1', 'Attention'), card('a'), card('b'), heading('h2', 'Training'), card('c')];
  const steps = presentSteps(blocks, boxesFor('h1', 'a', 'b', 'h2', 'c'));
  assert.deepEqual(steps.map(step => step.ids), [['h1', 'a', 'b'], ['h2', 'c']]);
  assert.deepEqual(steps.map(step => step.label), ['Attention', 'Training']);
});

// Cards placed before anyone added a heading must still be presentable.
test('cards before the first heading are a step of their own', () => {
  const blocks = [card('a'), heading('h1', 'Later'), card('b')];
  const steps = presentSteps(blocks, boxesFor('a', 'h1', 'b'));
  assert.deepEqual(steps.map(step => step.ids), [['a'], ['h1', 'b']]);
});

test('two headings in a row give two steps, the first with just its title', () => {
  const blocks = [heading('h1', 'One'), heading('h2', 'Two'), card('a')];
  const steps = presentSteps(blocks, boxesFor('h1', 'h2', 'a'));
  assert.deepEqual(steps.map(step => step.ids), [['h1'], ['h2', 'a']]);
});

test('an untitled heading still gets a readable label', () => {
  const steps = presentSteps([heading('h1', '   ')], boxesFor('h1'));
  assert.deepEqual(steps.map(step => step.label), ['Section 1']);
});

test('a step carries the boxes needed to frame it', () => {
  const steps = presentSteps([heading('h1', 'X'), card('a')], boxesFor('h1', 'a'));
  assert.equal(steps[0].boxes.length, 2);
  assert.deepEqual(steps[0].boxes[1], { x: 0, y: 100, w: 560, h: 80 });
});

// A card the layout has not measured cannot be framed, so it cannot be a step.
test('unmeasured cards are left out, and a step that is entirely unmeasured disappears', () => {
  const blocks = [heading('h1', 'X'), card('a'), heading('h2', 'Y'), card('b')];
  const steps = presentSteps(blocks, boxesFor('h1', 'a'));
  assert.deepEqual(steps.map(step => step.ids), [['h1', 'a']]);
});

test('a lone unmeasured card yields no steps rather than an unframeable one', () => {
  assert.deepEqual(presentSteps([card('a')], {}), []);
});

test('sub-headings open their own step, so depth does not nest', () => {
  const blocks = [heading('h1', 'Big'), card('a'), { ...heading('h2', 'Small'), level: 2 }, card('b')];
  const steps = presentSteps(blocks, boxesFor('h1', 'a', 'h2', 'b'));
  assert.deepEqual(steps.map(step => step.ids), [['h1', 'a'], ['h2', 'b']]);
});
