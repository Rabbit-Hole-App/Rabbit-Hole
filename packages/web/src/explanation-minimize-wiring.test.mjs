// The canvas no longer asks for an Explanation summary (owner 2026-11-17): the summary only fed the minimized tile, and minimize and expand were removed.
// Source reads (the canvas is not mountable in node); the pure helpers (landSummary, requestSummary) stay and are tested in explanation-minimize.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');

test('inserting an Explanation fires no background summary request, and nothing can minimize a card', () => {
  assert.doesNotMatch(canvas, /fillSummary|summaryAsked|requestSummary|landSummary|goodSummary|explanation-summary/, 'no summary call, state or import in the canvas');
  assert.doesNotMatch(canvas, /minimizeCard/, 'no card can be minimized');
});
