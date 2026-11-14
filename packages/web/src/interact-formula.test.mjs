import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LIMITS, ScalarExprError, evalScalar, planProblems, scalarExprProblem } from './interact-plan.js';
import { TEMPLATE_ROLES, evalQuantity, exprToJs, formulaScope, parseFormula, parseQuantity } from './interact-formula.js';

// Formula strings (owner brief 2026-11-13 15:35): our own parser to the existing ScalarExpr, no eval; piecewise on the quantity; exprToJs for the generator.
const names = ['launchSpeed', 'gravity'];
const at = (text, values = {}, opts = { names }) => evalScalar(parseFormula(text, opts), { t: 0, launchSpeed: 4, gravity: 9.8, ...values });
const throws = (text, code, match, opts = { names }) => assert.throws(() => parseFormula(text, opts), error => error instanceof ScalarExprError && error.code === code && match.test(error.message), text);

test('precedence, left association, parentheses and unary minus', () => {
  assert.equal(at('1 + 2 * 3'), 7);
  assert.equal(at('(1 + 2) * 3'), 9);
  assert.equal(at('10 - 4 - 3'), 3, 'subtraction associates to the left');
  assert.equal(at('100 / 5 / 2'), 10, 'division associates to the left');
  assert.equal(at('-launchSpeed'), -4);
  assert.equal(at('2 * -launchSpeed'), -8);
  assert.equal(at('-launchSpeed * 2'), -8);
  assert.equal(at('- - 3'), 3);
  assert.equal(at('0 - -2'), 2);
  assert.equal(at('.5 + 2e-1 + 1.'), 1.7);
  assert.deepEqual(parseFormula('-3'), { op: 'literal', value: -3 }, 'minus on a literal folds');
  assert.deepEqual(parseFormula('-0'), { op: 'literal', value: 0 });
});

test('^ takes a literal whole exponent 2 to 4 and is expanded to multiplies', () => {
  assert.equal(at('t^2', { t: 3 }), 9);
  assert.equal(at('t^3', { t: 2 }), 8);
  assert.equal(at('t^4', { t: 2 }), 16);
  assert.equal(at('-t^2', { t: 3 }), -9, 'unary minus is below ^');
  assert.equal(at('(launchSpeed + 1)^2'), 25);
  assert.equal(at('launchSpeed * t - gravity * t^2 / 2', { t: 0.5 }), 4 * 0.5 - 9.8 * 0.25 / 2);
  assert.equal(scalarExprProblem(parseFormula('t^4')), null);
  for (const bad of ['t^1', 't^5', 't^0', 't^-2', 't^2.5', 't^t', 't^', 't^(2)']) throws(bad, 'formula_exponent', /"\^"/);
  throws('t^2^2', 'formula_exponent', /does not chain/);
});

test('names: t, the inputs and the fixed numbers (a literal); anything else is refused with its position', () => {
  assert.equal(at('gravity', {}, { names: [], fixed: { gravity: 1.62 } }), 1.62);
  assert.deepEqual(parseFormula('gravity', { fixed: { gravity: 1.62 } }), { op: 'literal', value: 1.62 });
  assert.deepEqual(parseFormula('-gravity', { fixed: { gravity: 9.8 } }), { op: 'literal', value: -9.8 });
  throws('launchSpeed + altitude', 'formula_name', /unknown name "altitude" at character 15/);
  throws('gravity', 'formula_name', /unknown name "gravity"/, { names: [] });
  throws('sin(t)', 'formula_name', /unknown name "sin" at character 1/);
  throws('t', 'formula_name', /not t/, { names: [], time: false });
  assert.throws(() => parseFormula('launchSpeed + altitude', { names }), error => error.position === 14 && error.token === 'altitude');
});

test('syntax errors name the token and its position', () => {
  throws('1 +', 'formula_syntax', /ends too soon/);
  throws('1 + * 2', 'formula_syntax', /unexpected "\*" at character 5/);
  throws('(1 + 2', 'formula_syntax', /expected "\)"/);
  throws('1 2', 'formula_syntax', /unexpected "2" at character 3/);
  throws('1 + 2)', 'formula_syntax', /unexpected "\)" at character 6/);
  throws('2 $ 3', 'formula_syntax', /unexpected "\$" at character 3/);
  throws('1 > 2', 'formula_syntax', /unexpected ">"/);
  throws('a = 1', 'formula_syntax', /unexpected "="/, { names: ['a'] });
  throws('+1', 'formula_syntax', /unexpected "\+"/);
  throws('', 'formula_syntax', /not empty/);
  throws('   ', 'formula_syntax', /not empty/);
  throws('2t', 'formula_syntax', /unexpected "t"/);
});

test('size limits: 200 characters, 32 nodes, 8 levels, each with the count in the message', () => {
  assert.equal(PLAN_LIMITS.formula, 200);
  throws(`1${' + 1'.repeat(60)}`, 'formula_too_long', /at most 200 characters \(this one has 241\)/);
  throws(Array.from({ length: 17 }, (_, i) => `${i + 1} * ${i + 2}`).join(' + '), 'unsafe_expression', /needs \d+ nodes; at most 32/);
  throws('1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9', 'unsafe_expression', /9 levels deep; at most 8/);
  assert.equal(scalarExprProblem(parseFormula('1 + 2 + 3 + 4 + 5 + 6 + 7 + 8')), null, 'eight levels fit');
  throws('(t + 1)^4', 'formula_name', /not t/, { names: [], time: false }); // t unreadable
  throws('(launchSpeed + gravity * t + 1 + 2)^4', 'unsafe_expression', /nodes/); // the expansion repeats the base, so the count is the expanded one
});

test('a literal zero divisor is refused where it is written; a divisor that may be zero is evaluation\'s concern', () => {
  throws('1 / 0', 'division_by_zero', /character 3/);
  throws('launchSpeed / (0)', 'division_by_zero', /character 13/);
  throws('1 / 0.0', 'division_by_zero', /division by zero/);
  assert.throws(() => at('1 / (launchSpeed - launchSpeed)'), error => error.code === 'division_by_zero');
});

test('piecewise: formula while t < switchAt, formulaAfter from switchAt on, the after branch at the boundary', () => {
  const q = { id: 'dropHeight', formula: 'launchSpeed^2 / (2 * gravity)', switchAt: 'launchSpeed / gravity', formulaAfter: 'launchSpeed * t - gravity * t^2 / 2' };
  const inputs = { launchSpeed: 4, gravity: 8 }, boundary = 4 / 8;
  assert.equal(evalQuantity(q, inputs, 0), 1);
  assert.equal(evalQuantity(q, inputs, boundary - 1e-9), 1);
  const near = (got, want, why) => assert.ok(Math.abs(got - want) < 1e-12, `${why ?? ''} ${got} vs ${want}`);
  near(evalQuantity(q, inputs, boundary), 4 * boundary - 8 * boundary * boundary / 2, 'the after branch applies at t == switchAt');
  assert.notEqual(evalQuantity(q, inputs, boundary), 1 + 1e-3, 'and it is the formulaAfter value (1 here, up to rounding)');
  near(evalQuantity(q, inputs, 0.8), 4 * 0.8 - 8 * 0.64 / 2);
  assert.equal(evalQuantity({ id: 'p', formula: '1', switchAt: 'launchSpeed', formulaAfter: '2' }, inputs, 4), 2, 'the after branch really is selected at the boundary');
  assert.equal(evalQuantity({ id: 'p', formula: '1', switchAt: 'launchSpeed', formulaAfter: '2' }, inputs, 3.999), 1);
  assert.deepEqual(Object.keys(parseQuantity(q, { names: ['launchSpeed', 'gravity'] })), ['formula', 'switchAt', 'formulaAfter']);
  assert.equal(parseQuantity({ id: 'x' }, { names: [] }), null);
  // fixed values are literals; a plain quantity with no switchAt ignores t's side of the boundary
  assert.equal(evalQuantity({ id: 'a', formula: '-gravity' }, { launchSpeed: 2 }, 1, {}, { gravity: 1.62 }), -1.62);
  assert.throws(() => evalQuantity({ id: 'a' }, {}, 0), error => error.code === 'no_formula');
});

test('switchAt reads inputs and fixed values only; the pair comes together; a message names the quantity', () => {
  const scope = { names };
  assert.throws(() => parseQuantity({ id: 'q', formula: 't', switchAt: 't / 2', formulaAfter: 't' }, scope), error => error.code === 'formula_name' && /quantity "q" switchAt: .*not t/.test(error.message));
  assert.throws(() => parseQuantity({ id: 'q', formula: 't', switchAt: '1' }, scope), error => error.code === 'formula_pair' && /"q"/.test(error.message));
  assert.throws(() => parseQuantity({ id: 'q', formula: 't', formulaAfter: '1' }, scope), error => error.code === 'formula_pair');
  assert.throws(() => parseQuantity({ id: 'height', formula: 'launchSpeed *' }, scope), error => /^quantity "height" formula: /.test(error.message));
});

test('exprToJs: numeric literals, the whitelisted names, + - * / and parentheses only; the value equals evalScalar on random points', () => {
  const texts = ['launchSpeed * t - gravity * t^2 / 2', 'launchSpeed^2 / (2 * gravity)', '-gravity', '-(launchSpeed - gravity * t) * 1e-3', '(launchSpeed + 1) * (gravity - 2)^3 / 7', '0.1 - -launchSpeed'];
  let seed = 7; const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (const text of texts) {
    const expr = parseFormula(text, { names }), js = exprToJs(expr, ['t', ...names]);
    assert.match(js, /^[0-9a-zA-Z_.()+\-*/ e]+$/, js);
    assert.doesNotMatch(js, /[A-Za-z_]\w*\s*\(/, 'no call syntax');
    const fn = new Function('t', ...names, `return ${js};`);
    for (let k = 0; k < 200; k += 1) {
      const values = { t: random() * 3, launchSpeed: 2 + random() * 3, gravity: 6 + random() * 6 }, want = evalScalar(expr, values), got = fn(values.t, values.launchSpeed, values.gravity);
      assert.ok(Math.abs(got - want) <= 1e-12 * Math.max(1, Math.abs(want)), `${text}: ${got} vs ${want}`);
    }
  }
  assert.equal(exprToJs({ op: 'literal', value: -2 }), '(-2)');
  assert.equal(exprToJs({ op: 'literal', value: 1e-7 }), '1e-7');
  assert.throws(() => exprToJs(parseFormula('t', { names: [] }), ['launchSpeed']), error => error.code === 'unknown_input');
  assert.throws(() => exprToJs({ op: 'call', fn: 'alert' }), error => error.code === 'unsafe_expression');
});

// A minimal valid plan shape is expensive to write here; the plan-level checks run on the three toss fixtures (interact-plan-formulas.test.mjs); this keeps the module's own contract.
test('the template roles table', () => {
  assert.deepEqual(Object.keys(TEMPLATE_ROLES), ['one-body', 'two-lane', 'body-plot']);
  assert.deepEqual(TEMPLATE_ROLES['one-body'].roles, ['height', 'velocity', 'acceleration']);
  assert.deepEqual(TEMPLATE_ROLES['two-lane'], { lanes: 2, roles: ['height', 'velocity', 'acceleration'] });
  assert.deepEqual(TEMPLATE_ROLES['body-plot'].roles, ['height', 'velocity', 'acceleration', 'force', 'plotted']);
  assert.equal(typeof planProblems, 'function');
  assert.deepEqual(formulaScope({ controls: [{ type: 'number', binding: { kind: 'input', id: 'a' } }, { type: 'seek', binding: { kind: 'marker', id: 'm' } }], mode: { fixedValues: { g: 9.8, label: 'x' } } }), { names: ['a'], fixed: { g: 9.8 } });
});
