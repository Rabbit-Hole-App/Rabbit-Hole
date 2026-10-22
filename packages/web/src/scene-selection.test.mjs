import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeYields, holdsSceneHighlight, releaseSceneHighlights } from './scene-selection.js';

// A focused element as escapeYields reads it: tag, type, editability and which ancestors match.
const element = (tagName, { type, editable = false, inside = [] } = {}) => ({
  tagName, type, isContentEditable: editable, ownerDocument: { body: null },
  closest: selector => (selector.split(',').some(part => inside.includes(part)) ? {} : null),
});
const esc = (prevented = false) => ({ key: 'Escape', defaultPrevented: prevented });

test('Esc nothing claimed clears; Esc a focused editor, field, composer or dialog claimed does not', () => {
  assert.equal(escapeYields(esc(), null), false, 'nothing focused');
  assert.equal(escapeYields(esc(), element('DIV')), false, 'a plain focused card');
  assert.equal(escapeYields(esc(), element('INPUT', { type: 'range' })), false, 'the scene slider hands Esc on');
  assert.equal(escapeYields(esc(), element('BUTTON')), false, 'a scene button hands Esc on');
  assert.equal(escapeYields(esc(true), element('DIV')), true, 'an owner already handled it');
  assert.equal(escapeYields(esc(), element('TEXTAREA')), true, 'the composer textarea');
  assert.equal(escapeYields(esc(), element('INPUT')), true, 'a text field');
  assert.equal(escapeYields(esc(), element('INPUT', { type: 'search' })), true, 'a search field');
  assert.equal(escapeYields(esc(), element('DIV', { editable: true })), true, 'a rich editor');
  assert.equal(escapeYields(esc(), element('BUTTON', { inside: ['[role="dialog"]'] })), true, 'a button inside a dialog');
  assert.equal(escapeYields(esc(), element('BUTTON', { inside: ['[data-chat-composer]'] })), true, 'a composer control');
  assert.equal(escapeYields(esc(), element('DIV', { inside: ['[role="menu"]'] })), true, 'an open menu');
});

const scene = (id, extra = {}) => ({ id, type: 'animation', scene: {}, time: 3, inputs: { n: 2 }, marked: null, selectedObject: null, ...extra });

test('only the card holding a highlight lets go, and nothing else on it changes', () => {
  const held = scene('a', { selectedObject: 'tokens', marked: { x: 0, y: 0, w: 0.5, h: 0.5 } });
  const other = scene('b');
  const note = { id: 'n', type: 'note', marked: 'not a scene highlight' };
  const blocks = [held, other, note];
  const next = releaseSceneHighlights(blocks);
  assert.notEqual(next, blocks);
  assert.deepEqual(next[0], { ...held, marked: null, selectedObject: null }, 'time, inputs and content survive');
  assert.equal(next[1], other, 'a card without a highlight keeps its identity');
  assert.equal(next[2], note, 'other card types are never touched');
});

test('the kept owner holds on, and with nothing to release the same array returns (no render, no save)', () => {
  const held = scene('a', { selectedObject: 'tokens' });
  const blocks = [held, scene('b')];
  assert.equal(releaseSceneHighlights(blocks, ['a']), blocks);
  assert.equal(releaseSceneHighlights([scene('a'), scene('b')]).length, 2);
  const quiet = [scene('a'), scene('b')];
  assert.equal(releaseSceneHighlights(quiet), quiet);
});

test('a region left drawn on a paper page is released too; the page and the paper stay', () => {
  const paper = { id: 'p', type: 'paper', paper: { id: '1706.03762', page: 3, selection: { region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } } } };
  const [next] = releaseSceneHighlights([paper]);
  assert.deepEqual(next.paper, { id: '1706.03762', page: 3, selection: undefined });
  assert.equal(holdsSceneHighlight(next), false);
});

test('a second card taking a highlight leaves exactly one holder', () => {
  const blocks = [scene('a', { selectedObject: 'tokens' }), scene('b', { marked: { x: 0, y: 0, w: 1, h: 1 } })];
  const next = releaseSceneHighlights(blocks, ['b']);
  assert.deepEqual(next.filter(holdsSceneHighlight).map(block => block.id), ['b']);
});
