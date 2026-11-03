// The hand-written /animation examples (learning-examples.js): valid against the contract and the MVP capabilities, hashes pinned as
// fixtures.js's are, under the size an author is held to, and each program, run on the real engine, agreeing with formulas written
// independently (e2e/animation-examples-oracle.mjs) over its whole range. Plausible wrong programs must disagree, so the oracle can fail.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LEARNING_EXAMPLES, predatorPreyExample, projectileExample } from './learning-examples.js';
import { hashAnimationPlan, hashProgramSource, validateAnimationArtifact, validateAnimationFrame, validateAnimationPlan } from './contract.js';
import { ANIMATION_FIXTURES } from './fixtures.js';
import { ANIMATION_DRAFT_BYTES } from '../../../control-plane/src/agents/animation-author.js';
import { loadEngine, runProgram } from '../explain-program/runtime.js';
import { LIMITS } from '../explain-program/limits.js';
import { close, rotate } from '../../e2e/animation-oracle.mjs';
import { GRAVITY, predatorInvariant, predatorPrey, projectileGame, projectileHeightAt, projectileRange, projectileStepped } from '../../e2e/animation-examples-oracle.mjs';

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
const PERIOD = 10.2498;
const repeat = (action, n) => Array(n).fill(action);
// Aim at (angle, speed) from the start (30 degrees, 14 m/s) and launch.
const aimAt = (angle, speed) => [...repeat(angle > 30 ? 'angleUp' : 'angleDown', Math.abs(angle - 30) / 5), ...repeat(speed > 14 ? 'faster' : 'slower', Math.abs(speed - 14)), 'launch'];
const AIMS = [10, 25, 35, 45, 60, 80].flatMap(angle => [5, 14, 17, 18, 22].map(speed => [angle, speed])); // a sample: every call is a fresh engine context

// Each check throws at the first disagreement; a mutant must make it throw.
function checkProjectile(example, source) {
  const program = scene(example, source);
  const sequences = [[], ['angleUp'], ['angleDown', 'slower'], repeat('angleUp', 12), repeat('angleDown', 6), repeat('faster', 10), repeat('slower', 12),
    ...AIMS.map(([angle, speed]) => aimAt(angle, speed)),
    [...aimAt(45, 17), 'angleUp', 'launch'], [...repeat('launch', 5)], [...repeat('launch', 6), 'angleUp'], ['launch', ...aimAt(45, 17)], [...repeat('launch', 4), ...aimAt(40, 18)]];
  for (const actions of sequences) {
    const frame = program.play(actions), want = projectileGame(actions), at = actions.join(',') || 'start';
    assert.equal(frame.goal.status, want.status, `${at} status`);
    eq(frame.readouts.launchesLeft, 5 - want.launches, `${at} launches left`);
    eq(frame.readouts.angle, want.angle, `${at} angle`);
    eq(frame.readouts.speed, want.speed, `${at} speed`);
    // The aim arrow points along (cos theta, sin theta) and grows with the speed.
    eq(rotate([0, 1, 0], frame.nodes.aim.quaternion), [Math.cos(want.angle * Math.PI / 180), Math.sin(want.angle * Math.PI / 180), 0], `${at} aim`);
    eq(frame.nodes.aim.scale, [1, want.speed / 2, 1], `${at} aim length`);
    if (want.landed === null) {
      assert.ok(!('landing' in frame.readouts) && !('miss' in frame.readouts), `${at}: nothing landed yet`);
      assert.equal(frame.nodes.arc0.visible, false, `${at}: no arc yet`);
      continue;
    }
    eq(frame.readouts.landing, want.landed, `${at} landing`);
    eq(frame.readouts.miss, want.landed - 30, `${at} miss`);
    eq(frame.nodes.landing.position, [want.landed, 0.1, 0], `${at} landing marker`);
    assert.equal(frame.nodes.landingNote.text, `Landed ${want.landed.toFixed(1)} m`, `${at} landing note`);
    // The arc is the last launch's path: every dot on y(x), the first at the launcher and the last where it landed.
    const launched = projectileGame(actions.slice(0, actions.lastIndexOf('launch')));
    for (let k = 0; k <= 14; k += 1) {
      const [x, y] = frame.nodes[`arc${k}`].position;
      assert.ok(Math.abs(y - Math.max(0, projectileHeightAt(launched.angle, launched.speed, x))) < 1e-6, `${at} dot ${k} off the path: ${x}, ${y}`);
    }
    eq(frame.nodes.arc0.position, [0, 0, 0], `${at} first dot`);
    assert.ok(Math.abs(frame.nodes.arc14.position[0] - want.landed) < 1e-6, `${at} last dot at the landing`);
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
  assert.equal(LEARNING_EXAMPLES.length, 2);
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
  assert.deepEqual(LEARNING_EXAMPLES.map(example => example.artifact.experience), ['game', 'watch']);
  // The keys are the scene's own declared moves (contract keys: one action per press, never held).
  assert.deepEqual(projectileExample.artifact.keys, { up: 'angleUp', down: 'angleDown', left: 'slower', right: 'faster' });
});

test('the oracle agrees with values worked out by hand and with a stepped flight', () => {
  const near = (got, want, allow, what) => assert.ok(Math.abs(got - want) < allow, `${what}: ${got} != ${want}`);
  // 17^2 sin 90 / 9.81 = 289 / 9.81 = 29.46; 14^2 sin 60 / 9.81 = 196 x 0.8660 / 9.81 = 17.30; 22^2 / 9.81 = 49.34 at 45.
  near(projectileRange(45, 17), 29.46, 0.01, '17 m/s at 45');
  near(projectileRange(30, 14), 17.30, 0.01, 'the start');
  near(projectileRange(45, 22), 49.34, 0.01, 'the farthest shot');
  near(projectileRange(30, 19), projectileRange(60, 19), 1e-9, 'complementary angles land together');
  near(projectileRange(45, 20) / projectileRange(45, 10), 4, 1e-9, 'twice the speed, four times the range');
  for (const [angle, speed] of [[10, 5], [30, 14], [45, 17], [80, 22], [35, 18]]) near(projectileStepped(angle, speed), projectileRange(angle, speed), 0.01, `stepped ${angle} deg ${speed} m/s`);
  near(projectileHeightAt(45, 17, projectileRange(45, 17) / 2), 17 * 17 / (4 * GRAVITY), 1e-9, 'peak height v^2 sin^2 / 2g at 45');
  assert.equal(projectileGame(aimAt(45, 17)).status, 'won', '17 m/s at 45 lands 0.54 m short: a hit');
  assert.equal(projectileGame(aimAt(35, 18)).status, 'won', '18 m/s at 35 lands 31.04 m: a hit');
  assert.equal(projectileGame(aimAt(30, 18)).status, 'won', '18 m/s at 30 lands 28.60 m: 1.40 m short, inside 1.5');
  assert.equal(projectileGame(aimAt(45, 18)).status, 'playing', '18 m/s at 45 lands 33.03 m: 3.03 m long, a miss');
  assert.equal(projectileGame(repeat('launch', 5)).status, 'lost');
  assert.equal(projectileGame([...repeat('launch', 5), ...aimAt(45, 17)]).launches, 5, 'nothing after the end');
  // Predator and prey: the stated period closes the orbit, and predators peak after prey.
  const end = predatorPrey(PERIOD);
  near(end.x, 10, 5e-3, 'x after one orbit');
  near(end.y, 2, 5e-3, 'y after one orbit');
  const grid = range(0, 10, 0.05).map(t => [t, predatorPrey(t)]), peak = key => grid.reduce((a, b) => (b[1][key] > a[1][key] ? b : a))[0];
  assert.ok(peak('y') > peak('x') && peak('y') < peak('x') + PERIOD / 2, `prey ${peak('x')}, predators ${peak('y')}`);
});

test('projectile game: aim, speed, every launch, the arc, win, loss and ignored moves match the formulas on the engine', () => checkProjectile(projectileExample));
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
    [checkProjectile, projectileExample, 'Math.sin(2 * angle * Math.PI / 180)', 'Math.sin(angle * Math.PI / 180)', 'sin theta for sin 2 theta'],
    [checkProjectile, projectileExample, 'speed * speed * Math.sin', 'speed * Math.sin', 'range linear in speed'],
    [checkProjectile, projectileExample, 'G = 9.81', 'G = 10', 'g of 10'],
    [checkProjectile, projectileExample, '<= HALF', '<= 3', 'a wider target'],
    [checkProjectile, projectileExample, 'launches >= LAUNCHES', 'launches >= 6', 'a sixth launch'],
    [checkProjectile, projectileExample, "state.status !== 'playing' || ", '', 'moves accepted after the end'],
    [checkProjectile, projectileExample, '- G * t * t / 2', '- G * t * t', 'an arc with twice the gravity'],
    [checkProjectile, projectileExample, 'clamp(state.angle + da, 10, 80)', 'clamp(state.angle + da, 0, 90)', 'angles outside 10 to 80'],
    [checkPredatorPrey, predatorPreyExample, '0.1 * x * y - 0.4 * y', '0.1 * x * y - 0.5 * y', 'another predator death rate'],
    [checkPredatorPrey, predatorPreyExample, 'tall = 0.4 * x', 'tall = 0.3 * x', 'bars off the curve scale'],
  ];
  for (const [check, example, from, to, why] of mutants) {
    const source = example.artifact.program.source;
    assert.ok(source.includes(from), `mutant "${why}": the source no longer contains ${from}`);
    assert.throws(() => check(example, source.replace(from, to)), undefined, `the oracle accepted ${why}`);
  }
});
