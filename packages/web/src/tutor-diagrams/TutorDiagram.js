import { TEACHING, TEACHING_FONT, TEACHING_STYLE } from './teaching-theme.js';
import { LINES } from './theme/palette.js';
import { extendedTree, isDotTree } from './ml-topology-spec.js';
import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { layouts } from './layouts.js';
import { isExtendedPlot } from './ml-plot-spec.js';
import { fitCaption, label, layoutCaption, lineHeight, SURFACE, widestFormula, wrap } from './primitives.js';
import { describeTutorDiagram, dropGenericUnits, parseTutorDiagram } from './spec.js';
import { usesIllustrations } from './illustration-kinds.js';

const DEFAULT_WIDTH = 408;
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const CAPTION_SIZE = 13;
const CAPTION_GUTTER = 32;
const TITLE_STYLE = { size: 17, weight: 700 }; // the written card draws its title at TEACHING_TEXT.display (interact-style.test.mjs pins this line)

// kinds-fit: the kinds that take a box, sizes and legend/parts switches; every other kind ignores them and is drawn as always (its `min` is its drawn size).
const FITTED_KINDS = new Set(['coordinate-plot', 'token-links', 'bar-chart', 'heatmap', 'matrix', 'flow']);
// A bar chart is fitted in its plain and grouped forms (vertical bars) and a matrix in its plain layout; a stacked bar chart (a stacked series chart or one stacked bar) and a matrix with layout teaching are drawn as always: min is their drawn size, geometry null.
const isFitted = diagram => (FITTED_KINDS.has(diagram.kind) || isTopDownTree(diagram)) && !(diagram.kind === 'bar-chart' && diagram.variant === 'stacked') && !(diagram.kind === 'matrix' && diagram.layout === 'teaching');
// The kinds whose layout reports positions: `geometry` is an object for these (in the picture's coordinates, the title block counted) and null for every other kind.
const GEOMETRY_KINDS = new Set(['coordinate-plot', 'token-links', 'bar-chart', 'heatmap', 'matrix', 'flow']);
// A decision tree drawn top down (binary or hierarchy layout, with metadata or a path; the dot trees, the plain trees and the outline and dendrogram layouts keep today's drawing) is fitted and reports geometry.
const isTopDownTree = diagram => diagram.kind === 'tree' && !isDotTree(diagram) && extendedTree(diagram) && (diagram.layout === 'binary' || diagram.layout === 'hierarchy');

// parts.frame: false leaves out the outer card and the layout's own outer padding (every layout keeps PAD around its content: 12 px, the flow 14 px).
const FRAME_PAD = { flow: 14 };
const framePad = diagram => FRAME_PAD[diagram.kind] ?? 12;

// Moves every y of a geometry (a box, a point pair, a plot area) down by dy (the title block) and every x by dx (the padding left out by frame: false).
function shiftGeometry(node, dy, dx = 0) {
  if (Array.isArray(node)) return node.map(item => shiftGeometry(item, dy, dx));
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).map(([key, value]) => {
    if (typeof value === 'number') return [key, key === 'y' || key === 'top' || key === 'bottom' ? value + dy : key === 'x' || key === 'left' || key === 'right' ? value + dx : value];
    if (['points', 'from', 'to'].includes(key) && Array.isArray(value) && (typeof value[0] === 'number' || Array.isArray(value[0]))) {
      return [key, typeof value[0] === 'number' ? [value[0] + dx, value[1] + dy] : value.map(([px, py]) => [px + dx, py + dy])];
    }
    return [key, shiftGeometry(value, dy, dx)];
  }));
}

export function renderTutorDiagram(spec, availableWidth = DEFAULT_WIDTH, options = undefined) {
  const document = dropGenericUnits(parseTutorDiagram(spec));
  const { diagram } = document;
  const requested = Number.isFinite(availableWidth) ? Math.round(availableWidth) : DEFAULT_WIDTH;
  const illustration = usesIllustrations(diagram);
  const fit = options && typeof options === 'object' ? options : null;
  const fitted = fit !== null && isFitted(diagram);
  const boxed = fitted && Boolean(fit.box);
  const showTitle = fit?.parts?.title !== false, showCaption = fit?.parts?.caption !== false;
  // frame: false (fitted kinds only): no outer card and no outer padding; the picture is the layout cropped by fp on the sides, on top when there is no title and at the bottom when there is no caption.
  const fp = fitted && fit.parts?.frame === false ? framePad(diagram) : 0;
  const titleSize = fit?.sizes?.title ?? TITLE_STYLE.size, captionSize = fit?.sizes?.small ?? CAPTION_SIZE;
  // With a box, box.width is the width (availableWidth and the 320 to 720 clamp do not apply; the kind's own minimum does).
  const preferredWidth = boxed ? Math.max(1, Math.round(fit.box.width)) + 2 * fp : Math.max(MIN_WIDTH, Math.min(illustration ? 960 : MAX_WIDTH, requested));
  const blocks = width => {
    const title = showTitle ? wrap(diagram.title, width - 32, titleSize) : [];
    const titleHeight = showTitle ? title.length * lineHeight(titleSize) + 17 : 0;
    const caption = showCaption ? layoutCaption(diagram.caption, width - CAPTION_GUTTER, captionSize) : { height: 0 };
    return { title, titleHeight, caption, captionHeight: caption.height ? caption.height + 14 : 0 };
  };
  const call = (width, extra) => (fitted ? layouts[diagram.kind](diagram, width, { ...fit, ...extra }) : layouts[diagram.kind](diagram, width));
  const place = width => {
    const b = blocks(width), crops = (showTitle ? 0 : fp) + (b.captionHeight ? 0 : fp);
    const extra = boxed ? { contentHeight: Math.max(0, Math.round(fit.box.height) + crops - b.titleHeight - b.captionHeight) } : undefined;
    return fitCaption(call(width, extra), showCaption ? diagram.caption : undefined, CAPTION_GUTTER, captionSize);
  };
  let layout = place(preferredWidth);
  // The kind drew wider than the box (its minimum): ask again at that width so the title, caption and the rest of the box height are counted at the width drawn.
  if (boxed && layout.width !== preferredWidth) layout = place(layout.width);
  const teaching = illustration || isTeachingDiagram(diagram);
  const fullWidth = layout.width;
  const { title, titleHeight, caption, captionHeight } = blocks(fullWidth);
  const cropTop = showTitle ? 0 : fp, cropBottom = captionHeight ? 0 : fp;
  const fullHeight = titleHeight + layout.height + captionHeight;
  const width = fullWidth - 2 * fp, height = fullHeight - cropTop - cropBottom;
  const element = h('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: fp ? `${fp} ${cropTop} ${width} ${height}` : `0 0 ${width} ${height}`, role: 'img',
    'aria-label': describeTutorDiagram(document),
    fontFamily: teaching ? TEACHING_FONT : 'Arial, Liberation Sans, sans-serif',
    style: { display: 'block', maxWidth: 'none', marginInline: 'auto', ...(teaching ? TEACHING_STYLE : {}),
      // Panels of round-and-square trees sit on the palette's cream ground alone: no inset surface.
      ...(diagram.kind === 'panels' && diagram.panels.every(panel => isDotTree(panel.diagram)) ? { '--viz-surface': TEACHING.ground } : {}) },
    'data-tutor-diagram': diagram.kind,
  },
  h('title', null, diagram.title),
  fp ? null : h('rect', { x: 0.5, y: 0.5, width: width - 1, height: height - 1, rx: 12,
    fill: SURFACE, stroke: `var(--color-line, ${LINES.frame})` }),
  showTitle ? label(title, fullWidth / 2, titleHeight / 2 + 3, { ...TITLE_STYLE, size: titleSize }) : null,
  h('g', { transform: `translate(0 ${titleHeight})` }, ...layout.elements),
  caption.height ? caption.draw(fullWidth / 2, titleHeight + layout.height + captionHeight / 2 - 2) : null);
  const result = { width, height, element };
  // `min` and `geometry` are read on demand, so a caller that only draws pays nothing for them.
  // min.width: the narrowest width this spec can be drawn at with nothing overlapping (a box of width 1 asks the kind for its own minimum); min.height: the least height AT THE WIDTH DRAWN (a floor pass of the kind at that width),
  // each with the title and caption blocks counted. A kind that has not been fitted yet reports its drawn size.
  let min;
  Object.defineProperty(result, 'min', { enumerable: true, configurable: true, get() {
    if (min) return min;
    if (!isFitted(diagram)) return (min = { width, height });
    const floorLayout = at => layouts[diagram.kind](diagram, at, { ...(fit ?? {}), box: { width: at, height: 1 }, floor: true });
    const crops = cropTop + cropBottom;
    const captionMin = showCaption && diagram.caption ? Math.ceil(widestFormula(diagram.caption, captionSize)) + CAPTION_GUTTER : 0;
    const narrow = floorLayout(1), atWidth = floorLayout(fullWidth);
    const narrowest = Math.max(narrow.width, captionMin) - 2 * fp;
    const atDrawn = blocks(fullWidth);
    const total = atWidth.height + atDrawn.titleHeight + atDrawn.captionHeight - crops;
    min = { width: narrowest, height: Math.ceil(total) };
    // min.parts: what each px of min is made of, per axis (the parts of an axis add up to min.width / min.height). A layout lists its own parts; the title block, the caption block and the rounding up are added here.
    const sum = list => list.reduce((all, item) => all + item.px, 0);
    // frame: false: the padding left out is a negative part, so the parts still add up to min.
    const heights = [...(atDrawn.titleHeight ? [{ part: 'title', px: atDrawn.titleHeight }] : []), ...(atWidth.parts ?? []), ...(atDrawn.captionHeight ? [{ part: 'caption', px: atDrawn.captionHeight }] : []), ...(crops ? [{ part: 'outer padding left out (frame: false)', px: -crops }] : [])];
    const widths = [...(captionMin > narrow.width ? [{ part: 'caption (its widest formula)', px: captionMin }] : (narrow.widthParts ?? [])), ...(fp ? [{ part: 'outer padding left out (frame: false)', px: -2 * fp }] : [])];
    const round = (list, wanted) => (wanted - sum(list) > 1e-9 ? [...list, { part: 'rounding up', px: wanted - sum(list) }] : list);
    min.parts = [...round(heights, min.height).map(item => ({ axis: 'height', ...item })), ...round(widths, min.width).map(item => ({ axis: 'width', ...item }))];
    return min;
  } });
  Object.defineProperty(result, 'geometry', { enumerable: true, configurable: true, get() {
    return (GEOMETRY_KINDS.has(diagram.kind) || isTopDownTree(diagram)) && layout.geometry ? shiftGeometry(layout.geometry, titleHeight - cropTop, -fp) : null;
  } });
  return result;
}

// A diagram's natural size, measured without mounting (renderTutorDiagram runs the layout, title and caption exactly as the card draws them). Every layout asks for the
// room it needs (a dense flow, a tree, a long label is wider than `room`), so that is its natural width; one layout keeps a fixed height whatever the room and spends extra
// room only on width: the coordinate plot (a 240 px tall plot area). Drawn in `room` it is taller than wide, so it is measured once more at the width that makes it 4:3, capped at `cap`.
export function naturalSize(spec, room = DEFAULT_WIDTH, cap = MAX_WIDTH) {
  const first = renderTutorDiagram(spec, room);
  const wide = Math.ceil(first.height * 4 / 3);
  if (parseTutorDiagram(spec).diagram.kind !== 'coordinate-plot' || first.width >= wide || wide > cap) return { width: first.width, height: first.height };
  const second = renderTutorDiagram(spec, wide);
  return { width: second.width, height: second.height };
}

export default function TutorDiagram({ spec, fallback = null }) {
  const host = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(DEFAULT_WIDTH);
  const rendered = useMemo(() => {
    try { return renderTutorDiagram(spec, availableWidth); }
    catch { return null; }
  }, [spec, availableWidth]);
  const ready = rendered !== null;
  useEffect(() => {
    const node = host.current;
    if (!ready || !node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      if (width > 0) setAvailableWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);

  if (!rendered) return fallback;
  const scrolls = rendered.width > availableWidth;
  return h('div', {
    // The theme's colour variables on the container of EVERY diagram (the cream ground and the ink), so a diagram that is not a "teaching" kind (a plain bar chart, a flow) is not drawn on the app's dark surface in the dark theme.
    ref: host, style: { width: '100%', minWidth: 0, overflowX: 'auto', ...TEACHING_STYLE },
    tabIndex: scrolls ? 0 : undefined, role: scrolls ? 'region' : undefined,
    'aria-label': scrolls ? 'Scrollable diagram' : undefined,
  }, rendered.element);
}

function isTeachingDiagram(d) {
  if (['heatmap', 'sample-set', 'histogram', 'box-plot', 'panels'].includes(d.kind)) return true;
  if (['panels', 'visual', 'grouped', 'stacked'].includes(d.variant)) return true;
  if (['scaled-lanes', 'teaching', 'hierarchy', 'dendrogram', 'graph'].includes(d.layout)) return true;
  if (d.kind === 'tree') return d.highlightPath || d.nodes.some(n => n.edgeLabel || n.detail || n.count !== undefined || n.pruned);
  if (d.kind === 'flow') return d.nodes.some(n => n.role === 'fork' || n.role === 'merge');
  if (d.kind === 'coordinate-plot') return true;
  return isExtendedPlot(d);
}
