import test from 'node:test';
import assert from 'node:assert';
import { derived, trainingRows, parameters } from './topic-regularization-data.js';
import { references as linearReferences } from './topic-linear-regression-references.js';
import { references as hiddenReferences } from './composition-neural-networks-references.js';
import { references as regularizationReferences } from './composition-regularization-references.js';
import { tutorDiagramSchema } from './spec.js';
import { lintDiagramContent } from './content-contract.js';

test('C01 linear predictions, residual squares and penalty are recomputed from the toy rows', () => {
  const d = derived();
  const predictions = trainingRows.map(({ x }) => x.reduce((sum, value, i) => sum + value * parameters.linear.weights[i], parameters.linear.bias));
  const squaredErrors = predictions.map((prediction, i) => (prediction - trainingRows[i].target) ** 2);
  const mse = squaredErrors.reduce((sum, value) => sum + value, 0) / trainingRows.length;
  const normSquared = parameters.linear.weights.reduce((sum, value) => sum + value ** 2, 0);
  assert.deepStrictEqual(d.linear.predictions, predictions);
  assert.deepStrictEqual(d.linear.squaredErrors, squaredErrors);
  assert.strictEqual(d.regularization.mse, mse);
  assert.strictEqual(d.regularization.normSquared, normSquared);
  assert.deepStrictEqual(d.regularization.cases.map(row => row.total), parameters.regularization.strengths.map(strength => mse + strength * normSquared));
  assert.deepStrictEqual(d.regularization.cases.map(row => row.total), [2.5, 3.5, 4.5]);
  assert.strictEqual(d.linear.selected.prediction, 5);
  assert.strictEqual(d.linear.probe.prediction - d.linear.selected.prediction, 2);
});

test('C01 hidden features include a negative preactivation clipped by ReLU', () => {
  const d = derived();
  for (const row of [d.hidden.selected, d.hidden.probe]) {
    const z = parameters.hidden.weights.map((weights, j) => weights.reduce((sum, weight, i) => sum + weight * row.input[i], parameters.hidden.biases[j]));
    const h = z.map(value => Math.max(0, value));
    const output = h.reduce((sum, value, i) => sum + value * parameters.hidden.readout[i], parameters.hidden.outputBias);
    assert.deepStrictEqual(row.preactivations, z);
    assert.deepStrictEqual(row.activations, h);
    assert.strictEqual(row.prediction, output);
  }
  assert.deepStrictEqual(d.hidden.selected.activations, [3, 1]);
  assert.deepStrictEqual(d.hidden.probe.preactivations, [2, -1]);
  assert.deepStrictEqual(d.hidden.probe.activations, [2, 0]);
});

test('C01 inverted dropout enumerates all masks and preserves this linear readout in expectation', () => {
  const d = derived();
  const q = parameters.dropout.keepProbability;
  const masks = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const outputs = masks.map(mask => d.hidden.selected.activations.reduce((sum, h, i) => sum + h * mask[i] / q * parameters.hidden.readout[i], parameters.hidden.outputBias));
  assert.deepStrictEqual(d.dropout.masks.map(row => row.mask), masks);
  assert.deepStrictEqual(d.dropout.masks.map(row => row.prediction), outputs);
  assert.deepStrictEqual(outputs, [1, 7, 5, 11]);
  assert.strictEqual(d.dropout.masks.reduce((sum, row) => sum + row.probability, 0), 1);
  assert.strictEqual(d.dropout.meanPrediction, outputs.reduce((sum, value) => sum + value, 0) / masks.length);
  assert.strictEqual(d.dropout.meanPrediction, d.hidden.selected.prediction);
  assert.deepStrictEqual(d.dropout.selected.scaled, [6, 0]);
});

const references = [linearReferences.find(row => row.id === 'ml-linear-regression-linear-unit'), ...hiddenReferences, ...regularizationReferences];
test('C01 gives every reference three valid depths and a deep probe in the same visual language', () => {
  for (const reference of references) {
    assert.deepStrictEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
    assert.strictEqual(reference.depths.overview.spec.diagram.panels.length, 2);
    assert.ok(reference.depths.deep.detailSpec);
    for (const [depth, view] of Object.entries(reference.depths)) for (const [field, spec] of Object.entries(view)) {
      assert.ok(tutorDiagramSchema.safeParse(spec).success, `${reference.id}/${depth}/${field} schema`);
      assert.deepStrictEqual(lintDiagramContent(spec), [], `${reference.id}/${depth}/${field} content`);
    }
  }
});

test('C01 displayed quantities come from the shared computation, not caption literals', () => {
  const d = derived();
  const linear = references[0].depths.standard.spec.diagram.panels;
  assert.deepStrictEqual(linear[1].diagram.bars.map(row => row.value), d.linear.selected.terms);
  assert.strictEqual(linear[2].diagram.bars.at(-1).value, d.linear.selected.prediction);
  const hidden = references[1].depths.standard.spec.diagram.panels;
  assert.deepStrictEqual(hidden[1].diagram.bars.map(row => row.value), d.hidden.selected.activations);
  assert.strictEqual(hidden[2].diagram.bars.at(-1).value, d.hidden.selected.prediction);
  const objective = references[2].depths.standard.spec.diagram.panels.at(-1).diagram;
  assert.deepStrictEqual(objective.bars.map(row => row.value), [d.regularization.mse, d.regularization.cases[1].penalty]);
  assert.strictEqual(objective.total, objective.bars.reduce((sum, row) => sum + row.value, 0));
  const dropout = references[3].depths.standard.spec.diagram.panels;
  assert.deepStrictEqual(dropout[1].diagram.series[0].samples.y, d.dropout.selected.masked);
  assert.deepStrictEqual(dropout[2].diagram.series[0].samples.y, d.dropout.selected.scaled);
  assert.deepStrictEqual(dropout[0].diagram.y, dropout[2].diagram.y, 'Scaling is drawn against the same magnitude axis');
});
