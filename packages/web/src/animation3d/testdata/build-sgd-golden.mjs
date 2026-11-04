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

// The bowl is loss(x, z) = (3 x^2 + z^2) / 2 on x, z in [-2, 2], drawn at height 0.5 x loss (top 4 at the corners). Plain gradient
// descent diverges above learning rate 2/3, so 0.1 converges and 1.5 leaves the bowl on its first step.
export const BOWL = Object.freeze({ a: 3, c: 1, height: 0.5, half: 2, grid: 24, contours: 8, ball: 0.12, start: [0.5, 1.6] });

// ponytail: the program clamps nothing. The ball is placed at its true height and the renderer clamps it (clampTo); only the trail, which
// the renderer does not clamp, keeps its vertices at the surface top (lift). Divergence ends the run, so a trail holds at most one point off the bowl.
export const PROGRAM = `// Gradient descent on the loss bowl L(x, z) = (3 x^2 + z^2) / 2, drawn at height 0.5 L over the square x, z in [-2, 2].
const A = 3, C = 1, K = 0.5, R = 0.12, HALF = 2, TOP = 4, TOL = 0.02, MAX = 64, START = [0.5, 1.6];
const loss = (x, z) => 0.5 * (A * x * x + C * z * z);
const rand = n => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const gauss = n => Math.sqrt(-2 * Math.log(Math.max(1e-9, rand(n)))) * Math.cos(2 * Math.PI * rand(n + 0.5));
// The status word: the ball has left the drawn bowl, its loss is below 0.02, it is stepping, or it is waiting.
const word = s => (Math.abs(s.x) > HALF || Math.abs(s.z) > HALF ? 'diverged' : loss(s.x, s.z) < TOL ? 'converged' : s.on ? 'running' : 'paused');
const over = s => word(s) === 'diverged' || word(s) === 'converged';
// The next step: minus the learning rate times (the slope plus batch noise); no noise with all 256 examples. The noise is fixed by the run and the step.
function next(s, inputs) {
  const batch = Number(inputs.batchSize), sd = batch >= 256 ? 0 : 2 / Math.sqrt(batch), k = s.run * 1009 + s.step * 2 + 1;
  return [-inputs.learningRate * (A * s.x + sd * gauss(k)), -inputs.learningRate * (C * s.z + sd * gauss(k + 0.25))];
}
function advance(s, inputs) {
  if (over(s)) return s;
  const [dx, dz] = next(s, inputs), x = s.x + dx, z = s.z + dz;
  return { ...s, x, z, step: s.step + 1, path: s.path.concat([[x, z]]).slice(-MAX) };
}
const fresh = (run, kept) => ({ x: START[0], z: START[1], step: 0, run, on: false, path: [START], kept });
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
const lift = p => [p[0], Math.min(K * loss(p[0], p[1]), TOP) + 0.06, p[1]];
// An arrow turned to the step (dx, dz) and as long as the step itself, in the bowl's own units.
function aim(dx, dz, shown) {
  const l = Math.hypot(dx, dz), h = Math.SQRT1_2;
  return shown && l > 1e-6 ? { visible: true, quaternion: [dz / l * h, 0, -dx / l * h, h], scale: [1, l, 1] } : { visible: false };
}
export function evaluate({ inputs, state }) {
  const s = state || initialState(), L = loss(s.x, s.z), live = !over(s), [dx, dz] = next(s, inputs);
  const gx = K * A * s.x, gz = K * C * s.z; // the ball rests on the slope; its height is the true one, the renderer clamps it
  return {
    nodes: {
      ball: { position: [s.x, K * L + R * Math.sqrt(1 + gx * gx + gz * gz), s.z] },
      stepArrow: aim(dx, dz, live),
      slopeArrow: aim(-inputs.learningRate * A * s.x, -inputs.learningRate * C * s.z, live),
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
      description: 'OFFLINE FIXTURE, not generated by a model. A smooth blue bowl with eight contour lines, a red ball on its slope, an orange path behind the ball and a blue kept path, an orange arrow for the next step and a grey arrow for the downhill slope, and a status word.',
      experience: 'experiment', behavior: 'rules', controlProfile: 'inspect', sourceRefs: [],
      scene: {
        materials: [{ id: 'bowlBlue', color: '#8aa4c8' }, { id: 'ballRed', color: '#d23c2a' }, { id: 'pathOrange', color: '#e8731a' }, { id: 'keptBlue', color: '#3b6fc6' }, { id: 'slopeGrey', color: '#6b6b6b' }, { id: 'markDark', color: '#333a44' }],
        geometries: [
          { id: 'bowlGrid', kind: 'surface', heights: heights(), width: 2 * half, depth: 2 * half, contours },
          { id: 'runPath', kind: 'trail', max: 64, radius: 0.035, style: 'trail' },
          { id: 'keptPath', kind: 'trail', max: 64, radius: 0.035, style: 'ghost' },
          { id: 'ballBall', kind: 'sphere', radius: ball, widthSegments: 24, heightSegments: 12 },
          { id: 'lowestDot', kind: 'sphere', radius: 0.05, widthSegments: 12, heightSegments: 8 },
          { id: 'unitArrow', kind: 'arrow', length: 1, offset: ball },
          { id: 'lowestText', kind: 'label', text: 'Lowest point', placement: 'right' },
          { id: 'stepText', kind: 'label', text: 'Next step', anchor: 'tip' },
          { id: 'slopeText', kind: 'label', text: 'Downhill', anchor: 'tip' },
        ],
        nodes: [
          { id: 'bowl', geometry: 'bowlGrid', material: 'bowlBlue', name: 'Loss bowl' },
          { id: 'trail', geometry: 'runPath', material: 'pathOrange', name: 'This run' },
          { id: 'ghost', geometry: 'keptPath', material: 'keptBlue', name: 'Kept run' },
          { id: 'lowest', geometry: 'lowestDot', material: 'markDark', position: [0, 0.05, 0] },
          { id: 'lowestTag', parent: 'lowest', geometry: 'lowestText', position: [0.06, -0.1, 0] },
          { id: 'ball', geometry: 'ballBall', material: 'ballRed', name: 'Current guess', clampTo: { node: 'bowl' },
            position: [start[0], round(height * 0.5 * (a * start[0] ** 2 + c * start[1] ** 2) + ball * Math.sqrt(1 + gx * gx + gz * gz)), start[1]] },
          { id: 'stepArrow', parent: 'ball', geometry: 'unitArrow', material: 'pathOrange' },
          { id: 'stepTag', parent: 'stepArrow', geometry: 'stepText' },
          { id: 'slopeArrow', parent: 'ball', geometry: 'unitArrow', material: 'slopeGrey' },
          { id: 'slopeTag', parent: 'slopeArrow', geometry: 'slopeText' },
        ],
      },
      parameters,
      actions: [{ id: 'run', label: 'Run' }, { id: 'pause', label: 'Pause', startsMotion: false }, { id: 'step', label: 'Step once', startsMotion: false }, { id: 'newRun', label: 'New run, keep old path', startsMotion: false }],
      readouts: [{ id: 'status', label: 'Status', kind: 'text' }, { id: 'loss', label: 'Loss (true value)', decimals: 3 }, { id: 'steps', label: 'Steps taken', decimals: 0 }],
      stepped: true,
      program: { ...ANIMATION_PROGRAM_VERSIONS, source: PROGRAM, sourceHash: await hashProgramSource(PROGRAM) },
      seed: 7, camera: { position: [6, 5.5, 5], target: [0, 1.2, 0], fov: 45 },
      assumptions: [
        'Illustration: the bowl is the formula loss = (3 x^2 + z^2) / 2, drawn at 0.5 times the loss. No real data or model is used.',
        'Each step moves the ball by the learning rate times the slope plus batch noise; with all 256 examples there is no noise. The noise is fixed by the run and the step.',
        'Diverged means the ball has left the drawn bowl. The ball is then drawn at the top of the bowl, and the Loss readout keeps its true value.',
        'Converged means the loss is below 0.02.',
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
