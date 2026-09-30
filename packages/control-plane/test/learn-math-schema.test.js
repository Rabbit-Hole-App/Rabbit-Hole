import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMathAnimation, safeExpression, safeTex } from '../src/learn-math-schema.js';

const spec = steps => ({ op: 'generate_math_animation', id: 'sigmoid', concept: 'Sigmoid', purpose: 'derivation', scene: { steps } });

test('a four kind animation passes and defaults its quality', () => {
  const animation = validateMathAnimation(spec([
    { kind: 'equation', expressions: ['\\sigma(x) = \\frac{1}{1 + e^{-x}}'], highlight: ['\\sigma(x)'], note: 'the definition' },
    { kind: 'plot', functions: [{ expression: '1 / (1 + exp(-x))', label: '\\sigma(x)' }], xRange: [-6, 6], marker: { from: -6, to: 6, tangent: true } },
    { kind: 'shapes', objects: [{ id: 'a', type: 'arrow', at: [0, 0], to: [2, 1] }], moves: [{ target: 'a', to: [1, 1] }] },
    { kind: 'matrix', rows: [['1', '0'], ['0', '1']], emphasise: { column: 1 } },
  ]));
  assert.equal(animation.quality, 'low');
  assert.equal(animation.scene.steps.length, 4);
});

test('LaTeX that reaches outside maths is refused', () => {
  for (const fragment of ['\\input{/etc/passwd}', '\\write18{id}', '\\def\\x{1}', '\\usepackage{tikz}', 'x $ y', '50% off', '\\csname x\\endcsname', 'sigma(x) = \frac{1}{2}', 'a\u0007b']) {
    assert.throws(() => safeTex(fragment, 'e'), /unsupported/, `accepted ${fragment}`);
  }
  assert.equal(safeTex('\\frac{\\partial y}{\\partial x} \\leq \\infty', 'e').length > 0, true);
});

test('plot expressions that are programs are refused, arithmetic passes', () => {
  for (const expression of ['__import__("os")', 'open("/etc/passwd")', 'x.__class__', 'len(x)', 'globals()', 'eval("1")', 'x;import os']) {
    assert.throws(() => safeExpression(expression, 'e'), /unsupported|unknown/, `accepted ${expression}`);
  }
  for (const expression of ['1 / (1 + exp(-x))', 'sin(x) * x^2', 'sqrt(abs(x)) + pi', '-x / 2']) {
    assert.equal(safeExpression(expression, 'e'), expression);
  }
});

test('a step cannot carry another kind fields, and each needs its own content', () => {
  assert.throws(() => validateMathAnimation(spec([{ kind: 'equation', expressions: ['x'], functions: [{ expression: 'x' }] }])), /do not belong/);
  assert.throws(() => validateMathAnimation(spec([{ kind: 'equation', note: 'nothing' }])), /needs expressions/);
});

test('ranges, markers, references and shapes are checked', () => {
  assert.throws(() => validateMathAnimation(spec([{ kind: 'plot', functions: [{ expression: 'x' }], xRange: [5, -5] }])), /must increase/);
  assert.throws(() => validateMathAnimation(spec([{ kind: 'plot', functions: [{ expression: 'x' }], xRange: [0, 1], marker: { from: 0, to: 9 } }])), /leaves the plotted range/);
  assert.throws(() => validateMathAnimation(spec([{ kind: 'shapes', objects: [{ id: 'a', type: 'arrow', at: [0, 0] }] }])), /needs an end point/);
  assert.throws(() => validateMathAnimation(spec([{ kind: 'shapes', objects: [{ id: 'a', type: 'dot', at: [0, 0] }], moves: [{ target: 'b', to: [1, 1] }] }])), /no object with that id/);
  assert.throws(() => validateMathAnimation(spec([{ kind: 'matrix', rows: [['1', '2'], ['3']] }])), /same number of entries/);
});

test('a runaway animation and unknown operations are refused', () => {
  assert.throws(() => validateMathAnimation(spec(Array.from({ length: 8 }, () => ({ kind: 'equation', expressions: ['x'], hold: 6 })))), /the limit is 45s/);
  assert.throws(() => validateMathAnimation({ ...spec([{ kind: 'equation', expressions: ['x'] }]), op: 'run_python' }), /generate_math_animation/);
});
