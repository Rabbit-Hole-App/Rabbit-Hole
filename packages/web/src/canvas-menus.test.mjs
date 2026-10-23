import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasEditMenus, localInsertItems, ownerInsertItems } from './canvas-menus.js';
import { menuIcon, MENU_ICON_SIZE, MENU_ICON_STROKE } from './menu-icon.js';

// Owner brief 2026-10-22 ("Canvas menu redesign": Insert, Edit, Arrange, View) and its icon addendum.
const calls = [];
const api = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
const canvas = () => api;
const labels = items => items.filter(item => item.label).map(item => item.label);
const find = (items, label) => items.find(item => item.label === label);
const groups = items => items.reduce((all, item) => { if (item.divider) all.push([]); else all[all.length - 1].push(item.label); return all; }, [[]]);
const build = (state = {}, extra = {}) => canvasEditMenus({ canvas, canvasState: state, docView: 'canvas', setDocView() {}, ...extra });
const owner = (state, extra) => build(state, { inlineAi: {}, quickEdit: true, panel: { open: true, setOpen() {} }, ...extra });
const walk = items => items.flatMap(item => (item.items ? [item, ...walk(item.items)] : [item]));
const allMenus = () => [
  ...owner({ selected: 1, units: 3, grouped: true, canPaste: true, canPasteStyle: true }, { comments: { active: true } }).map(menu => ({ title: menu.title, items: walk(menu.items) })),
  { title: 'Insert', items: walk(ownerInsertItems({ canvas })) },
];

test('Insert: sections, local rows, then Notebook, Upload a file, Webpage, Search sources, then Link to canvas', () => {
  const insert = ownerInsertItems({ canvas, onUpload() {}, onSearchSources() {}, onLinkToCanvas() {} });
  assert.deepEqual(groups(insert), [['Section', 'Text box', 'Sticky note', 'Divider', 'Equation'], ['Notebook', 'Upload a file', 'Webpage', 'Search sources'], ['Link to canvas']]);
  assert.deepEqual(labels(find(insert, 'Section').items), ['Section', 'Sub-section', 'Sub-sub-section']);
  assert.ok(find(insert, 'Section').items.every(item => !item.size && !item.weight && !item.icon), 'text-only choices, typography not enlarged');
  assert.deepEqual(groups(localInsertItems(canvas)), [['Section', 'Text box', 'Sticky note', 'Divider', 'Equation']], 'a shared canvas gets the local rows');
  assert.doesNotMatch(labels(walk(insert)).join('|'), /YouTube|arXiv|Wikipedia|Files|Share|Publish|Embed/, 'one source finder, no Files, Share, Publish or Embed');
});

test('Insert rows call the canvas api; the page supplies Upload, Search sources and Link to canvas', () => {
  calls.length = 0;
  const seen = [];
  const insert = ownerInsertItems({ canvas, onUpload: () => seen.push('upload'), onSearchSources: () => seen.push('search'), onLinkToCanvas: () => seen.push('link') });
  for (const label of ['Text box', 'Sticky note', 'Divider', 'Equation', 'Notebook', 'Webpage']) find(insert, label).onSelect();
  find(find(insert, 'Section').items, 'Sub-section').onSelect();
  for (const label of ['Upload a file', 'Search sources', 'Link to canvas']) find(insert, label).onSelect();
  assert.deepEqual(calls, [['insertText'], ['insertSticky'], ['insertDivider'], ['insertEquation'], ['insertNotebook'], ['insertWebpage'], ['insertHeading', 2]]);
  assert.deepEqual(seen, ['upload', 'search', 'link']);
});

test('the page adds Insert to Edit, Arrange, View; a shared canvas has no Edit with AI', () => {
  const shared = build({ selected: 1 });
  assert.deepEqual(owner({}).map(menu => menu.title), ['Edit', 'Arrange', 'View']);
  assert.deepEqual(shared.map(menu => menu.title), ['Edit', 'Arrange', 'View']);
  assert.ok(!labels(shared[0].items).includes('Edit with AI'));
  assert.equal(shared[0].items[0].label, 'Undo');
});

test('Edit: Undo Redo, Cut Copy Paste, Duplicate Delete, Copy style Paste style, Select all, Edit with AI; Group, Ungroup and Lock moved to Arrange', () => {
  const [edit] = owner({ selected: 1 });
  assert.deepEqual(groups(edit.items), [['Undo', 'Redo'], ['Cut', 'Copy', 'Paste'], ['Duplicate', 'Delete'], ['Copy style', 'Paste style'], ['Select all'], ['Edit with AI']]);
  const names = labels(edit.items);
  for (const moved of ['Group', 'Ungroup', 'Lock', 'Unlock', 'Quick Edit', 'Delete selection']) assert.ok(!names.includes(moved), `${moved} is not in Edit`);
  assert.equal(find(edit.items, 'Edit with AI').hint, 'Ctrl K');
  assert.equal(find(edit.items, 'Edit with AI').disabled, false);
  assert.equal(find(owner({ selected: 0 })[0].items, 'Edit with AI').disabled, true, 'needs a selection');
  assert.equal(find(owner({ selected: 1 }, { inlineAi: null })[0].items, 'Edit with AI').disabled, true, 'needs the inline editor');
});

test('Edit rows keep their shortcuts and selection requirements; disabled rows stay in the menu', () => {
  const [none] = owner({ canPaste: false });
  for (const label of ['Cut', 'Copy', 'Duplicate', 'Delete', 'Copy style', 'Paste style', 'Paste']) assert.equal(find(none.items, label).disabled, true, `${label} needs something`);
  for (const label of ['Undo', 'Redo', 'Select all']) assert.equal(find(none.items, label).disabled, undefined);
  const [some] = owner({ selected: 1, canPaste: true, canPasteStyle: true });
  assert.ok(some.items.filter(item => item.label && item.label !== 'Edit with AI').every(item => !item.disabled));
  assert.deepEqual(['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Duplicate', 'Delete', 'Copy style', 'Paste style', 'Select all'].map(label => find(some.items, label).hint),
    ['Ctrl Z', 'Ctrl Y', 'Ctrl X', 'Ctrl C', 'Ctrl V', 'Ctrl D', 'Del', 'Ctrl Alt C', 'Ctrl Alt V', 'Ctrl A']);
});

test('Arrange: Align, Distribute and Layer order are submenus, then Group Ungroup, then Lock and Snap to grid', () => {
  const [, arrange] = owner({ selected: 3, units: 3, grouped: true });
  assert.deepEqual(groups(arrange.items), [['Align', 'Distribute', 'Layer order'], ['Group', 'Ungroup'], ['Lock', 'Snap to grid']]);
  assert.deepEqual(labels(find(arrange.items, 'Align').items), ['Left', 'Center', 'Right', 'Top', 'Middle', 'Bottom']);
  assert.deepEqual(labels(find(arrange.items, 'Distribute').items), ['Horizontally', 'Vertically']);
  assert.deepEqual(labels(find(arrange.items, 'Layer order').items), ['Bring to front', 'Bring forward', 'Send backward', 'Send to back']);
  assert.deepEqual(find(arrange.items, 'Layer order').items.map(item => item.hint), ['Ctrl Shift ]', 'Ctrl ]', 'Ctrl [', 'Ctrl Shift [']);
  assert.ok(arrange.items.filter(item => item.items).every(item => item.items.every(choice => !choice.icon)), 'submenu choices are text only');
});

test('Arrange selection requirements: Align two pieces, Distribute three, Group two, Ungroup a group, Lock and layers one object', () => {
  const rows = state => owner(state)[1].items;
  const align = state => find(rows(state), 'Align').items, spread = state => find(rows(state), 'Distribute').items;
  assert.ok(align({ units: 1 }).every(item => item.disabled) && align({ units: 2 }).every(item => !item.disabled));
  assert.ok(spread({ units: 2 }).every(item => item.disabled) && spread({ units: 3 }).every(item => !item.disabled));
  assert.equal(find(rows({ selected: 1 }), 'Group').disabled, true);
  assert.equal(find(rows({ selected: 2 }), 'Group').disabled, false);
  assert.equal(find(rows({ selected: 2 }), 'Ungroup').disabled, true);
  assert.equal(find(rows({ selected: 2, grouped: true }), 'Ungroup').disabled, false);
  assert.equal(find(rows({}), 'Lock').disabled, true);
  assert.equal(find(rows({ selected: 1 }), 'Lock').disabled, false);
  assert.equal(find(rows({ selected: 1, selectionLocked: true }), 'Unlock').disabled, false, 'Unlock shows for a locked selection');
  assert.equal(find(rows({ selected: 1, selectionLocked: true }), 'Lock'), undefined);
  assert.ok(find(rows({}), 'Layer order').items.every(item => item.disabled), 'no selection greys every layer choice');
  assert.ok(find(rows({ selected: 1 }), 'Layer order').items.every(item => !item.disabled));
  assert.equal(find(rows({}), 'Snap to grid').check, false);
  assert.equal(find(rows({ grid: true }), 'Snap to grid').check, true);
});

test('Arrange rows call the canvas api', () => {
  calls.length = 0;
  const [, arrange] = owner({ selected: 3, units: 3, grouped: true });
  find(find(arrange.items, 'Align').items, 'Middle').onSelect();
  find(find(arrange.items, 'Distribute').items, 'Vertically').onSelect();
  find(find(arrange.items, 'Layer order').items, 'Send to back').onSelect();
  for (const label of ['Group', 'Ungroup', 'Lock']) find(arrange.items, label).onSelect();
  find(arrange.items, 'Snap to grid').onToggle();
  assert.deepEqual(calls, [['arrange', 'middle'], ['arrange', 'spread-y'], ['order', 'back'], ['group'], ['ungroup'], ['lockSelection'], ['toggleGrid']]);
});

test('View: zooms, Workspace, Show / hide, Page guides; the old Mode, Keep tool active, shortcuts and slash rows are gone', () => {
  const view = owner({ selected: 1 }, { comments: { active: true, showPins: true, setPins() {} } })[2];
  assert.deepEqual(labels(view.items), ['Zoom in', 'Zoom out', 'Zoom to 100%', 'Fit canvas', 'Fit selection', 'Workspace', 'Show / hide', 'Page guides', 'Go to document start']);
  assert.deepEqual(labels(find(view.items, 'Workspace').items), ['Canvas', 'Editor']);
  assert.deepEqual(labels(find(view.items, 'Show / hide').items), ['Toolbar', 'Right panel', 'Minimap', 'Rabbit Hole Map', 'Comment pins', 'Learning suggestions']);
  assert.doesNotMatch(labels(walk(view.items)).join('|'), /Curious|Comments|Keep tool active|Keyboard shortcuts|Slash commands|Mode|Zoom to fit/);
  assert.deepEqual(find(view.items, 'Page guides').choice.options.map(option => option[0]), ['off', 'portrait', 'landscape'], 'the page-guide formats are kept');
  assert.deepEqual(['Zoom in', 'Zoom out', 'Zoom to 100%', 'Fit canvas'].map(label => find(view.items, label).hint), ['Ctrl +', 'Ctrl -', 'Shift 0', 'Shift 1']);
});

test('View: Fit selection needs a selection; Workspace marks the current mode; no study, layout or save commands', () => {
  assert.equal(find(owner({})[2].items, 'Fit selection').disabled, true);
  assert.equal(find(owner({ selected: 2 })[2].items, 'Fit selection').disabled, false);
  const modes = find(canvasEditMenus({ canvas, canvasState: {}, docView: 'editor', setDocView() {} })[2].items, 'Workspace').items;
  assert.deepEqual(modes.map(mode => [mode.label, mode.radio]), [['Canvas', false], ['Editor', true]]);
  assert.doesNotMatch(allMenus().flatMap(menu => labels(menu.items)).join('|'), /Study|layout|Save/i);
});

test('Show / hide drives the existing state: widgets through showWidget, comment pins and the right panel through their own setters', () => {
  calls.length = 0;
  const pins = [], panel = [];
  const view = owner({ minimap: true, holeMap: true, curious: true }, { comments: { active: true, showPins: true, setPins: on => pins.push(on) }, panel: { open: true, setOpen: on => panel.push(on) } })[2];
  const rows = find(view.items, 'Show / hide').items;
  assert.ok(rows.every(row => row.check !== undefined && !row.icon), 'labelled checked states, no decorative icons');
  for (const label of ['Toolbar', 'Minimap', 'Rabbit Hole Map', 'Learning suggestions']) find(rows, label).onToggle(false);
  find(rows, 'Comment pins').onToggle(false);
  find(rows, 'Right panel').onToggle(false);
  assert.deepEqual(calls, [['showWidget', 'toolbar', false], ['showWidget', 'minimap', false], ['showWidget', 'holeMap', false], ['showWidget', 'curious', false]]);
  assert.deepEqual([pins, panel], [[false], [false]]);
  assert.equal(find(rows, 'Toolbar').check, true, 'the toolbar is on until it is hidden');
  assert.equal(find(find(owner({ toolbar: false })[2].items, 'Show / hide').items, 'Toolbar').check, false);
});

test('Show / hide lists only what this canvas has: no Toolbar for a viewer, no Right panel without one, no Comment pins without comments', () => {
  const rows = extra => labels(find(canvasEditMenus({ canvas, canvasState: {}, docView: 'canvas', setDocView() {}, ...extra })[2].items, 'Show / hide').items);
  assert.deepEqual(rows({ drawing: false }), ['Minimap', 'Rabbit Hole Map', 'Learning suggestions']);
  assert.deepEqual(rows({}), ['Toolbar', 'Minimap', 'Rabbit Hole Map', 'Learning suggestions']);
});

test('View rows call the canvas api, and View is a menu of its own, so it stays reachable with the toolbar hidden', () => {
  calls.length = 0;
  const view = owner({ toolbar: false, selected: 1 })[2];
  find(view.items, 'Fit selection').onSelect();
  find(view.items, 'Zoom in').onSelect();
  assert.deepEqual(calls, [['zoomToSelection'], ['zoomIn']]);
  const set = [];
  find(canvasEditMenus({ canvas, canvasState: {}, docView: 'canvas', setDocView: mode => set.push(mode) })[2].items, 'Workspace').items[1].onSelect();
  assert.deepEqual(set, ['editor']);
});

test('every row with an icon draws it aria-hidden, 16px at about 1.75 stroke; no three-dot icon or deferred layout command ships', () => {
  const rows = allMenus().flatMap(menu => menu.items).filter(item => item.icon);
  assert.ok(rows.length > 30, `${rows.length} icon rows`);
  for (const row of rows) {
    const icon = menuIcon(row.icon);
    assert.equal(icon.props['aria-hidden'], 'true', `${row.label}: aria-hidden`);
    assert.equal(icon.props.size, MENU_ICON_SIZE);
    assert.equal(icon.props.strokeWidth, MENU_ICON_STROKE);
    assert.ok(row.label.length > 2, 'a visible label stays beside the icon');
  }
  assert.equal(MENU_ICON_SIZE, 16);
  const bar = readFileSync(new URL('./CanvasMenubar.jsx', import.meta.url), 'utf8');
  const source = readFileSync(new URL('./canvas-menus.js', import.meta.url), 'utf8') + bar;
  assert.doesNotMatch(source, /\bSave\b|PanelsLeftBottom|MoreHorizontal|Ellipsis|MoreVertical/, 'the deferred Study layouts and overflow icons do not ship');
  assert.doesNotMatch(allMenus().flatMap(menu => labels(menu.items)).join('|'), /Saved layouts|Save current layout|Study/);
  // The tick and both chevrons the renderer draws are aria-hidden too.
  assert.equal((bar.match(/<(Check|ChevronRight|ChevronDown)\b/g) || []).length, 4);
  assert.equal((bar.match(/<(Check|ChevronRight|ChevronDown)\b[^>]*aria-hidden="true"/g) || []).length, 4);
});

test('no app-owned menu label ends in an ellipsis', () => {
  for (const { items } of allMenus()) for (const item of items) assert.doesNotMatch(item.label || '', /\.\.\.|…/, item.label);
});

// Pinned Study (UI-27 Release 1, owner-approved spec 2026-10-22: Canvas and Study belong inside View, no extra top row).
test('View: Canvas and Study radio rows above Workspace only where the page passes study; a shared canvas never gets them', () => {
  const modes = [];
  const study = mode => ({ mode, setMode: next => modes.push(next) });
  const view = owner({}, { study: study('canvas') })[2];
  assert.deepEqual(groups(view.items), [['Zoom in', 'Zoom out', 'Zoom to 100%', 'Fit canvas', 'Fit selection'], ['Canvas', 'Study'], ['Workspace', 'Show / hide', 'Page guides'], ['Go to document start']]);
  assert.deepEqual(['Canvas', 'Study'].map(label => find(view.items, label).radio), [true, false]);
  assert.deepEqual(['Canvas', 'Study'].map(label => find(owner({}, { study: study('study') })[2].items, label).radio), [false, true]);
  find(view.items, 'Study').onSelect();
  find(view.items, 'Canvas').onSelect();
  assert.deepEqual(modes, ['study', 'canvas']);
  assert.deepEqual(labels(find(view.items, 'Workspace').items), ['Canvas', 'Editor'], 'the document Canvas / Editor choice is untouched');
  assert.ok(!labels(build({})[2].items).includes('Study'), 'no study given (a shared canvas): no rows');
  assert.doesNotMatch(labels(walk(view.items)).join('|'), /layout|Save|\.\.\.|…/i, 'no Release 2 layout rows');
});
