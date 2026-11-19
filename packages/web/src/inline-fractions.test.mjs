import test from 'node:test';
import assert from 'node:assert/strict';
import { slashFractions as f } from './inline-fractions.js';

test('simple fractions become a/b; a symbol with a sub or superscript needs no brackets', () => {
  assert.equal(f(String.raw`\frac{42}{70}=0.6`), '42/70=0.6');
  assert.equal(f(String.raw`\frac{a}{b}`), 'a/b');
  assert.equal(f(String.raw`\frac{e^{s_i}}{x}`), 'e^{s_i}/x');
  assert.equal(f(String.raw`\frac{\alpha}{2}`), String.raw`\alpha/2`);
});

test('a compound argument is bracketed: the softmax sentence and the silhouette coefficient', () => {
  assert.equal(f(String.raw`p_i=\frac{e^{s_i}}{\sum_j e^{s_j}}`), String.raw`p_i=e^{s_i}/(\sum_j e^{s_j})`);
  assert.equal(f(String.raw`\sigma(\mathbf{z})_i = \frac{e^{z_i}}{\sum_{j} e^{z_j}}`), String.raw`\sigma(\mathbf{z})_i = e^{z_i}/(\sum_{j} e^{z_j})`);
  assert.equal(f(String.raw`\frac{b - a}{\max(a, b)}`), String.raw`(b - a)/\max(a, b)`);
  // One function call is one symbol; anything compound around it keeps its brackets.
  assert.equal(f(String.raw`\frac{\max(a,b)}{\log(x)}`), String.raw`\max(a,b)/\log(x)`);
  assert.equal(f(String.raw`\frac{\max(a,b) + 1}{2}`), String.raw`(\max(a,b) + 1)/2`);
  assert.equal(f(String.raw`\frac{1}{\max(a,(b))}`), String.raw`1/(\max(a,(b)))`);
});

test('nested braces and nested fractions', () => {
  assert.equal(f(String.raw`\frac{\frac{a}{b}}{c}`), '(a/b)/c');
  assert.equal(f(String.raw`\frac{a^{\frac{1}{2}}}{b}`), String.raw`a^{\frac{1}{2}}/b`);
  assert.equal(f(String.raw`\frac{{a}{b}}{c}`), '({a}{b})/c');
});

test('dfrac and tfrac, and spaces between the arguments', () => {
  assert.equal(f(String.raw`\dfrac{1}{2}+\tfrac{3}{4}`), '1/2+3/4');
  assert.equal(f(String.raw`\frac {x} {y}`), 'x/y');
});

test('a fraction in a sum, and two fractions in one sentence-sized formula', () => {
  assert.equal(f(String.raw`\sum_{i=1}^{n}\frac{1}{i}`), String.raw`\sum_{i=1}^{n}1/i`);
  assert.equal(f(String.raw`\frac{1}{2}\text{ and }\frac{3}{4}`), String.raw`1/2\text{ and }3/4`);
});

test('a fraction inside braces or after ^ or _ keeps its stack; fracture is not a fraction; unfinished input is untouched', () => {
  assert.equal(f(String.raw`\sqrt{\frac{a}{b}}`), String.raw`\sqrt{\frac{a}{b}}`);
  assert.equal(f(String.raw`x^{\frac{1}{2}}`), String.raw`x^{\frac{1}{2}}`);
  assert.equal(f(String.raw`x^\frac{1}{2}`), String.raw`x^\frac{1}{2}`);
  assert.equal(f(String.raw`\text{a \frac{b}{c}}`), String.raw`\text{a \frac{b}{c}}`);
  assert.equal(f(String.raw`\fracture{a}{b}`), String.raw`\fracture{a}{b}`);
  assert.equal(f(String.raw`\frac{a}{`), String.raw`\frac{a}{`);
  assert.equal(f(String.raw`\frac{a}`), String.raw`\frac{a}`);
});

test('an escaped brace or dollar in the formula does not confuse the scan', () => {
  assert.equal(f(String.raw`\frac{\{a\}}{\$5}`), String.raw`(\{a\})/(\$5)`);
  assert.equal(f(String.raw`\ \frac{a}{b}`), String.raw`\ a/b`);
});
