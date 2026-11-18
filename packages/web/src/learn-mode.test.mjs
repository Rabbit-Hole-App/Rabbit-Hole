import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEARN_TABS, learnEnter, learnLeave, learnSection, learnTab, learnView } from './learn-mode.js';

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

test('a stop in each tab: Cards is Focus with the panel closed, Canvas centres without Focus, TOC and Chat open the panel on that tab', () => {
  assert.deepEqual(learnView('cards'), { focus: true, centre: false, select: false, panel: { open: false, tab: null } });
  assert.deepEqual(learnView('canvas'), { focus: false, centre: true, select: false, panel: { open: false, tab: null } });
  assert.deepEqual(learnView('toc'), { focus: null, centre: false, select: false, panel: { open: true, tab: 'toc' } });
  assert.deepEqual(learnView('chat'), { focus: null, centre: false, select: true, panel: { open: true, tab: 'chat' } }, 'the stop is the selected context of the chat');
});

test('the Learn side of the pill starts the first section not finished, else the first', () => {
  const labels = { '1.1': 'Start again', '1.2': 'Continue', '2.1': 'Start' };
  assert.equal(learnSection(['1.1', '1.2', '2.1'], id => labels[id]), '1.2');
  assert.equal(learnSection(['1.1'], id => labels[id]), '1.1');
  assert.equal(learnSection([], () => 'Start'), null);
});
