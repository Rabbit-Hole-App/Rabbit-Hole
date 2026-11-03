// Independent oracle for the hand-written /animation examples (src/animation3d/learning-examples.js), in the style of
// animation-oracle.mjs: every number here comes from the formula each example states in words, written by hand. Nothing here imports,
// runs or copies a scene's program. Used by src/animation3d/learning-examples.test.mjs.

// ---- softmax: p_i = exp(l_i / T) / sum exp(l_j / T); H = -sum p log2 p, in bits. Logits for mat, floor, sofa, roof, moon.
export const LOGITS = { mat: 4, floor: 3, sofa: 2.5, roof: 1, moon: -1 };
export function softmax(temperature) {
  const scores = Object.values(LOGITS).map(logit => Math.exp(logit / temperature));
  const total = scores.reduce((a, b) => a + b);
  const p = scores.map(score => score / total);
  let entropy = 0;
  for (const value of p) if (value > 0) entropy -= value * (Math.log(value) / Math.LN2);
  return { p, top: Math.max(...p), entropy };
}

// ---- gradient descent on L = (w1^2 + 4 w2^2) / 2 from (-3, 1.5), by repeated steps w -= lr * grad L (grad L = (w1, 4 w2)).
export const gradientLoss = ([w1, w2]) => 0.5 * w1 * w1 + 2 * w2 * w2;
export function gradientPath(lr, steps = 12) {
  const path = [[-3, 1.5]];
  for (let k = 0; k < steps; k += 1) { const [w1, w2] = path[k]; path.push([w1 - lr * w1, w2 - lr * 4 * w2]); }
  return path;
}
// The behaviour by its definition: stable only when |1 - 4 lr| < 1 (the steepest curvature is 4); else whether 12 steps reach 1% of the start.
export function gradientBehaviour(lr) {
  const factor = Math.abs(1 - 4 * lr), last = gradientLoss(gradientPath(lr).at(-1));
  if (factor > 1 + 1e-9) return 'diverging';
  if (factor > 1 - 1e-9) return 'edge';
  if (last <= 0.01 * gradientLoss([-3, 1.5])) return 'good';
  return lr < 0.4 ? 'slow' : 'oscillating';
}

// ---- perceptron on AND: answers 1 when w1 x1 + w2 x2 + b > 0; training adds (target - answer) (x1, x2, 1); starts at zero. 7 updates at most.
export const AND = [{ x: [0, 0], target: 0 }, { x: [0, 1], target: 0 }, { x: [1, 0], target: 0 }, { x: [1, 1], target: 1 }];
const says = ({ w, b }, x) => (w[0] * x[0] + w[1] * x[1] + b > 0 ? 1 : 0);
export function perceptron(picks, budget = 7) {
  let neuron = { w: [0, 0], b: 0 }, used = 0, status = 'playing';
  for (const pick of picks) {
    if (status !== 'playing') break;
    const { x, target } = AND[pick], error = target - says(neuron, x);
    neuron = { w: [neuron.w[0] + error * x[0], neuron.w[1] + error * x[1]], b: neuron.b + error };
    used += 1;
    if (AND.every(example => says(neuron, example.x) === example.target)) status = 'won';
    else if (used >= budget) status = 'lost';
  }
  return { ...neuron, used, status, answers: AND.map(example => says(neuron, example.x)), wrong: AND.filter(example => says(neuron, example.x) !== example.target).length };
}

// ---- Lotka-Volterra: dx/dt = 1.1 x - 0.4 x y, dy/dt = 0.1 x y - 0.4 y, x(0) = 10, y(0) = 2. A much finer step than the scene's (Heun's
// method, not RK4), so an agreement is not the same arithmetic twice. Its conserved quantity is an independent check on both.
export const predatorInvariant = (x, y) => 0.1 * x - 0.4 * Math.log(x) + 0.4 * y - 1.1 * Math.log(y);
export function predatorPrey(time) {
  const rate = (x, y) => [x * (1.1 - 0.4 * y), y * (0.1 * x - 0.4)];
  const n = Math.max(1, Math.ceil(time / 5e-4)), h = time / n;
  let x = 10, y = 2;
  for (let i = 0; i < n; i += 1) {
    const a = rate(x, y), b = rate(x + h * a[0], y + h * a[1]);
    x += h / 2 * (a[0] + b[0]);
    y += h / 2 * (a[1] + b[1]);
  }
  return { x, y };
}
