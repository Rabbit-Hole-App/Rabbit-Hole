import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasTargetField, cardQuestion, groupTargetText, describeYouTube, CANVAS_TARGET_MAX, GROUP_QUESTION } from './learn-ask-target.js';

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
  // Cards' live card text (a getter or function) is resolved once at send and frozen into this request.
  assert.match(ask, /const targetText = target \? \(typeof target\.text === 'function' \? target\.text\(\) : target\.text\) : null;/);
  assert.match(ask, /\.\.\.\(target \? \{ canvas_target: canvasTargetField\(\{ \.\.\.target, text: targetText \}\) \}/);
  // The first Continue convo request carries the card its answer was linked from.
  assert.match(ask, /canvasSeed && !threadId\.current \? \{ canvas_seed: \{ question: canvasSeed\.question, answer: canvasSeed\.answer \}, \.\.\.\(!target && canvasSeed\.target \? \{ canvas_target: canvasTargetField\(canvasSeed\.target\) \} : \{\}\) \}/);
  assert.match(canvas, /renderComposer=\{renderBlockComposer && \(\(exchange, receive\) => renderBlockComposer\(exchange, receive, linkedTarget\(exchange\)\)\)\}/);
  assert.match(page, /renderBlockComposer=\{\(app\.hosting !== 'aws' \|\| app\.app_chat\) \? \(exchange, onExchange, target\) => <AskPanel compact composerOnly canvasSeed=\{\{ question: exchange\.question, answer: exchange\.answer, target \}\}/);
});

test('a group Ask has a title, bounded text through groupTargetText, and its own snapshot (context-2, -3, -22)', () => {
  assert.ok(canvas.includes("onAskTargetRef.current?.({ id: group.id, kind: 'Group', title: group.label || `${members.length} items`, text: groupTargetText(entries) });"));
  // Its chip goes when the group does.
  assert.ok(canvas.includes('armedGroup.current = null;\n    onAskTargetRef.current?.(null);'));
  assert.doesNotMatch(canvas, /parts\.join\('\\n\\n'\)\.slice\(0, 4000\)/);
  assert.match(canvas, /onGroupShotRef\.current\?\.\(blob, group\.label \|\| 'group', group\.id\)/);
  // The snapshot joins that group's armed target, never the global image context.
  const shot = page.slice(page.indexOf('const takeGroupShot'), page.indexOf('const repoSourceId'));
  assert.match(shot, /setAskTarget\(previous => previous\?\.id === groupId \? \{ \.\.\.previous, image: stored\.id \} : previous\)/);
  assert.doesNotMatch(shot, /setImageContext/);
  assert.match(ask, /const imageId = !target\?\.paper && !questionPaper \? target\?\.image \|\| questionImage\?\.id : null;/);
});

test('a YouTube moment card is described by its video id and window, never Source: undefined (context-17)', () => {
  const text = describeYouTube({ type: 'video', videoId: 'Ilg3gGewQ5U', title: 'Backprop', channel: '3Blue1Brown', start: 240, end: 300, unverified: true });
  assert.equal(text, 'YouTube moment: Backprop (video Ilg3gGewQ5U, 3Blue1Brown), window 240s-300s (window unverified)');
  assert.equal(describeYouTube({ videoId: 'Ilg3gGewQ5U', title: 'B', start: 0 }), 'YouTube moment: B (video Ilg3gGewQ5U), window 0s-end');
  assert.match(blocks, /if \(block\.type === 'video' && block\.videoId\) return \{ kind: 'YouTube moment', title: block\.title, text: describeYouTube\(block\) \};/);
});

test('a whiteboard region chip says only its text reaches the tutor (context-9)', () => {
  // A selected area (Ask about selection) sends its picture, so only it is exempt.
  assert.match(ask, /\{canvasTarget\.preview && !canvasTarget\.paper && !canvasTarget\.image && !canvasTarget\.id\?\.startsWith\?\.\('area:'\) && <span data-text-only title="The tutor gets the shapes' text, not this picture" className="shrink-0 text-ink-3">text only<\/span>\}/);
});

// delta-7, delta-8, context-14, context-11: a standalone canvas composer offers only what its chat can use.
test('a canvas composer disables + attachments with the server refusal and shows no Sources control', () => {
  assert.match(ask, /const canvasChat = \/\^canvas-\[a-f0-9\]\{8\}\$\/\.test\(scope\.app \|\| ''\);/);
  assert.match(ask, /<MenuItem icon=\{Paperclip\} disabled=\{privateChat \|\| canvasChat\} title=\{privateChat \? 'Attachments are not connected for private chat yet\.' : canvasChat \? 'Attachments are not available on canvases yet\. Upload a PDF from the canvas menu\.' : undefined\}/);
  assert.match(ask, /const srcOpts = repository \|\| canvasChat \? \[\] :/);
});

test('@mentions never offer canvases and stop at three chips', () => {
  assert.match(ask, /\(repository \? a\.name\.startsWith\('repo-'\) : !a\.name\.startsWith\('repo-'\) && !a\.name\.startsWith\('canvas-'\)\)/);
  assert.match(ask, /const atMatch = privateChat \|\| mentions\.length >= MENTION_CHIPS \? null :/);
});

// Owner, 2026-10-08: a canvas Ask writes a ready question into the composer; the learner presses Send.
test('a canvas Ask writes a plain question about the card, or the group as a whole', () => {
  assert.equal(cardQuestion('Softmax'), 'Can you explain "Softmax"?');
  assert.equal(cardQuestion(''), 'Can you explain this card?');
  assert.equal(GROUP_QUESTION, 'Can you explain how these cards fit together?');
});
