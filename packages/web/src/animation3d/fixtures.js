// AN-01 fixtures: three hand-authored valid scenes (watch, experiment, game) and the invalid cases every lane can test against.
// Test data and examples only, never product branches: nothing selects them from a request. Each valid fixture is
// { name, plan, artifact, expected }, where expected lists states whose values are calculated by hand from the stated rule
// (not by running the program): { label, inputs?, events?, time, frame } and frame is the subset the evaluated frame must match.
// planHash and sourceHash are literals; contract.test.mjs fails if they drift from hashAnimationPlan / hashProgramSource.
import { ANIMATION_CAPABILITIES } from './capabilities.js';
import { ANIMATION_PROGRAM_VERSIONS, PLAN_SCHEMA, SCENE_SCHEMA } from './contract.js';

const program = (source, sourceHash) => ({ ...ANIMATION_PROGRAM_VERSIONS, source, sourceHash });
const base = { schema: SCENE_SCHEMA, revision: 1, capabilityVersion: ANIMATION_CAPABILITIES.version, sourceRefs: [], provenance: { origin: 'fixture' } };
const FLAT = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]; // -90 degrees about X: a plane lies flat; an arrow's +Y points to -Z

// ---- watch: a moon circles a planet (prescribed loop) -------------------------------------------------------------------
// Rule: moon at [3 cos a, 0, 3 sin a] with a = 2 pi t / 8; planet spins one turn per 4 s about Y; readout angle = 360 t / 8.

const orbitSource = `export function evaluate({ time }) {
  const a = 2 * Math.PI * time / 8, half = Math.PI * time / 4;
  return {
    nodes: { moon: { position: [3 * Math.cos(a), 0, 3 * Math.sin(a)] }, planet: { quaternion: [0, Math.sin(half), 0, Math.cos(half)] } },
    readouts: { angle: 360 * time / 8 },
  };
}
`;
const orbitPlan = {
  schema: PLAN_SCHEMA, title: 'Moon orbiting a planet', description: 'A planet spins while a moon circles it once every 8 seconds.',
  experience: 'watch', reason: 'One continuous loop shows the period and the circular path at a glance.', behavior: 'prescribed', controlProfile: 'inspect',
  sourceRefs: [], parameters: [], interactions: [], assumptions: ['Circular orbit.'], limitations: ['Sizes and distances are not to scale.'],
  requiredCapabilities: ['loop', 'speed', 'seek', 'labels', 'readouts'], duration: 8,
};
export const watchFixture = {
  name: 'orbit-watch',
  plan: orbitPlan,
  artifact: {
    ...base, artifactId: 'fixture-orbit-watch', planHash: '895b1243f717dc3592a9d40ccf4cdf1fce657c1a5066e65a29a8a76d7cf48f82',
    title: orbitPlan.title, description: 'A blue planet at the center and a grey moon on a white circular path of radius 3.',
    experience: 'watch', behavior: 'prescribed', controlProfile: 'inspect',
    scene: {
      materials: [{ id: 'planetBlue', color: '#3b6fd6' }, { id: 'moonGrey', color: '#b8b8b8' }, { id: 'pathWhite', color: '#ffffff', opacity: 0.6 }],
      geometries: [
        { id: 'planetBall', kind: 'sphere', radius: 1 },
        { id: 'moonBall', kind: 'sphere', radius: 0.3, widthSegments: 24, heightSegments: 12 },
        { id: 'orbitPath', kind: 'curve', points: [[3, 0, 0], [0, 0, 3], [-3, 0, 0], [0, 0, -3]], segments: 96, closed: true },
        { id: 'moonText', kind: 'label', text: 'Moon' },
      ],
      nodes: [
        { id: 'system' },
        { id: 'planet', parent: 'system', geometry: 'planetBall', material: 'planetBlue', name: 'Planet' },
        { id: 'orbit', parent: 'system', geometry: 'orbitPath', material: 'pathWhite' },
        { id: 'moon', parent: 'system', geometry: 'moonBall', material: 'moonGrey', position: [3, 0, 0], name: 'Moon' },
        { id: 'moonTag', parent: 'moon', geometry: 'moonText', position: [0, 0.6, 0] },
      ],
    },
    parameters: [], actions: [], readouts: [{ id: 'angle', label: 'Orbit angle', unit: 'deg', decimals: 0 }],
    timeline: { duration: 8, loop: true },
    program: program(orbitSource, '11445276a452b4a584653c65535fecdb8f17f73a6f230141c43f7349c5f20bcb'),
    seed: 1, camera: { position: [0, 6, 8], target: [0, 0, 0] }, assumptions: ['Circular orbit, not to scale.'],
  },
  expected: [
    { label: 'start', time: 0, frame: { nodes: { moon: { position: [3, 0, 0] }, planet: { quaternion: [0, 0, 0, 1] } }, readouts: { angle: 0 } } },
    { label: 'quarter loop', time: 2, frame: { nodes: { moon: { position: [0, 0, 3] }, planet: { quaternion: [0, 1, 0, 0] } }, readouts: { angle: 90 } } },
    { label: 'half loop', time: 4, frame: { nodes: { moon: { position: [-3, 0, 0] }, planet: { quaternion: [0, 0, 0, -1] } }, readouts: { angle: 180 } } },
  ],
};

// ---- experiment: beam balance (analytical) ------------------------------------------------------------------------------
// Rule: moment = mass x distance on each side; tilt (deg, about +Z, left end down when positive) = clamp(5 x (left - right), -20, 20).

const leverSource = `export function evaluate({ inputs }) {
  const left = inputs.leftMass * inputs.leftDistance, right = inputs.rightMass * inputs.rightDistance;
  const tilt = Math.max(-20, Math.min(20, 5 * (left - right))), half = tilt * Math.PI / 360;
  return {
    nodes: {
      beam: { quaternion: [0, 0, Math.sin(half), Math.cos(half)] },
      leftWeight: { position: [-inputs.leftDistance, 0.25, 0] },
      rightWeight: { position: [inputs.rightDistance, 0.25, 0] },
    },
    readouts: { leftMoment: left, rightMoment: right, tilt },
  };
}
`;
const massParameter = (id, label, value) => ({ type: 'number', id, label, unit: 'kg', min: 1, max: 10, step: 1, default: value });
const distanceParameter = (id, label, value) => ({ type: 'number', id, label, unit: 'm', min: 0.5, max: 3, step: 0.5, default: value });
const leverParameters = [massParameter('leftMass', 'Left mass', 4), distanceParameter('leftDistance', 'Left distance', 1.5), massParameter('rightMass', 'Right mass', 2), distanceParameter('rightDistance', 'Right distance', 2)];
const leverPlan = {
  schema: PLAN_SCHEMA, title: 'Beam balance', description: 'A beam on a pivot with one weight on each side; change masses and distances and watch it tilt.',
  experience: 'experiment', reason: 'Changing mass and distance directly shows that balance depends on their product.', behavior: 'analytical', controlProfile: 'manipulate',
  sourceRefs: [], parameters: leverParameters, interactions: ['Change each mass and its distance from the pivot.'],
  assumptions: ['Rigid, massless beam.'], limitations: ['The tilt is illustrative: 5 degrees per kg m of imbalance, at most 20 degrees.'],
  learningGoal: 'Balance happens when mass x distance is equal on both sides.', requiredCapabilities: ['parameters', 'readouts', 'labels'],
};
export const experimentFixture = {
  name: 'beam-balance-experiment',
  plan: leverPlan,
  artifact: {
    ...base, artifactId: 'fixture-beam-balance', planHash: '01db0e86b9a7c4560298bf89bbb96cb329868a15f88b1354cf851cbf02ada149',
    title: leverPlan.title, description: 'A horizontal beam on a cone pivot, a weight on each side, tilting toward the larger moment.',
    experience: 'experiment', behavior: 'analytical', controlProfile: 'manipulate',
    scene: {
      materials: [{ id: 'steel', color: '#8a94a6' }, { id: 'leftRed', color: '#d64545' }, { id: 'rightGreen', color: '#3fa34d' }],
      geometries: [
        { id: 'pivotCone', kind: 'cone', radius: 0.3, height: 0.6 },
        { id: 'beamBar', kind: 'box', size: [6.4, 0.1, 0.4] },
        { id: 'weightCylinder', kind: 'cylinder', radius: 0.2, height: 0.4 },
        { id: 'leftText', kind: 'label', text: 'Left' },
        { id: 'rightText', kind: 'label', text: 'Right' },
      ],
      nodes: [
        { id: 'pivot', geometry: 'pivotCone', material: 'steel', position: [0, -0.3, 0], name: 'Pivot' },
        { id: 'beam', geometry: 'beamBar', material: 'steel', position: [0, 0.05, 0], name: 'Beam' },
        { id: 'leftWeight', parent: 'beam', geometry: 'weightCylinder', material: 'leftRed', position: [-1.5, 0.25, 0], name: 'Left weight' },
        { id: 'rightWeight', parent: 'beam', geometry: 'weightCylinder', material: 'rightGreen', position: [2, 0.25, 0], name: 'Right weight' },
        { id: 'leftTag', parent: 'leftWeight', geometry: 'leftText', position: [0, 0.5, 0] },
        { id: 'rightTag', parent: 'rightWeight', geometry: 'rightText', position: [0, 0.5, 0] },
      ],
    },
    parameters: leverParameters, actions: [],
    readouts: [{ id: 'leftMoment', label: 'Left moment', unit: 'kg m' }, { id: 'rightMoment', label: 'Right moment', unit: 'kg m' }, { id: 'tilt', label: 'Tilt', unit: 'deg', decimals: 1 }],
    program: program(leverSource, '0c88f1f4933c27e68e6fe98b3c0312e3639ff1ec6dbc88e5c9018af254191137'),
    seed: 1, camera: { position: [0, 2, 7], target: [0, 0, 0] }, assumptions: ['Rigid, massless beam.'],
  },
  expected: [
    { label: 'defaults: left heavier', time: 0, inputs: { leftMass: 4, leftDistance: 1.5, rightMass: 2, rightDistance: 2 },
      frame: { nodes: { beam: { quaternion: [0, 0, Math.sin(Math.PI / 36), Math.cos(Math.PI / 36)] }, leftWeight: { position: [-1.5, 0.25, 0] } }, readouts: { leftMoment: 6, rightMoment: 4, tilt: 10 } } },
    { label: 'balanced', time: 0, inputs: { leftMass: 2, leftDistance: 2, rightMass: 4, rightDistance: 1 },
      frame: { nodes: { beam: { quaternion: [0, 0, 0, 1] }, rightWeight: { position: [1, 0.25, 0] } }, readouts: { leftMoment: 4, rightMoment: 4, tilt: 0 } } },
    { label: 'clamped', time: 0, inputs: { leftMass: 10, leftDistance: 3, rightMass: 1, rightDistance: 0.5 },
      frame: { nodes: { beam: { quaternion: [0, 0, Math.sin(Math.PI / 18), Math.cos(Math.PI / 18)] } }, readouts: { leftMoment: 30, rightMoment: 0.5, tilt: 20 } } },
  ],
};

// ---- game: move a robot onto a target square (rules) --------------------------------------------------------------------
// Rule: a 5 x 5 grid, cells 0..4; east/west change x by 1, north/south change z by -1/+1, clamped to the grid; every action
// counts as a move. On cell (3, 2) the game is won; at 10 moves without winning it is lost; after either, actions are ignored.

const gridSource = `const STEP = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] };
export function initialState() { return { x: 0, z: 0, moves: 0, status: 'playing' }; }
export function reduce({ state, event }) {
  if (state.status !== 'playing' || event.type !== 'action') return state;
  const step = STEP[event.action];
  const x = Math.max(0, Math.min(4, state.x + step[0])), z = Math.max(0, Math.min(4, state.z + step[1])), moves = state.moves + 1;
  return { x, z, moves, status: x === 3 && z === 2 ? 'won' : moves >= 10 ? 'lost' : 'playing' };
}
export function evaluate({ state }) {
  const s = state || initialState();
  const message = s.status === 'won' ? 'On target.' : s.status === 'lost' ? 'Out of moves. Reset to try again.' : 'Reach the target.';
  return { nodes: { robot: { position: [s.x, 0.3, s.z] } }, readouts: { moves: s.moves }, goal: { status: s.status, message } };
}
`;
const gridPlan = {
  schema: PLAN_SCHEMA, title: 'Grid robot', description: 'Steer a robot across a 5 by 5 grid onto the target square.',
  experience: 'game', reason: 'Planning a short route makes coordinates and directions concrete.', behavior: 'rules', controlProfile: 'manipulate',
  sourceRefs: [], parameters: [], interactions: ['Move the robot one square east, west, north or south.'],
  assumptions: [], limitations: ['Moves into the edge of the grid are blocked but still count.'],
  learningGoal: 'Reach (3, 2) from (0, 0) in as few moves as possible.', requiredCapabilities: ['actions', 'readouts', 'labels'],
};
export const gameFixture = {
  name: 'grid-robot-game',
  plan: gridPlan,
  artifact: {
    ...base, artifactId: 'fixture-grid-robot', planHash: 'a1445d039cfc8c7a42ed56b385c350d0540ca28e29934e455b33b36b65afcc0b',
    title: gridPlan.title, description: 'A flat 5 by 5 board, a blue robot cube in the corner and a gold target disc, with a north arrow.',
    experience: 'game', behavior: 'rules', controlProfile: 'manipulate',
    scene: {
      materials: [{ id: 'boardGrey', color: '#d9dde3' }, { id: 'robotBlue', color: '#2f6fe0' }, { id: 'targetGold', color: '#e0a82f' }, { id: 'arrowDark', color: '#333333' }],
      geometries: [
        { id: 'boardPlane', kind: 'plane', width: 5, height: 5 },
        { id: 'robotBox', kind: 'box', size: [0.6, 0.6, 0.6] },
        { id: 'targetDisc', kind: 'cylinder', radius: 0.35, height: 0.05 },
        { id: 'northArrow', kind: 'arrow', length: 1 },
        { id: 'northText', kind: 'label', text: 'N' },
      ],
      nodes: [
        { id: 'board', geometry: 'boardPlane', material: 'boardGrey', position: [2, 0, 2], quaternion: FLAT, name: 'Board' },
        { id: 'target', geometry: 'targetDisc', material: 'targetGold', position: [3, 0.03, 2], name: 'Target' },
        { id: 'robot', geometry: 'robotBox', material: 'robotBlue', position: [0, 0.3, 0], name: 'Robot' },
        { id: 'compass', geometry: 'northArrow', material: 'arrowDark', position: [-1, 0, 0.5], quaternion: FLAT },
        { id: 'compassTag', geometry: 'northText', position: [-1, 0.2, -0.8] },
      ],
    },
    parameters: [],
    actions: [{ id: 'east', label: 'East' }, { id: 'west', label: 'West' }, { id: 'north', label: 'North' }, { id: 'south', label: 'South' }],
    // The camera looks along -z (north) with +x (east) to the right, so screen up is north.
    keys: { up: 'north', down: 'south', left: 'west', right: 'east' },
    readouts: [{ id: 'moves', label: 'Moves', decimals: 0 }],
    game: { objective: 'Move the robot onto the target square in at most 10 moves.', hint: 'The target is 3 squares east and 2 squares south of the start.' },
    program: program(gridSource, '604ac89a65e2aa469fbac1177a4cd7a8be21197af5108ebc57f16243e630c14b'),
    seed: 1, camera: { position: [2, 7, 7], target: [2, 0, 2] }, assumptions: [],
  },
  expected: [
    { label: 'start', time: 0, events: [], frame: { nodes: { robot: { position: [0, 0.3, 0] } }, readouts: { moves: 0 }, goal: { status: 'playing' } } },
    { label: 'blocked move counts', time: 0, events: ['north'], frame: { nodes: { robot: { position: [0, 0.3, 0] } }, readouts: { moves: 1 }, goal: { status: 'playing' } } },
    { label: 'shortest win', time: 0, events: ['east', 'east', 'east', 'south', 'south'], frame: { nodes: { robot: { position: [3, 0.3, 2] } }, readouts: { moves: 5 }, goal: { status: 'won' } } },
    { label: 'ignored after win', time: 0, events: ['east', 'east', 'east', 'south', 'south', 'west'], frame: { nodes: { robot: { position: [3, 0.3, 2] } }, readouts: { moves: 5 }, goal: { status: 'won' } } },
    { label: 'out of moves', time: 0, events: Array(10).fill('west'), frame: { nodes: { robot: { position: [0, 0.3, 0] } }, readouts: { moves: 10 }, goal: { status: 'lost' } } },
  ].map(state => ({ ...state, events: state.events.map(action => ({ type: 'action', action })) })),
};

export const ANIMATION_FIXTURES = Object.freeze([watchFixture, experimentFixture, gameFixture]);

// ---- AN-18 primitives: a ball slides down a bowl (watch; all five client features) -----------------------------------------
// Not in ANIMATION_FIXTURES: it needs a client that declares surface_grid, trail_points, text_readout, arrow_anchor and clamp
// (capabilities.js ANIMATION_CLIENT_FEATURES) and nothing draws it before AN-19. Rule: the bowl is y = (x^2 + z^2) / 4 on a 5-row by
// 6-column grid (x = c - 2.5, z = r - 2); the ball (radius 0.1) slides along z = 0 from x = 2 to x = -2 in 4 s at x = 2 - t, so its centre is
// at y = x^2 / 4 + 0.1; the trail keeps one point every 0.1 s (21 points at t = 2) at y = x^2 / 4 + 0.02; the readout loss = x^2 / 4;
// status is running before t = 2, converged at t = 2 and overshoot after. The counts below are by hand, not from the code:
//   triangles  surface 2(5-1)(6-1) = 40; trail tube 2 x 8 x (100-1) = 1584; ghost tube 2 x 8 x (50-1) = 784; ball 2 x 16 x (8-1) = 224;
//              arrow 4 x 8 + 2 x 8 = 48; label 2  -> 2,682
//   line points  contours 3 x 4 x (5 + 6 - 2) = 108; trail max 100; ghost max 50  -> 258
//   labels and readouts  1 label + 2 readouts = 3; nodes 7
const bowlHeights = Array.from({ length: 5 }, (_, r) => Array.from({ length: 6 }, (_, c) => ((c - 2.5) ** 2 + (r - 2) ** 2) / 4));
const bowlSource = `export function evaluate({ time }) {
  const x = 2 - time, y = x * x / 4;
  const points = Array.from({ length: Math.round(time * 10) + 1 }, (_, i) => { const px = 2 - i / 10; return [px, px * px / 4 + 0.02, 0]; });
  return {
    nodes: { ball: { position: [x, y + 0.1, 0] }, trail: { points } },
    readouts: { loss: y, status: time < 2 ? 'running' : time === 2 ? 'converged' : 'overshoot' },
  };
}
`;
const bowlPlan = {
  schema: PLAN_SCHEMA, title: 'Ball in a bowl', description: 'A ball slides down a bowl-shaped surface and past its lowest point, leaving a path behind it.',
  experience: 'watch', reason: 'One continuous run shows the height falling to the minimum and rising again.', behavior: 'prescribed', controlProfile: 'inspect',
  sourceRefs: [], parameters: [], interactions: [], assumptions: ['The ball slides at constant speed along the line through the lowest point.'], limitations: ['Not a physical simulation.'],
  requiredCapabilities: ['loop', 'speed', 'seek', 'labels', 'readouts'], duration: 4,
};
export const primitivesFixture = {
  name: 'bowl-primitives',
  plan: bowlPlan,
  artifact: {
    ...base, artifactId: 'fixture-bowl-primitives', planHash: 'f8a48222c43c17b846ed51e7ae2e8440baebc1e3d7140b1ab82719befebd9b42',
    title: bowlPlan.title, description: 'A bowl drawn as a grid with contour lines, a ball sliding across it leaving a path, a short arrow on the ball and a status word.',
    experience: 'watch', behavior: 'prescribed', controlProfile: 'inspect',
    scene: {
      materials: [{ id: 'bowlBlue', color: '#6f8fd8' }, { id: 'ballRed', color: '#d64545' }, { id: 'pathDark', color: '#333333' }],
      geometries: [
        { id: 'bowlGrid', kind: 'surface', heights: bowlHeights, width: 5, depth: 4, contours: 3 },
        { id: 'pathTrail', kind: 'trail', max: 100, radius: 0.02, style: 'trail' },
        { id: 'pathGhost', kind: 'trail', max: 50, radius: 0.01, style: 'ghost' },
        { id: 'ballBall', kind: 'sphere', radius: 0.1, widthSegments: 16, heightSegments: 8 },
        { id: 'slopeArrow', kind: 'arrow', length: 0.5, offset: 0.1 },
        { id: 'slopeText', kind: 'label', text: 'Slope', anchor: 'tip' },
      ],
      nodes: [
        { id: 'bowl', geometry: 'bowlGrid', material: 'bowlBlue', name: 'Bowl' },
        { id: 'trail', geometry: 'pathTrail', material: 'pathDark', name: 'Path' },
        { id: 'ghost', geometry: 'pathGhost', material: 'pathDark', name: 'Kept path' },
        { id: 'ball', geometry: 'ballBall', material: 'ballRed', position: [2, 1.1, 0], name: 'Ball', clampTo: { node: 'bowl', max: 2 } },
        { id: 'slope', parent: 'ball', geometry: 'slopeArrow', material: 'ballRed' },
        { id: 'slopeTag', parent: 'slope', geometry: 'slopeText' },
        { id: 'group' },
      ],
    },
    parameters: [], actions: [],
    readouts: [{ id: 'loss', label: 'Loss', decimals: 2 }, { id: 'status', label: 'Status', kind: 'text' }],
    timeline: { duration: 4, loop: true },
    program: program(bowlSource, 'ad8a48581b860e2aaa2f6cc58bb66b89337086042e4a373c0d3a434875cedfad'),
    seed: 1, camera: { position: [0, 5, 6], target: [0, 0.5, 0] }, assumptions: ['The ball slides at constant speed along the line through the lowest point.'],
  },
  expected: [
    { label: 'start', time: 0, frame: { nodes: { ball: { position: [2, 1.1, 0] }, trail: { points: { length: 1, 0: [2, 1.02, 0] } } }, readouts: { loss: 1, status: 'running' } } },
    { label: 'lowest point', time: 2, frame: { nodes: { ball: { position: [0, 0.1, 0] }, trail: { points: { length: 21, 0: [2, 1.02, 0], 20: [0, 0.02, 0] } } }, readouts: { loss: 0, status: 'converged' } } },
    { label: 'overshoot', time: 4, frame: { nodes: { ball: { position: [-2, 1.1, 0] }, trail: { points: { length: 41, 40: [-2, 1.02, 0] } } }, readouts: { loss: 1, status: 'overshoot' } } },
  ],
  // By hand, from the comment above.
  counts: { triangles: 2682, linePoints: 258, labels: 3, nodes: 7 },
};

// ---- invalid cases ------------------------------------------------------------------------------------------------------
// { name, kind: 'plan' | 'artifact' | 'frame' | 'event', value, artifact? (frame/event), code, path }: the validator must
// return ok: false with an issue of exactly this code at this path.

const edit = (value, change) => { const copy = structuredClone(value); change(copy); return copy; };
const manySpheres = count => edit(watchFixture.artifact, a => {
  a.scene.geometries.push({ id: 'dense', kind: 'sphere', radius: 0.1, widthSegments: 64, heightSegments: 32 }); // 3,968 triangles each
  for (let i = 0; i < count; i += 1) a.scene.nodes.push({ id: `dense${i}`, geometry: 'dense', position: [i * 0.1, 2, 0] });
});
export const INVALID_ANIMATION_FIXTURES = Object.freeze([
  { name: 'physics behavior', kind: 'plan', value: edit(orbitPlan, p => { p.behavior = 'physics'; }), code: 'unsupported_capability', path: 'behavior' },
  { name: 'walk control profile', kind: 'plan', value: edit(orbitPlan, p => { p.controlProfile = 'walk'; }), code: 'unsupported_capability', path: 'controlProfile' },
  { name: 'walkthrough experience', kind: 'plan', value: edit(orbitPlan, p => { p.experience = 'walkthrough'; }), code: 'unsupported_capability', path: 'experience' },
  { name: 'assembly experience', kind: 'plan', value: edit(orbitPlan, p => { p.experience = 'assembly'; }), code: 'unsupported_capability', path: 'experience' },
  { name: 'attached asset', kind: 'plan', value: edit(orbitPlan, p => { p.sourceRefs = [{ sourceId: 'file_123', revision: 'r1' }]; }), code: 'unsupported_capability', path: 'sourceRefs' },
  { name: 'reserved physics feature', kind: 'plan', value: edit(orbitPlan, p => { p.requiredCapabilities = ['physics']; }), code: 'unsupported_capability', path: 'requiredCapabilities.0' },
  { name: 'seek on rules', kind: 'plan', value: edit(gridPlan, p => { p.requiredCapabilities = ['seek']; }), code: 'unsupported_capability', path: 'requiredCapabilities' },
  { name: 'unknown plan field', kind: 'plan', value: edit(orbitPlan, p => { p.onLoad = 'alert(1)'; }), code: 'unknown_field', path: 'onLoad' },
  { name: 'artifact physics behavior', kind: 'artifact', value: edit(experimentFixture.artifact, a => { a.behavior = 'physics'; }), code: 'unsupported_capability', path: 'behavior' },
  { name: 'artifact attached asset', kind: 'artifact', value: edit(watchFixture.artifact, a => { a.sourceRefs = [{ sourceId: 'file_123', revision: 'r1' }]; }), code: 'unsupported_capability', path: 'sourceRefs' },
  { name: 'hierarchy cycle', kind: 'artifact', value: edit(watchFixture.artifact, a => { a.scene.nodes[0].parent = 'moonTag'; }), code: 'hierarchy_cycle', path: 'scene.nodes.0.parent' },
  { name: 'unknown material', kind: 'artifact', value: edit(watchFixture.artifact, a => { a.scene.nodes[1].material = 'nope'; }), code: 'unknown_id', path: 'scene.nodes.1.material' },
  { name: 'unknown parent', kind: 'artifact', value: edit(watchFixture.artifact, a => { a.scene.nodes[1].parent = 'ghost'; }), code: 'unknown_id', path: 'scene.nodes.1.parent' },
  { name: 'duplicate node id', kind: 'artifact', value: edit(watchFixture.artifact, a => { a.scene.nodes[2].id = 'planet'; }), code: 'duplicate_id', path: 'scene.nodes.2.id' },
  { name: 'unnormalized quaternion', kind: 'artifact', value: edit(watchFixture.artifact, a => { a.scene.nodes[1].quaternion = [0, 0.5, 0, 0.5]; }), code: 'not_normalized', path: 'scene.nodes.1.quaternion' },
  { name: 'zero scale', kind: 'artifact', value: edit(watchFixture.artifact, a => { a.scene.nodes[1].scale = [1, 0, 1]; }), code: 'invalid_value', path: 'scene.nodes.1.scale.1' },
  { name: 'too many nodes', kind: 'artifact', value: edit(watchFixture.artifact, a => { for (let i = 0; i < 260; i += 1) a.scene.nodes.push({ id: `extra${i}` }); }), code: 'over_limit', path: 'scene.nodes' },
  { name: 'too many triangles', kind: 'artifact', value: manySpheres(26), code: 'over_limit', path: 'scene.nodes' },
  { name: 'missing program', kind: 'artifact', value: edit(experimentFixture.artifact, a => { delete a.program; }), code: 'missing_program', path: 'program' },
  { name: 'foreign program tuple', kind: 'artifact', value: edit(experimentFixture.artifact, a => { a.program.sdkVersion = 'sdk-1'; }), code: 'invalid_value', path: 'program.sdkVersion' },
  { name: 'shader source field', kind: 'artifact', value: edit(watchFixture.artifact, a => { a.scene.materials[0].fragmentShader = 'void main(){}'; }), code: 'unknown_field', path: 'scene.materials.0.fragmentShader' },
  { name: 'key bound to an undeclared action', kind: 'artifact', value: edit(gameFixture.artifact, a => { a.keys.up = 'jump'; }), code: 'unknown_id', path: 'keys.up' },
  { name: 'key bound to a non-id', kind: 'artifact', value: edit(gameFixture.artifact, a => { a.keys.left = 3; }), code: 'invalid_value', path: 'keys.left' },
  { name: 'key other than a direction', kind: 'artifact', value: edit(gameFixture.artifact, a => { a.keys.hold = 'east'; }), code: 'unknown_field', path: 'keys.hold' },
  { name: 'frame html field', kind: 'frame', artifact: experimentFixture.artifact, value: { nodes: { beam: { html: '<b>x</b>' } } }, code: 'unknown_field', path: 'nodes.beam.html' },
  { name: 'frame url field', kind: 'frame', artifact: experimentFixture.artifact, value: { texture: 'https://example.com/a.png' }, code: 'unknown_field', path: 'texture' },
  { name: 'frame unknown node', kind: 'frame', artifact: experimentFixture.artifact, value: { nodes: { ghost: { visible: false } } }, code: 'unknown_id', path: 'nodes.ghost' },
  { name: 'frame non-finite', kind: 'frame', artifact: experimentFixture.artifact, value: { readouts: { tilt: Number.NaN } }, code: 'invalid_value', path: 'readouts.tilt' },
  { name: 'frame unnormalized quaternion', kind: 'frame', artifact: experimentFixture.artifact, value: { nodes: { beam: { quaternion: [0, 0, 1, 1] } } }, code: 'not_normalized', path: 'nodes.beam.quaternion' },
  { name: 'frame undeclared readout', kind: 'frame', artifact: experimentFixture.artifact, value: { readouts: { energy: 1 } }, code: 'unknown_id', path: 'readouts.energy' },
  { name: 'frame goal outside a game', kind: 'frame', artifact: experimentFixture.artifact, value: { goal: { status: 'won' } }, code: 'not_declared', path: 'goal' },
  { name: 'event undeclared action', kind: 'event', artifact: gameFixture.artifact, value: { type: 'action', action: 'jump' }, code: 'unknown_id', path: 'action' },
  { name: 'event parameter out of range', kind: 'event', artifact: experimentFixture.artifact, value: { type: 'parameter', parameter: 'leftMass', value: 11 }, code: 'invalid_value', path: 'value' },
  { name: 'event step on unstepped scene', kind: 'event', artifact: gameFixture.artifact, value: { type: 'step', tick: 1 }, code: 'not_declared', path: 'type' },
  { name: 'event drag on fixed node', kind: 'event', artifact: gameFixture.artifact, value: { type: 'drag_move', node: 'robot', value: 1 }, code: 'not_declared', path: 'node' },
]);
