import { createElement as h } from 'react';
import { box, connector, diamond, label, lineHeight, longestWordWidth, SURFACE, textWidth, widestFormula, wrap } from './primitives.js';

const PAD = 14;
const NODE_GAP = 18;
const NODE_MIN = 106;
const NODE_MAX = 186;
const EDGE_TEXT = 14;
const EDGE_WRAP = 158;

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
  const normalSpread = Math.min(20, node.width * 0.18);
  const spread = Math.min(node.width / 2 - 12, Math.max(normalSpread, (edges.length - 1) * 5));
  const dx = edges.length > 1 ? (2 * edges.indexOf(edge) / (edges.length - 1) - 1) * spread : 0;
  let inset = 0;
  if (node.role === 'decision') inset = Math.abs(dx) * node.height / node.width;
  if (node.role === 'outcome') {
    // A wide fan-in can reach the curved ends of the outcome capsule.
    const radiusX = Math.min(node.width, node.height) / 2;
    const cornerX = Math.max(0, Math.abs(dx) - (node.width / 2 - radiusX));
    inset = node.height / 2 * (1 - Math.sqrt(1 - (cornerX / radiusX) ** 2));
  }
  return [node.cx + dx, bottom ? node.y + node.height - inset : node.y + inset];
}

function measureDecision(lines, width) {
  // The width available at y falls linearly away from the center of a diamond.
  const bands = lines.map((line, index) => ({
    y: (index - (lines.length - 1) / 2) * lineHeight(),
    ratio: 1 - (textWidth(line) + 6) / width,
  }));
  const heightAt = offset => Math.ceil(Math.max(74, ...bands.map(({ y, ratio }) => 2 * (Math.abs(y + offset) + 10) / ratio)));
  const centered = heightAt(0);
  const offset = -bands.reduce((widest, band) => band.ratio < widest.ratio ? band : widest).y;
  const aligned = heightAt(offset);
  return aligned < centered ? { height: aligned, offset } : { height: centered, offset: 0 };
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
  const w = Math.ceil(Math.max(...words.map(word => textWidth(word, EDGE_TEXT))) + 12);
  const h = words.length * lineHeight(EDGE_TEXT) + 4;
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

export function layoutFlow({ nodes, edges, highlightPath }, requestedWidth) {
  // E3: the validated worked route (spec.js checkFlow); absent, every wire and node is neutral exactly as before.
  const onPath = new Set(highlightPath ?? []);
  const pathEdge = edge => !!highlightPath && onPath.has(edge.from) && onPath.has(edge.to) && highlightPath.indexOf(edge.to) === highlightPath.indexOf(edge.from) + 1;
  const incoming = new Map(nodes.map(node => [node.id, []]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    incoming.get(edge.to).push(edge);
    outgoing.get(edge.from).push(edge);
  }
  const { rows, ranks } = layersFor(nodes, incoming);
  const skips = edges.filter(edge => ranks.get(edge.to) > ranks.get(edge.from) + 1)
    .sort((a, b) => ranks.get(b.from) - ranks.get(a.from));
  const skipOrder = new Map(skips.map((edge, index) => [edge, index]));
  const outer = skips.length ? 16 + skips.length * 9 : 0;
  const metrics = rows.map(row => row.map(node => {
    const word = longestWordWidth(node.label);
    const pad = node.role === 'decision' ? 32 : 20;
    const required = Math.ceil(word + pad);
    // A long word wraps by characters; a formula cannot, so its node grows past NODE_MAX to hold it (the diagram then scrolls).
    return { word, min: required <= NODE_MAX ? Math.max(NODE_MIN, required) : Math.max(NODE_MIN, Math.ceil(widestFormula(node.label) + pad)) };
  }));
  const rowMinimums = metrics.map(row => row.reduce((sum, node) => sum + node.min, 0) + (row.length - 1) * NODE_GAP);
  const width = Math.max(requestedWidth, 2 * PAD + Math.max(...rowMinimums) + outer);
  const inner = width - 2 * PAD - outer;
  const placements = new Map();

  const gaps = rows.map(() => []);
  const routes = edges.map(edge => {
    const from = ranks.get(edge.from), to = ranks.get(edge.to);
    const words = edge.label ? wrap(edge.label, EDGE_WRAP, EDGE_TEXT) : [];
    const depart = { height: words.length ? words.length * lineHeight(EDGE_TEXT) + 8 : 12 };
    const arrive = to > from + 1 ? { height: 12 } : null;
    gaps[from].push(depart);
    return { edge, depart, arrive, words };
  });
  const routeByEdge = new Map(routes.map(route => [route.edge, route]));
  // Inside lanes turn toward a shared target before the outside lanes arrive.
  for (const edge of skips) gaps[ranks.get(edge.to) - 1].push(routeByEdge.get(edge).arrive);

  let y = PAD;
  rows.forEach((row, rank) => {
    const share = (inner - rowMinimums[rank]) / row.length;
    const widths = metrics[rank].map(({ min }) => Math.min(Math.max(NODE_MAX, min), min + share));
    const extra = (inner - widths.reduce((sum, w) => sum + w, 0) - (row.length - 1) * NODE_GAP) / row.length;
    let x = PAD + extra / 2;
    const rowNodes = row.map((node, index) => {
      const w = widths[index];
      const isDecision = node.role === 'decision';
      const wrapWidth = isDecision ? Math.max(w * 0.58, Math.min(w - 32, metrics[rank][index].word)) : w - 20;
      const lines = wrap(node.label, wrapWidth);
      const { height, offset } = isDecision ? measureDecision(lines, w)
        : { height: Math.max(38, lines.length * lineHeight() + 14), offset: 0 };
      const previous = incoming.get(node.id);
      const parent = previous.length === 1 ? placements.get(previous[0].from) : null;
      const ideal = row.length === 1 && parent ? parent.cx : x + w / 2;
      x += w + NODE_GAP + extra;
      const cx = Math.max(PAD + w / 2, Math.min(PAD + inner - w / 2, ideal));
      return { ...node, width: w, height, cx, lines, offset };
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

  // Port order follows where the wire actually runs, including right-side skips.
  const skipX = edge => PAD + inner + 10 + 9 * skipOrder.get(edge);
  const exitX = edge => skipOrder.has(edge) ? skipX(edge) : placements.get(edge.to).cx;
  const entryOrder = edge => skipOrder.has(edge) ? width + routeByEdge.get(edge).arrive.y : placements.get(edge.from).cx;
  for (const group of outgoing.values()) group.sort((a, b) => exitX(a) - exitX(b));
  for (const group of incoming.values()) group.sort((a, b) => entryOrder(a) - entryOrder(b));
  const routed = routes.map(route => {
    const { edge, depart, arrive } = route;
    const from = port(placements.get(edge.from), outgoing.get(edge.from), edge, true);
    const to = port(placements.get(edge.to), incoming.get(edge.to), edge, false);
    const x = arrive ? skipX(edge) : to[0];
    const points = [from, [from[0], depart.y], [x, depart.y]];
    if (arrive) points.push([x, arrive.y], [to[0], arrive.y]);
    points.push(to);
    return { ...route, points };
  });
  const wires = routed.map(({ edge, points }) => ({ active: pathEdge(edge), element: h('g', { 'data-tutor-edge': `${edge.from}:${edge.to}`, ...(pathEdge(edge) ? { 'data-tutor-path': '' } : {}) }, connector(points, { path: pathEdge(edge) })) }))
    .sort((a, b) => a.active - b.active).map(wire => wire.element); // the route is drawn last, over any wire it crosses
  const annotations = [];
  let bottom = y;
  for (const route of routed.filter(route => route.words.length)) {
    const { edge, words } = route;
    const bounds = labelBounds(route, routed, width);
    if (bounds) {
      annotations.push(h('g', null,
        h('rect', { ...bounds, fill: SURFACE }),
        label(words, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { size: EDGE_TEXT })));
      continue;
    }
    // In a dense tier there may be no room on the edge itself. Keep the
    // directed relationship readable below the graph without masking any wire.
    const key = `${placements.get(edge.from).label} → ${placements.get(edge.to).label}: ${edge.label}`;
    const lines = wrap(key, width - 2 * PAD - 20, EDGE_TEXT);
    const height = lines.length * lineHeight(EDGE_TEXT) + 12;
    bottom += 8;
    annotations.push(h('g', null,
      box(PAD, bottom, width - 2 * PAD, height),
      label(lines, PAD + 10, bottom + height / 2, { size: EDGE_TEXT, anchor: 'start' })));
    bottom += height;
  }

  const shapes = Array.from(placements.values(), node => {
    const { id, cx, y, width, height, role, lines, offset, title } = node;
    const x = cx - width / 2;
    const shape = role === 'decision'
      ? diamond(x, y, width, height, { active: onPath.has(id) })
      : box(x, y, width, height, { role, radius: role === 'outcome' ? height / 2 : 7, active: onPath.has(id) });
    // title: the full label when the server trimmed it to fit (item 47), shown as the node's tooltip.
    return h('g', { 'data-tutor-node': id, ...(onPath.has(id) ? { 'data-tutor-path': '' } : {}) }, ...(title ? [h('title', null, title)] : []), shape, label(lines, cx, y + height / 2 + offset, { tone: 'onFill' }));
  });
  return { width, height: bottom + PAD, elements: [...wires, ...annotations, ...shapes] };
}
