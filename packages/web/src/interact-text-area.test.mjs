import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, PICTURE_PART_ROLES, arrangeText, figureOptions, roleOf } from './interact-layout.js';
import { ROLE_FILL, ROLE_NAMES } from './tutor-diagrams/theme/palette.js';

// Brief 37: the text area arranged by rule. A card supplies values, a formula and an explanation (one to four lines); the layout module chooses ROWS or COLUMNS (two or three rows tall) and every box.
const values = (...texts) => texts.map(text => ({ text }));
const state = (valueTexts, explanation) => ({ values: values(...valueTexts), explanation });
const FORMULA = String.raw`\alpha_j = \mathrm{softmax}_j(q \cdot k_j)`;
const SHORT = 'A thicker line means a larger weight.', LONG_ONE_LINE = 'The six weights from one word add up to 1.'; // about 370 px: wider than the note box (340), narrower than a line room (392)
const arrange = (layout, variants, pictureMins = {}) => arrangeText(layout, { variants, formula: FORMULA, pictureMins });

test('ROWS: one explanation line that fits the note box keeps the old arrangement, box for box (the pendulum card)', () => {
  const a = arrange('side-by-side', [state(['Angle B: 19', 'Period B: 2.84 s', 'Period A: 2.01 s'], ['Slower: a longer string takes longer.'])]);
  assert.equal(a.arrangement, 'rows'); assert.equal(a.rowsTall, null);
  assert.deepEqual(a.pictures, { stage: [12, 12, 304, 299.2], panel: [324, 12, 304, 299.2] });
  assert.deepEqual(a.values.boxes, [[12, 320.4, 200, 28], [220, 320.4, 200, 28], [428, 320.4, 200, 28]]);
  assert.deepEqual(a.values.dots, [[26, 334.4, 10], [234, 334.4, 10], [442, 334.4, 10]]);
  assert.deepEqual(a.formula, { at: [138, 372.8], align: 'middle' });
  assert.deepEqual(a.explanation, { kind: 'box', box: [272, 358.8, 356, 28] });
  assert.deepEqual(a.dropped, { explanationLines: 0, values: 0 });
});

test('COLUMNS: two or more lines, or one line wider than the note box, take the columns arrangement', () => {
  assert.equal(arrange('wide', [state(['Word: sat'], [SHORT, SHORT])]).arrangement, 'columns');
  const oneWide = arrange('wide', [state(['Word: sat'], [LONG_ONE_LINE])]);
  assert.equal(oneWide.arrangement, 'columns'); assert.equal(oneWide.rowsTall, 2);
});

test('COLUMNS, two rows tall: at most two values and an explanation of two lines; boxes [12, 319.2, 200, 68.8] and [220, 319.2, 408, 68.8], pictures keep rows 1 to 8', () => {
  const a = arrange('wide', [state(['Word: sat', 'Attends to: cat'], [SHORT, 'The six weights from one word add up to 1.'])]);
  assert.deepEqual([a.arrangement, a.rowsTall], ['columns', 2]);
  assert.deepEqual(a.pictures, { stage: [12, 12, 616, 299.2] });
  assert.deepEqual(a.values.boxes, [[12, 320.4, 200, 28], [12, 358.8, 200, 28]]); // 28 px boxes in two equal slots of 30.4 px
  assert.deepEqual(a.values.dots, [[26, 334.4, 10], [26, 372.8, 10]]);
  assert.deepEqual(a.formula, { at: [228, 333.2], align: 'start' }); // left aligned at the text box's left edge plus 8, in a 28 px band at the top
  assert.deepEqual(a.explanation, { kind: 'lines', x: 228, ys: [355.95, 373.45] }); // each line 17.5 px tall, under the formula band
});

test('COLUMNS, three rows tall: more than two values or more than two lines, when every picture still fits 260.8 px; boxes [12, 280.8, 200, 107.2] and [220, 280.8, 408, 107.2]', () => {
  const lines = [SHORT, 'The six weights from one word add up to 1.', 'sat gives its largest weight, 0.40, to cat.'];
  const a = arrange('wide', [state(['Word: sat', 'Attends to: cat', 'Weight: 0.40'], lines)], { stage: 238 });
  assert.deepEqual([a.arrangement, a.rowsTall], ['columns', 3]);
  assert.deepEqual(a.pictures, { stage: [12, 12, 616, 260.8] });
  assert.deepEqual(a.values.boxes, [[12, 282, 200, 28], [12, 320.4, 200, 28], [12, 358.8, 200, 28]]);
  assert.deepEqual(a.formula, { at: [228, 294.8], align: 'start' });
  assert.deepEqual(a.explanation, { kind: 'lines', x: 228, ys: [317.55, 335.05, 352.55] });
  assert.deepEqual(a.dropped, { explanationLines: 0, values: 0 });
  // four lines fit three rows too (formula band 28 + 4 x 17.5 = 98 of 107.2)
  assert.deepEqual(arrange('wide', [state(['Word: sat'], [...lines, 'And a fourth line.'])], { stage: 238 }).explanation.ys.length, 4);
});

test('the pictures of every layout 1 to 4 give up their last row at three rows: wide, side-by-side and equal-split 260.8 tall; stacked keeps its first picture and its second loses the row', () => {
  const lines = [SHORT, SHORT, SHORT];
  const boxes = layout => arrange(layout, [state(['Word: sat'], lines)]).pictures;
  assert.deepEqual(boxes('side-by-side'), { stage: [12, 12, 304, 260.8], panel: [324, 12, 304, 260.8] });
  assert.deepEqual(boxes('equal-split'), { stage: [12, 12, 304, 260.8], panel: [324, 12, 304, 260.8] });
  assert.deepEqual(boxes('stacked'), { stage: [12, 12, 616, 145.6], panel: [12, 165.6, 616, 107.2] });
});

test('a picture whose least height does not fit three rows keeps the text area two rows tall; the last explanation line gives way first, then the last value', () => {
  const lines = [SHORT, 'The six weights from one word add up to 1.', 'sat gives its largest weight, 0.40, to cat.'];
  const a = arrange('wide', [state(['Word: sat', 'Attends to: cat', 'Weight: 0.40'], lines)], { stage: 270 });
  assert.deepEqual([a.arrangement, a.rowsTall], ['columns', 2]);
  assert.deepEqual(a.pictures, { stage: [12, 12, 616, 299.2] });
  assert.equal(a.explanation.ys.length, 2); assert.equal(a.values.count, 2);
  assert.deepEqual(a.dropped, { explanationLines: 1, values: 1 });
  // the explanation gives way first: with three lines and one value, only the line goes
  assert.deepEqual(arrange('wide', [state(['Word: sat'], lines)], { stage: 270 }).dropped, { explanationLines: 1, values: 0 });
  // a value that does not fit its box is dropped from the end (never shrunk)
  const wide = arrange('wide', [state(['Word: sat', 'A value text that is far too wide for its box'], [SHORT, SHORT])]);
  assert.deepEqual([wide.values.count, wide.dropped.values], [1, 1]);
  assert.throws(() => arrange('wide', [state(['A value text that is far too wide for its box'], [SHORT, SHORT])]), error => error.code === 'values_none');
});

test('refused, never shrunk: a line wider than its room, five lines, states that differ in size, a formula wider than its box', () => {
  assert.throws(() => arrange('wide', [state(['Word: sat'], [SHORT, 'This line is far too long to fit the explanation box of a text area at fourteen pixels wide.'])]), error => error.code === 'text_too_wide' && error.path[0] === 'explanation');
  assert.throws(() => arrange('wide', [state(['Word: sat'], [SHORT, SHORT, SHORT, SHORT, SHORT])]), error => error.code === 'explanation_lines');
  assert.throws(() => arrange('wide', [state(['Word: sat'], [SHORT]), state(['Word: sat'], [SHORT, SHORT])]), error => error.code === 'variants_differ');
  assert.throws(() => arrangeText('wide', { variants: [state(['Word: sat'], [SHORT, SHORT])], formula: String.raw`\alpha_j = \mathrm{softmax}_j(q \cdot k_j) + \mathrm{softmax}_j(q \cdot k_j) + \mathrm{softmax}_j(q \cdot k_j)` }), error => error.code === 'text_too_wide' && error.path[0] === 'formula');
});

test('the room of a line is 392 px: a bullet and its line at that width fit, a pixel more is refused', () => {
  assert.equal(COLUMNS.textBox[1] - 2 * COLUMNS.textClear, 392);
});

test('layouts 5 and 6 do not change: one line only, rows', () => {
  for (const layout of ['tall', 'tall-with-panel']) {
    assert.equal(arrange(layout, [state(['Word: sat'], ['sat looks most at cat.'])]).arrangement, 'rows');
    assert.throws(() => arrange(layout, [state(['Word: sat'], [SHORT, SHORT])]), error => error.code === 'explanation_lines');
  }
});

test('the picture box follows the layout module: figureOptions takes the height it chose, else the slot own', () => {
  const answers = { pictureCount: 'one', runs: 'left-to-right', panelRole: 'none' };
  assert.equal(figureOptions(answers).options.box.height, 299.2); assert.equal(figureOptions(answers, { height: 260.8 }).options.box.height, 260.8);
});

test('value dots by rule: a shape of the program gives its role, a part of an /explain picture comes from one table per kind; the token-links roles match the fills the renderer draws', () => {
  assert.equal(roleOf('pendulumA', { shapes: { pendulumA: 'input', pendulumB: 'warning' } }), 'input'); assert.equal(roleOf('pendulumB', { shapes: { pendulumA: 'input', pendulumB: 'warning' } }), 'warning');
  assert.deepEqual(PICTURE_PART_ROLES['token-links'], { picked: 'input', attended: 'output' });
  assert.equal(roleOf('picked', { kind: 'token-links' }), 'input'); assert.equal(roleOf('attended', { kind: 'token-links' }), 'output');
  assert.throws(() => roleOf('nothing', { kind: 'token-links' }), error => error.code === 'value_of_unknown');
  // token-links draws the picked source token with the process fill and the strongest target with the outcome fill (token-links-layout.js tokenBox); the frame roles with the same fill names:
  assert.equal(ROLE_FILL[PICTURE_PART_ROLES['token-links'].picked][0], ROLE_NAMES.process);
  assert.equal(ROLE_FILL[PICTURE_PART_ROLES['token-links'].attended][0], ROLE_NAMES.outcome);
});
