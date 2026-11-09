// One name to a card, one line to a title (owner 2026-11-07): unique-title.js, TITLE_MAX and the places that use them. Pure functions and source scans:
// no browser. The server half (canvas titles) is control-plane/test/canvas-naming.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TITLE_MAX, DERIVED_MAX, cardTitleOf, cutTitle, fullTitleOf, namedTitleOf, renameBlock } from './card-rename.js';
import { nameKey, positionHint, titleTaken, uniqueTitle, uniquifyBlocks } from './unique-title.js';

const read = name => readFileSync(new URL('./' + name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const card = (id, title, type = 'explanation', extra = {}) => ({ id, type, title, ...extra });
const shown = block => cardTitleOf(block);

test('uniqueTitle: the wanted name when free; else the next free (N); a trailing (N) is dropped first; case and spaces do not make a name different', () => {
  assert.equal(uniqueTitle([], '  Gradients '), 'Gradients');
  assert.equal(uniqueTitle(['Gradients'], 'Gradients'), 'Gradients (2)');
  assert.equal(uniqueTitle(['Gradients', 'Gradients (2)'], 'Gradients'), 'Gradients (3)');
  assert.equal(uniqueTitle(['Gradients', 'Gradients (2)'], 'Gradients (2)'), 'Gradients (3)', 'a copy of "(2)" steps on from the base');
  assert.equal(uniqueTitle(['Gradients', 'Gradients (3)'], 'gradients'), 'gradients (2)', 'the smallest free number, and the case as wanted');
  assert.equal(uniqueTitle(['A  B'], ' a b '), 'a b (2)', 'whitespace is collapsed before comparing');
  assert.equal(uniqueTitle(['Free'], 'Other'), 'Other');
  assert.equal(nameKey('  Hello   World '), 'hello world');
});

test('uniqueTitle fits the limit by trimming the BASE, never the suffix', () => {
  const long = 'abcdefghijklmnopqrstuvwxyz';
  const next = uniqueTitle([long.slice(0, TITLE_MAX)], long.slice(0, TITLE_MAX), { max: TITLE_MAX });
  assert.ok(next.length <= TITLE_MAX && next.endsWith(' (2)'), next);
  assert.equal(next, long.slice(0, TITLE_MAX - 4) + ' (2)');
  const third = uniqueTitle([long.slice(0, TITLE_MAX), next], long.slice(0, TITLE_MAX), { max: TITLE_MAX });
  assert.ok(third.length <= TITLE_MAX && third.endsWith(' (3)'));
  assert.equal(uniqueTitle(['x'], 'x', { max: 2 }), 'x (2)', 'a tiny limit keeps one character and the whole suffix');
});

test('uniquifyBlocks: later duplicates step in board order, the SAME array comes back when nothing changes, placeholders are never names', () => {
  const blocks = [card('1', 'Gradients'), card('2', 'gradients'), card('3', 'Gradients'), { id: '4', type: 'note' }, { id: '5', type: 'note' }, { id: '6', type: 'divider' }];
  const out = uniquifyBlocks(blocks);
  assert.deepEqual(out.slice(0, 3).map(shown), ['Gradients', 'gradients (2)', 'Gradients (3)']);
  assert.deepEqual([out[3], out[4], out[5]], [blocks[3], blocks[4], blocks[5]], 'cards with no name are untouched: a placeholder is not a name');
  assert.equal(uniquifyBlocks(out), out, 'a board that is already unique is returned as it is (no state update, no loop)');
  assert.equal(blocks[1].customTitle, undefined, 'the input is never mutated');
  assert.equal(out[1].title, 'gradients', 'the card\'s own title is kept; the stepped name is its display name (customTitle)');
  assert.equal(stable(blocks), stable(blocks), 'the same on every load');
  function stable(list) { return JSON.stringify(uniquifyBlocks(list)); }
});

test('uniquifyBlocks: a card that is NEW steps, the one that was there keeps its name, wherever the new one sits in board order', () => {
  const blocks = [card('new', 'Gradients'), card('old', 'Gradients')];
  const out = uniquifyBlocks(blocks, new Set(['old']));
  assert.deepEqual(out.map(shown), ['Gradients (2)', 'Gradients']);
  assert.equal(uniquifyBlocks(out, new Set(['old', 'new'])), out);
});

test('uniquifyBlocks: copy, duplicate and paste of a card get (N) against the target board, and a copy of a (N) card steps from the base', () => {
  const board = [card('a', 'Gradients'), card('b', 'Gradients (2)', 'explanation')];
  const pasted = [...board, card('copy', 'Gradients (2)')];
  const out = uniquifyBlocks(pasted, new Set(['a', 'b']));
  assert.deepEqual(out.map(shown), ['Gradients', 'Gradients (2)', 'Gradients (3)']);
  const twice = uniquifyBlocks([...out, card('copy2', 'Gradients')], new Set(['a', 'b', 'copy']));
  assert.equal(shown(twice[3]), 'Gradients (4)');
});

test('uniquifyBlocks: files and cards without a title field step through customTitle; a model title and a file label are never overwritten', () => {
  const blocks = [{ id: 'f1', type: 'file', label: 'en.md', kind: 'markdown' }, { id: 'f2', type: 'file', label: 'en.md', kind: 'markdown' }, { id: 'w', type: 'wiki', title: 'Tide' }, { id: 'w2', type: 'wiki', title: 'Tide' }];
  const out = uniquifyBlocks(blocks);
  assert.deepEqual([out[1].customTitle, out[1].label], ['en.md (2)', 'en.md'], 'the file name stays the file name');
  assert.deepEqual([out[3].customTitle, out[3].title], ['Tide (2)', 'Tide'], 'the article a wiki card loads is unchanged');
  assert.equal(out[0], blocks[0]);
});

test('headings step among headings only, in their own text; a heading and a card may share a title', () => {
  const blocks = [{ id: 'h1', type: 'heading', text: 'Intro' }, { id: 'h2', type: 'heading', text: 'intro' }, card('c', 'Intro')];
  const out = uniquifyBlocks(blocks);
  assert.deepEqual([out[1].text, out[2].title, out[2].customTitle], ['intro (2)', 'Intro', undefined]);
  const long = 'S'.repeat(150);
  const out2 = uniquifyBlocks([{ id: 'a', type: 'heading', text: long }, { id: 'b', type: 'heading', text: long }]);
  assert.equal(out2[1].text, long + ' (2)', 'a heading is document content: its whole text is kept, only a suffix is added');
});

test('titleTaken: another card of the same scope shows the name (case-insensitive); its own name and a placeholder are free', () => {
  const blocks = [card('a', 'Gradients'), card('b', 'Other'), { id: 'n', type: 'note' }, { id: 'h', type: 'heading', text: 'Gradients' }];
  assert.equal(titleTaken(blocks, ' GRADIENTS ', 'b'), true);
  assert.equal(titleTaken(blocks, 'Gradients', 'a'), false, 'its own name');
  assert.equal(titleTaken(blocks, 'Gradients', 'b', 'heading'), true, 'a heading competes with headings');
  assert.equal(titleTaken(blocks, 'Untitled note', 'b'), false, 'a placeholder is not a name');
  assert.equal(titleTaken(blocks, '', 'b'), false);
  assert.equal(positionHint(blocks, 'b'), '#2');
  assert.equal(positionHint(blocks, 'zzz'), '');
});

test('a generated or imported title is shown whole up to DERIVED_MAX, then cut on a word boundary with no ellipsis; the stored text stays intact (the header is one clipped line)', () => {
  const real = card('r', 'Why trees, and what a tree actually does');
  assert.equal(shown(real), 'Why trees, and what a tree actually does', 'a normal Tutor title is never cut');
  const stored = card('e', 'Why does coffee cool faster at first? A long model title that goes on and on and on past the proposal bound');
  const text = shown(stored);
  assert.ok(text.length <= DERIVED_MAX && !/[.…]$/.test(text) && !text.includes('…'), text);
  assert.equal(text, 'Why does coffee cool faster at first? A long model title that goes on and on');
  assert.equal(stored.title.length > DERIVED_MAX, true, 'the card own title is untouched');
  assert.equal(fullTitleOf(stored), stored.title, 'the whole text is available (tooltip, chat context)');
  assert.equal(cutTitle('x'.repeat(100)).length, TITLE_MAX, 'one long word is cut hard at the default limit');
  assert.equal(cutTitle('short'), 'short');
  assert.equal(shown(card('l', 'y'.repeat(200))).length, DERIVED_MAX, 'a 200-character legacy title');
  assert.equal(namedTitleOf({ type: 'note' }), '', 'no name, only a placeholder');
});

test('TITLE_MAX is the one limit: renameBlock, the rename editor input, uniqueTitle callers and the derived display all use it', () => {
  const canvas = read('AdaptiveCanvas.jsx'), rename = read('card-rename.js'), unique = read('unique-title.js');
  assert.match(rename, /export const TITLE_MAX = \d+;/);
  assert.equal((rename.match(/TITLE_MAX/g) || []).length >= 4, true);
  assert.ok(canvas.includes("maxLength={heading ? 200 : TITLE_MAX}"), 'the inline rename input stops typing at the limit');
  assert.ok(unique.includes("max: scope === 'heading' ? HEADING_MAX : TITLE_MAX"), 'a card suffix fits the same limit');
  assert.equal(renameBlock([{ id: 'x', type: 'quiz' }], 'x', 'a'.repeat(TITLE_MAX + 10))[0].customTitle.length, TITLE_MAX);
});

test('the card header title wraps (owner 2026-11-08): two lines, three on a narrow header, an ellipsis only past that, the whole text as the tooltip; never the one nowrap line', () => {
  const header = read('CardHeader.jsx');
  assert.match(header, /className=\{`min-w-0 flex-1 line-clamp-2 break-words @max-\[405px\]:line-clamp-3 /);
  assert.ok(!/min-w-0 flex-1 truncate whitespace-nowrap/.test(header), 'the one-line clip is gone');
  assert.ok(header.includes("title={full.length > TITLE_TWO_LINES ? full : canRename ? 'Double-click to rename' : undefined}"));
});

test('the rename editor refuses a name another card has, in the editor, and keeps the old name; a ToC section does the same', () => {
  const canvas = read('AdaptiveCanvas.jsx'), toc = read('TableOfContents.jsx');
  assert.ok(canvas.includes("'Another card already has this name'"));
  assert.ok(canvas.includes("'Another section already has this name'"));
  assert.ok(canvas.includes('if (titleTaken(blocks, name, id, heading ? \'heading\' : \'card\'))'));
  assert.match(canvas, /setRenaming\(previous => \(\{ \.\.\.previous, error: /);
  assert.ok(canvas.includes('data-card-rename-error'), 'the message is drawn beside the input');
  assert.ok(toc.includes("return { error: 'Another section already has this name' }"));
  assert.ok(toc.includes('data-toc-editor-error'));
});

test('every way a card reaches the board passes the one normalizer: the load initializer and the effect over blocks, none for a view-only board', () => {
  const canvas = read('AdaptiveCanvas.jsx');
  assert.ok(canvas.includes('useState(() => uniquifyBlocks('), 'a board as it loads: later duplicates stepped in memory, not saved until the next ordinary save');
  assert.ok(canvas.includes('const next = readOnlyRef.current ? blocks : uniquifyBlocks(blocks, knownBlockIds.current);'), 'a read-only board writes nothing');
  assert.ok(canvas.includes('if (next !== blocks) setBlocks(next);'));
  // The paths that add a card (paste, duplicate, Alt-drag, generated results, imports, commands) all call setBlocks with the new card; none keeps its own naming rule.
  const inserts = canvas.split('\n').filter(line => /setBlocks\(previous => \[\.\.\.previous/.test(line) || /setBlocks\(previous => \[\.\.\.previous\.slice/.test(line));
  assert.ok(inserts.length >= 8, 'the insertion sites are many: ' + inserts.length + ' (that is why the rule lives in one effect, not at each)');
});

test('the Add a link card picker shows a board-position hint for equal or empty names so they stay apart', () => {
  const canvas = read('AdaptiveCanvas.jsx'), page = read('LearnPage.jsx');
  assert.ok(canvas.includes('uses.get(nameKey(row.title)) > 1 ? { ...row, path: positionHint(blocksRef.current, row.id) } : row'));
  assert.ok(page.includes('({ id: card.id, title: card.title, path: card.path })'), 'the picker receives the hint (ItemPicker draws item.path before the title)');
});
