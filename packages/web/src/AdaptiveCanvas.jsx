import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Ellipsis, Loader2, MessageCircle, Scan, X, ArrowUpRight, BringToFront, Circle, Diamond, Eraser, Grid3x3, Hand, Hexagon, Highlighter, Lock, LockOpen, Minus, MousePointer2, Pencil, Plus, SendToBack, Slash, Spline, Square, Squircle, Star, StickyNote, Triangle, Type } from 'lucide-react';
import { Md } from './ask.jsx';
import { IconBtn, toast } from './ui.jsx';
import { boardAsk } from './board-ask.js';
import { BLOCK_TYPES, LearningBlockBody, describeBlock } from './LearningBlocks.jsx';
import { gapsFrom, nearestGap } from './learn-gap-rail.js';
import { panelFor, textStyle, dashArray, dashStyle, reorder, TEXT_LEVELS, DASH_STYLES, OPACITIES } from './learn-style-panel.js';
import { snapMove, snapGrid, SNAP_TOLERANCE, GRID } from './learn-snap.js';

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
// Connectors take the colour of the node they start from, so a canvas reads
// at a glance; picking an ink colour first overrides this.
const LINK_COLORS = { chat: '#2383e2', quiz: '#7c3aed', flashcards: '#f59e0b', challenge: '#37352f', explanation: '#6b7280', table: '#0891b2', snippet: '#1a7f37', code: '#1a7f37', graph: '#2383e2', paper: '#b42318', model3d: '#7c3aed', image: '#0891b2', video: '#b42318' };
const WIDTHS = [2, 3.5, 6];
const COLUMN = 560;
// How much blank space one press of [+] adds between two cards, and [-] removes.
const SPACE_STEP = 120;
// Blank canvas left at each end of a gap separator, in screen pixels.
const RAIL_INSET = 56;
// Section headings. A heading is flat, not a container - the depth is what it
// looks like and what it says, so a deck or a lesson can be skimmed without the
// canvas needing a tree underneath it.
const SECTION_LEVELS = [
  { level: 1, label: 'Add section', size: 40, weight: 650, placeholder: 'Section' },
  { level: 2, label: 'Add sub-section', size: 30, weight: 600, placeholder: 'Sub-section' },
  { level: 3, label: 'Add sub-sub-section', size: 23, weight: 550, placeholder: 'Sub-sub-section' },
];
const levelOf = block => SECTION_LEVELS.find(entry => entry.level === block.level) || SECTION_LEVELS[0];
const POLYGONS = {
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  star: Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 0.21 : 0.5;
    return [0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle)];
  }),
};

// Screen pixels of travel before a press counts as a drag rather than a click.
const DRAG_THRESHOLD = 3;

// Pointer drag with a live apply callback; used by blocks, stickies, text,
// shapes and panning. scale converts screen pixels to world units.
function startDrag(event, origin, apply, scale = 1, snap = null) {
  event.preventDefault();
  event.stopPropagation();
  const from = { x: event.clientX, y: event.clientY };
  // A press only becomes a drag once the pointer has actually travelled. Without
  // this, a click meant to select something shifts it by whatever the hand did
  // on the way down - worst on text, which has no handle to aim at.
  let dragging = false;
  const move = e => {
    if (!dragging && Math.hypot(e.clientX - from.x, e.clientY - from.y) < DRAG_THRESHOLD) return;
    dragging = true;
    const x = origin.x + (e.clientX - from.x) / scale;
    const y = origin.y + (e.clientY - from.y) / scale;
    const pulled = snap ? snap(x, y) : null;
    apply(pulled ? pulled.x : x, pulled ? pulled.y : y);
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); apply.done?.(); snap?.done?.(); };
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

// Shared node chrome for everything card-shaped on the canvas: drag with
// lift, corner resize, selection ring, top/bottom connection ports, and the
// layout observer that keeps connector geometry fresh. Content is children.
function CanvasNode({ id, dx, dy, zoom, selected, chat = false, ghost = false, space = 0, connected = null, autoMax = 420, width = 380, height = undefined, saved = null, onSelect, onMove, onSize, onLayout, onConnect, onSnap = null, nodeRef = null, children }) {
  const [lifted, setLifted] = useState(false);
  // A resized node keeps its size in its own data, so a reload restores it.
  const [size, setSize] = useState({ w: saved?.w || null, h: saved?.h || null });
  const card = useRef(null);
  useEffect(() => { if (nodeRef) nodeRef.current = card.current; });
  useEffect(() => {
    const observer = new ResizeObserver(onLayout);
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [onLayout]);
  const drag = event => {
    if (event.button !== 0) return;
    if (!selected) onSelect(id, event); // keep a multi-selection intact while dragging it
    setLifted(true);
    const apply = (x, y) => onMove(id, x, y);
    apply.done = () => setLifted(false);
    startDrag(event, { x: dx, y: dy }, apply, zoom, onSnap?.(id));
  };
  const resize = event => {
    if (event.button !== 0) return;
    const element = card.current;
    let last = null;
    const apply = (w, h) => { last = { w: Math.min(1200, Math.max(280, w)), h: Math.min(1000, Math.max(140, h)) }; setSize(last); };
    apply.done = () => { if (last) onSize?.(id, last.w, last.h); };
    startDrag(event, { x: element.offsetWidth, y: element.offsetHeight }, apply, zoom);
  };
  return (
    <div ref={card} data-block data-block-id={id} {...(chat ? { 'data-chat-block': true } : {})}
      onPointerDown={event => { if (event.button !== 0) return; if (event.target.closest('[data-drag-zone]')) drag(event); else onSelect(id, event); }}
      style={{ transform: `translate(${dx}px, ${dy}px)${lifted ? ' scale(1.02)' : ''}`, marginTop: space || undefined, width: size.w || width, height: size.h || height, maxHeight: size.h || height ? undefined : autoMax }}
      className={`group relative mx-auto flex cursor-default flex-col rounded-xl border transition-shadow duration-150 select-text ${ghost ? 'border-transparent bg-transparent hover:border-line' : 'border-line bg-white'} ${selected ? 'ring-2 ring-[#2383e2]' : ''} ${lifted ? 'z-20 shadow-xl' : ghost ? 'hover:shadow-sm' : 'shadow-sm hover:shadow-md'}`}>
      {/* Only this strip drags; the body keeps a normal cursor so text can be
          selected and links inside the block stay clickable. */}
      <div data-drag-handle data-drag-zone title="Drag to move this block"
        className={`flex h-6 shrink-0 cursor-grab items-center justify-center rounded-t-xl active:cursor-grabbing ${ghost ? 'opacity-0 group-hover:opacity-100' : 'hover:bg-hover'}`}>
        <span className="h-1 w-12 rounded-full bg-line" />
      </div>
      {children}
      {['top', 'bottom'].map(side => <button key={side} type="button" data-port={side} data-owner={id} aria-label={`Connect ${side}`} title="Drag to connect blocks"
        className={`absolute left-1/2 z-20 h-4 w-4 -translate-x-1/2 cursor-crosshair rounded-full border-2 border-accent bg-white focus:opacity-100 ${connected?.[side] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${side === 'top' ? '-top-2' : '-bottom-2'}`}
        onPointerDown={event => onConnect(event, id, side)} />)}
      <button type="button" aria-label="Resize chat block" title="Resize block" className="absolute right-0 bottom-0 z-10 cursor-nwse-resize p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink-2 focus:opacity-100"
        onPointerDown={resize}><svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M10 4 4 10 M10 8 8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg></button>
    </div>
  );
}

// One conversation node: the learner's message, a separator, then the agent's
// reply. Starts at a compact width, grows with content up to a max height
// (longer replies scroll inside), and resizes from the corner handle.
function ChatCard({ exchange, zoom, selected, connected, boardId, onSelect, onMove, onSize, onReply, renderComposer, onLayout, onConnect, onFile }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [drawing, setDrawing] = useState('');
  const replies = exchange.replies || [];
  const card = useRef(null);
  const body = useRef(null);
  useEffect(() => { if (body.current && replies.length) body.current.scrollTop = body.current.scrollHeight; }, [replies]);
  useEffect(() => { if (replyOpen) card.current?.querySelector('[data-block-composer] input[placeholder]')?.focus(); }, [replyOpen]);
  const continueReply = () => { setStarted(true); setReplyOpen(true); };
  // The answer is drawn onto the board this question came from, so the
  // explanation lands on the thing it is about.
  const explainOnBoard = async () => {
    setDrawing('Preparing explanation...');
    try {
      const board = boardAsk(boardId);
      // Without this the button would quietly reset and look like nothing happened.
      if (!board) throw new Error('That board is no longer on the canvas.');
      await board.explain({ question: exchange.question, answer: exchange.answer, onStage: setDrawing });
    }
    catch (problem) { toast(problem.message, { tone: 'error' }); }
    finally { setDrawing(''); }
  };
  const receive = event => onReply?.(exchange.id, event);
  return (
    <CanvasNode id={exchange.id} dx={exchange.dx} dy={exchange.dy} zoom={zoom} selected={selected} chat connected={connected}
      saved={{ w: exchange.w, h: exchange.h }} onSize={onSize}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} nodeRef={card}>
      {/* Selecting the node offers Continue convo above it, which opens the
          in-block composer at the bottom. */}
      {selected && exchange.status === 'done' && (
        <div className="absolute -top-10 right-0 z-30 flex items-center gap-1.5">
          {boardId && exchange.answer && (
            <button type="button" data-explain-canvas disabled={!!drawing} title="Draw this answer on the board it came from"
              onPointerDown={e => e.stopPropagation()} onClick={explainOnBoard}
              className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-ink shadow-md hover:bg-hover disabled:opacity-60">
              {drawing ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
              <span className="max-w-48 truncate">{drawing || 'Explain in canvas'}</span>
            </button>
          )}
          {renderComposer && !replyOpen && (
            <button type="button" title="Continue this conversation"
              onPointerDown={e => e.stopPropagation()} onClick={continueReply}
              className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-ink shadow-md hover:bg-hover">
              <MessageCircle size={13} />Continue convo
            </button>
          )}
        </div>
      )}
      {/* The whole header above the separator drags the node. */}
      <div data-drag-zone className="flex shrink-0 cursor-grab justify-end px-4 pt-2 pb-3 active:cursor-grabbing"><span className="max-w-[85%] rounded-xl bg-[#2383e2] px-3 py-1.5 text-sm whitespace-pre-wrap text-white">{exchange.question}</span></div>
      <div className="shrink-0 border-t border-line" />
      <div ref={body} data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {exchange.answer
          ? <div className="text-sm"><Md text={exchange.answer} onFile={onFile} /></div>
          : <p className="text-sm text-ink-2 italic">{exchange.status === 'thinking' ? 'Thinking…' : `${exchange.status}…`}</p>}
        {replies.map(turn => <div key={turn.id} className="mt-3 border-t border-line pt-3">
          <div className="mb-3 flex justify-end"><span className="rounded-xl bg-accent px-3 py-1.5 text-sm whitespace-pre-wrap text-white">{turn.question}</span></div>
          <div className="text-sm">{turn.answer ? <Md text={turn.answer} onFile={onFile} /> : <span className="text-ink-2">{turn.status === 'done' ? 'No answer received. Try again.' : 'Thinking…'}</span>}</div>
        </div>)}
      </div>
      {started && <div data-block-composer className={`shrink-0 border-t border-line px-3 pb-3 ${replyOpen ? '' : 'hidden'}`} onPointerDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between py-1 text-xs text-ink-2"><span>This conversation</span><button type="button" aria-label="Close block composer" onClick={() => setReplyOpen(false)} className="rounded p-1 hover:bg-hover"><X size={13} /></button></div>
        {renderComposer(exchange, receive)}
      </div>}
    </CanvasNode>
  );
}

// A course-authored lesson block (challenge, explanation, quiz, …) in the
// same chrome as chat nodes; the body renderer comes from LearningBlocks.
// A heading carries no card chrome of its own - it should read as a title on the
// canvas, not another box - so it borrows the ghost treatment blocks already use.
function HeadingCard({ block, zoom, selected, connected, onSelect, onMove, onChange, onLayout, onConnect, onSnap }) {
  const level = levelOf(block);
  const body = useRef(null);
  const shown = useRef(block.text);
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} ghost space={block.space}
      connected={connected} width={COLUMN} autoMax={240}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      <div data-scroll className="min-h-0 flex-1 px-4 pt-1 pb-3">
        <div ref={body} contentEditable suppressContentEditableWarning data-placeholder={level.placeholder}
          style={{ fontSize: level.size, fontWeight: level.weight }}
          onPointerDown={event => event.stopPropagation()}
          onBlur={event => { const text = event.currentTarget.textContent; shown.current = text; onChange({ ...block, text }); }}
          className="leading-tight outline-none empty:before:text-ink-3 empty:before:content-[attr(data-placeholder)]">{shown.current}</div>
      </div>
    </CanvasNode>
  );
}

function LessonBlockCard({ block, zoom, selected, connected, onSelect, onMove, onChange, onChangeQuiet, onLayout, onConnect, onSnap, onAsk, onFile, appName, onAskRegion, onGrade }) {
  if (block.type === 'heading') return <HeadingCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} ghost={!!BLOCK_TYPES[block.type]?.ghost} space={block.space} connected={connected}
      autoMax={BLOCK_TYPES[block.type]?.autoMax}
      width={BLOCK_TYPES[block.type]?.sizeFor?.(block)?.width ?? BLOCK_TYPES[block.type]?.width}
      height={BLOCK_TYPES[block.type]?.sizeFor?.(block)?.height ?? BLOCK_TYPES[block.type]?.height}
      saved={{ w: block.w, h: block.h }} onSize={(id, w, h) => onChange({ ...block, w, h })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      {selected && (
        <div className="absolute -top-10 right-0 z-30 flex items-center gap-1.5">
          {block.type === 'whiteboard' && (
            <button type="button" title={block.marked ? 'Clear the marked region (or press Esc)' : 'Drag a rectangle over the part you want to ask about'}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => (block.marked ? boardAsk(block.id)?.clear() : boardAsk(block.id)?.arm())}
              className={`flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap shadow-md hover:bg-hover ${block.marked ? 'border-red-600 text-red-600' : 'border-line text-ink'}`}>
              {block.marked ? <><X size={13} />Clear selection</> : <><Scan size={13} />Ask selection</>}
            </button>
          )}
          {block.type === 'paper' && (
            <button type="button" title={block.paper?.selection ? 'Clear the marked region (or press Esc)' : 'Select a region of the page to ask about'}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => (block.paper?.selection
                ? onChange({ ...block, paper: { ...block.paper, selection: undefined } })
                : onChange({ ...block, selectRequest: (block.selectRequest || 0) + 1 }))}
              className={`flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap shadow-md hover:bg-hover ${block.paper?.selection ? 'border-red-600 text-red-600' : 'border-line text-ink'}`}>
              {block.paper?.selection ? <><X size={13} />Clear selection</> : <><Scan size={13} />Ask selection</>}
            </button>
          )}
          <button type="button" title="Ask the tutor about this block"
            onPointerDown={e => e.stopPropagation()} onClick={() => onAsk(block)}
            className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-ink shadow-md hover:bg-hover">
            <MessageCircle size={13} />Ask in chat
          </button>
        </div>
      )}
      <LearningBlockBody block={block} onChange={onChange} onChangeQuiet={onChangeQuiet} onFile={onFile} appName={appName} onAskRegion={onAskRegion} onGrade={onGrade} />
    </CanvasNode>
  );
}

function CanvasItem({ item, zoom, tool, selected, onSelect, onChange, onMove, onResize, onGesture, onDelete, onSnap = null }) {
  const [editing, setEditing] = useState(item.fresh);
  const body = useRef(null);
  // The rendered children stay pinned to this ref while editing so re-renders
  // (e.g. a streaming answer) never make React wipe the typed DOM text.
  const shown = useRef(item.text);
  useEffect(() => { if (editing) body.current?.focus(); }, [editing]);
  const sticky = item.kind === 'sticky';
  // A section is a rule across the column with a title under it - the thing that
  // turns a long canvas into chapters. It carries no colour or size of its own,
  // so it reads as structure rather than as another annotation.
  const section = item.kind === 'section';
  const startEdit = () => { shown.current = item.text; setEditing(true); };
  const down = event => {
    if (event.button !== 0) return;
    if (tool === 'eraser') { event.preventDefault(); event.stopPropagation(); onDelete(item.id); return; }
    if (tool !== 'select') return;
    if (!selected) onSelect(item.id, event);
    if (!editing) { onGesture(); startDrag(event, { x: item.x, y: item.y }, (x, y) => onMove(item.id, x, y), zoom, onSnap?.(item.id)); }
    else event.stopPropagation();
  };
  if (section) {
    return (
      <div data-block data-section style={{ left: item.x, top: item.y, width: item.w || COLUMN }}
        className={`group absolute z-10 cursor-grab active:cursor-grabbing ${selected ? 'ring-2 ring-accent ring-offset-2' : ''}`}
        onPointerDown={down} onDoubleClick={startEdit}>
        <div className="h-px w-full bg-line" />
        <div ref={body} contentEditable={editing} suppressContentEditableWarning data-placeholder="Section title…"
          onBlur={e => { setEditing(false); const text = e.currentTarget.textContent; shown.current = text; onChange(item.id, text); }}
          className="mt-2 text-sm font-medium text-ink outline-none empty:before:text-ink-3 empty:before:content-[attr(data-placeholder)]">{shown.current}</div>
        {/* Reachable without selecting first: a section is structure, and removing
            one should not need the same ceremony as editing it. */}
        <button type="button" aria-label="Remove section" title="Remove section"
          onPointerDown={event => event.stopPropagation()}
          onClick={() => onDelete(item.id)}
          className="absolute -top-2 right-0 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-3 opacity-0 hover:bg-hover hover:text-ink focus-visible:opacity-100 group-hover:opacity-100">
          <X size={13} />
        </button>
      </div>
    );
  }
  return (
    <div data-block data-item-id={item.id} style={{ left: item.x, top: item.y, opacity: item.opacity, ...(sticky ? { width: item.w || 160, height: item.h || 160 } : { color: item.color, ...textStyle(item) }) }}
      className={`absolute z-10 cursor-grab active:cursor-grabbing ${sticky
        // Text has no card behind it, so its box is invisible until you are on
        // it. The border is always there and only gains a colour on hover, so
        // nothing shifts; the padding is cancelled by the margin for the same
        // reason - glyphs stay exactly where they were placed.
        ? '-rotate-1 overflow-hidden rounded-sm border border-[#f0d9a8] bg-[#fef3c7] p-3 text-[13px] leading-snug text-[#6b4e0b] shadow-md'
        : `min-w-24 -mx-1 -my-0.5 rounded border border-transparent px-1 py-0.5 leading-snug ${tool === 'select' ? 'hover:border-line' : ''}`} ${selected ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`}
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

// The lesson-block picker. Used by the corner button, which appends, and by the
// rail, which inserts at the gap you are pointing at.
// What the rail's [...] offers: section depths and nothing else. Each is drawn at
// the size it produces, so the choice is its own preview.
function SectionMenu({ className, onLevel }) {
  return (
    <div role="menu" aria-label="Insert a section" className={`absolute z-40 flex w-52 flex-col overflow-hidden rounded-xl border border-line bg-white p-1 shadow-md ${className}`}>
      {SECTION_LEVELS.map(entry => (
        <button key={entry.level} type="button" role="menuitem" onClick={() => onLevel(entry.level)}
          style={{ fontSize: Math.round(entry.size * 0.62), fontWeight: entry.weight }}
          className="block w-full rounded-lg px-3 py-1 text-left leading-tight text-ink hover:bg-hover">{entry.label}</button>
      ))}
    </div>
  );
}

function BlockMenu({ className, filter, onFilter, onPick }) {
  return (
    <div role="menu" aria-label="Lesson blocks" className={`absolute z-40 flex max-h-[70vh] w-44 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-md ${className}`}>
      <input type="search" autoFocus value={filter} onChange={event => onFilter(event.target.value)}
        aria-label="Filter blocks" placeholder="Filter…"
        className="m-1 h-7 shrink-0 rounded-lg border border-line px-2 text-xs outline-none focus:border-ink-3" />
      {/* the list keeps growing, so it scrolls instead of running off the canvas */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-1 pt-0">
        {Object.entries(BLOCK_TYPES)
          .filter(([, meta]) => meta.label.toLowerCase().includes(filter.trim().toLowerCase()))
          .map(([type, meta]) => (
            <button key={type} type="button" role="menuitem" onClick={() => onPick(type)}
              className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-ink hover:bg-hover">{meta.label}</button>
          ))}
      </div>
    </div>
  );
}

// The insert rail: a dotted line across the column, with [-] and [+] parked on
// the blank canvas beside it. Press either as often as you like - [+] pushes the
// pair apart, [-] pulls it together and then straight past flush into an
// overlap, because the space is only a margin and margins go negative.
function GapRail({ gap, zoom, span, space, adding, onNudge, onAdding, onAddHeading }) {
  const chrome = 'flex h-6 items-center justify-center rounded-lg border border-line bg-white text-ink-2 shadow-md hover:bg-hover hover:text-ink';
  const button = (delta, Icon, label) => (
    <button type="button" aria-label={label} title={label} onClick={() => onNudge(gap.beforeId, delta)}
      onPointerDown={event => event.stopPropagation()} // a press here must not start a pan
      className={`${chrome} w-6`}>
      <Icon size={13} strokeWidth={1.8} />
    </button>
  );
  return (
    <div style={{ top: gap.y }} className="pointer-events-none absolute left-0 z-10">
      {/* Runs the width of the visible canvas less an equal margin at each end,
          rather than stopping at the column. The buttons carry their own white
          background, so they read as a badge sitting on the line. */}
      <div style={{ left: span.left, width: span.width }} className="absolute -translate-y-1/2 border-t border-dashed border-ink-3/50" />
      {/* Counter-scaled so the buttons stay the same size to press at any zoom.
          They sit off the left edge of the column, on blank canvas. */}
      <div style={{ left: -12, transform: `translate(-100%, -50%) scale(${1 / zoom})`, transformOrigin: 'right center' }}
        className="pointer-events-auto absolute flex items-center gap-1">
        {button(-SPACE_STEP, Minus, `Pull these cards together — ${space}px apart`)}
        {button(SPACE_STEP, Plus, `Push these cards apart — ${space}px apart`)}
        {/* Same dev gate as the corner button this came from. */}
        <span className="relative">
          <button type="button" aria-label="Insert a section here" title="Insert a section in this gap" aria-expanded={adding}
            onPointerDown={event => event.stopPropagation()} onClick={() => onAdding(!adding)}
            className={`${chrome} w-6`}><Ellipsis size={14} strokeWidth={1.8} /></button>
          {adding && <SectionMenu className="top-7 left-0" onLevel={level => onAddHeading(level, gap.index + 1)} />}
        </span>
      </div>
    </div>
  );
}

const pathOf = points => points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');

const arrowHead = (tip, from, stroke) => {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x), size = 8 + stroke.strokeWidth * 2;
  return <path d={`M${tip.x - size * Math.cos(angle - 0.45)} ${tip.y - size * Math.sin(angle - 0.45)} L${tip.x} ${tip.y} L${tip.x - size * Math.cos(angle + 0.45)} ${tip.y - size * Math.sin(angle + 0.45)}`} {...stroke} strokeDasharray={undefined} />;
};

function ShapeView({ shape, tool, zoom, selected, onSelect, onMoveStart, onResize, onGesture, onDelete }) {
  const { kind, x1, y1, x2, y2, color, width, dash, fill, opacity, round } = shape;
  const stroke = { stroke: color, strokeWidth: width, fill: fill || 'none', fillOpacity: fill ? 0.25 : undefined, opacity, strokeDasharray: dashArray(dash, width), strokeLinecap: 'round', strokeLinejoin: 'round' };
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  const control = kind === 'curve' ? curveControl(shape) : null;
  const linear = kind === 'line' || kind === 'arrow' || kind === 'curve';
  const down = event => {
    if (event.button !== 0) return;
    if (tool === 'eraser') { event.stopPropagation(); onDelete(shape.id); return; }
    if (tool !== 'select') return;
    if (!selected) onSelect(shape.id, event);
    onMoveStart(event, shape);
  };
  // Drag an endpoint (linear) or a corner (boxed) to resize the drawn shape.
  const handles = linear
    ? [[x1, y1, p => ({ x1: p.x, y1: p.y })], [x2, y2, p => ({ x2: p.x, y2: p.y })]]
    : [[x1, y1, p => ({ x1: p.x, y1: p.y })], [x2, y1, p => ({ x2: p.x, y1: p.y })], [x2, y2, p => ({ x2: p.x, y2: p.y })], [x1, y2, p => ({ x1: p.x, y2: p.y })]];
  return (
    <g style={{ pointerEvents: 'visibleStroke', cursor: tool === 'select' ? 'grab' : undefined }} onPointerDown={down}>
      {kind === 'rect' && <rect x={x} y={y} width={w} height={h} rx={round ? 14 : 2} {...stroke} />}
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

// Colour, thickness and dash used to live in the tool column, which had grown to
// 26 buttons and scrolled. They sit in their own island now, beside the tools,
// shown only while a drawing tool is armed or something styleable is selected.
// Text swaps the thickness row for Notion's heading ladder.
function StylePanel({ text, showFill, corners, order, color, fill, width, dash, opacity, round, level, onColor, onFill, onWidth, onDash, onOpacity, onRound, onLevel, onOrder }) {
  const rule = <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />;
  return (
    <div role="group" aria-label="Style" onPointerDown={event => event.stopPropagation()}
      className="absolute top-1/2 right-16 z-20 grid max-h-full -translate-y-1/2 grid-cols-2 gap-0.5 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-md">
      {COLORS.map(value => (
        <button key={value} type="button" title="Color" aria-label={`Color ${value}`} aria-pressed={color === value} onClick={() => onColor(value)}
          className="flex h-6 w-8 items-center justify-center rounded-lg hover:bg-hover">
          <span style={{ background: value }} className={`h-3.5 w-3.5 rounded-full ${color === value ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`} />
        </button>
      ))}
      {showFill && rule}
      {showFill && (
        <>
          {/* Fill is drawn at a quarter opacity so a filled shape never buries
              what is under it - the Excalidraw habit, without the hatching. */}
          <button type="button" title="No fill" aria-label="No fill" aria-pressed={!fill} onClick={() => onFill(null)}
            className="flex h-6 w-8 items-center justify-center rounded-lg hover:bg-hover">
            <span className={`h-3.5 w-3.5 rounded-sm border border-line bg-white ${!fill ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`}>
              <svg viewBox="0 0 14 14" aria-hidden="true"><line x1="1" y1="13" x2="13" y2="1" stroke="#b42318" strokeWidth="1.5" /></svg>
            </span>
          </button>
          {COLORS.map(value => (
            <button key={value} type="button" title="Fill" aria-label={`Fill ${value}`} aria-pressed={fill === value} onClick={() => onFill(value)}
              className="flex h-6 w-8 items-center justify-center rounded-lg hover:bg-hover">
              <span style={{ background: value, opacity: 0.25, borderColor: value }} className={`h-3.5 w-3.5 rounded-sm border ${fill === value ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`} />
            </button>
          ))}
        </>
      )}
      {rule}
      {text
        ? TEXT_LEVELS.map(entry => (
          <button key={entry.id} type="button" title={entry.label} aria-label={entry.label} aria-pressed={level === entry.id} onClick={() => onLevel(entry.id)}
            className={`flex h-6 w-8 items-center justify-center rounded-lg text-[11px] ${level === entry.id ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover'}`}
            style={{ fontWeight: entry.weight }}>{entry.label}</button>
        ))
        : <>
          {WIDTHS.map(value => (
            <button key={value} type="button" title={`Stroke width ${value}`} aria-label={`Stroke width ${value}`} aria-pressed={width === value} onClick={() => onWidth(value)}
              className={`flex h-6 w-8 items-center justify-center rounded-lg ${width === value ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover'}`}>
              <span style={{ height: value }} className="w-4 rounded-full bg-current" />
            </button>
          ))}
          {DASH_STYLES.map(value => (
            <button key={value} type="button" title={value} aria-label={`${value} lines`} aria-pressed={dashStyle(dash) === value} onClick={() => onDash(value)}
              className={`flex h-6 w-8 items-center justify-center rounded-lg ${dashStyle(dash) === value ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover'}`}>
              <svg width="16" height="4" aria-hidden="true">
                <line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeDasharray={value === 'dashed' ? '4 3' : value === 'dotted' ? '0 4' : undefined} />
              </svg>
            </button>
          ))}
        </>}
      {rule}
      {OPACITIES.map(value => (
        <button key={value} type="button" title={`Opacity ${Math.round(value * 100)}%`} aria-label={`Opacity ${Math.round(value * 100)}%`}
          aria-pressed={(opacity ?? 1) === value} onClick={() => onOpacity(value)}
          className={`flex h-6 w-8 items-center justify-center rounded-lg ${(opacity ?? 1) === value ? 'bg-hover' : 'hover:bg-hover'}`}>
          <span style={{ background: color, opacity: value }} className="h-3.5 w-3.5 rounded-full" />
        </button>
      ))}
      {corners && (
        <>
          <button type="button" title="Sharp corners" aria-label="Sharp corners" aria-pressed={!round} onClick={() => onRound(false)}
            className={`flex h-6 w-8 items-center justify-center rounded-lg ${!round ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover'}`}><Square size={14} strokeWidth={1.7} /></button>
          <button type="button" title="Rounded corners" aria-label="Rounded corners" aria-pressed={!!round} onClick={() => onRound(true)}
            className={`flex h-6 w-8 items-center justify-center rounded-lg ${round ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover'}`}><Squircle size={14} strokeWidth={1.7} /></button>
        </>
      )}
      {order && (
        <>
          {rule}
          <button type="button" title="Send to back" aria-label="Send to back" onClick={() => onOrder(false)}
            className="flex h-6 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"><SendToBack size={14} strokeWidth={1.7} /></button>
          <button type="button" title="Bring to front" aria-label="Bring to front" onClick={() => onOrder(true)}
            className="flex h-6 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"><BringToFront size={14} strokeWidth={1.7} /></button>
        </>
      )}
    </div>
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

export default function AdaptiveCanvas({ exchanges, onMove, onDelete = null, onRestore = null, onAskTarget = null, onOpenFile = null, onAdd = null, onGrade = null, onResize = null, onReply = null, appName = null, apiRef = null, storageKey = null, seedBlocks = null, composer = null, renderBlockComposer = null }) {
  const [tool, setTool] = useState('select');
  const [insertOpen, setInsertOpen] = useState(false); // dev-only lesson-block workbench menu
  const [insertFilter, setInsertFilter] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[0]);
  const [dash, setDash] = useState('solid');
  const [fill, setFill] = useState(null);
  const [opacity, setOpacity] = useState(1);
  const [round, setRound] = useState(false);
  // Lock keeps the armed tool armed, so three rectangles take three drags
  // instead of three trips back to the toolbar.
  const [lock, setLock] = useState(false);
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
  // seedBlocks fills a board that has never been used. A board with its own
  // saved CONTENT always wins - but a saved EMPTY board re-seeds, because [] is
  // truthy and an empty array in storage is how a visit during a deploy
  // rollout, or to a then-unregistered name, permanently froze a board blank.
  const [blocks, setBlocks] = useState(stored.current.blocks?.length ? stored.current.blocks : (seedBlocks || [])); // course-authored lesson blocks
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  // Selection is a list: ctrl/cmd/shift-click adds to it, so several nodes
  // move or delete together.
  const [selection, setSelection] = useState([]);
  const selected = selection.length === 1 ? selection[0] : null; // single-target affordances
  const isSelected = id => selection.includes(id);
  const setSelected = value => setSelection(value == null ? [] : [value]);
  // Selecting on the canvas takes the keyboard away from the composer so
  // Delete acts on the selection; editable notes keep their own focus.
  const select = (id, event = null) => {
    const active = document.activeElement;
    if (id && active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) active.blur();
    const additive = event && (event.ctrlKey || event.metaKey || event.shiftKey);
    if (!additive) { setSelection(id == null ? [] : [id]); return; }
    setSelection(previous => previous.includes(id) ? previous.filter(other => other !== id) : [...previous, id]);
  };
  const [links, setLinks] = useState(stored.current.links || []);
  useEffect(() => {
    if (!storageKey) return;
    // ponytail: generated images are large data URLs; keep the prompt, drop the
    // bytes so one illustration cannot fill the browser's storage quota.
    const light = blocks.map(block => block.src?.startsWith('data:') && block.src.length > 120000 ? { ...block, src: '' } : block);
    const timer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify({ strokes, shapes, items, links, blocks: light })); } catch { /* full or blocked storage loses drawings only */ } }, 400);
    return () => clearTimeout(timer);
  }, [strokes, shapes, items, links, blocks, storageKey]);
  const [connecting, setConnecting] = useState(null);
  const [bounds, setBounds] = useState({});
  const [hoverGap, setHoverGap] = useState(null);
  const [gapAdding, setGapAdding] = useState(false);
  const [guides, setGuides] = useState([]);
  const [grid, setGrid] = useState(false);
  const itemsLayer = useRef(null);
  const [level, setLevel] = useState('body');
  const [styleOpen, setStyleOpen] = useState(false); // the swatch's manual override
  const exchangesRef = useRef(exchanges);
  exchangesRef.current = exchanges;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const onAskTargetRef = useRef(onAskTarget);
  onAskTargetRef.current = onAskTarget;
  useEffect(() => { if (apiRef) apiRef.current = { deselect: () => setSelected(null) }; });
  const connectionCleanup = useRef(null);
  const boundsRef = useRef({});
  const clipboard = useRef(null);
  const shapesRef = useRef([]);
  const onAddRef = useRef(null);
  const selectedRef = useRef([]);
  selectedRef.current = selection;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const surface = useRef(null);
  const column = useRef(null);
  const measureBlocks = useCallback(() => {
    const next = {};
    for (const element of column.current?.querySelectorAll('[data-block-id]') || []) {
      const owner = exchangesRef.current.find(item => item.id === element.dataset.blockId) || blocksRef.current.find(item => item.id === element.dataset.blockId);
      if (owner) next[owner.id] = { x: element.offsetLeft + owner.dx, y: element.offsetTop + owner.dy, w: element.offsetWidth, h: element.offsetHeight };
    }
    setBounds(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []);
  boundsRef.current = bounds;
  shapesRef.current = shapes;
  onAddRef.current = onAdd;
  useLayoutEffect(measureBlocks, [exchanges, blocks, measureBlocks]);
  useEffect(() => () => connectionCleanup.current?.(), []);
  // Undo: snapshot the three artifact lists before every mutating gesture.
  // ponytail: single-level lists + 100-step cap; redo comes when asked for.
  const present = useRef(null);
  present.current = { strokes, shapes, items, links, blocks };
  const history = useRef([]);
  // withExchanges captures the chat blocks too, so deleting a block undoes.
  const snapshot = (withExchanges = false) => {
    history.current.push({ ...present.current, ...(withExchanges ? { exchanges: exchangesRef.current } : {}) });
    if (history.current.length > 100) history.current.shift();
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    setStrokes(previous.strokes); setShapes(previous.shapes); setItems(previous.items); setLinks(previous.links); setBlocks(previous.blocks); setSelected(null);
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
      // Copy and paste work on every selected node, note and shape.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        if (typing || !selectedRef.current.length || window.getSelection()?.toString()) return;
        const picked = selectedRef.current;
        clipboard.current = {
          blocks: blocksRef.current.filter(block => picked.includes(block.id)),
          items: itemsRef.current.filter(item => picked.includes(item.id)),
          shapes: shapesRef.current.filter(shape => picked.includes(shape.id)),
          chats: exchangesRef.current.filter(exchange => picked.includes(exchange.id)),
        };
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        const clip = clipboard.current;
        if (typing || !clip) return;
        event.preventDefault();
        snapshot(clip.chats.length > 0);
        const step = 28;
        const fresh = [];
        const copyNode = node => { const id = crypto.randomUUID(); fresh.push(id); return { ...node, id, dx: node.dx + step, dy: node.dy + step }; };
        const blocksCopy = clip.blocks.map(copyNode);
        const chatsCopy = clip.chats.map(node => ({ ...copyNode(node), linkFrom: null }));
        const itemsCopy = clip.items.map(item => { const id = crypto.randomUUID(); fresh.push(id); return { ...item, id, x: item.x + step, y: item.y + step, fresh: false }; });
        const shapesCopy = clip.shapes.map(shape => { const id = crypto.randomUUID(); fresh.push(id); return { ...shape, id, x1: shape.x1 + step, y1: shape.y1 + step, x2: shape.x2 + step, y2: shape.y2 + step }; });
        if (blocksCopy.length) setBlocks(previous => [...previous, ...blocksCopy]);
        if (itemsCopy.length) setItems(previous => [...previous, ...itemsCopy]);
        if (shapesCopy.length) setShapes(previous => [...previous, ...shapesCopy]);
        if (chatsCopy.length) onAddRef.current?.(chatsCopy);
        setSelection(fresh);
        clipboard.current = { ...clip, blocks: blocksCopy, items: itemsCopy, shapes: shapesCopy, chats: chatsCopy };
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const ids = selectedRef.current;
      if (typing || !ids.length) return;
      const chats = ids.filter(id => exchangesRef.current.some(exchange => exchange.id === id));
      snapshot(chats.length > 0);
      // Selected nodes delete with their attached connections.
      for (const id of chats) onDeleteRef.current?.(id);
      const nodes = new Set([...chats, ...ids.filter(id => blocksRef.current.some(block => block.id === id))]);
      setBlocks(previous => previous.filter(block => !ids.includes(block.id)));
      setItems(previous => previous.filter(item => !ids.includes(item.id)));
      setShapes(previous => previous.filter(shape => !ids.includes(shape.id)));
      setLinks(previous => previous.filter(link => !ids.includes(link.id) && !nodes.has(link.from) && !nodes.has(link.to)));
      setSelection([]);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  // The Ask-in-chat button on a selected block arms the dock composer with
  // that block as context; plain selection stays just a selection.
  const askBlock = block => {
    const described = describeBlock(block);
    if (described) onAskTargetRef.current?.({ id: block.id, ...described });
  };
  // A red region drawn on a paper page arms the composer with its thumbnail
  // and the page context, so the answer node links back to that paper block.
  const askRegion = (block, selection) => {
    if (block.type === 'whiteboard') {
      onAskTargetRef.current?.({
        id: block.id,
        kind: 'Whiteboard selection',
        title: block.title,
        preview: selection.preview || undefined,
        text: [
          `Learner whiteboard: ${block.title}`,
          `Selected shapes: ${selection.shapes.map(shape => `${shape.type}${shape.text ? ` "${shape.text}"` : ''} (${shape.author})`).join(', ')}`,
        ].join(String.fromCharCode(10)),
      });
      return;
    }
    // An animation marks a moment, not a page: the question points at a time
    // and the objects under the rectangle, and the scene stays where it was.
    if (block.type === 'animation') {
      onAskTargetRef.current?.({
        id: block.id,
        kind: 'Animation moment',
        title: `${block.title} · ${selection.time}s`,
        text: [
          `Animation: ${block.title}`,
          `Paused at ${selection.time}s of ${block.scene.duration}s`,
          selection.targets?.length ? `Objects inside the marked region: ${selection.targets.join(', ')}` : 'The marked region contains no authored object.',
          `Marked region (normalized x, y, w, h): ${JSON.stringify(selection.region)}`,
        ].join(String.fromCharCode(10)),
      });
      return;
    }
    const described = describeBlock(block);
    onAskTargetRef.current?.({
      id: block.id,
      kind: 'Paper selection',
      title: `${block.title} · page ${block.paper.page}`,
      text: `${described?.text || ''}\nThe learner marked this region of the page (normalized x, y, w, h): ${JSON.stringify(selection.region)}.`,
      preview: selection.preview,
      // The server validates selection.region, not a bare rectangle.
      paper: { id: block.paper.id, page: block.paper.page, selection: { region: selection.region } },
    });
  };
  // A question asked about a block auto-links that block to its answer node,
  // parks the node below its source and slides it past anything already
  // there. Placement repeats once the answer is complete, when the node's
  // height is final.
  const autoLinked = useRef(new Set());
  const autoSettled = useRef(new Set());
  useEffect(() => {
    for (const exchange of exchanges) {
      if (!exchange.linkFrom) continue;
      const placed = autoLinked.current.has(exchange.id);
      if (placed && (autoSettled.current.has(exchange.id) || exchange.status !== 'done')) continue;
      const source = bounds[exchange.linkFrom], own = bounds[exchange.id];
      if (!source || !own) continue; // wait for both to be measured
      autoLinked.current.add(exchange.id);
      if (exchange.status === 'done') autoSettled.current.add(exchange.id);
      const x = source.x + (source.w - own.w) / 2;
      let y = source.y + source.h + 28;
      // Push below any node whose box would overlap this one.
      const others = Object.entries(bounds).filter(([id]) => id !== exchange.id && id !== exchange.linkFrom).map(([, box]) => box).sort((a, b) => a.y - b.y);
      for (let pass = 0; pass < 8; pass++) {
        const hit = others.find(box => x < box.x + box.w && x + own.w > box.x && y < box.y + box.h && y + own.h > box.y);
        if (!hit) break;
        y = hit.y + hit.h + 24;
      }
      const flowX = own.x - exchange.dx, flowY = own.y - exchange.dy;
      onMove(exchange.id, x - flowX, y - flowY);
      if (!present.current.links.some(link => link.from === exchange.linkFrom && link.to === exchange.id)) {
        setLinks(previous => [...previous, { id: crypto.randomUUID(), from: exchange.linkFrom, fromSide: 'bottom', to: exchange.id, toSide: 'top', color: LINK_COLORS[blocksRef.current.find(block => block.id === exchange.linkFrom)?.type] || '#2383e2' }]);
      }
    }
  }, [exchanges, bounds]);
  // Keep the newest exchange in sight while it streams. Moving a node must
  // not re-trigger this, so the pan is keyed on arrivals and status changes.
  const autoPanKey = useRef('');
  useEffect(() => {
    const element = surface.current, col = column.current;
    // No exchanges means nothing is streaming, so there is no newest thing to
    // follow - and panning anyway drags a seeded board past its own first
    // block. Inserting still pans, through insertBlock's own camera move.
    if (!element || !col || !exchanges.length) return;
    const last = exchanges[exchanges.length - 1];
    const key = `${exchanges.length}:${blocks.length}:${last?.id || ''}:${last?.status || ''}`;
    if (key === autoPanKey.current) return;
    autoPanKey.current = key;
    setView(v => {
      const bottom = v.y + (24 + col.offsetHeight) * v.z;
      const want = element.clientHeight - 150;
      return bottom > want ? { ...v, y: v.y - (bottom - want) } : v;
    });
  }, [exchanges, blocks.length]);
  const zoomAt = (cx, cy, factor) => setView(v => {
    const z = Math.min(3, Math.max(0.25, v.z * factor));
    const f = z / v.z;
    return { x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f, z };
  });
  // One click moves roughly one screenful, so the canvas reads like a page.
  const scrollBy = direction => setView(v => ({ ...v, y: v.y - direction * (surface.current.clientHeight * 0.7) }));
  const zoomCenter = factor => { const element = surface.current; zoomAt(element.clientWidth / 2, element.clientHeight / 2, factor); };
  const local = event => {
    const box = surface.current.getBoundingClientRect();
    return { x: (event.clientX - box.left - view.x) / view.z, y: (event.clientY - box.top - view.y) / view.z };
  };
  const portPosition = (id, side) => {
    const box = bounds[id];
    return box ? { x: box.x + box.w / 2, y: box.y + (side === 'bottom' ? box.h : 0) } : null;
  };
  // Dropping a connector is forgiving near a port, but not so greedy that
  // passing over a node drags the line onto it.
  const snapPort = (point, exclude) => {
    let best = null;
    for (const [id, box] of Object.entries(boundsRef.current)) {
      if (id === exclude) continue;
      for (const side of ['top', 'bottom']) {
        const at = { x: box.x + box.w / 2, y: box.y + (side === 'bottom' ? box.h : 0) };
        const distance = Math.hypot(at.x - point.x, at.y - point.y);
        if (distance < 48 && (!best || distance < best.distance)) best = { id, side, at, distance };
      }
    }
    return best;
  };
  const connect = (event, from, fromSide) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    connectionCleanup.current?.();
    // The ink color drives the connector; the plain ink default reads as
    // uncolored on a line, so it maps to the accent blue.
    const source = blocksRef.current.find(block => block.id === from);
    const linkColor = color === COLORS[0] ? (LINK_COLORS[source?.type || 'chat'] || '#2383e2') : color;
    const trace = e => {
      const point = local(e);
      const snap = snapPort(point, from);
      setConnecting({ from, fromSide, toPoint: snap ? snap.at : point, snap, color: linkColor });
      return snap;
    };
    trace(event);
    const move = e => trace(e);
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      connectionCleanup.current = null;
    };
    const cancel = () => { cleanup(); setConnecting(null); };
    const up = e => {
      const snap = snapPort(local(e), from);
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-port]');
      const to = snap?.id || target?.dataset.owner, toSide = snap?.side || target?.dataset.port;
      if (to && to !== from && !present.current.links.some(link => link.from === from && link.fromSide === fromSide && link.to === to && link.toSide === toSide)) {
        snapshot();
        setLinks(previous => [...previous, { id: crypto.randomUUID(), from, fromSide, to, toSide, color: linkColor }]);
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
      const ink = tool === 'pen' ? { tool, color, width, dash, opacity } : { tool, width: width * 4 };
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
      const draft = { id: crypto.randomUUID(), kind: tool, x1: start.x, y1: start.y, x2: start.x, y2: start.y, color, width, dash, fill, opacity, round };
      setLiveShape(draft);
      const move = e => { const p = local(e); setLiveShape({ ...draft, x2: p.x, y2: p.y }); };
      const up = e => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        const p = local(e);
        setLiveShape(null);
        if (Math.hypot(p.x - start.x, p.y - start.y) > 4) { snapshot(); setShapes(previous => [...previous, { ...draft, x2: p.x, y2: p.y }]); }
        if (!lock) setTool('select');
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
      setItems(previous => [...previous, { id: crypto.randomUUID(), kind: tool, x: point.x, y: point.y, text: '', color, opacity, ...(tool === 'text' ? { level } : {}), fresh: true }]);
      if (!lock) setTool('select');
    } else {
      setSelected(null);
      pan(event);
    }
  };
  const moveItem = (id, x, y) => setItems(previous => previous.map(item => item.id === id ? { ...item, x, y } : item));
  const resizeItem = (id, w, h) => setItems(previous => previous.map(item => item.id === id ? { ...item, w, h } : item));
  // A separator is a wall: a card may be nudged inside its own band but never
  // dragged across the line into its neighbour's. Out of room is a deliberate
  // dead end - [+] on the rail is how you make more. The band is measured from
  // where the card sits with no offset at all, so it does not move as you drag.
  const bandFor = id => {
    const list = blocksRef.current;
    const index = list.findIndex(block => block.id === id);
    const box = boundsRef.current[id];
    if (index < 0 || !box) return null;
    const flowY = box.y - list[index].dy;
    const above = index > 0 ? boundsRef.current[list[index - 1].id] : null;
    const below = boundsRef.current[list[index + 1]?.id];
    return {
      flowY,
      height: box.h,
      // Same midpoint the rail draws its line at, in learn-gap-rail.js.
      top: above ? (above.y + above.h + flowY) / 2 : -Infinity,
      bottom: below ? (flowY + box.h + below.y) / 2 : Infinity,
    };
  };
  const clampToBand = (id, dy) => {
    const band = bandFor(id);
    if (!band) return dy;
    const lowest = band.top - band.flowY;
    const highest = band.bottom - band.flowY - band.height;
    // A card taller than its band pins to the top of it rather than jittering.
    return highest < lowest ? lowest : Math.min(Math.max(dy, lowest), highest);
  };
  const moveBlock = (id, dx, dy) => setBlocks(previous => previous.map(block => block.id === id ? { ...block, dx, dy: clampToBand(id, dy) } : block));
  // Dragging one member of a multi-selection carries the whole group.
  const shift = (ddx, ddy, ids) => {
    for (const id of ids) {
      const exchange = exchangesRef.current.find(item => item.id === id);
      if (exchange) { onMove(id, exchange.dx + ddx, exchange.dy + ddy); continue; }
      const block = blocksRef.current.find(item => item.id === id);
      if (block) { moveBlock(id, block.dx + ddx, block.dy + ddy); continue; }
      const item = itemsRef.current.find(entry => entry.id === id);
      if (item) setItems(previous => previous.map(entry => entry.id === id ? { ...entry, x: item.x + ddx, y: item.y + ddy } : entry));
    }
  };
  const groupTargets = id => selectedRef.current.includes(id) && selectedRef.current.length > 1 ? selectedRef.current : [id];
  const moveNode = (id, dx, dy) => {
    const node = exchangesRef.current.find(item => item.id === id) || blocksRef.current.find(item => item.id === id);
    if (node) shift(dx - node.dx, dy - node.dy, groupTargets(id));
  };
  const moveItemNode = (id, x, y) => {
    const item = itemsRef.current.find(entry => entry.id === id);
    if (item) shift(x - item.x, y - item.y, groupTargets(id));
  };
  const changeBlock = updated => { snapshot(); setBlocks(previous => previous.map(block => block.id === updated.id ? updated : block)); };
  // A continuous gesture must not snapshot: one scrub drag would evict the whole
  // 100-entry undo ring. Same reasoning as moveBlock, which has never snapshotted.
  const changeBlockQuietly = updated => setBlocks(previous => previous.map(block => block.id === updated.id ? updated : block));
  // A style press sets the default for the next thing drawn, and restyles
  // whatever is selected. Connectors only carry a colour.
  const applyStyle = (patch, targets) => {
    if (!targets.length) return;
    snapshot();
    setShapes(previous => previous.map(shape => targets.includes(shape.id) ? { ...shape, ...patch } : shape));
    setItems(previous => previous.map(item => targets.includes(item.id) ? { ...item, ...patch } : item));
    if (patch.color) setLinks(previous => previous.map(link => targets.includes(link.id) ? { ...link, color: patch.color } : link));
  };
  // Every box a drag can line itself up against, gathered once when the drag
  // starts rather than every frame. Item sizes are read from the DOM here
  // because nothing else measures them - a centre needs a width.
  const collectBoxes = exclude => {
    const boxes = [];
    for (const [id, box] of Object.entries(boundsRef.current)) if (!exclude.includes(id)) boxes.push(box);
    for (const shape of shapesRef.current) {
      if (exclude.includes(shape.id)) continue;
      boxes.push({ x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2), w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) });
    }
    for (const element of itemsLayer.current?.querySelectorAll('[data-item-id]') || []) {
      const item = itemsRef.current.find(entry => entry.id === element.dataset.itemId);
      if (item && !exclude.includes(item.id)) boxes.push({ x: item.x, y: item.y, w: element.offsetWidth, h: element.offsetHeight });
    }
    return boxes;
  };
  // One adapter per mover. Each drag speaks its own coordinates - a card moves
  // by an offset from its place in the column, a note by absolute position, a
  // shape by one corner - so `base` maps that to a world box and back again.
  const makeSnap = (exclude, size, base = { x: 0, y: 0 }, toColumn = false) => {
    const others = collectBoxes(exclude);
    const tolerance = SNAP_TOLERANCE / view.z;
    const snap = (x, y) => {
      let { x: nx, y: ny, lines } = snapMove({ x: base.x + x, y: base.y + y, ...size }, others, tolerance);
      // A card also answers to the lesson column. Pulling its offset back to
      // zero is "put it back in the flow", which is the alignment that matters
      // most here and has no other object to line up against.
      if (toColumn && !lines.some(line => line.axis === 'x') && Math.abs(nx - base.x) < tolerance) {
        nx = base.x;
        lines = [...lines, { axis: 'x', at: nx + size.w / 2, from: ny, to: ny + size.h }];
      }
      if (grid && !lines.length) ({ x: nx, y: ny } = snapGrid(nx, ny));
      setGuides(lines);
      return { x: nx - base.x, y: ny - base.y };
    };
    snap.done = () => setGuides([]);
    return snap;
  };
  // A card's base is where it sits with no offset at all; bounds already folds
  // the offset in, so take it back out.
  const snapForNode = id => {
    const box = boundsRef.current[id];
    const node = exchangesRef.current.find(item => item.id === id) || blocksRef.current.find(item => item.id === id);
    if (!box || !node) return null;
    return makeSnap(groupTargets(id), { w: box.w, h: box.h }, { x: box.x - node.dx, y: box.y - node.dy }, true);
  };
  const snapForItem = id => {
    const element = itemsLayer.current?.querySelector(`[data-item-id="${id}"]`);
    return element ? makeSnap([id], { w: element.offsetWidth, h: element.offsetHeight }) : null;
  };
  // Paint order is array order for both lists, so one pass over each is enough.
  const reorderSelection = (toFront, targets) => {
    if (!targets.length) return;
    snapshot();
    setShapes(previous => reorder(previous, targets, toFront));
    setItems(previous => reorder(previous, targets, toFront));
  };
  // Inserted into the column flow between two cards, so it needs no offset.
  const insertHeadingAt = (level, index) => {
    snapshot();
    const heading = { id: crypto.randomUUID(), type: 'heading', dx: 0, dy: 0, level, text: '' };
    setBlocks(previous => [...previous.slice(0, index), heading, ...previous.slice(index)]);
    setGapAdding(false);
  };
  const nudgeGap = (beforeId, delta) => {
    snapshot();
    setBlocks(previous => previous.map(block => block.id === beforeId ? { ...block, space: (block.space || 0) + delta } : block));
  };
  // Inserted blocks land in free space below everything that visually
  // occupies the column strip (dragged nodes, stickies, shapes, ink), then
  // the camera pans down to show them.
  const insertBlock = type => {
    snapshot();
    const col = column.current, element = surface.current;
    const flowY = (col?.offsetHeight || 0) + (col?.children.length ? 20 : 0);
    const inStrip = (left, right) => left < COLUMN && right > 0;
    const lowest = Math.max(
      0,
      ...Object.values(bounds).filter(b => inStrip(b.x, b.x + b.w)).map(b => b.y + b.h),
      ...items.filter(item => inStrip(item.x, item.x + (item.w || 200))).map(item => item.y + (item.kind === 'sticky' ? (item.h || 160) : (item.size || 14) * 2)),
      ...shapes.filter(shape => inStrip(Math.min(shape.x1, shape.x2), Math.max(shape.x1, shape.x2))).map(shape => Math.max(shape.y1, shape.y2)),
      ...strokes.flatMap(stroke => stroke.points.filter(point => point.x > 0 && point.x < COLUMN).map(point => point.y)),
    );
    const dy = Math.max(0, lowest - flowY + 24);
    setBlocks(previous => [...previous, { ...BLOCK_TYPES[type].sample(), dy }]);
    setInsertOpen(false);
    setInsertFilter('');
    if (element) setView(v => ({ ...v, y: Math.min(v.y, element.clientHeight - 280 - (24 + flowY + dy) * v.z) }));
  };
  const changeItem = (id, text) => {
    if (present.current.items.some(item => item.id === id && item.text !== text)) snapshot();
    setItems(previous => previous.map(item => item.id === id ? { ...item, text, fresh: false } : item));
  };
  const deleteItem = id => { snapshot(); setItems(previous => previous.filter(item => item.id !== id)); setShapes(previous => previous.filter(shape => shape.id !== id)); setSelection(previous => previous.filter(other => other !== id)); };
  // A section lands below whatever already occupies the column, the same way an
  // inserted block does, so adding one never drops a rule on top of existing work.
  const addSection = () => {
    snapshot();
    const inStrip = (left, right) => left < COLUMN && right > 0;
    const lowest = Math.max(
      0,
      ...Object.values(bounds).filter(b => inStrip(b.x, b.x + b.w)).map(b => b.y + b.h),
      ...items.filter(item => inStrip(item.x, item.x + (item.w || 200))).map(item => item.y + (item.kind === 'sticky' ? (item.h || 160) : (item.size || 14) * 2)),
      ...shapes.filter(shape => inStrip(Math.min(shape.x1, shape.x2), Math.max(shape.x1, shape.x2))).map(shape => Math.max(shape.y1, shape.y2)),
    );
    setItems(previous => [...previous, { id: crypto.randomUUID(), kind: 'section', x: 0, y: lowest + 32, w: COLUMN, text: '', fresh: true }]);
  };
  const resizeShape = (id, patch) => setShapes(previous => previous.map(shape => shape.id === id ? { ...shape, ...patch } : shape));
  const moveShapeStart = (event, shape) => {
    snapshot();
    // x1 is not always the left edge - a shape dragged out right-to-left has
    // x2 smaller - so the base carries the gap between the corner and the box.
    const base = { x: Math.min(shape.x1, shape.x2) - shape.x1, y: Math.min(shape.y1, shape.y2) - shape.y1 };
    const size = { w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) };
    startDrag(event, { x: shape.x1, y: shape.y1 }, (x, y) => {
      const dx = x - shape.x1, dy = y - shape.y1;
      setShapes(previous => previous.map(s => s.id === shape.id ? { ...s, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy } : s));
    }, view.z, makeSnap([shape.id], size, base));
  };
  const inking = tool === 'pen' || tool === 'highlighter';
  const drawing = inking || shapeTool;
  const cursor = tool === 'hand' ? 'cursor-grab' : inking || tool === 'eraser' || shapeTool ? 'cursor-crosshair' : tool === 'select' ? '' : 'cursor-copy';
  // The rail answers to the blank canvas right of the column, where its buttons
  // live; over the cards themselves it would only be in the way. Held by index
  // rather than by value so the line keeps following the cards as they move.
  const panel = panelFor({ tool, selection, shapes, links, items });
  const showStyle = panel.open || styleOpen;
  // The separator spans the viewport, converted into world units, so it looks
  // the same width at any zoom instead of growing and shrinking with the column.
  const railSpan = (() => {
    const width = surface.current?.clientWidth || 0;
    const inset = RAIL_INSET / view.z;
    return width
      ? { left: -view.x / view.z + inset, width: Math.max(COLUMN, width / view.z - inset * 2) }
      : { left: 0, width: COLUMN };
  })();
  const gaps = gapsFrom(blocks, bounds);
  const activeGap = hoverGap == null ? null : gaps.find(gap => gap.index === hoverGap) || null;
  const trackGap = event => {
    if (gapAdding) return; // the rail must not slide away while its menu is open
    if (drawing || tool !== 'select') return setHoverGap(null);
    const point = local(event);
    const found = point.x < 0 ? nearestGap(gaps, point.y) : null;
    setHoverGap(found ? found.index : null);
  };
  // Ports with a live connection stay visible on both ends of the link.
  const portsInUse = {};
  for (const link of links) {
    (portsInUse[link.from] = portsInUse[link.from] || {})[link.fromSide] = true;
    (portsInUse[link.to] = portsInUse[link.to] || {})[link.toSide] = true;
  }
  return (
    // Delete, ctrl+z, copy and paste all stand down while a text field has focus,
    // and the dock composer takes focus on mount - so without this, selecting a
    // shape or a note and pressing Delete silently did nothing. Any pointer press
    // outside the focused field hands focus back to the canvas. Pressing inside
    // the field it belongs to is left alone, so typing still works.
    <div className="relative flex h-full min-h-0 flex-col"
      onPointerDownCapture={event => {
        const active = document.activeElement;
        if (!active || active === document.body) return;
        const editable = active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA';
        if (editable && !active.contains(event.target)) active.blur();
      }}>
      {/* With the grid on, the canvas draws its own dots instead of borrowing
          the page's: these ride the camera, so the grid you snap to is the grid
          you can see. An opaque surface keeps the page dots from showing through
          and doubling them up. */}
      <div ref={surface} onPointerDown={down} onPointerMove={trackGap} onPointerLeave={() => { if (!gapAdding) setHoverGap(null); }}
        style={grid ? { background: 'var(--color-white)', backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)', backgroundSize: `${GRID * view.z}px ${GRID * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px` } : undefined}
        className={`relative min-h-0 flex-1 touch-none overflow-hidden ${cursor}`}>
        <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: '0 0' }} className="absolute top-0 left-0">
        <svg width="1" height="1" className="pointer-events-none absolute top-0 left-0 overflow-visible">
          {links.map(link => <g key={link.id} data-connection={link.id} className="dark:[filter:brightness(1.5)_saturate(1.2)]">
            <path d={connectionPath(link)} fill="none" stroke={link.color} strokeWidth={isSelected(link.id) ? 4 : 2.5} />
            <path d={connectionPath(link)} fill="none" stroke="transparent" strokeWidth={14 / view.z} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onPointerDown={event => { event.stopPropagation(); select(link.id, event); }}><title>Select connection · choose a color or press Delete</title></path>
          </g>)}
          {connecting?.snap && <circle cx={connecting.snap.at.x} cy={connecting.snap.at.y} r={9} fill="white" stroke={connecting.color} strokeWidth="3" />}
          {connecting && <path data-connection-preview d={connectionPath(connecting)} fill="none" stroke={connecting.color} strokeWidth="2.5" className="dark:[filter:brightness(1.5)_saturate(1.2)]" />}
        </svg>
        <svg aria-hidden="true" data-ink width="1" height="1" className="pointer-events-none absolute top-0 left-0 z-10 overflow-visible">
          {[...shapes, ...(liveShape ? [liveShape] : [])].map(shape => <ShapeView key={shape.id} shape={shape} tool={tool} zoom={view.z} selected={isSelected(shape.id)} onSelect={select} onMoveStart={moveShapeStart} onResize={resizeShape} onGesture={snapshot} onDelete={deleteItem} />)}
          {[...strokes, ...(live ? [live] : [])].map((stroke, index) => stroke.tool === 'pen'
            ? <path key={index} d={pathOf(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.opacity} strokeDasharray={dashArray(stroke.dash, stroke.width)} strokeLinecap="round" strokeLinejoin="round" />
            : <path key={index} d={pathOf(stroke.points)} fill="none" stroke="#fde047" strokeWidth={stroke.width || 14} strokeOpacity=".5" strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>
        <div ref={column} style={{ width: COLUMN }} className={`absolute top-0 left-0 flex flex-col gap-5 ${drawing || tool === 'eraser' || tool === 'hand' ? 'pointer-events-none' : ''}`}>
          {exchanges.map(exchange => <ChatCard key={exchange.id} exchange={exchange} zoom={view.z} selected={isSelected(exchange.id)} connected={portsInUse[exchange.id]} boardId={blocks.find(block => block.id === exchange.linkFrom && block.type === 'whiteboard')?.id} onSelect={select} onMove={moveNode} onSize={onResize} onReply={onReply} renderComposer={renderBlockComposer} onLayout={measureBlocks} onConnect={connect} onSnap={snapForNode} onFile={onOpenFile} />)}
          {blocks.map(block => <LessonBlockCard key={block.id} block={block} zoom={view.z} selected={isSelected(block.id)} connected={portsInUse[block.id]} onSelect={select} onMove={moveNode} onChange={changeBlock} onChangeQuiet={changeBlockQuietly} onLayout={measureBlocks} onConnect={connect} onSnap={snapForNode} onAsk={askBlock} onFile={onOpenFile} appName={appName} onAskRegion={askRegion} onGrade={onGrade} />)}
        </div>
        {activeGap && <GapRail gap={activeGap} zoom={view.z} span={railSpan} space={blocks.find(block => block.id === activeGap.beforeId)?.space || 0} onNudge={nudgeGap}
          adding={gapAdding} onAdding={setGapAdding} onAddHeading={insertHeadingAt} />}
        {/* Alignment guides, live only while something is being dragged. */}
        {!!guides.length && (
          <svg width="1" height="1" aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-30 overflow-visible">
            {guides.map((line, index) => (
              <line key={index} stroke="#e8437f" strokeWidth={1 / view.z} shapeRendering="crispEdges"
                x1={line.axis === 'x' ? line.at : line.from} x2={line.axis === 'x' ? line.at : line.to}
                y1={line.axis === 'x' ? line.from : line.at} y2={line.axis === 'x' ? line.to : line.at} />
            ))}
          </svg>
        )}
        <div ref={itemsLayer} className={drawing || tool === 'hand' ? 'pointer-events-none' : ''}>
          {items.map(item => <CanvasItem key={item.id} item={item} zoom={view.z} tool={tool} selected={isSelected(item.id)} onSelect={select} onChange={changeItem} onMove={moveItemNode} onResize={resizeItem} onGesture={snapshot} onDelete={deleteItem} onSnap={snapForItem} />)}
        </div>
        </div>
      </div>
      {/* Dev-only workbench: drop any lesson block on the canvas to review its
          look before lessons are assembled. */}
      {import.meta.env.VITE_COACHING_DEV === 'true' && (
        <div className="absolute top-3 -right-6 z-20">
          <button type="button" aria-label="Insert lesson block" title="Insert a sample lesson block" aria-expanded={insertOpen}
            onClick={() => setInsertOpen(previous => !previous)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-white text-ink-2 shadow-md hover:text-ink">
            <Plus size={15} strokeWidth={1.7} />
          </button>
          {insertOpen && <BlockMenu className="top-0 right-10" filter={insertFilter} onFilter={setInsertFilter} onPick={insertBlock} />}
        </div>
      )}
      <div role="toolbar" aria-label="Canvas tools" className="absolute top-1/2 -right-6 z-20 grid max-h-full -translate-y-1/2 grid-cols-2 gap-0.5 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-md">
        {NAV_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
        <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
        {DRAW_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
        <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
        {SHAPE_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
        <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
        {/* Keeps the armed tool armed after a draw, so shapes come in runs. */}
        <ToolButton Icon={lock ? Lock : LockOpen} label={lock ? 'Keep tool active — on' : 'Keep tool active — off'}
          active={lock} onPick={() => setLock(previous => !previous)} />
        {/* Alignment guides always run; this is the harder 18px grid on top. */}
        <ToolButton Icon={Grid3x3} label={grid ? 'Snap to grid — on' : 'Snap to grid — off'}
          active={grid} onPick={() => setGrid(previous => !previous)} />
        {/* The one control that never hides: the way back to the style panel
            once it has closed itself, showing what colour is currently armed. */}
        <button type="button" title="Style" aria-label="Style" aria-pressed={showStyle}
          onPointerDown={e => e.stopPropagation()} onClick={() => setStyleOpen(previous => !previous)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${showStyle ? 'bg-hover' : 'hover:bg-hover'}`}>
          <span style={{ background: color }} className="h-4 w-4 rounded-full ring-1 ring-line" />
        </button>
      </div>
      {showStyle && (
        <StylePanel text={panel.text} showFill={panel.fill} fill={fill} corners={panel.corners} order={panel.order}
          color={color} width={width} dash={dash} opacity={opacity} round={round} level={level}
          onColor={value => { setColor(value); applyStyle({ color: value }, panel.targets); }}
          onFill={value => { setFill(value); applyStyle({ fill: value }, panel.targets); }}
          onWidth={value => { setWidth(value); applyStyle({ width: value }, panel.targets); }}
          onDash={value => { setDash(value); applyStyle({ dash: value }, panel.targets); }}
          onOpacity={value => { setOpacity(value); applyStyle({ opacity: value }, panel.targets); }}
          onRound={value => { setRound(value); applyStyle({ round: value }, panel.targets); }}
          onLevel={value => { setLevel(value); applyStyle({ level: value }, panel.targets); }}
          onOrder={toFront => reorderSelection(toFront, panel.targets)} />
      )}
      {/* The zoom pill sits level with the composer's bottom edge. */}
      <div className="relative min-h-11 shrink-0 pt-3">
        <div data-zoom aria-label="Zoom controls" className="absolute bottom-0 left-0 z-20 flex items-center rounded-lg border border-line bg-white shadow-sm">
          <IconBtn title="Scroll up" onClick={() => scrollBy(-1)}><ChevronUp size={14} /></IconBtn>
          <IconBtn title="Scroll down" onClick={() => scrollBy(1)}><ChevronDown size={14} /></IconBtn>
          <span className="mx-0.5 h-5 w-px bg-line" />
          <IconBtn title="Zoom out" onClick={() => zoomCenter(1 / 1.25)}><Minus size={14} /></IconBtn>
          <button type="button" title="Reset zoom" onClick={() => setView({ x: Math.max(24, (surface.current.clientWidth - COLUMN) / 2), y: 24, z: 1 })} className="min-w-11 px-1 text-center text-xs tabular-nums text-ink-2 hover:text-ink">{Math.round(view.z * 100)}%</button>
          <IconBtn title="Zoom in" onClick={() => zoomCenter(1.25)}><Plus size={14} /></IconBtn>
          <span className="mx-0.5 h-5 w-px bg-line" />
          <button type="button" title="Add a section divider with a title" onClick={addSection}
            className="cursor-pointer whitespace-nowrap px-2 text-xs text-ink-2 hover:text-ink">Add section</button>
        </div>
        {composer && <div className="mx-auto w-full max-w-[504px]">{composer}</div>}
      </div>
    </div>
  );
}
