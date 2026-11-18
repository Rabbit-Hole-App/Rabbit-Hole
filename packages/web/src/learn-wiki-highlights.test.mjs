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

test('a Learn section quote is resolved once against the shown text: found becomes a plain highlight in the text\'s words, not found is dropped and reported', async () => {
  const { resolveLearnQuotes, locateLoose } = await import('./learn-wiki-highlights.js');
  const text = 'Intro words. The model reads the\ninput once and writes the output. More text follows here.';
  assert.deepEqual(locateLoose(text, 'reads the input once'), { start: text.indexOf('reads'), end: text.indexOf('once') + 4 });
  assert.equal(locateLoose(text, 'not on the page'), null);
  const entries = [
    { page: 3, exact: 'own mark', prefix: 'a', suffix: 'b' },
    { page: 3, exact: 'reads the input once', learn: { sectionId: '1.1', itemId: 'i2' } },
    { page: 3, exact: 'missing sentence', learn: { sectionId: '1.1', itemId: 'i3' } },
    { page: 4, exact: 'another page', learn: { sectionId: '1.1', itemId: 'i4' } },
  ];
  const out = resolveLearnQuotes(entries, text, entry => entry.page === 3);
  assert.deepEqual(out.missed, [{ sectionId: '1.1', itemId: 'i3' }]);
  assert.equal(out.next.length, 3);
  assert.deepEqual(out.next[0], entries[0]);
  assert.equal(out.next[1].exact, 'reads the\ninput once');
  assert.equal(out.next[1].learn, undefined);
  assert.equal(out.next[2], entries[3]); // another page waits for its own text
  assert.equal(resolveLearnQuotes([entries[0]], text, () => true), null);
});
