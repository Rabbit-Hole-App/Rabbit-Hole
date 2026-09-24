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
import { sceneContentBounds } from '../../../scene-layout.js';

const T = att.T;
const ALL = [0, 1, 2].flatMap(head => Array.from({ length: T }, (u, Tidx) => Tidx).flatMap(Tidx =>
  ['manual', 'fused'].flatMap(path => [true, false].map(scaleOn => ({ head, Tidx, path, scaleOn })))));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
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

test('deep: question first, "Builds on: Guided" under it, gates pass at review states and at every reachable state', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.match(scene.objects[1].initialState.text, /^Builds on: Guided; /);
  assert.ok(reviewStates.length >= 2 && reviewStates.length <= 6);
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, ALL);
});

test('the ladder contract: equations, named shapes, a branch control, an edge case, most code, text within 1.3x Guided', () => {
  const result = evaluated(scene, defaults({ scene }));
  const shown = result.state.objects.filter(o => o.visible);
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
  const deepChars = chars({ scene }, defaults({ scene }));
  const guidedChars = chars(guided, defaults(guided));
  assert.ok(deepChars <= 1.3 * guidedChars, `Deep dive text ${deepChars} chars vs Guided ${guidedChars}`);
});

test('att, y and the grid shape match the oracle at every head, T and scale; old rows never change', () => {
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [inputs]);
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

// The renderer fits its frame to the evaluated labels: a derived label that
// reaches past the static content widens the frame and shrinks the whole card.
test('framing: no state widens the card past its static content bounds', () => {
  const still = sceneContentBounds(scene);
  for (const inputs of ALL) {
    const b = sceneContentBounds(evaluateScene(structuredClone(scene), 0, inputs).scene);
    assert.ok(b.xMax <= still.xMax && b.yMax <= still.yMax, `${JSON.stringify(inputs)}: ${b.contributors.xMax} reaches x ${b.xMax} > ${still.xMax}`);
  }
});

test('edge case T = 1: att = [1] and y equals its own v, for every head', () => {
  for (const head of [0, 1, 2]) {
    const [result] = assertCardGates(scene, [{ head, Tidx: 0 }]);
    assert.deepEqual(byId(result, 'att').values, [1]);
    assert.deepEqual(byId(result, 'y-last').values, byId(result, 'v-first').values);
    assert.deepEqual(byId(result, 'v-first').values, att.heads[head].v[0]);
    assert.match(byId(result, 'first-note').label, /^T = 1: att = \[1\]/);
  }
  const [longer] = assertCardGates(scene, [{ head: 0, Tidx: 4 }]);
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

test('branch: the fused path swaps five steps for one call and dims the unstored att; numbers do not change', () => {
  const [manual, fused] = assertCardGates(scene, [{ path: 'manual' }, { path: 'fused' }]);
  const fusedSteps = ['scores', 'scale', 'mask', 'softmax', 'mix'];
  for (const id of fusedSteps) {
    assert.equal(byId(manual, `step-${id}`).visible, true);
    assert.equal(byId(fused, `step-${id}`).visible, false);
    assert.equal(byId(fused, `shape-${id}`).visible, false);
  }
  for (const id of ['split', 'heads', 'merge']) assert.equal(byId(fused, `step-${id}`).visible, true);
  assert.equal(byId(manual, 'fused-box').visible, false);
  assert.equal(byId(fused, 'fused-box').visible, true);
  assert.equal(byId(fused, 'att').opacity, 0.25);
  assert.deepEqual(byId(fused, 'att').values, byId(manual, 'att').values, 'same math on both paths');
  assert.match(byId(manual, 'path-note').label, /^manual: att is built whole in every layer/);
  assert.equal(byId(manual, 'path-note-2').label, '');
  // The fused note matches the SDPA documentation: only CUDA gets the fused
  // kernels; the math version still builds att.
  assert.match(byId(fused, 'path-note').label, /^fused: flash \/ memory-efficient kernels never hold the whole att;$/);
  assert.match(byId(fused, 'path-note-2').label, /math version \(non-CUDA, or inputs they reject\) still builds it/);
  assert.match(sources.find(s => s.kind === 'doc').note, /For all other backends, the PyTorch implementation will be used/);
});

test('branch x what-if: the fused call shows its scale - default 1/sqrt(hs), or scale=1.0 in the what-if', () => {
  const [on, off] = assertCardGates(scene, [{ path: 'fused', scaleOn: true }, { path: 'fused', scaleOn: false }]);
  assert.equal(byId(on, 'fused-box').label, 'scaled_dot_product_attention(is_causal=True)');
  assert.equal(byId(off, 'fused-box').label, 'scaled_dot_product_attention(is_causal=True, scale=1.0)');
  assert.match(byId(on, 'fused-scale').label, /default is 1\/√hs/);
  assert.match(byId(off, 'fused-scale').label, /^What-if: scale=1\.0/);
  for (const result of [on, off]) assert.equal(byId(result, 'fused-scale').visible, true);
  const [manual] = assertCardGates(scene, [{ path: 'manual', scaleOn: false }]);
  assert.equal(byId(manual, 'fused-scale').visible, false);
  assert.match(sources.find(s => s.kind === 'doc').note, /If None, the default value is set to 1\/√E/);
});

test('memory tradeoff: B * nh * T^2 from the source config, in bytes per layer and over all layers', () => {
  const [result] = assertCardGates(scene, [{}]);
  const { batch_size: B, n_head: nh, block_size: Tmax, n_layer: layers } = fx.architecture;
  assert.equal(result.derived.attEntries, B * nh * Tmax * Tmax);
  assert.ok(byId(result, 'eq-memory').label.includes(`=${B * nh * Tmax * Tmax}`));
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
  const [on, off] = assertCardGates(scene, [{ scaleOn: true }, { scaleOn: false }]);
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
  assert.ok(sat.meanMaxGrad.unscaled[2] < sat.meanMaxGrad.scaled[2] / 2, 'saturated rows pass back less gradient');
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
  // The equation and the x step follow the toggle.
  assert.match(byId(on, 'eq-attention').label, /\\sqrt\{hs\}\+M/);
  assert.match(byId(off, 'eq-attention').label, /QK\^\{\\top\}\+M/);
  assert.equal(byId(off, 'step-scale').label, '× 1   (What-if)');
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
});
