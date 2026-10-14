// What the canvas style panel shows, and for what. The panel is contextual:
// it appears while a drawing tool is armed (styling what you are about to draw)
// or while something styleable is selected (styling that), and stays out of the
// way otherwise. The toolbar keeps a swatch button so the controls are never
// gone without a trace.

// Tools that draw something carrying colour, width or a text level.
const STYLED_TOOLS = new Set(['pen', 'highlighter', 'text', 'sticky', 'rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star', 'line', 'arrow', 'curve', 'elbow']);
// A line or an arrow has no inside, so only these can hold a fill.
const CLOSED_SHAPES = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star']);

// Drawn arrows switch route by switching kind; connectors keep a route.
export const ARROW_KINDS = { straight: 'arrow', curved: 'curve', elbow: 'elbow' };
const ROUTE_OF_KIND = { arrow: 'straight', curve: 'curved', elbow: 'elbow' };
export const routeOf = entry => (entry.kind ? ROUTE_OF_KIND[entry.kind] : entry.route || 'curved');

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

// No stroke is a flag beside the colour, never a colour: width, dash and the colour the words follow all stay put, so
// picking a colour brings the old outline back as it was. A colour pick clears it (undefined: it never reaches the JSON).
export const strokePatch = value => (value === null ? { noStroke: true } : { color: value, noStroke: undefined });
export const strokeOf = (entry, ink) => (entry.noStroke ? null : entry.color || ink);

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
  { id: 'h4', label: 'H4', size: 16, weight: 500 },
  { id: 'body', label: 'Text', size: 14, weight: 400 },
];

// Kinds that carry words as a label (lines and arrows); closed shapes carry them in their middle.
const LINEAR_SHAPES = new Set(['line', 'arrow', 'curve', 'elbow']);
const TEXT_TOOLS = new Set(['text', 'sticky']);

// editing: the id whose text is open, if any. units: how many separately movable pieces are selected (a group is one).
// locked: the locked ids, which keep their look as well as their place - never a style target.
export function panelFor({ tool, selection, shapes = [], links = [], items = [], editing = null, units = 0, locked = [] }) {
  const has = entry => selection.includes(entry.id);
  const free = entry => !locked.includes(entry.id);
  const pickedShapes = shapes.filter(has);
  const pickedLinks = links.filter(has);
  const pickedTexts = items.filter(entry => has(entry) && entry.kind === 'text');
  const pickedStickies = items.filter(entry => has(entry) && entry.kind === 'sticky');
  const lockedPicks = [...pickedShapes, ...pickedTexts, ...pickedStickies].filter(entry => !free(entry));
  const targets = [...pickedShapes, ...pickedLinks, ...pickedTexts, ...pickedStickies].filter(free).map(entry => entry.id);
  // A control only shows when it applies to everything it would act on, so a
  // press can never quietly mean something different per object.
  const allShapes = kinds => pickedShapes.length > 0 && !pickedLinks.length && !pickedTexts.length && !pickedStickies.length
    && pickedShapes.every(shape => kinds.has(shape.kind));
  const lines = (pickedLinks.length > 0 || pickedShapes.length > 0) && !pickedTexts.length && !pickedStickies.length
    && pickedShapes.every(shape => LINEAR_SHAPES.has(shape.kind));
  // Words: a text box or note always; a shape or a line once it holds some, or while it is written in.
  const worded = entry => entry.kind === 'text' || entry.kind === 'sticky' || !!(entry.text || entry.label) || entry.id === editing;
  const textTargets = [...pickedShapes, ...pickedLinks, ...pickedTexts, ...pickedStickies].filter(entry => free(entry) && worded(entry)).map(entry => entry.id);
  const closedWords = pickedShapes.filter(shape => CLOSED_SHAPES.has(shape.kind) && free(shape) && worded(shape));
  return {
    open: STYLED_TOOLS.has(tool) || targets.length > 0 || units >= 2 || lockedPicks.length > 0,
    // Text levels replace stroke widths, but only when nothing else is in the
    // selection - a mixed pick falls back to the ink controls both understand.
    text: tool === 'text' || (pickedTexts.length > 0 && !pickedShapes.length && !pickedLinks.length && !pickedStickies.length),
    fill: CLOSED_SHAPES.has(tool) || allShapes(CLOSED_SHAPES),
    // No stroke: the same shapes as fill. A line, an arrow or a pen mark is its stroke, so hiding it would hide the mark.
    // ponytail: closed shapes only. A note's border and a connector's line have no separate outline to hide; add if asked.
    noStroke: CLOSED_SHAPES.has(tool) || allShapes(CLOSED_SHAPES),
    corners: tool === 'rect' || allShapes(new Set(['rect'])),
    order: targets.length > 0,
    // Straight / curved / elbow: for connectors and drawn arrows, and only
    // when nothing else is picked.
    route: lines && pickedShapes.every(shape => ROUTE_OF_KIND[shape.kind]),
    routeValue: [...pickedLinks, ...pickedShapes].map(routeOf)[0] || null,
    // Arrowheads at either end: lines, arrows and connectors.
    heads: LINEAR_SHAPES.has(tool) || (lines && targets.length > 0),
    // The first colour row: a stroke, or a note's paper. A text box's colour is its words', in the Text section.
    stroke: !TEXT_TOOLS.has(tool) && (STYLED_TOOLS.has(tool) || pickedShapes.length + pickedLinks.length + pickedStickies.length > 0),
    paper: tool === 'sticky' || (pickedStickies.length > 0 && !pickedShapes.length && !pickedLinks.length),
    widths: tool === 'pen' || tool === 'highlighter' || CLOSED_SHAPES.has(tool) || LINEAR_SHAPES.has(tool)
      || (pickedShapes.length > 0 && !pickedLinks.length && !pickedTexts.length && !pickedStickies.length),
    // Font, size, bold, italic, underline, text colour and alignment.
    typography: TEXT_TOOLS.has(tool) || textTargets.length > 0,
    textTargets,
    // Top / middle / bottom: words inside closed shapes, and nothing else picked with words.
    valign: closedWords.length > 0 && closedWords.length === textTargets.length,
    // Text / Code: one standalone text box.
    code: textTargets.length === 1 && pickedTexts.length === 1 && textTargets[0] === pickedTexts[0].id ? pickedTexts[0].id : null,
    arrange: units >= 2,
    locked: lockedPicks.map(entry => entry.id),
    targets,
  };
}

// One step through paint order: each selected entry trades places with the unselected neighbour above (forward) or
// below it, so a selection keeps its own internal order.
export function reorderStep(list, ids, forward) {
  const next = [...list];
  if (forward) {
    for (let i = next.length - 2; i >= 0; i -= 1) if (ids.includes(next[i].id) && !ids.includes(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
  } else {
    for (let i = 1; i < next.length; i += 1) if (ids.includes(next[i].id) && !ids.includes(next[i - 1].id)) [next[i - 1], next[i]] = [next[i], next[i - 1]];
  }
  return next;
}

// Arrowheads: where none was ever chosen, a drawn arrow (or a diagram connector, head: true) ends in the open arrow
// it always had, and nothing starts with one.
export const HEADS = ['none', 'arrow', 'triangle', 'dot', 'bar'];
const ARROWED = new Set(['arrow', 'curve', 'elbow']);
export const headsOf = entry => ({
  start: HEADS.includes(entry.startHead) ? entry.startHead : 'none',
  end: HEADS.includes(entry.endHead) ? entry.endHead : (ARROWED.has(entry.kind) || entry.head ? 'arrow' : 'none'),
});

// Copy style / paste style: appearance only - never words, identity or position - and only what the target can show.
const TEXT_STYLE = ['font', 'fontSize', 'bold', 'italic', 'underline', 'textColor', 'align', 'level'];
export function styleKeysFor(entry, link = false) {
  if (link) return ['color', 'startHead', 'endHead', ...TEXT_STYLE.filter(key => key !== 'level')];
  if (entry.kind === 'text') return ['color', 'opacity', ...TEXT_STYLE.filter(key => key !== 'textColor')];
  if (entry.kind === 'sticky') return ['color', 'opacity', ...TEXT_STYLE.filter(key => key !== 'level')];
  if (entry.kind === 'equation') return ['color'];
  if (LINEAR_SHAPES.has(entry.kind)) return ['color', 'width', 'dash', 'opacity', 'startHead', 'endHead', ...TEXT_STYLE];
  if (CLOSED_SHAPES.has(entry.kind)) return ['color', 'noStroke', 'width', 'dash', 'fill', 'fillOpacity', 'opacity', 'valign', ...TEXT_STYLE, ...(entry.kind === 'rect' ? ['round'] : [])];
  return [];
}
export function copyStyle(entry, link = false) {
  const style = {};
  for (const key of styleKeysFor(entry, link)) if (entry[key] !== undefined) style[key] = entry[key];
  // A text box's colour is its words' colour: it pastes as the text colour of anything that keeps one apart.
  if (entry.kind === 'text' && entry.color) style.textColor = entry.color;
  return style;
}
export function pasteStyle(entry, style, link = false) {
  const next = { ...entry };
  for (const key of styleKeysFor(entry, link)) if (key in style) next[key] = style[key];
  // A pasted colour brings the outline back, unless its source had none.
  if (CLOSED_SHAPES.has(entry.kind) && 'color' in style && !style.noStroke) delete next.noStroke;
  // Onto a text box, a source's text colour is the box's colour.
  if (entry.kind === 'text' && style.textColor) next.color = style.textColor;
  return next;
}

// Post-it papers: each palette ink maps to a pastel note. The default and
// amber both keep the classic yellow; colors were never stored before, so
// old notes fall back to it untouched.
export const STICKY_TONES = {
  '#37352f': { bg: '#fef3c7', border: '#f0d9a8', text: '#6b4e0b', placeholder: '#b08a3e' },
  '#f59e0b': { bg: '#fef3c7', border: '#f0d9a8', text: '#6b4e0b', placeholder: '#b08a3e' },
  '#2383e2': { bg: '#dbeafe', border: '#bcd6fa', text: '#1e3a8a', placeholder: '#7096d8' },
  '#b42318': { bg: '#fee2e2', border: '#fac5c5', text: '#7f1d1d', placeholder: '#d08b8b' },
  '#1a7f37': { bg: '#dcfce7', border: '#bbe7cb', text: '#14532d', placeholder: '#76b789' },
  '#7c3aed': { bg: '#ede9fe', border: '#d8cffc', text: '#4c1d95', placeholder: '#9c86e0' },
};
export const stickyTone = color => STICKY_TONES[color] || STICKY_TONES['#37352f'];

// Text written before levels existed carries a raw `size` off the old stroke
// width picker. Keep rendering it rather than migrating anyone's canvas.
export function textStyle(item) {
  const level = TEXT_LEVELS.find(entry => entry.id === item.level);
  return level ? { fontSize: level.size, fontWeight: level.weight } : { fontSize: item.size || 14 };
}
