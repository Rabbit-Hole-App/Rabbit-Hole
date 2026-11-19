// BOX-1 (Reviewer order D), offline. (b) the learner's question lists five or more numbers and the card is a box plot: the box carries `values` equal to them, else the card is
// rejected (explanation_bad_numbers) with a message naming the learner's data. (c) a number written after "upper fence", "lower fence", "IQR", "median", "Q1" or "Q3" in the
// diagram caption or the prose equals the drawn statistic. The numbers are the R2 bench question: 3, 5, 6, 7, 8, 9, 11, 12, 40 gives Q1 5.5, median 8, Q3 11.5, fences -3.5 and 20.5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numbersIssue, explanationProblem, learnerDatasets } from '../src/learn-primitives.js';

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
