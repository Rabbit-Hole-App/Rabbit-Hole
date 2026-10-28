// HAND-AUTHORED TEST DATA. Two unrelated programs written by a person to exercise one contract. They are not generation
// evidence: no model wrote them, and they prove nothing about what a model will author. They carry subject matter (a
// savings curve, a binary search) only as data; nothing in the product reads these names.
// Every source is the canonical form: an ES module with the named export `export function evaluate({ inputs, time, seed, state })`
// returning { frame, quantities }, no imports, the SDK as the global `sdk`.
export const FIXTURE_NOTE = 'hand-authored test data, not generation evidence';

export const growthFixture = {
  id: 'fixture-growth', note: FIXTURE_NOTE,
  manifest: {
    title: 'Balance over time', summary: 'A balance grows from 1000 under a chosen yearly rate, simple or compounded.',
    assumptions: ['The rate is constant.', 'Interest is added once a year.'], description: 'A curve of the balance against years, with a marker at the current year.',
    inputs: [
      { type: 'number', id: 'rate', label: 'Yearly rate', unit: '%', default: 5, min: 0, max: 20, step: 0.5 },
      { type: 'number', id: 'years', label: 'Years', unit: 'y', default: 10, min: 1, max: 30, step: 1 },
      { type: 'select', id: 'mode', label: 'Interest', default: 'compound', options: [{ value: 'simple', label: 'Simple' }, { value: 'compound', label: 'Compound' }] },
    ],
    duration: 4, readouts: [{ id: 'balance', label: 'Balance', decimals: 0 }],
    capabilities: ['time_playback', 'number_inputs', 'select_inputs', 'polyline', 'math_text'],
  },
  source: `export function evaluate({ inputs, time, seed, state }) {
  const rate = inputs.rate / 100;
  const balance = t => (inputs.mode === 'compound' ? 1000 * Math.pow(1 + rate, t) : 1000 * (1 + rate * t));
  const shown = inputs.years * Math.min(1, time / 4);
  const sx = sdk.linear([0, inputs.years], [80, 880]);
  const sy = sdk.linear([1000, Math.max(balance(inputs.years), 1001)], [440, 60]);
  const curve = sdk.sample(balance, 0, shown, 60).map(p => [sx(p[0]), sy(p[1])]);
  const tip = curve[curve.length - 1];
  const tex = inputs.mode === 'compound' ? 'B = 1000(1+r)^t' : 'B = 1000(1+rt)';
  return {
    frame: sdk.frame([
      sdk.line('axis-x', 80, 440, 880, 440), sdk.line('axis-y', 80, 60, 80, 440),
      sdk.polyline('balance-curve', curve, { role: 'prediction', clip: { x: 80, y: 60, w: 800, h: 380 } }),
      sdk.circle('marker', tip[0], tip[1], 14, { role: 'learner' }),
      sdk.math('formula', 120, 80, tex),
      sdk.text('x-label', 760, 470, 'years'),
    ], { readouts: [{ id: 'balance', value: balance(shown) }] }),
    quantities: { balance: balance(shown), year: shown },
  };
}`,
  requests: [
    { inputs: { rate: 5, years: 10, mode: 'compound' }, time: 0 },
    { inputs: { rate: 5, years: 10, mode: 'compound' }, time: 4 },
    { inputs: { rate: 12, years: 25, mode: 'simple' }, time: 2 },
  ],
};

export const searchFixture = {
  id: 'fixture-search', note: FIXTURE_NOTE,
  manifest: {
    title: 'Halving a sorted row', summary: 'Look for a number in a sorted row of fifteen by repeatedly checking the middle of what is left.',
    assumptions: ['The row holds 1 to 15 in order.'], description: 'Fifteen numbered cells; the checked cell is marked and cells ruled out fade.',
    inputs: [{ type: 'number', id: 'target', label: 'Number to find', default: 11, min: 1, max: 15, step: 1 }],
    duration: 4, readouts: [{ id: 'checks', label: 'Checks so far', decimals: 0 }],
    capabilities: ['time_playback', 'number_inputs'],
  },
  source: `export function evaluate({ inputs, time, seed, state }) {
  const target = Math.round(inputs.target);
  const until = Math.floor(time);
  let lo = 1, hi = 15, mid = 8, step = 0;
  for (let guard = 0; guard < 16; guard += 1) {
    mid = Math.floor((lo + hi) / 2);
    if (mid === target || step >= until) break;
    if (mid < target) lo = mid + 1; else hi = mid - 1;
    step += 1;
  }
  const cells = [];
  for (let n = 1; n <= 15; n += 1) {
    const found = n === mid && mid === target;
    cells.push(sdk.box('cell-' + n, 30 + (n - 1) * 60, 220, 52, 52, { text: String(n), role: n === mid ? (found ? 'success' : 'prediction') : 'neutral', opacity: n >= lo && n <= hi ? 1 : 0.35 }));
  }
  const x = 30 + (mid - 1) * 60 + 26;
  return {
    frame: sdk.frame([...cells, sdk.arrow('pointer', x, 160, x, 212, { role: 'prediction' }),
      sdk.text('caption', 30, 120, mid === target ? 'Found ' + target + ' at cell ' + mid : 'Check cell ' + mid + ', then keep the ' + (mid < target ? 'upper' : 'lower') + ' part')],
      { readouts: [{ id: 'checks', value: step + 1 }] }),
    quantities: { checked: mid, low: lo, high: hi },
  };
}`,
  requests: [
    { inputs: { target: 11 }, time: 0 },
    { inputs: { target: 11 }, time: 3 },
    { inputs: { target: 2 }, time: 4 },
  ],
};

export const FIXTURES = [growthFixture, searchFixture];

// Cards the preview board shows so the three fixed error messages can be seen. Kept apart from FIXTURES: those must all render.
// fixture-loop never ends, so the interpreter stops it (runtime_limit). fixture-capability asks for something this build lacks
// (unsupported_capability, refused before anything runs). Both are hand-authored test data.
export const ERROR_FIXTURES = [
  { id: 'fixture-loop', note: FIXTURE_NOTE, manifest: { ...searchFixture.manifest, title: 'A program that never finishes' }, source: 'export function evaluate({ inputs, time, seed, state }) { for (;;) {} }' },
  { id: 'fixture-capability', note: FIXTURE_NOTE, manifest: { ...searchFixture.manifest, title: 'A program that needs an unavailable capability', capabilities: ['webgl'] }, source: searchFixture.source },
];
