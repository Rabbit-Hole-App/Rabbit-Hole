// kinds-fit R1: the entry point takes (spec, availableWidth, { box, sizes, parts }) and returns { width, height, element, min, geometry }.
import fs from 'node:fs';
const F = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/TutorDiagram.js';
const CR = String.fromCharCode(13, 10), LF = String.fromCharCode(10);
let s = fs.readFileSync(F, 'utf8');
const crlf = s.includes(CR);
s = s.split(CR).join(LF);
const a = s.indexOf('export function renderTutorDiagram(spec, availableWidth = DEFAULT_WIDTH) {');
const b = s.indexOf("// A diagram's natural size, measured without mounting");
if (a < 0 || b < 0) throw new Error('entry bounds');
const next = `// kinds-fit: the kinds that take a box, sizes and legend/parts switches; every other kind ignores them and is drawn as always (its \`min\` is its drawn size).
const FITTED_KINDS = new Set(['coordinate-plot', 'token-links']);
// The kinds whose layout reports positions: \`geometry\` is an object for these (in the picture's coordinates, the title block counted) and null for every other kind.
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
  const titleSize = fit?.sizes?.title ?? 17, captionSize = fit?.sizes?.small ?? CAPTION_SIZE;
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
    xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: \`0 0 \${width} \${height}\`, role: 'img',
    'aria-label': describeTutorDiagram(document),
    fontFamily: teaching ? TEACHING_FONT : 'Arial, Liberation Sans, sans-serif',
    style: { display: 'block', maxWidth: 'none', marginInline: 'auto', ...(teaching ? TEACHING_STYLE : {}),
      // Panels of round-and-square trees sit on the palette's cream ground alone: no inset surface.
      ...(diagram.kind === 'panels' && diagram.panels.every(panel => isDotTree(panel.diagram)) ? { '--viz-surface': TEACHING.ground } : {}) },
    'data-tutor-diagram': diagram.kind,
  },
  h('title', null, diagram.title),
  h('rect', { x: 0.5, y: 0.5, width: width - 1, height: height - 1, rx: 12,
    fill: SURFACE, stroke: \`var(--color-line, \${LINES.frame})\` }),
  showTitle ? label(title, width / 2, titleHeight / 2 + 3, { size: titleSize, weight: 700 }) : null,
  h('g', { transform: \`translate(0 \${titleHeight})\` }, ...layout.elements),
  caption.height ? caption.draw(width / 2, titleHeight + layout.height + captionHeight / 2 - 2) : null);
  const result = { width, height, element };
  // \`min\` and \`geometry\` are read on demand, so a caller that only draws pays nothing for them.
  // min.width: the narrowest width this spec can be drawn at with nothing overlapping (a box of width 1 asks the kind for its own minimum); min.height: the least height AT THE WIDTH DRAWN (a floor pass of the kind at that width),
  // each with the title and caption blocks counted. A kind that has not been fitted yet reports its drawn size.
  let min;
  Object.defineProperty(result, 'min', { enumerable: true, configurable: true, get() {
    if (min) return min;
    if (!fitted) return (min = { width, height });
    const floorLayout = at => call(at, { box: { width: at, height: 1 }, floor: true });
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

`;
s = s.slice(0, a) + next + s.slice(b);
s = s.replace("import { fitCaption, label, layoutCaption, lineHeight, SURFACE, wrap } from './primitives.js';", "import { fitCaption, label, layoutCaption, lineHeight, SURFACE, widestFormula, wrap } from './primitives.js';");
if (!s.includes('widestFormula, wrap')) throw new Error('import');
fs.writeFileSync(F, crlf ? s.split(LF).join(CR) : s);
console.log('entry patched');
