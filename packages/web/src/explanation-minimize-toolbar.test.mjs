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
  assert.match(minimize, /className="pointer-events-auto flex h-\[34px\] shrink-0 [^"]*rounded-full border border-line bg-white px-3 [^"]*shadow-md/, 'the Enter pill\'s look');
  assert.match(minimize, /<Minimize2 size=\{15\} strokeWidth=\{1\.8\} aria-hidden="true" \/>/);
  const longPill = bar.match(/const bar = \(barClass, barStyle\) => \([^]*?\r?\n  \);/)?.[0] || '';
  assert.ok(longPill.includes('data-add-to-chat') && longPill.includes('data-quick-edit'), 'the long pill still holds Add to chat and Quick Edit');
  assert.doesNotMatch(longPill, /data-minimize-button|Minimize2|onMinimize/, 'Minimize is not inside the long pill');
  assert.match(bar, /<div data-selection-group className=\{`pointer-events-auto flex w-max items-center gap-1\.5 \$\{className\}`\} style=\{style\}>\{pill\}\{long && bar\('', undefined\)\}<\/div>/, 'the pill and the long pill sit side by side');
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
