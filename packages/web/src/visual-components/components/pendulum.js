// Pendulum (EXP-T26 acceptance, r2-contract.md): a simple pendulum drawn to scale beside its period law and a
// period-against-length plot. Learner controls: length (period follows T = 2*pi*sqrt(L/g)) and mass (the period
// does not change: an invariant). Nothing swings: the drawing is the settled pendulum at each admitted length, so
// there is no oscillation to get wrong (plan T26: otherwise an honest static comparison).
import { wrapLabel, lineFields } from '../label.js';

const G = 9.81, SCALE = 80; // px per metre (Lane B2's pendulum geometry)
const PIVOT_Y = 24, STRING_X = 90, READ_X = 210, PLOT_W = 300, PLOT_H = 150;

export const period = length => 2 * Math.PI * Math.sqrt(length / G);
const bobSize = mass => Math.round(20 + 10 * Math.sqrt(mass));
const fixed = (value, places) => value.toFixed(places);
const text = (id, content, x, y, typography = 'body', role) => ({ id, type: 'text', initialState: { text: content, x, y, typography, ...(role ? { role } : {}) } });

export default {
  name: 'pendulum', version: 1,
  description: 'A pendulum drawn to scale (80 px per metre) with T = 2 pi sqrt(L/g), readouts of L, m and T, and a plot of period against length with one point per admitted length. Controls: length (string, bob, readouts, plot point) and mass (bob and mass readout; the period is invariant). Anchors: top, bottom, left, right, plot.',
  params: {
    length: { type: 'number', min: 0.1, max: 4, default: 1 },
    mass: { type: 'number', min: 0.1, max: 5, default: 1 },
  },
  hints: {},
  repairWritable: [],
  anchors: ['top', 'bottom', 'left', 'right', 'plot'],
  fixtures: ['pendulum-experiment'],
  controls: {
    length: { param: 'length', label: 'Pendulum length', unit: 'm', affects: 'string, bob, lengthText, periodText and marker (the point on the plot)' },
    mass: { param: 'mass', label: 'Bob mass', unit: 'kg', affects: 'bob and massText', invariant: 'periodText and marker: the period does not depend on the mass' },
  },
  compile({ params, controlValues = {} }) {
    // Sized for the longest and heaviest admitted state, so every state has the same frame.
    const lengths = controlValues.length || [params.length];
    const maxL = Math.max(...lengths, params.length);
    const maxBob = bobSize(Math.max(...(controlValues.mass || [params.mass]), params.mass));
    const T = period(params.length), maxT = period(maxL);
    const bobY = PIVOT_Y + params.length * SCALE;
    const formula = wrapLabel({ runs: [{ kind: 'math', tex: 'T = 2\\pi\\sqrt{L/g}' }] }, Infinity)[0];
    const ox = READ_X + 48, oy = 196 + PLOT_H;
    const at = length => ({ x: Math.round(ox + (length / maxL) * PLOT_W), y: Math.round(oy - (period(length) / maxT) * PLOT_H) });
    const point = at(params.length);
    const objects = [
      { id: 'support', type: 'line', initialState: { from: { x: STRING_X - 60, y: PIVOT_Y }, to: { x: STRING_X + 60, y: PIVOT_Y }, role: 'neutral' } },
      // The string ends at the top of the bob (it hangs from it); the bob's centre is at length L below the pivot.
      { id: 'string', type: 'line', initialState: { from: { x: STRING_X, y: PIVOT_Y }, to: { x: STRING_X, y: Math.round(bobY - bobSize(params.mass) / 2) }, role: 'neutral' } },
      { id: 'bob', type: 'circle', initialState: { x: STRING_X, y: Math.round(bobY), w: bobSize(params.mass), role: 'input' } },
      text('lengthText', `Length L = ${fixed(params.length, 2)} m`, READ_X, 40),
      text('massText', `Mass m = ${fixed(params.mass, 1)} kg`, READ_X, 72),
      { id: 'law', type: 'text', initialState: { ...lineFields(formula, 'text'), x: READ_X, y: 112, typography: 'body' } },
      text('periodText', `Period T = ${fixed(T, 2)} s`, READ_X, 150, 'body', 'output'),
      { id: 'xAxis', type: 'arrow', initialState: { from: { x: ox, y: oy }, to: { x: ox + PLOT_W + 16, y: oy }, role: 'neutral' } },
      { id: 'yAxis', type: 'arrow', initialState: { from: { x: ox, y: oy }, to: { x: ox, y: oy - PLOT_H - 16 }, role: 'neutral' } },
      // Ticks at the largest admitted length and its period, labelled beside them.
      { id: 'xTick', type: 'line', initialState: { from: { x: ox + PLOT_W, y: oy }, to: { x: ox + PLOT_W, y: oy + 8 }, role: 'neutral' } },
      { id: 'yTick', type: 'line', initialState: { from: { x: ox - 8, y: oy - PLOT_H }, to: { x: ox, y: oy - PLOT_H }, role: 'neutral' } },
      text('xMax', fixed(maxL, 2), ox + PLOT_W - 14, oy + 34, 'annotation'),
      text('xLabel', 'length L (m)', ox + PLOT_W - 72, oy + 58, 'annotation'),
      text('yMax', fixed(maxT, 2), ox - 52, oy - PLOT_H + 5, 'annotation'),
      text('yLabel', 'T (s)', ox - 52, oy - PLOT_H - 22, 'annotation'),
      // One point per admitted length: samples of the law, not a continuous curve.
      ...[...new Set(lengths)].map((length, index) => ({ id: `sample${index}`, type: 'circle', initialState: { ...at(length), w: 8, role: 'neutral' } })),
      { id: 'marker', type: 'circle', initialState: { ...point, w: 16, role: 'output' } },
    ];
    const w = ox + PLOT_W + 32;
    const h = Math.max(oy + 70, Math.round(PIVOT_Y + maxL * SCALE + maxBob / 2 + 8));
    return { w, h, objects, anchors: { top: { x: w / 2, y: 0 }, bottom: { x: w / 2, y: h }, left: { x: 0, y: h / 2 }, right: { x: w, y: h / 2 }, plot: { x: ox + PLOT_W / 2, y: oy } } };
  },
};
