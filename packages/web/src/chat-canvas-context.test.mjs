// Whole-canvas context wiring (canvas-context-SUBLANES.md A-wire): chat-canvas-context.js maps the live canvas and the chat's
// history, selection and attachments into the builder's input; the pages call it at submit. No network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasContextNow, chatHistory, refIds } from './chat-canvas-context.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const BOARD = {
  blocks: [{ id: 'b1', type: 'explanation', title: 'Heaps', body: 'A heap keeps its smallest key on top.', groupId: 'g1' }, { id: 'b2', type: 'explanation', title: 'Tries', body: 'A trie shares prefixes.', groupId: 'g1' }],
  items: [{ id: 't1', kind: 'text', text: 'unsaved words', x: 0, y: 900 }],
  shapes: [{ id: 's1', kind: 'rect', text: 'box', x: 400, y: 0, w: 80, h: 40 }],
  links: [{ id: 'l1', from: 'b1', to: 'b2' }], groups: [{ id: 'g1', label: 'Trees' }], exchanges: [],
  boxes: { b1: { x: 0, y: 0, w: 560, h: 200 }, b2: { x: 0, y: 240, w: 560, h: 200 } },
};
const recorder = () => { const seen = []; return { seen, build: input => { seen.push(input); return { version: 1, coverage: { summary: 'x' } }; } }; };

test('no canvas API, or one without liveBoard: no package', () => {
  assert.equal(canvasContextNow({ api: null }), null);
  assert.equal(canvasContextNow({ api: { blocks: () => [] } }), null);
});

test('the live board at submit: every object, title, request; selection = target ids, group members, the live selection; unknown ids dropped', () => {
  const { seen, build } = recorder();
  const api = { liveBoard: () => BOARD, selection: () => ['s1'] };
  canvasContextNow({ api, title: 'Old title', request: 'compare heaps and tries', selection: ['g1', 'area:abc', 'gone'], attachments: ['b2'], inspected: [] }, build);
  const [input] = seen;
  for (const id of ['b1', 'b2', 's1', 't1']) assert.ok(input.objects.some(o => o.id === id), id);
  assert.equal(input.objects.find(o => o.id === 't1').text, 'unsaved words', 'what liveBoard holds now, unsaved edits included');
  assert.deepEqual([input.title, input.request], ['Old title', 'compare heaps and tries']);
  assert.deepEqual(input.selection, ['g1', 'b1', 'b2', 's1'], 'a group brings its members; the live selection joins; an area or a deleted id is dropped');
  assert.deepEqual(input.attachments, ['b2']);
  assert.ok(input.connectors.some(c => c.from === 'b1' && c.to === 'b2'));
  canvasContextNow({ api, selection: ['selection:b2+t1'] }, build);
  assert.deepEqual(seen[1].selection, ['b2', 't1', 's1'], 'a multi-select target is its ids');
});

test('a deleted object leaves the next package; history refs to it go too', () => {
  const { seen, build } = recorder();
  let board = BOARD;
  const api = { liveBoard: () => board };
  canvasContextNow({ api, history: [{ role: 'user', text: 'tries?', refs: ['b2', 'selection:b1+b2'] }] }, build);
  assert.deepEqual(seen[0].history[0].refs, ['b2', 'b1']);
  board = { ...BOARD, blocks: BOARD.blocks.slice(0, 1) };
  canvasContextNow({ api, history: [{ role: 'user', text: 'tries?', refs: ['b2'] }] }, build);
  assert.deepEqual([seen[1].objects.some(o => o.id === 'b2'), seen[1].history[0].refs], [false, []]);
});

test('only the object whose picture rides is inspected', () => {
  const { seen, build } = recorder();
  canvasContextNow({ api: { liveBoard: () => BOARD }, inspected: ['b1'] }, build);
  assert.deepEqual(seen[0].objects.filter(o => o.inspected).map(o => o.id), ['b1']);
});

test('through the real builder: the live board becomes a v1 package; only a riding image is inspected; ink is listed', () => {
  const board = { ...BOARD, blocks: [...BOARD.blocks, { id: 'img1', type: 'file', kind: 'image', label: 'diagram.png', mediaId: 'm1' }], strokes: [{ points: [{ x: 1, y: 1 }, { x: 5, y: 5 }] }] };
  const [plain, shown] = [[], ['img1']].map(inspected => canvasContextNow({ api: { liveBoard: () => board, selection: () => [] }, title: 'T', request: 'heaps', inspected }));
  const ids = plain.inventory.items.map(item => item.id);
  for (const id of ['b1', 'b2', 's1', 't1', 'img1']) assert.ok(ids.includes(id), id);
  assert.ok(plain.inventory.items.some(item => item.type === 'ink'), 'freehand strokes are listed');
  assert.deepEqual([plain.version, plain.relations.explicit.some(r => r.from === 'b1' && r.to === 'b2')], [1, true]);
  assert.deepEqual([plain.coverage.media_inspected, shown.coverage.media_inspected], [0, 1]);
  for (const p of [plain, shown]) assert.doesNotMatch(p.coverage.summary, /\bread\b/);
});

test('chatHistory: the last six user and assistant messages, oldest first, user refs kept; refIds: card ids and group members only', () => {
  const messages = [{ role: 'user', content: 'q0' }, ...Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}`, ...(i === 2 ? { refs: ['b1'] } : {}) })),
    { role: 'step', content: 'hook' }, { role: 'assistant', content: '' }];
  assert.deepEqual(chatHistory(messages), [
    { role: 'user', text: 'm0' }, { role: 'assistant', text: 'm1' }, { role: 'user', text: 'm2', refs: ['b1'] },
    { role: 'assistant', text: 'm3' }, { role: 'user', text: 'm4' }, { role: 'assistant', text: 'm5' }]);
  assert.deepEqual(refIds([{ sourceId: 'card:shape:a', kind: 'card' }, { sourceId: 'group:b1', kind: 'group', range: { cardIds: ['b1', 'b2'] } }, { sourceId: 'doc:ctx:1', kind: 'doc' }, { sourceId: 'wiki:Heap', kind: 'web' }]), ['shape:a', 'b1', 'b2']);
});

test('wiring: the canvas API reads live; the page builds through the helper; Ask posts canvas_context; the user bubble keeps its refs', () => {
  const canvas = read('./AdaptiveCanvas.jsx'), page = read('./LearnPage.jsx'), ask = read('./ask.jsx');
  assert.match(canvas, /liveBoard: \(\) => \{\s+const doc = liveDoc\(\), box = docBoxRef.current;\s+return \{ \.\.\.semanticBoard\(\), strokes: present\.current\.strokes, boxes: \{ \.\.\.inlineCanvas\.layout\(\), [^\n]+ \}, doc \};\s+\},[\s\S]{0,700}?selection: \(\) => selectedRef\.current,/);
  assert.match(page, /const built = canvasContextNow\(\{ api: canvasApi\.current, title: titleNow\.current, \.\.\.options \}\);/);
  assert.match(page, /canvasContext, selection: \(\) => canvasApi\.current\?\.selection\?\.\(\) \|\| \[\],/);
  assert.match(ask, /const canvasContext = canvasOps\?\.canvasContext\?\.\(\{ request: message, \.\.\.canvasArgs, inspected: imageId && imageObject \? \[imageObject\] : \[\] \}\);/);
  assert.match(ask, /\.\.\.\(canvasContext \? \{ canvas_context: canvasContext \} : \{\}\),\s+\};/);
  assert.match(ask, /\.\.\.\(sentRefs\.length \? \{ refs: sentRefs \} : \{\}\)/);
  assert.match(ask, /begin: sheetMode \? null : begin, \.\.\.canvasArgs, inspected: tutorImage && imageObject \? \[imageObject\] : \[\], onCard: cardSink \}\)/); // onCard: the turn's cards kept under its question (UI changes brief 5)
});

test('the This canvas chip: its text stays; title and data-canvas-coverage are the package summary, rebuilt from the draft on hover or focus', () => {
  const chip = read('./ContextChips.jsx'), page = read('./LearnPage.jsx'), tutor = read('./LearnTutor.jsx');
  assert.match(chip, /const preview = \(\) => chat\.canvasOps\?\.canvasContext\?\.\(\{ request: chat\.composer\.text, attachments: refIds\(chat\.context\.attached\) \}\);/);
  assert.match(chip, /<li data-canvas-context title=\{chat\.canvasCoverage \|\| '[^']+'\} data-canvas-coverage=\{chat\.canvasCoverage \|\| undefined\}\s+tabIndex=\{0\} onPointerEnter=\{preview\} onFocus=\{preview\}/);
  assert.match(chip, /\/> This canvas\s+<\/li>/);
  assert.doesNotMatch(chip.match(/<li data-canvas-context[^>]*>/)[0], /\bread\b/, 'never "read": sending is not reading');
  // Every built package's summary reaches the chip, a sent turn's included (Ask through canvasOps, the Tutor through useTutor).
  assert.match(page, /if \(built\) chat\.setCanvasCoverage\?\.\(built\.coverage\.summary\);/);
  assert.match(tutor, /const canvasPackage = canvasContext\?\.\(\{ request: nextStep\?\.hook \?\? raw, history, selection: targetId \? \[targetId, \.\.\.selection\] : selection, attachments, inspected: ridingImage \}\) \?\? null;/);
});
