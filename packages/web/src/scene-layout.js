// Pure layout geometry, shared by the renderer (AnimatedScene.jsx) and the
// layout lint (scene-layout-lint.js), so both reason about where a label
// actually sits using the same numbers rather than the lint guessing at what
// the renderer does. Extracted rather than duplicated - see docs/superpowers/
// specs/2026-09-18-tier1-visual-library-design.md's own risk note: "Extracting
// the pure parts... is the remedy, and it is cheap if done as the code is
// written." AnimatedScene.jsx is a .jsx file node:test cannot import, so
// anything the lint needs has to live here instead.
import { SPACE } from './scene-vocab.js';

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

// Where a label sits depends on what it is labelling: a box or circle centres
// it, a stroke pins it to its start, and everything that owns a frame - data
// grids, images - hangs it above the top edge. One place, so the next type
// added does not grow a fifth condition into four attributes.
export const labelAt = (object, kind, centre) => {
  if (kind.stroke) return { x: object.from?.x ?? object.x, y: (object.from?.y ?? object.y) - 8, anchor: 'start', baseline: 'auto' };
  // A grid that also names its columns needs its own title pushed clear of
  // those headers - both read top-down as title, then header, then cell - or
  // the two would print on top of each other just above the grid.
  const gap = object.type === 'grid' && object.columnLabels?.length ? TITLE_ABOVE_COLUMN_HEADERS_GAP : ABOVE_LABEL_GAP;
  if (kind.above) return { x: object.x, y: object.y - gap, anchor: 'start', baseline: 'auto' };
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

// No DOM exists outside the browser, so there is no real text-measurement API
// to call from a lint or a node:test file. This is a deliberate approximation
// - generous enough to catch an obvious collision, not a font-accurate
// metric - tuned against the MONO annotation labels (11px) grid axes use,
// which is the one place this has been checked against a real render.
const CHAR_WIDTH_RATIO = 0.6;
const LINE_HEIGHT_RATIO = 1.2;

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
