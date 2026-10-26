// The native Whiteboard editor's state machine (whiteboard-editor.js, whiteboard-kept.js, whiteboard-seed.js): what the card
// shows, how an edit becomes a saved block, undo and redo over block objects, selection, the view, the kept layer, the seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addMarks, boardNotice, conversionPending, editList, editWhiteboard, mergeMarks, persistable, pruneSelection, sketchOf, VIEW_START, viewStep } from './whiteboard-editor.js';
import { keptOf } from './whiteboard-kept.js';
import { lightBlocks } from './canvas-persist.js';
import { SEED_LABELS, sigmoidSketch } from './whiteboard-seed.js';
import { sigmoidObjects } from './sigmoid-context.js';
import { legacySnapshotToSvg } from './legacy-whiteboard.js';
import { IDENTITY_VIEW, LIMITS, countAssistant, digestOf, emptySketch, legacyState, saveVerdict, toFrame, toSketch, validateSketch, validateWhiteboardBlock } from './whiteboard-sketch.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./__fixtures__/tldraw/${name}`, import.meta.url), 'utf8'));
const stroke = (n, extra = {}) => ({ tool: 'pen', color: '#37352f', width: 2, points: [{ x: n, y: n }, { x: n + 10, y: n + 5 }], ...extra });
const rect = (id, x1 = 10, y1 = 10, x2 = 90, y2 = 60, extra = {}) => ({ id, kind: 'rect', x1, y1, x2, y2, color: '#37352f', width: 2, ...extra });
const fresh = () => ({ id: 'w1', type: 'whiteboard', title: 'Board', narration: '', snapshot: null });
const edit = (block, key, change, options) => editList(block, key, change, options);

test('a new board is empty, a demo board opens with the native sigmoid, a saved sketch wins, strokes always carry ids', () => {
  assert.deepEqual(sketchOf(fresh()), emptySketch());
  const demo = { ...fresh(), demo: 'sigmoid' };
  const seeded = sketchOf(demo);
  assert.ok(seeded.strokes.length === 1 && seeded.shapes.length === 4 && seeded.items.length === 6);
  assert.equal(sketchOf(demo), seeded, 'cached per block object');
  const saved = { ...demo, sketch: { strokes: [stroke(1)], shapes: [], items: [] } };
  const shown = sketchOf(saved);
  assert.equal(shown.strokes.length, 1);
  assert.match(shown.strokes[0].id, /^stroke:/);
  assert.equal(sketchOf({ ...saved }).strokes[0].id, shown.strokes[0].id, 'the same id on every open');
  assert.equal(sketchOf(null).strokes.length, 0);
});

test('the seed is a valid sketch of lesson marks that opens whole in a card frame and keeps the Tutor semantic labels', () => {
  const seed = sigmoidSketch();
  assert.deepEqual(validateSketch(seed), { ok: true, errors: [] });
  const marks = [...seed.strokes, ...seed.shapes, ...seed.items];
  assert.equal(new Set(marks.map(mark => mark.id)).size, marks.length);
  assert.ok(marks.every(mark => mark.author === 'lesson' && mark.meta.semanticId && mark.meta.label));
  for (const [id, label] of Object.entries(SEED_LABELS)) assert.equal(label, sigmoidObjects[id].label, id);
  const open = viewStep(VIEW_START, { type: 'frame', sketch: seed, frame: { w: 560, h: 300 } });
  assert.deepEqual(open.view, IDENTITY_VIEW, 'nothing is clipped at 100 percent');
});

test('an edit saves through the contract: the sketch is replaced, the snapshot is carried over untouched, sketchFrom is written once', () => {
  const snapshot = fixture('whiteboard-editor.json'), before = JSON.stringify(snapshot);
  // The migration seam is a stub here, so a board with a snapshot is not editable yet (see the next test); a converted one is.
  const converted = { id: 'w1', type: 'whiteboard', snapshot, sketch: { strokes: [], shapes: [rect('a')], items: [] }, sketchFrom: { digest: digestOf(snapshot), v: 1 } };
  const next = edit(converted, 'shapes', marks => [...marks, rect('b')]);
  assert.equal(next.snapshot, snapshot, 'by reference');
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(next.sketch.shapes.map(mark => mark.id), ['a', 'b']);
  assert.equal(legacyState(next), 'converted');
  assert.equal(next.sketchFrom, converted.sketchFrom);
  assert.equal(converted.sketch.shapes.length, 1, 'the previous block object is not mutated');
  const plain = edit(fresh(), 'items', items => [...items, { id: 'i', kind: 'text', x: 5, y: 5, text: 'hello' }]);
  assert.equal(plain.sketchFrom, undefined, 'no snapshot, nothing to record');
  assert.deepEqual(validateWhiteboardBlock(plain), { ok: true, errors: [] });
  assert.equal(plain.snapshot, null);
});

test('a board that is not converted yet, a read-only viewer and a locked or copied card never write', () => {
  const snapshot = fixture('whiteboard-editor.json');
  const unconverted = { id: 'w1', type: 'whiteboard', snapshot };
  assert.equal(conversionPending(unconverted), true);
  assert.equal(edit(unconverted, 'shapes', marks => [...marks, rect('x')]), unconverted, 'the original is never saved over an empty derivation');
  assert.match(boardNotice(unconverted), /not been converted/);
  const mine = { ...fresh(), sketch: { strokes: [], shapes: [rect('a')], items: [] } };
  assert.notEqual(edit(mine, 'shapes', () => []), mine, 'an editor writes');
  assert.equal(edit(mine, 'shapes', () => [], { readOnly: true }), mine, 'a shared read-only viewer');
  assert.equal(edit(mine, 'shapes', () => [], { canEdit: false }), mine, 'a viewer without a copy');
  assert.equal(addMarks(mine, { shapes: [rect('t')] }, { readOnly: true }), mine);
});

test('undo and redo are the block objects the canvas history keeps: every edit is one step and unconverted state comes back', () => {
  const states = [fresh()];
  const step = change => states.push(change(states.at(-1)));
  step(block => edit(block, 'strokes', marks => [...marks, stroke(1)]));
  step(block => edit(block, 'shapes', marks => [...marks, rect('r1')]));
  step(block => edit(block, 'items', marks => [...marks, { id: 't1', kind: 'text', x: 1, y: 1, text: 'x' }]));
  const counts = block => { const s = sketchOf(block); return [s.strokes.length, s.shapes.length, s.items.length]; };
  assert.deepEqual(states.map(counts), [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]]);
  // undo twice, redo once: the history restores the earlier objects, whose sketches are unchanged by later edits
  assert.deepEqual(counts(states[1]), [1, 0, 0]);
  assert.deepEqual(counts(states[2]), [1, 1, 0]);
  // the stroke keeps the same id in every state
  assert.equal(sketchOf(states[3]).strokes[0].id, sketchOf(states[1]).strokes[0].id);
  // a demo board: the first edit saves the seed plus the edit; undoing returns to the unsaved seed
  const demo = { ...fresh(), demo: 'sigmoid' };
  const edited = edit(demo, 'shapes', marks => [...marks, rect('mine')]);
  assert.equal(sketchOf(edited).shapes.length, 5);
  assert.equal(demo.sketch, undefined);
  assert.equal(sketchOf(demo).shapes.length, 4);
});

test('a drawing too large for the block stays on screen, saves its last fitting sketch, and the snapshot is never dropped', () => {
  const snapshot = fixture('whiteboard-editor.json');
  const big = Array.from({ length: 12000 }, (_, n) => stroke(n, { points: Array.from({ length: 12 }, (__, k) => ({ x: n + k, y: k * 3 })) }));
  assert.ok(JSON.stringify({ strokes: big }).length > LIMITS.sketchChars);
  const converted = { id: 'w1', type: 'whiteboard', snapshot, sketch: { strokes: [stroke(1)], shapes: [], items: [] }, sketchFrom: { digest: digestOf(snapshot), v: 1 } };
  const over = edit(converted, 'strokes', () => big);
  assert.equal(over.tooLarge, true);
  assert.equal(sketchOf(over).strokes.length, 12000, 'still drawn');
  assert.equal(over.snapshot, snapshot);
  assert.match(boardNotice(over), /too large to save/);
  const saved = persistable(over);
  assert.equal(saved.tooLarge, undefined);
  assert.equal(saved.sketch.strokes.length, 1, 'the last sketch that fit is what is saved');
  assert.equal(saved.snapshot, snapshot);
  // further edits while over keep the same last-fitting copy; getting back under the limit clears the flag
  const again = edit(over, 'items', items => [...items, { id: 'n', kind: 'text', x: 0, y: 0, text: 'x' }]);
  assert.equal(again.tooLarge, true);
  assert.equal(persistable(again).sketch.strokes.length, 1);
  const back = edit(again, 'strokes', () => [stroke(2)]);
  assert.equal(back.tooLarge, undefined);
  assert.equal(back.savedSketch, undefined);
  assert.equal(persistable(back), back);
  // a first edit that is already too large on a board with no saved sketch saves no sketch at all
  assert.equal(persistable(edit(fresh(), 'strokes', () => big)).sketch, undefined);
});

test('the whole board is measured only for a large sketch, and a board that would pass its limit is refused like a sketch', () => {
  const sketch = { strokes: [stroke(1)], shapes: [], items: [] };
  const block = { ...fresh(), sketch };
  assert.equal(saveVerdict({ block, sketch, boardChars: LIMITS.boardChars + 1 }).ok, false);
  let measured = 0;
  edit(block, 'shapes', marks => [...marks, rect('a')], { boardChars: () => { measured += 1; return 0; } });
  assert.equal(measured, 0, 'a small sketch does not pay for stringifying the board');
  const large = { strokes: Array.from({ length: 1400 }, (_, n) => stroke(n, { points: Array.from({ length: 8 }, (__, k) => ({ x: k * 7.5, y: n + k * 1.5 })) })), shapes: [], items: [] };
  const chars = JSON.stringify(large).length;
  assert.ok(chars > 100_000 && chars < LIMITS.sketchChars, `${chars} is large but fits the block`);
  const over = editWhiteboard(block, () => large, { boardChars: () => { measured += 1; return LIMITS.boardChars; } });
  assert.equal(measured, 1, 'a large sketch measures the board once');
  assert.equal(over.tooLarge, true, 'the whole board would pass 1.9 MB');
  assert.equal(over.savedSketch.strokes.length, 1);
  assert.equal(editWhiteboard(block, () => large, { boardChars: () => 200_000 }).tooLarge, undefined, 'on a small board it saves');
});

test('Tutor marks merge in one edit and never twice; Remove explanation takes the Tutor out and leaves the rest', () => {
  const mark = (id, extra = {}) => rect(id, 0, 0, 10, 10, { author: 'assistant', explanationId: 'e1', objectId: id, ...extra });
  const mine = edit(fresh(), 'shapes', marks => [...marks, rect('mine')]);
  const once = addMarks(mine, { shapes: [mark('t1'), mark('t2')], items: [{ id: 'tx', kind: 'text', x: 1, y: 1, text: 'why', author: 'assistant', explanationId: 'e1', objectId: 'tx' }] });
  assert.equal(countAssistant(sketchOf(once)), 3);
  const twice = addMarks(once, { shapes: [mark('t1'), mark('t2')] });
  assert.deepEqual(sketchOf(twice).shapes.map(m => m.id), ['mine', 't1', 't2'], 'a retry adds nothing');
  assert.deepEqual(mergeMarks(emptySketch(), null), emptySketch());
  const removed = editWhiteboard(twice, sketch => ({ ...sketch, shapes: sketch.shapes.filter(m => m.author !== 'assistant'), items: sketch.items.filter(m => m.author !== 'assistant') }));
  assert.deepEqual(sketchOf(removed).shapes.map(m => m.id), ['mine']);
});

test('the view: a fitting board opens at 100 percent, a large one fitted, resize re-chooses until the learner chooses, and it is never a write', () => {
  const near = { strokes: [], shapes: [rect('a', 20, 20, 120, 80)], items: [] };
  const far = { strokes: [], shapes: [rect('a', 20, 20, 1220, 780)], items: [] };
  const frame = { w: 500, h: 300 };
  assert.deepEqual(viewStep(VIEW_START, { type: 'frame', sketch: near, frame }).view, IDENTITY_VIEW);
  const opened = viewStep(VIEW_START, { type: 'frame', sketch: far, frame });
  assert.ok(opened.view.s < 1 && opened.auto, 'a large board opens whole');
  const corner = toFrame({ x: 1220, y: 780 }, opened.view);
  assert.ok(corner.x <= frame.w && corner.y <= frame.h, 'the far corner is inside the frame');
  const roundTrip = toSketch(toFrame({ x: 321, y: 123 }, opened.view), opened.view);
  assert.ok(Math.abs(roundTrip.x - 321) < 1e-9 && Math.abs(roundTrip.y - 123) < 1e-9, 'a point drawn in a fitted view lands in sketch space');
  const resized = viewStep(opened, { type: 'frame', sketch: far, frame: { w: 900, h: 500 } });
  assert.ok(resized.view.s > opened.view.s && resized.auto, 'resize chooses again while the card chose');
  const chosen = viewStep(resized, { type: 'reset', sketch: far, frame });
  assert.deepEqual([chosen.view, chosen.auto], [IDENTITY_VIEW, false]);
  assert.equal(viewStep(chosen, { type: 'frame', sketch: far, frame: { w: 100, h: 100 } }), chosen, 'a view the learner chose is kept');
  const focused = viewStep(chosen, { type: 'focus', sketch: far, frame, rect: { x: 700, y: 400, x2: 800, y2: 450 } });
  const centre = toFrame({ x: 750, y: 425 }, focused.view);
  assert.ok(Math.abs(centre.x - 250) < 1e-6 && Math.abs(centre.y - 150) < 1e-6, 'focus centres the rectangle');
  assert.ok(focused.view.s <= 1, 'never magnified');
  assert.equal(viewStep(VIEW_START, { type: 'fit', sketch: far, frame: { w: 0, h: 0 } }), VIEW_START, 'no frame yet, no change');
  assert.equal(viewStep(chosen, { type: 'fit', sketch: emptySketch(), frame }).view.s, 1, 'an empty board fits at 100 percent');
});

test('selection survives only for marks that still exist', () => {
  const sketch = { strokes: [], shapes: [rect('a')], items: [{ id: 'i', kind: 'text', x: 0, y: 0, text: 't' }] };
  const selection = ['a', 'i'];
  assert.equal(pruneSelection(selection, sketch), selection, 'unchanged selection is the same array');
  assert.deepEqual(pruneSelection(['a', 'gone'], sketch), ['a']);
  assert.deepEqual(pruneSelection(['a'], emptySketch()), []);
});

test('the kept layer lists what the sketch cannot hold, with positions and a read-only picture, and never touches the snapshot', () => {
  const snapshot = fixture('whiteboard-editor.json'), before = JSON.stringify(snapshot);
  const kept = keptOf(snapshot);
  assert.deepEqual(kept.items.map(item => item.id), ['shape:picture', 'shape:model', 'shape:graph', 'shape:clip']);
  assert.deepEqual(kept.items.map(item => item.name).slice(1), ['Gradient descent surface', 'Logistic curve', 'How the curve flattens']);
  assert.ok(kept.items.every(item => item.bounds && item.bounds.x2 > item.bounds.x));
  assert.match(kept.picture.src, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.ok(kept.picture.width > 0 && Number.isFinite(kept.picture.x));
  assert.equal(keptOf(snapshot), kept, 'cached per snapshot');
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(keptOf(null), { items: [], picture: null });
  assert.deepEqual(keptOf({ not: 'a snapshot' }), { items: [], picture: null });
  // the picture holds only the kept records
  const all = legacySnapshotToSvg(snapshot), only = legacySnapshotToSvg(snapshot, { only: shape => shape.id === 'shape:model' });
  assert.ok(all.shapes > only.shapes && only.shapes === 1);
  assert.ok(decodeURIComponent(kept.picture.src).includes('Gradient descent surface'));
});

test('the board save writes the last fitting sketch of a card whose drawing is too large, and everything else as it is', () => {
  const big = Array.from({ length: 12000 }, (_, n) => stroke(n, { points: Array.from({ length: 12 }, (__, k) => ({ x: n + k, y: k * 3 })) }));
  const over = edit({ ...fresh(), sketch: { strokes: [stroke(1)], shapes: [], items: [] } }, 'strokes', () => big);
  const other = { id: 'x', type: 'quiz' };
  const [saved, same] = lightBlocks([over, other]);
  assert.equal(saved.sketch.strokes.length, 1);
  assert.equal(saved.tooLarge, undefined);
  assert.equal(same, other);
  assert.equal(over.sketch.strokes.length, 12000, 'the block in memory is unchanged');
});
