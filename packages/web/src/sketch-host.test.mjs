// The single Explain-back Sketch host's pure rules (EB-03.2): which question/draft a capture may picture, the size it
// renders at, and the explicit errors that replace a silent null picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIT_MIN_ZOOM, SketchCaptureError, captureProblem, captureResult, captureSize, fitZoom, pixelRatios, releasedTool, sketchDraftOf, sketchExtent } from './sketch-host.js';

const marks = { strokes: [{ tool: 'pen', width: 2, points: [{ x: 10, y: 10 }, { x: 500, y: 300 }] }], shapes: [], items: [] };
const card = (sketch, extra = {}) => ({ id: 'q1', type: 'challenge', mode: 'explain_back', prompt: 'Why?', sketch, ...extra });

test('a capture is keyed to the question and the draft its sketch was opened for', () => {
  assert.equal(captureProblem(card({ ...marks, draftId: 'd1' }), { questionId: 'q1', draftId: 'd1' }), null);
  assert.equal(captureProblem(card({ ...marks, draftId: 'd1' }), { questionId: 'q1', draftId: 'd2' }), 'draft-mismatch');
  // A legacy sketch has no draft stamp; it still captures for its question.
  assert.equal(captureProblem(card(marks), { questionId: 'q1', draftId: 'd2' }), null);
  assert.equal(captureProblem(card(marks), { questionId: 'q2' }), 'question-missing');
  assert.equal(captureProblem(null, { questionId: 'q1' }), 'question-missing');
  assert.equal(captureProblem(card(marks, { mode: undefined }), { questionId: 'q1' }), 'not-explain-back');
  assert.equal(captureProblem(card({ strokes: [], shapes: [], items: [] }), { questionId: 'q1' }), 'sketch-empty');
  assert.equal(sketchDraftOf({ draftId: 'd9' }), 'd9');
  assert.equal(sketchDraftOf({ draftId: 7 }), null);
});

test('a capture error names its code and a message the learner can act on', () => {
  const error = new SketchCaptureError('capture-failed', { questionId: 'q1' });
  assert.ok(error instanceof Error);
  assert.equal(error.code, 'capture-failed');
  assert.equal(error.questionId, 'q1');
  assert.match(error.message, /could not be pictured/);
  assert.doesNotMatch(error.message, /\.\.\.|…/);
});

test('the capture covers every mark, however far the panel was resized, within bounds', () => {
  assert.deepEqual(sketchExtent(marks), { w: 502, h: 302 });
  assert.deepEqual(captureSize(marks), { w: 526, h: 326 });
  // An empty or small sketch still renders at least the inline sketch's size.
  assert.deepEqual(captureSize({}), { w: 360, h: 240 });
  // A text item without a width gets a generous one; a shape label adds its line.
  const text = sketchExtent({ items: [{ kind: 'text', x: 100, y: 50, text: 'abc' }], shapes: [{ kind: 'arrow', x1: 0, y1: 0, x2: 40, y2: 90, label: 'v' }] });
  assert.deepEqual(text, { w: 196, h: 114 });
  assert.deepEqual(captureSize({ shapes: [{ kind: 'rect', x1: 0, y1: 0, x2: 9000, y2: 10 }] }), { w: 2400, h: 240 });
});

test('pixel ratios keep the long side at most 900 px and step down for size', () => {
  const ratios = pixelRatios({ w: 1800, h: 300 });
  assert.deepEqual(ratios, [0.5, 0.5, 0.5]);
  assert.deepEqual(pixelRatios({ w: 300, h: 240 }), [2, 1, 0.5]);
});

test('a capture result carries the picture, its size and the words the grader reads', () => {
  const result = captureResult({ questionId: 'q1', draftId: null, block: card({ ...marks, draftId: 'd1' }), image: 'data:image/png;base64,x', size: { w: 526, h: 326 } });
  assert.equal(result.draftId, 'd1');
  assert.equal(result.marks, 1);
  assert.equal(result.width, 526);
  assert.match(result.text, /1 freehand stroke/);
});

test('the canvas captures from its own off-screen render, never the first [data-sketch] on the page', () => {
  const source = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.ok(!/querySelector\(`\[data-sketch="/.test(source), 'no capture by querying the page for the first sketch');
  assert.ok(/captureFor/.test(source), 'the host exposes captureFor');
});

test('drawing and dragging end on a release inside the docked Sketch panel: their pointerup listeners capture', () => {
  // The panel's React handlers stop pointerup at the React root, so a bubbling window listener never hears a release there
  // and a stroke or shape kept following the pointer (fast-e2e run 41032431618). Every gesture end listens in capture.
  const source = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  const startDrag = source.slice(source.indexOf('function startDrag('), source.indexOf('function startDrag(') + 3000);
  const drawing = source.slice(source.indexOf('const drawGesture = '), source.indexOf("} else if (tool === 'sticky'"));
  assert.ok(startDrag.includes("window.addEventListener('pointerup', up, true)") && !startDrag.includes("window.addEventListener('pointerup', up);"), 'startDrag ends on a captured pointerup');
  assert.ok(drawing.includes("window.addEventListener('pointerup', finish, true)") && drawing.includes("window.addEventListener('pointerup', up, true)"), 'strokes, shapes and the eraser end on a captured pointerup');
  assert.ok(!/addEventListener\('pointerup', (up|finish)\)/.test(drawing), 'no bubbling pointerup listener left in drawGesture');
});

test('reveal zooms out just enough for the whole question card to fit beside or above the panel, never in', () => {
  const card = { x: 0, y: 0, w: 380, h: 600 };
  // Fits at the current zoom: unchanged, even when it would fit larger.
  assert.equal(fitZoom(card, { left: 0, top: 0, right: 800, bottom: 900 }, 1), 1);
  assert.equal(fitZoom(card, { left: 0, top: 0, right: 2000, bottom: 2000 }, 0.5), 0.5);
  // Beside a docked panel at a 736 px workspace (about 340 px free): the width decides.
  assert.equal(fitZoom(card, { left: 24, top: 24, right: 364, bottom: 900 }, 1), 340 / 380);
  // A phone above a stacked panel, zoomed in to 195%: the height decides, and the result is below the old zoom.
  const z = fitZoom(card, { left: 24, top: 24, right: 366, bottom: 400 }, 1.95);
  assert.equal(z, 376 / 600);
  assert.ok(card.w * z <= 342 && card.h * z <= 376);
  // Never below the canvas's floor, and an empty or unknown area keeps the zoom.
  assert.equal(fitZoom({ x: 0, y: 0, w: 4000, h: 4000 }, { left: 0, top: 0, right: 300, bottom: 300 }, 1), FIT_MIN_ZOOM);
  assert.equal(fitZoom(card, { left: 10, top: 10, right: 10, bottom: 400 }, 1.2), 1.2);
  assert.equal(fitZoom(null, { left: 0, top: 0, right: 100, bottom: 100 }, 1), 1);
});

test('putting the sketch away hands Select back only for a drawing tool picked while drawing in it', () => {
  const drawingTools = new Set(['pen', 'highlighter', 'eraser', 'rect', 'ellipse', 'arrow', 'text', 'sticky']);
  assert.equal(releasedTool('pen', { pickedInSketch: true, drawingTools }), 'select');
  assert.equal(releasedTool('rect', { pickedInSketch: true, drawingTools }), 'select');
  // Picked on the canvas: the learner meant to draw there; it stays.
  assert.equal(releasedTool('pen', { pickedInSketch: false, drawingTools }), 'pen');
  // Select and Hand are never changed.
  assert.equal(releasedTool('hand', { pickedInSketch: true, drawingTools }), 'hand');
  assert.equal(releasedTool('select', { pickedInSketch: true, drawingTools }), 'select');
  assert.equal(releasedTool('pen'), 'pen');
  // The canvas wires it to every put-away path: Close, an unmounted (read-only or hidden) sketch and a removed card.
  const source = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes("release: id => { if (drawTargetRef.current === id) closeSketch(); }"), 'sketchHost.release closes');
  assert.ok(source.includes('drawTargetRef.current === id) closeSketchRef.current();'), 'an unmounted host closes');
  assert.ok(source.includes('block.id === drawTarget)) closeSketch();'), 'a removed card closes');
});
