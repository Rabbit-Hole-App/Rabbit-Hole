// BOX-1 (Reviewer order D), offline. (b) the learner's question lists five or more numbers and the card is a box plot: the box carries `values` equal to them, else the card is
// rejected (explanation_bad_numbers) with a message naming the learner's data. (c) a number written after "upper fence", "lower fence", "IQR", "median", "Q1" or "Q3" in the
// diagram caption or the prose equals the drawn statistic. The numbers are the R2 bench question: 3, 5, 6, 7, 8, 9, 11, 12, 40 gives Q1 5.5, median 8, Q3 11.5, fences -3.5 and 20.5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numbersIssue, explanationProblem, learnerDatasets } from '../src/learn-primitives.js';
import { fillTokens } from '../src/explanation-tokens.js';

const DATA = [3, 5, 6, 7, 8, 9, 11, 12, 40];
const QUESTION = 'Draw a box plot of the data 3, 5, 6, 7, 8, 9, 11, 12, 40 and show the outlier.';
const fence = spec => '```rh-diagram\n' + JSON.stringify(spec) + '\n```';
const box = (extra = {}, diagram = {}) => ({ version: 1, diagram: { kind: 'box-plot', title: 'Scores and the outlier', x: { label: 'Score', min: 0, max: 45 }, boxes: [{ label: 'Scores', whiskerLow: 3, q1: 5.5, median: 8, q3: 11.5, whiskerHigh: 12, ...extra }], ...diagram } });
const card = (text, spec) => ({ title: 'Box plot', body: `${text}\n\n${fence(spec)}\n\nA closing sentence that states nothing numeric.` });

test('(b) learnerDatasets reads a run of five or more numbers; thousands, short lists and prose numbers are not data', () => {
  assert.deepEqual(learnerDatasets(QUESTION), [DATA]);
  assert.deepEqual(learnerDatasets('Scores: 3; 5; 6; 7; 8 and 9.'), [[3, 5, 6, 7, 8, 9]]);
  assert.deepEqual(learnerDatasets('data 2.5, -1, 4, 7.25, 9 then B: 1, 2, 3, 4, 5, 6'), [[2.5, -1, 4, 7.25, 9], [1, 2, 3, 4, 5, 6]]);
  assert.deepEqual(learnerDatasets('Draw a box plot of 3, 5, 6, 7'), [], 'four numbers');
  assert.deepEqual(learnerDatasets('Revenue was 1,000, 2,000, 3,000, 4,000, 5,000 dollars'), [], 'thousands');
  assert.deepEqual(learnerDatasets('In 2024 I took 3 courses over 5 years'), []);
  assert.deepEqual(learnerDatasets(''), []);
});

test('(b) a box plot with no values for a question that lists the data is rejected, naming the learner\'s data', () => {
  const issue = numbersIssue(card('The five-number summary of the scores.', box()), QUESTION);
  assert.match(issue.problem, /^explanation_bad_numbers: the card states wrong numbers \(the box-plot "Scores and the outlier" must carry the learner's data: the question lists \(3, 5, 6, 7, 8, 9, 11, 12, 40\), so give the box "Scores" values equal to those numbers /);
  assert.deepEqual(issue.kinds, ['box-plot']);
  assert.match(explanationProblem(card('The five-number summary of the scores.', box()), 'standard', QUESTION), /explanation_bad_numbers: .*learner's data/);
  assert.equal(numbersIssue(card('The five-number summary of the scores.', box())), null, 'no question: nothing to compare');
});

test('(b) the right values pass (in any order); different values are rejected naming both lists; the arithmetic rule of (a) still runs on the statistics', () => {
  assert.equal(numbersIssue(card('The summary.', box({ values: DATA })), QUESTION), null);
  assert.equal(numbersIssue(card('The summary.', box({ values: [...DATA].reverse() })), QUESTION), null);
  const other = numbersIssue(card('The summary.', box({ values: [3, 5, 6, 7, 8, 9, 11, 12, 13], whiskerHigh: 13 })), QUESTION);
  assert.match(other.problem, /holds values \(3, 5, 6, 7, 8, 9, 11, 12, 13\), but the learner's data is \(3, 5, 6, 7, 8, 9, 11, 12, 40\): set the values of the box that shows it to exactly those numbers/);
  const wrong = numbersIssue(card('The summary.', box({ values: DATA, median: 8.5, q3: 10.5 })), QUESTION);
  assert.match(wrong.problem, /its 9 values give median 8 \(not 8.5\), Q3 11.5 \(not 10.5\)/);
});

test('(b) two datasets and two boxes: each list must be the values of a box; a card with fewer than five numbers in the question is not checked', () => {
  const A = [10, 12, 13, 15, 18, 21], B = [30, 33, 35, 38, 41, 44], q = `Compare group A: ${A.join(', ')} with group B: ${B.join(', ')} using box plots.`;
  const two = (a, b) => box({}, { x: { label: 'Score', min: 0, max: 70 }, boxes: [
    { label: 'A', values: a, whiskerLow: 10, q1: 12, median: 14, q3: 18, whiskerHigh: 21 },
    { label: 'B', values: b, whiskerLow: 30, q1: 33, median: 36.5, q3: 41, whiskerHigh: 44 }] });
  assert.equal(numbersIssue(card('Two groups.', two(A, B)), q), null);
  assert.match(numbersIssue(card('Two groups.', two(A, [30, 33, 34, 39, 41, 44])), q).problem, /but the learner's data is \(30, 33, 35, 38, 41, 44\)/);
  assert.equal(numbersIssue(card('A summary.', box()), 'Draw a box plot with median 8, Q1 5.5 and Q3 11.5.'), null);
});

test('(b) a card that is not a box plot is not read against the question\'s numbers', () => {
  const bars = { version: 1, diagram: { kind: 'bar-chart', title: 'Scores', unit: 'value', bars: DATA.map((value, i) => ({ label: `S${i + 1}`, value })) } };
  assert.equal(numbersIssue(card('The bars.', bars), QUESTION), null);
});

// ---- (c) numbers written next to a statistic's name ----
const withText = (text, extra = {}, diagram = {}) => card(text, box({ values: DATA, ...extra }, diagram));
const says = (text, diagram) => numbersIssue(withText(text, {}, diagram), QUESTION);

test('(c) the bench captions: "upper fence at 19" and "IQR 4.5" against the drawn 20.5 and 6 are rejected with the drawn numbers; the right ones pass', () => {
  const wrong = numbersIssue(withText('The upper fence is 19, so 40 is an outlier.'), QUESTION);
  assert.match(wrong.problem, /the text states "upper fence 19" but the box-plot "Scores and the outlier" draws a upper fence of 20\.5: state the drawn number/);
  assert.deepEqual(wrong.kinds, ['box-plot']);
  assert.match(says('The IQR is 4.5.').problem, /"IQR 4\.5" .* draws an IQR of 6:/);
  assert.match(says('The median is 8.5 and Q3 = 10.5.').problem, /"median 8\.5".*"Q3 10\.5"/);
  for (const text of ['The upper fence is 20.5 and the lower fence -3.5.', 'IQR = 6, median 8, Q1 = 5.5, Q3: 11.5.', 'Here $Q_1 = 5.5$, $\text{IQR} = 6$ and the median of the data is 8.', 'The upper fence sits at 21.'])
    assert.equal(says(text), null, text);
});

test('(c) the caption of the diagram is read too', () => {
  assert.match(numbersIssue(card('A summary.', box({ values: DATA }, { caption: 'Upper fence at 19 flags 40.' })), QUESTION).problem, /"Upper fence 19"/);
  assert.equal(numbersIssue(card('A summary.', box({ values: DATA }, { caption: 'Upper fence at 20.5 flags 40.' })), QUESTION), null);
});

test('(c) half a unit of the decimals written: 21 for 20.5 and 6 for 5.5 pass, 5.6 and 5.7 do not', () => {
  assert.equal(says('The upper fence is 21.'), null);
  assert.equal(says('Q1 is 6.'), null);
  assert.match(says('Q1 is 5.6.').problem, /"Q1 5.6"/);
  assert.match(says('Q1 is 5.7.').problem, /"Q1 5\.7"/);
});

test('(c) operands, a following word and equations are not read as the statistic', () => {
  for (const text of ['The IQR is Q3 - Q1 = 11.5 - 5.5 = 6.', 'So 1.5 x IQR = 9 and the fence is Q3 + 9 = 20.5.', 'The median of 9 values is 8.', 'The median of 9 values, 3 to 40, is 8.', 'Q1 and Q3 are the medians of the halves.', 'The median is robust: 3 is not the median.', 'IQR 6 points wide.', 'A fence is Q3 + 1.5 x IQR.'])
    assert.equal(says(text), null, text);
});

test('(c) with two boxes a number may name any box; a number that matches none is named with each box\'s value', () => {
  const x = { x: { label: 'Score', min: 0, max: 70 }, boxes: [
    { label: 'A', values: [10, 12, 13, 15, 18, 21], whiskerLow: 10, q1: 12, median: 14, q3: 18, whiskerHigh: 21 },
    { label: 'B', values: [30, 33, 35, 38, 41, 44], whiskerLow: 30, q1: 33, median: 36.5, q3: 41, whiskerHigh: 44 }] };
  const two = text => numbersIssue(card(text, { version: 1, diagram: { kind: 'box-plot', title: 'Two groups', ...x } }), 'Compare 10, 12, 13, 15, 18, 21 with 30, 33, 35, 38, 41, 44.');
  assert.equal(two('Group A has median 14 and group B has median 36.5.'), null);
  assert.match(two('The median is 20.').problem, /"median 20" .* a median of 14 \(A\), 36\.5 \(B\)/);
});

test('(c) a card with no box plot is not read; IQR is a derived path a prose token can name', () => {
  const token = fillTokens(card('The IQR is {{d:boxes.0.iqr}} and Q3 is {{d:boxes.0.q3}}.', box({ values: DATA })));
  assert.equal(token.problem, null);
  assert.match(token.block.body, /^The IQR is 6 and Q3 is 11.5./);
  const bars = { version: 1, diagram: { kind: 'bar-chart', title: 'Scores', unit: 'value', bars: DATA.map((value, i) => ({ label: `S${i + 1}`, value })) } };
  assert.equal(numbersIssue(card('The median is 99 and the IQR is 77.', bars), ''), null);
});

test('(c) the saved bench cards\' own typography: a non-breaking hyphen, a middle dot, "minus" and a glued sign never make an operand the statistic', () => {
  for (const text of ['The IQR is Q3‑Q1 = 17.5 - 11.5.', 'The fences are Q1‑1.5·IQR (‑3.5) and Q3+1.5·IQR (20.5).', 'Q1-1.5×IQR = -3.5 and Q3+1.5×IQR = 20.5.', 'IQR is 11.5 minus 5.5, giving 6.', 'The IQR is 6; 1.5·IQR = 9.'])
    assert.equal(says(text), null, text);
});
