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
