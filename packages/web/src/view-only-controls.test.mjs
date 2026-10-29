import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIEW_ONLY_CONTROLS } from './card-open.js';

// A shared (view-only) canvas arms the hand tool, which takes the pointer away from the whole card layer, so an explanation's
// Play, scrubber and inputs could not be pressed there (preview defect, 2026-10-28: the canvas surface was under the Play
// button). The fix gives the pointer back to exactly these card regions. No DOM here: the decision is the CSS rule plus the
// surface's guard, kept on one list.
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const list = selector => selector.split(',').map(part => part.trim()).sort();

test('index.css re-enables exactly the VIEW_ONLY_CONTROLS regions inside a view-only card layer', () => {
  const rule = read('./index.css').match(/\[data-view-only\] \[data-block\] :is\(([^)]*)\)\s*\{\s*pointer-events:\s*auto;\s*\}/);
  assert.ok(rule, 'the [data-view-only] rule is present');
  assert.deepEqual(list(rule[1]), list(VIEW_ONLY_CONTROLS));
});

test('only playback, inputs, the pager, Restart and Notes are offered: nothing that edits or draws', () => {
  assert.deepEqual(list(VIEW_ONLY_CONTROLS), ['[data-animation-transport]', '[data-card-pager]', '[data-program-notes]', '[data-program-restart]', '[data-scene-controls]']);
  for (const editing of ['textarea', 'contenteditable', 'data-sketch', 'data-drag-zone']) assert.ok(!VIEW_ONLY_CONTROLS.includes(editing));
});

test('the canvas marks its card layer view-only and leaves a press on those controls to them; the cards carry the markers', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /<div ref=\{column\} data-view-only=\{readOnly \|\| undefined\}/);
  assert.match(canvas, /if \(tool === 'hand' && readOnly\) \{\s*\/\/[^\n]*\n\s*if \(event\.target\.closest\?\.\(VIEW_ONLY_CONTROLS\)\) return;/);
  const cards = read('./explain-program/ProgramScene.jsx') + read('./explain-program/ProgramNotes.jsx') + read('./AnimatedScene.jsx') + read('./SceneControls.jsx');
  for (const marker of ['data-animation-transport', 'data-scene-controls', 'data-card-pager', 'data-program-restart', 'data-program-notes']) assert.ok(cards.includes(marker), marker);
});
