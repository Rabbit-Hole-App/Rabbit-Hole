import { layoutFlow } from './flow.js';
import { createLayouts as statisticalLayouts } from './ml-statistical-layouts.js';
import { createLayouts as plotLayouts } from './ml-plot-layouts.js';
import { createLayouts as topologyLayouts } from './ml-topology-layouts.js';
import { createLayouts as dataLayouts } from './ml-data-layouts.js';
import { createLayouts as compositionLayouts } from './ml-composition-layouts.js';
import { balanceLayouts } from './balance-layouts.js';
import { layoutFigure } from './figure-layout.js';
import { box, connector, dot, label, lineHeight, wrap } from './primitives.js';
import { quantitativeLayouts } from './quantitative-layouts.js';
import { teachingLayouts } from './teaching-layouts.js';

const PAD = 12;
const TEXT = 14;
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

function timeline(diagram, width) {
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

function sequence(diagram, width) {
  const { actors, messages } = diagram;
  const grid = columnsFor(width, actors.length, 92, 16);
  const heads = actors.map(actor => wrap(actor.label, grid.cell - 14));
  const headerHeight = rowHeight(heads);
  const centers = new Map(actors.map((actor, index) => [actor.id, grid.xAt(index) + grid.cell / 2]));
  const elements = [];
  for (let index = 0; index < actors.length; index++) {
    elements.push(box(grid.xAt(index), PAD, grid.cell, headerHeight, { role: 'process' }));
    elements.push(label(heads[index], centers.get(actors[index].id), PAD + headerHeight / 2, { weight: 700, tone: 'onFill' }));
  }
  let y = PAD + headerHeight + 12;
  const annotations = [];
  for (const message of messages) {
    const from = centers.get(message.from);
    const to = centers.get(message.to);
    const lines = wrap(message.label, Math.abs(to - from) - 14, SMALL);
    const textHeight = lines.length * lineHeight(SMALL);
    const arrowY = y + textHeight + 5;
    annotations.push({ left: Math.min(from, to), right: Math.max(from, to), start: y, end: y + textHeight });
    elements.push(label(lines, (from + to) / 2, y + textHeight / 2, { size: SMALL }));
    elements.push(connector([[from, arrowY], [to, arrowY]]));
    y = arrowY + 16;
  }
  const lifelines = [];
  for (const x of centers.values()) {
    let top = PAD + headerHeight;
    const segment = end => connector([[x, top], [x, end]], { arrow: false, dashed: true });
    // Leave space for annotations on messages that cross an intermediate lifeline.
    for (const annotation of annotations) {
      if (x <= annotation.left || x >= annotation.right) continue;
      lifelines.push(segment(annotation.start));
      top = annotation.end;
    }
    lifelines.push(segment(y));
  }
  return { width: grid.width, height: y + PAD, elements: [...lifelines, ...elements] };
}

function matrix(diagram, width) {
  const grid = columnsFor(width, diagram.columns.length + 1, 72, 7);
  const elements = [];
  const headings = diagram.columns.map(heading => wrap(heading, grid.cell - 12));
  const headerHeight = rowHeight(headings);
  for (let index = 0; index < headings.length; index++) {
    const x = grid.xAt(index + 1);
    elements.push(box(x, PAD, grid.cell, headerHeight, { role: 'process' }));
    elements.push(label(headings[index], x + grid.cell / 2, PAD + headerHeight / 2, { weight: 700, tone: 'onFill' }));
  }
  let y = PAD + headerHeight + 7;
  for (const row of diagram.rows) {
    const cells = [row.heading, ...row.cells].map(cell => wrap(cell, grid.cell - 12));
    const height = rowHeight(cells);
    for (let index = 0; index < cells.length; index++) {
      const x = grid.xAt(index);
      const isHeading = index === 0;
      elements.push(box(x, y, grid.cell, height, { role: isHeading ? 'outcome' : 'plain' }));
      elements.push(label(cells[index], x + grid.cell / 2, y + height / 2,
        { weight: isHeading ? 700 : 400, tone: isHeading ? 'onFill' : 'ink' }));
    }
    y += height + 7;
  }
  return { width: grid.width, height: y - 7 + PAD, elements };
}

function layers(diagram, width) {
  const layerWidth = width - PAD * 2;
  const elements = [];
  let y = PAD;
  for (const [index, layer] of diagram.layers.entries()) {
    const title = wrap(layer.label, layerWidth - 28);
    const detail = layer.detail ? wrap(layer.detail, layerWidth - 28, SMALL) : [];
    const titleHeight = title.length * lineHeight(TEXT);
    const detailHeight = detail.length * lineHeight(SMALL);
    const height = Math.max(40, titleHeight + detailHeight + (detail.length ? 21 : 16));
    const x = width / 2;
    const textTop = y + (height - titleHeight - detailHeight - (detail.length ? 5 : 0)) / 2;
    elements.push(box(PAD, y, layerWidth, height, { role: HEADER_ROLES[index % HEADER_ROLES.length] }));
    elements.push(label(title, x, textTop + titleHeight / 2, { weight: 700, tone: 'onFill' }));
    if (detail.length) {
      elements.push(label(detail, x, textTop + titleHeight + 5 + detailHeight / 2, { size: SMALL, tone: 'onFill' }));
    }
    y += height + 7;
  }
  return { width, height: y - 7 + PAD, elements };
}

function cycle(diagram, width) {
  const nodeWidth = width - PAD * 2 - 35;
  const right = PAD + nodeWidth;
  const centerX = PAD + nodeWidth / 2;
  const outer = right + 25;
  const elements = [];
  const centers = [];
  let y = PAD;
  for (const step of diagram.steps) {
    const lines = wrap(step, nodeWidth - 24);
    const height = Math.max(40, rowHeight([lines]));
    if (centers.length) elements.push(connector([[centerX, y - 20], [centerX, y - 4]]));
    elements.push(box(PAD, y, nodeWidth, height, { role: 'process' }));
    elements.push(label(lines, centerX, y + height / 2, { weight: 700, tone: 'onFill' }));
    centers.push(y + height / 2);
    y += height + 20;
  }
  const start = centers[0];
  const end = centers.at(-1);
  elements.push(connector([[right, end], [outer, end], [outer, start], [right + 4, start]]));
  return { width, height: y - 20 + PAD, elements };
}

const legacy = Object.freeze({
  flow: layoutFlow, comparison, timeline, sequence, matrix, layers, cycle, figure: layoutFigure,
  ...teachingLayouts, ...quantitativeLayouts, ...balanceLayouts,
});

const renderChild = (diagram, width) => layouts[diagram.kind](diagram, width);
export const layouts = Object.freeze({
  ...legacy,
  ...statisticalLayouts({ legacy, renderChild }),
  ...plotLayouts({ legacy, renderChild }),
  ...topologyLayouts({ legacy, renderChild }),
  ...dataLayouts({ legacy, renderChild }),
  ...compositionLayouts({ legacy, renderChild }),
});
