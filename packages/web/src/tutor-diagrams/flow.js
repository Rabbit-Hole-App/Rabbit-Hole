import { createElement as h } from 'react';
import { box, connector, diamond, label, lineHeight, SURFACE, textWidth, wrap } from './primitives.js';

const PAD = 14;
const NODE_GAP = 18;
const NODE_MIN = 106;
const NODE_MAX = 186;

function layersFor(nodes, incoming) {
  const ranks = new Map();
  function rank(id) {
    if (!ranks.has(id)) ranks.set(id, Math.max(0, ...incoming.get(id).map(edge => rank(edge.from) + 1)));
    return ranks.get(id);
  }
  const rows = [];
  for (const node of nodes) (rows[rank(node.id)] ??= []).push(node);
  return { rows, ranks };
}

function port(node, edges, edge, bottom) {
  const spread = Math.min(20, node.width * 0.18);
  const dx = edges.length > 1 ? (2 * edges.indexOf(edge) / (edges.length - 1) - 1) * spread : 0;
  const inset = node.role === 'decision' ? Math.abs(dx) * node.height / node.width : 0;
  return [node.cx + dx, bottom ? node.y + node.height - inset : node.y + inset];
}

function decisionHeight(lines, width) {
  // The width available at y falls linearly away from the center of a diamond.
  return Math.ceil(Math.max(74, ...lines.map((line, index) => {
    const inset = Math.abs((index - (lines.length - 1) / 2) * lineHeight()) + 10;
    return 2 * inset / (1 - (textWidth(line) + 6) / width);
  })));
}

function crosses(points, { x, y, width, height }) {
  const margin = 2;
  return points.slice(1).some(([x2, y2], i) => {
    const [x1, y1] = points[i];
    return x1 === x2
      ? x1 > x - margin && x1 < x + width + margin
        && Math.max(y1, y2) > y - margin && Math.min(y1, y2) < y + height + margin
      : y1 > y - margin && y1 < y + height + margin
        && Math.max(x1, x2) > x - margin && Math.min(x1, x2) < x + width + margin;
  });
}

function labelBounds(route, others, width) {
  const { words, points: [[from], , [to, y]] } = route;
  const w = Math.ceil(Math.max(...words.map(word => textWidth(word, 12))) + 12);
  const h = words.length * lineHeight(12) + 4;
  const center = (from + to) / 2;
  const straight = Math.abs(from - to) < 35;
  const offset = straight ? w / 2 + 7 : 0;
  const offsets = [offset, -offset, offset + 10, -offset - 10, offset + 20, -offset - 20, offset + 35, -offset - 35];
  const clamped = candidate => Math.max(PAD, Math.min(width - PAD - w, candidate));
  for (const shift of offsets) {
    const x = clamped(center + shift - w / 2);
    const bounds = { x, y: y - h / 2, width: w, height: h };
    if (others.every(other => other === route || !crosses(other.points, bounds))) return bounds;
  }
  return null;
}

export function layoutFlow({ nodes, edges }, requestedWidth) {
  const incoming = new Map(nodes.map(node => [node.id, []]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    incoming.get(edge.to).push(edge);
    outgoing.get(edge.from).push(edge);
  }
  const { rows, ranks } = layersFor(nodes, incoming);
  const skips = edges.filter(edge => ranks.get(edge.to) > ranks.get(edge.from) + 1);
  const outer = skips.length ? 16 + skips.length * 9 : 0;
  const columns = Math.max(...rows.map(row => row.length));
  const width = Math.max(requestedWidth, 2 * PAD + columns * NODE_MIN + (columns - 1) * NODE_GAP + outer);
  const inner = width - 2 * PAD - outer;
  const placements = new Map();

  const gaps = rows.map(() => []);
  const routes = edges.map(edge => {
    const from = ranks.get(edge.from), to = ranks.get(edge.to);
    const words = edge.label ? wrap(edge.label, 105, 12) : [];
    const depart = { height: words.length ? words.length * lineHeight(12) + 8 : 12 };
    const arrive = to > from + 1 ? { height: 12 } : null;
    gaps[from].push(depart);
    if (arrive) gaps[to - 1].push(arrive);
    return { edge, depart, arrive, words };
  });

  let y = PAD;
  rows.forEach((row, rank) => {
    const spacing = (inner + NODE_GAP) / row.length;
    const rowNodes = row.map((node, index) => {
      const w = Math.min(NODE_MAX, spacing - NODE_GAP);
      const isDecision = node.role === 'decision';
      const lines = wrap(node.label, isDecision ? w * 0.58 : w - 20, 14);
      const h = isDecision ? decisionHeight(lines, w) : Math.max(38, lines.length * lineHeight() + 14);
      const previous = incoming.get(node.id);
      const parent = previous.length === 1 ? placements.get(previous[0].from) : null;
      const ideal = row.length === 1 && parent ? parent.cx : PAD + spacing * (index + 0.5) - NODE_GAP / 2;
      const cx = Math.max(PAD + w / 2, Math.min(PAD + inner - w / 2, ideal));
      return { ...node, width: w, height: h, cx, lines };
    });
    const height = Math.max(...rowNodes.map(node => node.height));
    for (const node of rowNodes) placements.set(node.id, { ...node, y: y + (height - node.height) / 2 });
    y += height;
    if (rank === rows.length - 1) return;
    y += 10;
    for (const lane of gaps[rank]) {
      lane.y = y + lane.height / 2;
      y += lane.height;
    }
    y += 10;
  });

  // Order ports by their opposite endpoints so common forks and joins don't
  // swap left and right. Long edges keep a private lane outside all nodes.
  const byX = (a, b) => placements.get(a).cx - placements.get(b).cx;
  for (const group of outgoing.values()) group.sort((a, b) => byX(a.to, b.to));
  for (const group of incoming.values()) group.sort((a, b) => byX(a.from, b.from));
  const routed = routes.map(route => {
    const { edge, depart, arrive } = route;
    const from = port(placements.get(edge.from), outgoing.get(edge.from), edge, true);
    const to = port(placements.get(edge.to), incoming.get(edge.to), edge, false);
    const x = arrive ? PAD + inner + 10 + 9 * skips.indexOf(edge) : to[0];
    const points = [from, [from[0], depart.y], [x, depart.y]];
    if (arrive) points.push([x, arrive.y], [to[0], arrive.y]);
    points.push(to);
    return { ...route, points };
  });
  const wires = routed.map(({ edge, points }) => h('g', { 'data-tutor-edge': `${edge.from}:${edge.to}` }, connector(points)));
  const annotations = [];
  let bottom = y;
  for (const route of routed.filter(route => route.words.length)) {
    const { edge, words } = route;
    const bounds = labelBounds(route, routed, width);
    if (bounds) {
      annotations.push(h('g', null,
        h('rect', { ...bounds, fill: SURFACE }),
        label(words, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { size: 12 })));
      continue;
    }
    // In a dense tier there may be no room on the edge itself. Keep the
    // directed relationship readable below the graph without masking any wire.
    const key = `${placements.get(edge.from).label} → ${placements.get(edge.to).label}: ${edge.label}`;
    const lines = wrap(key, width - 2 * PAD - 20, 12);
    const height = lines.length * lineHeight(12) + 12;
    bottom += 8;
    annotations.push(h('g', null,
      box(PAD, bottom, width - 2 * PAD, height),
      label(lines, PAD + 10, bottom + height / 2, { size: 12, anchor: 'start' })));
    bottom += height;
  }

  const shapes = Array.from(placements.values(), node => {
    const { id, cx, y, width, height, role, lines } = node;
    const x = cx - width / 2;
    const shape = role === 'decision'
      ? diamond(x, y, width, height)
      : box(x, y, width, height, { role, radius: role === 'outcome' ? height / 2 : 7 });
    return h('g', { 'data-tutor-node': id }, shape, label(lines, cx, y + height / 2, { tone: 'onFill' }));
  });
  return { width, height: bottom + PAD, elements: [...wires, ...annotations, ...shapes] };
}
