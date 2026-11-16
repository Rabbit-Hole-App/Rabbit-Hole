import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Owner 2026-11-15: one name and one icon per action, icons not text buttons, the same wording in the strips and the menus.
test('one vocabulary: each action has one name and a distinct icon', () => {
  const table = [...read('ActionIcons.jsx').matchAll(/^  (\w+): \{ label: '([^']+)', Icon: (\w+) \},$/gm)].map(m => [m[1], m[2], m[3]]);
  assert.deepEqual(table.map(r => [r[0], r[1]]), [['ask', 'Ask in chat'], ['chat', 'Add to chat'], ['canvas', 'Add to canvas'], ['graph', 'Add selection as graph'], ['repo', 'Open in repository'], ['copy', 'Copy'], ['close', 'Close all']]);
  assert.equal(new Set(table.map(r => r[2])).size, table.length, 'no two actions share an icon');
});

test('the Graph row, the Files strip and the viewer strip draw the shared group; no "Add in chat" or "Add code card" wording is left', () => {
  const graph = read('GraphPanel.jsx'), reader = read('CodeReader.jsx'), source = read('RepositorySource.jsx');
  assert.match(graph, /<ActionBar side="top" actions=\{\[[\s\S]*id: 'chat'[\s\S]*id: 'graph'[\s\S]*id: 'canvas'[\s\S]*id: 'close', label: 'Clear selection'[\s\S]*clearSelection\(repository\)/);
  assert.match(reader, /tail=\{panel && onCloseAll \? \[\{ id: 'close'/);
  assert.match(source, /<ActionBar actions=\{\[\.\.\.\(lead \|\| \[\]\), repo && commit && \{ id: 'repo'/);
  for (const [name, text] of [['GraphPanel', graph], ['CodeReader', reader], ['RepositorySource', source]]) assert.doesNotMatch(text, /Add in chat|Add code card|>Close all</, name);
});

test('a code card is tall enough to read (480, was 320)', async () => {
  const { CODE_CARD } = await import('./code-card.js');
  assert.deepEqual(CODE_CARD, { w: 480, h: 480 });
});

// Owner 2026-11-15: tooltips consistent. Every action icon shows the house Tip (name bold, description under it), not the browser's native title.
test('action icons draw the shared Tip, never a native title', () => {
  const bar = read('ActionIcons.jsx');
  assert.match(bar, /import \{ IconBtn, Tip \} from '\.\/ui\.jsx'/);
  assert.match(bar, /<Tip key=\{action\.id\} label=\{label\} info=\{info\(action\.title, label\)\} side=\{side\}>/);
  assert.doesNotMatch(bar, /\btitle=\{/, 'the name rides the Tip, so no native title is drawn');
  assert.match(read('GraphPanel.jsx'), /<ActionBar side="top" actions/, 'the Graph row sits at the panel bottom, so its tips open upward');
});

// Owner 2026-11-15: the chat strip is centred on the whole window. Study side by side sets --study-shift (minus half the pane's width) on the canvas frame and the composer's `translate` follows it:
// the frame's centre is (pane + canvas) / 2 from the window's left edge, so minus pane / 2 lands on the window's centre. With no Study (or stacked) the variable is unset, `translate` computes to none
// (no stacking context, nothing moves), and the frame sits above the pane (z 30 over 20) so the shifted strip keeps its clicks (strip audit 2026-11-15).
test('the chat strip centres on the whole window: the composer shifts by half the Study pane width, above the pane, and only then', () => {
  const pane = read('StudyPane.jsx'), canvas = read('AdaptiveCanvas.jsx');
  assert.match(pane, /frame\.style\.setProperty\('--study-shift', `\$\{-Math\.round\(place\.marginLeft \/ 2\)\}px`\)/);
  assert.match(pane, /frame\.style\.zIndex = side \? '30' : ''/);
  assert.match(pane, /frame\.style\.removeProperty\('--study-shift'\); frame\.style\.zIndex = ''/, 'leaving Study puts the strip back');
  assert.match(canvas, /data-canvas-composer [^\n]*style=\{\{ translate: 'var\(--study-shift\)' \}\}/);
  assert.doesNotMatch(canvas, /--study-pane-w/);
});

// Owner 2026-11-15: the Files X closes only the bottom panel, the open file. The tree, its folders and the pane stay.
test('the Files X closes only the open file', () => {
  const reader = read('CodeReader.jsx');
  assert.match(reader, /const closeFile = \(\) => onCloseAll\?\.\(\);/);
  assert.match(reader, /label: 'Close', onClick: closeFile, title: 'Close: the open file'/);
  assert.doesNotMatch(reader, /small:close-files|removeAttribute\('open'\)/, 'no folding, no closing the pane');
  assert.doesNotMatch(read('LearnPage.jsx'), /small:close-files/);
});

// Owner 2026-11-15, with the screenshot: after the X the bottom panel (the reader) is gone, not an empty "Select a file" box. The tree takes the whole pane.
test('Files with no file open: the bottom panel and its divider are gone and the tree fills the pane', () => {
  const reader = read('CodeReader.jsx');
  assert.match(reader, /const shut = panel && stacked && !open;/);
  assert.match(reader, /\{stacked && !shut && <div role="separator"/, 'no divider without a bottom panel');
  assert.match(reader, /\$\{shut \? 'min-h-0 flex-1' : 'shrink-0'\} overflow-y-auto/, 'the tree grows to fill');
  assert.match(reader, /\{!shut && <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 pt-2"/, 'the reader box is not drawn');
});

// Owner 2026-11-15: tooltips consistent and above everything. <Tip>, the Sidebar's tip and one layer for every native `title` all draw in the browser's top layer (popover).
test('tooltips: one look, in the top layer, so no panel or dialog covers them', () => {
  const ui = read('ui.jsx'), layer = read('TooltipLayer.jsx'), main = read('main.jsx');
  assert.match(ui, /export const TIP_BOX = '[^']*bg-ink[^']*\[&:popover-open\]:flex'/);
  assert.match(ui, /<span ref=\{pop\} popover="manual" role="tooltip" className=\{TIP_BOX\}>/, 'Tip is a popover, not an absolutely placed box');
  assert.doesNotMatch(ui, /group-hover\/tip:flex/);
  assert.match(layer, /<span ref=\{box\} popover="manual" role="tooltip" data-tooltip-layer className=\{`\$\{TIP_BOX\}/, 'the title layer wears the same look');
  assert.match(layer, /removeAttribute\('title'\)/, 'the native bubble is replaced, not doubled');
  assert.match(layer, /setAttribute\('title', target\.dataset\.tipTitle\)/, 'and the title comes back when the pointer leaves');
  assert.match(main, /<TooltipLayer \/>/, 'mounted once for every page');
  assert.match(read('Sidebar.jsx'), /data-sidebar-tip popover="manual"/, 'the Sidebar tip is in the top layer too');
});
