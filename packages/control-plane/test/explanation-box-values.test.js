// BOX-1 (Reviewer's revision), offline. (b) the learner's data is read BY CODE: one list in the question and a box plot with one box set that box's `values` before anything is filled; the statistics
// (derived.js) are then written over what the author typed, never rejected; several lists or boxes are counted, not filled and not rejected. (c) a number written after "upper fence", "lower fence",
// "IQR", "median", "Q1"/"first or lower quartile", "Q3"/"third or upper quartile" in the diagram caption or the prose must equal the drawn statistic: ONE message names every wrong statement and gives
// the full drawn set. The numbers are the R2 bench question: 3, 5, 6, 7, 8, 9, 11, 12, 40 gives Q1 5.5, median 8, Q3 11.5, fences -3.5 and 20.5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numbersIssue, explanationProblem, learnerDatasets, boxValuesFromQuestion, boxFieldsChanged, boxTextIssues } from '../src/learn-primitives.js';
import { fillTokens } from '../src/explanation-tokens.js';
import { generateArtifact } from '../src/learn-artifact.js';

const DATA = [3, 5, 6, 7, 8, 9, 11, 12, 40];
const QUESTION = 'Draw a box plot of the data 3, 5, 6, 7, 8, 9, 11, 12, 40 and show the outlier.';
const fence = spec => '```rh-diagram\n' + JSON.stringify(spec) + '\n```';
const box = (extra = {}, diagram = {}) => ({ version: 1, diagram: { kind: 'box-plot', title: 'Scores and the outlier', x: { label: 'Score', min: 0, max: 45 }, boxes: [{ label: 'Scores', whiskerLow: 3, q1: 5.5, median: 8, q3: 11.5, whiskerHigh: 12, ...extra }], ...diagram } });
const card = (text, spec) => ({ title: 'Box plot', body: `${text}\n\n${fence(spec)}\n\nA closing sentence that states nothing numeric.` });
const diagramOf = md => JSON.parse(/```rh-diagram\n([\s\S]*?)\n```/.exec(md)[1]).diagram;

test('(b) learnerDatasets reads a run of five or more numbers; thousands, short lists and prose numbers are not data', () => {
  assert.deepEqual(learnerDatasets(QUESTION), [DATA]);
  assert.deepEqual(learnerDatasets('Scores: 3; 5; 6; 7; 8 and 9.'), [[3, 5, 6, 7, 8, 9]]);
  assert.deepEqual(learnerDatasets('data 2.5, -1, 4, 7.25, 9 then B: 1, 2, 3, 4, 5, 6'), [[2.5, -1, 4, 7.25, 9], [1, 2, 3, 4, 5, 6]]);
  assert.deepEqual(learnerDatasets('Draw a box plot of 3, 5, 6, 7'), [], 'four numbers');
  assert.deepEqual(learnerDatasets('Revenue was 1,000, 2,000, 3,000, 4,000, 5,000 dollars'), [], 'thousands');
  assert.deepEqual(learnerDatasets('In 2024 I took 3 courses over 5 years'), []);
  assert.deepEqual(learnerDatasets(''), []);
});

test('(b) one list and one box: the box gets the list as its values, replacing values the author wrote that differ; nothing else is touched', () => {
  const none = boxValuesFromQuestion(card('Summary.', box()).body, QUESTION);
  assert.equal(none.count, 1);
  assert.deepEqual(diagramOf(none.md).boxes[0].values, DATA);
  const wrong = boxValuesFromQuestion(card('Summary.', box({ values: [3, 5, 6, 7, 8, 9, 11, 12, 13] })).body, QUESTION);
  assert.equal(wrong.count, 1);
  assert.deepEqual(diagramOf(wrong.md).boxes[0].values, DATA);
  const same = card('Summary.', box({ values: DATA })).body;
  assert.deepEqual(boxValuesFromQuestion(same, QUESTION), { md: same, count: 0, unmatched: [] }, 'the same list: unchanged');
  const bars = card('Bars.', { version: 1, diagram: { kind: 'bar-chart', title: 'Scores', unit: 'value', bars: DATA.map((value, i) => ({ label: `S${i + 1}`, value })) } }).body;
  assert.deepEqual(boxValuesFromQuestion(bars, QUESTION), { md: bars, count: 0, unmatched: [] }, 'not a box plot');
  const plain = card('Summary.', box()).body;
  assert.equal(boxValuesFromQuestion(plain, 'Draw a box plot with median 8, Q1 5.5 and Q3 11.5.').md, plain, 'no list in the question');
});

test('(b) several lists or several boxes: nothing is filled and nothing is rejected, the counts are recorded; a box the author gave values keeps them', () => {
  const A = [10, 12, 13, 15, 18, 21], B = [30, 33, 35, 38, 41, 44], q = `Compare group A: ${A.join(', ')} with group B: ${B.join(', ')} using box plots.`;
  const two = (a, b) => box({}, { x: { label: 'Score', min: 0, max: 70 }, boxes: [{ label: 'A', ...(a ? { values: a } : {}), whiskerLow: 10, q1: 12, median: 14, q3: 18, whiskerHigh: 21 }, { label: 'B', ...(b ? { values: b } : {}), whiskerLow: 30, q1: 33, median: 36.5, q3: 41, whiskerHigh: 44 }] });
  const body = card('Two groups.', two(A, [1, 2, 3, 4, 5])).body, got = boxValuesFromQuestion(body, q);
  assert.equal(got.md, body);
  assert.deepEqual(got.unmatched, [{ lists: 2, boxes: 2, withoutValues: 0, listsMatched: 1 }]);
  assert.deepEqual(boxValuesFromQuestion(card('Two groups.', two()).body, q).unmatched, [{ lists: 2, boxes: 2, withoutValues: 2, listsMatched: 0 }]);
  assert.deepEqual(boxValuesFromQuestion(card('One group.', two()).body, QUESTION).unmatched, [{ lists: 1, boxes: 2, withoutValues: 2, listsMatched: 0 }], 'one list, two boxes');
  assert.equal(numbersIssue(card('Two groups.', two(A, [1, 2, 3, 4, 5]))), null, 'no rejection either');
});

test('(2) boxFieldsChanged names the typed statistics the code replaces', () => {
  assert.deepEqual(boxFieldsChanged(card('S.', box({ values: DATA })).body), [{ box: 'Scores', fields: ['outliers'] }], 'the typed statistics are right; the outlier 40 is filled');
  assert.deepEqual(boxFieldsChanged(card('S.', box({ values: DATA, outliers: [{ label: 'x', value: 40 }] })).body), []);
  assert.deepEqual(boxFieldsChanged(card('S.', box({ values: DATA, median: 8.5, q3: 10.5, fences: { lower: -2, upper: 18 }, outliers: [{ label: 'x', value: 12 }] })).body), [{ box: 'Scores', fields: ['median', 'q3', 'fences', 'outliers'] }]);
  assert.deepEqual(boxFieldsChanged(card('S.', box()).body), [], 'no values: not a valued box');
});

test('(c) the bench captions: "upper fence at 19" and "IQR 4.5" against the drawn numbers are ONE message that names both and gives the full drawn set', () => {
  const issue = numbersIssue(card('The upper fence is 19, so 40 is an outlier.', box({ values: DATA }, { caption: 'IQR is 4.5.' })));
  assert.equal(issue.problem, 'explanation_bad_numbers: the card states wrong numbers (the text states "IQR 4.5", "upper fence 19" but the box-plot "Scores and the outlier" draws Q1 5.5, median 8, Q3 11.5, IQR 6, lower fence -3.5, upper fence 20.5: write these drawn numbers, or change the box and every sentence that states it)');
  assert.deepEqual(issue.kinds, ['box-plot']);
  assert.match(explanationProblem(card('The median is 8.5 and Q3 = 10.5.', box({ values: DATA }))), /"median 8\.5", "Q3 10\.5" but the box-plot/);
  for (const text of ['The upper fence is 20.5 and the lower fence -3.5.', 'IQR = 6, median 8, Q1 = 5.5, Q3: 11.5.', 'Here $Q_1 = 5.5$, $\\text{IQR} = 6$ and the median of the data is 8.', 'The upper fence sits at 21.'])
    assert.equal(numbersIssue(card(text, box({ values: DATA }))), null, text);
});

test('(c) first / lower quartile read as Q1 and third / upper quartile as Q3', () => {
  const says = text => numbersIssue(card(text, box({ values: DATA })));
  assert.match(says('The first quartile is 7 and the upper quartile is 10.').problem, /"first quartile 7", "upper quartile 10" but the box-plot/);
  assert.match(says('The lower quartile 5.7 and the third quartile 11.').problem, /"lower quartile 5\.7" but/);
  assert.equal(says('The first quartile is 5.5, the lower quartile 5.5, the third quartile 11.5 and the upper quartile is 11.5.'), null);
});

test('(c) the message is truncate-safe: every wrong statement, then the full drawn set once, whole inside the repair problem even with other numbers problems after it', () => {
  const text = 'The IQR is 5, the median is 9, Q1 is 4, Q3 is 13, the upper fence is 19 and the lower fence is 1.';
  const issue = numbersIssue(card(`${text} Also 2 + 2 = 5.`, box({ values: DATA })));
  assert.ok(issue.problem.includes('draws Q1 5.5, median 8, Q3 11.5, IQR 6, lower fence -3.5, upper fence 20.5: write these drawn numbers'), issue.problem);
  assert.match(issue.problem, /"IQR 5", "median 9", "Q1 4", "Q3 13" and 2 more but the box-plot/);
  const four = { x: { label: 'Score', min: 0, max: 70 }, boxes: [
    { label: 'Group A with a long name', values: [10, 12, 13, 15, 18, 21], whiskerLow: 10, q1: 12, median: 14, q3: 18, whiskerHigh: 21 },
    { label: 'Group B', values: [30, 33, 35, 38, 41, 44], whiskerLow: 30, q1: 33, median: 36.5, q3: 41, whiskerHigh: 44 },
    { label: 'Group C', values: [20, 22, 23, 25, 28, 31], whiskerLow: 20, q1: 22, median: 24, q3: 28, whiskerHigh: 31 },
    { label: 'Group D', values: [40, 42, 43, 45, 48, 51], whiskerLow: 40, q1: 42, median: 44, q3: 48, whiskerHigh: 51 }] };
  const many = numbersIssue(card('The median is 99, the IQR is 77, Q1 is 1, Q3 is 2, 2 + 2 = 5.', { version: 1, diagram: { kind: 'box-plot', title: 'Four groups', ...four } }));
  assert.ok(many.problem.includes('Group D: Q1 42, median 44, Q3 48, IQR 6, lower fence 33, upper fence 57'), 'the last box of four is not cut: ' + many.problem);
  assert.ok(many.problem.includes('2 + 2 = 5'), 'the other message follows, cut on its own');
});

test('(c) operands, a following word and equations are not read as the statistic; the typography of the saved bench cards neither', () => {
  const says = text => numbersIssue(card(text, box({ values: DATA })));
  for (const text of ['The IQR is Q3 - Q1 = 11.5 - 5.5 = 6.', 'So 1.5 x IQR = 9 and the fence is Q3 + 9 = 20.5.', 'The median of 9 values is 8.', 'The median of 9 values, 3 to 40, is 8.', 'Q1 and Q3 are the medians of the halves.',
    'The median is robust: 3 is not the median.', 'IQR 6 points wide.', 'A fence is Q3 + 1.5 x IQR.', 'The IQR is Q3‑Q1 = 17.5 - 11.5.', 'The fences are Q1‑1.5·IQR (‑3.5) and Q3+1.5·IQR (20.5).',
    'Q1-1.5×IQR = -3.5 and Q3+1.5×IQR = 20.5.', 'IQR is 11.5 minus 5.5, giving 6.', 'The IQR is 6; 1.5·IQR = 9.'])
    assert.equal(says(text), null, text);
});

test('(c) half a unit of the decimals written; with two boxes a number may name any box; a card with no box plot is not read; IQR is a derived path a token can name', () => {
  const says = text => numbersIssue(card(text, box({ values: DATA })));
  assert.equal(says('The upper fence is 21.'), null);
  assert.equal(says('Q1 is 6.'), null);
  assert.match(says('Q1 is 5.6.').problem, /"Q1 5\.6"/);
  assert.equal(numbersIssue(card('A summary.', box({ values: DATA }, { caption: 'Upper fence at 20.5 flags 40.' }))), null);
  assert.match(numbersIssue(card('A summary.', box({ values: DATA }, { caption: 'Upper fence at 19 flags 40.' }))).problem, /"Upper fence 19"/);
  const x = { x: { label: 'Score', min: 0, max: 70 }, boxes: [{ label: 'A', values: [10, 12, 13, 15, 18, 21], whiskerLow: 10, q1: 12, median: 14, q3: 18, whiskerHigh: 21 }, { label: 'B', values: [30, 33, 35, 38, 41, 44], whiskerLow: 30, q1: 33, median: 36.5, q3: 41, whiskerHigh: 44 }] };
  const two = text => numbersIssue(card(text, { version: 1, diagram: { kind: 'box-plot', title: 'Two groups', ...x } }));
  assert.equal(two('Group A has median 14 and group B has median 36.5.'), null);
  assert.match(two('The median is 20.').problem, /"median 20" but the box-plot "Two groups" draws A: Q1 12, median 14, Q3 18, IQR 6, lower fence 3, upper fence 27; B: Q1 33/);
  const bars = { version: 1, diagram: { kind: 'bar-chart', title: 'Scores', unit: 'value', bars: DATA.map((value, i) => ({ label: `S${i + 1}`, value })) } };
  assert.equal(numbersIssue(card('The median is 99 and the IQR is 77.', bars)), null);
  const token = fillTokens(card('The IQR is {{d:boxes.0.iqr}} and Q3 is {{d:boxes.0.q3}}.', box({ values: DATA })));
  assert.equal(token.problem, null);
  assert.match(token.block.body, /^The IQR is 6 and Q3 is 11\.5\./);
});

test('(c) the one message of a one-box card fits the 480-character cut that applies to the other messages (measured)', () => {
  const [one] = boxTextIssues([{ title: 'A title that is long enough to be cut at forty characters', boxes: [{ label: 'Scores', q1: 5.5, median: 8, q3: 11.5, whiskerLow: 3, whiskerHigh: 12, fences: { lower: -3.5, upper: 20.5 } }] }], ['IQR 4, IQR 5, median 9, Q1 4, Q3 12, upper fence 19, lower fence 1.']);
  assert.ok(one.length < 480, String(one.length));
});

// ---- the whole route: a card whose box plot has no values and wrong statistics is delivered with the computed ones ----
const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x' };
const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };
const model = input => async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c', name: 'make_explanation', input }] });

test('the route: no values and wrong typed statistics come out with the learner\'s values and the computed statistics; the trace says what was set and changed', async () => {
  const wrong = box({ median: 8.5, q3: 10.5, whiskerLow: 3, whiskerHigh: 40, fences: { lower: -2, upper: 18 }, outliers: [{ label: 'Spike', value: 12 }] });
  const cardIn = card('A box plot of the scores shows the middle half of the data as a box, with whiskers to the most extreme values that are not outliers.', wrong);
  const trace = {};
  const out = await quiet(() => generateArtifact(FAST, { command: 'explanation', args: QUESTION, planned: true, plan: null }, { callModel: model(cardIn), repairs: 1, trace }));
  assert.equal(out.result, 'artifact', JSON.stringify(out).slice(0, 400));
  const d = diagramOf(out.block.body);
  assert.deepEqual(d.boxes[0].values, DATA);
  assert.deepEqual([d.boxes[0].q1, d.boxes[0].median, d.boxes[0].q3, d.boxes[0].whiskerLow, d.boxes[0].whiskerHigh], [5.5, 8, 11.5, 3, 12]);
  assert.equal(out.block.diagramCorrections.box_values_from_question, 1);
  assert.equal(trace.box_values_from_question, 1);
  assert.deepEqual(trace.box_values_unmatched, []);
  assert.deepEqual(trace.box_fields_changed, [{ box: 'Scores', fields: ['median', 'q3', 'whiskerHigh', 'fences', 'outliers'] }]);
});

test('the route: two lists in the question fill nothing and reject nothing; the trace counts them', async () => {
  const q = 'Compare 10, 12, 13, 15, 18, 21 with 30, 33, 35, 38, 41, 44 in box plots.';
  const spec = box({}, { title: 'Two groups compared in box plots', x: { label: 'Score', min: 0, max: 70 }, boxes: [{ label: 'A', whiskerLow: 10, q1: 12, median: 14, q3: 18, whiskerHigh: 21 }] });
  const trace = {};
  const out = await quiet(() => generateArtifact(FAST, { command: 'explanation', args: q, planned: true, plan: null }, { callModel: model(card('Two groups compared in box plots: each group is a box for its middle half, with whiskers to the most extreme values.', spec)), repairs: 1, trace }));
  assert.equal(out.result, 'artifact', JSON.stringify(out).slice(0, 400));
  assert.equal(diagramOf(out.block.body).boxes[0].values, undefined);
  assert.deepEqual(trace.box_values_unmatched, [{ lists: 2, boxes: 1, withoutValues: 1, listsMatched: 0 }]);
  assert.equal(trace.box_values_from_question, 0);
});

test('(c) a unit after the number is part of the statistic: "IQR is 14.5 ms" and "upper fence at 122.75 ms" are read (the v2 bench captions); copulas and prepositions between term and number', () => {
  const resp = [80, 85, 90, 92, 95, 99, 104, 110, 300], x = { x: { label: 'Time', min: 0, max: 320 } };
  const says = (text, caption) => numbersIssue(card(text, box({ values: resp }, { ...x, ...(caption ? { caption } : {}) })));
  const bad = says('A plain sentence.', 'IQR is 14.5 ms. The upper fence at 122.75 ms marks off the 300 ms response time as an outlier.');
  assert.match(bad.problem, /"IQR 14\.5", "upper fence 122\.75" but the box-plot "Scores and the outlier" draws Q1 87\.5, median 95, Q3 107, IQR 19\.5, lower fence 58\.25, upper fence 136\.25/);
  assert.match(says('The IQR is 14 ms. The upper fence is 120 ms, making 300 ms an outlier.').problem, /"IQR 14", "upper fence 120"/);
  assert.match(says('The IQR of 6 minutes and the median = 8, the median: 9.').problem, /"IQR 6", "median 8", "median 9"/);
  assert.equal(says('The IQR is 19.5 ms. The upper fence at 136.25 ms marks off 300 ms. The lower fence equals 58.25 ms; the median is 95 ms.'), null);
  assert.equal(says('The median of 9 values is 95 ms and the IQR of 19.5 ms is Q3 - Q1 = 107 - 87.5 = 19.5.'), null, 'a count of values and an equation are still skipped');
});

// ---- v4 (1): "<term> is <expression> = <result>" compares the result ----
const resp = [80, 85, 90, 92, 95, 99, 104, 110, 300], respX = { x: { label: 'Time', min: 0, max: 320 } };
const saysResp = (text, caption) => numbersIssue(card(text, box({ values: resp }, { ...respX, ...(caption ? { caption } : {}) })));

test('(c) v4-1: the result of "<term> is a - b = c" is compared with the drawn statistic; the operands stay skipped (the v3 idx 15 caption)', () => {
  const bad = saysResp('A plain sentence.', 'IQR is $104 - 90 = 14$. The upper fence is $104 + 1.5 \\times 14 = 125$. The value 300 ms is an outlier.');
  assert.match(bad.problem, /"IQR 14", "upper fence 125" but the box-plot "Scores and the outlier" draws Q1 87\.5, median 95, Q3 107, IQR 19\.5, lower fence 58\.25, upper fence 136\.25/);
  assert.equal(saysResp('IQR is 107 - 87.5 = 19.5. The upper fence is 107 + 1.5 x 19.5 = 136.25. The lower fence is 87.5 - 1.5 x 19.5 = 58.25.'), null, 'correct results pass');
  assert.equal(saysResp('We take Q3 - Q1 = 107 - 87.5 = 19.5, then 1.5 x IQR = 29.25 and the fence is Q3 + 29.25 = 136.25.'), null, 'operands and equations without a term-first number stay skipped');
  assert.match(saysResp('The median is 95 - 3 = 92.').problem, /"median 92"/);
});

// ---- v4 (2): more connectors ----
test('(c) v4-2: "lands at", "comes to", "works out to" (and "sits at") connect a term to its number (the v3 idx 15 prose)', () => {
  assert.match(saysResp('Here, the upper fence lands at 125 milliseconds, so the 300 millisecond time sits far past it.').problem, /"upper fence 125"/);
  assert.match(saysResp('The IQR comes to 14 and the median works out to 90.').problem, /"IQR 14", "median 90"/);
  assert.match(saysResp('The lower fence sits at 60.').problem, /"lower fence 60"/);
  assert.equal(saysResp('The upper fence lands at 136.25 milliseconds. The IQR comes to 19.5 and the median works out to 95.'), null);
});

// ---- v4 (3): number words ----
test('(c) v4-3: number words are read as numbers before the scan (hyphenated, spaced, "point" decimals); a lone "one" and hundreds are left alone', () => {
  assert.match(saysResp('The median is ninety and the upper fence is one hundred and twenty.').problem, /"median 90"/);
  assert.doesNotMatch(saysResp('The median is ninety and the upper fence is one hundred and twenty.').problem, /"upper fence /, 'hundreds are not read');
  assert.equal(saysResp('The IQR is nineteen point five, the lower fence is fifty-eight point two five and the upper fence is one hundred and thirty-six.'), null, 'right in words, hundreds unread');
  assert.equal(saysResp('The IQR is nineteen point five and the lower fence is fifty-eight point two five. The median is ninety five.'), null, 'right numbers in words pass (ninety five = 95)');
  assert.match(saysResp('The median is twenty four.').problem, /"median 24"/);
  assert.equal(saysResp('The median is one of the values and one box shows it.'), null, 'a lone "one" is a pronoun');
});

// ---- v4 (4): "the box ... from A to B" ----
test('(c) v4-4: "the box" / "the middle half" followed by "from A to B" or "between A and B" is compared with Q1 and Q3 of one drawn box (the v3 idx 9 caption)', () => {
  const delivery = [12, 15, 17, 18, 20, 22, 24, 25, 60]; // Q1 16, median 20, Q3 24.5
  const says = text => numbersIssue(card('A plain sentence.', box({ values: delivery }, { x: { label: 'Minutes', min: 0, max: 70 }, caption: text })));
  const bad = says('The box covers the middle half of times, from seventeen to twenty-four minutes, with an outlier at sixty.');
  assert.match(bad.problem, /"box from 17 to 24" but the box-plot "Scores and the outlier" draws Q1 16, median 20, Q3 24\.5, IQR 8\.5, lower fence 3\.25, upper fence 37\.25/);
  assert.equal(says('The box covers the middle half of times, from sixteen to twenty-four point five minutes, with an outlier at sixty.'), null);
  assert.equal(says('The box spans from 16 to 24.5 minutes, with the median at 20 minutes.'), null);
  assert.equal(says('The middle half of the data lies between 16 and 24.5.'), null);
  assert.match(says('The middle half of the data lies between 16 and 26.').problem, /"box from 16 to 26"/);
  assert.equal(says('The whiskers run from 12 to 25, and delivery times range from 12 to 60 minutes.'), null, 'only "the box" and "the middle half" are read');
  assert.equal(says('The box shows the median and the box edges mark the first quartile at 16.'), null);
});

test('(c) v4-4: "the box plot shows values from A to B" is the data range, not the box (the v1 idx 10 caption)', () => {
  const sal = [30, 32, 35, 38, 40, 45, 48, 52, 150];
  const says = text => numbersIssue(card('A plain sentence.', box({ values: sal }, { x: { label: 'Salary', min: 0, max: 160 }, caption: text })));
  assert.equal(says('The box plot shows values from 30 to 150 with an outlier.'), null);
  assert.equal(says('The box-and-whisker plot runs from 30 to 150.'), null);
  assert.match(says('The box spans from 30 to 150.').problem, /"box from 30 to 150"/);
});
