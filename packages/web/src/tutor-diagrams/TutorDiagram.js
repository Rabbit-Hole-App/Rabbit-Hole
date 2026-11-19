import { TEACHING, TEACHING_FONT, TEACHING_STYLE } from './teaching-theme.js';
import { LINES } from './theme/palette.js';
import { isDotTree } from './ml-topology-spec.js';
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
const FITTED_KINDS = new Set(['coordinate-plot', 'token-links']);
// The kinds whose layout reports positions: `geometry` is an object for these (in the picture's coordinates, the title block counted) and null for every other kind.
const GEOMETRY_KINDS = new Set(['coordinate-plot', 'token-links', 'flow']);

// Moves every y of a geometry (a box, a point pair, a plot area) down by the title block.
function shiftGeometry(node, dy) {
  if (Array.isArray(node)) return node.map(item => shiftGeometry(item, dy));
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).map(([key, value]) => {
    if (typeof value === 'number') return [key, key === 'y' || key === 'top' || key === 'bottom' ? value + dy : value];
    if (['points', 'from', 'to'].includes(key) && Array.isArray(value) && (typeof value[0] === 'number' || Array.isArray(value[0]))) {
      return [key, typeof value[0] === 'number' ? [value[0], value[1] + dy] : value.map(([px, py]) => [px, py + dy])];
    }
    return [key, shiftGeometry(value, dy)];
  }));
}

export function renderTutorDiagram(spec, availableWidth = DEFAULT_WIDTH, options = undefined) {
  const document = dropGenericUnits(parseTutorDiagram(spec));
  const { diagram } = document;
  const requested = Number.isFinite(availableWidth) ? Math.round(availableWidth) : DEFAULT_WIDTH;
  const illustration = usesIllustrations(diagram);
  const fit = options && typeof options === 'object' ? options : null;
  const fitted = fit !== null && FITTED_KINDS.has(diagram.kind);
  const boxed = fitted && Boolean(fit.box);
  const showTitle = fit?.parts?.title !== false, showCaption = fit?.parts?.caption !== false;
  const titleSize = fit?.sizes?.title ?? TITLE_STYLE.size, captionSize = fit?.sizes?.small ?? CAPTION_SIZE;
  // With a box, box.width is the width (availableWidth and the 320 to 720 clamp do not apply; the kind's own minimum does).
  const preferredWidth = boxed ? Math.max(1, Math.round(fit.box.width)) : Math.max(MIN_WIDTH, Math.min(illustration ? 960 : MAX_WIDTH, requested));
  const blocks = width => {
    const title = showTitle ? wrap(diagram.title, width - 32, titleSize) : [];
    const titleHeight = showTitle ? title.length * lineHeight(titleSize) + 17 : 0;
    const caption = showCaption ? layoutCaption(diagram.caption, width - CAPTION_GUTTER, captionSize) : { height: 0 };
    return { title, titleHeight, caption, captionHeight: caption.height ? caption.height + 14 : 0 };
  };
  const call = (width, extra) => (fitted ? layouts[diagram.kind](diagram, width, { ...fit, ...extra }) : layouts[diagram.kind](diagram, width));
  const place = width => {
    const extra = boxed ? { contentHeight: Math.max(0, Math.round(fit.box.height) - blocks(width).titleHeight - blocks(width).captionHeight) } : undefined;
    return fitCaption(call(width, extra), showCaption ? diagram.caption : undefined, CAPTION_GUTTER, captionSize);
  };
  let layout = place(preferredWidth);
  // The kind drew wider than the box (its minimum): ask again at that width so the title, caption and the rest of the box height are counted at the width drawn.
  if (boxed && layout.width !== preferredWidth) layout = place(layout.width);
  const teaching = illustration || isTeachingDiagram(diagram);
  const { width } = layout;
  const { title, titleHeight, caption, captionHeight } = blocks(width);
  const height = titleHeight + layout.height + captionHeight;
  const element = h('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': describeTutorDiagram(document),
    fontFamily: teaching ? TEACHING_FONT : 'Arial, Liberation Sans, sans-serif',
    style: { display: 'block', maxWidth: 'none', marginInline: 'auto', ...(teaching ? TEACHING_STYLE : {}),
      // Panels of round-and-square trees sit on the palette's cream ground alone: no inset surface.
      ...(diagram.kind === 'panels' && diagram.panels.every(panel => isDotTree(panel.diagram)) ? { '--viz-surface': TEACHING.ground } : {}) },
    'data-tutor-diagram': diagram.kind,
  },
  h('title', null, diagram.title),
  h('rect', { x: 0.5, y: 0.5, width: width - 1, height: height - 1, rx: 12,
    fill: SURFACE, stroke: `var(--color-line, ${LINES.frame})` }),
  showTitle ? label(title, width / 2, titleHeight / 2 + 3, { ...TITLE_STYLE, size: titleSize }) : null,
  h('g', { transform: `translate(0 ${titleHeight})` }, ...layout.elements),
  caption.height ? caption.draw(width / 2, titleHeight + layout.height + captionHeight / 2 - 2) : null);
  const result = { width, height, element };
  // `min` and `geometry` are read on demand, so a caller that only draws pays nothing for them.
  // min.width: the narrowest width this spec can be drawn at with nothing overlapping (a box of width 1 asks the kind for its own minimum); min.height: the least height AT THE WIDTH DRAWN (a floor pass of the kind at that width),
  // each with the title and caption blocks counted. A kind that has not been fitted yet reports its drawn size.
  let min;
  Object.defineProperty(result, 'min', { enumerable: true, configurable: true, get() {
    if (min) return min;
    if (!FITTED_KINDS.has(diagram.kind)) return (min = { width, height });
    const floorLayout = at => layouts[diagram.kind](diagram, at, { ...(fit ?? {}), box: { width: at, height: 1 }, floor: true });
    const captionMin = showCaption && diagram.caption ? Math.ceil(widestFormula(diagram.caption, captionSize)) + CAPTION_GUTTER : 0;
    const narrowest = Math.max(floorLayout(1).width, captionMin);
    const atDrawn = blocks(width);
    return (min = { width: narrowest, height: Math.ceil(floorLayout(width).height + atDrawn.titleHeight + atDrawn.captionHeight) });
  } });
  Object.defineProperty(result, 'geometry', { enumerable: true, configurable: true, get() {
    return GEOMETRY_KINDS.has(diagram.kind) && layout.geometry ? shiftGeometry(layout.geometry, titleHeight) : null;
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
