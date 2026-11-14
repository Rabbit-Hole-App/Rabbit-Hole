import test from 'node:test';
import assert from 'node:assert';
import { derived, observationRows, parameters } from './topic-time-series-data.js';
import { references } from './composition-time-series-references.js';
import { tutorDiagramSchema } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';
import { plotSeriesPoints } from './ml-plot-spec.js';

test('C02 refreshed forecasts use only the measured reading before each target', () => {
  const d = derived();
  const targets = observationRows.filter(row => row.time > parameters.origin);
  const inputs = targets.map(row => observationRows.find(previous => previous.time === row.time - 1).reading);
  const predictions = inputs.map(input => input * parameters.weight + parameters.bias);
  assert.deepStrictEqual(d.oneStep.times, [5, 6, 7, 8]);
  assert.deepStrictEqual(d.oneStep.inputs, [6, 8, 10, 8]);
  assert.deepStrictEqual(d.oneStep.inputs, inputs);
  assert.deepStrictEqual(d.oneStep.predictions, predictions);
  assert.deepStrictEqual(d.oneStep.predictions, [4, 5, 6, 5]);
  assert.strictEqual(d.baseline, observationRows.reduce((sum, row) => sum + row.reading, 0) / observationRows.length);
  assert.strictEqual(d.baseline, 7.5);
});

test('C02 recursion feeds each forecast into the same predictor and tends below the mean', () => {
  const d = derived();
  let input = observationRows.find(row => row.time === parameters.origin).reading;
  const expected = d.recursive.times.map(() => {
    const prediction = input * parameters.weight + parameters.bias;
    input = prediction;
    return prediction;
  });
  assert.deepStrictEqual(d.recursive.times, d.oneStep.times);
  assert.deepStrictEqual(d.recursive.inputs, [6, 4, 3, 2.5]);
  assert.deepStrictEqual(d.recursive.predictions, expected);
  assert.deepStrictEqual(d.recursive.predictions, [4, 3, 2.5, 2.25]);
  assert.deepStrictEqual(d.recursive.provenance, ['Measured', 'Predicted', 'Predicted', 'Predicted']);
  assert.deepStrictEqual(d.oneStep.provenance, ['Measured', 'Measured', 'Measured', 'Measured']);
  assert.strictEqual(d.fixedPoint, 2);
  assert.strictEqual(d.fixedPoint * parameters.weight + parameters.bias, d.fixedPoint);
  assert.ok(d.recursive.predictions.every((value, i, values) => value > d.fixedPoint && (!i || value < values[i - 1])));
  assert.ok(d.recursive.predictions.at(-1) < d.baseline);
  assert.ok(Math.abs(observationRows.at(-1).reading - d.recursive.predictions.at(-1))
    > Math.abs(observationRows.at(-1).reading - d.oneStep.predictions.at(-1)));
});

test('C02 moving the origin uses its newly measured seed without changing the predictor', () => {
  const d = derived();
  assert.strictEqual(d.probe.origin, 5);
  assert.strictEqual(d.probe.seed, 8);
  assert.deepStrictEqual(d.probe.times, [6, 7, 8]);
  assert.deepStrictEqual(d.probe.inputs, [8, 5, 3.5]);
  assert.deepStrictEqual(d.probe.predictions, [5, 3.5, 2.75]);
  assert.strictEqual(d.probe.predictions[0], d.probe.seed * parameters.weight + parameters.bias);
  for (let i = 1; i < d.probe.predictions.length; i++) {
    assert.strictEqual(d.probe.predictions[i], d.probe.predictions[i - 1] * parameters.weight + parameters.bias);
  }
  assert.ok(d.probe.predictions.every(value => value > d.fixedPoint));
});

test('C02 rollout depths preserve the readings and add refreshed inputs then a fixed-point check', () => {
  const d = derived();
  const reference = references[0];
  const overview = reference.depths.overview.spec.diagram;
  const standard = reference.depths.standard.spec.diagram;
  const deep = reference.depths.deep.spec.diagram;
  const detail = reference.depths.deep.detailSpec.diagram;
  assert.deepStrictEqual(overview.series.map(series => series.label), ['Observed', 'Recursive']);
  assert.deepStrictEqual(overview.series[0].samples.y, observationRows.map(row => row.reading));
  assert.deepStrictEqual(plotSeriesPoints(overview.series[0]), observationRows.map(row => ({ x: row.time, y: row.reading })));
  assert.deepStrictEqual(overview.series[1].samples.y, d.recursive.predictions);
  assert.strictEqual(standard.kind, 'comparison');
  assert.strictEqual(standard.variant, 'panels');
  const [plot, provenance] = standard.panels.map(panel => panel.diagram);
  assert.deepStrictEqual(plot.series.map(series => series.label), ['Observed', 'Recursive', 'One-step']);
  assert.deepStrictEqual(plot.series[0].samples, overview.series[0].samples);
  assert.deepStrictEqual(plot.series[2].samples.y, d.oneStep.predictions);
  assert.ok(plot.annotations.some(mark => mark.axis === 'x' && mark.value === parameters.origin));
  assert.ok(plot.annotations.some(mark => mark.axis === 'y' && mark.value === d.baseline));
  assert.deepStrictEqual(provenance.rows.map(row => row.cells), [['Measured', 'Predicted'], ['Measured', 'Measured']]);
  const model = `$f(x)=${d.parameters.weight}x+${d.parameters.bias}$`;
  for (const diagram of [overview, standard, deep, detail]) assert.ok(diagram.caption?.includes(model), 'Show the predictor used to compute the plotted forecasts');
  assert.ok(deep.caption.includes('$s=f(s)$'));
  assert.ok(detail.annotations.some(mark => mark.axis === 'y' && mark.value === d.fixedPoint));
  assert.deepStrictEqual(detail.series[0].samples.y, d.readings);
  assert.deepStrictEqual(detail.series[1].samples.y, d.recursive.predictions);
  assert.deepStrictEqual(detail.series[2].samples.y, d.probe.predictions);
  assert.deepStrictEqual(plotSeriesPoints(detail.series[2]).map(point => point.x), d.probe.times);
  assert.ok(detail.annotations.some(mark => mark.axis === 'x' && mark.value === d.probe.origin));
});

test('C02 rollout specs validate, satisfy the content contract and fit the card width', () => {
  const reference = references[0];
  assert.deepStrictEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
  for (const [depth, view] of Object.entries(reference.depths)) {
    for (const [field, spec] of Object.entries(view)) {
      const parsed = tutorDiagramSchema.safeParse(spec);
      assert.ok(parsed.success, `${depth}/${field}: ${parsed.error?.message}`);
      assert.deepStrictEqual(lintDiagramContent(spec), [], `${depth}/${field} content`);
      assert.ok(renderTutorDiagram(spec, 680).width <= 680, `${depth}/${field} width`);
    }
  }
});
