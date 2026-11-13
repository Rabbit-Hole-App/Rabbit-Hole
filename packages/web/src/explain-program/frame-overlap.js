// Host-computed layout evidence for a program frame: which text objects' estimated boxes overlap. Pure geometry on the frame the program
// returned, with the SAME text estimate the scene layout lint and the renderer's label placement use (scene-layout.js estimateTextBox,
// scene-style.js body size). It reads no subject and no wording; it is evidence for a reviewer or a test, never a gate, and the estimate is
// conservative rather than font-accurate (about 0.6 em per character; a math run is estimated at 0.5 em per TeX character, the same rule
// scene-layout-lint.js uses for an equation).
import { estimateTextBox } from '../scene-layout.js';
import { textStyle } from '../scene-style.js';

// Characters a run is worth at the body size: a math run's TeX length scaled by the equation rule above.
const runLength = run => (run.kind === 'math' ? Math.ceil(run.tex.length * (textStyle('equation').fontSize * 0.5) / (textStyle('body').fontSize * 0.6)) : run.text.length);

// -> [{ id, box: {xMin, xMax, yMin, yMax} }] for every text object with something to draw.
export function textBoxes(frame) {
  return (frame.objects || []).filter(object => object.kind === 'text').map(object => {
    const length = object.runs ? object.runs.reduce((sum, run) => sum + runLength(run), 0) : (object.text || '').length;
    const box = estimateTextBox({ text: 'x'.repeat(length), x: object.x, y: object.y, fontSize: textStyle('body').fontSize, anchor: object.align === 'middle' ? 'middle' : 'start', baseline: 'auto' });
    return { id: object.id, box };
  });
}

// The geometry the capture trace carries so the host can check overlaps (text, circles, boxes, arrows), bounded: -> [{ id, kind, x, y, w?, h?, from?, to?, text?, align? }].
export const traceObjects = (objects = []) => objects.filter(o => ['text', 'circle', 'box', 'arrow'].includes(o.kind)).slice(0, 80).map(o => ({
  id: o.id, kind: o.kind, x: o.x, y: o.y, ...(o.w != null ? { w: o.w } : {}), ...(o.h != null ? { h: o.h } : {}), ...(o.from ? { from: o.from, to: o.to } : {}),
  ...(o.kind === 'text' ? { text: (o.text ?? (o.runs || []).map(run => run.text ?? run.tex ?? '').join('')).slice(0, 160), align: o.align } : {}) }));

// The box of a circle (x, y is its centre, w its diameter) or a box (x, y its top left corner); null for anything else.
const shapeBox = o => (o.kind === 'circle' ? { xMin: o.x - o.w / 2, xMax: o.x + o.w / 2, yMin: o.y - o.w / 2, yMax: o.y + o.w / 2 }
  : o.kind === 'box' ? { xMin: o.x, xMax: o.x + o.w, yMin: o.y, yMax: o.y + o.h } : null);
// The box of an arrowhead as the written connector draws it (tutor-diagrams/primitives.js connector: 7 px long, 3.4 px either side); null for a point-length arrow.
const HEAD_LENGTH = 7, HEAD_HALF_WIDTH = 3.4;
const headBox = o => {
  if (o.kind !== 'arrow' || !o.from || !o.to) return null;
  const length = Math.hypot(o.to.x - o.from.x, o.to.y - o.from.y);
  if (!length) return null;
  const dx = (o.to.x - o.from.x) / length, dy = (o.to.y - o.from.y) / length, tip = Math.min(HEAD_LENGTH, length);
  const bx = o.to.x - dx * tip, by = o.to.y - dy * tip, xs = [o.to.x, bx - dy * HEAD_HALF_WIDTH, bx + dy * HEAD_HALF_WIDTH], ys = [o.to.y, by + dx * HEAD_HALF_WIDTH, by - dx * HEAD_HALF_WIDTH];
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
};
const shared = (p, q) => ({ width: Math.min(p.xMax, q.xMax) - Math.max(p.xMin, q.xMin), height: Math.min(p.yMax, q.yMax) - Math.max(p.yMin, q.yMin) });

// -> [{ a, b, kind, width, height }]: text over text, text over a circle, box or arrowhead, and an arrowhead over a circle, whenever the boxes intersect at all, in object
// order, at most `limit`. A shape's OWN label (a box's or circle's `text`) is not a separate object and so never a pair. Pure geometry, no subject and no wording.
export function frameOverlaps(frame, limit = 8) {
  const objects = frame.objects || [], texts = textBoxes(frame), out = [];
  const push = (a, b, kind, p, q) => { const { width, height } = shared(p, q); if (width > 0 && height > 0 && out.length < limit) out.push({ a, b, kind, width: Math.round(width * 10) / 10, height: Math.round(height * 10) / 10 }); };
  for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) push(texts[i].id, texts[j].id, 'text-text', texts[i].box, texts[j].box);
  for (const text of texts) {
    for (const o of objects) {
      const shape = shapeBox(o), head = headBox(o);
      if (shape) push(text.id, o.id, `text-${o.kind}`, text.box, shape);
      if (head) push(text.id, o.id, 'text-arrowhead', text.box, head);
    }
  }
  const heads = objects.map(o => [o, headBox(o)]).filter(([, box]) => box), circles = objects.filter(o => o.kind === 'circle');
  for (const [arrow, box] of heads) for (const circle of circles) push(arrow.id, circle.id, 'arrowhead-circle', box, shapeBox(circle));
  return out;
}

// -> [{ a, b, width, height }]: every pair whose boxes share area (width x height px of overlap), in object order, at most `limit` pairs.
export function textOverlaps(frame, limit = 8) {
  const boxes = textBoxes(frame), out = [];
  for (let i = 0; i < boxes.length && out.length < limit; i++) {
    for (let j = i + 1; j < boxes.length && out.length < limit; j++) {
      const p = boxes[i].box, q = boxes[j].box;
      const width = Math.min(p.xMax, q.xMax) - Math.max(p.xMin, q.xMin), height = Math.min(p.yMax, q.yMax) - Math.max(p.yMin, q.yMin);
      if (width > 0 && height > 0) out.push({ a: boxes[i].id, b: boxes[j].id, width: Math.round(width * 10) / 10, height: Math.round(height * 10) / 10 });
    }
  }
  return out;
}
