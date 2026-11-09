import { TEACHING_STYLE } from './teaching-theme.js';
import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { layouts } from './layouts.js';
import { fitCaption, label, layoutCaption, lineHeight, SURFACE, wrap } from './primitives.js';
import { describeTutorDiagram, parseTutorDiagram } from './spec.js';
import { usesIllustrations } from './illustration-kinds.js';

const DEFAULT_WIDTH = 408;
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const CAPTION_SIZE = 13;
const CAPTION_GUTTER = 32;

export function renderTutorDiagram(spec, availableWidth = DEFAULT_WIDTH) {
  const document = parseTutorDiagram(spec);
  const { diagram } = document;
  const requested = Number.isFinite(availableWidth) ? Math.round(availableWidth) : DEFAULT_WIDTH;
  const illustration = usesIllustrations(diagram);
  const preferredWidth = Math.max(MIN_WIDTH, Math.min(illustration ? 960 : MAX_WIDTH, requested));
  const layout = fitCaption(layouts[diagram.kind](diagram, preferredWidth), diagram.caption, CAPTION_GUTTER, CAPTION_SIZE);
  const teaching = illustration || isTeachingDiagram(diagram);
  const { width } = layout;
  const title = wrap(diagram.title, width - 32, 17);
  const titleHeight = title.length * lineHeight(17) + 17;
  const caption = layoutCaption(diagram.caption, width - CAPTION_GUTTER, CAPTION_SIZE);
  const captionHeight = caption.height ? caption.height + 14 : 0;
  const height = titleHeight + layout.height + captionHeight;
  const element = h('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': describeTutorDiagram(document),
    fontFamily: teaching ? 'Inter, Liberation Sans, Arial, sans-serif' : 'Arial, Liberation Sans, sans-serif',
    style: { display: 'block', maxWidth: 'none', marginInline: 'auto', ...(teaching ? TEACHING_STYLE : {}) },
    'data-tutor-diagram': diagram.kind,
  },
  h('title', null, diagram.title),
  h('rect', { x: 0.5, y: 0.5, width: width - 1, height: height - 1, rx: 12,
    fill: SURFACE, stroke: 'var(--color-line, #dedad4)' }),
  label(title, width / 2, titleHeight / 2 + 3, { size: 17, weight: 700 }),
  h('g', { transform: `translate(0 ${titleHeight})` }, ...layout.elements),
  caption.height ? caption.draw(width / 2, titleHeight + layout.height + captionHeight / 2 - 2) : null);
  return { width, height, element };
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
    ref: host, style: { width: '100%', minWidth: 0, overflowX: 'auto' },
    tabIndex: scrolls ? 0 : undefined, role: scrolls ? 'region' : undefined,
    'aria-label': scrolls ? 'Scrollable diagram' : undefined,
  }, rendered.element);
}

function isTeachingDiagram(d) {
  if (['heatmap', 'sample-set', 'histogram', 'box-plot'].includes(d.kind)) return true;
  if (['panels', 'visual', 'grouped', 'stacked'].includes(d.variant)) return true;
  if (['scaled-lanes', 'teaching', 'hierarchy', 'dendrogram', 'graph'].includes(d.layout)) return true;
  if (d.kind === 'tree') return d.highlightPath || d.nodes.some(n => n.edgeLabel || n.detail || n.count !== undefined || n.pruned);
  if (d.kind === 'flow') return d.nodes.some(n => n.role === 'fork' || n.role === 'merge');
  if (d.kind === 'coordinate-plot') return d.annotations || d.x.scale || d.y.scale || d.series.some(s => !['line', 'scatter'].includes(s.kind) || s.points.some(p => p.id || p.label || p.low !== undefined));
  return false;
}
