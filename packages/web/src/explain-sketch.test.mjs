// The Explain Back sketch's pure rules (docs/features/explain-back-sketch.md): what a mark is, what the grader
// reads beside the picture, and when Submit opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasMarks, roundPoint, sketchMarks, sketchText } from './explain-sketch.js';

const drawn = {
  strokes: [{ tool: 'pen', points: [{ x: 1, y: 1 }, { x: 9, y: 9 }] }, { tool: 'pen', points: [{ x: 5, y: 5 }] }],
  shapes: [
    { id: 's2', kind: 'rect', x1: 200, y1: 20, x2: 300, y2: 60, text: 'position' },
    { id: 's1', kind: 'rect', x1: 10, y1: 20, x2: 110, y2: 60, text: 'embedding row' },
    { id: 's3', kind: 'arrow', x1: 110, y1: 40, x2: 200, y2: 40, label: 'add' },
  ],
  items: [{ id: 'i1', kind: 'text', x: 10, y: 150, text: '  then the blocks mix  ' }, { id: 'i2', kind: 'sticky', x: 300, y: 150, text: '' }],
};

test('a mark is a stroke of two points or more, a shape, or a text with words; nothing else counts', () => {
  assert.equal(sketchMarks(null), 0);
  assert.equal(hasMarks({ strokes: [{ tool: 'pen', points: [{ x: 1, y: 1 }] }], shapes: [], items: [{ kind: 'text', text: '   ' }] }), false);
  assert.equal(sketchMarks(drawn), 1 + 3 + 1);
});

test('the grader reads the marks by kind, then every written word top to bottom, left to right', () => {
  const text = sketchText(drawn);
  assert.equal(text, 'Marks: 1 freehand stroke, 2 boxes, 1 arrow. Written in the sketch: box: "embedding row"; arrow label: "add"; box: "position"; text: "then the blocks mix".');
  assert.equal(sketchText({}), 'Marks: none. Nothing is written in the sketch.');
  assert.equal(sketchText({ items: [{ kind: 'text', x: 0, y: 0, text: 'x'.repeat(5000) }] }).length, 2000);
});

// The grading fixtures (tests/evals/explain-back-sketch/fixtures.json): what the grader reads beside each picture.
const { expects, fixtures } = JSON.parse(readFileSync(new URL('../../../tests/evals/explain-back-sketch/fixtures.json', import.meta.url), 'utf8'));
const fixture = id => fixtures.find(entry => entry.id === id);
test('the fixtures: a correct sketch names every key idea, an irrelevant one none, a wrong one the wrong mechanism', () => {
  assert.equal(expects.length, 4);
  const correct = sketchText(fixture('sketch-only-correct').sketch);
  for (const words of ['token id 2', 'selects row 2', 'wte embedding table', 'position embedding added', 'transformer blocks mix the vectors across positions', 'LM head: one score per vocabulary token']) assert.ok(correct.includes(words), words);
  assert.ok(correct.indexOf('token id 2') < correct.indexOf('selects row 2') && correct.indexOf('selects row 2') < correct.indexOf('wte'), 'the pipeline reads in order');
  const irrelevant = sketchText(fixture('sketch-only-irrelevant').sketch);
  assert.ok(hasMarks(fixture('sketch-only-irrelevant').sketch), 'it is a real drawing');
  assert.doesNotMatch(irrelevant, /embedding|position|transformer|LM head|score|token/i);
  assert.match(sketchText(fixture('sketch-only-incorrect').sketch), /multiply by 2.*4 is the next token/);
  for (const entry of fixtures) assert.ok(String(entry.answer || '').trim() || hasMarks(entry.sketch), `${entry.id} is an answer`);
});

test('sketch points keep a tenth of a pixel', () => {
  assert.deepEqual(roundPoint({ x: 12.345, y: -0.06 }), { x: 12.3, y: -0.1 });
});

