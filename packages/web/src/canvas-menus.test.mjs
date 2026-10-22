import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasEditMenus, localInsertItems } from './canvas-menus.js';

const calls = [];
const api = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
const canvas = () => api;
const labels = menu => menu.items.filter(item => item.label).map(item => item.label);

test('the owner page and a shared canvas build the same Edit, Arrange and View; a shared one has no Quick Edit or Slash commands', () => {
  const state = { selected: 1, units: 3, canPaste: true, minimap: true };
  const owner = canvasEditMenus({ canvas, canvasState: state, inlineAi: {}, quickEdit: true, docView: 'canvas', setDocView() {}, onShortcuts() {}, onSlashHelp() {} });
  const shared = canvasEditMenus({ canvas, canvasState: state, docView: 'canvas', setDocView() {}, onShortcuts() {} });
  assert.deepEqual(owner.map(menu => menu.title), ['Edit', 'Arrange', 'View']);
  assert.deepEqual(shared.map(menu => menu.title), ['Edit', 'Arrange', 'View']);
  assert.equal(labels(owner[0])[0], 'Quick Edit');
  assert.ok(!labels(shared[0]).includes('Quick Edit'));
  assert.ok(labels(owner[2]).includes('Slash commands'));
  assert.ok(!labels(shared[2]).includes('Slash commands'));
  assert.deepEqual(labels(shared[1]), labels(owner[1]));
  assert.equal(shared[0].items[0].label, 'Undo', 'no leading divider once Quick Edit is gone');
});

test('menu rows call the canvas api; the Minimap switch is the View widget toggle', () => {
  calls.length = 0;
  const [edit, , view] = canvasEditMenus({ canvas, canvasState: { minimap: false }, docView: 'canvas', setDocView() {}, onShortcuts() {} });
  edit.items.find(item => item.label === 'Undo').onSelect();
  view.items.find(item => item.label === 'Minimap').onToggle(true);
  localInsertItems(canvas).find(item => item.label === 'Sticky note').onSelect();
  assert.deepEqual(calls, [['undo'], ['showWidget', 'minimap', true], ['insertSticky']]);
});
