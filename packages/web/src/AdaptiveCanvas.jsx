import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Heading1, Heading2, Heading3, ChevronDown, ChevronLeft as Back, ChevronRight as Forward, ChevronUp, Ellipsis, GripHorizontal, Loader2, MessageCircle, Scan, X, ArrowUpRight, BringToFront, Circle, CornerDownRight, Diamond, Eraser, Grid3x3, Hand, Hexagon, Highlighter, Lock, LockOpen, Minus, MousePointer2, Pencil, Plus, SendToBack, Slash, Spline, Square, Squircle, Star, StickyNote, Triangle, Type } from 'lucide-react';
import { Md } from './ask.jsx';
import { IconBtn, toast } from './ui.jsx';
import { boardAsk } from './board-ask.js';
import { wsHeaders } from './api.js';
import { BLOCK_TYPES, LearningBlockBody, describeBlock } from './LearningBlocks.jsx';
import { gapsFrom, nearestGap, nudgeBy } from './learn-gap-rail.js';
import { panelFor, textStyle, stickyTone, dashArray, dashStyle, reorder, TEXT_LEVELS, DASH_STYLES, OPACITIES, ARROW_KINDS } from './learn-style-panel.js';
import CanvasMinimap from './CanvasMinimap.jsx';
import { presentSteps } from './learn-present.js';
import { pageRects, PAGE_W } from './learn-pages.js';
import { outlineFrom, applyOutlineOps } from './learn-outline-model.js';
import { loadAsset } from './learn-board-assets.js';
import { groupShot } from './learn-group-shot.js';
import LearnWiki from './LearnWiki.jsx';
import { momentGeometry, seekTo, clock, embedUrl } from './learn-video-moment.js';
import { snapMove, snapGrid, SNAP_TOLERANCE, GRID } from './learn-snap.js';
import NotebookBody from './NotebookCard.jsx';
import { activePath, newNotebookBlock } from './learn-notebook.js';
import { paletteSections, insertName } from './learn-insert-palette.js';
import { SIDES, shapeBox, sidePoint, nearestSide, routePath, polylineMid, freeElbow } from './learn-connectors.js';

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
        data-node-tool
        className={`absolute left-1/2 z-20 h-4 w-4 -translate-x-1/2 cursor-crosshair rounded-full border-2 border-accent bg-white focus:opacity-100 ${connected?.[side] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${side === 'top' ? '-top-2' : '-bottom-2'}`}
        onPointerDown={event => onConnect(event, id, side)} />)}
      <button type="button" aria-label="Resize chat block" title="Resize block" className="absolute right-0 bottom-0 z-10 cursor-nwse-resize p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink-2 focus:opacity-100"
        data-node-tool onPointerDown={resize}><svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M10 4 4 10 M10 8 8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg></button>
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
      <div className="min-h-0 flex-1 overflow-hidden rounded-b-xl border-t border-line"
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
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space}
      connected={connected} width={COLUMN} autoMax={620} saved={{ w: block.w }}
      onSize={(id, w) => onChange({ ...block, w })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-ink" />{clip ? 'Video' : 'Image'}<span className="truncate normal-case tracking-normal text-ink-3">{block.label}</span>
      </div>
      <div className="min-h-0 px-3 pb-3" onPointerDown={event => { if (clip && selected) event.stopPropagation(); }}>
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl border-t border-line"
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl border-t border-line"
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
  // A YouTube moment (videoId) gets its own card; a hosted or generated clip
  // (the + menu's Video blocks, src) renders as a lesson block.
  if (block.type === 'video' && block.videoId) return <VideoCard block={block} zoom={zoom} selected={selected} connected={connected} appName={appName} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} onWatch={onWatch} />;
  if (block.type === 'wiki') return <WikiCard block={block} zoom={zoom} selected={selected} connected={connected} appName={appName} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} onWiki={onWiki} />;
  if (block.type === 'file') return <FileCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  if (block.type === 'pdf') return <PdfCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  if (block.type === 'notebook') return <NotebookCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onChangeQuiet={onChangeQuiet} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
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
      <LearningBlockBody block={block} onChange={onChange} onChangeQuiet={onChangeQuiet} onFile={onFile} appName={appName} onAskRegion={onAskRegion} onGrade={onGrade} selected={selected} />
    </CanvasNode>
  );
}

// The H1-to-text ladder offered right on a selected text box or shape.
// pointerdown is swallowed so choosing a level never blurs or deselects.
function LevelPill({ level, onLevel, className = '', style = null }) {
  return (
    <div role="group" aria-label="Text level" data-keep-focus style={{ fontSize: 12, fontWeight: 400, ...style }}
      className={`flex w-max items-center gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-md ${className}`}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}>
      {TEXT_LEVELS.map(entry => (
        <button key={entry.id} type="button" aria-pressed={(level || 'body') === entry.id}
          onClick={() => onLevel(entry.id)}
          className={`rounded px-1.5 py-0.5 text-[11px] ${(level || 'body') === entry.id ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}
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
        <button type="button" aria-label={sticky ? 'Resize note' : 'Resize text box'} title="Resize"
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
      {selected && !linear && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} fill="none" stroke="#2383e2" strokeWidth="1" strokeDasharray="4 3" />}
      {selected && tool === 'select' && handles.map(([hx, hy, patch], index) => (
        <circle key={index} cx={hx} cy={hy} r={5 / zoom} fill="white" stroke="#2383e2" strokeWidth={1.5 / zoom}
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
function StylePanel({ side = 'right', inset = 0, clear = 76, text, showFill, corners, order, route = false, routeValue = null, color, fill, width, dash, opacity, round, level, onColor, onFill, onWidth, onDash, onOpacity, onRound, onLevel, onOrder, onRoute }) {
  const rule = <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />;
  return (
    <div role="group" aria-label="Style" onPointerDown={event => event.stopPropagation()} style={side === 'left' ? { left: 16 + clear } : { right: 16 + clear + inset }}
      className={`absolute top-1/2 z-20 grid max-h-full -translate-y-1/2 grid-cols-2 gap-0.5 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-md`}>
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

export default function AdaptiveCanvas({ exchanges, onMove, onSearch = null, onDelete = null, onRestore = null, onAskTarget = null, onOpenFile = null, onAdd = null, onGrade = null, onResize = null, onReply = null, appName = null, apiRef = null, onState = null, storageKey = null, seedBlocks = null, composer = null, renderBlockComposer = null, onWiki = null, onWatch = null, onDropFiles = null, onCardAction = null, attachedIds = null, onGroupShot = null, onPaper = null, edgeInset = 0, boardState = null, onSave = null, readOnly = false }) {
  // A view-only board pans and zooms with the hand and edits nothing.
  const [tool, setTool] = useState(readOnly ? 'hand' : 'select');
  const readOnlyRef = useRef(readOnly);
  // OS drag-and-drop of files onto the surface; the page owns what each kind
  // becomes, the canvas only announces the hover and hands the files over.
  const [dropHover, setDropHover] = useState(false);
  const [marquee, setMarquee] = useState(null);
  const [menuAt, setMenuAt] = useState(null); // right-click canvas actions
  const [chipEdit, setChipEdit] = useState(null); // group id whose chip should open for renaming
  // The tool palette hangs on the right by default; a drag on its handle can
  // park it on either edge. While dragging it follows the pointer.
  // The tools dock on the left by default; dragging the grip moves them.
  const [toolSide, setToolSide] = useState('left');
  // Measured each render so the style panel and the gap rail sit beside the
  // toolbar, never under it.
  const toolbarRef = useRef(null);
  const toolWidth = toolbarRef.current?.offsetWidth || 76;
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
  // Selection is a list: ctrl/cmd/shift-click adds to it, so several nodes
  // move or delete together.
  const [selection, setSelection] = useState([]);
  const selected = selection.length === 1 ? selection[0] : null; // single-target affordances
  const isSelected = id => selection.includes(id);
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
  const [links, setLinks] = useState(stored.current.links || []);
  // Named groups. Membership lives on the members themselves (groupId), so
  // undo restores it with them; this list only carries each group's label.
  const [groups, setGroups] = useState(stored.current.groups || []);
  // Every change also goes to onSave (a shared board's server copy), if given.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const firstSave = useRef(true);
  useEffect(() => {
    if (!storageKey && !onSaveRef.current) return;
    // ponytail: generated images are large data URLs; keep the prompt, drop the
    // bytes so one illustration cannot fill the browser's storage quota.
    const light = blocks.map(block => block.src?.startsWith('data:') && block.src.length > 120000 ? { ...block, src: '' } : block);
    // The first run is the board as loaded, not a change.
    const loaded = firstSave.current;
    firstSave.current = false;
    const timer = setTimeout(() => {
      const state = { strokes, shapes, items, links, blocks: light, groups };
      if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* full or blocked storage loses drawings only */ } }
      if (!loaded) onSaveRef.current?.(state);
    }, 400);
    return () => clearTimeout(timer);
  }, [strokes, shapes, items, links, blocks, groups, storageKey]);
  const [connecting, setConnecting] = useState(null);
  const [bounds, setBounds] = useState({});
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
  const itemsLayer = useRef(null);
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
  const onPaperRef = useRef(onPaper);
  onPaperRef.current = onPaper;
  // Put the camera around a set of boxes. Used both to find your way back to
  // everything, and to land on one section while presenting.
  const frame = (boxes, pad = 48, maxZoom = 1) => {
    const element = surface.current;
    if (!element || !boxes.length) return;
    const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.w)), bottom = Math.max(...boxes.map(box => box.y + box.h));
    const z = Math.max(0.2, Math.min(maxZoom, (element.clientWidth - pad * 2) / Math.max(1, right - left), (element.clientHeight - pad * 2) / Math.max(1, bottom - top)));
    // Centred horizontally; vertically too when the section is short enough to
    // sit in the middle of the screen, which is what reads as a slide.
    const height = (bottom - top) * z;
    setView({
      z,
      x: (element.clientWidth - (right - left) * z) / 2 - left * z,
      y: (height + pad * 2 < element.clientHeight ? (element.clientHeight - height) / 2 : pad) - top * z,
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
      // A dropped image, GIF, or clip. `mediaId` is the server copy an image
      // context can name later; GIFs and clips never have one.
      insertFile: ({ assetKey, kind, label, mediaId = null }) => {
        snapshot();
        return insertAtView({ id: crypto.randomUUID(), type: 'file', dx: 0, dy: 0, kind, assetKey, label, ...(mediaId ? { mediaId } : {}) });
      },
      // An arXiv paper as a card: the full reader - pages, zoom, Ask selection -
      // on the canvas. One card per paper; pointing at it again turns the page.
      insertPaper: ({ id, title, page = 1 }) => {
        const existing = blocksRef.current.find(block => block.type === 'paper' && block.paper?.id === id);
        if (existing) {
          if ((existing.paper.page || 1) !== page) { snapshot(); setBlocks(previous => previous.map(block => block.id === existing.id ? { ...block, paper: { ...block.paper, page, selection: undefined } } : block)); }
          bringIntoView(existing.id);
          return existing.id;
        }
        snapshot();
        return insertAtView({ id: crypto.randomUUID(), type: 'paper', dx: 0, dy: 0, title: title || `arXiv ${id}`, paper: { id, page } });
      },
      insertNotebook: () => {
        snapshot();
        return insertAtView(newNotebookBlock());
      },
      // A validated block from a / command (learn-slash.js).
      insertBlock: block => {
        snapshot();
        return insertAtView({ ...block, id: crypto.randomUUID(), dx: 0, dy: 0 });
      },
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
      focusBlock: id => {
        const box = boundsRef.current[id];
        if (!box) return;
        setSelection([id]);
        frame([box], 64, 1);
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
      insertWiki: ({ title, section = 0 }) => {
        const existing = blocksRef.current.find(block => block.type === 'wiki' && block.title === title);
        if (existing) {
          // Pointed at again - by the tutor, or a second pick: the card goes
          // back to that article and section, and comes into view.
          setBlocks(previous => previous.map(block => block.id === existing.id ? { ...block, section, openNonce: (block.openNonce || 0) + 1 } : block));
          bringIntoView(existing.id);
          return existing.id;
        }
        snapshot();
        return insertAtView({ id: crypto.randomUUID(), type: 'wiki', dx: 0, dy: 0, title, section });
      },
      insertVideo: ({ videoId, title, channel = null, start = 0, end = null, unverified = false, momentId = null }) => {
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
          return existing.id;
        }
        snapshot();
        return insertAtView({ id: crypto.randomUUID(), type: 'video', dx: 0, dy: 0, videoId, title, channel, start, end, ...(unverified ? { unverified: true } : {}), ...(momentId ? { momentId } : {}) });
      },
      // The divider used to live on the zoom pill; the menubar is its home now.
      toggleGrid: () => setGrid(previous => !previous),
      toggleMinimap: () => setMinimap(previous => !previous),
      togglePages: () => setPages(previous => !previous),
      // One snapshot for the whole restructure, so Ctrl+Z reverts the proposal
      // rather than one heading at a time.
      applyOutline: ops => { snapshot(); setBlocks(previous => applyOutlineOps(previous, ops)); },
      toggleSectionDone: id => { snapshot(); setBlocks(previous => previous.map(block => block.id === id ? { ...block, done: !block.done } : block)); },
      // Frame the section rather than scroll to it: a section is a heading plus
      // what follows, and the camera already knows how to land on one.
      showSection: id => {
        const steps = presentSteps(blocksRef.current, boundsRef.current);
        const step = steps.find(entry => entry.ids[0] === id) || steps.find(entry => entry.ids.includes(id));
        if (step) frame(step.boxes, 64, 1.2);
      },
      toggleLock: () => setLock(previous => !previous),
    };
    if (apiRef) apiRef.current = commandsRef.current;
  });
  // Menu checkmarks need these as state on the page, not as a ref it cannot watch.
  const outline = outlineFrom(blocks);
  // Serialised for the comparison on the page: the outline changes whenever a
  // heading is added, retitled, reordered or ticked, and only then.
  const outlineKey = JSON.stringify(outline);
  const cardsKey = JSON.stringify(blocks.map(block => [block.id, block.assetKey || null, block.paper?.id || null]));
  const connectionCleanup = useRef(null);
  const boundsRef = useRef({});
  const clipboard = useRef(null);
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
  // Move the camera only if the card is off screen - one in view stays put.
  const bringIntoView = id => {
    const box = boundsRef.current[id];
    const element = surface.current;
    if (!box || !element) return false;
    const top = box.y * view.z + view.y, bottom = (box.y + box.h) * view.z + view.y;
    if (top < 0 || bottom > element.clientHeight) setView(v => ({ ...v, y: element.clientHeight / 2 - (box.y + Math.min(box.h, element.clientHeight / v.z) / 2) * v.z }));
    return true;
  };
  useEffect(() => {
    const id = revealRef.current;
    if (id && bringIntoView(id)) revealRef.current = null;
  }, [bounds]); // eslint-disable-line react-hooks/exhaustive-deps
  shapesRef.current = shapes;
  onAddRef.current = onAdd;
  useLayoutEffect(measureBlocks, [exchanges, blocks, measureBlocks]);
  // What Edit and Arrange can act on right now, so their rows grey out
  // instead of doing nothing.
  const selectedCount = selection.length;
  const units = selectedCount > 1 ? arrangeUnits(selection).length : selectedCount;
  const grouped = selection.some(id => groupOf(id));
  useEffect(() => { onState?.({ grid, lock, minimap, pages, presenting: presenting !== null, outline: JSON.parse(outlineKey), cards: JSON.parse(cardsKey), selected: selectedCount, units, grouped, canPaste }); }, [grid, lock, minimap, pages, presenting, outlineKey, cardsKey, selectedCount, units, grouped, canPaste, onState]);
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
      if (readOnlyRef.current) return;
      // Presenting owns the keyboard: a walk, not an editing surface.
      if (presentingRef.current !== null) {
        if (event.key === 'Escape') { event.preventDefault(); stopPresentingRef.current(); return; }
        if ([' ', 'ArrowRight', 'ArrowDown', 'PageDown', 'Enter'].includes(event.key)) { event.preventDefault(); showStepRef.current(presentingRef.current + 1); return; }
        if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); showStepRef.current(presentingRef.current - 1); return; }
        return;
      }
      // Esc is the way home from anywhere: back to the pointer, nothing armed,
      // nothing half-done. A text box being typed in commits and lets go.
      if (event.key === 'Escape') {
        connectionCleanup.current?.(); setConnecting(null); setSelected(null);
        setTool('select'); setMenuAt(null); setStyleOpen(null);
        const focused = document.activeElement;
        if (focused?.isContentEditable && focused.closest('[data-item-id],[data-block-id],[data-shape-id],[data-connection]')) focused.blur();
        return;
      }
      const active = document.activeElement;
      const typing = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        if (typing || !clipboard.current?.length) return;
        if (pasteIdsRef.current(clipboard.current)) event.preventDefault();
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (typing) return;
      deleteSelectionRef.current();
    };
    // Capture phase: several lesson blocks stop keydown on their own container
    // (an embedded graph, a chart, a 3D view), which otherwise kills copy,
    // paste, undo and delete for the whole canvas while one is focused.
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
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
    const shape = shapesRef.current.find(entry => entry.id === id);
    if (shape) return sidePoint(shapeBox(shape), side);
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
  const down = event => {
    // A press on the canvas dismisses the floating chrome - the style island
    // and the dev insert menu - the way it already dismisses a menubar menu.
    if (showStyle) setStyleOpen(false);
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
      // A fresh text box opens long - a full writing line, not a stamp-sized
      // target - and the corner handle takes it anywhere from there.
      setItems(previous => [...previous, { id: crypto.randomUUID(), kind: tool, x: point.x, y: point.y, text: '', color, opacity, ...(tool === 'text' ? { level, w: 420 } : {}), fresh: true }]);
      if (!lock) setTool('select');
    } else {
      setSelected(null);
      pan(event);
    }
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
  const flowIndexAtView = () => {
    const { y } = viewCenter();
    const list = blocksRef.current;
    const at = list.findIndex(block => { const box = boundsRef.current[block.id]; return box && box.y + box.h / 2 > y; });
    return at < 0 ? list.length : at;
  };
  const insertAtView = block => {
    const index = flowIndexAtView();
    setBlocks(previous => [...previous.slice(0, index), block, ...previous.slice(index)]);
    return revealAfter(block.id);
  };
  // Once the new card is measured, nudge the camera only if it landed off
  // screen - a card inserted in view leaves the view alone.
  const revealRef = useRef(null);
  const revealAfter = id => { revealRef.current = id; return id; };
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
    setBlocks(previous => [...previous, { ...BLOCK_TYPES[type].sample(), dy }]);
    setInsertOpen(false);
    setInsertFilter('');
    if (element) setView(v => ({ ...v, y: Math.min(v.y, element.clientHeight - 280 - (24 + flowY + dy) * v.z) }));
  };
  const changeItem = (id, text) => {
    if (present.current.items.some(item => item.id === id && item.text !== text)) snapshot();
    setItems(previous => previous.map(item => item.id === id ? { ...item, text, fresh: false } : item));
  };
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
  const cursor = tool === 'hand' ? 'cursor-grab' : inking || tool === 'eraser' || shapeTool ? 'cursor-crosshair' : tool === 'select' ? '' : 'cursor-copy';
  // The rail answers to the blank canvas right of the column, where its buttons
  // live; over the cards themselves it would only be in the way. Held by index
  // rather than by value so the line keeps following the cards as they move.
  const panel = panelFor({ tool, selection, shapes, links, items });
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
      ), COLUMN)
    : [];
  const minimapBoxes = [
    ...Object.values(bounds),
    ...shapes.map(shape => ({ x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2), w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) })),
    ...items.map(item => ({ x: item.x, y: item.y, w: item.w || 160, h: item.h || 40 })),
  ];
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
    <div className="relative flex h-full min-h-0 flex-col"
      onPointerDownCapture={event => {
        const active = document.activeElement;
        if (!active || active === document.body) return;
        const editable = active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA';
        // data-keep-focus marks controls that act ON the focused text - the
        // level pill - where a press must restyle, never blur. This runs in
        // the capture phase, so the pill's own stopPropagation cannot save it.
        if (editable && !active.contains(event.target) && !event.target.closest?.('[data-keep-focus]')) active.blur();
      }}>
      {/* With the grid on, the canvas draws its own dots instead of borrowing
          the page's: these ride the camera, so the grid you snap to is the grid
          you can see. An opaque surface keeps the page dots from showing through
          and doubling them up. */}
      <div ref={surface} data-presenting={presenting !== null ? '' : undefined} onPointerDown={down} onPointerMove={trackGap} onPointerLeave={() => { if (!gapAdding) setHoverGap(null); }}
        onContextMenu={event => {
          event.preventDefault();
          if (event.ctrlKey || marqueeRef.current || presenting !== null) return;
          const hit = event.target.closest('[data-block-id],[data-item-id],[data-shape-id]');
          const id = hit?.dataset.blockId || hit?.dataset.itemId || hit?.dataset.shapeId || null;
          if (id && !selectedRef.current.includes(id)) select(id);
          const groupHit = !id && event.target.closest('[data-group-box]');
          if (groupHit) setSelection(membersOf(groupHit.dataset.groupBox));
          const root = surface.current.getBoundingClientRect();
          setMenuAt({ x: event.clientX - root.left, y: event.clientY - root.top, id });
        }}
        onDragOver={event => { if (onDropFiles && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDropHover(true); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropHover(false); }}
        onDrop={event => { if (!onDropFiles) return; event.preventDefault(); setDropHover(false); onDropFiles([...event.dataTransfer.files]); }}
        style={grid ? { background: 'var(--color-white)', backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)', backgroundSize: `${GRID * view.z}px ${GRID * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px` } : undefined}
        className={`relative min-h-0 flex-1 touch-none overflow-hidden ${cursor} ${dropHover ? 'ring-2 ring-accent ring-inset' : ''}`}>
        <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: '0 0' }} className="absolute top-0 left-0">
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
          {[...strokes, ...(live ? [live] : [])].map((stroke, index) => stroke.tool === 'pen'
            ? <path key={index} d={pathOf(stroke.points)} fill="none" stroke={inkAware(stroke.color)} strokeWidth={stroke.width} opacity={stroke.opacity} strokeDasharray={dashArray(stroke.dash, stroke.width)} strokeLinecap="round" strokeLinejoin="round" />
            : <path key={index} d={pathOf(stroke.points)} fill="none" stroke="#fde047" strokeWidth={stroke.width || 14} strokeOpacity=".5" strokeLinecap="round" strokeLinejoin="round" />)}
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
          {exchanges.map(exchange => <ChatCard key={exchange.id} exchange={exchange} zoom={view.z} selected={isSelected(exchange.id)} connected={portsInUse[exchange.id]} boardId={blocks.find(block => block.id === exchange.linkFrom && block.type === 'whiteboard')?.id} onSelect={select} onMove={moveNode} onSize={onResize} onReply={onReply} renderComposer={renderBlockComposer} onLayout={measureBlocks} onConnect={connect} onSnap={snapForNode} onFile={onOpenFile} />)}
          {blocks.map(block => <LessonBlockCard key={block.id} block={block} zoom={view.z} selected={isSelected(block.id)} connected={portsInUse[block.id]} onSelect={select} onMove={moveNode} onChange={changeBlock} onChangeQuiet={changeBlockQuietly} onLayout={measureBlocks} onConnect={connect} onSnap={snapForNode} onAsk={askBlock} onFile={onOpenFile} appName={appName} onAskRegion={askRegion} onGrade={onGrade} onWiki={onWiki} onWatch={onWatch} />)}
        </div>
        {/* The gap near the pointer shows its dotted line and [-] [+] [...] at the far left. */}
        {presenting === null && !readOnly && gaps.filter(gap => gap.index === hoverGap).map(gap => (
          <GapRail key={gap.index} gap={gap} zoom={view.z} span={railSpan}
            // Its buttons start at the far left - past the toolbar when that is docked there.
            edge={(-view.x + (toolSide === 'left' && !toolDrag ? 8 + toolWidth : 0)) / view.z}
            adding={gapAdding}
            onNudge={delta => nudgeGap(gap, delta)}
            onAdding={open => { setHoverGap(gap.index); setGapAdding(open); }} onAddHeading={insertHeadingAt} />
        ))}
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
          return (
            <div key={group.id}>
              {/* The group's own body: an outline you can see, and a surface
                  you can grab - press anywhere inside, empty space included,
                  and the whole group moves. It sits under the members (no
                  z-index), so their own handlers still win on top of them.
                  Ctrl presses and non-select tools fall through to the canvas. */}
              <div data-group-box={group.id}
                style={{ left: left - pad, top: top - pad, width: right - left + pad * 2, height: bottom - top + pad * 2 }}
                className={`absolute rounded-xl border ${active ? 'border-[#2383e2] bg-[#2383e2]/[0.03]' : 'border-line-strong'} cursor-grab active:cursor-grabbing`}
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
              </div>
              {/* The same pill every card shows when selected, in the same
                  place: right above the outline, right-aligned. It arms the
                  composer with what the group holds. */}
              {active && (
                <div style={{ left: right + pad, top: top - pad - 40 }} className="absolute z-30 -translate-x-full">
                  <button type="button" data-group-ask title="Ask the tutor about this group"
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => {
                      const parts = [];
                      for (const member of members) {
                        const block = blocksRef.current.find(entry => entry.id === member.id);
                        if (block) { const described = describeBlock(block); if (described?.text) parts.push(described.text); continue; }
                        const exchange = exchangesRef.current.find(entry => entry.id === member.id);
                        if (exchange) { parts.push(`Q: ${exchange.question}\nA: ${String(exchange.answer || '').slice(0, 600)}`); continue; }
                        const item = itemsRef.current.find(entry => entry.id === member.id);
                        if (item?.text) parts.push(item.text);
                      }
                      onAskTargetRef.current?.({ id: group.id, kind: group.label ? `group "${group.label}"` : 'group', text: parts.join('\n\n').slice(0, 4000) || 'An empty group of drawings.' });
                      // The visuals ride too: a rendered snapshot of the
                      // outline area becomes this question's image context.
                      const memberIds = new Set(members.map(member => member.id));
                      groupShot({
                        box: { left, top, right, bottom }, members: memberIds,
                        strokes: strokes.filter(stroke => stroke.points?.some(point => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom)),
                        shapes, items, blocks, bounds, cachedAsset: loadAsset,
                        dark: document.documentElement.classList.contains('dark'),
                      }).then(blob => { if (blob) onGroupShotRef.current?.(blob, group.label || 'group'); }).catch(() => { /* text still asks */ });
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
          {items.map(item => <CanvasItem key={item.id} item={item} zoom={view.z} tool={tool} selected={isSelected(item.id)} onSelect={select} onChange={changeItem} onMove={moveItemNode} onResize={resizeItem} onGesture={snapshot} onDelete={deleteItem} onSnap={snapForItem}
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
        {menuAt && presenting === null && (() => {
          const grouped = selection.map(id => [...blocks, ...items, ...shapes, ...exchanges].find(entry => entry.id === id)?.groupId).filter(Boolean);
          const row = 'flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-hover disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-transparent';
          const act = action => () => { action(); setMenuAt(null); };
          // What was actually clicked decides the top rows; the core set below
          // acts on the whole selection.
          const block = blocks.find(entry => entry.id === menuAt.id) || null;
          const chat = exchanges.find(entry => entry.id === menuAt.id) || null;
          const attached = sourceId => (attachedIds ? attachedIds.includes(sourceId) : true);
          const attachRow = (sourceId, label) => (
            <button key={sourceId} type="button" role="menuitem" onClick={act(() => onCardActionRef.current?.('attach-toggle', { sourceId }))} className={row}>
              {attached(sourceId) ? `Detach ${label} from tutor` : `Attach ${label} to tutor`}
            </button>
          );
          const typed = [];
          if (block?.type === 'wiki') {
            typed.push(<button key="wr" type="button" role="menuitem" onClick={act(() => onCardActionRef.current?.('wiki-reader', { title: block.title, section: block.section || 0 }))} className={row}>Open in reader</button>);
            typed.push(<button key="ww" type="button" role="menuitem" onClick={act(() => window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(block.title)}`, '_blank', 'noopener'))} className={row}>Open on Wikipedia</button>);
            typed.push(attachRow(`wiki:${block.id}`, 'article'));
          }
          if (block?.type === 'video') {
            typed.push(<button key="vy" type="button" role="menuitem" onClick={act(() => window.open(`https://www.youtube.com/watch?v=${block.videoId}${block.start ? `&t=${Math.floor(block.start)}s` : ''}`, '_blank', 'noopener'))} className={row}>Open on YouTube</button>);
            typed.push(attachRow(`video:${block.id}`, 'video'));
          }
          if (block?.type === 'paper' && block.paper?.id) {
            typed.push(<button key="pp" type="button" role="menuitem" onClick={act(() => onCardActionRef.current?.('paper-reader', { id: block.paper.id, title: block.title, page: block.paper.page || 1 }))} className={row}>Open in reader</button>);
            typed.push(attachRow(`paper:${block.paper.id}`, 'paper'));
          }
          if (block?.type === 'pdf' && block.assetKey?.startsWith('pdf:')) {
            typed.push(<button key="pr" type="button" role="menuitem" onClick={act(() => onCardActionRef.current?.('pdf-reader', { id: block.assetKey.slice(4), title: block.label }))} className={row}>Open in reader</button>);
          }
          if (block?.type === 'file' && block.kind === 'image' && block.mediaId) {
            typed.push(<button key="ia" type="button" role="menuitem" onClick={act(() => onCardActionRef.current?.('image-attach', { blockId: block.id, mediaId: block.mediaId, label: block.label }))} className={row}>Show the tutor this image</button>);
            typed.push(attachRow(`image:${block.id}`, 'image'));
          }
          if (block?.type === 'heading') {
            typed.push(<button key="hd" type="button" role="menuitem" onClick={act(() => { snapshot(); setBlocks(previous => previous.map(entry => entry.id === block.id ? { ...entry, done: !entry.done } : entry)); })} className={row}>{block.done ? 'Mark not done' : 'Mark done'}</button>);
            typed.push(<button key="hp" type="button" role="menuitem" onClick={act(() => presentFrom(block.id))} className={row}>Present from here</button>);
          }
          if (chat) {
            typed.push(<button key="ct" type="button" role="menuitem" onClick={act(() => navigator.clipboard?.writeText([chat.question, chat.answer].filter(Boolean).join('\n\n')))} className={row}>Copy text</button>);
          }
          const described = block ? describeBlock(block) : null;
          return (
            <div role="menu" aria-label="Canvas actions" style={{ left: menuAt.x, top: menuAt.y }}
              className="absolute z-40 w-52 rounded-md border border-line bg-white p-1 shadow-pop"
              onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
              {described && <button type="button" role="menuitem" onClick={act(() => askBlock(block))} className={row}>Ask about this</button>}
              {typed}
              {(described || typed.length > 0) && <div className="my-1 h-px bg-line" />}
              <button type="button" role="menuitem" disabled={!selection.length} onClick={act(() => pasteIds(selection))} className={row}>Duplicate</button>
              <button type="button" role="menuitem" disabled={!selection.length} onClick={act(zoomToSelection)} className={row}>Zoom to selection</button>
              <div className="my-1 h-px bg-line" />
              <button type="button" role="menuitem" disabled={selection.length < 2} onClick={act(groupSelection)} className={row}>Group</button>
              <button type="button" role="menuitem" disabled={!grouped.length} onClick={act(ungroupSelection)} className={row}>Ungroup</button>
              <button type="button" role="menuitem" disabled={!grouped.length} onClick={act(() => setChipEdit(grouped[0]))} className={row}>Rename group</button>
              <div className="my-1 h-px bg-line" />
              <button type="button" role="menuitem" onClick={act(selectAll)} className={row}>Select all</button>
              <button type="button" role="menuitem" disabled={!selection.length} onClick={act(deleteSelection)} className={row}>Delete</button>
            </div>
          );
        })()}
      </div>
      {/* Dev-only workbench: drop any lesson block on the canvas to review its
          look before lessons are assembled. */}
      {presenting === null && !readOnly && import.meta.env.VITE_COACHING_DEV === 'true' && (
        <div className="absolute top-3 right-2 z-20">
          <button type="button" aria-label="Insert lesson block" title="Insert a sample lesson block" aria-expanded={insertOpen}
            onClick={() => setInsertOpen(previous => !previous)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-white text-ink-2 shadow-md hover:text-ink">
            <Plus size={15} strokeWidth={1.7} />
          </button>
          {insertOpen && <BlockMenu className="top-0 right-10" filter={insertFilter} onFilter={setInsertFilter} onPick={type => (type === 'notebook' ? (snapshot(), insertAtView(newNotebookBlock()), setInsertOpen(false)) : type === 'youtube' ? (setInsertOpen(false), onSearch?.('youtube')) : insertBlock(type))} />}
        </div>
      )}
      {presenting === null && !readOnly && <div ref={toolbarRef} role="toolbar" aria-label="Canvas tools"
        // Docked right, it keeps clear of the page's contents rail (edgeInset).
        style={toolDrag ? { left: toolDrag.x, top: toolDrag.y, transform: 'none' } : toolSide === 'left' ? undefined : { right: 8 + edgeInset }}
        className={`absolute z-20 grid max-h-full grid-cols-2 gap-0.5 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-md ${toolDrag ? '' : `top-1/2 -translate-y-1/2 ${toolSide === 'left' ? 'left-2' : ''}`}`}>
        {/* The handle: drag the palette and it parks on whichever edge you let
            go nearer to - left or right - never floating mid-canvas. */}
        <div role="button" aria-label="Move the toolbar" title="Drag to the left or right edge"
          className="col-span-2 flex h-5 cursor-grab items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink active:cursor-grabbing"
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault(); event.stopPropagation();
            const root = event.currentTarget.closest('[role="toolbar"]').parentElement.getBoundingClientRect();
            const palette = event.currentTarget.closest('[role="toolbar"]').getBoundingClientRect();
            const grip = { x: event.clientX - palette.left, y: event.clientY - palette.top };
            const move = pointer => setToolDrag({ x: pointer.clientX - root.left - grip.x, y: pointer.clientY - root.top - grip.y });
            move(event);
            const up = pointer => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
              setToolDrag(null);
              setToolSide(pointer.clientX < root.left + root.width / 2 ? 'left' : 'right');
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}>
          <GripHorizontal size={13} />
        </div>
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
          onPointerDown={e => e.stopPropagation()} onClick={() => setStyleOpen(!showStyle)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${showStyle ? 'bg-hover' : 'hover:bg-hover'}`}>
          <span style={{ background: color }} className="h-4 w-4 rounded-full ring-1 ring-line" />
        </button>
      </div>}
      {presenting === null && !readOnly && showStyle && (
        <StylePanel side={toolSide} inset={edgeInset} clear={toolWidth} text={panel.text} showFill={panel.fill} fill={fill} corners={panel.corners} order={panel.order}
          route={panel.route} routeValue={panel.routeValue}
          onRoute={value => {
            setConnectorRoute(value);
            if (!panel.targets.length) return;
            snapshot();
            setLinks(previous => previous.map(link => panel.targets.includes(link.id) ? { ...link, route: value } : link));
            setShapes(previous => previous.map(shape => panel.targets.includes(shape.id) && shape.kind !== 'line' ? { ...shape, kind: ARROW_KINDS[value] } : shape));
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
      {/* Presenting replaces the zoom pill and composer with a step counter: the
          canvas is being shown, not worked on. */}
      {presenting !== null && (
        <div className="relative min-h-11 shrink-0 pt-3">
          <div className="absolute bottom-0 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-white px-1 py-0.5 shadow-md">
            <IconBtn title="Previous section" aria-label="Previous section" disabled={presenting === 0} onClick={() => showStep(presenting - 1)}><Back size={14} /></IconBtn>
            <span aria-live="polite" className="max-w-56 truncate px-2 text-xs text-ink-2">{presenting + 1} / {stepsRef.current.length} · {stepsRef.current[presenting]?.label}</span>
            <IconBtn title="Next section" aria-label="Next section" disabled={presenting >= stepsRef.current.length - 1} onClick={() => showStep(presenting + 1)}><Forward size={14} /></IconBtn>
            <span className="mx-0.5 h-5 w-px bg-line" />
            <button type="button" onClick={stopPresenting} className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-hover hover:text-ink">Exit</button>
          </div>
        </div>
      )}
      {/* The zoom pill, the composer, and the minimap share one lower edge.
          The composer is the primary surface, so no control may cover it:
          the pill sits in its own flex column beside it (the two side columns
          grow equally, keeping the composer centred while there is room), and
          on a phone the pill takes its own compact row above a full-width
          composer and the minimap steps aside. */}
      {presenting === null && <div data-canvas-bottom className="relative flex min-h-11 shrink-0 flex-col gap-2 px-3 pt-3 pb-4 md:flex-row md:items-end md:gap-3">
        <div className="flex md:min-w-fit md:flex-1 md:basis-0">
        <div data-zoom aria-label="Zoom controls" className="z-20 flex items-center rounded-lg border border-line bg-white shadow-sm">
          <IconBtn title="Scroll up" onClick={() => scrollBy(-1)}><ChevronUp size={14} /></IconBtn>
          <IconBtn title="Scroll down" onClick={() => scrollBy(1)}><ChevronDown size={14} /></IconBtn>
          <span className="mx-0.5 h-5 w-px bg-line" />
          <IconBtn title="Zoom out" onClick={() => zoomCenter(1 / 1.25)}><Minus size={14} /></IconBtn>
          <button type="button" title="Reset zoom" onClick={() => setView({ x: Math.max(24, (surface.current.clientWidth - COLUMN) / 2), y: 24, z: 1 })} className="min-w-11 px-1 text-center text-xs tabular-nums text-ink-2 hover:text-ink">{Math.round(view.z * 100)}%</button>
          <IconBtn title="Zoom in" onClick={() => zoomCenter(1.25)}><Plus size={14} /></IconBtn>
        </div>
        </div>
        {composer && <div data-canvas-composer className="mx-auto w-full min-w-0 max-w-[504px] md:mx-0 md:shrink">{composer}</div>}
        {/* Reserves the minimap's width (CanvasMinimap SIZE.w) so it never sits over the composer. */}
        <div aria-hidden className="hidden md:block md:flex-1 md:basis-0" style={minimap ? { minWidth: 184 } : undefined} />
        {/* Level with the composer's bottom edge, like the zoom pill. */}
        {minimap && <div className="hidden md:contents"><CanvasMinimap boxes={minimapBoxes} view={view} onFit={zoomFit}
          surface={{ w: surface.current?.clientWidth || 0, h: surface.current?.clientHeight || 0 }}
          onView={next => setView(v => ({ ...v, x: next.x, y: next.y }))} /></div>}
      </div>}
    </div>
  );
}
