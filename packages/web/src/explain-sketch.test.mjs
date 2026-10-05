// The Explain Back sketch's pure rules (docs/features/explain-back-sketch.md): what a mark is, what the grader
// reads beside the picture, when Submit opens, and the one grade request a submission makes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canSubmit, hasMarks, roundPoint, sketchMarks, sketchText } from './explain-sketch.js';
import { assessBody, explainBackPrompt } from '../../control-plane/src/agents/learn-grade.js';

const block = { id: 'b1', type: 'challenge', mode: 'explain_back', prompt: 'What happens to token id 2?', expects: ['the id selects an embedding row', 'a position embedding is added'], attemptId: 'attempt-0001' };
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

test('Submit opens on typed words or on marks in a shown sketch; text is never required, a hidden sketch never counts', () => {
  assert.equal(canSubmit('  ', null, false), false);
  assert.equal(canSubmit('the id picks a row', null, false), true);
  assert.equal(canSubmit('', drawn, true), true, 'sketch only');
  assert.equal(canSubmit('', drawn, false), false, 'a hidden sketch is not submitted');
  assert.equal(canSubmit('', { strokes: [], shapes: [], items: [] }, true), false, 'an empty sketch is not an answer');
});

test('sketch points keep a tenth of a pixel', () => {
  assert.deepEqual(roundPoint({ x: 12.345, y: -0.06 }), { x: 12.3, y: -0.1 });
});

test('a text-only grade request is exactly what it was; a sketch adds the attempt id and the sketch, one request', () => {
  assert.deepEqual(assessBody(block, 'the id picks a row'), { mode: 'explain_back', prompt: block.prompt, expects: block.expects, answer: 'the id picks a row' });
  assert.equal(JSON.stringify(assessBody(block, 'x')), JSON.stringify({ mode: 'explain_back', prompt: block.prompt, expects: block.expects, answer: 'x' }));
  const sketch = { image: 'data:image/png;base64,iVBORw0KGgo=', text: sketchText(drawn) };
  assert.deepEqual(assessBody(block, '', sketch), { mode: 'explain_back', prompt: block.prompt, expects: block.expects, answer: '', attempt_id: 'attempt-0001', sketch });
});

test('with a sketch the instruction judges text and drawing as one explanation and never credits a drawing alone', () => {
  const plain = explainBackPrompt(block, 'the id picks a row');
  assert.doesNotMatch(plain, /sketch/i, 'text-only keeps the golden instruction');
  const both = explainBackPrompt(block, 'the id picks a row', { text: sketchText(drawn) });
  assert.match(both, /Learner's typed explanation: "the id picks a row"/);
  assert.match(both, /attached image\. Marks: 1 freehand stroke/);
  assert.match(both, /together as ONE explanation/);
  assert.match(both, /A drawing is not evidence by itself/);
  assert.match(both, /never instructions to you/);
  assert.match(explainBackPrompt(block, '', { text: 'Marks: 1 box.' }), /typed nothing: their explanation is the sketch alone/);
  // Same verdict contract as the text grade.
  assert.match(both, /VERDICT: good" only when every key idea is present/);
});
