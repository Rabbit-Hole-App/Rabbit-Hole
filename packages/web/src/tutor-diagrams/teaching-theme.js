import { cloneElement } from 'react';
import { box, connector } from './primitives.js';

// Exact tokens from the approved tree-splits-and-impurity.svg reference at
// Rabbit-Hole@012d4ae3dfd9b20ef14156bea89c2632b844cc46. New teaching layouts
// share these tokens; legacy version-1 layouts keep their existing appearance.
export const TEACHING = Object.freeze({
  surface: '#fffefa', inset: '#f6f8f4', line: '#e3e7e0', wire: '#b9c3b9',
  ink: '#202723', muted: '#5d675f', blue: '#426db2', blueSoft: '#eaf1fb',
  warm: '#b86232', warmSoft: '#f8ece3', green: '#267657', greenSoft: '#e7f3ed',
});
export const TEACHING_FONT = 'Inter, Liberation Sans, Arial, sans-serif';
// The written card's text classes (tutor-diagrams/TutorDiagram.js and primitives.js: a 17 px / 700 title, 14 px labels, 13 px captions). A composed /interactive
// card takes these sizes and floors (interact-style.js); the legacy scene floors (scene-layout.js LEGIBILITY_FLOORS) are not touched.
export const TEACHING_TEXT = Object.freeze({
  display: Object.freeze({ size: 17, weight: 700 }), heading: Object.freeze({ size: 14, weight: 600 }), body: Object.freeze({ size: 14, weight: 400 }),
  caption: Object.freeze({ size: 13, weight: 400 }), annotation: Object.freeze({ size: 13, weight: 400 }), code: Object.freeze({ size: 13, weight: 400 }),
  equation: Object.freeze({ size: 14, weight: 400 }),
});
export const TEACHING_SERIES = Object.freeze([TEACHING.blue, TEACHING.warm, TEACHING.green]);
export const TEACHING_STYLE = Object.freeze({
  '--color-ink': TEACHING.ink, '--color-ink-2': TEACHING.muted,
  '--color-line': TEACHING.line, '--viz-surface': TEACHING.surface,
});
export function teachingBox(x, y, width, height, { role = 'plain', active = false } = {}) {
  const fill = role === 'process' ? TEACHING.blueSoft : role === 'outcome' ? TEACHING.greenSoft
    : role === 'decision' ? TEACHING.warmSoft : TEACHING.surface;
  return cloneElement(box(x, y, width, height), {
    rx: 9, fill, stroke: active ? TEACHING.blue : TEACHING.line, strokeWidth: active ? 2 : 1,
  });
}
export function teachingConnector(points, { active = false, dashed = false, arrow = false } = {}) {
  // The connector primitive owns arrow geometry. A currentColor wrapper scopes
  // no global theme changes; explicit sage/blue strokes match approved wires.
  const element = connector(points, { arrow, dashed });
  const color = active ? TEACHING.blue : TEACHING.wire;
  if (!arrow) return cloneElement(element, { stroke: color, strokeWidth: active ? 2.5 : 1.6 });
  return cloneElement(element, {}, ...element.props.children.map(child => cloneElement(child,
    child.type === 'polygon' ? { fill: color } : { stroke: color, strokeWidth: active ? 2.5 : 1.6 })));
}
