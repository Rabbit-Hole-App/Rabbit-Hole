import { cloneElement } from 'react';
import { FIGURE_BAND } from './contract.js';
import { renderTutorDiagram } from '../tutor-diagrams/TutorDiagram.js';
import { plotTicks } from '../tutor-diagrams/plot-ticks.js';
import { connector, label, lineHeight, textWidth } from '../tutor-diagrams/primitives.js';
import { TEACHING as T, TEACHING_SERIES, TEACHING_TEXT, teachingConnector } from '../tutor-diagrams/teaching-theme.js';

// The semantic figures of a program frame (contract.js: axis, plot, diagram) drawn the way the written card draws them, for the composed /interactive card only (AnimatedScene.jsx,
// interact mode; the /animation frame draws nothing for these types, and validateScene refuses them there). Tick placement is the written plots' own (plot-ticks.js), tick labels and
// titles use the written card's text classes (13 px and 14 px bold), lines and arrowheads are the written connector (primitives.js), series colours are TEACHING_SERIES.
// Pure of any scene state: a figure is drawn from its own spec, in frame coordinates, so it scales with the frame like every other object.

const TICK = TEACHING_TEXT.caption.size, TITLE = TEACHING_TEXT.heading.size, TICK_LEN = 5;
const titleOf = (name, unit) => (unit ? `${name} (${unit})` : name);
const tickHeight = ticks => Math.max(1, ...ticks.map(tick => tick.lines.length)) * lineHeight(TICK);
const fromValues = (values, position) => values.map(value => ({ at: position(value), lines: [String(value)], anchor: 'middle' }));

// A value to a position: min at `start`, max at `end` (the y direction is the caller's: pass the larger pixel first).
const linear = ({ min, max }, start, end) => value => start + ((value - min) / (max - min)) * (end - start);

export function AxisFigure({ spec, id }) {
  const { orientation, x0, y0, length, label: name, unit, min, max } = spec;
  const horizontal = orientation === 'x';
  const position = horizontal ? linear({ min, max }, x0, x0 + length) : linear({ min, max }, y0, y0 - length);
  const ticks = spec.ticks ? fromValues(spec.ticks, position) : plotTicks({ min, max }, position, { horizontal, labelWidth: FIGURE_BAND.y - TICK_LEN - 12 });
  const title = titleOf(name, unit);
  const parts = [connector(horizontal ? [[x0, y0], [x0 + length, y0]] : [[x0, y0], [x0, y0 - length]], { arrow: true })];
  for (const { at, lines, anchor } of ticks) {
    parts.push(connector(horizontal ? [[at, y0], [at, y0 + TICK_LEN]] : [[x0 - TICK_LEN, at], [x0, at]], { arrow: false }));
    parts.push(horizontal ? label(lines, at, y0 + TICK_LEN + 4 + tickHeight(ticks) / 2, { anchor, size: TICK })
      : label(lines, x0 - TICK_LEN - 4, at, { anchor: 'end', size: TICK }));
  }
  parts.push(horizontal ? label(title, x0 + length, y0 + TICK_LEN + 4 + tickHeight(ticks) + 14, { anchor: 'end', size: TITLE, weight: 700 })
    : label(title, x0 - FIGURE_BAND.y + 4, y0 - length - 18, { anchor: 'start', size: TITLE, weight: 700 }));
  return <g data-frame-figure="axis" data-axis={id} role="img" aria-label={`${title}, ${min} to ${max}`}>{parts.map((part, index) => cloneElement(part, { key: index }))}</g>;
}

// The plot area inside the plot box: room on the left for the widest y tick label, 22 px above for the y title (and a legend row when there is more than one series), room below for the
// tick labels and the x title.
export function plotArea({ x, y, w, h, axes, series }) {
  const yRange = axes.y, xRange = axes.x;
  const yLabels = [yRange.min, yRange.max].map(value => textWidth(String(value), TICK));
  const left = x + Math.max(40, Math.ceil(Math.max(...yLabels)) + 18);
  const top = y + (series.length > 1 ? 44 : 24);
  const right = x + w - 16;
  const bottom = y + h - (lineHeight(TICK) + 8 + 24);
  return { left, top, right, bottom, xRange, yRange };
}

const stepPoints = points => points.flatMap((point, index) => (index === 0 ? [point] : [[point[0], points[index - 1][1]], point]));

export function PlotFigure({ spec, box, id }) {
  const { axes, series } = spec;
  const { left, top, right, bottom } = plotArea({ ...box, axes, series });
  const px = linear(axes.x, left, right), py = linear(axes.y, bottom, top);
  const xTicks = plotTicks(axes.x, px, { horizontal: true }), yTicks = plotTicks(axes.y, py, { labelWidth: left - box.x - 12 });
  const xTitle = titleOf(axes.x.label, axes.x.unit), yTitle = titleOf(axes.y.label, axes.y.unit);
  const parts = [<rect key="area" x={left} y={top} width={right - left} height={bottom - top} fill={T.surface} stroke={T.line} strokeWidth="1" data-frame-plot-area="" />];
  xTicks.forEach(({ at }, index) => parts.push(cloneElement(teachingConnector([[at, top], [at, bottom]], { dashed: true }), { key: `gx${index}` })));
  yTicks.forEach(({ at, lines, anchor }, index) => {
    parts.push(cloneElement(teachingConnector([[left, at], [right, at]], { dashed: true }), { key: `gy${index}` }));
    parts.push(cloneElement(label(lines, left - 8, at, { anchor, size: TICK }), { key: `ty${index}` }));
  });
  const xHeight = tickHeight(xTicks);
  xTicks.forEach(({ at, lines, anchor }, index) => parts.push(cloneElement(label(lines, at, bottom + 8 + xHeight / 2, { anchor, size: TICK }), { key: `tx${index}` })));
  parts.push(cloneElement(label(xTitle, right, bottom + 8 + xHeight + 14, { anchor: 'end', size: TITLE, weight: 700 }), { key: 'xt' }));
  parts.push(cloneElement(label(yTitle, box.x + 4, box.y + 12, { anchor: 'start', size: TITLE, weight: 700 }), { key: 'yt' }));
  let legendRight = right;
  series.forEach((entry, index) => {
    const color = TEACHING_SERIES[index];
    const mapped = entry.points.map(point => [px(point.x), py(point.y)]);
    if (entry.kind === 'scatter') mapped.forEach(([cx, cy], dot) => parts.push(<circle key={`s${index}d${dot}`} cx={cx} cy={cy} r="5" fill={color} stroke={T.surface} strokeWidth="1.1" data-frame-series={entry.label} />));
    else parts.push(<polyline key={`s${index}`} points={(entry.kind === 'step' ? stepPoints(mapped) : mapped).map(point => point.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" data-frame-series={entry.label} />);
    // More than one series: a legend row above the plot area, right-aligned, each entry a colour swatch and its label.
    if (series.length > 1) {
      const width = textWidth(entry.label, TICK);
      legendRight -= width;
      parts.push(cloneElement(label(entry.label, legendRight, box.y + 34, { anchor: 'start', size: TICK }), { key: `lg${index}` }));
      parts.push(<line key={`lw${index}`} x1={legendRight - 22} x2={legendRight - 6} y1={box.y + 34} y2={box.y + 34} stroke={color} strokeWidth="3" strokeLinecap="round" />);
      legendRight -= 32;
    }
  });
  return <g data-frame-figure="plot" data-plot={id} role="img" aria-label={`${yTitle} against ${xTitle}`}>{parts}</g>;
}

// A written diagram drawn at the width the frame gave it, never larger than its own natural size, and scaled down (aspect kept) when the box leaves less height than it needs.
export function DiagramFigure({ spec, box, id }) {
  let rendered;
  try { rendered = renderTutorDiagram(spec, box.w); } catch { return null; } // parsed at the contract; a drawing failure shows nothing rather than a broken frame
  const scale = Math.min(1, box.w / rendered.width, box.h / rendered.height);
  const element = cloneElement(rendered.element, { x: box.x, y: box.y, width: rendered.width * scale, height: rendered.height * scale });
  return <g data-frame-figure="diagram" data-diagram={id}>{element}</g>;
}

// The one entry AnimatedScene.jsx calls for a figure-typed scene object; null for any other type.
export function FigureShape({ object }) {
  const box = { x: object.x, y: object.y, w: object.w, h: object.h };
  if (object.type === 'axis') return <AxisFigure spec={object.axisSpec} id={object.semanticId} />;
  if (object.type === 'plot') return <PlotFigure spec={object.plotSpec} box={box} id={object.semanticId} />;
  if (object.type === 'figure') return <DiagramFigure spec={object.diagramSpec} box={box} id={object.semanticId} />;
  return null;
}
