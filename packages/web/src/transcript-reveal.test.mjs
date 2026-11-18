// revealScript (transcript-reveal.js): how much of the narration script is shown at audio time t of d seconds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { revealScript } from './transcript-reveal.js';

const S = 'The sigmoid squashes any score. It passes through one half at zero.';

test('t = 0, an unknown length or a bad time shows nothing', () => {
  for (const [t, d] of [[0, 80], [5, 0], [5, NaN], [NaN, 80], [5, undefined], [-3, 80], [5, -1], [Infinity, 80]]) assert.deepEqual(revealScript(S, t, d), { text: '', split: 0 }, `${t}/${d}`);
});

test('t >= d shows the whole script, even past the end', () => {
  assert.equal(revealScript(S, 80, 80).text, S);
  assert.equal(revealScript(S, 200, 80).text, S);
});

test('in between: proportional by characters, and never cuts a word', () => {
  const half = revealScript(S, 40, 80).text;
  assert.ok(S.startsWith(half));
  assert.ok(half.length >= S.length / 2 - 1 && half.length < S.length);
  assert.ok(/\S$/.test(half) && (S[half.length] === ' ' || half.length === S.length), 'ends on a word boundary');
  assert.equal(revealScript(S, 0.01, 80).text, 'The', 'the first word is the word being spoken');
});

test('the text only grows as t grows', () => {
  let last = 0;
  for (let t = 0; t <= 80; t += 3) { const n = revealScript(S, t, 80).text.length; assert.ok(n >= last); last = n; }
});

test('a single word, an empty or missing script', () => {
  assert.equal(revealScript('Hello', 1, 100).text, 'Hello');
  assert.deepEqual(revealScript('', 5, 10), { text: '', split: 0 });
  assert.deepEqual(revealScript(undefined, 5, 10), { text: '', split: 0 });
  assert.deepEqual(revealScript('   ', 5, 10), { text: '', split: 0 });
});

test('unicode: a pair or a non-Latin word is never cut', () => {
  const s = 'Hi 😀😀 naïve 日本語 ok';
  for (let t = 1; t <= 10; t += 1) { const { text } = revealScript(s, t, 10); assert.ok(s.startsWith(text)); assert.equal(text, text.normalize('NFC')); assert.doesNotMatch(text, /[\ud800-\udbff]$/); }
  assert.equal(revealScript(s, 10, 10).text, s);
});

test('split marks the start of the current sentence; the first sentence has none before it', () => {
  const first = revealScript(S, 5, 80);
  assert.equal(first.split, 0);
  const later = revealScript(S, 70, 80);
  assert.equal(later.text.slice(0, later.split), 'The sigmoid squashes any score. ');
  assert.ok(later.text.slice(later.split).startsWith('It passes'));
  const done = revealScript('One. Two!', 10, 10);
  assert.equal(done.text.slice(done.split), 'Two!', 'a finished last sentence is still the current one');
});

// Equations ($...$ and the other spans Md's tokenizeMath finds) are atomic: never shown half-written.
const BS = String.fromCharCode(92); // a backslash, for LaTeX commands and escaped dollars
const everyShown =(s, d = 100) => { const out = []; for (let t = 0; t <= d; t += 1) out.push(revealScript(s, t, d)); return out; };

test('a span in the middle comes in whole, never half-written, at every moment', () => {
  const s = `The rate is $e^{-1} + ${BS}frac{1}{N}$ per step, always.`;
  const span = `$e^{-1} + ${BS}frac{1}{N}$`;
  let seen = false;
  for (const { text } of everyShown(s)) {
    const at = text.indexOf('$');
    if (at < 0) continue;
    seen = true;
    assert.ok(text.includes(span), `whole span once it starts: ${text}`);
  }
  assert.ok(seen);
  assert.equal(revealScript(s, 100, 100).text, s);
});

test('a span at the start, at the end and two adjacent spans', () => {
  for (const s of ['$x^2$ is the area.', 'The area is $x^2$', 'Both $a$$b$ here.', 'Both $a$ $b$ here.']) {
    for (const { text } of everyShown(s)) {
      assert.ok(s.startsWith(text), s);
      const spans = [...s.matchAll(/\$[^$]+\$/g)].map(m => [m.index, m.index + m[0].length]);
      for (const [a, b] of spans) assert.ok(text.length <= a || text.length >= b, `${s}: cut at ${text.length} inside [${a},${b})`);
    }
  }
  assert.equal(revealScript('$x^2$ is the area.', 1, 100).text, '$x^2$', 'the first word is the equation');
});

test('an unclosed dollar and an escaped dollar are plain text, cut by words like any text', () => {
  for (const s of ['It costs $5 for each of them today.', `It costs ${BS}$5 and ${BS}$6 in total here.`, 'Only $x never closes here at all.']) {
    const lens = everyShown(s).map(r => r.text);
    assert.ok(lens.some(t => t.length > 0 && t.length < s.length && !/\s$/.test(t) && /\s/.test(s[t.length] || ' ')), s);
    for (const t of lens) assert.ok(s.startsWith(t));
  }
  assert.equal(revealScript('It costs $5 for each of them today.', 10, 100).text, 'It costs');
});

test('a span containing spaces is one unit: the point inside it brings it in with the word it ends', () => {
  const s = 'Then $a + b = c$, and so on.';
  const { text } = revealScript(s, 30, 100);
  assert.ok(text.startsWith('Then $a + b = c$,'), text);
  assert.doesNotMatch(revealScript(s, 18, 100).text, /\$a \+ b$/);
});

test('the sentence split never lands inside a span', () => {
  const s = 'Take $x = 1. 5$ here. Then $y$ follows.';
  const { text, split } = revealScript(s, 100, 100);
  assert.equal(text, s);
  assert.equal(text.slice(split), 'Then $y$ follows.');
  assert.equal(revealScript(s, 30, 100).split, 0, 'the dot inside the span is not a sentence end');
});
