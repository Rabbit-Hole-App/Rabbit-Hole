import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locateQuote, containsOffset } from './learn-wiki-highlights.js';

const TEXT = 'The softmax function turns scores into probabilities. Later, the softmax function appears again in attention.';

test('a quote finds its words', () => {
  const span = locateQuote(TEXT, { exact: 'turns scores into probabilities', prefix: 'softmax function ', suffix: '. Later' });
  assert.equal(TEXT.slice(span.start, span.end), 'turns scores into probabilities');
});

test('when the words occur twice, the surrounding text picks the right one', () => {
  const second = locateQuote(TEXT, { exact: 'softmax function', prefix: 'Later, the ', suffix: ' appears again' });
  assert.equal(second.start, TEXT.lastIndexOf('softmax function'));
  const first = locateQuote(TEXT, { exact: 'softmax function', prefix: 'The ', suffix: ' turns scores' });
  assert.equal(first.start, TEXT.indexOf('softmax function'));
});

test('a quote whose words are gone locates nowhere, instead of somewhere wrong', () => {
  assert.equal(locateQuote(TEXT, { exact: 'gradient descent', prefix: '', suffix: '' }), null);
  assert.equal(locateQuote(TEXT, null), null);
});

test('a click inside a highlight is found by its offset', () => {
  const span = locateQuote(TEXT, { exact: 'probabilities', prefix: 'into ', suffix: '.' });
  assert.equal(containsOffset(span, span.start + 3), true);
  assert.equal(containsOffset(span, span.end + 5), false);
  assert.equal(containsOffset(null, 3), false);
});
