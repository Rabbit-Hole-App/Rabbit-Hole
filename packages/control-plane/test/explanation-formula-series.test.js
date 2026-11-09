import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact, prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { fillFormulaSeries, formulaSamplerEnabled, withFormulaSeries } from '../src/explanation-formula-series.js';

const plot = series => ({ k: 'diagram', spec: { version: 1, diagram: { kind: 'coordinate-plot', title: 'Squared error grows with the miss', x: { label: 'Error', min: -2, max: 2 }, y: { label: 'Loss', min: 0, max: 4 }, series } } });
const formula = { label: 'Squared error', kind: 'line', formula: 'x^2', xMin: -2, xMax: 2, samples: 5 };
const card = visual => ({ title: 'Squared error', visuals: [visual],
  body: 'Squared error grows with the miss.\n\n[[visual:1]]\n\nSo a large miss costs far more than a small one.' });
const run = (env, visual) => generateArtifact(env, { command: 'explanation', args: 'Why does squared error grow with the miss?' },
  { callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c', name: 'make_explanation', input: card(visual) }] }) });
const pointsOf = out => JSON.parse(out.block.body.match(/```rh-diagram\n([\s\S]*?)\n```/)[1]).diagram.series[0].points;

test('the flag is on only for the exact value "on"', () => {
  assert.deepEqual([{}, { EXPLANATION_FORMULA_SAMPLER: 'off' }, { EXPLANATION_FORMULA_SAMPLER: 'true' }, { EXPLANATION_FORMULA_SAMPLER: 'on' }].map(formulaSamplerEnabled), [false, false, false, true]);
});

test('off (the default): the author request carries no formula series, in the schema or the description', () => {
  const tool = env => prepareArtifactAuthorRequest(env, { command: 'explanation', args: 'Why does squared error grow?' }).body.tools.find(t => t.name === 'make_explanation');
  assert.ok(!JSON.stringify(tool({})).includes('the server samples it') && !JSON.stringify(tool({}).input_schema).includes('"formula"'));
  assert.deepEqual(tool({}), tool({ EXPLANATION_FORMULA_SAMPLER: 'off' }));
  const on = tool({ EXPLANATION_FORMULA_SAMPLER: 'on' });
  assert.ok(on.description.includes('the server samples it'));
  assert.ok(JSON.stringify(on.input_schema).includes('"formula"'));
  assert.deepEqual(withFormulaSeries(tool({}).input_schema).required, tool({}).input_schema.required, 'only the plot series items change');
});

test('on: a formula series is sampled into points before the card is read, one call', async () => {
  const out = await run({ EXPLANATION_FORMULA_SAMPLER: 'on' }, plot([formula]));
  assert.equal(out.result, 'artifact', JSON.stringify(out));
  assert.deepEqual(pointsOf(out), [-2, -1, 0, 1, 2].map(x => ({ x, y: x * x })));
});

test('on: a formula that cannot be sampled is left for the parser, and measured points are untouched', async () => {
  const bad = fillFormulaSeries([plot([{ ...formula, formula: 'x^3' }])]);
  assert.equal(bad[0].spec.diagram.series[0].formula, 'x^3', 'outside the y axis: left as written');
  const measured = [plot([{ label: 'Measured', kind: 'scatter', points: [{ x: 0, y: 1 }] }])];
  assert.equal(fillFormulaSeries(measured), measured, 'nothing sampled: the same array');
  assert.equal(fillFormulaSeries(undefined), undefined);
});

test('off: a formula series is not sampled (the flag gates the server step)', async () => {
  const out = await run({}, plot([formula]));
  assert.ok(!out.block?.body?.includes('"points"'), 'no points were made from the formula');
});
