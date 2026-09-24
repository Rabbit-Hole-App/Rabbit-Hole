import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import base from '../../fixtures/nanogpt-fixtures.generated.js';
import fx from '../fixtures/residual-layernorm.generated.js';
import { scene, sources, evidence, reviewStates } from './guided.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';

const G = fx.guided;
const results = assertCardGates(scene, reviewStates);
const byId = (result, id) => result.state.objects.find(o => o.id === id);
const r3 = v => Math.round(v * 1000) / 1000;
const LEARNER_LABELS = /\b(beginners?|intermediate|advanced|experts?|newcomers?|novices?)\b/i;
const close = (actual, expected, tol, what) => {
  assert.equal(actual.length, expected.length, `${what}: length`);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tol, `${what}[${i}]: ${v} vs ${expected[i]}`));
};

// Independent oracle: F.layer_norm over one vector (biased variance, eps
// 1e-5 as model.py passes it), γ times x̂, the toy layer as a vector-matrix
// product, then the residual add.
function block(x) {
  const n = x.length;
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance + 1e-5);
  const xhat = x.map(v => (v - mean) / std);
  const y = xhat.map((v, i) => base.layernorm.gamma[i] * v);
  const change = G.layer[0].map((unused, j) => y.reduce((s, yi, i) => s + yi * G.layer[i][j], 0));
  return { mean, variance, std, xhat, change, out: x.map((v, i) => v + change[i]) };
}
const x0 = base.layernorm.presets[0].x;
const ref = block(x0);

test('two numeric controls, six review states inside their domains, and a "Builds on" line', () => {
  assert.deepEqual(scene.inputs.map(d => [d.type, d.presentation]), [['index', 'slider'], ['index', 'picker']]);
  assert.equal(reviewStates.length, 6);
  for (const s of reviewStates) {
    assert.ok(s.multiplier >= 0 && s.multiplier < G.scales.length && s.shift >= 0 && s.shift < G.shifts.length);
  }
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(scene.objects[0].initialState.text.length <= 95);
  assert.match(scene.objects[1].initialState.text, /^Builds on: Overview \(.+\); mean, variance and square root$/);
  for (const result of results) {
    const labels = result.state.objects.filter(o => o.visible && o.label).map(o => o.label).join('\n');
    assert.doesNotMatch(labels, LEARNER_LABELS);
  }
  assert.doesNotMatch(JSON.stringify(evidence), LEARNER_LABELS);
});

test('the generator’s table agrees with the oracle and with the base fixture at every (a, b)', () => {
  assert.deepEqual(G.table[G.scales.indexOf(1)][G.shifts.indexOf(0)].x, x0);
  // The base fixture's own presets (x0 + 3 is not on this card's grid; x0 and 2 · x0 are).
  assert.deepEqual(G.table[G.scales.indexOf(1)][G.shifts.indexOf(0)].xhat, base.layernorm.presets[0].xhat);
  assert.deepEqual(G.table[G.scales.indexOf(2)][G.shifts.indexOf(0)].xhat, base.layernorm.presets[2].xhat);
  G.scales.forEach((a, i) => G.shifts.forEach((b, j) => {
    const cell = G.table[i][j];
    const truth = block(x0.map(v => a * v + b));
    close(cell.x, x0.map(v => a * v + b), 1e-9, `x @${a},${b}`);
    assert.ok(Math.abs(cell.mean - truth.mean) < 1e-4 && Math.abs(cell.std - truth.std) < 1e-4, `stats @${a},${b}`);
    close(cell.xhat, truth.xhat, 1e-4, `xhat @${a},${b}`);
  }));
});

test('every number on the card matches the oracle at every review state', () => {
  results.forEach((result, s) => {
    const { multiplier, shift } = reviewStates[s];
    const a = G.scales[multiplier], b = G.shifts[shift];
    const truth = block(x0.map(v => a * v + b));
    const cell = G.table[multiplier][shift];
    close(byId(result, 'x-sel').values, x0.map(v => a * v + b), 1e-9, 'x');
    close(byId(result, 'xhat-sel').values, truth.xhat, 1e-4, 'xhat');
    close(byId(result, 'change-sel').values, truth.change, 3e-3, 'change'); // live ops round to 3 decimals
    close(byId(result, 'out-sel').values, truth.out, 3e-3, 'out');
    close(byId(result, 'out-ref').values, ref.out, 3e-3, 'out ref');
    assert.equal(byId(result, 'stats-sel').label, `mean ${cell.mean} · std ${cell.std}`);
    const REF = G.table[G.scales.indexOf(1)][G.shifts.indexOf(0)];
    assert.equal(byId(result, 'stats-ref').label, `mean ${REF.mean} · std ${REF.std}`);
    assert.equal(byId(result, 'col-sel').label, `yours: x = ${a < 0 ? `−${-a}` : a} · x₀ ${b < 0 ? `− ${-b}` : `+ ${b}`}`);
    // The live checks the card prints: x̂ sums to 0 and its squares average 1.
    const sum = r3(cell.xhat.reduce((t, v) => t + v, 0));
    const meanSq = r3(r3(cell.xhat.reduce((t, v) => t + v * v, 0)) / cell.xhat.length);
    assert.ok(sum === 0, `x̂ sums to 0: ${sum}`); // -0 at a negative multiplier; the label below must still read "sum 0"
    assert.equal(meanSq, 1);
    assert.equal(byId(result, 'check-sel').label, `live: sum ${sum} · mean of squares ${meanSq}`);
  });
});

// Each sentence on the card, checked against the oracle rather than the card's own numbers.
test('the relationships the card states are true', () => {
  // The multiplier can break the invariance as well as confirm it: × −1 is on the slider and in a review state.
  assert.ok(G.scales.includes(-1) && reviewStates.some(s => G.scales[s.multiplier] < 0));
  results.forEach((result, s) => {
    const { multiplier, shift } = reviewStates[s];
    const a = G.scales[multiplier], b = G.shifts[shift], sign = Math.sign(a);
    const truth = block(x0.map(v => a * v + b));
    const label = id => byId(result, id).label;
    // "Shift: mean only." "Multiplier: mean and std."
    assert.equal(`${label('rel-stats-1')} ${label('rel-stats-1b')}`, 'Shift: mean only. Multiplier: mean and std.');
    assert.ok(Math.abs(truth.mean - (a * ref.mean + b)) < 1e-9);
    assert.ok(Math.abs(truth.std - Math.abs(a) * ref.std) < 1e-5, `std ≈ |a| · std₀ (eps is not scaled): ${truth.std} vs ${Math.abs(a) * ref.std}`);
    // x̂ and the change: identical for a positive multiplier, every sign flipped for a negative one.
    close(truth.xhat, ref.xhat.map(v => sign * v), 1e-5, 'oracle xhat = sign(a) · xhat₀ (eps is not scaled)');
    close(byId(result, 'xhat-sel').values, byId(result, 'xhat-ref').values.map(v => sign * v), 0, 'xhat on the card');
    close(byId(result, 'change-sel').values, byId(result, 'change-ref').values.map(v => sign * v), 0, 'change on the card');
    // ε is added to the variance and not rescaled with it, so only × 1 (a shift alone) is exact.
    const epsShare = 1e-5 / truth.variance;
    if (a === 1) {
      close(truth.xhat, ref.xhat, 1e-12, 'a shift alone leaves x̂ exactly as it was');
      assert.equal(`${label('rel-xhat-1')} ${label('rel-xhat-2')}`, 'Same in both columns: subtracting the mean cancels any shift.');
      assert.match(label('rel-change-1'), /^Same too/);
      assert.equal(label('rel-out'), '= (a − 1)·x₀ + b: shift and scale kept');
    } else if (a > 0) {
      // "Nearly", and why: x̂ really differs from the reference, by less than the printed digits, because ε ≪ σ² here.
      assert.ok(truth.xhat.some((v, i) => v !== ref.xhat[i]), 'a rescale is not exact: ε is not rescaled');
      assert.ok(epsShare < 1e-4, `ε is tiny relative to this variance: ε ÷ σ² = ${epsShare}`);
      assert.equal(`${label('rel-xhat-1')} ${label('rel-xhat-2')}`, 'Nearly the same here; ε is tiny relative to this variance.');
      assert.match(label('rel-change-1'), /^Nearly the same too/);
      assert.equal(label('rel-out'), '≈ (a − 1)·x₀ + b: shift and scale kept');
    } else {
      assert.equal(`${label('rel-xhat-1')} ${label('rel-xhat-2')}`, 'Signs flipped: shift and size cancel, a negative sign does not.');
      assert.equal(`${label('rel-change-1')} ${label('rel-change-2')}`, 'Flipped too: the toy layer is linear and sees only x̂.');
      assert.equal(label('rel-out'), '= (a − 1)·x₀ + b − 2 × reference change');
    }
    // "Entry by entry, x + change = out", on the card's own cells.
    const x = byId(result, 'x-sel').values, change = byId(result, 'change-sel').values;
    assert.deepEqual(byId(result, 'out-sel').values, x.map((v, i) => r3(v + change[i])));
    // out - out_ref = (a - 1) x0 + b + (sign(a) - 1) · change_ref: the stream keeps shift and scale; a negative
    // multiplier also flips the change. The card's live strip shows it.
    const expectedDiff = x0.map((v, i) => (a - 1) * v + b + (sign - 1) * ref.change[i]);
    close(byId(result, 'out-sel').values.map((v, i) => v - byId(result, 'out-ref').values[i]), expectedDiff, 3e-3, 'out - out_ref');
    close(byId(result, 'out-diff').values, expectedDiff, a > 0 ? 1e-9 : 3e-3, 'live out − reference out');
    // "live: std ÷ reference std = |a|" - eps is not scaled, so the ratio is |a| only to 3 decimals.
    assert.equal(label('rel-stats-2'), `live: std ÷ reference std = ${Math.abs(a)}`);
    assert.ok(Math.abs(truth.std / ref.std - Math.abs(a)) < 5e-4);
  });
  // Cells stay under 10 so the renderer prints two decimals (at 10+ it rounds to an integer).
  for (const result of results) for (const id of ['x-sel', 'out-sel']) assert.ok(byId(result, id).values.every(v => Math.abs(v) < 10), id);
});

// The cells print 2 decimals (the renderer's toFixed(2)); what the card says adds up must add up as printed.
test('the printed cells add up at every setting: x + change = out, and out − reference out', () => {
  const cents = v => Math.round(Number(v.toFixed(2)) * 100);
  G.scales.forEach((a, multiplier) => G.shifts.forEach((b, shift) => {
    const { state } = evaluated(scene, { multiplier, shift });
    const cells = id => state.objects.find(o => o.id === id).values.map(cents);
    for (const side of ['ref', 'sel']) {
      const x = cells(`x-${side}`), change = cells(`change-${side}`), out = cells(`out-${side}`);
      assert.deepEqual(x.map((v, i) => v + change[i]), out, `x + change = out (${side}) @${a},${b}`);
    }
    const outSel = cells('out-sel'), outRef = cells('out-ref');
    assert.deepEqual(outSel.map((v, i) => v - outRef[i]), cells('out-diff'), `out − reference out @${a},${b}`);
  }));
});

test('x-hat and the change keep their colours: the shared domains do not move between settings', () => {
  const [first, ...others] = results;
  const domain = (result, id) => result.scene.objects.find(o => o.id === id).valueDomain;
  assert.ok(domain(first, 'xhat-sel') && domain(first, 'change-sel'), 'heat strips carry a shared domain');
  for (const other of others) for (const id of ['xhat-sel', 'change-sel']) assert.deepEqual(domain(other, id), domain(first, id), id);
});

const pinned = path => {
  const sha = base.provenance.nanogpt.files[path];
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${path} cache is not the pinned file`);
  return bytes.toString('utf8').split('\n');
};
const squash = s => s.replace(/\s+/g, ' ').trim();

test('sources: well-formed, pinned, and every quoted line is really at the cited lines', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'Live calculation']);
  for (const source of sources.filter(s => s.kind === 'code')) {
    const lines = pinned(source.path);
    if (!lines) continue;
    const cited = squash(lines.slice(source.lines[0] - 1, source.lines[1]).join(' '));
    const quotes = [...source.note.matchAll(/“([^”]+)”/g)].map(m => squash(m[1]));
    assert.ok(quotes.length, `${source.path}:${source.lines} quotes its code`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${source.path}:${source.lines.join('-')} contains “${quote}”`);
  }
});

test('evidence record is complete, with the depth fields', () => {
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Guided');
  assert.equal(evidence.prerequisites, `${scene.objects[1].initialState.text}.`);
  assert.ok(evidence.ladderRole.trim());
});
