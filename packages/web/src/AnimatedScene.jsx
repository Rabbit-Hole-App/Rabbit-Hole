import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Pause, Play, RotateCcw, Scan, Volume2, VolumeX, X } from 'lucide-react';
import katex from 'katex';
import { CHIP_CHAR, CHIP_GAP, CHIP_PAD, getSceneState, validateScene } from './animation-scene.js';
import { isMuted, onMuted, setMuted } from './learn-audio.js';
import { COALESCE_WINDOW, coalesce, crossed, play as playSound } from './scene-sound.js';
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
const ROW_LABEL_GAP = 8; // SPACE: gap between a row label and the grid's left edge
const COLUMN_LABEL_GAP = 8; // SPACE: gap between a column label and the grid's top edge
const fromCentre = { transformBox: 'fill-box', transformOrigin: 'center' };
const num = value => (Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2).replace(/^(-?)0\./, '$1.'));
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
  if (geometry.kind === 'circle') {
    return (
      <>
        <circle cx={geometry.cx} cy={geometry.cy} r={geometry.r} fill="none" style={{ stroke: outer.stroke }} strokeWidth={outer.strokeWidth} />
        <circle cx={geometry.cx} cy={geometry.cy} r={geometry.r} fill="none" style={{ stroke: inner.stroke }} strokeWidth={inner.strokeWidth} />
      </>
    );
  }
  const { x, y, width, height, rx = 0 } = geometry;
  return (
    <>
      <rect x={x} y={y} width={width} height={height} rx={rx} fill="none" style={{ stroke: outer.stroke }} strokeWidth={outer.strokeWidth} />
      <rect x={x} y={y} width={width} height={height} rx={rx} fill="none" style={{ stroke: inner.stroke }} strokeWidth={inner.strokeWidth} />
    </>
  );
}

// The mathematical object itself: a table with a row that lights up, a strip
// of numbers that change, a distribution that grows. Labelled rectangles do
// not teach these; the values do.
function DataShape({ object, role, pop }) {
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
    // A heat grid reads as a distribution: fill carries the value, so the
    // shape is visible before a single numeral is read. The domain is the
    // object's own authored values, not a fixed range, so a strip of small
    // numbers spends just as much of the ramp as one of large ones.
    const domain = heatMode ? (object.values || []).reduce(
      (range, entry) => entry == null ? range : { min: Math.min(range.min, entry), max: Math.max(range.max, entry) },
      { min: Infinity, max: -Infinity },
    ) : null;
    // Resolved once for the whole grid/strip: identity (if this object has
    // one) takes over the hue everywhere role's would otherwise have gone -
    // every cell's ring below and the object's own frame at the bottom of
    // this group - while VALUE keeps sole ownership of a heat cell's fill.
    const hue = identityVar(object.identitySlot) ?? roleVar(role);
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
        const look = shapeStyle(role, blocked ? { blocked: true } : { highlighted: lit }, undefined, object.identitySlot);
        const heat = heatMode && value != null ? heatStyle(value, domain, heatMode) : null;
        const fill = heat ? `color-mix(in srgb, var(--viz-${heat.fillToken}) ${heat.mixPercent}%, transparent)` : look.fill;
        const ink = heat ? heat.inkToken : (lit ? 'var(--color-ink)' : 'var(--color-ink-2)');
        // Motion may spring a value only while that value is discrete. A heat
        // fill is a continuous function of the cell's number, so it is
        // painted exactly (style); the ring is still a binary lit/unlit
        // state and keeps its pop (animate). The ring's colour is IDENTITY's
        // hue when this object has one, role's otherwise (look.stroke - see
        // shapeStyle) - a frame, never a quantity or a selection, so it
        // never competes with either even when heat owns the fill beneath it.
        const ring = { stroke: look.stroke, strokeWidth: look.strokeWidth };
        const cellX = object.x + column * cell, cellY = object.y + row * cell;
        cells.push(
          <g key={index}>
            <motion.rect x={cellX} y={cellY} width={cell} height={cell}
              style={heat ? { fill } : undefined}
              animate={heat ? ring : { fill, ...ring }}
              transition={pop} />
            {value != null && cell >= 22 && (
              <text x={cellX + cell / 2} y={cellY + cell / 2}
                textAnchor="middle" dominantBaseline="central" fontSize={Math.min(numeral.fontSize, cell * 0.42)} fontWeight={numeral.fontWeight}
                style={{ fontFamily: MONO, fill: ink }}>{num(value)}</text>
            )}
            {/* Selection is a STATE overlay, drawn on top of - never instead
                of - the cell's own fill and frame, so it stays perceptible
                regardless of what role, identity or value already painted
                there (see SelectionMark's comment). */}
            {lit && !blocked && <SelectionMark geometry={{ kind: 'rect', x: cellX, y: cellY, width: cell, height: cell }} />}
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
            style={{ fontFamily: MONO, fill: 'var(--color-ink-3)' }}>{text}</text>
        ))}
        {object.type === 'grid' && object.columnLabels?.map((text, column) => (
          <text key={`column-label-${column}`} x={object.x + column * cell + cell / 2} y={object.y - COLUMN_LABEL_GAP}
            textAnchor="middle" fontSize={numeral.fontSize} fontWeight={numeral.fontWeight}
            style={{ fontFamily: MONO, fill: 'var(--color-ink-3)' }}>{text}</text>
        ))}
        {object.cellHighlight?.row != null && (
          <motion.rect key={`band-${object.cellHighlight.row}`} initial={{ opacity: 0, scaleX: 0.92 }} animate={{ opacity: 1, scaleX: 1 }} transition={pop} style={{ ...fromCentre, stroke: hue }}
            x={object.x - 4} y={object.y + object.cellHighlight.row * cell - 4} width={(object.w || 0) + 8} height={cell + 8}
            rx={4} fill="none" strokeWidth="2.4" />
        )}
        <rect x={object.x} y={object.y} width={object.w} height={object.h} rx={4} fill="none" style={{ stroke: hue }} strokeWidth="1.6" />
      </g>
    );
  }
  if (object.type === 'bars') {
    const values = object.values || [];
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
            <motion.g key={index} animate={{ scale: lit ? 1.06 : 1 }} transition={pop} style={fromCentre}>
              <motion.rect x={object.x + index * GEOMETRY.barWidth + BAR_GAP / 2} y={object.y + height - tall} width={GEOMETRY.barWidth - BAR_GAP} height={tall}
                rx={4} animate={{ fill: look.fill }} transition={pop} />
              {object.labels?.[index] && (
                <text x={object.x + index * GEOMETRY.barWidth + GEOMETRY.barWidth / 2} y={object.y + height + 12} textAnchor="middle"
                  fontSize={numeral.fontSize} fontWeight={numeral.fontWeight} style={{ fontFamily: MONO, fill: lit ? 'var(--color-ink)' : 'var(--color-ink-3)' }}>{object.labels[index]}</text>
              )}
            </motion.g>
          );
        })}
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
  let offset = 0;
  return (
    <g>
      {(object.tokens || []).map((token, index) => {
        const width = CHIP_PAD * 2 + token.length * CHIP_CHAR;
        const x = object.x + offset;
        offset += width + CHIP_GAP;
        const lit = marked(object, 0, index, index);
        const look = shapeStyle(role, { highlighted: lit }, undefined, object.identitySlot);
        return (
          <motion.g key={index} animate={{ scale: lit ? 1.12 : 1, y: lit ? -3 : 0 }} transition={pop} style={fromCentre}>
            <motion.rect x={x} y={object.y} width={width} height={GEOMETRY.chipHeight} rx={8}
              animate={{ fill: look.fill, strokeWidth: look.strokeWidth }} style={{ stroke: look.stroke }} transition={pop} />
            <text x={x + width / 2} y={object.y + GEOMETRY.chipHeight / 2} textAnchor="middle" dominantBaseline="central"
              fontSize={numeral.fontSize} fontWeight={numeral.fontWeight} style={{ fontFamily: MONO, fill: 'var(--color-ink)' }}>{token}</text>
          </motion.g>
        );
      })}
    </g>
  );
}

// Where a label sits depends on what it is labelling: a box or circle centres it,
// a stroke pins it to its start, and everything that owns a frame - data grids,
// images - hangs it above the top edge. One place, so the next type added does
// not grow a fifth condition into four attributes.
const labelAt = (object, kind, centre) => {
  if (kind.stroke) return { x: object.from?.x ?? object.x, y: (object.from?.y ?? object.y) - 8, anchor: 'start', baseline: 'auto' };
  // A grid that also names its columns needs its own title pushed clear of
  // those headers - both read top-down as title, then header, then cell - or
  // the two would print on top of each other just above the grid.
  if (kind.above) return { x: object.x, y: object.y - (object.type === 'grid' && object.columnLabels?.length ? 24 : 10), anchor: 'start', baseline: 'auto' };
  if (kind.text) return { x: object.x, y: object.y, anchor: 'start', baseline: 'auto' };
  return { x: centre.x, y: centre.y, anchor: 'middle', baseline: 'central' };
};

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

function Frame({ scene, state, selecting, marked, onRegion, onPick, picked, pop }) {
  const host = useRef(null);
  const drag = useRef(null);
  const [rectangle, setRectangle] = useState(null);
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
  const span = { w: scene.width / state.camera.zoom, h: scene.height / state.camera.zoom };
  const origin = { x: state.camera.x - span.w / 2, y: state.camera.y - span.h / 2 };
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
        {state.objects.filter(object => object.visible).map(object => {
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
          const centre = isCircle ? { x: object.x, y: object.y } : { x: object.x + (object.w || 0) / 2, y: object.y + (object.h || 0) / 2 };
          const label = labelAt(object, { stroke: isStroke, above: isData || isImage, text: isText }, centre);
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
                ? <DataShape object={object} role={role} pop={pop} />
                : isImage
                ? <image href={object.src} x={object.x} y={object.y} width={object.w} height={object.h}
                    preserveAspectRatio="xMidYMid slice"
                    style={{ stroke: look.stroke, strokeWidth: look.strokeWidth }} />
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
  useEffect(() => {
    try { setScene(validateScene(block.scene)); setError(''); }
    catch (problem) { setError(problem.message); setScene(null); }
  }, [block.scene]);
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
        <button type="button" data-animation-mute title={muted ? 'Unmute' : 'Mute'} aria-pressed={muted}
          onClick={() => setMuted(!muted)}
          className="flex h-8 items-center rounded-lg border border-line px-2.5 hover:bg-hover">
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
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
