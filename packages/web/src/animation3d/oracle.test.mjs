// AN-07 independent oracle (e2e/animation-oracle.mjs) against the contract fixtures (fixtures.js). The oracle's formulas are
// written from each fixture's stated rule, never from its program, so these tests compare two independent derivations:
// 1. the oracle and the fixture's own hand-computed expected states agree;
// 2. each fixture program, run in the packaged QuickJS engine (explain-program runtime.js runProgram, which the contract says runs
//    animation programs unchanged) over a sweep of times, inputs and action sequences, agrees with the oracle everywhere, and every
//    frame it returns passes validateAnimationFrame;
// 3. plausible-looking wrong programs (a flipped sign, a dropped factor, an uncounted move) disagree, so the oracle can fail;
// 4. the oracle's own physics: the heavier side goes down, the moon stays on its circle and its angle matches its position.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { watchFixture, experimentFixture, gameFixture } from './fixtures.js';
import { validateAnimationArtifact, validateAnimationFrame } from './contract.js';
import { loadEngine, runProgram } from '../explain-program/runtime.js';
import { LIMITS } from '../explain-program/limits.js';
import { FIXTURES, oracle, close, rotate } from '../../e2e/animation-oracle.mjs';

// Termination is not under test here, so the 250 ms watchdog bounds each call rather than the 50 ms interrupt (as runtime.test.mjs
// does for its non-termination cases: a loaded machine can take over 50 ms for a 2 ms program).
const RELAXED = { ...LIMITS, interruptMs: LIMITS.watchdogMs };
let engine;
before(async () => { engine = await loadEngine(); });

// Every node property and readout the expectation names must match.
function mismatches(got, want, label) {
  const out = [];
  for (const [id, props] of Object.entries(want.nodes || {})) for (const [k, v] of Object.entries(props)) if (!close(got.nodes?.[id]?.[k], v)) out.push(`${label}: node ${id}.${k} ${JSON.stringify(got.nodes?.[id]?.[k])} != ${JSON.stringify(v)}`);
  for (const [id, v] of Object.entries(want.readouts || {})) if (!close(got.readouts?.[id], v)) out.push(`${label}: readout ${id} ${got.readouts?.[id]} != ${v}`);
  if (want.status !== undefined && got.status !== want.status) out.push(`${label}: status ${got.status} != ${want.status}`);
  return out;
}
// A fixture program as the product runs it: each call a fresh QuickJS context; every evaluated frame validated against the artifact.
function quickjs(source, artifact) {
  const call = (operation, request) => {
    const out = runProgram(engine, { source, request: { seed: artifact.seed, ...request }, operation }, RELAXED);
    if (!out.ok) throw Error(`${operation}: ${out.code} ${out.detail || ''}`);
    return out.value;
  };
  const checked = frame => { const v = validateAnimationFrame(frame, artifact); if (!v.ok) throw Error(`invalid frame: ${JSON.stringify(v.issues)}`); return frame; };
  return {
    evaluate: request => checked(call('evaluate', request)),
    initialState: () => call('initialize', {}),
    reduce: request => call('reduce', request),
  };
}
const load = (source, fixture) => {
  const artifact = validateAnimationArtifact(fixture.artifact);
  assert.ok(artifact.ok, JSON.stringify(artifact.issues));
  return quickjs(source, artifact.value);
};
const gameOut = (program, actions) => {
  let state = program.initialState();
  for (const action of actions) state = program.reduce({ state, event: { type: 'action', action } });
  const frame = program.evaluate({ state });
  return { ...frame, status: frame.goal.status };
};

// Sweeps. watch: the loop's time in quarter seconds. experiment: every combination of every parameter's whole range by its step.
// game: every action sequence up to four moves, the shortest win, a win then more moves, and running out of moves.
const TIMES = Array.from({ length: 32 }, (_, i) => i / 4);
const range = p => Array.from({ length: Math.round((p.max - p.min) / p.step) + 1 }, (_, i) => p.min + i * p.step);
const INPUTS = FIXTURES.experiment.parameters.reduce((all, p) => all.flatMap(partial => range(p).map(v => ({ ...partial, [p.id]: v }))), [{}]);
const ACTIONS = FIXTURES.game.actions;
const SEQUENCES = [[]];
for (let n = 1; n <= 4; n++) for (const prefix of SEQUENCES.filter(s => s.length === n - 1)) for (const a of ACTIONS) SEQUENCES.push([...prefix, a]);
SEQUENCES.push(FIXTURES.game.winningRoute, [...FIXTURES.game.winningRoute, 'west', 'north'], Array(10).fill('west'), Array(11).fill('south'), [FIXTURES.game.wrongAction, ...FIXTURES.game.winningRoute]);

// first: stop at the first disagreement (a mutant needs only one).
function sweep(kind, program, first = false) {
  const cases = kind === 'watch' ? TIMES.map(t => [() => program.evaluate({ time: t }), oracle.watch(t), `t=${t}`])
    : kind === 'experiment' ? INPUTS.map(inputs => [() => program.evaluate({ inputs }), oracle.experiment(inputs), JSON.stringify(inputs)])
      : SEQUENCES.map(actions => [() => gameOut(program, actions), oracle.game(actions), actions.join(',') || 'start']);
  const out = [];
  for (const [got, want, label] of cases) {
    out.push(...mismatches(got(), want, label));
    if (first && out.length) break;
  }
  return out;
}

test('the oracle agrees with every hand-computed expected state in fixtures.js', () => {
  const out = [];
  for (const s of watchFixture.expected) out.push(...mismatches(oracle.watch(s.time), s.frame, `watch ${s.label}`));
  for (const s of experimentFixture.expected) out.push(...mismatches(oracle.experiment(s.inputs), s.frame, `experiment ${s.label}`));
  for (const s of gameFixture.expected) out.push(...mismatches(oracle.game(s.events.map(e => e.action)), { ...s.frame, status: s.frame.goal.status }, `game ${s.label}`));
  assert.deepEqual(out, []);
  assert.equal(watchFixture.expected.length + experimentFixture.expected.length + gameFixture.expected.length >= 9, true, 'the fixtures still carry their expected states');
});

test('each fixture program agrees with the oracle over its whole sweep', async () => {
  assert.ok(INPUTS.length >= 1000 && SEQUENCES.length > 300, `sweep sizes: ${INPUTS.length} inputs, ${SEQUENCES.length} sequences`);
  for (const [kind, fixture] of [['watch', watchFixture], ['experiment', experimentFixture], ['game', gameFixture]]) {
    const out = sweep(kind, load(fixture.artifact.program.source, fixture));
    assert.deepEqual(out.slice(0, 5), [], `${kind}: ${out.length} disagreements`);
  }
});

test('plausible-looking wrong programs disagree with the oracle', async () => {
  const mutants = [
    ['watch', watchFixture, 'time / 8, half', 'time / 6, half', 'a 6 s period'],
    ['watch', watchFixture, '3 * Math.sin(a)', '-3 * Math.sin(a)', 'the moon going the other way'],
    ['watch', watchFixture, 'Math.PI * time / 4', 'Math.PI * time / 8', 'the planet spinning at half speed'],
    ['experiment', experimentFixture, '5 * (left - right)', '5 * (right - left)', 'tilting toward the lighter side'],
    ['experiment', experimentFixture, 'inputs.leftMass * inputs.leftDistance', 'inputs.leftMass', 'a moment that ignores distance'],
    ['experiment', experimentFixture, 'Math.max(-20, Math.min(20, ', 'Math.max(-30, Math.min(30, ', 'a 30 degree clamp'],
    ['game', gameFixture, 'moves = state.moves + 1', 'moves = state.moves + (x !== state.x || z !== state.z ? 1 : 0)', 'blocked moves not counted'],
    ['game', gameFixture, 'x === 3 && z === 2', 'x === 2 && z === 3', 'the wrong target square'],
    ['game', gameFixture, "if (state.status !== 'playing' || event.type !== 'action') return state;", "if (event.type !== 'action') return state;", 'moves accepted after the game ends'],
  ];
  for (const [kind, fixture, from, to, why] of mutants) {
    const source = fixture.artifact.program.source;
    assert.ok(source.includes(from), `mutant "${why}": the fixture no longer contains ${from}`);
    assert.ok(sweep(kind, load(source.replace(from, to), fixture), true).length > 0, `the oracle accepted ${why}`);
  }
});

test('the oracle\'s own physics: heavier side down, level when balanced, the moon on its circle at its stated angle', () => {
  const end = q => rotate([-3.2, 0, 0], q)[1]; // the beam's left end height (the beam is 6.4 long)
  for (const inputs of INPUTS) {
    const { nodes, readouts } = oracle.experiment(inputs), diff = readouts.leftMoment - readouts.rightMoment;
    if (diff > 0) assert.ok(end(nodes.beam.quaternion) < 0, `left heavier, left end down: ${JSON.stringify(inputs)}`);
    else if (diff < 0) assert.ok(end(nodes.beam.quaternion) > 0, `right heavier, left end up: ${JSON.stringify(inputs)}`);
    else assert.ok(Math.abs(end(nodes.beam.quaternion)) < 1e-9, `balanced is level: ${JSON.stringify(inputs)}`);
    assert.ok(Math.abs(readouts.tilt) <= 20);
  }
  for (const t of TIMES) {
    const { nodes, readouts } = oracle.watch(t), [x, , z] = nodes.moon.position;
    assert.ok(close(Math.hypot(x, z), 3), `on the circle at t=${t}`);
    assert.ok(close(((Math.atan2(z, x) * 180 / Math.PI) + 360) % 360, readouts.angle % 360), `angle matches position at t=${t}`);
  }
  assert.equal(oracle.game(FIXTURES.game.winningRoute).status, 'won');
  assert.deepEqual(oracle.game([FIXTURES.game.wrongAction]).nodes.robot.position, [0, 0.3, 0], 'the wrong action is blocked at the edge');
});
