import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Map as MapIcon, Heading1, Heading2, Heading3, ChevronDown, ChevronLeft as Back, ChevronRight as Forward, ChevronUp, Ellipsis, GripHorizontal, Loader2, MessageCircle, Scan, X, ArrowUpRight, BringToFront, Circle, CornerDownRight, Diamond, Eraser, Grid3x3, Hand, Hexagon, Highlighter, Lock, LockOpen, Minus, MousePointer2, Pencil, Plus, SendToBack, Slash, Spline, Square, Squircle, Star, StickyNote, Triangle, Type, Download, Paperclip, ArrowDownToLine, BookOpen, BoxSelect, CircleCheck, CircleHelp, Copy, CopyPlus, ExternalLink, Eye, Group, Play, Trash2, Ungroup, Unlink, ZoomIn, Sigma } from 'lucide-react';
import { Md } from './ask.jsx';
import { IconBtn, MenuItem, toast } from './ui.jsx';
import { boardAsk } from './board-ask.js';
import { wsHeaders } from './api.js';
import { BLOCK_TYPES, LearningBlockBody, SketchHost, describeBlock } from './LearningBlocks.jsx';
import { SKETCH_HEIGHT, roundPoint } from './explain-sketch.js';
import { gapsFrom, nearestGap, nudgeBy } from './learn-gap-rail.js';
import { panelFor, textStyle, stickyTone, dashArray, dashStyle, reorder, TEXT_LEVELS, DASH_STYLES, OPACITIES, ARROW_KINDS } from './learn-style-panel.js';
import CanvasMinimap from './CanvasMinimap.jsx';
import { presentSteps } from './learn-present.js';
import { pageRects, PAGE_W } from './learn-pages.js';
import { outlineFrom, applyOutlineOps, moveSection } from './learn-outline-model.js';
import { loadAsset } from './learn-board-assets.js';
import { groupShot } from './learn-group-shot.js';
import { cardQuestion, describeCanvasObject, EQUATION_QUESTION, GROUP_QUESTION, groupTargetText } from './learn-ask-target.js';
import { askDraft } from './agent/scope.js';
import LearnWiki from './LearnWiki.jsx';
import SourcesDisclosure from './SourcesDisclosure.jsx';
import { momentGeometry, seekTo, clock, embedUrl } from './learn-video-moment.js';
import { snapMove, snapGrid, SNAP_TOLERANCE, GRID } from './learn-snap.js';
import NotebookBody from './NotebookCard.jsx';
import { activePath, newNotebookBlock } from './learn-notebook.js';
import { paletteSections, insertName } from './learn-insert-palette.js';
import { SIDES, shapeBox, sidePoint, nearestSide, routePath, polylineMid, freeElbow } from './learn-connectors.js';
import { DOCK_PAD, DOCK_WIDTH } from './ChatComposer.jsx';
import { PerfContext, perfMark, usePaintedMarks } from './learn-perf.js';
import LaserPointer from './LaserPointer.jsx';
import { DivePortals } from './Dive.jsx';
import { canvasObjects } from './dive.js';
import { openTarget, opensFrom, selectedCardContext } from './card-open.js';
import { columnEntries, fillSlot, freeArea, freeSlot, indexAfter, panInto, slotIndex, slotSize } from './canvas-slots.js';
import { lightBlocks, persistBoard } from './canvas-persist.js';
import { waitingText } from './waiting-text.js';
import { looksLikeCode, pasteKind } from './canvas-paste.js';
import { copiedCode } from './map-files.js';
import CommentPins, { PIN_DEFAULT } from './comments/CommentPins.jsx';
import { anchorAt, objectLabel } from './comments/anchors.js';
import { MathText } from './MathText.jsx';
import { EQUATION_LEVELS, EQUATION_SIZE, equationLevel, levelSize, newEquation, scaledSize, typingIn } from './canvas-equation.js';
import { drawThumbnail, thumbnailRegion } from './card-thumbnail.js';

// MathLive arrives with the first equation edited, never with the canvas (docs/features/canvas-equations.md).
const EquationEditor = lazy(() => import('./EquationEditor.jsx'));

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
  // Ask about selection (user, 2026-09-30): drag over anything - cards, slides, images - to ask about that area.
  ['askArea', Scan, 'Ask about selection — drag over any part of the canvas'],
];
const DRAW_TOOLS = [
  ['pen', Pencil, 'Pen'],
  ['highlighter', Highlighter, 'Highlighter'],
  ['eraser', Eraser, 'Eraser'],
  ['text', Type, 'Text'],
  ['equation', Sigma, 'Equation'],
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
  ['elbow', CornerDownRight, 'Elbow arrow'],
];
const COLORS = ['#37352f', '#2383e2', '#b42318', '#1a7f37', '#f59e0b', '#7c3aed'];
// The default ink is Notion's near-black, stored as a hex in every saved
// stroke and text item - so dark mode must translate it at render time or all
// default writing reads as dark gray on a dark canvas. Only the default maps;
// deliberate colors stay themselves (connections brighten via a dark: filter).
const inkAware = color => (color === '#37352f' ? 'var(--learn-canvas-ink)' : color);
// A divider is a plain rule, wider than the card column so it reads as a
// break across the page rather than another card.
const DIVIDER_W = 1040;
// Connectors take the colour of the node they start from, so a canvas reads
// at a glance; picking an ink colour first overrides this.
const LINK_COLORS = { chat: '#2383e2', quiz: '#7c3aed', flashcards: '#f59e0b', challenge: '#37352f', explanation: '#6b7280', table: '#0891b2', snippet: '#1a7f37', code: '#1a7f37', graph: '#2383e2', paper: '#b42318', model3d: '#7c3aed', image: '#0891b2', video: '#b42318' };
const WIDTHS = [2, 3.5, 6];
const COLUMN = 560;
// A new card's one camera correction waits until its measured size has been still for SETTLE_MS (rows it
// measures a frame or two after mount), REVEAL_MS after the insert at the latest (revealAfter).
const SETTLE_MS = 200, REVEAL_MS = 1500;
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
  // An iframe under the pointer (a notebook, a PDF) would swallow the rest of
  // the drag; while one is in progress every iframe ignores the pointer.
  document.body.classList.add('canvas-dragging');
  const move = e => {
    if (!dragging && Math.hypot(e.clientX - from.x, e.clientY - from.y) < DRAG_THRESHOLD) return;
    dragging = true;
    const x = origin.x + (e.clientX - from.x) / scale;
    const y = origin.y + (e.clientY - from.y) / scale;
    const pulled = snap ? snap(x, y) : null;
    apply(pulled ? pulled.x : x, pulled ? pulled.y : y);
  };
  const up = () => { document.body.classList.remove('canvas-dragging'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); apply.done?.(); snap?.done?.(); };
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
  if (kind === 'elbow') return { points: freeElbow(shape), closed: false };
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  const relative = POLYGONS[kind] || [[0, 0], [1, 0], [1, 1], [0, 1]];
  return { points: relative.map(([u, v]) => ({ x: x + u * w, y: y + v * h })), closed: true };
}

// Opening a card (card-open.js): { single, can(id), open(id, via) }, provided by the canvas around its blocks.
const CardOpen = createContext(null);

// Shared node chrome for everything card-shaped on the canvas: drag with
// lift, corner resize, selection ring, top/bottom connection ports, and the
// layout observer that keeps connector geometry fresh. Content is children.
function CanvasNode({ id, dx, dy, zoom, selected, chat = false, ghost = false, wide = false, space = 0, connected = null, autoMax = 420, width = 380, height = undefined, extraHeight = 0, saved = null, onSelect, onMove, onSize, onLayout, onConnect, onSnap = null, nodeRef = null, children }) {
  const [lifted, setLifted] = useState(false);
  // A card with a Rabbit Hole under it (docs/features/dive-v1.md): derived from the dive link, never stored on the card.
  const dive = useContext(DivePortals), portal = dive?.portals?.[id];
  // Open (card-open.js): double-click, Enter, or the Open pill on the one selected card. A chat card never opens.
  const opener = useContext(CardOpen);
  const opens = !chat && opener ? opener.can(id) : null;
  // Whether the card was already selected when this double-click's first press landed: a selected PDF, video or
  // article body keeps its own pointer (data-pointer-body), so a double-click there is the reader's, not Open.
  const selectedAtPress = useRef(false), lastPress = useRef(-Infinity);
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
    // A card is reachable with Tab (Space selects it, Enter opens it: the canvas's key handler); its selection is
    // exposed as aria-current, and the keyboard focus ring sits outside the selection ring.
    <div ref={card} data-block data-block-id={id} {...(chat ? { 'data-chat-block': true } : {})}
      tabIndex={0} role="group" aria-roledescription="card" aria-current={selected ? 'true' : undefined}
      // Read before this press selects the card (the selection re-renders before mousedown); a press within a
      // double-click's interval of the last one is that double-click's second press.
      onPointerDownCapture={event => { if (event.timeStamp - lastPress.current > 500) selectedAtPress.current = selected; lastPress.current = event.timeStamp; }}
      onPointerDown={event => { if (event.button !== 0) return; if (event.target.closest('[data-drag-zone]')) drag(event); else onSelect(id, event); }}
      // A single click only selects; a double-click opens - the card's reader, else its Rabbit Hole (made when there is
      // none yet). Never from one of the card's own controls (opensFrom).
      onDoubleClick={opens ? event => {
        if (!opensFrom(event.target) || (selectedAtPress.current && event.target.closest('[data-pointer-body]'))) return;
        opener.open(id, 'learner_dblclick');
      } : undefined}
      style={{ transform: `translate(${dx}px, ${dy}px)${lifted ? ' scale(1.02)' : ''}`, marginTop: space || undefined, width: size.w || width, height: size.h || height ? (size.h || height) + extraHeight : undefined, maxHeight: size.h || height ? undefined : autoMax }}
      className={`group relative ${wide ? 'self-center' : 'mx-auto'} flex cursor-default flex-col rounded-xl border transition-shadow duration-150 select-text focus-visible:ring-[3px] focus-visible:ring-[#2383e2]/40 focus-visible:ring-offset-4 ${portal ? '' : 'outline-none'} ${ghost ? 'border-transparent bg-transparent hover:border-line' : 'border-line bg-white'} ${selected ? 'ring-2 ring-[#2383e2]' : ''} ${portal ? (portal.pending ? 'outline-8 outline-offset-1 outline-hole-pending/40' : 'outline-8 outline-offset-1 outline-hole/80') : ''} ${lifted ? 'z-20 shadow-xl' : ghost ? 'hover:shadow-sm' : 'shadow-sm hover:shadow-md'}`}>
      {/* The one selected card says how it opens: a small Open, never a big button on every card (touch has no double-click). */}
      {selected && opens && opener.single === id && (
        <button type="button" data-card-open={opens.kind} title={opens.label} aria-label={opens.label}
          onPointerDown={event => event.stopPropagation()} onClick={() => opener.open(id, 'learner_open')}
          className="absolute -top-10 left-0 z-30 flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-ink shadow-md hover:bg-hover">
          Open<ArrowUpRight size={13} />
        </button>
      )}
      {/* Only this strip drags; the body keeps a normal cursor so text can be
          selected and links inside the block stay clickable. */}
      <div data-drag-handle data-drag-zone title="Drag to move this block"
        className={`flex h-6 shrink-0 cursor-grab items-center justify-center rounded-t-xl active:cursor-grabbing ${ghost ? 'opacity-0 group-hover:opacity-100' : 'hover:bg-hover'}`}>
        <span className="h-1 w-12 rounded-full bg-line" />
      </div>
      {children}
      {portal && <button type="button" data-dive-portal={portal.name} title={`Enter the Rabbit Hole: ${portal.title}`} onPointerDown={event => event.stopPropagation()} onClick={() => dive.enter(portal.name)}
        className={`pointer-events-auto absolute -top-3 left-4 z-20 flex max-w-60 items-center gap-1 rounded-sm border bg-white px-2 py-0.5 text-[11px] shadow-sm ${portal.pending ? 'border-dashed border-hole-pending text-hole hover:bg-hole/10' : 'border-hole/40 text-hole hover:bg-hole/10'}`}>
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" className="shrink-0"><path d="M6 1.5V10M2.5 6.5 6 10l3.5-3.5" /></svg><span className="truncate">{portal.title}</span></button>}
      {['top', 'bottom'].map(side => <button key={side} type="button" data-port={side} data-owner={id} aria-label={`Connect ${side}`} title="Drag to connect blocks"
        data-node-tool
        className={`absolute left-1/2 z-20 h-4 w-4 -translate-x-1/2 cursor-crosshair rounded-full border-2 border-accent bg-white focus:opacity-100 ${connected?.[side] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${side === 'top' ? '-top-2' : '-bottom-2'}`}
        onPointerDown={event => onConnect(event, id, side)} />)}
      <button type="button" aria-label="Resize chat block" title="Resize block" className="absolute right-0 bottom-0 z-10 cursor-nwse-resize p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink-2 focus:opacity-100"
        data-node-tool onPointerDown={resize}><svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M10 4 4 10 M10 8 8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg></button>
    </div>
  );
}

// A reserved slot (canvas-slots.js): the coming card's frame - its size, and CanvasNode's border, radius,
// shadow and drag strip - with a spinner, what is being made, and how long it has taken. Not a block: it
// cannot be selected, moved or asked about, and it is gone when the card lands or the wait ends.
function SlotCard({ slot }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => { const timer = setInterval(() => setNow(performance.now()), 100); return () => clearInterval(timer); }, []);
  return (
    <div data-slot-id={slot.id} role="status" aria-label={slot.label} style={{ width: slot.w, height: slot.h, marginTop: slot.top || undefined }}
      className="relative mx-auto flex shrink-0 cursor-default flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="flex h-6 shrink-0 items-center justify-center"><span className="h-1 w-12 rounded-full bg-line" /></div>
      <div className="flex items-center gap-2 px-4 pb-4 text-sm">
        <Loader2 size={14} className="shrink-0 animate-spin text-ink-3" />
        <span className="shimmer min-w-0 truncate">{slot.label}</span>
        <span aria-hidden="true" data-slot-elapsed className="ml-auto shrink-0 text-xs text-ink-3 tabular-nums">{((now - slot.started) / 1000).toFixed(1)}s</span>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3 px-4">
        <span className="skeleton-line h-4 w-2/3 rounded" />
        {['w-full', 'w-11/12', 'w-full', 'w-3/4'].map((width, index) => <span key={index} className={`skeleton-line h-3 rounded ${width}`} />)}
      </div>
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
        <div data-thumbnail-hide className="absolute -top-10 right-0 z-30 flex items-center gap-1.5">
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
          : <p className="text-sm text-ink-2 italic">{exchange.status === 'thinking' ? <span className="shimmer not-italic">Thinking…</span> : waitingText(exchange.status)}</p>}
        {replies.map(turn => <div key={turn.id} className="mt-3 border-t border-line pt-3">
          <div className="mb-3 flex justify-end"><span className="rounded-xl bg-accent px-3 py-1.5 text-sm whitespace-pre-wrap text-white">{turn.question}</span></div>
          <div className="text-sm">{turn.answer ? <Md text={turn.answer} onFile={onFile} /> : <span className="text-ink-2">{turn.status === 'done' ? 'No answer received. Try again.' : <span className="shimmer">Thinking…</span>}</span>}</div>
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
  // A rename from outside (the table of contents, an applied outline) reaches the text being shown;
  // never while the learner is typing in it.
  useEffect(() => {
    const element = body.current;
    if (!element || document.activeElement === element || element.textContent === (block.text || '')) return;
    shown.current = block.text;
    element.textContent = block.text || '';
  }, [block.text]);
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

// Slides fill the A4 page guide, wider than the card column, centred on it.
const SLIDE_W = PAGE_W - 48;

// One page of a PDF added as slides: straight on the canvas, no card chrome, with
// a numbered divider above every page after the first. Each page is its own block,
// so it moves, groups and deletes like anything else; the image sits in this
// browser's asset store and the block keeps only the key.
function SlideCard({ block, zoom, selected, connected, onSelect, onMove, onLayout, onConnect, onSnap, onAsk }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let revoke = null;
    loadAsset(block.assetKey).then(file => { if (file) { revoke = URL.createObjectURL(file); setUrl(revoke); } });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [block.assetKey]);
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} ghost wide space={block.space}
      connected={connected} width={SLIDE_W} autoMax={null}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      {selected && (
        <div data-thumbnail-hide className="absolute -top-10 right-0 z-30">
          <button type="button" title="Ask the tutor about this slide" onPointerDown={e => e.stopPropagation()} onClick={() => onAsk(block)}
            className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-ink shadow-md hover:bg-hover">
            <MessageCircle size={13} />Ask in chat
          </button>
        </div>
      )}
      <div data-slide={block.number} className="px-1 pb-1">
        {url ? <img src={url} alt={`${block.label || 'Slide'} ${block.number}`} className="w-full rounded border border-line" draggable={false} />
          : <p className="p-4 text-sm text-ink-2">This slide is not in this browser.</p>}
      </div>
    </CanvasNode>
  );
}

// The line between two slides: its own block, so it can be selected and deleted on its own.
function DividerCard({ block, zoom, selected, connected, onSelect, onMove, onLayout, onConnect, onSnap }) {
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} ghost wide space={block.space}
      connected={connected} width={SLIDE_W} autoMax={null}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      <div data-slide-divider className="flex items-center gap-2 px-1 pb-2 text-[11px] text-ink-3"><span className="h-px flex-1 bg-line-strong" />{block.label}<span className="h-px flex-1 bg-line-strong" /></div>
    </CanvasNode>
  );
}

// An uploaded PDF, read by the browser's own viewer. The block carries a key,
// never the bytes: a data URL of any size over 120kB is stripped on save, and a
// PDF is far past that. The file itself sits in IndexedDB and survives reloads.
function PdfCard({ block, zoom, selected, connected, onSelect, onMove, onChange, onLayout, onConnect, onSnap }) {
  const [url, setUrl] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let revoke = null;
    loadAsset(block.assetKey).then(file => {
      if (!file) { setMissing(true); return; }
      revoke = URL.createObjectURL(file);
      setUrl(revoke);
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [block.assetKey]);
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space}
      connected={connected} width={COLUMN} height={block.h || 640} autoMax={undefined} saved={{ w: block.w, h: block.h }}
      onSize={(id, w, h) => onChange({ ...block, w, h })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-ink" />PDF<span className="truncate normal-case tracking-normal text-ink-3">{block.label}</span>
      </div>
      {/* Until the card is selected the page ignores the pointer, so the first
          press selects the card and keeps focus in this document. A focused
          iframe receives keydown in its own document, where the canvas never
          sees it - copy, paste, undo and delete would all be dead on this card. */}
      <div data-pointer-body className="min-h-0 flex-1 overflow-hidden rounded-b-xl border-t border-line"
        onPointerDown={event => { if (selected) event.stopPropagation(); }}>
        {url
          ? <iframe src={url} title={block.label || 'PDF'} className={`h-full w-full ${selected ? '' : 'pointer-events-none'}`} />
          : <p className="p-4 text-sm text-ink-2">{missing ? 'This PDF is not in this browser. Upload it again from Sources.' : 'Opening…'}</p>}
      </div>
    </CanvasNode>
  );
}

// A file the learner dropped on the canvas: an image, a GIF, or a video clip.
// Same storage bargain as the PDF card - the bytes live in this browser's
// asset store, the block keeps only the key, so the 120 kB src strip never
// applies and a reload keeps the card.
function FileCard({ block, zoom, selected, connected, onSelect, onMove, onChange, onLayout, onConnect, onSnap }) {
  const [url, setUrl] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let revoke = null;
    loadAsset(block.assetKey).then(file => {
      if (!file) { setMissing(true); return; }
      revoke = URL.createObjectURL(file);
      setUrl(revoke);
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [block.assetKey]);
  const clip = block.kind === 'clip';
  // An imported file kept as it is (canvas-file-drop.md): its name and size, and Download. Never opened or run here.
  if (block.kind === 'attachment') return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space}
      connected={connected} width={360} autoMax={200} saved={{ w: block.w }}
      onSize={(id, w) => onChange({ ...block, w })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      <div data-file-attachment className="flex items-center gap-3 px-4 pb-3">
        <Paperclip size={16} className="shrink-0 text-ink-2" />
        <div data-drag-zone className="min-w-0 flex-1 cursor-grab active:cursor-grabbing">
          <p className="truncate font-mono text-sm text-ink" title={block.label}>{block.label}</p>
          <p className="text-xs text-ink-3">{missing ? 'This file is not in this browser or saved with the board yet.' : `File attachment${block.size ? ` · ${Math.max(1, Math.round(block.size / 1024))} KB` : ''}`}</p>
        </div>
        {url && <a href={url} download={block.label} onPointerDown={event => event.stopPropagation()}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink"><Download size={12} />Download</a>}
      </div>
    </CanvasNode>
  );
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space}
      connected={connected} width={COLUMN} autoMax={620} saved={{ w: block.w }}
      onSize={(id, w) => onChange({ ...block, w })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-ink" />{clip ? 'Video' : 'Image'}<span className="truncate normal-case tracking-normal text-ink-3">{block.label}</span>
      </div>
      <div data-pointer-body className="min-h-0 px-3 pb-3" onPointerDown={event => { if (clip && selected) event.stopPropagation(); }}>
        {url
          ? clip
            ? <video src={url} controls className="w-full rounded-lg border border-line bg-black" />
            : <img src={url} alt={block.label || 'Dropped image'} className="w-full rounded-lg border border-line bg-white object-contain" />
          : <p className="p-2 text-sm text-ink-2">{missing ? 'This file is not in this browser. Drop it here again.' : 'Opening…'}</p>}
      </div>
    </CanvasNode>
  );
}

// A YouTube moment on the canvas: the embed starts at `start` and stops at
// `end`, because the window rides the URL and playback enforces it. YouTube's
// own scrubber is cross-origin and cannot be drawn on, so the moment is shown
// on our bar underneath - and clicking that bar reloads the embed there.
function VideoCard({ block, zoom, selected, connected, appName, onSelect, onMove, onChange, onLayout, onConnect, onSnap, onWatch }) {
  // The embed is a cross-origin iframe, so a deleted video is invisible to us.
  // The observable is this thumbnail: deleted videos 404 it, and one report
  // lets the worker prune the video's derived data. Once per card, ever.
  const reportedGone = useRef(false);
  // Where playback was sent, not persisted: a seek is a glance, and writing it
  // through onChange would spend an undo step per click on the bar. The counter
  // keys the iframe, so seeking to the second you already named still reloads -
  // playback has moved on even when the number has not.
  const [playFrom, setPlayFrom] = useState(null);
  // A retargeted moment (the tutor pointing somewhere new) beats a stale seek.
  useEffect(() => { setPlayFrom(null); }, [block.start, block.end, block.momentNonce]);
  const start = playFrom?.at ?? block.start ?? 0;
  const inMoment = playFrom == null || (playFrom.at >= (block.start || 0) && (block.end == null || playFrom.at < block.end));
  const playEnd = inMoment ? block.end ?? null : null;
  const geometry = momentGeometry(block.start || 0, block.end ?? null, block.duration ?? null);
  const bar = event => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = seekTo((event.clientX - box.left) / box.width, block.start || 0, block.end ?? null, block.duration ?? null);
    setPlayFrom(previous => ({ at, n: (previous?.n || 0) + 1 }));
    // The whole identity, so the page can rebuild context for a card it has
    // never met - one restored from storage, or the second card on a canvas.
    // `end` is what playback will actually do, not a guess: inside the moment
    // the player still stops at the block's end.
    const stillIn = at >= (block.start || 0) && (block.end == null || at < block.end);
    onWatch?.({ id: block.id, videoId: block.videoId, title: block.title, start: at, end: stillIn ? block.end ?? null : null });
  };
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space}
      connected={connected} width={COLUMN} height={block.h || 420} autoMax={undefined} saved={{ w: block.w, h: block.h }}
      onSize={(id, w, h) => onChange({ ...block, w, h })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-ink" />Video<span className="truncate normal-case tracking-normal text-ink-3">{block.title}</span>
        {/* The tutor could not read this video's captions, so the moment is a
            recommendation on title alone - the spec's failure table says the
            learner hears that, not just the model. */}
        {block.unverified && <span className="shrink-0 rounded bg-hover px-1.5 py-0.5 normal-case tracking-normal text-ink-3" title="The tutor could not read this video's captions, so its contents are unverified.">contents unverified</span>}
      </div>
      {/* Same bargain as PdfCard: the player ignores the pointer until the
          card is selected, so canvas keys and drags stay alive. */}
      <div data-pointer-body className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl border-t border-line"
        onPointerDown={event => { if (selected) event.stopPropagation(); }}>
        {embedUrl(block.videoId, start, playEnd) && (
          <img src={`https://i.ytimg.com/vi/${block.videoId}/mqdefault.jpg`} alt="" aria-hidden="true"
            className="absolute h-px w-px opacity-0"
            onError={() => {
              if (reportedGone.current) return;
              reportedGone.current = true;
              fetch('/api/learn/video-gone', {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...wsHeaders() },
                body: JSON.stringify({ app: appName, videoId: block.videoId }),
              }).catch(() => { /* a signal, not a duty */ });
            }} />
        )}
        {embedUrl(block.videoId, start, playEnd)
          ? <iframe key={playFrom ? `seek-${playFrom.n}` : 'moment'} src={embedUrl(block.videoId, start, playEnd)}
              title={block.title || 'Video'} allow="encrypted-media; picture-in-picture; fullscreen"
              className={`min-h-0 w-full flex-1 ${selected ? '' : 'pointer-events-none'}`} />
          : <p className="p-4 text-sm text-ink-2">This card does not name a YouTube video. Delete it and add the video again from Sources.</p>}
        <div className="shrink-0 px-3 py-2">
          <div role="slider" aria-label="Video timeline" tabIndex={0}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(geometry.left * 100)}
            aria-valuetext={`Moment ${clock(block.start || 0)}${block.end != null ? ` to ${clock(block.end)}` : ''}`}
            onPointerDown={event => { event.stopPropagation(); bar(event); }}
            className="relative h-2 cursor-pointer rounded-full bg-hover">
            <div data-moment className="absolute inset-y-0 rounded-full bg-accent/60"
              style={{ left: `${geometry.left * 100}%`, width: `${geometry.width * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] tabular-nums text-ink-3">
            <span>{clock(block.start || 0)}{block.end != null ? ` → ${clock(block.end)}` : ''}</span>
            {/* No total when the duration is unknown - a guessed length would
                read as a fact about the video. */}
            <span>{geometry.known ? clock(block.duration) : ''}</span>
          </div>
          {/* A tutor-shown moment asks for a verdict. This is what turns the
              moment log into a gold set - and, later, the hot path. Latest
              press wins; the row updates server-side, the card remembers. */}
          {block.momentId && (
            <div className="mt-1.5 flex items-center justify-end gap-1" onPointerDown={event => event.stopPropagation()}>
              <span className="mr-auto text-[11px] text-ink-3">Did this moment help?</span>
              {[['Keep', true], ['Dismiss', false]].map(([label, value]) => (
                <button key={label} type="button" aria-pressed={block.accepted === value}
                  onClick={() => {
                    onChange({ ...block, accepted: value });
                    fetch('/api/learn/moment-feedback', {
                      method: 'POST', headers: { 'Content-Type': 'application/json', ...wsHeaders() },
                      body: JSON.stringify({ app: appName, momentId: block.momentId, accepted: value }),
                    }).catch(() => { /* the card's memory stands; the log catches up next time */ });
                  }}
                  className={`rounded px-2 py-0.5 text-[11px] ${block.accepted === value ? (value ? 'bg-green-600 text-white' : 'bg-ink text-white') : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </CanvasNode>
  );
}

// An article on the canvas. Unlike PdfCard this is not an iframe: the markup is
// sanitized and rendered in our own document, so canvas keys keep working while
// it has focus and the card can say which section is on screen.
function WikiCard({ block, zoom, selected, connected, appName, onSelect, onMove, onChange, onLayout, onConnect, onSnap, onWiki }) {
  // Navigation is not written to the block - changeBlock snapshots, and link
  // clicks must not spend the learner's undo history - so the card tracks what
  // it is showing itself. Without this, scrolling and selecting after a
  // navigation still reported the article the card was created with.
  const [showing, setShowing] = useState({ title: block.title, section: block.section || 0 });
  // Highlighter mode is a moment, not a setting - it is not saved. The marks
  // themselves and the scroll lock are, on the block.
  const [highlighting, setHighlighting] = useState(false);
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space}
      connected={connected} width={COLUMN} height={block.h || 640} autoMax={undefined} saved={{ w: block.w, h: block.h }}
      onSize={(id, w, h) => onChange({ ...block, w, h })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-ink" />Wikipedia
      </div>
      {/* Once selected - or while highlighting - the card keeps the pointer,
          so a drag inside it selects text instead of moving the card. */}
      <div data-pointer-body className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl border-t border-line"
        onPointerDown={event => { if (selected || highlighting) event.stopPropagation(); }}>
        <LearnWiki app={appName} compact article={{ title: block.title, section: block.section || 0 }} openAt={block.openNonce || 0}
          paintKey={block.id} highlights={block.highlights || []} onHighlights={next => onChange({ ...block, highlights: next })}
          highlighting={highlighting} onHighlighting={setHighlighting}
          locked={!!block.scrollLocked} onLock={value => onChange({ ...block, scrollLocked: value })}
          onNavigate={next => { setShowing(next); onWiki?.({ id: block.id, ...next }); }}
          onSection={section => { setShowing(previous => ({ ...previous, section })); onWiki?.({ id: block.id, title: showing.title, section }); }}
          onSelect={text => onWiki?.({ id: block.id, title: showing.title, section: showing.section, selection: text })} />
      </div>
    </CanvasNode>
  );
}

// A real Jupyter notebook on the canvas (docs/features/canvas-notebook.md).
// Notebook edits are saved quietly: they are not canvas undo steps.
function NotebookCard({ block, zoom, selected, connected, onSelect, onMove, onChange, onChangeQuiet, onLayout, onConnect, onSnap }) {
  const latest = useRef(block);
  latest.current = block;
  // Two reports can land before a re-render, so each builds on the last one.
  const save = patch => { latest.current = { ...latest.current, ...patch }; onChangeQuiet(latest.current); };
  const manifest = ({ active_path, files }) => {
    if (active_path === latest.current.active_path && JSON.stringify(files) === JSON.stringify(latest.current.files)) return;
    save({ active_path, files });
  };
  // Only the open notebook's document is copied onto the card.
  const copyNotebook = (path, ipynb) => { if (path === activePath(latest.current)) save({ ipynb_path: path, ipynb }); };
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space}
      connected={connected} width={640} height={block.h || 540} autoMax={undefined} saved={{ w: block.w, h: block.h }}
      onSize={(id, w, h) => onChange({ ...block, w, h })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      <NotebookBody block={block} onSelect={onSelect} onDocument={copyNotebook} onManifest={manifest} />
    </CanvasNode>
  );
}

function LessonBlockCard({ block, zoom, selected, connected, onSelect, onMove, onChange, onChangeQuiet, onLayout, onConnect, onSnap, onAsk, onFile, appName, onAskRegion, onGrade, onWiki, onWatch }) {
  // Tool Performance v1: visible on first paint; simple cards are complete then (learn-perf.js).
  usePaintedMarks(block.id, block.type);
  // A block that declares its evidence carries it collapsed at its foot; the
  // frame grows by that row (and by the open list) instead of squeezing the body.
  // A practice section and the INTERACT row grow it the same way, by their
  // measured heights (wrapped rows included).
  const [sourcesHeight, setSourcesHeight] = useState(0);
  const [practiceHeight, setPracticeHeight] = useState(0);
  const [controlsHeight, setControlsHeight] = useState(0);
  // A YouTube moment (videoId) gets its own card; a hosted or generated clip
  // (the + menu's Video blocks, src) renders as a lesson block.
  if (block.type === 'video' && block.videoId) return <VideoCard block={block} zoom={zoom} selected={selected} connected={connected} appName={appName} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} onWatch={onWatch} />;
  if (block.type === 'wiki') return <WikiCard block={block} zoom={zoom} selected={selected} connected={connected} appName={appName} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} onWiki={onWiki} />;
  if (block.type === 'file') return <FileCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  if (block.type === 'divider') return <DividerCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  if (block.type === 'slide') return <SlideCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} onAsk={onAsk} />;
  if (block.type === 'pdf') return <PdfCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  if (block.type === 'notebook') return <NotebookCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onChangeQuiet={onChangeQuiet} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  if (block.type === 'heading') return <HeadingCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} ghost={!!BLOCK_TYPES[block.type]?.ghost} space={block.space} connected={connected}
      autoMax={BLOCK_TYPES[block.type]?.autoMaxFor?.(block) ?? BLOCK_TYPES[block.type]?.autoMax}
      width={BLOCK_TYPES[block.type]?.sizeFor?.(block)?.width ?? BLOCK_TYPES[block.type]?.width}
      height={BLOCK_TYPES[block.type]?.sizeFor?.(block)?.height ?? BLOCK_TYPES[block.type]?.height}
      extraHeight={sourcesHeight + practiceHeight + controlsHeight} saved={{ w: block.w, h: block.h }} onSize={(id, w, h) => onChange({ ...block, w, h })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      {selected && (
        <div data-thumbnail-hide className="absolute -top-10 right-0 z-30 flex items-center gap-1.5">
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
      <PerfContext.Provider value={phase => perfMark(block.id, phase)}>
        <LearningBlockBody block={block} onChange={onChange} onChangeQuiet={onChangeQuiet} onFile={onFile} appName={appName} onAskRegion={onAskRegion} onGrade={onGrade} selected={selected} onPracticeHeight={setPracticeHeight} onControlsHeight={setControlsHeight} />
      </PerfContext.Provider>
      {block.sources && <SourcesDisclosure sources={block.sources} onFile={onFile} onHeight={setSourcesHeight} />}
    </CanvasNode>
  );
}

// The H1-to-text ladder offered right on a selected text box or shape; an equation's S-to-XL size ladder is the same
// pill with its own levels (`levels`, `label`), and no level pressed when its size is custom (`fallback` null).
// pointerdown is swallowed so choosing a level never blurs or deselects.
function LevelPill({ level, onLevel, className = '', style = null, levels = TEXT_LEVELS, label = 'Text level', fallback = 'body' }) {
  const current = level || fallback;
  return (
    <div role="group" aria-label={label} data-keep-focus data-thumbnail-hide style={{ fontSize: 12, fontWeight: 400, ...style }}
      className={`flex w-max items-center gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-md ${className}`}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}>
      {levels.map(entry => (
        <button key={entry.id} type="button" aria-pressed={current === entry.id}
          onClick={() => onLevel(entry.id)}
          className={`rounded px-1.5 py-0.5 text-[11px] ${current === entry.id ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}
          style={{ fontWeight: entry.weight }}>{entry.label}</button>
      ))}
    </div>
  );
}

function CanvasItem({ item, zoom, tool, selected, onSelect, onChange, onMove, onResize, onGesture, onDelete, onSnap = null, onLevel = null }) {
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
    // A divider is only a rule now - Section / Sub-section headings do the
    // titling. Dividers made before that keep the title they were given.
    const titled = !!item.text;
    return (
      <div data-block data-section style={{ left: item.x, top: item.y, width: item.w || COLUMN }}
        className={`group absolute z-10 cursor-grab py-2 active:cursor-grabbing ${selected ? 'rounded ring-2 ring-accent ring-offset-2' : ''}`}
        onPointerDown={down} onDoubleClick={titled ? startEdit : undefined}>
        <div className="h-px w-full bg-line-strong" />
        {titled && <div ref={body} contentEditable={editing} suppressContentEditableWarning
          onBlur={e => { setEditing(false); const text = e.currentTarget.textContent; shown.current = text; onChange(item.id, text); }}
          className="mt-2 text-sm font-medium text-ink outline-none">{shown.current}</div>}
        {/* Reachable without selecting first: a section is structure, and removing
            one should not need the same ceremony as editing it. */}
        <button type="button" aria-label="Remove divider" title="Remove divider"
          onPointerDown={event => event.stopPropagation()}
          onClick={() => onDelete(item.id)}
          className="absolute -top-2 right-0 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-3 opacity-0 hover:bg-hover hover:text-ink focus-visible:opacity-100 group-hover:opacity-100">
          <X size={13} />
        </button>
      </div>
    );
  }
  return (
    <div data-block data-item-id={item.id} style={{ left: item.x, top: item.y, opacity: item.opacity, ...(sticky ? { width: item.w || 160, height: item.h || 160, background: stickyTone(item.color).bg, borderColor: stickyTone(item.color).border, color: stickyTone(item.color).text, '--sticky-ph': stickyTone(item.color).placeholder } : { color: inkAware(item.color), ...textStyle(item), ...(item.w ? { width: item.w } : {}), ...(item.h ? { minHeight: item.h } : {}) }) }}
      className={`absolute z-10 cursor-grab active:cursor-grabbing ${sticky
        // Text has no card behind it, so its box is invisible until you are on
        // it. The border is always there and only gains a colour on hover, so
        // nothing shifts; the padding is cancelled by the margin for the same
        // reason - glyphs stay exactly where they were placed.
        ? '-rotate-1 overflow-hidden rounded-sm border p-3 text-[13px] leading-snug shadow-md'
        : `min-w-24 -mx-1 -my-0.5 rounded border border-transparent px-1 py-0.5 leading-snug ${tool === 'select' ? 'hover:border-line' : ''}`} ${selected ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`}
      onPointerDown={down} onDoubleClick={startEdit}>
      {/* A selected or editing text box offers its ladder right there - H1 to
          text - instead of asking the learner to find the style panel. One
          click reaches it; no double-click needed. pointerdown is swallowed
          so choosing a level never blurs or deselects the text. */}
      {!sticky && item.kind === 'text' && onLevel && (editing || (selected && tool === 'select')) && (
        <LevelPill level={item.level} onLevel={value => onLevel(item.id, value)} className="absolute bottom-full left-0 z-20 mb-1" />
      )}
      <div ref={body} contentEditable={editing} suppressContentEditableWarning data-placeholder={sticky ? 'Note…' : 'Text…'}
        onBlur={e => { setEditing(false); const text = e.currentTarget.textContent; shown.current = text; onChange(item.id, text); }}
        className={`outline-none ${sticky ? 'h-full empty:before:text-[color:var(--sticky-ph)]' : 'empty:before:opacity-50'} empty:before:content-[attr(data-placeholder)]`}>{shown.current}</div>
      {/* Text gets the same corner control as a note: the box scales, the
          type does not - wrapping is what changes, never the font size. The
          glyph is the card nodes' diagonal-lines corner, not a square. */}
      {(sticky || item.kind === 'text') && selected && tool === 'select' && (
        <button type="button" data-thumbnail-hide aria-label={sticky ? 'Resize note' : 'Resize text box'} title="Resize"
          style={sticky ? { color: stickyTone(item.color).placeholder } : undefined}
          className={`absolute -right-0.5 -bottom-0.5 z-10 cursor-nwse-resize p-1 ${sticky ? '' : 'text-ink-3 hover:text-ink-2'}`}
          onPointerDown={event => {
            if (event.button !== 0) return;
            onGesture();
            const box = sticky ? null : event.currentTarget.parentElement.getBoundingClientRect();
            const start = sticky ? { x: item.w || 160, y: item.h || 160 } : { x: item.w || box.width / zoom, y: item.h || box.height / zoom };
            startDrag(event, start, (w, h) => onResize(item.id, Math.max(sticky ? 80 : 96, w), Math.max(sticky ? 80 : 28, h)), zoom);
          }}>
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M10 4 4 10 M10 8 8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>
        </button>
      )}
    </div>
  );
}

// An equation (docs/features/canvas-equations.md): its LaTeX rendered by KaTeX, and while edited MathLive's field with
// the palette above it (EquationEditor.jsx, loaded on the first edit). Double-click edits; a click away or Esc finishes.
function EquationItem({ item, zoom, tool, selected, onSelect, onMove, onGesture, onDelete, onSnap, onPatch, onDone }) {
  const [editing, setEditing] = useState(!!item.fresh);
  const size = item.size || EQUATION_SIZE;
  const still = item.latex ? <MathText expression={item.latex} display /> : <span className="text-[0.6em] text-ink-3 italic">Empty equation</span>;
  const down = event => {
    if (event.button !== 0) return;
    if (tool === 'eraser') { event.preventDefault(); event.stopPropagation(); onDelete(item.id); return; }
    if (tool !== 'select') return;
    if (editing) { event.stopPropagation(); return; }
    if (!selected) onSelect(item.id, event);
    onGesture();
    startDrag(event, { x: item.x, y: item.y }, (x, y) => onMove(item.id, x, y), zoom, onSnap?.(item.id));
  };
  return (
    <div data-block data-item-id={item.id} data-equation={editing ? 'editing' : ''} style={{ left: item.x, top: item.y, fontSize: size, color: inkAware(item.color || COLORS[0]) }}
      className={`absolute z-10 -mx-1 rounded border px-1 [&_[data-chat-math]]:my-0 [&_[data-chat-math]]:py-0 ${editing ? 'cursor-text border-line bg-white' : `cursor-grab border-transparent active:cursor-grabbing ${tool === 'select' ? 'hover:border-line' : ''}`} ${selected ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`}
      onPointerDown={down} onDoubleClick={() => { if (tool === 'select') setEditing(true); }}>
      {editing
        ? <Suspense fallback={still}><EquationEditor latex={item.latex || ''} zoom={zoom} onDone={latex => { setEditing(false); onDone(item.id, latex); }} /></Suspense>
        : still}
      {/* The size ladder, where a text box shows its H1-to-text one; never while the LaTeX is edited (the palette is there). */}
      {selected && !editing && tool === 'select' && (
        <LevelPill level={equationLevel(size)} levels={EQUATION_LEVELS} label="Equation size" fallback={null} className="absolute bottom-full left-0 z-20 mb-1"
          onLevel={value => { onGesture(); onPatch(item.id, { size: levelSize(value) }); }} />
      )}
      {/* The corner scales the type, as a text box's corner reflows its text. */}
      {selected && !editing && tool === 'select' && (
        <button type="button" data-thumbnail-hide aria-label="Resize equation" title="Resize" className="absolute -right-0.5 -bottom-0.5 z-10 cursor-nwse-resize p-1 text-ink-3 hover:text-ink-2"
          onPointerDown={event => {
            if (event.button !== 0) return;
            onGesture();
            const from = event.currentTarget.parentElement.getBoundingClientRect().width / zoom;
            startDrag(event, { x: from, y: 0 }, w => onPatch(item.id, { size: scaledSize(size, from, w) }), zoom);
          }}>
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M10 4 4 10 M10 8 8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>
        </button>
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
      {SECTION_LEVELS.map(entry => {
        const Icon = [Heading1, Heading2, Heading3][entry.level - 1];
        return (
          <button key={entry.level} type="button" role="menuitem" onClick={() => onLevel(entry.level)}
            style={{ fontSize: Math.round(entry.size * 0.62), fontWeight: entry.weight }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1 text-left leading-tight text-ink hover:bg-hover">
            <Icon size={15} strokeWidth={1.8} className="shrink-0 text-ink-2" />{entry.placeholder}
          </button>
        );
      })}
    </div>
  );
}

function BlockMenu({ className, filter, onFilter, onPick }) {
  return (
    <div role="menu" aria-label="Lesson blocks" className={`absolute z-40 flex max-h-[70vh] w-52 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-md ${className}`}>
      <input type="search" autoFocus value={filter} onChange={event => onFilter(event.target.value)}
        aria-label="Filter blocks" placeholder="Filter…"
        className="m-1 h-7 shrink-0 rounded-lg border border-line px-2 text-xs outline-none focus:border-ink-3" />
      {/* Grouped the way learners think (learn-insert-palette.js); it scrolls
          rather than running off the canvas. */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-1 pt-0">
        {paletteSections(BLOCK_TYPES, { dev: import.meta.env.VITE_COACHING_DEV === 'true', filter }).map(section => (
          <div key={section.title} role="group" aria-label={section.title}>
            <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold tracking-wider text-ink-3 uppercase">{section.title}</div>
            {section.items.map(type => (
              <button key={type} type="button" role="menuitem" onClick={() => onPick(type)}
                className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-ink hover:bg-hover">{insertName(type, BLOCK_TYPES)}</button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// The insert rail: a dotted line across the column, with [-] and [+] parked on
// the blank canvas beside it. Press either as often as you like - [+] pushes the
// pair apart, [-] pulls it together and then straight past flush into an
// overlap, because the space is only a margin and margins go negative.
function GapRail({ gap, zoom, edge, span, adding, onNudge, onAdding, onAddHeading }) {
  const chrome = 'flex h-6 items-center justify-center rounded-lg border border-line bg-white text-ink-2 shadow-md hover:bg-hover hover:text-ink';
  const button = (delta, Icon, label) => (
    <button type="button" aria-label={label} title={label} onClick={() => onNudge(delta)}
      onPointerDown={event => event.stopPropagation()} // a press here must not start a pan
      className={`${chrome} w-6`}>
      <Icon size={13} strokeWidth={1.8} />
    </button>
  );
  // Shown for the gap near the pointer: buttons at the far left of the visible
  // canvas, the line running from them to the right edge. Counter-scaled so
  // they stay the same size at any zoom.
  const buttons = 104 / zoom;
  return (
    <div data-gap-rail={gap.index} style={{ top: gap.y }} className="pointer-events-none absolute left-0 z-10">
      <div style={{ left: edge + buttons, width: Math.max(0, span.left + span.width - edge - buttons) }}
        className="absolute -translate-y-1/2 border-t border-dashed border-ink-3" />
      <div style={{ left: edge + 12 / zoom, transform: `translate(0, -50%) scale(${1 / zoom})`, transformOrigin: 'left center' }}
        className="pointer-events-auto absolute flex items-center gap-1">
        {button(-SPACE_STEP, Minus, `Pull everything below up — ${Math.round(gap.bottom - gap.top)}px apart`)}
        {button(SPACE_STEP, Plus, `Push everything below down — ${Math.round(gap.bottom - gap.top)}px apart`)}
        <span className="relative">
          <button type="button" aria-label="Insert a section here" title="Insert a section in this gap" aria-expanded={adding}
            onPointerDown={event => event.stopPropagation()} onClick={() => onAdding(!adding)}
            className={`${chrome} w-6`}><Ellipsis size={14} strokeWidth={1.8} /></button>
          {adding && <SectionMenu className="top-7 left-0" onLevel={level => onAddHeading(level, gap)} />}
        </span>
      </div>
    </div>
  );
}

const pathOf = points => points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');

// One pen or highlighter stroke, on the canvas and in an Explain Back sketch alike.
const inkPath = (stroke, index) => (stroke.tool === 'pen'
  ? <path key={index} d={pathOf(stroke.points)} fill="none" stroke={inkAware(stroke.color)} strokeWidth={stroke.width} opacity={stroke.opacity} strokeDasharray={dashArray(stroke.dash, stroke.width)} strokeLinecap="round" strokeLinejoin="round" />
  : <path key={index} d={pathOf(stroke.points)} fill="none" stroke="#fde047" strokeWidth={stroke.width || 14} strokeOpacity=".5" strokeLinecap="round" strokeLinejoin="round" />);

const arrowHead = (tip, from, stroke) => {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x), size = 8 + stroke.strokeWidth * 2;
  return <path d={`M${tip.x - size * Math.cos(angle - 0.45)} ${tip.y - size * Math.sin(angle - 0.45)} L${tip.x} ${tip.y} L${tip.x - size * Math.cos(angle + 0.45)} ${tip.y - size * Math.sin(angle + 0.45)}`} {...stroke} strokeDasharray={undefined} />;
};

// A label in the middle of a connector or a drawn arrow. It sits on a small
// paper patch so the line does not run through the words; only the editor
// takes the pointer. Enter commits, Shift+Enter breaks the line.
function LineLabel({ at, text, color, editing, pickable = false, onPick = null, onDone }) {
  const body = useRef(null);
  const shown = useRef(text || '');
  if (!editing) shown.current = text || '';
  useEffect(() => {
    if (!editing || !body.current) return;
    body.current.focus();
    document.getSelection()?.selectAllChildren(body.current);
    document.getSelection()?.collapseToEnd();
  }, [editing]);
  if (!editing && !text) return null;
  return (
    <foreignObject x={at.x - 120} y={at.y - 40} width={240} height={80} style={{ overflow: 'visible', pointerEvents: 'none' }}>
      <div className="flex h-full w-full items-center justify-center">
        <div ref={body} data-line-label contentEditable={editing} suppressContentEditableWarning
          style={{ color: inkAware(color), pointerEvents: editing || pickable ? 'auto' : 'none' }}
          onPointerDown={event => {
            event.stopPropagation();
            // On a selected line, a click on its label edits it.
            if (!editing && pickable) { event.preventDefault(); onPick?.(); }
          }}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); } }}
          onBlur={event => { const value = event.currentTarget.innerText.replace(/\n$/, ''); shown.current = value; onDone(value); }}
          className="max-w-[240px] min-w-4 cursor-text rounded bg-white px-1.5 py-0.5 text-center text-[13px] leading-snug break-words whitespace-pre-wrap outline-none">{shown.current}</div>
      </div>
    </foreignObject>
  );
}

// The dot on a selected line's middle: click it to write a label there.
const LabelHandle = ({ at, zoom, onPick }) => (
  <circle data-label-handle cx={at.x} cy={at.y} r={5 / zoom} fill="white" stroke="#2383e2" strokeWidth={1.5 / zoom}
    style={{ pointerEvents: 'all', cursor: 'text' }}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); onPick(); }}><title>Add a label</title></circle>
);

// Where a closed shape's text sits, as fractions of its box [left, top, right,
// bottom]: inside the outline, so the words never cross the stroke.
const TEXT_BOX = { rect: [0.06, 0.06, 0.94, 0.94], ellipse: [0.15, 0.15, 0.85, 0.85], triangle: [0.25, 0.45, 0.75, 0.95], diamond: [0.22, 0.22, 0.78, 0.78], hexagon: [0.15, 0.1, 0.85, 0.9], star: [0.3, 0.35, 0.7, 0.75] };

function ShapeView({ shape, tool, zoom, selected, editing = false, labelEditing = false, showPorts = false, onSelect, onMoveStart, onResize, onGesture, onDelete, onEdit, onText, onConnect, onLabel, onLabelDone }) {
  const { kind, x1, y1, x2, y2, color, width, dash, fill, opacity, round } = shape;
  // Unfilled shapes paint a transparent fill so the pointer can grab the
  // interior, not just the hairline outline. Transparent paint still hit-tests
  // under visiblePainted; opacity 0 keeps it invisible.
  const stroke = { stroke: inkAware(color), strokeWidth: width, fill: fill ? inkAware(fill) : 'transparent', fillOpacity: fill ? 0.25 : 0, opacity, strokeDasharray: dashArray(dash, width), strokeLinecap: 'round', strokeLinejoin: 'round' };
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  const control = kind === 'curve' ? curveControl(shape) : null;
  const linear = kind === 'line' || kind === 'arrow' || kind === 'curve' || kind === 'elbow';
  const elbow = kind === 'elbow' ? freeElbow(shape) : null;
  const middle = kind === 'curve' ? { x: 0.25 * x1 + 0.5 * control.x + 0.25 * x2, y: 0.25 * y1 + 0.5 * control.y + 0.25 * y2 } : elbow ? polylineMid(elbow) : { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const textBox = TEXT_BOX[kind];
  const body = useRef(null);
  // Pinned while editing so a re-render never wipes what is being typed.
  const shown = useRef(shape.text || '');
  if (!editing) shown.current = shape.text || '';
  useEffect(() => {
    if (!editing || !body.current) return;
    body.current.focus();
    document.getSelection()?.selectAllChildren(body.current);
    document.getSelection()?.collapseToEnd();
  }, [editing]);
  const down = event => {
    if (event.button !== 0) return;
    if (editing || labelEditing) { event.stopPropagation(); return; }
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
    <g data-shape-id={shape.id} className="group" style={{ pointerEvents: 'visiblePainted', cursor: tool === 'select' ? 'grab' : undefined }} onPointerDown={down}
      onDoubleClick={() => {
        if (tool !== 'select') return;
        if (textBox && onEdit) onEdit(shape.id);
        else if (linear && onLabel) onLabel(shape.id);
      }}>
      {kind === 'rect' && <rect x={x} y={y} width={w} height={h} rx={round ? 14 : 2} {...stroke} />}
      {kind === 'ellipse' && <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...stroke} />}
      {POLYGONS[kind] && <polygon points={POLYGONS[kind].map(([u, v]) => `${x + u * w},${y + v * h}`).join(' ')} {...stroke} />}
      {(kind === 'line' || kind === 'arrow') && <line x1={x1} y1={y1} x2={x2} y2={y2} {...stroke} />}
      {kind === 'curve' && <path d={`M${x1} ${y1} Q${control.x} ${control.y} ${x2} ${y2}`} {...stroke} />}
      {elbow && <path d={pathOf(elbow)} {...stroke} fill="none" />}
      {/* A 2px line is a 2px target. This invisible band gives lines, arrows
          and curves the same easy grab a filled shape's interior has. */}
      {(kind === 'line' || kind === 'arrow') && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={Math.max(14 / zoom, width + 8)} strokeLinecap="round" />}
      {kind === 'curve' && <path d={`M${x1} ${y1} Q${control.x} ${control.y} ${x2} ${y2}`} fill="none" stroke="transparent" strokeWidth={Math.max(14 / zoom, width + 8)} strokeLinecap="round" />}
      {kind === 'arrow' && arrowHead({ x: x2, y: y2 }, { x: x1, y: y1 }, stroke)}
      {kind === 'curve' && arrowHead({ x: x2, y: y2 }, control, stroke)}
      {elbow && <path d={pathOf(elbow)} fill="none" stroke="transparent" strokeWidth={Math.max(14 / zoom, width + 8)} strokeLinejoin="round" />}
      {elbow && elbow.length > 1 && arrowHead(elbow[elbow.length - 1], elbow[elbow.length - 2], stroke)}
      {linear && <LineLabel at={middle} text={shape.label} color={color} editing={labelEditing} pickable={selected && tool === 'select'} onPick={() => onLabel?.(shape.id)} onDone={value => onLabelDone(shape.id, value)} />}
      {linear && selected && tool === 'select' && !labelEditing && !shape.label && onLabel && <LabelHandle at={middle} zoom={zoom} onPick={() => onLabel(shape.id)} />}
      {/* Text in the middle of a closed shape: it wraps inside the outline and
          reflows as the shape is resized. Only the editor takes the pointer. */}
      {textBox && (shape.text || editing) && (
        <foreignObject x={x + textBox[0] * w} y={y + textBox[1] * h} width={Math.max(1, (textBox[2] - textBox[0]) * w)} height={Math.max(1, (textBox[3] - textBox[1]) * h)}
          style={{ pointerEvents: editing ? 'all' : 'none', overflow: 'visible' }}>
          <div className="flex h-full w-full items-center justify-center text-center" style={{ color: inkAware(color), opacity, lineHeight: 1.25, ...textStyle(shape) }}>
            <div ref={body} data-shape-text contentEditable={editing} suppressContentEditableWarning
              onBlur={event => { const text = event.currentTarget.innerText.replace(/\n$/, ''); shown.current = text; onText(shape.id, text); }}
              className="max-w-full min-w-4 cursor-text break-words whitespace-pre-wrap outline-none">{shown.current}</div>
          </div>
        </foreignObject>
      )}
      {selected && !linear && <rect data-thumbnail-hide x={x - 5} y={y - 5} width={w + 10} height={h + 10} fill="none" stroke="#2383e2" strokeWidth="1" strokeDasharray="4 3" />}
      {selected && tool === 'select' && handles.map(([hx, hy, patch], index) => (
        <circle key={index} data-thumbnail-hide cx={hx} cy={hy} r={5 / zoom} fill="white" stroke="#2383e2" strokeWidth={1.5 / zoom}
          style={{ pointerEvents: 'all', cursor: linear ? 'move' : 'nwse-resize' }}
          onPointerDown={event => { if (event.button !== 0) return; onGesture(); startDrag(event, { x: hx, y: hy }, (px, py) => onResize(shape.id, patch({ x: px, y: py })), zoom); }} />
      ))}
      {/* Connection ports on the four sides: drag to another shape or card, or
          click here and then click the target. */}
      {textBox && tool === 'select' && onConnect && SIDES.map(side => {
        const at = sidePoint({ x, y, w, h }, side);
        return (
          <circle key={side} data-port={side} data-owner={shape.id} cx={at.x} cy={at.y} r={6 / zoom} fill="white" stroke="#2383e2" strokeWidth={1.5 / zoom}
            className={selected || showPorts ? '' : 'opacity-0 group-hover:opacity-100'} style={{ pointerEvents: 'all', cursor: 'crosshair' }}
            onPointerDown={event => onConnect(event, shape.id, side)}><title>Drag or click to connect</title></circle>
        );
      })}
    </g>
  );
}

// Colour, thickness and dash used to live in the tool column, which had grown to
// 26 buttons and scrolled. They sit in their own island now, beside the tools,
// shown only while a drawing tool is armed or something styleable is selected.
// Text swaps the thickness row for Notion's heading ladder.
// It opens from the tools' gutter, beside the toolbar on whichever side it docks.
function StylePanel({ colorOnly = false, side = 'right', text, showFill, corners, order, route = false, routeValue = null, color, fill, width, dash, opacity, round, level, onColor, onFill, onWidth, onDash, onOpacity, onRound, onLevel, onOrder, onRoute }) {
  const rule = <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />;
  return (
    <div role="group" aria-label="Style" onPointerDown={event => event.stopPropagation()}
      className={`absolute top-1/2 ${side === 'left' ? 'left-24' : 'right-24'} z-20 grid w-max max-h-full -translate-y-1/2 grid-cols-2 gap-0.5 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-md @max-[640px]:top-auto @max-[640px]:left-auto @max-[640px]:right-0 @max-[640px]:bottom-full @max-[640px]:mb-2 @max-[640px]:max-h-[60vh] @max-[640px]:translate-y-0`}>
      {COLORS.map(value => (
        <button key={value} type="button" title="Color" aria-label={`Color ${value}`} aria-pressed={color === value} onClick={() => onColor(value)}
          className="flex h-6 w-8 items-center justify-center rounded-lg hover:bg-hover">
          <span style={{ background: value }} className={`h-3.5 w-3.5 rounded-full ${color === value ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`} />
        </button>
      ))}
      {/* A comment pin has a colour and nothing else (owner, 2026-10-08). */}
      {!colorOnly && <>
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
      {route && (
        <>
          {rule}
          {[['straight', Slash, 'Straight line'], ['curved', Spline, 'Curved line'], ['elbow', CornerDownRight, 'Elbow line']].map(([value, Icon, label]) => (
            <button key={value} type="button" title={label} aria-label={label} aria-pressed={routeValue === value} onClick={() => onRoute(value)}
              className={`flex h-6 w-8 items-center justify-center rounded-lg ${routeValue === value ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover'}`}><Icon size={14} strokeWidth={1.7} /></button>
          ))}
        </>
      )}
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
      </>}
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

// The name tag of a group, floating just above its top-left corner. Click
// selects the whole group; double-click renames it in place.
function GroupChip({ group, onSelect, onLabel, editOn = false }) {
  const [editing, setEditing] = useState(false);
  const body = useRef(null);
  useEffect(() => {
    if (!editing) return;
    // Caret at the END of the existing name, so editing means editing - not
    // typing in front of it. rAF outruns the double-click's own selection.
    requestAnimationFrame(() => {
      const node = body.current;
      if (!node) return;
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      const chosen = window.getSelection();
      chosen.removeAllRanges();
      chosen.addRange(range);
    });
  }, [editing]);
  useEffect(() => { if (editOn) setEditing(true); }, [editOn]);
  return (
    <div data-group-chip={group.id}
      className="flex cursor-pointer items-center rounded-md border border-line bg-white/90 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-ink-2 shadow-sm backdrop-blur-sm hover:text-ink"
      onPointerDown={event => { event.stopPropagation(); if (!editing) onSelect(); }}
      onDoubleClick={() => setEditing(true)}>
      <div ref={body} contentEditable={editing} suppressContentEditableWarning data-placeholder="Group"
        onBlur={event => { setEditing(false); onLabel(event.currentTarget.textContent.trim().slice(0, 60)); }}
        className="min-w-6 outline-none empty:before:opacity-60 empty:before:content-[attr(data-placeholder)]">{group.label}</div>
    </div>
  );
}

const CARDS_COPIED = 'rabbit-hole:copied-cards';

// One row of the canvas right-click menu (owner, 2026-10-08: "each options should have an icon next to it"): the card ⋮
// menu's MenuItem, its icon at 16px beside the label. A new row passes only its icon.
const MenuRow = props => <MenuItem type="button" role="menuitem" {...props} />;

export default function AdaptiveCanvas({ exchanges, onMove, onSearch = null, bottomLeft = null, onDelete = null, onRestore = null, onAskTarget = null, askTargetId = null, onOpenFile = null, onAdd = null, onGrade = null, onResize = null, onReply = null, appName = null, apiRef = null, onState = null, storageKey = null, seedBlocks = null, composer = null, renderBlockComposer = null, onWiki = null, onWatch = null, onDropFiles = null, onCardAction = null, attachedIds = null, onGroupShot = null, onAreaShot = null, onPaper = null, edgeInset = 0, boardState = null, onSave = null, readOnly = false, gutterTop = null, leftRail = null, hooks = null, onStartRabbitHole = null, onAddComment = null, commentPins = null, onCommentPin = null, onPinColor = null, onPinDelete = null, onPasteCode = null }) {
  // A view-only board pans and zooms with the hand and edits nothing.
  const [tool, setTool] = useState(readOnly ? 'hand' : 'select');
  const readOnlyRef = useRef(readOnly);
  // The C key's way in to Add comment (set each render where comments are on; null elsewhere).
  const commentKeyRef = useRef(null);
  // A picked comment pin (owner, 2026-10-08): not a board object, so it never joins the selection - picking one clears
  // the selection and any board pick lets it go. pinAsk: the line by it (a delete to confirm, or a refusal). pinKeyRef:
  // its keys (Enter, Del, Backspace, Esc), set each render while a pin is picked.
  const [pinPick, setPinPick] = useState(null);
  const [pinAsk, setPinAsk] = useState(null);
  const pinKeyRef = useRef(null);
  // OS drag-and-drop of files onto the surface; the page owns what each kind
  // becomes, the canvas only announces the hover and hands the files over.
  const [dropHover, setDropHover] = useState(false);
  const [marquee, setMarquee] = useState(null);
  const [menuAt, setMenuAt] = useState(null); // right-click canvas actions
  // Where the menu actually goes (owner, 2026-10-07): measured after it renders, so it opens beside the cursor and stays
  // inside both the window and the canvas surface (which clips it) at the right and bottom edges - flipped to the
  // cursor's other side, then clamped. Hidden for that one measuring pass, before paint.
  const menuBox = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  useLayoutEffect(() => {
    setMenuPos(null);
    if (!menuAt) return;
    const box = menuBox.current, area = surface.current;
    if (!box || !area) return;
    const s = area.getBoundingClientRect(), pad = 8;
    const lim = { left: Math.max(s.left, 0) + pad, top: Math.max(s.top, 0) + pad, right: Math.min(s.right, window.innerWidth) - pad, bottom: Math.min(s.bottom, window.innerHeight) - pad };
    const w = box.offsetWidth, h = box.offsetHeight, cx = s.left + menuAt.x, cy = s.top + menuAt.y;
    const place = (at, size, lo, hi) => Math.max(lo, Math.min(at + size > hi ? at - size : at, hi - size));
    // The surface clips (overflow hidden) but can still be scrolled by focus or scroll-into-view; its absolute children
    // move with that scroll, so the screen position is turned back into the surface's own coordinates with it.
    setMenuPos({ x: place(cx, w, lim.left, lim.right) - s.left + area.scrollLeft, y: Math.max(lim.top, place(cy, h, lim.top, lim.bottom)) - s.top + area.scrollTop, maxH: Math.max(lim.bottom - lim.top, 120) });
  }, [menuAt]);
  // A press anywhere outside the menu closes it - on the canvas (its own handlers) and off it (the header, a rail).
  useEffect(() => {
    if (!menuAt) return;
    const close = event => { if (!menuBox.current?.contains(event.target)) setMenuAt(null); };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [menuAt]);
  const [chipEdit, setChipEdit] = useState(null); // group id whose chip should open for renaming
  // The tool palette hangs on the right by default; a drag on its handle can
  // park it on either edge. While dragging it follows the pointer.
  // Left by default, as Parallel shipped it (caca1c2b); the grip still docks it right.
  const [toolSide, setToolSide] = useState('left');
  // The toolbar lives in the tools' gutter on that side (never over the
  // canvas); measured so it never rests with a control half-clipped.
  const toolbarRef = useRef(null);
  const [toolDrag, setToolDrag] = useState(null);
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
  const viewRef = useRef(view);
  viewRef.current = view;
  // The learner's camera wins (docs/features/canvas-skeleton-cards.md): every camera change the canvas did not make
  // itself (autoView) - wheel pan or zoom, pinch, a drag, the keys, the minimap, the zoom pill, the Files panel's
  // Show, a section or a step - counts here, and an automatic move armed before it (a reservation's card, a card
  // settling) is dropped instead of pulling the learner back.
  const autoView = useRef(null), manualMoves = useRef(0);
  useEffect(() => { if (view !== autoView.current) manualMoves.current += 1; }, [view]);
  // Learner artifacts persist in this browser so a refresh keeps the canvas.
  const stored = useRef(null);
  if (stored.current === null) {
    // A shared board arrives as state from the server instead (SharedBoardPage).
    try { stored.current = boardState || (storageKey ? JSON.parse(localStorage.getItem(storageKey) || '{}') : {}); } catch { stored.current = {}; }
  }
  const [strokes, setStrokes] = useState(stored.current.strokes || []); // pen and highlighter ink, world coords
  const [live, setLive] = useState(null);
  const [shapes, setShapes] = useState(stored.current.shapes || []);
  const [liveShape, setLiveShape] = useState(null);
  const [items, setItems] = useState(() => (stored.current.items || []).map(item => ({
    ...item, fresh: false,
    // Untitled dividers from before the wider rule widen in place, centred on
    // the column they were drawn across.
    ...(item.kind === 'section' && !item.text && item.w === COLUMN ? { x: item.x - (DIVIDER_W - COLUMN) / 2, w: DIVIDER_W } : {}),
  }))); // stickies and text
  // seedBlocks fills a board that has never been used. A board with its own
  // saved CONTENT always wins - but a saved EMPTY board re-seeds, because [] is
  // truthy and an empty array in storage is how a visit during a deploy
  // rollout, or to a then-unregistered name, permanently froze a board blank.
  const [blocks, setBlocks] = useState(stored.current.blocks?.length ? stored.current.blocks : (seedBlocks || [])); // course-authored lesson blocks
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  // Reserved slots for cards on their way (canvas-slots.js): this viewer's UI only, never in `blocks`, so
  // never saved, pushed, undone, forked or counted as content.
  const [slots, setSlots] = useState([]);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  // Selection is a list: ctrl/cmd/shift-click adds to it, so several nodes
  // move or delete together.
  const [selection, setSelection] = useState([]);
  const selected = selection.length === 1 ? selection[0] : null; // single-target affordances
  // A view-only board keeps a selection (the card a Rabbit Hole starts from) but no card chrome for it: no pills,
  // handles or ports; one plain ring is drawn over the selected card instead (data-view-selection).
  const isSelected = id => !readOnly && selection.includes(id);
  const setSelected = value => setSelection(value == null ? [] : [value]);
  // Selecting on the canvas takes the keyboard away from the composer so
  // Delete acts on the selection; editable notes keep their own focus.
  const select = (id, event = null) => {
    // Picking something lets the style panel follow it again, even if the
    // learner closed the panel earlier: a shape's colours are one click away.
    setStyleOpen(null);
    const active = document.activeElement;
    if (id && active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) active.blur();
    const additive = event && (event.ctrlKey || event.metaKey || event.shiftKey);
    // A plain click on a grouped thing picks up its whole group; ctrl+click
    // still reaches the single member underneath.
    if (!additive) {
      const gid = id == null ? null : groupOf(id);
      setSelection(id == null ? [] : gid ? membersOf(gid) : [id]);
      return;
    }
    setSelection(previous => previous.includes(id) ? previous.filter(other => other !== id) : [...previous, id]);
  };
  const selectRef = useRef(select);
  selectRef.current = select;
  // The one active draw target (docs/features/explain-back-sketch.md): null is this canvas, a block id is that
  // Explain Back card's sketch. The toolbar's tool and style, Delete and the style panel act on it; the sketch
  // keeps its own selection, live mark and text edit so nothing of the canvas's is ever touched from inside it.
  const [drawTarget, setDrawTarget] = useState(null);
  const drawTargetRef = useRef(drawTarget);
  drawTargetRef.current = drawTarget;
  const [sketchSel, setSketchSel] = useState([]);
  const sketchSelRef = useRef(sketchSel);
  sketchSelRef.current = sketchSel;
  const [sketchLive, setSketchLive] = useState(null); // { id, stroke } or { id, shape } while one is being drawn
  const [sketchEdit, setSketchEdit] = useState(null); // { id, kind: 'text' | 'label' }: a sketch shape being written in
  const [links, setLinks] = useState(stored.current.links || []);
  // Named groups. Membership lives on the members themselves (groupId), so
  // undo restores it with them; this list only carries each group's label.
  const [groups, setGroups] = useState(stored.current.groups || []);
  // Every area asked about stays on the canvas, outlined and lightly filled red, saved with the
  // board, until the learner clicks its outline to remove it.
  const [areas, setAreas] = useState(stored.current.areas || []);
  const areaById = id => areas.find(area => area.id === id);
  const divePortals = useContext(DivePortals);
  // Every change also goes to onSave (a shared board's server copy), if given.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  // The board as last rendered, for persist(): a caller holding an older canvasApi still saves the latest.
  const boardRef = useRef(null);
  boardRef.current = { strokes, shapes, items, links, blocks, groups, areas };
  // Final review B-C1: an unmounted canvas (Home, the sidebar, a Rabbit Hole remounting the page) neither inserts nor
  // saves, so a run still holding its canvasApi never reports a block drawn or overwrites the new canvas's saved copy.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const firstSave = useRef(true);
  useEffect(() => {
    if (!storageKey && !onSaveRef.current) return;
    // Oversized data URLs dropped (canvas-persist.js lightBlocks).
    const light = lightBlocks(blocks);
    // The first run is the board as loaded, not a change.
    const loaded = firstSave.current;
    firstSave.current = false;
    const timer = setTimeout(() => {
      const state = { strokes, shapes, items, links, blocks: light, groups, areas };
      if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* full or blocked storage loses drawings only */ } }
      if (!loaded) onSaveRef.current?.(state);
    }, 400);
    return () => clearTimeout(timer);
  }, [strokes, shapes, items, links, blocks, groups, areas, storageKey]);
  const [connecting, setConnecting] = useState(null);
  const [bounds, setBounds] = useState({});
  // Where an asked-about area is now: on its host card when it has one, else where it was drawn.
  const areaBox = area => { const host = area.blockId && bounds[area.blockId]; return host ? { ...area, x: host.x + area.dx, y: host.y + area.dy } : area; };
  const [hoverGap, setHoverGap] = useState(null);
  const [gapAdding, setGapAdding] = useState(false);
  // A press anywhere outside the rail - canvas, card or shape - closes its menu.
  useEffect(() => {
    if (!gapAdding) return undefined;
    const close = event => { if (!event.target.closest?.('[data-gap-rail]')) { setGapAdding(false); setHoverGap(null); } };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [gapAdding]);
  const [guides, setGuides] = useState([]);
  const [grid, setGrid] = useState(false);
  const [minimap, setMinimap] = useState(true);
  const [pages, setPages] = useState(false);
  // Present mode: null when editing, otherwise the step being shown.
  const [presenting, setPresenting] = useState(null);
  // When the docked toolbar must scroll (a short phone screen), cap it at the
  // bottom of the last control that fits whole, so none rests half-clipped;
  // the rest scroll into view whole. null: it fits, no cap.
  const [toolCap, setToolCap] = useState(null);
  useLayoutEffect(() => {
    const bar = toolbarRef.current;
    if (!bar) return;
    const measure = () => {
      // The gutter is the canvas row's height; below 640px it is a strip under
      // the canvas and the toolbar scrolls sideways, so nothing to cap.
      // The Rabbit Hole navigator shares the gutter above it (Dive.jsx); with it the column is
      // full, so the overview button below (32px and its gap) is reserved too.
      const slot = bar.parentElement.querySelector('[data-gutter-top]');
      // Less the gutter's bottom padding: the floating strip's column on the tools' side (--chrome-left/right).
      const room = bar.parentElement.clientHeight - parseFloat(getComputedStyle(bar.parentElement).paddingBottom || 0) - 16 - (slot ? slot.offsetHeight + 48 : 0), pad = 4; // p-1
      if (shell.current?.clientWidth < 640 || bar.scrollHeight <= room) { setToolCap(null); return; }
      // Measured from the bar's own top: the gutter is the offset parent, and the navigator moves the bar down in it.
      const ends = [...bar.children].map(child => child.offsetTop - bar.offsetTop + child.offsetHeight).filter(end => end + pad <= room);
      setToolCap(Math.max(0, ...ends) + pad);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar.parentElement);
    const slot = bar.parentElement.querySelector('[data-gutter-top]');
    if (slot) observer.observe(slot);
    return () => observer.disconnect();
  }, [presenting, !!gutterTop]);
  const itemsLayer = useRef(null);
  const worldRef = useRef(null); // the camera layer, which the card thumbnail draws
  const [level, setLevel] = useState('body');
  // The route the next shape connector takes; the style panel's Line row sets it.
  const [connectorRoute, setConnectorRoute] = useState('elbow');
  const [styleOpen, setStyleOpen] = useState(null); // null = follow the tool; true/false = the learner's explicit choice
  useEffect(() => { setStyleOpen(null); }, [tool]);
  const exchangesRef = useRef(exchanges);
  exchangesRef.current = exchanges;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const onAskTargetRef = useRef(onAskTarget);
  onAskTargetRef.current = onAskTarget;
  const onCardActionRef = useRef(onCardAction);
  onCardActionRef.current = onCardAction;
  const onGroupShotRef = useRef(onGroupShot);
  onGroupShotRef.current = onGroupShot;
  const onAreaShotRef = useRef(onAreaShot);
  onAreaShotRef.current = onAreaShot;
  const [areaMarquee, setAreaMarquee] = useState(null);
  const onPaperRef = useRef(onPaper);
  onPaperRef.current = onPaper;
  // Put the camera around a set of boxes. Used both to find your way back to
  // everything, and to land on one section while presenting.
  const frame = (boxes, pad = 48, maxZoom = 1) => {
    const element = surface.current;
    if (!element || !boxes.length) return;
    const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.w)), bottom = Math.max(...boxes.map(box => box.y + box.h));
    const w = element.clientWidth;
    const fit = h => Math.max(0.2, Math.min(maxZoom, (w - pad * 2) / Math.max(1, right - left), (h - pad * 2) / Math.max(1, bottom - top)));
    const across = z => (w - (right - left) * z) / 2 - left * z;
    // The floating bottom chrome over the framed span is a bottom inset: nothing is framed under the composer, the
    // minimap and zoom, or the hooks. A refit only narrows the span, so the first span's inset still holds.
    let z = fit(element.clientHeight);
    const h = Math.min(element.clientHeight, chromeTop(across(z) + left * z, across(z) + right * z));
    z = fit(h);
    // Centred horizontally; vertically too when the section is short enough to
    // sit in the middle of the screen, which is what reads as a slide.
    const height = (bottom - top) * z;
    setView({
      z,
      x: across(z),
      y: (height + pad * 2 < h ? (h - height) / 2 : pad) - top * z,
    });
  };
  // Frame everything on the canvas. An infinite surface you can pan forever needs
  // a way back to your own work.
  // Notes and text boxes count too - a board of only stickies has to fit.
  const zoomFit = () => frame([...Object.values(boundsRef.current), ...boxesOf([...shapesRef.current, ...itemsRef.current].map(entry => entry.id))]);
  // Stepping frames one section at a time; nothing re-renders, the camera just
  // lands somewhere else, so ink and notes drawn over a section come with it.
  const stepsRef = useRef([]);
  const showStep = index => {
    const steps = stepsRef.current;
    if (!steps.length) return;
    const at = Math.max(0, Math.min(index, steps.length - 1));
    setPresenting(at);
    frame(steps[at].boxes, 64, 1.6);
  };
  // Returns whether presenting actually started, so the page only rearranges
  // its chrome (closing the side panel) around a presentation that exists.
  const startPresenting = () => {
    stepsRef.current = presentSteps(blocksRef.current, boundsRef.current);
    // A board of drawings, shapes and notes (no sections or cards) presents as
    // one step: the whole canvas.
    if (!stepsRef.current.length) {
      const ink = present.current.strokes.flatMap(stroke => stroke.points || []);
      const inkBox = ink.length ? [{ x: Math.min(...ink.map(p => p.x)), y: Math.min(...ink.map(p => p.y)), w: Math.max(...ink.map(p => p.x)) - Math.min(...ink.map(p => p.x)), h: Math.max(...ink.map(p => p.y)) - Math.min(...ink.map(p => p.y)) }] : [];
      const boxes = [...Object.values(boundsRef.current), ...boxesOf([...shapesRef.current, ...itemsRef.current].map(entry => entry.id)), ...inkBox];
      if (!boxes.length) { toast('The canvas is empty. Draw or add something, then present it.'); return false; }
      stepsRef.current = [{ boxes, label: 'Whole canvas' }];
    }
    setSelected(null);
    showStep(0);
    return true;
  };
  const stopPresenting = () => { setPresenting(null); zoomFit(); };
  const showStepRef = useRef(showStep);
  showStepRef.current = showStep;
  const stopPresentingRef = useRef(stopPresenting);
  stopPresentingRef.current = stopPresenting;
  const selectAll = () => setSelection([
    ...blocksRef.current.map(block => block.id),
    ...itemsRef.current.map(item => item.id),
    ...shapesRef.current.map(shape => shape.id),
  ]);
  // The page owns the menubar, so every canvas-wide command it offers is published
  // here rather than lifting the canvas's own state out of it.
  // The same table serves the keyboard, so a shortcut and its menu row can
  // never drift apart.
  const commandsRef = useRef(null);
  useEffect(() => {
    commandsRef.current = {
      deselect: () => setSelected(null),
      // /dive: the return point reads and restores these (docs/features/dive-v1.md).
      getView: () => view, setView, select: id => setSelection([id]), block: id => blocksRef.current.find(block => block.id === id) || null,
      // A selected card the Tutor would read no words from (learn-tutor.js cardText reads a title and a body): a chat card, a
      // note, a reader, file or slide card, a quiz - as its title and, as body, its description, with its sources. A lesson
      // card with a title or body is block()'s.
      objectCard: id => {
        const object = objectById(id), described = object && describeObject(object);
        if (!described || (object.type && (object.title || object.body))) return null;
        return { id, title: described.title, body: described.text, ...(object.sources ? { sources: object.sources } : {}) };
      },
      // Tutor v1 (docs/features/tutor-v1-implementation-map.md §4): read the cards, and change one
      // card through a pure reducer (pager, practice), undoable like any other edit.
      blocks: () => blocksRef.current,
      updateBlock: (id, change) => {
        const current = blocksRef.current.find(block => block.id === id);
        const next = current && change(current);
        if (!next || next === current) return false;
        snapshot();
        setBlocks(previous => previous.map(block => block.id === id ? next : block));
        return true;
      },
      undo, redo, selectAll, deleteSelection, zoomFit, present: startPresenting,
      copy: copySelection,
      paste: () => !!clipboard.current?.length && pasteIds(clipboard.current),
      duplicate: () => pasteIds(selectedRef.current),
      group: groupSelection, ungroup: ungroupSelection, arrange,
      zoomIn: () => zoomCenter(1.25),
      zoomOut: () => zoomCenter(1 / 1.25),
      zoomReset: () => setView({ x: Math.max(24, (surface.current.clientWidth - COLUMN) / 2), y: 24, z: 1 }),
      // Everything inserted lands where the learner is looking: headings and
      // cards join the column at the card nearest the middle of the screen,
      // free items land at its centre, and the camera only moves if the new
      // thing would otherwise be off screen.
      insertHeading: level => revealAfter(insertHeadingAt(level, flowIndexAtView())),
      insertPdf: ({ assetKey, label }) => {
        snapshot();
        insertAtView({ id: crypto.randomUUID(), type: 'pdf', dx: 0, dy: 0, assetKey, label });
      },
      // A PDF added as slides: one block per page, in order, where the learner is looking.
      // `pdf` names the upload, so Files and the reader context follow the pages.
      insertSlides: ({ pages, label, pdf }) => {
        if (!pages.length) return;
        snapshot();
        // A divider block between consecutive pages, so a separator can be deleted on its own.
        const slides = pages.flatMap((assetKey, index) => [
          ...(index ? [{ id: crypto.randomUUID(), type: 'divider', dx: 0, dy: 0, label: `Slide ${index + 1}`, pdf }] : []),
          { id: crypto.randomUUID(), type: 'slide', dx: 0, dy: 0, assetKey, label, number: index + 1, pdf },
        ]);
        const index = flowIndexAtView();
        setBlocks(previous => [...previous.slice(0, index), ...slides, ...previous.slice(index)]);
        revealAfter(slides[0].id);
      },
      // A dropped image, GIF, or clip. `mediaId` is the server copy an image
      // context can name later; GIFs and clips never have one.
      insertFile: ({ assetKey, kind, label, mediaId = null }) => {
        snapshot();
        return insertAtView({ id: crypto.randomUUID(), type: 'file', dx: 0, dy: 0, kind, assetKey, label, ...(mediaId ? { mediaId } : {}) });
      },
      // An arXiv paper as a card: the full reader - pages, zoom, Ask selection -
      // on the canvas. One card per paper; pointing at it again turns the page.
      // `into` (here and below): the slot reserved for this card, which it takes (canvas-slots.js).
      insertPaper: ({ id, title, page = 1, into = null }) => {
        const existing = blocksRef.current.find(block => block.type === 'paper' && block.paper?.id === id);
        if (existing) {
          if ((existing.paper.page || 1) !== page) { snapshot(); setBlocks(previous => previous.map(block => block.id === existing.id ? { ...block, paper: { ...block.paper, page, selection: undefined } } : block)); }
          reuse(existing.id, into);
          return existing.id;
        }
        snapshot();
        return insertAtView({ id: crypto.randomUUID(), type: 'paper', dx: 0, dy: 0, title: title || `arXiv ${id}`, paper: { id, page } }, into);
      },
      insertNotebook: () => {
        snapshot();
        return insertAtView(newNotebookBlock());
      },
      // An imported .ipynb or .py, as the Add to canvas dialog made it (canvas-file-drop.md): at its drop point - the
      // column slot at that height - or, uploaded, where the learner is looking.
      insertImported: (block, at = null) => {
        snapshot();
        if (!at) return insertAtView(block);
        const index = flowIndexAt(at.y);
        setBlocks(previous => [...previous.slice(0, index), block, ...previous.slice(index)]);
        return revealAfter(block.id);
      },
      // A validated block from a / command (learn-slash.js).
      // A chat answer the learner puts on the canvas from the dock's sheet: a
      // finished chat card, centred like a fresh question's.
      insertChat: ({ question, answer }) => {
        snapshot(true);
        const id = crypto.randomUUID();
        seenChats.current.add(id);
        centerRef.current = id;
        onAddRef.current?.([{ id, question, answer, linkFrom: null, status: 'done', dx: 0, dy: 0 }]);
        return id;
      },
      // `after` (a block id): right after that block in the flow, ignoring the view - a journey section's steps
      // under their heading (learn-journey-materialize.js). The updater reads `previous`, so inserts chained in one
      // tick land in order.
      insertBlock: (block, { into = null, after = null } = {}) => {
        if (!alive.current) return null;
        snapshot();
        const added = { ...block, id: crypto.randomUUID(), dx: 0, dy: 0 };
        if (after == null) return insertAtView(added, into);
        perfMark(added.id, 'insert');
        setBlocks(previous => { const at = indexAfter(previous, after); return [...previous.slice(0, at), added, ...previous.slice(at)]; });
        return revealAfter(added.id);
      },
      // A skeleton where a card on its way will land (docs/features/canvas-skeleton-cards.md): the slot
      // insertAtView would use now - or the nearest one nothing drawn covers (freeSlot: a dragged card keeps its
      // offset) - the card's size (slotSize: `card` names its BLOCK_TYPES entry, `samples` the cards it can be),
      // the camera on it. Returns the slot id the card fills (insert*'s `into`); release() drops it, a no-op once filled.
      reserve: ({ label, card = null, samples = [] }) => {
        const id = `slot:${crypto.randomUUID()}`;
        const size = slotSize(card, BLOCK_TYPES, samples);
        const place = freeSlot(columnItems(), flowIndexAtView(), size, { column: COLUMN });
        const before = blocksRef.current[place.at]?.id ?? null;
        // moves: the learner's camera moves so far; once they move it, nothing about this slot moves it again.
        setSlots(previous => [...previous, { id, before, top: place.top, label, ...size, started: performance.now(), moves: manualMoves.current }]);
        cameraRef.current = { id, smooth: true, centre: true };
        return id;
      },
      release,
      insertDivider: () => {
        snapshot();
        const center = viewCenter();
        setItems(previous => [...previous, { id: crypto.randomUUID(), kind: 'section', x: center.x - DIVIDER_W / 2, y: center.y, w: DIVIDER_W, text: '' }]);
      },
      insertText: () => {
        snapshot();
        const center = viewCenter();
        setItems(previous => [...previous, { id: crypto.randomUUID(), kind: 'text', x: center.x - 210, y: center.y - 16, w: 420, text: '', color, opacity, level, fresh: true }]);
      },
      insertSticky: () => {
        snapshot();
        const center = viewCenter();
        setItems(previous => [...previous, { id: crypto.randomUUID(), kind: 'sticky', x: center.x - 80, y: center.y - 80, text: '', color, opacity, fresh: true }]);
      },
      // The Files panel's show and remove.
      // Framed once laid out (the camera effect): a card inserted this very tick is framed at its real
      // size instead of skipped for want of a measurement.
      focusBlock: id => {
        setSelection([id]);
        cameraRef.current = { id, frame: true };
      },
      // A comment's "on ..." link (docs/features/canvas-comments.md section 8): a card as focusBlock does; a shape or a
      // group selected and zoomed to.
      focusObject: id => {
        if (boundsRef.current[id]) { setSelection([id]); cameraRef.current = { id, frame: true }; return; }
        const ids = membersOf(id).length ? membersOf(id) : [id];
        setSelection(ids);
        const boxes = boxesOf(ids);
        if (boxes.length) frame(boxes, 64, 1.2);
      },
      // The Tutor's show (docs/features/canvas-skeleton-cards.md): select the card and glide it into the visible
      // area at the learner's zoom - never a fit - once it is laid out.
      // slotId: the slot this show answers; once the learner has moved the camera since it was reserved, the card is
      // only selected. A card inserted this tick already has its one correction pending (revealAfter).
      revealBlock: (id, slotId = null) => {
        setSelection([id]);
        if (revealRef.current?.id === id) return;
        cameraRef.current = { id, smooth: true, moves: slotsRef.current.find(slot => slot.id === slotId)?.moves ?? manualMoves.current };
      },
      removeBlock: id => {
        if (!blocksRef.current.some(block => block.id === id)) return;
        snapshot();
        setBlocks(previous => previous.filter(block => block.id !== id));
        setLinks(previous => previous.filter(link => link.from !== id && link.to !== id));
        setSelection(previous => previous.filter(other => other !== id));
      },
      // The block keeps only where to look, never the article: the save path
      // strips an oversized `src` and nothing else, so HTML under any other
      // field would fill the quota and take the learner's ink with it.
      insertWiki: ({ title, section = 0, into = null }) => {
        const existing = blocksRef.current.find(block => block.type === 'wiki' && block.title === title);
        if (existing) {
          // Pointed at again - by the tutor, or a second pick: the card goes
          // back to that article and section, and comes into view.
          setBlocks(previous => previous.map(block => block.id === existing.id ? { ...block, section, openNonce: (block.openNonce || 0) + 1 } : block));
          reuse(existing.id, into);
          return existing.id;
        }
        snapshot();
        return insertAtView({ id: crypto.randomUUID(), type: 'wiki', dx: 0, dy: 0, title, section }, into);
      },
      insertVideo: ({ videoId, title, channel = null, start = 0, end = null, unverified = false, momentId = null, into = null }) => {
        const existing = blocksRef.current.find(block => block.type === 'video' && block.videoId === videoId);
        if (existing) {
          // A caller with no window - the picker re-picking, or a window-less
          // re-show - must never wipe a real moment off the card. Only an
          // actual window retargets.
          const hasWindow = end != null || start > 0;
          if (hasWindow && (existing.start !== start || (existing.end ?? null) !== end)) {
            // One snapshot per retarget - a tutor pointing somewhere is a
            // deliberate act, not a scroll.
            snapshot();
            setBlocks(previous => previous.map(block => block.id === existing.id ? { ...block, start, end, unverified, momentId: momentId ?? block.momentId, accepted: undefined, ...(title ? { title } : {}) } : block));
          } else if (hasWindow) {
            // The same window again: playback may have wandered, so the show
            // still means "look here now". A nonce remounts the embed without
            // spending an undo step on a no-change edit.
            setBlocks(previous => previous.map(block => block.id === existing.id ? { ...block, momentNonce: (block.momentNonce || 0) + 1, momentId: momentId ?? block.momentId } : block));
          }
          if (into) reuse(existing.id, into);
          return existing.id;
        }
        snapshot();
        return insertAtView({ id: crypto.randomUUID(), type: 'video', dx: 0, dy: 0, videoId, title, channel, start, end, ...(unverified ? { unverified: true } : {}), ...(momentId ? { momentId } : {}) }, into);
      },
      // The divider used to live on the zoom pill; the menubar is its home now.
      toggleGrid: () => setGrid(previous => !previous),
      toggleMinimap: () => setMinimap(previous => !previous),
      // Page guides: false (off), 'portrait' or 'landscape' A4.
      setPages,
      // One snapshot for the whole restructure, so Ctrl+Z reverts the proposal
      // rather than one heading at a time.
      applyOutline: ops => { snapshot(); setBlocks(previous => applyOutlineOps(previous, ops)); },
      moveSection: (id, beforeId) => { snapshot(); setBlocks(previous => moveSection(previous, id, beforeId)); },
      toggleSectionDone: id => { snapshot(); setBlocks(previous => previous.map(block => block.id === id ? { ...block, done: !block.done } : block)); },
      // Frame the section rather than scroll to it: a section is a heading plus
      // what follows, and the camera already knows how to land on one.
      showSection: id => {
        const steps = presentSteps(blocksRef.current, boundsRef.current);
        const step = steps.find(entry => entry.ids[0] === id) || steps.find(entry => entry.ids.includes(id));
        if (step) frame(step.boxes, 64, 1.2);
      },
      // The board saved now, a shared board's push awaited (canvas-persist.js; architecture §6.5.5, LP1 Task 15): a
      // journey section is recorded only once this resolves ok. It reads boardRef, so a call after a paint that follows
      // the inserts saves them, from any canvasApi of this canvas. The debounced save above is unchanged.
      persist: () => (alive.current ? persistBoard({ state: boardRef.current, storageKey, storage: () => localStorage, onSave: onSaveRef.current }) : Promise.resolve({ ok: false })),
      toggleLock: () => setLock(previous => !previous),
      // The card thumbnail (card-thumbnails.md): this canvas's content drawn at 800 x 400 in the light theme without its
      // chrome (card-thumbnail.js CHROME, data-thumbnail-hide here), or null when it is empty.
      thumbnail: () => (alive.current && worldRef.current ? drawThumbnail(worldRef.current, thumbnailRegion(contentBoxes())) : Promise.resolve(null)),
    };
    if (apiRef) apiRef.current = commandsRef.current;
  });
  // Menu checkmarks need these as state on the page, not as a ref it cannot watch.
  const outline = outlineFrom(blocks);
  // Serialised for the comparison on the page: the outline changes whenever a
  // heading is added, retitled, reordered or ticked, and only then.
  const outlineKey = JSON.stringify(outline);
  const cardsKey = JSON.stringify(blocks.map(block => [block.id, block.pdf || block.assetKey || null, block.paper?.id || null]));
  const connectionCleanup = useRef(null);
  const boundsRef = useRef({});
  const clipboard = useRef(null);
  const markingCopy = useRef(false);
  const [canPaste, setCanPaste] = useState(false);
  // Copy works on every selected node, note and shape. The clipboard holds
  // ids, never the objects: copy then edit then paste has to produce what is
  // on the canvas now, not a snapshot taken at the moment of copy.
  const copySelection = () => {
    const picked = selectedRef.current;
    const has = list => list.some(entry => picked.includes(entry.id));
    // A connector is selectable but not copyable. Without this the clipboard
    // was wiped by a copy that captured nothing.
    if (!has(blocksRef.current) && !has(itemsRef.current) && !has(shapesRef.current) && !has(exchangesRef.current)) return false;
    clipboard.current = picked.slice();
    setCanPaste(true);
    // The system clipboard says which copy is newest: our marker there means
    // Ctrl+V pastes these cards; an image copied after it wins instead. Until
    // the write lands, a paste takes the cards.
    if (navigator.clipboard) {
      markingCopy.current = true;
      navigator.clipboard.writeText(CARDS_COPIED).catch(() => {}).finally(() => { markingCopy.current = false; });
    }
    toast(`Copied ${picked.length} item${picked.length === 1 ? '' : 's'}`);
    return true;
  };
  // Shared by Ctrl+V and the context menu's Duplicate. Ids in, fresh copies
  // out; the copy carries the latest text and position, never a snapshot.
  // Copies leave their group - a duplicate is new material, not a new member.
  const pasteIds = picked => {
    const pickedBlocks = blocksRef.current.filter(block => picked.includes(block.id));
    const pickedItems = itemsRef.current.filter(item => picked.includes(item.id));
    const pickedShapes = shapesRef.current.filter(shape => picked.includes(shape.id));
    const pickedChats = exchangesRef.current.filter(exchange => picked.includes(exchange.id));
    if (!pickedBlocks.length && !pickedItems.length && !pickedShapes.length && !pickedChats.length) return false;
    snapshot(pickedChats.length > 0);
    const step = 28;
    const fresh = [];
    // A copied notebook card gets its own workspace, seeded from the copy of its notebook.
    const copyNode = node => { const id = crypto.randomUUID(); fresh.push(id); return { ...node, id, groupId: undefined, dx: node.dx + step, dy: node.dy + step, ...(node.type === 'notebook' ? { notebook_id: crypto.randomUUID() } : {}) }; };
    const blocksCopy = pickedBlocks.map(copyNode);
    // A card copied mid-answer would never receive its stream: deltas are
    // routed by id and the copy has a new one. Settle it instead.
    const chatsCopy = pickedChats.map(node => ({ ...copyNode(node), linkFrom: null, status: 'done' }));
    const itemsCopy = pickedItems.map(item => { const id = crypto.randomUUID(); fresh.push(id); return { ...item, id, groupId: undefined, x: item.x + step, y: item.y + step, fresh: false }; });
    const shapesCopy = pickedShapes.map(shape => { const id = crypto.randomUUID(); fresh.push(id); return { ...shape, id, groupId: undefined, x1: shape.x1 + step, y1: shape.y1 + step, x2: shape.x2 + step, y2: shape.y2 + step }; });
    // Each copy lands directly after its source rather than at the end of the
    // column, where on a long canvas it was off-screen and read as nothing
    // having happened.
    if (blocksCopy.length) setBlocks(previous => {
      const next = [...previous];
      blocksCopy.forEach((copy, index) => {
        const at = next.findIndex(block => block.id === pickedBlocks[index].id);
        next.splice(at < 0 ? next.length : at + 1, 0, copy);
      });
      return next;
    });
    if (itemsCopy.length) setItems(previous => [...previous, ...itemsCopy]);
    if (shapesCopy.length) setShapes(previous => [...previous, ...shapesCopy]);
    if (chatsCopy.length) onAddRef.current?.(chatsCopy);
    setSelection(fresh);
    clipboard.current = fresh; // paste again and it stacks from the newest
    setCanPaste(true);
    return true;
  };
  const pasteIdsRef = useRef(pasteIds);
  // Pasted text lands as one text card at the view's centre, as Insert text does, already written.
  const pasteTextRef = useRef(null);
  pasteTextRef.current = text => {
    snapshot();
    const center = viewCenter();
    setItems(previous => [...previous, { id: crypto.randomUUID(), kind: 'text', x: center.x - 210, y: center.y - 16, w: 420, text: text.trim(), color, opacity, level }]);
  };
  const dropFilesRef = useRef(onDropFiles);
  dropFilesRef.current = onDropFiles;
  // Pasted code asks Code card or Jupyter notebook first (LearnPage, docs/features/repository-browser.md "Files in Learn"); without the page's
  // handler it stays a text paste.
  const pasteCodeRef = useRef(onPasteCode);
  pasteCodeRef.current = onPasteCode;
  pasteIdsRef.current = pasteIds;
  const shapesRef = useRef([]);
  const onAddRef = useRef(null);
  const selectedRef = useRef([]);
  selectedRef.current = selection;
  const everything = () => [...blocksRef.current, ...itemsRef.current, ...shapesRef.current, ...exchangesRef.current];
  const groupOf = id => everything().find(entry => entry.id === id)?.groupId || null;
  const membersOf = gid => everything().filter(entry => entry.groupId === gid).map(entry => entry.id);
  // groupId: undefined rather than a delete, so one map covers set and clear;
  // JSON drops undefined keys on save.
  const setGroupIds = (ids, gid) => {
    const patch = entry => (ids.includes(entry.id) ? { ...entry, groupId: gid || undefined } : entry);
    setBlocks(previous => previous.map(patch));
    setItems(previous => previous.map(patch));
    setShapes(previous => previous.map(patch));
    onRestoreRef.current?.(previous => previous.map(patch));
  };
  const groupSelection = () => {
    const ids = selectedRef.current;
    if (ids.length < 2) return;
    snapshot(ids.some(id => exchangesRef.current.some(exchange => exchange.id === id)));
    const gid = crypto.randomUUID();
    setGroupIds(ids, gid);
    setGroups(previous => [...previous, { id: gid, label: '' }]);
  };
  const ungroupSelection = () => {
    const gids = new Set(selectedRef.current.map(groupOf).filter(Boolean));
    if (!gids.size) return;
    const members = everything().filter(entry => gids.has(entry.groupId)).map(entry => entry.id);
    snapshot(exchangesRef.current.some(exchange => gids.has(exchange.groupId)));
    setGroupIds(members, null);
    setGroups(previous => previous.filter(group => !gids.has(group.id)));
  };
  const boxesOf = ids => {
    const boxes = [];
    for (const id of ids) {
      const box = boundsRef.current[id];
      if (box) { boxes.push(box); continue; }
      const shape = shapesRef.current.find(entry => entry.id === id);
      if (shape) { boxes.push({ x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2), w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) }); continue; }
      const node = itemsLayer.current?.querySelector(`[data-item-id="${id}"]`);
      if (node) boxes.push({ x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight });
    }
    return boxes;
  };
  // Arrange: line the selection up on an edge or a centre, or space it evenly.
  // A group moves as one piece - unless it is the whole selection, when its
  // members line up among themselves. Every move goes through `shift`, so each
  // kind moves the way a drag moves it, free of the card bands like a group.
  const arrangeUnits = ids => {
    const gids = new Set(ids.map(groupOf));
    const whole = gids.size === 1 && !gids.has(null);
    const units = new Map();
    for (const id of ids) {
      const key = whole ? id : groupOf(id) || id;
      units.set(key, [...(units.get(key) || []), id]);
    }
    return [...units.values()].map(members => {
      const boxes = boxesOf(members);
      if (!boxes.length) return null; // a connector has no box to line up
      const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
      return { members, x, y, w: Math.max(...boxes.map(box => box.x + box.w)) - x, h: Math.max(...boxes.map(box => box.y + box.h)) - y };
    }).filter(Boolean);
  };
  const arrange = how => {
    const units = arrangeUnits(selectedRef.current);
    const spread = how === 'spread-x' || how === 'spread-y';
    if (units.length < (spread ? 3 : 2)) return;
    snapshot(units.some(unit => unit.members.some(id => exchangesRef.current.some(exchange => exchange.id === id))));
    const left = Math.min(...units.map(unit => unit.x)), top = Math.min(...units.map(unit => unit.y));
    const right = Math.max(...units.map(unit => unit.x + unit.w)), bottom = Math.max(...units.map(unit => unit.y + unit.h));
    const moves = [];
    if (spread) {
      // Equal gaps between neighbours; the first and last stay put.
      const across = how === 'spread-x';
      const start = unit => (across ? unit.x : unit.y), size = unit => (across ? unit.w : unit.h);
      const sorted = [...units].sort((a, b) => start(a) - start(b));
      const gap = ((across ? right - left : bottom - top) - sorted.reduce((sum, unit) => sum + size(unit), 0)) / (sorted.length - 1);
      let at = across ? left : top;
      for (const unit of sorted) { moves.push([unit, across ? at - unit.x : 0, across ? 0 : at - unit.y]); at += size(unit) + gap; }
    } else {
      const to = {
        left: unit => [left - unit.x, 0],
        center: unit => [(left + right) / 2 - (unit.x + unit.w / 2), 0],
        right: unit => [right - (unit.x + unit.w), 0],
        top: unit => [0, top - unit.y],
        middle: unit => [0, (top + bottom) / 2 - (unit.y + unit.h / 2)],
        bottom: unit => [0, bottom - (unit.y + unit.h)],
      }[how];
      for (const unit of units) moves.push([unit, ...to(unit)]);
    }
    for (const [unit, ddx, ddy] of moves) if (ddx || ddy) shift(ddx, ddy, unit.members, true);
  };
  const zoomToSelection = () => { const boxes = boxesOf(selectedRef.current); if (boxes.length) frame(boxes, 64, 1.2); };
  const presentFrom = id => {
    const steps = presentSteps(blocksRef.current, boundsRef.current);
    const index = steps.findIndex(entry => entry.ids[0] === id || entry.ids.includes(id));
    if (index < 0) return;
    stepsRef.current = steps;
    setSelected(null);
    showStep(index);
  };
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const surface = useRef(null);
  const gutter = useRef(null), shell = useRef(null), bottomStrip = useRef(null);
  // The floating strip's side columns, as CSS lengths on the shell from its bottom edge: the Voice caption sits above the
  // left one (--chrome-left), the tools' gutter pads its side's one (--chrome-left / --chrome-right).
  useLayoutEffect(() => {
    const strip = bottomStrip.current, host = shell.current;
    if (!strip || !host || typeof ResizeObserver === 'undefined') return undefined;
    const sync = () => {
      const bottom = host.getBoundingClientRect().bottom;
      host.style.setProperty('--chrome-left', `${Math.max(0, bottom - strip.firstElementChild.getBoundingClientRect().top)}px`);
      host.style.setProperty('--chrome-right', `${Math.max(0, bottom - strip.lastElementChild.getBoundingClientRect().top)}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    for (const column of strip.children) observer.observe(column);
    observer.observe(host);
    return () => observer.disconnect();
  }, [presenting]);
  const [shellWidth, setShellWidth] = useState(0);
  // null follows the width (open from 1400px of canvas); a click makes it the learner's choice.
  const [overview, setOverview] = useState(null);
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
  // Move the camera only if the card is not in the visible area - one in view stays put - and never the zoom.
  const bringIntoView = id => showBox(boundsRef.current[id]);
  const showBox = (box, smooth = false, centre = false) => {
    if (!box || !surface.current) return false;
    // Both axes: after a sideways pan the column is off to one side, and a
    // card inserted into it landed off screen.
    const current = viewRef.current, area = visibleArea(), first = panInto(box, current, area, centre);
    // The floating bottom chrome over the card's span is a floor too (24: freeArea's margin).
    const floor = chromeTop(first.x + box.x * current.z, first.x + (box.x + box.w) * current.z) - 24;
    const next = floor < area.bottom ? panInto(box, current, { ...area, bottom: Math.max(area.top + 1, floor) }, centre) : first;
    if (next.x === current.x && next.y === current.y) return true;
    if (smooth) setGlide(true);
    autoView.current = next;
    setView(next);
    return true;
  };
  // The floating bottom strip's controls over a span of the surface (surface px; owner, 2026-10-08: "in the canvas above
  // the chat composer you are cutting the canvas too much"): the top of the highest one there, else the surface's
  // height. Fit, focus and a new card's reveal stop above it; panning still brings anything out from under it.
  // A control without a box of its own (the composer's display: contents root) counts by its children.
  const boxesIn = node => { const rect = node.getBoundingClientRect(); return rect.width || rect.height ? [rect] : [...node.children].flatMap(boxesIn); };
  const chromeTop = (x0, x1) => {
    const at = surface.current.getBoundingClientRect();
    return Math.min(at.height, ...[...(shell.current?.querySelectorAll('[data-canvas-bottom] > * > *') || [])].flatMap(boxesIn)
      .filter(rect => rect.width && rect.height && rect.left - at.left < x1 && rect.right - at.left > x0)
      .map(rect => rect.top - at.top));
  };
  // What the learner can see of the surface: less what floats over it - the chat sheet above the composer, the
  // Voice caption, the page's contents rail (edgeInset) - and a margin (canvas-slots.js freeArea).
  const visibleArea = () => {
    const frame = surface.current.getBoundingClientRect();
    const overlays = [...(shell.current?.querySelectorAll('[data-chat-sheet], [data-voice-rail] > *') || [])]
      .map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height)
      .map(rect => ({ left: rect.left - frame.left, top: rect.top - frame.top, right: rect.right - frame.left, bottom: rect.bottom - frame.top }));
    if (edgeInset) overlays.push({ left: frame.width - edgeInset, top: 0, right: frame.width, bottom: frame.height });
    return freeArea({ w: frame.width, h: frame.height }, overlays);
  };
  // A new card's one correction (revealAfter), once its measured box has been still for SETTLE_MS - an animation
  // card measures its controls a frame or two after mount - or REVEAL_MS after the insert at the latest; never
  // after the learner has moved the camera.
  useEffect(() => {
    const want = revealRef.current;
    if (!want || !boundsRef.current[want.id]) return;
    clearTimeout(want.timer);
    want.timer = setTimeout(() => {
      if (revealRef.current !== want) return;
      revealRef.current = null;
      if (manualMoves.current === want.moves) bringIntoView(want.id);
    }, Math.max(0, Math.min(SETTLE_MS, want.until - performance.now())));
  }, [bounds]); // eslint-disable-line react-hooks/exhaustive-deps
  // A camera move that waits for its target to be laid out (cameraRef { id, frame, smooth }): a reserved
  // slot or a Tutor card comes into the visible area at the learner's zoom, a Files-panel card is framed.
  // Read from the DOM after the commit that placed it, so a card inserted, or a slot dropped, this very
  // tick is seen where it really is.
  const cameraRef = useRef(null);
  // ponytail: only the world transform glides; the grid backdrop (when on) jumps. Transition its
  // background-position too if that shows.
  const [glide, setGlide] = useState(false);
  useEffect(() => { if (!glide) return undefined; const timer = setTimeout(() => setGlide(false), 250); return () => clearTimeout(timer); }, [glide]);
  useLayoutEffect(() => {
    const want = cameraRef.current;
    if (!want) return;
    const element = [...(column.current?.querySelectorAll('[data-block-id],[data-slot-id]') || [])].find(node => (node.dataset.blockId || node.dataset.slotId) === want.id);
    const owner = exchangesRef.current.find(item => item.id === want.id) || blocksRef.current.find(item => item.id === want.id) || slotsRef.current.find(item => item.id === want.id);
    if (!element) { if (!owner) cameraRef.current = null; return; } // not drawn yet; a target that is gone is dropped
    cameraRef.current = null;
    if (want.moves != null && want.moves !== manualMoves.current) return; // the learner moved the camera since
    const box = { x: element.offsetLeft + (owner?.dx || 0), y: element.offsetTop + (owner?.dy || 0), w: element.offsetWidth, h: element.offsetHeight };
    // A slot or a Tutor card glides there (200ms, none under reduced motion); a Files-panel card is framed at once, as before.
    if (want.frame) frame([box], 64, 1); else showBox(box, want.smooth, want.centre);
  });
  // The slot a card on its way was given goes (a no-op once a card filled it, or after this canvas closed).
  const release = id => setSlots(previous => previous.some(slot => slot.id === id) ? previous.filter(slot => slot.id !== id) : previous);
  // A card already on the canvas answers a slot reserved for it: the slot goes, and the card comes into
  // view once the column has closed up. Without a slot, as before.
  const reuse = (id, into) => {
    const slot = slotsRef.current.find(entry => entry.id === into);
    if (!slot) return bringIntoView(id);
    release(into);
    cameraRef.current = { id, smooth: true, moves: slot.moves };
    return true;
  };
  shapesRef.current = shapes;
  onAddRef.current = onAdd;
  useLayoutEffect(measureBlocks, [exchanges, blocks, slots, measureBlocks]);
  // What Edit and Arrange can act on right now, so their rows grey out
  // instead of doing nothing.
  const selectedCount = selection.length;
  const units = selectedCount > 1 ? arrangeUnits(selection).length : selectedCount;
  const grouped = selection.some(id => groupOf(id));
  // The one selected lesson card, for /dive and Ctrl+K; and how many canvas objects exist (dive.js canvasObjects), for a hole's first object.
  const soleCard = selection.length === 1 ? blocks.find(block => block.id === selection[0]) : null;
  // A whole group selected is one origin too, so loose shapes dive only once they are grouped.
  const selectedGroup = !soleCard && selection.length > 1 && groups.find(group => {
    const members = [...blocks, ...items, ...shapes, ...exchanges].filter(entry => entry.groupId === group.id).map(entry => entry.id);
    return members.length === selection.length && members.every(id => selection.includes(id));
  });
  const card = soleCard ? { id: soleCard.id, title: soleCard.title || describeBlock(soleCard)?.title || '' }
    : selectedGroup ? { id: selectedGroup.id, title: selectedGroup.label || `${selection.length} items` } : null;
  const cardKey = JSON.stringify(card), content = canvasObjects({ blocks, exchanges, strokes, shapes, items, areas });
  // Practice attempts committed on this canvas (every card's attemptLog): a Professor Next Steps basis trigger (contract §1.7).
  const attempts = blocks.reduce((sum, block) => sum + (block.attemptLog?.length || 0), 0);
  useEffect(() => { onState?.({ grid, lock, minimap, pages, presenting: presenting !== null, outline: JSON.parse(outlineKey), cards: JSON.parse(cardsKey), selected: selectedCount, units, grouped, canPaste, card: JSON.parse(cardKey), content, attempts }); }, [grid, lock, minimap, pages, presenting, outlineKey, cardsKey, selectedCount, units, grouped, canPaste, cardKey, content, attempts, onState]);
  useEffect(() => () => connectionCleanup.current?.(), []);
  // Deleting is a command as well as a key, so it lives outside the key handler.
  const deleteSelection = () => {
    const ids = selectedRef.current;
    if (!ids.length) return;
    const chats = ids.filter(id => exchangesRef.current.some(exchange => exchange.id === id));
    snapshot(chats.length > 0);
    // Selected nodes delete with their attached connections.
    for (const id of chats) onDeleteRef.current?.(id);
    const nodes = new Set([...chats, ...ids.filter(id => blocksRef.current.some(block => block.id === id) || shapesRef.current.some(shape => shape.id === id))]);
    setBlocks(previous => previous.filter(block => !ids.includes(block.id)));
    setItems(previous => previous.filter(item => !ids.includes(item.id)));
    setShapes(previous => previous.filter(shape => !ids.includes(shape.id)));
    setLinks(previous => previous.filter(link => !ids.includes(link.id) && !nodes.has(link.from) && !nodes.has(link.to)));
    setSelection([]);
  };
  const presentingRef = useRef(null);
  // Present mode's laser pointer: on by default, L or the bar's Laser toggles it.
  const [laser, setLaser] = useState(true);
  const laserRef = useRef(setLaser);
  presentingRef.current = presenting;
  const deleteSelectionRef = useRef(deleteSelection);
  deleteSelectionRef.current = deleteSelection;
  // Undo and redo: snapshot the artifact lists before every mutating gesture.
  // ponytail: single-level lists + 100-step cap; both stacks die with the tab.
  const present = useRef(null);
  present.current = { strokes, shapes, items, links, blocks };
  const history = useRef([]);
  const future = useRef([]);
  // withExchanges captures the chat blocks too, so deleting a block undoes.
  const capture = (withExchanges = false) => ({ ...present.current, ...(withExchanges ? { exchanges: exchangesRef.current } : {}) });
  const snapshot = (withExchanges = false) => {
    history.current.push(capture(withExchanges));
    if (history.current.length > 100) history.current.shift();
    // A fresh gesture is a new branch, so anything redone is no longer reachable.
    future.current = [];
  };
  const restore = state => {
    setStrokes(state.strokes); setShapes(state.shapes); setItems(state.items); setLinks(state.links); setBlocks(state.blocks); setSelected(null);
    if (state.exchanges) onRestoreRef.current?.(state.exchanges);
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    // Carry the exchange list onto the redo entry whenever the step it undoes
    // held one, or redoing a deleted chat card would not bring it back.
    future.current.push(capture(!!previous.exchanges));
    restore(previous);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(capture(!!next.exchanges));
    restore(next);
  };
  useEffect(() => { setView(v => (autoView.current = { ...v, x: Math.max(24, (surface.current.clientWidth - COLUMN) / 2) })); }, []);
  // Wheel pans the world; ctrl/cmd+wheel zooms at the cursor. Non-passive so
  // the page behind the canvas does not scroll. Empty space in the tools'
  // gutter pans too, so the gutter is no dead zone; its controls, menus and
  // scrolling strips keep their own wheel.
  useEffect(() => {
    const element = surface.current, rail = gutter.current;
    const railWheel = event => {
      if (event.target.closest?.('[role="toolbar"],[role="menu"],[role="group"],[aria-label="Canvas overview"],button,input')) return;
      wheel(event);
    };
    const wheel = event => {
      // Scrollable card bodies keep native wheel scrolling.
      if (!(event.ctrlKey || event.metaKey) && event.target.closest?.('[data-scroll]')) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) zoomAt(event.clientX - box.left, event.clientY - box.top, Math.exp(-event.deltaY * 0.002));
      else setView(v => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    rail?.addEventListener('wheel', railWheel, { passive: false });
    return () => { element.removeEventListener('wheel', wheel); rail?.removeEventListener('wheel', railWheel); };
  }, [presenting === null]);
  // The canvas's own width decides whether the overview opens by default: on a
  // wide canvas it sits beside the tools, anywhere narrower it starts collapsed.
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setShellWidth(entry.contentRect.width));
    observer.observe(shell.current);
    return () => observer.disconnect();
  }, []);
  // Delete/Backspace removes the selected sticky, text or shape; ctrl+z
  // undoes the last canvas gesture — both stand down while typing.
  useEffect(() => {
    const key = event => {
      // Cards take the keyboard on any board (docs/features/canvas-card-selection.md): Space selects the focused card;
      // Enter opens it - or the one selected card while nothing else holds the focus. Presenting keeps both keys.
      const focusedCard = document.activeElement?.matches?.('[data-block-id]') ? document.activeElement.dataset.blockId : null;
      if (presentingRef.current === null && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        if (event.key === ' ' && focusedCard) { event.preventDefault(); if (!selectedRef.current.includes(focusedCard)) selectRef.current(focusedCard); return; }
        const idle = !document.activeElement || document.activeElement === document.body;
        const target = event.key === 'Enter' && (focusedCard || (idle && selectedRef.current.length === 1 ? selectedRef.current[0] : null));
        if (target && openCardRef.current.can(target)) {
          event.preventDefault();
          if (!selectedRef.current.includes(target)) selectRef.current(target);
          openCardRef.current.open(target, 'learner_enter');
          return;
        }
      }
      // C (docs/features/canvas-comments.md, Q14; owner 2026-10-08): comment on the selected or focused object, on any board
      // where you may comment; with nothing selected it does nothing. It stands down while typing, inside an embedded editor or widget (focus
      // inside a card), in a dialog or the composer, with Ctrl, Alt or Meta held (Ctrl+C still copies), and while presenting.
      const held = document.activeElement;
      const busy = held && held !== document.body && (held.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME'].includes(held.tagName) || typingIn(held)
        || (!!held.closest?.('[data-block-id]') && !held.matches('[data-block-id]')) || !!held.closest?.('[data-chat-composer],[data-comments-panel],[role="dialog"],[role="menu"]'));
      if ((event.key === 'c' || event.key === 'C') && !event.ctrlKey && !event.metaKey && !event.altKey && commentKeyRef.current && presentingRef.current === null && !busy
        && commentKeyRef.current(focusedCard ? [focusedCard] : selectedRef.current)) {
        event.preventDefault();
        return;
      }
      // A picked comment pin: Enter opens its thread, Del or Backspace deletes it, Esc lets go - with C's guards, so typing
      // in an input, the composer or a dialog never reaches it.
      if (pinKeyRef.current && ['Enter', 'Delete', 'Backspace', 'Escape'].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !busy) {
        event.preventDefault();
        pinKeyRef.current(event.key);
        return;
      }
      // A view-only board: Esc puts the hand back, and lets go of the selected card
      // (and its pill above the shared composer, owner 2026-10-08) unless it is pressed in the composer, as below.
      if (readOnlyRef.current) {
        if (event.key === 'Escape') {
          setTool('hand');
          const focused = document.activeElement;
          if (!(focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA'))) setSelected(null);
        }
        return;
      }
      // Presenting owns the keyboard: a walk, not an editing surface.
      if (presentingRef.current !== null) {
        if (event.key === 'Escape') { event.preventDefault(); stopPresentingRef.current(); return; }
        if ([' ', 'ArrowRight', 'ArrowDown', 'PageDown', 'Enter'].includes(event.key)) { event.preventDefault(); showStepRef.current(presentingRef.current + 1); return; }
        if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); showStepRef.current(presentingRef.current - 1); return; }
        if (event.key === 'l' || event.key === 'L') { event.preventDefault(); laserRef.current(on => !on); return; }
        return;
      }
      // Esc is the way home from anywhere: back to the pointer, nothing armed,
      // nothing half-done. A text box being typed in commits and lets go.
      if (event.key === 'Escape') {
        const focused = document.activeElement;
        // Esc in the composer (or any field off the canvas) is that field's - closing its / menu, say: the selected
        // card, which is the question's context, stays.
        const offCanvasField = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA') && !focused.closest('[data-item-id],[data-block-id],[data-shape-id]');
        connectionCleanup.current?.(); setConnecting(null); if (!offCanvasField) setSelected(null);
        setTool('select'); setMenuAt(null); setStyleOpen(null); releaseSketchRef.current();
        // An equation being edited finishes the same way, from its field or its LaTeX source.
        if ((focused?.isContentEditable || focused?.closest?.('[data-equation-editor]')) && focused.closest('[data-item-id],[data-block-id],[data-shape-id],[data-connection]')) focused.blur();
        return;
      }
      const active = document.activeElement;
      const typing = typingIn(active);
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        if (typing) return;
        event.preventDefault();
        undo();
        return;
      }
      // Redo answers to both spellings: Ctrl+Y on Windows, Ctrl+Shift+Z elsewhere.
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
        if (typing) return;
        event.preventDefault();
        redo();
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      // While a sketch is the draw target, the canvas's select-all, duplicate, group and copy stand down: they
      // would reach the canvas's things from inside the sketch. Delete reaches the sketch's own selection only.
      if (drawTargetRef.current) {
        if (mod && ['a', 'd', 'g', 'c'].includes(event.key.toLowerCase())) return;
        if ((event.key === 'Delete' || event.key === 'Backspace') && !typing) deleteSketchSelectionRef.current();
        if (event.key === 'Delete' || event.key === 'Backspace') return;
      }
      const commands = commandsRef.current;
      // The rest of the Edit and View menus, each standing down while typing
      // so text fields keep their own select-all and the browser keeps its
      // zoom there. Ctrl+D and Ctrl+G would otherwise bookmark and find.
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'a') { if (typing) return; event.preventDefault(); commands.selectAll(); return; }
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'd') { if (typing || !selectedRef.current.length) return; event.preventDefault(); commands.duplicate(); return; }
      if (mod && event.key.toLowerCase() === 'g') { if (typing) return; event.preventDefault(); (event.shiftKey ? commands.ungroup : commands.group)(); return; }
      if (mod && ['=', '+', '-', '_'].includes(event.key)) { if (typing) return; event.preventDefault(); (event.key === '-' || event.key === '_' ? commands.zoomOut : commands.zoomIn)(); return; }
      if (!mod && event.shiftKey && (event.code === 'Digit1' || event.code === 'Digit0')) { if (typing) return; event.preventDefault(); (event.code === 'Digit1' ? commands.zoomFit : commands.zoomReset)(); return; }
      if (mod && event.key.toLowerCase() === 'c') {
        // Only a real text selection should defer to the browser. Testing the
        // document for any selection at all let a stray highlight anywhere on
        // the page silently kill the copy.
        const text = window.getSelection();
        if (typing || !selectedRef.current.length || (text && !text.isCollapsed && text.toString())) return;
        if (commands.copy()) event.preventDefault();
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (typing) return;
      deleteSelectionRef.current();
    };
    // Capture phase: several lesson blocks stop keydown on their own container
    // (an embedded graph, a chart, a 3D view), which otherwise kills copy,
    // paste, undo and delete for the whole canvas while one is focused.
    // Ctrl+V (canvas-paste.js): a copied image becomes an image card, like a dropped one; text copied anywhere else
    // becomes a text card (owner, 2026-10-08); the canvas's own copied cards paste while their marker is on the clipboard.
    const paste = event => {
      const active = document.activeElement;
      if (typingIn(active)) return;
      const data = event.clipboardData;
      const images = [...(data?.files || [])].filter(file => file.type.startsWith('image/'));
      const text = data?.getData('text/plain') || '';
      // ponytail: if writing the marker failed, an image copied before the cards still wins.
      const code = !!pasteCodeRef.current && (!!copiedCode(() => sessionStorage, text) || looksLikeCode(text));
      const kind = pasteKind({ images: dropFilesRef.current ? images.length : 0, text, marker: CARDS_COPIED, copying: markingCopy.current, cards: clipboard.current?.length || 0, code });
      if (kind === 'image') { event.preventDefault(); dropFilesRef.current(images); return; }
      if (kind === 'cards' && pasteIdsRef.current(clipboard.current)) { event.preventDefault(); return; }
      if (kind === 'code') { event.preventDefault(); pasteCodeRef.current(text); return; }
      if (kind === 'text') { event.preventDefault(); pasteTextRef.current(text); }
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('paste', paste, true);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('paste', paste, true); };
  }, []);
  // The Ask-in-chat button on a selected block arms the dock composer with
  // that block as context; plain selection stays just a selection. The armed
  // text is a getter the composer resolves AT SEND, reading the block as it
  // is then - a learner who changes an input after arming still sends the
  // state they can see, and a deleted block says so instead of silently
  // becoming a question about something else.
  // The selected object by id - a lesson card, a chat card or a note - and what it is (describeBlock, else
  // learn-ask-target.js describeCanvasObject for the chat, note, reader and file cards).
  const objectById = id => blocksRef.current.find(entry => entry.id === id) || exchangesRef.current.find(entry => entry.id === id) || itemsRef.current.find(entry => entry.id === id) || null;
  const describeObject = object => describeBlock(object) || describeCanvasObject(object);
  const liveAskText = (id, armed) => () => {
    const current = objectById(id);
    const described = current && describeObject(current);
    return described?.text ?? `${armed.text}${String.fromCharCode(10)}[Warning: this block was deleted from the canvas after the question was attached; the state above is the last one the learner saw.]`;
  };
  // Continue convo on an answer linked from a card: that card rides the first follow-up.
  const linkedTarget = exchange => {
    const block = exchange.linkFrom && blocksRef.current.find(entry => entry.id === exchange.linkFrom);
    const described = block && describeBlock(block);
    return described ? { id: block.id, ...described } : null;
  };
  // The block armed through armTarget; region and group targets clear it, so
  // the re-arm below never swaps them for a plain card description.
  const armedId = useRef(null);
  // The card the learner explicitly asked about (Ask in chat): its answer lands as a card linked to it, as before.
  // A card only selected rides as context and its answer lands where any question's does (ask.jsx panelAsk).
  const askedId = useRef(null);
  const armTarget = block => {
    const described = describeObject(block);
    if (!described) return false;
    armedId.current = block.id;
    // card: a selected card's context (the strip above the composer), kept after a send; context: its identities.
    const card = { card: true, asked: askedId.current === block.id, context: { ...selectedCardContext(block, described.title), material_type: block.type || described.material } };
    // A slide sends the slide itself: its page of the uploaded PDF, read by the model as the
    // reader's pages are (paper_context). The thumbnail only shows on the chip.
    if (block.type === 'slide') {
      const target = { id: block.id, ...described, ...card, paper: { id: String(block.pdf || '').slice('pdf:'.length), page: block.number } };
      onAskTargetRef.current?.(target);
      loadAsset(block.assetKey).then(blob => {
        if (!blob || armedId.current !== block.id) return;
        const reader = new FileReader();
        reader.onload = () => { if (armedId.current === block.id) onAskTargetRef.current?.({ ...target, preview: reader.result }); };
        reader.readAsDataURL(blob);
      }).catch(() => { /* the chip just has no thumbnail */ });
      return true;
    }
    // A getter, not a function value: every reader (canvas_target, / commands)
    // still gets a string, resolved when it is read at send.
    const live = liveAskText(block.id, described);
    onAskTargetRef.current?.({ id: block.id, ...described, ...card, get text() { return live(); } });
    return true;
  };
  // Ask in chat and the menu's Ask about this: the card becomes the target and a ready question waits in the composer.
  const askBlock = block => {
    askedId.current = block.id;
    if (armTarget(block)) askDraft(cardQuestion(describeObject(block)?.title));
  };
  // Selecting a card is choosing what the next question is about (docs/features/canvas-card-selection.md): the one
  // selected card sets the composer's context strip - the same target Ask in chat arms, never a second chip - and a
  // selection that moves off it (blank canvas, Esc, another object) takes the strip with it. A region, area or group
  // target is left alone: it was armed on purpose and has its own way out.
  // Any kind of card (owner, 2026-10-08): a lesson card, a chat card, a note, a reader or file card; on a view-only
  // board too, where the shared composer takes the pill (SharedBoardPage.jsx). A shape or a divider has none.
  const selectionArmed = useRef(null);
  useEffect(() => {
    if (askedId.current !== selected) askedId.current = null;
    const object = selected ? objectById(selected) : null;
    if (object && armTarget(object)) { selectionArmed.current = object.id; return; }
    const was = selectionArmed.current;
    selectionArmed.current = null;
    if (was && askTargetId === was && armedId.current === was) { armedId.current = null; onAskTargetRef.current?.(null); }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  // Open (card-open.js): the card's reader, else its Rabbit Hole - entered, or made first.
  const opensFor = id => openTarget(blocksRef.current.find(entry => entry.id === id), { portal: divePortals?.portals?.[id], dive: !!divePortals?.open, readers: !!onCardActionRef.current });
  const openCard = (id, via) => {
    const target = opensFor(id);
    if (!target) return false;
    if (target.kind === 'reader') onCardActionRef.current(target.action, target.payload);
    else if (target.kind === 'external') window.open(target.url, '_blank', 'noopener');
    else if (target.kind === 'enter') divePortals.enter(target.name);
    else divePortals.open(id, undefined, via);
    return true;
  };
  const cardOpen = { single: readOnly ? null : selected, can: opensFor, open: openCard };
  const openCardRef = useRef(cardOpen);
  openCardRef.current = cardOpen;
  // Keep the armed chip's label honest while the learner keeps experimenting:
  // a changed input re-arms the same target with its fresh description, and a
  // deleted target flips to a visible warning rather than being dropped.
  const lastArmed = useRef(null);
  // A group's chip goes with the group: deleted or ungrouped, nothing is left to ask about.
  const armedGroup = useRef(null);
  useEffect(() => {
    if (!askTargetId || askTargetId !== armedGroup.current) return;
    if ([...blocks, ...items, ...shapes, ...exchanges].filter(entry => entry.groupId === askTargetId).length >= 2) return;
    armedGroup.current = null;
    onAskTargetRef.current?.(null);
  }, [blocks, items, shapes, exchanges, askTargetId]);
  useEffect(() => {
    if (!askTargetId || askTargetId !== armedId.current) { lastArmed.current = null; return; }
    const current = blocks.find(entry => entry.id === askTargetId) || exchanges.find(entry => entry.id === askTargetId) || items.find(entry => entry.id === askTargetId);
    // Untouched blocks keep their identity through every setBlocks map, so a
    // same-reference armed block means nothing about IT changed - re-arming
    // then would re-render the composer once per frame of an unrelated drag.
    if (current) {
      if (lastArmed.current === current) return;
      lastArmed.current = current;
      // A slide never changes what it shows, so moving it does not re-send its picture.
      if (current.type !== 'slide') armTarget(current);
      return;
    }
    if (lastArmed.current === 'removed') return;
    lastArmed.current = 'removed';
    onAskTargetRef.current?.({
      id: askTargetId, kind: 'Removed block', title: 'This block was deleted from the canvas',
      text: 'The lesson card this question was attached to was deleted from the canvas before the question was sent.',
    });
  }, [blocks, exchanges, items, askTargetId]);
  // A red region drawn on a paper page arms the composer with its thumbnail
  // and the page context, so the answer node links back to that paper block.
  const askRegion = (block, selection) => {
    armedId.current = null;
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
      // The server validates selection.region and reads selection.preview for the
      // crop it shows the model (paperSelectionImage). The sibling `preview`
      // above is the composer's thumbnail, a different field - without this one
      // asking about a marked region failed before it reached the model.
      paper: { id: block.paper.id, page: block.paper.page, selection: { region: selection.region, preview: selection.preview } },
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
      const linkedArea = areaById(exchange.linkFrom);
      const source = bounds[exchange.linkFrom] || (linkedArea && areaBox(linkedArea)), own = bounds[exchange.id];
      if (!source || !own) continue; // wait for both to be measured
      autoLinked.current.add(exchange.id);
      if (exchange.status === 'done') autoSettled.current.add(exchange.id);
      // An asked-about area's answer goes beside what the area sits on (a slide, a card), on the
      // nearer side and a little above the area, never over it; a card's answer goes under it.
      const area = String(exchange.linkFrom).startsWith('area:') ? source : null;
      let x = source.x + (source.w - own.w) / 2, y = source.y + source.h + 28, sides = ['bottom', 'top'];
      if (area) {
        const under = Object.entries(bounds).filter(([id, b]) => id !== exchange.id && b.x < area.x + area.w && b.x + b.w > area.x && b.y < area.y + area.h && b.y + b.h > area.y).map(([, b]) => b);
        const left = Math.min(area.x, ...under.map(b => b.x)), right = Math.max(area.x + area.w, ...under.map(b => b.x + b.w));
        const toRight = area.x + area.w / 2 >= (left + right) / 2;
        x = toRight ? right + 48 : left - 48 - own.w;
        y = area.y - 24;
        sides = toRight ? ['right', 'left'] : ['left', 'right'];
      }
      // Push below any node whose box would overlap this one.
      const others = Object.entries(bounds).filter(([id]) => id !== exchange.id && id !== exchange.linkFrom).map(([, box]) => box).sort((a, b) => a.y - b.y);
      for (let pass = 0; pass < 8; pass++) {
        const hit = others.find(box => x < box.x + box.w && x + own.w > box.x && y < box.y + box.h && y + own.h > box.y);
        if (!hit) break;
        y = hit.y + hit.h + 24;
      }
      const flowX = own.x - exchange.dx, flowY = own.y - exchange.dy;
      onMove(exchange.id, x - flowX, y - flowY);
      if (centerRef.current === exchange.id) { centerRef.current = null; centerOn({ x, y, w: own.w, h: own.h }); }
      if (!present.current.links.some(link => link.from === exchange.linkFrom && link.to === exchange.id)) {
        setLinks(previous => [...previous, { id: crypto.randomUUID(), from: exchange.linkFrom, fromSide: sides[0], to: exchange.id, toSide: sides[1], ...(area ? { route: 'curve' } : {}), color: area ? '#dc2626' :LINK_COLORS[blocksRef.current.find(block => block.id === exchange.linkFrom)?.type] || '#2383e2' }]);
      }
    }
  }, [exchanges, bounds, areas]);
  // A new question's card lands in the middle of the view, once: chat cards
  // sit at the top of the column, so following the column's bottom left the
  // new card off screen above. Nothing pans while the answer streams, and a
  // board opening with chats, undo or pasted copies never pans (only a fresh
  // ask arrives 'thinking'). An asked-about card's answer is centred after
  // the auto-link above parks it under its source.
  const centerRef = useRef(null);
  const seenChats = useRef(null);
  if (!seenChats.current) seenChats.current = new Set(exchanges.map(exchange => exchange.id));
  const centerOn = box => {
    const element = surface.current;
    if (!element) return;
    // An open chat sheet covers the lower part of the view: centre above it.
    // The shell, not the surface's parent: the tools gutter wraps the surface in its own row.
    const sheet = (shell.current || element.parentElement)?.querySelector('[data-chat-sheet]')?.getBoundingClientRect();
    const open = sheet?.height ? Math.max(120, sheet.top - element.getBoundingClientRect().top) : element.clientHeight;
    // The canvas's own move, not the learner's (autoView); above the floating chrome over the card too.
    setView(v => {
      const x = element.clientWidth / 2 - (box.x + box.w / 2) * v.z;
      const h = Math.max(120, Math.min(open, chromeTop(x + box.x * v.z, x + (box.x + box.w) * v.z)));
      return (autoView.current = { ...v, x, y: h / 2 - (box.y + Math.min(box.h, h / v.z) / 2) * v.z });
    });
  };
  useEffect(() => {
    for (const exchange of exchanges) {
      if (seenChats.current.has(exchange.id)) continue;
      seenChats.current.add(exchange.id);
      if (exchange.status === 'thinking') centerRef.current = exchange.id;
    }
    const id = centerRef.current, exchange = exchanges.find(entry => entry.id === id);
    if (!exchange || exchange.linkFrom || !bounds[id]) return;
    centerRef.current = null;
    centerOn(bounds[id]);
  }, [exchanges, bounds]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Add comment (docs/features/canvas-comments.md section 5): an anchor at a world point, on the object there (relative
  // to it, so it follows the card, shape or group) or on the canvas. The menu, the Comment tool and C all come here; the
  // page's panel saves.
  const groupMembers = {};
  for (const entry of [...blocks, ...items, ...shapes, ...exchanges]) if (entry.groupId) (groupMembers[entry.groupId] ||= []).push(entry.id);
  const commentBoard = { bounds, items, shapes, groups: groupMembers };
  const commentAt = (world, id) => {
    const group = id && groupMembers[id] ? groups.find(candidate => candidate.id === id) || { id } : null;
    const entry = id && !group ? [...exchanges, ...blocks, ...items, ...shapes].find(candidate => candidate.id === id) : null;
    const kind = group ? 'group' : !entry ? null : exchanges.includes(entry) ? 'exchange' : blocks.includes(entry) ? 'block' : items.includes(entry) ? 'item' : 'shape';
    const label = group ? group.label || `${groupMembers[id].length} items` : objectLabel(entry);
    onAddComment?.(anchorAt(world, (group || entry) && { id, kind, label }, commentBoard));
  };
  // C (Q14): the selection gets the comment - a card, a shape or text, a whole group, or the first of several selected
  // objects. Nothing selected: false, and C does nothing (owner, 2026-10-08).
  commentKeyRef.current = onAddComment ? ids => {
    const gid = groupOf(ids[0]);
    const whole = !!gid && membersOf(gid).every(id => ids.includes(id));
    const boxes = boxesOf(whole ? membersOf(gid) : ids.slice(0, 1));
    if (!boxes.length) return false;
    const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
    const w = Math.max(...boxes.map(box => box.x + box.w)) - x, h = Math.max(...boxes.map(box => box.y + box.h)) - y;
    commentAt({ x: x + Math.min(24, w / 2), y: y + Math.min(24, h / 2) }, whole ? gid : ids[0]);
    return true;
  } : null;
  // The pin slot (owner, 2026-10-08): an object's thread pins sit in a row ending just left of its pill row - Ask in chat,
  // and the pills a few cards add beside it - above its top right, whether it is selected or not, so a pin never covers a
  // pill. In world units: where the reserved row starts (`right`), its top and height. A shape or text keeps the slot
  // Ask in chat would take. PILL: the pills' rendered widths, with a little room.
  const PILL = { ask: 112, select: 124, explain: 144, more: 138, gap: 6 };
  const pillRow = id => {
    const block = blocks.find(entry => entry.id === id);
    if (block) return PILL.ask + (block.type === 'whiteboard' || block.type === 'paper' ? PILL.gap + PILL.select : 0);
    if (exchanges.some(entry => entry.id === id)) return PILL.explain + PILL.gap + PILL.more;
    return PILL.ask;
  };
  const commentSlot = id => {
    const members = groupMembers[id];
    const boxes = boxesOf(members || [id]);
    if (!boxes.length) return null;
    const pad = members ? 12 : 0; // a group's outline sits 12 outside its members, and its pill row above that
    const top = Math.min(...boxes.map(box => box.y)) - pad, right = Math.max(...boxes.map(box => box.x + box.w)) + pad;
    return { right: right - pillRow(id), top: top - 40, height: 30 };
  };
  const pickedPin = pinPick ? commentPins?.find(pin => pin.id === pinPick && !pin.ghost) || null : null;
  const dropPin = () => { setPinPick(null); setPinAsk(null); };
  useEffect(() => { if (selection.length || (pinPick && !pickedPin)) dropPin(); }, [selection, pinPick, pickedPin]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickPin = id => { setSelection([]); setPinAsk(null); setPinPick(id); };
  // The server decides; a refusal stays by the pin for a few seconds.
  const notePin = note => { setPinAsk({ note }); setTimeout(() => setPinAsk(current => (current?.note === note ? null : current)), 4000); };
  const deletePin = async id => { const refused = await onPinDelete(id); if (refused) notePin(refused); else dropPin(); };
  const colorPin = async value => { const refused = await onPinColor(pinPick, value); if (refused) notePin(refused); };
  // Del on a thread with replies asks first; one the server will refuse goes straight to it, for its answer.
  pinKeyRef.current = pickedPin ? key => {
    if (key === 'Escape') dropPin();
    else if (key === 'Enter') onCommentPin?.(pickedPin.id);
    else if (onPinDelete) { if (pickedPin.can.delete && pickedPin.comments > 1) setPinAsk({ replies: pickedPin.comments - 1 }); else deletePin(pickedPin.id); }
  } : null;
  const portPosition = (id, side) => {
    const shape = shapesRef.current.find(entry => entry.id === id);
    if (shape) return sidePoint(shapeBox(shape), side);
    // An asked-about area is a link end too: its answer card hangs from it.
    const area = areaById(id);
    const box = bounds[id] || (area && areaBox(area));
    if (box && (side === 'left' || side === 'right')) return { x: box.x + (side === 'right' ? box.w : 0), y: box.y + box.h / 2 };
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
  // What a connector end would attach to under the pointer: a port it is on,
  // else a shape it is over (the side facing the other end), else a card's
  // port nearby or the card it is over. Nothing: the end follows the pointer.
  // Only card ports snap from a distance - a shape's would swallow small shapes
  // whole and pull the arrow away from the mouse.
  const connectorTarget = (e, exclude, anchor) => {
    const point = local(e);
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const portHit = under?.closest('[data-port]');
    if (portHit && portHit.dataset.owner !== exclude) return { id: portHit.dataset.owner, side: portHit.dataset.port };
    const shapeId = under?.closest('[data-shape-id]')?.dataset.shapeId;
    const shape = shapesRef.current.find(entry => entry.id === shapeId && entry.id !== exclude && TEXT_BOX[entry.kind]);
    if (shape) return { id: shape.id, side: nearestSide(shapeBox(shape), anchor || point) };
    const snap = snapPort(point, exclude);
    if (snap) return { id: snap.id, side: snap.side };
    const blockId = under?.closest('[data-block-id]')?.dataset.blockId;
    const box = blockId && blockId !== exclude ? boundsRef.current[blockId] : null;
    return box ? { id: blockId, side: point.y < box.y + box.h / 2 ? 'top' : 'bottom' } : null;
  };
  const connect = (event, from, fromSide) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    connectionCleanup.current?.();
    // The ink color drives the connector; the plain ink default reads as
    // uncolored on a line, so it maps to the accent blue.
    const source = blocksRef.current.find(block => block.id === from);
    const fromShape = shapesRef.current.some(shape => shape.id === from);
    // A diagram connector takes the ink colour, like the shapes it joins.
    const linkColor = fromShape ? color : color === COLORS[0] ? (LINK_COLORS[source?.type || 'chat'] || '#2383e2') : color;
    const route = fromShape ? connectorRoute : undefined;
    const start = { x: event.clientX, y: event.clientY };
    const anchor = portPosition(from, fromSide);
    const trace = e => {
      const hit = connectorTarget(e, from, anchor);
      const at = hit ? portPosition(hit.id, hit.side) : local(e);
      setConnecting({ from, fromSide, toPoint: at, toSide: hit?.side, snap: hit ? { at } : null, color: linkColor, route, head: fromShape });
    };
    // Connectors touching a shape are diagram arrows: routed, with a head.
    const addLink = (to, toSide) => {
      if (!to || to === from || present.current.links.some(link => link.from === from && link.fromSide === fromSide && link.to === to && link.toSide === toSide)) return;
      const diagram = fromShape || shapesRef.current.some(shape => shape.id === to);
      snapshot();
      setLinks(previous => [...previous, { id: crypto.randomUUID(), from, fromSide, to, toSide, color: linkColor, ...(diagram ? { route: connectorRoute, head: true } : {}) }]);
    };
    trace(event);
    const move = e => trace(e);
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('pointerdown', finish, true);
      connectionCleanup.current = null;
    };
    const cancel = () => { cleanup(); setConnecting(null); };
    const up = e => {
      // A click on a port (no drag) waits for a click on the target instead.
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) {
        window.removeEventListener('pointerup', up);
        window.addEventListener('pointerdown', finish, true);
        return;
      }
      const hit = connectorTarget(e, from, anchor);
      if (hit) addLink(hit.id, hit.side);
      cancel();
    };
    // The second click of click-click: a port, a shape (its facing side) or a
    // card (top or bottom half). Anywhere else cancels.
    const finish = e => {
      e.preventDefault(); e.stopPropagation();
      if (e.button !== 0) { cancel(); return; }
      const hit = connectorTarget(e, from, anchor);
      if (hit) addLink(hit.id, hit.side);
      cancel();
    };
    connectionCleanup.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };
  // Drag either end of a selected connector onto another port, shape or card.
  // The other end stays; dropping on nothing leaves the connector as it was.
  const repoint = (event, link, end) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    connectionCleanup.current?.();
    const [fixed, fixedSide] = end === 'to' ? [link.from, link.fromSide] : [link.to, link.toSide];
    const anchor = portPosition(fixed, fixedSide);
    const trace = e => {
      const hit = connectorTarget(e, fixed, anchor);
      const at = hit ? portPosition(hit.id, hit.side) : local(e);
      setConnecting({ from: fixed, fromSide: fixedSide, toPoint: at, toSide: hit?.side, snap: hit ? { at } : null, color: link.color, route: link.route, hide: link.id });
    };
    const cleanup = () => { window.removeEventListener('pointermove', trace); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); connectionCleanup.current = null; };
    const cancel = () => { cleanup(); setConnecting(null); };
    const up = e => {
      const hit = connectorTarget(e, fixed, anchor);
      if (hit) {
        snapshot();
        setLinks(previous => previous.map(entry => entry.id !== link.id ? entry : end === 'to' ? { ...entry, to: hit.id, toSide: hit.side } : { ...entry, from: hit.id, fromSide: hit.side }));
      }
      cancel();
    };
    trace(event);
    connectionCleanup.current = cleanup;
    window.addEventListener('pointermove', trace);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };
  // A connection's path, middle (for its label) and arrowhead direction.
  // Card connections made before routes keep their original vertical curve.
  const linkRoute = link => {
    const a = portPosition(link.from, link.fromSide), b = link.toPoint || portPosition(link.to, link.toSide);
    if (!a || !b) return null;
    if (link.route) return { ...routePath(a, link.fromSide, b, link.toSide || null, link.route), tip: b };
    const bend = Math.max(60, Math.abs(b.y - a.y) / 2);
    const c1 = { x: a.x, y: a.y + (link.fromSide === 'bottom' ? bend : -bend) }, c2 = { x: b.x, y: b.y + (link.toSide === 'bottom' ? bend : -bend) };
    return { d: `M${a.x} ${a.y} C${c1.x} ${c1.y},${c2.x} ${c2.y},${b.x} ${b.y}`, mid: { x: 0.125 * a.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * b.x, y: 0.125 * a.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * b.y }, from: c2, tip: b };
  };
  const connectionPath = link => linkRoute(link)?.d || '';
  const shapeTool = SHAPE_TOOLS.some(([kind]) => kind === tool);
  const pan = event => startDrag(event, { x: view.x, y: view.y }, (x, y) => setView(v => ({ ...v, x, y })));
  // Ctrl-drag (either button) rubber-bands a selection: every card, shape and
  // text box the rectangle touches becomes one group the next drag moves.
  const marqueeRef = useRef(null);
  const selectWithin = rect => {
    const x = Math.min(rect.x1, rect.x2), y = Math.min(rect.y1, rect.y2);
    const w = Math.abs(rect.x2 - rect.x1), h = Math.abs(rect.y2 - rect.y1);
    if (w < 4 && h < 4) return;
    const touches = box => box.x + box.w > x && box.x < x + w && box.y + box.h > y && box.y < y + h;
    const ids = Object.entries(boundsRef.current).filter(([, box]) => touches(box)).map(([id]) => id);
    for (const shape of shapesRef.current) {
      if (touches({ x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2), w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) })) ids.push(shape.id);
    }
    for (const node of itemsLayer.current?.querySelectorAll('[data-item-id]') || []) {
      if (touches({ x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight })) ids.push(node.dataset.itemId);
    }
    setSelection([...new Set(ids)]);
  };
  // Ask about selection: a rectangle in page coordinates becomes a PNG of that part of the screen, the
  // cards it touches, and an ask target (LearnPage uploads the image so the tutor sees it).
  const askArea = async rect => {
    const x = Math.min(rect.x1, rect.x2), y = Math.min(rect.y1, rect.y2), w = Math.abs(rect.x2 - rect.x1), h = Math.abs(rect.y2 - rect.y1);
    if (w * view.z < 8 || h * view.z < 8) return;
    const node = surface.current, box = node.getBoundingClientRect();
    const crop = { x: view.x + x * view.z, y: view.y + y * view.z, w: w * view.z, h: h * view.z };
    const inside = Object.entries(boundsRef.current).filter(([, b]) => b.x + b.w > x && b.x < x + w && b.y + b.h > y && b.y < y + h).map(([id]) => blocks.find(block => block.id === id)).filter(Boolean);
    let preview = null, blob = null;
    try {
      const { toCanvas } = await import('html-to-image');
      const skip = el => el.nodeType === 1 && (el.tagName === 'IFRAME' || el.getAttribute?.('role') === 'toolbar' || el.hasAttribute?.('data-canvas-minimap') || el.hasAttribute?.('data-dive-gutter') || el.hasAttribute?.('data-area-marquee') || el.hasAttribute?.('data-area-mark'));
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const full = await toCanvas(node, { pixelRatio: ratio, width: box.width, height: box.height, filter: el => !skip(el), cacheBust: false });
      const out = document.createElement('canvas');
      const scale = Math.min(1, 1400 / Math.max(crop.w * ratio, crop.h * ratio));
      out.width = Math.max(1, Math.round(crop.w * ratio * scale)); out.height = Math.max(1, Math.round(crop.h * ratio * scale));
      out.getContext('2d').drawImage(full, crop.x * ratio, crop.y * ratio, crop.w * ratio, crop.h * ratio, 0, 0, out.width, out.height);
      preview = out.toDataURL('image/png');
      blob = await new Promise(resolve => out.toBlob(resolve, 'image/png'));
    } catch { /* the text of the cards inside still asks */ }
    const titles = inside.map(block => block.title || block.type).filter(Boolean);
    const id = `area:${Date.now().toString(36)}`;
    // The area rides on the card or slide under its centre, so it stays put when the column above it grows.
    const cx = x + w / 2, cy = y + h / 2;
    const host = Object.entries(boundsRef.current).find(([hostId, b]) => blocks.some(block => block.id === hostId) && cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h);
    setAreas(previous => [...previous, { id, x, y, w, h, ...(host ? { blockId: host[0], dx: x - host[1].x, dy: y - host[1].y } : {}) }]);
    onAreaShotRef.current?.({
      target: {
        id, kind: 'Canvas selection',
        title: titles.length ? `Selected area · ${titles.slice(0, 2).join(', ')}${titles.length > 2 ? '…' : ''}` : 'Selected area',
        text: [
          'The learner drew a rectangle on the canvas and asks about what is inside it; the attached image shows that area.',
          titles.length ? `Cards inside or touching it: ${titles.join('; ')}` : 'No card is inside it, only the canvas itself.',
        ].join(String.fromCharCode(10)),
      },
      preview, blob,
    });
  };
  // With Ask about selection picked, a press anywhere - over cards too - starts the rectangle
  // (capture phase, before a card takes the press); the tool goes back to Select once it is drawn.
  const startArea = event => {
    if (event.button !== 0 || event.target.closest('[role="toolbar"],[data-zoom],[data-dive-gutter],[data-canvas-minimap]')) return;
    const start = local(event);
    let rect = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
    setAreaMarquee(rect);
    const apply = (px, py) => { rect = { ...rect, x2: px, y2: py }; setAreaMarquee(rect); };
    // The rectangle stays, labelled Capturing..., until the picture is ready (a big board takes seconds).
    // ponytail: the whole surface is rendered, then cropped; render only the cards under the area if it is too slow.
    apply.done = () => { setTool('select'); setAreaMarquee({ ...rect, busy: true }); requestAnimationFrame(() => askArea(rect).finally(() => setAreaMarquee(null))); };
    startDrag(event, start, apply, view.z);
  };
  // The drawing tools' gestures, run against a store: the canvas's own lists, or an Explain Back sketch's
  // (sketchStore). One tool system for both - only where the marks land differs. False: the tool draws nothing.
  const drawGesture = (event, store) => {
    if (tool === 'pen' || tool === 'highlighter') {
      event.preventDefault();
      // The width row scales both inks: pen uses it directly, highlighter 4x.
      const ink = tool === 'pen' ? { tool, color, width, dash, opacity } : { tool, width: width * 4 };
      const points = [store.local(event)];
      store.setLive({ ...ink, points });
      const move = e => { points.push(store.local(e)); store.setLive({ ...ink, points: [...points] }); };
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        store.setLive(null);
        if (points.length > 1) { snapshot(); store.setStrokes(previous => [...previous, { ...ink, points }]); }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    } else if (shapeTool) {
      event.preventDefault();
      const start = store.local(event);
      const draft = { id: crypto.randomUUID(), kind: tool, x1: start.x, y1: start.y, x2: start.x, y2: start.y, color, width, dash, fill, opacity, round };
      store.setLiveShape(draft);
      const move = e => { const p = store.local(e); store.setLiveShape({ ...draft, x2: p.x, y2: p.y }); };
      const up = e => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        const p = store.local(e);
        store.setLiveShape(null);
        if (Math.hypot(p.x - start.x, p.y - start.y) > 4) { snapshot(); store.setShapes(previous => [...previous, { ...draft, x2: p.x, y2: p.y }]); }
        if (!lock) setTool('select');
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    } else if (tool === 'eraser') {
      event.preventDefault();
      snapshot();
      const radius = 12 / view.z;
      const erase = e => {
        const point = store.local(e);
        store.setStrokes(previous => previous.filter(stroke => !stroke.points.some(q => Math.hypot(q.x - point.x, q.y - point.y) < radius)));
        store.setShapes(previous => previous.filter(shape => {
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
      const point = store.local(event);
      // A fresh text box opens long - a full writing line, not a stamp-sized
      // target - and the corner handle takes it anywhere from there.
      store.setItems(previous => [...previous, { id: crypto.randomUUID(), kind: tool, x: point.x, y: point.y, text: '', color, opacity, ...(tool === 'text' ? { level, w: store.textWidth(point) } : {}), fresh: true }]);
      if (!lock) setTool('select');
    } else if (tool === 'equation' && store.equations) {
      // An equation opens for editing where it is placed (canvas-equations.md); an Explain Back sketch holds none.
      event.preventDefault();
      snapshot();
      store.setItems(previous => [...previous, newEquation(store.local(event))]);
      if (!lock) setTool('select');
    } else return false;
    return true;
  };
  const canvasStore = { local, setStrokes, setShapes, setItems, setLive, setLiveShape, textWidth: () => 420, equations: true };
  // ---------- Explain Back sketch (docs/features/explain-back-sketch.md) ----------
  // A sketch's marks live on its block (block.sketch) in the card's own pixels, so they save, move, fork and undo
  // with the card and are never canvas objects.
  const editSketch = (id, key, change) => setBlocks(previous => previous.map(block => (block.id === id
    ? { ...block, sketch: { strokes: [], shapes: [], items: [], ...block.sketch, [key]: change(block.sketch?.[key] || []) } } : block)));
  const sketchStore = (id, element) => ({
    local: event => { const box = element.getBoundingClientRect(); return roundPoint({ x: (event.clientX - box.left) / view.z, y: (event.clientY - box.top) / view.z }); },
    setStrokes: change => editSketch(id, 'strokes', change),
    setShapes: change => editSketch(id, 'shapes', change),
    setItems: change => editSketch(id, 'items', change),
    setLive: stroke => setSketchLive(stroke && { id, stroke }),
    setLiveShape: shape => setSketchLive(shape && { id, shape }),
    // A text box opens to the sketch's right edge, never past it.
    textWidth: point => Math.max(96, Math.min(420, element.clientWidth - point.x - 8)),
  });
  // Where the style panel, the order buttons and Delete write: the active sketch, else the canvas.
  const markLists = () => {
    const id = drawTargetRef.current;
    return id ? { setShapes: change => editSketch(id, 'shapes', change), setItems: change => editSketch(id, 'items', change) } : { setShapes, setItems };
  };
  // A press in a sketch makes it the target; the canvas's selection lets go, so nothing of the canvas's can be
  // deleted or restyled from inside the sketch.
  const holdSketch = id => {
    if (drawTargetRef.current === id) return;
    drawTargetRef.current = id;
    setDrawTarget(id); setSketchSel([]); setSketchEdit(null); setSelection([]); setMenuAt(null);
  };
  const releaseSketch = () => { drawTargetRef.current = null; setDrawTarget(null); setSketchSel([]); setSketchEdit(null); };
  const pressSketch = (event, id) => {
    // Hand pans the canvas under the card, as it does over any card.
    if (event.button !== 0 || tool === 'hand') return;
    event.stopPropagation();
    if (drawGesture(event, sketchStore(id, event.currentTarget))) return;
    setSketchSel([]);
  };
  const selectInSketch = (markId, event = null) => setSketchSel(previous => (event && (event.ctrlKey || event.metaKey || event.shiftKey)
    ? (previous.includes(markId) ? previous.filter(other => other !== markId) : [...previous, markId])
    : [markId]));
  const dropFromSketch = (id, ids) => {
    snapshot();
    editSketch(id, 'shapes', marks => marks.filter(mark => !ids.includes(mark.id)));
    editSketch(id, 'items', marks => marks.filter(mark => !ids.includes(mark.id)));
    setSketchSel(previous => previous.filter(other => !ids.includes(other)));
  };
  const deleteSketchSelectionRef = useRef(null);
  deleteSketchSelectionRef.current = () => { const id = drawTargetRef.current, ids = sketchSelRef.current; if (id && ids.length) dropFromSketch(id, ids); };
  const releaseSketchRef = useRef(releaseSketch);
  releaseSketchRef.current = releaseSketch;
  // ponytail: a press drags only the shape under it; a multi-mark drag inside a sketch can come later.
  const moveSketchShape = (event, id, shape) => {
    snapshot();
    startDrag(event, { x: shape.x1, y: shape.y1 }, (x, y) => {
      const dx = x - shape.x1, dy = y - shape.y1;
      editSketch(id, 'shapes', marks => marks.map(mark => (mark.id === shape.id ? { ...mark, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy } : mark)));
    }, view.z);
  };
  const patchSketch = (id, key, markId, patch) => editSketch(id, key, marks => marks.map(mark => (mark.id === markId ? { ...mark, ...patch } : mark)));
  // The drawing area an Explain Back card shows (ChallengeBody, through SketchHost): no tools of its own. A press
  // in the capture phase makes it the target before any mark or gesture handles the press. `still` renders a
  // submitted sketch read-only.
  const renderSketch = (block, { still = false } = {}) => {
    const { strokes = [], shapes = [], items = [] } = block.sketch || {};
    const id = block.id, mine = sketchLive?.id === id ? sketchLive : null;
    const fixed = still || readOnly;
    const active = !fixed && drawTarget === id;
    const markTool = fixed ? 'none' : tool;
    const marked = markId => active && sketchSel.includes(markId);
    return (
      <div data-sketch={id} data-sketch-active={active ? '' : undefined}
        style={{ height: SKETCH_HEIGHT, pointerEvents: fixed || tool === 'hand' ? 'none' : 'auto' }}
        className={`relative w-full overflow-hidden rounded-lg border bg-white ${active ? 'border-[#2383e2] ring-2 ring-[#2383e2]/25' : 'border-line'} ${!fixed && (tool === 'pen' || tool === 'highlighter' || tool === 'eraser' || shapeTool) ? 'cursor-crosshair' : ''}`}
        onPointerDownCapture={fixed ? undefined : event => { if (event.button === 0 && tool !== 'hand') holdSketch(id); }}
        onPointerDown={fixed ? undefined : event => pressSketch(event, id)}
        // A double-click edits a mark here; it must not open the card's Rabbit Hole.
        onDoubleClick={event => event.stopPropagation()}>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {[...shapes, ...(mine?.shape ? [mine.shape] : [])].map(shape => <ShapeView key={shape.id} shape={shape} tool={markTool} zoom={view.z} selected={marked(shape.id)}
            editing={sketchEdit?.kind === 'text' && sketchEdit.id === shape.id} labelEditing={sketchEdit?.kind === 'label' && sketchEdit.id === shape.id}
            onSelect={selectInSketch} onMoveStart={(event, pressed) => moveSketchShape(event, id, pressed)} onGesture={snapshot}
            onResize={(markId, patch) => patchSketch(id, 'shapes', markId, patch)} onDelete={markId => dropFromSketch(id, [markId])}
            onEdit={markId => setSketchEdit({ id: markId, kind: 'text' })}
            onText={(markId, text) => { setSketchEdit(null); snapshot(); patchSketch(id, 'shapes', markId, { text }); }}
            onLabel={markId => setSketchEdit({ id: markId, kind: 'label' })}
            onLabelDone={(markId, label) => { setSketchEdit(null); snapshot(); patchSketch(id, 'shapes', markId, { label }); }} />)}
          {[...strokes, ...(mine?.stroke ? [mine.stroke] : [])].map(inkPath)}
        </svg>
        {items.map(item => <CanvasItem key={item.id} item={item} zoom={view.z} tool={markTool} selected={marked(item.id)} onSelect={selectInSketch} onGesture={snapshot}
          onChange={(markId, text) => patchSketch(id, 'items', markId, { text, fresh: false })}
          onMove={(markId, x, y) => patchSketch(id, 'items', markId, { x, y })}
          onResize={(markId, w, h) => patchSketch(id, 'items', markId, { w, h })}
          onDelete={markId => dropFromSketch(id, [markId])}
          onLevel={(markId, value) => { snapshot(); patchSketch(id, 'items', markId, { level: value }); }} />)}
        {!fixed && <span data-sketch-chrome className={`pointer-events-none absolute top-1.5 right-2 text-[10px] ${active ? 'font-medium text-[#2383e2]' : 'text-ink-2'}`}>{active ? 'Toolbar draws here' : 'Click here, then draw with the toolbar'}</span>}
      </div>
    );
  };
  // The sketch as the learner sees it, for the grader: a PNG at most 900 px on its long side and 600 KB, or null
  // (the sketch's words still go with the attempt).
  const captureSketch = async id => {
    const node = surface.current?.querySelector(`[data-sketch="${CSS.escape(id)}"]`);
    if (!node) return null;
    try {
      const { toPng } = await import('html-to-image');
      for (const ratio of [2, 1]) {
        const png = await toPng(node, { pixelRatio: Math.min(ratio, 900 / Math.max(node.offsetWidth, node.offsetHeight)), cacheBust: false, filter: el => !(el.nodeType === 1 && el.hasAttribute?.('data-sketch-chrome')) });
        if (png.length <= 600000) return png;
      }
    } catch { /* no picture: the words still go */ }
    return null;
  };
  const sketchHost = { render: renderSketch, hold: holdSketch, release: id => { if (drawTargetRef.current === id) releaseSketch(); }, capture: captureSketch, readOnly };
  // A target whose sketch is gone - hidden, submitted, its card deleted or undone away - hands the toolbar back.
  useEffect(() => {
    if (drawTarget && !blocks.some(block => block.id === drawTarget && block.sketchOpen && !block.answer && !block.sketchSubmitted)) releaseSketch();
  }, [blocks, drawTarget]);
  const down = event => {
    // A press on the canvas makes it the drawing target again (an Explain Back sketch stops its own presses).
    if (drawTargetRef.current) releaseSketch();
    // A press on the canvas dismisses the floating chrome - the style island
    // and the dev insert menu - the way it already dismisses a menubar menu.
    if (showStyle) setStyleOpen(false);
    if (pinPick) dropPin();
    setInsertOpen(false); setMenuAt(null);
    if ((event.ctrlKey || event.metaKey) && tool === 'select' && (event.button === 0 || event.button === 2)
      && !event.target.closest('[data-block],[role="toolbar"],[data-zoom]')) {
      const start = local(event);
      marqueeRef.current = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
      setMarquee(marqueeRef.current);
      const apply = (px, py) => { marqueeRef.current = { x1: start.x, y1: start.y, x2: px, y2: py }; setMarquee(marqueeRef.current); };
      apply.done = () => { if (marqueeRef.current) selectWithin(marqueeRef.current); marqueeRef.current = null; setMarquee(null); };
      startDrag(event, start, apply, view.z);
      return;
    }
    if (event.button !== 0) return;
    // A view-only board (a shared link) pans with the hand, and a click that does not pan selects the card under it,
    // so a viewer can start a Rabbit Hole from that card (docs/features/shared-canvas-rabbit-hole.md). Nothing else
    // of selection is offered there: no pills, no handles, no keys.
    if (tool === 'hand' && readOnly) {
      const at = local(event);
      // A lesson card, a chat card or a note: each gets the pill above the shared composer (owner, 2026-10-08). Only a
      // lesson card is a Rabbit Hole origin (onState's card); a chat card or note on a shared board is not one yet.
      const card = Object.entries(boundsRef.current).find(([id, box]) => (blocksRef.current.some(block => block.id === id) || exchangesRef.current.some(exchange => exchange.id === id)) && at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h)?.[0];
      const note = !card && [...document.querySelectorAll('[data-item-id]')].find(element => { const r = element.getBoundingClientRect(); return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom; })?.dataset.itemId;
      const hit = card || note || null;
      let moved = false;
      const apply = (x, y) => { moved = true; setView(v => ({ ...v, x, y })); };
      apply.done = () => { if (!moved) setSelection(hit ? [hit] : []); };
      startDrag(event, { x: view.x, y: view.y }, apply);
      return;
    }
    if (tool === 'hand') { pan(event); return; }
    if (event.target.closest('[data-block],[role="toolbar"],[data-zoom]')) return;
    if (drawGesture(event, canvasStore)) return;
    setSelected(null);
    pan(event);
  };
  const moveItem = (id, x, y) => setItems(previous => previous.map(item => item.id === id ? { ...item, x, y } : item));
  const resizeItem = (id, w, h) => setItems(previous => previous.map(item => item.id === id ? { ...item, w, h } : item));
  // Cards move freely: anywhere on the canvas, overlapping if the learner wants.
  const moveBlock = (id, dx, dy) => setBlocks(previous => previous.map(block => block.id === id ? { ...block, dx, dy } : block));
  // Dragging one member of a multi-selection carries the whole group.
  const shift = (ddx, ddy, ids) => {
    for (const id of ids) {
      const exchange = exchangesRef.current.find(item => item.id === id);
      if (exchange) { onMove(id, exchange.dx + ddx, exchange.dy + ddy); continue; }
      const block = blocksRef.current.find(item => item.id === id);
      if (block) { moveBlock(id, block.dx + ddx, block.dy + ddy); continue; }
      const item = itemsRef.current.find(entry => entry.id === id);
      if (item) { setItems(previous => previous.map(entry => entry.id === id ? { ...entry, x: item.x + ddx, y: item.y + ddy } : entry)); continue; }
      const shape = shapesRef.current.find(entry => entry.id === id);
      if (shape) setShapes(previous => previous.map(entry => entry.id === id ? { ...entry, x1: entry.x1 + ddx, y1: entry.y1 + ddy, x2: entry.x2 + ddx, y2: entry.y2 + ddy } : entry));
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
  const changeBlock = updated => {
    snapshot();
    setBlocks(previous => previous.map(block => block.id === updated.id ? updated : block));
    // A paper card's page is what the tutor is told, the way a wiki card's
    // section is.
    if (updated.type === 'paper' && updated.paper?.id) onPaperRef.current?.({ id: updated.id, paperId: updated.paper.id, page: updated.paper.page || 1, title: updated.title });
  };
  // A continuous gesture must not snapshot: one scrub drag would evict the whole
  // 100-entry undo ring. Same reasoning as moveBlock, which has never snapshotted.
  const changeBlockQuietly = updated => setBlocks(previous => previous.map(block => block.id === updated.id ? updated : block));
  // A style press sets the default for the next thing drawn, and restyles
  // whatever is selected. Connectors only carry a colour.
  const applyStyle = (patch, targets) => {
    if (!targets.length) return;
    snapshot();
    const lists = markLists();
    lists.setShapes(previous => previous.map(shape => targets.includes(shape.id) ? { ...shape, ...patch } : shape));
    lists.setItems(previous => previous.map(item => targets.includes(item.id) ? { ...item, ...patch } : item));
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
    const lists = markLists();
    lists.setShapes(previous => reorder(previous, targets, toFront));
    lists.setItems(previous => reorder(previous, targets, toFront));
  };
  // Inserted into the column flow between two cards, so it needs no offset.
  const insertHeadingAt = (level, at) => {
    const index = typeof at === 'number' ? at : blocksRef.current.filter(block => { const box = boundsRef.current[block.id]; return box && box.y + box.h <= at.y; }).length;
    snapshot();
    const heading = { id: crypto.randomUUID(), type: 'heading', dx: 0, dy: 0, level, text: '' };
    setBlocks(previous => [...previous.slice(0, index), heading, ...previous.slice(index)]);
    setGapAdding(false);
    setHoverGap(null); // the rail's job is done; it comes back when the pointer does
    return heading.id;
  };
  // Where the learner is looking, in world coordinates.
  const viewCenter = () => {
    const element = surface.current;
    const w = element?.clientWidth || 0, h = element?.clientHeight || 0;
    return { x: (w / 2 - view.x) / view.z, y: (h / 2 - view.y) / view.z };
  };
  // The column slot nearest the middle of the screen: before the first card
  // whose middle is below the screen's middle.
  const flowIndexAtView = () => flowIndexAt(viewCenter().y);
  // The column slot at a height in the world (a drop point's), as flowIndexAtView finds the screen's middle.
  const flowIndexAt = y => {
    const list = blocksRef.current;
    const at = list.findIndex(block => { const box = boundsRef.current[block.id]; return box && box.y + box.h / 2 > y; });
    return at < 0 ? list.length : at;
  };
  // The column as freeSlot reads it, in render order (chat cards, then blocks): each card's flow place, its top
  // margin included, and where it is drawn (its bounds: flow place plus its dragged dx, dy). A card not yet
  // measured keeps its index and covers nothing.
  const columnItems = () => {
    let last = 0;
    return [...exchangesRef.current.map(owner => [owner, false]), ...blocksRef.current.map(owner => [owner, true])].flatMap(([owner, block]) => {
      const box = boundsRef.current[owner.id];
      if (!box) return block ? [{ id: owner.id, block, flowTop: last, flowBottom: last, x: -1, y: last, w: 0, h: 0 }] : [];
      const flowTop = box.y - (owner.dy || 0) - (owner.space || 0);
      last = box.y - (owner.dy || 0) + box.h;
      return [{ id: owner.id, block, flowTop, flowBottom: last, x: box.x, y: box.y, w: box.w, h: box.h }];
    });
  };
  // A card for a reserved slot (`into`) takes that slot's place, never a new one - with the room the slot kept
  // above it at the end of a crowded column (its `top`, as the card's own top margin); a slot that has gone
  // (released, or this is another canvas) leaves the card to land where the learner is looking.
  const insertAtView = (block, into = null) => {
    perfMark(block.id, 'insert');
    const slot = into && slotsRef.current.find(entry => entry.id === into);
    const index = slot ? null : flowIndexAtView();
    if (slot?.top) block = { ...block, space: slot.top };
    setBlocks(previous => { const at = slot ? slotIndex(previous, slot) : index; return [...previous.slice(0, at), block, ...previous.slice(at)]; });
    if (slot) setSlots(previous => fillSlot(previous, into, block.id));
    return revealAfter(block.id, slot?.moves);
  };
  // Once the new card is measured, nudge the camera only if it landed off
  // screen - a card inserted in view leaves the view alone. One correction, on
  // its settled size (the [bounds] effect above); `moves` is the learner's camera
  // count it was armed at (a reserved slot's, for a card that fills one).
  const revealRef = useRef(null);
  const revealAfter = (id, moves = manualMoves.current) => { revealRef.current = { id, moves, until: performance.now() + REVEAL_MS }; return id; };
  // Everything on the canvas as boxes, for the rail: cards and chat cards,
  // shapes, notes and text, and ink.
  const inkBox = stroke => {
    const xs = (stroke.points || []).map(p => p.x), ys = (stroke.points || []).map(p => p.y);
    return xs.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } : null;
  };
  const contentBoxes = () => [
    ...Object.entries(boundsRef.current).map(([id, box]) => ({ id, ...box })),
    ...shapesRef.current.map(shape => ({ id: shape.id, ...shapeBox(shape) })),
    ...itemsRef.current.map(item => ({ id: item.id, ...(boxesOf([item.id])[0] || { x: item.x, y: item.y, w: item.w || 0, h: item.h || 0 }) })),
    ...present.current.strokes.map(inkBox).filter(Boolean),
  ];
  // [+] pushes everything below the line down; [-] pulls it up, stopping short
  // of closing the gap. Cards, chat cards, shapes, notes and ink all move.
  const nudgeGap = (gap, delta) => {
    const by = nudgeBy(gap, delta);
    if (!by) return;
    snapshot(true);
    const below = box => box.y >= gap.bottom - 0.5;
    shift(0, by, contentBoxes().filter(box => box.id && below(box)).map(box => box.id));
    setStrokes(previous => previous.map(stroke => { const box = inkBox(stroke); return box && below(box) ? { ...stroke, points: stroke.points.map(p => ({ ...p, y: p.y + by })) } : stroke; }));
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
    const added = { ...BLOCK_TYPES[type].sample(), dy };
    perfMark(added.id, 'insert');
    setBlocks(previous => [...previous, added]);
    setInsertOpen(false);
    setInsertFilter('');
    if (element) setView(v => ({ ...v, y: Math.min(v.y, chromeTop(v.x, v.x + COLUMN * v.z) - 280 - (24 + flowY + dy) * v.z) }));
  };
  const changeItem = (id, text) => {
    if (present.current.items.some(item => item.id === id && item.text !== text)) snapshot();
    setItems(previous => previous.map(item => item.id === id ? { ...item, text, fresh: false } : item));
  };
  // An equation's edit ends with its source. A fresh one is still its placement's undo step; one left empty goes.
  const finishEquation = (id, latex) => {
    const before = present.current.items.find(item => item.id === id);
    if (!before) return;
    if (!latex) { if (before.fresh) setItems(previous => previous.filter(item => item.id !== id)); else deleteItem(id); return; }
    if (!before.fresh && before.latex !== latex) snapshot();
    setItems(previous => previous.map(item => item.id === id ? { ...item, latex, fresh: false } : item));
  };
  const patchItem = (id, patch) => setItems(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  const deleteItem = id => { snapshot(); setItems(previous => previous.filter(item => item.id !== id)); setShapes(previous => previous.filter(shape => shape.id !== id)); setLinks(previous => previous.filter(link => link.from !== id && link.to !== id)); setSelection(previous => previous.filter(other => other !== id)); };
  const [editingShape, setEditingShape] = useState(null);
  // The line (connector or drawn arrow) whose label is being written.
  const [editingLabel, setEditingLabel] = useState(null);
  const changeLabel = (id, label) => {
    setEditingLabel(null);
    const before = [...present.current.links, ...present.current.shapes].find(entry => entry.id === id);
    if (!before || (before.label || '') === label) return;
    snapshot();
    setLinks(previous => previous.map(link => link.id === id ? { ...link, label } : link));
    setShapes(previous => previous.map(shape => shape.id === id ? { ...shape, label } : shape));
  };
  const changeShapeText = (id, text) => {
    setEditingShape(null);
    if (present.current.shapes.some(shape => shape.id === id && (shape.text || '') !== text)) snapshot();
    setShapes(previous => previous.map(shape => shape.id === id ? { ...shape, text } : shape));
  };
  const resizeShape = (id, patch) => setShapes(previous => previous.map(shape => shape.id === id ? { ...shape, ...patch } : shape));
  const moveShapeStart = (event, shape) => {
    // Pressing a shape that is already selected reopens its style panel too.
    setStyleOpen(null);
    snapshot();
    // A shape inside a selection drags the whole selection, the way cards do.
    const targets = groupTargets(shape.id);
    if (targets.length > 1) {
      let last = { x: shape.x1, y: shape.y1 };
      startDrag(event, { x: shape.x1, y: shape.y1 }, (x, y) => {
        shift(x - last.x, y - last.y, targets);
        last = { x, y };
      }, view.z);
      return;
    }
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
  // Ask about selection: the crosshair wins over every card's own cursor, slides included.
  const cursor = tool === 'askArea' ? 'cursor-crosshair [&_*]:!cursor-crosshair' : tool === 'hand' ? 'cursor-grab' : inking || tool === 'eraser' || shapeTool ? 'cursor-crosshair' : tool === 'select' ? '' : 'cursor-copy';
  // The rail answers to the blank canvas right of the column, where its buttons
  // live; over the cards themselves it would only be in the way. Held by index
  // rather than by value so the line keeps following the cards as they move.
  // With a sketch as the target, the style panel follows the sketch's selection and restyles its marks.
  const sketchMarks = drawTarget ? blocks.find(block => block.id === drawTarget)?.sketch : null;
  const panel = drawTarget
    ? panelFor({ tool, selection: sketchSel, shapes: sketchMarks?.shapes || [], links: [], items: sketchMarks?.items || [] })
    : panelFor({ tool, selection, shapes, links, items });
  const showStyle = styleOpen === null ? panel.open : styleOpen;
  // The separator spans the viewport, converted into world units, so it looks
  // the same width at any zoom instead of growing and shrinking with the column.
  const railSpan = (() => {
    const width = surface.current?.clientWidth || 0;
    const inset = RAIL_INSET / view.z;
    return width
      ? { left: -view.x / view.z + inset, width: Math.max(COLUMN, width / view.z - inset * 2) }
      : { left: 0, width: COLUMN };
  })();
  // Enough pages to cover the content and whatever is on screen, so there is
  // always a page under the pen rather than a boundary you have run past.
  const pageGuides = pages
    ? pageRects(Math.max(
        ...Object.values(bounds).map(box => box.y + box.h),
        ...shapes.map(shape => Math.max(shape.y1, shape.y2)),
        ...items.map(item => item.y + (item.h || 40)),
        ((surface.current?.clientHeight || 0) - view.y) / view.z,
        0,
      ), COLUMN, pages === 'landscape')
    : [];
  const minimapBoxes = [
    ...Object.entries(bounds).map(([id, box]) => (divePortals?.portals?.[id] ? { ...box, hole: true } : box)),
    ...shapes.map(shape => ({ x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2), w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) })),
    ...items.map(item => ({ x: item.x, y: item.y, w: item.w || 160, h: item.h || 40 })),
  ];
  // The gutter's overview is the phone strip's; from 641px of canvas the minimap sits lower right in the bottom strip.
  const overviewOpen = minimap && shellWidth > 0 && shellWidth < 641 && !!overview;
  const onCanvas = presenting === null ? contentBoxes() : [];
  const gaps = gapsFrom(onCanvas);
  const trackGap = event => {
    if (gapAdding) return; // the rail must not slide away while its menu is open
    if (drawing || tool !== 'select') return setHoverGap(null);
    // On a rail's own buttons it stays put, even as [+]/[-] move its line.
    if (event.target.closest?.('[data-gap-rail]')) return;
    // Near a dotted line - anywhere along it - brings its buttons to full strength.
    const found = nearestGap(gaps, local(event).y, 40 / view.z);
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
    <div ref={shell} className="@container relative flex h-full min-h-0 flex-col"
      onPointerDownCapture={event => {
        const active = document.activeElement;
        if (!active || active === document.body) return;
        const editable = typingIn(active);
        // data-keep-focus marks controls that act ON the focused text - the
        // level pill - where a press must restyle, never blur. This runs in
        // the capture phase, so the pill's own stopPropagation cannot save it.
        if (editable && !active.contains(event.target) && !event.target.closest?.('[data-keep-focus]')) active.blur();
      }}>
      {/* The canvas and its tools share this row and never overlap: the tools get
          their own gutter (a strip below when too narrow for one), so nothing on
          the canvas can be panned under them and no card has to know they exist. */}
      <div className="flex min-h-0 flex-1 @max-[640px]:flex-col">
      {/* With the grid on, the canvas draws its own dots instead of borrowing
          the page's: these ride the camera, so the grid you snap to is the grid
          you can see. An opaque surface keeps the page dots from showing through
          and doubling them up. */}
      {/* Voice Mode's Tutor caption (VoiceMode.jsx): a zero-width anchor after the tools gutter (which docks
          order-first), so the small caption window floats at the surface's lower left, above the zoom pill, as the
          owner asked (2026-10-01). On a phone it is an in-flow strip. Never while presenting. It sits over the canvas
          but outside the surface's drop target, so a file dropped on it is ignored rather than opened by the browser.
          The rail is one stack there (owner, 2026-10-06), held in the stack's flow instead of its own corner; the
          Professor Next Steps card left it for the lower right, beside the composer (owner, 2026-10-08: `hooks` below).
          The stack stays left of the centred dock (780 px) and the answer sheet above it, down to 208 px wide. */}
      {leftRail && presenting === null && <div data-voice-rail className="relative z-20 w-0 shrink-0 @max-[640px]:w-full"
        onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()}>
        <div data-left-stack className="absolute bottom-[calc(var(--chrome-left,0px)+0.75rem)] left-3 flex w-[clamp(208px,calc(50cqw-500px),300px)] flex-col items-start gap-2 [&>[data-tutor-caption]]:relative [&>[data-tutor-caption]]:inset-auto @max-[640px]:static @max-[640px]:w-full">{leftRail}</div>
      </div>}
      <div ref={surface} data-canvas-surface onPointerDownCapture={tool === 'askArea' ? startArea : undefined} data-presenting={presenting !== null ? '' : undefined} onPointerDown={down} onPointerMove={trackGap} onPointerLeave={() => { if (!gapAdding) setHoverGap(null); }}
        onContextMenu={event => {
          event.preventDefault();
          if (event.ctrlKey || marqueeRef.current || presenting !== null) return;
          const hit = event.target.closest('[data-block-id],[data-item-id],[data-shape-id]');
          let id = hit?.dataset.blockId || hit?.dataset.itemId || hit?.dataset.shapeId || null;
          // A view-only board presses through the hand, so a card is found by its bounds - as its click selection does.
          if (!id && readOnlyRef.current) {
            const at = local(event);
            id = Object.entries(boundsRef.current).find(([key, box]) => blocksRef.current.some(block => block.id === key) && at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h)?.[0] || null;
          }
          const groupHit = !id && event.target.closest('[data-group-box],[data-group-chip]');
          const group = groupHit ? groupHit.dataset.groupBox || groupHit.dataset.groupChip : null;
          // view-only: a card's Start Rabbit Hole, a commenter's Add comment on an object or group, or no menu
          if (readOnlyRef.current && !(onAddComment && (id || group)) && (!onStartRabbitHole || !blocksRef.current.some(block => block.id === id))) { setMenuAt(null); return; }
          if (id && !selectedRef.current.includes(id)) select(id);
          if (group) setSelection(membersOf(group));
          const root = surface.current.getBoundingClientRect();
          setMenuAt({ x: event.clientX - root.left, y: event.clientY - root.top, id, group });
        }}
        onDragOver={event => { if (onDropFiles && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDropHover(true); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropHover(false); }}
        onDrop={event => { if (!onDropFiles) return; event.preventDefault(); setDropHover(false); onDropFiles([...event.dataTransfer.files], local(event)); }}
        style={grid ? { background: 'var(--color-white)', backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)', backgroundSize: `${GRID * view.z}px ${GRID * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px` } : undefined}
        className={`relative min-h-0 flex-1 touch-none overflow-hidden ${cursor} ${dropHover ? 'ring-2 ring-accent ring-inset' : ''}`}>
        <LaserPointer on={presenting !== null && laser} />
        <div ref={worldRef} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: '0 0' }} className={`absolute top-0 left-0 ${glide ? 'transition-transform duration-200 ease-out motion-reduce:transition-none' : ''}`}>
        {/* Page guides sit inside the camera, so they pin to the content: the
            boundary keeps its width in cards, not in screen pixels. */}
        {pages && (
          <svg width="1" height="1" aria-hidden="true" className="pointer-events-none absolute top-0 left-0 -z-10 overflow-visible">
            {pageGuides.map(page => (
              <g key={page.n}>
                <rect x={page.x} y={page.y} width={page.w} height={page.h} fill="none" stroke="var(--color-line-strong)" strokeWidth={1 / view.z} />
                <text x={page.x + page.w - 8} y={page.y + page.h - 8} textAnchor="end" fill="var(--color-ink-3)" fontSize={12 / view.z}>{page.n}</text>
              </g>
            ))}
          </svg>
        )}
        <svg width="1" height="1" className="pointer-events-none absolute top-0 left-0 overflow-visible">
          {links.map(link => {
            const path = linkRoute(link);
            if (!path || connecting?.hide === link.id) return null;
            const ink = inkAware(link.color);
            return (
              <g key={link.id} data-connection={link.id} className="dark:[filter:brightness(1.5)_saturate(1.2)]">
                <path d={path.d} fill="none" stroke={ink} strokeWidth={isSelected(link.id) ? 4 : 2.5} strokeLinejoin="round" />
                {link.head && arrowHead(path.tip, path.from, { stroke: ink, strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })}
                <path d={path.d} fill="none" stroke="transparent" strokeWidth={14 / view.z} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onPointerDown={event => { event.stopPropagation(); select(link.id, event); }}
                  onDoubleClick={() => setEditingLabel(link.id)}><title>Select connection · choose a color, a route or press Delete · double-click to label</title></path>
                <LineLabel at={path.mid} text={link.label} color={link.color} editing={editingLabel === link.id} pickable={isSelected(link.id) && tool === 'select'} onPick={() => setEditingLabel(link.id)} onDone={value => changeLabel(link.id, value)} />
                {isSelected(link.id) && tool === 'select' && editingLabel !== link.id && !link.label && <LabelHandle at={path.mid} zoom={view.z} onPick={() => setEditingLabel(link.id)} />}
              </g>
            );
          })}
          {connecting?.snap && <circle cx={connecting.snap.at.x} cy={connecting.snap.at.y} r={9} fill="white" stroke={connecting.color} strokeWidth="3" />}
          {connecting && <path data-connection-preview d={connectionPath(connecting)} fill="none" stroke={inkAware(connecting.color)} strokeWidth="2.5" strokeLinejoin="round" className="dark:[filter:brightness(1.5)_saturate(1.2)]" />}
        </svg>
        <svg aria-hidden="true" data-ink width="1" height="1" className="pointer-events-none absolute top-0 left-0 z-10 overflow-visible">
          {[...shapes, ...(liveShape ? [liveShape] : [])].map(shape => <ShapeView key={shape.id} shape={shape} tool={tool} zoom={view.z} selected={isSelected(shape.id)} editing={editingShape === shape.id} onSelect={select} onMoveStart={moveShapeStart} onResize={resizeShape} onGesture={snapshot} onDelete={deleteItem}
            onEdit={setEditingShape} onText={changeShapeText} onConnect={connect} showPorts={!!connecting}
            labelEditing={editingLabel === shape.id} onLabel={setEditingLabel} onLabelDone={changeLabel} />)}
          {[...strokes, ...(live ? [live] : [])].map(inkPath)}
        </svg>
        {/* The ends of a selected connector, above the shapes: its head sits on
            a shape's port, and a press there must move the head, not start a
            new connection from that port. */}
        {tool === 'select' && (
          <svg width="1" height="1" className="pointer-events-none absolute top-0 left-0 z-20 overflow-visible">
            {links.filter(link => isSelected(link.id) && connecting?.hide !== link.id).flatMap(link => {
              const path = linkRoute(link);
              return path ? [['from', portPosition(link.from, link.fromSide)], ['to', path.tip]].map(([end, at]) => at && (
                <circle key={`${link.id}-${end}`} data-link-for={link.id} data-link-end={end} cx={at.x} cy={at.y} r={6 / view.z} fill="white" stroke="#2383e2" strokeWidth={1.5 / view.z}
                  style={{ pointerEvents: 'all', cursor: 'move' }} onPointerDown={event => repoint(event, link, end)}><title>Drag to attach this end somewhere else</title></circle>
              )) : [];
            })}
          </svg>
        )}
        <div ref={column} style={{ width: COLUMN }} className={`absolute top-0 left-0 flex flex-col gap-5 ${drawing || tool === 'eraser' || tool === 'hand' ? 'pointer-events-none' : ''}`}>
          {/* An answer to a red box lives beside it: out of the column flow (no height, no gap), so asking never pushes the slides or the box down. */}
          {exchanges.map(exchange => (String(exchange.linkFrom).startsWith('area:')
            ? <div key={exchange.id} className="-mb-5 h-0 overflow-visible"><ChatCard exchange={exchange} zoom={view.z} selected={isSelected(exchange.id)} connected={portsInUse[exchange.id]} boardId={blocks.find(block => block.id === exchange.linkFrom && block.type === 'whiteboard')?.id} onSelect={select} onMove={moveNode} onSize={onResize} onReply={onReply} renderComposer={renderBlockComposer && ((exchange, receive) => renderBlockComposer(exchange, receive, linkedTarget(exchange)))} onLayout={measureBlocks} onConnect={connect} onSnap={snapForNode} onFile={onOpenFile} /></div>
            : <ChatCard key={exchange.id} exchange={exchange} zoom={view.z} selected={isSelected(exchange.id)} connected={portsInUse[exchange.id]} boardId={blocks.find(block => block.id === exchange.linkFrom && block.type === 'whiteboard')?.id} onSelect={select} onMove={moveNode} onSize={onResize} onReply={onReply} renderComposer={renderBlockComposer && ((exchange, receive) => renderBlockComposer(exchange, receive, linkedTarget(exchange)))} onLayout={measureBlocks} onConnect={connect} onSnap={snapForNode} onFile={onOpenFile} />))}
          <SketchHost.Provider value={sketchHost}><CardOpen.Provider value={cardOpen}>
            {columnEntries(blocks, slots).map(({ block, slot }) => slot ? <SlotCard key={slot.id} slot={slot} /> : <LessonBlockCard key={block.id} block={block} zoom={view.z} selected={isSelected(block.id)} connected={portsInUse[block.id]} onSelect={select} onMove={moveNode} onChange={changeBlock} onChangeQuiet={changeBlockQuietly} onLayout={measureBlocks} onConnect={connect} onSnap={snapForNode} onAsk={askBlock} onFile={onOpenFile} appName={appName} onAskRegion={askRegion} onGrade={onGrade} onWiki={onWiki} onWatch={onWatch} />)}
          </CardOpen.Provider></SketchHost.Provider>
        </div>
        {readOnly && selected && bounds[selected] && (
          <div data-view-selection={selected} aria-hidden="true" style={{ left: bounds[selected].x - 3, top: bounds[selected].y - 3, width: bounds[selected].w + 6, height: bounds[selected].h + 6 }}
            className="pointer-events-none absolute z-20 rounded-[14px] ring-2 ring-[#2383e2]" />
        )}
        {/* The gap near the pointer shows its dotted line and [-] [+] [...] at the far left. */}
        {presenting === null && !readOnly && gaps.filter(gap => gap.index === hoverGap).map(gap => (
          <GapRail key={gap.index} gap={gap} zoom={view.z} span={railSpan}
            // Its buttons start at the far left; the toolbar is in its own gutter, never over them.
            edge={-view.x / view.z}
            adding={gapAdding}
            onNudge={delta => nudgeGap(gap, delta)}
            onAdding={open => { setHoverGap(gap.index); setGapAdding(open); }} onAddHeading={insertHeadingAt} />
        ))}
        {presenting === null && areas.length > 0 && (
          <svg data-area-mark width="1" height="1" className="pointer-events-none absolute top-0 left-0 z-30 overflow-visible">
            {areas.map(stored => ({ ...areaBox(stored), id: stored.id })).map(area => (
              <g key={area.id}>
                <rect x={area.x} y={area.y} width={area.w} height={area.h} fill="rgba(220, 38, 38, 0.08)" stroke="#dc2626" strokeWidth={2 / view.z} pointerEvents="none" />
                {/* A small x on the top-right corner removes the box (and its chip); the cards inside stay usable. */}
                <g data-area-remove={area.id} transform={`translate(${area.x + area.w} ${area.y}) scale(${1 / view.z})`} pointerEvents="all" className="cursor-pointer"
                  onPointerDown={event => event.stopPropagation()}
                  onClick={event => { event.stopPropagation(); setAreas(previous => previous.filter(entry => entry.id !== area.id)); if (askTargetId === area.id) onAskTargetRef.current?.(null); }}>
                  <title>Remove this selection</title>
                  <circle r="8" fill="#dc2626" />
                  <path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
                </g>
              </g>
            ))}
          </svg>
        )}
        {areaMarquee && (
          <svg data-area-marquee width="1" height="1" aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-30 overflow-visible">
            <rect x={Math.min(areaMarquee.x1, areaMarquee.x2)} y={Math.min(areaMarquee.y1, areaMarquee.y2)}
              width={Math.abs(areaMarquee.x2 - areaMarquee.x1)} height={Math.abs(areaMarquee.y2 - areaMarquee.y1)}
              fill="rgba(220, 38, 38, 0.06)" stroke="#dc2626" strokeWidth={2 / view.z} strokeDasharray={`${6 / view.z} ${4 / view.z}`} />
            {areaMarquee.busy && <text x={Math.min(areaMarquee.x1, areaMarquee.x2) + 6 / view.z} y={Math.min(areaMarquee.y1, areaMarquee.y2) - 6 / view.z} fill="#dc2626" fontSize={12 / view.z} fontWeight="600">Capturing…</text>}
          </svg>
        )}
        {marquee && (
          <svg width="1" height="1" aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-30 overflow-visible">
            <rect x={Math.min(marquee.x1, marquee.x2)} y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)} height={Math.abs(marquee.y2 - marquee.y1)}
              fill="rgba(35, 131, 226, 0.08)" stroke="#2383e2" strokeWidth={1 / view.z} strokeDasharray={`${4 / view.z} ${3 / view.z}`} />
          </svg>
        )}
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
        {presenting === null && groups.map(group => {
          const members = [...blocks, ...items, ...shapes, ...exchanges].filter(entry => entry.groupId === group.id);
          if (members.length < 2) return null;
          let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
          const grow = (x, y, w, h) => { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + w); bottom = Math.max(bottom, y + h); };
          for (const member of members) {
            const box = bounds[member.id];
            if (box) { grow(box.x, box.y, box.w, box.h); continue; }
            if (member.x1 !== undefined) { grow(Math.min(member.x1, member.x2), Math.min(member.y1, member.y2), Math.abs(member.x2 - member.x1), Math.abs(member.y2 - member.y1)); continue; }
            // Text and stickies: state carries no measured height, so estimate.
            if (member.x !== undefined) grow(member.x, member.y, member.w || (member.kind === 'sticky' ? 160 : 220), member.h || (member.kind === 'sticky' ? 160 : 40));
          }
          if (!Number.isFinite(left)) return null;
          const pad = 12;
          const active = members.some(member => selection.includes(member.id));
          const portal = divePortals?.portals?.[group.id];
          return (
            <div key={group.id}>
              {/* The group's own body: an outline you can see, and a surface
                  you can grab - press anywhere inside, empty space included,
                  and the whole group moves. It sits under the members (no
                  z-index), so their own handlers still win on top of them.
                  Ctrl presses and non-select tools fall through to the canvas. */}
              <div data-group-box={group.id}
                style={{ left: left - pad, top: top - pad, width: right - left + pad * 2, height: bottom - top + pad * 2 }}
                className={`absolute rounded-xl border ${active ? 'border-[#2383e2] bg-[#2383e2]/[0.03]' : 'border-line-strong'} ${portal ? (portal.pending ? 'outline-8 outline-offset-1 outline-hole-pending/40' : 'outline-8 outline-offset-1 outline-hole/80') : ''} cursor-grab active:cursor-grabbing`}
                onDoubleClick={divePortals ? () => (portal ? divePortals.enter(portal.name) : divePortals.open?.(group.id, group.label || `${members.length} items`)) : undefined}
                onPointerDown={event => {
                  if (event.button !== 0 || tool !== 'select' || event.ctrlKey || event.metaKey) return;
                  event.stopPropagation();
                  const targets = membersOf(group.id);
                  setSelection(targets);
                  let last = local(event);
                  startDrag(event, last, (x, y) => { shift(x - last.x, y - last.y, targets); last = { x, y }; }, view.z);
                }} />
              <div style={{ left: left - pad, top: top - pad - 28 }} className="absolute z-20 flex items-center gap-1">
                <GroupChip group={group} editOn={chipEdit === group.id}
                  onSelect={() => setSelection(membersOf(group.id))}
                  onLabel={label => { setChipEdit(null); setGroups(previous => previous.map(entry => entry.id === group.id ? { ...entry, label } : entry)); }} />
                {portal && <button type="button" data-dive-portal={portal.name} title={`Enter the Rabbit Hole: ${portal.title}`} onPointerDown={event => event.stopPropagation()} onClick={() => divePortals.enter(portal.name)}
                  className={`pointer-events-auto flex max-w-60 items-center gap-1 rounded-sm border bg-white px-2 py-0.5 text-[11px] text-hole shadow-sm hover:bg-hole/10 ${portal.pending ? 'border-dashed border-hole-pending' : 'border-hole/40'}`}>
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" className="shrink-0"><path d="M6 1.5V10M2.5 6.5 6 10l3.5-3.5" /></svg><span className="truncate">{portal.title}</span></button>}
              </div>
              {/* The same pill every card shows when selected, in the same
                  place: right above the outline, right-aligned. It arms the
                  composer with what the group holds. */}
              {active && (
                <div style={{ left: right + pad, top: top - pad - 40 }} className="absolute z-30 -translate-x-full">
                  <button type="button" data-group-ask title="Ask the tutor about this group"
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => {
                      armedId.current = null;
                      const entries = [];
                      for (const member of members) {
                        const block = blocksRef.current.find(entry => entry.id === member.id);
                        if (block) { const described = describeBlock(block); entries.push(described?.text ? { text: described.text } : { skipped: block.type }); continue; }
                        const exchange = exchangesRef.current.find(entry => entry.id === member.id);
                        if (exchange) { entries.push({ question: exchange.question, answer: exchange.answer }); continue; }
                        const item = itemsRef.current.find(entry => entry.id === member.id);
                        if (item?.text) entries.push({ text: item.text });
                        else if (item?.latex) entries.push({ text: describeCanvasObject(item).text });
                      }
                      armedGroup.current = group.id;
                      onAskTargetRef.current?.({ id: group.id, kind: 'Group', title: group.label || `${members.length} items`, text: groupTargetText(entries) });
                      askDraft(GROUP_QUESTION);
                      // The visuals ride too: a rendered snapshot of the
                      // outline area becomes this question's image context.
                      const memberIds = new Set(members.map(member => member.id));
                      groupShot({
                        box: { left, top, right, bottom }, members: memberIds,
                        strokes: strokes.filter(stroke => stroke.points?.some(point => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom)),
                        shapes, items, blocks, bounds, cachedAsset: loadAsset,
                        dark: document.documentElement.classList.contains('dark'),
                      }).then(blob => { if (blob) onGroupShotRef.current?.(blob, group.label || 'group', group.id); }).catch(() => { /* text still asks */ });
                    }}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-ink shadow-md hover:bg-hover">
                    <MessageCircle size={13} />Ask in chat
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={itemsLayer} className={drawing || tool === 'hand' ? 'pointer-events-none' : ''}>
          {items.map(item => item.kind === 'equation'
            ? <EquationItem key={item.id} item={item} zoom={view.z} tool={tool} selected={isSelected(item.id)} onSelect={select} onMove={moveItemNode} onGesture={snapshot} onDelete={deleteItem} onSnap={snapForItem} onPatch={patchItem} onDone={finishEquation} />
            : <CanvasItem key={item.id} item={item} zoom={view.z} tool={tool} selected={isSelected(item.id)} onSelect={select} onChange={changeItem} onMove={moveItemNode} onResize={resizeItem} onGesture={snapshot} onDelete={deleteItem} onSnap={snapForItem}
            onLevel={(id, value) => { snapshot(); setItems(previous => previous.map(entry => entry.id === id ? { ...entry, level: value } : entry)); }} />)}
          {/* A shape's ladder sits in this HTML layer, above the shape: the ink
              SVG is aria-hidden, and the ladder must stay reachable. */}
          {shapes.filter(shape => TEXT_BOX[shape.kind] && (editingShape === shape.id || (tool === 'select' && selection.length === 1 && selection[0] === shape.id))).map(shape => (
            <LevelPill key={`level-${shape.id}`} level={shape.level} className="absolute z-20"
              style={{ left: Math.min(shape.x1, shape.x2), top: Math.min(shape.y1, shape.y2) - 42 }}
              onLevel={value => { snapshot(); setShapes(previous => previous.map(entry => entry.id === shape.id ? { ...entry, level: value } : entry)); }} />
          ))}
        </div>
        </div>
        {/* Comment pins (docs/features/canvas-comments.md): over the camera at a constant size; never while presenting. */}
        {commentPins && presenting === null && <CommentPins pins={commentPins} view={view} board={commentBoard} slotOf={commentSlot} onPin={onCommentPin} picked={pinPick} onPick={pickPin} ask={pinAsk} onConfirm={() => deletePin(pinPick)} onCancel={() => setPinAsk(null)} />}
        {menuAt && presenting === null && (() => {
          const grouped = selection.map(id => [...blocks, ...items, ...shapes, ...exchanges].find(entry => entry.id === id)?.groupId).filter(Boolean);
          const act = action => () => { action(); setMenuAt(null); };
          // What was actually clicked decides the top rows; the core set below
          // acts on the whole selection.
          const block = blocks.find(entry => entry.id === menuAt.id) || null;
          const chat = exchanges.find(entry => entry.id === menuAt.id) || null;
          const attached = sourceId => (attachedIds ? attachedIds.includes(sourceId) : true);
          const attachRow = (sourceId, label) => (
            <MenuRow key={sourceId} icon={attached(sourceId) ? Unlink : Paperclip} onClick={act(() => onCardActionRef.current?.('attach-toggle', { sourceId }))}>
              {attached(sourceId) ? `Detach ${label} from tutor` : `Attach ${label} to tutor`}
            </MenuRow>
          );
          const typed = [];
          if (block?.type === 'wiki') {
            typed.push(<MenuRow key="wr" icon={BookOpen} onClick={act(() => onCardActionRef.current?.('wiki-reader', { title: block.title, section: block.section || 0 }))}>Open in reader</MenuRow>);
            typed.push(<MenuRow key="ww" icon={ExternalLink} onClick={act(() => window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(block.title)}`, '_blank', 'noopener'))}>Open on Wikipedia</MenuRow>);
            typed.push(attachRow(`wiki:${block.id}`, 'article'));
          }
          if (block?.type === 'video') {
            typed.push(<MenuRow key="vy" icon={ExternalLink} onClick={act(() => window.open(`https://www.youtube.com/watch?v=${block.videoId}${block.start ? `&t=${Math.floor(block.start)}s` : ''}`, '_blank', 'noopener'))}>Open on YouTube</MenuRow>);
            typed.push(attachRow(`video:${block.id}`, 'video'));
          }
          if (block?.type === 'paper' && block.paper?.id) {
            typed.push(<MenuRow key="pp" icon={BookOpen} onClick={act(() => onCardActionRef.current?.('paper-reader', { id: block.paper.id, title: block.title, page: block.paper.page || 1 }))}>Open in reader</MenuRow>);
            typed.push(attachRow(`paper:${block.paper.id}`, 'paper'));
          }
          if (block?.type === 'pdf' && block.assetKey?.startsWith('pdf:')) {
            typed.push(<MenuRow key="pr" icon={BookOpen} onClick={act(() => onCardActionRef.current?.('pdf-reader', { id: block.assetKey.slice(4), title: block.label }))}>Open in reader</MenuRow>);
          }
          if (block?.type === 'file' && block.kind === 'image' && block.mediaId) {
            typed.push(<MenuRow key="ia" icon={Eye} onClick={act(() => onCardActionRef.current?.('image-attach', { blockId: block.id, mediaId: block.mediaId, label: block.label }))}>Show the tutor this image</MenuRow>);
            typed.push(attachRow(`image:${block.id}`, 'image'));
          }
          if (block?.type === 'heading') {
            typed.push(<MenuRow key="hd" icon={block.done ? Circle : CircleCheck} onClick={act(() => { snapshot(); setBlocks(previous => previous.map(entry => entry.id === block.id ? { ...entry, done: !entry.done } : entry)); })}>{block.done ? 'Mark not done' : 'Mark done'}</MenuRow>);
            typed.push(<MenuRow key="hp" icon={Play} onClick={act(() => presentFrom(block.id))}>Present from here</MenuRow>);
          }
          if (chat) {
            typed.push(<MenuRow key="ct" icon={Copy} onClick={act(() => navigator.clipboard?.writeText([chat.question, chat.answer].filter(Boolean).join('\n\n')))}>Copy text</MenuRow>);
          }
          // An equation asks as a selected card does (canvas-equations.md): its LaTeX rides as the context, a ready
          // question waits in the composer, nothing is sent, and the answer lands where any question's does.
          const equation = items.find(entry => entry.id === menuAt.id && entry.kind === 'equation' && entry.latex) || null;
          if (equation) {
            typed.push(<MenuRow key="ea" icon={MessageCircle} data-menu-ask-equation onClick={act(() => { if (armTarget(equation)) askDraft(EQUATION_QUESTION); })}>Ask in chat</MenuRow>);
            typed.push(<MenuRow key="el" icon={Copy} onClick={act(() => navigator.clipboard?.writeText(equation.latex))}>Copy LaTeX</MenuRow>);
          }
          const described = block ? describeBlock(block) : null;
          // Start Rabbit Hole (owner, 2026-10-07): from the right-clicked card, even when other cards are selected,
          // through the flow that already owns it - your canvas: the card's Rabbit Hole, entered when it has one and made
          // first otherwise (Dive.jsx, as opening it does); a view-only board: the viewer's own private Rabbit Hole
          // (shared-canvas-rabbit-hole.md). Only the click starts anything; opening or dismissing the menu does not.
          const portal = block && divePortals?.portals?.[block.id];
          const startHole = !block ? null
            : divePortals?.open && !readOnly ? () => (portal ? divePortals.enter(portal.name) : divePortals.open(block.id, undefined, 'learner_menu'))
            : readOnly && onStartRabbitHole ? () => onStartRabbitHole(block.id) : null;
          // Add comment (docs/features/canvas-comments.md section 5): the pin goes where the right-click was, on the object
          // or group under it (relative to it, so it follows) or on the canvas. Only the page's panel saves anything.
          const commentOn = menuAt.id || menuAt.group;
          const addComment = onAddComment && (() => commentAt({ x: (menuAt.x - view.x) / view.z, y: (menuAt.y - view.y) / view.z }, commentOn));
          return (
            <div ref={menuBox} role="menu" aria-label="Canvas actions" data-canvas-menu style={{ left: menuPos?.x ?? menuAt.x, top: menuPos?.y ?? menuAt.y, maxHeight: menuPos?.maxH, visibility: menuPos ? undefined : 'hidden' }}
              className="absolute z-40 w-60 overflow-y-auto rounded-md border border-line bg-white p-1 shadow-pop"
              onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
              {/* Start Rabbit Hole's own mark, as on the shared page's header and the Explore card. */}
              {startHole && <MenuRow icon={ArrowDownToLine} data-menu-start-rabbit-hole data-origin={block.id} onClick={act(startHole)}>Start Rabbit Hole</MenuRow>}
              {addComment && commentOn && <MenuRow icon={MessageCircle} data-menu-add-comment aria-keyshortcuts="C" hint="C" onClick={act(addComment)}>Add comment</MenuRow>}
              {/* A view-only board edits nothing: Start Rabbit Hole is its only card action here. */}
              {!readOnly && <>
              {described && <MenuRow icon={CircleHelp} onClick={act(() => askBlock(block))}>Ask about this</MenuRow>}
              {typed}
              {(described || typed.length > 0) && <div className="my-1 h-px bg-line" />}
              <MenuRow icon={CopyPlus} disabled={!selection.length} onClick={act(() => pasteIds(selection))}>Duplicate</MenuRow>
              <MenuRow icon={ZoomIn} disabled={!selection.length} onClick={act(zoomToSelection)}>Zoom to selection</MenuRow>
              <div className="my-1 h-px bg-line" />
              <MenuRow icon={Group} disabled={selection.length < 2} onClick={act(groupSelection)}>Group</MenuRow>
              <MenuRow icon={Ungroup} disabled={!grouped.length} onClick={act(ungroupSelection)}>Ungroup</MenuRow>
              <MenuRow icon={Pencil} disabled={!grouped.length} onClick={act(() => setChipEdit(grouped[0]))}>Rename group</MenuRow>
              <div className="my-1 h-px bg-line" />
              <MenuRow icon={BoxSelect} onClick={act(selectAll)}>Select all</MenuRow>
              <MenuRow icon={Trash2} disabled={!selection.length} onClick={act(deleteSelection)}>Delete</MenuRow>
              </>}
            </div>
          );
        })()}
      </div>
      {/* The tools' gutter: 60px beside the canvas (168px while the overview is
          open), the toolbar and overview hanging the rest of their width into the
          page edge as before. It sits on the side the toolbar docks (left by
          default; drag the grip to move it), and docked right it keeps clear of
          the page's contents rail (edgeInset). Below 640px of canvas it is one
          row under the canvas instead - the toolbar scrolling in it - with the
          overview on the next row. The style panel opens from it. */}
      {/* The Rabbit Hole navigator's own gutter, top right, while the tools dock left (Dive.jsx). */}
      {presenting === null && gutterTop && toolSide === 'left' && <div data-dive-gutter className="flex w-[84px] shrink-0 flex-col items-end pt-1 pr-4 @max-[640px]:hidden">{gutterTop}</div>}
      {presenting === null && (
        <div ref={gutter} data-tool-gutter
          // Docked right it mirrors the left side (84/192px, 8px in from the edge) and clears the contents rail (edgeInset); the full-bleed Learn shell has no page padding for a hang.
          style={{ '--edge': `${edgeInset || 0}px` }}
          className={`relative flex shrink-0 flex-col justify-center gap-2 ${toolSide === 'left' ? `order-first items-start pl-2 pb-(--chrome-left) ${overviewOpen ? 'w-[192px]' : 'w-[84px]'}` : `items-end pr-2 mr-(--edge) pb-(--chrome-right) ${overviewOpen ? 'w-[192px]' : 'w-[84px]'}`} @max-[640px]:order-first @max-[640px]:pb-0 @max-[640px]:mr-0 @max-[640px]:grid @max-[640px]:w-full @max-[640px]:grid-cols-[auto_minmax(0,1fr)_auto] @max-[640px]:items-center @max-[640px]:pt-2 @max-[640px]:pl-0`}>
        {/* The Rabbit Hole navigator (Dive.jsx): top of the gutter, the tools centred in the rest. */}
        {/* Top of the tools gutter: the Rabbit Hole navigator when the tools dock right. Canvas home is the page's top-left corner (LearnPage). */}
        <div data-gutter-top className={`mb-auto flex flex-col gap-3 ${import.meta.env.VITE_COACHING_DEV === 'true' ? 'pt-12' : 'pt-3'} @max-[640px]:hidden ${toolSide === 'left' ? 'items-start self-start' : 'items-end self-end'}`}>
          {toolSide === 'right' && gutterTop}
        </div>
        {/* Dev-only workbench: drop any lesson block on the canvas to review its
            look before lessons are assembled. */}
        {!readOnly && import.meta.env.VITE_COACHING_DEV === 'true' && (
          <div className={`absolute top-3 ${toolSide === 'left' ? 'left-2' : '-right-6'} z-20 @max-[640px]:static @max-[640px]:col-start-1`}>
            <button type="button" aria-label="Insert lesson block" title="Insert a sample lesson block" aria-expanded={insertOpen}
              onClick={() => setInsertOpen(previous => !previous)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-white text-ink-2 shadow-md hover:text-ink">
              <Plus size={15} strokeWidth={1.7} />
            </button>
            {insertOpen && <BlockMenu className={`top-0 ${toolSide === 'left' ? 'left-10' : 'right-10'}`} filter={insertFilter} onFilter={setInsertFilter} onPick={type => (type === 'notebook' ? (snapshot(), insertAtView(newNotebookBlock()), setInsertOpen(false)) : type === 'youtube' ? (setInsertOpen(false), onSearch?.('youtube')) : insertBlock(type))} />}
          </div>
        )}
        {!readOnly && <div ref={toolbarRef} role="toolbar" aria-label="Canvas tools" data-draw-target={drawTarget ? 'sketch' : 'canvas'}
          style={toolDrag ? { position: 'absolute', left: toolDrag.x, top: toolDrag.y } : toolCap != null ? { maxHeight: toolCap } : undefined}
          className={`z-20 grid max-h-full shrink-0 grid-cols-2 gap-0.5 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-md @max-[640px]:col-start-2 @max-[640px]:mr-0 @max-[640px]:min-w-0 @max-[640px]:grid-flow-col @max-[640px]:grid-cols-none @max-[640px]:grid-rows-1 @max-[640px]:overflow-x-auto`}>
          {/* The handle: drag the palette and it parks on whichever edge you let
              go nearer to - left or right - never floating mid-canvas. A phone's
              strip sits under the canvas either way, so it has no handle. */}
          <div role="button" aria-label="Move the toolbar" title="Drag to the left or right edge"
            className="col-span-2 flex h-5 cursor-grab items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink active:cursor-grabbing @max-[640px]:hidden"
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.preventDefault(); event.stopPropagation();
              const root = event.currentTarget.closest('[role="toolbar"]').parentElement.getBoundingClientRect();
              const frame = shell.current.getBoundingClientRect();
              const palette = event.currentTarget.closest('[role="toolbar"]').getBoundingClientRect();
              const grip = { x: event.clientX - palette.left, y: event.clientY - palette.top };
              const move = pointer => setToolDrag({ x: pointer.clientX - root.left - grip.x, y: pointer.clientY - root.top - grip.y });
              move(event);
              const up = pointer => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                setToolDrag(null);
                setToolSide(pointer.clientX < frame.left + frame.width / 2 ? 'left' : 'right');
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}>
            <GripHorizontal size={13} />
          </div>
          {/* The same tools, drawing into an Explain Back sketch: one toolbar, and it says where it draws. */}
          {drawTarget && <div data-sketch-badge title="These tools draw in the Explain Back sketch. Press the canvas or Esc to draw on the canvas again."
            className="col-span-2 rounded-md bg-[#2383e2]/10 py-0.5 text-center text-[10px] font-semibold tracking-wide text-[#2383e2] uppercase @max-[640px]:col-span-1 @max-[640px]:px-1.5">Sketch</div>}
          {NAV_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
          <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line @max-[640px]:col-span-1 @max-[640px]:mx-0.5 @max-[640px]:my-1.5 @max-[640px]:h-auto @max-[640px]:w-px" />
          {DRAW_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
          <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line @max-[640px]:col-span-1 @max-[640px]:mx-0.5 @max-[640px]:my-1.5 @max-[640px]:h-auto @max-[640px]:w-px" />
          {SHAPE_TOOLS.map(([value, Icon, label]) => <ToolButton key={value} value={value} Icon={Icon} label={label} active={tool === value} onPick={() => setTool(value)} />)}
          <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line @max-[640px]:col-span-1 @max-[640px]:mx-0.5 @max-[640px]:my-1.5 @max-[640px]:h-auto @max-[640px]:w-px" />
          {/* Keeps the armed tool armed after a draw, so shapes come in runs. */}
          <ToolButton Icon={lock ? Lock : LockOpen} label={lock ? 'Keep tool active — on' : 'Keep tool active — off'}
            active={lock} onPick={() => setLock(previous => !previous)} />
          {/* Alignment guides always run; this is the harder 18px grid on top. */}
          <ToolButton Icon={Grid3x3} label={grid ? 'Snap to grid — on' : 'Snap to grid — off'}
            active={grid} onPick={() => setGrid(previous => !previous)} />
          {/* The one control that never hides: the way back to the style panel
              once it has closed itself, showing what colour is currently armed. */}
          <button type="button" title="Style" aria-label="Style" aria-pressed={showStyle}
            onPointerDown={e => e.stopPropagation()} onClick={() => setStyleOpen(!showStyle)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${showStyle ? 'bg-hover' : 'hover:bg-hover'}`}>
            <span style={{ background: color }} className="h-4 w-4 rounded-full ring-1 ring-line" />
          </button>
        </div>}
        {/* The overview lives here, never over the canvas: open, the gutter
            widens to hold it (on a phone it takes its own line under the strip). */}
        {minimap && (
          <button type="button" aria-label={overviewOpen ? 'Hide overview' : 'Show overview'} title={overviewOpen ? 'Hide overview' : 'Show overview'}
            aria-expanded={overviewOpen} onClick={() => setOverview(!overviewOpen)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line shadow-md hover:text-ink @min-[641px]:hidden @max-[640px]:col-start-3 @max-[640px]:mr-0 ${overviewOpen ? 'bg-hover text-ink' : 'bg-white text-ink-2'}`}>
            <MapIcon size={15} strokeWidth={1.7} />
          </button>
        )}
        {overviewOpen && (
          <div className={`shrink-0 @max-[640px]:col-span-3 @max-[640px]:mr-0 @max-[640px]:justify-self-start`}>
            <CanvasMinimap boxes={minimapBoxes} view={view} onFit={zoomFit}
              surface={{ w: surface.current?.clientWidth || 0, h: surface.current?.clientHeight || 0 }}
              onView={next => setView(v => ({ ...v, x: next.x, y: next.y }))} />
          </div>
        )}
        <div aria-hidden="true" className="mt-auto @max-[640px]:hidden" />
        {!readOnly && showStyle && (
          <StylePanel side={toolSide} text={panel.text} showFill={panel.fill} fill={fill} corners={panel.corners} order={panel.order}
            route={panel.route} routeValue={panel.routeValue}
            onRoute={value => {
              setConnectorRoute(value);
              if (!panel.targets.length) return;
              snapshot();
              setLinks(previous => previous.map(link => panel.targets.includes(link.id) ? { ...link, route: value } : link));
              markLists().setShapes(previous => previous.map(shape => panel.targets.includes(shape.id) && shape.kind !== 'line' ? { ...shape, kind: ARROW_KINDS[value] } : shape));
            }}
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
        {!showStyle && pickedPin?.can.color && onPinColor && presenting === null && <StylePanel colorOnly side={toolSide} color={pickedPin.color || PIN_DEFAULT} onColor={colorPin} />}
        </div>
      )}
      </div>
      {/* Presenting replaces the zoom pill and composer with a step counter: the
          canvas is being shown, not worked on. */}
      {presenting !== null && (
        <div className="relative min-h-11 shrink-0 pt-3">
          <div className="absolute bottom-0 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-white px-1 py-0.5 shadow-md">
            <IconBtn title="Previous section" aria-label="Previous section" disabled={presenting === 0} onClick={() => showStep(presenting - 1)}><Back size={14} /></IconBtn>
            <span aria-live="polite" className="max-w-56 truncate px-2 text-xs text-ink-2">{presenting + 1} / {stepsRef.current.length} · {stepsRef.current[presenting]?.label}</span>
            <IconBtn title="Next section" aria-label="Next section" disabled={presenting >= stepsRef.current.length - 1} onClick={() => showStep(presenting + 1)}><Forward size={14} /></IconBtn>
            <span className="mx-0.5 h-5 w-px bg-line" />
            <button type="button" data-laser-toggle aria-pressed={laser} title="Laser pointer (L)" onClick={() => setLaser(on => !on)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${laser ? 'bg-red-50 text-red-600' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
              <span className={`h-2 w-2 rounded-full ${laser ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]' : 'bg-ink-3'}`} />Laser
            </button>
            <button type="button" onClick={stopPresenting} className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-hover hover:text-ink">Exit</button>
          </div>
        </div>
      )}
      {/* The bottom strip (owner, 2026-10-08: "move the minimap to the left bottom above the zoom buttons. so that they are
          all in one together" and "move the 3 hooks options window to the bottom right aligned with the lower of the chat
          composer"): lower left, the minimap above the zoom row, one group on one left edge; the composer in the middle;
          lower right, the Next Steps hooks, their bottom level with the composer's. The side columns grow equally, keeping
          the composer centred while there is room. On a phone the zoom row, then the hooks at the right, then a full-width
          composer, one per row (the overview lives in the tools' strip, at the top there).
          It floats (owner, 2026-10-08: "in the canvas above the chat composer you are cutting the canvas too much"): the
          canvas runs to the bottom, the strip is transparent and lets the pointer through, and only its controls (the
          strip's grandchildren) take it. Chrome may float over the canvas but never hides what the learner cannot reach:
          fit, focus and a new card's reveal stop above it (chromeTop), and panning brings anything out from under it. */}
      {presenting === null && <div data-canvas-bottom ref={bottomStrip} className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 md:flex-row md:items-end md:gap-3 ${DOCK_PAD} [&>*>*]:pointer-events-auto`}>
        <div className="flex items-end gap-2 md:min-w-fit md:flex-1 md:basis-0">
        {/* The page's own lower-left control (Learn: the feedback button). */}
        {bottomLeft}
        <div data-zoom-stack className="flex flex-col items-start gap-2">
        {minimap && <div data-canvas-minimap className="hidden md:block @max-[640px]:hidden">
          <CanvasMinimap boxes={minimapBoxes} view={view} onFit={zoomFit}
            surface={{ w: surface.current?.clientWidth || 0, h: surface.current?.clientHeight || 0 }}
            onView={next => setView(v => ({ ...v, x: next.x, y: next.y }))} />
        </div>}
        <div data-zoom aria-label="Zoom controls" className="z-20 flex items-center rounded-lg border border-line bg-white shadow-sm @max-[1024px]:static @max-[1024px]:mb-2 @max-[1024px]:w-fit">
          <IconBtn title="Scroll up" onClick={() => scrollBy(-1)}><ChevronUp size={14} /></IconBtn>
          <IconBtn title="Scroll down" onClick={() => scrollBy(1)}><ChevronDown size={14} /></IconBtn>
          <span className="mx-0.5 h-5 w-px bg-line" />
          <IconBtn title="Zoom out" onClick={() => zoomCenter(1 / 1.25)}><Minus size={14} /></IconBtn>
          <button type="button" title="Reset zoom" onClick={() => setView({ x: Math.max(24, (surface.current.clientWidth - COLUMN) / 2), y: 24, z: 1 })} className="min-w-11 px-1 text-center text-xs tabular-nums text-ink-2 hover:text-ink">{Math.round(view.z * 100)}%</button>
          <IconBtn title="Zoom in" onClick={() => zoomCenter(1.25)}><Plus size={14} /></IconBtn>
        </div>
        </div>
        </div>
        {/* The shared composer shell's footprint: DOCK_WIDTH in a DOCK_PAD strip (ChatComposer.jsx). */}
        {composer && <div data-canvas-composer className={`${DOCK_WIDTH} min-w-0 md:mx-0 md:shrink max-md:order-2`}>{composer}</div>}
        {/* Lower right: the hooks, bottom-aligned with the composer and right of it, the width the left stack gave them. It
            also balances the left column, so the composer stays centred. On a phone, above the composer at the right. */}
        <div data-canvas-lower-right className="flex justify-end md:min-w-fit md:flex-1 md:basis-0 max-md:order-1">
          {hooks && <div data-hooks-slot className="w-[clamp(208px,calc(50cqw-500px),300px)] empty:hidden max-md:w-[min(100%,300px)]">{hooks}</div>}
        </div>
      </div>}
    </div>
  );
}
