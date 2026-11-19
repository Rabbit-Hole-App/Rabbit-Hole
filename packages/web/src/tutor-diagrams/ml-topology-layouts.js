import { cloneElement, createElement as h } from 'react';
import { label, lineHeight, longestWordWidth, textWidth, widestFormula, wire, wrap } from './primitives.js';
import { TEACHING, teachingBox, teachingConnector } from './teaching-theme.js';
import { extendedFlow, extendedTree, isDotTree, nodeMetadata } from './ml-topology-spec.js';
import { dotTree } from './dot-tree-layout.js';
import { legendTextWidth } from './ml-plot-layouts.js';
import { layoutTensorStrip, tensorMinimumWidth } from './tensor-layout.js';

const PAD = 12, TEXT = 15, SMALL = 13, GAP = 18;
const T = { body: TEXT, small: SMALL, strict: false }; // the top-down tree's text sizes: today's unless a fitted call gives sizes (kinds-fit)
const TREE_NODE_FLOOR = 100; // the narrowest node width cap of a top-down tree that has to fit the width budget (at 100 learning-families fits in 714 px, three labels one font step smaller, nothing clipped)
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
  const lines = wrap(node.label ?? '', width - 20, T.body);
  const details = [...extra, ...nodeMetadata(node)].flatMap(value => wrap(value, width - 20, T.small));
  const mainHeight = lines.length * lineHeight(T.body);
  const detailHeight = details.length * lineHeight(T.small);
  const textHeight = mainHeight + detailHeight + (details.length ? 5 : 0);
  const strip = node.tensor ? layoutTensorStrip(node.tensor, width - 20) : null;
  const bodyHeight = textHeight + (strip ? strip.height + (textHeight ? 6 : 0) : 0);
  return { lines, details, mainHeight, detailHeight, bodyHeight, strip, height: Math.max(34, bodyHeight + 16) };
}

function nodeWidth(node, maximum = 150) {
  const values = [node.label ?? '', ...nodeMetadata(node)];
  const textMinimum = Math.max(86, ...values.map((text, i) => Math.ceil(Math.max(
    Math.min(maximum - 20, textWidth(text, i ? T.small : T.body)), widestFormula(text, i ? T.small : T.body), T.strict ? longestWordWidth(text, i ? T.small : T.body) : 0) + 20)));
  return node.tensor ? Math.max(textMinimum, tensorMinimumWidth(node.tensor) + 20) : textMinimum;
}

function card(node, pos, { active = false, pruned = false, align = 'middle', role } = {}) {
  const { x, y, width, content } = pos;
  const center = align === 'start' ? x + 10 : x + width / 2;
  const { strip, bodyHeight } = content;
  const top = y + (content.height - bodyHeight) / 2;
  return h('g', { 'data-tutor-node': node.id, ...(active ? { 'data-tutor-path': '' } : {}), ...(pruned ? { 'data-tutor-pruned': '' } : {}),
    ...(strip ? { 'aria-label': nodeName(node) } : {}) },
    cloneElement(teachingBox(x, y, width, content.height, { active, ...(role ? { role } : {}) }), { strokeDasharray: pruned ? '4 4' : undefined }),
    ...(content.lines.length ? [label(content.lines, center, top + content.mainHeight / 2, { weight: 700, size: T.body, anchor: align })] : []),
    ...(content.details.length ? [label(content.details, center, top + content.mainHeight + 5 + content.detailHeight / 2,
      { size: T.small, tone: 'muted', anchor: align })] : []),
    ...(strip ? [h('g', { 'data-tutor-node-tensor': '', transform: `translate(${x + (width - strip.width) / 2} ${top + bodyHeight - strip.height})` },
      ...strip.elements)] : []));
}

// This is the approved binary-tree arrangement extended with measured metadata.
// Unextended trees still call the original implementation byte-for-byte.
function topDown(d, preferredWidth, gapExtra = () => 0) {
  const children = childrenFor(d.nodes);
  const pruned = pruning(d.nodes), onPath = new Set(d.highlightPath ?? []);
  const natural = Math.min(150, Math.floor((preferredWidth - 2 * PAD - GAP) / 2));
  // The shape of the tree is fixed; only its node width cap moves (TREE-W): when the tree would pass the width budget (the request, at least 720, at most 960) the cap, hence every label's
  // wrap width, goes down in steps of 5, as little as it can, to TREE_NODE_FLOOR (a word is never split, so a node never gets narrower than its longest word).
  const budget = Math.min(960, Math.max(720, preferredWidth));
  function place(wrapAt) {
  const positions = new Map(), rows = [];
  function arrange(node, depth) {
    const width = nodeWidth(node, wrapAt);
    const edgeWidth = node.edgeLabel ? Math.max(width, widestFormula(node.edgeLabel, T.small) + 12) : width;
    const edgeLines = node.edgeLabel ? wrap(node.edgeLabel, edgeWidth - 12, T.small) : [];
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
  return { positions, rows, min, max };
  }
  let placed = place(natural);
  for (let cap = natural - 5; cap >= TREE_NODE_FLOOR && placed.max - placed.min + 2 * PAD > budget; cap -= 5) placed = place(cap);
  const { positions, rows, min, max } = placed;
  const width = Math.max(preferredWidth, Math.ceil(max - min + 2 * PAD));
  const shift = (width - max + min) / 2 - min;
  let y = PAD, rowsPx = 0, gapsPx = 0;
  rows.forEach((row, depth) => {
    row.forEach(p => { p.x += shift; p.y = y; });
    y += Math.max(...row.map(p => p.content.height));
    if (depth < rows.length - 1) { const gap = 30 + Math.max(0, ...rows[depth + 1].map(p => p.edgeLines.length * lineHeight(T.small))) + gapExtra(depth); y += gap; gapsPx += gap; }
    rowsPx += Math.max(...row.map(p => p.content.height));
  });
  const wires = [], annotations = [], cards = [], geometry = { nodes: [], links: [] };
  for (const node of d.nodes) {
    const pos = positions.get(node.id);
    if (node.parent !== undefined) {
      const parent = positions.get(node.parent);
      const previousRowBottom = Math.max(...rows[rows.findIndex(row => row.includes(pos)) - 1].map(p => p.y + p.content.height));
      const elbow = previousRowBottom + 12;
      geometry.links.push({ from: node.parent, to: node.id, points: [[parent.x, parent.y + parent.content.height], [parent.x, elbow], [pos.x, elbow], [pos.x, pos.y]] });
      wires.push(h('g', { 'data-tutor-edge': `${node.parent}:${node.id}`, ...(pathEdge(d, node.parent, node.id) ? { 'data-tutor-path': '' } : {}) },
        teachingConnector([[parent.x, parent.y + parent.content.height], [parent.x, elbow], [pos.x, elbow], [pos.x, pos.y]],
          { active: pathEdge(d, node.parent, node.id), dashed: pruned.has(node.id) })));
      if (pos.edgeLines.length) {
        const height = pos.edgeLines.length * lineHeight(T.small) + 4;
        const cy = pos.y - 7 - height / 2;
        annotations.push(h('g', { 'data-tutor-edge-label': node.id },
          h('rect', { x: pos.x - pos.edgeWidth / 2, y: cy - height / 2, width: pos.edgeWidth, height, fill: TEACHING.surface }),
          label(pos.edgeLines, pos.x, cy, { size: T.small })));
      }
    }
    cards.push(card(node, { ...pos, x: pos.x - pos.width / 2 }, { active: onPath.has(node.id), pruned: pruned.has(node.id) }));
    geometry.nodes.push({ id: node.id, x: pos.x - pos.width / 2, y: pos.y, width: pos.width, height: pos.content.height });
  }
  const spare = width - (max - min) - 2 * PAD;
  const parts = [{ part: 'top margin', px: PAD }, { part: 'node rows', px: rowsPx }, ...(gapsPx ? [{ part: 'gaps between the rows (elbows and edge labels)', px: gapsPx }] : []), { part: 'bottom margin', px: PAD }];
  const widthParts = [{ part: 'margins', px: 2 * PAD }, { part: 'widest row of nodes and the gaps between them', px: Math.ceil(max - min) }, ...(spare > 1e-9 ? [{ part: 'spare width', px: spare }] : [])];
  return { width, height: y + PAD, rankCount: rows.length, parts, widthParts, geometry, elements: [...wires, ...annotations, ...cards] };
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
    stroke: TEACHING.outline, strokeWidth: 1.5, strokeDasharray: '5 4', 'data-tutor-cutoff': d.cutoff.value }));
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
    elements.push(cloneElement(teachingConnector([[point.x, point.y], [badge.x, badge.y]], { guide: true }),
      { 'data-tutor-merge-leader': node.id }));
  }
  for (const node of d.nodes) {
    const { x, y } = positions.get(node.id), index = merges.indexOf(node);
    elements.push(h('circle', { cx: x, cy: y, r: index < 0 || crowded.has(node.id) ? 3.5 : 9,
      fill: TEACHING.surface, stroke: onPath.has(node.id) ? TEACHING.blue : TEACHING.outline, strokeWidth: 1.5,
      'data-tutor-node': node.id, 'data-tutor-merge-height': node.height }));
    if (index >= 0) {
      const badge = badges.get(node.id);
      if (crowded.has(node.id)) elements.push(h('circle', { cx: badge.x, cy: badge.y, r: 9,
        fill: TEACHING.surface, stroke: onPath.has(node.id) ? TEACHING.blue : TEACHING.outline, strokeWidth: 1.5 }));
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
// REL-1: a box takes its fill from its place in the graph (the roles flow uses: no arrow leaves it, an outcome; the rest, an input with no arrow into it included, a process). A label that fits
// beside its arrow is drawn there; arrows that carry the same sentence share one numbered note; the numbered list holds only the notes that do not fit (never the node names: the badge is on the arrow).
const GRAPH_LABEL_MAX_WIDTH = 720;
function graph(d, preferredWidth, hasTensor) {
  const order = new Map(d.nodes.map((n, i) => [n.id, i]));
  const routes = d.edges.map((e, i) => ({ ...e, index: i, side: order.get(e.from) < order.get(e.to) ? 'right' : 'left' }));
  const laneCounts = { left: 0, right: 0 };
  routes.forEach(r => { r.lane = laneCounts[r.side]++; });
  const nodeW = Math.max(180, ...d.nodes.map(n => nodeWidth(n, 186))); // node boxes are 180 x 56 like flow nodes
  const firstLane = 16, laneSpacing = 24, portGap = 2;
  const gutters = Object.fromEntries(Object.entries(laneCounts).map(([side, count]) => [side, count ? firstLane + (count - 1) * laneSpacing + 18 : 0]));
  // One note per distinct sentence; the arrows that carry it share it.
  const notes = [];
  for (const r of routes) {
    const text = r.label.trim();
    let note = notes.find(item => item.text === text);
    if (!note) notes.push(note = { text, routes: [] });
    note.routes.push(r);
    r.note = note;
  }
  const textHeight = lineHeight(SMALL), textWidthOf = text => Math.ceil(legendTextWidth(text, SMALL));
  const legendWidth = hasTensor ? 2 * PAD + Math.max(...notes.map(note => Math.ceil(widestFormula(`9. ${note.text}`, SMALL)))) : 0;
  const baseWidth = Math.max(preferredWidth, 2 * PAD + gutters.left + nodeW + gutters.right, legendWidth);
  const nodeX = PAD + gutters.left + (baseWidth - 2 * PAD - gutters.left - gutters.right - nodeW) / 2;
  const positions = new Map();
  let y = PAD;
  for (const n of d.nodes) {
    const measured = measure(n, nodeW), content = { ...measured, height: Math.max(56, measured.height) };
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
  for (const r of routes) {
    r.fromAt = port(r.from, r); r.toAt = port(r.to, r);
    r.laneX = r.side === 'right' ? nodeX + nodeW + firstLane + r.lane * laneSpacing : nodeX - (firstLane + r.lane * laneSpacing);
    const upper = positions.get(order.get(r.from) < order.get(r.to) ? r.from : r.to);
    r.badgeY = upper.y + upper.content.height + 24;
  }
  // Where a label may stand: beside its own lane (either side) or above and below its own two short runs, clear of every node, wire, badge and other label (3 px).
  const solid = (x1, y1, x2, y2) => ({ x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) });
  const apart = (a, b, margin = 3) => a.x2 + margin <= b.x1 || b.x2 + margin <= a.x1 || a.y2 + margin <= b.y1 || b.y2 + margin <= a.y1;
  const nodeBoxes = d.nodes.map(n => { const p = positions.get(n.id); return solid(p.x, p.y, p.x + p.width, p.y + p.content.height); });
  const wireBoxes = r => [solid(r.fromAt[0], r.fromAt[1] - 1, r.laneX, r.fromAt[1] + 1), solid(r.laneX - 1, r.fromAt[1], r.laneX + 1, r.toAt[1]), solid(r.laneX, r.toAt[1] - 1, r.toAt[0], r.toAt[1] + 1)];
  const badgeBox = r => solid(r.laneX - 10, r.badgeY - 10, r.laneX + 10, r.badgeY + 10);
  const labelHeight = textHeight;
  const candidates = (r, text, width) => {
    const w = textWidthOf(text), out = [];
    const y1 = Math.min(r.fromAt[1], r.toAt[1]), y2 = Math.max(r.fromAt[1], r.toAt[1]), mid = (y1 + y2) / 2;
    const sweep = [];
    for (let at = y1 + labelHeight / 2 + 4; at <= y2 - labelHeight / 2 - 4; at += 4) sweep.push(at);
    sweep.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    const sides = r.side === 'right' ? ['after', 'before'] : ['before', 'after'];
    for (const side of sides) for (const at of sweep) {
      const x1 = side === 'after' ? r.laneX + 7 : r.laneX - 7 - w;
      out.push({ ...solid(x1, at - labelHeight / 2, x1 + w, at + labelHeight / 2), text, anchor: 'start', x: x1, y: at });
    }
    for (const [from, to, at] of [[r.fromAt[0], r.laneX, r.fromAt[1]], [r.toAt[0], r.laneX, r.toAt[1]]]) {
      const left = Math.min(from, to), room = Math.abs(to - from);
      if (room < w + 10) continue;
      for (const above of [true, false]) {
        const top = above ? at - 3 - labelHeight : at + 3;
        out.push({ ...solid(left + 5, top, left + 5 + w, top + labelHeight), text, anchor: 'start', x: left + 5, y: top + labelHeight / 2 });
      }
    }
    // The canvas edge is checked with the generous text measure (a label never clips), the neighbours with the Arial advances.
    const generous = Math.ceil(textWidth(text, SMALL));
    return out.filter(box => box.x1 >= PAD && box.x1 + generous <= width - PAD && box.x2 <= width - PAD);
  };
  const placeLabels = width => {
    const placed = new Map();
    const taken = [];
    for (const note of notes) {
      if (note.routes.length > 1) continue; // arrows that share a sentence share one numbered note
      const [r] = note.routes;
      const obstacles = [...nodeBoxes, ...routes.flatMap(other => other === r ? [] : [...wireBoxes(other), badgeBox(other)]), ...wireBoxes(r), ...taken];
      const spot = candidates(r, note.text, width).find(box => obstacles.every(other => apart(box, other)));
      if (!spot) continue;
      placed.set(note, spot); taken.push(spot);
    }
    return placed;
  };
  const single = notes.filter(note => note.routes.length === 1).length;
  let width = baseWidth, placed = placeLabels(width);
  if (placed.size < single) {
    // The card may grow, up to 720 px, when that lets every label stand on its arrow (no list at all); else it keeps today's width.
    for (let wider = baseWidth + 12; wider <= GRAPH_LABEL_MAX_WIDTH && placed.size < single; wider += 12) {
      const attempt = placeLabels(wider);
      if (attempt.size === single) { width = wider; placed = attempt; }
    }
    if (placed.size < single && width === baseWidth) placed = placeLabels(baseWidth);
  }
  const listed = notes.filter(note => !placed.has(note));
  listed.forEach((note, i) => { note.number = i + 1; });
  const outcome = new Set(d.nodes.filter(n => !d.edges.some(e => e.from === n.id)).map(n => n.id));
  const elements = [];
  for (const r of routes) {
    const from = r.fromAt, to = r.toAt, laneX = r.laneX, spot = placed.get(r.note);
    elements.push(h('g', { 'data-tutor-edge': `${r.from}:${r.to}`, 'data-tutor-edge-index': r.index },
      wire([from, [laneX, from[1]], [laneX, to[1]], to]),
      ...(spot ? [label(spot.text, spot.x, spot.y, { size: SMALL, anchor: 'start', weight: 500 })]
        : [h('circle', { cx: laneX, cy: r.badgeY, r: 10, fill: TEACHING.surface, stroke: TEACHING.outline, strokeWidth: 1.5 }),
          label(String(r.note.number), laneX, r.badgeY, { size: 13, weight: 600 })])));
  }
  for (const node of d.nodes) elements.push(card(node, positions.get(node.id), { role: outcome.has(node.id) ? 'outcome' : 'process' }));
  y -= 30;
  for (const note of listed) {
    const lines = wrap(`${note.number}. ${note.text}`, width - 2 * PAD, SMALL), height = lines.length * lineHeight(SMALL);
    elements.push(label(lines, PAD, y + height / 2, { size: SMALL, anchor: 'start', fill: TEACHING.muted }));
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
    fill: role === 'decision' ? TEACHING.mustardFill : role === 'outcome' ? TEACHING.tealFill : role ? TEACHING.blueFill : TEACHING.surface,
    stroke: role ? active ? TEACHING.blue : TEACHING.outline : undefined, strokeWidth: role ? active ? 3 : 1.5 : undefined,
  });
  if (element.type === 'polyline') Object.assign(attrs, { stroke: active ? TEACHING.blue : TEACHING.outline, strokeWidth: active ? 3 : 2 });
  if (element.type === 'polygon' && p['data-tutor-arrowhead'] !== undefined) attrs.fill = active ? TEACHING.blue : TEACHING.outline;
  if (element.type === 'text') attrs.fill = TEACHING.ink;
  return cloneElement(element, attrs, ...[p.children].flat().map(child => restyleFlow(child, roles, active, role)));
}

export function createLayouts({ legacy }) {
  return {
    tree: (d, width, options) => isDotTree(d) ? dotTree(d, width, options) : !extendedTree(d) ? legacy.tree(d, width) : d.layout === 'dendrogram' ? dendrogram(d, width)
      : d.layout === 'binary' || d.layout === 'hierarchy' ? fittedTree(d, width, options) : outline(d, width),
    relationship: (d, width) => {
      const hasTensor = d.nodes.some(n => n.tensor);
      return d.layout === 'graph' || hasTensor ? graph(d, width, hasTensor) : legacy.relationship(d, width);
    },
    flow: (d, width, options) => {
      if (!extendedFlow(d)) return legacy.flow(d, width, options);
      const roles = new Map(d.nodes.map(n => [n.id, n.role]));
      const rendered = legacy.flow({ ...d, nodes: d.nodes.map(n => ({ ...n,
        role: n.role === 'fork' || n.role === 'merge' ? 'process' : n.role })) }, width, options);
      return { ...rendered, elements: rendered.elements.map(e => restyleFlow(e, roles)) };
    },
  };
}

// kinds-fit: a decision tree (binary or hierarchy layout, drawn top down) takes sizes.body (node labels, 15 today) and sizes.small (details and edge labels, 13 today) and a box (the gaps between the rows share the height that is left),
// reports its nodes and parent links, and never draws a text smaller than asked (a node is as wide as its longest word).
function fittedTree(d, width, options) {
  const { box, sizes, contentHeight, floor } = options ?? {};
  const saved = { ...T };
  try {
    if (sizes?.body) T.body = sizes.body;
    if (sizes?.small) T.small = sizes.small;
    T.strict = Boolean(sizes);
    const first = topDown(d, width);
    if (!box || floor || contentHeight === undefined || first.rankCount < 2) return first;
    const extra = Math.floor(contentHeight - first.height), gaps = first.rankCount - 1;
    return extra > 0 ? topDown(d, width, rank => Math.floor(extra / gaps) + (rank < extra % gaps ? 1 : 0)) : first;
  } finally { Object.assign(T, saved); }
}
