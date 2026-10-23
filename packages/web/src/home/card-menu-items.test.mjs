// One ⋮ for canvases and projects (owner, 2026-10-09: "make sure the ... for Projects and Canvas are consistent"):
// card-menu-items.js is the one list both render, on the card and in the open project's header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_MENU, menuRows } from './card-menu-items.js';

const owned = kind => ({ kind, canEdit: true });
const ids = rows => rows.map(r => (r.separator ? '|' : r.id));
const shape = item => `${item.label} · ${item.icon}`;

test('the shared rows match in label, icon and order; the rows for one type are exactly these', () => {
  const canvas = menuRows(owned('canvas')).filter(r => !r.separator), project = menuRows(owned('repository')).filter(r => !r.separator);
  const shared = rows => rows.filter(r => r.types.length === 2).map(shape);
  assert.deepEqual(shared(canvas), shared(project), 'same labels, icons and order on both');
  // Owner brief 2026-10-22: Open | Pin, Rename, Move to folder, Change cover | Share | Move to Trash, Trash last, those labels and icons.
  assert.deepEqual(shared(canvas), ['Open · ArrowUpRight', 'Pin · Pin', 'Rename · PenLine', 'Move to folder · FolderInput', 'Change cover · ImageUp', 'Share · Link2', 'Move to Trash · Trash2']);
  assert.deepEqual(canvas.filter(r => r.types.length === 1).map(r => r.id), ['describe', 'duplicate', 'analytics'], 'canvas only');
  assert.deepEqual(project.filter(r => r.types.length === 1).map(r => r.id), ['map', 'new_canvas'], 'project only');
  assert.ok(CARD_MENU.every(item => item.separator || item.icon), 'every row has an icon');
  assert.equal(new Set(CARD_MENU.filter(i => !i.separator).map(i => i.label)).size, CARD_MENU.filter(i => !i.separator).length, 'one label each: Move to Trash, never Delete');
  assert.ok(CARD_MENU.every(item => item.separator || !/\.\.\.|\u2026/.test(item.label + (item.alt?.label || ''))), 'no trailing ellipsis in any label');
});

test('the removed rows stay removed: Learn, Visibility, Copy link, Use canvas snapshot, Archive, Share / Manage link, Change thumbnail', () => {
  const labels = CARD_MENU.filter(i => !i.separator).flatMap(i => [i.label, i.alt?.label]).filter(Boolean);
  for (const gone of ['Learn', 'Visibility', 'Copy link', 'Use canvas snapshot', 'Archive', 'Share / Manage link', 'Change thumbnail', 'Duplicate project']) assert.ok(!labels.includes(gone), gone);
  assert.deepEqual(CARD_MENU.filter(i => !i.separator).map(i => i.id).filter(id => ['learn', 'visibility', 'copy', 'snapshot', 'archive'].includes(id)), []);
});

test('the full lists, as the owner sees them, and what a card you do not own keeps', () => {
  assert.deepEqual(ids(menuRows(owned('canvas'))), ['open', '|', 'pin', 'rename', 'describe', 'duplicate', 'folder', 'thumbnail', '|', 'share', 'analytics', '|', 'trash']);
  assert.deepEqual(ids(menuRows(owned('repository'))), ['open', 'map', 'new_canvas', '|', 'pin', 'rename', 'folder', 'thumbnail', '|', 'share', '|', 'trash']);
  // A row's own condition hides it in place; a separator never leads, trails or doubles.
  const shown = id => !['folder', 'analytics'].includes(id);
  assert.deepEqual(ids(menuRows(owned('canvas'), shown)), ['open', '|', 'pin', 'rename', 'describe', 'duplicate', 'thumbnail', '|', 'share', '|', 'trash']);
  assert.deepEqual(ids(menuRows({ kind: 'repository', canEdit: false })), ['open', 'map'], 'not yours: navigation only');
  assert.deepEqual(ids(menuRows({ kind: 'canvas', canEdit: false })), ['open'], 'a canvas you do not own');
  assert.deepEqual(ids(menuRows({ kind: 'job', canEdit: true })), [], 'no menu for an app');
  // Trash is last, below every other row, never above Move to folder.
  for (const kind of ['canvas', 'repository']) assert.equal(menuRows(owned(kind)).at(-1).id, 'trash', kind);
});

// Owner brief 2026-10-16 item 2: project management (this menu) lives in Home and the Library; the open project's canvas
// header names the project as plain text and has no project menu.
test('CardMenu renders the list; the open project\'s header has no project menu', () => {
  const menu = readFileSync(new URL('./CardMenu.jsx', import.meta.url), 'utf8');
  assert.match(menu, /\{menu && menuRows\(menu\.a, rowShown\(menu\.a\)\)\.map\(\(item, i\) => \{/);
  assert.doesNotMatch(menu, /menu\?\.a\.kind === 'repository' \? \(/, 'no second hand-built menu');
  const header = readFileSync(new URL('../RepositoryPage.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(header, /useCardMenu|data-project-more|projectMenu/);
});
