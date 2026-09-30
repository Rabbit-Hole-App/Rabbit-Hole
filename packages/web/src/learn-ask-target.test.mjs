import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasTargetField, groupTargetText, describeYouTube, CANVAS_TARGET_MAX } from './learn-ask-target.js';

// ask.jsx, AdaptiveCanvas.jsx, LearningBlocks.jsx and LearnPage.jsx cannot run under node, so the
// wiring is pinned by source text and the pure helpers are run for real (C5, owner decision 2).
const read = file => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ask = read('ask.jsx'), canvas = read('AdaptiveCanvas.jsx'), blocks = read('LearningBlocks.jsx'), page = read('LearnPage.jsx');

test('canvasTargetField keeps id, kind, title and text, and caps only an oversized text with a marker', () => {
  assert.deepEqual(canvasTargetField({ id: 'b1', kind: 'Explanation', title: 'Softmax', text: 'body', preview: 'data:', paper: {} }), { id: 'b1', kind: 'Explanation', title: 'Softmax', text: 'body' });
  assert.equal('title' in canvasTargetField({ id: 'g', kind: 'group', text: 't' }), false);
  const big = canvasTargetField({ id: 'b', kind: 'Table', text: 'x'.repeat(CANVAS_TARGET_MAX + 100) });
  assert.ok(big.text.length <= CANVAS_TARGET_MAX);
  assert.match(big.text, /\[160 more characters not sent\]$/);
});

test('a group target names every cut and every member it could not describe (context-2)', () => {
  const text = groupTargetText([{ text: 'Explanation: A' }, { question: 'Q1', answer: 'a'.repeat(700) }, { skipped: 'wiki' }, { skipped: 'pdf' }, { skipped: 'wiki' }]);
  assert.match(text, /^Explanation: A\n\nQ: Q1\nA: a{600} \[answer truncated\]\n\n\[3 cards not described: wiki, pdf\]$/);
  assert.equal(groupTargetText([{ question: 'Q', answer: 'short' }]), 'Q: Q\nA: short');
  assert.equal(groupTargetText([]), 'An empty group of drawings.');
});

test('Ask in chat sends the typed words as message and the card as canvas_target (context-1, context-10)', () => {
  assert.doesNotMatch(ask, /Question about this \$\{target\.kind\} block/);
  assert.match(ask, /\n {8}message,\n/);
  assert.match(ask, /\.\.\.\(target \? \{ canvas_target: canvasTargetField\(target\) \}/);
  // The first Continue convo request carries the card its answer was linked from.
  assert.match(ask, /canvasSeed && !threadId\.current \? \{ canvas_seed: \{ question: canvasSeed\.question, answer: canvasSeed\.answer \}, \.\.\.\(!target && canvasSeed\.target \? \{ canvas_target: canvasTargetField\(canvasSeed\.target\) \} : \{\}\) \}/);
  assert.match(canvas, /renderComposer=\{renderBlockComposer && \(\(exchange, receive\) => renderBlockComposer\(exchange, receive, linkedTarget\(exchange\)\)\)\}/);
  assert.match(page, /renderBlockComposer=\{\(app\.hosting !== 'aws' \|\| app\.app_chat\) \? \(exchange, onExchange, target\) => <AskPanel compact composerOnly canvasSeed=\{\{ question: exchange\.question, answer: exchange\.answer, target \}\}/);
});

test('a group Ask has a title, bounded text through groupTargetText, and its own snapshot (context-2, -3, -22)', () => {
  assert.match(canvas, /onAskTargetRef\.current\?\.\(\{ id: group\.id, kind: group\.label \? `group "\$\{group\.label\}"` : 'group', title: group\.label \|\| `\$\{members\.length\} items`, text: groupTargetText\(entries\) \}\);/);
  assert.doesNotMatch(canvas, /parts\.join\('\\n\\n'\)\.slice\(0, 4000\)/);
  assert.match(canvas, /onGroupShotRef\.current\?\.\(blob, group\.label \|\| 'group', group\.id\)/);
  // The snapshot joins that group's armed target, never the global image context.
  const shot = page.slice(page.indexOf('const takeGroupShot'), page.indexOf('const repoSourceId'));
  assert.match(shot, /setAskTarget\(previous => previous\?\.id === groupId \? \{ \.\.\.previous, image: stored\.id \} : previous\)/);
  assert.doesNotMatch(shot, /setImageContext/);
  assert.match(ask, /const imageId = !target\?\.paper && !questionPaper \? target\?\.image \|\| questionImage\?\.id : null;/);
});
