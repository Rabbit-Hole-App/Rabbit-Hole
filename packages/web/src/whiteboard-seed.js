import { roundPoint } from './explain-sketch.js';

// The drawn sigmoid a new Whiteboard card opens with (`demo: 'sigmoid'`), as native marks: enough of a lesson that both Ask in
// chat and Ask about selection have something real to point at. It replaces sigmoid-board.js (tldraw shapes) at cutover.
// Marks are the lesson's (`author: 'lesson'`) and carry the semantic ids the Tutor already knows from sigmoidObjects.
// The labels repeat sigmoid-context.js sigmoidObjects (a test keeps them equal) so the canvas bundle does not import that module.
// Sized for the card's frame (about 520 x 300) so it opens whole at 100 percent.
const LEFT = 60, RIGHT = 470, BOTTOM = 255, TOP = 75;
const px = x => LEFT + ((x + 6) / 12) * (RIGHT - LEFT);
const py = y => BOTTOM - y * (BOTTOM - TOP);
const sigmoid = x => 1 / (1 + Math.exp(-x));
const GREY = '#9b9a97', BLUE = '#2383e2';

const LABELS = { title: 'Sigmoid lesson', equation: 'Sigmoid equation', curve: 'Sigmoid curve', midpoint: 'Sigmoid midpoint (0, 0.5)', 'limit-left': 'Left limit', 'limit-right': 'Right limit', 'axes-x': 'Input x axis', 'axes-y': 'Output σ(x) axis' };
const lesson = (semanticId, id) => ({ id: `sigmoid:${id || semanticId}`, author: 'lesson', meta: { semanticId, label: LABELS[semanticId] } });
const line = (semanticId, id, [x1, y1], [x2, y2], extra = {}) => ({ ...lesson(semanticId, id), kind: 'line', x1, y1, x2, y2, color: GREY, width: 2, ...extra });
const text = (semanticId, id, x, y, words, extra = {}) => ({ ...lesson(semanticId, id), kind: 'text', x, y, text: words, color: '#37352f', ...extra });

export const SEED_LABELS = LABELS;
export function sigmoidSketch() {
  const points = [];
  for (let step = 0; step <= 60; step += 1) {
    const x = -6 + (step / 60) * 12;
    points.push(roundPoint({ x: px(x), y: py(sigmoid(x)) }));
  }
  return {
    strokes: [{ ...lesson('curve'), tool: 'pen', color: BLUE, width: 3.5, points }],
    shapes: [
      line('axes-x', 'axes-x', [LEFT - 20, py(0)], [RIGHT + 20, py(0)]),
      line('axes-y', 'axes-y', [px(0), TOP - 20], [px(0), BOTTOM + 20]),
      line('limit-right', 'limit-right', [LEFT - 20, py(1)], [RIGHT + 20, py(1)], { dash: 'dotted' }),
      line('midpoint', 'midpoint', [LEFT - 20, py(0.5)], [RIGHT + 20, py(0.5)], { dash: 'dashed' }),
    ],
    items: [
      text('title', 'title', 20, 10, 'The sigmoid squashes any score into a probability'),
      text('equation', 'equation', RIGHT - 150, TOP - 40, 'σ(x) = 1 / (1 + e⁻ˣ)', { color: BLUE }),
      text('limit-right', 'one', px(0) - 24, py(1) - 24, '1'),
      text('midpoint', 'half', px(0) - 40, py(0.5) - 24, '0.5'),
      text('limit-left', 'zero', px(0) - 24, py(0) + 4, '0'),
      text('axes-x', 'x', RIGHT + 22, py(0) - 24, 'x', { color: GREY }),
    ],
  };
}
