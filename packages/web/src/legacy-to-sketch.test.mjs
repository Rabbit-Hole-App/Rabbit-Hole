// Workstream B of docs/features/tldraw-removal.md: the converter from what tldraw saved to the native sketch, deriveSketch, and
// the size-limit decision table. The fixtures were written by tldraw 5.4.2's own schema and store (src/__fixtures__/tldraw/generate.mjs
// and generate-more.mjs); nothing here loads tldraw. What these tests cannot say: that a converted drawing LOOKS like the
// original. Geometry, ids and fields are checked; pixel fidelity needs a human eye on the dev build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readLegacySnapshot } from './legacy-whiteboard.js';
import { convertLegacy, deriveSketch, saveNotice } from './legacy-to-sketch.js';
import { LIMITS, countAssistant, digestOf, legacyState, mayPersist, removeExplanation, saveVerdict, validateSketch, withSketch } from './whiteboard-sketch.js';
import { forkState } from '../../control-plane/src/learn-boards.js';
import { sharedState } from '../../control-plane/src/shared-privacy.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./__fixtures__/tldraw/${name}.json`, import.meta.url), 'utf8'));
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const near = (a, b, by = 0.06) => assert.ok(Math.abs(a - b) <= by, `${a} is not within ${by} of ${b}`);
const all = sketch => [...sketch.strokes, ...sketch.shapes, ...sketch.items];
const mark = (sketch, legacyId) => all(sketch).find(m => m.legacyId === legacyId && !m.id.includes('#'));
const block = (snapshot, extra = {}) => ({ id: 'w1', type: 'whiteboard', title: 'Board', narration: 'n', snapshot, ...extra });

// ---------- B1: strokes, shapes, arrows, lines, text, notes with deterministic ids ----------
test('the base board converts to valid marks whose ids are the tldraw ids, with provenance, and nothing is lost silently', () => {
  const snapshot = fixture('whiteboard-editor'), result = convertLegacy(snapshot);
  assert.equal(result.ok, true);
  assert.deepEqual(validateSketch(result.sketch), { ok: true, errors: [] });
  assert.deepEqual(result.report.counts, { strokes: 3, shapes: 8, items: 3 });
  const ids = all(result.sketch).map(m => m.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique across the three lists');
  assert.ok(result.sketch.strokes.every(stroke => stroke.id === stroke.legacyId), 'every stroke carries an id');
  // 17 shapes on the page: 14 become marks (a frame also adds its title), 4 are kept: the image and the three app shapes (minus the group-less count).
  assert.equal(result.report.kept, 4);
  assert.deepEqual(result.kept.map(k => [k.id, k.kind]), [['shape:picture', 'image'], ['shape:model', 'card'], ['shape:graph', 'card'], ['shape:clip', 'card']]);
  assert.deepEqual(result.report.otherPages.map(page => [page.name, page.shapes]), [['Page 2', 1]], 'the second page is reported, and stays in the snapshot');
  assert.equal(mark(result.sketch, 'shape:title').author, 'assistant');
  assert.deepEqual(mark(result.sketch, 'shape:box').meta, { author: 'lesson' });
  assert.deepEqual(mark(result.sketch, 'shape:title').meta, { author: 'assistant', semanticId: 'title' }, 'meta is kept whole');
});

test('kinds, colours, widths, dashes, fills and words map onto the canvas fields', () => {
  const { sketch } = convertLegacy(fixture('whiteboard-editor'));
  const pen = mark(sketch, 'shape:pen');
  assert.deepEqual([pen.tool, pen.color, pen.width, pen.points.length], ['pen', '#2383e2', 3.5, 24]);
  near(pen.points[23].x, 40 + 138); near(pen.points[23].y, 60 + Math.sin(23 / 3) * 20); // the shape sits at (40, 60)
  assert.equal(mark(sketch, 'shape:pen2d').dash, 'dashed');
  const marker = mark(sketch, 'shape:marker');
  assert.deepEqual([marker.tool, marker.width], ['highlighter', 14], 'the highlighter is four times the pen width, as the canvas draws it');
  const box = mark(sketch, 'shape:box');
  assert.deepEqual([box.kind, box.x1, box.y1, box.x2, box.y2, box.text, box.color], ['rect', 300, 40, 460, 130, 'Input', '#1a7f37']);
  assert.equal(box.fill, undefined, 'tldraw semi fill is the page colour, so the box is left see-through');
  const star = mark(sketch, 'shape:star');
  assert.deepEqual([star.kind, star.fill, star.fillOpacity], ['star', star.color, 0.2]);
  assert.equal(mark(sketch, 'shape:output').text, 'Output\nprobability');
  assert.deepEqual([mark(sketch, 'shape:ruler').kind, mark(sketch, 'shape:ruler').dash, mark(sketch, 'shape:ruler').x2, mark(sketch, 'shape:ruler').y2], ['line', 'dashed', 450, 420]);
  const sticky = mark(sketch, 'shape:sticky');
  assert.deepEqual([sticky.kind, sticky.w, sticky.h, sticky.text], ['sticky', 200, 200, 'Remember: output is between 0 and 1']);
  const title = mark(sketch, 'shape:title');
  assert.deepEqual([title.kind, title.x, title.y, title.fontSize], ['text', 40, 0, 24]);
});

test('converting is deterministic: repeated opens, a JSON round trip and a frozen input give byte-identical results', () => {
  for (const name of ['whiteboard-editor', 'arrows-groups', 'assets-images', 'metadata-unknown', 'sigmoid-board', 'near-cap']) {
    const snapshot = fixture(name), first = JSON.stringify(convertLegacy(snapshot));
    assert.equal(JSON.stringify(convertLegacy(snapshot)), first, `${name}: a second open`);
    assert.equal(JSON.stringify(convertLegacy(JSON.parse(JSON.stringify(snapshot)))), first, `${name}: after a reload`);
    assert.equal(JSON.stringify(convertLegacy(deepFreeze(snapshot))), first, `${name}: a frozen input is read, never changed`);
  }
});

test('a dot, a closed pen shape, an empty stroke and a one-point line are handled, never dropped without a word', () => {
  const snapshot = fixture('whiteboard-editor'), store = snapshot.document.store;
  const dot = structuredClone(store['shape:pen']);
  dot.id = 'shape:dot'; dot.index = 'aY'; dot.props.segments = [{ type: 'free', path: store['shape:marker'].props.segments[0].path.slice(0, 16) }];
  store['shape:dot'] = dot;
  const closed = structuredClone(store['shape:pen']);
  closed.id = 'shape:closed'; closed.index = 'aZ'; closed.props.isClosed = true; closed.props.fill = 'solid';
  store['shape:closed'] = closed;
  const empty = structuredClone(store['shape:pen']);
  empty.id = 'shape:empty'; empty.index = 'aX'; empty.props.segments = [];
  store['shape:empty'] = empty;
  const stub = structuredClone(store['shape:ruler']);
  stub.id = 'shape:stub'; stub.index = 'aW'; stub.props.points = { a: { id: 'a', index: 'a1', x: 0, y: 0 } };
  store['shape:stub'] = stub;
  const result = convertLegacy(snapshot);
  assert.equal(mark(result.sketch, 'shape:dot').points.length, 2, 'a dot becomes two equal points so the canvas counts and draws it');
  const closedMark = mark(result.sketch, 'shape:closed');
  assert.deepEqual(closedMark.points.at(-1), closedMark.points[0], 'a closed shape is closed');
  assert.match(closedMark.approx, /fill/, 'the canvas stroke has no fill, and it says so');
  assert.deepEqual(result.report.skipped.map(s => s.legacyId).sort(), ['shape:empty', 'shape:stub'], 'what has nothing to draw is listed');
  assert.deepEqual(validateSketch(result.sketch), { ok: true, errors: [] });
});

// ---------- B2: frames, groups, bound arrows, rotation ----------
test('rotation: strokes and arrows rotate exactly, boxes are exact at the quarter turns that keep their look, the rest say approx', () => {
  const { sketch } = convertLegacy(fixture('arrows-groups'));
  const rect90 = mark(sketch, 'shape:rect90');
  assert.deepEqual([rect90.x1, rect90.y1, rect90.x2, rect90.y2, rect90.approx], [40, 40, 100, 160, undefined], 'a quarter turn swaps width and height about the centre, exactly');
  const rect30 = mark(sketch, 'shape:rect30');
  assert.equal(rect30.approx, 'rotation');
  near(rect30.legacyRotation, Math.PI / 6, 1e-3);
  assert.deepEqual([rect30.x2 - rect30.x1, rect30.y2 - rect30.y1], [120, 60], 'size is kept, the box stands upright at its centre');
  assert.equal(mark(sketch, 'shape:tri180').approx, 'rotation', 'an upside-down triangle cannot be drawn');
  assert.equal(mark(sketch, 'shape:hex180').approx, undefined, 'a hexagon looks the same after a half turn');
  const pen = mark(sketch, 'shape:pen-turned');
  assert.deepEqual(pen.points.map(p => [p.x, p.y]), [[900, 40], [900, 80], [870, 80]], 'a rotated stroke is rotated point by point');
  const text = mark(sketch, 'shape:text90');
  assert.equal(text.approx, 'rotation');
  assert.ok(text.x > 700 && text.y > 40, 'rotated text stands upright at its rotated centre');
});

test('groups have no mark of their own; members keep the innermost group, in page space through every parent rotation', () => {
  const result = convertLegacy(fixture('arrows-groups'));
  assert.equal(all(result.sketch).filter(m => /^shape:g[123]$/.test(m.legacyId)).length, 0);
  assert.equal(mark(result.sketch, 'shape:g1-pen').legacyGroup, 'shape:g1');
  assert.equal(mark(result.sketch, 'shape:g1-box').legacyGroup, 'shape:g1');
  const deep = mark(result.sketch, 'shape:deep');
  assert.equal(deep.legacyGroup, 'shape:g3', 'a nested member names the group it is directly in');
  assert.deepEqual([deep.x1, deep.y1, deep.x2, deep.y2, deep.approx], [1040, 270, 1090, 340, undefined], 'two group offsets and a quarter turn, composed');
  assert.deepEqual(result.report.groups['shape:g1'], ['shape:g1-pen', 'shape:g1-box']);
  assert.equal(Object.keys(result.report.groups).length, 2 + 20);
  assert.equal(result.sketch.shapes.filter(m => m.legacyId.startsWith('shape:grp-')).length, 60, 'twenty groups of three all arrive');
});

test('many arrows: forty-eight free arrows keep their ends and bends, curves bow to the side tldraw bowed them', () => {
  const { sketch } = convertLegacy(fixture('arrows-groups'));
  const ring = sketch.shapes.filter(m => m.legacyId.startsWith('shape:ring-'));
  assert.equal(ring.length, 48);
  const first = mark(sketch, 'shape:ring-0'), second = mark(sketch, 'shape:ring-1');
  // ring-0 bends to tldraw's positive side, so the ends swap (see the curve test below).
  assert.deepEqual([first.kind, first.x1, first.y1, first.x2, first.y2], ['curve', 80, 720, 40, 700]);
  assert.deepEqual([second.kind, second.x2 - second.x1, second.y2 - second.y1], ['arrow', 40, 20]);
  // The canvas curve's control point (AdaptiveCanvas.jsx curveControl, pinned below) must sit on the side S1's picture bowed to.
  const curveControl = ({ x1, y1, x2, y2 }) => ({ x: (x1 + x2) / 2 + (y2 - y1) * 0.3, y: (y1 + y2) / 2 - (x2 - x1) * 0.3 });
  const source = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('const curveControl = ({ x1, y1, x2, y2 }) => ({ x: (x1 + x2) / 2 + (y2 - y1) * 0.3, y: (y1 + y2) / 2 - (x2 - x1) * 0.3 });'), 'the canvas formula this test mirrors has not changed');
  const bowl = mark(sketch, 'shape:bowl'), bowr = mark(sketch, 'shape:bowr');
  // bowl: bend -50 on a left-to-right arrow bows up (y smaller); bowr: bend +30 bows down. Check the converted curves bow the same way on screen.
  const bowsDown = c => curveControl(c).y > (c.y1 + c.y2) / 2;
  assert.equal(bowsDown(bowl), false, 'bend -50 on a rightward arrow bows up, ends kept in order');
  assert.deepEqual([bowl.x1, bowl.x2], [600, 800]);
  assert.equal(bowsDown(bowr), true, 'bend +30 bows down: the ends swap so the canvas curve bows the same way');
  assert.deepEqual([bowr.x1, bowr.x2, bowr.startHead, bowr.endHead], [800, 600, 'bar', 'triangle'], 'and so do the heads');
});

test('a glued end is drawn to the shape tldraw drew it to, a precise anchor is kept, and both say the arrow no longer follows the shape', () => {
  const { sketch } = convertLegacy(fixture('arrows-groups'));
  const glued = mark(sketch, 'shape:glued');
  assert.equal(glued.approx, 'glued end freed');
  near(glued.x1, 160); near(glued.y1, 296.9, 0.2);  // A's right edge, on the line toward B's centre
  near(glued.x2, 340, 0.2); near(glued.y2, 302.7, 0.2); // B's ellipse, leftmost point
  const precise = mark(sketch, 'shape:precise');
  assert.deepEqual([precise.x1, precise.y1, precise.x2, precise.y2], [100, 540, 370, 512.5], 'the free end stays, the precise end is C at (0.25, 0.75)');
  const base = mark(convertLegacy(fixture('whiteboard-editor')).sketch, 'shape:bound-arrow');
  assert.deepEqual([base.x1, base.y1, base.x2, base.y2], [380, 130, 380, 220], 'the base fixture keeps the S1 reader result for an anchor that is not the centre');
  const elbow = mark(sketch, 'shape:elbow');
  assert.deepEqual([elbow.kind, elbow.approx], ['elbow', 'elbow route']);
  const heads = mark(sketch, 'shape:bowl');
  assert.deepEqual([heads.startHead, heads.endHead], ['dot', 'dot']);
  assert.match(heads.approx, /arrowhead/, 'diamond and square heads become dots, and say so');
});

test('a frame becomes a rectangle and its title; what is inside keeps its page position and is not clipped', () => {
  const { sketch } = convertLegacy(fixture('whiteboard-editor'));
  const frame = mark(sketch, 'shape:frame');
  assert.deepEqual([frame.kind, frame.x1, frame.y1, frame.x2, frame.y2, frame.approx], ['rect', 40, 480, 300, 640, 'frame']);
  const title = sketch.items.find(item => item.id === 'shape:frame#name');
  assert.deepEqual([title.text, title.x, title.legacyId], ['Worked example', 40, 'shape:frame']);
  const inside = mark(sketch, 'shape:inside');
  assert.deepEqual([inside.kind, inside.x1, inside.y1, inside.x2, inside.y2], ['diamond', 60, 510, 140, 590]);
  assert.ok(sketch.shapes.findIndex(m => m.id === 'shape:frame') < sketch.shapes.findIndex(m => m.id === 'shape:inside'), 'the frame paints under its children');
});

// ---------- B4: the other fixtures ----------
test('assets: images, video, embeds and bookmarks stay in the snapshot, listed with their page boxes; marks drawn over an image stay', () => {
  const snapshot = fixture('assets-images'), result = convertLegacy(snapshot);
  assert.deepEqual(result.kept.map(k => k.kind).sort(), ['bookmark', 'embed', 'image', 'image', 'image', 'image', 'video']);
  const inFrame = result.kept.find(k => k.id === 'shape:in-frame');
  assert.deepEqual([inFrame.x, inFrame.y, inFrame.x2, inFrame.y2], [60, 620, 160, 700], 'the image inside the frame is placed in page space');
  assert.equal(result.kept.find(k => k.id === 'shape:photo').label, 'a landscape');
  assert.equal(result.kept.find(k => k.id === 'shape:lost').label, 'asset missing', 'an image whose asset is gone is still listed');
  assert.deepEqual(result.sketch.shapes.map(m => m.legacyId).filter(id => /mark-/.test(id)), ['shape:mark-box', 'shape:mark-arrow']);
  assert.equal(mark(result.sketch, 'shape:mark-box').explanationId, 'exp-1');
  assert.equal(mark(result.sketch, 'shape:mark-box').author, 'assistant');
  assert.equal(result.sketch.items.find(item => item.id === 'shape:caption').text, 'A caption written by the learner');
  assert.equal(JSON.stringify(snapshot).includes('images.example.test'), true, 'and the snapshot itself is untouched, assets included');
});

test('metadata: the Tutor explanation fields lift onto the marks, meta is kept whole as a copy, old author names read, odd looks are named', () => {
  const snapshot = fixture('metadata-unknown'), result = convertLegacy(snapshot);
  const node = mark(result.sketch, 'shape:t-node');
  assert.deepEqual([node.author, node.explanationId, node.objectId], ['assistant', 'f3a1c2d4-0000-4000-8000-000000000001', 'explanation-f3a1c2d4-0']);
  assert.deepEqual(node.meta, snapshot.document.store['shape:t-node'].meta);
  assert.notEqual(node.meta, snapshot.document.store['shape:t-node'].meta, 'meta is a copy: editing a mark never reaches the stored snapshot');
  assert.equal(mark(result.sketch, 'shape:legacy-tutor').author, 'assistant', "'tutor' is read as 'assistant'");
  assert.equal(mark(result.sketch, 'shape:learner-note').author, 'learner');
  const faint = mark(result.sketch, 'shape:faint');
  assert.deepEqual([faint.opacity, faint.kind, faint.approx], [0.5, 'ellipse', 'heart drawn as ellipse'], 'a heart is the nearest kind, and says so');
  assert.deepEqual(faint.meta.custom, { nested: [1, 2, { deep: true }] }, 'unknown meta survives whole');
  assert.equal(faint.meta.note, '<b>raw</b> & "quoted"', 'meta is data, never rewritten');
  assert.match(mark(result.sketch, 'shape:locked').approx, /lock not kept/);
  assert.match(mark(result.sketch, 'shape:pattern').approx, /pattern fill/);
  // A Tutor explanation converted from an old board can be removed as one, and only it.
  const removed = removeExplanation(result.sketch, 'f3a1c2d4-0000-4000-8000-000000000001');
  assert.equal(countAssistant(result.sketch) - countAssistant(removed), 3 + 1, 'the diagram marks and the explanation drawing go');
  assert.ok(all(removed).some(m => m.legacyId === 'shape:learner-note'), 'the learner mark stays');
  assert.deepEqual(validateSketch(result.sketch), { ok: true, errors: [] });
});

test('unknown shape types and unknown record types are counted, kept and reported, never hidden', () => {
  const snapshot = fixture('metadata-unknown'), result = convertLegacy(snapshot);
  assert.deepEqual(result.report.unsupported, { hologram: 1 });
  assert.deepEqual(result.report.unknownRecords, { mystery: 1 });
  assert.deepEqual(result.kept.map(k => [k.id, k.kind]).sort(), [['shape:chart', 'card'], ['shape:from-the-future', 'unknown']]);
  const derived = deriveSketch(block(snapshot));
  assert.ok(derived.warnings.some(text => /objects this version does not know/.test(text)));
});

test('the seeded sigmoid board converts to its five strokes and six labels with the lesson tags', () => {
  const { sketch, report } = convertLegacy(fixture('sigmoid-board'));
  assert.deepEqual(report.counts, { strokes: 5, shapes: 0, items: 6 });
  assert.equal(report.approx, 0);
  assert.deepEqual(['axes-x', 'midpoint', 'limit-right'].map(name => sketch.strokes.find(s => s.meta.semanticId === name)?.dash).filter(Boolean), ['dashed', 'dotted'], 'dashed midpoint, dotted limit');
  const curve = sketch.strokes.find(s => s.meta.semanticId === 'curve');
  assert.deepEqual([curve.points.length, curve.color, curve.width], [61, '#2383e2', 3.5]);
  assert.equal(sketch.items.find(item => item.meta.semanticId === 'equation').text, 'σ(x) = 1 / (1 + e⁻ˣ)');
  assert.ok(all(sketch).every(m => m.author === 'lesson'));
});

// ---------- B3: deriveSketch ----------
test('deriveSketch: no snapshot, unconverted, converted, diverged; a saved sketch always wins, an empty one too', () => {
  const snapshot = fixture('whiteboard-editor');
  const fresh = deriveSketch({ id: 'w', type: 'whiteboard', snapshot: null, sketch: null });
  assert.deepEqual([fresh.status, fresh.derived, fresh.sketch.strokes.length, fresh.kept], ['none', false, 0, []]);
  const open = deriveSketch(block(snapshot));
  assert.deepEqual([open.status, open.derived, open.sketch.shapes.length, open.kept.length], ['unconverted', true, 8, 4]);
  const saved = withSketch(block(snapshot), { strokes: [], shapes: [], items: [] });
  const emptied = deriveSketch(saved);
  assert.deepEqual([emptied.status, emptied.derived, all(emptied.sketch).length], ['converted', false, 0], 'what the learner emptied is not brought back from the snapshot');
  assert.equal(emptied.kept.length, 4, 'and the kept objects are still listed');
  const edited = structuredClone(snapshot); edited.document.store['shape:box'].x += 3;
  const diverged = deriveSketch({ ...saved, snapshot: edited });
  assert.equal(diverged.status, 'diverged');
  assert.ok(diverged.warnings.some(text => /changed by an older version/.test(text)));
  const orphan = deriveSketch(block(snapshot, { sketch: { strokes: [], shapes: [], items: [] } }));
  assert.equal(orphan.derived, false, 'a sketch with no record of its origin is still shown, never replaced');
  assert.ok(orphan.warnings.some(text => /no record of the original/.test(text)));
  assert.ok(open.warnings.some(text => /1 other page/.test(text)));
});

test('deriveSketch reads the editor snapshot, a note document and a bare store, and refuses the rest without throwing or losing it', () => {
  const editor = fixture('whiteboard-editor'), note = fixture('note-document');
  assert.equal(deriveSketch(block(editor)).sketch.shapes.length, 8);
  const fromNote = deriveSketch({ id: 'n', type: 'whiteboard', snapshot: note });
  assert.deepEqual([fromNote.status, all(fromNote.sketch).length], ['unconverted', 3], 'the document-only snapshot a saved note holds');
  const bare = deriveSketch(block(note.document));
  assert.equal(all(bare.sketch).length, 3, 'a bare store snapshot');
  for (const bad of [{ nothing: true }, 'text', 7, { store: [] }]) {
    const out = deriveSketch(block(bad));
    assert.deepEqual([out.derived, all(out.sketch).length, out.kept], [false, 0, []]);
    assert.ok(out.warnings.some(text => /could not be read/.test(text)));
  }
  assert.deepEqual(deriveSketch(null).sketch, { strokes: [], shapes: [], items: [] });
});

test('deriveSketch never mutates the block and never writes: a frozen block is read, nothing outside it is touched', () => {
  const frozen = deepFreeze(block(fixture('arrows-groups'), { sketch: null, marked: ['x'] })), text = JSON.stringify(frozen);
  const stores = ['localStorage', 'sessionStorage', 'indexedDB', 'fetch'].filter(name => name in globalThis);
  const spies = stores.map(name => [name, globalThis[name]]);
  for (const name of stores) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(`deriveSketch touched ${name}`); } });
  try { deriveSketch(frozen); deriveSketch(frozen); } finally { for (const [name, value] of spies) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); }
  assert.equal(JSON.stringify(frozen), text);
});

// ---------- B5: open, edit, reload, share, fork; viewers never write ----------
// A host in miniature, as the editor workstream (A3) must behave: derive on open, write only for an authorized edit.
function host(initial) {
  const writes = []; let stored = JSON.stringify(initial);
  return {
    writes, stored: () => JSON.parse(stored),
    open: ({ readOnly = false, canEdit = true } = {}) => { const current = JSON.parse(stored); return { current, view: deriveSketch(current), permitted: mayPersist({ readOnly, canEdit }) }; },
    edit(opened, change) { if (!opened.permitted) return false; const sketch = change(opened.view.sketch); const next = withSketch(opened.current, sketch); writes.push(next); stored = JSON.stringify(next); return true; },
  };
}

test('repeated opens, reload and read-only viewing write nothing; the first authorized edit writes the sketch and keeps the snapshot', () => {
  const original = block(fixture('whiteboard-editor')), snapshotText = JSON.stringify(original.snapshot);
  const h = host(original);
  const ids = open => all(open.view.sketch).map(m => m.id);
  const first = h.open(), second = h.open(), reload = h.open();
  assert.deepEqual(ids(first), ids(second)); assert.deepEqual(ids(second), ids(reload));
  assert.equal(JSON.stringify(first.view.sketch), JSON.stringify(reload.view.sketch));
  const viewer = h.open({ readOnly: true }), guest = h.open({ canEdit: false });
  assert.equal(h.edit(viewer, s => ({ ...s, items: [] })), false, 'a shared read-only viewer cannot save');
  assert.equal(h.edit(guest, s => s), false, 'a guest without a copy cannot save');
  assert.deepEqual(h.writes, [], 'opening and viewing wrote nothing');
  assert.equal(JSON.stringify(h.stored()), JSON.stringify(original), 'the stored board is byte-identical');
  assert.equal(h.edit(first, s => ({ ...s, items: [...s.items, { id: 'new', kind: 'text', x: 1, y: 2, text: 'mine' }] })), true);
  assert.equal(h.writes.length, 1);
  const saved = h.stored();
  assert.equal(JSON.stringify(saved.snapshot), snapshotText, 'the original snapshot is untouched by the first edit');
  assert.equal(legacyState(saved), 'converted');
  assert.equal(saved.sketchFrom.digest, digestOf(original.snapshot));
  const after = h.open();
  assert.deepEqual([after.view.status, after.view.derived], ['converted', false]);
  assert.deepEqual(ids(after), [...ids(first), 'new'], 'the same ids as before, plus the edit, in the same order: nothing duplicates');
  const again = deriveSketch(JSON.parse(JSON.stringify(saved)));
  assert.equal(JSON.stringify(again.sketch), JSON.stringify(after.view.sketch), 'reloading from storage derives the same sketch');
});

test('share and fork carry both representations as content, and a viewer or a fork opens the same marks without writing', () => {
  const owner = withSketch(block(fixture('arrows-groups')), convertLegacy(fixture('arrows-groups')).sketch);
  const state = { blocks: [owner, { id: 'other', type: 'note' }], strokes: [], shapes: [], items: [] };
  const shared = sharedState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(shared.blocks[0], owner, 'whiteboard is not in the learner-state list, so a share link shows the snapshot and the sketch whole');
  const forked = forkState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(forked.blocks[0], owner, 'a fork copies both');
  const theirs = deriveSketch(frozenCopy(forked.blocks[0])), mine = deriveSketch(owner);
  assert.equal(JSON.stringify(theirs.sketch), JSON.stringify(mine.sketch));
  assert.equal(theirs.status, 'converted');
  // An unconverted board is shared and forked as it is: the visitor derives in memory, nothing is written on either side.
  const plain = block(fixture('assets-images'));
  const visitor = sharedState({ blocks: [plain] }).blocks[0];
  assert.deepEqual(visitor, plain);
  const viewed = host(visitor);
  const opened = viewed.open({ readOnly: true });
  assert.equal(opened.view.derived, true);
  assert.equal(viewed.edit(opened, s => s), false);
  assert.deepEqual(viewed.writes, []);
  const copy = forkState({ blocks: [plain] }).blocks[0];
  assert.equal(JSON.stringify(deriveSketch(copy).sketch), JSON.stringify(deriveSketch(plain).sketch), 'the fork derives the same marks and ids as its source');
  assert.equal(copy.snapshot.document.store['shape:photo'].props.assetId, 'asset:photo', 'and keeps the original, assets included');
});
const frozenCopy = value => deepFreeze(structuredClone(value));

// ---------- the size caps with both representations retained ----------
test('the size ladder: a block near the cap converts to a sketch that fits, deterministically, thinning only as much as needed', () => {
  const snapshot = fixture('near-cap');
  assert.ok(JSON.stringify(snapshot).length > 390_000 && JSON.stringify(snapshot).length <= LIMITS.sketchChars, 'the fixture is a block the tldraw build could still save');
  const exact = convertLegacy(snapshot, { target: Infinity });
  assert.equal(exact.report.simplified, 0);
  assert.ok(exact.report.sketchChars > LIMITS.sketchChars, `the exact conversion (${exact.report.sketchChars}) would not fit the cap, which is why thinning exists`);
  const fitted = convertLegacy(snapshot);
  assert.ok(fitted.report.simplified > 0 && fitted.report.sketchChars <= LIMITS.sketchChars * 0.75, 'thinned until it fits with room to edit');
  assert.equal(JSON.stringify(convertLegacy(snapshot)), JSON.stringify(fitted), 'every open thins the same way');
  const tight = convertLegacy(snapshot, { target: 60_000 });
  assert.ok(tight.report.simplified >= 1 && tight.report.sketchChars < fitted.report.sketchChars);
  assert.ok(tight.sketch.strokes.every(stroke => stroke.approx === 'simplified'), 'visible thinning (1 px and up) is flagged on each stroke');
  assert.equal(fitted.sketch.strokes.some(stroke => stroke.approx), false, 'sub-pixel thinning is not flagged');
  // Thinning keeps the shape: every original point is within the tolerance of the thinned path.
  const shape = readLegacySnapshot(snapshot).shapes.find(s => s.id === fitted.sketch.strokes[0].legacyId), original = shape.points.map(p => ({ x: p.x + shape.matrix[4], y: p.y + shape.matrix[5] }));
  const kept = fitted.sketch.strokes[0].points, tolerance = fitted.report.simplified + 0.1 + 0.07;
  const distance = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); };
  for (const p of original) assert.ok(Math.min(...kept.slice(1).map((q, i) => distance(p, kept[i], q))) <= tolerance, 'no original point strays from the thinned stroke');
  assert.deepEqual([kept[0].x, kept[0].y], [Math.round((original[0].x) * 10) / 10, Math.round(original[0].y * 10) / 10], 'the first point is kept');
});

test('size decision table: every outcome keeps the original; a refused save leaves the board and tells the learner so', () => {
  const snapshot = fixture('near-cap'), original = block(snapshot), derived = deriveSketch(original).sketch;
  const own = JSON.stringify(original).length;
  const sketchChars = JSON.stringify(derived).length;
  const rows = [
    // [name, boardChars before the save (all blocks), sketch override, expected reason, warn]
    ['both fit, far from the board cap', own, derived, undefined, false],
    ['both fit, board at 85 percent of its cap', 1_615_000 - 80, derived, undefined, true],
    ['sketch alone fits, board over its cap with both retained', LIMITS.boardChars - sketchChars + 1_000, derived, 'board-too-large', undefined],
    ['sketch over its own cap, board has room', own, { strokes: [], shapes: [], items: [{ id: 'big', kind: 'text', x: 0, y: 0, text: 'x'.repeat(LIMITS.sketchChars) }] }, 'sketch-too-large', undefined],
    ['both do not fit', LIMITS.boardChars, { strokes: [], shapes: [], items: [{ id: 'big', kind: 'text', x: 0, y: 0, text: 'x'.repeat(LIMITS.sketchChars) }] }, 'sketch-too-large', undefined],
  ];
  for (const [name, boardChars, sketch, reason, warn] of rows) {
    const verdict = saveVerdict({ block: original, sketch, boardChars });
    assert.equal(verdict.reason, reason, name);
    assert.equal(verdict.ok, reason === undefined, name);
    if (reason === undefined) assert.equal(verdict.warn, warn, name);
    // Whatever the verdict, the host's only moves are save (withSketch) or keep in memory: the snapshot is never touched.
    const notice = saveNotice(verdict);
    if (reason) {
      assert.equal(notice.level, 'error', name);
      assert.equal(notice.keepsOriginal, true, name);
      assert.match(notice.message, /Nothing was deleted: the original board is still saved as it was/, name);
      assert.deepEqual(notice.downloads, ['Download my drawing', 'Download original'], name);
    } else assert.equal(notice?.level ?? null, warn ? 'warn' : null, name);
    const afterSave = withSketch(original, sketch);
    assert.equal(afterSave.snapshot, original.snapshot, `${name}: no path removes the snapshot, even when the save is allowed`);
  }
  const edge = (text) => saveVerdict({ block: { ...original, sketchFrom: { digest: 'd', v: 1 } }, sketch: { items: [{ id: 'a', kind: 'text', x: 0, y: 0, text }] }, boardChars: own });
  const room = LIMITS.sketchChars - JSON.stringify({ strokes: [], shapes: [], items: [{ id: 'a', kind: 'text', x: 0, y: 0, text: '' }] }).length;
  assert.equal(edge('x'.repeat(room)).ok, true, 'exactly at the cap saves');
  assert.equal(edge('x'.repeat(room + 1)).reason, 'sketch-too-large', 'one character over does not');
});

test('the learner-facing notices say what happened, keep the original, and contain no ellipsis', () => {
  for (const reason of ['sketch-too-large', 'board-too-large']) {
    const { message } = saveNotice({ ok: false, reason });
    assert.doesNotMatch(message, /\.\.\.|…/);
    assert.match(message, /Nothing was deleted/);
  }
  assert.match(saveNotice({ ok: false, reason: 'sketch-too-large' }).message, /too large to save beside the original/);
  assert.match(saveNotice({ ok: false, reason: 'board-too-large' }).message, /canvas is full/);
  assert.equal(saveNotice({ ok: true, warn: false }), null);
  assert.equal(saveNotice(undefined), null);
});

test('the converter imports only the reader and the contract: no tldraw, no package, no storage', () => {
  const source = readFileSync(new URL('./legacy-to-sketch.js', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/^import .* from '([^']+)'/gm)].map(match => match[1]).sort(), ['./legacy-whiteboard.js', './whiteboard-sketch.js']);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|fetch\(/);
});
