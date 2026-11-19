// Test helper: read a relationship graph's wires and on-arrow labels back from the element tree it drew, and measure how far each label stands from every wire.
import { legendTextWidth } from './ml-plot-layouts.js';
import { lineHeight } from './primitives.js';
import { wirePoints } from './test-wire-points.mjs';

const kids = element => [element?.props?.children].flat(Infinity).filter(child => child && typeof child === 'object' && child.props);
const find = (element, test) => test(element) ? element : kids(element).map(child => find(child, test)).find(Boolean);
const gaps = (a, b) => Math.hypot(Math.max(0, a.x1 - b.x2, b.x1 - a.x2), Math.max(0, a.y1 - b.y2, b.y1 - a.y2));

// -> [{ id, index, segments: [{x1, y1, x2, y2}], label: { text, box } | null (a badge, or no label) }]
export function relationshipGeometry(root, size = 13) {
  const out = [];
  const visit = element => {
    const id = element.props['data-tutor-edge'];
    if (id === undefined) return kids(element).forEach(visit);
    const [wire, ...rest] = kids(element);
    const points = wirePoints(wire);
    const segments = points.slice(1).map(([x, y], i) => ({ x1: Math.min(x, points[i][0]), y1: Math.min(y, points[i][1]), x2: Math.max(x, points[i][0]), y2: Math.max(y, points[i][1]) }));
    const text = rest.some(child => find(child, e => e.type === 'circle')) ? null : rest.map(child => find(child, e => e.type === 'text')).find(Boolean);
    let label = null;
    if (text) {
      const words = kids(text).map(span => span.props.children).join(' ');
      const x = text.props.x, y = text.props.y, w = legendTextWidth(words, size), h = lineHeight(size);
      const left = text.props.textAnchor === 'end' ? x - w : x;
      label = { text: words, box: { x1: left, y1: y - h / 2, x2: left + w, y2: y + h / 2 } };
    }
    out.push({ id, index: element.props['data-tutor-edge-index'], segments, label });
  };
  visit(root);
  return out;
}

// For one on-arrow label: the distance to its own wire and to the nearest wire of any other edge.
export function labelDistances(edges, edge) {
  const nearest = list => Math.min(...list.flatMap(e => e.segments.map(segment => gaps(edge.label.box, segment))));
  return { own: nearest([edge]), other: nearest(edges.filter(e => e !== edge)) };
}
