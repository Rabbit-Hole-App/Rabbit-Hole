import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageCircle, X, ArrowUpRight, Circle, Diamond, Eraser, Hand, Hexagon, Highlighter, Minus, MousePointer2, Pencil, Plus, Slash, Spline, Square, Star, StickyNote, Triangle, Type } from 'lucide-react';
import { Md } from './ask.jsx';
import { IconBtn } from './ui.jsx';

// The adaptive lesson canvas: a plain React surface (no tldraw). The world is
// unbounded — a translate/scale camera pans and zooms it. Chat exchanges land
// as movable cards; the learner adds ink, shapes, stickies and text from the
// right-hand toolbar. Hand or empty-space drag pans; wheel pans, ctrl+wheel
// zooms.
// ponytail: canvas content persists per-browser via localStorage; cross-device
// save/restore comes with the lesson content model.

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

// One conversation node: the learner's message, a separator, then the agent's
// reply. Starts at a compact width, grows with content up to a max height
// (longer replies scroll inside), and resizes from the corner handle.
function ChatCard({ exchange, zoom, selected, onSelect, onMove, renderComposer, onLayout, onConnect }) {
  const [lifted, setLifted] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [replies, setReplies] = useState([]);
  const [size, setSize] = useState({ w: null, h: null });
  const card = useRef(null);
  const body = useRef(null);
  useEffect(() => {
    const observer = new ResizeObserver(onLayout);
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [onLayout]);
  useEffect(() => { if (body.current && replies.length) body.current.scrollTop = body.current.scrollHeight; }, [replies]);
  useEffect(() => { if (replyOpen) card.current?.querySelector('[data-block-composer] input[placeholder]')?.focus(); }, [replyOpen]);
  const continueReply = () => { setStarted(true); setReplyOpen(true); };
  const receive = event => setReplies(previous => {
    if (event.question !== undefined) return [...previous, { id: event.id, question: event.question, answer: '', status: 'thinking' }];
    return previous.map(turn => turn.id !== event.id ? turn : event.delta ? { ...turn, answer: turn.answer + event.delta }
      : { ...turn, status: event.done ? 'done' : event.stage });
  });
  const drag = event => {
    if (event.button !== 0) return;
    onSelect(exchange.id);
    setLifted(true);
    const apply = (x, y) => onMove(exchange.id, x, y);
    apply.done = () => setLifted(false);
    startDrag(event, { x: exchange.dx, y: exchange.dy }, apply, zoom);
  };
  const resize = event => {
    if (event.button !== 0) return;
    const element = card.current;
    startDrag(event, { x: element.offsetWidth, y: element.offsetHeight },
      (w, h) => setSize({ w: Math.min(720, Math.max(280, w)), h: Math.min(640, Math.max(140, h)) }), zoom);
  };
  return (
    <div ref={card} data-block data-chat-block data-block-id={exchange.id} onPointerDown={drag}
      style={{ transform: `translate(${exchange.dx}px, ${exchange.dy}px)${lifted ? ' scale(1.02)' : ''}`, width: size.w || 380, height: size.h || undefined, maxHeight: size.h ? undefined : 420 }}
      className={`group relative mx-auto flex flex-col rounded-xl border border-line bg-white transition-shadow duration-150 ${selected ? 'ring-2 ring-[#2383e2]' : ''} ${lifted ? 'z-20 cursor-grabbing shadow-xl' : 'cursor-grab shadow-sm hover:shadow-md'}`}>
      <div className="flex shrink-0 justify-end px-4 pt-3 pb-2"><span className="max-w-[85%] rounded-xl bg-[#2383e2] px-3 py-1.5 text-sm whitespace-pre-wrap text-white">{exchange.question}</span></div>
      <div className="shrink-0 border-t border-line" />
      <div ref={body} data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {exchange.answer
          ? <div className="text-sm"><Md text={exchange.answer} /></div>
          : <p className="text-sm text-ink-2 italic">{exchange.status === 'thinking' ? 'Thinking…' : `${exchange.status}…`}</p>}
        {replies.map(turn => <div key={turn.id} className="mt-3 border-t border-line pt-3">
          <div className="mb-3 flex justify-end"><span className="rounded-xl bg-accent px-3 py-1.5 text-sm whitespace-pre-wrap text-white">{turn.question}</span></div>
          <div className="text-sm">{turn.answer ? <Md text={turn.answer} /> : <span className="text-ink-2">{turn.status === 'done' ? 'No answer received. Try again.' : 'Thinking…'}</span>}</div>
        </div>)}
      </div>
      {/* Pinned footer: the continue-conversation icon stays visible no matter
          how tall the thread grows or how the block is resized. */}
      {exchange.status === 'done' && renderComposer && !replyOpen && <div className="flex shrink-0 justify-end px-2 pb-1.5"><button type="button" aria-label="Reply in this block" title="Continue this conversation" onPointerDown={e => e.stopPropagation()} onClick={continueReply} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-accent"><MessageCircle size={15} /></button></div>}
      {started && <div data-block-composer className={`shrink-0 border-t border-line px-3 pb-3 ${replyOpen ? '' : 'hidden'}`} onPointerDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between py-1 text-xs text-ink-2"><span>This conversation</span><button type="button" aria-label="Close block composer" onClick={() => setReplyOpen(false)} className="rounded p-1 hover:bg-hover"><X size={13} /></button></div>
        {renderComposer(exchange, receive)}
      </div>}
      {['top', 'bottom'].map(side => <button key={side} type="button" data-port={side} data-owner={exchange.id} aria-label={`Connect ${side}`} title="Drag to connect blocks"
        className={`absolute left-1/2 z-20 h-4 w-4 -translate-x-1/2 cursor-crosshair rounded-full border-2 border-accent bg-white opacity-0 group-hover:opacity-100 focus:opacity-100 ${side === 'top' ? '-top-2' : '-bottom-2'}`}
        onPointerDown={event => onConnect(event, exchange.id, side)} />)}
      <button type="button" aria-label="Resize chat block" title="Resize block" className="absolute right-0 bottom-0 z-10 cursor-nwse-resize p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink-2 focus:opacity-100"
        onPointerDown={resize}><svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M10 4 4 10 M10 8 8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg></button>
    </div>
  );
}

function CanvasItem({ item, zoom, tool, selected, onSelect, onChange, onMove, onResize, onGesture, onDelete }) {
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
    if (!editing) { onGesture(); startDrag(event, { x: item.x, y: item.y }, (x, y) => onMove(item.id, x, y), zoom); }
    else event.stopPropagation();
  };
  return (
    <div data-block style={{ left: item.x, top: item.y, ...(sticky ? { width: item.w || 160, height: item.h || 160 } : { color: item.color, fontSize: item.size || 14 }) }}
      className={`absolute z-10 cursor-grab active:cursor-grabbing ${sticky ? '-rotate-1 overflow-hidden rounded-sm border border-[#f0d9a8] bg-[#fef3c7] p-3 text-[13px] leading-snug text-[#6b4e0b] shadow-md' : 'min-w-24 leading-snug'} ${selected ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`}
      onPointerDown={down} onDoubleClick={startEdit}>
      <div ref={body} contentEditable={editing} suppressContentEditableWarning data-placeholder={sticky ? 'Note…' : 'Text…'}
        onBlur={e => { setEditing(false); const text = e.currentTarget.textContent; shown.current = text; onChange(item.id, text); }}
        className={`outline-none ${sticky ? 'h-full empty:before:text-[#b08a3e]' : 'empty:before:opacity-50'} empty:before:content-[attr(data-placeholder)]`}>{shown.current}</div>
      {sticky && selected && tool === 'select' && (
        <span aria-label="Resize note" className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-[#2383e2] bg-white"
          onPointerDown={event => { if (event.button !== 0) return; onGesture(); startDrag(event, { x: item.w || 160, y: item.h || 160 }, (w, h) => onResize(item.id, Math.max(80, w), Math.max(80, h)), zoom); }} />
      )}
    </div>
  );
}

const pathOf = points => points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');

const arrowHead = (tip, from, stroke) => {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x), size = 8 + stroke.strokeWidth * 2;
  return <path d={`M${tip.x - size * Math.cos(angle - 0.45)} ${tip.y - size * Math.sin(angle - 0.45)} L${tip.x} ${tip.y} L${tip.x - size * Math.cos(angle + 0.45)} ${tip.y - size * Math.sin(angle + 0.45)}`} {...stroke} strokeDasharray={undefined} />;
};

function ShapeView({ shape, tool, zoom, selected, onSelect, onMoveStart, onResize, onGesture, onDelete }) {
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
          onPointerDown={event => { if (event.button !== 0) return; onGesture(); startDrag(event, { x: hx, y: hy }, (px, py) => onResize(shape.id, patch({ x: px, y: py })), zoom); }} />
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

export default function AdaptiveCanvas({ exchanges, onMove, onDelete = null, onRestore = null, storageKey = null, composer = null, renderBlockComposer = null }) {
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[0]);
  const [dash, setDash] = useState(false);
  const [view, setView] = useState({ x: 0, y: 24, z: 1 });
  // Learner artifacts persist in this browser so a refresh keeps the canvas.
  const stored = useRef(null);
  if (stored.current === null) {
    try { stored.current = storageKey ? JSON.parse(localStorage.getItem(storageKey) || '{}') : {}; } catch { stored.current = {}; }
  }
  const [strokes, setStrokes] = useState(stored.current.strokes || []); // pen and highlighter ink, world coords
  const [live, setLive] = useState(null);
  const [shapes, setShapes] = useState(stored.current.shapes || []);
  const [liveShape, setLiveShape] = useState(null);
  const [items, setItems] = useState(() => (stored.current.items || []).map(item => ({ ...item, fresh: false }))); // stickies and text
  const [selected, setSelected] = useState(null);
  // Selecting on the canvas takes the keyboard away from the composer so
  // Delete acts on the selection; editable notes keep their own focus.
  const select = id => {
    const active = document.activeElement;
    if (id && active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) active.blur();
    setSelected(id);
  };
  const [links, setLinks] = useState(stored.current.links || []);
  useEffect(() => {
    if (!storageKey) return;
    const timer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify({ strokes, shapes, items, links })); } catch { /* full or blocked storage loses drawings only */ } }, 400);
    return () => clearTimeout(timer);
  }, [strokes, shapes, items, links, storageKey]);
  const [connecting, setConnecting] = useState(null);
  const [bounds, setBounds] = useState({});
  const exchangesRef = useRef(exchanges);
  exchangesRef.current = exchanges;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const connectionCleanup = useRef(null);
  const selectedRef = useRef(null);
  selectedRef.current = selected;
  const surface = useRef(null);
  const column = useRef(null);
  const measureBlocks = useCallback(() => {
    const next = {};
    for (const element of column.current?.querySelectorAll('[data-block-id]') || []) {
      const exchange = exchangesRef.current.find(item => item.id === element.dataset.blockId);
      if (exchange) next[exchange.id] = { x: element.offsetLeft + exchange.dx, y: element.offsetTop + exchange.dy, w: element.offsetWidth, h: element.offsetHeight };
    }
    setBounds(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []);
  useLayoutEffect(measureBlocks, [exchanges, measureBlocks]);
  useEffect(() => () => connectionCleanup.current?.(), []);
  // Undo: snapshot the three artifact lists before every mutating gesture.
  // ponytail: single-level lists + 100-step cap; redo comes when asked for.
  const present = useRef(null);
  present.current = { strokes, shapes, items, links };
  const history = useRef([]);
  // withExchanges captures the chat blocks too, so deleting a block undoes.
  const snapshot = (withExchanges = false) => {
    history.current.push({ ...present.current, ...(withExchanges ? { exchanges: exchangesRef.current } : {}) });
    if (history.current.length > 100) history.current.shift();
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    setStrokes(previous.strokes); setShapes(previous.shapes); setItems(previous.items); setLinks(previous.links); setSelected(null);
    if (previous.exchanges) onRestoreRef.current?.(previous.exchanges);
  };
  useEffect(() => { setView(v => ({ ...v, x: Math.max(24, (surface.current.clientWidth - COLUMN) / 2) })); }, []);
  // Wheel pans the world; ctrl/cmd+wheel zooms at the cursor. Non-passive so
  // the page behind the canvas does not scroll.
  useEffect(() => {
    const element = surface.current;
    const wheel = event => {
      // Scrollable card bodies keep native wheel scrolling.
      if (!(event.ctrlKey || event.metaKey) && event.target.closest?.('[data-scroll]')) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) zoomAt(event.clientX - box.left, event.clientY - box.top, Math.exp(-event.deltaY * 0.002));
      else setView(v => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  // Delete/Backspace removes the selected sticky, text or shape; ctrl+z
  // undoes the last canvas gesture — both stand down while typing.
  useEffect(() => {
    const key = event => {
      if (event.key === 'Escape') { connectionCleanup.current?.(); setConnecting(null); setSelected(null); return; }
      const active = document.activeElement;
      const typing = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        if (typing) return;
        event.preventDefault();
        undo();
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (typing || !selectedRef.current) return;
      const id = selectedRef.current;
      const isBlock = exchangesRef.current.some(exchange => exchange.id === id);
      snapshot(isBlock);
      // A selected chat block deletes with its attached connections.
      if (isBlock) {
        onDeleteRef.current?.(id);
        setLinks(previous => previous.filter(link => link.from !== id && link.to !== id));
      }
      setItems(previous => previous.filter(item => item.id !== id));
      setShapes(previous => previous.filter(shape => shape.id !== id));
      setLinks(previous => previous.filter(link => link.id !== id));
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
  const portPosition = (id, side) => {
    const box = bounds[id];
    return box ? { x: box.x + box.w / 2, y: box.y + (side === 'bottom' ? box.h : 0) } : null;
  };
  const connect = (event, from, fromSide) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    connectionCleanup.current?.();
    // The ink color drives the connector; the plain ink default reads as
    // uncolored on a line, so it maps to the accent blue.
    const linkColor = color === COLORS[0] ? '#2383e2' : color;
    setConnecting({ from, fromSide, toPoint: local(event), color: linkColor });
    const move = e => setConnecting({ from, fromSide, toPoint: local(e), color: linkColor });
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      connectionCleanup.current = null;
    };
    const cancel = () => { cleanup(); setConnecting(null); };
    const up = e => {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-port]');
      const to = target?.dataset.owner, toSide = target?.dataset.port;
      if (to && to !== from && !present.current.links.some(link => link.from === from && link.fromSide === fromSide && link.to === to && link.toSide === toSide)) {
        snapshot();
        setLinks(previous => [...previous, { id: crypto.randomUUID(), from, fromSide, to, toSide, color }]);
      }
      cancel();
    };
    connectionCleanup.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };
  const connectionPath = link => {
    const a = portPosition(link.from, link.fromSide), b = link.toPoint || portPosition(link.to, link.toSide);
    if (!a || !b) return '';
    const bend = Math.max(60, Math.abs(b.y - a.y) / 2);
    return `M${a.x} ${a.y} C${a.x} ${a.y + (link.fromSide === 'bottom' ? bend : -bend)},${b.x} ${b.y + (link.toSide === 'bottom' ? bend : -bend)},${b.x} ${b.y}`;
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
        if (points.length > 1) { snapshot(); setStrokes(previous => [...previous, { ...ink, points }]); }
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
        if (Math.hypot(p.x - start.x, p.y - start.y) > 4) { snapshot(); setShapes(previous => [...previous, { ...draft, x2: p.x, y2: p.y }]); }
        setTool('select');
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    } else if (tool === 'eraser') {
      event.preventDefault();
      snapshot();
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
      snapshot();
      const point = local(event);
      setItems(previous => [...previous, { id: crypto.randomUUID(), kind: tool, x: point.x, y: point.y, text: '', color, size: width === WIDTHS[0] ? 14 : width === WIDTHS[1] ? 18 : 24, fresh: true }]);
      setTool('select');
    } else {
      setSelected(null);
      pan(event);
    }
  };
  const moveItem = (id, x, y) => setItems(previous => previous.map(item => item.id === id ? { ...item, x, y } : item));
  const resizeItem = (id, w, h) => setItems(previous => previous.map(item => item.id === id ? { ...item, w, h } : item));
  const changeItem = (id, text) => {
    if (present.current.items.some(item => item.id === id && item.text !== text)) snapshot();
    setItems(previous => previous.map(item => item.id === id ? { ...item, text, fresh: false } : item));
  };
  const deleteItem = id => { snapshot(); setItems(previous => previous.filter(item => item.id !== id)); setShapes(previous => previous.filter(shape => shape.id !== id)); setSelected(current => current === id ? null : current); };
  const resizeShape = (id, patch) => setShapes(previous => previous.map(shape => shape.id === id ? { ...shape, ...patch } : shape));
  const moveShapeStart = (event, shape) => {
    snapshot();
    startDrag(event, { x: shape.x1, y: shape.y1 }, (x, y) => {
      const dx = x - shape.x1, dy = y - shape.y1;
      setShapes(previous => previous.map(s => s.id === shape.id ? { ...s, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy } : s));
    }, view.z);
  };
  const inking = tool === 'pen' || tool === 'highlighter';
  const drawing = inking || shapeTool;
  const cursor = tool === 'hand' ? 'cursor-grab' : inking || tool === 'eraser' || shapeTool ? 'cursor-crosshair' : tool === 'select' ? '' : 'cursor-copy';
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={surface} onPointerDown={down} className={`relative min-h-0 flex-1 touch-none overflow-hidden ${cursor}`}>
        <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: '0 0' }} className="absolute top-0 left-0">
        <svg width="1" height="1" className="pointer-events-none absolute top-0 left-0 overflow-visible">
          {links.map(link => <g key={link.id} data-connection={link.id}>
            <path d={connectionPath(link)} fill="none" stroke={link.color} strokeWidth={selected === link.id ? 4 : 2.5} />
            <path d={connectionPath(link)} fill="none" stroke="transparent" strokeWidth={14 / view.z} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onPointerDown={event => { event.stopPropagation(); select(link.id); }}><title>Select connection · choose a color or press Delete</title></path>
          </g>)}
          {connecting && <path data-connection-preview d={connectionPath(connecting)} fill="none" stroke={connecting.color} strokeWidth="2.5" />}
        </svg>
        <svg aria-hidden="true" width="1" height="1" className="pointer-events-none absolute top-0 left-0 z-10 overflow-visible">
          {[...shapes, ...(liveShape ? [liveShape] : [])].map(shape => <ShapeView key={shape.id} shape={shape} tool={tool} zoom={view.z} selected={selected === shape.id} onSelect={select} onMoveStart={moveShapeStart} onResize={resizeShape} onGesture={snapshot} onDelete={deleteItem} />)}
          {[...strokes, ...(live ? [live] : [])].map((stroke, index) => stroke.tool === 'pen'
            ? <path key={index} d={pathOf(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeDasharray={stroke.dash ? `${stroke.width * 3} ${stroke.width * 2.5}` : undefined} strokeLinecap="round" strokeLinejoin="round" />
            : <path key={index} d={pathOf(stroke.points)} fill="none" stroke="#fde047" strokeWidth={stroke.width || 14} strokeOpacity=".5" strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>
        <div ref={column} style={{ width: COLUMN }} className={`absolute top-0 left-0 flex flex-col gap-5 ${drawing || tool === 'eraser' || tool === 'hand' ? 'pointer-events-none' : ''}`}>
          {exchanges.map(exchange => <ChatCard key={exchange.id} exchange={exchange} zoom={view.z} selected={selected === exchange.id} onSelect={select} onMove={onMove} renderComposer={renderBlockComposer} onLayout={measureBlocks} onConnect={connect} />)}
        </div>
        <div className={drawing || tool === 'hand' ? 'pointer-events-none' : ''}>
          {items.map(item => <CanvasItem key={item.id} item={item} zoom={view.z} tool={tool} selected={selected === item.id} onSelect={select} onChange={changeItem} onMove={moveItem} onResize={resizeItem} onGesture={snapshot} onDelete={deleteItem} />)}
        </div>
        </div>
      </div>
      <div role="toolbar" aria-label="Canvas tools" className="absolute top-1/2 -right-6 z-20 grid max-h-full -translate-y-1/2 grid-cols-2 gap-0.5 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-md">
        {NAV_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
        <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
        {DRAW_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
        <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
        {SHAPE_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
        <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
        {COLORS.map(value => (
          <button key={value} type="button" title="Color" aria-label={`Color ${value}`} aria-pressed={color === value}
            onPointerDown={e => e.stopPropagation()} onClick={() => { setColor(value); if (links.some(link => link.id === selected)) { snapshot(); setLinks(previous => previous.map(link => link.id === selected ? { ...link, color: value } : link)); } }}
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
      {/* The zoom pill sits level with the composer's bottom edge. */}
      <div className="relative min-h-11 shrink-0 pt-3">
        <div data-zoom aria-label="Zoom controls" className="absolute bottom-0 left-0 z-20 flex items-center rounded-lg border border-line bg-white shadow-sm">
          <IconBtn title="Zoom out" onClick={() => zoomCenter(1 / 1.25)}><Minus size={14} /></IconBtn>
          <button type="button" title="Reset zoom" onClick={() => setView({ x: Math.max(24, (surface.current.clientWidth - COLUMN) / 2), y: 24, z: 1 })} className="min-w-11 px-1 text-center text-xs tabular-nums text-ink-2 hover:text-ink">{Math.round(view.z * 100)}%</button>
          <IconBtn title="Zoom in" onClick={() => zoomCenter(1.25)}><Plus size={14} /></IconBtn>
        </div>
        {composer && <div className="mx-auto w-full max-w-[720px]">{composer}</div>}
      </div>
    </div>
  );
}
