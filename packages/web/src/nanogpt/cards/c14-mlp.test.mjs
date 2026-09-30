import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { validateActivity, PREDICATES } from '../../scene-activity.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { ungroupedNumbers } from '../../scene-format.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, activity, sources, evidence } from './c14-mlp.js';

// Independent oracle in plain JS - never the scene's derive graph. The weights
// and inputs are typed here as the plan lists them, so a fixture drift fails.
const RAW = [[0, -3, -2, 3], [4, -1, 3, -3], [2, 4, -3, 0]];
const INPUT = [[0.22, -1.09, -0.65, 1.53], [1.14, -0.61, 0.79, -1.31], [0.48, 1.26, -1.45, -0.29]];
const WFC = [[-0.5, 0.5, -1, -0.5], [-0.5, 1, -1, -0.5], [1, 1, -1, 1], [-1, -0.5, 0.5, 1], [0.5, -0.5, -1, 1], [0.5, 1, -0.5, -1],
  [-1, 0.5, -0.5, -1], [-0.5, 0.5, -1, 0.5], [0.5, -0.5, 1, 0.5], [-1, -1, -0.5, 1], [1, 0.5, -1, -1], [0.5, 0.5, -1, 1],
  [0.5, 0.5, -1, 0.5], [-0.5, 0.5, 1, 0.5], [-0.5, 0.5, -0.5, 1], [0.5, -1, 0.5, 0.5]];
const WPROJ = [[0.25, 0.25, -0.5, 0.5, -0.5, 0.25, -0.5, 0.5, 0.5, -0.25, -0.25, -0.5, -0.25, 0.25, -0.25, 0.5],
  [0.5, 0.25, 0.5, -0.25, 0.5, 0.25, 0.25, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.25, -0.25, -0.5],
  [0.25, 0.25, -0.25, -0.25, -0.5, -0.25, -0.5, 0.25, -0.25, 0.5, -0.5, 0.5, 0.25, -0.25, 0.25, 0.5],
  [0.25, 0.25, 0.5, -0.25, -0.5, 0.25, 0.25, -0.25, -0.5, -0.25, -0.25, -0.25, -0.25, 0.25, 0.25, 0.5]];
const CHARS = ['B', 'e', 'f'];
const FLIP = INPUT[0].map(v => -v);
const lin = (W, v) => W.map(row => row.reduce((s, w, k) => s + w * v[k], 0));
// erf: Abramowitz-Stegun 7.1.26 is only 1.5e-7 accurate, so use a series
// (converges fast for |x| < 3, every h here) - accurate to ~1e-15.
const erf = x => { let sum = 0, term = x; for (let n = 0; n < 60; n += 1) { sum += term / (2 * n + 1); term *= -x * x / (n + 1); } return 2 / Math.sqrt(Math.PI) * sum; };
const gelu = h => 0.5 * h * (1 + erf(h / Math.SQRT2));
const layerNorm = v => { const m = v.reduce((a, b) => a + b) / v.length; const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length + 1e-5); return v.map(e => (e - m) / s); };
const H = [...INPUT, FLIP].map(x => lin(WFC, x));
const G = H.map(h => h.map(gelu));
const MOUT = G.map(g => lin(WPROJ, g));
const positives = h => h.flatMap((v, j) => (v > 0 ? [j + 1] : []));
const close = (a, b, tol, where) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= tol, `${where}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };
const ALL = [0, 1, 2].flatMap(position => [false, true].map(revealed => ({ position, revealed })));

test('c14 passes every gate at every review state and every input combination; 30 objects at scale 1', () => {
  assertCardGates(scene, reviewStates);
  const results = assertCardGates(scene, ALL);
  assert.deepEqual(reviewStates, [{ position: 0 }, { position: 1 }, { position: 2 }, { position: 0, revealed: true }]);
  assert.deepEqual(scene.inputs.map(i => [i.name, i.type, i.default, !!i.hidden]), [['position', 'index', 0, false], ['revealed', 'bool', false, true]]);
  assert.equal(scene.inputs[0].label, 'Position’s input (preset)');
  assert.deepEqual(scene.exampleData.positions, ['0 · B', '1 · e', '2 · f']);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.equal(scene.objects.length, 30);
  assert.equal(scene.height, 851);
  const legibility = sceneLegibility(scene);
  assert.ok(scene.height >= legibility.viewport.h && scene.height < legibility.viewport.h + 1, 'the scene box holds the padded content, so a 960-wide frame draws it at scale 1');
  assert.equal(legibility.scale, 1);
  assert.ok(legibility.viewport.h <= 860, `the frame fits the 860 cap: ${JSON.stringify(legibility.viewport)}`);
  for (const [k, result] of results.entries()) {
    assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds), JSON.stringify(ALL[k]));
  }
});

test('c14 plan: staged, verbatim objective, The MLP 2 of 2, no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(plan.boundary.reviewed, {});
  assert.equal(plan.objective, 'After this card, the learner should understand that inside the MLP c_fc widens one position’s C numbers to 4C, GELU bends each of them on its own (a positive one keeps more than half of itself, a negative one ends between −0.17 and 0), then c_proj sums them back into C numbers, so the MLP is not a linear map.');
  const { name, position, of, relationships } = plan.boundary.sequence;
  assert.deepEqual([name, position, of], ['The MLP', 2, 2]);
  assert.deepEqual(relationships.map(r => [r.type, r.card, r.direction]), [
    ['prerequisite', 'c05-position-mixing', 'in'], ['deepens', 'c02-block-anatomy', 'in'], ['prerequisite', 'c15-layernorm', 'in']]);
});

test('c14 fixture: inputs are layer_norm of the raw vectors, weights as planned, GELU matches erf', () => {
  const M = fx.mlp;
  assert.deepEqual(M.Wfc, WFC);
  assert.deepEqual(M.Wproj, WPROJ);
  for (const row of WPROJ) assert.equal(row.reduce((a, b) => a + b), 0, 'every W_proj row sums to 0');
  M.presets.forEach((p, i) => {
    assert.equal(p.char, CHARS[i]);
    assert.deepEqual(p.raw, RAW[i]);
    assert.deepEqual(p.input, INPUT[i]);
    close(layerNorm(RAW[i]), INPUT[i], 0.005, `layer_norm ${i}`);
    close(p.gelu, G[i], 0.00005 + 1e-12, `GELU ${i}`);
    assert.equal(p.positive, positives(H[i]).length);
  });
  assert.deepEqual(M.flipped.input, FLIP);
  close(M.flipped.gelu, G[3], 0.00005 + 1e-12, 'GELU flipped');
  assert.deepEqual(M.presets.map(p => p.positive).concat(M.flipped.positive), [10, 4, 11, 6]);
});

test('c14 GELU keeps signs and bends: on unrounded values, h/2 < GELU(h) < h above 0, −0.17 < GELU(h) < 0 below', () => {
  for (const [k, h] of H.entries()) {
    assert.ok(Math.min(...h) >= -2.85, `case ${k}: no negative GELU prints 0.00`);
    h.forEach((v, j) => {
      const g = G[k][j];
      assert.equal(Math.sign(g), Math.sign(v), `case ${k} unit ${j}`);
      if (v > 0) assert.ok(v / 2 < g && g < v, `case ${k} unit ${j}: ${v} -> ${g}`);
      else assert.ok(-0.17 < g && g < 0, `case ${k} unit ${j}: ${v} -> ${g}`);
      // The fixture's stored value has the same sign too (−0.1700 at h = −0.76 is 4-decimal rounding).
      assert.equal(Math.sign([...fx.mlp.presets.map(p => p.gelu), fx.mlp.flipped.gelu][k][j]), Math.sign(v));
    });
  }
  assert.equal(fx.mlp.flipped.gelu[7], -0.17, 'h = −0.76 stores −0.1700; its true value is above −0.17');
});

test('c14 every preset: input, h, GELU(h), m and the caption match the oracle; the weights never change', () => {
  const results = assertCardGates(scene, ALL);
  ALL.forEach(({ position, revealed }, k) => {
    const result = results[k];
    const where = JSON.stringify({ position, revealed });
    close(byId(result, 'input').values, INPUT[position], 1e-9, where);
    close(byId(result, 'h').values, H[position], 1e-9, `${where} h`);
    close(byId(result, 'g').values, G[position], 0.00005 + 1e-12, `${where} GELU`);
    close(byId(result, 'm').values, MOUT[position], 0.0005, `${where} m`);
    assert.equal(byId(result, 'input').label, `ln_2(x + a) at position ${position} · ${CHARS[position]} (toy numbers)`);
    const shown = revealed && position === 0;
    const P = positives(H[position]).length;
    assert.equal(byId(result, 'caption').label, shown
      ? 'What-if, input flipped: the 6 squeezed for “B” stay positive, its 10 are squeezed.'
      : `Position ${position} · ${CHARS[position]}: ${P} of the 16 hidden numbers stay positive; the other ${16 - P} end between −0.17 and 0.`, where);
    assert.equal(byId(result, 'h').values.length, 16);
    assert.equal(byId(result, 'm').values.length, 4);
  });
  assert.deepEqual([0, 1, 2].map(p => positives(H[p]).length), [10, 4, 11]);
  // The plan's m table, and each m component takes both signs across B, e, f.
  close(MOUT[0], [-1.966, 1.768, 1.44, -1.985], 0.001, 'm B');
  close(MOUT[1], [0.78, -1.407, -0.56, -0.233], 0.001, 'm e');
  close(MOUT[2], [-2.165, 1.807, -0.384, 1.181], 0.001, 'm f');
  for (let i = 0; i < 4; i += 1) {
    const signs = new Set(MOUT.slice(0, 3).map(m => Math.sign(m[i])));
    assert.ok(signs.has(1) && signs.has(-1), `m_${i} changes sign across the presets`);
  }
});

test('c14 one colour scale, signed heat, for every strip', () => {
  for (const id of ['input', 'h', 'g', 'm', 'whatif-m', 'whatif-g']) {
    const { initialState } = scene.objects.find(o => o.id === id);
    assert.deepEqual([initialState.heat, initialState.valueScale, initialState.valueScaleGroup, initialState.cell], [{ mode: 'signed' }, 'shared', 'c14-mlp', 46], id);
  }
  const results = assertCardGates(scene, ALL);
  for (const result of results) {
    const domains = ['input', 'h', 'g', 'm'].map(id => JSON.stringify(byId(result, id).valueDomain));
    assert.equal(new Set(domains).size, 1);
  }
});

test('c14 reveal: the What-if rows appear only after Check and only at position 0, blank before', () => {
  const results = assertCardGates(scene, ALL);
  ALL.forEach(({ position, revealed }, k) => {
    const shown = revealed && position === 0;
    for (const id of ['whatif-m', 'whatif-g', 'name-whatif-g']) assert.equal(byId(results[k], id).opacity, shown ? 1 : 0, `${id} ${JSON.stringify(ALL[k])}`);
    const g = byId(results[k], 'whatif-g').values, m = byId(results[k], 'whatif-m').values;
    if (shown) { close(g, G[3], 0.00005 + 1e-12, 'what-if GELU'); close(m, MOUT[3], 0.0005, 'what-if m'); }
    else { assert.ok(g.every(v => v === null) && m.every(v => v === null), 'no What-if value before a committed attempt'); }
    // B's own rows stay: the reveal adds, it never replaces.
    close(byId(results[k], 'input').values, INPUT[position], 1e-9, 'input stays');
  });
  assert.ok(byId(results[1], 'name-whatif-g').label.startsWith('What-if'));
  assert.ok(!byId(results[1], 'whatif-g').label, 'no label on m’s bottom edge');
  assert.ok(byId(results[1], 'whatif-m').label.startsWith('What-if'));
  // No appear on the What-if objects: their opacity is derived.
  assert.ok(!scene.timeline.some(e => ['whatif-m', 'whatif-g', 'name-whatif-g'].includes(e.target)));
  // Each rule and the caption appear with the stage they describe.
  const at = id => scene.timeline.find(e => e.action === 'appear' && e.target === id)?.at;
  assert.deepEqual(['fc-rule', 'gelu-rule', 'caption', 'proj-rule'].map(at), [at('fc-label'), at('g'), at('g'), at('proj-label')]);
});

test('c14 the flipped case: no bias makes it −h; it is no preset and no drawn row has its positive set', () => {
  close(H[3], H[0].map(v => -v), 1e-12, 'no bias: the flipped input gives −h');
  for (const x of INPUT) assert.ok(Math.hypot(...x.map((v, i) => v - FLIP[i])) >= 2, 'at least 2 from every drawn input');
  const flipSet = JSON.stringify(positives(H[3]));
  assert.equal(flipSet, JSON.stringify([1, 2, 6, 7, 11, 14]));
  for (let p = 0; p < 3; p += 1) assert.notEqual(JSON.stringify(positives(H[p])), flipSet);
  assert.deepEqual(positives(H[0]), [3, 4, 5, 8, 9, 10, 12, 13, 15, 16]);
  // m(flipped) is neither m(B) nor −m(B), by a margin in every component.
  MOUT[3].forEach((v, i) => {
    assert.ok(Math.abs(v - MOUT[0][i]) >= 0.3, `component ${i} vs m`);
    assert.ok(Math.abs(v + MOUT[0][i]) >= 0.3, `component ${i} vs −m`);
  });
  // Before Check, no strip on screen holds the flipped input, its GELU(h), its m or −m(B).
  const [result] = assertCardGates(scene, [{ position: 0 }]);
  const drawn = result.state.objects.filter(o => o.visible && (o.opacity ?? 1) > 0 && o.type === 'strip').map(o => o.values);
  const same = (a, b) => a.length === b.length && a.every((v, i) => v != null && Math.abs(v - b[i]) < 0.005);
  for (const hidden of [FLIP, G[3], MOUT[3], MOUT[0].map(v => -v)]) assert.ok(!drawn.some(values => same(values, hidden)), JSON.stringify(hidden));
});

test('c14 the derive graph: hNeg = matmul(−x_B, W_fc) equals −h_B', async () => {
  const { buildPool, canonical } = await import('../../scene-derive.js');
  const pool = buildPool({ exampleData: { ...scene.exampleData, position: 0, revealed: false }, derived: scene.derived }, canonical);
  close(pool.hNeg[0], pool.h[0].map(v => -v), 1e-9, 'hNeg');
  close(pool.hNeg[0], H[3], 1e-9, 'hNeg oracle');
  close(pool.mNeg[0], MOUT[3], 0.0005, 'mNeg oracle');
  assert.deepEqual(pool.C4, [4 * fx.architecture.n_embd]);
});

test('c14 practice: the flipped input, which no preset draws', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  assert.deepEqual(activity.fixedInputs, { position: 0 });
  assert.equal(activity.revealInput, 'revealed');
  const labels = Object.fromEntries(activity.answer.options.map(o => [o.id, o.label]));
  assert.deepEqual(labels, {
    'same-minus': 'The same 10 stay positive, and the output is −m',
    'other-minus': 'The other 6 stay positive, and the output is −m',
    'other-same': 'The other 6 stay positive, and the output is still m',
    'other-neither': 'The other 6 stay positive, and the output is neither −m nor m',
  });
  assert.equal(activity.answer.default, 'same-minus', 'the naive default is wrong');
  assert.equal(activity.expected, 'other-neither');
  for (const id of Object.keys(labels)) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'other-neither');
  // Mutually exclusive: the oracle rules out every other option.
  const flipPositive = positives(H[3]), bPositive = positives(H[0]);
  assert.equal(flipPositive.length, 6);
  assert.ok(flipPositive.every(j => !bPositive.includes(j)) && flipPositive.length + bPositive.length === 16, 'the other 6, not the same 10');
  assert.ok(activity.prompt.includes('not drawn') && activity.prompt.includes('no bias'));
  assert.equal(activity.feedbackPass, 'Right. c_fc has no bias, so the flipped input gives −h: every hidden number changes sign. GELU keeps signs, so the 6 squeezed for “B” now stay positive and its 10 are squeezed. GELU does not treat +h and −h alike, so nothing makes c_proj’s sum −m or m: here (−0.23, 1.23, −1.78, 1.37) against m = (−1.97, 1.77, 1.44, −1.98). The What-if rows now show it.');
  for (const phrase of ['“the same 10”', '“−m”', '“Still m”', '(−0.23, 1.23, −1.78, 1.37)', '(1.97, −1.77, −1.44, 1.98)']) assert.ok(activity.feedbackFail.includes(phrase), phrase);
  for (const t of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) {
    assert.doesNotMatch(t, /\.py\b|:\d+|generate_fixtures/);
    assert.doesNotMatch(t, /ReLU|turns off|zeroes|\bpass(es)?\b/i, 'GELU is not a gate');
  }
});

test('c14 wording: GELU is never a gate, the input is never x, its output never g', () => {
  const results = assertCardGates(scene, ALL);
  for (const result of results) {
    const labels = result.state.objects.filter(o => o.visible && o.label).map(o => o.label);
    for (const label of labels) {
      assert.doesNotMatch(label, /ReLU|turns off|zeroes|\bpass(es)?\b|\bgate/i, label);
      assert.doesNotMatch(label, /\bg\b/, `${label}: g is the gradient on c19 and c20`);
      assert.doesNotMatch(label, /same (character|letter)|equal (character|input)/i, 'the two e’s of Before');
    }
    assert.deepEqual(labels.flatMap(ungroupedNumbers), []);
  }
});

test('c14 sources: every status is labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'Live calculation', 'Source value']);
  assert.ok(!sources.some(s => s.status === 'What-if'), 'no What-if source: the status line has no room; the reveal labels itself');
  const cites = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`);
  assert.deepEqual(cites, ['model.py:82-85', 'model.py:88-92', 'model.py:100-101', 'model.py:104-105', 'model.py:23-27', 'train.py:56-56',
    'train.py:147-148', 'model.py:116-116', 'model.py:225-225', 'config/train_shakespeare_char.py:22-25', 'model.py:164-164', 'train.py:218-227', 'sample.py:51-51']);
  const [result] = assertCardGates(scene, [{ position: 0 }]);
  const A = fx.architecture;
  assert.equal(A.bias, false, 'shakespeare_char trains without bias');
  assert.equal(byId(result, 'size-note').label, `Source value: shakespeare_char has C = ${A.n_embd}: c_fc makes 4C = ${4 * A.n_embd} numbers per position; this toy has C = 4.`);
  assert.ok(byId(result, 'dropout-note').label.includes(`p = ${A.dropout}`));
});

const PATHS = ['model.py', 'train.py', 'config/train_shakespeare_char.py', 'sample.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c14 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
  const squash = t => t.replace(/\s+/g, ' ').trim();
  let quotes = 0;
  for (const source of sources.filter(s => s.kind === 'code')) {
    const [start, end] = source.lines;
    const cited = squash(pinnedFile(source.path).slice(start - 1, end).join(' '));
    for (const [, quote] of source.note.matchAll(/"([^"]+)"/g)) {
      quotes += 1;
      assert.ok(cited.includes(squash(quote)), `${source.path}:${start}-${end} lacks "${quote}"`);
    }
  }
  assert.ok(quotes >= 25, `${quotes} quotes checked`);
  const config = pinnedFile('config/train_shakespeare_char.py');
  assert.equal(Number(config[24 - 1].match(/n_embd = (\d+)/)[1]), fx.architecture.n_embd);
  assert.equal(Number(config[25 - 1].match(/dropout = ([\d.]+)/)[1]), fx.architecture.dropout);
  assert.ok(!config.some(l => /^\s*bias\s*=/.test(l)), 'the shakespeare_char config sets no bias, so train.py\'s False stands');
});

test('c14 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
});
