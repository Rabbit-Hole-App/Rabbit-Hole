// Shared scalar cell and distinct fixed readouts; no claim about a trained model's quality.
export const updateParameters = Object.freeze({ h0: .5, a: .5, b: 1, bias: 0, readout: 2, inputs: [1, -2] });
export const languageParameters = Object.freeze({ h0: .5, a: .5, observed: ['birds', 'cross', 'rivers'],
  features: { birds: 1, cross: 2, rivers: 0 }, vocabulary: ['birds', 'cross', 'rivers'], slopes: [-1, .5, 1], biases: [0, 1, 0], hypotheticalGuess: 'birds' });
export function derived() {
  const p = updateParameters; let state = p.h0;
  const updateRows = p.inputs.map((x, i) => { const previous = state, z = p.a * previous + p.b * x + p.bias;
    state = Math.max(0, z); return { step: i + 1, x, previous, z, h: state, y: p.readout * state }; });
  const l = languageParameters; state = l.h0; let stateDerivative = 0;
  const rows = l.observed.slice(0, -1).map((input, i) => {
    const previous = state, z = l.a * previous + l.features[input];
    stateDerivative = z > 0 ? previous + l.a * stateDerivative : 0;
    state = Math.max(0, z);
    const logits = l.slopes.map((weight, j) => weight * state + l.biases[j]), max = Math.max(...logits);
    const exp = logits.map(value => Math.exp(value - max)), denominator = exp.reduce((sum, value) => sum + value, 0);
    const probabilities = exp.map(value => value / denominator), target = l.observed[i + 1], index = l.vocabulary.indexOf(target);
    const stateGradient = probabilities.reduce((sum, value, j) => sum + value * l.slopes[j], 0) - l.slopes[index];
    return { step: i + 1, input, prefix: l.observed.slice(0, i + 1).join(' '), previous, state, logits, probabilities, target,
      loss: -Math.log(probabilities[index]), stateGradient, stateGradientShown: +stateGradient.toFixed(3), probabilityBars: probabilities.map(value => +value.toFixed(3)), parameterGradient: stateGradient * stateDerivative };
  });
  return { update: { parameters: p, rows: updateRows }, language: { parameters: l, rows,
    totalGradient: rows.reduce((sum, row) => sum + row.parameterGradient, 0),
    counterfactual: { guess: l.hypotheticalGuess, actualInput: l.observed[1], observedState: rows[1].state,
      guessState: Math.max(0, l.a * rows[0].state + l.features[l.hypotheticalGuess]) } } };
}
