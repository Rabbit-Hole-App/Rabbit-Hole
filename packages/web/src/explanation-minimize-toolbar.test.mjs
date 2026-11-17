// The card toolbar for an Explanation (owner 2026-11-08): Minimize in the Focus icon's place, Focus in the card's right-click menu, Open renamed Enter.
// Source reads: the canvas is not mountable in node. The Focus button's own shape is pinned by focus-adapters.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('Minimize replaces the Focus icon on an Explanation as its own pill (the Enter pill\'s look, 34 px high), outside the long Add to chat / Quick Edit pill', () => {
  const bar = read('./SelectionActions.jsx');
  const minimize = bar.match(/const pill = ctx\.onMinimize && \([^]*?<\/button>\r?\n  \);/)?.[0] || '';
  assert.match(minimize, /aria-label="Minimize"/);
  // Owner 2026-11-13: inside the card's one pill it is a plain round button (joined); on its own it keeps the pill look.
  assert.match(minimize, /joined \? 'pointer-events-auto flex h-8 shrink-0 [^']*rounded-none px-3[^']*' : 'pointer-events-auto flex h-\[34px\] shrink-0 [^']*rounded-full border border-line bg-white px-3 [^']*shadow-md/, 'joined: a full-height segment of the one pill; alone: the pill look');
  assert.match(minimize, /<ChevronsDownUp size=\{15\} strokeWidth=\{1\.8\} aria-hidden="true" \/>/, 'the mirror of the tile\'s Expand icon (ChevronsUpDown)');
  const longPill = bar.match(/const bar = \(barClass, barStyle\) => \([^]*?\r?\n  \);/)?.[0] || '';
  assert.ok(longPill.includes('data-add-to-chat') && longPill.includes('data-quick-edit'), 'the long pill still holds Add to chat and Quick Edit');
  assert.doesNotMatch(longPill, /data-minimize-button|ChevronsDownUp|onMinimize/, 'Minimize is not inside the long pill');
  assert.match(bar, /<div data-selection-group className=\{`pointer-events-auto flex w-max items-center gap-1\.5 \$\{className\}`\} style=\{style\}>\{long && bar\('', undefined\)\}\{pill\}<\/div>/, 'the long pill and the Minimize pill sit side by side, Minimize last (owner 2026-11-13)');
  assert.match(bar, /focusLabel: onFocus && !onMinimize \? focusLabel : null/, 'the Focus icon steps aside where Minimize stands');
  assert.match(bar, /!!\(ctx\.focusLabel \|\| ctx\.onMinimize \|\| ctx\.onAddToChat \|\| ctx\.onQuickEdit\)/);
});

test('the canvas offers Minimize on a card that can be minimized and is not, never on a view-only canvas, a locked card or a tile; Focus is the context menu\'s', () => {
  const canvas = read('./AdaptiveCanvas.jsx'), menu = read('./canvas-actions-types.js');
  assert.match(canvas, /const soleFocus = soleObject && !minimizable\(soleObject\) \? adapterFor\(/, 'no toolbar Focus on an Explanation');
  assert.match(canvas, /const soleMinimize = soleObject && minimizable\(soleObject\) && !soleObject\.minimized && !readOnly && !localCopy && !lockedRef\.current\.has\(soleObject\.id\) \? \(\) => minimizeCard\(soleObject\.id\) : null;/);
  assert.match(canvas, /onFocus=\{focusSole\} onMinimize=\{soleMinimize\}/);
  assert.match(canvas, /focusable: object => !!object && object\.id !== focusRef\.current\?\.id && !isMinimized\(object\) && !!adapterFor\(/, 'an Explanation keeps its Focus row; its tile has none');
  assert.match(menu, /id: 'card\.focus', label: 'Focus'/);
  assert.match(menu, /applies: \(t, ctx\) => !!ctx\.canvas\.focusable\?\.\(t\.object\), run: \(t, ctx\) => ctx\.canvas\.focus\(t\.id\)/);
});

test('the selected card\'s Open pill reads Enter; its title and name still say what it opens', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /<button type="button" data-card-open=\{opens\.kind\} title=\{opens\.label\} aria-label=\{opens\.label\}/);
  assert.match(canvas, /Enter<ArrowUpRight size=\{13\} \/>/);
  assert.doesNotMatch(canvas, /\bOpen<ArrowUpRight/);
});

// Owner 2026-11-13 (replaces 2026-11-08's three matching pills): Enter, Add to chat, Quick Edit and Minimize are ONE pill above the card, one border, one fixed place, shown together.
test('the card actions are one component: one pill holding Enter, Add to chat, Quick Edit and Minimize, shown by one condition', () => {
  const bar = read('./SelectionActions.jsx'), canvas = read('./AdaptiveCanvas.jsx');
  const pill = canvas.indexOf('data-card-actions className="pointer-events-auto flex w-max max-w-full items-stretch overflow-hidden rounded-full border border-line bg-white shadow-md"');
  assert.ok(pill > 0, 'one container with one border');
  const enter = canvas.indexOf('data-card-open={opens.kind}'), tools = canvas.indexOf('{selected ? tools : hoverTools}');
  assert.ok(pill < enter && enter < tools, 'Enter and the actions are inside it, Enter first');
  assert.match(canvas, /const rowShown = selected \|\| hovered;/, 'one condition');
  assert.match(canvas, /const showEnter = rowShown && !!opens/);
  assert.match(canvas, /const showTools = rowShown && !!\(selected \? tools : hoverTools\);/);
  assert.match(bar, /if \(joined\) return <div data-selection-group className="pointer-events-auto flex w-max items-stretch">/, 'joined: no pill of its own');
  assert.match(bar, /joined \? 'pointer-events-auto flex w-max items-stretch' : `pointer-events-auto flex h-\[34px\]/, 'joined bar has no border or fill of its own');
  assert.equal((canvas.match(/<SelectionActionsHost|<SelectionActionBar/g) || []).length > 3, true, 'every card type uses the same Actions component');
  assert.equal([...read('./LearningBlocks.jsx').matchAll(/data-selection-bar/g)].length, 0, 'no other file draws its own selection bar');
});
