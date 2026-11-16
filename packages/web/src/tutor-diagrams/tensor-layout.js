import { createElement as h } from 'react';
import { label, lineHeight, longestWordWidth, textWidth, wrap } from './primitives.js';
import { TEACHING, teachingBox, teachingConnector } from './teaching-theme.js';

const PAD = 12;
const STRIP_PAD = 6;
const CELL_HEIGHT = 26;
const ITEM_GAP = 16;
const TEXT = 14;
const SMALL = 12;
const VALUE = 13;

const roleColors = {
  input: [TEACHING.blueSoft, TEACHING.blue],
  weight: [TEACHING.warmSoft, TEACHING.warm],
  output: [TEACHING.greenSoft, TEACHING.green],
};

function stripMetrics({ columns, dimensions, name, values }) {
  const numbers = (values ?? []).map(String);
  const cellWidth = Math.max(24, Math.ceil(Math.max(0, ...numbers.map(value => textWidth(value, VALUE))) + 10));
  const gridWidth = columns * cellWidth;
  const nameWidth = name ? longestWordWidth(name, TEXT) : 0;
  const width = Math.ceil(Math.max(gridWidth, nameWidth, textWidth(dimensions, SMALL))) + 2 * STRIP_PAD;
  return { width, cellWidth, gridWidth, numbers };
}

export function tensorMinimumWidth(payload) {
  return stripMetrics(payload).width;
}

export function layoutTensorStrip(payload, preferredWidth = 0) {
  const { rows, columns, name, dimensions, role } = payload;
  const { width: minimumWidth, cellWidth, gridWidth, numbers } = stripMetrics(payload);
  const width = Math.max(preferredWidth, minimumWidth);
  const elements = [];
  let top = STRIP_PAD;
  if (name) {
    const lines = wrap(name, width - 2 * STRIP_PAD, TEXT);
    const height = lines.length * lineHeight(TEXT);
    elements.push(label(lines, width / 2, top + height / 2, { weight: 700 }));
    top += height + 5;
  }
  const [fill, stroke] = roleColors[role] ?? [TEACHING.inset, TEACHING.wire];
  const left = (width - gridWidth) / 2;
  for (let i = 0; i < rows * columns; i++) {
    const x = left + (i % columns) * cellWidth;
    const y = top + Math.floor(i / columns) * CELL_HEIGHT;
    elements.push(h('rect', { x, y, width: cellWidth, height: CELL_HEIGHT, fill, stroke, strokeWidth: 1,
      'data-tutor-tensor-cell': i }));
    if (numbers[i] !== undefined) elements.push(label(numbers[i], x + cellWidth / 2, y + CELL_HEIGHT / 2, { size: VALUE }));
  }
  const dimensionsTop = top + rows * CELL_HEIGHT + 5;
  const height = dimensionsTop + lineHeight(SMALL) + STRIP_PAD;
  elements.push(label(dimensions, width / 2, dimensionsTop + lineHeight(SMALL) / 2, { size: SMALL, tone: 'muted' }));
  return { width, height, elements };
}

export function layoutTensor(diagram, width) {
  return layoutTensorStrip(diagram.tensor, width);
}

function itemScene(item, role) {
  if (typeof item === 'string') {
    const width = Math.ceil(Math.max(72, Math.min(152, textWidth(item) + 2 * PAD), longestWordWidth(item) + 2 * PAD));
    const lines = wrap(item, width - 2 * PAD);
    const height = Math.max(38, lines.length * lineHeight() + 14);
    return { width, height, elements: [teachingBox(0, 0, width, height, { role }), label(lines, width / 2, height / 2)] };
  }
  const preferred = item.label ? Math.ceil(longestWordWidth(item.label)) + 2 * STRIP_PAD : 0;
  const scene = layoutTensorStrip(item.tensor, preferred);
  if (!item.label) return scene;
  const lines = wrap(item.label, scene.width - 2 * STRIP_PAD);
  const height = lines.length * lineHeight();
  return { width: scene.width, height: height + scene.height, elements: [
    label(lines, scene.width / 2, height / 2),
    h('g', { transform: `translate(0 ${height})` }, ...scene.elements),
  ] };
}

function section({ label: heading, items }, role) {
  const scenes = items.map(item => itemScene(item, role));
  const rowWidth = scenes.reduce((sum, scene) => sum + scene.width, (scenes.length - 1) * ITEM_GAP);
  const width = Math.max(rowWidth, Math.ceil(longestWordWidth(heading)) + 2 * STRIP_PAD);
  let x = (width - rowWidth) / 2;
  const positions = scenes.map(scene => {
    const position = { ...scene, x };
    x += scene.width + ITEM_GAP;
    return position;
  });
  return { width, lines: wrap(heading, width - 2 * STRIP_PAD), positions };
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

export function layoutTensorTransformation(diagram, preferredWidth = 0) {
  const { operation, links = [] } = diagram;
  const before = section(diagram.before, 'process');
  const after = section(diagram.after, 'outcome');
  const gap = Math.ceil(Math.max(36, ...links.map(({ label }) => label
    ? Math.max(longestWordWidth(label, SMALL), Math.min(132, textWidth(label, SMALL))) + 16 : 0)));
  const rowWidth = before.width + gap + after.width;
  const operationMinimum = Math.ceil(longestWordWidth(operation)) + 4 * PAD;
  const width = Math.max(preferredWidth, rowWidth + 2 * PAD, operationMinimum);
  const beforeX = (width - rowWidth) / 2;
  const afterX = beforeX + before.width + gap;

  const operationWidth = Math.min(width - 2 * PAD, Math.ceil(textWidth(operation)) + 2 * PAD);
  const operationLines = wrap(operation, operationWidth - 2 * PAD);
  const operationHeight = operationLines.length * lineHeight() + 14;
  const headingTop = PAD + operationHeight + 14;
  const headingHeight = Math.max(before.lines.length, after.lines.length) * lineHeight();
  const elements = [
    teachingBox((width - operationWidth) / 2, PAD, operationWidth, operationHeight, { role: 'decision' }),
    label(operationLines, width / 2, PAD + operationHeight / 2, { weight: 700 }),
    label(before.lines, beforeX + before.width / 2, headingTop + headingHeight / 2, { weight: 700 }),
    label(after.lines, afterX + after.width / 2, headingTop + headingHeight / 2, { weight: 700 }),
  ];

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

  for (const [side, offset, group] of [['before', beforeX, before], ['after', afterX, after]]) {
    group.positions.forEach((scene, index) => elements.push(h('g', {
      transform: `translate(${offset + scene.x} ${top})`, 'data-tutor-transformation-item': `${side}:${index}`,
    }, ...scene.elements)));
  }
  const height = top + Math.max(...[...before.positions, ...after.positions].map(scene => scene.height)) + PAD;
  return { width, height, elements };
}
