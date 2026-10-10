// Library folders (docs/features/library-folders.md): the pure rules, and the wiring the brief fixes - Library only, one
// menu definition, icons on every row, drag onto a tile, no toast as the primary feedback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DRAG_TYPE, FOLDER_COLORS, NAME_MAX, cleanName, deleteCopy, folderCounts, folderInk, inView, itemsLabel, nextColor } from './library-folders.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const apps = [{ name: 'canvas-1' }, { name: 'canvas-2' }, { name: 'repo-1' }, { name: 'counter' }];
const items = { 'canvas-1': 'A', 'repo-1': 'A', 'canvas-2': 'B', 'canvas-gone': 'B' };
const names = (list) => list.map((a) => a.name);

test('the palette is the canvas\'s six swatches, as the server keeps them; the ink swatch follows the theme', () => {
  assert.deepEqual(FOLDER_COLORS.map((c) => c.id), ['#37352f', '#2383e2', '#b42318', '#1a7f37', '#f59e0b', '#7c3aed']);
  assert.match(read('../../control-plane/src/library-folders.js'), /export const FOLDER_COLORS = PIN_COLORS;/);
  assert.equal(folderInk('#37352f'), 'var(--color-ink)');
  assert.equal(folderInk('#2383e2'), '#2383e2');
  assert.deepEqual([nextColor([]), nextColor([1]), nextColor([1, 2, 3, 4, 5])], ['#2383e2', '#b42318', '#37352f'], 'blue first, then round the palette');
});

test('inside a folder only its items show; at the top the filed ones sit in their tiles unless a search looks everywhere', () => {
  assert.deepEqual(names(inView(apps, items, 'A')), ['canvas-1', 'repo-1']);
  assert.deepEqual(names(inView(apps, items, 'B')), ['canvas-2']);
  assert.deepEqual(names(inView(apps, items, null)), ['counter']);
  assert.deepEqual(names(inView(apps, items, null, true)), names(apps), 'a search finds a filed card');
  assert.deepEqual(names(inView(apps, {}, null)), names(apps));
});

test('N items counts what the Library lists: a trashed item keeps its row and is not counted', () => {
  assert.deepEqual(folderCounts(apps, items), { A: 2, B: 1 });
  assert.deepEqual(folderCounts([], items), {});
  assert.deepEqual([itemsLabel(0), itemsLabel(1), itemsLabel(2)], ['0 items', '1 item', '2 items']);
});

test('the Delete confirm says the items go back to the Library and nothing is deleted', () => {
  assert.deepEqual(deleteCopy('Papers', 3), { title: "Delete folder 'Papers'?", body: 'Its 3 items go back to Library; nothing is deleted.' });
  assert.deepEqual(deleteCopy('Papers', 1).body, 'Its 1 item goes back to Library; nothing is deleted.');
  assert.deepEqual(deleteCopy('Papers', 0).body, 'It is empty; nothing is deleted.');
});

test('a name is trimmed to one space and 1 to 60 characters, as the server keeps it', () => {
  assert.equal(cleanName('  Reading   list '), 'Reading list');
  assert.equal(cleanName('x'.repeat(NAME_MAX)), 'x'.repeat(60));
  for (const bad of ['', '   ', 'x'.repeat(61), null, undefined]) assert.equal(cleanName(bad), null, JSON.stringify(bad));
});

test('Library only: the card menu shows Move to folder only with the Library\'s folders; Home passes none', () => {
  const menu = read('./home/CardMenu.jsx'), library = read('./LibraryViews.jsx'), home = read('./Home.jsx');
  assert.match(menu, /export function useCardMenu\(\{ org, email, apps = \[\], onArchive = null, onChanged, folders = null \}\)/);
  assert.match(menu, /const folderRows = folders && menu\?\.a\.canEdit && </, 'your own canvas or project');
  assert.match(library, /onChanged: onForked, folders \}\);/);
  assert.doesNotMatch(home, /folders/);
  // Projects and canvases use one menu; folder actions follow its shared rows.
  assert.match(menu, /menuRows\(menu.a, rowShown\(menu.a\)\)/);
  assert.match(menu, /\{folderRows && <><div className="my-1 border-t border-line" \/>\{folderRows\}<\/>\}/);
  // Every row has an icon: the submenu, each folder (its colour dot), New folder…, Remove from folder.
  assert.match(menu, /<FolderInput size=\{16\}[^>]*\/>\s*<span className="min-w-0 flex-1">Move to folder<\/span>/);
  assert.match(menu, /role="menuitemradio" aria-checked=\{inFolder === f\.id\} data-folder-option=\{f\.id\}/);
  assert.match(menu, /style=\{\{ background: folderInk\(f\.color\) \}\}/);
  assert.match(menu, /<MenuItem icon=\{FolderPlus\} data-menu-folder-new .*>New folder…<\/MenuItem>/);
  assert.match(menu, /\{inFolder && <MenuItem icon=\{FolderMinus\} data-menu-folder-remove .*>Remove from folder<\/MenuItem>\}/);
  assert.match(menu, /folders\.newFolder\(a\.name\)/, 'New folder… files the card in the same step');
});

test('the folder ⋮ has Rename, Colour and Delete, each with an icon; the dialogs are the card rename\'s ConfirmDialog', () => {
  const folders = read('./LibraryFolders.jsx');
  assert.match(folders, /<MenuItem icon=\{PenLine\} data-folder-rename .*>Rename<\/MenuItem>/);
  assert.match(folders, /<Palette size=\{16\}[^>]*\/>\s*<span className="min-w-0 flex-1">Colour<\/span>/);
  assert.match(folders, /<MenuItem icon=\{Trash2\} data-folder-delete .*>Delete folder<\/MenuItem>/);
  assert.match(folders, /<ConfirmDialog \{\.\.\.deleteCopy\(dialog\.folder\.name, counts\[dialog\.folder\.id\] \|\| 0\)\} confirmLabel="Delete folder"/);
  assert.match(folders, /title=\{dialog\.kind === 'new' \? 'New folder' : 'Rename folder'\}/);
  assert.match(folders, /role="radio" aria-checked=\{value === id\} aria-label=\{label\}/, 'swatches reachable by keyboard');
  assert.doesNotMatch(folders, /toast\((?!e\.message)/, 'feedback is the list itself; toasts carry only a server refusal');
  // The folder ⋮ on a tile is the link's sibling, never nested inside it; the tile and the Library crumb take a dragged card.
  assert.match(folders, /<\/a>\s*<IconBtn title="Folder options"/);
  assert.match(folders, /onDrop=\{dropped\(\(\) => setOver\(null\), \(item\) => onDrop\(item, f\.id\)\)\}/);
  assert.match(folders, /data-folder-crumb-library[\s\S]*onDrop=\{dropped\(setOver, onDropOut\)\}/);
  assert.match(read('./LibraryViews.jsx'), /draggable: true, onDragStart: \(e\) => \{ e\.dataTransfer\.setData\(DRAG_TYPE, a\.name\)/);
  assert.equal(DRAG_TYPE, 'application/x-rabbit-hole-library-item');
});

test('the Library header: New folder beside the filters, the open folder\'s ⋮ in its place; Explore, Home and shares never read folders', () => {
  const app = read('./App.jsx');
  assert.match(app, /<Button variant="secondary" data-new-folder onClick=\{\(\) => lib\.newFolder\(\)\}>/);
  assert.match(app, /\{openFolder && <FolderCrumb folder=\{openFolder\} onDropOut=\{lib\.unfile\} \/>\}/);
  assert.match(app, /folders=\{lib\} folderId=\{folderId\} searching=\{!!needle\}/);
  for (const file of ['./Home.jsx', './home/PublicCards.jsx', './SharedBoardPage.jsx', './CreatorProfile.jsx', './Sidebar.jsx']) assert.doesNotMatch(read(file), /library\/folders|LibraryFolders/, file);
});
