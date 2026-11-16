import { cloneElement } from 'react';
import { box, connector, PALETTE, FILLED_INK } from './primitives.js';

// Exact tokens from the approved tree-splits-and-impurity.svg reference at
// Rabbit-Hole@012d4ae3dfd9b20ef14156bea89c2632b844cc46. New teaching layouts
// share these tokens; legacy version-1 layouts keep their existing appearance.
export const TEACHING = Object.freeze({
  // The pale tokens (blueSoft, warmSoft, greenSoft, inset, and the dark blue, warm and green lines) stay defined for old callers; the layouts draw with the fills below.
  surface: '#FFFCF0', inset: '#f6f8f4', line: '#e3e7e0', wire: '#b9c3b9',
  ink: '#32211C', muted: '#665951', blue: '#426db2', blueSoft: '#eaf1fb',
  warm: '#b86232', warmSoft: '#f8ece3', green: '#267657', greenSoft: '#e7f3ed',
  // Saturated fills and the other hues are palette A's (primitives.js PALETTE): one set, not two. Text on any fill is `outline`.
  blueFill: PALETTE.process, mustardFill: PALETTE.decision, tealFill: PALETTE.outcome,
  coral: PALETTE.coral, olive: PALETTE.olive, lavender: PALETTE.lavender, rose: PALETTE.rose, slate: PALETTE.slate,
  ground: '#FFFCF0', outline: FILLED_INK.toUpperCase(),
  orange: '#F89830', // measured from Wondering's illustrations, approximate
});
// The names a tree node's `fill` may use (ml-topology-spec.js TREE_FILLS) and the fill order of a tree drawn by depth: root, level 1, level 2, level 3, then on.
export const TEACHING_FILL = Object.freeze({
  blue: TEACHING.blueFill, teal: TEACHING.tealFill, olive: TEACHING.olive, mustard: TEACHING.mustardFill, orange: TEACHING.orange,
  coral: TEACHING.coral, lavender: TEACHING.lavender, rose: TEACHING.rose, slate: TEACHING.slate,
});
export const TEACHING_DEPTH_FILLS = Object.freeze(['blue', 'teal', 'mustard', 'orange', 'lavender', 'rose', 'slate']);
// Tokens of the approved Codex /interactive reference cards (docs/features/interact/references) that the written card's TEACHING set has no name for: the blue ink of a heading
// or a button label, and the border of a blue chip. Additive: TEACHING itself is unchanged.
export const TEACHING_ACCENT = Object.freeze({ blueInk: '#375d92', blueBorder: '#adc4e5' });
export const TEACHING_FONT = 'Inter, Liberation Sans, Arial, sans-serif';
// The written card's text classes (tutor-diagrams/TutorDiagram.js and primitives.js: a 17 px / 700 title, 14 px labels, 13 px captions). A composed /interactive
// card takes these sizes and floors (interact-style.js); the legacy scene floors (scene-layout.js LEGIBILITY_FLOORS) are not touched.
export const TEACHING_TEXT = Object.freeze({
  display: Object.freeze({ size: 17, weight: 700 }), heading: Object.freeze({ size: 16, weight: 600 }), body: Object.freeze({ size: 15, weight: 500 }),
  caption: Object.freeze({ size: 13, weight: 400 }), annotation: Object.freeze({ size: 13, weight: 400 }), code: Object.freeze({ size: 13, weight: 400 }),
  equation: Object.freeze({ size: 14, weight: 400 }),
});
export const TEACHING_SERIES = Object.freeze([
  TEACHING.blueFill, TEACHING.coral, TEACHING.tealFill, TEACHING.olive, TEACHING.lavender, TEACHING.mustardFill, TEACHING.rose, TEACHING.slate]);
// The darker weight of each series colour (about 4.6:1 or more on the ground, blue from the approved card): a line is drawn in its ink, its markers in the fill. Same order as TEACHING_SERIES.
export const TEACHING_SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936A25', '#B82E56', '#507195']);
export const TEACHING_GRID = '#D9D3C3';
// A colour mixed over another: mixHex(fill, ground, 0.18) is the fill at 18% over the ground (the legend pills).
export const mixHex = (top, under, amount) => '#' + [1, 3, 5].map(i => Math.round(parseInt(under.slice(i, i + 2), 16) * (1 - amount) + parseInt(top.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join('').toUpperCase();
// The zero line of a plot or bar chart: the one solid line a chart keeps (there are no axis lines).
export const TEACHING_ZERO = '#786860';
export const TEACHING_STYLE = Object.freeze({
  '--color-ink': TEACHING.ink, '--color-ink-2': TEACHING.muted,
  '--color-line': TEACHING.line, '--viz-surface': TEACHING.surface,
});
export function teachingBox(x, y, width, height, { role = 'plain', active = false } = {}) {
  const fill = role === 'process' ? TEACHING.blueFill : role === 'outcome' ? TEACHING.tealFill
    : role === 'decision' ? TEACHING.mustardFill : TEACHING.surface;
  return cloneElement(box(x, y, width, height), {
    rx: 9, fill, stroke: active ? TEACHING.blue : TEACHING.outline, strokeWidth: active ? 3 : 1.5,
  });
}
export function teachingConnector(points, { active = false, dashed = false, guide = false, arrow = false } = {}) {
  // The connector primitive owns arrow geometry. A currentColor wrapper scopes
  // no global theme changes; explicit sage/blue strokes match approved wires.
  const element = connector(points, { arrow, dashed: dashed || guide });
  // Wires and arrows are the outline colour at 2 px (a dashed one, such as a pruned branch, at 1.5); a guide (a gridline) stays light and thin.
  const color = active ? TEACHING.blue : guide ? TEACHING.wire : TEACHING.outline, width = active ? 3 : guide ? 1 : dashed ? 1.5 : 2;
  if (!arrow) return cloneElement(element, { stroke: color, strokeWidth: width });
  return cloneElement(element, {}, ...element.props.children.map(child => cloneElement(child,
    child.type === 'polygon' ? { fill: color } : { stroke: color, strokeWidth: width })));
}
