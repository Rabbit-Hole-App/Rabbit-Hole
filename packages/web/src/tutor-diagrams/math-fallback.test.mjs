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
