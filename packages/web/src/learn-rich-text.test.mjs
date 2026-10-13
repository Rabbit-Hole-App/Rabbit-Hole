import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseOf, compactRuns, fontSize, formatObject, formatRuns, hexColor, objectsValue, plainOf, reconcileRuns, runsOf, spliceRuns, textPatch, toggleValue, valueOver } from './learn-rich-text.js';

test('an old plain text object loads as one plain run and saves with no runs', () => {
  assert.deepEqual(runsOf({ kind: 'text', text: 'line one\nline  two' }), [{ t: 'line one\nline  two' }]);
  assert.deepEqual(textPatch(runsOf({ text: 'x' })), { text: 'x', runs: undefined });
  assert.deepEqual(runsOf({ text: '' }), []);
});

test('runs that no longer spell the text are never drawn in place of it', () => {
  assert.deepEqual(runsOf({ text: 'new words', runs: [{ t: 'old', b: true }] }), [{ t: 'new words' }]);
  // Hostile values are dropped, never drawn.
  assert.deepEqual(runsOf({ text: 'ab', runs: [{ t: 'a', c: 'red;background:url(x)' }, { t: 'b', f: 'Comic', s: 'huge' }] }), [{ t: 'a' }, { t: 'b' }]);
});

test('a range takes formatting, neighbours merge, and the plain text is unchanged', () => {
  const runs = formatRuns([{ t: 'hello world' }], 6, 11, 'b', true);
  assert.equal(plainOf(runs), 'hello world');
  assert.deepEqual(compactRuns(runs), [{ t: 'hello ' }, { t: 'world', b: true }]);
  const coloured = formatRuns(runs, 0, 11, 'c', '#b42318');
  assert.deepEqual(compactRuns(coloured), [{ t: 'hello ', c: '#b42318' }, { t: 'world', b: true, c: '#b42318' }]);
});

test('typing into a range keeps its neighbours and takes the given formatting', () => {
  const runs = [{ t: 'ab' }, { t: 'cd', i: true }];
  assert.deepEqual(compactRuns(spliceRuns(runs, 2, 2, 'X', { u: true })), [{ t: 'ab' }, { t: 'X', u: true }, { t: 'cd', i: true }]);
  assert.equal(plainOf(spliceRuns(runs, 1, 3, '\n')), 'a\nd');
});

test('mixed values read as mixed; a caret reads the character before it, and a pending format wins', () => {
  const base = baseOf({}, { size: 14 });
  const runs = [{ t: 'ab' }, { t: 'cd', b: true }];
  assert.equal(valueOver(runs, 0, 4, 'b', base), 'mixed');
  assert.equal(valueOver(runs, 2, 4, 'b', base), true);
  assert.equal(valueOver(runs, 4, 4, 'b', base), true);
  assert.equal(valueOver(runs, 1, 1, 'b', base), false);
  assert.equal(valueOver(runs, 1, 1, 'b', base, { b: true }), true);
  assert.equal(toggleValue(runs, 0, 4, 'b', base), true);
  assert.equal(toggleValue(runs, 2, 4, 'b', base), false);
});

test('whole-object formatting lets every run go of that key', () => {
  const entry = { text: 'abcd', runs: [{ t: 'ab', b: true }, { t: 'cd', c: '#2383e2' }] };
  const bold = formatObject(entry, 'b', false);
  assert.equal(bold.bold, false);
  assert.deepEqual(bold.runs, [{ t: 'ab' }, { t: 'cd', c: '#2383e2' }]);
  const plain = formatObject(bold, 'c', '#b42318');
  assert.equal(plain.textColor, '#b42318');
  assert.equal(plain.runs, undefined);
});

test('several objects show one value or mixed', () => {
  const baseFor = entry => baseOf(entry);
  assert.equal(objectsValue([{ text: 'a', font: 'serif' }, { text: 'b', font: 'serif' }], 'f', baseFor), 'serif');
  assert.equal(objectsValue([{ text: 'a', font: 'serif' }, { text: 'b' }], 'f', baseFor), 'mixed');
  assert.equal(objectsValue([{ text: 'ab', runs: [{ t: 'a', i: true }, { t: 'b' }] }], 'i', baseFor), 'mixed');
});

test('edited words keep the formatting of what did not change; the new words win', () => {
  const runs = [{ t: 'one ' }, { t: 'two', b: true }, { t: ' three' }];
  const next = reconcileRuns(runs, 'one TWO! three');
  assert.equal(plainOf(next), 'one TWO! three');
  assert.deepEqual(compactRuns(next), [{ t: 'one ' }, { t: 'TWO!', b: true }, { t: ' three' }]);
  assert.deepEqual(compactRuns(reconcileRuns(runs, 'one two three four')), [{ t: 'one ' }, { t: 'two', b: true }, { t: ' three four' }]);
});

test('colours and sizes are validated', () => {
  assert.equal(hexColor('#ABC'), '#aabbcc');
  assert.equal(hexColor('2383e2'), '#2383e2');
  assert.equal(hexColor('red'), null);
  assert.equal(fontSize('12.3'), 12.5);
  assert.equal(fontSize(1), 8);
  assert.equal(fontSize(999), 160);
  assert.equal(fontSize('x'), null);
});

test('a heading level still decides weight and size unless the object sets its own', () => {
  assert.equal(baseOf({}, { size: 32, weight: 600 }).b, true);
  assert.equal(baseOf({ bold: false }, { size: 32, weight: 600 }).b, false);
  assert.equal(baseOf({ fontSize: 20 }, { size: 32 }).s, 20);
});
