import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEARN_TABS, fitScale, learnEnter, learnLeave, learnSection, learnTab, learnView, zoomStep } from './learn-mode.js';

test('entering holds the right panel as it was and opens on Cards; leaving gives it back', () => {
  const held = learnEnter({ open: true, tab: 'find' });
  assert.deepEqual(held, { panelWas: { open: true, tab: 'find' }, tab: 'cards' });
  assert.deepEqual(learnLeave(held), { open: true, tab: 'find' });
  assert.deepEqual(learnLeave(learnEnter({ open: false, tab: 'chat' })), { open: false, tab: 'chat' });
  assert.equal(learnLeave(null), null);
});

test('the tabs are Cards, Canvas, TOC and Chat, in that order; anything else reads as Cards', () => {
  assert.deepEqual(LEARN_TABS.map(entry => entry.label), ['Cards', 'Canvas', 'TOC', 'Chat']);
  assert.equal(learnTab('toc'), 'toc');
  assert.equal(learnTab('find'), 'cards');
  assert.equal(learnTab(undefined), 'cards');
});

test('a stop in each tab: Cards draws the card in the pane, Canvas centres it, TOC and Chat open the panel on that tab', () => {
  assert.deepEqual(learnView('cards'), { cards: true, centre: false, panel: { open: false, tab: null } });
  assert.deepEqual(learnView('canvas'), { cards: false, centre: true, panel: { open: false, tab: null } });
  assert.deepEqual(learnView('toc'), { cards: false, centre: false, panel: { open: true, tab: 'toc' } });
  assert.deepEqual(learnView('chat'), { cards: false, centre: false, panel: { open: true, tab: 'chat' } }, 'nothing selected in Chat (owner 2026-11-18)');
});

test('the Learn side of the pill starts the first section not finished, else the first', () => {
  const labels = { '1.1': 'Start again', '1.2': 'Continue', '2.1': 'Start' };
  assert.equal(learnSection(['1.1', '1.2', '2.1'], id => labels[id]), '1.2');
  assert.equal(learnSection(['1.1'], id => labels[id]), '1.1');
  assert.equal(learnSection([], () => 'Start'), null);
});

test('the Cards tab shows a card whole: scaled down to fit the pane under the composer, never up; zoom steps in and out from there', () => {
  assert.equal(fitScale({ w: 640, h: 300 }, { w: 960, h: 800 }), 1, 'a card that fits stays at 100 %');
  assert.equal(fitScale({ w: 1200, h: 400 }, { w: 648, h: 800 }), 0.5, 'too wide: fitted to the width less the side padding');
  assert.equal(fitScale({ w: 640, h: 1188 }, { w: 960, h: 800 }), 0.5, 'too tall: fitted to the height above the composer');
  assert.equal(fitScale({ w: 640, h: 100000 }, { w: 960, h: 800 }), 0.25, 'never below the smallest step');
  assert.equal(fitScale({ w: 0, h: 0 }, { w: 960, h: 800 }), 1, 'not measured yet');
  assert.deepEqual([zoomStep(0.5, 1), zoomStep(0.5, -1), zoomStep(0.58, 1), zoomStep(0.58, -1), zoomStep(2, 1), zoomStep(0.25, -1)], [0.67, 0.33, 0.67, 0.5, 2, 0.25]);
});
