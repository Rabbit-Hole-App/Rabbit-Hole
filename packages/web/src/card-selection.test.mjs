// Selecting and opening a learning-canvas card (docs/features/canvas-card-selection.md): what Open does per card,
// which double-clicks belong to a card's own controls, the one selected-card context, and the wiring that keeps it
// visible, after a send, and off other canvases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openTarget, opensFrom, selectedCardContext } from './card-open.js';
import { canvasTargetField, describeCanvasObject, IMAGE_QUESTION, TEXT_QUESTION } from './learn-ask-target.js';

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
  // Any kind of card (owner, 2026-10-08): a lesson card, chat card, note, reader or file card, on a view-only board too.
  assert.match(effect, /const object = selected \? objectById\(selected\) : null;\n\s+if \(object && armTarget\(object\)\) \{ selectionArmed\.current = object\.id; return; \}/);
  assert.match(effect, /\}, \[selected\]\);/);
  assert.doesNotMatch(effect, /readOnly/, 'a view-only board arms the shared composer too');
  assert.match(canvas, /const objectById = id => blocksRef\.current\.find\(entry => entry\.id === id\) \|\| exchangesRef\.current\.find\(entry => entry\.id === id\) \|\| itemsRef\.current\.find\(entry => entry\.id === id\) \|\| null;/);
  assert.match(canvas, /const describeObject = object => describeBlock\(object\) \|\| describeCanvasObject\(object\);/);
  assert.match(effect, /if \(was && askTargetId === was && armedId\.current === was\) \{ armedId\.current = null; onAskTargetRef\.current\?\.\(null\); \}/);
  assert.match(canvas, /const card = \{ card: true, asked: askedId\.current === block\.id, context: \{ \.\.\.selectedCardContext\(block, described\.title\), material_type: block\.type \|\| described\.material \} \};/, 'Ask in chat arms the same target: one context, one chip');
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

// Owner, 2026-10-08: "when we click on a card meaning it is selected we should have a pill above the chat composer". The
// kinds describeBlock leaves out get a pill too; what rides is canvasTargetField's id, kind, title and text.
test('every kind of card has a pill: chat cards, notes, Wikipedia, PDF, file and section cards; a divider or a shape none', () => {
  const chat = describeCanvasObject({ id: 'q1', question: 'Why exp?', answer: 'Positive weights.', replies: [{ question: 'And the max?', answer: 'Subtract it.' }] });
  assert.deepEqual([chat.kind, chat.title, chat.material], ['Chat', 'Why exp?', 'chat']);
  assert.equal(chat.text, 'A chat on the canvas:\nQ: Why exp?\nA: Positive weights.\n\nQ: And the max?\nA: Subtract it.');
  assert.deepEqual(describeCanvasObject({ id: 'n1', kind: 'sticky', text: 'remember the mask\nsecond line' }), { kind: 'Sticky note', title: 'remember the mask', text: 'Sticky note on the canvas: remember the mask\nsecond line', material: 'note' });
  assert.equal(describeCanvasObject({ id: 't1', kind: 'text', text: '' }).title, 'Empty text');
  assert.deepEqual(describeCanvasObject({ id: 'w1', type: 'wiki', title: 'Softmax function', section: 2 }), { kind: 'Wikipedia', title: 'Softmax function', text: 'Wikipedia article on the canvas: Softmax function (section 2)', material: 'wiki' });
  assert.equal(describeCanvasObject({ id: 'p1', type: 'pdf', label: 'lecture.pdf', assetKey: 'pdf:abc' }).title, 'lecture.pdf');
  // An uploaded image rides as image_context (ask.jsx imageId), as Show the tutor this image does.
  assert.equal(describeCanvasObject({ id: 'f1', type: 'file', kind: 'image', label: 'diagram.png', mediaId: 'm-1' }).image, 'm-1');
  assert.equal(describeCanvasObject({ id: 'f2', type: 'file', kind: 'csv', label: 'runs.csv' }).kind, 'File');
  assert.equal(describeCanvasObject({ id: 'h1', type: 'heading', text: 'Attention' }).title, 'Attention');
  for (const none of [{ id: 'd1', type: 'divider' }, { id: 's1', kind: 'rect' }, { id: 'e1', type: 'explanation' }]) assert.equal(describeCanvasObject(none), null, JSON.stringify(none));
  assert.deepEqual(canvasTargetField({ id: 'q1', ...chat }), { id: 'q1', kind: 'Chat', title: 'Why exp?', text: chat.text });
});

// r35, owner: "For Image or Text box, should we have a "Ask in Chat"?" - yes, both, as cards, groups and equations have.
test('Ask in chat on a dropped image, a text box and a sticky note: the cards\' pill, a ready question, nothing sent', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  // The one selected object only (a multi-selection asks through its group or area); the same pill, above the top right.
  assert.match(canvas, /\{selected && onAsk && block\.kind === 'image' && <AskPill title="Ask the tutor about this image" onAsk=\{\(\) => onAsk\(block\)\} \/>\}/);
  assert.match(canvas, /onAskImage=\{selected === block\.id \? askImage : null\}/);
  assert.match(canvas, /onAsk=\{selected === item\.id \? askItem : null\}/);
  assert.match(canvas, /function AskPill\(\{ title, onAsk, className = 'absolute -top-10 right-0 z-30', style = null \}\)/);
  // The image is the target (its label; its media id rides as image_context) and is shown to the tutor the way Show the
  // tutor this image and the drop show it, so the Tutor path carries the picture; the question waits, nothing is sent.
  assert.match(canvas, /const askImage = block => \{\n\s+askedId\.current = block\.id;\n\s+if \(!armTarget\(block\)\) return;\n\s+if \(block\.mediaId\) onCardActionRef\.current\?\.\('image-attach', \{ blockId: block\.id, mediaId: block\.mediaId, label: block\.label \}\);\n\s+askDraft\(IMAGE_QUESTION\);/);
  assert.match(canvas, /const askItem = item => \{ if \(armTarget\(item\)\) askDraft\(TEXT_QUESTION\); \};/, 'words as context, as an equation; the answer lands where any does');
  assert.equal(IMAGE_QUESTION, 'What does this image show?');
  assert.equal(TEXT_QUESTION, 'Explain this');
  // Only with words in it and never while edited; a note's pill sits beside it in the layer (it clips and tilts its inside).
  assert.match(canvas, /const ask = !!onAsk && selected && !editing && tool === 'select' && !!String\(item\.text \|\| ''\)\.trim\(\);/);
  assert.match(canvas, /\{ask && sticky && askPill\}/);
  assert.match(canvas, /style=\{sticky \? \{ left: item\.x \+ \(item\.w \|\| 160\), top: item\.y - 40 \} : null\}/, 'on the cards\' pill row, right-aligned to the note');
  // The pin slot reserves the pill for an image (a block) and a text box or note (an item): PILL.ask (comments.test.mjs).
  assert.match(canvas, /if \(block\) return PILL\.ask \+ \(block\.type === 'whiteboard' \|\| block\.type === 'paper' \? PILL\.gap \+ PILL\.select : 0\);\n\s+if \(exchanges\.some\(entry => entry\.id === id\)\) return PILL\.explain \+ PILL\.gap \+ PILL\.more;\n\s+return PILL\.ask;/);
});

// Owner, 2026-10-08: "on card, when we right click we see Copy text, Duplicate etc... each options should have an icon next to it".
test('the canvas right-click menu: every item is one MenuRow with its icon, on card, canvas, note and group menus alike', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  const menu = canvas.slice(canvas.indexOf('{menuAt && presenting === null && (() => {'), canvas.indexOf('})()}', canvas.indexOf('{menuAt && presenting === null && (() => {')));
  assert.doesNotMatch(menu, /<button[^>]*role="menuitem"/, 'no bare row');
  const rows = menu.match(/<MenuRow [^>]*>/g);
  assert.ok(rows.length >= 20, `${rows.length} rows`);
  for (const row of rows) assert.match(row, /icon=\{[A-Za-z]/, row);
  // The shared row: the ⋮ menu's MenuItem (16px, strokeWidth 1.5, text-ink-2), a menu item, dimmed when disabled.
  assert.match(canvas, /const MenuRow = props => <MenuItem type="button" role="menuitem" \{\.\.\.props\} \/>;/);
  const ui = read('./ui.jsx');
  assert.match(ui, /\{Icon && <Icon size=\{16\} strokeWidth=\{1\.5\} aria-hidden="true" className="shrink-0 text-ink-2 group-disabled:text-ink-3" \/>\}/);
  assert.match(ui, /disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-transparent/);
  // The suggested marks where they apply: Start Rabbit Hole's own, Add comment, Copy text, Duplicate, Delete.
  for (const [label, icon] of [['Start Rabbit Hole', 'ArrowDownToLine'], ['Add comment', 'MessageCircle'], ['Copy text', 'Copy'], ['Duplicate', 'CopyPlus'], ['Delete', 'Trash2']]) {
    const line = menu.split('\n').find(text => text.includes(`>${label}</MenuRow>`));
    assert.ok(line?.includes(`icon={${icon}}`), `${label}: ${line?.trim().slice(0, 80)}`);
  }
});
