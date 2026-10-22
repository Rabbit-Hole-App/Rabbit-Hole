import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScene } from '../animation-scene.js';
import { compileVisual } from './compile.js';
import { coverageOf } from './components/state-space-block.js';
import { EXAMPLES } from './examples/index.js';

const block = params => compileVisual({
  version: 1, id: 'b', title: 'B', presentation: { mode: 'static' },
  components: [{ id: 'a', component: 'state-space-block', version: 1, params }],
});
const tex = (compiled, id) => compiled.scene.objects.find(object => object.id === `a.${id}`)?.initialState.runs?.filter(run => run.kind === 'math').map(run => run.tex).join(' ');
const plain = compiled => compiled.scene.objects.map(object => object.initialState.text ?? object.initialState.label ?? '').join('\n');
const boxes = compiled => compiled.scene.objects.filter(object => object.type === 'box').map(object => object.initialState);

test('the gate follows the target model\'s norm setting, never a default (mamba2.py, layernorm_gated.py at e9594ce)', () => {
  assert.equal(tex(block({ normBeforeGate: false }), 'gate'), '\\mathrm{RMSNorm}(y \\cdot \\mathrm{SiLU}(z))', 'False normalises y * SiLU(z)');
  assert.equal(tex(block({ normBeforeGate: true }), 'gate'), '\\mathrm{RMSNorm}(y) \\cdot \\mathrm{SiLU}(z)', 'True gates the normalised y');
  assert.equal(tex(block({ normBeforeGate: false, rmsnorm: false }), 'gate'), 'y \\cdot \\mathrm{SiLU}(z)');
  assert.throws(() => block({}), /"normBeforeGate" is required/);
});

test('the main path keeps the source order: in_proj, Conv1D + SiLU on x/B/C, scan, gate, out_proj, with z bypassing to the gate', () => {
  const compiled = block({ normBeforeGate: false });
  const order = ['input', 'in_proj', 'conv', 'scan', 'gate', 'out_proj'].map(id => compiled.scene.objects.find(object => object.id === `a.${id}`).initialState.y);
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  assert.equal(tex(compiled, 'in_proj'), 'z, x, B, C, \\Delta');
  assert.match(plain(compiled), /Causal Conv1D on x, B, C, then SiLU/);
  const zIn = compiled.scene.objects.find(object => object.id === 'a.z-in').initialState;
  const gate = compiled.scene.objects.find(object => object.id === 'a.gate').initialState;
  assert.equal(zIn.to.x, gate.x + gate.w, 'z enters the gate, skipping conv and scan');
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(validateScene(structuredClone(compiled.scene)));
});

test('scope decides what is shown, and the card says what is simplified, omitted or not in this module', () => {
  const main = block({ normBeforeGate: false });
  assert.ok(!main.scene.objects.some(object => /^a\.(dt|a|d)$/.test(object.id)), 'main path draws no dt, A or D boxes');
  assert.match(plain(main), /main path only/);
  assert.match(plain(main), /Omitted: dt: softplus\(dt \+ dt_bias\); A = -exp\(A_log\), per head; D skip/);
  assert.match(plain(main), /Not in this module: outer residual and pre-norm \(wrapping Block\)/);
  const detailed = block({ normBeforeGate: true, scope: 'detailed' });
  assert.equal(tex(detailed, 'dt'), '\\Delta = \\mathrm{softplus}(dt + b_{dt})');
  assert.equal(tex(detailed, 'a'), 'A = -e^{A_{\\log}}');
  assert.equal(tex(detailed, 'scan'), 'h_t = e^{\\Delta_t A} h_{t-1} + \\Delta_t B_t x_t');
  assert.equal(tex(detailed, 'readout'), 'y_t = C_t h_t + D\\, x_t', 'D skip adds x back at the readout');
  assert.doesNotMatch(plain(detailed), /Omitted: dt/);
  const record = coverageOf({ scope: 'main-path', rmsnorm: true, normBeforeGate: false });
  for (const status of Object.values(record)) assert.ok(['shown', 'simplified', 'omitted', 'unestablished'].includes(status));
  assert.equal(record['outer residual and pre-norm (wrapping Block)'], 'unestablished');
  assert.deepEqual(detailed.diagnostics, []);
});

test('side boxes never overlap each other or the main column', () => {
  for (const params of [{ normBeforeGate: true, scope: 'detailed' }, { normBeforeGate: false, rmsnorm: false, scope: 'detailed' }, { normBeforeGate: false }]) {
    const list = boxes(block(params));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [p, q] = [list[i], list[j]];
        const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
        assert.ok(apart, `${JSON.stringify(params)}: boxes ${i} and ${j} overlap`);
      }
    }
  }
});

test('unsupported variants are refused rather than drawn as Mamba-2', () => {
  assert.throws(() => block({ normBeforeGate: false, variant: 'mamba1' }), /must be one of mamba2/);
  assert.throws(() => block({ normBeforeGate: false, scope: 'everything' }), /must be one of main-path, detailed/);
});

test('the bundled example compiles cleanly', () => {
  assert.deepEqual(compileVisual(EXAMPLES['mamba2-main-path']).diagnostics, []);
});
