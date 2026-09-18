// What the canvas style panel shows, and for what. The panel is contextual:
// it appears while a drawing tool is armed (styling what you are about to draw)
// or while something styleable is selected (styling that), and stays out of the
// way otherwise. The toolbar keeps a swatch button so the controls are never
// gone without a trace.

// Tools that draw something carrying colour, width or a text level.
const STYLED_TOOLS = new Set(['pen', 'highlighter', 'text', 'sticky', 'rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star', 'line', 'arrow', 'curve']);
// A line or an arrow has no inside, so only these can hold a fill.
const CLOSED_SHAPES = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star']);

export const DASH_STYLES = ['solid', 'dashed', 'dotted'];
export const OPACITIES = [0.3, 0.6, 1];

// `dash` was a boolean before dotted existed, and old shapes still carry it.
export function dashStyle(dash) {
  return dash === true ? 'dashed' : DASH_STYLES.includes(dash) ? dash : 'solid';
}

// Dotted leans on strokeLinecap:'round' to turn zero-length dashes into pips.
export function dashArray(dash, width) {
  const style = dashStyle(dash);
  if (style === 'dashed') return `${width * 3} ${width * 2.5}`;
  if (style === 'dotted') return `0 ${width * 2}`;
  return undefined;
}

// Paint order is array order, so send-to-back is a move to the front of it.
export function reorder(list, ids, toFront) {
  const moving = list.filter(entry => ids.includes(entry.id));
  if (!moving.length) return list;
  const rest = list.filter(entry => !ids.includes(entry.id));
  return toFront ? [...rest, ...moving] : [...moving, ...rest];
}

// Notion's ladder. Weight climbs with size so a heading reads as one without
// needing a separate bold control.
export const TEXT_LEVELS = [
  { id: 'h1', label: 'H1', size: 32, weight: 600 },
  { id: 'h2', label: 'H2', size: 24, weight: 600 },
  { id: 'h3', label: 'H3', size: 19, weight: 500 },
  { id: 'body', label: 'Text', size: 14, weight: 400 },
];

export function panelFor({ tool, selection, shapes = [], links = [], items = [] }) {
  const has = entry => selection.includes(entry.id);
  const pickedShapes = shapes.filter(has);
  const pickedLinks = links.filter(has);
  const pickedTexts = items.filter(entry => has(entry) && entry.kind === 'text');
  const targets = [...pickedShapes, ...pickedLinks, ...pickedTexts].map(entry => entry.id);
  // A control only shows when it applies to everything it would act on, so a
  // press can never quietly mean something different per object.
  const allShapes = kinds => pickedShapes.length > 0 && !pickedLinks.length && !pickedTexts.length
    && pickedShapes.every(shape => kinds.has(shape.kind));
  return {
    open: STYLED_TOOLS.has(tool) || targets.length > 0,
    // Text levels replace stroke widths, but only when nothing else is in the
    // selection - a mixed pick falls back to the ink controls both understand.
    text: tool === 'text' || (pickedTexts.length > 0 && !pickedShapes.length && !pickedLinks.length),
    fill: CLOSED_SHAPES.has(tool) || allShapes(CLOSED_SHAPES),
    corners: tool === 'rect' || allShapes(new Set(['rect'])),
    order: targets.length > 0,
    targets,
  };
}

// Text written before levels existed carries a raw `size` off the old stroke
// width picker. Keep rendering it rather than migrating anyone's canvas.
export function textStyle(item) {
  const level = TEXT_LEVELS.find(entry => entry.id === item.level);
  return level ? { fontSize: level.size, fontWeight: level.weight } : { fontSize: item.size || 14 };
}
