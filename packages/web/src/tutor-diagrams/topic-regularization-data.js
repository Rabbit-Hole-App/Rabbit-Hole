// C01's shared toy data. Parameters are inputs; every displayed result is derived below.
export const trainingRows = Object.freeze([
  { x: [1, 1], target: 5 }, { x: [1, 2], target: 6 },
  { x: [2, 1], target: 8 }, { x: [2, 2], target: 9 },
]);
export const parameters = Object.freeze({
  linear: { weights: [2, 1], bias: 1 },
  hidden: { weights: [[1, 1], [2, -1]], biases: [0, 1], readout: [1, 2], outputBias: 1 },
  regularization: { strengths: [0, 0.2, 0.4] },
  dropout: { keepProbability: 0.5, mask: [1, 0] },
  selectedRow: 1, linearProbeRow: 3, hiddenProbe: [0, 2],
});

const sum = values => values.reduce((total, value) => total + value, 0);
const dot = (a, b) => sum(a.map((value, i) => value * b[i]));
const linear = input => ({ input: [...input], terms: input.map((value, i) => value * parameters.linear.weights[i]), prediction: dot(input, parameters.linear.weights) + parameters.linear.bias });
const hidden = input => {
  const preactivations = parameters.hidden.weights.map((weights, i) => dot(input, weights) + parameters.hidden.biases[i]);
  const activations = preactivations.map(value => Math.max(0, value));
  return { input: [...input], preactivations, activations, prediction: dot(activations, parameters.hidden.readout) + parameters.hidden.outputBias };
};

export function derived() {
  const selectedInput = trainingRows[parameters.selectedRow].x;
  const predictions = trainingRows.map(row => linear(row.x).prediction);
  const squaredErrors = predictions.map((prediction, i) => (prediction - trainingRows[i].target) ** 2);
  const mse = sum(squaredErrors) / trainingRows.length;
  const normSquared = sum(parameters.linear.weights.map(value => value ** 2));
  const selectedHidden = hidden(selectedInput);
  const q = parameters.dropout.keepProbability;
  const dropped = mask => {
    const masked = selectedHidden.activations.map((value, i) => value * mask[i]);
    const scaled = masked.map(value => value / q);
    const probability = mask.reduce((product, value) => product * (value ? q : 1 - q), 1);
    return { mask, masked, scaled, probability, prediction: dot(scaled, parameters.hidden.readout) + parameters.hidden.outputBias };
  };
  const masks = Array.from({ length: 2 ** selectedHidden.activations.length }, (_, index) => dropped(selectedHidden.activations.map((_, bit) => (index >> bit) & 1)));
  return {
    parameters,
    counts: { rows: trainingRows.length, features: selectedInput.length, hidden: selectedHidden.activations.length, masks: masks.length },
    linear: { predictions, squaredErrors, selected: linear(selectedInput), probe: linear(trainingRows[parameters.linearProbeRow].x) },
    hidden: { selected: selectedHidden, probe: hidden(parameters.hiddenProbe) },
    regularization: { mse, normSquared, cases: parameters.regularization.strengths.map(strength => ({ strength, penalty: strength * normSquared, total: mse + strength * normSquared })) },
    dropout: { selected: dropped([...parameters.dropout.mask]), masks, meanPrediction: sum(masks.map(row => row.prediction * row.probability)) },
  };
}
