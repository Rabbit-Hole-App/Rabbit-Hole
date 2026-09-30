import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, evidence, sources } from './c03-residual.js';
import { assertCardGates, assertEvidence, assertSources } from '../card-gates.mjs';

const STATES = [{ residual: true }, { residual: false }];
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const close = (actual, expected, where) => {
  assert.equal(actual.length, expected.length, where);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-9, `${where}[${i}]: ${value} vs ${expected[i]}`));
};

test('c03-residual passes every gate in both toggle states', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(scene.objects[0].initialState.text.length <= 95);
  assertCardGates(scene, STATES);
});

test('out, out - x and the squared sizes match a plain-JS oracle', () => {
  const { x, u } = scene.exampleData;
  const r3 = v => Math.round(v * 1000) / 1000;
  for (const [inputs, result] of STATES.map(s => [s, assertCardGates(scene, [s])[0]])) {
    const out = inputs.residual ? x.map((xi, i) => r3(xi + u[i])) : [...u];
    const change = out.map((o, i) => r3(o - x[i]));
    const where = JSON.stringify(inputs);
    close(byId(result, 'x-strip').values, x, `${where} x`);
    close(byId(result, 'u-strip').values, u, `${where} u`);
    close(byId(result, 'out-strip').values, out, `${where} out`);
    close(byId(result, 'change-strip').values, change, `${where} change`);
    const sq = v => r3(v.reduce((s, a) => s + a * a, 0));
    const verdict = inputs.residual ? 'the change is small next to x' : 'the change is about as large as x';
    assert.equal(byId(result, 'size-readout').label, `squared size of the change Σ(out − x)² = ${sq(change)} vs Σx² = ${sq(x)}: ${verdict}`);
    // The verdict words must match the numbers they sit next to.
    if (inputs.residual) assert.ok(sq(change) < 0.05 * sq(x));
    else assert.ok(sq(change) > 0.5 * sq(x));
    if (inputs.residual) close(change, u, 'on: out - x is exactly the branch update');
    else close(change, u.map((ui, i) => r3(ui - x[i])), 'off: out - x is u - x');
  }
});

test('u is deliberately small next to x, as the card says', () => {
  const { x, u } = scene.exampleData;
  const maxAbs = v => Math.max(...v.map(Math.abs));
  assert.ok(maxAbs(u) < 0.2 * maxAbs(x), `max|u| ${maxAbs(u)} vs max|x| ${maxAbs(x)}`);
});

test('x keeps its colours across states (shared domain is identical) and captions follow the toggle', () => {
  const [on, off] = assertCardGates(scene, STATES);
  const domain = result => byId(result, 'x-strip').valueDomain;
  assert.deepEqual(domain(on), domain(off));
  assert.deepEqual(domain(on), { min: -2.3, max: 2.3 });
  const labels = (result, ids) => ids.map(id => byId(result, id).label);
  const captions = ['status', 'out-box', 'skip-note', 'out-strip', 'change-strip', 'takeaway'];
  assert.deepEqual(labels(on, captions), [
    'Residual add ON: out = x + u, which is what every NanoGPT block does',
    'out = x + u', 'carries x',
    'out = x + u: the new x, goes on to ln_2 and the MLP',
    'out − x = u: only the small update changed',
    'On: every entry of x reaches out, shifted only by the small update u.',
  ]);
  assert.deepEqual(labels(off, captions), [
    'Residual add OFF: out = u, a what-if; NanoGPT’s code always adds x back',
    'out = u (no add)', 'cut (what-if)',
    'out = u alone: x was not added back',
    'out − x = u − x: x itself was not passed on',
    'Off: out is only what the branch computed; x’s own entries are not copied into out.',
  ]);
  // The what-if never shares the real behaviour's styling.
  assert.equal(byId(on, 'status').role, 'output');
  assert.equal(byId(off, 'status').role, 'warning');
  assert.equal(byId(off, 'out-box').role, 'warning');
  assert.equal(byId(off, 'out-strip').role, 'warning');
  assert.equal(byId(on, 'skip-2').opacity, 1);
  assert.ok(byId(off, 'skip-2').opacity < 0.5);
  // No arrowhead lands on out when the add is off.
  assert.equal(byId(on, 'skip-3').opacity, 1);
  assert.equal(byId(off, 'skip-3').opacity, 0);
});

// The sha256-pinned NanoGPT files generate_fixtures.py caches; the quote check
// is skipped where that cache is absent.
const cached = path => {
  const sha = fx.provenance.nanogpt.files[path];
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${path} cache is not the pinned file`);
  return bytes.toString('utf8').split('\n');
};
const model = cached('model.py');

test('sources: provenance lives under the card, not on it', () => {
  assertSources(sources, scene);
  const at = line => sources.find(s => s.kind === 'code' && s.path === 'model.py' && s.lines.join('-') === `${line}-${line}`);
  const QUOTES = { 104: 'x = x + self.attn(self.ln_1(x))', 105: 'x = x + self.mlp(self.ln_2(x))' };
  for (const [line, quoted] of Object.entries(QUOTES)) {
    assert.ok(at(line)?.note.includes(`“${quoted}”`), `model.py:${line} is cited with its line quoted`);
    if (model) assert.equal(model[line - 1].trim(), quoted, `model.py:${line} really says "${quoted}"`);
  }
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'Live calculation']);
  // Authored numbers are not the fixture generator's, so no reproduce command.
  assert.equal(sources.find(s => s.status === 'Calculated toy example').reproduce, undefined);
  // The two adds survive on the card as maths, without the code listing.
  const [on] = assertCardGates(scene, STATES);
  assert.equal(byId(on, 'twice-note').label, 'Every NanoGPT block adds twice:  x ← x + attn(ln_1(x)),  then  x ← x + mlp(ln_2(x))');
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
});
