import { createElement as h } from 'react';
import { label, lineHeight, longestWordWidth, textWidth, wire, wrap } from './primitives.js';
import { TEACHING, teachingBox, teachingConnector } from './teaching-theme.js';

const PAD = 12;
const STRIP_PAD = 6;
const CELL_HEIGHT = 36;
const ITEM_GAP = 16;
const TEXT = 15;
const SMALL = 13;
const VALUE = 15;

const roleColors = {
  input: [TEACHING.blueFill, TEACHING.outline],
  weight: [TEACHING.mustardFill, TEACHING.outline],
  output: [TEACHING.tealFill, TEACHING.outline],
};

// The width a row of tensor figures is held to: the card's 720 when it is asked for less (a narrow request), the request when it asks for more, never above 960. A row of groups wider than
// that wraps at group boundaries onto the next row; the cells keep their natural width (36 px, or the width of their text plus 12).
export const tensorRowBudget = preferredWidth => Math.min(960, Math.max(720, preferredWidth));

function stripMetrics({ columns, dimensions, name, values }) {
  const numbers = (values ?? []).map(String);
  const cellWidth = Math.max(36, Math.ceil(Math.max(0, ...numbers.map(value => textWidth(value, VALUE))) + 12));
  const gridWidth = columns * cellWidth;
  const nameWidth = name ? longestWordWidth(name, TEXT) : 0;
  const width = Math.ceil(Math.max(gridWidth, nameWidth, textWidth(dimensions, SMALL))) + 2 * STRIP_PAD;
  return { width, cellWidth, gridWidth, numbers };
}

export function tensorMinimumWidth(payload) {
  return stripMetrics(payload).width;
}

// `reserve`: the least height the name block above the cells takes, so strips of one row whose names wrap differently still start their cells at one height (the name stands at the top of it).
export function layoutTensorStrip(payload, preferredWidth = 0, reserve = 0) {
  const { rows, columns, name, dimensions, role } = payload;
  const { width: minimumWidth, cellWidth, gridWidth, numbers } = stripMetrics(payload);
  const width = Math.max(preferredWidth, minimumWidth);
  const elements = [];
  let top = STRIP_PAD;
  let head = 0;
  if (name || reserve > 0) {
    const lines = name ? wrap(name, width - 2 * STRIP_PAD, TEXT) : [];
    const height = lines.length * lineHeight(TEXT);
    if (name) elements.push(label(lines, width / 2, top + height / 2, { weight: 600 }));
    head = Math.max(height, reserve) + 5;
    top += head;
  }
  const [fill, stroke] = roleColors[role] ?? [TEACHING.blueFill, TEACHING.outline];
  const left = (width - gridWidth) / 2;
  for (let i = 0; i < rows * columns; i++) {
    const x = left + (i % columns) * cellWidth;
    const y = top + Math.floor(i / columns) * CELL_HEIGHT;
    elements.push(h('rect', { x, y, width: cellWidth, height: CELL_HEIGHT, rx: 4, fill, stroke, strokeWidth: 1.5,
      'data-tutor-tensor-cell': i }));
    if (numbers[i] !== undefined) elements.push(label(numbers[i], x + cellWidth / 2, y + CELL_HEIGHT / 2, { size: VALUE, weight: 600 }));
  }
  const dimensionsTop = top + rows * CELL_HEIGHT + 5;
  const height = dimensionsTop + lineHeight(SMALL) + STRIP_PAD;
  elements.push(label(dimensions, width / 2, dimensionsTop + lineHeight(SMALL) / 2, { size: SMALL, tone: 'muted' }));
  return { width, height, elements, head, cells: top };
}

export function layoutTensor(diagram, width) {
  return layoutTensorStrip(diagram.tensor, width);
}

// `rowHead`: the height every item of the row gives above its cells (the item's own label, the strip's name), so the cells of a row are top-aligned; 0 measures the item as it is (`head`).
function itemScene(item, role, rowHead = 0) {
  if (typeof item === 'string') {
    const width = Math.ceil(Math.max(72, Math.min(152, textWidth(item) + 2 * PAD), longestWordWidth(item) + 2 * PAD));
    const lines = wrap(item, width - 2 * PAD);
    const height = Math.max(38, lines.length * lineHeight() + 14);
    return { width, height, head: 0, cells: 0, elements: [teachingBox(0, 0, width, height, { role }), label(lines, width / 2, height / 2)] };
  }
  const preferred = item.label ? Math.ceil(longestWordWidth(item.label)) + 2 * STRIP_PAD : 0;
  const first = layoutTensorStrip(item.tensor, preferred);
  const lines = item.label ? wrap(item.label, first.width - 2 * STRIP_PAD) : [];
  const labelHeight = lines.length * lineHeight();
  const natural = labelHeight + first.head;
  const scene = rowHead > natural ? layoutTensorStrip(item.tensor, preferred, rowHead - labelHeight - 5) : first;
  if (!item.label) return { ...scene, head: natural };
  return { width: scene.width, height: labelHeight + scene.height, head: natural, cells: labelHeight + scene.cells, elements: [
    label(lines, scene.width / 2, labelHeight / 2),
    h('g', { transform: `translate(0 ${labelHeight})` }, ...scene.elements),
  ] };
}

// A group of items: one heading on one line, the items side by side and top-aligned.
function section({ label: heading, items }, role, rowHead = 0) {
  const scenes = items.map(item => itemScene(item, role, rowHead));
  const rowWidth = scenes.reduce((sum, scene) => sum + scene.width, (scenes.length - 1) * ITEM_GAP);
  const width = Math.max(rowWidth, Math.ceil(textWidth(heading) * 1.06) + 2 * STRIP_PAD);
  let x = (width - rowWidth) / 2;
  const positions = scenes.map(scene => {
    const position = { ...scene, x };
    x += scene.width + ITEM_GAP;
    return position;
  });
  return { width, lines: wrap(heading, width - 2 * STRIP_PAD), positions, head: Math.max(0, ...scenes.map(scene => scene.head)), height: Math.max(...scenes.map(scene => scene.height)) };
}

function linkGroups(links) {
  const groups = [];
  const unlabeled = new Map();
  for (const { from, to, label } of links) {
    if (label) {
      groups.push({ from, targets: [to], label });
      continue;
    }
    // Unlabeled links from one input share a rail and keep separate arrowheads.
    if (!unlabeled.has(from)) {
      const group = { from, targets: [] };
      unlabeled.set(from, group);
      groups.push(group);
    }
    unlabeled.get(from).targets.push(to);
  }
  return groups;
}

const WRAP_GUTTER = 18;

export function layoutTensorTransformation(diagram, preferredWidth = 0) {
  const { operation, links = [] } = diagram;
  const headOf = (group, role) => Math.max(0, ...group.items.map(item => itemScene(item, role).head));
  const rowHead = Math.max(headOf(diagram.before, 'process'), headOf(diagram.after, 'outcome'));
  let before = section(diagram.before, 'process', rowHead);
  let after = section(diagram.after, 'outcome', rowHead);
  const gap = Math.ceil(Math.max(36, ...links.map(({ label }) => label
    ? Math.max(longestWordWidth(label, SMALL), Math.min(132, textWidth(label, SMALL))) + 16 : 0)));
  const rowWidth = before.width + gap + after.width;
  // Past the row budget the second group wraps onto its own row; its cells are then top-aligned only within its own row.
  const wrapped = rowWidth + 2 * PAD > tensorRowBudget(preferredWidth);
  if (wrapped) {
    before = section(diagram.before, 'process', headOf(diagram.before, 'process'));
    after = section(diagram.after, 'outcome', headOf(diagram.after, 'outcome'));
  }
  const operationMinimum = Math.ceil(longestWordWidth(operation)) + 4 * PAD;
  const width = wrapped ? Math.max(preferredWidth, Math.max(before.width, after.width) + 2 * (PAD + WRAP_GUTTER), operationMinimum)
    : Math.max(preferredWidth, rowWidth + 2 * PAD, operationMinimum);

  const operationWidth = Math.min(width - 2 * PAD, Math.ceil(textWidth(operation)) + 2 * PAD);
  const operationLines = wrap(operation, operationWidth - 2 * PAD);
  const operationHeight = operationLines.length * lineHeight() + 14;
  const headingTop = PAD + operationHeight + 14;
  const headingHeight = Math.max(before.lines.length, after.lines.length) * lineHeight();
  const elements = [
    teachingBox((width - operationWidth) / 2, PAD, operationWidth, operationHeight, { role: 'decision' }),
    label(operationLines, width / 2, PAD + operationHeight / 2, { weight: 700 }),
  ];
  const place = (group, side, offset, top) => group.positions.forEach((scene, index) => elements.push(h('g', {
    transform: `translate(${offset + scene.x} ${top})`, 'data-tutor-transformation-item': `${side}:${index}`,
  }, ...scene.elements)));

  if (wrapped) {
    const beforeX = (width - before.width) / 2, afterX = (width - after.width) / 2;
    const stripsTop1 = headingTop + headingHeight + 10;
    elements.push(label(before.lines, beforeX + before.width / 2, headingTop + headingHeight / 2, { weight: 700 }));
    place(before, 'before', beforeX, stripsTop1);
    const rowBottom = stripsTop1 + before.height;
    const gapY = rowBottom + 20;
    const headingTop2 = rowBottom + 40;
    const stripsTop2 = headingTop2 + headingHeight + 10;
    elements.push(label(after.lines, afterX + after.width / 2, headingTop2 + headingHeight / 2, { weight: 700 }));
    place(after, 'after', afterX, stripsTop2);
    // One arrow leaves the end of the first row and enters the start of the second: right, down, left past the second group, down, right into it.
    const out = Math.min(width - PAD, Math.max(beforeX + before.width, afterX + after.width) + WRAP_GUTTER);
    const back = Math.max(PAD, Math.min(beforeX, afterX) - WRAP_GUTTER);
    const mid1 = stripsTop1 + before.head + CELL_HEIGHT / 2, mid2 = stripsTop2 + after.head + CELL_HEIGHT / 2;
    elements.push(wire([[beforeX + before.width + 4, mid1], [out, mid1], [out, gapY], [back, gapY], [back, mid2], [afterX - 4, mid2]], { active: true }));
    return { width, height: stripsTop2 + after.height + PAD, elements };
  }

  const beforeX = (width - rowWidth) / 2;
  const afterX = beforeX + before.width + gap;
  elements.push(label(before.lines, beforeX + before.width / 2, headingTop + headingHeight / 2, { weight: 700 }),
    label(after.lines, afterX + after.width / 2, headingTop + headingHeight / 2, { weight: 700 }));
  const center = (positions, index, offset) => offset + positions[index].x + positions[index].width / 2;
  let top = headingTop + headingHeight + 10;
  const rails = linkGroups(links).map(group => {
    const start = center(before.positions, group.from, beforeX);
    const targets = group.targets.map(index => ({ index, x: center(after.positions, index, afterX) }));
    const end = Math.max(...targets.map(target => target.x));
    const lines = group.label ? wrap(group.label, gap - 16, SMALL) : [];
    const height = lines.length * lineHeight(SMALL);
    const y = top + height + (height ? 5 : 0);
    top = y + 16;
    return { from: group.from, start, end, targets, lines, height, y };
  });

  for (const rail of rails) {
    elements.push(teachingConnector([[rail.start, top], [rail.start, rail.y], [rail.end, rail.y]], { active: true }));
    for (const target of rail.targets) {
      elements.push(h('g', { 'data-tutor-tensor-link': `${rail.from}:${target.index}` },
        teachingConnector([[target.x, rail.y], [target.x, top]], { active: true, arrow: true })));
    }
  }
  for (const rail of rails) {
    if (rail.height) elements.push(label(rail.lines, afterX - gap / 2, rail.y - 5 - rail.height / 2, { size: SMALL }));
  }
  if (!rails.length) {
    const y = top + 18;
    elements.push(teachingConnector([[beforeX + before.width + 4, y], [afterX - 4, y]], { active: true, arrow: true }));
  }

  place(before, 'before', beforeX, top);
  place(after, 'after', afterX, top);
  return { width, height: top + Math.max(before.height, after.height) + PAD, elements };
}
