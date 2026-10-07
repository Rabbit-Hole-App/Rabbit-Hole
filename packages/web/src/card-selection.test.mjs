// Selecting and opening a learning-canvas card (docs/features/canvas-card-selection.md): what Open does per card,
// which double-clicks belong to a card's own controls, the one selected-card context, and the wiring that keeps it
// visible, after a send, and off other canvases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openTarget, opensFrom, selectedCardContext } from './card-open.js';
import { canvasTargetField } from './learn-ask-target.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const everything = { dive: true, readers: true };

test('Open is the card\'s reader when it has one', () => {
  assert.deepEqual(openTarget({ id: 'w', type: 'wiki', title: 'Softmax', section: 2 }, everything), { kind: 'reader', label: 'Open in reader', action: 'wiki-reader', payload: { title: 'Softmax', section: 2 } });
  assert.deepEqual(openTarget({ id: 'p', type: 'paper', title: 'Attention', paper: { id: '1706.03762', page: 3 } }, everything).payload, { id: '1706.03762', title: 'Attention', page: 3 });
  assert.equal(openTarget({ id: 'f', type: 'pdf', assetKey: 'pdf:upload:abc', label: 'Notes' }, everything).action, 'pdf-reader');
  assert.deepEqual(openTarget({ id: 'v', type: 'video', videoId: 'abc123', start: 42.7 }, everything), { kind: 'external', label: 'Open on YouTube', url: 'https://www.youtube.com/watch?v=abc123&t=42s' });
});

test('otherwise Open enters the card\'s Rabbit Hole, or starts one; with neither there is nothing to open', () => {
  const block = { id: 'b', type: 'explanation', title: 'Why scale?' };
  assert.deepEqual(openTarget(block, { ...everything, portal: { name: 'canvas-1', title: 'Scaling' } }), { kind: 'enter', label: 'Enter the Rabbit Hole: Scaling', name: 'canvas-1' });
  assert.equal(openTarget(block, everything).kind, 'start');
  assert.equal(openTarget(block, { readers: true }), null);
  assert.equal(openTarget(null, everything), null, 'a chat card or a shape is not a block');
  // A reader-backed card where the page has no readers (a view-only board) falls back like any other card.
  assert.equal(openTarget({ id: 'w', type: 'wiki', title: 'Softmax' }, { dive: true }).kind, 'start');
  // A generated clip (src, no YouTube id) has no viewer of its own.
  assert.equal(openTarget({ id: 'm', type: 'video', src: 'https://x/clip.mp4' }, everything).kind, 'start');
});

// A stand-in element: matches a selector list by the tags/attributes it is given.
const element = (owns = [], cursor = 'default') => ({ cursor, closest: selectors => (selectors.split(',').some(s => owns.includes(s.trim())) ? {} : null) });
const cursorOf = node => node.cursor;

test('a double-click on the card\'s own controls never opens it', () => {
  for (const control of ['button', 'input', 'a', 'iframe', 'video', 'canvas', '[role="slider"]', '[role="radio"]', '[contenteditable="true"]', '[data-sketch]']) {
    assert.equal(opensFrom(element([control]), cursorOf), false, control);
  }
  assert.equal(opensFrom(element([], 'grab'), cursorOf), false, 'a draggable point inside a graph');
  assert.equal(opensFrom(element([], 'pointer'), cursorOf), false);
  assert.equal(opensFrom(element([], 'default'), cursorOf), true, 'the card\'s text');
  assert.equal(opensFrom(element(['[data-drag-zone]'], 'grab'), cursorOf), true, 'the drag strip opens, grab cursor and all');
  assert.equal(opensFrom(null, cursorOf), false);
});

test('the selected-card context keeps the card\'s identities apart', async () => {
  assert.deepEqual(selectedCardContext({ id: 'b1', type: 'quiz' }, 'What is softmax?'), { card_id: null, block_id: 'b1', title: 'What is softmax?', material_type: 'quiz' });
  const { cardBlock } = await import('./nanogpt/board.js');
  const causalMask = await import('./nanogpt/cards/c11-causal-mask.js');
  const block = cardBlock(causalMask);
  const context = selectedCardContext(block, 'Causal mask');
  assert.equal(context.block_id, block.id);
  assert.equal(context.scene_id, 'nanogpt-c11-causal-mask');
  assert.equal(context.card_id, 'c11-causal-mask', 'the authored card, a different string from the scene');
  assert.ok(context.concept_ids.includes('causal-mask'));
});

test('the temporary /ask contract: the request carries only { id, kind, title, text }', () => {
  const target = { id: 'b1', kind: 'Quiz', title: 'Softmax', text: 'Q: what is softmax?', card: true, context: { card_id: null, block_id: 'b1', material_type: 'quiz' }, preview: 'data:image/png;base64,x' };
  assert.deepEqual(canvasTargetField(target), { id: 'b1', kind: 'Quiz', title: 'Softmax', text: 'Q: what is softmax?' });
});

test('selecting one card arms the composer strip; moving off it clears the strip, never a region or group target', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  const effect = canvas.slice(canvas.indexOf('const selectionArmed = useRef(null);'), canvas.indexOf('// Open (card-open.js): the card\'s reader'));
  assert.match(effect, /if \(block && armTarget\(block\)\) \{ selectionArmed\.current = block\.id; return; \}/);
  assert.match(effect, /if \(was && askTargetId === was && armedId\.current === was\) \{ armedId\.current = null; onAskTargetRef\.current\?\.\(null\); \}/);
  assert.match(canvas, /const card = \{ card: true, asked: askedId\.current === block\.id, context: selectedCardContext\(block, described\.title\) \};/, 'Ask in chat arms the same target: one context, one chip');
  // Where the answer lands is unchanged: Ask in chat answers as a linked card; a card only selected answers where any question does.
  assert.match(read('./ask.jsx'), /const panelAsk = sheetMode && \(!canvasTarget \|\| \(canvasTarget\.card && !canvasTarget\.asked\) \|\| journeySetup\);/);
});

test('the strip is the card: its icon, its title and Remove selected card context; it stays after a send', () => {
  const ask = read('./ask.jsx');
  assert.match(ask, /'data-selected-card': canvasTarget\.id/);
  assert.match(ask, /aria-label=\{canvasTarget\.card \? 'Remove selected card context' : 'Clear block selection'\}/);
  assert.match(ask, /if \(target && !target\.card\) onClearCanvasTarget\?\.\(\);/);
  const learn = read('./LearnPage.jsx');
  assert.match(learn, /onTargetUsed: \(\) => \{ if \(!askTarget\?\.card\) clearAskTarget\(\); \}/, 'a voice turn keeps it too');
  assert.match(learn, /useEffect\(\(\) => \{ setAskTarget\(null\); \}, \[app\.name, boardName\]\);/, 'never carried to another canvas or board');
  assert.match(learn, /const clearAskTarget = \(\) => \{ setAskTarget\(null\); canvasApi\.current\?\.deselect\(\); \};/, 'x clears the card selection with the strip');
});

test('keys: Space selects the focused card, Enter opens it or the selected card, Esc in the composer keeps the card', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /tabIndex=\{0\} role="group" aria-roledescription="card" aria-current=\{selected \? 'true' : undefined\}/);
  assert.match(canvas, /if \(event\.key === ' ' && focusedCard\) \{ event\.preventDefault\(\);/);
  assert.match(canvas, /openCardRef\.current\.open\(target, 'learner_enter'\);/);
  assert.match(canvas, /if \(!offCanvasField\) setSelected\(null\);/);
  // Selection is UI state only: nothing about it is saved or put in the URL.
  const effect = canvas.slice(canvas.indexOf('const selectionArmed = useRef(null);'), canvas.indexOf('const cardOpen = {'));
  assert.doesNotMatch(effect, /localStorage|sessionStorage|history\.|location\./);
});
