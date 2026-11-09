import { cloneElement, createElement as h } from 'react';
import { label, lineHeight, textWidth, widestFormula, wrap } from './primitives.js';
import { TEACHING, teachingBox, teachingConnector } from './teaching-theme.js';
import { extendedFlow, extendedTree, flowLabel, nodeMetadata } from './ml-topology-spec.js';
import { layoutTensorStrip, tensorMinimumWidth } from './tensor-layout.js';

const PAD = 12, TEXT = 14, SMALL = 13, GAP = 18;
const childrenFor = nodes => new Map(nodes.map(n => [n.id, nodes.filter(child => child.parent === n.id)]));
const pathEdge = (d, from, to) => d.highlightPath?.some((id, i) => id === from && d.highlightPath[i + 1] === to);
const nodeName = node => node.label ?? node.tensor?.name ?? node.tensor?.dimensions;
function pruning(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  return new Set(nodes.filter(n => {
    const seen = new Set();
    while (n && !seen.has(n.id)) {
      if (n.pruned) return true;
      seen.add(n.id);
      n = byId.get(n.parent);
    }
    return false;
  }).map(n => n.id));
}

function measure(node, width, extra = []) {
  const lines = wrap(node.label ?? '', width - 20, TEXT);
  const details = [...extra, ...nodeMetadata(node)].flatMap(value => wrap(value, width - 20, SMALL));
  const mainHeight = lines.length * lineHeight(TEXT);
  const detailHeight = details.length * lineHeight(SMALL);
  const textHeight = mainHeight + detailHeight + (details.length ? 5 : 0);
  const strip = node.tensor ? layoutTensorStrip(node.tensor, width - 20) : null;
  const bodyHeight = textHeight + (strip ? strip.height + (textHeight ? 6 : 0) : 0);
  return { lines, details, mainHeight, detailHeight, bodyHeight, strip, height: Math.max(34, bodyHeight + 16) };
}

function nodeWidth(node, maximum = 150) {
  const values = [node.label ?? '', ...nodeMetadata(node)];
  const textMinimum = Math.max(86, ...values.map((text, i) => Math.ceil(Math.max(
    Math.min(maximum - 20, textWidth(text, i ? SMALL : TEXT)), widestFormula(text, i ? SMALL : TEXT)) + 20)));
  return node.tensor ? Math.max(textMinimum, tensorMinimumWidth(node.tensor) + 20) : textMinimum;
}

function card(node, pos, { active = false, pruned = false, align = 'middle' } = {}) {
  const { x, y, width, content } = pos;
  const center = align === 'start' ? x + 10 : x + width / 2;
  const { strip, bodyHeight } = content;
  const top = y + (content.height - bodyHeight) / 2;
  return h('g', { 'data-tutor-node': node.id, ...(active ? { 'data-tutor-path': '' } : {}), ...(pruned ? { 'data-tutor-pruned': '' } : {}),
    ...(strip ? { 'aria-label': nodeName(node) } : {}) },
    cloneElement(teachingBox(x, y, width, content.height, { active }), { strokeDasharray: pruned ? '4 4' : undefined }),
    ...(content.lines.length ? [label(content.lines, center, top + content.mainHeight / 2, { weight: 700, anchor: align })] : []),
    ...(content.details.length ? [label(content.details, center, top + content.mainHeight + 5 + content.detailHeight / 2,
      { size: SMALL, tone: 'muted', anchor: align })] : []),
    ...(strip ? [h('g', { 'data-tutor-node-tensor': '', transform: `translate(${x + (width - strip.width) / 2} ${top + bodyHeight - strip.height})` },
      ...strip.elements)] : []));
}

// This is the approved binary-tree arrangement extended with measured metadata.
// Unextended trees still call the original implementation byte-for-byte.
function topDown(d, preferredWidth) {
  const children = childrenFor(d.nodes), positions = new Map(), rows = [];
  const pruned = pruning(d.nodes), onPath = new Set(d.highlightPath ?? []);
  const wrapAt = Math.min(150, Math.floor((preferredWidth - 2 * PAD - GAP) / 2));
  function arrange(node, depth) {
    const width = nodeWidth(node, wrapAt);
    const edgeWidth = node.edgeLabel ? Math.max(width, widestFormula(node.edgeLabel, SMALL) + 12) : width;
    const edgeLines = node.edgeLabel ? wrap(node.edgeLabel, edgeWidth - 12, SMALL) : [];
    const pos = { x: 0, width, content: measure(node, width), edgeWidth, edgeLines, node };
    positions.set(node.id, pos);
    (rows[depth] ??= []).push(pos);
    const branches = children.get(node.id);
    const ordered = d.layout === 'binary' ? ['left', 'right'].map(side => branches.find(n => n.side === side)) : branches;
    const bundles = ordered.map(n => n ? arrange(n, depth + 1) : null);
    const subtree = { cards: [pos], min: -edgeWidth / 2, max: edgeWidth / 2 };
    let shifts;
    if (d.layout === 'binary') {
      const [left, right] = bundles;
      const offset = Math.max(36, left && right ? (left.max - right.min + GAP) / 2 : 0);
      shifts = [-offset, offset];
    } else {
      const total = bundles.reduce((sum, b) => sum + b.max - b.min, 0) + Math.max(0, bundles.length - 1) * GAP;
      let cursor = -total / 2;
      shifts = bundles.map(b => { const shift = cursor - b.min; cursor += b.max - b.min + GAP; return shift; });
    }
    bundles.forEach((bundle, i) => {
      if (!bundle) return;
      for (const child of bundle.cards) child.x += shifts[i];
      subtree.cards.push(...bundle.cards);
      subtree.min = Math.min(subtree.min, bundle.min + shifts[i]);
      subtree.max = Math.max(subtree.max, bundle.max + shifts[i]);
    });
    return subtree;
  }
  const { min, max } = arrange(d.nodes.find(n => n.parent === undefined), 0);
  const width = Math.max(preferredWidth, Math.ceil(max - min + 2 * PAD));
  const shift = (width - max + min) / 2 - min;
  let y = PAD;
  rows.forEach((row, depth) => {
    row.forEach(p => { p.x += shift; p.y = y; });
    y += Math.max(...row.map(p => p.content.height));
    if (depth < rows.length - 1) y += 30 + Math.max(0, ...rows[depth + 1].map(p => p.edgeLines.length * lineHeight(SMALL)));
  });
  const wires = [], annotations = [], cards = [];
  for (const node of d.nodes) {
    const pos = positions.get(node.id);
    if (node.parent !== undefined) {
      const parent = positions.get(node.parent);
      const previousRowBottom = Math.max(...rows[rows.findIndex(row => row.includes(pos)) - 1].map(p => p.y + p.content.height));
      const elbow = previousRowBottom + 12;
      wires.push(h('g', { 'data-tutor-edge': `${node.parent}:${node.id}`, ...(pathEdge(d, node.parent, node.id) ? { 'data-tutor-path': '' } : {}) },
        teachingConnector([[parent.x, parent.y + parent.content.height], [parent.x, elbow], [pos.x, elbow], [pos.x, pos.y]],
          { active: pathEdge(d, node.parent, node.id), dashed: pruned.has(node.id) })));
      if (pos.edgeLines.length) {
        const height = pos.edgeLines.length * lineHeight(SMALL) + 4;
        const cy = pos.y - 7 - height / 2;
        annotations.push(h('g', { 'data-tutor-edge-label': node.id },
          h('rect', { x: pos.x - pos.edgeWidth / 2, y: cy - height / 2, width: pos.edgeWidth, height, fill: TEACHING.surface }),
          label(pos.edgeLines, pos.x, cy, { size: SMALL })));
      }
    }
    cards.push(card(node, { ...pos, x: pos.x - pos.width / 2 }, { active: onPath.has(node.id), pruned: pruned.has(node.id) }));
  }
  return { width, height: y + PAD, elements: [...wires, ...annotations, ...cards] };
}

function outline(d, preferredWidth) {
  const children = childrenFor(d.nodes), rows = [], positions = new Map();
  const onPath = new Set(d.highlightPath ?? []), pruned = pruning(d.nodes);
  function visit(node, depth) { rows.push({ node, depth }); children.get(node.id).forEach(child => visit(child, depth + 1)); }
  visit(d.nodes.find(n => n.parent === undefined), 0);
  const maxDepth = Math.max(...rows.map(r => r.depth));
  const indent = Math.min(24, (preferredWidth - 2 * PAD - 140) / Math.max(1, maxDepth));
  const width = Math.max(preferredWidth, ...rows.map(({ node, depth }) => depth * indent + 2 * PAD + 20 +
    Math.max(...[node.label, node.edgeLabel ?? '', ...nodeMetadata(node)].map(t => widestFormula(t)))));
  let y = PAD;
  const cards = rows.map(({ node, depth }) => {
    const x = PAD + indent * depth;
    const content = measure(node, width - PAD - x, node.edgeLabel ? [node.edgeLabel] : []);
    const pos = { x, y, width: width - PAD - x, content };
    positions.set(node.id, pos);
    y += content.height + 8;
    return card(node, pos, { active: onPath.has(node.id), pruned: pruned.has(node.id), align: 'start' });
  });
  const wires = d.nodes.filter(n => n.parent !== undefined).map(n => {
    const p = positions.get(n.parent), c = positions.get(n.id), cy = c.y + c.content.height / 2;
    return h('g', { 'data-tutor-edge': `${n.parent}:${n.id}` }, teachingConnector([[p.x + 5, p.y + p.content.height],
      [p.x + 5, cy], [c.x - 2, cy]], { arrow: true, active: pathEdge(d, n.parent, n.id), dashed: pruned.has(n.id) }));
  });
  return { width, height: y - 8 + PAD, elements: [...wires, ...cards] };
}

function dendrogram(d, preferredWidth) {
  const children = childrenFor(d.nodes), leaves = [], positions = new Map();
  const pruned = pruning(d.nodes), onPath = new Set(d.highlightPath ?? []);
  function collect(node) { const branch = children.get(node.id); if (branch.length) branch.forEach(collect); else leaves.push(node); }
  collect(d.nodes.find(n => n.parent === undefined));
  const cellWidth = Math.max(92, ...leaves.map(n => nodeWidth(n, 130)));
  const axisX = PAD + Math.max(32, textWidth(String(d.heightAxis.max), SMALL)) + 9;
  const width = Math.max(preferredWidth, axisX + 14 + leaves.length * (cellWidth + GAP) - GAP + PAD);
  const titleLines = wrap(`${d.heightAxis.label}${d.heightAxis.unit ? ` (${d.heightAxis.unit})` : ''}`, width - 2 * PAD, TEXT);
  const top = PAD + titleLines.length * lineHeight(TEXT) + 20;
  const bottom = top + 280;
  const valueY = height => bottom - height / d.heightAxis.max * (bottom - top);
  const available = width - PAD - axisX - 14;
  leaves.forEach((n, i) => positions.set(n.id, { x: axisX + 14 + (i + 0.5) * available / leaves.length, y: valueY(0) }));
  function place(node) {
    if (positions.has(node.id)) return positions.get(node.id);
    const branch = children.get(node.id).map(place);
    const pos = { x: (branch[0].x + branch.at(-1).x) / 2, y: valueY(node.height) };
    positions.set(node.id, pos);
    return pos;
  }
  place(d.nodes.find(n => n.parent === undefined));
  const elements = [label(titleLines, PAD, PAD + titleLines.length * lineHeight(TEXT) / 2, { anchor: 'start', weight: 700 }),
    teachingConnector([[axisX, top], [axisX, bottom]])];
  for (const value of [0, d.heightAxis.max]) elements.push(
    teachingConnector([[axisX - 4, valueY(value)], [axisX, valueY(value)]]),
    label(String(value), axisX - 8, valueY(value), { size: SMALL, anchor: 'end', tone: 'muted' }));
  for (const node of d.nodes.filter(n => n.parent !== undefined)) {
    const child = positions.get(node.id), parent = positions.get(node.parent);
    elements.push(h('g', { 'data-tutor-edge': `${node.parent}:${node.id}` }, teachingConnector(
      [[child.x, child.y], [child.x, parent.y], [parent.x, parent.y]],
      { active: pathEdge(d, node.parent, node.id), dashed: pruned.has(node.id) })));
  }
  if (d.cutoff) elements.push(h('line', { x1: axisX, x2: width - PAD, y1: valueY(d.cutoff.value), y2: valueY(d.cutoff.value),
    stroke: TEACHING.warm, strokeWidth: 1.5, strokeDasharray: '5 4', 'data-tutor-cutoff': d.cutoff.value }));
  const merges = d.nodes.filter(n => children.get(n.id).length);
  const crowded = new Set(merges.filter(node => {
    const p = positions.get(node.id);
    return d.nodes.some(other => {
      if (other.id === node.id) return false;
      const q = positions.get(other.id), radius = children.get(other.id).length ? 9 : 3.5;
      return Math.hypot(p.x - q.x, p.y - q.y) < 9 + radius + 4;
    });
  }).map(node => node.id));
  const badges = new Map(merges.map(node => [node.id, { ...positions.get(node.id) }]));
  // Only crowded annotations leave the plot. The plot width, branch endpoints,
  // and exact numeric merge positions stay unchanged, including tied heights.
  const lane = merges.filter(node => crowded.has(node.id)).sort((a, b) => positions.get(a.id).y - positions.get(b.id).y);
  let previousY = top - 24;
  for (const node of lane) {
    const y = Math.max(positions.get(node.id).y, previousY + 24);
    badges.set(node.id, { x: width + 12, y });
    previousY = y;
  }
  let nextY = bottom + 24;
  for (const node of [...lane].reverse()) {
    const badge = badges.get(node.id);
    badge.y = Math.min(badge.y, nextY - 24);
    nextY = badge.y;
  }
  for (const node of lane) {
    const point = positions.get(node.id), badge = badges.get(node.id);
    elements.push(cloneElement(teachingConnector([[point.x, point.y], [badge.x, badge.y]], { dashed: true }),
      { 'data-tutor-merge-leader': node.id }));
  }
  for (const node of d.nodes) {
    const { x, y } = positions.get(node.id), index = merges.indexOf(node);
    elements.push(h('circle', { cx: x, cy: y, r: index < 0 || crowded.has(node.id) ? 3.5 : 9,
      fill: TEACHING.surface, stroke: onPath.has(node.id) ? TEACHING.blue : TEACHING.wire, strokeWidth: 1.6,
      'data-tutor-node': node.id, 'data-tutor-merge-height': node.height }));
    if (index >= 0) {
      const badge = badges.get(node.id);
      if (crowded.has(node.id)) elements.push(h('circle', { cx: badge.x, cy: badge.y, r: 9,
        fill: TEACHING.surface, stroke: onPath.has(node.id) ? TEACHING.blue : TEACHING.wire, strokeWidth: 1.6 }));
      elements.push(label(String(index + 1), badge.x, badge.y, { size: 12, weight: 700 }));
    }
  }
  const leafContents = leaves.map(n => measure(n, cellWidth, n.edgeLabel ? [n.edgeLabel] : []));
  leaves.forEach((node, i) => elements.push(card(node, { x: positions.get(node.id).x - cellWidth / 2,
    y: bottom + 16, width: cellWidth, content: leafContents[i] }, { active: onPath.has(node.id), pruned: pruned.has(node.id) })));
  let y = bottom + 16 + Math.max(...leafContents.map(c => c.height)) + 18;
  const details = [
    ...(d.cutoff ? [`Cutoff: ${d.cutoff.label} = ${d.cutoff.value}${d.heightAxis.unit ? ` ${d.heightAxis.unit}` : ''}`] : []),
    ...merges.map((n, i) => [`${i + 1}. ${n.label}`, `height = ${n.height}${d.heightAxis.unit ? ` ${d.heightAxis.unit}` : ''}`,
      n.edgeLabel, ...nodeMetadata(n)].filter(Boolean).join(' · ')),
  ];
  for (const text of details) {
    const lines = wrap(text, width - 2 * PAD, SMALL), height = lines.length * lineHeight(SMALL);
    elements.push(label(lines, PAD, y + height / 2, { anchor: 'start', size: SMALL }));
    y += height + 8;
  }
  return { width: width + (crowded.size ? 36 : 0), height: y + PAD, elements };
}

// Dedicated outside lanes make cycles and reciprocal links unambiguous while
// each entity is drawn once. Numbered route labels use the existing flow
// renderer's directed-label ledger convention when inline labels would cross.
function graph(d, preferredWidth, hasTensor) {
  const order = new Map(d.nodes.map((n, i) => [n.id, i]));
  const routes = d.edges.map((e, i) => ({ ...e, index: i, side: order.get(e.from) < order.get(e.to) ? 'right' : 'left' }));
  const laneCounts = { left: 0, right: 0 };
  routes.forEach(r => { r.lane = laneCounts[r.side]++; });
  const nodeW = Math.max(150, ...d.nodes.map(n => nodeWidth(n, 186)));
  const firstLane = 16, laneSpacing = 24, portGap = 2;
  const gutters = Object.fromEntries(Object.entries(laneCounts).map(([side, count]) => [side, count ? firstLane + (count - 1) * laneSpacing + 18 : 0]));
  const names = new Map(d.nodes.map(node => [node.id, nodeName(node)]));
  const legend = routes.map(r => `${r.index + 1}. ${names.get(r.from)} → ${names.get(r.to)}: ${r.label}`);
  const legendWidth = hasTensor ? 2 * PAD + Math.ceil(Math.max(...legend.map(text => widestFormula(text, SMALL)))) : 0;
  const width = Math.max(preferredWidth, 2 * PAD + gutters.left + nodeW + gutters.right, legendWidth);
  const nodeX = PAD + gutters.left + (width - 2 * PAD - gutters.left - gutters.right - nodeW) / 2;
  const positions = new Map();
  let y = PAD;
  for (const n of d.nodes) {
    const content = measure(n, nodeW);
    positions.set(n.id, { x: nodeX, y, width: nodeW, content });
    y += content.height + 48;
  }
  const port = (id, route) => {
    const pos = positions.get(id);
    const peers = routes.filter(r => r.side === route.side && (r.from === id || r.to === id));
    const inset = hasTensor ? 9 : 0; // Use the straight side of the rounded card.
    const gap = hasTensor ? 0 : portGap;
    const x = route.side === 'right' ? nodeX + nodeW + gap : nodeX - gap;
    return [x, pos.y + inset + (pos.content.height - 2 * inset) * (peers.indexOf(route) + 1) / (peers.length + 1)];
  };
  const elements = [];
  for (const r of routes) {
    const from = port(r.from, r), to = port(r.to, r);
    const offset = firstLane + r.lane * laneSpacing;
    const laneX = r.side === 'right' ? nodeX + nodeW + offset : nodeX - offset;
    const upper = positions.get(order.get(r.from) < order.get(r.to) ? r.from : r.to);
    const badgeY = upper.y + upper.content.height + 24;
    elements.push(h('g', { 'data-tutor-edge': `${r.from}:${r.to}`, 'data-tutor-edge-index': r.index },
      teachingConnector([from, [laneX, from[1]], [laneX, to[1]], to], { arrow: true }),
      h('circle', { cx: laneX, cy: badgeY, r: 9, fill: TEACHING.surface, stroke: TEACHING.line }),
      label(String(r.index + 1), laneX, badgeY, { size: 12, weight: 700 })));
  }
  for (const node of d.nodes) elements.push(card(node, positions.get(node.id)));
  y -= 30;
  for (const text of legend) {
    const lines = wrap(text, width - 2 * PAD, SMALL), height = lines.length * lineHeight(SMALL);
    elements.push(label(lines, PAD, y + height / 2, { size: SMALL, anchor: 'start' }));
    y += height + 8;
  }
  return { width, height: y + PAD, elements };
}

function restyleFlow(element, roles, active = false, role) {
  if (!element || typeof element !== 'object') return element;
  const p = element.props;
  if (p['data-tutor-node-tensor'] !== undefined) return element;
  const nodeId = p['data-tutor-node'];
  role = nodeId ? roles.get(nodeId) : role;
  active ||= p['data-tutor-path'] !== undefined;
  const attrs = nodeId ? { 'data-tutor-role': role } : {};
  if (element.type === 'rect' || (element.type === 'polygon' && role)) Object.assign(attrs, {
    fill: role === 'decision' ? TEACHING.warmSoft : role === 'outcome' ? TEACHING.greenSoft : TEACHING.surface,
    stroke: role ? active ? TEACHING.blue : TEACHING.line : undefined, strokeWidth: role ? active ? 2 : 1 : undefined,
  });
  if (element.type === 'polyline') Object.assign(attrs, { stroke: active ? TEACHING.blue : TEACHING.wire, strokeWidth: active ? 2.5 : 1.6 });
  if (element.type === 'polygon' && p['data-tutor-arrowhead'] !== undefined) attrs.fill = active ? TEACHING.blue : TEACHING.wire;
  if (element.type === 'text') attrs.fill = TEACHING.ink;
  return cloneElement(element, attrs, ...[p.children].flat().map(child => restyleFlow(child, roles, active, role)));
}

export function createLayouts({ legacy }) {
  return {
    tree: (d, width) => !extendedTree(d) ? legacy.tree(d, width) : d.layout === 'dendrogram' ? dendrogram(d, width)
      : d.layout === 'binary' || d.layout === 'hierarchy' ? topDown(d, width) : outline(d, width),
    relationship: (d, width) => {
      const hasTensor = d.nodes.some(n => n.tensor);
      return d.layout === 'graph' || hasTensor ? graph(d, width, hasTensor) : legacy.relationship(d, width);
    },
    flow: (d, width) => {
      if (!extendedFlow(d)) return legacy.flow(d, width);
      const roles = new Map(d.nodes.map(n => [n.id, n.role]));
      const rendered = legacy.flow({ ...d, nodes: d.nodes.map(n => ({ ...n, label: n.label === undefined ? undefined : flowLabel(n),
        role: n.role === 'fork' || n.role === 'merge' ? 'process' : n.role })) }, width);
      return { ...rendered, elements: rendered.elements.map(e => restyleFlow(e, roles)) };
    },
  };
}
