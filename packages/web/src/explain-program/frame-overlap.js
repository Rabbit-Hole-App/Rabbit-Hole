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
