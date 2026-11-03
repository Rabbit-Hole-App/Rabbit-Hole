// Hand-written /animation examples for the Slash Commands window (owner 2026-11-02): one per experience across LLMs, ML and biology, beside
// the saved pendulum (pendulum-demo.js). Written by hand against the contract with no model call, and labelled so on the card
// (provenance 'fixture'). Read by name only (block.fixtureId): they are not in the Insert palette's example picker. Each is
// { name, plan, artifact }. planHash and sourceHash are literals, pinned by learning-examples.test.mjs, which also runs each program
// on the real engine against independent formulas (e2e/animation-examples-oracle.mjs).
import { ANIMATION_CAPABILITIES } from './capabilities.js';
import { ANIMATION_PROGRAM_VERSIONS, PLAN_SCHEMA, SCENE_SCHEMA } from './contract.js';

const program = (source, sourceHash) => ({ ...ANIMATION_PROGRAM_VERSIONS, source, sourceHash });
const base = { schema: SCENE_SCHEMA, revision: 1, capabilityVersion: ANIMATION_CAPABILITIES.version, sourceRefs: [], seed: 1, provenance: { origin: 'fixture' } };
const FLAT = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]; // -90 degrees about X: a plane lies flat
const round = value => Number(value.toFixed(3));

// ---- experiment, LLM: softmax temperature --------------------------------------------------------------------------------
// p_i = exp(logit_i / T) / sum_j exp(logit_j / T); H = -sum_i p_i log2 p_i. A bar's height is 4 x p_i.

const WORDS = [['mat', 4], ['floor', 3], ['sofa', 2.5], ['roof', 1], ['moon', -1]];
const temperatureSource = `const LOGITS = [4, 3, 2.5, 1, -1];
const BARS = ['mat', 'floor', 'sofa', 'roof', 'moon'];
export function evaluate({ inputs }) {
  const raw = LOGITS.map(logit => Math.exp((logit - 4) / inputs.temperature));
  const total = raw.reduce((sum, value) => sum + value, 0);
  const p = raw.map(value => value / total);
  const entropy = -p.reduce((sum, value) => sum + (value > 0 ? value * Math.log2(value) : 0), 0);
  const nodes = { entropyNote: { text: 'Entropy ' + entropy.toFixed(2) + ' bits (at most 2.32)' } };
  BARS.forEach((word, i) => {
    const height = Math.max(0.02, 4 * p[i]);
    nodes[word] = { position: [i * 1.5 - 3, height / 2, 0], scale: [1, height, 1] };
    nodes[word + 'Value'] = { position: [i * 1.5 - 3, height, 0], text: (100 * p[i]).toFixed(1) + '%' };
  });
  return { nodes, readouts: { topProbability: 100 * Math.max(...p), entropy } };
}
`;
const temperatureParameters = [{ type: 'number', id: 'temperature', label: 'Temperature', min: 0.1, max: 5, step: 0.1, default: 1 }];
const temperaturePlan = {
  schema: PLAN_SCHEMA, title: 'Softmax temperature and next words', description: 'Five candidate next words after "The cat sat on the", each with a fixed logit. Temperature divides the logits before softmax, and the bars show the resulting probabilities.',
  experience: 'experiment', reason: 'Moving one control shows how temperature sharpens or flattens the same logits.', behavior: 'analytical', controlProfile: 'manipulate',
  sourceRefs: [], parameters: temperatureParameters, interactions: ['Change the temperature from 0.1 to 5.'],
  assumptions: ['p = softmax(logits / T); entropy is in bits.', 'The logits are written by hand to illustrate the formula; no model produced them.'],
  limitations: ['Real models score tens of thousands of tokens, not five words.'],
  learningGoal: 'Low temperature concentrates probability on the top word; high temperature approaches uniform and raises entropy.', requiredCapabilities: ['parameters', 'readouts', 'labels'],
};
export const temperatureExample = {
  name: 'softmax-temperature',
  plan: temperaturePlan,
  artifact: {
    ...base, artifactId: 'example-softmax-temperature', planHash: 'a56fde23aab5228d6ce5ea1c7c9e25b7c69bc9d07a594698348bb16b04e6accb',
    title: temperaturePlan.title, description: 'Five bars, one per candidate next word, whose heights are their probabilities. A line marks 100 percent and another marks the uniform 20 percent.',
    experience: 'experiment', behavior: 'analytical', controlProfile: 'manipulate',
    scene: {
      materials: [{ id: 'top', color: '#2f6fe0' }, { id: 'rest', color: '#7f97bd' }, { id: 'axis', color: '#8a8f98' }],
      geometries: [
        { id: 'bar', kind: 'box', size: [0.9, 1, 0.9] },
        { id: 'baseline', kind: 'line', points: [[-4, 0, 0], [4, 0, 0]] },
        { id: 'full', kind: 'line', points: [[-4, 4, 0], [4, 4, 0]] },
        { id: 'uniform', kind: 'line', points: [[-4, 0.8, 0], [4, 0.8, 0]] },
        { id: 'fullText', kind: 'label', text: '100%', placement: 'right' },
        { id: 'uniformText', kind: 'label', text: 'Uniform 20%', placement: 'right' },
        { id: 'entropyText', kind: 'label', text: 'Entropy', placement: 'above' },
        ...WORDS.flatMap(([word, logit]) => [{ id: `${word}Word`, kind: 'label', text: `${word} (${logit.toFixed(1)})`, placement: 'below' }, { id: `${word}Percent`, kind: 'label', text: '0%', placement: 'above' }]),
      ],
      nodes: [
        { id: 'baseN', geometry: 'baseline', material: 'axis' }, { id: 'fullN', geometry: 'full', material: 'axis' }, { id: 'uniformN', geometry: 'uniform', material: 'axis' },
        { id: 'fullNote', geometry: 'fullText', position: [4, 4, 0] }, { id: 'uniformNote', geometry: 'uniformText', position: [4, 0.8, 0] },
        { id: 'entropyNote', geometry: 'entropyText', position: [0, 4.3, 0] },
        ...WORDS.flatMap(([word], i) => [
          { id: word, geometry: 'bar', material: i ? 'rest' : 'top', position: [i * 1.5 - 3, 0.5, 0], name: word },
          { id: `${word}Tag`, geometry: `${word}Word`, position: [i * 1.5 - 3, 0, 0] },
          { id: `${word}Value`, geometry: `${word}Percent`, position: [i * 1.5 - 3, 1, 0] },
        ]),
      ],
    },
    parameters: temperatureParameters, actions: [],
    readouts: [{ id: 'topProbability', label: 'Top word (mat)', unit: '%', decimals: 1 }, { id: 'entropy', label: 'Entropy', unit: 'bits', decimals: 2 }],
    program: program(temperatureSource, '14d3c1a219cbbee076a9258b344023e50c9727c12b253ba0cc9afa945543eb80'),
    camera: { position: [0, 3, 12], target: [0, 2, 0], fov: 40 },
    assumptions: ['p = softmax(logits / T), written beside each word as its logit; entropy H = -sum p log2 p, at most log2 5 = 2.32 bits.', 'The five logits are written by hand to illustrate the formula, for "The cat sat on the". No model produced them.', 'Real models score tens of thousands of tokens, not five words.'],
  },
};

// ---- experiment, ML: gradient descent on a loss bowl ----------------------------------------------------------------------
// L(w1, w2) = (w1^2 + 4 w2^2) / 2 from (-3, 1.5); a step is w1 *= 1 - lr, w2 *= 1 - 4 lr. Drawn at (w1, 0.35 L, w2), clipped at L = 12.

const LOSS_RINGS = [1, 3, 6, 9, 12];
const RING = Array.from({ length: 16 }, (_, i) => [round(Math.cos(i * Math.PI / 8)), 0, round(Math.sin(i * Math.PI / 8))]);
const gradientSource = `const LOSS = (w1, w2) => (w1 * w1 + 4 * w2 * w2) / 2;
const at = (lr, k) => [-3 * Math.pow(1 - lr, k), 1.5 * Math.pow(1 - 4 * lr, k)];
const spot = ([w1, w2]) => ({ position: [w1, 0.35 * LOSS(w1, w2), w2], visible: LOSS(w1, w2) <= 12 });
function verdict(lr, last) {
  const edge = Math.abs(1 - 4 * lr);
  if (edge > 1 + 1e-9) return 'Diverging: the steep direction overshoots further every step';
  if (edge > 1 - 1e-9) return 'On the edge: it bounces across the steep direction forever';
  if (last <= 0.09) return 'Good: under 1% of the starting loss in 12 steps';
  return lr < 0.4 ? 'Too slow: over 1% of the starting loss after 12 steps' : 'Oscillating: still bouncing after 12 steps';
}
export function evaluate({ inputs, time }) {
  const lr = inputs.learningRate, k = Math.min(12, Math.floor(time / 0.5));
  const nodes = { current: spot(at(lr, k)), verdict: { text: verdict(lr, LOSS(...at(lr, 12))) } };
  for (let i = 0; i <= 12; i += 1) nodes['trail' + i] = spot(at(lr, i));
  return { nodes, readouts: { loss: LOSS(...at(lr, k)), step: k, lastLoss: LOSS(...at(lr, 12)) } };
}
`;
const gradientParameters = [{ type: 'number', id: 'learningRate', label: 'Learning rate', min: 0.02, max: 0.6, step: 0.01, default: 0.2 }];
const gradientPlan = {
  schema: PLAN_SCHEMA, title: 'Gradient descent on a loss bowl', description: 'Twelve gradient descent steps on a loss bowl that is four times steeper in one direction. The learning rate decides whether the weights crawl, settle or fly out of the bowl.',
  experience: 'experiment', reason: 'One control shows slow, good and diverging training on the same loss.', behavior: 'analytical', controlProfile: 'manipulate',
  sourceRefs: [], parameters: gradientParameters, interactions: ['Change the learning rate from 0.02 to 0.6.', 'Play or scrub through the twelve steps.'],
  assumptions: ['L(w1, w2) = (w1^2 + 4 w2^2) / 2, so each weight shrinks by its own factor per step.', 'Exact gradients: no minibatch noise.'],
  limitations: ['A real network\'s loss is not a quadratic bowl, and has far more than two weights.'],
  learningGoal: 'A step stays stable only below 2 / the steepest curvature: here a learning rate of 0.5.', requiredCapabilities: ['parameters', 'readouts', 'labels', 'loop', 'speed', 'seek'],
};
export const gradientExample = {
  name: 'gradient-descent-bowl',
  plan: gradientPlan,
  artifact: {
    ...base, artifactId: 'example-gradient-descent', planHash: '0d53ae6c986e44caeba8d2b89efdbf1095735d78980eb7119f897808313dee45',
    title: gradientPlan.title, description: 'A wireframe bowl of constant-loss rings and two parabolas. Small dots mark the twelve steps, a large dot marks the current step, and a note names the behaviour.',
    experience: 'experiment', behavior: 'analytical', controlProfile: 'manipulate',
    scene: {
      materials: [{ id: 'wire', color: '#8a8f98' }, { id: 'trailDot', color: '#e0912f' }, { id: 'now', color: '#2f6fe0' }, { id: 'lowest', color: '#2f9e5b' }],
      geometries: [
        { id: 'ring', kind: 'curve', points: RING, segments: 48, closed: true },
        { id: 'shallowCut', kind: 'curve', points: [-4.9, -3.5, -2, -1, 0, 1, 2, 3.5, 4.9].map(w => [w, round(0.175 * w * w), 0]), segments: 32 },
        { id: 'steepCut', kind: 'curve', points: [-2.45, -1.75, -1, -0.5, 0, 0.5, 1, 1.75, 2.45].map(w => [0, round(0.7 * w * w), w]), segments: 32 },
        { id: 'dot', kind: 'sphere', radius: 0.09, widthSegments: 10, heightSegments: 6 },
        { id: 'ball', kind: 'sphere', radius: 0.2, widthSegments: 20, heightSegments: 12 },
        { id: 'lowestDisc', kind: 'cylinder', radius: 0.14, height: 0.03 },
        { id: 'lowestText', kind: 'label', text: 'Minimum', placement: 'below' },
        { id: 'shallowText', kind: 'label', text: 'Shallow weight w1', placement: 'right' },
        { id: 'steepText', kind: 'label', text: 'Steep weight w2', placement: 'left' },
        { id: 'verdictText', kind: 'label', text: 'Good', placement: 'above' },
      ],
      nodes: [
        ...LOSS_RINGS.map(c => ({ id: `ring${c}`, geometry: 'ring', material: 'wire', position: [0, round(0.35 * c), 0], scale: [round(Math.sqrt(2 * c)), 1, round(Math.sqrt(c / 2))] })),
        { id: 'shallowN', geometry: 'shallowCut', material: 'wire' }, { id: 'steepN', geometry: 'steepCut', material: 'wire' },
        { id: 'lowestN', geometry: 'lowestDisc', material: 'lowest', name: 'Minimum' }, { id: 'lowestTag', parent: 'lowestN', geometry: 'lowestText' },
        { id: 'shallowTag', geometry: 'shallowText', position: [4.9, 4.2, 0] }, { id: 'steepTag', geometry: 'steepText', position: [0, 4.2, 2.45] },
        { id: 'verdict', geometry: 'verdictText', position: [0, 5, 0] },
        ...Array.from({ length: 13 }, (_, i) => ({ id: `trail${i}`, geometry: 'dot', material: 'trailDot', position: [-3, 3.15, 1.5] })),
        { id: 'current', geometry: 'ball', material: 'now', position: [-3, 3.15, 1.5], name: 'Current weights' },
      ],
    },
    parameters: gradientParameters, actions: [],
    readouts: [{ id: 'loss', label: 'Loss now', decimals: 3 }, { id: 'step', label: 'Step', decimals: 0 }, { id: 'lastLoss', label: 'Loss after 12 steps', decimals: 3 }],
    timeline: { duration: 7, loop: true },
    program: program(gradientSource, '5672de07293bafc5db15d4875f7fada19d267f860330b3d71fa23d2e544440f8'),
    camera: { position: [7, 7, 10], target: [0, 1.8, 0], fov: 40 },
    assumptions: ['L(w1, w2) = (w1^2 + 4 w2^2) / 2, starting at w = (-3, 1.5) with loss 9. A step multiplies w1 by 1 - lr and w2 by 1 - 4 lr, so it is stable only below lr = 0.5.', 'Exact gradients: no minibatch noise. Steps past loss 12 are not drawn, but the readouts keep their true values.', 'A real network\'s loss is not a quadratic bowl and has far more than two weights.'],
  },
};

// ---- game, ML: teach one neuron AND ---------------------------------------------------------------------------------------
// Answers 1 when w1 x1 + w2 x2 + bias > 0. Training on an example adds (target - answer) x (x1, x2, 1) to (w1, w2, bias). All four
// correct wins; 7 updates without that loses; after either, actions do nothing. The shortest win takes 5 updates.

const EXAMPLES = [[0, 0], [0, 1], [1, 0], [1, 1]];
const perceptronSource = `const EXAMPLES = [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]];
const answer = (s, e) => (s.w1 * e[0] + s.w2 * e[1] + s.bias > 0 ? 1 : 0);
const wrong = s => EXAMPLES.filter(e => answer(s, e) !== e[2]).length;
export function initialState() { return { w1: 0, w2: 0, bias: 0, used: 0, status: 'playing' }; }
export function reduce({ state, event }) {
  if (state.status !== 'playing' || event.type !== 'action') return state;
  const e = EXAMPLES[Number(event.action.slice(5))], error = e[2] - answer(state, e);
  const next = { w1: state.w1 + error * e[0], w2: state.w2 + error * e[1], bias: state.bias + error, used: state.used + 1 };
  return { ...next, status: wrong(next) === 0 ? 'won' : next.used >= 7 ? 'lost' : 'playing' };
}
export function evaluate({ state }) {
  const s = state || initialState(), bad = wrong(s), nodes = {}, materials = {};
  EXAMPLES.forEach((e, i) => {
    const got = answer(s, e);
    nodes['note' + i] = { text: '(' + e[0] + ',' + e[1] + ') want ' + e[2] + ', says ' + got };
    materials['point' + i] = { color: got === e[2] ? '#2f9e5b' : '#d64545' };
  });
  nodes.weights = { text: 'w1 ' + s.w1 + ', w2 ' + s.w2 + ', bias ' + s.bias };
  const size = Math.hypot(s.w1, s.w2), off = size ? (1.5 * s.w1 + 1.5 * s.w2 + 3 * s.bias) / size : 0;
  if (size && Math.abs(off) <= 4.5) {
    const turn = Math.atan2(s.w1, s.w2) / 2;
    nodes.line = { visible: true, position: [1.5 - off * s.w1 / size, 0.06, 1.5 - off * s.w2 / size], quaternion: [0, Math.sin(turn), 0, Math.cos(turn)] };
  } else nodes.line = { visible: false };
  const message = s.status === 'won' ? 'All four correct in ' + s.used + ' updates: this neuron now computes AND.'
    : s.status === 'lost' ? 'Out of updates. Only training on a wrong answer changes the weights, and the order matters.'
      : bad + ' of 4 answers wrong. Choose an example to train on.';
  return { nodes, materials, readouts: { updatesLeft: 7 - s.used, wrong: bad }, goal: { status: s.status, message } };
}
`;
const perceptronPlan = {
  schema: PLAN_SCHEMA, title: 'Teach a neuron AND', description: 'One neuron starts with all weights at zero. Choose which example to train on with the perceptron rule until its line separates the single 1 from the three 0s.',
  experience: 'game', reason: 'Choosing each update shows that learning is driven by errors, and that the order of examples changes how fast it converges.', behavior: 'rules', controlProfile: 'manipulate',
  sourceRefs: [], parameters: [], interactions: ['Train the neuron on one of the four examples.'],
  assumptions: ['Perceptron rule with learning rate 1 and a hard threshold.', 'A point exactly on the line counts as 0.'],
  limitations: ['Real training visits examples automatically; here the learner picks the order.', 'One straight line cannot compute XOR.'],
  learningGoal: 'A perceptron only changes when it is wrong, and AND is linearly separable.', requiredCapabilities: ['actions', 'readouts', 'labels'],
};
export const perceptronExample = {
  name: 'perceptron-and-game',
  plan: perceptronPlan,
  artifact: {
    ...base, artifactId: 'example-perceptron-and', planHash: '946ba7112a76febcd975b5864e8626760fbfee2af35cf57e34962f817dc958a2',
    title: perceptronPlan.title, description: 'Four points on a square, one per input pair, green when the neuron answers correctly and red when it does not. A blue bar is the neuron\'s decision line, and an arrow points to the side it answers 1.',
    experience: 'game', behavior: 'rules', controlProfile: 'manipulate',
    scene: {
      materials: [{ id: 'board', color: '#9aa3ae', opacity: 0.3 }, { id: 'lineBlue', color: '#2f6fe0' }, ...EXAMPLES.map((_, i) => ({ id: `point${i}`, color: i === 3 ? '#d64545' : '#2f9e5b' }))],
      geometries: [
        { id: 'boardPlane', kind: 'plane', width: 6, height: 6 },
        { id: 'pointBall', kind: 'sphere', radius: 0.28, widthSegments: 24, heightSegments: 12 },
        { id: 'lineBar', kind: 'box', size: [8, 0.06, 0.1] },
        { id: 'sideArrow', kind: 'arrow', length: 0.9 },
        { id: 'sideText', kind: 'label', text: 'Says 1', placement: 'right' },
        { id: 'weightText', kind: 'label', text: 'w1 0, w2 0, bias 0', placement: 'above' },
        ...EXAMPLES.map((_, i) => ({ id: `noteText${i}`, kind: 'label', text: 'Answer', placement: 'above' })),
      ],
      nodes: [
        { id: 'boardN', geometry: 'boardPlane', material: 'board', position: [1.5, 0, 1.5], quaternion: FLAT },
        ...EXAMPLES.flatMap(([a, b], i) => [
          { id: `point${i}N`, geometry: 'pointBall', material: `point${i}`, position: [3 * a, 0.28, 3 * b], name: `Example (${a},${b})` },
          { id: `note${i}`, geometry: `noteText${i}`, position: [3 * a, 0.6, 3 * b] },
        ]),
        { id: 'line', visible: false, position: [1.5, 0.06, 1.5] },
        { id: 'lineShape', parent: 'line', geometry: 'lineBar', material: 'lineBlue', name: 'Decision line' },
        { id: 'side', parent: 'line', geometry: 'sideArrow', material: 'lineBlue', quaternion: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] },
        { id: 'sideTag', parent: 'side', geometry: 'sideText', position: [0, 1, 0] },
        { id: 'weights', geometry: 'weightText', position: [1.5, 0, -1] },
      ],
    },
    parameters: [],
    actions: EXAMPLES.map(([a, b], i) => ({ id: `train${i}`, label: `Train (${a},${b})` })),
    readouts: [{ id: 'updatesLeft', label: 'Updates left', decimals: 0 }, { id: 'wrong', label: 'Wrong answers', decimals: 0 }],
    game: { objective: 'Train the neuron until all four answers of AND are correct, within 7 updates.', hint: 'Training on a correct answer changes nothing and still costs an update. Begin with (1,1), then (0,0). The shortest win takes 5 updates.' },
    program: program(perceptronSource, '327cf213830df2b052a6cb56c42e05d9bacd7f8bd447de891672c0982f453434'),
    camera: { position: [1.5, 8, 7.5], target: [1.5, 0, 1.5], fov: 40 },
    assumptions: ['One neuron answers 1 when w1 x1 + w2 x2 + bias > 0, so a point exactly on the line counts as 0. Perceptron rule, learning rate 1.', 'Real training visits examples automatically; here you choose the order.', 'One straight line cannot compute XOR: that needs more neurons.'],
  },
};

// ---- watch, biology: predator and prey ------------------------------------------------------------------------------------
// Lotka-Volterra: dx/dt = 1.1 x - 0.4 x y, dy/dt = 0.1 x y - 0.4 y, from x = 10, y = 2. One orbit takes 10.2498 years, the loop's
// duration, and one second of playback is one year. Heights are 0.4 x population.

const lotkaVolterra = (x, y) => [1.1 * x - 0.4 * x * y, 0.1 * x * y - 0.4 * y];
const ORBIT_YEARS = 10.2498;
// The drawn curves: the same equations sampled once here (RK4), checked against the oracle's own integration in the tests.
const orbitSamples = count => {
  const samples = [];
  let [x, y] = [10, 2];
  for (let i = 0; i < count; i += 1) {
    samples.push([x, y]);
    const steps = 20, h = ORBIT_YEARS / (count - 1) / steps;
    for (let j = 0; j < steps; j += 1) {
      const a = lotkaVolterra(x, y), b = lotkaVolterra(x + h / 2 * a[0], y + h / 2 * a[1]), c = lotkaVolterra(x + h / 2 * b[0], y + h / 2 * b[1]), d = lotkaVolterra(x + h * c[0], y + h * c[1]);
      [x, y] = [x + h / 6 * (a[0] + 2 * b[0] + 2 * c[0] + d[0]), y + h / 6 * (a[1] + 2 * b[1] + 2 * c[1] + d[1])];
    }
  }
  return samples;
};
const ORBIT = orbitSamples(41);
const curveX = i => round(8 * i / (ORBIT.length - 1));
const peakOf = axis => ORBIT.reduce((best, sample, i) => (sample[axis] > ORBIT[best][axis] ? i : best), 0);
const predatorPreySource = `const YEARS = 10.2498;
const f = (x, y) => [1.1 * x - 0.4 * x * y, 0.1 * x * y - 0.4 * y];
function solve(time) {
  let x = 10, y = 2;
  const n = Math.ceil(time / 0.02), h = n ? time / n : 0;
  for (let i = 0; i < n; i += 1) {
    const a = f(x, y), b = f(x + h / 2 * a[0], y + h / 2 * a[1]), c = f(x + h / 2 * b[0], y + h / 2 * b[1]), d = f(x + h * c[0], y + h * c[1]);
    const dx = h / 6 * (a[0] + 2 * b[0] + 2 * c[0] + d[0]), dy = h / 6 * (a[1] + 2 * b[1] + 2 * c[1] + d[1]);
    x += dx; y += dy;
  }
  return [x, y];
}
export function evaluate({ time }) {
  const [x, y] = solve(time), at = 8 * time / YEARS, tall = 0.4 * x, low = 0.4 * y;
  return {
    nodes: {
      playhead: { position: [at, 2.3, 0] }, preyDot: { position: [at, tall, 0] }, predatorDot: { position: [at, low, 0] },
      preyBar: { position: [9.5, tall / 2, 0], scale: [1, tall, 1] }, predatorBar: { position: [10.6, low / 2, 0], scale: [1, low, 1] },
      preyValue: { position: [9.5, tall, 0], text: 'Prey ' + x.toFixed(1) }, predatorValue: { position: [10.6, low, 0], text: 'Predators ' + y.toFixed(1) },
    },
    readouts: { year: time, prey: x, predators: y },
  };
}
`;
const predatorPreyPlan = {
  schema: PLAN_SCHEMA, title: 'Predator and prey cycle', description: 'One full Lotka-Volterra cycle: prey multiply, predators follow them up, prey collapse, then predators decline and the cycle repeats.',
  experience: 'watch', reason: 'The delay between the two peaks is easiest to see as one continuous loop.', behavior: 'analytical', controlProfile: 'inspect',
  sourceRefs: [], parameters: [], interactions: ['Play, pause, scrub and change the speed.'],
  assumptions: ['dx/dt = 1.1 x - 0.4 x y and dy/dt = 0.1 x y - 0.4 y, from x = 10 and y = 2, in arbitrary population units.', 'Continuous populations, no carrying capacity, no chance events.'],
  limitations: ['The rates are chosen to show the cycle; they are not fitted to any real species.'],
  learningGoal: 'Predator numbers peak after prey numbers, because predators grow only while prey are plentiful.', requiredCapabilities: ['loop', 'speed', 'seek', 'labels', 'readouts'], duration: ORBIT_YEARS,
};
export const predatorPreyExample = {
  name: 'predator-prey-cycle',
  plan: predatorPreyPlan,
  artifact: {
    ...base, artifactId: 'example-predator-prey', planHash: '59f57a89ada85d9269482b0851d96cf4e7e7629db0f2d5fd354d1638492a358a',
    title: predatorPreyPlan.title, description: 'Two curves over one cycle, prey in green and predators in orange, with a playhead moving along them. Two bars on the right show the current population of each.',
    experience: 'watch', behavior: 'analytical', controlProfile: 'inspect',
    scene: {
      materials: [{ id: 'preyGreen', color: '#2f9e5b' }, { id: 'predatorOrange', color: '#e0702f' }, { id: 'axis', color: '#8a8f98' }],
      geometries: [
        { id: 'preyCurve', kind: 'curve', points: ORBIT.map(([x], i) => [curveX(i), round(0.4 * x), 0]), segments: 160 },
        { id: 'predatorCurve', kind: 'curve', points: ORBIT.map(([, y], i) => [curveX(i), round(0.4 * y), 0]), segments: 160 },
        { id: 'timeAxis', kind: 'line', points: [[0, 0, 0], [11.3, 0, 0]] },
        { id: 'head', kind: 'box', size: [0.03, 4.6, 0.03] },
        { id: 'marker', kind: 'sphere', radius: 0.12, widthSegments: 16, heightSegments: 10 },
        { id: 'bar', kind: 'box', size: [0.8, 1, 0.8] },
        { id: 'preyPeakText', kind: 'label', text: 'Prey peak', placement: 'above' },
        { id: 'predatorPeakText', kind: 'label', text: 'Predator peak follows', placement: 'above' },
        { id: 'yearsText', kind: 'label', text: 'One cycle: 10.2 years', placement: 'below' },
        { id: 'preyText', kind: 'label', text: 'Prey', placement: 'above' },
        { id: 'predatorText', kind: 'label', text: 'Predators', placement: 'above' },
      ],
      nodes: [
        { id: 'preyLine', geometry: 'preyCurve', material: 'preyGreen', name: 'Prey' }, { id: 'predatorLine', geometry: 'predatorCurve', material: 'predatorOrange', name: 'Predators' },
        { id: 'axisN', geometry: 'timeAxis', material: 'axis' }, { id: 'playhead', geometry: 'head', material: 'axis', position: [0, 2.3, 0] },
        { id: 'preyDot', geometry: 'marker', material: 'preyGreen', position: [0, 4, 0] }, { id: 'predatorDot', geometry: 'marker', material: 'predatorOrange', position: [0, 0.8, 0] },
        { id: 'preyBar', geometry: 'bar', material: 'preyGreen', position: [9.5, 2, 0], scale: [1, 4, 1], name: 'Prey now' }, { id: 'predatorBar', geometry: 'bar', material: 'predatorOrange', position: [10.6, 0.4, 0], scale: [1, 0.8, 1], name: 'Predators now' },
        { id: 'preyPeak', geometry: 'preyPeakText', position: [curveX(peakOf(0)), round(0.4 * ORBIT[peakOf(0)][0]), 0] },
        { id: 'predatorPeak', geometry: 'predatorPeakText', position: [curveX(peakOf(1)), round(0.4 * ORBIT[peakOf(1)][1]), 0] },
        { id: 'yearsNote', geometry: 'yearsText', position: [4, 0, 0] },
        { id: 'preyValue', geometry: 'preyText', position: [9.5, 4, 0] }, { id: 'predatorValue', geometry: 'predatorText', position: [10.6, 0.8, 0] },
      ],
    },
    parameters: [], actions: [],
    readouts: [{ id: 'year', label: 'Year', decimals: 1 }, { id: 'prey', label: 'Prey', decimals: 2 }, { id: 'predators', label: 'Predators', decimals: 2 }],
    timeline: { duration: ORBIT_YEARS, loop: true },
    program: program(predatorPreySource, '10129f5338c0122aa386b2fa6a7fb15b6a44fb6b9b0c2ec3cd9d724e5959bef5'),
    camera: { position: [5.6, 3, 15], target: [5.6, 2.1, 0], fov: 40 },
    assumptions: ['Lotka-Volterra: dx/dt = 1.1 x - 0.4 x y, dy/dt = 0.1 x y - 0.4 y, from x = 10, y = 2, solved numerically. Bar and curve heights share one scale; population units are arbitrary.', 'Continuous populations with no carrying capacity and no chance events, so the cycle repeats exactly. Real populations do not.', 'The rates are chosen to show the cycle; they are not fitted to any real species.'],
  },
};

export const LEARNING_EXAMPLES = Object.freeze([temperatureExample, gradientExample, perceptronExample, predatorPreyExample]);
