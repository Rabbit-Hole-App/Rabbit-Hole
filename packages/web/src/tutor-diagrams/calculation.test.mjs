// The calculation module (calculation.js): reading inputs through a diagram's variables list, running the function, writing the results, filling {{v:name}} placeholders and finding a "?" left for a number.
// Offline: a small invented calculation on an invented diagram, so no stored reference is needed (the references are checked in calculation-declarations.test.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CalculationRefused, declareReference, declareSpec, fillDiagramText, fillVariableText, hasFunction, hasVariableToken, isDeclared, limitProblem,
  needsNoCalculation, readAt, runCalculation, specFromTemplate, unfilledNumbers,
} from './calculation.js';

const sum = list => list.reduce((total, item) => total + item, 0);
// Inputs: a (drawn at x), list (drawn: the y of every point), hidden (not drawn). Results: sum (drawn at total), dbl (not drawn).
const calculation = {
  variables: [
    { name: 'a', role: 'input', type: 'int', min: 1, max: 10, at: 'x' },
    { name: 'list', role: 'input', type: 'float', min: 0, max: 100, at: 'series.0.points.*.y' },
    { name: 'hidden', role: 'input', type: 'int', min: 1, max: 5, drawn: false },
    { name: 'sum', role: 'result', type: 'float', min: 0, max: 1000, at: 'total' },
    { name: 'dbl', role: 'result', type: 'float', min: 0, max: 1000, drawn: false },
  ],
  run({ a, list, hidden }) {
    if (hidden === 5) throw new CalculationRefused('five is refused');
    return { sum: a + sum(list), dbl: a * 2 };
  },
};
const variables = () => [
  { name: 'a', role: 'input', type: 'int', min: 1, max: 10, at: 'x' },
  { name: 'list', role: 'input', type: 'float', min: 0, max: 100, at: 'series.0.points.*.y' },
  { name: 'hidden', role: 'input', type: 'int', min: 1, max: 5, value: 2 },
  { name: 'sum', role: 'result', type: 'float', min: 0, max: 1000, at: 'total' },
  { name: 'dbl', role: 'result', type: 'float', min: 0, max: 1000, value: 0 },
];
const diagram = () => ({ kind: 'demo', title: 'Total {{v:sum}}', x: 3, total: 0, series: [{ label: 'S', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }] }], variables: variables() });
const withVariable = (name, change) => { const d = diagram(); d.variables = d.variables.map(v => (v.name === name ? { ...v, ...change } : v)); return d; };

test('readAt: keys, positions, a * over a list, and undefined where the path leads nowhere', () => {
  const d = diagram();
  assert.equal(readAt(d, 'x'), 3);
  assert.equal(readAt(d, 'series.0.points.1.y'), 20);
  assert.deepEqual(readAt(d, 'series.0.points.*.y'), [10, 20]);
  assert.deepEqual(readAt(d, 'series.*.label'), ['S']);
  assert.equal(readAt(d, 'nope'), undefined);
  assert.equal(readAt(d, 'series.0.points.5.y'), undefined);
  assert.equal(readAt(d, 'x.*'), undefined, 'a * on something that is not a list');
  assert.equal(readAt(d, 'series.0.points.*.z'), undefined, 'one missing item makes the whole list missing');
  assert.equal(readAt({ list: [] }, 'list.*'), undefined, 'an empty list reads as nothing');
});

test('limitProblem: whole numbers, limits, every item of a list, an empty list, a non-number', () => {
  const spec = { type: 'int', min: 1, max: 10 };
  assert.equal(limitProblem(spec, 5), null);
  assert.equal(limitProblem(spec, [1, 10]), null);
  assert.match(limitProblem(spec, 2.5), /must be a whole number \(got 2\.5\)/);
  assert.match(limitProblem(spec, 11), /must be from 1 to 10 \(got 11\)/);
  assert.match(limitProblem(spec, [3, 0]), /must be from 1 to 10 \(got 0\)/);
  assert.equal(limitProblem(spec, []), 'is an empty list');
  assert.equal(limitProblem(spec, 'x'), 'must be a number');
  assert.equal(limitProblem(spec, NaN), 'must be a number');
  assert.equal(limitProblem({ type: 'float', min: 0, max: 1 }, 0.25), null, 'a float is not held to whole numbers');
});

test('runCalculation reads inputs through variables (at, at with *, value), runs the function and overwrites the results where they are drawn', () => {
  const before = diagram(), copy = structuredClone(before);
  const run = runCalculation(before, calculation);
  assert.equal(run.problem, undefined);
  assert.deepEqual(run.values, { a: 3, list: [10, 20], hidden: 2, sum: 33, dbl: 6 });
  assert.equal(run.diagram.total, 33, 'a drawn result is replaced where it is drawn');
  assert.equal(run.diagram.variables.find(v => v.name === 'dbl').value, 6, 'an undrawn result is updated in the variables list');
  assert.equal(run.diagram.variables.find(v => v.name === 'sum').at, 'total', 'the variables list otherwise stays');
  assert.deepEqual(before, copy, 'the diagram it was given is not changed');
});

test('runCalculation: overwritten names the results that differed, written holds what the card carried', () => {
  const run = runCalculation(diagram(), calculation);
  assert.deepEqual(run.overwritten, ['sum', 'dbl']);
  assert.deepEqual(run.written, { sum: 0, dbl: 0 });
  const right = diagram(); right.total = 33; right.variables.find(v => v.name === 'dbl').value = 6;
  const again = runCalculation(right, calculation);
  assert.deepEqual(again.overwritten, [], 'results already right are not overwritten');
  assert.deepEqual(again.written, { sum: 33, dbl: 6 });
  const half = diagram(); half.total = 33;
  assert.deepEqual(runCalculation(half, calculation).overwritten, ['dbl']);
});

test('runCalculation: a value list is read as a list and an input that moved changes the results', () => {
  const d = diagram(); d.x = 4; d.series[0].points[1].y = 50;
  const run = runCalculation(d, calculation);
  assert.equal(run.values.sum, 64);
  assert.equal(run.diagram.total, 64);
  const listed = { kind: 'demo', variables: [
    { name: 'w', role: 'input', type: 'float', min: 1, max: 100, value: [1, 2, 3] }, { name: 'tot', role: 'result', type: 'float', min: 0, max: 1000, value: 0 }] };
  const run2 = runCalculation(listed, { variables: [
    { name: 'w', role: 'input', type: 'float', min: 1, max: 100, drawn: false }, { name: 'tot', role: 'result', type: 'float', min: 0, max: 1000, drawn: false }], run: ({ w }) => ({ tot: sum(w) }) });
  assert.equal(run2.diagram.variables[1].value, 6);
});

test('runCalculation: a card with no variables list, a missing variable or the wrong role is a problem', () => {
  const none = diagram(); delete none.variables;
  assert.match(runCalculation(none, calculation).problem, /no variables list/);
  const missing = diagram(); missing.variables = missing.variables.filter(v => v.name !== 'a');
  assert.match(runCalculation(missing, calculation).problem, /variables has no input named a/);
  assert.match(runCalculation(withVariable('a', { role: 'result' }), calculation).problem, /variables has no input named a/, 'an input written as a result');
  assert.match(runCalculation(withVariable('sum', { role: 'input' }), calculation).problem, /variables has no result named sum/, 'a result written as an input');
  const noResult = diagram(); noResult.variables = noResult.variables.filter(v => v.name !== 'dbl');
  assert.match(runCalculation(noResult, calculation).problem, /variables has no result named dbl/);
  assert.match(runCalculation({ kind: 'demo', variables: 'x' }, calculation).problem, /no variables list/);
});

test('runCalculation: an input that is not where variables says is a problem naming the path', () => {
  assert.match(runCalculation(withVariable('a', { at: 'nowhere' }), calculation).problem, /input a is not where variables says \(no number at nowhere\)/);
  const noValue = diagram(); noValue.variables = noValue.variables.map(v => (v.name === 'hidden' ? { name: 'hidden', role: 'input', type: 'int', min: 1, max: 5 } : v));
  assert.match(runCalculation(noValue, calculation).problem, /input hidden is not where variables says \(no value\)/);
});

test('runCalculation: an input outside its type or its limits is a problem (an item of a list too)', () => {
  const d1 = diagram(); d1.x = 2.5;
  assert.match(runCalculation(d1, calculation).problem, /input a must be a whole number \(got 2\.5\)/);
  const d2 = diagram(); d2.x = 11;
  assert.match(runCalculation(d2, calculation).problem, /input a must be from 1 to 10 \(got 11\)/);
  const d3 = diagram(); d3.x = 0;
  assert.match(runCalculation(d3, calculation).problem, /input a must be from 1 to 10 \(got 0\)/);
  const d4 = diagram(); d4.series[0].points[1].y = 200;
  assert.match(runCalculation(d4, calculation).problem, /input list must be from 0 to 100 \(got 200\)/);
  const d5 = diagram(); d5.series[0].points[0].y = 'ten';
  assert.match(runCalculation(d5, calculation).problem, /input list must be a number/);
  assert.match(runCalculation(withVariable('hidden', { value: 6 }), calculation).problem, /input hidden must be from 1 to 5 \(got 6\)/);
});

test('runCalculation: a function refusal becomes a problem; any other error is not hidden', () => {
  assert.match(runCalculation(withVariable('hidden', { value: 5 }), calculation).problem, /^the inputs are refused: five is refused$/);
  assert.throws(() => runCalculation(diagram(), { ...calculation, run: () => { throw new TypeError('a bug'); } }), TypeError);
});

test('runCalculation: a result outside its limits, or that cannot be written where it is drawn, is a problem', () => {
  const tight = { ...calculation, variables: calculation.variables.map(v => (v.name === 'sum' ? { ...v, max: 20 } : v)) };
  assert.match(runCalculation(diagram(), tight).problem, /result sum must be from 0 to 20 \(got 33\)/);
  assert.match(runCalculation(withVariable('sum', { at: 'nope.deeper' }), calculation).problem, /result sum cannot be written at nope\.deeper/);
  const missingKey = withVariable('sum', { at: 'absent' });
  assert.match(runCalculation(missingKey, calculation).problem, /result sum cannot be written at absent/, 'the author drew the figure: a field that is not there is not made');
  const starred = withVariable('sum', { at: 'series.0.points.*.y' });
  assert.match(runCalculation(starred, calculation).problem, /cannot be written at series\.0\.points\.\*\.y/, 'a * path is read only');
  assert.match(runCalculation(diagram(), { ...calculation, run: () => ({ sum: 'x', dbl: 1 }) }).problem, /result sum must be a number/);
});

test('fillVariableText: a number, a list item, rounding, and the problems', () => {
  const values = { a: 3, list: [10, 20.5], third: 0.1 + 0.2 };
  assert.deepEqual(fillVariableText('a is {{v:a}}, then {{v:list.1}} and {{v:list.0}}.', values), { text: 'a is 3, then 20.5 and 10.' });
  assert.deepEqual(fillVariableText('{{v:third}}', values), { text: '0.3' }, 'floating noise is rounded away');
  assert.deepEqual(fillVariableText('no tokens', values), { text: 'no tokens' });
  assert.match(fillVariableText('{{v:zzz}}', values).problem, /\{\{v:zzz\}\} does not name a number of variables/);
  assert.match(fillVariableText('{{v:list}}', values).problem, /it is a list: write \{\{v:name\.0\}\}/);
  assert.match(fillVariableText('{{v:list.7}}', values).problem, /\{\{v:list\.7\}\} does not name a number/);
  assert.match(fillVariableText('{{v:a.0}}', values).problem, /does not name a number/, 'a position of something that is not a list');
});

test('fillDiagramText: title, caption, a label deep inside, list items; an unknown name is a problem; the variables list is left alone', () => {
  const values = { total: 33, w: [0.5, 0.25] };
  const d = { kind: 'demo', title: 'Total {{v:total}}', caption: 'Weights {{v:w.0}} and {{v:w.1}}.',
    series: [{ label: 'Share {{v:w.1}}', points: [{ note: 'deep {{v:total}}' }] }], items: ['a {{v:total}}', 'plain'], variables: [{ name: 'q', at: '{{v:zz}}' }] };
  const { diagram: out, problem } = fillDiagramText(d, values);
  assert.equal(problem, undefined);
  assert.equal(out.title, 'Total 33');
  assert.equal(out.caption, 'Weights 0.5 and 0.25.');
  assert.equal(out.series[0].label, 'Share 0.25');
  assert.equal(out.series[0].points[0].note, 'deep 33');
  assert.deepEqual(out.items, ['a 33', 'plain']);
  assert.deepEqual(out.variables, d.variables, 'a {{v:}} inside the variables list is not filled and is not a problem');
  assert.equal(d.title, 'Total {{v:total}}', 'the diagram given is not changed');
  assert.match(fillDiagramText({ title: 'x', series: [{ label: '{{v:nope}}' }] }, values).problem, /\{\{v:nope\}\} does not name a number/);
  assert.equal(hasVariableToken('a {{v:x}} b'), true);
  assert.equal(hasVariableToken({ nested: ['{{v:x}}'] }), true);
  assert.equal(hasVariableToken('a {{d:1.x}} b'), false);
  assert.equal(hasVariableToken(null), false);
});

test('specFromTemplate fills a template with the values; an unknown name throws', () => {
  const template = { version: 1, diagram: { kind: 'demo', title: 'Top-{{v:k}}' } };
  assert.deepEqual(specFromTemplate(template, { k: 2 }), { version: 1, diagram: { kind: 'demo', title: 'Top-2' } });
  assert.throws(() => specFromTemplate(template, {}), /reference template: .*does not name a number/);
});

test('unfilledNumbers flags a "?" standing for a number and not a question', () => {
  const flagged = text => unfilledNumbers({ kind: 'demo', title: text }).length === 1;
  for (const text of ['?', 'Top-?', 'Top-? renormalized', 'hold ?%', 'hold ? %', 'keeps (?)', 'a ? b', '$?', '1/?', 'at the end ?']) assert.ok(flagged(text), text);
  for (const text of ['What is top-k?', 'Why does it work?', 'Is it 5?', 'no marks', 'a?b']) assert.ok(!flagged(text), text);
  assert.deepEqual(unfilledNumbers({ title: 'ok', series: [{ label: 'Top-?' }], items: ['fine', '?'] }), ['series.0.label', 'items.1'], 'the path of every field');
  assert.deepEqual(unfilledNumbers({ title: 'ok', variables: [{ name: 'x', at: '?' }] }), [], 'the variables list is not read');
  assert.deepEqual(unfilledNumbers({ title: 'ok', n: 5 }), []);
});

test('declareSpec: the stored spec is the template with the variables list, the function run and the placeholders filled', () => {
  const holder = { id: 'demo', spec: { version: 1, diagram: { kind: 'demo', title: 'Total {{v:sum}}', x: 3, total: 999, series: [{ label: 'S', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }] }] } } };
  const stored = declareSpec(holder, calculation, { hidden: 2 });
  assert.equal(stored.id, 'demo', 'the holder keeps its other fields');
  assert.equal(stored.spec.diagram.total, 33, 'the stored result is the function\'s, not the typed 999');
  assert.equal(stored.spec.diagram.title, 'Total 33');
  assert.deepEqual(stored.spec.diagram.variables, [
    { name: 'a', role: 'input', type: 'int', min: 1, max: 10, at: 'x' },
    { name: 'list', role: 'input', type: 'float', min: 0, max: 100, at: 'series.0.points.*.y' },
    { name: 'hidden', role: 'input', type: 'int', min: 1, max: 5, value: 2 },
    { name: 'sum', role: 'result', type: 'float', min: 0, max: 1000, at: 'total' },
    { name: 'dbl', role: 'result', type: 'float', min: 0, max: 1000, value: 6 },
  ]);
  assert.equal(stored.template.diagram.title, 'Total {{v:sum}}', 'the template keeps its placeholders');
  assert.equal(stored.template.diagram.total, 33, 'and carries the computed numbers');
  assert.equal(holder.spec.diagram.total, 999, 'the holder given is not changed');
  assert.equal(runCalculation(stored.spec.diagram, calculation).overwritten.length, 0, 'running the function on the stored spec gives the stored results');
  assert.throws(() => declareSpec(holder, calculation, { hidden: 5 }), /reference calculation: the inputs are refused/);
  assert.throws(() => declareSpec({ spec: { version: 1, diagram: { ...holder.spec.diagram, title: '{{v:nope}}' } } }, calculation, { hidden: 2 }), /reference template: /);
});

test('isDeclared / hasFunction / declareReference / needsNoCalculation', () => {
  const holder = { id: 'demo', spec: { version: 1, diagram: { kind: 'demo', title: 't', x: 3, total: 0, series: [{ points: [{ y: 1 }] }] } } };
  const withFunction = declareReference(holder, calculation, { hidden: 2 }), none = needsNoCalculation(holder);
  assert.ok(isDeclared(withFunction) && hasFunction(withFunction));
  assert.equal(withFunction.calculation, calculation);
  assert.ok(isDeclared(none) && !hasFunction(none));
  assert.deepEqual(none.calculation, { none: true });
  assert.equal(none.spec, holder.spec, 'a reference that needs none keeps its spec');
  for (const plain of [holder, null, undefined, {}]) assert.ok(!isDeclared(plain) && !hasFunction(plain));
});
