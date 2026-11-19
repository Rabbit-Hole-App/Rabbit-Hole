// NUM-2 (Reviewer 2026-11-18, VAR-1 bench): two more numbers recomputed by code, arithmetic-tagged like the 154 box-plot rule: (1) a prose equation "a op b ... = c" whose left side is
// only numbers and operators, (2) bars whose own title or caption calls them a distribution, probabilities, softmax or normalised and whose values do not sum to 1.
// Fixtures: the bench cards (var-1 bench items 222 and 297: "0.5 x 0.8 + 0.5 x (-0.5) = 0.34"; item 1032: softmax bars 0.63, 0.23, 0.09). Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numbersIssue, explanationProblem, proseArithmetic, distributionBarIssues } from '../src/learn-primitives.js';
import { generateArtifact } from '../src/learn-artifact.js';

const fence = spec => '```rh-diagram\n' + JSON.stringify(spec) + '\n```';
const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };
const model = card => async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c', name: 'make_explanation', input: card }] });
const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x' };
const bars = (title, values, extra = {}) => ({ version: 1, diagram: { kind: 'bar-chart', title, unit: 'value', bars: values.map((value, i) => ({ label: `Class ${i + 1}`, value })), ...extra } });
const card = (text, spec) => ({ title: 'Numbers', body: `${text}\n\n${spec ? fence(spec) + '\n\n' : ''}A closing sentence that states nothing numeric.` });

test('the bench card: "0.5 x 0.8 + 0.5 x (-0.5) = 0.34" computes to 0.15 and fails with explanation_bad_numbers naming the computed number', () => {
  const body = 'For instance, the top-left cell: $0.5\\times0.8+0.5\\times(-0.5)=0.34$.';
  const flags = proseArithmetic(body);
  assert.deepEqual(flags.map(f => [f.stated, +f.computed.toFixed(6)]), [[0.34, 0.15]]);
  const issue = numbersIssue({ body });
  assert.match(issue.problem, /^explanation_bad_numbers: the card states wrong numbers \(the text states ".*= 0\.34" but the left side computes to 0\.15: /);
  assert.deepEqual([issue.kind, issue.kinds], [null, []]);
  assert.match(explanationProblem({ title: 'T', body }), /explanation_bad_numbers: /);
});

test('equations that are right, rounded, or not a plain recompute are never flagged', () => {
  const quiet_ = [
    'The upper fence is $11.5 + 1.5(6) = 20.5$.', 'So 3 x 4 = 12 here.', 'About 1/3 = 0.33 of the time.', 'Then $2/3 = 0.67$.', 'We get 0.5 * 0.8 + 0.5 * -0.5 = 0.15.',
    'The sum is 3 + 4 = 7 items.', 'Here $\\mathrm{IQR} = Q_3 - Q_1 = 16.5$.', 'With $x + 2 = 5$ we solve for x.', 'For n - 2 * 3 = 4 the name n stays.', 'It costs 1,234 + 2 = 1,236 dollars.',
    'Growth is $2^3 + 1 = 9$.', 'Half of 50% + 20% = 45% of the total.', 'A rate $4 \\times 25 = 100\\%$ of the target.', 'A date 2026-11-18 = today.', 'Set $\\alpha = 0.5$ and $x_{t+1} = 0.5 + 0.2$.',
  ];
  for (const text of quiet_) assert.deepEqual(proseArithmetic(text), [], text);
});

test('tolerance is one full unit of the written decimals when the computed value has more digits (a truncated result passes), half a unit when it fits exactly', () => {
  for (const ok of ['So 7/9 = 0.77 of them.', 'About 1/3 = 0.33.', 'Then $0.755 + 0 = 0.76$.', 'The share is 2/3 = 0.66 here.']) assert.deepEqual(proseArithmetic(ok), [], ok); // 0.7778 vs 0.77, 0.3333 vs 0.33, 0.755 vs 0.76 (half a unit), 0.6667 vs 0.66 (truncated)
  for (const bad of ['So 7/9 = 0.75 of them.', 'Then $0.755 + 0 = 0.77$.', 'We get 0.5 * 0.8 + 0.5 * -0.5 = 0.34.', 'So 2 + 2 = 5 here.']) assert.equal(proseArithmetic(bad).length, 1, bad); // 0.7778 vs 0.75 (2.8 units), 0.755 vs 0.77 (1.5 units), 0.15 vs 0.34, an exact value keeps half a unit
});

test('a wrong equation in plain text and in a chain is found; each distinct equation once; the 154 cards stay clean', () => {
  assert.deepEqual(proseArithmetic('The lower fence is $6 - 5.25 = -0.25$ and the upper fence is $9.5 + 5.25 = 18.75$.').map(f => [f.stated, +f.computed.toFixed(4)]), [[-0.25, 0.75], [18.75, 14.75]]);
  assert.equal(proseArithmetic('Adding 104 + 24.75 = 130.25 ms, then again 104 + 24.75 = 130.25 ms.').length, 1);
  assert.equal(proseArithmetic('so 2 + 2 = 5 and so on').length, 1);
  assert.equal(numbersIssue({ body: 'Plain prose with 3 + 4 = 7 only.' }), null);
});

test('bars called a distribution must sum to 1 within half a unit per value; the bench softmax card (0.63, 0.23, 0.09) fails', () => {
  const bad = bars('Softmax probabilities at different temperatures', [0.63, 0.23, 0.09]);
  assert.deepEqual(distributionBarIssues(bad.diagram).map(b => [b.word, b.sum]), [['Softmax', 0.95]]);
  const issue = numbersIssue({ body: card('Look at the bars.', bad).body });
  assert.match(issue.problem, /^explanation_bad_numbers: the card states wrong numbers \(the bar-chart "Softmax probabilities at different temperatures" is called a Softmax but its values \(0\.63, 0\.23, 0\.09\) sum to 0\.95: /);
  assert.deepEqual([issue.kind, issue.kinds], ['bar-chart', ['bar-chart']]);
  assert.deepEqual(distributionBarIssues(bars('Class probabilities', [0.63, 0.23, 0.14]).diagram), [], 'sums to 1');
  assert.deepEqual(distributionBarIssues(bars('Class probabilities', [0.333, 0.333, 0.333]).diagram), [], 'half a unit per value: 0.999 is a rounding');
  assert.equal(distributionBarIssues(bars('Class probabilities', [0.6, 0.5, 0.2]).diagram).length, 1);
  assert.deepEqual(distributionBarIssues(bars('Class probabilities', [0.6, 0.3, 0.2]).diagram), [], 'one decimal, three values: 1.1 is within three half-units');
});

test('bars with no distribution wording, a per-bar rate, per-head weights, counts or a stacked chart are never flagged', () => {
  for (const title of ['Selection frequency across resamples', 'Proportion of resamples that chose each feature', 'Attention weights across different heads', 'Illustrative attention weight per head', 'Accuracy by model']) {
    assert.deepEqual(distributionBarIssues(bars(title, [0.92, 0.55, 0.18]).diagram), [], title);
  }
  assert.deepEqual(distributionBarIssues(bars('Probability distribution of counts', [12, 30, 8]).diagram), [], 'values outside 0..1 are not fractions');
  assert.deepEqual(distributionBarIssues(bars('Probability distribution', [0.9]).diagram), [], 'one bar');
  assert.deepEqual(distributionBarIssues(bars('Probability distribution', [0.9, 0.7], { variant: 'stacked' }).diagram), [], 'a stacked chart');
});

test('a grouped chart: each series called a distribution sums to 1; the first failing series is named', () => {
  const grouped = { kind: 'bar-chart', title: 'Softmax probabilities by temperature', variant: 'grouped', categories: ['A', 'B', 'C'], series: [{ label: 'T = 0.5', values: [0.6, 0.3, 0.1] }, { label: 'T = 2', values: [0.5, 0.4, 0.3] }] };
  assert.deepEqual(distributionBarIssues(grouped).map(b => [b.label, b.sum]), [['T = 2', 1.2]]);
});

test('end to end: a wrong prose equation is repaired once with the rewrite sentence, then the step fails; nothing is delivered with the wrong number', async () => {
  const picture = fence(bars('Noise added at each step', [3, 5]));
  const wrong = { title: 'Diffusion', body: 'Consider one step of adding noise.\n\n' + picture + '\n\nFor the top-left cell: $0.5\\times0.8+0.5\\times(-0.5)=0.34$.\n\nA closing sentence that states nothing numeric.' };
  const sent = [], recorded = async (e, b) => { sent.push(b); return model(wrong)(); };
  const out = await quiet(() => generateArtifact(FAST, { command: 'explanation', args: 'forward diffusion numbers', planned: true, plan: null }, { callModel: recorded, repairs: 1 }));
  assert.equal(out.result, 'validation_error');
  assert.match(out.error, /^explanation_bad_numbers: the card states wrong numbers \(.*computes to 0\.15/);
  assert.equal(out.block, undefined);
  assert.equal(sent.length >= 2, true, 'a repair was asked');
  assert.ok(sent.at(-1).messages.at(-1).content[0].content.includes('Rewrite every sentence that states these numbers.'));
  const right = { title: 'Diffusion', body: wrong.body.replace('=0.34', '=0.15') };
  const ok = await quiet(() => generateArtifact(FAST, { command: 'explanation', args: 'forward diffusion numbers', planned: true, plan: null }, { callModel: model(right), repairs: 1 }));
  assert.equal(ok.result, 'artifact');
});

test('a card with a wrong box-plot diagram and a wrong prose equation names both in one problem (the diagram first)', () => {
  const wrongBox = { version: 1, diagram: { kind: 'box-plot', title: 'Fences from the quartiles', x: { label: 'Reading', min: 0, max: 20 }, boxes: [{ label: 'Trial', whiskerLow: 4, q1: 6, median: 9, q3: 12, whiskerHigh: 14, fences: { lower: 2, upper: 16 } }] } };
  const issue = numbersIssue(card('So 2 + 2 = 5 in the text.', wrongBox));
  assert.match(issue.problem, /^explanation_bad_numbers: the rh-diagram spec states wrong numbers \(.*not 2 and 16\.\) explanation_bad_numbers: the card states wrong numbers \(the text states "2 \+ 2 = 5"/);
  assert.deepEqual(issue.kinds, ['box-plot']);
});
