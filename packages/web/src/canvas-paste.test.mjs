import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasteKind } from './canvas-paste.js';

const marker = 'rabbit-hole:copied-cards';

test('an image from anywhere becomes an image card', () => {
  assert.equal(pasteKind({ images: 1, text: '', marker }), 'image');
  assert.equal(pasteKind({ images: 1, text: 'caption', marker, cards: 2 }), 'image');
});

test('text copied elsewhere becomes a text card, even after cards were copied on the canvas', () => {
  assert.equal(pasteKind({ text: 'Attention is all you need', marker }), 'text');
  assert.equal(pasteKind({ text: 'copied in another tab', marker, cards: 3 }), 'text');
});

test('the canvas\'s own copied cards paste while the clipboard holds their marker', () => {
  assert.equal(pasteKind({ text: marker, marker, cards: 2 }), 'cards');
  assert.equal(pasteKind({ images: 1, text: '', marker, copying: true, cards: 1 }), 'cards');
  assert.equal(pasteKind({ text: '', marker, cards: 1 }), 'cards');
});

test('nothing to paste: whitespace, or the marker with no cards', () => {
  assert.equal(pasteKind({ text: '   ', marker }), null);
  assert.equal(pasteKind({ text: marker, marker }), null);
});
