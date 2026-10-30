// The one Explain-back Sketch host (plan 2026-10-30-explain-back.md sections 3 and 4, EB-03.2). AdaptiveCanvas owns the
// drawing target and the capture; the card UI (LearningBlocks / ExplainBackPanel) owns where the panel shows. Pure, so
// Node tests import it.
import { SKETCH_HEIGHT, hasMarks, sketchMarks, sketchText } from './explain-sketch.js';
import { isExplainBackCard } from './explain-back-private.js';

// Why a capture did not produce a picture. A missing capture is an error the caller shows, never a silent null visual.
export const CAPTURE_ERRORS = {
  'question-missing': 'This question is no longer on the canvas.',
  'not-explain-back': 'Only a Practice card has a sketch.',
  'draft-mismatch': 'The sketch belongs to a different draft of this answer.',
  'sketch-empty': 'The sketch has no marks to include.',
  'capture-failed': 'The sketch could not be pictured. Try again, or clear the sketch to submit without it.',
  'capture-too-large': 'The sketch is too detailed to picture. Simplify it, or clear it to submit without it.',
  'capture-busy': 'The canvas is not ready to picture the sketch. Try again.',
};

export class SketchCaptureError extends Error {
  constructor(code, detail = {}) {
    super(CAPTURE_ERRORS[code] || code);
    this.name = 'SketchCaptureError';
    this.code = code;
    Object.assign(this, detail);
  }
}

// The draft a sketch was opened for (stamped by the host on open). Legacy sketches carry none.
export const sketchDraftOf = sketch => (sketch && typeof sketch.draftId === 'string' && sketch.draftId) || null;

// Why `block` cannot give a capture for (questionId, draftId), or null when it can.
export function captureProblem(block, { questionId, draftId = null } = {}) {
  if (!block || block.id !== questionId) return 'question-missing';
  if (!isExplainBackCard(block)) return 'not-explain-back';
  const bound = sketchDraftOf(block.sketch);
  if (draftId && bound && bound !== draftId) return 'draft-mismatch';
  if (!hasMarks(block.sketch)) return 'sketch-empty';
  return null;
}

// The box every mark fits in, in the sketch's own pixels (top-left is always 0,0). A text without a set width is
// given a generous one so a capture never crops it.
export function sketchExtent(sketch) {
  const { strokes = [], shapes = [], items = [] } = sketch || {};
  let w = 0, h = 0;
  const grow = (x, y) => { if (Number.isFinite(x)) w = Math.max(w, x); if (Number.isFinite(y)) h = Math.max(h, y); };
  for (const stroke of strokes) for (const point of stroke.points || []) grow(point.x + (stroke.width || 14), point.y + (stroke.width || 14));
  for (const shape of shapes) grow(Math.max(shape.x1, shape.x2), Math.max(shape.y1, shape.y2) + (shape.label ? 24 : 0));
  for (const item of items) {
    const text = String(item.text || '');
    const lines = text.split('\n');
    const width = item.w || Math.min(420, Math.max(96, Math.max(...lines.map(line => line.length)) * 9));
    grow(item.x + width, item.y + (item.h || Math.max(28, lines.length * 24)));
  }
  return { w: Math.ceil(w), h: Math.ceil(h) };
}

// The size the capture renders at: the marks plus a margin, never smaller than an inline sketch, never huge.
export const CAPTURE_MIN_WIDTH = 360, CAPTURE_MAX_SIDE = 2400, CAPTURE_PAD = 24;
export function captureSize(sketch) {
  const { w, h } = sketchExtent(sketch);
  return {
    w: Math.min(CAPTURE_MAX_SIDE, Math.max(CAPTURE_MIN_WIDTH, w + CAPTURE_PAD)),
    h: Math.min(CAPTURE_MAX_SIDE, Math.max(SKETCH_HEIGHT, h + CAPTURE_PAD)),
  };
}

// The grader's limits, unchanged from the inline sketch: at most 900 px on the long side and 600 KB of PNG data URL.
export const CAPTURE_MAX_PIXELS = 900, CAPTURE_MAX_BYTES = 600000;
export const pixelRatios = size => [2, 1, 0.5].map(ratio => Math.min(ratio, CAPTURE_MAX_PIXELS / Math.max(size.w, size.h)));

// What a successful capture returns, beside the PNG.
export const captureResult = ({ questionId, draftId, block, image, size }) => ({
  questionId, draftId: draftId || sketchDraftOf(block.sketch), image, width: size.w, height: size.h,
  marks: sketchMarks(block.sketch), text: sketchText(block.sketch),
});

// The zoom that shows a card (`box`, world px) whole inside `area` (surface px: what the docked Sketch panel and the floating
// chrome leave): the current zoom when it already fits, else just small enough, never larger than now and never below the
// canvas's own floor (zoomAt's 0.25). An empty area keeps the zoom.
export const FIT_MIN_ZOOM = 0.25;
export function fitZoom(box, area, z, min = FIT_MIN_ZOOM) {
  const w = area.right - area.left, h = area.bottom - area.top;
  if (!box || !(box.w > 0) || !(box.h > 0) || w <= 0 || h <= 0) return z;
  const need = Math.min(w / box.w, h / box.h);
  return need >= z ? z : Math.max(min, need);
}

// The canvas tool once the sketch is put away (panel closed, a read-only attempt shown, the card gone; plan section 3): a
// drawing tool the learner picked while drawing in the sketch gives way to Select, so the cards take a click again. A tool
// picked on the canvas, Select and Hand stay as they are.
export const releasedTool = (tool, { pickedInSketch = false, drawingTools = new Set() } = {}) => (pickedInSketch && drawingTools.has(tool) ? 'select' : tool);
