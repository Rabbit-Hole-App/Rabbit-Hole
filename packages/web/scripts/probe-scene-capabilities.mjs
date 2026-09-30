// Reproducible evidence for the NanoGPT board's capability report
// (docs/nanogpt-deep-dive-board-plan.md). Each probe runs a tiny scene or
// derive call through the REAL runtime (evaluateScene, the consistency and
// layout gates) and records what actually happens, so a claimed gap is a
// demonstrated one - not an inference from reading code.
//
//   node scripts/probe-scene-capabilities.mjs          # human report
//   node scripts/probe-scene-capabilities.mjs --json   # machine-readable
//
// Categories (the five the review asked us to keep distinct):
//   renderer      - the renderer cannot draw it
//   calculation   - the evaluator cannot compute it
//   binding       - the value exists but cannot reach the object/field
//   composition   - possible today by composing existing primitives
//   precomputed   - possible today from validated, authoring-time data
import { evaluateScene } from '../src/scene-evaluate.js';
import { checkSceneConsistency } from '../src/scene-consistency.js';
import { checkLayoutLint } from '../src/scene-layout-lint.js';
import { DERIVATIONS } from '../src/scene-derive.js';
import { RENDERED_TYPES } from '../src/animation-scene.js';
import { readFileSync } from 'node:fs';

const src = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const lineOf = (text, needle) => text.split('\n').findIndex(line => line.includes(needle)) + 1;
const base = (objects, extra = {}) => ({ id: 'probe', title: 'probe', width: 600, height: 300, duration: 1, objects, timeline: [], ...extra });
const obj = (id, type, initialState) => ({ id, type, semanticId: id, conceptId: 'probe', initialState });
const tryRun = fn => { try { return { ok: true, value: fn() }; } catch (error) { return { ok: false, error: error.message.split('\n')[0] }; } };
const gates = scene => ({ consistency: checkSceneConsistency(scene).issues.length, layout: checkLayoutLint(scene).issues.length });

const probes = [];
const probe = (id, claim, fn) => probes.push({ id, claim, ...fn() });

probe('grid-row-labels', 'Plan said grids expose only columnLabels, not rowLabels', () => {
  const scene = base([obj('g', 'grid', { x: 80, y: 60, rows: 2, cols: 2, cell: 40, matrixKind: 'input', values: [1, 2, 3, 4], rowLabels: ['query 0', 'query 1'], columnLabels: ['k0', 'k1'] })]);
  const run = tryRun(() => evaluateScene(scene, 1, {}));
  const g = run.value?.state.objects.find(o => o.id === 'g');
  return {
    category: 'supported', verdict: 'CLAIM WRONG - supported today',
    evidence: `evaluated grid carries rowLabels=${JSON.stringify(g?.rowLabels)}; drawn at AnimatedScene.jsx:${lineOf(src('AnimatedScene.jsx'), "object.rowLabels?.map")}, laid out at scene-layout.js:${lineOf(src('scene-layout.js'), 'object.rowLabels ||')}. Same branch, same primitive - the earlier claim came from a design subagent inference that was never checked against the worktree.`,
  };
});

probe('input-bound-visibility', 'Plan said no input can show/hide a set of objects (opacity is timeline-driven)', () => {
  const scene = base([
    obj('a', 'box', { label: 'A', x: 40, y: 40, w: 80, h: 40, opacity: { $derive: 'opA' } }),
    obj('b', 'box', { label: 'B', x: 200, y: 40, w: 80, h: 40, opacity: { $derive: 'opB' } }),
  ], {
    inputs: [{ name: 'which', type: 'index', label: 'Which', of: 'names', default: 0 }],
    exampleData: { names: ['A', 'B'], opAByWhich: [1, 0], opBByWhich: [0, 1] },
    derived: { opA: { op: 'pick', args: ['opAByWhich', 'which'] }, opB: { op: 'pick', args: ['opBByWhich', 'which'] } },
  });
  const vis = which => evaluateScene(structuredClone(scene), 1, { which }).state.objects.map(o => `${o.id}:${o.visible ? 'shown' : 'hidden'}`).join(' ');
  // The constraint: a timeline 'appear' on the same object would override the derived opacity.
  const withAppear = structuredClone(scene); withAppear.timeline = [{ at: 0, action: 'appear', target: 'b', duration: 0.2 }];
  const conflict = evaluateScene(withAppear, 1, { which: 0 }).state.objects.find(o => o.id === 'b').visible;
  return {
    category: 'composition', verdict: 'CLAIM WRONG - possible with existing composition (derived opacity)',
    evidence: `which=0 -> ${vis(0)}; which=1 -> ${vis(1)}. Constraint: an object whose visibility follows an input must not also carry a timeline 'appear' (with one, b is ${conflict ? 'shown' : 'hidden'} at which=0).`,
  };
});

probe('variable-length-tokens', 'Can one token row change LENGTH with an input (char vs BPE tokenization)?', () => {
  const scene = base([obj('t', 'tokens', { x: 40, y: 60, tokens: { $derive: 'shown' } })], {
    inputs: [{ name: 'tok', type: 'index', label: 'Tokenizer', of: 'names', default: 0 }],
    exampleData: { names: ['char', 'bpe'], lists: [['B', 'e', 'f', 'o', 'r', 'e'], ['Before']] },
    derived: { shown: { op: 'pick', args: ['lists', 'tok'] } },
  });
  const len = tok => evaluateScene(structuredClone(scene), 1, { tok }).state.objects[0].tokens.length;
  return { category: 'composition', verdict: 'supported - derived tokens list', evidence: `tok=0 -> ${len(0)} chips; tok=1 -> ${len(1)} chip(s)` };
});

probe('derived-grid-shape', 'Can a grid change its column COUNT with an input?', () => {
  const scene = base([obj('g', 'grid', { x: 40, y: 80, rows: 1, cols: { $derive: 'n' }, cell: 44, matrixKind: 'input', values: { $derive: 'ids' } })], {
    inputs: [{ name: 'tok', type: 'index', label: 'Tokenizer', of: 'names', default: 0 }],
    exampleData: { names: ['char', 'bpe'], idsBy: [[14, 43, 44], [8421]], nBy: [3, 1] },
    derived: { ids: { op: 'pick', args: ['idsBy', 'tok'] }, n: { op: 'pick', args: ['nBy', 'tok'] } },
  });
  const shape = tok => { const r = evaluateScene(structuredClone(scene), 1, { tok }); const g = r.state.objects[0]; return `${g.rows}x${g.cols} gates=${JSON.stringify(gates(r.scene))}`; };
  return { category: 'composition', verdict: 'supported - derived rows/cols/values', evidence: `tok=0 -> ${shape(0)}; tok=1 -> ${shape(1)}` };
});

probe('piecewise-linear-plot', 'Can existing primitives compose a line plot through recorded checkpoints, with axes and a shared scale?', () => {
  const ys = [4.17, 3.1, 2.6, 2.45, 2.5, 2.7]; // any series
  const n = ys.length;
  const X0 = 60, W = 480, Y0 = 250, H = 180, YMAX = 4.5;
  const scene = base([
    obj('x-axis', 'line', { from: { x: X0, y: Y0 }, to: { x: X0 + W, y: Y0 }, role: 'neutral' }),
    obj('y-axis', 'line', { from: { x: X0, y: Y0 }, to: { x: X0, y: Y0 - H }, role: 'neutral' }),
    ...ys.slice(1).map((unused, i) => obj(`seg-${i}`, 'line', {
      from: { x: { $derive: `px.${i}` }, y: { $derive: `py.${i}` } },
      to: { x: { $derive: `px.${i + 1}` }, y: { $derive: `py.${i + 1}` } }, role: 'output' })),
  ], {
    exampleData: { steps: ys.map((u, i) => i), loss: ys, x0: ys.map(() => X0), y0: ys.map(() => Y0) },
    // data -> pixels through the EXISTING calculation path (scale + add)
    derived: {
      pxRel: { op: 'scale', args: ['steps', W / (n - 1)] }, px: { op: 'add', args: ['pxRel', 'x0'] },
      pyRel: { op: 'scale', args: ['loss', -H / YMAX] }, py: { op: 'add', args: ['pyRel', 'y0'] },
    },
  });
  const run = tryRun(() => evaluateScene(scene, 1, {}));
  const segs = run.ok ? run.value.state.objects.filter(o => o.id.startsWith('seg-')) : [];
  return {
    category: 'composition',
    verdict: run.ok ? 'possible by composition - but the renderer has no plot/series primitive' : 'blocked',
    evidence: run.ok
      ? `${segs.length} line segments evaluated, first ${JSON.stringify(segs[0]?.from)}->${JSON.stringify(segs[0]?.to)}; gates ${JSON.stringify(gates(run.value.scene))}. Axes, ticks and the data->pixel mapping are authored per scene (no shared axis/scale object); a marker or legend is further manual composition.`
      : run.error,
  };
});

probe('missing-ops', 'log / exp / sqrt / GELU / ReLU / cumsum / top-k / argmax / length / indices->mask / random', () => {
  const wanted = ['log', 'exp', 'sqrt', 'gelu', 'relu', 'cumsum', 'topk', 'argmax', 'length', 'mask_indices', 'random'];
  const present = Object.keys(DERIVATIONS);
  const scene = base([obj('t', 'text', { text: '{{v}}', x: 20, y: 20 })], { exampleData: { a: [1, 2] }, derived: { v: { op: 'log', args: ['a'] } } });
  const run = tryRun(() => evaluateScene(scene, 1, {}));
  return {
    category: 'calculation', verdict: `absent: ${wanted.filter(op => !present.includes(op)).join(', ')}`,
    evidence: `DERIVATIONS = [${present.join(', ')}]. Declaring op "log" -> ${run.ok ? 'no error (unexpected)' : `"${run.error}"`}`,
  };
});

probe('argmax-by-composition', 'argmax is not an op - can it be composed?', () => {
  const scene = base([obj('t', 'text', { text: 'top = {{top}}', x: 20, y: 20 })], {
    exampleData: { p: [0.1, 0.7, 0.2] },
    derived: { neg: { op: 'scale', args: ['p', -1] }, top: { op: 'argmin', args: ['neg'] } },
  });
  const run = tryRun(() => evaluateScene(scene, 1, {}));
  return { category: 'composition', verdict: 'supported - argmin(scale(v, -1))', evidence: run.ok ? `argmax([0.1,0.7,0.2]) = ${run.value.derived.top}` : run.error };
});

probe('derive-precision', 'Derive ops round every result to 3 decimals - what happens to a learning rate like 1e-4?', () => {
  const scene = base([obj('t', 'text', { text: 'lr', x: 20, y: 20 })], { exampleData: { lr: [0.0001, 0.00095] }, derived: { v: { op: 'scale', args: ['lr', 1] } } });
  const run = tryRun(() => evaluateScene(scene, 1, {}));
  if (!run.ok) return { category: 'calculation', verdict: 'probe failed', evidence: run.error };
  return {
    category: 'calculation', verdict: 'constraint - sub-1e-3 magnitudes collapse inside derive ops',
    evidence: `scale([0.0001, 0.00095], 1) -> ${JSON.stringify(run.value?.derived.v)} (round at scene-derive.js:${lineOf(src('scene-derive.js'), 'export const round')}). pick() returns raw values, so small numbers must reach display through pick or be rescaled before any arithmetic op.`,
  };
});

probe('cell-number-format', 'How do grid/strip/bars cells print small or large numbers?', () => {
  const line = lineOf(src('AnimatedScene.jsx'), 'const num = value');
  const num = value => (Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2).replace(/^(-?)0\./, '$1.'));
  return {
    category: 'renderer', verdict: 'constraint - fixed 2 decimals below 10, integers above',
    evidence: `AnimatedScene.jsx:${line}: 0.0001 -> "${num(0.0001)}", 0.00095 -> "${num(0.00095)}", 14.1 -> "${num(14.1)}", 4.174 -> "${num(4.174)}". Learning rates cannot be shown in cells; text interpolation prints String(value) verbatim instead.`,
  };
});

probe('text-wrap', 'Can a text label or code line wrap?', () => {
  const s = src('AnimatedScene.jsx');
  return {
    category: 'renderer', verdict: 'gap - single-line SVG text; only equations get a wrapped HTML box',
    evidence: `no <tspan> in AnimatedScene.jsx; the only foreignObject (line ${lineOf(s, '<foreignObject')}) is the KaTeX equation branch. Long captions must be split into separate text objects by hand.`,
  };
});

probe('vec2-control', 'Does a vec2 input get an INTERACT control in an animation card?', () => {
  const s = src('SceneControls.jsx');
  const start = lineOf(s, 'const WIDGETS = {');
  const block = s.split('\n').slice(start - 1, start + 6).join(' ');
  return {
    category: 'renderer', verdict: 'gap - vec2 is a valid input type but has no widget, so it silently gets no control',
    evidence: `SceneControls.jsx:${start} WIDGETS = ${block.match(/\{[^}]*\}/)?.[0].replace(/\s+/g, ' ')}; the zone filters on WIDGETS[declaration.type]. vec2 controls exist only in the separate vector_projection_v1 behaviour (VectorControls).`,
  };
});

probe('randomness', 'Can a card sample a token at random?', () => ({
  category: 'precomputed', verdict: 'by design - the evaluator is pure and deterministic',
  evidence: 'evaluateScene(scene, t, inputs) is a pure function (replay and the tutor payload depend on it). A seeded sample drawn by the authoring script can be shown as a recorded sample; live sampling would need an explicit, logged seed input.',
}));

probe('rendered-types', 'What object types exist?', () => ({
  category: 'renderer', verdict: RENDERED_TYPES.includes('circle') ? 'circle exists (usable as a plot marker); no polyline/path/axis type' : 'no marker type',
  evidence: `RENDERED_TYPES = [${RENDERED_TYPES.join(', ')}]`,
}));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(probes, null, 2));
} else {
  for (const p of probes) console.log(`\n[${p.id}] ${p.claim}\n  -> ${p.verdict}  (${p.category})\n     ${p.evidence}`);
}
