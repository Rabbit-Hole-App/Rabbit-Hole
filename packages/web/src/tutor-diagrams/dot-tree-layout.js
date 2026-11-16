import { createElement as h } from 'react';
import { label } from './primitives.js';
import { TEACHING as T, TEACHING_DEPTH_FILLS, TEACHING_FILL } from './teaching-theme.js';

// A binary tree drawn as a picture: round internal nodes, square leaves, straight arrows, one colour per level. Node size and level spacing are
// fixed, so every tree drawn this way (and every panel of two of them) is at one scale.
const CIRCLE = 24, SQUARE = 20, GAP = 6, LEVEL = 56, PAD = 8, STROKE = 1.5, HEAD = 8, HEAD_HALF = 6;

// A straight line to the child with a filled head 12 wide and 8 long; the tip is at (x2, y2).
const wire = (x1, y1, x2, y2) => {
  const length = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / length, uy = (y2 - y1) / length;
  const bx = x2 - ux * HEAD, by = y2 - uy * HEAD;
  return h('g', null, h('line', { x1, y1, x2: bx, y2: by, stroke: T.outline, strokeWidth: STROKE, strokeLinecap: 'round' }),
    h('polygon', { points: `${x2},${y2} ${bx - uy * HEAD_HALF},${by + ux * HEAD_HALF} ${bx + uy * HEAD_HALF},${by - ux * HEAD_HALF}`, fill: T.outline, 'data-tutor-arrowhead': '' }));
};

function scene(diagram) {
  const { nodes } = diagram;
  const children = new Map(nodes.map(node => [node.id, {}]));
  for (const node of nodes) if (node.parent !== undefined) children.get(node.parent)[node.side] = node;
  const shape = node => node.role ?? (Object.keys(children.get(node.id)).length ? 'internal' : 'leaf');
  const half = node => (shape(node) === 'leaf' ? SQUARE : CIRCLE) / 2;
  const placed = new Map();

  function arrange(node, depth) {
    const here = { node, x: 0, depth };
    placed.set(node.id, here);
    const { left, right } = children.get(node.id);
    const l = left && arrange(left, depth + 1), r = right && arrange(right, depth + 1);
    // Sibling subtrees get separate horizontal room; a lone child still turns a little to its side.
    const offset = Math.max(SQUARE / 2, l && r ? (l.max - r.min + GAP) / 2 : 0);
    const subtree = { members: [here], min: -half(node), max: half(node) };
    for (const [child, shift] of [[l, -offset], [r, offset]]) {
      if (!child) continue;
      for (const member of child.members) member.x += shift;
      subtree.members.push(...child.members);
      subtree.min = Math.min(subtree.min, child.min + shift);
      subtree.max = Math.max(subtree.max, child.max + shift);
    }
    return subtree;
  }

  const { min, max } = arrange(nodes.find(node => node.parent === undefined), 0);
  const maxDepth = Math.max(...[...placed.values()].map(item => item.depth));
  const width = Math.ceil(max - min + 2 * PAD), height = PAD * 2 + CIRCLE + maxDepth * LEVEL;
  const centre = item => ({ x: item.x + PAD - min, y: PAD + CIRCLE / 2 + item.depth * LEVEL });
  const fillOf = (item, kind) => TEACHING_FILL[item.node.fill]
    ?? (kind === 'leaf' ? T.coral : TEACHING_FILL[TEACHING_DEPTH_FILLS[item.depth % TEACHING_DEPTH_FILLS.length]]);

  const edges = [], marks = [];
  for (const item of placed.values()) {
    const { node } = item, kind = shape(node), c = centre(item);
    if (node.parent !== undefined) {
      const from = centre(placed.get(node.parent));
      const length = Math.hypot(c.x - from.x, c.y - from.y), ux = (c.x - from.x) / length, uy = (c.y - from.y) / length;
      // The arrow ends on the child's outline: a circle's radius, or the distance to a square's edge along the line.
      const reach = (kind === 'leaf' ? SQUARE / 2 / Math.max(Math.abs(ux), Math.abs(uy)) : CIRCLE / 2) + STROKE / 2;
      edges.push(wire(from.x, from.y, c.x - ux * reach, c.y - uy * reach));
    }
    const look = { fill: fillOf(item, kind), stroke: T.outline, strokeWidth: STROKE, 'data-tutor-node': node.id, 'data-tutor-dot': kind };
    marks.push(kind === 'leaf'
      ? h('rect', { x: c.x - SQUARE / 2, y: c.y - SQUARE / 2, width: SQUARE, height: SQUARE, rx: 3, ...look })
      : h('circle', { cx: c.x, cy: c.y, r: CIRCLE / 2, ...look }));
    if (kind !== 'leaf' && node.label) marks.push(label(node.label, c.x, c.y, { size: 12, weight: 700, fill: T.outline }));
  }
  return { width, height, elements: [...edges, ...marks] };
}

// Alone, the picture is centred in the room it is given; in panels (`natural`) it is exactly its own size.
export function dotTree(diagram, available, { natural = false } = {}) {
  const drawn = scene(diagram);
  if (natural || drawn.width >= available) return drawn;
  return { ...drawn, width: available, elements: [h('g', { transform: `translate(${(available - drawn.width) / 2} 0)` }, ...drawn.elements)] };
}
