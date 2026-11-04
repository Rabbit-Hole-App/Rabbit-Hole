// Builds testdata/sgd-golden.json: the golden SGD artifact (AN-19, owner decisions 11 to 13 of 3 Nov 2026). Run by hand:
//   node src/animation3d/testdata/build-sgd-golden.mjs      (from packages/web) -> rewrites sgd-golden.json
// It is run 2's repaired draft (aj_0b6ca2b, control-plane/test/fixtures/animation-aj_0b6ca2b.json) rewritten onto the AN-18 contract:
// a 24 x 24 height-grid surface with 8 contours instead of tube rings, one clamped ball, a trail and a ghost instead of 80 dot nodes,
// a text status readout, and offset arrows with tip labels. A fixture and an exemplar for the author, never a canned result (decision 7).
// The script exists so the 576 surface heights, the program hash and the plan hash cannot drift from the numbers they come from;
// sgd-golden.test.mjs rebuilds it in memory and fails when the JSON differs.
import { writeFileSync } from 'node:fs';
import { ANIMATION_CAPABILITIES } from '../capabilities.js';
import { ANIMATION_PROGRAM_VERSIONS, PLAN_SCHEMA, SCENE_SCHEMA, hashAnimationPlan, hashProgramSource } from '../contract.js';

// The bowl is loss(x, z) = (1.4 x^2 + 0.5 z^2) / 2 on x, z in [-2, 2], drawn at that height (top 3.8 at the corners). Plain gradient descent turns x by 1 - 1.4 r and z by
// 1 - 0.5 r each step: it converges below r = 2 / 1.4 = 1.43 and diverges above it, one growing swing at a time (x grows by 1.1 at r = 1.5 and by 1.8 at the top of the range, 2,
// where the marker makes five swings before it leaves). The curvature, not the rate range, sets that: the control's slider still runs 0.01 to 2. z is the gentle direction: at
// rate 2 it is turned by 1 - 2 x 0.5 = 0, so the noise (which acts along z) cannot throw the marker out of the bowl before the swings in x have grown.
export const BOWL = Object.freeze({ a: 1.4, c: 0.5, height: 1, half: 2, grid: 24, contours: 8, ball: 0.12, start: [0.1, 1.5] });

// ponytail: the program clamps nothing. The ball is placed at its true position and the renderer holds it at the rim, on the surface (clampTo); only the trail, which the
// renderer does not clamp, is held by the program (lift): a path point off the bowl is drawn at the surface under the rim point where the ball is held. Divergence ends the run,
// so a trail holds at most one point off the bowl.
export const PROGRAM = `// Gradient descent on the loss bowl L(x, z) = (1.4 x^2 + 0.5 z^2) / 2, drawn at height L over the square x, z in [-2, 2]. Plain descent turns every x step by 1 - 1.4 r.
const A = 1.4, C = 0.5, K = 1, R = 0.12, HALF = 2, FLAT = 0.12, MAX = 64, START = [0.1, 1.5], SCALE = 10.7, LONGEST = 2, SHORTEST = 0.4, QUIET = 3, BAND = 0.35, NOISE = 1;
const loss = (x, z) => 0.5 * (A * x * x + C * z * z);
const rand = n => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const gauss = n => Math.sqrt(-2 * Math.log(Math.max(1e-9, rand(n)))) * Math.cos(2 * Math.PI * rand(n + 0.5));
// The status word: the ball has left the drawn bowl, it has settled (QUIET steps in a row with the steep slope under 0.12 and the gentle slope under BAND: a small band around the
// lowest point, wide along z because that is where the noise keeps it wandering), it is stepping, or it is waiting. Slopes, not the loss, and a run of steps, not one: a ball still
// growing its swings (steep slope above 0.12) is never called converged, and a jittering one is.
const word = s => (Math.abs(s.x) > HALF || Math.abs(s.z) > HALF ? 'diverged' : s.calm >= QUIET ? 'converged' : s.on ? 'running' : 'paused');
const over = s => word(s) === 'diverged' || word(s) === 'converged';
// The next step is -rate x (slope + noise), as in SGD: the noise is a random amount (NOISE / sqrt(batch) a step in the slope along z, the gentle direction) that does not fade near
// the lowest point, so at a fixed rate the ball keeps wandering a little around it; the jolt is the rate times that, so it is large at a high rate and small at a low one, and a
// small rate settles at every batch size. None with all 256 examples. It is fixed by the run and the step. x has no noise: the swings of a diverging run keep their shape.
function next(s, inputs) {
  const batch = Number(inputs.batchSize), sd = batch >= 256 ? 0 : NOISE / Math.sqrt(batch), k = s.run * 1009 + s.step * 2 + 35; // 35: the first run opens on a visible difference between the two arrows
  return [-inputs.learningRate * A * s.x, -inputs.learningRate * (C * s.z + sd * gauss(k))];
}
function advance(s, inputs) {
  if (over(s)) return s;
  const [dx, dz] = next(s, inputs), x = s.x + dx, z = s.z + dz;
  return { ...s, x, z, step: s.step + 1, calm: Math.abs(A * x) < FLAT && Math.abs(C * z) < BAND ? s.calm + 1 : 0, path: s.path.concat([[x, z]]).slice(-MAX) };
}
const fresh = (run, kept) => ({ x: START[0], z: START[1], step: 0, run, on: false, calm: 0, path: [START], kept });
export function initialState() { return fresh(0, []); }
export function reduce({ state: s, event: e, inputs }) {
  if (e.type === 'step') return !s.on || over(s) || e.tick % 6 ? s : advance(s, inputs); // five steps a second while running
  if (e.type !== 'action') return s;
  if (e.action === 'run') return over(s) ? s : { ...s, on: true };
  if (e.action === 'pause') return { ...s, on: false };
  if (e.action === 'step') return advance({ ...s, on: false }, inputs);
  if (e.action === 'newRun') return fresh(s.run + 1, s.step > 0 ? s.path : s.kept); // the path just run stays as the ghost
  return s;
}
const rim = v => Math.max(-HALF, Math.min(HALF, v));
const lift = p => { const x = rim(p[0]), z = rim(p[1]); return [x, K * loss(x, z) + 0.06, z]; }; // a point off the bowl is drawn on the surface at the rim, where the ball is held
// An arrow turned to the step (dx, dz) and SCALE times as long as the step, in the bowl's own units: one scale for both arrows, at most LONGEST long, and hidden
// when shorter than SHORTEST (a speck, near the lowest point).
function aim(dx, dz, shown) {
  const v = Math.hypot(dx, dz), h = Math.SQRT1_2;
  return shown && v * SCALE >= SHORTEST ? { visible: true, quaternion: [dz / v * h, 0, -dx / v * h, h], scale: [1, Math.min(v * SCALE, LONGEST), 1] } : { visible: false };
}
export function evaluate({ inputs, state }) {
  const s = state || initialState(), L = loss(s.x, s.z), live = !over(s), [dx, dz] = next(s, inputs);
  const gx = K * A * s.x, gz = K * C * s.z; // the ball rests on the slope; its height is the true one, the renderer clamps it
  return {
    nodes: {
      ball: { position: [s.x, K * L + R * Math.sqrt(1 + gx * gx + gz * gz), s.z] },
      stepArrow: aim(dx, dz, live),
      fullArrow: aim(-inputs.learningRate * A * s.x, -inputs.learningRate * C * s.z, live), // the step all 256 examples would take
      trail: { points: s.path.map(lift) },
      ghost: { points: s.kept.map(lift) },
    },
    readouts: { status: word(s), loss: L, steps: s.step },
  };
}
`;

const round = value => Math.round(value * 100) / 100;
const heights = () => Array.from({ length: BOWL.grid }, (_, r) => Array.from({ length: BOWL.grid }, (_, c) => {
  const x = -BOWL.half + 2 * BOWL.half * c / (BOWL.grid - 1), z = -BOWL.half + 2 * BOWL.half * r / (BOWL.grid - 1);
  return round(BOWL.height * 0.5 * (BOWL.a * x * x + BOWL.c * z * z)); // row r runs along z, column c along x
}));

const parameters = [
  { type: 'number', id: 'learningRate', label: 'Learning rate', min: 0.01, max: 2, step: 0.01, default: 0.1 },
  { type: 'select', id: 'batchSize', label: 'Batch size', options: [{ value: '1', label: '1 example' }, { value: '4', label: '4 examples' }, { value: '16', label: '16 examples' }, { value: '64', label: '64 examples' }, { value: '256', label: 'All 256 examples (no noise)' }], default: '16' },
];
const plan = {
  schema: PLAN_SCHEMA, title: 'Offline fixture: gradient descent on a loss bowl',
  description: 'A ball on a bowl-shaped loss surface takes gradient steps downhill. Set the learning rate and the batch size, press Run, and watch the path, the next step and the status word. Keep a path, then run again with another learning rate to compare.',
  experience: 'experiment', reason: 'Changing the learning rate and watching the same bowl answer is the clearest way to see why a high rate diverges.',
  behavior: 'rules', controlProfile: 'inspect', sourceRefs: [], parameters,
  interactions: ['Set the learning rate and the batch size.', 'Run, pause or take one step.', 'Start a new run and keep the old path to compare.'],
  assumptions: ['The loss is a simple formula, not a real model.', 'The batch noise is simulated and fixed by the run.'],
  limitations: ['One bowl with one lowest point; no momentum or other optimizers.'],
  learningGoal: 'A learning rate that is too high overshoots the lowest point and diverges; a small one converges.',
  requiredCapabilities: ['parameters', 'actions', 'step', 'labels', 'readouts'],
};

export async function buildGolden() {
  const { a, c, height, half, grid, contours, ball, start } = BOWL;
  const gx = height * a * start[0], gz = height * c * start[1];
  const top = height * 0.5 * (a * half * half + c * half * half);
  return {
    note: 'The golden SGD artifact (AN-19): run 2\'s repaired draft (aj_0b6ca2b) rewritten by hand onto the AN-18 contract by build-sgd-golden.mjs. A fixture and an exemplar, never a canned result. The surface top is ' + top + '.',
    plan,
    artifact: {
      schema: SCENE_SCHEMA, artifactId: 'fixture-sgd-golden', revision: 1, planHash: await hashAnimationPlan(plan), capabilityVersion: ANIMATION_CAPABILITIES.version,
      title: plan.title,
      description: 'OFFLINE FIXTURE, not generated by a model. A smooth blue bowl with eight contour lines, a red ball on its slope, an orange path behind the ball and a dark blue kept path, a purple arrow for the next step and a dark grey arrow for the full-batch step, and a status word.',
      experience: 'experiment', behavior: 'rules', controlProfile: 'inspect', sourceRefs: [],
      scene: {
        materials: [{ id: 'bowlBlue', color: '#8aa4c8' }, { id: 'ballRed', color: '#d23c2a' }, { id: 'pathOrange', color: '#e8731a' }, { id: 'keptBlue', color: '#1f3a7a' }, { id: 'stepPurple', color: '#7b2fbf' }, { id: 'fullDark', color: '#2f3640' }, { id: 'markDark', color: '#333a44' }],
        geometries: [
          { id: 'bowlGrid', kind: 'surface', heights: heights(), width: 2 * half, depth: 2 * half, contours },
          { id: 'runPath', kind: 'trail', max: 64, radius: 0.08, style: 'trail' },
          { id: 'keptPath', kind: 'trail', max: 64, radius: 0.08, style: 'ghost' },
          { id: 'ballBall', kind: 'sphere', radius: ball, widthSegments: 24, heightSegments: 12 },
          { id: 'lowestDot', kind: 'sphere', radius: 0.05, widthSegments: 12, heightSegments: 8 },
          { id: 'unitArrow', kind: 'arrow', length: 1, offset: ball },
          { id: 'lowestText', kind: 'label', text: 'Lowest point', placement: 'right' },
          { id: 'stepText', kind: 'label', text: 'Next step', anchor: 'tip' },
          { id: 'fullText', kind: 'label', text: 'Full-batch step', anchor: 'tip' },
        ],
        nodes: [
          { id: 'bowl', geometry: 'bowlGrid', material: 'bowlBlue', name: 'Loss bowl' },
          { id: 'trail', geometry: 'runPath', material: 'pathOrange', name: 'This run' },
          { id: 'ghost', geometry: 'keptPath', material: 'keptBlue', name: 'Kept run' },
          { id: 'lowest', geometry: 'lowestDot', material: 'markDark', position: [0, 0.05, 0] },
          { id: 'lowestTag', parent: 'lowest', geometry: 'lowestText', position: [0.06, -0.1, 0] },
          { id: 'ball', geometry: 'ballBall', material: 'ballRed', name: 'Current guess', clampTo: { node: 'bowl' },
            position: [start[0], round(height * 0.5 * (a * start[0] ** 2 + c * start[1] ** 2) + ball * Math.sqrt(1 + gx * gx + gz * gz)), start[1]] },
          { id: 'stepArrow', parent: 'ball', geometry: 'unitArrow', material: 'stepPurple' },
          { id: 'stepTag', parent: 'stepArrow', geometry: 'stepText' },
          { id: 'fullArrow', parent: 'ball', geometry: 'unitArrow', material: 'fullDark' },
          { id: 'fullTag', parent: 'fullArrow', geometry: 'fullText' },
        ],
      },
      parameters,
      actions: [{ id: 'run', label: 'Run' }, { id: 'pause', label: 'Pause', startsMotion: false }, { id: 'step', label: 'Step once', startsMotion: false }, { id: 'newRun', label: 'New run, keep old path', startsMotion: false }],
      readouts: [{ id: 'status', label: 'Status', kind: 'text' }, { id: 'loss', label: 'Loss (true value)', decimals: 3 }, { id: 'steps', label: 'Steps taken', decimals: 0 }],
      stepped: true,
      program: { ...ANIMATION_PROGRAM_VERSIONS, source: PROGRAM, sourceHash: await hashProgramSource(PROGRAM) },
      seed: 7, camera: { position: [0, 10.03, 4.69], target: [0, 1.2, 0], fov: 45 },
      assumptions: [
        'Illustration: the bowl is the formula loss = (1.4 x^2 + 0.5 z^2) / 2, drawn at a height equal to the loss. No real data or model is used.',
        'Each step moves the ball by -rate x (slope + noise). The noise acts along z, is larger for a smaller batch and does not fade near the lowest point, so the ball keeps wandering a little at a fixed rate; with all 256 examples there is none. It is fixed by the run and the step.',
        'Diverged means the ball has left the drawn bowl. It is then drawn at the rim, on the surface, and the Loss readout keeps its true value.',
        'Converged means the slope under the ball has stayed small (under 0.12 along the steep axis, under 0.35 along the other) for three steps in a row: it has settled in a band around the lowest point.',
        'Both arrows are steps drawn at 10.7 times their real length, one scale for both, at most 2 long. Next step is the step this batch gives; Full-batch step is the step all 256 examples would give. An arrow shorter than 0.4 is hidden.',
        'A point of the path outside the bowl is drawn at the rim, on the surface, where the ball is held.',
      ],
      provenance: { origin: 'fixture' },
    },
  };
}

// One line per array of numbers (a height row, a vector), so the file diffs by row.
export const goldenText = golden => `${JSON.stringify(golden, null, 1).replace(/\[\n\s*(-?[\d.e+-]+(?:,\n\s*-?[\d.e+-]+)*)\n\s*\]/g, (_, body) => `[${body.replace(/,\n\s*/g, ', ')}]`)}\n`;

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop())) {
  writeFileSync(new URL('./sgd-golden.json', import.meta.url), goldenText(await buildGolden()));
  console.log('wrote sgd-golden.json');
}
