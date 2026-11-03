// The hand-written /animation examples (learning-examples.js): valid against the contract and the MVP capabilities, hashes pinned as
// fixtures.js's are, under the size an author is held to, and each program, run on the real engine, agreeing with formulas written
// independently (e2e/animation-examples-oracle.mjs) over its whole range. Plausible wrong programs must disagree, so the oracle can fail.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LEARNING_EXAMPLES, gradientExample, perceptronExample, predatorPreyExample, temperatureExample } from './learning-examples.js';
import { hashAnimationPlan, hashProgramSource, validateAnimationArtifact, validateAnimationFrame, validateAnimationPlan } from './contract.js';
import { ANIMATION_FIXTURES } from './fixtures.js';
import { ANIMATION_DRAFT_BYTES } from '../../../control-plane/src/agents/animation-author.js';
import { loadEngine, runProgram } from '../explain-program/runtime.js';
import { LIMITS } from '../explain-program/limits.js';
import { close, rotate } from '../../e2e/animation-oracle.mjs';
import { AND, gradientBehaviour, gradientLoss, gradientPath, perceptron, predatorInvariant, predatorPrey, softmax } from '../../e2e/animation-examples-oracle.mjs';

const RELAXED = { ...LIMITS, interruptMs: LIMITS.watchdogMs }; // as oracle.test.mjs: termination is not under test here
let engine;
before(async () => { engine = await loadEngine(); });

function scene(example, source = example.artifact.program.source) {
  const parsed = validateAnimationArtifact(example.artifact);
  assert.deepEqual(parsed.issues, undefined, example.name);
  const call = (operation, request) => {
    const out = runProgram(engine, { source, request: { seed: 1, time: 0, inputs: {}, ...request }, operation }, RELAXED);
    if (!out.ok) throw Error(`${operation}: ${out.code} ${out.detail || ''}`);
    return out.value;
  };
  return {
    evaluate: request => { const frame = validateAnimationFrame(call('evaluate', request), parsed.value); assert.deepEqual(frame.issues, undefined, example.name); return frame.value; },
    play(actions) {
      let state = call('initialize', {});
      for (const action of actions) state = call('reduce', { state, event: { type: 'action', action } });
      return this.evaluate({ state });
    },
  };
}
const eq = (got, want, what) => assert.ok(close(got, want), `${what}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
const range = (min, max, step) => Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => Number((min + i * step).toFixed(6)));
const BARS = ['mat', 'floor', 'sofa', 'roof', 'moon'];
const TEMPERATURES = range(0.1, 5, 0.1), RATES = range(0.02, 0.6, 0.01), SECONDS = range(0, 6.5, 0.5);
const TRAIN = ['train0', 'train1', 'train2', 'train3'];
const WIN = ['train3', 'train0', 'train1', 'train3', 'train2'];
const PERIOD = 10.2498;

// Each check throws at the first disagreement; a mutant must make it throw.
function checkTemperature(example, source) {
  const program = scene(example, source);
  for (const temperature of TEMPERATURES) {
    const frame = program.evaluate({ inputs: { temperature } }), want = softmax(temperature), at = `T=${temperature}`;
    eq(frame.readouts.topProbability, 100 * want.top, `${at} top`);
    eq(frame.readouts.entropy, want.entropy, `${at} entropy`);
    BARS.forEach((word, i) => {
      const height = Math.max(0.02, 5 * want.p[i]);
      eq(frame.nodes[word].scale, [1, height, 1], `${at} ${word} height`);
      eq(frame.nodes[word].position, [i * 2 - 4, height / 2, 0], `${at} ${word} position`);
      assert.equal(frame.nodes[`${word}Value`].text, `${(100 * want.p[i]).toFixed(1)}%`, `${at} ${word} text`);
    });
    assert.ok(frame.nodes.entropyNote.text.includes(want.entropy.toFixed(2)), `${at} entropy note`);
  }
}
const VERDICTS = { diverging: /^Diverging/, edge: /^On the edge/, good: /^Good/, slow: /^Too slow/, oscillating: /^Oscillating/ };
function checkGradient(example, source) {
  const program = scene(example, source);
  for (const learningRate of RATES) {
    const path = gradientPath(learningRate);
    for (const time of SECONDS) {
      const frame = program.evaluate({ inputs: { learningRate }, time }), step = Math.min(12, Math.floor(time / 0.5)), at = `lr=${learningRate} t=${time}`;
      eq(frame.readouts.step, step, `${at} step`);
      eq(frame.readouts.loss, gradientLoss(path[step]), `${at} loss`);
      eq(frame.readouts.lastLoss, gradientLoss(path[12]), `${at} last loss`);
      eq(frame.nodes.current.position, [path[step][0], 0.35 * gradientLoss(path[step]), path[step][1]], `${at} current`);
      assert.equal(frame.nodes.current.visible, gradientLoss(path[step]) <= 12, `${at} current inside the bowl`);
      assert.match(frame.nodes.verdict.text, VERDICTS[gradientBehaviour(learningRate)], at);
      path.forEach((point, k) => { eq(frame.nodes[`trail${k}`].position, [point[0], 0.35 * gradientLoss(point), point[1]], `${at} trail ${k}`); assert.equal(frame.nodes[`trail${k}`].visible, gradientLoss(point) <= 12, `${at} trail ${k} clip`); });
    }
  }
}
const SEQUENCES = [[], ...TRAIN.map(a => [a]), ...TRAIN.flatMap(a => TRAIN.map(b => [a, b])), ...TRAIN.flatMap(a => TRAIN.flatMap(b => TRAIN.map(c => [a, b, c]))),
  WIN, [...WIN, 'train0'], ['train0', ...WIN], ['train0', 'train1', ...WIN], ['train0', 'train1', 'train2', ...WIN], Array(7).fill('train0'), Array(8).fill('train3'), [...Array(7).fill('train1'), 'train3']];
function checkPerceptron(example, source) {
  const program = scene(example, source);
  for (const actions of SEQUENCES) {
    const frame = program.play(actions), want = perceptron(actions.map(id => Number(id.slice(5)))), at = actions.join(',') || 'start';
    assert.equal(frame.goal.status, want.status, `${at} status`);
    eq(frame.readouts.updatesLeft, 7 - want.used, `${at} updates left`);
    eq(frame.readouts.wrong, want.wrong, `${at} wrong`);
    assert.equal(frame.nodes.weights.text, `w1 ${want.w[0]}, w2 ${want.w[1]}, bias ${want.b}`, `${at} weights`);
    AND.forEach(({ x, target }, i) => {
      assert.equal(frame.nodes[`note${i}`].text, `(${x[0]},${x[1]}) want ${target}, says ${want.answers[i]}`, `${at} note ${i}`);
      assert.equal(frame.materials[`point${i}`].color, want.answers[i] === target ? '#2f9e5b' : '#d64545', `${at} colour ${i}`);
    });
    // The drawn line: its point lies on w1 x1 + w2 x2 + b = 0 (world x = 3 x1, z = 3 x2) and its arrow points to the side answering 1.
    const size = Math.hypot(...want.w), off = size ? (1.5 * want.w[0] + 1.5 * want.w[1] + 3 * want.b) / size : Infinity;
    assert.equal(frame.nodes.line.visible, Math.abs(off) <= 3.5, `${at} line shown`);
    if (frame.nodes.line.visible) {
      const [px, , pz] = frame.nodes.line.position, q = frame.nodes.line.quaternion;
      eq(want.w[0] * px / 3 + want.w[1] * pz / 3 + want.b, 0, `${at} line point`);
      eq(rotate([0, 0, 1], q), [want.w[0] / size, 0, want.w[1] / size], `${at} arrow`);
    }
  }
}
function checkPredatorPrey(example, source) {
  const program = scene(example, source);
  for (const time of range(0, 10, 0.25).concat(PERIOD)) {
    const frame = program.evaluate({ time }), want = predatorPrey(time), at = `t=${time}`, allow = 1e-4;
    assert.ok(Math.abs(frame.readouts.prey - want.x) < allow && Math.abs(frame.readouts.predators - want.y) < allow, `${at}: ${frame.readouts.prey},${frame.readouts.predators} != ${want.x},${want.y}`);
    eq(frame.readouts.year, time, `${at} year`);
    eq(frame.nodes.preyBar.scale, [1, 0.4 * frame.readouts.prey, 1], `${at} prey bar`);
    eq(frame.nodes.predatorDot.position, [8 * time / PERIOD, 0.4 * frame.readouts.predators, 0], `${at} predator dot`);
    assert.ok(Math.abs(predatorInvariant(frame.readouts.prey, frame.readouts.predators) - predatorInvariant(10, 2)) < 1e-4, `${at} the conserved quantity holds`);
  }
}

test('every example validates as a draft, with pinned hashes and at most the size an author is held to, and none is in the Insert palette', async () => {
  assert.equal(LEARNING_EXAMPLES.length, 4);
  for (const { name, plan, artifact } of LEARNING_EXAMPLES) {
    assert.deepEqual(validateAnimationPlan(plan).issues, undefined, name);
    const result = validateAnimationArtifact(artifact, undefined, { draft: true });
    assert.deepEqual(result.issues, undefined, name);
    assert.equal(artifact.planHash, await hashAnimationPlan(plan), `${name} planHash`);
    assert.equal(artifact.program.sourceHash, await hashProgramSource(artifact.program.source), `${name} sourceHash`);
    assert.equal(result.value.provenance.origin, 'fixture', `${name} is labelled hand-written`);
    assert.equal(plan.experience, artifact.experience, name);
    assert.ok(JSON.stringify(result.value).length < ANIMATION_DRAFT_BYTES, `${name}: ${JSON.stringify(result.value).length} bytes`);
    assert.ok(result.value.assumptions.length > 0, `${name} states its assumptions`);
    assert.ok(!ANIMATION_FIXTURES.some(fixture => fixture.name === name), name);
    assert.doesNotMatch(JSON.stringify([plan.title, artifact.description, artifact.assumptions, artifact.game]), /\.\.\.|…/, `${name}: no ellipsis`);
  }
  assert.deepEqual(LEARNING_EXAMPLES.map(example => example.artifact.experience), ['experiment', 'experiment', 'game', 'watch']);
});

test('the oracle agrees with values worked out by hand', () => {
  const near = (got, want, allow, what) => assert.ok(Math.abs(got - want) < allow, `${what}: ${got} != ${want}`);
  // exp(4, 3, 2.5, 1, -1) = 54.598, 20.086, 12.182, 2.718, 0.368; total 89.952.
  near(softmax(1).top, 54.598 / 89.952, 1e-4, 'T = 1 top');
  // p = .6070, .2233, .1354, .0302, .0041; -p log2 p = .4372, .4830, .3906, .1525, .0325.
  near(softmax(1).entropy, 1.4958, 1e-3, 'T = 1 entropy');
  near(softmax(0.1).top, 1, 1e-3, 'T = 0.1 is nearly greedy');
  assert.ok(softmax(5).entropy > 2.1 && softmax(5).entropy < Math.log2(5), 'T = 5 approaches uniform');
  // L_k = 4.5 (1 - lr)^(2k) + 4.5 (1 - 4 lr)^(2k).
  near(gradientLoss(gradientPath(0.2)[12]), 4.5 * 0.8 ** 24 + 4.5 * 0.2 ** 24, 1e-9, 'lr 0.2');
  assert.deepEqual([0.05, 0.2, 0.4, 0.48, 0.5, 0.55].map(gradientBehaviour), ['slow', 'good', 'good', 'oscillating', 'edge', 'diverging']);
  near(gradientLoss(gradientPath(0.55)[12]), 4.5 * 0.45 ** 24 + 4.5 * 1.2 ** 24, 1e-6, 'lr 0.55');
  // The route in the hint, worked by hand: (1,1) -> w 1,1 b 1; (0,0) -> b 0; (0,1) -> w 1,0 b -1; (1,1) -> w 2,1 b 0; (1,0) -> w 1,1 b -1.
  const won = perceptron([3, 0, 1, 3, 2]);
  assert.deepEqual([won.w, won.b, won.used, won.status, won.answers], [[1, 1], -1, 5, 'won', [0, 0, 0, 1]]);
  assert.equal(perceptron(Array(7).fill(0)).status, 'lost', 'training on a correct answer never wins');
  // The objective's numbers: no win in 4 updates, by trying every sequence.
  const sequences = n => (n ? sequences(n - 1).flatMap(s => [0, 1, 2, 3].map(pick => [...s, pick])) : [[]]);
  for (const n of [0, 1, 2, 3, 4]) assert.ok(!sequences(n).some(s => perceptron(s).status === 'won'), `no win in ${n}`);
  assert.ok(sequences(5).some(s => perceptron(s).status === 'won'));
  // Predator and prey: the stated period closes the orbit, and predators peak after prey.
  const end = predatorPrey(PERIOD);
  near(end.x, 10, 5e-3, 'x after one orbit');
  near(end.y, 2, 5e-3, 'y after one orbit');
  const grid = range(0, 10, 0.05).map(t => [t, predatorPrey(t)]), peak = key => grid.reduce((a, b) => (b[1][key] > a[1][key] ? b : a))[0];
  assert.ok(peak('y') > peak('x') && peak('y') < peak('x') + PERIOD / 2, `prey ${peak('x')}, predators ${peak('y')}`);
});

test('softmax temperature: bars, labels and readouts match the formula at every temperature on the engine', () => checkTemperature(temperatureExample));
test('gradient descent: every rate and step matches repeated gradient steps, with the right verdict and clipping', () => checkGradient(gradientExample));
test('perceptron game: rules, win, loss, ignored moves and the drawn line match the perceptron rule', () => checkPerceptron(perceptronExample));
test('predator and prey: the program matches a finer independent integration and conserves the invariant', () => checkPredatorPrey(predatorPreyExample));

test('the drawn predator and prey curves are the integration the program runs', () => {
  const geometry = id => predatorPreyExample.artifact.scene.geometries.find(g => g.id === id).points;
  const prey = geometry('preyCurve'), predators = geometry('predatorCurve');
  prey.forEach(([x, height], i) => {
    const time = x / 8 * PERIOD, want = predatorPrey(time);
    assert.ok(Math.abs(height - 0.4 * want.x) < 0.02 && Math.abs(predators[i][1] - 0.4 * want.y) < 0.02, `t=${time}: ${height}, ${predators[i][1]}`);
  });
});

test('plausible wrong programs disagree with the oracle', () => {
  const mutants = [
    [checkTemperature, temperatureExample, '/ inputs.temperature', '* inputs.temperature', 'multiplying by temperature'],
    [checkTemperature, temperatureExample, 'Math.log2(value)', 'Math.log(value)', 'entropy in nats'],
    [checkTemperature, temperatureExample, '5 * p[i]', '3 * p[i]', 'bars on another scale'],
    [checkGradient, gradientExample, '1.5 * Math.pow(1 - 4 * lr, k)', '1.5 * Math.pow(1 - lr, k)', 'a round bowl'],
    [checkGradient, gradientExample, '4 * w2 * w2', 'w2 * w2', 'the wrong loss'],
    [checkGradient, gradientExample, 'last <= 0.09', 'last <= 0.9', 'a lax verdict'],
    [checkGradient, gradientExample, 'LOSS(w1, w2) <= 12 }', 'true }', 'no clipping'],
    [checkPerceptron, perceptronExample, 'state.w1 + error * e[0]', 'state.w1 + e[0]', 'updates that ignore the error'],
    [checkPerceptron, perceptronExample, '+ s.bias > 0', '+ s.bias >= 0', 'a point on the line counting as 1'],
    [checkPerceptron, perceptronExample, 'next.used >= 7', 'next.used >= 8', 'a longer budget'],
    [checkPerceptron, perceptronExample, "state.status !== 'playing' || ", '', 'moves accepted after the end'],
    [checkPredatorPrey, predatorPreyExample, '0.1 * x * y - 0.4 * y', '0.1 * x * y - 0.5 * y', 'another predator death rate'],
    [checkPredatorPrey, predatorPreyExample, 'tall = 0.4 * x', 'tall = 0.3 * x', 'bars off the curve scale'],
  ];
  for (const [check, example, from, to, why] of mutants) {
    const source = example.artifact.program.source;
    assert.ok(source.includes(from), `mutant "${why}": the source no longer contains ${from}`);
    assert.throws(() => check(example, source.replace(from, to)), undefined, `the oracle accepted ${why}`);
  }
});
