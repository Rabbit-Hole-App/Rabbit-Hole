import { cloneElement, createElement as h } from 'react';
import { blockStackStepLabel } from './block-stack-spec.js';
import { layoutFlow } from './flow.js';
import { connector, label, lineHeight, textWidth, widestFormula, wrap } from './primitives.js';
import { skipLanePoints, skipLaneX } from './skip-lanes.js';
import { TEACHING, teachingBox as box } from './teaching-theme.js';
import { tensorMinimumWidth } from './tensor-layout.js';

const PAD = 12;
const INSET = 10;
const SMALL = 12;
const NOTE = 13;
const MIN_BLOCK_WIDTH = 142;
const MIN_ROW_BLOCK_WIDTH = 72;
const PREFERRED_BLOCK_WIDTH = 234;
const BLOCK_GAP = 18;
const INPUT_GAP = 18;
const FORK_LANE = 12;
const NOTE_GAP = 18;
const ROW_GAP = 6;
const REPEAT_LANE = 50;
const JOIN_RADIUS = 10;
const BADGE_RADIUS = 9;
const STACK_PAINT = {
  norm: { fill: TEACHING.inset, stroke: TEACHING.line, strokeWidth: 1 },
  attention: { fill: TEACHING.blueSoft, stroke: TEACHING.line, strokeWidth: 1 },
  feedforward: { fill: TEACHING.warmSoft, stroke: TEACHING.line, strokeWidth: 1 },
  embedding: { fill: TEACHING.greenSoft, stroke: TEACHING.line, strokeWidth: 1 },
  output: { fill: TEACHING.greenSoft, stroke: TEACHING.green, strokeWidth: 1.5 },
  changed: { fill: TEACHING.blueSoft, stroke: TEACHING.blue, strokeWidth: 2 },
};

const paintBlock = (shape, role) => role ? cloneElement(shape, STACK_PAINT[role]) : shape;
const paintInsetStep = (shape, node) => paintBlock(shape, node.stackRole);

const repeatText = repeat => `×${repeat}`;
const lineBlock = (text, width, size = 14) => {
  const lines = wrap(text, width, size);
  return { lines, height: lines.length * lineHeight(size) };
};

function fullChild({ label: title, diagram }) {
  if (!diagram) return null;
  if (diagram.kind !== 'flow') return { ...diagram, title };
  const nodes = diagram.steps.map((step, index) => ({
    id: `step-${index + 1}`, label: blockStackStepLabel(step), role: 'process',
    stackRole: typeof step === 'string' ? undefined : step.role,
  }));
  const edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }));
  return { kind: 'flow', title, nodes, edges };
}

function childMinimumWidth(child) {
  if (!child) return 0;
  if (child.kind === 'tensor') return tensorMinimumWidth(child.tensor);
  if (child.kind === 'flow') return layoutFlow(child, 0).width;
  // Legacy layers reserve 12 pixels of scene padding and 14 of label padding per side.
  return 52 + Math.max(...child.layers.flatMap(({ label, detail }) => [widestFormula(label), widestFormula(detail, 13)]));
}

function metadata(block) {
  return [
    ['variant', block.variant], ['dims', block.dims],
    ['repeat', block.repeat && !block.repeatTo ? repeatText(block.repeat) : undefined],
    ['detail', block.detail ? `Visual ${block.detail}` : undefined],
  ].filter(([, text]) => text !== undefined);
}

function minimumBlockWidth(block, child) {
  return Math.ceil(2 * INSET + Math.max(
    widestFormula(block.label) + 2,
    ...metadata(block).map(([, text]) => widestFormula(text, SMALL) + 14),
    childMinimumWidth(child),
  ));
}

function rowMetrics(blocks) {
  const children = blocks.map(fullChild);
  const widths = blocks.map((block, index) => Math.max(MIN_ROW_BLOCK_WIDTH, minimumBlockWidth(block, children[index])));
  const width = widths.reduce((sum, tileWidth) => sum + tileWidth, 2 * PAD + (blocks.length - 1) * ROW_GAP);
  return { children, widths, width };
}

function horizontalMetrics({ blocks, edges = [], callouts = [] }) {
  const order = new Map(blocks.map(({ id }, index) => [id, index]));
  const groups = blocks.flatMap(({ id, repeat, repeatTo }, start) => repeatTo ? [{ id, repeat, repeatTo, start, end: order.get(repeatTo), lane: 0 }] : []);
  // Nested groups sit progressively farther from the blocks. Disjoint groups share a lane.
  for (const group of [...groups].reverse()) {
    group.lane = Math.max(0, ...groups.filter(other => group.start < other.start && other.end <= group.end).map(other => other.lane + 1));
  }
  const skipBand = edges.length ? skipLaneX(0, edges.length - 1) + 4 : 0;
  const rightBand = skipBand + (groups.length ? REPEAT_LANE * (1 + Math.max(...groups.map(group => group.lane))) : 0);
  const inputs = blocks.flatMap(block => block.inputs ?? []).map(input => input.label);
  const inputWidth = inputs.length ? Math.ceil(Math.max(62, ...inputs.map(text =>
    Math.max(widestFormula(text, SMALL) + 14, Math.min(112, textWidth(text, SMALL) + 14))))) : 0;
  const splitBand = blocks.some(block => block.merge && block.inputs?.length === 2) ? FORK_LANE : 0;
  const leftBand = inputWidth ? inputWidth + INPUT_GAP + splitBand : 0;
  const children = blocks.map(fullChild);
  const minBlockWidth = Math.max(MIN_BLOCK_WIDTH, ...blocks.map((block, index) => minimumBlockWidth(block, children[index])));
  const noteTextWidth = Math.max(0, ...callouts.flatMap(({ label, value }) => [widestFormula(label, NOTE) + 2, widestFormula(value, SMALL) + 14]));
  return { order, groups, skipBand, rightBand, leftBand, inputWidth, children, minBlockWidth,
    noteMinWidth: Math.ceil(Math.max(116, noteTextWidth)), ledgerMinWidth: Math.ceil(noteTextWidth + 2 * PAD + 46) };
}

export function blockStackNaturalWidth(diagram) {
  if (diagram.orientation === 'horizontal') return rowMetrics(diagram.blocks).width;
  const { minBlockWidth, leftBand, rightBand, noteMinWidth, ledgerMinWidth } = horizontalMetrics(diagram);
  const noteBand = diagram.callouts?.length ? Math.max(156, noteMinWidth) + NOTE_GAP : 0;
  return Math.min(960, Math.max(ledgerMinWidth, 2 * PAD + Math.max(PREFERRED_BLOCK_WIDTH, minBlockWidth) + leftBand + rightBand + noteBand));
}

function pill(text, width) {
  const { lines, height } = lineBlock(text, width - 14, SMALL);
  return { lines, height: height + 6, width: Math.ceil(Math.max(...lines.map(line => textWidth(line, SMALL))) + 14) };
}

function drawPill({ lines, height, width }, x, y, role = 'plain') {
  return [box(x, y, width, height, { role }), label(lines, x + width / 2, y + height / 2, {
    size: SMALL, weight: 700, fill: role === 'process' ? TEACHING.blue : undefined,
  })];
}

function blockContent(block, width, child) {
  const inner = width - 2 * INSET;
  const title = lineBlock(block.label, inner);
  const rows = [];
  for (const [key, text] of metadata(block)) {
    const tag = { key, ...pill(text, inner) };
    let row = rows.at(-1);
    if (!row || row.width + ROW_GAP + tag.width > inner) {
      row = { tags: [], width: -ROW_GAP, height: 0 };
      rows.push(row);
    }
    row.tags.push(tag);
    row.width += ROW_GAP + tag.width;
    row.height = Math.max(row.height, tag.height);
  }
  const height = 2 * INSET + title.height + rows.reduce((sum, row) => sum + ROW_GAP + row.height, 0) + (child ? ROW_GAP + child.height : 0);
  return { title, rows, child, height };
}

function numberedBadge(number, x, y) {
  return [h('circle', { cx: x, cy: y, r: BADGE_RADIUS, fill: TEACHING.blueSoft, stroke: TEACHING.blue, strokeWidth: 1.4 }),
    label(String(number), x, y, { size: SMALL, weight: 700 })];
}

function drawBlock(block, content, x, top, width, height, numbered) {
  const { title, rows, child } = content;
  const center = x + width / 2;
  const badgeHeight = numbered.length ? 2 * BADGE_RADIUS + ROW_GAP : 0;
  let y = top + INSET + (height - content.height - badgeHeight) / 2;
  const elements = [paintBlock(box(x, top, width, height), block.role),
    label(title.lines, center, y + title.height / 2, { weight: 700 })];
  y += title.height;
  for (const row of rows) {
    y += ROW_GAP;
    let tagX = center - row.width / 2;
    for (const tag of row.tags) {
      elements.push(h('g', { [`data-block-stack-${tag.key}`]: '' }, ...drawPill(tag, tagX, y + (row.height - tag.height) / 2)));
      tagX += tag.width + ROW_GAP;
    }
    y += row.height;
  }
  if (child) {
    y += ROW_GAP;
    elements.push(h('g', { transform: `translate(${center - child.width / 2} ${y})`, 'data-block-stack-child': block.diagram.kind }, ...child.elements));
    y += child.height;
  }
  numbered.forEach((note, index) => elements.push(h('g', { 'data-block-stack-callout-badge': note.number },
    ...numberedBadge(note.number, center + (index - (numbered.length - 1) / 2) * 24, y + ROW_GAP + BADGE_RADIUS))));
  return h('g', { 'data-block-stack-node': block.id }, ...elements);
}

function measureNotes(notes, width) {
  return notes.map(note => {
    const title = lineBlock(note.label, width, NOTE);
    const value = note.value ? pill(note.value, width) : null;
    return { ...note, title, value, height: title.height + (value ? 4 + value.height : 0) };
  });
}

function noteText(note, x, y) {
  return [label(note.title.lines, x, y + note.title.height / 2, { size: NOTE, anchor: 'start' }),
    note.value ? h('g', { 'data-block-stack-callout-value': '' }, ...drawPill(note.value, x, y + note.title.height + 4, 'process')) : null];
}

const groupHeight = items => items.length ? items.reduce((sum, item) => sum + item.height, ROW_GAP * (items.length - 1)) : 0;

function drawInputs(inputs, x, top, width, blockX, merge) {
  const elements = [];
  for (const [index, input] of inputs.entries()) {
    const y = top + input.height / 2;
    const start = [x + width, y];
    const end = merge ? [merge.x - JOIN_RADIUS + 1, merge.y + (index - (inputs.length - 1) / 2) * 9] : [blockX, y];
    const points = merge ? [start, [blockX - 4, y], end] : [start, end];
    elements.push(h('g', { 'data-block-stack-input-wire': '' }, connector(points)),
      h('g', { 'data-block-stack-input': '' }, box(x, top, width, input.height, { role: 'process' }),
        label(input.lines, x + width / 2, y, { size: SMALL })));
    top += input.height + ROW_GAP;
  }
  return elements;
}

function forkToInputs(inputs, x, top, center, bottom) {
  const forkX = x - FORK_LANE;
  const firstY = top + inputs[0].height / 2;
  const secondY = top + inputs[0].height + ROW_GAP + inputs[1].height / 2;
  return [
    h('g', { 'data-block-stack-input-fork': '' }, connector([[center, bottom], [center, bottom + 8],
      [forkX, bottom + 8], [forkX, secondY], [x, secondY]])),
    h('g', { 'data-block-stack-input-fork': '' }, connector([[forkX, firstY], [x, firstY]])),
    h('circle', { cx: forkX, cy: firstY, r: 2.4, fill: TEACHING.ink }),
  ];
}

function drawSideNotes(notes, top, side, x, width, blockX, blockRight) {
  const elements = [];
  for (const note of notes) {
    const y = top + note.title.height / 2;
    const [from, to] = side === 'left' ? [blockX, x + width + 5] : [blockRight, x - 5];
    const wire = cloneElement(connector([[from, y], [to, y]], { arrow: false, dashed: true }), { strokeDasharray: '2 4' });
    elements.push(h('g', { 'data-block-stack-callout-leader': note.number }, wire),
      h('g', { 'data-block-stack-callout': note.number }, ...noteText(note, x, top)));
    top += note.height + ROW_GAP;
  }
  return elements;
}

function drawJoin(operation, x, y) {
  return h('g', { 'data-block-stack-merge': operation },
    h('circle', { cx: x, cy: y, r: JOIN_RADIUS, fill: TEACHING.surface }),
    label(operation === 'multiply' ? '⊗' : '⊕', x, y, { size: 22, weight: 700 }));
}

function layoutBlockRow(blocks, preferredWidth, renderChild) {
  const { children, widths, width: rowWidth } = rowMetrics(blocks);
  const width = Math.max(preferredWidth, rowWidth);
  const measured = blocks.map((block, index) => {
    const child = children[index];
    return blockContent(block, widths[index], child ? renderChild(child, widths[index] - 2 * INSET) : null);
  });
  // Reserve the same heading height when a token's weight wraps onto a second line.
  const titleHeight = Math.max(...measured.map(content => content.title.height));
  const contents = measured.map(content => ({
    ...content,
    title: { ...content.title, height: titleHeight },
    height: content.height + titleHeight - content.title.height,
  }));
  const height = Math.max(40, ...contents.map(content => content.height));
  let x = (width - rowWidth) / 2 + PAD;
  const elements = blocks.map((block, index) => {
    const element = drawBlock(block, contents[index], x, PAD, widths[index], height, []);
    x += widths[index] + ROW_GAP;
    return element;
  });
  return { width, height: height + 2 * PAD, elements };
}

export function layoutBlockStack(diagram, preferredWidth, renderChild) {
  const { blocks, callouts = [] } = diagram;
  if (diagram.orientation === 'horizontal') return layoutBlockRow(blocks, preferredWidth, renderChild);
  const { order, groups, skipBand, rightBand, leftBand, inputWidth, children, minBlockWidth, noteMinWidth, ledgerMinWidth } = horizontalMetrics(diagram);
  const available = callouts.length && preferredWidth > 320
    ? Math.max(preferredWidth, blockStackNaturalWidth(diagram)) : preferredWidth;
  const fixed = 2 * PAD + leftBand + rightBand;
  const noteRoom = available - fixed - minBlockWidth - NOTE_GAP;
  const noteWidth = callouts.length && preferredWidth > 320 && noteRoom >= noteMinWidth ? Math.min(Math.max(156, noteMinWidth), noteRoom) : 0;
  const noteBand = noteWidth ? noteWidth + NOTE_GAP : 0;
  const side = rightBand ? 'left' : 'right';
  const requested = Math.max(minBlockWidth, Math.min(PREFERRED_BLOCK_WIDTH, available - fixed - noteBand));
  const childWidth = requested - 2 * INSET;
  const scenes = children.map(child => {
    if (!child) return null;
    return child.kind === 'flow' ? layoutFlow(child, childWidth, paintInsetStep) : renderChild(child, childWidth);
  });
  const blockWidth = Math.max(requested, ...scenes.map(scene => scene ? scene.width + 2 * INSET : 0));
  const occupied = fixed + blockWidth + noteBand;
  const width = Math.max(available, occupied, noteWidth ? 0 : ledgerMinWidth);
  // The minimized tile keeps its numbered list at normal size. A small
  // diagram overflow can fit by shrinking just the stack above the list.
  const displayWidth = preferredWidth === 320 && callouts.length && width <= 360 ? 320 : width;
  const scale = displayWidth / width;
  const left = (width - occupied) / 2 + PAD;
  const x = left + leftBand + (side === 'left' ? noteBand : 0);
  const right = x + blockWidth, center = x + blockWidth / 2;
  const inputX = x - INPUT_GAP - inputWidth;
  const noteX = side === 'left' ? left : right + NOTE_GAP;
  const notes = measureNotes(callouts.map((note, index) => ({ ...note, number: index + 1 })), noteWidth || displayWidth - 2 * PAD - 46);

  const edges = (diagram.edges ?? []).map(edge => ({ ...edge }));
  // The outer lanes leave earlier and join later when a fork or join is shared.
  const lanes = [...edges].sort((a, b) => order.get(b.from) - order.get(a.from) || order.get(a.to) - order.get(b.to));
  lanes.forEach((edge, index) => { edge.lane = index; });
  const wires = [], nodes = [], joins = [], annotations = [];
  const positions = new Map();
  let y = PAD, priorExit;
  for (const [index, block] of blocks.entries()) {
    const departures = lanes.filter(edge => edge.from === block.id).reverse();
    departures.forEach((edge, slot) => { edge.depart = y + 8 + 10 * slot; });
    const top = departures.length ? departures.at(-1).depart + 12 : y;
    if (priorExit !== undefined || departures.length) wires.push(connector([[center, priorExit ?? y], [center, top]]));

    const content = blockContent(block, blockWidth, scenes[index]);
    const inputs = (block.inputs ?? []).map(({ label }) => {
      const measured = lineBlock(label, inputWidth - 14, SMALL);
      return { ...measured, height: measured.height + 12 };
    });
    const inputHeight = groupHeight(inputs);
    const sideInputHeight = block.merge ? 0 : inputHeight;
    const blockNotes = notes.filter(note => note.node === block.id);
    const notesHeight = noteWidth ? groupHeight(blockNotes) : 0;
    const sharedLeft = side === 'left' && sideInputHeight && notesHeight;
    const sideHeight = sharedLeft ? sideInputHeight + ROW_GAP + notesHeight : Math.max(sideInputHeight, notesHeight);
    const badgeHeight = !noteWidth && blockNotes.length ? 2 * BADGE_RADIUS + ROW_GAP : 0;
    const height = Math.max(40, content.height + badgeHeight, sideHeight + 8);
    const bottom = top + height;
    const sideTop = top + (height - sideHeight) / 2;
    nodes.push(drawBlock(block, content, x, top, blockWidth, height, noteWidth ? [] : blockNotes));
    if (!block.merge) nodes.push(...drawInputs(inputs, inputX, sharedLeft ? sideTop : top + (height - inputHeight) / 2, inputWidth, x));
    if (noteWidth) annotations.push(...drawSideNotes(blockNotes, sharedLeft ? sideTop + sideInputHeight + ROW_GAP : top + (height - notesHeight) / 2,
      side, noteX, noteWidth, x, right));

    let exit = bottom, occupiedBottom = bottom;
    if (block.merge) {
      const split = inputs.length === 2;
      const joinY = bottom + Math.max(JOIN_RADIUS + 10, inputHeight / 2 + (split ? 18 : 6));
      const inputTop = joinY - inputHeight / 2;
      if (split) wires.push(...forkToInputs(inputs, inputX, inputTop, center, bottom));
      else wires.push(connector([[center, exit], [center, joinY - JOIN_RADIUS]]));
      joins.push(drawJoin(block.merge, center, joinY));
      nodes.push(...drawInputs(inputs, inputX, inputTop, inputWidth, x, { x: center, y: joinY }));
      occupiedBottom = inputTop + inputHeight;
      exit = joinY + JOIN_RADIUS;
    }
    for (const edge of lanes.filter(edge => edge.to === block.id)) {
      edge.arrive = exit + JOIN_RADIUS + 9;
      wires.push(connector([[center, exit], [center, edge.arrive - JOIN_RADIUS]]));
      joins.push(drawJoin(edge.merge ?? 'add', center, edge.arrive));
      exit = edge.arrive + JOIN_RADIUS;
    }
    priorExit = exit;
    occupiedBottom = Math.max(occupiedBottom, exit);
    positions.set(block.id, { top, bottom: occupiedBottom });
    y = occupiedBottom + BLOCK_GAP;
  }

  for (const edge of edges) {
    const start = [center, edge.depart], end = [center + JOIN_RADIUS - 1, edge.arrive];
    // With horizontal endpoints the outside-lane helper repeats both endpoint coordinates.
    const [, , out, back] = skipLanePoints(start, end, skipLaneX(right, edge.lane));
    wires.push(h('g', { 'data-block-stack-residual': `${edge.from}:${edge.to}` }, connector([start, out, back, end])),
      h('circle', { cx: center, cy: edge.depart, r: 2.4, fill: TEACHING.ink }));
  }
  const brackets = groups.map(group => {
    const bracketX = right + skipBand + (group.lane + 0.5) * REPEAT_LANE;
    const top = positions.get(group.id).top - 4, bottom = positions.get(group.repeatTo).bottom + 4;
    const count = pill(repeatText(group.repeat), REPEAT_LANE);
    return h('g', { 'data-block-stack-group': `${group.id}:${group.repeatTo}` },
      connector([[bracketX - 10, top], [bracketX, top], [bracketX, bottom], [bracketX - 10, bottom]], { arrow: false }),
      ...drawPill(count, bracketX - count.width / 2, (top + bottom - count.height) / 2));
  });
  const scene = [...brackets, ...wires, ...nodes, ...joins, ...annotations];
  const ledger = [];
  y = Math.ceil(y * scale);
  if (!noteWidth) for (const note of notes) {
    const height = Math.max(32, note.height + 14);
    ledger.push(h('g', { 'data-block-stack-callout-row': note.number }, box(PAD, y, displayWidth - 2 * PAD, height),
      ...numberedBadge(note.number, PAD + 17, y + 16), ...noteText(note, PAD + 34, y + 7)));
    y += height + ROW_GAP;
  }
  const height = y - (!noteWidth && notes.length ? ROW_GAP : BLOCK_GAP) + PAD;
  return { width: displayWidth, height, elements: [...(scale < 1 ? [h('g', { transform: `scale(${scale})` }, ...scene)] : scene), ...ledger] };
}
