// The whiteboard data contract (docs/features/tldraw-removal.md, "Data contract"): validators, legacy state, the persistence
// rules, selection, fit and focus, Tutor draw-back, linked cards and the legacy mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readLegacySnapshot } from './legacy-whiteboard.js';
import {
  IDENTITY_VIEW, LIMITS, RICH_CARD, cardIdFor, cardsOf, contentBounds, countAssistant, digestOf, explanationIdFor, fitView, focusView, initialView, insertLinkedCards,
  isClipped, legacyState, legacyTarget, markBounds, marksIn, mayPersist, normalizeSketch, removeExplanation, saveVerdict, toFrame, toSketch, validateDrawBack,
  validateSketch, validateWhiteboardBlock, viewFor, withSketch, withStrokeIds,
} from './whiteboard-sketch.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./__fixtures__/tldraw/${name}`, import.meta.url), 'utf8'));
const near = (a, b, by = 1e-9) => assert.ok(Math.abs(a - b) <= by, `${a} vs ${b}`);
const stroke = (points, extra = {}) => ({ tool: 'pen', color: '#37352f', width: 2, points, ...extra });
const rect = (id, x1, y1, x2, y2, extra = {}) => ({ id, kind: 'rect', x1, y1, x2, y2, color: '#37352f', width: 2, ...extra });
const sketch = () => ({ strokes: [stroke([{ x: 0, y: 0 }, { x: 50, y: 30 }])], shapes: [rect('a', 100, 100, 200, 160, { text: 'Input' })], items: [{ id: 'n', kind: 'sticky', x: 300, y: 20, text: 'Remember' }] });

test('a valid sketch passes, a missing list is empty, and every malformed mark is named', () => {
  assert.deepEqual(validateSketch(sketch()), { ok: true, errors: [] });
  assert.equal(validateSketch({}).ok, true);
  assert.deepEqual(normalizeSketch(null), { strokes: [], shapes: [], items: [] });
  const bad = validateSketch({ strokes: [{ tool: 'brush', points: [{ x: 1, y: NaN }] }], shapes: [rect('a', 0, 0, 1, 1), rect('a', 0, 0, 1, 1), { id: 'k', kind: 'blob', x1: 0, y1: 0, x2: 1 }], items: [{ kind: 'text', x: 0, y: 0 }, { id: 'z', kind: 'text', x: 0, y: 0, text: 5, author: 'robot' }] });
  assert.equal(bad.ok, false);
  for (const part of ['tool must be pen', 'points must be a list of finite', 'duplicate id a', 'unknown kind blob', 'x1 y1 x2 y2', 'id must be a non-empty string', 'text must be a string', 'unknown author robot']) {
    assert.ok(bad.errors.some(message => message.includes(part)), part);
  }
  assert.equal(validateSketch('x').ok, false);
  assert.equal(validateSketch({ strokes: {} }).ok, false);
});

test('the whiteboard block: a snapshot is opaque, sketchFrom needs its snapshot, and the retired field is not required', () => {
  const snapshot = fixture('whiteboard-editor.json');
  assert.equal(validateWhiteboardBlock({ id: 'w', type: 'whiteboard', snapshot }).ok, true);
  assert.equal(validateWhiteboardBlock({ id: 'w', type: 'whiteboard', snapshot: null, sketch: sketch() }).ok, true);
  assert.equal(validateWhiteboardBlock({ id: 'w', type: 'whiteboard', sketch: sketch(), sketchFrom: { digest: 'x', v: 1 } }).ok, false, 'a sketchFrom with no snapshot');
  assert.equal(validateWhiteboardBlock({ id: 'w', type: 'note' }).ok, false);
  assert.equal(validateWhiteboardBlock({ id: 'w', type: 'whiteboard', sketch: { shapes: [{ kind: 'rect' }] } }).errors.some(m => m.startsWith('sketch: ')), true);
});

test('legacy state: none, unconverted, converted, diverged; the digest ignores key order and sees every change', () => {
  const snapshot = fixture('whiteboard-editor.json');
  assert.equal(legacyState({ type: 'whiteboard', snapshot: null }), 'none');
  assert.equal(legacyState({ type: 'whiteboard', snapshot }), 'unconverted');
  const saved = withSketch({ id: 'w', type: 'whiteboard', snapshot }, sketch());
  assert.equal(legacyState(saved), 'converted');
  const reordered = JSON.parse(JSON.stringify(snapshot, (_, value) => (value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value)));
  assert.equal(digestOf(reordered), digestOf(snapshot));
  const edited = structuredClone(snapshot);
  edited.document.store['shape:box'].x += 1;
  assert.equal(legacyState({ ...saved, snapshot: edited }), 'diverged');
  assert.match(digestOf(snapshot), /^[0-9a-f]{14}$/);
});

test('saving a sketch keeps the original snapshot by reference, records where it came from once, and a read-only viewer never writes', () => {
  const snapshot = fixture('whiteboard-editor.json'), before = JSON.stringify(snapshot);
  const first = withSketch({ id: 'w', type: 'whiteboard', snapshot, tooLarge: true }, sketch());
  assert.equal(first.snapshot, snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(first.sketchFrom.digest, digestOf(snapshot));
  assert.equal(first.tooLarge, undefined);
  const second = withSketch(first, { ...sketch(), items: [] });
  assert.deepEqual(second.sketchFrom, first.sketchFrom, 'the origin is recorded once');
  assert.equal(withSketch({ id: 'n', type: 'whiteboard' }, sketch()).sketchFrom, undefined, 'a new board has no origin');
  assert.deepEqual([mayPersist(), mayPersist({ readOnly: true }), mayPersist({ canEdit: false }), mayPersist({ canEdit: true, readOnly: false })], [true, false, false, true]);
});

test('size: both representations count toward the board, nothing is ever dropped to fit, the sketch alone has its own cap', () => {
  const snapshot = fixture('whiteboard-editor.json'), block = { id: 'w', type: 'whiteboard', snapshot };
  const small = saveVerdict({ block, sketch: sketch(), boardChars: 100_000 });
  assert.equal(small.ok, true);
  assert.equal(small.warn, false);
  const over = saveVerdict({ block, sketch: sketch(), boardChars: LIMITS.boardChars - 10 });
  assert.deepEqual([over.ok, over.reason], [false, 'board-too-large']);
  assert.equal(saveVerdict({ block, sketch: sketch(), boardChars: LIMITS.boardChars * 0.9 }).warn, true);
  const huge = { strokes: [stroke(Array.from({ length: 20000 }, (_, i) => ({ x: i * 1.5, y: i * 2.5 })))], shapes: [], items: [] };
  assert.equal(saveVerdict({ block, sketch: huge, boardChars: 10 }).reason, 'sketch-too-large');
  // replacing a saved sketch counts the difference, not both
  const saved = withSketch(block, sketch());
  assert.equal(saveVerdict({ block: saved, sketch: sketch(), boardChars: LIMITS.boardChars }).ok, true);
  assert.ok(!('drop' in over) && !Object.keys(over).some(key => /snapshot/i.test(key)), 'the verdict never offers to remove the original');
});

test('ids: a stroke without one gets a stable derived id, repeated opens agree, and an existing id is kept', () => {
  const base = { strokes: [stroke([{ x: 1, y: 1 }, { x: 5, y: 5 }]), stroke([{ x: 1, y: 1 }, { x: 5, y: 5 }]), stroke([{ x: 9, y: 9 }, { x: 2, y: 2 }], { id: 'mine' })], shapes: [], items: [] };
  const once = withStrokeIds(base), again = withStrokeIds(base);
  assert.deepEqual(once, again);
  assert.equal(new Set(once.strokes.map(s => s.id)).size, 3, 'two identical strokes still get two ids');
  assert.equal(once.strokes[2].id, 'mine');
  assert.equal(base.strokes[0].id, undefined, 'the input is not changed');
  assert.deepEqual(validateSketch(once), { ok: true, errors: [] });
});

test('selection: marks wholly inside a crop, else the ones it touches, as { id, type, text, author }', () => {
  const s = withStrokeIds({ ...sketch(), shapes: [...sketch().shapes, rect('far', 900, 900, 950, 950, { author: 'assistant', label: 'Output' })] });
  assert.deepEqual(marksIn(s, { x: 90, y: 90, x2: 210, y2: 170 }), [{ id: 'a', type: 'rect', text: 'Input', author: 'learner' }]);
  const touching = marksIn(s, { x: 150, y: 120, x2: 250, y2: 400 }).map(m => m.id);
  assert.deepEqual(touching, ['a'], 'nothing is wholly inside, so the one touched');
  assert.deepEqual(marksIn(s, { x: 890, y: 890, x2: 960, y2: 960 }), [{ id: 'far', type: 'rect', text: 'Output', author: 'assistant' }]);
  assert.deepEqual(marksIn(s, { x: 5000, y: 5000, x2: 6000, y2: 6000 }), []);
  assert.equal(marksIn({ strokes: [stroke([{ x: 0, y: 0 }, { x: 4, y: 4 }])] }, { x: -5, y: -5, x2: 20, y2: 20 })[0].id, 'stroke:0', 'an id-less stroke is named by position');
  const box = markBounds({ kind: 'text', x: 10, y: 10, text: 'a\nbb' }, 'items');
  assert.ok(box.x2 > 10 && box.y2 >= 58);
});

test('fit and focus: a drawing larger than the card is reached, never clipped; the view round-trips; it magnifies nothing', () => {
  const frame = { w: 600, h: 400 };
  const wide = { strokes: [], shapes: [rect('big', -500, -300, 2500, 1700)], items: [] };
  assert.equal(isClipped(wide, frame), true);
  const fit = initialView(wide, frame);
  assert.ok(fit.s < 0.25);
  const bounds = contentBounds(wide);
  for (const corner of [{ x: bounds.x, y: bounds.y }, { x: bounds.x2, y: bounds.y2 }]) {
    const at = toFrame(corner, fit);
    assert.ok(at.x >= 0 && at.x <= frame.w && at.y >= 0 && at.y <= frame.h, 'every corner lands inside the frame');
  }
  const p = { x: 123, y: -45 };
  near(toSketch(toFrame(p, fit), fit).x, p.x); near(toSketch(toFrame(p, fit), fit).y, p.y);
  const small = { strokes: [], shapes: [rect('s', 100, 100, 160, 140)], items: [] };
  assert.equal(isClipped(small, frame), false);
  assert.equal(initialView(small, frame), IDENTITY_VIEW);
  assert.equal(fitView(small, frame).s, 1, 'a small drawing is centred, not enlarged');
  const focus = focusView({ x: 2000, y: 1200, x2: 2500, y2: 1700 }, frame);
  const corner = toFrame({ x: 2000, y: 1200 }, focus);
  assert.ok(corner.x >= 0 && corner.y >= 0);
  assert.deepEqual(fitView({ strokes: [], shapes: [], items: [] }, frame), IDENTITY_VIEW);
  assert.ok(viewFor({ x: 0, y: 0, x2: 0, y2: 0 }, frame).s > 0, 'a point is a valid focus');
});

test('Tutor draw-back: one explanation id, assistant marks, and a retry or reload finds the same ids', () => {
  const id = explanationIdFor('w1', 'answer-9');
  assert.equal(id, explanationIdFor('w1', 'answer-9'));
  assert.notEqual(id, explanationIdFor('w1', 'answer-10'));
  const mark = (extra = {}) => ({ id: 'm1', kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, author: 'assistant', explanationId: id, objectId: 'o1', ...extra });
  const ok = { explanationId: id, marks: { shapes: [mark()], items: [] }, cards: [{ kind: 'graph', objectId: 'o2', operation: {} }] };
  assert.deepEqual(validateDrawBack(ok), { ok: true, errors: [] });
  for (const [bad, part] of [[{ ...ok, marks: { shapes: [mark({ author: 'learner' })] } }, 'author must be assistant'], [{ ...ok, marks: { shapes: [mark({ author: undefined })] } }, 'author must be assistant'],
    [{ ...ok, marks: { shapes: [mark({ explanationId: 'other' })] } }, 'explanationId must match'], [{ ...ok, marks: { shapes: [mark({ objectId: '' })] } }, 'objectId is required'],
    [{ ...ok, cards: [{ kind: 'spreadsheet', objectId: 'x' }] }, 'is not a card kind'], [{ marks: {} }, 'explanationId is required']]) {
    assert.ok(validateDrawBack(bad).errors.some(message => message.includes(part)), part);
  }
  const board = { strokes: [stroke([{ x: 0, y: 0 }, { x: 1, y: 1 }], { id: 's1' })], shapes: [rect('l', 0, 0, 5, 5), mark(), mark({ id: 'm2', explanationId: 'exp:older' })], items: [] };
  assert.equal(countAssistant(board), 2);
  assert.deepEqual(removeExplanation(board, id).shapes.map(m => m.id), ['l', 'm2'], 'one explanation goes');
  assert.deepEqual(removeExplanation(board).shapes.map(m => m.id), ['l'], 'all Tutor marks go, the learner and lesson stay');
  assert.equal(removeExplanation(board).strokes.length, 1);
});

test('linked cards: the id is a function of the link, a second insert is one card, an existing card is never replaced', () => {
  const link = { whiteboard: 'w1', explanationId: 'exp:1', objectId: 'o2' };
  const card = { kind: 'three_d', whiteboardLink: link, block: { title: 'Surface', modelUrl: 'https://example.test/m.glb', dx: 40, dy: 0 } };
  const first = insertLinkedCards([{ id: 'w1', type: 'whiteboard' }], [card]);
  assert.equal(first.added.length, 1);
  assert.deepEqual([first.blocks[1].type, first.blocks[1].id, first.blocks[1].whiteboardLink], ['model3d', cardIdFor(link), link]);
  const retry = insertLinkedCards(first.blocks, [{ ...card, block: { title: 'Changed' } }]);
  assert.equal(retry.added.length, 0);
  assert.equal(retry.blocks.length, 2);
  assert.equal(retry.blocks[1].title, 'Surface', 'an existing card is not overwritten');
  assert.equal(cardsOf(first.blocks, 'w1').length, 1);
  assert.equal(cardsOf(first.blocks, 'other').length, 0);
  assert.notEqual(cardIdFor(link), cardIdFor({ ...link, objectId: 'o3' }));
  assert.throws(() => insertLinkedCards([], [{ kind: 'graph', block: {} }]), /whiteboardLink/);
  assert.throws(() => insertLinkedCards([], [{ kind: 'unknown', whiteboardLink: link, block: {} }]), /card kind/);
  assert.deepEqual(RICH_CARD, { graph: 'graph', three_d: 'model3d', video: 'videoGenerate', scene: 'scene', image: 'image', paper_figure: 'image' });
});

test('the legacy mapping covers every record kind the S1 reader returns; what has no counterpart is kept, not dropped', () => {
  const read = readLegacySnapshot(fixture('whiteboard-editor.json'));
  const target = Object.fromEntries(read.shapes.map(shape => [shape.id.replace('shape:', ''), legacyTarget(shape)]));
  assert.deepEqual(target.pen, { list: 'strokes', kind: 'pen', approx: false });
  assert.deepEqual(target.marker, { list: 'strokes', kind: 'highlighter', approx: false });
  assert.deepEqual(target.box, { list: 'shapes', kind: 'rect', approx: false });
  assert.deepEqual(target.star, { list: 'shapes', kind: 'star', approx: false });
  assert.deepEqual(target.output, { list: 'shapes', kind: 'ellipse', approx: false });
  assert.deepEqual(target.title, { list: 'items', kind: 'text', approx: false });
  assert.deepEqual(target.sticky, { list: 'items', kind: 'sticky', approx: false });
  assert.deepEqual(target['bound-arrow'], { list: 'shapes', kind: 'arrow', approx: false });
  assert.deepEqual(target['curve-arrow'], { list: 'shapes', kind: 'curve', approx: false });
  assert.deepEqual(target.ruler, { list: 'shapes', kind: 'line', approx: false });
  assert.deepEqual(target.frame, { list: 'shapes', kind: 'rect', approx: true });
  assert.deepEqual(target.inside, { list: 'shapes', kind: 'diamond', approx: false });
  for (const kept of ['picture', 'model', 'graph', 'clip']) assert.equal(target[kept], null, `${kept} stays in the retained snapshot`);
  assert.deepEqual(legacyTarget({ kind: 'geo', geo: 'pentagon' }), { list: 'shapes', kind: 'hexagon', approx: true });
  assert.deepEqual(legacyTarget({ kind: 'geo', geo: 'something-new' }), { list: 'shapes', kind: 'rect', approx: true });
  assert.equal(legacyTarget({ kind: 'group' }), null);
  assert.equal(legacyTarget({ kind: 'unknown' }), null);
  assert.equal(legacyTarget(undefined), null);
});

test('the contract module imports nothing', () => {
  assert.doesNotMatch(readFileSync(new URL('./whiteboard-sketch.js', import.meta.url), 'utf8'), /^\s*import\s|\bfrom\s+['"]|require\(/m);
});
