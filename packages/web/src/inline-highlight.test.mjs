// Owner 2026-11-09 Ctrl+K over highlighted words: the chip's first words, the card text locator, the scrim path, the /explain context (question's words + the card), the beside placement
// level with the highlighted line, and the wiring pins (source-level, as the repo's other editor tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstWords, locate, scrimPath, explainContext } from './inline-highlight.js';
import { besideSpot } from './beside-placement.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the chip shows the first 2-3 words, at most 24 characters, the ellipsis inside the chip', () => {
  assert.equal(firstWords('maximum likelihood estimation of the parameters'), 'maximum likelihood esti…', 'three words, cut to 23 characters plus the ellipsis');
  assert.equal(firstWords('maximum likelihood'), 'maximum likelihood');
  assert.equal(firstWords('  a   b  c  d  '), 'a b c…');
  assert.ok(firstWords('internationalization-of-everything and more').length <= 25);
  assert.equal(firstWords('internationalization-of-everything and more'), 'internationalization-of…');
  assert.equal(firstWords(''), '');
});

test('locate maps single-spaced words back to the card text across line breaks', () => {
  const whole = 'Title line\n\nBayes rule\nupdates a prior with evidence.';
  const at = locate(whole, 'rule updates a prior');
  assert.deepEqual(at, { from: whole.indexOf('rule'), to: whole.indexOf('prior') + 'prior'.length });
  assert.equal(whole.slice(at.from, at.to), 'rule\nupdates a prior');
  assert.equal(locate(whole, 'not in the card'), null);
  assert.equal(locate(whole, '   '), null);
});

test('the scrim is one even-odd path: the surface, then one hole per line of the highlighted words', () => {
  const path = scrimPath({ w: 800, h: 600 }, [{ left: 100, top: 50, width: 80, height: 18 }, { left: 40, top: 70, width: 120, height: 18 }]);
  assert.match(path, /^path\(evenodd, "M0 0H800V600H0z/);
  assert.equal((path.match(/M/g) || []).length, 3);
});

test('/explain from Ctrl+K sends the highlighted words first, then the card title and text, inside 8000 characters; every other caller keeps the words only', () => {
  const card = { title: 'Maximum likelihood', body: 'x'.repeat(9000) };
  const context = explainContext({ text: 'the likelihood', card });
  assert.ok(context.startsWith('Highlighted text:\nthe likelihood\n\nThe card it comes from, "Maximum likelihood":\n'));
  assert.equal(context.length, 8000);
  assert.equal(explainContext({ text: 'just words' }), 'just words');
  assert.equal(explainContext({ text: '' }), null);
  assert.equal(explainContext(null), null);
});

test('a card made from highlighted words starts level with that line, inside the source; no line, the old placement', () => {
  const source = { x: 0, y: 100, w: 440, h: 900 };
  assert.deepEqual(besideSpot(source, { w: 546, h: 300 }, []), { x: 480, y: 100 });
  assert.deepEqual(besideSpot(source, { w: 546, h: 300 }, [], { dy: 260 }), { x: 480, y: 360 });
  assert.equal(besideSpot(source, { w: 546, h: 300 }, [], { dy: 5000 }).y, 100 + 900 - 40, 'clamped inside the source');
  // an occupied slot there: the next free slot to the right in the same row
  assert.equal(besideSpot(source, { w: 546, h: 300 }, [{ x: 480, y: 340, w: 546, h: 400 }], { dy: 260 }).x, 480 + 546 + 40);
});

test('wiring: the canvas picks the highlight, the editor draws the chip, the mark, the scrim and hands the card over; the slash command uses the context and the line', () => {
  const canvas = read('AdaptiveCanvas.jsx'), editor = read('InlineAiEditor.jsx'), slash = read('learn-slash.js'), css = read('index.css');
  assert.match(canvas, /pickedHighlight\(shell\.current, board\.blocks, viewRef\.current\.z\)/);
  assert.match(canvas, /highlight=\{inline\.highlight \|\| null\}/);
  assert.match(canvas, /onClearHighlight=\{/);
  assert.match(canvas, /besideSpot\(source, size, boardObstacles\(\[beside\]\), \{ dy: besideDy \}\)/);
  assert.match(editor, /aria-label="Remove the highlighted text"/);
  assert.match(editor, /firstWords\(highlight\.text\)/);
  assert.match(editor, /title=\{highlight\.text\}/);
  assert.match(editor, /CSS\.highlights\.set\('inline-target', new Highlight\(highlight\.live\)\)/);
  assert.match(editor, /data-inline-scrim/);
  assert.match(editor, /card: \{ title: String\(source\.title \|\| ''\)\.slice\(0, 200\), body: cardText\(source\)\.slice\(0, 6000\) \}, beside: true, alignY: highlight\.alignY/);
  assert.match(slash, /besideDy: target\.alignY/);
  assert.match(slash, /context: explainContext\(target\)/);
  assert.match(css, /::highlight\(inline-target\)/);
});
