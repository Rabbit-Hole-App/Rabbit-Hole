// Round-trip fixtures for the tldraw-free snapshot reader (docs/features/tldraw-removal.md, S1): the JSON files were written by
// tldraw 5.4.2's own schema and store (src/__fixtures__/tldraw/generate.mjs), so these tests read what tldraw really saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePath, legacySnapshotToSvg, plainText, readLegacySnapshot, snapshotParts } from './legacy-whiteboard.js';

const load = name => JSON.parse(readFileSync(new URL(`./__fixtures__/tldraw/${name}`, import.meta.url), 'utf8'));
const board = () => load('whiteboard-editor.json'), note = () => load('note-document.json');
const near = (actual, expected, by = 0.6) => assert.ok(Math.abs(actual - expected) <= by, `${actual} is not within ${by} of ${expected}`);
const shapeNamed = (read, name) => read.shapes.find(shape => shape.id === `shape:${name}`);
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };

test('a whiteboard block snapshot is read page by page, the session choosing the page', () => {
  const read = readLegacySnapshot(board());
  assert.equal(read.ok, true);
  assert.deepEqual(read.pages.map(page => page.name), ['Page 1', 'Page 2']);
  assert.equal(read.pageId, read.pages[0].id);
  assert.equal(read.shapes.length, 17);
  const second = readLegacySnapshot(board(), { pageId: read.pages[1].id });
  assert.deepEqual(second.shapes.map(shape => shape.text), ['page two']);
  assert.equal(read.schema.schemaVersion, 2, 'the schema the snapshot was written with is passed through, not interpreted');
});

test('pen strokes decode from the delta-encoded paths tldraw wrote, 3D and 2D', () => {
  const read = readLegacySnapshot(board());
  const pen = shapeNamed(read, 'pen');
  assert.equal(pen.kind, 'stroke');
  assert.equal(pen.points.length, 24);
  near(pen.points[0].x, 0); near(pen.points[0].y, 0);
  near(pen.points[23].x, 138); near(pen.points[23].y, Math.sin(23 / 3) * 20);
  const flat = shapeNamed(read, 'pen2d');
  assert.equal(flat.points.length, 8);
  near(flat.points[7].x, 42); near(flat.points[7].y, Math.sin(7 / 3) * 20);
  assert.equal(shapeNamed(read, 'marker').highlight, true);
  assert.deepEqual(decodePath('', 3), []);
  assert.deepEqual(decodePath('not base64 !!', 3), [], 'a damaged path gives no points and no throw');
  assert.deepEqual(decodePath('AAAA', 3), [], 'a path shorter than one point gives no points');
});

test('geometry, text and colours survive: shapes, labels, notes, lines, frames and the author tags', () => {
  const read = readLegacySnapshot(board());
  const box = shapeNamed(read, 'box');
  assert.deepEqual([box.kind, box.geo, box.w, box.h, box.color, box.fill, box.text], ['geo', 'rectangle', 160, 90, 'green', 'semi', 'Input']);
  assert.equal(shapeNamed(read, 'output').text, 'Output\nprobability');
  assert.equal(shapeNamed(read, 'title').text, 'The sigmoid squashes a score');
  assert.equal(shapeNamed(read, 'sticky').kind, 'note');
  assert.deepEqual([shapeNamed(read, 'sticky').w, shapeNamed(read, 'sticky').h], [200, 200]);
  assert.deepEqual(shapeNamed(read, 'ruler').points, [{ x: 0, y: 0 }, { x: 150, y: 20 }], 'line points come back in index order');
  assert.deepEqual(shapeNamed(read, 'frame').name, 'Worked example');
  assert.deepEqual([shapeNamed(read, 'title').meta.author, shapeNamed(read, 'box').meta.author], ['assistant', 'lesson'], 'who drew a shape is kept');
});

test('a child of a frame is placed in page space, and an arrow bound to shapes ends on them', () => {
  const read = readLegacySnapshot(board());
  const inside = shapeNamed(read, 'inside');
  assert.deepEqual([inside.matrix[4], inside.matrix[5]], [60, 510]);
  assert.ok(read.shapes.findIndex(shape => shape.id === 'shape:frame') < read.shapes.findIndex(shape => shape.id === 'shape:inside'), 'a frame paints before what is in it');
  const arrow = shapeNamed(read, 'bound-arrow');
  assert.deepEqual([arrow.start, arrow.end], [{ x: 380, y: 130 }, { x: 380, y: 220 }]);
  assert.equal(arrow.text, 'squash');
  assert.deepEqual(shapeNamed(read, 'curve-arrow').start, { x: 0, y: 0 }, 'a free arrow keeps its own ends');
});

test('images keep their asset, and the three app-made shapes read as named cards', () => {
  const read = readLegacySnapshot(board());
  const picture = shapeNamed(read, 'picture');
  assert.match(picture.src, /^data:image\/png;base64,/);
  near(picture.matrix[1], Math.sin(0.2), 1e-9);
  assert.equal(read.assets['asset:dot'].name, 'dot.png');
  assert.deepEqual(['model', 'graph', 'clip'].map(name => shapeNamed(read, name).kind), ['card', 'card', 'card']);
  assert.deepEqual(['model', 'graph', 'clip'].map(name => shapeNamed(read, name).label), ['Gradient descent surface', 'Logistic curve', 'How the curve flattens']);
  assert.deepEqual(read.unsupported, {});
});

test('a saved note (the document alone, shapes locked) and a bare store snapshot both read', () => {
  const read = readLegacySnapshot(note());
  assert.equal(read.shapes.length, 3);
  assert.ok(read.shapes.every(shape => shape.locked));
  const bare = readLegacySnapshot(note().document);
  assert.equal(bare.shapes.length, 3);
  assert.deepEqual(snapshotParts(note()).session, null);
});

test('a record it does not know is counted, never hidden, and what is not a snapshot is refused without throwing', () => {
  const snapshot = board();
  const key = 'shape:mystery';
  snapshot.document.store[key] = { ...snapshot.document.store['shape:box'], id: key, type: 'mystery', index: 'aZ' };
  const read = readLegacySnapshot(snapshot);
  assert.deepEqual(read.unsupported, { mystery: 1 });
  assert.equal(read.shapes.length, 18);
  for (const value of [null, undefined, {}, 'x', 7, { store: [] }, { document: { store: null } }]) assert.deepEqual(readLegacySnapshot(value).ok, false);
  assert.equal(legacySnapshotToSvg(null).svg, '');
});

test('reading never changes what it reads: a frozen snapshot reads, and the stored text is byte for byte the same', () => {
  const snapshot = board(), before = JSON.stringify(snapshot);
  readLegacySnapshot(deepFreeze(snapshot));
  legacySnapshotToSvg(snapshot);
  assert.equal(JSON.stringify(snapshot), before);
});

test('the svg draws every readable shape, escapes the learner words, and stays a picture of the page asked for', () => {
  const out = legacySnapshotToSvg(board());
  assert.equal(out.ok, true);
  assert.equal(out.shapes, 17);
  assert.match(out.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="/);
  assert.ok(out.width > 700 && out.height > 500);
  assert.match(out.svg, /The sigmoid squashes a score/);
  assert.match(out.svg, /<image href="data:image\/png;base64,/);
  const hostile = board();
  hostile.document.store['shape:title'].props.richText = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script> & "x"' }] }] };
  const safe = legacySnapshotToSvg(hostile).svg;
  assert.doesNotMatch(safe, /<script/);
  assert.match(safe, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;x&quot;/);
  const unknownPage = legacySnapshotToSvg(board(), { pageId: 'page:nowhere' });
  assert.equal(unknownPage.shapes, 17, 'an unknown page id falls back to the first page, never to an error');
  const nothing = board();
  nothing.document.store = Object.fromEntries(Object.entries(nothing.document.store).filter(([, record]) => record.typeName !== 'shape'));
  assert.equal(legacySnapshotToSvg(nothing).shapes, 0);
});

test('rich text reads as plain lines, and an old text prop still does', () => {
  const rich = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one ' }, { type: 'text', text: 'two' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'three' }, { type: 'hardBreak' }, { type: 'text', text: 'four' }] }] };
  assert.equal(plainText(rich), 'one two\nthree\nfour');
  assert.equal(plainText(null, '  an old label '), 'an old label');
});

test('the reader imports nothing: no tldraw, no package', () => {
  const source = readFileSync(new URL('./legacy-whiteboard.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s|\bfrom\s+['"]|require\(/m);
});
