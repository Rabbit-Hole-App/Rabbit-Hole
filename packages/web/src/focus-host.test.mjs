// WP4 Focus adapters (docs/features/focus-study.md section 5): the frame-to-box mapping, PDF fit to width without vertical
// shrinking, aspect-ratio contain, the in-place host placement (footprint kept, nothing but presentation changed) and which
// kinds claim a Focus control.
import test from 'node:test';
import assert from 'node:assert/strict';
import { READING_MAX, containBox, fillBox, hostTransform, registerHostAdapter } from './focus-host.js';
import { adapterFor, focusAdapters } from './focus-controller.js';
import './focus-adapter-pdf.js';
import './focus-adapter-explanation.js';
import './focus-adapter-table.js';
import './focus-adapter-note.js';
import './focus-adapter-image.js';
import './focus-adapter-video.js';
import './focus-adapter-model.js';
import './focus-adapter-cad.js';

const FRAME = { left: 16, top: 64, width: 1200, height: 600 };
const VIEW = { x: 100, y: -200, z: 0.5 };

test('fillBox: the whole frame, or a capped width centred in it', () => {
  assert.deepEqual(fillBox(FRAME), FRAME);
  assert.deepEqual(fillBox(FRAME, { maxWidth: READING_MAX }), { left: 236, top: 64, width: 760, height: 600 });
  assert.deepEqual(fillBox({ left: 0, top: 0, width: 500, height: 400 }, { maxWidth: READING_MAX }), { left: 0, top: 0, width: 500, height: 400 });
});

test('PDF: the reader takes the full width of a wide, short pane; it is never shrunk to fit a page vertically', () => {
  const host = fakeHost({ width: 600, height: 640 });
  focusAdapters.get('pdf').enter(host, { left: 0, top: 0, width: 1800, height: 500 }, { view: { x: 0, y: 0, z: 1 } });
  assert.deepEqual([host.vars['--focus-w'], host.vars['--focus-h']], ['1800px', '500px']);
});

test('containBox: the picture at its own aspect, as large as fits with its rows, centred, never larger than the frame', () => {
  // A 2:1 picture with 24 px of side padding and 80 px of rows: height-bound in a 1200 x 600 frame.
  const box = containBox(FRAME, { aspect: 2, chrome: { w: 24, h: 80 } });
  assert.deepEqual(box, { left: 84, top: 64, width: 1064, height: 600 });
  assert.equal((box.width - 24) / (box.height - 80), 2);
  const tall = containBox(FRAME, { aspect: 0.5 });
  assert.deepEqual(tall, { left: 466, top: 64, width: 300, height: 600 });
  const strip = containBox(FRAME, { aspect: 6 }); // width-bound: centred vertically
  assert.deepEqual(strip, { left: 16, top: 264, width: 1200, height: 200 });
  for (const b of [box, tall, strip]) assert.ok(b.left >= FRAME.left && b.top >= FRAME.top && b.left + b.width <= FRAME.left + FRAME.width && b.top + b.height <= FRAME.top + FRAME.height);
  // No picture size known, or no room once the rows are counted: the frame itself.
  for (const aspect of [0, NaN, Infinity, undefined]) assert.deepEqual(containBox(FRAME, { aspect }), FRAME);
  assert.deepEqual(containBox(FRAME, { aspect: 2, chrome: { w: 0, h: 700 } }), FRAME);
});

test('hostTransform: from the in-flow position to the box in world units, counter-scaled; null without a view', () => {
  assert.equal(hostTransform({ left: 116, top: 64, width: 800, height: 600 }, VIEW, { x: 10, y: 100 }), 'translate(22px, 428px) scale(2)');
  assert.equal(hostTransform(FRAME, { x: 0, y: 0, z: 0 }, { x: 0, y: 0 }), null);
});

test('placement: only presentation on the existing host, the column keeps its footprint, exit removes every trace', () => {
  const adapter = registerHostAdapter({ kind: 'test-fill', label: 'Focus test', canFocus: () => false, box: frame => fillBox(frame) });
  // In a card-layout slot at (30, 500) of the column: the slot's offset counts.
  const host = fakeHost({ width: 440, height: 300, left: 0, top: 0, slot: { left: 30, top: 500 } });
  adapter.enter(host, FRAME, { view: VIEW });
  assert.equal(host.attrs['data-focus-host'], '');
  assert.equal(host.attrs['data-scroll'], '', 'the wheel scrolls the focused card, not the board');
  assert.equal(host.vars['--focus-w'], '1200px');
  assert.equal(host.vars['--focus-mb'], `${300 - 600}px`, 'the next card stays where it was');
  // World target ((16 - 100) / 0.5, (64 + 200) / 0.5) = (-168, 528), less the in-flow position (30, 500).
  assert.equal(host.vars['--focus-transform'], 'translate(-198px, 28px) scale(2)');
  assert.equal(host.listeners, 1, 'a press on a drag zone is held while focused');
  assert.deepEqual(host.styleWrites, [], 'no inline width, height or transform written');
  // The pane changes: same host, new box, the entry footprint kept.
  adapter.update(host, { ...FRAME, height: 500 }, { view: VIEW });
  assert.equal(host.vars['--focus-mb'], `${300 - 500}px`);
  adapter.exit(host, {});
  assert.deepEqual(host.vars, {});
  assert.deepEqual(host.attrs, {});
  assert.equal(host.listeners, 0);
  // A host that was a scroll body already keeps that; no view: nothing happens.
  const scroller = fakeHost({ width: 300, height: 200, attrs: { 'data-scroll': '' } });
  adapter.enter(scroller, FRAME, { view: VIEW });
  adapter.exit(scroller, {});
  assert.deepEqual(scroller.attrs, { 'data-scroll': '' });
  adapter.enter(host, FRAME, { view: null });
  assert.deepEqual(host.attrs, {});
});

test('which kinds show a Focus control, and their names', () => {
  const name = block => adapterFor(block)?.label || null;
  assert.equal(name({ type: 'pdf' }), 'Focus PDF');
  assert.equal(name({ type: 'paper', paper: { id: '2401.00001', page: 1 } }), 'Focus PDF');
  assert.equal(name({ type: 'paper' }), null);
  assert.equal(name({ type: 'explanation' }), 'Focus explanation');
  assert.equal(name({ type: 'animation' }), 'Focus explanation');
  assert.equal(name({ type: 'table' }), 'Focus table');
  assert.equal(name({ id: 'n', kind: 'sticky', text: 'x' }), 'Focus note');
  assert.equal(name({ id: 'n', kind: 'text', text: 'x' }), 'Focus note');
  assert.equal(name({ id: 'n', kind: 'text', mode: 'code', text: 'x' }), null, 'a code box');
  assert.equal(name({ type: 'image' }), 'Focus image');
  assert.equal(name({ type: 'file', kind: 'image' }), 'Focus image');
  assert.equal(name({ type: 'file', kind: 'svg' }), 'Focus image');
  assert.equal(name({ type: 'file', kind: 'image', excerpt: { kind: 'region' } }), null);
  assert.equal(name({ type: 'slide' }), 'Focus page');
  assert.equal(name({ type: 'video', src: 'clip.mp4' }), 'Focus video');
  assert.equal(name({ type: 'video', videoId: 'abc' }), 'Focus video');
  assert.equal(name({ type: 'file', kind: 'clip' }), 'Focus video');
  assert.equal(name({ type: 'file', kind: 'model' }), 'Focus 3D model');
  assert.equal(name({ type: 'cad' }), 'Focus CAD model', 'ready, but not imported by focus-adapters.js (deferred)');
  for (const type of ['quiz', 'flashcards', 'challenge', 'code', 'snippet', 'audio', 'wiki', 'webpage', 'heading', 'divider', 'canvas-ref', 'repo-code', 'repo-graph', 'graph', 'flow', 'mermaid', 'knowledge', 'whiteboard', 'model3d', 'scene', 'notebook'])
    assert.equal(name({ type }), null, `${type} has no WP4 Focus control`);
  for (const kind of ['attachment', 'audio', 'markdown']) assert.equal(name({ type: 'file', kind }), null, `file ${kind}`);
  for (const kind of ['equation', 'section', 'rect']) assert.equal(name({ id: 'i', kind }), null, `item ${kind}`);
  for (const adapter of focusAdapters.values()) assert.doesNotMatch(adapter.label, /\.\.\.|…/);
});

// A host with just what focus-host.js reads and writes: layout numbers, its offset parents up to the world layer, the style
// custom properties, attributes, the capture listener and its document (for the one stylesheet).
function fakeHost({ width, height, left = 0, top = 0, slot = null, attrs = {} }) {
  const world = { offsetLeft: 0, offsetTop: 0, offsetParent: null, hasAttribute: name => name === 'data-canvas-world' };
  const column = { offsetLeft: 0, offsetTop: 0, offsetParent: world, hasAttribute: () => false };
  const parent = slot ? { offsetLeft: slot.left, offsetTop: slot.top, offsetParent: column, hasAttribute: () => false } : column;
  const host = {
    vars: {}, attrs: { ...attrs }, listeners: 0, styleWrites: [], children: [],
    offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height, offsetParent: parent,
    ownerDocument: { getElementById: () => null, createElement: () => ({}), head: { append: () => {} } },
    hasAttribute(name) { return name in this.attrs; },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    addEventListener() { this.listeners += 1; },
    removeEventListener() { this.listeners = Math.max(0, this.listeners - 1); },
  };
  host.style = {
    setProperty: (name, value) => { if (name.startsWith('--')) host.vars[name] = value; else host.styleWrites.push(name); },
    removeProperty: name => { delete host.vars[name]; },
  };
  return host;
}
