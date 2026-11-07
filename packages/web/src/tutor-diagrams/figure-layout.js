import { createElement as h } from 'react';
import { box, connector, dot, INK, label, lineHeight, PALETTE, wrap } from './primitives.js';

const PAD = 14;
const BADGE_RADIUS = 9;
const VECTOR_LENGTH = 64;
const MIN_VECTOR_LENGTH = 8;

function ellipse(x, y, rx, ry, role) {
  return h('ellipse', { cx: x, cy: y, rx, ry, fill: PALETTE[role], stroke: INK, strokeWidth: 1.5 });
}

function landmarks(leaders) {
  const anchors = Object.fromEntries(Object.entries(leaders).map(([name, [, badgePoint]]) => [name, badgePoint]));
  return { anchors, leaders };
}

function cell(width) {
  const x = width / 2;
  return {
    height: 167,
    elements: [
      ellipse(x, 86, 100, 64, 'slate'),
      ellipse(x - 28, 80, 33, 25, 'lavender'),
      ellipse(x - 22, 86, 8, 8, 'rose'),
      ellipse(x + 43, 108, 27, 13, 'decision'),
      connector([[x + 24, 108], [x + 33, 103], [x + 43, 113], [x + 53, 103], [x + 62, 108]], { arrow: false }),
    ],
    ...landmarks({
      membrane: [[x + 86, 53], [x + 116, 36]],
      nucleus: [[x - 40, 72], [x - 115, 41]],
      cytoplasm: [[x - 28, 125], [x - 115, 138]],
      mitochondrion: [[x + 56, 108], [x + 116, 137]],
    }),
  };
}

function crossSection(width) {
  const left = (width - 218) / 2;
  return {
    height: 155,
    elements: [
      box(left, 23, 218, 33, { role: 'slate', radius: 0 }),
      box(left, 56, 218, 49, { role: 'lavender', radius: 0 }),
      box(left, 105, 218, 31, { role: 'slate', radius: 0 }),
      connector([[left + 8, 56], [left + 210, 56]], { arrow: false, dashed: true }),
    ],
    ...landmarks({
      'top-layer': [[left + 198, 39], [left + 238, 39]],
      core: [[left + 198, 82], [left + 238, 82]],
      'bottom-layer': [[left + 198, 120], [left + 238, 120]],
      interface: [[left + 39, 56], [left - 20, 56]],
    }),
  };
}

const DIRECTIONS = Object.freeze({
  up: [0, -1, '↑'], down: [0, 1, '↓'], left: [-1, 0, '←'], right: [1, 0, '→'],
});

function freeBody(width, vectors) {
  const x = width / 2;
  const y = 116;
  const halfWidth = 29;
  const halfHeight = 24;
  const anchors = { body: [x, y] };
  const leaders = {};
  const elements = [box(x - halfWidth, y - halfHeight, 2 * halfWidth, 2 * halfHeight, { role: 'process' })];
  const maximum = Math.max(...vectors.map(vector => vector.magnitude));
  let minimumShown = false;
  for (const { direction, magnitude } of vectors) {
    const [dx, dy] = DIRECTIONS[direction];
    const origin = [x + halfWidth * dx, y + halfHeight * dy];
    const proportionalLength = magnitude / maximum * VECTOR_LENGTH;
    const length = Math.max(MIN_VECTOR_LENGTH, proportionalLength);
    minimumShown ||= length > proportionalLength;
    const tip = [origin[0] + dx * length, origin[1] + dy * length];
    elements.push(h('g', { 'data-figure-vector': direction }, connector([origin, tip])));
    const badge = [tip[0] + 12 * dx + 14 * Math.abs(dy), tip[1] + 12 * dy + 14 * Math.abs(dx)];
    anchors[direction] = badge;
    leaders[direction] = [tip, badge];
  }
  return { height: 232, elements, anchors, leaders, minimumShown };
}

const FIGURES = Object.freeze({ cell, 'cross-section': crossSection, 'free-body': freeBody });

function badge(x, y, number) {
  return [dot(x, y, BADGE_RADIUS, 'decision'), label(String(number), x, y, { size: 12, tone: 'onFill', weight: 700 })];
}

export function layoutFigure(diagram, width) {
  const { figure, callouts, vectors = [], unit } = diagram;
  const pictogram = FIGURES[figure](width, vectors);
  const elements = [...pictogram.elements];
  let y = pictogram.height;

  for (const { direction, label: vectorLabel, magnitude } of vectors) {
    const lines = wrap(`${DIRECTIONS[direction][2]} ${vectorLabel} · ${magnitude}${unit ? ` ${unit}` : ''}`, width - 2 * PAD, 13);
    const height = lines.length * lineHeight(13);
    elements.push(label(lines, PAD, y + height / 2, { anchor: 'start', size: 13 }));
    y += height + 4;
  }
  if (pictogram.minimumShown) {
    const lines = wrap('Small forces use a minimum arrow length. Read the listed values for exact magnitudes.', width - 2 * PAD, 12);
    const height = lines.length * lineHeight(12);
    elements.push(label(lines, PAD, y + height / 2, { anchor: 'start', size: 12, tone: 'muted' }));
    y += height + 4;
  }
  if (vectors.length) y += 8;

  for (const [index, { anchor, label: title, detail }] of callouts.entries()) {
    const [anchorX, anchorY] = pictogram.anchors[anchor];
    const number = index + 1;
    const leader = pictogram.leaders?.[anchor];
    if (leader) elements.push(connector(leader, { arrow: false, dashed: true }), dot(...leader[0], 2.5, 'decision'));
    elements.push(h('g', { 'data-figure-anchor': anchor, 'data-figure-number': number }, ...badge(anchorX, anchorY, number)));

    const labelX = PAD + 32;
    const textWidth = width - labelX - PAD - 10;
    const titleLines = wrap(title, textWidth);
    const details = detail ? wrap(detail, textWidth, 13) : [];
    const titleHeight = titleLines.length * lineHeight();
    const detailHeight = details.length * lineHeight(13);
    const height = titleHeight + detailHeight + (details.length ? 19 : 15);
    elements.push(h('g', { 'data-figure-callout': anchor, 'data-figure-number': number },
      box(PAD, y, width - 2 * PAD, height),
      ...badge(PAD + 15, y + 16, number),
      label(titleLines, labelX, y + 7 + titleHeight / 2, { anchor: 'start', weight: 700 }),
      details.length ? label(details, labelX, y + 11 + titleHeight + detailHeight / 2, { anchor: 'start', size: 13, tone: 'muted' }) : null));
    y += height + 7;
  }
  return { width, height: y - 7 + PAD, elements };
}
