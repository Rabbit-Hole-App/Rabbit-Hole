import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleFormula } from './formula-sampler.js';

const domain = { xMin: -2, xMax: 2, samples: 5 };
const values = formula => sampleFormula({ formula, ...domain }).map(({ y }) => y);

test('samples an expression on a uniform grid including both endpoints', () => {
  assert.deepEqual(sampleFormula({ formula: 'x^2 − 2*x + .5', ...domain }), [
    { x: -2, y: 8.5 }, { x: -1, y: 3.5 }, { x: 0, y: 0.5 },
    { x: 1, y: -0.5 }, { x: 2, y: 0.5 },
  ]);
  assert.deepEqual(sampleFormula({ formula: 'x', xMin: -0.1, xMax: 0.2, samples: 2 }), [
    { x: -0.1, y: -0.1 }, { x: 0.2, y: 0.2 },
  ]);
  assert.equal(sampleFormula({ formula: 'x', ...domain, samples: 24 }).length, 24);
});

test('uses right-associative powers and puts powers before unary signs', () => {
  for (const [formula, expected] of [
    ['2^3^2', 512], ['-2^2', -4], ['(-2)^2', 4], ['2^−2^2', 0.0625],
    ['+2^+2', 4], ['8/4/2', 1], ['8-4-2', 2], ['2+3*4', 14],
  ]) {
    assert.equal(values(formula)[0], expected, formula);
  }
});

test('evaluates allowlisted functions, nested arguments, and decimal exponents', () => {
  assert.deepEqual(values('max(-1, min(1, x, x+1), -3)'), [-1, -1, 0, 1, 1]);
  assert.deepEqual(values('sqrt(abs(x))'), [Math.SQRT2, 1, 0, 1, Math.SQRT2]);
  assert.deepEqual(values('log(exp(1)) + 2E+0 + 5e−1 + 1.'), [4.5, 4.5, 4.5, 4.5, 4.5]);
  assert.equal(values('log2(8)')[0], 3);
  assert.equal(values('min(8, 7, 6, 5, 4, 3, 2, 1)')[0], 1);
  for (const [formula, expected] of [
    ['exp(1)', 2.718281828459045], ['log(2)', 0.6931471805599453],
    ['sin(1)', 0.8414709848078965], ['cos(1)', 0.5403023058681398], ['tanh(1)', 0.7615941559557649],
  ]) {
    assert.ok(Math.abs(values(formula)[0] - expected) < 1e-12, formula);
  }
});

test('rejects malformed expressions and arguments outside the supported arities', () => {
  for (const formula of [
    '', ' ', 'x+', 'x^', 'x)', '(x', '2x', '1.2.3', '2**3', '2//3', '1e+',
    '(x, 1)', 'sin()', 'sin(x, 1)', 'sin', 'log2(x, 1)', 'min(x)', 'max(x,)',
    'max(1, 2, 3, 4, 5, 6, 7, 8, 9)',
  ]) {
    assert.throws(() => values(formula), SyntaxError, formula);
  }
  assert.throws(() => values(null), TypeError);
});

test('rejects unknown identifiers, JavaScript syntax, and property access', () => {
  for (const formula of [
    'y', 'random()', 'constructor(x)', 'toString(x)', '__proto__(x)', 'Math.sin(x)',
    'x["constructor"]', 'x.constructor.constructor("return 1")()', 'x; 1', 'x = 1',
  ]) {
    assert.throws(() => values(formula), SyntaxError, formula);
  }
});

test('rejects excessive source length, token count, and recursive nesting', () => {
  for (const formula of [
    `${' '.repeat(256)}x`, `${'1+'.repeat(64)}1`,
    `${'('.repeat(33)}x${')'.repeat(33)}`, `${'-'.repeat(33)}x`, `${'1^'.repeat(33)}1`,
  ]) {
    assert.throws(() => values(formula), RangeError);
  }
  assert.equal(values(`+${'1+'.repeat(63)}1`)[0], 64);
});

test('rejects nonfinite results at any sample and in intermediate operations', () => {
  for (const formula of [
    '1/x', 'sqrt(-1)', '(-2)^.5', '1e309', '1/(1/0)',
    'min(1, exp(1000))', 'max(1, log(0))', '(1e308*2)^0',
  ]) {
    assert.throws(() => values(formula), RangeError, formula);
  }
  assert.deepEqual(values('1e100/1e100'), [1, 1, 1, 1, 1]);
});

test('rejects invalid sample counts and x domains', () => {
  for (const samples of [undefined, 1, 25, 2.5, '2', NaN, Infinity]) {
    assert.throws(() => sampleFormula({ formula: 'x', ...domain, samples }), RangeError);
  }
  for (const [xMin, xMax] of [
    [2, 2], [2, -2], [-1e9 - 1, 0], [0, 1e9 + 1], [-Infinity, 0], [0, NaN], ['0', 1],
  ]) {
    assert.throws(() => sampleFormula({ formula: 'x', xMin, xMax, samples: 2 }), RangeError);
  }
  assert.deepEqual(sampleFormula({ formula: 'x', xMin: -1e9, xMax: 1e9, samples: 2 }), [
    { x: -1e9, y: -1e9 }, { x: 1e9, y: 1e9 },
  ]);
});

test('applies inclusive y bounds to every sample within the coordinate schema', () => {
  assert.throws(() => values('1e9+1'), RangeError);
  assert.throws(() => values('-1e9-1'), RangeError);
  const input = { formula: '1-x^2', xMin: -1, xMax: 1, samples: 3 };
  assert.deepEqual(sampleFormula(input, { yMin: 0, yMax: 1 }), [
    { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 },
  ]);
  assert.throws(() => sampleFormula(input, { yMax: 0.75 }), RangeError);
  assert.throws(() => sampleFormula(input, { yMin: 0.25 }), RangeError);
  for (const [yMin, yMax] of [[1, 1], [2, 1], [-1e9 - 1, 1], [0, 1e9 + 1], [0, Infinity]]) {
    assert.throws(() => sampleFormula(input, { yMin, yMax }), RangeError);
  }
});
