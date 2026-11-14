import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { evalScalar, scalarInterval, scalarExprProblem, scenePlanJsonSchema, designRevisionJsonSchema } from './interact-plan.js';
import { parseFormula, exprToJs, evalQuantity, parseQuantity } from './interact-formula.js';

const scope = { names: ['x', 'k', 'x0', 'xMarker', 'other'] };
const near = (got, want, eps = 1e-12) => assert.ok(Math.abs(got - want) <= eps * Math.max(1, Math.abs(want)), got + ' vs ' + want);
const cases = [
  { fn: 'exp', text: 'exp(x)', values: { x: 1 }, want: Math.E, domains: { x: [0, 1] }, bounds: [1, Math.E] },
  { fn: 'log', text: 'log(x)', values: { x: Math.E }, want: 1, domains: { x: [1, Math.E] }, bounds: [0, 1] },
  { fn: 'sqrt', text: 'sqrt(x)', values: { x: 9 }, want: 3, domains: { x: [0, 9] }, bounds: [0, 3] },
  { fn: 'abs', text: 'abs(x)', values: { x: -3 }, want: 3, domains: { x: [-4, 3] }, bounds: [0, 4] },
  { fn: 'min', text: 'min(x, other)', values: { x: 3, other: 2 }, want: 2, domains: { x: [-1, 3], other: [1, 2] }, bounds: [-1, 2] },
  { fn: 'max', text: 'max(x, other)', values: { x: 3, other: 2 }, want: 3, domains: { x: [-1, 3], other: [1, 2] }, bounds: [1, 3] },
];
for (const c of cases) {
  test(c.fn + ': parses, evaluates and emits equivalent whitelisted JavaScript', () => {
    const expr = parseFormula(c.text, scope);
    assert.equal(scalarExprProblem(expr), null);
    assert.equal(expr.op, c.fn);
    near(evalScalar(expr, c.values), c.want);
    const js = exprToJs(expr, scope.names);
    assert.ok(js.includes('Math.' + c.fn + '('));
    near(runInNewContext(js, c.values), c.want);
  });
  test(c.fn + ': interval encloses the complete argument domain', () => {
    const expr = parseFormula(c.text, scope), span = scalarInterval(expr, c.domains);
    span.forEach((v, i) => near(v, c.bounds[i]));
    for (let i = 0; i <= 100; i++) for (let j = 0; j <= (c.domains.other ? 10 : 0); j++) {
      const values = { x: c.domains.x[0] + (c.domains.x[1] - c.domains.x[0]) * i / 100 };
      if (c.domains.other) values.other = c.domains.other[0] + (c.domains.other[1] - c.domains.other[0]) * j / 10;
      const value = evalScalar(expr, values, c.domains);
      assert.ok(value >= span[0] - 1e-14 && value <= span[1] + 1e-14, c.text + ': ' + value + ' outside ' + span);
    }
  });
  test(c.fn + ': Gemini-style flat string survives JSON, ScalarExpr and JS round trips', () => {
    // A provider's flat formula record; no briefSchema fork or replacement.
    const record = JSON.parse(JSON.stringify({ formula: c.text, switchAt: null, formulaAfter: null }));
    assert.equal(typeof record.formula, 'string');
    const tree = parseFormula(record.formula, scope), restored = JSON.parse(JSON.stringify(tree));
    assert.deepEqual(restored, tree);
    near(evalScalar(restored, c.values), c.want);
    near(runInNewContext(exprToJs(restored, scope.names), c.values), c.want);
  });
}
test('function calls keep precedence, fixed literals and nested arguments', () => {
  near(evalScalar(parseFormula('-sqrt(9)^2 + max(1, min(4, 2 * 3))')), -5);
  near(evalScalar(parseFormula('log(exp(x))', scope), { x: 2 }), 2);
  near(evalScalar(parseFormula('sqrt(abs(x))', scope), { x: -9 }), 3);
  near(evalScalar(parseFormula('exp(fixed)', { fixed: { fixed: 0 } })), 1);
  near(evalScalar(parseFormula('exp + 1', { names: ['exp'] }), { exp: 2 }), 3);
});
test('arity is exact and arbitrary functions/property calls remain forbidden', () => {
  for (const text of ['exp()', 'log(1, 2)', 'sqrt(1, 2)', 'abs(1, 2)', 'min(1)', 'max(1, 2, 3)']) {
    assert.throws(() => parseFormula(text), e => e.code === 'formula_arity' && Number.isInteger(e.position), text);
  }
  for (const text of ['exp(1,)', 'min(,1)', 'max(1 2)', 'log(1', 'Math.exp(1)', 'sin(1)', 'constructor(1)', 'exp(x);']) {
    assert.throws(() => parseFormula(text, scope), e => /^formula_/.test(e.code), text);
  }
  assert.throws(() => parseFormula('log(unknown)'), e => e.code === 'formula_name' && e.token === 'unknown');
  assert.throws(() => exprToJs(parseFormula('sqrt(x)', scope), []), e => e.code === 'unknown_input');
});
test('function ScalarExpr nodes remain strict data with bounded arity', () => {
  const literal = { op: 'literal', value: 1 };
  for (const expr of [
    { op: 'exp', arg: literal, right: literal }, { op: 'log', args: [literal] },
    { op: 'sqrt', arg: 'code' }, { op: 'abs', arg: literal, fn: 'anything' },
    { op: 'min', left: literal }, { op: 'max', left: literal, right: literal, arg: literal },
    { op: 'call', fn: 'exp', args: [literal] },
  ]) {
    assert.ok(scalarExprProblem(expr));
    assert.throws(() => evalScalar(expr), e => e.code === 'unsafe_expression');
    assert.throws(() => exprToJs(expr), e => e.code === 'unsafe_expression');
  }
});
test('32-node and 8-level limits count every function and expanded power', () => {
  const balanced = n => n ? 'min(' + balanced(n - 1) + ',' + balanced(n - 1) + ')' : '1';
  assert.equal(scalarExprProblem(parseFormula('abs(' + balanced(4) + ')')), null, '31 min/literal nodes plus abs = 32');
  assert.throws(() => parseFormula('abs(abs(' + balanced(4) + '))'), e => e.code === 'unsafe_expression' && /33 nodes/.test(e.message));
  assert.equal(scalarExprProblem(parseFormula('abs('.repeat(7) + '1' + ')'.repeat(7))), null);
  assert.throws(() => parseFormula('abs('.repeat(8) + '1' + ')'.repeat(8)), e => e.code === 'unsafe_expression' && /9 levels/.test(e.message));
  assert.throws(() => parseFormula('exp(x + k + x0 + 1)^4', scope), e => e.code === 'unsafe_expression' && /nodes/.test(e.message));
});
test('log/sqrt refuse domains containing invalid arguments, including nested calls', () => {
  for (const [text, values] of [['log(x)', { x: 0 }], ['log(x)', { x: -1 }], ['sqrt(x)', { x: -1 }]]) {
    assert.throws(() => evalScalar(parseFormula(text, scope), values), e => e.code === 'out_of_domain', text);
  }
  for (const [text, domains] of [
    ['log(x)', { x: [-1, 2] }], ['log(x)', { x: [0, 2] }],
    ['sqrt(x)', { x: [-1, 9] }], ['log(abs(x))', { x: [-1, 1] }],
    ['min(log(x), 0)', { x: [-1, 2] }],
  ]) assert.throws(() => scalarInterval(parseFormula(text, scope), domains), e => e.code === 'out_of_domain', text);
  assert.deepEqual(scalarInterval(parseFormula('sqrt(abs(x))', scope), { x: [-4, 9] }), [0, 3]);
  assert.throws(() => scalarInterval(parseFormula('sqrt(x)', scope), {}), e => e.code === 'unknown_input');
});
test('exp refuses point/interval overflow and does not assume underflow is positive', () => {
  const expr = parseFormula('exp(x)', scope);
  assert.throws(() => evalScalar(expr, { x: 710 }), e => e.code === 'non_finite');
  assert.throws(() => scalarInterval(expr, { x: [0, 710] }), e => e.code === 'non_finite');
  assert.deepEqual(scalarInterval(expr, { x: [-1000, -1000] }), [0, 0]);
  assert.throws(() => scalarInterval(parseFormula('1 / exp(x)', scope), { x: [-1000, -1000] }), e => e.code === 'division_by_zero');
});
test('abs covers negative, positive and zero-crossing intervals without negative zero', () => {
  const expr = parseFormula('abs(x)', scope);
  for (const [domain, want] of [[[-4, -1], [1, 4]], [[1, 4], [1, 4]], [[-4, 3], [0, 4]], [[-4, 0], [0, 4]], [[0, 0], [0, 0]]]) {
    assert.deepEqual(scalarInterval(expr, { x: domain }), want);
  }
  assert.throws(() => scalarInterval(parseFormula('1 / abs(x)', scope), { x: [-1, 1] }), e => e.code === 'division_by_zero');
});
test('min/max interval bounds stay sound with correlated repeated inputs', () => {
  assert.deepEqual(scalarInterval(parseFormula('min(x, -x)', scope), { x: [-2, 3] }), [-3, 2]);
  assert.deepEqual(scalarInterval(parseFormula('max(x, -x)', scope), { x: [-2, 3] }), [-2, 3]);
  const expr = parseFormula('max(log(exp(x)), sqrt(abs(x)))', scope), bounds = scalarInterval(expr, { x: [-3, 3] });
  for (let i = 0; i <= 100; i++) {
    const value = evalScalar(expr, { x: -3 + 6 * i / 100 });
    assert.ok(value >= bounds[0] - 1e-14 && value <= bounds[1] + 1e-14);
  }
});
test('plan/revision provider schemas publish the same exact function node shapes', () => {
  const def = scenePlanJsonSchema().$defs.ScalarExpr;
  assert.deepEqual(def, designRevisionJsonSchema().$defs.ScalarExpr);
  const unary = def.oneOf.find(s => s.required.includes('arg'));
  assert.ok(unary);
  assert.deepEqual(unary.properties.op.enum, ['exp', 'log', 'sqrt', 'abs']);
  assert.equal(unary.additionalProperties, false);
  const binary = def.oneOf.find(s => s.required.includes('left'));
  assert.deepEqual(binary.properties.op.enum, ['add', 'subtract', 'multiply', 'divide', 'min', 'max']);
});
test('piecewise quantities call functions while switchAt still cannot read t', () => {
  const q = { id: 'q', formula: 'sqrt(abs(t))', switchAt: 'max(1, k)', formulaAfter: 'log(t)' };
  near(evalQuantity(q, { k: 1 }, 0.25), 0.5);
  near(evalQuantity(q, { k: 1 }, 1), 0);
  near(evalQuantity(q, { k: 1 }, 2), Math.LN2);
  assert.throws(() => parseQuantity({ ...q, switchAt: 'sqrt(t)' }, { names: ['k'] }), e => e.code === 'formula_name' && /switchAt.*not t/.test(e.message));
});
test('logistic strings fit existing limits and enclose the full reference domain', () => {
  const formulas = JSON.parse(JSON.stringify({
    y: '1 / (1 + exp(-k * (x - x0)))',
    slope: 'k / (exp(k * (x - x0)) + 2 + exp(-k * (x - x0)))',
    yAtMarker: '1 / (1 + exp(-k * (xMarker - x0)))',
  }));
  const domains = { x: [-6, 6], k: [0.5, 3], x0: [-2, 2], xMarker: [-6, 6] };
  for (const text of Object.values(formulas)) {
    const expr = parseFormula(text, scope), interval = scalarInterval(expr, domains), js = exprToJs(expr, scope.names);
    for (const k of [0.5, 1, 3]) for (const x0 of [-2, 0, 2]) for (const x of [-6, -1, 0, 1, 6]) {
      const values = { x, xMarker: x, k, x0 }, actual = evalScalar(expr, values);
      assert.ok(actual >= interval[0] - 1e-14 && actual <= interval[1] + 1e-14);
      near(runInNewContext(js, values), actual);
    }
  }
  const y = parseFormula(formulas.y, scope), derivative = parseFormula(formulas.slope, scope);
  for (const x of [-6, -1, 0, 1, 6]) {
    const values = { x, k: 1, x0: 0 }, h = 1e-5;
    const numeric = (evalScalar(y, { ...values, x: x + h }) - evalScalar(y, { ...values, x: x - h })) / (2 * h);
    near(evalScalar(derivative, values), numeric, 1e-9);
  }
});
