import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewerBackground, VIEWER_BACKGROUNDS } from './cad-viewer-background.js';
import { dimensionsKey, dropView, publishView, readDimensions, viewOf, writeDimensions } from './cad-viewer-store.js';
import { memoryStorage } from './storage-fallback.js';

test('the viewer background is white, black or none; a card saved before the control (or holding junk) shows white', () => {
  assert.deepEqual(Object.keys(VIEWER_BACKGROUNDS), ['white', 'black', 'none']);
  assert.equal(VIEWER_BACKGROUNDS.none, null); // none: no scene background, the themed card surface shows through
  for (const value of ['white', 'black', 'none']) assert.equal(viewerBackground({ viewerBackground: value }), value);
  for (const block of [{}, null, { viewerBackground: 'red' }, { viewerBackground: 'toString' }, { viewerBackground: '#fff' }]) assert.equal(viewerBackground(block), 'white');
});

test('Show dimensions is off by default and kept per account and card in this browser only', () => {
  const store = memoryStorage(), mine = dimensionsKey('org:ana@test', 'cad-1');
  assert.notEqual(mine, dimensionsKey('org:ben@test', 'cad-1'));
  assert.notEqual(mine, dimensionsKey('org:ana@test', 'cad-2'));
  assert.equal(dimensionsKey('', 'cad-1'), 'rh.cad-dimensions:viewer:cad-1'); // a shared page knows no account
  assert.equal(readDimensions(store, mine), false);
  writeDimensions(store, mine, true); assert.equal(readDimensions(store, mine), true);
  writeDimensions(store, mine, false); assert.equal(store.getItem(mine), null);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(readDimensions(blocked, mine), false);
  writeDimensions(blocked, mine, true); // never throws
});

test('a viewer publishes its state to the toolbar outside the card and drops it when it goes', () => {
  assert.deepEqual({ ...viewOf('cad-x') }, { live: false, interacting: false, api: null });
  const api = { enter() {}, exit() {}, fit() {} };
  publishView('cad-x', { live: true, interacting: false, api });
  assert.equal(viewOf('cad-x').live, true);
  assert.equal(viewOf('cad-x').api, api);
  const same = viewOf('cad-x');
  publishView('cad-x', { live: true, interacting: false, api });
  assert.equal(viewOf('cad-x'), same, 'no change, no new snapshot');
  dropView('cad-x');
  assert.equal(viewOf('cad-x').live, false);
});
