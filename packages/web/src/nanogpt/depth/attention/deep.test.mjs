import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import att from '../fixtures/attention.generated.js';
import { scene, sources, evidence, reviewStates } from './deep.js';
import * as guided from './guided.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';
import { evaluateScene } from '../../../scene-evaluate.js';
import { sceneContentBounds, sceneLegibility } from '../../../scene-layout.js';
import { groupDigits } from '../../../scene-format.js';

const T = att.T;
const ALL = [0, 1, 2].flatMap(head => Array.from({ length: T }, (u, Tidx) => Tidx).flatMap(Tidx =>
  ['manual', 'fused'].flatMap(path => [true, false].map(scaleOn => ({ head, Tidx, path, scaleOn })))));
// Every sub-card at every input: the pager is one more input of the same state.
const PARTS = [0, 1, 2, 3];
const PAGED = PARTS.flatMap(part => ALL.map(inputs => ({ part, ...inputs })));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const shownIds = result => result.state.objects.filter(o => o.visible && (o.opacity ?? 1) > 0).map(o => o.id);
const box = ({ contributors: _c, ...bounds }) => bounds;
const defaults = card => Object.fromEntries(card.scene.inputs.map(d => [d.name, d.default]));
const softmax = row => {
  const kept = row.filter(x => x !== null);
  const max = Math.max(...kept);
  const z = kept.reduce((s, x) => s + Math.exp(x - max), 0);
  return row.map(x => (x === null ? null : Math.exp(x - max) / z));
};
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// Independent oracle: model.py:67-71 for one head over the first T positions.
function oracle(head, Tn, scaleOn) {
  const { q, k, v } = att.heads[head];
  const factor = scaleOn ? 1 / Math.sqrt(att.hs) : 1;
  const A = Array.from({ length: Tn }, (u, i) => softmax(Array.from({ length: Tn }, (w, j) => (j <= i ? dot(q[i], k[j]) * factor : null))));
  const last = A[Tn - 1];
  const y = v[0].map((u, d) => last.reduce((s, w, j) => s + (w ?? 0) * v[j][d], 0));
  return { A, y };
}

test('deep: every sub-card asks its question first, "Builds on: Guided" only on 1/4, gates pass at review states and at every reachable state', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.match(scene.objects[1].initialState.text, /^Builds on: Guided; /);
  const pager = scene.inputs.find(d => d.presentation === 'pager');
  assert.deepEqual([pager.name, pager.label, pager.default], ['part', 'Deep dive', 0]);
  assert.deepEqual(scene.exampleData.parts, ['Shapes: split, view, transpose', 'The causal mask and att', 'fp32 memory and the fused path', 'The 1/√hs experiment']);
  for (const part of PARTS) {
    const first = scene.objects.find(o => o.part === part);
    assert.equal(first.type, 'text');
    assert.match(first.semanticId, /^question/, `part ${part} opens with its question`);
    assert.match(first.initialState.text, /\?$/);
    assert.equal(first.initialState.y, 30);
  }
  for (const o of scene.objects.filter(x => /^Builds on/.test(x.initialState?.text || ''))) assert.equal(o.part, 0, 'Builds on only on 1/4');
  // Only the status line is shared.
  assert.deepEqual(scene.objects.filter(o => o.part === undefined).map(o => o.id), ['status']);
  assert.ok(reviewStates.length >= 2 && reviewStates.length <= 3 * PARTS.length);
  assert.deepEqual([...new Set(reviewStates.map(r => r.part))].sort(), PARTS, 'review states cover every sub-card');
  // Within the cap of six: head 0's att on 2/4, the fused call lit on 3/4, the
  // fused note on 2/4, and the what-if beside its baseline on 4/4.
  const has = want => reviewStates.some(r => Object.entries(want).every(([k, v]) => r[k] === v));
  for (const want of [{ part: 1, head: 0, path: 'manual', scaleOn: true }, { part: 2, path: 'fused' }, { part: 1, path: 'fused' },
    { part: 3, scaleOn: true }, { part: 3, scaleOn: false }]) assert.ok(has(want), JSON.stringify(want));
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, PAGED);
});

// Which ideas live on which sub-card (manual path, scaled, all characters).
const STEP_IDS = ['split', 'heads', 'scores', 'scale', 'mask', 'softmax', 'mix', 'merge'];
const ON_PART = {
  0: ['question', 'prerequisites', 'status', 'eq-sizes', ...STEP_IDS.flatMap(id => [`step-${id}`, `shape-${id}`])],
  1: ['question-mask', 'status', 'eq-attention', 'att', 'first-note', 'rows-note', 'dropout-note', 'y-last', 'v-first'],
  2: ['question-memory', 'status', 'mem-title', 'eq-memory', 'eq-bytes', 'eq-layers', 'path-note', 'path-note-2', 'fused-box', 'fused-shape', 'fused-scale'],
  3: ['question-scale', 'status', 'sat-title',
    ...[0, 1, 2].flatMap(k => ['bars', 'top', 'base', 'one', 'zero', 'read'].map(kind => `sat-${kind}-${k}`)), 'eq-variance', 'eq-gradient'],
};
// The fused path dims (never removes) what it does not run, and says why on
// the sub-card that dims it: the five steps on 1/4, att on 2/4.
const FUSED_SWAP = {
  0: { add: ['fused-note'], drop: [] },
  1: { add: ['att-path-note', 'att-path-note-2'], drop: [] },
  2: { add: [], drop: [] },
  3: { add: [], drop: [] },
};

test('sub-cards: each part shows only its own idea, and the fused path swaps within the part', () => {
  for (const part of PARTS) {
    const [manual, fused] = assertCardGates(scene, [{ part }, { part, path: 'fused' }]);
    assert.deepEqual(shownIds(manual).sort(), [...ON_PART[part]].sort(), `part ${part} manual`);
    const { add, drop } = FUSED_SWAP[part];
    assert.deepEqual(shownIds(fused).sort(), [...ON_PART[part].filter(id => !drop.includes(id)), ...add].sort(), `part ${part} fused`);
  }
});

// Owner rule: one idea per sub-card - at most one formula block and one visual.
test('sub-cards: one formula block and one visual each', () => {
  const ofType = (part, types) => scene.objects.filter(o => o.part === part && types.includes(o.type)).map(o => o.id);
  assert.deepEqual(PARTS.map(part => ofType(part, ['equation'])), [
    ['eq-sizes'],
    ['eq-attention'],
    ['eq-memory', 'eq-bytes', 'eq-layers'], // one stacked derivation
    ['sat-read-0', 'sat-read-1', 'sat-read-2', 'eq-variance', 'eq-gradient'], // panel readouts, then one stacked block
  ]);
  // A block's lines stack with no gap between them.
  const stacked = ids => ids.slice(1).forEach((id, i) => {
    const [above, below] = [ids[i], id].map(x => scene.objects.find(o => o.id === x).initialState);
    assert.ok(below.y - (above.y + above.h) <= 10, `${ids[i]} and ${id} stack`);
  });
  stacked(['eq-memory', 'eq-bytes', 'eq-layers']);
  stacked(['eq-variance', 'eq-gradient']);
  // Each readout sits under its own panel.
  [0, 1, 2].forEach(k => assert.equal(scene.objects.find(o => o.id === `sat-read-${k}`).initialState.x, scene.objects.find(o => o.id === `sat-bars-${k}`).initialState.x));
  assert.deepEqual(PARTS.map(part => ofType(part, ['grid', 'strip', 'bars'])), [
    [], ['att', 'y-last', 'v-first'], [], ['sat-bars-0', 'sat-bars-1', 'sat-bars-2'],
  ]);
  assert.deepEqual(ofType(0, ['box']), STEP_IDS.map(id => `step-${id}`));
  assert.deepEqual(ofType(2, ['box']), ['fused-box'], '3/4: the fused call is its visual');
});

test('the ladder contract: equations, named shapes, a branch control, an edge case, most code, each sub-card within 1.3x Guided text', () => {
  const results = PARTS.map(part => evaluated(scene, { ...defaults({ scene }), part }));
  const shown = results.flatMap(result => result.state.objects.filter(o => o.visible));
  assert.ok(shown.filter(o => o.type === 'equation').length >= 3, 'exact equations');
  const text = shown.filter(o => o.label && ['text', 'equation'].includes(o.type)).map(o => o.label).join('\n');
  for (const shape of ['(B, T, C)', '(B, nh, T, hs)', '(B, nh, T, T)']) assert.ok(text.includes(shape), `shape ${shape}`);
  assert.ok(scene.inputs.some(d => d.type === 'choice' && d.options.some(o => o.id === 'fused')), 'implementation branch control');
  assert.ok(scene.inputs.some(d => d.name === 'Tidx'), 'the T = 1 edge case is reachable');
  assert.doesNotMatch(`${text}\n${scene.title}`, /beginner|intermediate|advanced|expert|newcomer/i);
  const codeCount = card => card.sources.filter(s => s.kind === 'code').length;
  assert.ok(codeCount({ sources }) > codeCount(guided), 'more code connections than Guided');
  const chars = (card, inputs) => evaluated(card.scene, inputs).state.objects
    .filter(o => o.visible && o.label && ['text', 'code'].includes(o.type)).reduce((n, o) => n + o.label.length, 0);
  const guidedChars = chars(guided, defaults(guided));
  for (const part of PARTS) {
    const deepChars = chars({ scene }, { ...defaults({ scene }), part });
    assert.ok(deepChars <= 1.3 * guidedChars, `Deep dive ${part + 1}/4 text ${deepChars} chars vs Guided ${guidedChars}`);
  }
});

test('att, y and the grid shape match the oracle at every head, T and scale; old rows never change', () => {
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [{ part: 1, ...inputs }]);
    const { head, Tidx, scaleOn } = inputs;
    const Tn = Tidx + 1;
    const where = JSON.stringify(inputs);
    const { A, y } = oracle(head, Tn, scaleOn);
    const grid = byId(result, 'att');
    assert.equal(grid.rows, Tn);
    assert.equal(grid.cols, Tn);
    assert.deepEqual(grid.rowLabels, att.context.tokens.slice(0, Tn).map(c => (c === '␣' ? 'sp' : c)));
    // The label names the head it shows; cells are rounded one by one (no
    // largest-remainder nudge), so equal weights always print equal.
    assert.equal(grid.label, `att[0, ${head}]: ${att.heads[head].label}, each rounded`);
    assert.equal(grid.distribution, false, 'no largest-remainder nudge');
    const printed = grid.values.map(w => (w === null ? null : w.toFixed(2)));
    grid.values.forEach((a, i) => grid.values.forEach((b, j) => {
      if (a !== null && a === b) assert.equal(printed[i], printed[j], `${where} equal weights ${i}, ${j} print equal`);
    }));
    A.flat().forEach((w, i) => {
      if (w === null) assert.equal(grid.values[i], null, `${where} [${i}] masked`);
      else assert.ok(Math.abs(grid.values[i] - w) <= 1e-3, `${where} [${i}]: ${grid.values[i]} vs ${w}`);
    });
    byId(result, 'y-last').values.forEach((x, d) => assert.ok(Math.abs(x - y[d]) <= 2e-3, `${where} y[${d}]`));
    // Causality: row i is the same whatever T is.
    const full = oracle(head, T, scaleOn).A;
    A.forEach((row, i) => row.forEach((w, j) => assert.equal(w, full[i][j])));
    // Row 0 is always weight 1 on itself.
    assert.equal(grid.values[0], 1);
  }
});

// The renderer fits its frame to the evaluated labels, the block is sized
// from the static scene: the two must be the same box on every sub-card and in
// every state, or paging (or a control) would refit and rescale the card.
test('framing: one frame at scale 1 for every sub-card and state; nothing drawn outside it', () => {
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1, 'renders at authored size');
  const still = box(legibility.bounds);
  assert.ok(still.yMax - still.yMin <= 800 && still.xMax - still.xMin <= 1060, JSON.stringify(still));
  for (const inputs of PAGED) {
    for (const time of [0, scene.duration]) {
      assert.deepEqual(box(sceneContentBounds(evaluateScene(structuredClone(scene), time, inputs).scene)), still, JSON.stringify(inputs));
    }
  }
  // Data shapes are not measured by the frame fit: their bodies must sit inside it.
  const [mask] = assertCardGates(scene, [{ part: 1 }]);
  const grid = byId(mask, 'att');
  assert.ok(grid.y + grid.rows * grid.cell <= still.yMax && grid.x + grid.cols * grid.cell <= still.xMax, 'att inside the frame');
  for (const id of ['y-last', 'v-first']) {
    const strip = byId(mask, id);
    assert.ok(strip.x + strip.values.length * strip.cell <= still.xMax, id);
  }
  const [bars] = assertCardGates(scene, [{ part: 3 }]);
  [0, 1, 2].forEach(k => {
    const b = byId(bars, `sat-bars-${k}`);
    assert.ok(b.x + b.values.length * b.cell <= still.xMax && b.y + b.h <= still.yMax, `bars ${k}`);
  });
});

test('one state for all sub-cards: a control set on one part is already applied on the others', () => {
  const inputs = { head: 2, Tidx: 4, path: 'fused', scaleOn: false };
  const results = PARTS.map(part => evaluated(scene, { ...inputs, part }));
  const { part: _first, ...first } = results[0].derived;
  for (const result of results.slice(1)) {
    const { part: _other, ...rest } = result.derived;
    assert.deepEqual(rest, first);
  }
  assert.match(byId(results[1], 'eq-attention').label, /\(no \}1\/\\sqrt\{hs\}/);
  assert.equal(byId(results[2], 'fused-box').label, 'scaled_dot_product_attention(is_causal=True, scale=1.0)');
});

test('edge case T = 1: att = [1] and y equals its own v, for every head', () => {
  for (const head of [0, 1, 2]) {
    const [result] = assertCardGates(scene, [{ part: 1, head, Tidx: 0 }]);
    assert.deepEqual(byId(result, 'att').values, [1]);
    assert.deepEqual(byId(result, 'y-last').values, byId(result, 'v-first').values);
    assert.deepEqual(byId(result, 'v-first').values, att.heads[head].v[0]);
    assert.match(byId(result, 'first-note').label, /^T = 1: att = \[1\]/);
  }
  const [longer] = assertCardGates(scene, [{ part: 1, head: 0, Tidx: 4 }]);
  assert.notDeepEqual(byId(longer, 'y-last').values, byId(longer, 'v-first').values);
});

test('the heads really differ: previous character, same letter, first character', () => {
  const tokens = att.context.tokens;
  const argmax = row => row.reduce((b, x, j) => (x !== null && (b === null || x > row[b]) ? j : b), null);
  const A = [0, 1, 2].map(h => oracle(h, T, true).A);
  for (let i = 1; i < T; i += 1) {
    assert.equal(argmax(A[0][i]), i - 1, `head 0 row ${i}: previous character`);
    assert.equal(argmax(A[2][i]), 0, `head 2 row ${i}: first character`);
    const top = A[1][i].reduce((m, x) => Math.max(m, x ?? 0), 0);
    A[1][i].forEach((w, j) => { if (w !== null && Math.abs(w - top) < 1e-9) assert.equal(tokens[j], tokens[i], `head 1 row ${i}: same letter`); });
  }
});

test('branch: the fused path dims the five steps one call replaces and the unstored att, and lights the call; numbers do not change', () => {
  const [manual, fused] = assertCardGates(scene, [{ part: 0, path: 'manual' }, { part: 0, path: 'fused' }]);
  const [manualAtt, fusedAtt] = assertCardGates(scene, [{ part: 1, path: 'manual' }, { part: 1, path: 'fused' }]);
  const [manualMem, fusedMem] = assertCardGates(scene, [{ part: 2, path: 'manual' }, { part: 2, path: 'fused' }]);
  const fusedSteps = ['scores', 'scale', 'mask', 'softmax', 'mix'];
  for (const id of fusedSteps.flatMap(step => [`step-${step}`, `shape-${step}`])) {
    assert.equal(byId(manual, id).opacity, 1, id);
    assert.equal(byId(fused, id).opacity, 0.25, `${id} dimmed, still on screen`);
  }
  for (const id of ['split', 'heads', 'merge']) assert.equal(byId(fused, `step-${id}`).opacity ?? 1, 1);
  assert.equal(byId(manual, 'fused-note').visible, false);
  assert.equal(byId(fused, 'fused-note').visible, true);
  assert.equal(byId(fused, 'fused-note').label, 'fused SDPA: one call replaces these five steps');
  // The fused call is 3/4's visual: lit on the fused path, dimmed on the manual one.
  for (const id of ['fused-box', 'fused-shape', 'fused-scale']) {
    assert.equal(byId(manualMem, id).opacity, 0.25, id);
    assert.equal(byId(fusedMem, id).opacity, 1, id);
  }
  assert.equal(byId(fusedMem, 'fused-shape').label, 'q, k, v (B, nh, T, hs) → y (B, nh, T, hs) in one call');
  assert.equal(byId(manualAtt, 'att').opacity, 1);
  assert.equal(byId(fusedAtt, 'att').opacity, 0.25);
  assert.deepEqual(byId(fusedAtt, 'att').values, byId(manualAtt, 'att').values, 'same math on both paths');
  // The dim is explained on the sub-card that dims it, in 3/4's own words.
  for (const id of ['att-path-note', 'att-path-note-2']) {
    assert.equal(byId(manualAtt, id).visible, false);
    assert.equal(byId(fusedAtt, id).visible, true);
    assert.equal(byId(fusedAtt, id).label, byId(fusedMem, id.replace('att-', '')).label);
  }
  assert.match(byId(manualMem, 'path-note').label, /^manual: att is built whole in every layer/);
  // The memory line is the manual path's illustrative cost, not the fused default's.
  assert.equal(byId(manualMem, 'path-note-2').label, 'fused SDPA need not materialize this full matrix.');
  for (const result of [manualMem, fusedMem]) {
    assert.equal(byId(result, 'mem-title').label, 'Manual attention, fp32 illustrative memory:');
    assert.equal(byId(result, 'mem-title').visible, true);
  }
  assert.equal(scene.inputs.find(d => d.name === 'path').options.find(o => o.id === 'fused').label, 'fused SDPA (NanoGPT default when available)');
  // The fused note matches the SDPA documentation: only CUDA gets the fused
  // kernels; the math version still builds att.
  assert.match(byId(fusedMem, 'path-note').label, /^fused: flash \/ memory-efficient kernels never hold the whole att;$/);
  assert.match(byId(fusedMem, 'path-note-2').label, /math version \(non-CUDA, or inputs they reject\) still builds it/);
  assert.match(sources.find(s => s.kind === 'doc').note, /For all other backends, the PyTorch implementation will be used/);
});

test('branch x what-if: the fused call shows its scale - default 1/sqrt(hs), or scale=1.0 in the what-if', () => {
  const [on, off] = assertCardGates(scene, [{ part: 2, path: 'fused', scaleOn: true }, { part: 2, path: 'fused', scaleOn: false }]);
  assert.equal(byId(on, 'fused-box').label, 'scaled_dot_product_attention(is_causal=True)');
  assert.equal(byId(off, 'fused-box').label, 'scaled_dot_product_attention(is_causal=True, scale=1.0)');
  assert.match(byId(on, 'fused-scale').label, /default is 1\/√hs/);
  assert.match(byId(off, 'fused-scale').label, /^What-if: scale=1\.0/);
  for (const result of [on, off]) assert.equal(byId(result, 'fused-scale').opacity, 1);
  const [manual, shapes] = assertCardGates(scene, [{ part: 2, path: 'manual', scaleOn: false }, { part: 0, path: 'fused' }]);
  assert.equal(byId(manual, 'fused-scale').opacity, 0.25, 'not the path taken: dimmed');
  assert.equal(byId(shapes, 'fused-scale').visible, false, 'the call lives on 3/4');
  assert.match(sources.find(s => s.kind === 'doc').note, /If None, the default value is set to 1\/√E/);
});

test('memory tradeoff: B * nh * T^2 from the source config, in bytes per layer and over all layers', () => {
  const [result] = assertCardGates(scene, [{ part: 2 }]);
  const { batch_size: B, n_head: nh, block_size: Tmax, n_layer: layers } = fx.architecture;
  assert.equal(result.derived.attEntries, B * nh * Tmax * Tmax);
  assert.ok(byId(result, 'eq-memory').label.includes(`=${groupDigits(B * nh * Tmax * Tmax, '{,}')}`));
  // 4 bytes an fp32 entry; MB = 10^6 bytes.
  const bytes = B * nh * Tmax * Tmax * 4;
  assert.equal(bytes, 100663296);
  assert.deepEqual(result.derived.attMB, [Math.round(bytes / 1e3) / 1e3]);
  assert.deepEqual(result.derived.allMB, [Math.round((bytes * layers) / 1e3) / 1e3]);
  assert.ok(byId(result, 'eq-bytes').label.endsWith(String.raw`=100.663\text{ MB per layer}`));
  assert.ok(byId(result, 'eq-layers').label.includes(String.raw`\times ${layers}\text{ layers}=603.98\text{ MB}`));
  assert.ok(byId(result, 'eq-sizes').label.includes(String.raw`shakespeare\_char }(${B}, ${Tmax}, ${fx.architecture.n_embd}, ${nh}, ${fx.architecture.n_embd / nh})`));
});

test('what-if: without 1/sqrt(hs) the rows saturate as hs grows, and the softmax slope vanishes', () => {
  const sat = att.saturation;
  const [on, off] = assertCardGates(scene, [{ part: 3, scaleOn: true }, { part: 3, scaleOn: false }]);
  const rows = scaleOn => sat.hs.map((hs, k) => softmax(sat.k[k].map(key => dot(sat.q[k], key) * (scaleOn ? 1 / Math.sqrt(hs) : 1))));
  for (const [result, scaleOn] of [[on, true], [off, false]]) {
    rows(scaleOn).forEach((w, k) => {
      byId(result, `sat-bars-${k}`).values.forEach((x, j) => assert.ok(Math.abs(x - w[j]) <= 1e-3, `bars ${k}[${j}]`));
      const max = Math.max(...w);
      const g = Math.max(...w.map(p => p * (1 - p)));
      assert.ok(Math.abs(result.derived[`max${k}`] - max) <= 2e-3, `max w ${k}`);
      assert.ok(Math.abs(result.derived[`gMax${k}`] - g) <= 2e-3, `max w(1-w) ${k}`);
    });
    const key = scaleOn ? 'scaled' : 'unscaled';
    assert.ok(byId(result, 'eq-variance').label.includes(`={{std0}}`.replace('{{std0}}', `${sat.scoreStd[key][0]},${sat.scoreStd[key][1]},${sat.scoreStd[key][2]}`)));
    assert.ok(byId(result, 'eq-variance').label.includes(`=${sat.meanMax[key].join(',')}`));
  }
  // The claims the card makes, checked on the generator's statistics:
  // scaled spread stays at 1; unscaled spread is sqrt(hs); saturation grows with hs.
  sat.hs.forEach((hs, k) => {
    assert.ok(Math.abs(sat.scoreStd.scaled[k] - 1) <= 0.1);
    assert.ok(Math.abs(sat.scoreStd.unscaled[k] - Math.sqrt(hs)) <= 0.1 * Math.sqrt(hs));
  });
  assert.ok(sat.meanMax.unscaled[0] < sat.meanMax.unscaled[1] && sat.meanMax.unscaled[1] < sat.meanMax.unscaled[2]);
  assert.ok(Math.max(...sat.meanMax.scaled) - Math.min(...sat.meanMax.scaled) < 0.05, 'scaled rows do not saturate with hs');
  assert.ok(sat.meanMaxGrad.unscaled[2] < sat.meanMaxGrad.scaled[2] / 2, 'the largest w(1 - w) shrinks when the row saturates');
  // The one seeded row at hs = 64 goes nearly one-hot without the factor.
  assert.ok(off.derived.max2 > 0.95 && off.derived.gMax2 < 0.02 && on.derived.max2 < 0.5);
  // The three rows read differently at 3 decimals (round 1 showed hs = 16 and
  // hs = 64 both as 0.292 / 0.207), and without the factor the largest
  // weight grows with hs.
  for (const result of [on, off]) {
    assert.equal(new Set([0, 1, 2].map(k => result.derived[`max${k}`])).size, 3);
    assert.equal(new Set([0, 1, 2].map(k => result.derived[`gMax${k}`])).size, 3);
  }
  assert.ok(off.derived.max0 < off.derived.max1 && off.derived.max1 < off.derived.max2);
  // The rows are the first of the 2000 draws per hs: same seed as the statistics.
  assert.match(sources.find(s => s.kind === 'calculation' && /Random q/.test(s.title)).note, /the rows on the card are the first draw/);
  // The 0-1 axis is labelled on every panel.
  sat.hs.forEach((hs, k) => {
    assert.equal(byId(on, `sat-one-${k}`).label, '1');
    assert.equal(byId(on, `sat-zero-${k}`).label, '0');
    assert.equal(byId(on, `sat-base-${k}`).from.y, byId(on, `sat-bars-${k}`).y + byId(on, `sat-bars-${k}`).h);
  });
  // The equation (2/4) and the x step (1/4) follow the toggle.
  const [eqOn, eqOff] = assertCardGates(scene, [{ part: 1, scaleOn: true }, { part: 1, scaleOn: false }]);
  assert.match(byId(eqOn, 'eq-attention').label, /\\sqrt\{hs\}\+M/);
  assert.match(byId(eqOff, 'eq-attention').label, /QK\^\{\\top\}\+M/);
  assert.equal(byId(off, 'step-scale').label, '× 1   (What-if)');
  // One diagonal derivative, claimed for that probability only - not the whole row.
  assert.match(byId(on, 'eq-gradient').label, /near 0 or 1: that probability becomes locally less sensitive to its own score/);
  assert.doesNotMatch(byId(on, 'eq-gradient').label, /rows? barely learn/);
});

const cached = path => {
  const sha = fx.provenance.nanogpt.files[path];
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
  return bytes.toString('utf8').split('\n');
};

test('sources: a code entry for every step, quotes match the pinned files, statuses labelled on the card', () => {
  assertSources(sources, scene);
  const files = Object.fromEntries(['model.py', 'config/train_shakespeare_char.py', 'train.py'].map(path => [path, cached(path)]));
  for (const source of sources.filter(s => s.kind === 'code')) {
    const quotes = [...source.note.matchAll(/“([^”]+)”/g)].map(m => m[1]);
    assert.ok(quotes.length, `${source.path}:${source.lines} quotes its lines`);
    const file = files[source.path];
    if (!file) continue;
    const lines = file.slice(source.lines[0] - 1, source.lines[1]).join('\n');
    for (const quote of quotes) assert.ok(lines.includes(quote), `${source.path}:${source.lines.join('-')} really says "${quote}"`);
  }
  // Every step of the column (and the branch) has its line cited.
  const cited = sources.filter(s => s.kind === 'code' && s.path === 'model.py').map(s => s.lines);
  const covers = line => cited.some(([a, b]) => a <= line && line <= b);
  for (const line of [56, 58, 64, 67, 68, 69, 70, 71, 72, 75, 45, 49]) assert.ok(covers(line), `model.py:${line} cited`);
  assert.ok(sources.some(s => s.kind === 'code' && s.path === 'config/train_shakespeare_char.py' && s.lines[0] <= 22 && s.lines[1] >= 22), 'n_layer cited');
  const fp32 = sources.find(s => s.kind === 'code' && s.path === 'train.py' && s.lines[0] === 112);
  assert.ok(fp32, 'the fp32 claim cited');
  // CUDA autocast runs softmax in float32, so the kept att is 4 bytes there too.
  assert.match(fp32.note, /softmax is on autocast’s float32 list/);
  assert.doesNotMatch(fp32.note, /half the count/);
  assert.deepEqual([...new Set(sources.filter(s => s.kind === 'calculation').map(s => s.status))].sort(),
    ['Calculated toy example', 'Live calculation', 'Source value', 'What-if']);
  assert.ok(sources.some(s => s.kind === 'paper' && s.arxiv === '1706.03762') && sources.some(s => s.kind === 'paper' && s.arxiv === '2205.14135'));
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
  for (const field of ['depth', 'prerequisites', 'ladderRole']) assert.ok(String(evidence[field] || '').trim(), field);
  assert.equal(evidence.depth, 'Deep dive');
  assert.match(evidence.sourceRevision, /3adf61e154c3fe3fca428ad6bc3818b27a3b8291/);
  assert.equal(evidence.learningQuestion, 'How does CausalSelfAttention run every head at once, and why the 1/√hs?');
  assert.match(evidence.control, /"Deep dive" pager/);
});
