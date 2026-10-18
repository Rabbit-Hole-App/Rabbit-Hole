import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEquationResult as validate, previewEquationReplacement as replace } from './inline-equation-result.js';

test('current KaTeX renders bounded fractions, roots, matrices and notation', () => {
  for (const latex of [String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`, String.raw`\begin{bmatrix}a&b\\c&d\end{bmatrix}`, String.raw`\sum_{i=1}^n x_i`, String.raw`\frac{d}{dx}f(x)`]) assert.equal(validate({ latex }).ok, true);
});
test('invalid structure, prose fields and bounds are rejected', () => {
  for (const input of [null, [], {}, { latex: '' }, { latex: 'x'.repeat(4001) }, { latex: 'x', html: '<b>x</b>' }, { latex: 'x', assumptions: ['x'.repeat(241)] }, { latex: 'x', label: 'x'.repeat(121) }]) assert.equal(validate(input).ok, false);
});
test('malformed, unsupported and runaway macro LaTeX fail validation', () => {
  for (const latex of [String.raw`\frac{a}{`, String.raw`\unknownCommand{x}`, String.raw`\def\loop{\loop}\loop`]) assert.equal(validate({ latex }).ok, false);
});
test('HTML, URLs and external resources fail even through macro expansion', () => {
  for (const latex of [String.raw`\href{https://example.com}{x}`, String.raw`\includegraphics{https://example.com/a.png}`, String.raw`\htmlClass{evil}{x}`, String.raw`\def\link{\href{https://example.com}{x}}\link`]) assert.equal(validate({ latex }).ok, false);
});
test('clarification reuses the existing session shape and excludes premature equations', () => {
  assert.deepEqual(validate({ clarify: { question: 'Which variable?' } }).result, { kind: 'clarify', question: 'Which variable?' });
  assert.equal(validate({ latex: 'x', clarify: { question: 'Which?' } }).ok, false);
});
test('assumptions stay outside editable LaTeX and are bounded', () => {
  const result = validate({ latex: ' x=1 ', label: ' Example ', assumptions: ['Assuming unit scale.'] });
  assert.equal(result.result.latex, 'x=1'); assert.deepEqual(result.result.assumptions, ['Assuming unit scale.']);
});
test('replacement retains identity, position and styling without mutating originals', () => {
  const item = { id: 'eq', kind: 'equation', x: 10, y: 20, latex: 'x', size: 24, color: '#000000' };
  const result = replace(validate({ latex: 'x+1' }).result, { item, frozen: structuredClone(item) });
  assert.deepEqual(result.changes[0].after, { ...item, latex: 'x+1' }); assert.equal(item.latex, 'x');
});
test('stale, locked, read-only and invalid manual replacements fail closed', () => {
  const item = { id: 'eq', kind: 'equation', x: 1, y: 2, latex: 'x' }, result = validate({ latex: 'y' }).result;
  for (const options of [{ item, frozen: { ...item, x: 9 } }, { item, frozen: item, readOnly: true }, { item: { ...item, locked: true }, frozen: item }, { item, frozen: null }]) assert.equal(replace(result, options).ok, false);
  assert.equal(replace({ kind: 'equation', latex: String.raw`\badCommand` }, { item, frozen: item }).ok, false);
});
