import { createElement as h } from 'react';
import { fitCaption, label, layoutCaption, lineHeight, wrap } from './primitives.js';
import { sharedPlotLabelSpace } from './ml-plot-layouts.js';
import { teachingBox as box, teachingConnector as connector } from './teaching-theme.js';

const PAD = 12;
const GAP = 20;
const MIN_CHILD_WIDTH = 320;
const TEXT = 14;
const SMALL = 13;

export function panelsNaturalWidth(widths) {
  return PAD * 2 + GAP * (widths.length - 1) + widths.length * Math.max(MIN_CHILD_WIDTH, ...widths);
}

function content(text, width, size = TEXT) {
  const lines = wrap(text, width - 20, size);
  return { lines, height: Math.max(34, lines.length * lineHeight(size) + 14) };
}

function panelScenes(panels, width, renderChild, sharedAxes) {
  const requested = Math.max(MIN_CHILD_WIDTH, (width - PAD * 2 - GAP * (panels.length - 1)) / panels.length);
  // Shared plots use the teaching layout with matched gutters.
  const children = panels.map(panel => sharedAxes?.length ? {
    ...panel.diagram,
    x: { ...panel.diagram.x, scale: panel.diagram.x.scale ?? 'linear' },
    y: { ...panel.diagram.y, scale: panel.diagram.y.scale ?? 'linear' },
  } : panel.diagram);
  const sharedLabelSpace = sharedAxes?.length ? sharedPlotLabelSpace(children) : undefined;
  const sceneFor = (child, childWidth) => fitCaption(renderChild(child, childWidth, {
    compact: child.kind === 'token-links', sharedLabelSpace,
  }), child.caption, 2 * PAD, SMALL);
  let scenes = children.map(child => sceneFor(child, requested));
  const stacked = PAD * 2 + GAP * (panels.length - 1) + scenes.reduce((sum, scene) => sum + scene.width, 0) > width;
  if (stacked) scenes = children.map(child => sceneFor(child, Math.max(MIN_CHILD_WIDTH, width - PAD * 2)));
  if (sharedAxes?.length) {
    const widest = Math.max(...scenes.map(scene => scene.width));
    if (scenes.some(scene => scene.width !== widest)) scenes = children.map(child => sceneFor(child, widest));
  }
  const prepared = scenes.map((scene, index) => {
    const panel = panels[index];
    const heading = content(panel.heading, scene.width);
    // A heading identical to the child's title already names that visual.
    const title = panel.diagram.title === panel.heading ? [] : wrap(panel.diagram.title, scene.width - 24, TEXT);
    const caption = layoutCaption(panel.diagram.caption, scene.width - 2 * PAD, SMALL);
    return { ...panel, scene, heading, title, caption };
  });
  return { panels: prepared, stacked };
}

function drawPanels({ panels, stacked }, top, elements, roles) {
  if (stacked) return drawStackedPanels(panels, top, elements, roles);
  const headerHeight = Math.max(...panels.map(panel => panel.heading.height));
  const titleHeight = Math.max(...panels.map(panel => panel.title.length * lineHeight(TEXT))) + 12;
  const childTop = top + headerHeight + 8 + titleHeight;
  const bodyHeight = Math.max(...panels.map(panel => panel.scene.height));
  const captionHeight = Math.max(...panels.map(panel => panel.caption.height));
  let x = PAD;
  const positions = [];
  panels.forEach((panel, index) => {
    const { scene, heading, title, caption } = panel;
    elements.push(box(x, top, scene.width, headerHeight, { role: roles[index] }));
    elements.push(label(heading.lines, x + scene.width / 2, top + headerHeight / 2, { weight: 700 }));
    if (title.length) elements.push(label(title, x + scene.width / 2, top + headerHeight + 8 + titleHeight / 2, { size: TEXT, weight: 700 }));
    elements.push(h('g', { transform: `translate(${x} ${childTop})`, 'data-tutor-composition-child': index }, ...scene.elements));
    if (caption.height) elements.push(caption.draw(x + scene.width / 2, childTop + bodyHeight + 8 + captionHeight / 2));
    positions.push({ x, top, width: scene.width, headerHeight, bottom: childTop + bodyHeight + (captionHeight ? captionHeight + 12 : 0) });
    x += scene.width + GAP;
  });
  return {
    width: x - GAP + PAD,
    bottom: childTop + bodyHeight + (captionHeight ? captionHeight + 12 : 0),
    positions,
  };
}

function drawStackedPanels(panels, top, elements, roles) {
  const width = Math.max(...panels.map(panel => panel.scene.width));
  const positions = [];
  let y = top;
  panels.forEach((panel, index) => {
    const { scene, heading, title, caption } = panel;
    const titleHeight = title.length * lineHeight(TEXT) + (title.length ? 12 : 0);
    const childTop = y + heading.height + 8 + titleHeight;
    elements.push(box(PAD, y, width, heading.height, { role: roles[index] }));
    elements.push(label(heading.lines, PAD + width / 2, y + heading.height / 2, { weight: 700 }));
    if (title.length) elements.push(label(title, PAD + width / 2, y + heading.height + 8 + titleHeight / 2, { size: TEXT, weight: 700 }));
    elements.push(h('g', { transform: `translate(${PAD + (width - scene.width) / 2} ${childTop})`, 'data-tutor-composition-child': index }, ...scene.elements));
    const captionHeight = caption.height;
    if (caption.height) elements.push(caption.draw(PAD + width / 2, childTop + scene.height + 8 + captionHeight / 2));
    const bottom = childTop + scene.height + (captionHeight ? captionHeight + 12 : 0);
    positions.push({ x: PAD, top: y, width, headerHeight: heading.height, bottom });
    y = bottom + 28;
  });
  return { width: width + PAD * 2, bottom: positions.at(-1).bottom, positions };
}

function visualComparison(diagram, width, renderChild) {
  const composition = panelScenes(diagram.panels, width, renderChild, diagram.sharedAxes);
  const elements = [];
  const frame = drawPanels(composition, PAD, elements, ['process', 'decision', 'outcome']);
  for (const panel of frame.positions.slice(0, -1)) {
    const points = composition.stacked
      ? [[PAD, panel.bottom + 14], [frame.width - PAD, panel.bottom + 14]]
      : [[panel.x + panel.width + GAP / 2, PAD + 2], [panel.x + panel.width + GAP / 2, frame.bottom]];
    elements.unshift(connector(points, { dashed: true }));
  }
  return { width: frame.width, height: frame.bottom + PAD, elements };
}

function visualTransformation(diagram, width, renderChild) {
  const composition = panelScenes([diagram.before, diagram.after].map(state => ({ heading: state.label, diagram: state.diagram })), width, renderChild);
  const { panels, stacked } = composition;
  const layoutWidth = PAD * 2 + (stacked ? Math.max(...panels.map(panel => panel.scene.width)) : panels.reduce((sum, panel) => sum + panel.scene.width, 0) + GAP);
  const full = layoutWidth - PAD * 2;
  const operation = content(diagram.operation, full);
  const elements = [box(PAD, PAD, full, operation.height, { role: 'decision' }),
    label(operation.lines, layoutWidth / 2, PAD + operation.height / 2, { weight: 700 })];
  const top = PAD + operation.height + 14;
  const frame = drawPanels(composition, top, elements, ['process', 'outcome']);
  const [first, second] = frame.positions;
  const arrow = stacked
    ? [[layoutWidth / 2, first.bottom + 4], [layoutWidth / 2, second.top - 4]]
    : [[first.x + first.width + 3, first.top + first.headerHeight / 2], [second.x - 3, second.top + second.headerHeight / 2]];
  elements.push(connector(arrow, { arrow: true }));
  let y = frame.bottom + 12;
  const note = content(diagram.identity.note, full, SMALL);
  elements.push(label(note.lines, PAD + 10, y + note.height / 2, { anchor: 'start', size: SMALL, tone: 'muted' }));
  y += note.height;
  for (const mapping of diagram.identity.mappings ?? []) {
    const text = `${mapping.from} → ${mapping.to}${mapping.note ? `: ${mapping.note}` : ''}`;
    const row = content(text, full, SMALL);
    elements.push(label(row.lines, PAD + 10, y + row.height / 2, { anchor: 'start', size: SMALL }));
    y += row.height;
  }
  return { width: frame.width, height: y + PAD, elements };
}

export function createLayouts({ legacy, renderChild }) {
  return {
    comparison: (diagram, width) => diagram.variant === 'panels' ? visualComparison(diagram, width, renderChild) : legacy.comparison(diagram, width),
    transformation: (diagram, width) => diagram.variant === 'visual' ? visualTransformation(diagram, width, renderChild) : legacy.transformation(diagram, width),
  };
}
