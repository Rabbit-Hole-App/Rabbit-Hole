import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScene } from '../animation-scene.js';
import { compileVisual } from './compile.js';
import { EXAMPLES } from './examples/index.js';

const steps = params => compileVisual({
  version: 1, id: 's', title: 'S', presentation: { mode: 'static' },
  components: [{ id: 'a', component: 'attention-steps', version: 1, params }],
});
const tex = (compiled, id) => compiled.scene.objects.find(object => object.id === `a.${id}`)?.initialState.runs?.[0]?.tex;
const column = (compiled, c) => compiled.scene.objects.filter(object => new RegExp(`^a\\.c${c}r\\d+$`).test(object.id)).map(object => object.initialState.runs[0].tex);

test('notation follows scaled dot-product attention (Vaswani et al. 2017, 3.2.1) for one query', () => {
  const compiled = steps({ query: 2, rows: 3, symbolicLast: true });
  assert.equal(tex(compiled, 'proj0'), 'q_{2} = x_{2} W^{Q}');
  assert.equal(tex(compiled, 'proj1'), 'k_j = x_j W^{K}');
  assert.equal(tex(compiled, 'proj2'), 'v_j = x_j W^{V}');
  assert.equal(tex(compiled, 'proj3'), 'Z_{2} = \\sum_{t=1}^{T} e^{s_{2,t}}', 'softmax normaliser over every key position');
  assert.deepEqual(column(compiled, 0), ['1', '2', 'T'].map(j => `s_{2,${j}} = \\frac{q_{2} \\cdot k_{${j}}}{\\sqrt{d_k}}`), 'scores scaled by sqrt(d_k)');
  assert.deepEqual(column(compiled, 1), ['1', '2', 'T'].map(j => `\\alpha_{2,${j}} = \\frac{e^{s_{2,${j}}}}{Z_{2}}`));
  assert.deepEqual(column(compiled, 2), ['1', '2', 'T'].map(j => `\\alpha_{2,${j}}\\, v_{${j}}`));
  assert.equal(tex(compiled, 'output'), 'o_{2} = \\sum_{j=1}^{T} \\alpha_{2,j}\\, v_j');
  assert.ok(compiled.scene.objects.some(object => object.id === 'a.gap0' && object.initialState.runs[0].tex === '\\vdots'));
  assert.match(compiled.scene.objects.find(object => object.id === 'a.note').initialState.text, /not a computed number/);
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(validateScene(structuredClone(compiled.scene)));
});

test('changing the query or the rows keeps indices, projections and output consistent', () => {
  for (const params of [{ query: 1, rows: 2, symbolicLast: false }, { query: 3, rows: 4, symbolicLast: false }, { query: 7, rows: 4, symbolicLast: true }, { query: 2, rows: 2, symbolicLast: true }]) {
    const compiled = steps(params);
    const i = params.query;
    const keys = params.symbolicLast ? [...Array.from({ length: params.rows - 1 }, (_, n) => String(n + 1)), 'T'] : Array.from({ length: params.rows }, (_, n) => String(n + 1));
    const bound = params.symbolicLast ? 'T' : String(params.rows);
    assert.equal(column(compiled, 0).length, params.rows);
    column(compiled, 0).forEach((value, n) => assert.equal(value, `s_{${i},${keys[n]}} = \\frac{q_{${i}} \\cdot k_{${keys[n]}}}{\\sqrt{d_k}}`));
    assert.equal(tex(compiled, 'proj0'), `q_{${i}} = x_{${i}} W^{Q}`);
    assert.equal(tex(compiled, 'proj3'), `Z_{${i}} = \\sum_{t=1}^{${bound}} e^{s_{${i},t}}`);
    assert.equal(tex(compiled, 'output'), `o_{${i}} = \\sum_{j=1}^{${bound}} \\alpha_{${i},j}\\, v_j`);
    assert.equal(compiled.scene.objects.some(object => object.id === 'a.gap0'), params.symbolicLast);
    assert.equal(compiled.scene.objects.filter(object => /^a\.sum\d$/.test(object.id)).length, params.rows);
    assert.deepEqual(compiled.diagnostics, [], JSON.stringify(params));
    assert.ok(compiled.scene.width <= 1120);
  }
});

test('impossible layouts are refused', () => {
  assert.throws(() => steps({ query: 5, rows: 3, symbolicLast: false }), /query 5 is outside the 3 positions shown/);
  assert.throws(() => steps({ query: 2, rows: 5 }), /at most 4/);
  assert.throws(() => steps({ query: 2, rows: 1 }), /at least 2/);
  assert.throws(() => steps({ rows: 3 }), /"query" is required/);
});

test('the bundled example compiles cleanly', () => {
  assert.deepEqual(compileVisual(EXAMPLES['attention-steps-q2']).diagnostics, []);
});
