export const round = (value, digits = 2) => Number(value.toFixed(digits));
const curve = (xs, f, digits) => xs.map(x => [x, round(f(x), digits)]);

const density = (x, mean, sd) => Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
export const gaussians = [[-1, 0.75], [1.5, 0.75], [-1, 1.5]].map(([mean, sd]) =>
  curve([-2.7, -1, 0, 1, 2.7].map(z => round(mean + z * sd)), x => density(x, mean, sd)));
export const classLogits = [873, 872, 870];
export const centeredLogits = classLogits.map(value => value - Math.max(...classLogits));
const normalizer = centeredLogits.reduce((sum, value) => sum + Math.exp(value), 0);
const probabilityUnits = centeredLogits.map(value => Math.round(1000 * Math.exp(value) / normalizer));
probabilityUnits[0] += 1000 - probabilityUnits.reduce((sum, value) => sum + value, 0);
export const classProbabilities = probabilityUnits.map(value => value / 1000);
const activationSamples = [-3, -1.5, -0.75, 0, 0.75, 1.5, 3];
const sigmoid = x => 1 / (1 + Math.exp(-x));
export const activations = {
  sigmoid: curve(activationSamples, sigmoid),
  tanh: curve(activationSamples, Math.tanh),
  sigmoidSlope: curve(activationSamples, x => sigmoid(x) * (1 - sigmoid(x))),
  tanhSlope: curve(activationSamples, x => 1 - Math.tanh(x) ** 2),
};

export const epochSamples = [0, 1, 2, 4, 6];
export const capacityLoss = {
  train: [0.85, 0.54, 0.3, 0.16, 0.07],
  holdout: [0.91, 0.64, 0.43, 0.52, 0.74],
};
// Constructed examples with one shared epoch axis. These are not measurements.
export const penaltyLoss = {
  unpenalizedTrain: [0.76, 0.42, 0.19, 0.07, 0.03],
  unpenalizedHeldOut: [0.8, 0.72, 0.73, 0.72, 0.73],
  penalizedTrain: [0.76, 0.52, 0.39, 0.25, 0.18],
  penalizedHeldOut: [0.8, 0.69, 0.56, 0.41, 0.34],
};
export const dropout = {
  units: [2, 5, 3],
  mask: [1, 0, 1],
  keep: 0.5,
  trainLoss: [0.92, 0.65, 0.51, 0.4, 0.34],
  heldoutLoss: [0.95, 0.7, 0.56, 0.46, 0.44],
  heldoutAccuracy: [0.42, 0.64, 0.72, 0.77, 0.77],
};

function iterate(initial, steps, update) {
  const states = [initial];
  for (let i = 0; i < steps; i++) states.push(update(states[i], i));
  return states;
}
export const descentRates = [0.08, 0.3, 0.5, 1.1];
export const descentPaths = descentRates.map(rate => iterate(2, 4, w => w - rate * 2 * w));
const twoBasins = x => (x ** 2 - 1) ** 2 + 0.32 * x + 0.48;
const basinSlope = x => 4 * x * (x ** 2 - 1) + 0.32;
export const basinCurve = curve([-1.5, -1.2, -1.04, -0.55, 0, 0.55, 0.96, 1.2, 1.5], twoBasins);
export const basinPath = iterate(1.5, 4, w => w - 0.075 * basinSlope(w)).map(w => [round(w), round(twoBasins(w))]);
const convexLoss = w => w ** 2 / 2 + w ** 4 / 8;
const convexSlope = w => w + w ** 3 / 2;
const convexCurvature = w => 1 + 1.5 * w ** 2;
export const newtonCurve = curve([-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2], convexLoss);
export const newtonPath = iterate(2, 4, w => w - convexSlope(w) / convexCurvature(w)).map(w => [round(w), round(convexLoss(w))]);
const hillLoss = w => (w * w - 1) ** 2 + 0.15 * w + 0.2;
const hillSlope = w => 4 * w * (w * w - 1) + 0.15;
const hillCurvature = w => 12 * w * w - 4;
export const nonconvexCurve = curve([-1.2, -1.02, -0.75, -0.35, 0, 0.35, 0.75, 0.98, 1.2], hillLoss);
export const uphillPath = iterate(0.4, 2, w => w - hillSlope(w) / hillCurvature(w)).map(w => [round(w), round(hillLoss(w))]);
export const safePath = iterate(0.4, 5, w => w - 0.3 * hillSlope(w) / Math.max(1, Math.abs(hillCurvature(w))))
  .map(w => [round(w), round(hillLoss(w))]);

const noise = [0.55, -0.73, 0.36, 0.82, -0.58, -0.79, 0.6, -0.14, 0.66, -0.88, 0.33, 0.9,
  -0.48, -0.65, 0.84, -0.34, 0.52, -0.81, 0.39, 0.74, -0.56, 0.46, -0.52, 0.75];
export const stochasticPaths = [() => 0.6, step => 0.6 * 0.55 ** step, step => 0.6 / Math.sqrt(step + 1)]
  .map(schedule => iterate(2.6, noise.length, (w, step) => w - schedule(step) * (w + noise[step])));
export const stochasticSamples = [0, 1, 3, 7, 16, 21, 24];

const features = [-2, -1.2, 1.8, -0.6, 2.1, 0.3, 1.1, -1.7, -0.4, 1.7, -2.2, 0.8];
const examples = features.map((x, index) => [x, 0.75 * x + 0.14 * noise[index]]);
const fullLoss = w => examples.reduce((sum, [x, y]) => sum + (w * x - y) ** 2 / 2, 0) / examples.length;
function trainRegressor(batchSize, step, epochs = 4) {
  let w = 0;
  let update = 0;
  const result = [round(fullLoss(w), 3)];
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = 0; i < examples.length; i += batchSize) {
      const batch = examples.slice(i, i + batchSize);
      const gradient = batch.reduce((sum, [x, y]) => sum + (w * x - y) * x, 0) / batch.length;
      w = step(w, gradient, ++update);
    }
    result.push(round(fullLoss(w), 3));
  }
  return result;
}
export const minibatchRuns = [1, 3, 6, 12].map(batchSize => ({
  batchSize, epochMs: round(examples.length / batchSize * (0.18 + 0.025 * batchSize)),
  losses: trainRegressor(batchSize, (w, g) => w - 0.12 * g),
}));
const momentumUpdate = (rate, beta) => {
  let v = 0;
  return (w, g) => {
    v = beta * v + g;
    return w - rate * v;
  };
};
export const momentumLossRuns = [[0.12, 0], [0.12, 0.8], [0.045, 0.8]]
  .map(([rate, beta]) => trainRegressor(3, momentumUpdate(rate, beta)));

const valley = [0.6, 6];
const valleyPath = (rate, beta, steps) => iterate([[-2, -1], [0, 0]], steps, ([weights, prior]) => {
  const velocity = prior.map((v, i) => beta * v + valley[i] * weights[i]);
  return [weights.map((w, i) => w - rate * velocity[i]), velocity];
}).map(([weights]) => weights.map(w => round(w)));
export const plainValleyPath = valleyPath(0.45, 0, 3);
export const momentumValleyPath = valleyPath(0.45, 0.6, 7);
export const momentumMemory = [0, 0.55, 0.85].map(beta => [0, 1, 2, 4, 7].map(age => [age, round(beta ** age)]));

function adaptiveUpdate(yogi) {
  let m = 0, v = 0;
  return (w, g, step) => {
    m = 0.7 * m + 0.3 * g;
    v = yogi ? v - 0.1 * Math.sign(v - g ** 2) * g ** 2 : 0.9 * v + 0.1 * g ** 2;
    return w - 0.18 * (m / (1 - 0.7 ** step)) / (Math.sqrt(v / (1 - 0.9 ** step)) + 1e-8);
  };
}
export const adaptiveLossRuns = [trainRegressor(3, adaptiveUpdate(false)), trainRegressor(3, adaptiveUpdate(true))];

export const scheduleSteps = [0, 1, 2, 3, 4, 6, 8];
export const smoothSchedules = [step => 0.4 / Math.sqrt(step + 1), step => Math.max(0.05, 0.4 * 0.65 ** step)]
  .map(f => curve(scheduleSteps, f));
const cosine = (step, start, finish) => 0.04 + 0.36 * (1 + Math.cos(Math.PI * Math.min(1, (step - start) / (finish - start)))) / 2;
export const cosineSchedules = [step => cosine(step, 0, 6), step => step < 2 ? 0.2 * step : cosine(step, 2, 6)]
  .map(f => curve(scheduleSteps, f));
export const heldoutScheduleRuns = {
  fixed: [0.45, 0.61, 0.68, 0.71, 0.71],
  smooth: [0.43, 0.58, 0.66, 0.73, 0.74],
  milestone: [0.44, 0.6, 0.67, 0.71, 0.73],
  cosine: [0.43, 0.59, 0.68, 0.74, 0.75],
  warmup: [0.42, 0.63, 0.7, 0.74, 0.75],
};

const adamStepNumber = 3;
const adamGradient = 0.4;
export const adamCoordinates = [0.04, 0.8].map(priorVariance => {
  const m = 0.7 * 0.1 + 0.3 * adamGradient;
  const v = 0.9 * priorVariance + 0.1 * adamGradient ** 2;
  const correctedM = m / (1 - 0.7 ** adamStepNumber);
  const correctedV = v / (1 - 0.9 ** adamStepNumber);
  return { gradient: adamGradient, m, v, move: 0.18 * correctedM / (Math.sqrt(correctedV) + 1e-8) };
});
