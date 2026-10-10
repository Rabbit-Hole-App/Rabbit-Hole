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
  assert.deepEqual(shared(canvas), ['Open · ArrowUpRight', 'Rename · PenLine', 'Visibility · Eye', 'Share / Manage link · Link2', 'Copy link · Link',
    'Change thumbnail · ImageUp', 'Use canvas snapshot · RotateCcw', 'Move to Trash · Trash2']);
  assert.deepEqual(canvas.filter(r => r.types.length === 1).map(r => r.id), ['describe', 'duplicate', 'analytics', 'archive'], 'canvas only');
  assert.deepEqual(project.filter(r => r.types.length === 1).map(r => r.id), ['learn', 'map', 'pin', 'new_canvas'], 'project only');
  assert.ok(CARD_MENU.every(item => item.separator || item.icon), 'every row has an icon');
  assert.equal(new Set(CARD_MENU.filter(i => !i.separator).map(i => i.label)).size, CARD_MENU.filter(i => !i.separator).length, 'one label each: Move to Trash, never Delete');
});

test('the full lists, as the owner sees them, and what a card you do not own keeps', () => {
  assert.deepEqual(ids(menuRows(owned('canvas'))), ['open', 'rename', 'describe', 'duplicate', '|', 'visibility', 'share', 'copy', 'thumbnail', 'snapshot', 'analytics', '|', 'archive', 'trash']);
  assert.deepEqual(ids(menuRows(owned('repository'))), ['open', 'learn', 'map', 'pin', 'rename', 'new_canvas', '|', 'visibility', 'share', 'copy', 'thumbnail', 'snapshot', '|', 'trash']);
  // A row's own condition hides it in place; a separator never leads, trails or doubles.
  const shown = id => !['snapshot', 'analytics'].includes(id);
  assert.deepEqual(ids(menuRows(owned('canvas'), shown)), ['open', 'rename', 'describe', 'duplicate', '|', 'visibility', 'share', 'copy', 'thumbnail', '|', 'archive', 'trash']);
  assert.deepEqual(ids(menuRows({ kind: 'repository', canEdit: false })), ['open', 'learn', 'map', 'pin'], 'not yours: navigation only');
  assert.deepEqual(ids(menuRows({ kind: 'job', canEdit: true })), [], 'no menu for an app');
});

test('CardMenu renders the list, and the open project\'s header opens the same menu', () => {
  const menu = readFileSync(new URL('./CardMenu.jsx', import.meta.url), 'utf8');
  assert.match(menu, /\{menu && menuRows\(menu\.a, rowShown\(menu\.a\)\)\.map\(\(item, i\) => \{/);
  assert.doesNotMatch(menu, /menu\?\.a\.kind === 'repository' \? \(/, 'no second hand-built menu');
  const header = readFileSync(new URL('../RepositoryPage.jsx', import.meta.url), 'utf8');
  assert.match(header, /const headerMenu=useCardMenu\(/);
  assert.match(header, /<IconBtn data-project-more title="More" aria-label="More" onClick=\{e=>headerMenu\.onMore\(app\)\(e\)\}>/);
});
