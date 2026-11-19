// The card toolbar for an Explanation (owner 2026-11-08): Focus in the card's right-click menu, Open renamed Enter. Minimize was removed on 2026-11-17 (owner: cards no longer minimize or expand).
// Source reads: the canvas is not mountable in node. The Focus button's own shape is pinned by focus-adapters.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('the card pill has no Minimize or Expand button, the toolbar has no Minimize, and an Explanation keeps no toolbar Focus (owner 2026-11-17)', () => {
  const bar = read('./SelectionActions.jsx'), canvas = read('./AdaptiveCanvas.jsx');
  assert.doesNotMatch(bar, /Minimize|ChevronsDownUp|onMinimize|data-minimize-button|data-selection-group/);
  const longPill = bar.match(/const bar = \(barClass, barStyle\) => \([^]*?\r?\n  \);/)?.[0] || '';
  assert.ok(longPill.includes('data-add-to-chat') && longPill.includes('data-quick-edit'), 'the pill still holds Add to chat and Quick Edit');
  assert.ok(longPill.indexOf('data-quick-edit') < longPill.indexOf('<PromptControl'), 'Prompt comes after Quick Edit, as the last item');
  assert.match(bar, /!!\(ctx\.onAddToChat \|\| ctx\.onQuickEdit\)/);
  assert.doesNotMatch(canvas, /soleMinimize|minimizeCard|onMinimize|minimizable/);
  assert.doesNotMatch(bar, /data-focus-button|focusLabel|Maximize/, 'no Focus button in the pill (owner 2026-11-18 16:13)');
  assert.doesNotMatch(canvas, /soleFocus|focusSole|focusLabel=/, 'no card toolbar or pill Focus (owner 2026-11-15, 2026-11-18 16:13)');
});

test('the selected card\'s Open pill reads Enter; its title and name still say what it opens', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /<button type="button" data-card-open=\{opens\.kind\} title=\{opens\.label\} aria-label=\{opens\.label\}/);
  assert.match(canvas, /Enter<ArrowUpRight size=\{13\} \/>/);
  assert.doesNotMatch(canvas, /\bOpen<ArrowUpRight/);
});

// Owner 2026-11-13 (replaces 2026-11-08's three matching pills): Enter, Add to chat, Quick Edit and Minimize are ONE pill above the card, one border, one fixed place, shown together.
test('the card actions are one component: one pill holding Enter, Add to chat, Quick Edit and Prompt, shown by one condition', () => {
  const bar = read('./SelectionActions.jsx'), canvas = read('./AdaptiveCanvas.jsx');
  const pill = canvas.indexOf('data-card-actions className="pointer-events-auto flex w-max max-w-none shrink-0 items-stretch overflow-hidden rounded-full border border-line bg-white shadow-md"');
  assert.ok(pill > 0, 'one container with one border');
  const enter = canvas.indexOf('data-card-open={opens.kind}'), tools = canvas.indexOf('{selected ? tools : hoverTools}');
  assert.ok(pill < enter && enter < tools, 'Enter and the actions are inside it, Enter first');
  assert.match(canvas, /const rowShown = selected \|\| hovered \|\| promptOpen;/, 'one condition (the open Prompt popover keeps the row)');
  assert.match(canvas, /const showEnter = rowShown && !!opens/);
  assert.match(canvas, /const showTools = rowShown && !!\(selected \? tools : hoverTools\);/);
  assert.match(bar, /joined \? 'pointer-events-auto flex w-max items-stretch' : `pointer-events-auto flex h-\[34px\]/, 'joined bar has no border or fill of its own');
  assert.equal((canvas.match(/<SelectionActionsHost|<SelectionActionBar/g) || []).length > 3, true, 'every card type uses the same Actions component');
  assert.equal([...read('./LearningBlocks.jsx').matchAll(/data-selection-bar/g)].length, 0, 'no other file draws its own selection bar');
});
