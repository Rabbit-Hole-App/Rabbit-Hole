import { compressLegacySegments, createShapeId, toRichText } from 'tldraw';
import { sigmoidObjects } from './sigmoid-context.js';

// A drawn sigmoid for the whiteboard block: enough of a lesson that both
// "Ask in chat" and "Ask selection" have something real to talk about. Shapes
// carry the semantic ids the tutor already knows from sigmoidObjects.
// ponytail: static board; the animated version lives in sigmoid-demo.js.

const LEFT = 140, RIGHT = 620, BOTTOM = 330, TOP = 90;
const px = x => LEFT + ((x + 6) / 12) * (RIGHT - LEFT);
const py = y => BOTTOM - y * (BOTTOM - TOP);
const sigmoid = x => 1 / (1 + Math.exp(-x));

const stroke = (points, { color = 'black', dash = 'solid', size = 's' }) => ({
  id: createShapeId(), type: 'draw', x: 0, y: 0,
  props: { color, dash, size, fill: 'none', isClosed: false, isComplete: true, segments: compressLegacySegments([{ type: 'free', points: points.map(point => ({ ...point, z: 0.5 })) }]) },
});

const label = (text, x, y, { color = 'black', size = 's' } = {}) => ({
  id: createShapeId(), type: 'text', x, y,
  props: { richText: toRichText(text), color, size, font: 'draw', autoSize: true },
});

export function sigmoidBoard() {
  const curve = [];
  for (let step = 0; step <= 60; step += 1) {
    const x = -6 + (step / 60) * 12;
    curve.push({ x: px(x), y: py(sigmoid(x)) });
  }
  return [
    [label('The sigmoid squashes any score into a probability', LEFT - 20, 34, { size: 'm' }), 'title'],
    [stroke([{ x: LEFT - 20, y: py(0) }, { x: RIGHT + 20, y: py(0) }], { color: 'grey' }), 'axes-x'],
    [stroke([{ x: px(0), y: TOP - 20 }, { x: px(0), y: BOTTOM + 20 }], { color: 'grey' }), 'axes-y'],
    [stroke([{ x: LEFT - 20, y: py(1) }, { x: RIGHT + 20, y: py(1) }], { color: 'grey', dash: 'dotted' }), 'limit-right'],
    [stroke([{ x: LEFT - 20, y: py(0.5) }, { x: RIGHT + 20, y: py(0.5) }], { color: 'grey', dash: 'dashed' }), 'midpoint'],
    [stroke(curve, { color: 'blue', size: 'm' }), 'curve'],
    [label('σ(x) = 1 / (1 + e⁻ˣ)', RIGHT - 130, TOP - 60, { color: 'blue', size: 'm' }), 'equation'],
    [label('1', px(0) - 26, py(1) - 12), 'limit-right'],
    [label('0.5', px(0) - 42, py(0.5) - 12), 'midpoint'],
    [label('0', px(0) - 26, py(0) - 12), 'limit-left'],
    [label('x', RIGHT + 24, py(0) - 12, { color: 'grey' }), 'axes-x'],
  ].map(([shape, semanticId]) => ({
    ...shape,
    meta: { author: 'lesson', semanticId, label: sigmoidObjects[semanticId]?.label || semanticId },
  }));
}
