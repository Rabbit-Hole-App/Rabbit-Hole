// The Examples page cards (owner 2026-11-13): title, short description, the canvas picture, and an Open canvas action
// below it; the whole card links to the canvas. examples.js imports CSS and touches the DOM, so its renderer is run from source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { examples } from './examples-data.js';

const source = readFileSync(new URL('./examples.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^const grid[\s\S]*$/m, '').replace(/^export /gm, '');
const { renderExamples, countLabel } = new Function(`${source}
return { renderExamples, countLabel };`)();
const doc = list => parseHTML(`<!doctype html><html><body><ul>${renderExamples(list)}</ul></body></html>`).document;

test('every example card has a title, a description, its canvas picture and an Open canvas action, all inside one link', () => {
  const cards = [...doc(examples).querySelectorAll('a.example-card')];
  assert.equal(cards.length, examples.length);
  cards.forEach((card, i) => {
    assert.equal(card.getAttribute('href'), examples[i].href);
    assert.equal(card.querySelector('h3').textContent, examples[i].title);
    assert.equal(card.querySelector('p').textContent, examples[i].description);
    assert.equal(card.querySelector('.example-canvas img').getAttribute('src'), examples[i].image.src);
    assert.equal(card.querySelector('.card-action-label').textContent, 'Open canvas');
    assert.equal(card.getAttribute('aria-labelledby'), card.querySelector('h3').id);
  });
});

test('text from the data is escaped, and the count reads in the singular and plural', () => {
  const card = doc([{ ...examples[0], title: '<b>x</b> & "y"', description: '<i>z</i>' }]).querySelector('a.example-card');
  assert.equal(card.querySelector('h3').textContent, '<b>x</b> & "y"');
  assert.equal(card.querySelector('b'), null);
  assert.deepEqual([countLabel(1), countLabel(3)], ['1 canvas', '3 canvases']);
});

test('no card label uses an ellipsis (owner rule)', () => {
  assert.equal(/\.\.\.|…/.test(renderExamples(examples)), false);
});
