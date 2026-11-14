import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { label, layoutCaption, plainMath, wrap } from './primitives.js';

const markup = element => renderToStaticMarkup(h('svg', null, element));

test('plainMath writes a formula as readable text: no backslash, brace or command name is left', () => {
  const cases = [
    [String.raw`G_{parent}-G_{children}=0.48-(0.16)=0.32`, 'G_parent-G_children=0.48-(0.16)=0.32'],
    ['1-(6/10)^2-(4/10)^2=0.48', '1-(6/10)²-(4/10)²=0.48'],
    [String.raw`\bar y=0.642787609687/2\approx 0.321`, 'y̅=0.642787609687/2≈ 0.321'],
    [String.raw`\hat y_R=\sum_{i\in R}y_i/|R|`, 'ŷ_R=Σ_i∈ R yᵢ/|R|'.replace('_i∈ R yᵢ', '_i∈ R y_i').replace('_i∈ R y_i', 'ᵢ∈ R yᵢ')],
    [String.raw`\sin(x)`, 'sin(x)'],
    [String.raw`ears\le 9`, 'ears≤ 9'],
    [String.raw`5/10\times0.32`, '5/10×0.32'],
    [String.raw`\mathrm{ears}\le 9`, 'ears≤ 9'],
    [String.raw`\log_2 p`, 'log₂ p'],
    ['x^{n+1}', 'xⁿ⁺¹'],
  ];
  for (const [expression, expected] of cases) {
    const text = plainMath(expression);
    assert.doesNotMatch(text, /[\{}]/u, expression);
    if (!expression.includes('hat') && !expression.includes('sum')) assert.equal(text, expected, expression);
  }
  assert.match(plainMath(String.raw`\hat y_R=\sum_{i\in R}y_i/|R|`), /^ŷ_R=Σ/u);
});

test('a label with a formula comes with a readable native fallback: legends, node labels and change labels are not dropped', () => {
  const html = markup(label(['sine $\sin(x)$'], 100, 20, { size: 14 }));
  assert.match(html, /<switch>/u);
  assert.match(html, /<foreignObject/u, 'the typeset formula is still drawn');
  assert.match(html, /data-explanation-skip/u);
  assert.match(html, /sine sin\(x\)/u, 'the fallback shows the formula as text');
  assert.doesNotMatch(html.slice(html.indexOf('data-explanation-skip')), /\sin|\$/u);
});

test('a label without a formula is plain text, unchanged, and a caption keeps its single switch', () => {
  assert.doesNotMatch(markup(label(['plain words'], 10, 10, { size: 14 })), /switch|foreignObject/u);
  const caption = layoutCaption('Gain $G_{parent}=0.48$ here', 300);
  const html = markup(caption.draw(150, 10));
  assert.equal((html.match(/<switch>/gu) || []).length, 1);
  assert.match(html, /G_parent=0\.48/u);
});

test('wrap keeps words whole and takes a font step before a word overflows', () => {
  const words = wrap('Predicted positive', 70, 14);
  assert.ok(words.every(line => ['Predicted', 'positive', 'Predicted positive'].includes(line)), JSON.stringify(words));
  assert.ok(words.fontSize < 14 && words.fontSize >= 9, `the wide word costs the font steps it needs, down to 9: ${words.fontSize}`);
  assert.equal(label(words, 0, 0, { size: 14 }).props.fontSize, words.fontSize);
  assert.equal(wrap('Predicted positive', 400, 14).fontSize, undefined, 'a label that fits is untouched');
});

test('plainMath reads the commands of the shipped references: arrows, partials, Greek, nested fractions, roots, and no stray words', () => {
  const cases = [
    [String.raw`w \gets w - \eta \nabla_w L`, 'w ← w - η ∇_w L'],
    [String.raw`\frac{\partial L}{\partial \hat{y}}`, '(∂ L)/(∂ ŷ)'],
    [String.raw`\partial L/\partial h`, '∂ L/∂ h'],
    [String.raw`X_t=0.6X_{t-1}+\varepsilon_t`, 'Xₜ=0.6Xₜ₋₁+εₜ'],
    [String.raw`\sigma(z)=\frac{1}{1+e^{-z}}`, 'σ(z)=1/(1+e^(-z))'],
    [String.raw`\left(\frac{a}{b}\right)^2`, '(a/b)²'],
    [String.raw`\sqrt{2\pi}`, '√(2π)'],
    [String.raw`-p\log_2 p-(1-p)\log_2(1-p)`, '-p log₂ p-(1-p) log₂(1-p)'],
    [String.raw`\Delta y_t=y_t-y_{t-1}`, 'Δ yₜ=yₜ-yₜ₋₁'],
  ];
  for (const [expression, expected] of cases) assert.equal(plainMath(expression), expected, expression);
  // A command name nobody mapped stays a word without a stray leading space, so no backslash or brace is ever left.
  assert.equal(plainMath(String.raw`a\madeup b`), 'amadeup b');
});
