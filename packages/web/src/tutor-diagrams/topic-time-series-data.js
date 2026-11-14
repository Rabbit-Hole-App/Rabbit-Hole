// Recorded readings and predictor parameters are inputs; every forecast is derived.
export const observationRows = Object.freeze([
  { time: 1, reading: 4 }, { time: 2, reading: 6 },
  { time: 3, reading: 8 }, { time: 4, reading: 6 },
  { time: 5, reading: 8 }, { time: 6, reading: 10 },
  { time: 7, reading: 8 }, { time: 8, reading: 10 },
]);
export const parameters = Object.freeze({ weight: 0.5, bias: 1, origin: 4, probeOrigin: 5 });

const predict = input => parameters.weight * input + parameters.bias;
const targets = origin => observationRows.filter(row => row.time > origin).map(row => row.time);
function rollout(origin) {
  const times = targets(origin);
  const seed = observationRows.find(row => row.time === origin).reading;
  const inputs = [], predictions = [];
  let input = seed;
  for (const time of times) {
    inputs.push(input);
    input = predict(input);
    predictions.push(input);
  }
  return { origin, seed, times, inputs, predictions,
    provenance: times.map((_, i) => i ? 'Predicted' : 'Measured') };
}

export function derived() {
  const times = observationRows.map(row => row.time);
  const readings = observationRows.map(row => row.reading);
  const forecastTimes = targets(parameters.origin);
  const inputs = forecastTimes.map(time => observationRows.find(row => row.time === time - 1).reading);
  return {
    parameters, times, readings,
    baseline: readings.reduce((sum, reading) => sum + reading, 0) / readings.length,
    fixedPoint: parameters.bias / (1 - parameters.weight),
    oneStep: { times: forecastTimes, inputs, predictions: inputs.map(predict), provenance: inputs.map(() => 'Measured') },
    recursive: rollout(parameters.origin),
    probe: rollout(parameters.probeOrigin),
  };
}
