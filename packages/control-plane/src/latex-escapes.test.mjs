import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJson, restoreLatexEscapes, restoreLatexIn } from './latex-escapes.js';
import { anthropicReply, visualScanner } from './explanation-fast-chain.js';

// The model's JSON text with a LaTeX command written with ONE backslash, as the logistic-regression pack's cards 03 and 05 came back.
const wire = (math, display = false) => `{"body":"Before ${display ? '$$' : '$'}${math}${display ? '$$' : '$'} after."}`;
const read = (math, display) => parseModelJson(wire(math, display)).body;
const same = (math, display) => `Before ${display ? '$$' : '$'}${math}${display ? '$$' : '$'} after.`;

test('the five commands of the rule, and one that does not exist, are restored inside an inline span', () => {
  for (const math of ['p = \\frac{1}{1 + e^{-z}}', 'a \\theta b', 'a \\neq b', 'a \\rho b', 'a \\beta b', 'a \\times b', 'a \\to b', 'a \\fnord b', 'a \\tquark b', 'a \\nplorf b', 'a \\rzzz b', 'a \\bwhat b']) {
    assert.equal(read(math, false), same(math, false), math);
  }
});

test('the same commands are restored inside a display span after a space', () => {
  for (const math of ['p = \\frac{1}{2}', 'a \\theta b', 'a \\neq b', 'a \\rho b', 'a \\beta b', 'a \\nplorf b']) assert.equal(read(math, true), same(math, true), math);
});

test('a command at the very start of an inline span is restored', () => {
  for (const math of ['\\frac{1}{2}', '\\theta', '\\neq', '\\rho', '\\beta', '\\fnord']) assert.equal(read(math, false), same(math, false), math);
});

test('the two cards of release 123 read back exactly', () => {
  assert.equal(parseModelJson('{"body":"resulting in $\\frac{1}{1 + 1} = 0.5$."}').body, 'resulting in $\\frac{1}{1 + 1} = 0.5$.');
  assert.equal(parseModelJson('{"body":"The formula $p = \\frac{1}{1 + e^{-z}}$ ensures"}').body, 'The formula $p = \\frac{1}{1 + e^{-z}}$ ensures');
});

test('a correctly escaped double backslash is untouched', () => {
  assert.equal(parseModelJson('{"body":"$\\\\frac{1}{2}$ and $\\\\theta$ and $\\\\neq$"}').body, '$\\frac{1}{2}$ and $\\theta$ and $\\neq$');
});

test('control characters outside a math span, before a non-letter, or at a real line break are text and stay', () => {
  const text = 'Line one\n\nneq is a word here.\n\ttabbed theta line\r\nrho\u000cfrac outside maths\n$$\nE = mc^2\n$$\nA price of $5 and a tab $\t5 here.';
  assert.equal(restoreLatexEscapes(text), text);
  assert.equal(restoreLatexEscapes('$a\t 1$ and $b\u000c2$'), '$a\t 1$ and $b\u000c2$');
});

test('display maths keeps its real line breaks; a newline after a space and before a letter is a lost backslash', () => {
  assert.equal(restoreLatexEscapes('$$\nx = 1\ny = 2\n$$'), '$$\nx = 1\ny = 2\n$$');
  assert.equal(restoreLatexEscapes('$$a = 1\nb = 2$$'), '$$a = 1\nb = 2$$');
  assert.equal(restoreLatexEscapes('$$a \neq b$$'), '$$a \\neq b$$');
  assert.equal(restoreLatexEscapes('$a = 1\nb$'), '$a = 1\\nb$', 'inline spans restore every newline before a letter: a line break inside one is not text');
});

test('a command the JSON grammar rejects is read with its backslash kept', () => {
  assert.equal(parseModelJson('{"body":"$\\alpha + \\sigma + \\lambda$"}').body, '$\\alpha + \\sigma + \\lambda$');
  assert.throws(() => parseModelJson('{"body":'), SyntaxError);
});

test('restoreLatexIn walks nested objects and arrays and leaves other values alone', () => {
  const value = restoreLatexIn({ title: 'T', n: 3, ok: true, none: null, visuals: [{ caption: '$\u000crac{1}{2}$', nodes: [{ label: 'x $\theta$' }] }] });
  assert.deepEqual(value, { title: 'T', n: 3, ok: true, none: null, visuals: [{ caption: '$\\frac{1}{2}$', nodes: [{ label: 'x $\\theta$' }] }] });
});

test('the fast chain reply and its streamed visual scanner restore the same escapes', () => {
  const content = '{"title":"S","visuals":[{"type":"diagram","caption":"$\\frac{1}{2}$"}],"body":"p = $\\frac{1}{1+e^{-z}}$ and $\\theta$"}';
  const reply = anthropicReply({ choices: [{ finish_reason: 'stop', message: { content } }] }, 'google_1');
  assert.equal(reply.content[0].input.body, 'p = $\\frac{1}{1+e^{-z}}$ and $\\theta$');
  const seen = [];
  visualScanner(item => seen.push(item))(content);
  assert.equal(seen[0].caption, '$\\frac{1}{2}$');
});
