import { box, connector, label, lineHeight, textWidth, wrap } from './primitives.js';

const PAD = 12;
const GAP = 8;
const TEXT = 14;
const SMALL = 13;
const TEXT_PAD = 10;

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

function tree(diagram, width) {
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
  const sideWidth = Math.floor(usable * 0.34);
  const centerWidth = usable - 2 * sideWidth - 12;
  const wordTooWide = (value, space, size) => value.split(/\s+/u).some(word => textWidth(word, size) > space);
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
