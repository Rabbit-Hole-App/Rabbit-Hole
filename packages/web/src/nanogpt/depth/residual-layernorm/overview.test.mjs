import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import base from '../../fixtures/nanogpt-fixtures.generated.js';
import fx from '../fixtures/residual-layernorm.generated.js';
import { scene, sources, evidence, reviewStates } from './overview.js';
import { assertCardGates, assertEvidence, assertSources } from '../../card-gates.mjs';

const results = assertCardGates(scene, reviewStates);
const byId = (result, id) => result.state.objects.find(o => o.id === id);
const shownLabels = result => result.state.objects.filter(o => o.visible && o.label).map(o => o.label);
const r3 = v => Math.round(v * 1000) / 1000;
const LEARNER_LABELS = /\b(beginners?|intermediate|advanced|experts?|newcomers?|novices?)\b/i;

test('reviewStates are every configuration of the one discrete control', () => {
  assert.deepEqual(reviewStates, [{ stream: true }, { stream: false }]);
  assert.equal(scene.inputs.length, 1);
  assert.equal(scene.inputs[0].type, 'bool');
});

test('Overview: question first, "No prerequisites." under it, no equations, shapes or learner labels', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(scene.objects[0].initialState.text.length <= 95);
  assert.equal(scene.objects[1].initialState.text, 'No prerequisites.');
  for (const result of results) {
    assert.equal(result.state.objects.filter(o => o.visible && o.type === 'equation').length, 0);
    const labels = shownLabels(result).join('\n');
    assert.doesNotMatch(labels, /\(\s*[A-Za-z][\w·]*(?:\s*,\s*[\w·×/]+)+\s*\)/, 'no tensor shapes');
    assert.doesNotMatch(labels, LEARNER_LABELS);
    // Colour only: every grid's cells are too small for the renderer to print digits.
    for (const grid of result.state.objects.filter(o => o.type === 'grid')) assert.ok(grid.cell < 22, grid.id);
  }
  assert.doesNotMatch(JSON.stringify(evidence), LEARNER_LABELS);
});

test('the token and the block count are the shared source truth', () => {
  assert.deepEqual(fx.overview.x0, base.layernorm.presets[0].x, 'same x0 as the base LayerNorm fixture');
  assert.equal(fx.overview.nLayer, base.architecture.n_layer, 'n_layer from the Shakespeare-char config');
  for (const list of [fx.overview.maps, fx.overview.kept, fx.overview.replaced]) assert.equal(list.length, base.architecture.n_layer);
  assert.equal(scene.objects.filter(o => /^block-\d+$/.test(o.id)).length, base.architecture.n_layer);
});

// Independent oracle: a toy block reads F.layer_norm of its input (biased
// variance, eps 1e-5, no gamma) and multiplies it by its map (rows = input
// entries). Checked step by step, so a rounding tie cannot cascade.
const layerNorm = x => {
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / x.length;
  return x.map(v => (v - mean) / Math.sqrt(variance + 1e-5));
};
const block = (x, map) => { const xhat = layerNorm(x); return map[0].map((unused, j) => xhat.reduce((s, v, i) => s + v * map[i][j], 0)); };
const near = (actual, expected, tol, what) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tol, `${what}[${i}]: ${v} vs ${expected[i]}`));

test('every block reads what flows in: kept changes and what-if outputs match the oracle, step by step', () => {
  const { x0, maps, kept, replaced } = fx.overview;
  let total = x0, out = x0;
  maps.forEach((map, i) => {
    near(kept[i], block(total, map), 0.0051, `kept change ${i + 1}`);
    near(replaced[i], block(out, map), 0.0051, `what-if output ${i + 1}`);
    total = total.map((v, j) => r3(v + kept[i][j]));
    out = replaced[i];
  });
});

test('every column on the card: running total when kept, the block’s own output when replaced', () => {
  const { x0, kept, replaced } = fx.overview;
  results.forEach((result, s) => {
    const keep = reviewStates[s].stream;
    assert.deepEqual(byId(result, 'token').values, x0);
    let total = [...x0];
    kept.forEach((change, i) => {
      total = total.map((v, j) => r3(v + change[j]));
      const k = i + 1;
      assert.deepEqual(byId(result, `change-${k}`).values, keep ? change : replaced[i], `change-${k}`);
      assert.deepEqual(byId(result, `out-${k}`).values, keep ? total : replaced[i], `out-${k} (stream ${keep})`);
      assert.equal(byId(result, `carry-${k}`).opacity, keep ? 1 : 0);
      // The block reads what flows in either way: its feed and read branch stay.
      assert.ok(byId(result, `feed-${k}`).visible && byId(result, `read-${k}`).visible, `read branch ${k}`);
    });
  });
});

test('the token keeps its colours: the shared scale is the same kept or replaced, and its anchor is never drawn', () => {
  const domain = result => result.scene.objects.find(o => o.id === 'token').valueDomain;
  const { x0, kept, replaced } = fx.overview;
  let total = [...x0], peak = Math.max(...x0.map(Math.abs), ...replaced.flat().map(Math.abs));
  for (const change of kept) { total = total.map((v, j) => r3(v + change[j])); peak = Math.max(peak, ...total.map(Math.abs)); }
  for (const result of results) {
    assert.deepEqual(domain(result), { min: -peak, max: peak });
    assert.equal(byId(result, 'scale-anchor').visible, false);
  }
});

test('the words match the numbers: kept, the output still carries the token; replaced, only a small rebuilt result flows on', () => {
  const { x0, kept: changes, replaced } = fx.overview;
  const [keptState, replacedState] = results;
  const out = result => byId(result, `out-${fx.overview.nLayer}`).values;
  const cosine = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0) / Math.hypot(...a) / Math.hypot(...b);
  const maxAbs = v => Math.max(...v.map(Math.abs));
  // Kept: every entry keeps x0's sign and the vector still points x0's way, but visibly moved.
  assert.ok(out(keptState).every((v, i) => Math.sign(v) === Math.sign(x0[i])), 'signs kept');
  const c = cosine(out(keptState), x0);
  assert.ok(c > 0.85 && c < 0.97, `kept cosine ${c}: recognizable, yet shifted`);
  // Each change and each what-if output is small next to the token, yet never blank.
  for (const v of [...changes, ...replaced]) assert.ok(maxAbs(v) < 0.4 * maxAbs(x0) && maxAbs(v) > 0.1 * maxAbs(x0), `${v}`);
  assert.ok(maxAbs(replaced.flat()) > 0.35 * maxAbs(x0), 'the what-if chain reaches a clearly coloured cell');
  // Replaced: the output is Block 6's own result, far from the token.
  assert.deepEqual(out(replacedState), replaced.at(-1));
  const dist = Math.hypot(...out(replacedState).map((v, i) => v - x0[i]));
  assert.ok(dist > 0.8 * Math.hypot(...x0), `what-if output is not the token (distance ${dist})`);
  assert.match(byId(keptState, 'takeaway').label, /^Kept: after 6 blocks the token’s own pattern is still there/);
  assert.match(byId(replacedState, 'takeaway').label, /^What-if, replaced: only the last block’s small result flows on/);
  assert.equal(byId(keptState, 'takeaway').role, 'output');
  assert.equal(byId(replacedState, 'takeaway').role, 'warning');
});

test('plain-language hierarchy: read, propose, add back first; LayerNorm only later, quieter and shorter', () => {
  for (const result of results) {
    const texts = result.state.objects.filter(o => o.visible && o.type === 'text' && o.label);
    const primary = byId(result, 'primary');
    assert.equal(primary.label, 'In NanoGPT, each block reads the current stream, proposes a change, and adds that change back.');
    const ln = texts.filter(o => /layernorm|normaliz/i.test(o.label));
    assert.deepEqual(ln.map(o => o.id), ['ln'], 'normalization is named once');
    const typography = id => scene.objects.find(o => o.id === id).initialState.typography || 'body';
    assert.ok(ln[0].y > primary.y && ln[0].label.length < primary.label.length, 'later and shorter');
    assert.deepEqual([typography('primary'), typography('ln')], ['body', 'annotation'], 'quieter');
  }
});

// The sha256-pinned NanoGPT files generate_fixtures.py caches; quote checks
// are skipped where that cache is absent.
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
  assert.match(sources.find(s => s.status === 'Calculated toy example').reproduce, /gen_residual-layernorm\.py --check$/);
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
  assert.equal(evidence.depth, 'Overview');
  assert.equal(evidence.prerequisites, 'No prerequisites.');
  assert.ok(evidence.ladderRole.trim());
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT @ ${base.provenance.nanogpt.commit}`);
});
