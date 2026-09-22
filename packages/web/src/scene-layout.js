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
// (Read from scene-style.js rather than repeated as a literal: it was written
// as 11 when `annotation` was 11px and silently stopped matching the renderer
// when that size was raised, which made every estimate built on it - the left
// margin, the content bounds, the legibility floors - narrower than what is
// actually drawn.)
const ROW_LABEL_FONT_SIZE = textStyle('annotation').fontSize;

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

// Generic content-bounds fit (app-review item 2): the union of every
// authored object's own footprint (frame, or estimated text box, plus a
// grid's own axis labels), so AnimatedScene.jsx can fit its viewBox to what a
// scene actually draws instead of trusting scene.width/height - authors
// habitually oversize those, leaving dead space around correctly-sized
// content. Computed from the scene's DECLARED initialState geometry, not a
// per-frame evaluation: none of this vocabulary's review scenes move or
// resize an object once placed (no scene here uses the 'move'/'resize'
// actions), so the declared geometry already IS every frame's geometry, and
// a static bound means the viewBox does not jitter as opacity/values/text
// animate in and out over the timeline. A scene that does move objects would
// under/over-fit around that motion - the same lazy tradeoff requiredLeftMargin
// above already makes for row labels; upgrade to a per-frame union (fold
// getSceneState's evaluated objects across every timeline event's `at`) if a
// scene with real motion ever needs this.
// Actions that put an object on screen. An object whose initial opacity is 0
// and which no such event ever targets is drawn by nobody, at any time on the
// timeline - it is not content, and letting it stretch the bounds is how a
// scene ends up framed around something the learner never sees. Content-blind:
// this reads the action name and the object's own opacity, never an id, a
// label or a scene.
const REVEALING_ACTIONS = new Set(['appear', 'type_text', 'change_text', 'change_value', 'highlight', 'emphasize', 'move', 'resize', 'set_values', 'replace_values', 'draw_path', 'connect']);

// The widest text this object ever holds. A `text` object authored with an
// empty string that the timeline later types a full sentence into (the normal
// caption/note idiom in this vocabulary) had a ZERO-width footprint here,
// which is how the fit could be computed around content that is not what the
// scene ends up drawing. Generic: the timeline's own values for THIS object,
// longest wins, whatever they say.
function widestText(scene, object) {
  let text = object.initialState?.label || object.initialState?.text || '';
  for (const event of scene.timeline || []) {
    if (event.target !== object.id) continue;
    if (!['type_text', 'change_text', 'change_value'].includes(event.action)) continue;
    const value = String(event.value ?? '');
    if (value.length > text.length) text = value;
  }
  return text;
}

function everDrawn(scene, object) {
  if ((object.initialState?.opacity ?? 1) > 0) return true;
  return (scene.timeline || []).some(event => event.target === object.id && REVEALING_ACTIONS.has(event.action));
}

// The union of every VISIBLE object's own footprint, plus, per object, which
// one owns each extreme edge (`contributors`) - so a framing problem can be
// read off the numbers instead of guessed at from a screenshot.
export function sceneContentBounds(scene) {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  const contributors = { xMin: null, xMax: null, yMin: null, yMax: null };
  const grow = (box, id) => {
    if (box.xMin < xMin) { xMin = box.xMin; contributors.xMin = id; }
    if (box.xMax > xMax) { xMax = box.xMax; contributors.xMax = id; }
    if (box.yMin < yMin) { yMin = box.yMin; contributors.yMin = id; }
    if (box.yMax > yMax) { yMax = box.yMax; contributors.yMax = id; }
  };
  for (const object of scene.objects || []) {
    if (!everDrawn(scene, object)) continue;
    const state = object.initialState || {};
    const x = state.x ?? 0, y = state.y ?? 0;
    if (state.from && state.to) {
      grow({ xMin: Math.min(state.from.x, state.to.x), xMax: Math.max(state.from.x, state.to.x),
        yMin: Math.min(state.from.y, state.to.y), yMax: Math.max(state.from.y, state.to.y) }, object.id);
      continue;
    }
    if (state.w != null && state.h != null) {
      grow({ xMin: x, xMax: x + state.w, yMin: y, yMax: y + state.h }, object.id);
    } else {
      const fontSize = textStyle(state.typography || 'body').fontSize;
      grow(estimateTextBox({ text: widestText(scene, object), x, y, fontSize, anchor: 'start', baseline: 'auto' }), object.id);
    }
    for (const box of gridAxisLabelBoxes({ type: object.type, ...state })) {
      grow(estimateTextBox({ ...box, fontSize: ROW_LABEL_FONT_SIZE }), object.id);
    }
  }
  return Number.isFinite(xMin) ? { xMin, xMax, yMin, yMax, contributors } : null;
}

// --- screen-space typography legibility --------------------------------------
// "If you need to zoom the canvas to read the lesson, the lesson rendering is
// wrong" (docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md).
// Camera fitting may shrink geometry; it may not shrink instructional text
// below its class floor, where
//
//   effectiveFontPx = authoredFontSize x finalSceneScale
//
// These are MINIMUM EFFECTIVE CSS PIXELS per semantic text class, not per
// scene and not per object - the floors key on the typography class alone, so
// no gallery content can ever reach them. They are set at the authored sizes
// scene-style.js already uses, which is the real claim being made: those sizes
// were chosen as readable CSS pixels, so the invariant is simply that the
// camera must not scale them DOWN. The consequence, deliberately, is that a
// scene too wide for its viewport cannot be fixed by shrinking it - the
// viewport grows (legibleViewport below) or the scene is re-authored.
export const LEGIBILITY_FLOORS = Object.freeze({
  display: 20,     // scene title-weight text
  heading: 17,     // section text inside a scene
  equation: 15,    // a displayed equation
  body: 15,        // primary node labels, captions, explanation lines
  caption: 14,     // a data shape's own name
  annotation: 13,  // axis names, shape/dimension annotations, residual labels
  code: 13,        // inline code
  metadata: 12,    // grid row/column axis numerals - the smallest class there is
});

export const legibilityFloor = typographyRole => LEGIBILITY_FLOORS[typographyRole] ?? LEGIBILITY_FLOORS.body;

// Every typography class a scene actually draws, keyed on object TYPE and the
// object's own declared `typography` - never on an id, a label or a scene.
export function typographyClassesUsed(scene) {
  const classes = new Set();
  for (const object of scene.objects || []) {
    if (!everDrawn(scene, object)) continue;
    const state = object.initialState || {};
    if (object.type === 'text') classes.add(state.typography || 'body');
    else if (object.type === 'code') classes.add('code');
    else if (object.type === 'equation') classes.add('equation');
    else if (['grid', 'strip', 'bars', 'tokens'].includes(object.type)) { classes.add('caption'); classes.add('metadata'); }
    else if (state.label) classes.add('body');
  }
  return [...classes].sort();
}

// Padding around the content, in scene units, applied to the LIMITING
// dimension. The old fit spent 15% of BOTH axes on padding and then handed
// the result to an SVG whose preserveAspectRatio already letterboxes the
// non-limiting axis - paying for dead space twice. A flat pad is the honest
// version: the content fills everything else.
export const SCENE_PAD = 24;

// The viewBox for a content-fitted scene in a viewport of the given aspect.
// The span is grown (never shrunk) on whichever axis is short of the
// viewport's aspect, so `finalSceneScale` is exactly viewport.w / span.w on
// both axes and no letterboxing happens inside the SVG - the scale the
// legibility floors are checked against is then the scale actually rendered.
export function sceneViewBox(bounds, viewportAspect) {
  let w = (bounds.xMax - bounds.xMin) + SCENE_PAD * 2;
  let h = (bounds.yMax - bounds.yMin) + SCENE_PAD * 2;
  if (Number.isFinite(viewportAspect) && viewportAspect > 0) {
    if (w / h < viewportAspect) w = h * viewportAspect;
    else h = w / viewportAspect;
  }
  return { origin: { x: (bounds.xMin + bounds.xMax) / 2 - w / 2, y: (bounds.yMin + bounds.yMax) / 2 - h / 2 }, span: { w, h } };
}

// A block can only grow so far before it stops fitting the lesson column's own
// surface. Beyond this the answer is a re-authored scene, not a wider block -
// and the legibility gate says so by name rather than silently shipping 8px
// text. Width is the binding one; the height cap is generous because a canvas
// scrolls vertically and does not scroll horizontally.
export const MAX_SCENE_VIEWPORT = Object.freeze({ w: 1120, h: 860 });

// What viewport (in CSS px, the SVG's own box) this scene needs for every
// typography class it draws to clear its floor - `scale` 1 means the authored
// units already ARE CSS pixels. Returns the clamped viewport plus the scale
// and the per-class effective sizes that viewport actually produces, so a
// caller can size a block with it and a gate can check it, from one function.
export function sceneLegibility(scene, viewport = null) {
  const bounds = sceneContentBounds(scene);
  if (!bounds) return null;
  const classes = typographyClassesUsed(scene);
  // The scale every class needs: authored sizes are CSS pixels, so this is 1
  // unless an author wrote something smaller than its own floor.
  const required = classes.reduce((worst, name) => {
    const authored = name === 'metadata' ? ROW_LABEL_FONT_SIZE : textStyle(name).fontSize;
    return Math.max(worst, legibilityFloor(name) / authored);
  }, 0) || 1;
  const contentW = (bounds.xMax - bounds.xMin) + SCENE_PAD * 2;
  const contentH = (bounds.yMax - bounds.yMin) + SCENE_PAD * 2;
  const wanted = { w: contentW * required, h: contentH * required };
  const box = viewport ?? {
    w: Math.min(wanted.w, MAX_SCENE_VIEWPORT.w),
    h: Math.min(Math.max(wanted.h, wanted.w > MAX_SCENE_VIEWPORT.w ? contentH * (MAX_SCENE_VIEWPORT.w / contentW) : wanted.h), MAX_SCENE_VIEWPORT.h),
  };
  const { span } = sceneViewBox(bounds, box.w / box.h);
  const scale = box.w / span.w;
  const effective = {};
  for (const name of classes) {
    const authored = name === 'metadata' ? ROW_LABEL_FONT_SIZE : textStyle(name).fontSize;
    effective[name] = { authored, effectivePx: authored * scale, floor: legibilityFloor(name) };
  }
  return { bounds, classes, scale, viewport: box, span, effective, clamped: wanted.w > MAX_SCENE_VIEWPORT.w };
}

// Every class that lands under its floor at this viewport, named. Empty means
// the scene is readable at 100% canvas zoom - the whole point.
export function legibilityIssues(scene, viewport = null) {
  const report = sceneLegibility(scene, viewport);
  if (!report) return [];
  // Half a pixel of slack: the estimate is a float, the floors are integers,
  // and nobody can see 0.4px. Anything worse is a real failure.
  return Object.entries(report.effective)
    .filter(([, size]) => size.effectivePx < size.floor - 0.5)
    .map(([name, size]) => ({ scene: scene.id, textClass: name, authored: size.authored, effectivePx: Number(size.effectivePx.toFixed(2)), floor: size.floor }));
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
