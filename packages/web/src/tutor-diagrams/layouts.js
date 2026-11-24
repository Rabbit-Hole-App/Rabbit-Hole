import { fittedFlow, layoutFlow } from './flow.js';
import { createLayouts as statisticalLayouts } from './ml-statistical-layouts.js';
import { createLayouts as plotLayouts } from './ml-plot-layouts.js';
import { createLayouts as topologyLayouts } from './ml-topology-layouts.js';
import { createLayouts as dataLayouts } from './ml-data-layouts.js';
import { createLayouts as compositionLayouts } from './ml-composition-layouts.js';
import { balanceLayouts } from './balance-layouts.js';
import { layoutFigure } from './figure-layout.js';
import { cloneElement, createElement as h } from 'react';
import { backEdge, box, connector, dot, label, lineHeight, longestWordWidth, SURFACE, textWidth, wire, wrap, wrapShared } from './primitives.js';
import { TEACHING as T, TEACHING_GRID } from './teaching-theme.js';
import { quantitativeLayouts } from './quantitative-layouts.js';
import { tuplePieceWidth, tuplePlainText } from './matrix-tuple.js';
import { teachingLayouts } from './teaching-layouts.js';
import { usesTensorItems } from './illustration-kinds.js';
import { layoutTensor, layoutTensorTransformation } from './tensor-layout.js';
import { layoutTokenLinks } from './token-links-layout.js';
import { layoutBlockStack } from './block-stack-layout.js';

const PAD = 12;
const TEXT = 15;
const SMALL = 13;
const HEADER_ROLES = ['process', 'olive', 'coral', 'outcome'];

function rowHeight(cells, size = TEXT) {
  return Math.max(34, ...cells.map(lines => lines.length * lineHeight(size) + 14));
}

function columnsFor(width, count, minCell, gap) {
  const layoutWidth = Math.max(width, PAD * 2 + count * minCell + (count - 1) * gap);
  const cell = (layoutWidth - PAD * 2 - (count - 1) * gap) / count;
  return { width: layoutWidth, cell, xAt: index => PAD + index * (cell + gap) };
}

function comparison(diagram, width) {
  const { columns } = diagram;
  const grid = columnsFor(width, columns.length, 104, 10);
  const rows = Math.max(...columns.map(column => column.items.length));
  const headings = columns.map(column => wrap(column.heading, grid.cell - 14));
  const headerHeight = rowHeight(headings);
  const elements = [];
  for (let index = 0; index < columns.length; index++) {
    const x = grid.xAt(index);
    elements.push(box(x, PAD, grid.cell, headerHeight, { role: HEADER_ROLES[index] }));
    elements.push(label(headings[index], x + grid.cell / 2, PAD + headerHeight / 2, { weight: 700, tone: 'onFill' }));
  }
  let y = PAD + headerHeight + 8;
  for (let row = 0; row < rows; row++) {
    const cells = columns.map(column => column.items[row] === undefined ? [] : wrap(column.items[row], grid.cell - 14));
    const height = rowHeight(cells);
    for (let index = 0; index < columns.length; index++) {
      if (cells[index].length === 0) continue;
      const x = grid.xAt(index);
      elements.push(box(x, y, grid.cell, height));
      elements.push(label(cells[index], x + grid.cell / 2, y + height / 2));
    }
    y += height + 8;
  }
  const dividers = columns.slice(1).map((_, index) => {
    const x = grid.xAt(index + 1) - 5;
    return connector([[x, PAD + 2], [x, y - 8]], { arrow: false, dashed: true });
  });
  return { width: grid.width, height: y - 8 + PAD, elements: [...dividers, ...elements] };
}

// Numbered steps (every time a one- or two-digit number): a 28 px blue badge per step on a 1.5 px spine, the title and its detail on the ground beside it, "N steps" muted at the top right.
// Dates and words keep the pill form below.
function timelineSteps(diagram, width) {
  const BADGE = 28, textX = PAD + BADGE + 12, contentWidth = width - PAD - textX, rowGap = 16, headerHeight = 22;
  const step = lineHeight(TEXT), small = lineHeight(SMALL);
  const elements = [];
  const centres = [];
  let y = PAD + headerHeight;
  for (const event of diagram.events) {
    const title = wrap(event.label, contentWidth);
    const detail = event.detail ? wrap(event.detail, contentWidth, SMALL) : [];
    const centre = y + BADGE / 2;
    const titleTop = centre - step / 2;
    centres.push([PAD + BADGE / 2, centre]);
    elements.push(h('circle', { cx: PAD + BADGE / 2, cy: centre, r: BADGE / 2, fill: T.blueFill, stroke: T.outline, strokeWidth: 1.5 }));
    elements.push(label([event.time], PAD + BADGE / 2, centre, { weight: 700, tone: 'onFill' }));
    elements.push(label(title, textX, titleTop + title.length * step / 2, { anchor: 'start', weight: 700 }));
    const bottom = titleTop + title.length * step;
    if (detail.length) elements.push(label(detail, textX, bottom + 4 + detail.length * small / 2, { anchor: 'start', size: SMALL, tone: 'muted' }));
    y = Math.max(y + BADGE, bottom + (detail.length ? 4 + detail.length * small : 0)) + rowGap;
  }
  const spine = h('line', { x1: centres[0][0], y1: centres[0][1], x2: centres.at(-1)[0], y2: centres.at(-1)[1], stroke: T.outline, strokeWidth: 1.5 });
  const count = label([`${diagram.events.length} ${diagram.events.length === 1 ? 'step' : 'steps'}`], width - PAD, PAD + headerHeight / 2 - 2, { anchor: 'end', size: SMALL, tone: 'muted' });
  return { width, height: y - rowGap + PAD, elements: [count, spine, ...elements] };
}

function timeline(diagram, width) {
  if (diagram.events.every(event => /^[0-9]{1,2}$/.test(event.time))) return timelineSteps(diagram, width);
  const timeWidth = 80;
  const railX = PAD + timeWidth + 17;
  const contentX = railX + 16;
  const contentWidth = width - PAD - contentX;
  const elements = [];
  const marks = [];
  let y = PAD;
  for (const event of diagram.events) {
    const time = wrap(event.time, timeWidth - 12, SMALL);
    const title = wrap(event.label, contentWidth - 20);
    const detail = event.detail ? wrap(event.detail, contentWidth - 20, SMALL) : [];
    const timeHeight = rowHeight([time], SMALL);
    const textHeight = title.length * lineHeight(TEXT);
    const detailHeight = detail.length * lineHeight(SMALL);
    const contentHeight = textHeight + detailHeight + (detail.length ? 22 : 16);
    const height = Math.max(timeHeight, contentHeight);
    const center = y + height / 2;
    marks.push([railX, center]);
    elements.push(box(PAD, center - timeHeight / 2, timeWidth, timeHeight, { role: 'process', radius: 16 }));
    elements.push(label(time, PAD + timeWidth / 2, center, { size: SMALL, weight: 700, tone: 'onFill' }));
    elements.push(box(contentX, y, contentWidth, height));
    const top = center - (textHeight + detailHeight + (detail.length ? 6 : 0)) / 2;
    elements.push(label(title, contentX + 10, top + textHeight / 2, { anchor: 'start', weight: 700 }));
    if (detail.length) {
      elements.push(label(detail, contentX + 10, top + textHeight + 6 + detailHeight / 2, { anchor: 'start', size: SMALL, tone: 'muted' }));
    }
    y += height + 14;
  }
  const rail = connector([marks[0], marks.at(-1)], { arrow: false });
  return { width, height: y - 14 + PAD, elements: [rail, ...marks.map(([x, y]) => dot(x, y, 4)), ...elements] };
}

// Actor fills in order (the lanes are told apart by colour); more than eight cannot occur (the schema allows four).
const SEQUENCE_FILLS = [T.blueFill, T.tealFill, T.mustardFill, T.lavender, T.coral, T.olive, T.rose, T.slate];

function sequence(diagram, width) {
  const { actors, messages } = diagram;
  const grid = columnsFor(width, actors.length, 92, 16);
  const heads = actors.map(actor => wrap(actor.label, grid.cell - 20));
  const headerHeight = Math.max(48, rowHeight(heads));
  const centers = new Map(actors.map((actor, index) => [actor.id, grid.xAt(index) + grid.cell / 2]));
  const elements = [];
  for (let index = 0; index < actors.length; index++) {
    elements.push(cloneElement(box(grid.xAt(index), PAD, grid.cell, headerHeight, { radius: 10 }), { fill: SEQUENCE_FILLS[index], stroke: T.outline }));
    elements.push(label(heads[index], centers.get(actors[index].id), PAD + headerHeight / 2, { tone: 'onFill' }));
  }
  let y = PAD + headerHeight + 16;
  const annotations = [];
  // The message text stands ON its arrow in a ground-coloured gap (no box), centred between the two lifelines.
  const onArrow = (lines, cx, arrowY) => {
    const textHeight = lines.length * lineHeight(SMALL);
    const gap = Math.ceil(Math.max(...lines.map(line => textWidth(line, SMALL)))) + 12;
    return [h('rect', { x: cx - gap / 2, y: arrowY - textHeight / 2 - 2, width: gap, height: textHeight + 4, fill: SURFACE }),
      label(lines, cx, arrowY, { size: SMALL })];
  };
  for (const message of messages) {
    const from = centers.get(message.from);
    const to = centers.get(message.to);
    if (from === to) {
      const direction = from === centers.get(actors.at(-1).id) ? -1 : 1;
      const lines = wrap(message.label, Math.min(210, grid.cell + 2), SMALL);
      const textHeight = lines.length * lineHeight(SMALL);
      const loopX = from + 36 * direction;
      const arrowY = y + textHeight + 5;
      elements.push(label(lines, from + 7 * direction, y + textHeight / 2,
        { size: SMALL, anchor: direction === 1 ? 'start' : 'end' }));
      elements.push(wire([[from, arrowY], [loopX, arrowY], [loopX, arrowY + 20], [from, arrowY + 20]]));
      y = arrowY + 36;
      continue;
    }
    const lines = wrap(message.label, Math.abs(to - from) - 28, SMALL);
    const textHeight = lines.length * lineHeight(SMALL);
    const cx = (from + to) / 2;
    // shortcut: a label that needs more than one line stands above its arrow (a gap would eat the arrow); one line stands on it.
    if (lines.length > 1) {
      const arrowY = y + textHeight + 5;
      annotations.push({ left: Math.min(from, to), right: Math.max(from, to), start: y, end: y + textHeight });
      elements.push(label(lines, cx, y + textHeight / 2, { size: SMALL }), wire([[from, arrowY], [to, arrowY]]));
      y = arrowY + 18;
      continue;
    }
    const arrowY = y + textHeight / 2 + 4;
    const gap = Math.ceil(textWidth(lines[0], SMALL)) + 12;
    annotations.push({ left: cx - gap / 2, right: cx + gap / 2, start: arrowY - textHeight / 2 - 2, end: arrowY + textHeight / 2 + 2 });
    elements.push(wire([[from, arrowY], [to, arrowY]]), ...onArrow(lines, cx, arrowY));
    y = arrowY + textHeight / 2 + 18;
  }
  const lifelines = [];
  for (const x of centers.values()) {
    let top = PAD + headerHeight;
    const segment = end => h('line', { x1: x, x2: x, y1: top, y2: end, stroke: TEACHING_GRID, strokeWidth: 1.5, strokeDasharray: '4 4' });
    // The text gap of a message cuts a lifeline that runs through it.
    for (const annotation of annotations) {
      if (x <= annotation.left || x >= annotation.right) continue;
      lifelines.push(segment(annotation.start));
      top = annotation.end;
    }
    lifelines.push(segment(y));
  }
  return { width: grid.width, height: y + PAD, elements: [...lifelines, ...elements] };
}

// kinds-fit: a matrix takes a box (the rows share the height that is left), sizes.body for every text (15 today) and reports its cells; min is the natural size (rows at their text height).
function matrix(diagram, width, options) {
  const { box: boxed, sizes, contentHeight, floor } = options ?? {};
  const box_ = Boolean(boxed);
  const body = sizes?.body ?? TEXT;
  const build = rowExtra => {
    // A tuple cell is plain text that wraps at its comma: the column holds its widest piece (the other cells keep the 72 px minimum).
    const tupleCell = Math.ceil(Math.max(0, ...diagram.rows.flatMap(row => row.cells).map(cell => tuplePieceWidth(cell, text => textWidth(text, body))))) + 14;
    // A fitted call (a box or sizes): no text is drawn smaller than asked, so the column is at least as wide as its longest word at that size (+ the 12 px the text keeps clear); with no options the picture stays as it is today.
    const wordCell = box_ || sizes ? Math.ceil(Math.max(0, ...[...diagram.columns, ...diagram.rows.flatMap(row => [row.heading, ...row.cells])].map(cell => longestWordWidth(tuplePlainText(cell), body)))) + 12 : 0;
    const minCell = Math.max(72, tupleCell, wordCell);
    const grid = columnsFor(width, diagram.columns.length + 1, minCell, 7);
    const elements = [];
    const headings = wrapShared(diagram.columns, grid.cell - 12, body);
    const rowHeadings = wrapShared(diagram.rows.map(row => tuplePlainText(row.heading)), grid.cell - 12, body); // MAT-F: one size for every row heading
    const headerHeight = rowHeight(headings, body);
    const geometry = { cells: [], rowHeadings: [], columnHeadings: [] };
    for (let index = 0; index < headings.length; index++) {
      const x = grid.xAt(index + 1);
      elements.push(box(x, PAD, grid.cell, headerHeight, { role: 'process' }));
      elements.push(label(headings[index], x + grid.cell / 2, PAD + headerHeight / 2, { weight: 700, tone: 'onFill', size: body }));
      geometry.columnHeadings.push({ col: index, x, y: PAD, width: grid.cell, height: headerHeight });
    }
    let y = PAD + headerHeight + 7, rowsHeight = 0;
    diagram.rows.forEach((row, rowIndex) => {
      const cells = [rowHeadings[rowIndex], ...row.cells.map(cell => wrap(tuplePlainText(cell), grid.cell - 12, body))];
      const height = rowHeight(cells, body) + rowExtra(rowIndex);
      for (let index = 0; index < cells.length; index++) {
        const x = grid.xAt(index);
        const isHeading = index === 0;
        elements.push(box(x, y, grid.cell, height, { role: isHeading ? 'outcome' : 'plain' }));
        elements.push(label(cells[index], x + grid.cell / 2, y + height / 2,
          { weight: isHeading ? 700 : 400, tone: isHeading ? 'onFill' : 'ink', size: body }));
        if (isHeading) geometry.rowHeadings.push({ row: rowIndex, x, y, width: grid.cell, height });
        else geometry.cells.push({ row: rowIndex, col: index - 1, x, y, width: grid.cell, height });
      }
      rowsHeight += height;
      y += height + 7;
    });
    const count = diagram.columns.length + 1;
    const parts = [{ part: 'outer margins', px: 2 * PAD }, { part: 'column headings', px: headerHeight }, { part: 'rows', px: rowsHeight }, { part: 'gaps between the rows', px: 7 * diagram.rows.length }];
    const cellsWidth = grid.width - 2 * PAD - (count - 1) * 7;
    const widthParts = [{ part: 'margins', px: 2 * PAD }, { part: 'columns (the widest tuple piece or longest word, at least 72)', px: count * minCell }, { part: 'gaps between the columns', px: (count - 1) * 7 },
      ...(cellsWidth - count * minCell > 1e-9 ? [{ part: 'spare width', px: cellsWidth - count * minCell }] : [])];
    return { width: grid.width, height: y - 7 + PAD, parts, widthParts, elements, geometry };
  };
  const first = build(() => 0);
  if (!boxed || floor || contentHeight === undefined) return first;
  const extra = Math.floor(contentHeight - first.height), n = diagram.rows.length;
  return extra > 0 ? build(i => Math.floor(extra / n) + (i < extra % n ? 1 : 0)) : first;
}

// kinds-fit: layers take a box (the layers share the height that is left), sizes.body (the layer's title, 15 today) and sizes.small (its detail, 13 today) and report each layer; min is the natural size.
function layers(diagram, width, options) {
  const { box: boxed, sizes, contentHeight, floor } = options ?? {};
  const body = sizes?.body ?? TEXT, small = sizes?.small ?? SMALL;
  // A fitted call (a box or sizes): no text is drawn smaller than asked, so a layer is at least as wide as its longest word at that size (+ the 28 px its text keeps clear); with no options the picture stays as it is today.
  const wordWidth = boxed || sizes ? Math.ceil(Math.max(0, ...diagram.layers.flatMap(layer => [longestWordWidth(layer.label, body), layer.detail ? longestWordWidth(layer.detail, small) : 0]))) + 28 : 0;
  const total = boxed || sizes ? Math.max(width, wordWidth + PAD * 2) : width;
  const layerWidth = total - PAD * 2;
  const build = extraAt => {
    const elements = [], geometry = { layers: [] };
    let y = PAD, heights = 0;
    for (const [index, layer] of diagram.layers.entries()) {
      const title = wrap(layer.label, layerWidth - 28, body);
      const detail = layer.detail ? wrap(layer.detail, layerWidth - 28, small) : [];
      const titleHeight = title.length * lineHeight(body);
      const detailHeight = detail.length * lineHeight(small);
      const height = Math.max(40, titleHeight + detailHeight + (detail.length ? 21 : 16)) + extraAt(index);
      const x = total / 2;
      const textTop = y + (height - titleHeight - detailHeight - (detail.length ? 5 : 0)) / 2;
      elements.push(box(PAD, y, layerWidth, height, { role: HEADER_ROLES[index % HEADER_ROLES.length] }));
      elements.push(label(title, x, textTop + titleHeight / 2, { weight: 700, tone: 'onFill', ...(sizes?.body ? { size: body } : {}) }));
      if (detail.length) {
        elements.push(label(detail, x, textTop + titleHeight + 5 + detailHeight / 2, { size: small, tone: 'onFill' }));
      }
      geometry.layers.push({ index, x: PAD, y, width: layerWidth, height });
      heights += height;
      y += height + 7;
    }
    const parts = [{ part: 'outer margins', px: 2 * PAD }, { part: 'layers (their text at its size)', px: heights }, { part: 'gaps between the layers', px: 7 * (diagram.layers.length - 1) }];
    const widthParts = [{ part: 'margins', px: 2 * PAD }, { part: 'layer (its longest word at its size, + 28)', px: wordWidth }, ...(total - 2 * PAD - wordWidth > 1e-9 ? [{ part: 'spare width', px: total - 2 * PAD - wordWidth }] : [])];
    return { width: total, height: y - 7 + PAD, parts, widthParts, elements, geometry };
  };
  const first = build(() => 0);
  if (!boxed || floor || contentHeight === undefined) return first;
  const extra = Math.floor(contentHeight - first.height), n = diagram.layers.length;
  return extra > 0 ? build(i => Math.floor(extra / n) + (i < extra % n ? 1 : 0)) : first;
}

// The steps are process nodes of the flow's size (56 high for one line, 72 for two, 24 px padding, at least 180 wide), one under the other, joined by arrows; the return
// edge runs up the right side with rounded corners and re-enters the first step from the right, its label on the vertical run.
const LOOP_LABEL = 'repeat';
function cycle(diagram, width) {
  const nodeWidth = Math.max(180, Math.min(260, width - 2 * PAD - 160));
  const loopWidth = Math.ceil(textWidth(LOOP_LABEL, SMALL)) + 12;
  const total = Math.max(width, nodeWidth + 2 * (40 + loopWidth / 2 + PAD));
  const left = (total - nodeWidth) / 2, right = left + nodeWidth, centerX = left + nodeWidth / 2, laneX = right + 40;
  const elements = [];
  const centers = [];
  let y = PAD;
  for (const step of diagram.steps) {
    const lines = wrap(step, nodeWidth - 48);
    const height = 40 + 16 * lines.length;
    if (centers.length) elements.push(wire([[centerX, y - 44], [centerX, y]]));
    elements.push(box(left, y, nodeWidth, height, { role: 'process', radius: 9 }));
    elements.push(label(lines, centerX, y + height / 2, { tone: 'onFill' }));
    centers.push(y + height / 2);
    y += height + 44;
  }
  const start = centers[0], end = centers.at(-1);
  elements.push(backEdge([right, end], [right, start], laneX));
  const middle = (start + end) / 2, textHeight = lineHeight(SMALL);
  elements.push(h('rect', { x: laneX - loopWidth / 2, y: middle - textHeight / 2 - 2, width: loopWidth, height: textHeight + 4, fill: SURFACE }),
    label(LOOP_LABEL, laneX, middle, { size: SMALL }));
  return { width: total, height: y - 44 + PAD, elements };
}

const legacy = Object.freeze({
  flow: (diagram, width, options) => (typeof options === 'function' ? layoutFlow(diagram, width, options) : fittedFlow(diagram, width, options)), comparison, timeline, sequence, matrix, layers, cycle, figure: layoutFigure,
  ...teachingLayouts, ...quantitativeLayouts, ...balanceLayouts,
  transformation: (diagram, width) => usesTensorItems(diagram)
    ? layoutTensorTransformation(diagram, width) : teachingLayouts.transformation(diagram, width),
});

const renderChild = (diagram, width, options) => layouts[diagram.kind](diagram, width, options);
export const layouts = Object.freeze({
  ...legacy,
  ...statisticalLayouts({ legacy, renderChild }),
  ...plotLayouts({ legacy, renderChild }),
  ...topologyLayouts({ legacy, renderChild }),
  ...dataLayouts({ legacy, renderChild }),
  ...compositionLayouts({ legacy, renderChild }),
  tensor: layoutTensor,
  'token-links': layoutTokenLinks,
  'block-stack': (diagram, width) => layoutBlockStack(diagram, width, renderChild),
});
