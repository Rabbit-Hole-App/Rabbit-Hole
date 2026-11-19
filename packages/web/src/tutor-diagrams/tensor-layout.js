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

// `sizes` (kinds-fit): { text (the name, 15 today), small (the dimensions, 13), value (the cell numbers, 15) }; without it every size is today's.
function stripMetrics({ columns, dimensions, name, values }, { text = TEXT, small = SMALL, value = VALUE } = {}) {
  const numbers = (values ?? []).map(String);
  const cellWidth = Math.max(36, Math.ceil(Math.max(0, ...numbers.map(number => textWidth(number, value))) + 12));
  const gridWidth = columns * cellWidth;
  const nameWidth = name ? longestWordWidth(name, text) : 0;
  const widest = Math.ceil(Math.max(gridWidth, nameWidth, textWidth(dimensions, small)));
  return { width: widest + 2 * STRIP_PAD, widest, cellWidth, gridWidth, numbers };
}

export function tensorMinimumWidth(payload) {
  return stripMetrics(payload).width;
}

// `reserve`: the least height the name block above the cells takes, so strips of one row whose names wrap differently still start their cells at one height (the name stands at the top of it).
export function layoutTensorStrip(payload, preferredWidth = 0, reserve = 0, fit = {}) {
  const { rows, columns, name, dimensions, role } = payload;
  const { text = TEXT, small = SMALL, value = VALUE, cellHeight = CELL_HEIGHT } = fit;
  const { width: minimumWidth, widest, cellWidth, gridWidth, numbers } = stripMetrics(payload, { text, small, value });
  const width = Math.max(preferredWidth, minimumWidth);
  const elements = [];
  let top = STRIP_PAD;
  let head = 0;
  if (name || reserve > 0) {
    const lines = name ? wrap(name, width - 2 * STRIP_PAD, text) : [];
    const height = lines.length * lineHeight(text);
    if (name) elements.push(label(lines, width / 2, top + height / 2, { weight: 600, ...(text !== TEXT ? { size: text } : {}) }));
    head = Math.max(height, reserve) + 5;
    top += head;
  }
  const [fill, stroke] = roleColors[role] ?? [TEACHING.blueFill, TEACHING.outline];
  const left = (width - gridWidth) / 2;
  const geometry = { cells: [] };
  for (let i = 0; i < rows * columns; i++) {
    const x = left + (i % columns) * cellWidth;
    const y = top + Math.floor(i / columns) * cellHeight;
    elements.push(h('rect', { x, y, width: cellWidth, height: cellHeight, rx: 4, fill, stroke, strokeWidth: 1.5,
      'data-tutor-tensor-cell': i }));
    if (numbers[i] !== undefined) elements.push(label(numbers[i], x + cellWidth / 2, y + cellHeight / 2, { size: value, weight: 600 }));
    geometry.cells.push({ index: i, row: Math.floor(i / columns), col: i % columns, x, y, width: cellWidth, height: cellHeight, ...(numbers[i] !== undefined ? { value: numbers[i] } : {}) });
  }
  const dimensionsTop = top + rows * cellHeight + 5;
  const height = dimensionsTop + lineHeight(small) + STRIP_PAD;
  elements.push(label(dimensions, width / 2, dimensionsTop + lineHeight(small) / 2, { size: small, tone: 'muted' }));
  const parts = [{ part: 'margins (top and bottom)', px: 2 * STRIP_PAD }, ...(head ? [{ part: 'name block', px: head }] : []), { part: 'cell rows', px: rows * cellHeight }, { part: 'gap and dimensions line', px: 5 + lineHeight(small) }];
  const widthParts = [{ part: 'margins', px: 2 * STRIP_PAD }, { part: 'cell grid, the name\'s longest word or the dimensions (the widest)', px: widest }, ...(width - minimumWidth > 1e-9 ? [{ part: 'spare width', px: width - minimumWidth }] : [])];
  return { width, height, elements, head, cells: top, geometry, parts, widthParts };
}

// kinds-fit: a tensor takes a box (the cell rows share the height that is left; the grid stays centred), sizes.body (the name and the cell numbers, 15 today) and sizes.small (the dimensions, 13 today) and reports each cell.
export function layoutTensor(diagram, width, options) {
  const { box: boxed, sizes, contentHeight, floor } = options && typeof options === 'object' ? options : {};
  if (!boxed && !sizes) return layoutTensorStrip(diagram.tensor, width);
  const fit = { text: sizes?.body ?? TEXT, small: sizes?.small ?? SMALL, value: sizes?.body ?? VALUE };
  const first = layoutTensorStrip(diagram.tensor, width, 0, fit);
  if (!boxed || floor || contentHeight === undefined) return first;
  const extra = Math.floor((contentHeight - first.height) / diagram.tensor.rows);
  return extra > 0 ? layoutTensorStrip(diagram.tensor, width, 0, { ...fit, cellHeight: CELL_HEIGHT + extra }) : first;
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

// The routes of a wrapped transformation's mapped links, stacked as lanes in the gap under the first row: a link's label sits above its lane at the free x nearest the middle of the run. The second row's heading
// stands above its row at the free x nearest its group's centre that the drops clear; if the drops leave no gap as wide as the heading, it stands first in the gap under the first row, where only the source stems cross it. Lanes are ordered to cross as few other routes as possible. shortcut: more than 6 lanes keep link order; a heading or label that finds no free x stays centred over its run.
function routeWrappedLinks(links, sourceX, targetX, sourceBottom, rowBottom, headingHeight, headingSpan, width) {
  const lanes = linkGroups(links).map(group => {
    const start = sourceX(group.from), targets = group.targets.map(index => ({ index, x: targetX(index) }));
    const xs = [start, ...targets.map(target => target.x)];
    const maxWidth = group.label ? Math.max(longestWordWidth(group.label, SMALL), Math.min(132, textWidth(group.label, SMALL))) : 0;
    const lines = group.label ? wrap(group.label, maxWidth, SMALL) : [];
    return { from: group.from, start, targets, lines, height: lines.length * lineHeight(SMALL), labelWidth: Math.max(0, ...lines.map(line => textWidth(line, SMALL))),
      sourceY: sourceBottom(group.from), low: Math.min(...xs), high: Math.max(...xs) };
  });
  // The free x nearest `want` for a span of `size` that no vertical in `blocked` crosses; a free x that touches `touch` ranks first.
  const place = (size, want, blocked, touch) => {
    const free = [];
    for (let c = Math.ceil(PAD + size / 2); c <= width - PAD - size / 2; c++) {
      if (!blocked.some(x => x > c - size / 2 - 6 && x < c + size / 2 + 6)) free.push(c);
    }
    const apart = c => touch ? Math.max(0, touch[0] - (c + size / 2), c - size / 2 - touch[1]) : 0;
    return free.sort((a, b) => apart(a) - apart(b) || Math.abs(a - want) - Math.abs(b - want))[0];
  };
  const inside = (x, lane) => x > lane.low + 1 && x < lane.high - 1;
  // crossings when `upper` runs above `lower`: the lower one's stem through the upper lane, the upper one's drops through the lower lane
  const crossings = (upper, lower) => +inside(lower.start, upper) + upper.targets.filter(target => inside(target.x, lower)).length;
  const order = array => array.length < 2 ? [array] : array.flatMap((item, i) => order([...array.slice(0, i), ...array.slice(i + 1)]).map(rest => [item, ...rest]));
  const cost = list => list.reduce((sum, upper, i) => sum + list.slice(i + 1).reduce((inner, lower) => inner + crossings(upper, lower), 0), 0);
  const ordered = lanes.length > 6 ? lanes : order(lanes).reduce((best, list) => cost(list) < cost(best) ? list : best);
  const headingLow = place(headingSpan, width / 2, lanes.flatMap(lane => lane.targets.map(target => target.x)));
  let cursor = rowBottom + 10 + (headingLow === undefined ? headingHeight + 6 : 0);
  for (const lane of ordered) {
    lane.y = cursor + (lane.height ? lane.height + 5 : 0) + 8;
    cursor = lane.y + 8;
  }
  const stemsAndDrops = (lane, bandTop) => ordered.flatMap(other => (other.y >= lane.y ? [other.start] : []).concat(other.y < bandTop ? other.targets.map(target => target.x) : []));
  for (const lane of ordered) if (lane.height) lane.labelX = place(lane.labelWidth, (lane.low + lane.high) / 2, stemsAndDrops(lane, lane.y - 5 - lane.height), [lane.low, lane.high]) ?? (lane.low + lane.high) / 2;
  if (headingLow !== undefined) return { lanes: ordered, headingX: headingLow, headingTop: cursor + 12, stripsTop2: cursor + 12 + headingHeight + 10 };
  const headingX = place(headingSpan, width / 2, ordered.map(lane => lane.start)) ?? width / 2;
  return { lanes: ordered, headingX, headingTop: rowBottom + 10, stripsTop2: cursor + 16 };
}

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
    if (links.length) {
      // Every mapped link keeps its arrow: down from the source's bottom edge, along a lane in the gap between the rows, down into the target's top edge.
      const routes = routeWrappedLinks(links, i => beforeX + before.positions[i].x + before.positions[i].width / 2, i => afterX + after.positions[i].x + after.positions[i].width / 2,
        i => stripsTop1 + before.positions[i].height, rowBottom, headingHeight,
        Math.max(...after.lines.map(line => Math.ceil(textWidth(line) * 1.06))), width);
      const { stripsTop2 } = routes;
      elements.push(label(after.lines, routes.headingX, routes.headingTop + headingHeight / 2, { weight: 700 }));
      place(after, 'after', afterX, stripsTop2);
      for (const lane of routes.lanes) {
        for (const x of lane.targets) {
          elements.push(h('g', { 'data-tutor-tensor-link': `${lane.from}:${x.index}` },
            wire([[lane.start, lane.sourceY], [lane.start, lane.y], [x.x, lane.y], [x.x, stripsTop2]], { active: true, width: 2.5 })));
        }
        if (lane.lines.length) elements.push(label(lane.lines, lane.labelX, lane.y - 5 - lane.height / 2, { size: SMALL }));
      }
      return { width, height: stripsTop2 + after.height + PAD, elements };
    }
    const gapY = rowBottom + 20;
    const headingTop2 = rowBottom + 40;
    const stripsTop2 = headingTop2 + headingHeight + 10;
    elements.push(label(after.lines, afterX + after.width / 2, headingTop2 + headingHeight / 2, { weight: 700 }));
    place(after, 'after', afterX, stripsTop2);
    // No mapping: one arrow leaves the end of the first row and enters the start of the second: right, down, left past the second group, down, right into it.
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
