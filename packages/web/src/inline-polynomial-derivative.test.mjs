import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPolynomialDerivative} from './inline-polynomial-derivative.js';

const check = (source, claim, variable = 'x') => checkPolynomialDerivative({source, claim, variable});

test('proves polynomial derivative equality rather than accepting a plausible answer', () => {
  const correct = check('x^{3}-2x+7', '3x^2-2');
  assert.equal(correct.ok, true);
  assert.equal(correct.equivalent, true);
  assert.equal(correct.derivativeLatex, '3x^{2} - 2');
  const wrong = check('x^{3}-2x+7', '3x^2+2');
  assert.equal(wrong.ok, true);
  assert.equal(wrong.equivalent, false);
});

test('exact rational coefficients, decimal cancellation and algebraic expansion', () => {
  assert.equal(check(String.raw`\frac{x^3}{3}+0.1x^2+0.2x^2`, 'x^2+0.6x').equivalent, true);
  assert.equal(check('(x+1)*(x-1)', '2x').equivalent, true);
  assert.equal(check('x/3', String.raw`\frac{1}{3}`).equivalent, true);
  assert.equal(check('0.1x+0.2x', '0.30000000000000001').equivalent, false);
});

test('handles unary signs and powers with mathematical precedence', () => {
  assert.equal(check('-x^2', '-2x').equivalent, true);
  assert.equal(check('(-x)^2', '2x').equivalent, true);
  assert.equal(check('x^0', '0').equivalent, true);
  assert.equal(check('9', '0').equivalent, true);
  assert.equal(check('t^3', '3t^2', 't').equivalent, true);
});

test('requires braces for multi-digit LaTeX exponents instead of changing their meaning', () => {
  assert.equal(check('x^12', '12x^{11}').ok, false);
  assert.equal(check('x^{12}', '12x^{11}').equivalent, true);
});

test('accepts explicitly supported MathLive notation without rewriting the evidence', () => {
  const source = String.raw`\left(x+1\right)^{2}+\frac{1}{2}\cdot x`;
  const claim = String.raw`2\times x+\frac{5}{2}`;
  const input = Object.freeze({source, claim, variable:'x'});
  const result = checkPolynomialDerivative(input);
  assert.equal(result.equivalent, true);
  assert.deepEqual(result.evidence, {source, claim, variable:'x', method:'exact-rational-polynomial'});
  assert.match(result.limitations.join(' '), /units.*not/i);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('refuses unsupported domains instead of claiming false proof', () => {
  for (const source of ['1/x', 'x/x', 'x^-1', 'x^{1/2}', 'x^2.5', 'x+y', 'sin(x)', String.raw`\sin(x)`, String.raw`\sqrt{x}`, 'f(x)=x^2', 'x=2', 'x^2^3']) {
    assert.equal(check(source, '0').ok, false, source);
  }
});

test('rejects malformed syntax and division by zero in either expression', () => {
  for (const value of ['', ' ', 'x+', 'x**2', '(x}', 'x)', '1/0', String.raw`\frac{x}{0}`, 'x..2', '2 3', '\\leftx']) {
    assert.equal(check(value, '0').ok, false, value);
    assert.equal(check('x', value).ok, false, value);
  }
});

test('bounds input, polynomial degree, nesting and coefficient size', () => {
  for (const source of ['x'.repeat(513), 'x^{33}', '(x^{20})*(x^{20})', '('.repeat(18)+'x'+')'.repeat(18), '9'.repeat(100)+'x', 'x+'.repeat(100)+'x']) {
    assert.equal(check(source, '0').ok, false, source.slice(0,35));
  }
});

test('refuses ambiguous slash followed by implicit multiplication', () => {
  for (const source of ['1/2x', '1/2(x+1)', 'x/2x']) assert.equal(check(source, '0').ok, false, source);
  assert.equal(check('(1/2)x', '0.5').equivalent, true);
  assert.equal(check('1/2*x', '0.5').equivalent, true);
  assert.equal(check(String.raw`\frac{1}{2}x`, '0.5').equivalent, true);
});

test('does not evaluate code, HTML or unknown LaTeX commands', () => {
  for (const source of ['globalThis.pwned=1', 'constructor', '__proto__', '<script>x</script>', String.raw`\href{https://example.com}{x}`, String.raw`\def\x{2}\x`]) {
    assert.equal(check(source, '0').ok, false, source);
  }
  for (const variable of ['', 'xy', '__proto__', 'constructor', 'π', null]) assert.equal(check('x', '1', variable).ok, false);
});

test('validates the complete contract without coercing caller objects', () => {
  for (const input of [null, [], {}, {source:1,claim:'1',variable:'x'}, {source:'x',claim:'1',variable:'x',answer:true}]) {
    assert.equal(checkPolynomialDerivative(input).ok, false);
  }
});
