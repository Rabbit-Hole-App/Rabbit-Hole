// Hand-written /animation examples for the Slash Commands window (owner 2026-11-02): a physics game and a biology watch, beside the saved
// pendulum experiment (pendulum-demo.js). Written by hand against the contract with no model call, and labelled so on the card
// (provenance 'fixture'). Read by name only (block.fixtureId): they are not in the Insert palette's example picker. Each is
// { name, plan, artifact }. planHash and sourceHash are literals, pinned by learning-examples.test.mjs, which also runs each program
// on the real engine against independent formulas (e2e/animation-examples-oracle.mjs).
import { ANIMATION_CAPABILITIES } from './capabilities.js';
import { ANIMATION_PROGRAM_VERSIONS, PLAN_SCHEMA, SCENE_SCHEMA } from './contract.js';

const program = (source, sourceHash) => ({ ...ANIMATION_PROGRAM_VERSIONS, source, sourceHash });
const base = { schema: SCENE_SCHEMA, revision: 1, capabilityVersion: ANIMATION_CAPABILITIES.version, sourceRefs: [], seed: 1, provenance: { origin: 'fixture' } };
const round = value => Number(value.toFixed(3));

// ---- game, physics: hit a target with a projectile -----------------------------------------------------------------------
// Range R = v^2 sin(2 theta) / g on flat ground, g = 9.81, from ground level, no air. The angle moves by 5 degrees (10 to 80), the
// speed by 1 m/s (5 to 22); Launch fires once. Landing within 1.5 m of 30 m wins; 5 launches without that loses; after either, actions
// do nothing. The arc drawn is the last launch: 15 points at equal times over its flight.

const projectileSource = `const G = 9.81, TARGET = 30, HALF = 1.5, LAUNCHES = 5;
const AIM = { angleUp: [5, 0], angleDown: [-5, 0], faster: [0, 1], slower: [0, -1] };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const range = (angle, speed) => speed * speed * Math.sin(2 * angle * Math.PI / 180) / G;
export function initialState() { return { angle: 30, speed: 14, launches: 0, shot: null, status: 'playing' }; }
export function reduce({ state, event }) {
  if (state.status !== 'playing' || event.type !== 'action') return state;
  if (event.action !== 'launch') {
    const [da, dv] = AIM[event.action];
    return { ...state, angle: clamp(state.angle + da, 10, 80), speed: clamp(state.speed + dv, 5, 22) };
  }
  const landed = range(state.angle, state.speed), launches = state.launches + 1;
  const status = Math.abs(landed - TARGET) <= HALF ? 'won' : launches >= LAUNCHES ? 'lost' : 'playing';
  return { ...state, launches, shot: { angle: state.angle, speed: state.speed, landed }, status };
}
export function evaluate({ state }) {
  const s = state || initialState(), turn = (s.angle - 90) * Math.PI / 360, shot = s.shot, nodes = {};
  nodes.aim = { quaternion: [0, 0, Math.sin(turn), Math.cos(turn)], scale: [1, s.speed / 4, 1] };
  for (let k = 0; k <= 14; k += 1) {
    if (!shot) { nodes['arc' + k] = { visible: false }; continue; }
    const b = shot.angle * Math.PI / 180, t = k / 14 * 2 * shot.speed * Math.sin(b) / G;
    nodes['arc' + k] = { visible: true, position: [shot.speed * Math.cos(b) * t, Math.max(0, shot.speed * Math.sin(b) * t - G * t * t / 2), 0] };
  }
  nodes.landing = shot ? { visible: true, position: [shot.landed, 0.1, 0] } : { visible: false };
  nodes.landingNote = shot ? { visible: true, position: [shot.landed, 0, 0], text: 'Landed ' + shot.landed.toFixed(1) + ' m' } : { visible: false };
  const left = LAUNCHES - s.launches, miss = shot ? shot.landed - TARGET : 0;
  const message = s.status === 'won' ? 'Hit: landed ' + shot.landed.toFixed(1) + ' m, ' + Math.abs(miss).toFixed(1) + ' m from the centre.'
    : s.status === 'lost' ? 'Out of launches: the last one landed ' + shot.landed.toFixed(1) + ' m. Reset game to try again.'
      : shot ? (miss > 0 ? 'Long' : 'Short') + ' by ' + Math.abs(miss).toFixed(1) + ' m. ' + left + ' launches left.'
        : 'Set the angle and speed, then Launch. ' + left + ' launches left.';
  const readouts = { launchesLeft: left, angle: s.angle, speed: s.speed };
  if (shot) { readouts.landing = shot.landed; readouts.miss = miss; }
  return { nodes, readouts, goal: { status: s.status, message } };
}
`;
const projectilePlan = {
  schema: PLAN_SCHEMA, title: 'Projectile: hit the target', description: 'A launcher on flat ground and a target 30 m away. Set the launch angle and speed, launch, and use where each shot lands to correct the next one.',
  experience: 'game', reason: 'Correcting each shot from where the last one landed shows how angle and speed set the range.', behavior: 'rules', controlProfile: 'manipulate',
  sourceRefs: [], parameters: [], interactions: ['Raise or lower the angle by 5 degrees (Up and Down keys).', 'Change the speed by 1 m/s (Left and Right keys).', 'Launch.'],
  assumptions: ['R = v^2 sin(2 theta) / g with g = 9.81 m/s^2, launched from ground level on flat ground.', 'No air resistance; the projectile is a point.'],
  limitations: ['Real projectiles lose speed to drag and land shorter.', 'The angle and speed move in steps; holding a key does not change them continuously.'],
  learningGoal: 'For a given speed 45 degrees goes farthest, complementary angles land at the same place, and range grows with the square of the speed.', requiredCapabilities: ['actions', 'readouts', 'labels'],
};
export const projectileExample = {
  name: 'projectile-target-game',
  plan: projectilePlan,
  artifact: {
    ...base, artifactId: 'example-projectile-target', planHash: 'fa242f0b5554bf095ecc2e021b49fdd9abd8f0a36aef82f72cecbb942567b141',
    title: projectilePlan.title, description: 'Side view of flat ground marked to 50 m, a launcher at 0 m with an arrow showing the aim (longer is faster), and a target pad at 30 m. After a launch, dots trace the arc and a marker shows where it landed.',
    experience: 'game', behavior: 'rules', controlProfile: 'manipulate',
    scene: {
      materials: [{ id: 'ground', color: '#8a8f98' }, { id: 'launcherGrey', color: '#5b6470' }, { id: 'aimBlue', color: '#2f6fe0' }, { id: 'targetRed', color: '#d64545' }, { id: 'arcOrange', color: '#e0912f' }, { id: 'landedDark', color: '#2f9e5b' }],
      geometries: [
        { id: 'groundLine', kind: 'line', points: [[0, 0, 0], [50, 0, 0]] },
        { id: 'heightLine', kind: 'line', points: [[-2, 0, 0], [-2, 25, 0]] },
        { id: 'launcherBox', kind: 'box', size: [1.4, 0.8, 1] },
        { id: 'aimArrow', kind: 'arrow', length: 1 },
        { id: 'pad', kind: 'cylinder', radius: 1.5, height: 0.2 },
        { id: 'dot', kind: 'sphere', radius: 0.45, widthSegments: 12, heightSegments: 8 },
        { id: 'mark', kind: 'cylinder', radius: 0.6, height: 0.4 },
        { id: 'targetText', kind: 'label', text: 'Target 30 m', placement: 'below' },
        { id: 'launcherText', kind: 'label', text: 'Launcher', placement: 'below' },
        { id: 'heightText', kind: 'label', text: '25 m', placement: 'left' },
        { id: 'groundText', kind: 'label', text: '50 m', placement: 'below' },
        { id: 'landedText', kind: 'label', text: 'Landed', placement: 'above' },
      ],
      nodes: [
        { id: 'groundN', geometry: 'groundLine', material: 'ground' }, { id: 'heightN', geometry: 'heightLine', material: 'ground' },
        { id: 'heightTag', geometry: 'heightText', position: [-2, 25, 0] }, { id: 'groundTag', geometry: 'groundText', position: [50, 0, 0] },
        { id: 'launcher', geometry: 'launcherBox', material: 'launcherGrey', position: [-0.8, 0.4, 0], name: 'Launcher' },
        { id: 'launcherTag', parent: 'launcher', geometry: 'launcherText', position: [0, -0.4, 0] },
        { id: 'aim', geometry: 'aimArrow', material: 'aimBlue', quaternion: [0, 0, -0.5, 0.8660254], scale: [1, 3.5, 1], name: 'Aim' },
        { id: 'target', geometry: 'pad', material: 'targetRed', position: [30, 0.1, 0], name: 'Target' },
        { id: 'targetTag', parent: 'target', geometry: 'targetText', position: [0, -0.1, 0] },
        ...Array.from({ length: 15 }, (_, k) => ({ id: `arc${k}`, geometry: 'dot', material: 'arcOrange', visible: false })),
        { id: 'landing', geometry: 'mark', material: 'landedDark', visible: false, name: 'Landing' },
        { id: 'landingNote', geometry: 'landedText', visible: false },
      ],
    },
    parameters: [],
    actions: [{ id: 'angleUp', label: 'Angle up' }, { id: 'angleDown', label: 'Angle down' }, { id: 'slower', label: 'Slower' }, { id: 'faster', label: 'Faster' }, { id: 'launch', label: 'Launch' }],
    // The camera looks along -z with +x (downrange) to the right: Up raises the aim, Right speeds it up.
    keys: { up: 'angleUp', down: 'angleDown', left: 'slower', right: 'faster' },
    readouts: [{ id: 'launchesLeft', label: 'Launches left', decimals: 0 }, { id: 'angle', label: 'Angle', unit: 'deg', decimals: 0 }, { id: 'speed', label: 'Speed', unit: 'm/s', decimals: 0 },
      { id: 'landing', label: 'Landing distance', unit: 'm', decimals: 1 }, { id: 'miss', label: 'Miss (+ long, - short)', unit: 'm', decimals: 1 }],
    game: { objective: 'Land within 1.5 m of the target at 30 m, in at most 5 launches.', hint: 'Range is v^2 sin(2 theta) / g: for one speed, 45 degrees goes farthest and 30 and 60 degrees land together. Range grows with the square of the speed, so scale it from your last landing.' },
    program: program(projectileSource, '41a22719d02168f2fbef75083352947c4c48dde424827df855e6c2895ce91605'),
    camera: { position: [24, 12, 62], target: [24, 10, 0], fov: 40 },
    assumptions: ['R = v^2 sin(2 theta) / g with g = 9.81 m/s^2, launched from ground level on flat ground; the dots are the path x = v cos(theta) t, y = v sin(theta) t - g t^2 / 2.', 'No air resistance and a point projectile: real projectiles lose speed to drag and land shorter.', 'Angle steps of 5 degrees and speed steps of 1 m/s, one per press: holding a key or button does not charge the speed.'],
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
        { id: 'head', kind: 'box', size: [0.05, 4.6, 0.05] },
        { id: 'marker', kind: 'sphere', radius: 0.12, widthSegments: 16, heightSegments: 10 },
        { id: 'bar', kind: 'box', size: [0.7, 1, 0.2] },
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

export const LEARNING_EXAMPLES = Object.freeze([projectileExample, predatorPreyExample]);
