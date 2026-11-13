import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJson, restoreLatexEscapes, restoreLatexIn } from './latex-escapes.js';
import { anthropicReply, visualScanner } from './explanation-fast-chain.js';

// The model's JSON text: a LaTeX command written with ONE backslash, as the logistic-regression pack's cards 03 and 05 came back.
const COMMANDS = ['\\frac{1}{2}', '\\theta', '\\times', '\\to', '\\neq', '\\rho', '\\beta', '\\right)', '\\nu', '\\nabla', '\\tau', '\\rightarrow'];

test('every LaTeX command written with one backslash in a JSON string is restored inside its math span', () => {
  for (const command of COMMANDS) {
    const reply = `{"body":"With $a ${command} b$ and $$x ${command} y$$ the value follows."}`;
    assert.equal(parseModelJson(reply).body, `With $a ${command} b$ and $$x ${command} y$$ the value follows.`, command);
  }
});

test('a command at the very start of the math span is restored', () => {
  for (const command of COMMANDS) assert.equal(parseModelJson(`{"b":"$${command}$"}`).b, `$${command}$`, command);
});

test('the two cards of release 123 read back exactly', () => {
  assert.equal(parseModelJson('{"body":"resulting in $\\frac{1}{1 + 1} = 0.5$."}').body, 'resulting in $\\frac{1}{1 + 1} = 0.5$.');
  assert.equal(parseModelJson('{"body":"The formula $p = \\frac{1}{1 + e^{-z}}$ ensures"}').body, 'The formula $p = \\frac{1}{1 + e^{-z}}$ ensures');
});

test('a correctly escaped double backslash is untouched', () => {
  assert.equal(parseModelJson('{"body":"$\\\\frac{1}{2}$ and $\\\\theta$"}').body, '$\\frac{1}{2}$ and $\\theta$');
});

test('a form feed or backspace before a letter is restored anywhere; tab, newline and return stay in prose and code', () => {
  assert.equal(restoreLatexEscapes('the \frac sign'), 'the \\frac sign');
  assert.equal(restoreLatexEscapes('the \x08eta sign'), 'the \\beta sign');
  const prose = 'Line one\n\nneq is a word here.\n\ttabbed theta line\r\ntheta';
  assert.equal(restoreLatexEscapes(prose), prose);
});

test('a real newline inside math before a name that is not a command stays a newline', () => {
  const text = '$$\nx = 1\ny = 2\n$$';
  assert.equal(restoreLatexEscapes(text), text);
  assert.equal(restoreLatexEscapes('$$\nu$$'.replace('u', 'unit = 2')), '$$\nunit = 2$$');
});

test('a command the JSON grammar rejects is read with its backslash kept', () => {
  assert.equal(parseModelJson('{"body":"$\\alpha + \\sigma + \\lambda$"}').body, '$\\alpha + \\sigma + \\lambda$');
  assert.throws(() => parseModelJson('{"body":'), SyntaxError);
});

test('restoreLatexIn walks nested objects and arrays and leaves other values alone', () => {
  const value = restoreLatexIn({ title: 'T', n: 3, ok: true, none: null, visuals: [{ caption: '$\frac{1}{2}$', nodes: [{ label: 'x $\theta$' }] }] });
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
