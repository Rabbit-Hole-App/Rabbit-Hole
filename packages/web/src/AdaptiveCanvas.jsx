import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Circle, Diamond, Eraser, Hand, Hexagon, Highlighter, Minus, MousePointer2, Pencil, Plus, Slash, Spline, Square, Star, StickyNote, Triangle, Type } from 'lucide-react';
import { Md } from './ask.jsx';
import { IconBtn } from './ui.jsx';

// The adaptive lesson canvas: a plain React surface (no tldraw). The world is
// unbounded — a translate/scale camera pans and zooms it. Chat exchanges land
// as movable cards; the learner adds ink, shapes, stickies and text from the
// right-hand toolbar. Hand or empty-space drag pans; wheel pans, ctrl+wheel
// zooms.
// ponytail: canvas content is not persisted yet; save/restore comes with the
// lesson content model.

const NAV_TOOLS = [
  ['select', MousePointer2, 'Select and move'],
  ['hand', Hand, 'Hand — pan the canvas'],
];
const DRAW_TOOLS = [
  ['pen', Pencil, 'Pen'],
  ['highlighter', Highlighter, 'Highlighter'],
  ['eraser', Eraser, 'Eraser'],
  ['text', Type, 'Text'],
  ['sticky', StickyNote, 'Sticky note'],
];
const SHAPE_TOOLS = [
  ['rect', Square, 'Rectangle'],
  ['ellipse', Circle, 'Ellipse'],
  ['triangle', Triangle, 'Triangle'],
  ['diamond', Diamond, 'Diamond'],
  ['hexagon', Hexagon, 'Hexagon'],
  ['star', Star, 'Star'],
  ['line', Slash, 'Line'],
  ['arrow', ArrowUpRight, 'Arrow'],
  ['curve', Spline, 'Curved arrow'],
];
const COLORS = ['#37352f', '#2383e2', '#b42318', '#1a7f37', '#f59e0b', '#7c3aed'];
const WIDTHS = [2, 3.5, 6];
const COLUMN = 560;
const POLYGONS = {
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  star: Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 0.21 : 0.5;
    return [0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle)];
  }),
};

// Pointer drag with a live apply callback; used by blocks, stickies, text,
// shapes and panning. scale converts screen pixels to world units.
function startDrag(event, origin, apply, scale = 1) {
  event.preventDefault();
  event.stopPropagation();
  const from = { x: event.clientX, y: event.clientY };
  const move = e => apply(origin.x + (e.clientX - from.x) / scale, origin.y + (e.clientY - from.y) / scale);
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); apply.done?.(); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

const segmentDistance = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

const curveControl = ({ x1, y1, x2, y2 }) => ({ x: (x1 + x2) / 2 + (y2 - y1) * 0.3, y: (y1 + y2) / 2 - (x2 - x1) * 0.3 });

// Outline points for hit-testing (eraser); closed marks a ring of segments.
function outlineOf(shape) {
  const { kind, x1, y1, x2, y2 } = shape;
  if (kind === 'line' || kind === 'arrow') return { points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], closed: false };
  if (kind === 'curve') return { points: [{ x: x1, y: y1 }, curveControl(shape), { x: x2, y: y2 }], closed: false };
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  const relative = POLYGONS[kind] || [[0, 0], [1, 0], [1, 1], [0, 1]];
  return { points: relative.map(([u, v]) => ({ x: x + u * w, y: y + v * h })), closed: true };
}

function ChatCard({ exchange, zoom, onMove }) {
  const [lifted, setLifted] = useState(false);
  const drag = event => {
    if (event.button !== 0) return;
    setLifted(true);
    const apply = (x, y) => onMove(exchange.id, x, y);
    apply.done = () => setLifted(false);
    startDrag(event, { x: exchange.dx, y: exchange.dy }, apply, zoom);
  };
  return (
    <div data-block data-chat-block onPointerDown={drag}
      style={{ transform: `translate(${exchange.dx}px, ${exchange.dy}px)${lifted ? ' scale(1.02)' : ''}` }}
      className={`relative w-full rounded-lg border border-line bg-white px-4 py-3 transition-shadow duration-150 ${lifted ? 'z-20 cursor-grabbing shadow-xl' : 'cursor-grab shadow-sm hover:shadow-md'}`}>
      <div className="mb-2 flex justify-end"><span className="max-w-[85%] rounded-xl bg-[#2383e2] px-3 py-1.5 text-sm whitespace-pre-wrap text-white">{exchange.question}</span></div>
      {exchange.answer
        ? <div className="text-sm"><Md text={exchange.answer} /></div>
        : <p className="text-sm text-ink-2 italic">{exchange.status === 'thinking' ? 'Thinking…' : `${exchange.status}…`}</p>}
    </div>
  );
}

function CanvasItem({ item, zoom, tool, selected, onSelect, onChange, onMove, onDelete }) {
  const [editing, setEditing] = useState(item.fresh);
  const body = useRef(null);
  // The rendered children stay pinned to this ref while editing so re-renders
  // (e.g. a streaming answer) never make React wipe the typed DOM text.
  const shown = useRef(item.text);
  useEffect(() => { if (editing) body.current?.focus(); }, [editing]);
  const sticky = item.kind === 'sticky';
  const startEdit = () => { shown.current = item.text; setEditing(true); };
  const down = event => {
    if (event.button !== 0) return;
    if (tool === 'eraser') { event.preventDefault(); event.stopPropagation(); onDelete(item.id); return; }
    if (tool !== 'select') return;
    onSelect(item.id);
    if (!editing) startDrag(event, { x: item.x, y: item.y }, (x, y) => onMove(item.id, x, y), zoom);
    else event.stopPropagation();
  };
  return (
    <div data-block style={{ left: item.x, top: item.y, ...(sticky ? {} : { color: item.color, fontSize: item.size || 14 }) }}
      className={`absolute z-10 cursor-grab active:cursor-grabbing ${sticky ? 'h-40 w-40 -rotate-1 overflow-hidden rounded-sm border border-[#f0d9a8] bg-[#fef3c7] p-3 text-[13px] leading-snug text-[#6b4e0b] shadow-md' : 'min-w-24 leading-snug'} ${selected ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`}
      onPointerDown={down} onDoubleClick={startEdit}>
      <div ref={body} contentEditable={editing} suppressContentEditableWarning data-placeholder={sticky ? 'Note…' : 'Text…'}
        onBlur={e => { setEditing(false); const text = e.currentTarget.textContent; shown.current = text; onChange(item.id, text); }}
        className={`outline-none ${sticky ? 'h-full empty:before:text-[#b08a3e]' : 'empty:before:opacity-50'} empty:before:content-[attr(data-placeholder)]`}>{shown.current}</div>
    </div>
  );
}

const pathOf = points => points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');

const arrowHead = (tip, from, stroke) => {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x), size = 8 + stroke.strokeWidth * 2;
  return <path d={`M${tip.x - size * Math.cos(angle - 0.45)} ${tip.y - size * Math.sin(angle - 0.45)} L${tip.x} ${tip.y} L${tip.x - size * Math.cos(angle + 0.45)} ${tip.y - size * Math.sin(angle + 0.45)}`} {...stroke} strokeDasharray={undefined} />;
};

function ShapeView({ shape, tool, zoom, selected, onSelect, onMoveStart, onResize, onDelete }) {
  const { kind, x1, y1, x2, y2, color, width, dash } = shape;
  const stroke = { stroke: color, strokeWidth: width, fill: 'none', strokeDasharray: dash ? `${width * 3} ${width * 2.5}` : undefined, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  const control = kind === 'curve' ? curveControl(shape) : null;
  const linear = kind === 'line' || kind === 'arrow' || kind === 'curve';
  const down = event => {
    if (event.button !== 0) return;
    if (tool === 'eraser') { event.stopPropagation(); onDelete(shape.id); return; }
    if (tool !== 'select') return;
    onSelect(shape.id);
    onMoveStart(event, shape);
  };
  // Drag an endpoint (linear) or a corner (boxed) to resize the drawn shape.
  const handles = linear
    ? [[x1, y1, p => ({ x1: p.x, y1: p.y })], [x2, y2, p => ({ x2: p.x, y2: p.y })]]
    : [[x1, y1, p => ({ x1: p.x, y1: p.y })], [x2, y1, p => ({ x2: p.x, y1: p.y })], [x2, y2, p => ({ x2: p.x, y2: p.y })], [x1, y2, p => ({ x1: p.x, y2: p.y })]];
  return (
    <g style={{ pointerEvents: 'visibleStroke', cursor: tool === 'select' ? 'grab' : undefined }} onPointerDown={down}>
      {kind === 'rect' && <rect x={x} y={y} width={w} height={h} rx={2} {...stroke} />}
      {kind === 'ellipse' && <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...stroke} />}
      {POLYGONS[kind] && <polygon points={POLYGONS[kind].map(([u, v]) => `${x + u * w},${y + v * h}`).join(' ')} {...stroke} />}
      {(kind === 'line' || kind === 'arrow') && <line x1={x1} y1={y1} x2={x2} y2={y2} {...stroke} />}
      {kind === 'curve' && <path d={`M${x1} ${y1} Q${control.x} ${control.y} ${x2} ${y2}`} {...stroke} />}
      {kind === 'arrow' && arrowHead({ x: x2, y: y2 }, { x: x1, y: y1 }, stroke)}
      {kind === 'curve' && arrowHead({ x: x2, y: y2 }, control, stroke)}
      {selected && !linear && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} fill="none" stroke="#2383e2" strokeWidth="1" strokeDasharray="4 3" />}
      {selected && tool === 'select' && handles.map(([hx, hy, patch], index) => (
        <circle key={index} cx={hx} cy={hy} r={5 / zoom} fill="white" stroke="#2383e2" strokeWidth={1.5 / zoom}
          style={{ pointerEvents: 'all', cursor: linear ? 'move' : 'nwse-resize' }}
          onPointerDown={event => { if (event.button !== 0) return; startDrag(event, { x: hx, y: hy }, (px, py) => onResize(shape.id, patch({ x: px, y: py })), zoom); }} />
      ))}
    </g>
  );
}

function ToolButton({ Icon, label, active, onPick }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active}
      onPointerDown={e => e.stopPropagation()} onClick={onPick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-ink text-white' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
      <Icon size={15} strokeWidth={1.7} />
    </button>
  );
}

export default function AdaptiveCanvas({ exchanges, onMove }) {
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[0]);
  const [dash, setDash] = useState(false);
  const [view, setView] = useState({ x: 0, y: 24, z: 1 });
  const [strokes, setStrokes] = useState([]); // pen and highlighter ink, world coords
  const [live, setLive] = useState(null);
  const [shapes, setShapes] = useState([]);
  const [liveShape, setLiveShape] = useState(null);
  const [items, setItems] = useState([]); // stickies and text
  const [selected, setSelected] = useState(null);
  const selectedRef = useRef(null);
  selectedRef.current = selected;
  const surface = useRef(null);
  const column = useRef(null);
  useEffect(() => { setView(v => ({ ...v, x: Math.max(24, (surface.current.clientWidth - COLUMN) / 2) })); }, []);
  // Wheel pans the world; ctrl/cmd+wheel zooms at the cursor. Non-passive so
  // the page behind the canvas does not scroll.
  useEffect(() => {
    const element = surface.current;
    const wheel = event => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) zoomAt(event.clientX - box.left, event.clientY - box.top, Math.exp(-event.deltaY * 0.002));
      else setView(v => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  // Delete/Backspace removes the selected sticky, text or shape, unless typing.
  useEffect(() => {
    const key = event => {
      if (event.key === 'Escape') { setSelected(null); return; }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const active = document.activeElement;
      if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (!selectedRef.current) return;
      setItems(previous => previous.filter(item => item.id !== selectedRef.current));
      setShapes(previous => previous.filter(shape => shape.id !== selectedRef.current));
      setSelected(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  // Keep the newest exchange in sight while it streams.
  useEffect(() => {
    const element = surface.current, col = column.current;
    if (!element || !col || !exchanges.length) return;
    setView(v => {
      const bottom = v.y + (24 + col.offsetHeight) * v.z;
      const want = element.clientHeight - 150;
      return bottom > want ? { ...v, y: v.y - (bottom - want) } : v;
    });
  }, [exchanges]);
  const zoomAt = (cx, cy, factor) => setView(v => {
    const z = Math.min(3, Math.max(0.25, v.z * factor));
    const f = z / v.z;
    return { x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f, z };
  });
  const zoomCenter = factor => { const element = surface.current; zoomAt(element.clientWidth / 2, element.clientHeight / 2, factor); };
  const local = event => {
    const box = surface.current.getBoundingClientRect();
    return { x: (event.clientX - box.left - view.x) / view.z, y: (event.clientY - box.top - view.y) / view.z };
  };
  const shapeTool = SHAPE_TOOLS.some(([kind]) => kind === tool);
  const pan = event => startDrag(event, { x: view.x, y: view.y }, (x, y) => setView(v => ({ ...v, x, y })));
  const down = event => {
    if (event.button !== 0) return;
    if (tool === 'hand') { pan(event); return; }
    if (event.target.closest('[data-block],[role="toolbar"],[data-zoom]')) return;
    if (tool === 'pen' || tool === 'highlighter') {
      event.preventDefault();
      // The width row scales both inks: pen uses it directly, highlighter 4x.
      const ink = tool === 'pen' ? { tool, color, width, dash } : { tool, width: width * 4 };
      const points = [local(event)];
      setLive({ ...ink, points });
      const move = e => { points.push(local(e)); setLive({ ...ink, points: [...points] }); };
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        setLive(null);
        if (points.length > 1) setStrokes(previous => [...previous, { ...ink, points }]);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    } else if (shapeTool) {
      event.preventDefault();
      const start = local(event);
      const draft = { id: crypto.randomUUID(), kind: tool, x1: start.x, y1: start.y, x2: start.x, y2: start.y, color, width, dash };
      setLiveShape(draft);
      const move = e => { const p = local(e); setLiveShape({ ...draft, x2: p.x, y2: p.y }); };
      const up = e => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        const p = local(e);
        setLiveShape(null);
        if (Math.hypot(p.x - start.x, p.y - start.y) > 4) setShapes(previous => [...previous, { ...draft, x2: p.x, y2: p.y }]);
        setTool('select');
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    } else if (tool === 'eraser') {
      event.preventDefault();
      const radius = 12 / view.z;
      const erase = e => {
        const point = local(e);
        setStrokes(previous => previous.filter(stroke => !stroke.points.some(q => Math.hypot(q.x - point.x, q.y - point.y) < radius)));
        setShapes(previous => previous.filter(shape => {
          const { points, closed } = outlineOf(shape);
          const last = closed ? points.length : points.length - 1;
          for (let index = 0; index < last; index++) if (segmentDistance(point, points[index], points[(index + 1) % points.length]) < radius) return false;
          return true;
        }));
      };
      erase(event);
      const up = () => { window.removeEventListener('pointermove', erase); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', erase);
      window.addEventListener('pointerup', up);
    } else if (tool === 'sticky' || tool === 'text') {
      // preventDefault keeps the click from blurring the fresh editable note.
      event.preventDefault();
      const point = local(event);
      setItems(previous => [...previous, { id: crypto.randomUUID(), kind: tool, x: point.x, y: point.y, text: '', color, size: width === WIDTHS[0] ? 14 : width === WIDTHS[1] ? 18 : 24, fresh: true }]);
      setTool('select');
    } else {
      setSelected(null);
      pan(event);
    }
  };
  const moveItem = (id, x, y) => setItems(previous => previous.map(item => item.id === id ? { ...item, x, y } : item));
  const changeItem = (id, text) => setItems(previous => previous.map(item => item.id === id ? { ...item, text, fresh: false } : item));
  const deleteItem = id => { setItems(previous => previous.filter(item => item.id !== id)); setShapes(previous => previous.filter(shape => shape.id !== id)); setSelected(current => current === id ? null : current); };
  const resizeShape = (id, patch) => setShapes(previous => previous.map(shape => shape.id === id ? { ...shape, ...patch } : shape));
  const moveShapeStart = (event, shape) => startDrag(event, { x: shape.x1, y: shape.y1 }, (x, y) => {
    const dx = x - shape.x1, dy = y - shape.y1;
    setShapes(previous => previous.map(s => s.id === shape.id ? { ...s, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy } : s));
  }, view.z);
  const inking = tool === 'pen' || tool === 'highlighter';
  const drawing = inking || shapeTool;
  const cursor = tool === 'hand' ? 'cursor-grab' : inking || tool === 'eraser' || shapeTool ? 'cursor-crosshair' : tool === 'select' ? '' : 'cursor-copy';
  return (
    <div ref={surface} onPointerDown={down} className={`relative h-full min-h-0 touch-none overflow-hidden ${cursor}`}>
      <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: '0 0' }} className="absolute top-0 left-0">
        <svg aria-hidden="true" width="1" height="1" className="pointer-events-none absolute top-0 left-0 z-10 overflow-visible">
          {[...shapes, ...(liveShape ? [liveShape] : [])].map(shape => <ShapeView key={shape.id} shape={shape} tool={tool} zoom={view.z} selected={selected === shape.id} onSelect={setSelected} onMoveStart={moveShapeStart} onResize={resizeShape} onDelete={deleteItem} />)}
          {[...strokes, ...(live ? [live] : [])].map((stroke, index) => stroke.tool === 'pen'
            ? <path key={index} d={pathOf(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeDasharray={stroke.dash ? `${stroke.width * 3} ${stroke.width * 2.5}` : undefined} strokeLinecap="round" strokeLinejoin="round" />
            : <path key={index} d={pathOf(stroke.points)} fill="none" stroke="#fde047" strokeWidth={stroke.width || 14} strokeOpacity=".5" strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>
        <div ref={column} style={{ width: COLUMN }} className={`absolute top-0 left-0 flex flex-col gap-5 ${drawing || tool === 'eraser' || tool === 'hand' ? 'pointer-events-none' : ''}`}>
          {exchanges.map(exchange => <ChatCard key={exchange.id} exchange={exchange} zoom={view.z} onMove={onMove} />)}
        </div>
        <div className={drawing || tool === 'hand' ? 'pointer-events-none' : ''}>
          {items.map(item => <CanvasItem key={item.id} item={item} zoom={view.z} tool={tool} selected={selected === item.id} onSelect={setSelected} onChange={changeItem} onMove={moveItem} onDelete={deleteItem} />)}
        </div>
      </div>
      <div role="toolbar" aria-label="Canvas tools" className="absolute top-1/2 right-2 z-20 grid max-h-full -translate-y-1/2 grid-cols-2 gap-0.5 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-md">
        {NAV_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
        <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
        {DRAW_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
        <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
        {SHAPE_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
        <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
        {COLORS.map(value => (
          <button key={value} type="button" title="Color" aria-label={`Color ${value}`} aria-pressed={color === value}
            onPointerDown={e => e.stopPropagation()} onClick={() => setColor(value)}
            className="flex h-6 w-8 items-center justify-center rounded-lg hover:bg-hover">
            <span style={{ background: value }} className={`h-3.5 w-3.5 rounded-full ${color === value ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`} />
          </button>
        ))}
        <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
        {WIDTHS.map(value => (
          <button key={value} type="button" title={`Stroke width ${value}`} aria-label={`Stroke width ${value}`} aria-pressed={width === value}
            onPointerDown={e => e.stopPropagation()} onClick={() => setWidth(value)}
            className={`flex h-6 w-8 items-center justify-center rounded-lg ${width === value ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover'}`}>
            <span style={{ height: value }} className="w-4 rounded-full bg-current" />
          </button>
        ))}
        <button type="button" title="Dashed" aria-label="Dashed lines" aria-pressed={dash}
          onPointerDown={e => e.stopPropagation()} onClick={() => setDash(previous => !previous)}
          className={`flex h-6 w-8 items-center justify-center rounded-lg ${dash ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover'}`}>
          <svg width="16" height="4" aria-hidden="true"><line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" /></svg>
        </button>
      </div>
      <div data-zoom aria-label="Zoom controls" className="absolute bottom-3 left-3 z-20 flex items-center rounded-lg border border-line bg-white shadow-sm">
        <IconBtn title="Zoom out" onClick={() => zoomCenter(1 / 1.25)}><Minus size={14} /></IconBtn>
        <button type="button" title="Reset zoom" onClick={() => setView({ x: Math.max(24, (surface.current.clientWidth - COLUMN) / 2), y: 24, z: 1 })} className="min-w-11 px-1 text-center text-xs tabular-nums text-ink-2 hover:text-ink">{Math.round(view.z * 100)}%</button>
        <IconBtn title="Zoom in" onClick={() => zoomCenter(1.25)}><Plus size={14} /></IconBtn>
      </div>
    </div>
  );
}
