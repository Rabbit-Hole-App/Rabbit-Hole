import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, RotateCcw, Scan, X } from 'lucide-react';
import { BAR, CHIP, getSceneState, validateScene } from './animation-scene.js';

// Live playback of an animation spec. The evaluator owns what the frame looks
// like at time t; this only draws it and owns the transport. Learner ink is a
// separate layer, so replay never erases it.
// ponytail: SVG layer for lesson objects, learner ink on top; tldraw shapes
// come in when a lesson needs its full toolset inside the animation.

const COLORS = { box: '#2383e2', circle: '#7c3aed', text: '#37352f', grid: '#2383e2', strip: '#7c3aed', bars: '#1a7f37', tokens: '#e8590c' };
const DATA_TYPES = ['grid', 'strip', 'bars', 'tokens'];
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
// The evaluator owns every position and value, so scrubbing stays exact.
// Motion only springs the on/off states - what is lit, what just won - which
// settle wherever the evaluator says they are.
const POP = { type: 'spring', stiffness: 520, damping: 26 };
const fromCentre = { transformBox: 'fill-box', transformOrigin: 'center' };
const num = value => (Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2).replace(/^(-?)0\./, '$1.'));
// Is this cell the one the timeline is pointing at? A highlight can name a
// row, a single cell, or a bare index, and a sweep walks the index itself.
const marked = (object, row, column, index) => {
  const at = object.cellHighlight;
  if (object.sweep != null && Math.floor(object.sweep * (object.values?.length || object.tokens?.length || 1)) === index) return true;
  if (at == null) return false;
  if (typeof at === 'number') return at === index;
  if (typeof at !== 'object') return false;
  if (at.row != null && at.row !== row) return false;
  if (at.col != null && at.col !== column) return false;
  return true;
};

// The mathematical object itself: a table with a row that lights up, a strip
// of numbers that change, a distribution that grows. Labelled rectangles do
// not teach these; the values do.
function DataShape({ object, colour }) {
  const emphasis = 1 + (object.emphasis || 0) * 0.06;
  if (object.type === 'grid' || object.type === 'strip') {
    const cell = object.cell || 18;
    const columns = object.type === 'strip' ? (object.values?.length || 0) : (object.cols || 1);
    const rows = object.type === 'strip' ? 1 : (object.rows || 1);
    const cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const value = object.values?.[index];
        const lit = marked(object, row, column, index);
        cells.push(
          <g key={index}>
            <motion.rect x={object.x + column * cell} y={object.y + row * cell} width={cell} height={cell}
              animate={{ fill: lit ? tint(colour, '33') : tint(colour, '0a'), stroke: lit ? colour : tint(colour, '33'), strokeWidth: lit ? 1.4 : 0.6 }}
              transition={POP} />
            {value != null && cell >= 22 && (
              <text x={object.x + column * cell + cell / 2} y={object.y + row * cell + cell / 2}
                textAnchor="middle" dominantBaseline="central" fontSize={Math.min(12, cell * 0.42)}
                fill={lit ? '#37352f' : '#787774'} style={{ fontFamily: MONO }}>{num(value)}</text>
            )}
          </g>,
        );
      }
    }
    return (
      <g transform={`translate(${object.x + (object.w || 0) / 2} ${object.y + (object.h || 0) / 2}) scale(${emphasis}) translate(${-(object.x + (object.w || 0) / 2)} ${-(object.y + (object.h || 0) / 2)})`}>
        {cells}
        {object.cellHighlight?.row != null && (
          <motion.rect key={`band-${object.cellHighlight.row}`} initial={{ opacity: 0, scaleX: 0.92 }} animate={{ opacity: 1, scaleX: 1 }} transition={POP} style={fromCentre}
            x={object.x - 3} y={object.y + object.cellHighlight.row * cell - 3} width={(object.w || 0) + 6} height={cell + 6}
            rx={4} fill="none" stroke={colour} strokeWidth="2.4" />
        )}
        <rect x={object.x} y={object.y} width={object.w} height={object.h} rx={3} fill="none" stroke={colour} strokeWidth="1.6" />
      </g>
    );
  }
  if (object.type === 'bars') {
    const values = object.values || [];
    const peak = Math.max(...values.map(Math.abs), 0.0001);
    const height = object.h || BAR.h;
    return (
      <g>
        <line x1={object.x} y1={object.y + height} x2={object.x + (object.w || 0)} y2={object.y + height} stroke={tint(colour, '55')} strokeWidth="1.5" />
        {values.map((value, index) => {
          const tall = Math.max(1, (Math.abs(value) / peak) * (height - 4));
          const lit = marked(object, 0, index, index) || (object.cellHighlight === 'max' && value === Math.max(...values));
          return (
            <motion.g key={index} animate={{ scale: lit ? 1.06 : 1 }} transition={POP} style={fromCentre}>
              <motion.rect x={object.x + index * BAR.w + 3} y={object.y + height - tall} width={BAR.w - 6} height={tall}
                rx={2.5} animate={{ fill: lit ? colour : tint(colour, '59') }} transition={POP} />
              {object.labels?.[index] && (
                <text x={object.x + index * BAR.w + BAR.w / 2} y={object.y + height + 13} textAnchor="middle"
                  fontSize="10" fill={lit ? '#37352f' : '#9b9a97'} style={{ fontFamily: MONO }}>{object.labels[index]}</text>
              )}
            </motion.g>
          );
        })}
      </g>
    );
  }
  let offset = 0;
  return (
    <g>
      {(object.tokens || []).map((token, index) => {
        const width = CHIP.pad * 2 + token.length * CHIP.char;
        const x = object.x + offset;
        offset += width + CHIP.gap;
        const lit = marked(object, 0, index, index);
        return (
          <motion.g key={index} animate={{ scale: lit ? 1.12 : 1, y: lit ? -3 : 0 }} transition={POP} style={fromCentre}>
            <motion.rect x={x} y={object.y} width={width} height={CHIP.h} rx={7}
              animate={{ fill: lit ? tint(colour, '33') : tint(colour, '12'), strokeWidth: lit ? 1.8 : 0.9 }} stroke={colour} transition={POP} />
            <text x={x + width / 2} y={object.y + CHIP.h / 2} textAnchor="middle" dominantBaseline="central"
              fontSize="14" fill="#37352f" style={{ fontFamily: MONO }}>{token}</text>
          </motion.g>
        );
      })}
    </g>
  );
}
// A tint of the object's own colour, so a scene reads as a diagram rather
// than a grid of white rectangles.
const tint = (colour, alpha) => `${colour}${alpha}`;

function Frame({ scene, state, selecting, marked, onRegion, onPick, picked }) {
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
      <svg viewBox={view} className="h-full w-full bg-[#fbfbfa]">
        {state.connections.map(connection => {
          const from = state.objects.find(object => object.id === connection.from);
          const to = state.objects.find(object => object.id === connection.to);
          if (!from || !to) return null;
          const start = { x: from.x + (from.w || 0) / 2, y: from.y + (from.h || 0) };
          const end = { x: to.x + (to.w || 0) / 2, y: to.y };
          // Path length interpolation: the line is drawn, not faded in.
          const tipX = start.x + (end.x - start.x) * connection.progress;
          const tipY = start.y + (end.y - start.y) * connection.progress;
          return <line key={connection.key} x1={start.x} y1={start.y} x2={tipX} y2={tipY} stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" markerEnd={connection.progress > 0.98 ? 'url(#animation-arrow)' : undefined} />;
        })}
        <defs>
          {/* ponytail: one grey head for every stroke - a coloured or selected
              arrow gets a mismatched tip; needs context-stroke or a marker per
              colour when a lesson authors coloured arrows */}
          <marker id="animation-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#94a3b8" /></marker>
          <filter id="animation-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodColor="#37352f" floodOpacity="0.14" />
          </filter>
        </defs>
        {state.objects.filter(object => object.visible).map(object => {
          const colour = object.color || COLORS[object.type] || '#37352f';
          const shown = object.textProgress >= 1 ? object.label : object.label.slice(0, Math.round(object.label.length * object.textProgress));
          const chosen = picked === object.semanticId;
          const isText = object.type === 'text' || object.type === 'equation' || object.type === 'code';
          const isCircle = object.type === 'circle';
          const isData = DATA_TYPES.includes(object.type);
          const isStroke = object.type === 'arrow' || object.type === 'line';
          // A circle is placed by its centre, so its label is centred on the
          // same point; boxes centre inside their frame.
          const centre = isCircle ? { x: object.x, y: object.y } : { x: object.x + (object.w || 0) / 2, y: object.y + (object.h || 0) / 2 };
          return (
            <g key={object.id} data-animation-object={object.semanticId} opacity={object.opacity}
              transform={`rotate(${object.rotation} ${centre.x} ${centre.y})`}
              onClick={() => onPick(object.semanticId)} className="cursor-pointer">
              {/* ponytail: the halo assumes a box - a highlighted stroke draws a
                  stray 10x10 outline at its x/y; give strokes their own halo when
                  a lesson actually highlights one */}
              {object.highlighted && !isText && !isData && (isCircle
                ? <circle cx={centre.x} cy={centre.y} r={(object.w || 60) / 2 + 7} fill="none" stroke={colour} strokeOpacity="0.28" strokeWidth="6" />
                : <rect x={object.x - 5} y={object.y - 5} width={(object.w || 0) + 10} height={(object.h || 0) + 10} rx={14} fill="none" stroke={colour} strokeOpacity="0.25" strokeWidth="6" />)}
              {isData
                ? <DataShape object={object} colour={colour} />
                : isStroke
                ? <line x1={object.from?.x ?? object.x} y1={object.from?.y ?? object.y}
                    x2={object.to?.x ?? object.x} y2={object.to?.y ?? object.y}
                    stroke={chosen ? '#b42318' : colour} strokeWidth={chosen ? 3.5 : 2.5} strokeLinecap="round"
                    markerEnd={object.type === 'arrow' ? 'url(#animation-arrow)' : undefined} />
                : isCircle
                ? <circle cx={centre.x} cy={centre.y} r={(object.w || 60) / 2} fill={tint(colour, '1a')} stroke={chosen ? '#b42318' : colour} strokeWidth={chosen ? 3 : 2} filter="url(#animation-shadow)" />
                : isText ? null
                  : <rect x={object.x} y={object.y} width={object.w} height={object.h} rx={12}
                      fill={tint(colour, object.highlighted ? '1f' : '0f')} stroke={chosen ? '#b42318' : colour} strokeWidth={chosen ? 3 : 1.5} filter="url(#animation-shadow)" />}
              <text
                x={isData || isText || isStroke ? (isStroke ? object.from?.x ?? object.x : object.x) : centre.x}
                y={isData ? object.y - 10 : isText ? object.y : isStroke ? (object.from?.y ?? object.y) - 8 : centre.y}
                textAnchor={isData || isText || isStroke ? 'start' : 'middle'}
                dominantBaseline={isData || isText || isStroke ? 'auto' : 'central'}
                fontSize={isCircle ? 16 : 13}
                fontWeight={isCircle ? 600 : isData ? 500 : isText ? 400 : 500}
                fill={isText ? '#787774' : isData ? '#787774' : '#37352f'}
                style={{ fontFamily: isCircle ? MONO : 'inherit' }}>{shown}</text>
              {/* the full label reserves its space so later objects never shift */}
              {object.textProgress < 1 && <text x={-9999} y={-9999} fontSize="13">{object.label}</text>}
            </g>
          );
        })}
      </svg>
      {(rectangle || marked) && (
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect {...(rectangle || marked)} width={(rectangle || marked).w} height={(rectangle || marked).h} fill="none" stroke="#dc2626" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}

export default function AnimatedScene({ block, onChange, onAskRegion }) {
  const [error, setError] = useState('');
  const [scene, setScene] = useState(null);
  const [time, setTime] = useState(block.time || 0);
  const [playing, setPlaying] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const frame = useRef(0);
  const clock = useRef(0);
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
    const tick = now => {
      const next = (now - clock.current) / 1000;
      if (next >= scene.duration) { setTime(scene.duration); setPlaying(false); return; }
      setTime(next);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, scene]);
  // The paused moment is what a question refers to, so it is committed - on
  // every scrub, not only when playback stops. A commit snapshots the canvas
  // for undo, so let the gesture settle first: one commit per scrub rather
  // than one per 0.05s tick, which would blow the 100-entry undo ring.
  // While playing, `playing` is true and nothing commits, so the rAF loop
  // never writes per frame.
  useEffect(() => {
    if (playing || !scene) return undefined;
    const settle = setTimeout(() => onChange({ ...latest.current, time: Number(time.toFixed(2)) }), 150);
    return () => clearTimeout(settle);
  }, [playing, time]);
  if (error) return <div className="grid min-h-24 place-content-center p-4 text-center text-xs text-red-700">{error}</div>;
  if (!scene) return null;
  const state = getSceneState(scene, time);
  const pauseAnd = run => { setPlaying(false); run(); };
  const atEnd = time >= scene.duration - 0.001;
  const play = () => { if (atEnd && !playing) setTime(0); setPlaying(value => !value); };
  const replay = () => { setTime(0); setPlaying(true); };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" onPointerDown={event => event.stopPropagation()}>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-white">
        <Frame scene={scene} state={state} selecting={selecting} marked={block.marked} picked={block.selectedObject}
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
