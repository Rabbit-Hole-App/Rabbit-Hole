// Pure layout geometry, shared by the renderer (AnimatedScene.jsx) and the
// layout lint (scene-layout-lint.js), so both reason about where a label
// actually sits using the same numbers rather than the lint guessing at what
// the renderer does. Extracted rather than duplicated - see docs/superpowers/
// specs/2026-09-18-tier1-visual-library-design.md's own risk note: "Extracting
// the pure parts... is the remedy, and it is cheap if done as the code is
// written." AnimatedScene.jsx is a .jsx file node:test cannot import, so
// anything the lint needs has to live here instead.
import { SPACE } from './scene-vocab.js';
import { textStyle } from './scene-style.js';

// No DOM exists outside the browser, so there is no real text-measurement API
// to call from a lint or a node:test file. This is a deliberate approximation
// - generous enough to catch an obvious collision, not a font-accurate
// metric - tuned against the MONO annotation labels (11px) grid axes use,
// which is the one place this has been checked against a real render.
const CHAR_WIDTH_RATIO = 0.6;
const LINE_HEIGHT_RATIO = 1.2;

// Proven against the committed case 01 scene at the old SPACE[1] (8) gap
// first (see scene-layout-lint.js and viz-benchmarks' case 01 for the
// quoted failure): a diagonal arrow terminating flush against a grid's edge
// puts its arrowhead footprint (see ARROWHEAD_RADIUS in scene-layout-lint.js)
// past an 8px gap, onto the row or column label sitting there. SPACE[4] (24)
// clears that footprint with margin, for any scene, not just this one - the
// fix is the gap, not case 01's coordinates.
export const ROW_LABEL_GAP = SPACE[4];
export const COLUMN_LABEL_GAP = SPACE[4];
// The same clearance a data shape's own "hangs above its frame" label needs,
// for the same reason - see the "above" branch below. Grids with column
// headers already used this value for their title; unified here so a strip
// or image's caption gets the same real clearance instead of the smaller
// gap that let case 01's "output" caption collide with an incoming arrow.
const ABOVE_LABEL_GAP = SPACE[4];
// A grid with column headers sits with its header row already at
// object.y - COLUMN_LABEL_GAP; the grid's OWN title has to clear that row
// too, not just the frame, or raising COLUMN_LABEL_GAP alone would have
// moved the title back on top of the headers it was already clear of. SPACE[3]
// (16) is the header row's own rough line height.
const TITLE_ABOVE_COLUMN_HEADERS_GAP = COLUMN_LABEL_GAP + SPACE[3];

// A rough {xMin, xMax, yMin, yMax} for any evaluated object, used only to
// find what else in the scene occupies space near it. A shape with a real
// frame (grid, strip, box, ...) uses it directly. A freestanding text,
// equation or code object has none - getSceneState's sizeOf leaves w/h
// undefined for those - so it is estimated from its own rendered text the
// same way a label's box already is (see estimateTextBox), at anchor
// 'start', baseline 'auto', the same as kind.text actually draws it. Without
// this, a caption sitting just above a grid's own label was invisible to
// the stacking check below - it has no frame, so nothing said it was there.
function footprint(object) {
  if (object.h != null) return { xMin: object.x, xMax: object.x + (object.w || 0), yMin: object.y, yMax: object.y + object.h };
  const fontSize = textStyle(object.typography || 'body').fontSize;
  return estimateTextBox({ text: object.label || '', x: object.x, y: object.y, fontSize, anchor: 'start', baseline: 'auto' });
}

// The bottom edge of the closest OTHER object sitting above this one and
// horizontally overlapping its x-range - what a stacked label's "the thing
// right above it" actually means, whether that thing is a grid, a strip or
// just a caption someone typed a few pixels too close. Exported for its own
// test coverage, not just via labelAt.
export function nearestAboveBottom(object, objects) {
  let bottom = null;
  const target = footprint(object);
  for (const other of objects) {
    if (other === object || other.y == null) continue;
    const box = footprint(other);
    if (box.yMax > object.y) continue; // not above this object at all
    if (box.xMax <= target.xMin || box.xMin >= target.xMax) continue; // no horizontal overlap
    if (bottom == null || box.yMax > bottom) bottom = box.yMax;
  }
  return bottom;
}

// Where a label sits depends on what it is labelling: a box or circle centres
// it, a stroke pins it to its start, and everything that owns a frame - data
// grids, images - hangs it above the top edge. One place, so the next type
// added does not grow a fifth condition into four attributes.
//
// `objects` (optional, defaults to none) is the scene's other evaluated
// objects - needed only for the `above` branch, to fix a stacked-group bug:
// a fixed gap measured from this object's OWN y put the label the right
// distance below its own content, but said nothing about how close the
// PREVIOUS object in the stack already was above it, so two labelled groups
// packed tightly (a strip/grid template, not a one-off scene mistake) drew
// the label closer to the wrong neighbour, in four cases badly enough to
// overlap. If the object immediately above leaves less than a full gap of
// clearance, split the available room evenly instead of only ever protecting
// the gap to this object's own content.
export const labelAt = (object, kind, centre, objects = []) => {
  if (kind.stroke) return { x: object.from?.x ?? object.x, y: (object.from?.y ?? object.y) - 8, anchor: 'start', baseline: 'auto' };
  // A grid that also names its columns needs its own title pushed clear of
  // those headers - both read top-down as title, then header, then cell - or
  // the two would print on top of each other just above the grid. That also
  // means the header row, not the grid's cell top, is this object's own
  // "near edge" when a squeeze (below) has to choose how much room to give
  // each side - splitting toward object.y instead once collided with the
  // header row itself in exactly the case this was meant to fix (case 10).
  const hasColumnHeaders = object.type === 'grid' && object.columnLabels?.length;
  const gap = hasColumnHeaders ? TITLE_ABOVE_COLUMN_HEADERS_GAP : ABOVE_LABEL_GAP;
  const ownEdge = hasColumnHeaders ? object.y - COLUMN_LABEL_GAP : object.y;
  if (kind.above) {
    const naturalY = object.y - gap;
    const aboveBottom = nearestAboveBottom(object, objects);
    const y = aboveBottom != null && naturalY - aboveBottom < gap ? (aboveBottom + ownEdge) / 2 : naturalY;
    return { x: object.x, y, anchor: 'start', baseline: 'auto' };
  }
  if (kind.text) return { x: object.x, y: object.y, anchor: 'start', baseline: 'auto' };
  return { x: centre.x, y: centre.y, anchor: 'middle', baseline: 'central' };
};

export const centreOf = object => (object.type === 'circle'
  ? { x: object.x, y: object.y }
  : { x: object.x + (object.w || 0) / 2, y: object.y + (object.h || 0) / 2 });

// A grid's row and column axis names - one per row down the left, one per
// column across the top - drawn at a fixed offset from the grid's own frame.
// Returns the same {x, y, anchor} shape labelAt does, plus the text, so a
// caller (the lint) can estimate a box the same way for either kind of label.
export function gridAxisLabelBoxes(object) {
  if (object.type !== 'grid') return [];
  const cell = object.cell || 24;
  const boxes = [];
  for (const [row, text] of (object.rowLabels || []).entries()) {
    boxes.push({ text, x: object.x - ROW_LABEL_GAP, y: object.y + row * cell + cell / 2, anchor: 'end', baseline: 'central' });
  }
  for (const [column, text] of (object.columnLabels || []).entries()) {
    boxes.push({ text, x: object.x + column * cell + cell / 2, y: object.y - COLUMN_LABEL_GAP, anchor: 'middle', baseline: 'auto' });
  }
  return boxes;
}

// Grid row labels always draw at the 'annotation' typography (11px) - see
// scene-style.js and scene-layout-lint.js's collectLabels, the one other
// place this number is asserted. Kept local rather than threaded through as
// a parameter: it is a fact about what a row label IS, not a per-call choice.
const ROW_LABEL_FONT_SIZE = 11;

// How far a grid's row-label text (anchor 'end', so it draws LEFTWARD from
// object.x - ROW_LABEL_GAP) would extend past x=0, the renderer's default
// left edge - "river" clipping to "ver", "pos0" to "os0". A grid placed near
// the standard left margin used throughout this vocabulary has no built-in
// protection against this: the label draws off-canvas the moment its own
// text is wider than `object.x - ROW_LABEL_GAP`. Generic and scene-agnostic -
// callers widen the visible canvas by exactly this amount only when a grid
// actually needs it, so scenes with no row-labelled grid near the edge are
// unaffected.
export function requiredLeftMargin(objects) {
  let margin = 0;
  for (const object of objects) {
    for (const box of gridAxisLabelBoxes(object)) {
      if (box.anchor !== 'end') continue; // only row labels draw leftward
      const { xMin } = estimateTextBox({ ...box, fontSize: ROW_LABEL_FONT_SIZE });
      if (xMin < -margin) margin = -xMin;
    }
  }
  return margin;
}

// Generic edge routing / label avoidance: does the straight segment p0->p1
// pass THROUGH a box at any point along its length - not only land inside
// it at an endpoint (checkArrowIntoLabel in scene-layout-lint.js already
// catches that, at the arrowhead only). An arrow re-routed clear of a
// label's start point can still cut straight through the label's body on
// its way to a different, honest landing spot - a different defect from a
// spacing problem, and this is the shape check that tells them apart.
// Liang-Barsky segment/rectangle clipping: standard, not scene-specific -
// the same test serves any arrow against any label, anywhere.
function clipTest(p, q, t) {
  if (p === 0) return q >= 0;
  const r = q / p;
  if (p < 0) { if (r > t[1]) return false; if (r > t[0]) t[0] = r; }
  else { if (r < t[0]) return false; if (r < t[1]) t[1] = r; }
  return true;
}
export function segmentIntersectsBox(p0, p1, box) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const t = [0, 1];
  return clipTest(-dx, p0.x - box.xMin, t)
    && clipTest(dx, box.xMax - p0.x, t)
    && clipTest(-dy, p0.y - box.yMin, t)
    && clipTest(dy, box.yMax - p0.y, t);
}

export function estimateTextBox({ text, x, y, fontSize, anchor, baseline }) {
  const width = (text?.length || 0) * fontSize * CHAR_WIDTH_RATIO;
  const height = fontSize * LINE_HEIGHT_RATIO;
  const [xMin, xMax] = anchor === 'end' ? [x - width, x] : anchor === 'middle' ? [x - width / 2, x + width / 2] : [x, x + width];
  // 'central' (dominantBaseline) centres the glyph on y; 'auto' (the default
  // alphabetic baseline) sits mostly above y, with a little below for
  // descenders.
  const [yMin, yMax] = baseline === 'central' ? [y - height / 2, y + height / 2] : [y - height * 0.8, y + height * 0.2];
  return { xMin, xMax, yMin, yMax };
}
