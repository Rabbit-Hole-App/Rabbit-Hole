// The canvas wiring of the summary (AdaptiveCanvas minimizeCard / fillSummary): when it is asked for, and that it can never block, notice or overwrite.
// Source reads (the canvas is not mountable in node); the pure rules, landSummary and requestSummary, are tested in explanation-minimize.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');

test('a new Explanation is summarised in the background after it is inserted; minimize asks only if the card has none; never twice, never on a view-only canvas', () => {
  assert.match(canvas, /if \(added\.type === 'explanation'\) fillSummary\(added\.id, added\);/);
  assert.match(canvas, /const minimizeCard = id => \{ patchBlockNow\(id, \{ minimized: true \}\); fillSummary\(id\); \};/, 'minimize is one saved step; it never waits for the summary');
  assert.match(canvas, /if \(!card \|\| goodSummary\(card\.summary\) \|\| summaryAsked\.current\.has\(id\) \|\| readOnlyRef\.current \|\| localCopyRef\.current\) return;/);
});

test('the summary lands through landSummary on the latest blocks, quietly: no undo step, no toast, and a failed request may be asked again', () => {
  assert.match(canvas, /requestSummary\(api, \{ app: appName, block: card \}\)\.then\(summary => \{ if \(summary\) setBlocks\(previous => landSummary\(previous, id, summary\)\); else summaryAsked\.current\.delete\(id\); \}\);/);
  const fill = canvas.match(/const fillSummary = [^]*?\n  \};/)?.[0] || '';
  assert.ok(fill && !/snapshot\(|toast\(/.test(fill), 'no undo entry and no notice');
});
