import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Pause, Play, RotateCcw, Scan, Volume2, VolumeX, X } from 'lucide-react';
import katex from 'katex';
// Equation objects render through katex.renderToString below, and without
// its own stylesheet the output is unstyled markup. In the shipped app this
// was never actually broken - main.jsx imports ask.jsx (MathText's caller)
// eagerly, so its katex CSS is always on the page - but that made it an
// accidental dependency on a sibling component's import graph rather than
// something this file owns. A standalone render of this component (no
// main.jsx in the tree - see viz-benchmarks' scene-render-harness.jsx) had
// no such CSS and rendered every equation as flat, unstyled text. Importing
// it here directly makes AnimatedScene correct on its own.
import 'katex/dist/katex.min.css';
import { CHIP_CHAR, CHIP_GAP, CHIP_PAD, getSceneState, validateScene } from './animation-scene.js';
import { applyInputToBlock, evaluateScene } from './scene-evaluate.js';
import { lockedInputNames, revealHiddenInputs } from './scene-activity.js';
import SceneControls from './SceneControls.jsx';
import { isMuted, onMuted, setMuted } from './learn-audio.js';
import { distributeRounding } from './scene-derive.js';
import { cellNumeralSize, formatCell } from './scene-format.js';
import { COALESCE_WINDOW, coalesce, crossed, play as playSound } from './scene-sound.js';
import { COLUMN_LABEL_GAP, ROW_LABEL_GAP, centreOf, labelAt, requiredLeftMargin, sceneContentBounds, sceneViewBox } from './scene-layout.js';
import { GEOMETRY } from './scene-vocab.js';
import { heatStyle, identityVar, roleVar, selectionStyle, shapeStyle, textStyle } from './scene-style.js';

// Live playback of an animation spec. The evaluator owns what the frame looks
// like at time t; this only draws it and owns the transport. Learner ink is a
// separate layer, so replay never erases it.
// ponytail: SVG layer for lesson objects, learner ink on top; tldraw shapes
// come in when a lesson needs its full toolset inside the animation.

const DATA_TYPES = ['grid', 'strip', 'bars', 'tokens'];
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
// The evaluator owns every position and value, so scrubbing stays exact.
// Motion only springs the on/off states - what is lit, what just won - which
// settle wherever the evaluator says they are.
const POP = { type: 'spring', stiffness: 520, damping: 26 };
const BAR_GAP = 4; // SPACE: gap between adjacent bars
const fromCentre = { transformBox: 'fill-box', transformOrigin: 'center' };
// Motion places an SVG element's transform origin itself, from originX/originY
// (fractions of the element's own box) - a CSS transformOrigin is overwritten.
const fromBaseline = { transformBox: 'fill-box', originX: 0.5, originY: 1 };
// Is this cell the one the timeline is pointing at? A highlight can name a
// row, a single cell, a list of cell indices, or a bare index, and a sweep
// walks the index itself.
const marked = (object, row, column, index) => {
  const at = object.cellHighlight;
  if (object.sweep != null && Math.floor(object.sweep * (object.values?.length || object.tokens?.length || 1)) === index) return true;
  if (at == null) return false;
  if (Array.isArray(at)) return at.includes(index);
  if (typeof at === 'number') return at === index;
  if (typeof at !== 'object') return false;
  if (at.row != null && at.row !== row) return false;
  if (at.col != null && at.col !== column) return false;
  return true;
};

// The one place STATE's selection overlay becomes an actual shape - see
// scene-style.js's selectionStyle for why the two strokes are fixed,
// universal colours rather than anything read from role, identity or value.
// Every branch that can be selected draws through this, geometry only: a
// rect and a circle today (the grid below, and boxes/nodes whenever they
// wire selection in), a path whenever a trajectory needs one. What must not
// differ between them is the treatment - this is the one function that owns
// it, not a copy per shape.
function SelectionMark({ geometry }) {
  const { outer, inner } = selectionStyle();
  // The magenta ring is offset outward from the shape's own outline (see
  // selectionStyle) so a selected grid cell or strip row carries the same
  // instant read a selected box does, instead of looking like a thicker
  // gridline. Geometry only - the offset is applied to whichever outline this
  // shape has, never per shape kind beyond that.
  if (geometry.kind === 'circle') {
    return (
      <>
        <circle cx={geometry.cx} cy={geometry.cy} r={geometry.r + outer.offset} fill="none" style={{ stroke: outer.stroke }} strokeWidth={outer.strokeWidth} />
        <circle cx={geometry.cx} cy={geometry.cy} r={geometry.r} fill="none" style={{ stroke: inner.stroke }} strokeWidth={inner.strokeWidth} />
      </>
    );
  }
  const { x, y, width, height, rx = 0 } = geometry;
  const spread = outer.offset;
  return (
    <>
      <rect x={x - spread} y={y - spread} width={width + spread * 2} height={height + spread * 2} rx={rx ? rx + spread : 0} fill="none" style={{ stroke: outer.stroke }} strokeWidth={outer.strokeWidth} />
      <rect x={x} y={y} width={width} height={height} rx={rx} fill="none" style={{ stroke: inner.stroke }} strokeWidth={inner.strokeWidth} />
    </>
  );
}

// The mathematical object itself: a table with a row that lights up, a strip
// of numbers that change, a distribution that grows. Labelled rectangles do
// not teach these; the values do.
function DataShape({ object, role, pop, chosen, onInputPick }) {
  // Direct manipulation: an object bound to a learning input turns its items
  // into that input's own REAL controls - clickable, focusable, keyboard-
  // activable - so a 'visual' presentation needs no duplicate strip widget.
  // The activation writes the input and stops there - it must not double as
  // an inspection pick of the whole object.
  const pickItem = object.pickInput && onInputPick
    ? index => event => { event.stopPropagation(); onInputPick(object.pickInput, index); }
    : null;
  const pickProps = pickItem ? (index, lit, name) => ({
    'data-scene-item': index,
    onClick: pickItem(index),
    tabIndex: 0,
    role: 'button',
    'aria-pressed': lit,
    'aria-label': name,
    onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pickItem(index)(event); } },
  }) : null;
  const emphasis = 1 + (object.emphasis || 0) * 0.06;
  // Every number a data shape draws - a cell, a bar's tick, a token's chip -
  // is a datum, not a caption, so all three share the smallest named size.
  // Ink stays the shape's own lit/unlit read, which predates typography and
  // is not what this scale governs.
  const numeral = textStyle('annotation');
  if (object.type === 'grid' || object.type === 'strip') {
    const cell = object.cell || GEOMETRY.cellPitch;
    const columns = object.type === 'strip' ? (object.values?.length || 0) : (object.cols || 1);
    const rows = object.type === 'strip' ? 1 : (object.rows || 1);
    const heatMode = object.heat?.mode;
    // A heat grid reads as a distribution: fill carries the value. VALUE's
    // own scale (validateScene, animation-scene.js) decides whose numbers
    // set that distribution's ends: "local" maximises contrast inside this
    // one object's CURRENT frame - a strip of small numbers spends just as
    // much of the ramp as one of large ones, but makes no cross-object
    // magnitude claim - while "shared"/"fixed" read the domain validateScene
    // already resolved once for the whole scale group, so two objects in the
    // same comparison never independently normalise against each other. See
    // docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md.
    const domain = !heatMode ? null : object.valueScale === 'local' ? (object.values || []).reduce(
      (range, entry) => entry == null ? range : { min: Math.min(range.min, entry), max: Math.max(range.max, entry) },
      { min: Infinity, max: -Infinity },
    ) : object.valueDomain;
    // Resolved once for the whole grid/strip: identity (if this object has
    // one) takes over the hue everywhere role's would otherwise have gone -
    // every cell's ring below and the object's own frame at the bottom of
    // this group - while VALUE keeps sole ownership of a heat cell's fill.
    const hue = identityVar(object.identitySlot) ?? roleVar(role);
    // `distribution: true` (see checkProbabilityClaims, scene-consistency.js)
    // is a row-level claim - "these sum to one" - and independent per-cell
    // rounding can violate it even when every underlying float is right (see
    // distributeRounding's own comment in scene-derive.js). Row by row, not
    // once for the whole object: a grid's rows are separate distributions.
    // This only ever changes what the TEXT below reads - `value` (heat fill,
    // the blocked check, the domain) stays the real float throughout.
    const displayValues = object.distribution
      ? Array.from({ length: rows }, (unused, row) => distributeRounding((object.values || []).slice(row * columns, (row + 1) * columns), 2)).flat()
      : object.values;
    // Every number is formatted once (scene-format.js), and the object's cells
    // share one font size - the one its longest number fits - so a row never
    // mixes sizes because one cell holds a minus sign.
    const cellTexts = (displayValues || []).map(value => (value == null ? '' : formatCell(value, object.numberFormat || undefined)));
    const cellFont = cellNumeralSize(cellTexts, cell, numeral.fontSize);
    // Selection shape, not scene identity, decides how the mark renders: a
    // row-shaped cellHighlight (row set, no col - "this whole row is the
    // thing the learner picked") gets ONE ring around the row band below,
    // never five separately-ringed cells. A cell/list/index highlight keeps
    // its own per-cell ring, same as always. See marked()'s own comment.
    const at = object.cellHighlight;
    const rowSelected = at != null && typeof at === 'object' && !Array.isArray(at) && at.row != null && at.col == null;
    // STATE, not scene identity, carries the selected/related distinction
    // (see scene-style.js's STATE_STYLE): a cellHighlight is a genuine
    // 'selected' pick unless the object opts into 'highlight' instead - the
    // existing highlighted-role-ring treatment for a downstream consequence
    // that must read as distinct from a selection. No scene id or string is
    // read here, only this generic per-object field.
    const highlightKind = object.cellHighlightKind === 'highlight' ? 'highlight' : 'select';
    const cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const value = object.values?.[index];
        const lit = marked(object, row, column, index);
        // A blocked or not-yet-measured cell is a different fact than a real
        // small value, so it never reaches heatStyle - it reads as the role's
        // own muted band, the same look "blocked" already has everywhere else.
        // State (lit) never moves this fill or this base stroke: value owns
        // the fill outright, and identity owns the frame, even while the
        // cell is selected - see the SelectionMark drawn below instead.
        const blocked = heatMode && value == null;
        const cellState = highlightKind === 'highlight' ? { highlighted: lit } : { selected: lit };
        const look = shapeStyle(role, blocked ? { blocked: true } : cellState, undefined, object.identitySlot);
        const heat = heatMode && value != null ? heatStyle(value, domain, heatMode) : null;
        const fill = heat ? `color-mix(in srgb, var(--viz-${heat.fillToken}) ${heat.mixPercent}%, transparent)` : look.fill;
        const ink = heat ? heat.inkToken : (lit ? 'var(--color-ink)' : 'var(--color-ink-2)');
        // INVARIANT: A CONTINUOUSLY VARYING VISUAL PROPERTY MUST HAVE ONE
        // OWNERSHIP PATH FOR THE LIFETIME OF THE ELEMENT. This cell used to
        // read `style={heat ? {fill} : undefined}` / `animate={heat ? ring :
        // {fill, ...ring}}` - keyed on `heat` (this cell's per-value
        // heatStyle() result, which flips between null and real as `value`
        // arrives), not `heatMode` (object.heat?.mode, fixed for the
        // object's whole life). Fill's ownership crossed from `animate`
        // (blocked) to `style` (revealed) on the SAME <motion.rect> - the
        // old rule ("paint a continuous value exactly, never spring it") was
        // obeyed in both branches, which is exactly why this looked correct.
        //
        // Re-keying the branch on the stable `heatMode` was NOT sufficient
        // on its own, proved with an isolated repro outside this component:
        // a fill whose CSS variable reference itself swaps between renders
        // (here, --viz-observed while blocked to --viz-heat-scale once
        // revealed - a different token, not just a different mix percentage
        // of the same one) can still freeze at its first-seen value even
        // with a single, stable `animate`-only ownership path, for this
        // Motion version. Bars' and tokens' own animate-driven fill do NOT
        // freeze the same way under a manual gradual-scrub check (e2e/
        // heat-motion-manual-check.spec.js, run by hand - not automated
        // regression, see its own comment for why) - checked, not assumed -
        // because their lit/unlit states share ONE base token at different
        // mix percentages, which Motion can genuinely interpolate; heat's
        // fill can swap which token it names outright.
        //
        // src/motion-ownership.test.mjs is the actual, deterministic
        // regression coverage: it parses this file's AST and asserts no
        // motion.* element owns one property through both `style` and
        // `animate`, with its own mutation proof against the defect above.
        // The fix: take the fill out of Motion's ownership entirely. A heat
        // cell's fill is a plain, ordinary <rect> - it has exactly one
        // ownership path (React's own re-render, ALWAYS reactive) for its
        // entire life, satisfying the invariant trivially. The ring
        // (stroke/strokeWidth - IDENTITY's hue when this object has one,
        // role's otherwise; a frame, never a quantity or a selection) is a
        // SEPARATE <motion.rect> layered on top, `fill="none"`, so Motion
        // keeps its bouncy pop for state changes without ever touching the
        // property that broke.
        const ring = { stroke: look.stroke, strokeWidth: look.strokeWidth };
        const cellX = object.x + column * cell, cellY = object.y + row * cell;
        cells.push(
          <g key={index} {...(pickProps ? pickProps(index, lit, `${object.semanticId} item ${index + 1}`) : {})}>
            <rect x={cellX} y={cellY} width={cell} height={cell} style={{ fill }} />
            <motion.rect x={cellX} y={cellY} width={cell} height={cell} fill="none"
              animate={ring} transition={pop} />
            {value != null && cell >= 22 && (
              <text x={cellX + cell / 2} y={cellY + cell / 2}
                textAnchor="middle" dominantBaseline="central" fontSize={cellFont} fontWeight={numeral.fontWeight}
                style={{ fontFamily: MONO, fill: ink }}>{cellTexts[index]}</text>
            )}
            {/* Selection is a STATE overlay, drawn on top of - never instead
                of - the cell's own fill and frame, so it stays perceptible
                regardless of what role, identity or value already painted
                there (see SelectionMark's comment). */}
            {lit && !blocked && highlightKind === 'select' && !rowSelected && <SelectionMark geometry={{ kind: 'rect', x: cellX, y: cellY, width: cell, height: cell }} />}
          </g>,
        );
      }
    }
    return (
      <g transform={`translate(${object.x + (object.w || 0) / 2} ${object.y + (object.h || 0) / 2}) scale(${emphasis}) translate(${-(object.x + (object.w || 0) / 2)} ${-(object.y + (object.h || 0) / 2)})`}>
        {cells}
        {/* Axis names, not captions: the same numeral scale as the cells they
            name, one per row down the left and one per column across the top -
            drawn in this same group so they scale and move with the grid. */}
        {object.type === 'grid' && object.rowLabels?.map((text, row) => (
          <text key={`row-label-${row}`} x={object.x - ROW_LABEL_GAP} y={object.y + row * cell + cell / 2}
            textAnchor="end" dominantBaseline="central" fontSize={numeral.fontSize} fontWeight={numeral.fontWeight}
            style={{ fontFamily: MONO, fill: 'var(--color-ink-2)' }}>{text}</text>
        ))}
        {object.type === 'grid' && object.columnLabels?.map((text, column) => (
          <text key={`column-label-${column}`} x={object.x + column * cell + cell / 2} y={object.y - COLUMN_LABEL_GAP}
            textAnchor="middle" fontSize={numeral.fontSize} fontWeight={numeral.fontWeight}
            style={{ fontFamily: MONO, fill: 'var(--color-ink-2)' }}>{text}</text>
        ))}
        {/* Row-shaped selection (row set, no col): one SelectionMark around
            the whole row band, replacing what used to be a differently-styled
            ad hoc rect drawn ON TOP OF five already-ringed cells above - see
            rowSelected's own comment. Same treatment a selected cell gets,
            just sized to the row. */}
        {rowSelected && highlightKind === 'select' && (
          <SelectionMark geometry={{ kind: 'rect', x: object.x, y: object.y + at.row * cell, width: object.w || columns * cell, height: cell }} />
        )}
        <rect x={object.x} y={object.y} width={object.w} height={object.h} rx={4} fill="none" style={{ stroke: hue }} strokeWidth="1.6" />
        {/* Whole-object selection (picked, not a per-cell cellHighlight) -
            migrated onto the same generic SelectionMark the grid's own cells
            already use, rather than the old role-derived 'chosen' fill/stroke
            bump, which read as no visible change at all against a soft-tier
            role. Grid itself is left alone here: its per-cell cellHighlight
            already carries this exact treatment for the case a grid scene
            actually selects. */}
        {chosen && object.type === 'strip' && <SelectionMark geometry={{ kind: 'rect', x: object.x, y: object.y, width: object.w, height: object.h }} />}
      </g>
    );
  }
  if (object.type === 'bars') {
    const values = object.values || [];
    // Same per-object pitch sizeOf froze (animation-scene.js): word-labelled
    // bars author a wider cell so neighbouring labels never run together.
    const pitch = object.cell ?? GEOMETRY.barWidth;
    // An authored peak pins the axis. Without it the scale is recomputed from
    // the tweening values, so bars that never changed visibly shrink while a
    // neighbour grows - the learner watches their own answer move.
    const peak = object.peak ?? Math.max(...values.map(entry => Math.abs(entry ?? 0)), 0.0001);
    const height = object.h || GEOMETRY.barHeight;
    const hue = identityVar(object.identitySlot) ?? roleVar(role);
    return (
      <g>
        <line x1={object.x} y1={object.y + height} x2={object.x + (object.w || 0)} y2={object.y + height} style={{ stroke: hue }} strokeWidth="1.5" />
        {values.map((value, index) => {
          const tall = value == null ? 0 : Math.min(height - 4, Math.max(1, (Math.abs(value) / peak) * (height - 4)));
          const lit = marked(object, 0, index, index) || (object.cellHighlight === 'max' && value != null && value === Math.max(...values.map(entry => entry ?? -Infinity)));
          // Categorical, not value-encoded - a bar's height already carries
          // the number, so its fill is state (is this the one being pointed
          // at) and lands in the role's own band like every other shape.
          // 'strong' is the fallback tier, not 'soft': a resting bar still
          // has to read as a bar, which the soft band's 6-28 does not - see
          // shapeStyle's comment.
          const look = shapeStyle(role, { chosen: lit }, 'strong', object.identitySlot);
          return (
            // The lit bar's pop grows the bar from its own foot, never the bar
            // and its label together from their shared centre: every bar, lit
            // or not, stands on the same baseline and its label stays put.
            <g key={index}>
              <motion.rect x={object.x + index * pitch + BAR_GAP / 2} y={object.y + height - tall} width={pitch - BAR_GAP} height={tall}
                rx={4} animate={{ fill: look.fill, scale: lit ? 1.06 : 1 }} transition={pop} style={fromBaseline} />
              {object.labels?.[index] && (
                <text x={object.x + index * pitch + pitch / 2} y={object.y + height + 12} textAnchor="middle"
                  fontSize={numeral.fontSize} fontWeight={numeral.fontWeight} style={{ fontFamily: MONO, fill: lit ? 'var(--color-ink)' : 'var(--color-ink-2)' }}>{object.labels[index]}</text>
              )}
            </g>
          );
        })}
        {chosen && <SelectionMark geometry={{ kind: 'rect', x: object.x, y: object.y, width: object.w || (values.length * pitch), height }} />}
      </g>
    );
  }
  // Everything past here draws token chips. A data type that reaches this
  // point without being `tokens` has no renderer, and chips would be a
  // confident wrong picture - say so and draw nothing.
  if (object.type !== 'tokens') {
    console.error(`AnimatedScene: no renderer for data type "${object.type}"`);
    return null;
  }
  // display: 'labels' draws the tokens as plain text (the highlighted one
  // emphasised), NOT filled chips - a display-only token sequence that reads as
  // labels, never as a control row. Used where the tokens name a sequence and
  // the actual control lives in the INTERACT zone below.
  const asLabels = object.tokenStyle === 'labels';
  let offset = 0;
  return (
    <g>
      {(object.tokens || []).map((token, index) => {
        const width = CHIP_PAD * 2 + token.length * CHIP_CHAR;
        const x = object.x + offset;
        offset += width + CHIP_GAP;
        const lit = marked(object, 0, index, index);
        const look = shapeStyle(role, { highlighted: lit }, undefined, object.identitySlot);
        if (asLabels) {
          return (
            <text key={index} x={x + width / 2} y={object.y + GEOMETRY.chipHeight / 2} textAnchor="middle" dominantBaseline="central"
              fontSize={numeral.fontSize} fontWeight={lit ? 700 : numeral.fontWeight}
              style={{ fontFamily: MONO, fill: lit ? 'var(--color-ink)' : 'var(--color-ink-2)' }}>{token}</text>
          );
        }
        return (
          <motion.g key={index} {...(pickProps ? pickProps(index, lit, token) : {})}
            animate={{ scale: lit ? 1.12 : 1, y: lit ? -3 : 0 }} transition={pop} style={fromCentre}>
            <motion.rect x={x} y={object.y} width={width} height={GEOMETRY.chipHeight} rx={8}
              animate={{ fill: look.fill, strokeWidth: look.strokeWidth }} style={{ stroke: look.stroke }} transition={pop} />
            {/* Ink follows the chip's own resolved fill (a strong-band role
                paints dark chips; page ink vanished on them in review) - the
                contrast rule everywhere else: change the ink, never the fill. */}
            <text x={x + width / 2} y={object.y + GEOMETRY.chipHeight / 2} textAnchor="middle" dominantBaseline="central"
              fontSize={numeral.fontSize} fontWeight={numeral.fontWeight} style={{ fontFamily: MONO, fill: look.onFill }}>{token}</text>
          </motion.g>
        );
      })}
      {chosen && !asLabels && <SelectionMark geometry={{ kind: 'rect', x: object.x, y: object.y, width: object.w || offset, height: GEOMETRY.chipHeight }} />}
    </g>
  );
}

// labelAt lives in scene-layout.js now, shared with the layout lint (see its
// own comment) - node:test cannot import this .jsx file, so anything the
// lint needs to reason about identically has to live where it can reach it.

// KaTeX is synchronous and pure, so a frame can be typeset in the render pass
// and a scrub never waits on anything. An expression that will not parse shows
// itself rather than throwing the whole animation away.
// ponytail: a type_text reveal on an equation feeds this truncated LaTeX each
// frame, so it shows KaTeX's error rendering until the text completes; give the
// reveal a plain-text mode when a lesson actually types an equation out.
const typeset = expression => {
  try { return katex.renderToString(expression, { throwOnError: false, displayMode: false, output: 'html' }); }
  catch { return null; }
};

function Frame({ scene, state, selecting, marked, onRegion, onPick, picked, pop, onInputPick = null, lockedInputs = [] }) {
  const host = useRef(null);
  const drag = useRef(null);
  const [rectangle, setRectangle] = useState(null);
  // The real rendered box, so the viewBox can be built at the viewport's own
  // aspect instead of the scene's - see sceneViewBox. Until it is measured the
  // scene's declared aspect is the best available guess, which is what the
  // first paint uses; the observer corrects it on the same frame.
  const [aspect, setAspect] = useState(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const read = () => { const box = element.getBoundingClientRect(); if (box.width > 0 && box.height > 0) setAspect(box.width / box.height); };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const point = event => {
    const box = host.current.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  };
  const region = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  const find = at => {
    // Which authored object sits under the marked region, by semantic id. The
    // region arrives in frame fractions, so it is measured against what the
    // camera is currently showing, not against the whole scene.
    const inside = state.objects.filter(object => object.visible && object.w && object.h).filter(object => {
      const left = (object.x - origin.x) / span.w, top = (object.y - origin.y) / span.h;
      const right = (object.x + object.w - origin.x) / span.w, bottom = (object.y + object.h - origin.y) / span.h;
      return at.x < right && at.x + at.w > left && at.y < bottom && at.y + at.h > top;
    });
    return inside.map(object => object.semanticId);
  };
  // The evaluator owns where the camera is; this only spends it. Zoom is about
  // the frame centre, so focusing an object does not also shove it off-screen.
  const visibleObjects = state.objects.filter(object => object.visible);
  // A row label drawing leftward from a grid near the default left edge can
  // need more room than x=0 leaves it (see requiredLeftMargin). Widening the
  // canvas only by what is actually needed leaves every scene without the
  // problem pixel-identical - this only ever extends the left edge further
  // left, never moves authored content or the right edge.
  const leftMargin = requiredLeftMargin(visibleObjects);
  // A scene that authors its own camera work (focus/pan/zoom_camera anywhere
  // on its timeline) keeps exactly the framing it always had - the camera
  // wins, full stop. Everything else gets a generic content-bounds fit
  // instead of trusting the scene's own (habitually oversized) width/height:
  // the app-review framing finding, fixed once, here, rather than per scene.
  const cameraAuthored = scene.timeline.some(event => event.action === 'focus_camera' || event.action === 'pan_camera' || event.action === 'zoom_camera');
  const bounds = cameraAuthored ? null : sceneContentBounds(scene);
  let origin, span;
  if (bounds) {
    // Pad the content and match the VIEWPORT's aspect, not the scene's. The
    // previous fit padded both axes by 15% and then let preserveAspectRatio
    // letterbox the non-limiting one on top of that - the dead space the app
    // review saw around the Transformer Block row. sceneViewBox grows the
    // short axis to the viewport's aspect instead, so the rendered scale is
    // exactly viewport.w / span.w and nothing is paid for twice.
    ({ origin, span } = sceneViewBox(bounds, aspect ?? (scene.width / scene.height)));
  } else {
    const baseSpanW = scene.width / state.camera.zoom;
    span = { w: baseSpanW + leftMargin, h: scene.height / state.camera.zoom };
    origin = { x: state.camera.x - baseSpanW / 2 - leftMargin, y: state.camera.y - span.h / 2 };
  }
  const view = `${origin.x} ${origin.y} ${span.w} ${span.h}`;
  return (
    <div ref={host} data-animation-frame className="relative h-full w-full select-none"
      onPointerDown={event => { if (!selecting || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = point(event); setRectangle(null); }}
      onPointerMove={event => { if (drag.current) setRectangle(region(drag.current, point(event))); }}
      onPointerUp={event => {
        if (!drag.current) return;
        const area = region(drag.current, point(event));
        drag.current = null;
        setRectangle(null);
        if (area.w < 0.02 || area.h < 0.02) return;
        onRegion(area, find(area));
      }}>
      <svg viewBox={view} className="h-full w-full" style={{ background: 'var(--viz-surface)' }}>
        {state.connections.map(connection => {
          const from = state.objects.find(object => object.id === connection.from);
          const to = state.objects.find(object => object.id === connection.to);
          if (!from || !to) return null;
          const start = { x: from.x + (from.w || 0) / 2, y: from.y + (from.h || 0) };
          const end = { x: to.x + (to.w || 0) / 2, y: to.y };
          // Path length interpolation: the line is drawn, not faded in.
          const tipX = start.x + (end.x - start.x) * connection.progress;
          const tipY = start.y + (end.y - start.y) * connection.progress;
          return <line key={connection.key} x1={start.x} y1={start.y} x2={tipX} y2={tipY} style={{ stroke: roleVar('neutral') }} strokeWidth="2.5" strokeLinecap="round" markerEnd={connection.progress > 0.98 ? 'url(#animation-arrow)' : undefined} />;
        })}
        <defs>
          {/* Connections are always drawn in the same grey, so their head is too. */}
          <marker id="animation-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" style={{ fill: roleVar('neutral') }} /></marker>
          {/* An authored arrow carries its own colour, and a head in a different
              colour reads as a mistake. context-stroke takes the colour from the
              line that references it, so one marker serves every arrow. */}
          <marker id="animation-arrow-tinted" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="context-stroke" /></marker>
          <filter id="animation-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.4" style={{ floodColor: 'var(--color-ink)' }} floodOpacity="0.14" />
          </filter>
        </defs>
        {visibleObjects.map(object => {
          const role = object.role;
          const shown = object.textProgress >= 1 ? object.label : object.label.slice(0, Math.round(object.label.length * object.textProgress));
          const chosen = picked === object.semanticId;
          const isText = object.type === 'text' || object.type === 'equation' || object.type === 'code';
          const isCode = object.type === 'code';
          const isEquation = object.type === 'equation';
          const isCircle = object.type === 'circle';
          const isData = DATA_TYPES.includes(object.type);
          const isStroke = object.type === 'arrow' || object.type === 'line';
          const isImage = object.type === 'image';
          const maths = isEquation ? typeset(shown) : null;
          // A circle is placed by its centre, so its label is centred on the
          // same point; boxes centre inside their frame.
          const centre = centreOf(object);
          const label = labelAt(object, { stroke: isStroke, above: isData || isImage, text: isText }, centre, visibleObjects);
          // State never changes which role's colour is shown, only weight and
          // fill strength - one resolved look serves every shape below.
          // IDENTITY (if this object has one) takes the hue role would
          // otherwise have supplied - see shapeStyle's own comment.
          const look = shapeStyle(role, { highlighted: object.highlighted, chosen }, undefined, object.identitySlot);
          // A label is named by what it is doing, not by what it looks like: a
          // text object carries its own typography, every other kind draws a
          // caption on the shape beside it. Circle labels borrow the equation
          // scale because it is the only role sized for a short symbol.
          const type = isData ? textStyle('caption')
            : isCode ? textStyle('code')
            : isEquation ? textStyle('equation')
            : object.type === 'text' ? textStyle(object.typography)
            : textStyle('body');
          // Colour comes from role alone (scene-style.js): a text object with a
          // real role keeps that role's colour, and only a neutral one falls
          // back to its typography's ink. A label sitting INSIDE a shape reads
          // against that shape's own fill, so a solid role hands it the ink
          // that survives there; a data or stroke label sits on the surface
          // and keeps the page's ink.
          const textFill = object.type === 'text'
            ? (role !== 'neutral' ? (identityVar(object.identitySlot) ?? roleVar(role)) : type.fill)
            : (isText || isData ? 'var(--color-ink-2)' : look.onFill);
          return (
            <g key={object.id} data-animation-object={object.semanticId} opacity={object.opacity}
              transform={`rotate(${object.rotation} ${centre.x} ${centre.y})`}
              onClick={() => onPick(object.semanticId)} className="cursor-pointer">
              {/* ponytail: the halo assumes a box - a highlighted stroke draws a
                  stray 10x10 outline at its x/y; give strokes their own halo when
                  a lesson actually highlights one */}
              {object.highlighted && !isText && !isData && (isCircle
                ? <circle cx={centre.x} cy={centre.y} r={(object.w || 60) / 2 + 8} fill="none" strokeOpacity="0.28" strokeWidth="8" style={{ stroke: look.stroke }} />
                : <rect x={object.x - 4} y={object.y - 4} width={(object.w || 0) + 8} height={(object.h || 0) + 8} rx={16} fill="none" strokeOpacity="0.25" strokeWidth="8" style={{ stroke: look.stroke }} />)}
              {isData
                ? <DataShape object={object} role={role} pop={pop} chosen={chosen}
                    onInputPick={object.pickInput && lockedInputs.includes(object.pickInput) ? null : onInputPick} />
                : isImage
                ? (object.crop
                  // A crop is the same picture through a smaller window: the
                  // inner svg normalises the displayed box to 1000x1000 with
                  // the SAME centre-slice fit the plain <image> path uses, so
                  // crop fractions name exactly the region a grid overlaid on
                  // the displayed image names. No second copy of the pixels,
                  // no per-patch asset - one source file, one window onto it.
                  ? <svg x={object.x} y={object.y} width={object.w} height={object.h}
                      viewBox={`${object.crop.x * 1000} ${object.crop.y * 1000} ${object.crop.w * 1000} ${object.crop.h * 1000}`}
                      preserveAspectRatio="xMidYMid slice">
                      <image href={object.src} x="0" y="0" width="1000" height="1000" preserveAspectRatio="xMidYMid slice" />
                    </svg>
                  : <image href={object.src} x={object.x} y={object.y} width={object.w} height={object.h}
                      preserveAspectRatio="xMidYMid slice"
                      style={{ stroke: look.stroke, strokeWidth: look.strokeWidth }} />)
                : isStroke
                ? <line x1={object.from?.x ?? object.x} y1={object.from?.y ?? object.y}
                    x2={object.to?.x ?? object.x} y2={object.to?.y ?? object.y}
                    strokeLinecap="round" style={{ stroke: look.stroke, strokeWidth: look.strokeWidth }}
                    markerEnd={object.type === 'arrow' ? 'url(#animation-arrow-tinted)' : undefined} />
                : isCircle
                ? <circle cx={centre.x} cy={centre.y} r={(object.w || 60) / 2} filter="url(#animation-shadow)" style={{ fill: look.fill, stroke: look.stroke, strokeWidth: look.strokeWidth }} />
                : isText ? null
                  : <rect x={object.x} y={object.y} width={object.w} height={object.h} rx={12}
                      filter="url(#animation-shadow)" style={{ fill: look.fill, stroke: look.stroke, strokeWidth: look.strokeWidth }} />}
              {/* Selection (picked, via onPick/selectedObject) migrated onto
                  the same generic SelectionMark the grid already uses for its
                  cells - see SelectionMark's own comment. Boxes and circles
                  used to rely on shapeStyle's 'chosen' state alone (a role-
                  tinted fill/stroke bump), which World Model's "Selected:
                  action-b" footer exposed as no visible change at all against
                  a soft-tier role - the runtime-boundaries backlog item this
                  closes. */}
              {chosen && !isText && !isData && !isStroke && (isCircle
                ? <SelectionMark geometry={{ kind: 'circle', cx: centre.x, cy: centre.y, r: (object.w || 60) / 2 }} />
                : <SelectionMark geometry={{ kind: 'rect', x: object.x, y: object.y, width: object.w || 0, height: object.h || 0 }} />)}
              {maths && (
                <foreignObject x={object.x} y={object.y} width={object.w} height={object.h}>
                  {/* Only typeset() output may reach this - it is KaTeX markup,
                      never script. A scene's own strings are authored content and
                      must never be set as HTML. */}
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontSize: textStyle('equation').fontSize, color: 'var(--color-ink)' }}
                    dangerouslySetInnerHTML={{ __html: maths }} />
                </foreignObject>
              )}
              {!maths && (
                <text
                  x={label.x} y={label.y} textAnchor={label.anchor} dominantBaseline={label.baseline}
                  fontSize={type.fontSize}
                  fontWeight={type.fontWeight}
                  style={{ fontFamily: type.fontFamily ?? (isCircle ? MONO : 'inherit'), fill: textFill }}>{shown}</text>
              )}
              {/* the full label reserves its space so later objects never shift */}
              {object.textProgress < 1 && <text x={-9999} y={-9999} fontSize={type.fontSize}>{object.label}</text>}
            </g>
          );
        })}
      </svg>
      {(rectangle || marked) && (
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect {...(rectangle || marked)} width={(rectangle || marked).w} height={(rectangle || marked).h} fill="none" style={{ stroke: 'var(--color-danger)' }} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}

export default function AnimatedScene({ block, onChange, onChangeQuiet, onAskRegion }) {
  const [error, setError] = useState('');
  const [scene, setScene] = useState(null);
  const [time, setTime] = useState(block.time || 0);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => onMuted(setMutedState), []);
  const frame = useRef(0);
  const clock = useRef(0);
  const pending = useRef([]); // sound events crossed but not yet resolved to a winner - see the flush below
  const latest = useRef(block);
  latest.current = block;
  const clearMark = () => { setSelecting(false); onChange({ ...block, marked: null, selectedObject: null }); };
  useEffect(() => {
    const key = event => { if (event.key === 'Escape' && (block.marked || block.selectedObject || selecting)) clearMark(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [block.marked, block.selectedObject, selecting]);
  // A scene that declares learning inputs evaluates through the input path:
  // the block's raw persisted values are coerced once and join the derive
  // pool, so the validated scene below IS the scene for this input snapshot.
  // A passive scene takes the old two-argument path verbatim.
  const interactive = Array.isArray(block.scene?.inputs) && block.scene.inputs.length > 0;
  const [evaluated, setEvaluated] = useState(null);
  // The learner's raw values plus whatever commitment has revealed (a hidden
  // reveal latch is an activity fact, never a control) - one merged snapshot
  // for rendering, checks and the composer context alike.
  const inputsKey = interactive ? JSON.stringify([block.inputs || {}, revealHiddenInputs(block)]) : '';
  useEffect(() => {
    try {
      if (interactive) {
        const result = evaluateScene(block.scene, 0, { ...(block.inputs || {}), ...revealHiddenInputs(block) });
        setEvaluated(result);
        setScene(result.scene);
      } else {
        setEvaluated(null);
        setScene(validateScene(block.scene));
      }
      setError('');
    } catch (problem) { setError(problem.message); setScene(null); }
  }, [block.scene, inputsKey]);
  // Changing a learning input pauses playback and keeps the current time -
  // the scrubber never jumps because the learner asked a what-if question.
  // live: a mid-gesture update (a slider sweep) - accepted and visible to
  // every reader immediately, but through the quiet path so one drag is not
  // fifteen undo steps. The gesture's final call commits normally.
  const setInput = (name, value, { live = false } = {}) => {
    const next = applyInputToBlock(latest.current, name, value);
    if (next === latest.current) return;
    setPlaying(false);
    (live && onChangeQuiet ? onChangeQuiet : onChange)(next);
  };
  // Which inputs the active practice has locked - the widgets show it and
  // the command path enforces it (applyInputToBlock refuses locked names).
  const lockedInputs = lockedInputNames(block);
  // Only this card's experiment resets: declared inputs return, the inspected
  // object and marked region clear, notes and every other card stay put.
  // While practising, the task's locked inputs stay exactly where the task
  // put them - reset may not drift the diagram off the graded state.
  const resetExperiment = () => {
    setPlaying(false);
    setSelecting(false);
    const kept = latest.current.practiceActive && latest.current.activity?.fixedInputs ? { ...latest.current.activity.fixedInputs } : {};
    onChange({ ...latest.current, inputs: kept, inputRevision: (latest.current.inputRevision || 0) + 1, marked: null, selectedObject: null });
  };
  useEffect(() => {
    if (!playing || !scene) return;
    clock.current = performance.now() - time * 1000;
    // Sound is triggered here only - never on a scrub, which sets time
    // directly and never runs this loop. Sorted once so a bucket's earliest
    // member is always at index 0, which the flush below depends on.
    const soundEvents = scene.timeline.filter(event => event.sound).sort((a, b) => a.at - b.at);
    pending.current = [];
    // A bucket can only be resolved once no later crossing could still land
    // inside its coalescing window - a crossing this frame lands at `upto` at
    // the earliest, so once `upto` is already more than the window past a
    // bucket's anchor, that bucket's membership is final.
    const flush = upto => {
      while (pending.current.length && upto - pending.current[0].at > COALESCE_WINDOW) {
        const anchor = pending.current[0].at;
        const closed = [];
        while (pending.current.length && pending.current[0].at - anchor <= COALESCE_WINDOW) closed.push(pending.current.shift());
        if (!isMuted()) coalesce(closed).forEach(event => playSound(event.sound));
      }
    };
    let cursor = time;
    let first = true;
    const tick = now => {
      const next = (now - clock.current) / 1000;
      const finished = next >= scene.duration;
      const upto = finished ? scene.duration : next;
      if (soundEvents.length) {
        pending.current.push(...crossed(soundEvents, cursor, upto, { start: first }));
        flush(upto);
      }
      cursor = upto;
      first = false;
      if (finished) { flush(Infinity); setTime(scene.duration); setPlaying(false); return; }
      setTime(next);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, scene, run]);
  // The paused moment is what a question refers to, so it is committed on
  // every scrub. It goes through the quiet path because scrubbing is a view
  // change and must not be able to destroy the learner's undo history.
  useEffect(() => {
    if (playing || !scene) return;
    (onChangeQuiet || onChange)({ ...latest.current, time: Number(time.toFixed(2)) });
  }, [playing, time]);
  // The evaluator is time-in, state-out, so honouring reduced motion costs a
  // constant and a branch: states settle where they already were going.
  const still = useReducedMotion();
  const pop = still ? { duration: 0 } : POP;
  if (error) return <div className="grid min-h-24 place-content-center p-4 text-center text-xs text-red-700">{error}</div>;
  if (!scene) return null;
  const state = getSceneState(scene, time);
  const pauseAnd = run => { setPlaying(false); run(); };
  const atEnd = time >= scene.duration - 0.001;
  const play = () => {
    if (still) { setTime(atEnd ? 0 : scene.duration); return; }   // no motion: show the end, do not travel to it
    if (atEnd && !playing) setTime(0);
    setPlaying(value => !value);
  };
  // Replay while already playing leaves `playing` true, so the loop effect
  // below would not re-run and its clock would keep counting from the old
  // start - the time jumped to 0 and was overwritten on the very next frame.
  // The run counter is what actually restarts it.
  const replay = () => { setTime(0); setRun(count => count + 1); if (!still) setPlaying(true); };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" onPointerDown={event => event.stopPropagation()}>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-white">
        <Frame scene={scene} state={state} selecting={selecting} marked={block.marked} picked={block.selectedObject} pop={pop}
          onInputPick={interactive ? setInput : null} lockedInputs={lockedInputs}
          onPick={semanticId => onChange({ ...block, selectedObject: semanticId })}
          onRegion={(area, targets) => {
            setSelecting(false);
            const next = { ...block, marked: area, time: Number(time.toFixed(2)), selectedObject: targets[0] || block.selectedObject || null };
            onChange(next);
            // Ambiguous marks name every candidate rather than guessing one.
            onAskRegion?.(next, { region: area, time: Number(time.toFixed(2)), targets });
          }} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" data-animation-play onClick={play}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-hover">
          {playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
        </button>
        <button type="button" data-animation-replay title="Replay from the start" onClick={replay}
          className="flex h-8 items-center rounded-lg border border-line px-2.5 hover:bg-hover"><RotateCcw size={13} /></button>
        {/* Item 6 (app-review): a mute control for a scene with no sound
            events at all is a control that lies about what it does. Hidden,
            not merely disabled - scene.timeline is the same source of truth
            the playback effect above already filters on (soundEvents), so
            "has sound" here can never disagree with what actually plays. */}
        {scene.timeline.some(event => event.sound) && (
          <button type="button" data-animation-mute title={muted ? 'Unmute' : 'Mute'} aria-pressed={muted}
            onClick={() => setMuted(!muted)}
            className="flex h-8 items-center rounded-lg border border-line px-2.5 hover:bg-hover">
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        )}
        <button type="button" data-animation-select
          title={block.marked ? 'Clear the marked region' : 'Mark a region to ask about'} aria-pressed={selecting}
          onClick={() => (block.marked ? clearMark() : pauseAnd(() => setSelecting(value => !value)))}
          className={`flex h-8 items-center rounded-lg border px-2.5 ${selecting ? 'border-red-600 bg-red-50 text-red-600' : 'border-line hover:bg-hover'}`}>
          {block.marked ? <X size={13} /> : <Scan size={13} />}
        </button>
        <input type="range" aria-label="Animation time" min={0} max={scene.duration} step={0.05} value={time}
          onChange={event => pauseAnd(() => setTime(Number(event.target.value)))} className="h-8 min-w-0 flex-1 accent-accent" />
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-2">{time.toFixed(1)}s</span>
      </div>
      {/* INTERACT zone: the controls that change the concept, below the
          visualization and its transport, never scattered inside the diagram
          (spec: inside the visual = understand, below = manipulate). Direct
          on-scene manipulation stays as a synchronized shortcut. */}
      {interactive && evaluated && (
        <SceneControls declarations={evaluated.declarations} inputs={evaluated.inputs}
          data={block.scene.exampleData} onInput={setInput} onReset={resetExperiment} locked={lockedInputs} />
      )}
      {(block.selectedObject || block.marked) && (
        <p data-animation-selection className="flex shrink-0 items-center gap-2 text-[11px] text-ink-3">
          {block.selectedObject ? `Selected: ${block.selectedObject}` : 'Region marked'} at {(block.time ?? time).toFixed(1)}s
          <button type="button" data-animation-clear onClick={clearMark} className="rounded px-1.5 py-0.5 text-ink-2 hover:bg-hover hover:text-ink">clear</button>
          <span>or press Esc</span>
        </p>
      )}
    </div>
  );
}
