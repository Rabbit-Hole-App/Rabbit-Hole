// Independent oracle for the /animation contract fixtures (AN-07, plan section 12 "incorrect derived values despite plausible
// animation"). Every expected number here is computed from the physical or game rule each fixture states in words, written by
// hand: nothing here runs, imports or copies a fixture's program, the runtime or the renderer. fixtures.js supplies only the
// inputs a learner can set (ids, titles, parameter ranges, actions); a scene that looks plausible but computes the wrong thing
// disagrees with these formulas. Used by src/animation3d/oracle.test.mjs (node) and e2e/animation-mvp-check.mjs (browser).
import { watchFixture, experimentFixture, gameFixture } from '../src/animation3d/fixtures.js';

const { sin, cos, PI } = Math;
const radians = degrees => degrees * PI / 180;
// A unit quaternion [x, y, z, w] for a turn of `degrees` about a unit axis.
const turn = (axis, degrees) => { const h = radians(degrees) / 2; return [axis[0] * sin(h), axis[1] * sin(h), axis[2] * sin(h), cos(h)]; };
const Y = [0, 1, 0], Z = [0, 0, 1];

// Facts the checks need about each fixture: the learner-settable inputs and the declared readouts (ids, decimals), never its outputs.
export const FIXTURES = {
  watch: { name: watchFixture.name, id: watchFixture.artifact.artifactId, title: watchFixture.artifact.title, parameters: watchFixture.artifact.parameters, readouts: watchFixture.artifact.readouts, duration: watchFixture.artifact.timeline.duration, playable: true },
  experiment: { name: experimentFixture.name, id: experimentFixture.artifact.artifactId, title: experimentFixture.artifact.title, parameters: experimentFixture.artifact.parameters, readouts: experimentFixture.artifact.readouts, playable: false },
  game: { name: gameFixture.name, id: gameFixture.artifact.artifactId, title: gameFixture.artifact.title, parameters: [], readouts: gameFixture.artifact.readouts, actions: gameFixture.artifact.actions.map(a => a.id), playable: false,
    // A move into the north edge from the start: blocked, still counted (the stated rule). Then the shortest route to the target.
    wrongAction: 'north', winningRoute: ['east', 'east', 'east', 'south', 'south'] },
};

// ---- watch: "a moon circles a planet once every 8 s on a path of radius 3; the planet spins once every 4 s about its vertical axis;
// the readout is the orbit angle in degrees". The moon starts on +X and moves toward +Z. Time is the loop's own time, 0 <= t < 8.
const ORBIT = { radius: 3, period: 8, spin: 4 };
function watch(t) {
  const angle = 360 * (t / ORBIT.period); // degrees travelled since +X
  const moon = [ORBIT.radius * cos(radians(angle)), 0, ORBIT.radius * sin(radians(angle))];
  return { nodes: { moon: { position: moon }, planet: { quaternion: turn(Y, 360 * (t / ORBIT.spin)) } }, readouts: { angle } };
}

// ---- experiment: a beam balance. "Moment = mass x distance on each side; the beam tilts about +Z, left end down when positive,
// by 5 degrees per kg m of imbalance, at most 20 degrees either way; each weight sits at its distance from the pivot, 0.25 above
// the beam's axis." Readouts: leftMoment, rightMoment (kg m), tilt (deg).
function experiment(inputs) {
  const leftMoment = inputs.leftMass * inputs.leftDistance, rightMoment = inputs.rightMass * inputs.rightDistance;
  const tilt = Math.min(20, Math.max(-20, 5 * (leftMoment - rightMoment)));
  return {
    nodes: { beam: { quaternion: turn(Z, tilt) }, leftWeight: { position: [-inputs.leftDistance, 0.25, 0] }, rightWeight: { position: [inputs.rightDistance, 0.25, 0] } },
    readouts: { leftMoment, rightMoment, tilt },
  };
}

// ---- game: a robot on a 5 x 5 grid (cells 0..4) starts at (0, 0). East/west move x by one, north/south move z by -1/+1, held at
// the edge; every action is a move, blocked or not. Reaching (3, 2) wins; 10 moves without winning loses; after either, actions do
// nothing. The robot's centre sits 0.3 above the board.
function game(actions) {
  let x = 0, z = 0, moves = 0, status = 'playing';
  const delta = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] };
  for (const action of actions) {
    if (status !== 'playing') continue;
    x = Math.min(4, Math.max(0, x + delta[action][0]));
    z = Math.min(4, Math.max(0, z + delta[action][1]));
    moves += 1;
    if (x === 3 && z === 2) status = 'won';
    else if (moves >= 10) status = 'lost';
  }
  return { nodes: { robot: { position: [x, 0.3, z] } }, readouts: { moves }, status };
}

const defaults = parameters => Object.fromEntries(parameters.map(p => [p.id, p.default]));
// Expected frame parts for a fixture: experiment takes inputs (missing ones at their defaults), watch takes time, game takes actions.
export function expectedNodes(kind, inputs = {}, time = 0) { return kind === 'watch' ? watch(time).nodes : experiment({ ...defaults(FIXTURES.experiment.parameters), ...inputs }).nodes; }
export function expectedReadouts(kind, inputs = {}, time = 0) { return kind === 'watch' ? watch(time).readouts : experiment({ ...defaults(FIXTURES.experiment.parameters), ...inputs }).readouts; }
export function expectedGame(actions) { return game(actions); }
export const oracle = { watch, experiment, game };

// Equality for oracle comparisons: numbers within tol (default 1e-6; relative above 1); arrays element-wise; a four-element value
// is a quaternion, equal to its negation (q and -q are the same rotation).
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
export function close(got, want, tol = 1e-6) {
  if (typeof want === 'number') return near(got, want, tol);
  if (!Array.isArray(want) || !Array.isArray(got) || got.length !== want.length) return false;
  if (want.length === 4) return want.every((v, i) => near(got[i], v, tol)) || want.every((v, i) => near(got[i], -v, tol));
  return want.every((v, i) => near(got[i], v, tol));
}
// Rotates a point by a unit quaternion (for physical sanity checks: which end of the beam is down).
export function rotate([x, y, z], [qx, qy, qz, qw]) {
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}
