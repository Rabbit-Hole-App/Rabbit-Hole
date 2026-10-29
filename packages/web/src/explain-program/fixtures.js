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

// Stateful (schema 2) programs: initialState, reduce and evaluate, declared buttons and selectable objects. Same rule as above:
// hand-authored test data, subject matter only as data. One is an algorithm stepped by ordered button presses with selectable items;
// the other a continuous numeric simulation advanced by a button and shaped by a number input.
export const sortFixture = {
  id: 'fixture-sort', note: FIXTURE_NOTE,
  manifest: {
    title: 'Sorting by neighbour swaps', summary: 'Each press compares one neighbouring pair of bars and swaps them if they are out of order.',
    assumptions: ['Six values, sorted smallest first.'], description: 'Six bars of different heights; the pair being compared is marked and a selected bar shows its value.',
    inputs: [], readouts: [{ id: 'swaps', label: 'Swaps so far', decimals: 0 }], capabilities: [],
    viewport: { width: 720, height: 360 },
    actions: [{ id: 'step', label: 'Compare next pair' }, { id: 'shuffle', label: 'Shuffle' }],
    targets: [0, 1, 2, 3, 4, 5].map(k => ({ id: 'bar-' + k, label: 'Bar ' + (k + 1) })),
  },
  source: `export function initialState({ seed }) { return { values: [5, 2, 6, 1, 4, 3], i: 0, swaps: 0, sorted: false, selected: null, shuffles: 0 }; }
export function reduce({ state, event }) {
  if (event.type === 'select') return { ...state, selected: Number(event.target.slice(4)) };
  if (event.action === 'shuffle') {
    for (let k = 0; k < state.shuffles * 5; k++) Math.random(); // Math.random restarts from seed each call: skip the draws of earlier shuffles
    const values = [...state.values];
    for (let k = values.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [values[k], values[j]] = [values[j], values[k]]; }
    return { ...state, values, i: 0, swaps: 0, sorted: false, shuffles: state.shuffles + 1 };
  }
  if (state.sorted) return state;
  const values = [...state.values], i = state.i, swap = values[i] > values[i + 1];
  if (swap) [values[i], values[i + 1]] = [values[i + 1], values[i]];
  const next = (i + 1) % (values.length - 1);
  const sorted = next === 0 && values.every((v, k) => k === 0 || values[k - 1] <= v);
  return { ...state, values, i: next, swaps: state.swaps + (swap ? 1 : 0), sorted };
}
export function evaluate({ state }) {
  const bars = state.values.map((v, k) => sdk.box('bar-' + k, 60 + k * 100, 300 - v * 40, 80, v * 40, {
    text: String(v), role: state.sorted ? 'success' : k === state.i || k === state.i + 1 ? 'prediction' : k === state.selected ? 'learner' : 'neutral' }));
  const caption = state.sorted ? 'Sorted after ' + state.swaps + ' swaps' : 'Next: compare bar ' + (state.i + 1) + ' and bar ' + (state.i + 2);
  const picked = state.selected === null ? 'Select a bar to see its value' : 'Bar ' + (state.selected + 1) + ' holds ' + state.values[state.selected];
  return {
    frame: sdk.frame([...bars, sdk.text('caption', 60, 30, caption), sdk.text('picked', 60, 340, picked)], { width: 720, height: 360, readouts: [{ id: 'swaps', value: state.swaps }] }),
    quantities: { swaps: state.swaps, position: state.i },
  };
}`,
  events: [{ type: 'action', action: 'step' }, { type: 'action', action: 'step' }, { type: 'select', target: 'bar-2' }, { type: 'action', action: 'shuffle' }],
};

export const springFixture = {
  id: 'fixture-spring', note: FIXTURE_NOTE,
  manifest: {
    title: 'A mass on a spring, step by step', summary: 'Each press advances a mass on a spring by a tenth of a second; a kick gives it speed.',
    assumptions: ['No friction.', 'Small steps of a hundredth of a second.', 'A stiffness above 18 is refused (test data: a transition the program refuses).'], description: 'A mass moving left and right of its rest point, with its position and the time so far.',
    inputs: [{ type: 'number', id: 'stiffness', label: 'Stiffness', unit: 'N/m', default: 4, min: 1, max: 20, step: 1 }],
    readouts: [{ id: 'position', label: 'Position', unit: 'm', decimals: 2 }, { id: 'elapsed', label: 'Time', unit: 's', decimals: 1 }], capabilities: ['number_inputs'],
    viewport: { width: 960, height: 300 },
    actions: [{ id: 'advance', label: 'Advance 0.1 s' }, { id: 'kick', label: 'Kick' }],
    targets: [],
  },
  source: `export function initialState() { return { x: 1, v: 0, t: 0 }; }
export function reduce({ state, event, inputs }) {
  if (event.type === 'input') { if (event.value > 18) throw new Error('a stiffness above 18 is not modelled'); return state; }
  if (event.action === 'kick') return { ...state, v: state.v + 1 };
  let { x, v } = state;
  for (let n = 0; n < 10; n++) { v -= inputs.stiffness * x * 0.01; x += v * 0.01; }
  return { x, v, t: Math.round((state.t + 0.1) * 10) / 10 };
}
export function evaluate({ state }) {
  const px = sdk.linear([-3, 3], [80, 880]);
  const x = sdk.clamp(state.x, -3, 3);
  return {
    frame: sdk.frame([
      sdk.line('track', 80, 200, 880, 200), sdk.line('rest', px(0), 170, px(0), 230),
      sdk.line('spring', 80, 160, px(x), 160, { role: 'input' }),
      sdk.box('mass', px(x) - 30, 130, 60, 60, { role: 'output' }),
      sdk.text('label', 80, 60, 'Position ' + sdk.format(state.x) + ' m after ' + sdk.format(state.t, 1) + ' s'),
    ], { width: 960, height: 300, readouts: [{ id: 'position', value: state.x }, { id: 'elapsed', value: state.t }] }),
    quantities: { position: state.x, speed: state.v, elapsed: state.t },
  };
}`,
  events: [{ type: 'action', action: 'advance' }, { type: 'action', action: 'kick' }, { type: 'input', input: 'stiffness', value: 9 }, { type: 'action', action: 'advance' }],
};

// A drag target (Task 8.4): a handle the learner drags along a track; its position is wherever the pointer is, in frame coordinates. The
// fixed marker at 540 is only there for the browser check to drop the handle on a known point.
export const dragFixture = {
  id: 'fixture-drag', note: FIXTURE_NOTE,
  manifest: {
    title: 'Placing a point on a track', summary: 'Drag the handle along the track; the card reports where it is and how many times it was placed.',
    assumptions: ['The track runs from 60 to 660.'], description: 'A horizontal track with a square handle and a small marker.',
    inputs: [], readouts: [{ id: 'position', label: 'Position', decimals: 0 }, { id: 'drops', label: 'Placed', decimals: 0 }], capabilities: [],
    viewport: { width: 720, height: 360 },
    actions: [{ id: 'centre', label: 'Centre it' }],
    targets: [{ id: 'handle', label: 'Handle', drag: true }],
  },
  source: `export function initialState() { return { x: 180, dragging: false, drops: 0, moves: 0 }; }
export function reduce({ state, event }) {
  const at = x => Math.min(660, Math.max(60, x));
  if (event.type === 'drag_start') return { ...state, x: at(event.x), dragging: true };
  if (event.type === 'drag_move') return { ...state, x: at(event.x), moves: state.moves + 1 };
  if (event.type === 'drag_end') return { ...state, x: at(event.x), dragging: false, drops: state.drops + 1 };
  if (event.type === 'action') return { ...state, x: 360 };
  return state;
}
export function evaluate({ state }) {
  return {
    frame: sdk.frame([
      sdk.line('track', 60, 180, 660, 180), sdk.box('mark', 530, 220, 20, 20, { role: 'observed' }),
      sdk.box('handle', state.x - 20, 160, 40, 40, { role: state.dragging ? 'learner' : 'input' }),
      sdk.text('label', 60, 60, 'Handle at ' + Math.round(state.x) + (state.dragging ? ' (dragging)' : '') + ', placed ' + state.drops + ' times'),
    ], { width: 720, height: 360, readouts: [{ id: 'position', value: state.x }, { id: 'drops', value: state.drops }] }),
    quantities: { position: state.x, drops: state.drops, moves: state.moves },
  };
}`,
  events: [{ type: 'drag_start', target: 'handle', x: 200, y: 180 }, { type: 'drag_move', target: 'handle', x: 400, y: 180 }, { type: 'drag_end', target: 'handle', x: 420, y: 190 }],
};

export const STATEFUL_FIXTURES = [sortFixture, springFixture, dragFixture];

// Cards the preview board shows so the three fixed error messages can be seen. Kept apart from FIXTURES: those must all render.
// fixture-loop never ends, so the interpreter stops it (runtime_limit). fixture-capability asks for something this build lacks
// (unsupported_capability, refused before anything runs). Both are hand-authored test data.
export const ERROR_FIXTURES = [
  { id: 'fixture-loop', note: FIXTURE_NOTE, manifest: { ...searchFixture.manifest, title: 'A program that never finishes' }, source: 'export function evaluate({ inputs, time, seed, state }) { for (;;) {} }' },
  { id: 'fixture-capability', note: FIXTURE_NOTE, manifest: { ...searchFixture.manifest, title: 'A program that needs an unavailable capability', capabilities: ['webgl'] }, source: searchFixture.source },
];
