import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { parseEvent, parseGuestResult, parseState, resolveInputs } from './contract.js';
import { normalizeFrame } from './frame.js';
import { loadEngine, runProgram } from './runtime.js';
import { qlearningFixture } from './ai-qlearning-fixture.js';

const artifact = await buildProgramArtifact({ manifest: qlearningFixture.manifest, source: qlearningFixture.source });
assert.equal(artifact.schemaVersion, 2);
const { manifest, source, sdkVersion } = artifact;
const engine = await loadEngine();

function run(savedInputs = {}, savedState) {
  let inputs = resolveInputs(manifest, savedInputs);
  function call(operation, extra) {
    const reply = runProgram(engine, { source, sdkVersion, operation, request: { inputs, ...extra } });
    assert.equal(reply.ok, true, reply.detail);
    const parsed = operation === 'evaluate' ? parseGuestResult(reply.value, manifest) : parseState(reply.value);
    assert.equal(parsed.ok, true, parsed.issue);
    return parsed.value;
  }
  let state = savedState ?? call('initialize');
  function evaluate() {
    const result = call('evaluate', { state });
    const view = normalizeFrame(result.frame, manifest);
    assert.equal(view.ok, true, view.issue);
    return result;
  }
  evaluate();
  function dispatch(event) {
    const valid = parseEvent(event, manifest);
    assert.equal(valid.ok, true, valid.issue);
    if (event.type === 'input') inputs = { ...inputs, [event.input]: event.value };
    state = call('reduce', { state, event });
    return evaluate();
  }
  return {
    get state() { return state; },
    evaluate,
    move: action => dispatch({ type: 'action', action }),
    change: (input, value) => dispatch({ type: 'input', input, value }),
  };
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('a wall is a rewarded self-loop, and greedy arrows disappear for a four-way tie', () => {
  const world = run();
  const arrows = frame => frame.objects.filter(object => object.kind === 'arrow');
  assert.equal(arrows(world.evaluate().frame).length, 0);
  const { frame, quantities } = world.move('up');
  assert.equal(world.state.position, 0);
  assert.equal(world.state.last.reward, -.04);
  near(world.state.q[0][0], -.02);
  near(quantities.qUp, -.02);
  assert.equal(arrows(frame).length, 3, 'only the three jointly best actions get arrows');
  for (const action of ['right', 'down', 'left']) {
    const fresh = run();
    fresh.move(action);
    assert.equal(fresh.state.position, { right: 1, down: 3, left: 0 }[action]);
  }
});

test('goal reward is a terminal target; a later nonterminal move bootstraps from the learned successor', () => {
  const world = run({ goalReward: 1.5 });
  for (const action of ['right', 'right', 'down', 'down']) world.move(action);
  assert.equal(world.state.position, 8);
  assert.equal(world.state.last.target, 1.5);
  near(world.state.q[5][2], .75);
  near(world.state.episodeReturn, 1.38);
  const terminal = world.state;
  world.move('left');
  assert.deepEqual(world.state, terminal);

  const learned = world.state.q;
  world.move('newEpisode');
  assert.deepEqual(world.state, { position: 0, q: learned, episodeReturn: 0, last: null });
  for (const action of ['right', 'right', 'down']) world.move(action);
  assert.equal(world.state.position, 5);
  // Target: -.04 + .9 * .75 = .635. Halfway from -.02 to .635 is .3075.
  near(world.state.last.target, .635);
  near(world.state.last.delta, .655);
  near(world.state.q[2][2], .3075);
});

test('entering the pit updates once and terminal moves leave the accepted state unchanged', () => {
  const world = run({ alpha: .25 });
  world.move('down');
  world.move('right');
  assert.equal(world.state.position, 4);
  near(world.state.episodeReturn, -1.04);
  assert.equal(world.state.last.target, -1);
  assert.equal(world.state.q[3][1], -.25);
  const terminal = world.state;
  for (const action of ['up', 'right', 'down', 'left']) {
    world.move(action);
    assert.deepEqual(world.state, terminal);
  }
});

test('each changed control clears prior learning, and gamma zero uses only the immediate reward', () => {
  const world = run();
  for (const [input, value] of [['alpha', 1], ['gamma', 0], ['goalReward', 2]]) {
    world.move('right');
    assert.notEqual(world.state.q[0][1], 0);
    world.change(input, value);
    assert.deepEqual(world.state, {
      position: 0, q: Array.from({ length: 9 }, () => [0, 0, 0, 0]), episodeReturn: 0, last: null,
    });
  }
  for (const action of ['right', 'right', 'down', 'down']) world.move(action);
  assert.equal(world.state.q[5][2], 2);
  world.move('newEpisode');
  for (const action of ['right', 'right', 'down']) world.move(action);
  assert.equal(world.state.last.target, -.04);
  near(world.state.q[2][2], -.04);
});

test('the target ignores successor Q values on both terminal transitions', () => {
  // Terminal rows stay zero in normal play. A synthetic checkpoint with nonzero
  // rows distinguishes a terminal mask from bootstrapping unconditionally.
  const fresh = run().state;
  for (const [from, to, action, reward] of [[1, 4, 'down', -1], [5, 8, 'down', 1]]) {
    const q = fresh.q.map((row, index) => index === to ? [2, 3, 4, 5] : row);
    const world = run({}, { ...fresh, position: from, q });
    world.move(action);
    assert.equal(world.state.position, to);
    assert.equal(world.state.last.target, reward);
    assert.equal(world.state.q[from][2], reward / 2);
  }
});
