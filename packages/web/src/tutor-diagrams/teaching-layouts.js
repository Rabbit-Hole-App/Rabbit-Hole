import { cloneElement, createElement as h } from 'react';
import { box, connector, label, lineHeight, textWidth, widestFormula, words, wrap } from './primitives.js';

const PAD = 12;
const GAP = 8;
const TEXT = 14;
const SMALL = 13;
const TEXT_PAD = 10;
const LINK_MIN = 56; // the narrowest link lane: room for an arrow with its head

function measure(value, width, detail) {
  const lines = wrap(value, width - 2 * TEXT_PAD, TEXT);
  const details = detail ? wrap(detail, width - 2 * TEXT_PAD, SMALL) : [];
  const mainHeight = lines.length * lineHeight(TEXT);
  const detailHeight = details.length * lineHeight(SMALL);
  const textHeight = mainHeight + detailHeight + (details.length ? 5 : 0);
  return { lines, details, mainHeight, detailHeight, textHeight, height: Math.max(34, textHeight + 16) };
}

function card(x, y, width, content, { role = 'plain', height = content.height, align = 'middle' } = {}) {
  const center = x + (align === 'start' ? TEXT_PAD : width / 2);
  const top = y + (height - content.textHeight) / 2;
  const tone = role === 'plain' ? 'ink' : 'onFill';
  return [
    box(x, y, width, height, { role }),
    label(content.lines, center, top + content.mainHeight / 2, { anchor: align, weight: 700, tone }),
    ...(content.details.length ? [label(content.details, center, top + content.mainHeight + 5 + content.detailHeight / 2,
      { size: SMALL, anchor: align, tone: role === 'plain' ? 'muted' : tone })] : []),
  ];
}

const BRANCH_GAP = 18;
const ROW_GAP = 30;

function binaryTree({ nodes }, preferredWidth) {
  const children = new Map(nodes.map(node => [node.id, {}]));
  for (const node of nodes) {
    if (node.parent !== undefined) children.get(node.parent)[node.side] = node;
  }
  const positions = new Map();
  const rows = [];
  const wrapAt = Math.min(150, Math.floor((preferredWidth - 2 * PAD - BRANCH_GAP) / 2));

  function arrange(node, depth) {
    const maxLine = Math.min(wrapAt - 2 * TEXT_PAD, textWidth(node.label, TEXT));
    const width = Math.max(86, Math.ceil(Math.max(maxLine, widestFormula(node.label, TEXT)) + 2 * TEXT_PAD));
    const pos = { x: 0, width, content: measure(node.label, width) };
    positions.set(node.id, pos);
    (rows[depth] ??= []).push(pos);
    const branches = children.get(node.id);
    const left = branches.left && arrange(branches.left, depth + 1);
    const right = branches.right && arrange(branches.right, depth + 1);
    // Keep sibling subtrees in separate horizontal space, so their wires cannot
    // cross. With just one child, still give the branch a clear left or right turn.
    const offset = Math.max(36, left && right ? (left.max - right.min + BRANCH_GAP) / 2 : 0);
    const subtree = { cards: [pos], min: -width / 2, max: width / 2 };
    for (const [child, shift] of [[left, -offset], [right, offset]]) {
      if (!child) continue;
      for (const card of child.cards) card.x += shift;
      subtree.cards.push(...child.cards);
      subtree.min = Math.min(subtree.min, child.min + shift);
      subtree.max = Math.max(subtree.max, child.max + shift);
    }
    return subtree;
  }

  const { min, max } = arrange(nodes.find(node => node.parent === undefined), 0);
  const width = Math.max(preferredWidth, Math.ceil(max - min + 2 * PAD));
  const shift = (width - (max - min)) / 2 - min;
  let y = PAD;
  for (const row of rows) {
    for (const pos of row) {
      pos.x += shift;
      pos.y = y;
    }
    y += Math.max(...row.map(pos => pos.content.height)) + ROW_GAP;
  }

  // The decision-tracer reference uses warm nodes and orthogonal sage wires.
  // Scope the approved dark ink to those light nodes so it also reads in dark mode.
  const wires = [], cards = [];
  for (const node of nodes) {
    const { x, y, width, content } = positions.get(node.id);
    if (node.parent !== undefined) {
      const parent = positions.get(node.parent);
      const elbow = y - ROW_GAP / 2;
      wires.push(cloneElement(connector([[parent.x, parent.y + parent.content.height], [parent.x, elbow],
        [x, elbow], [x, y]], { arrow: false }), { stroke: '#a9b89b', strokeWidth: 1.6 }));
    }
    const [background, ...labels] = card(x - width / 2, y, width, content);
    cards.push(cloneElement(background, { rx: 9, fill: '#fffefa', stroke: '#e3e7e0', strokeWidth: 1 }), ...labels);
  }
  return { width, height: y - ROW_GAP + PAD, elements: [...wires, h('g', { style: { '--color-ink': '#202723' } }, ...cards)] };
}

function tree(diagram, width) {
  if (diagram.layout === 'binary') return binaryTree(diagram, width);
  const children = new Map(diagram.nodes.map(node => [node.id, []]));
  for (const node of diagram.nodes) {
    if (node.parent !== undefined) children.get(node.parent).push(node);
  }
  const rows = [];
  function visit(node, depth) {
    rows.push({ node, depth });
    for (const child of children.get(node.id)) visit(child, depth + 1);
  }
  visit(diagram.nodes.find(node => node.parent === undefined), 0);
  const maxDepth = Math.max(...rows.map(row => row.depth));
  const indent = Math.min(24, (width - PAD * 2 - 140) / Math.max(1, maxDepth));
  const cards = [];
  const positions = new Map();
  let y = PAD;
  for (const { node, depth } of rows) {
    const x = PAD + depth * indent;
    const cellWidth = width - PAD - x;
    const content = measure(node.label, cellWidth);
    const role = depth === 0 ? 'process' : children.get(node.id).length ? 'slate' : 'outcome';
    positions.set(node.id, { x, top: y, bottom: y + content.height });
    cards.push(...card(x, y, cellWidth, content, { role, align: 'start' }));
    y += content.height + GAP;
  }
  const wires = [];
  for (const [id, siblings] of children) {
    if (siblings.length === 0) continue;
    const parent = positions.get(id);
    const spine = parent.x + 5;
    const centers = siblings.map(child => {
      const pos = positions.get(child.id);
      return { x: pos.x, y: (pos.top + pos.bottom) / 2 };
    });
    wires.push(connector([[spine, parent.bottom], [spine, centers.at(-1).y]], { arrow: false }));
    for (const child of centers) wires.push(connector([[spine, child.y], [child.x - 2, child.y]]));
  }
  return { width, height: y - GAP + PAD, elements: [...wires, ...cards] };
}

// A dedicated lane for each directed link keeps labels legible and preserves
// reciprocal or cross-column links without routing arrows through unrelated cards.
function linkRow(from, to, text, y, width, roles) {
  const usable = width - PAD * 2;
  // Owner 2026-11-08: the middle is sized to its label (at least LINK_MIN for the arrow), not a fixed third, so a short label leaves no wide empty gap;
  // a long label still gets at most the old third and wraps there.
  const widest = usable - 2 * Math.floor(usable * 0.34) - 12;
  const centerWidth = Math.min(widest, Math.max(LINK_MIN, text ? textWidth(text, SMALL) + 2 * TEXT_PAD : 0));
  const sideWidth = Math.floor((usable - centerWidth - 12) / 2);
  const wordTooWide = (value, space, size) => words(value).some(word => textWidth(word, size) > space);
  const labelAbove = !!text && (wordTooWide(text, centerWidth, SMALL) ||
    wordTooWide(from, sideWidth - 2 * TEXT_PAD, TEXT) || wordTooWide(to, sideWidth - 2 * TEXT_PAD, TEXT));
  const cellWidth = labelAbove ? Math.floor((usable - 30) / 2) : sideWidth;
  const right = width - PAD - cellWidth;
  const fromContent = measure(from, cellWidth);
  const toContent = measure(to, cellWidth);
  const lines = text ? wrap(text, labelAbove ? usable : centerWidth, SMALL) : [];
  const labelHeight = lines.length * lineHeight(SMALL);
  const labelSpace = labelAbove ? labelHeight + 6 : 0;
  const cardY = y + labelSpace;
  const height = Math.max(fromContent.height, toContent.height, labelAbove ? 0 : labelHeight + 22);
  const mid = cardY + height / 2;
  const labelY = labelAbove ? y + labelHeight / 2 : mid - 4;
  const arrowY = !labelAbove && lines.length ? mid + (labelHeight + 4) / 2 : mid;
  return { height: height + labelSpace, elements: [
    ...card(PAD, cardY, cellWidth, fromContent, { role: roles[0], height }),
    ...(lines.length ? [label(lines, width / 2, labelY, { size: SMALL })] : []),
    connector([[PAD + cellWidth + 3, arrowY], [right - 3, arrowY]]),
    ...card(right, cardY, cellWidth, toContent, { role: roles[1], height }),
  ] };
}

function relationship(diagram, width) {
  const names = new Map(diagram.nodes.map(node => [node.id, node.label]));
  const elements = [];
  let y = PAD;
  for (const { from, to, label: text } of diagram.edges) {
    const row = linkRow(names.get(from), names.get(to), text, y, width, ['slate', 'slate']);
    elements.push(...row.elements);
    y += row.height + GAP;
  }
  return { width, height: y - GAP + PAD, elements };
}

function transformation(diagram, width) {
  const { before, after, operation, links = [] } = diagram;
  const full = width - PAD * 2;
  const gutter = 30;
  const cellWidth = (full - gutter) / 2;
  const right = PAD + cellWidth + gutter;
  const operationContent = measure(operation, full);
  const elements = card(PAD, PAD, full, operationContent, { role: 'decision' });
  let y = PAD + operationContent.height + 14;
  const beforeHead = measure(before.label, cellWidth);
  const afterHead = measure(after.label, cellWidth);
  const headerHeight = Math.max(beforeHead.height, afterHead.height);
  elements.push(...card(PAD, y, cellWidth, beforeHead, { role: 'process', height: headerHeight }));
  elements.push(...card(right, y, cellWidth, afterHead, { role: 'outcome', height: headerHeight }));
  elements.push(connector([[PAD + cellWidth + 4, y + headerHeight / 2], [right - 4, y + headerHeight / 2]]));
  y += headerHeight + GAP;
  const rows = Math.max(before.items.length, after.items.length);
  for (let i = 0; i < rows; i++) {
    const cells = [before.items[i], after.items[i]].map(value => value === undefined ? null
      : measure(links.length ? `${i + 1}. ${value}` : value, cellWidth));
    const height = Math.max(...cells.map(cell => cell?.height || 0));
    if (cells[0]) elements.push(...card(PAD, y, cellWidth, cells[0], { height, align: 'start' }));
    if (cells[1]) elements.push(...card(right, y, cellWidth, cells[1], { height, align: 'start' }));
    y += height + GAP;
  }
  if (links.length) {
    elements.push(label('Item mappings', PAD, y + 10, { size: SMALL, anchor: 'start', weight: 700 }));
    y += 24;
    for (const link of links) {
      const row = linkRow(`Before ${link.from + 1}`, `After ${link.to + 1}`, link.label, y, width, ['process', 'outcome']);
      elements.push(...row.elements);
      y += row.height + GAP;
    }
  }
  return { width, height: y - GAP + PAD, elements };
}

function argument(diagram, width) {
  const { claim, support = [], objections = [], conclusion } = diagram;
  const full = width - PAD * 2;
  const claimContent = measure(claim, full);
  const resultContent = measure(conclusion, full);
  const top = PAD + claimContent.height;
  const lanes = [
    { title: 'Support', role: 'outcome', items: support },
    { title: 'Objections', role: 'rose', items: objections },
  ].filter(lane => lane.items.length);
  const cards = card(PAD, PAD, full, claimContent, { role: 'lavender' });
  const wires = [];
  const laneWidth = (full - GAP * (lanes.length - 1)) / lanes.length;
  const laneTop = top + 30;
  const sizes = lanes.map(lane => lane.items.map(item => measure(item.label, laneWidth - 16, item.source)));
  const headerHeight = 34;
  const laneHeight = Math.max(...sizes.map(contents => headerHeight + contents.reduce((sum, content) => sum + content.height + GAP, GAP)));
  const bottom = laneTop + laneHeight;
  const join = bottom + 13;
  const resultY = join + 16;
  for (const [i, lane] of lanes.entries()) {
    const x = PAD + i * (laneWidth + GAP);
    const center = x + laneWidth / 2;
    const title = measure(lane.title, laneWidth);
    cards.push(box(x, laneTop, laneWidth, laneHeight));
    cards.push(...card(x, laneTop, laneWidth, title, { role: lane.role, height: headerHeight }));
    let y = laneTop + headerHeight + GAP;
    for (const content of sizes[i]) {
      cards.push(...card(x + 8, y, laneWidth - 16, content, { align: 'start' }));
      y += content.height + GAP;
    }
    wires.push(connector([[width / 2, top], [width / 2, top + 12], [center, top + 12], [center, laneTop - 4]]));
    wires.push(connector([[center, bottom], [center, join], [width / 2, join]], { arrow: false }));
  }
  wires.push(connector([[width / 2, join], [width / 2, resultY - 4]]));

  cards.push(...card(PAD, resultY, full, resultContent, { role: 'outcome' }));
  return { width, height: resultY + resultContent.height + PAD, elements: [...wires, ...cards] };
}

export const teachingLayouts = Object.freeze({ tree, relationship, transformation, argument });
