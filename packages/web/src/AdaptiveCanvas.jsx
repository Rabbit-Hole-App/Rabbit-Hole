import { equationTransaction } from './inline-equation-apply.js';
import { CAD_DOWNLOADS, CadViewerTools, cadCanMutate, cadPersistenceChanged, downloadCadArtifact } from './CadCard.jsx';
import { cadArtifact, cadClient, cadRunning, mergeCadBlock } from './cad-client.js';
import { createContext, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Heading1, Heading2, Heading3, ChevronDown, ChevronLeft as Back, ChevronRight as Forward, ChevronUp, Ellipsis, GripHorizontal, Loader2, MessageCircle, Scan, X, ArrowUpRight, Circle, CornerDownRight, Diamond, Eraser, Grid3x3, Hand, Hexagon, Highlighter, Lock, LockOpen, ArrowUp, ArrowDown, Minus, MousePointer2, Pencil, Plus, Slash, Spline, Square, Star, StickyNote, Triangle, Type, Download, Paperclip, Copy, Group, NotebookPen, Ungroup, Sigma, Globe } from 'lucide-react';
import { Md } from './ask.jsx';
import { supportsCardLayout, switchCardLayout, resizeCardLayout, preserveCardEditLayout, widthLimits, fitWidth, contentMinimum } from './card-layout.js';
import { renamable, renameBlock, groupEditText, groupLabelFrom } from './card-rename.js';
import './card-layout.css';
import { IconBtn, toast } from './ui.jsx';
import { saveUiPref, uiPrefs } from './ui-prefs.js';
import { notebookEditor } from './notebook-inline-client.js';
import { notebookHistoryController } from './notebook-history.js';
import { boardAsk } from './board-ask.js';
import { api, wsHeaders } from './api.js';
import { isFileDrag, pressKeepsDocFocus, unknownDocBlock } from './canvas-doc.js';
import { BLOCK_TYPES, LearningBlockBody, SketchHost, describeBlock } from './LearningBlocks.jsx';
import { SKETCH_HEIGHT, roundPoint } from './explain-sketch.js';
import { gapsFrom, nearestGap, nudgeBy } from './learn-gap-rail.js';
import { panelFor, textStyle, stickyTone, dashArray, dashStyle, reorder, reorderStep, headsOf, copyStyle, pasteStyle, strokePatch, strokeOf, TEXT_LEVELS, ARROW_KINDS } from './learn-style-panel.js';
import RichText, { measureHeight, offsetsOf, readRuns } from './RichText.jsx';
const CodeBoxEditor = lazyFeature(() => import('./CodeBoxEditor.jsx'), 'The code editor');
import StylePanel, { COLORS, WIDTHS } from './CanvasStylePanel.jsx';
import { ALIGNS, baseOf, compactRuns, fontSize as validSize, formatObject, objectStyle, objectsValue, plainOf, reconcileRuns, runsOf, textPatch, valueOver } from './learn-rich-text.js';
import { drawGeometry, moveEnd, resizeBox } from './learn-draw-modifiers.js';
import CanvasMinimap from './CanvasMinimap.jsx';
import { activeSection, presentSteps } from './learn-present.js';
import { pageRects, PAGE_W } from './learn-pages.js';
import { outlineFrom, applyTocAction, moveTocSection, toggleTocDone, removeTocEntry, linkTocHeading, tocHeading, tocEntryFor } from './learn-outline-model.js';
import { loadAsset } from './learn-board-assets.js';
import { groupShot } from './learn-group-shot.js';
import { describeCanvasObject, groupTargetText } from './learn-ask-target.js';
import { SelectionActionBar, SelectionActionsHost, SelectionActionsProvider } from './SelectionActions.jsx';
import { anchorOf } from './selection-bar-place.js';
import { addToChatAllowed, claimChord, quickEditAllowed } from './shortcut-owner.js';
import { askDraft } from './agent/scope.js';
import { useChatWorkspace } from './chat-workspace.jsx';
import { fileChatRef } from './file-chat-ref.js';
import { objectKind, objectName, selectionName, selectionRef } from './selection-ref.js';
import LearnWiki from './LearnWiki.jsx';
import WebpageCard, { askCapture } from './WebpageCard.jsx';
import SourcesDisclosure from './SourcesDisclosure.jsx';
import CardPrompt from './CardPrompt.jsx';
import { momentGeometry, seekTo, clock, embedUrl } from './learn-video-moment.js';
import { snapMove, snapGrid, SNAP_TOLERANCE, GRID } from './learn-snap.js';
import NotebookBody from './NotebookCard.jsx';
import { activePath, newNotebookBlock, notebookFromCode, notebookWriteBack } from './learn-notebook.js';
import { paletteSections, insertName } from './learn-insert-palette.js';
import { SIDES, shapeBox, sidePoint, nearestSide, routePath, polylineMid, freeElbow } from './learn-connectors.js';
import { ComposerHide, DOCK_PAD, DOCK_WIDTH } from './ChatComposer.jsx';
import { PerfContext, perfMark, usePaintedMarks } from './learn-perf.js';
import LaserPointer from './LaserPointer.jsx';
import { DivePortals } from './Dive.jsx';
import { canvasObjects } from './dive.js';
import { openTarget, opensFrom, selectedCardContext } from './card-open.js';
import { pageRef, pdfRef, pdfSource } from './pdf-source.js';
import { chromeObstacles, columnEntries, fillSlot, freeArea, freeSlot, homeView, indexAfter, pairStart, panInto, slotIndex, slotSize } from './canvas-slots.js';
import { holdsSceneHighlight, releaseSceneHighlights } from './scene-selection.js';
import { areaTarget, cropBinding } from './area-crop.js';
import { lightBlocks, pendingWork, persistBoard } from './canvas-persist.js';
import { waitingText } from './waiting-text.js';
import { isWebUrl, looksLikeCode, pasteKind } from './canvas-paste.js';
import { copiedCode } from './map-files.js';
import CommentPins, { PIN_DEFAULT } from './comments/CommentPins.jsx';
import { anchorAt, objectLabel } from './comments/anchors.js';
import { MathText } from './MathText.jsx';
import { EQUATION_LEVELS, EQUATION_SIZE, equationLevel, levelSize, newEquation, scaledSize, typingIn } from './canvas-equation.js';
import { drawThumbnail, thumbnailRegion } from './card-thumbnail.js';
import { buildContext, buildCreationContext, createContextCache, freezeTarget } from './inline-ai-context.js';
import { applyTx, obstaclesOf, placeAnswers, placeNote } from './inline-ai-apply.js';
import { REF_CARD, refCardSpot, reIdRefs, withRef, withoutRef } from './canvas-refs-model.js';
import { CODE_LANGS, codeLang, highlightCode, withCodeLang } from './code-lang.js';
import { semanticReader } from './curious-context.js';
import CanvasRefChips, { CanvasRefs } from './CanvasRefChips.jsx';
import CanvasRefCard from './CanvasRefCard.jsx';
import { GRAPH_CARD } from './graph-card.js';
import CodeCard from './CodeCard.jsx';
import { CODE_CARD, CODE_DRAG, codeCardRef, dragSource, insertCodeCard, repoCodeCard } from './code-card.js';
import { lazyFeature } from './lazy-feature.jsx';
import { DOC_CARD, DOC_KINDS } from './file-doc-import.js';
import { droppedFiles } from './model-drop.js';
import { createSearchSnapshotStore, createEquationSearchDrafts, searchCamera, searchRange, revealSearchRange, temporarySearchHighlight } from './canvas-search-navigation.js';
import './canvas-search-navigation.css';
import { EXCERPT_CARD, excerptChatRef } from './pdf-excerpt.js';
import { EXCERPT_DRAG, EXCERPT_EVENT } from './pdf-excerpt-drafts.js';
import { SEARCH_DRAG, applySearchDrop, paintSearchDrop, searchDrag, searchDropPlan } from './search-drag.js';
import { ExcerptNote, ExcerptSource } from './ExcerptCard.jsx';
import { withPressId } from './learn-video-label.js';
import CanvasMenu, { CardActions } from './CanvasMenu.jsx';
import { actionsFor, allActions, resolveTarget as resolveMenuTarget, runAction, selectionTarget } from './canvas-actions.js';
const VIEW_ONLY_HIDDEN = new Set(['canvas.local-edit', 'source.write', 'generate.paid', 'file.upload', 'code.execute', 'webpage.capture']);
const rowGroup = id => allActions().find(entry => entry.id === id)?.group || null;
// S1's one permission model (canvas-permissions.js, contract-permissions.md): the menu, the card ⋮ and the shortcuts ask it.
import { can as permit } from './canvas-permissions.js';
import { rabbitHoleTarget } from './canvas-actions-types.js';
import { loadMediaOriginal } from './media-storage.js';

// MathLive arrives with the first equation edited, never with the canvas (docs/features/canvas-equations.md).
const EquationEditor = lazyFeature(() => import('./EquationEditor.jsx'), 'The equation editor');
// The inline AI editor arrives with its first Ctrl/Cmd+K (docs/features/inline-ai-editor.md), never with the canvas.
const InlineAiEditor = lazyFeature(() => import('./InlineAiEditor.jsx'), 'The AI editor');
// The canvas's document editor (BlockNote), loaded only when Editor view first shows it (docs/features/blocknote-canvas.md).
const CanvasDoc = lazyFeature(() => import('./CanvasDoc.jsx'), 'The document editor');
// The graph renderer loads with the first graph card, never with the canvas (repo-canvas-graph.md clarification section 11).
const GraphCard = lazyFeature(() => import('./GraphCard.jsx'), 'The graph');
// SVG, audio and video card bodies load with the first such card (docs/features/canvas-file-imports.md, Media).
const MediaBody = lazyFeature(() => import('./MediaCard.jsx'), 'The media player');
const MEDIA_BODY = { svg: 'SVG', audio: 'Audio', clip: 'Video' };
// Text, Markdown, table, workbook, Word and presentation cards (file-doc-import.js; canvas-file-imports.md lane 2).
const FileDocCard = lazyFeature(() => import('./FileDocCard.jsx'), 'The file preview');
const ModelCard = lazyFeature(() => import('./ModelCard.jsx'), 'The 3D viewer');
const noop = () => {};

// The adaptive lesson canvas: a plain React surface (no tldraw). The world is
// unbounded — a translate/scale camera pans and zooms it. Chat exchanges land
// as movable cards; the learner adds ink, shapes, stickies and text from the
// right-hand toolbar. The Hand, Space+drag, the middle button and the wheel
// pan; an empty-space drag selects an area; ctrl+wheel zooms.
// ponytail: canvas content persists per-browser via localStorage; cross-device
// save/restore comes with the lesson content model.

// [value, icon, accessible name, tooltip hint]. The name stays the plain tool name (screen readers and every check
// find a tool by it); the tooltip adds the key from TOOL_KEYS and the hint.
const NAV_TOOLS = [
  ['select', MousePointer2, 'Select and move', 'drag empty canvas to select an area'],
  ['hand', Hand, 'Hand — pan the canvas', 'or hold Space and drag'],
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
  ['rect', Square, 'Rectangle', 'Shift for a square, Alt from the centre'],
  ['ellipse', Circle, 'Ellipse', 'Shift for a circle, Alt from the centre'],
  ['triangle', Triangle, 'Triangle'],
  ['diamond', Diamond, 'Diamond'],
  ['hexagon', Hexagon, 'Hexagon'],
  ['star', Star, 'Star'],
  ['line', Slash, 'Line', 'Shift snaps to 45°'],
  ['arrow', ArrowUpRight, 'Arrow', 'Shift snaps to 45°'],
  ['curve', Spline, 'Curved arrow'],
  ['elbow', CornerDownRight, 'Elbow arrow'],
];
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
const COLUMN = 560;
// The document sheet: about 760 px across at 100% (brief section 4), and at least one screen tall before it holds much.
const DOC_W = 760, DOC_MIN_H = 960;
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

// Direct tool keys (docs/features/canvas-editing.md) and the arrow keys' nudge directions.
// Picking one of these, by button or key, lets go of the selection, as in Excalidraw (owner, 2026-10-13); Space-pan's
// held Hand does not.
const DRAWING_TOOLS = new Set([...DRAW_TOOLS, ...SHAPE_TOOLS].map(([value]) => value));
const TOOL_KEYS = { v: 'select', h: 'hand', r: 'rect', o: 'ellipse', a: 'arrow', l: 'line', p: 'pen', t: 'text', e: 'eraser', n: 'sticky' };
const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// Screen pixels of travel before a press counts as a drag rather than a click.
const DRAG_THRESHOLD = 3;

// A press that changes the selection (docs/features/canvas-editing.md, Excalidraw's rules): on anything not yet
// selected; Shift adds or, on something already selected, takes it out; Ctrl/Cmd picks one member out of a group.
const pickOnPress = (selected, event) => !selected || event.shiftKey || event.ctrlKey || event.metaKey;

// Pointer drag with a live apply callback; used by blocks, stickies, text,
// shapes and panning. scale converts screen pixels to world units. apply gets
// the held modifiers ({ shift, alt }) too, and runs again the moment one is
// pressed or released, so a resize answers Shift or Alt without the pointer
// moving. Esc cancels: apply.cancel if given, else the origin again.
// One gesture at a time: the canvas's own Esc handling stands down while one runs.
let gestureLive = false;
function startDrag(event, origin, apply, scale = 1, snap = null) {
  event.preventDefault();
  event.stopPropagation();
  const from = { x: event.clientX, y: event.clientY };
  // A press only becomes a drag once the pointer has actually travelled. Without
  // this, a click meant to select something shifts it by whatever the hand did
  // on the way down - worst on text, which has no handle to aim at.
  let dragging = false, last = null;
  // An iframe under the pointer (a notebook, a PDF) would swallow the rest of
  // the drag; while one is in progress every iframe ignores the pointer.
  document.body.classList.add('canvas-dragging');
  gestureLive = true;
  const at = (pointer, keys = pointer) => {
    const x = origin.x + (pointer.clientX - from.x) / scale;
    const y = origin.y + (pointer.clientY - from.y) / scale;
    const pulled = snap ? snap(x, y) : null;
    apply(pulled ? pulled.x : x, pulled ? pulled.y : y, { shift: keys.shiftKey, alt: keys.altKey });
  };
  const move = e => {
    if (!dragging && Math.hypot(e.clientX - from.x, e.clientY - from.y) < DRAG_THRESHOLD) return;
    dragging = true;
    last = e;
    at(e);
  };
  const stop = () => {
    gestureLive = false;
    document.body.classList.remove('canvas-dragging');
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true);
    apply.done?.(); snap?.done?.();
  };
  const up = () => stop();
  const key = e => {
    if (e.type === 'keydown' && e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (apply.cancel) apply.cancel(); else if (dragging) apply(origin.x, origin.y, {});
      stop();
      return;
    }
    if (e.key !== 'Shift' && e.key !== 'Alt') return;
    if (e.key === 'Alt') e.preventDefault(); // Alt alone must not move focus to the browser's menu
    if (dragging && last) at(last, e);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('keydown', key, true);
  window.addEventListener('keyup', key, true);
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
// Lock and Alt-drag (docs/features/canvas-editing.md), provided by the canvas around everything it draws: the locked
// ids, and altDrag(id, event), which drags a copy of the pressed object (and the rest of its selection) away.
const CanvasEdit = createContext({ locked: new Set(), altDrag: null });

// Shared node chrome for everything card-shaped on the canvas: drag with
// lift, corner resize, selection ring, top/bottom connection ports, and the
// layout observer that keeps connector geometry fresh. Content is children.
function CanvasNode({ id, dx, dy, zoom, selected, chat = false, ghost = false, wide = false, space = 0, connected = null, autoMax = 420, width = 380, height = undefined, extraHeight = 0, saved = null, cardLayout = null, onSelect, onMove, onSize, onLayout, onConnect, onSnap = null, nodeRef = null, resizable = true, children }) {
  const [lifted, setLifted] = useState(false);
  // A card with a Rabbit Hole under it (docs/features/dive-v1.md): derived from the dive link, never stored on the card.
  const dive = useContext(DivePortals), portal = dive?.portals?.[id];
  // Open (card-open.js): double-click, Enter, or the Open pill on the one selected card. A chat card never opens.
  const opener = useContext(CardOpen);
  const opens = !chat && opener ? opener.can(id) : null;
  const edit = useContext(CanvasEdit), locked = edit.readOnly || edit.locked.has(id);
  const full = cardLayout?.mode === 'full';
  const [minimum, setMinimum] = useState(320), [layoutDrag, setLayoutDrag] = useState(null);
  const limits = widthLimits(minimum);
  // Whether the card was already selected when this double-click's first press landed: a selected PDF, video or
  // article body keeps its own pointer (data-pointer-body), so a double-click there is the reader's, not Open.
  const selectedAtPress = useRef(false), lastPress = useRef(-Infinity);
  // A resized node keeps its size in its own data, so a reload restores it.
  const [size, setSize] = useState({ w: saved?.w || null, h: saved?.h || null });
  const [cornerDrag, setCornerDrag] = useState(null);
  const [refsHeight, setRefsHeight] = useState(0); // the canvas-reference chips under the content (CanvasRefChips)
  const card = useRef(null);
  useEffect(() => { setSize({ w: saved?.w || null, h: saved?.h || null }); }, [saved?.w, saved?.h]);
  const displayWidth = full ? fitWidth(layoutDrag?.w ?? cardLayout.fullWidth, limits) : cornerDrag?.w || cardLayout?.scrollableSize?.w || size.w || width;
  useLayoutEffect(() => {
    if (!full || !card.current) return;
    let frame, dead = false;
    const measure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
      if (dead || !card.current) return;
      const next = contentMinimum(card.current); setMinimum(old => old === next ? old : next);
      if (!locked && !layoutDrag && fitWidth(cardLayout.fullWidth, widthLimits(next)) !== cardLayout.fullWidth) edit.resizeCard?.(id, fitWidth(cardLayout.fullWidth, widthLimits(next)), null, null, next, true);
      onLayout?.();
    }); };
    const observer = new ResizeObserver(measure); observer.observe(card.current);
    const content = new MutationObserver(measure); content.observe(card.current, { childList: true, subtree: true, characterData: true });
    card.current.addEventListener('load', measure, true); document.fonts?.addEventListener('loadingdone', measure); measure();
    return () => { dead = true; cancelAnimationFrame(frame); observer.disconnect(); content.disconnect(); card.current?.removeEventListener('load', measure, true); document.fonts?.removeEventListener('loadingdone', measure); };
  }, [full, cardLayout?.fullWidth, locked, layoutDrag, id, onLayout]);
  const resizeWidth = (event, side) => {
    if (event.button !== 0 || locked || edit.selectionCount > 1) return;
    const start = card.current.offsetWidth, originX = dx; let last, cancelled = false;
    const apply = value => { const w = fitWidth(side === 'left' ? start * 2 - value : value, limits); last = { w, dx: side === 'left' ? originX + start - w : originX }; setLayoutDrag(last); };
    apply.cancel = () => { cancelled = true; setLayoutDrag(null); };
    apply.done = () => { if (last && !cancelled) edit.resizeCard?.(id, last.w, null, last.dx, minimum); setLayoutDrag(null); };
    startDrag(event, { x: start, y: 0 }, apply, zoom);
  };
  const resizeWidthKey = (event, side) => {
    if (!['ArrowLeft','ArrowRight'].includes(event.key) || locked || edit.selectionCount > 1) return;
    event.preventDefault(); event.stopPropagation(); const start = card.current.offsetWidth, w = fitWidth(start + (event.key === 'ArrowRight' ? 24 : -24), limits);
    if (w !== start) edit.resizeCard?.(id, w, null, side === 'left' ? dx + start - w : dx, minimum);
  };
  useEffect(() => { if (nodeRef) nodeRef.current = card.current; });
  useEffect(() => {
    const observer = new ResizeObserver(onLayout);
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [onLayout]);
  const drag = event => {
    if (event.button !== 0) return;
    if (pickOnPress(selected, event)) onSelect(id, event); // a plain press keeps a multi-selection intact while dragging it
    // A locked card is selected, never moved; Shift on a selected card only takes it out; Alt drags a copy away.
    if (locked || (selected && event.shiftKey)) { event.preventDefault(); return; }
    if (event.altKey && edit.altDrag) { edit.altDrag(id, event); return; }
    setLifted(true);
    const apply = (x, y) => onMove(id, x, y);
    apply.done = () => setLifted(false);
    startDrag(event, { x: dx, y: dy }, apply, zoom, onSnap?.(id));
  };
  const resize = event => {
    if (event.button !== 0 || locked || full) return;
    const element = card.current;
    // The drag sizes the body: rows under it (Sources, the Prompt row, references) are added on top, during the drag and after
    // it is saved, so releasing never grows the card by them. A card layout's saved height is its whole frame.
    const extra = cardLayout ? 0 : extraHeight + refsHeight;
    let last = null;
    const apply = (w, h) => { last = { w: Math.min(1200, Math.max(280, w)), h: Math.min(1000, Math.max(140, h)) }; setSize(last); setCornerDrag(last); };
    apply.done = () => { if (last) { if (cardLayout) edit.resizeCard?.(id, last.w, last.h); else onSize?.(id, last.w, last.h); } setCornerDrag(null); };
    startDrag(event, { x: element.offsetWidth, y: element.offsetHeight - extra }, apply, zoom);
  };
  const node = (
    // A selected card rises above a group's box (painted after the column, over the cards): the selection actions in its row above
    // may lie over the box of the group just above it, and must stay pressable (z-[5]: still under text, notes and the chrome).
    // A card is reachable with Tab (Space selects it, Enter opens it: the canvas's key handler); its selection is
    // exposed as aria-current, and the keyboard focus ring sits outside the selection ring.
    <div ref={card} data-block data-block-id={id} data-card-layout={full ? 'full' : 'scrollable'} {...(chat ? { 'data-chat-block': true } : {})}
      tabIndex={0} role="group" aria-roledescription="card" aria-current={selected ? 'true' : undefined}
      // Read before this press selects the card (the selection re-renders before mousedown); a press within a
      // double-click's interval of the last one is that double-click's second press.
      // A press on a card takes the keyboard back from the companion column (its keys stand down while a focus is held
      // there): otherwise Ctrl+D or Delete on the card just selected would act on nothing (repo-canvas-cards-check case 3).
      onPointerDownCapture={event => { if (event.timeStamp - lastPress.current > 500) selectedAtPress.current = selected; lastPress.current = event.timeStamp; if (document.activeElement?.closest?.('[data-companion]')) document.activeElement.blur(); }}
      onPointerDown={event => { if (event.button !== 0) return; if (event.target.closest('[data-drag-zone]')) drag(event); else onSelect(id, event); }}
      // A single click only selects; a double-click opens - the card's reader, else its Rabbit Hole (made when there is
      // none yet). Never from one of the card's own controls (opensFrom).
      onDoubleClick={opens ? event => {
        if (!opensFrom(event.target) || (selectedAtPress.current && event.target.closest('[data-pointer-body]'))) return;
        opener.open(id, 'learner_dblclick');
      } : undefined}
      style={{ transform: `translate(${layoutDrag?.dx ?? dx}px, ${dy}px)${lifted ? ' scale(1.02)' : ''}`, ...(cardLayout?.slot ? { position: 'absolute', left: 0, top: 0, margin: 0 } : { marginTop: space || undefined }), width: displayWidth, height: full ? undefined : (cornerDrag?.h ? cornerDrag.h + (cardLayout ? 0 : extraHeight + refsHeight) : null) || cardLayout?.scrollableSize?.h || (size.h || height ? (size.h || height) + extraHeight + refsHeight : undefined), maxHeight: full || cardLayout ? undefined : size.h || height || autoMax == null ? undefined : autoMax + refsHeight }}
      className={`group relative ${selected ? 'z-[5]' : ''} ${wide ? 'self-center' : 'mx-auto'} flex cursor-default flex-col rounded-xl border transition-shadow duration-150 select-text focus-visible:ring-[3px] focus-visible:ring-[#2383e2]/40 focus-visible:ring-offset-4 ${portal ? '' : 'outline-none'} ${ghost ? 'border-transparent bg-transparent hover:border-line' : 'border-line bg-white'} ${selected ? 'ring-2 ring-select' : ''} ${portal ? (portal.pending ? 'outline-8 outline-offset-1 outline-hole-pending/40' : 'outline-8 outline-offset-1 outline-hole/80') : ''} ${lifted ? 'z-20 shadow-xl' : ghost ? 'hover:shadow-sm' : 'shadow-sm hover:shadow-md'}`}>
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
      <CanvasRefChips id={id} onHeight={setRefsHeight} />
      {portal && <button type="button" data-dive-portal={portal.name} title={`Enter the Rabbit Hole: ${portal.title}`} onPointerDown={event => event.stopPropagation()} onClick={() => dive.enter(portal.name)}
        className={`pointer-events-auto absolute -top-3 left-4 z-20 flex max-w-60 items-center gap-1 rounded-sm border bg-white px-2 py-0.5 text-[11px] shadow-sm ${portal.pending ? 'border-dashed border-hole-pending text-hole hover:bg-hole/10' : 'border-hole/40 text-hole hover:bg-hole/10'}`}>
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" className="shrink-0"><path d="M6 1.5V10M2.5 6.5 6 10l3.5-3.5" /></svg><span className="truncate">{portal.title}</span></button>}
      {/* A card's comment pin sits at its top centre (owner, 2026-10-21), over the top port: that port steps aside while it
          shows, and links still reach the top by dropping on the card's top half or near its top centre (snapPort). */}
      {['top', 'bottom'].filter(side => side !== 'top' || !edit.hasPin?.(id)).map(side => <button key={side} type="button" data-port={side} data-owner={id} aria-label={`Connect ${side}`} title="Drag to connect blocks"
        data-node-tool
        className={`absolute left-1/2 z-20 h-4 w-4 -translate-x-1/2 cursor-crosshair rounded-full border-2 border-accent bg-white focus:opacity-100 ${connected?.[side] ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${side === 'top' ? '-top-2' : '-bottom-2'}`}
        onPointerDown={event => onConnect(event, id, side)} />)}
      {full && !locked && edit.selectionCount <= 1 && ['left','right'].map(side => <button key={side} type="button" role="slider" aria-orientation="horizontal" aria-label={`Resize card width from ${side}`} aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={Math.round(displayWidth)} data-node-tool className={`absolute top-6 bottom-2 z-20 w-2 cursor-ew-resize focus-visible:bg-accent/30 ${side === 'left' ? '-left-1' : '-right-1'}`} onPointerDown={event => resizeWidth(event, side)} onKeyDown={event => resizeWidthKey(event, side)} />)}
      {!full && !locked && resizable && <button type="button" aria-label="Resize chat block" title="Resize block" className="absolute right-0 bottom-0 z-10 cursor-nwse-resize p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink-2 focus:opacity-100"
        data-node-tool onPointerDown={resize}><svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M10 4 4 10 M10 8 8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg></button>}
    </div>
  );
  return cardLayout?.slot ? <div data-card-slot={id} className={`relative mx-auto shrink-0 overflow-visible ${selected ? 'z-[5]' : ''}`} style={{ width: cardLayout.slot.w, height: cardLayout.slot.h, marginTop: space || undefined }}>{node}</div> : node;
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
    setDrawing('Preparing explanation');
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
          <SelectionActionsHost id={exchange.id} />
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
          : <p className="text-sm text-ink-2 italic">{exchange.status === 'thinking' ? <span className="shimmer not-italic">Thinking</span> : waitingText(exchange.status)}</p>}
        {replies.map(turn => <div key={turn.id} className="mt-3 border-t border-line pt-3">
          <div className="mb-3 flex justify-end"><span className="rounded-xl bg-accent px-3 py-1.5 text-sm whitespace-pre-wrap text-white">{turn.question}</span></div>
          <div className="text-sm">{turn.answer ? <Md text={turn.answer} onFile={onFile} /> : <span className="text-ink-2">{turn.status === 'done' ? 'No answer received. Try again.' : <span className="shimmer">Thinking</span>}</span>}</div>
        </div>)}
      </div>
      {/* A chat card's prompt is its question (docs/features/card-prompt.md). */}
      {exchange.status === 'done' && <CardPrompt text={exchange.question} selected={selected} />}
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
function SlideCard({ block, zoom, selected, connected, onSelect, onMove, onLayout, onConnect, onSnap }) {
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
      {selected && <div data-thumbnail-hide className="absolute -top-10 right-0 z-30"><SelectionActionsHost id={block.id} /></div>}
      <div data-slide={block.number} className="px-1 pb-1">
        {url ? <img src={url} alt={`${block.label || 'PDF'}, page ${block.number}`} className="w-full rounded border border-line" draggable={false} />
          : <p className="p-4 text-sm text-ink-2">This page is not in this browser.</p>}
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
          : <p className="p-4 text-sm text-ink-2">{missing ? 'This PDF is not in this browser. Upload it again from Sources.' : 'Opening'}</p>}
      </div>
    </CanvasNode>
  );
}

// A file the learner dropped on the canvas: an image, a GIF, or a video clip.
// Same storage bargain as the PDF card - the bytes live in this browser's
// asset store, the block keeps only the key, so the 120 kB src strip never
// applies and a reload keeps the card.

// A dropped image shows the selection actions (Add to chat, Quick Edit) above its top right while it is the one selected object.
function FileCard({ block, zoom, selected, connected, onSelect, onMove, onChange, onLayout, onConnect, onSnap, appName = null }) {
  const editing = useContext(CanvasEdit);
  const [url, setUrl] = useState(null);
  const [missing, setMissing] = useState(false);
  // A stored-source card (fileRef: an SVG or audio import, or Context Add to canvas for any media) reads through MediaBody too.
  const media = MEDIA_BODY[block.kind] || (block.fileRef ? 'Image' : null);
  useEffect(() => {
    if (media) return undefined; // MediaBody reads its own original
    let revoke = null;
    loadAsset(block.assetKey).then(file => {
      if (!file) { setMissing(true); return; }
      revoke = URL.createObjectURL(file);
      setUrl(revoke);
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [block.assetKey, media]);
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
      {selected && block.kind === 'image' && <div data-thumbnail-hide className="absolute -top-10 right-0 z-30"><SelectionActionsHost id={block.id} /></div>}
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-ink" />{block.excerpt ? 'Excerpt' : media || 'Image'}<span className="min-w-0 flex-1 truncate normal-case tracking-normal text-ink-3">{block.label}</span>
        {!media && url && <a href={url} download={block.label || 'image'} data-download-original aria-label="Download original" title="Download original" onPointerDown={event => event.stopPropagation()}
          className="flex shrink-0 items-center rounded-md p-1 text-ink-2 normal-case hover:bg-hover hover:text-ink"><Download size={12} /></a>}
      </div>
      <div data-pointer-body className="min-h-0 px-3 pb-3" onPointerDown={event => { if ((clip || block.kind === 'audio') && selected) event.stopPropagation(); }}>
        {/* A region excerpt (pdf-excerpt.js): the stored crop of the PDF page, the learner's note, the source footer. */}
        {block.excerpt
          ? <div data-excerpt-card data-excerpt-kind="region"><Suspense fallback={<p className="p-2 text-sm text-ink-2">Opening</p>}><MediaBody block={block} onChange={onChange} /></Suspense>
            <ExcerptNote block={block} onChange={onChange} readOnly={editing.readOnly || editing.localCopy || editing.locked.has(block.id)} /><ExcerptSource excerpt={block.excerpt} app={appName} /></div>
          : media
          ? <Suspense fallback={<p className="p-2 text-sm text-ink-2">Opening</p>}><MediaBody block={block} onChange={onChange} /></Suspense>
          : url
            ? <img src={url} alt={block.label || 'Dropped image'} style={block.meta?.width && block.meta?.height ? { aspectRatio: `${block.meta.width} / ${block.meta.height}` } : undefined} className="w-full rounded-lg border border-line bg-white object-contain" />
            : <p className="p-2 text-sm text-ink-2">{missing ? 'This file is not in this browser. Drop it here again.' : 'Opening'}</p>}
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
          {/* Found, not made (owner, 2026-10-20): a YouTube moment says where it comes from. */}
          <p data-media-provenance="sourced" className="mt-0.5 truncate text-[11px] text-ink-2">Sourced · YouTube{block.channel ? ` · ${block.channel}` : ''}</p>
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
function NotebookCard({ block, zoom, selected, connected, appName, onSelect, onMove, onChange, onChangeQuiet, onLayout, onConnect, onSnap }) {
  const latest = useRef(block);
  latest.current = block;
  // Two reports can land before a re-render, so each builds on the last one.
  const save = patch => { latest.current = { ...latest.current, ...patch }; onChangeQuiet(latest.current); };
  const manifest = ({ active_path, files }) => {
    if (active_path === latest.current.active_path && JSON.stringify(files) === JSON.stringify(latest.current.files)) return;
    save({ active_path, files });
  };
  // Only the open notebook's document is copied onto the card.
  const copyNotebook = (path, ipynb) => { const patch = notebookWriteBack(latest.current, path, ipynb); if (patch) save(patch); };
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space}
      connected={connected} width={640} height={block.h || 540} autoMax={undefined} saved={{ w: block.w, h: block.h }}
      onSize={(id, w, h) => onChange({ ...block, w, h })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      <NotebookBody block={block} onSelect={onSelect} onDocument={copyNotebook} onManifest={manifest} onEditCells={notebook=>window.dispatchEvent(new CustomEvent('learn:notebook-inline',{detail:{appName,id:block.id,notebook}}))} />
    </CanvasNode>
  );
}

function LessonBlockCard({ block, zoom, selected, viewSelected = selected, connected, onSelect, onMove, onChange, onChangeQuiet, onLayout, onConnect, onSnap, onFile, appName, onGrade, onWiki, onWatch, onNotebook = null, onRemove = null }) {
  const cadPermissions = useContext(CanvasEdit);
  const cadOpen = mode => window.dispatchEvent(new CustomEvent('learn:cad-inline', { detail: { appName, id: block.id, mode } }));
  // A CAD card's Interact, Fit view and Show dimensions sit in this row, outside the card (cad-controls placement requirement).
  const cadTools = block.type === 'cad' && !!cadArtifact(block.manifest, 'glb');
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
  // A webpage card (WebpageCard.jsx): a saved capture of a public page, scrolled and selected inside the card.
  if (block.type === 'webpage') return <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space} connected={connected} width={block.w || COLUMN} height={block.h || 640} autoMax={undefined} saved={{ w: block.w, h: block.h }} onSize={(id, w, h) => onChange({ ...block, w, h })} onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
    <WebpageCard block={block} appName={appName} selected={selected} zoom={zoom} readOnly={cadPermissions.readOnly || cadPermissions.localCopy || cadPermissions.locked.has(block.id)} onChange={onChange} onChangeQuiet={onChangeQuiet} onRemove={onRemove} /></CanvasNode>;
  if (block.type === 'wiki') return <WikiCard block={block} zoom={zoom} selected={selected} connected={connected} appName={appName} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} onWiki={onWiki} />;
  if (block.type === 'file' && DOC_KINDS.has(block.kind)) return <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space} connected={connected} width={block.w || DOC_CARD[block.kind].w} height={block.h || DOC_CARD[block.kind].h} autoMax={undefined} saved={{ w: block.w, h: block.h }} onSize={(id, w, h) => onChange({ ...block, w, h })} onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
    <Suspense fallback={<p role="status" className="px-3 text-sm text-ink-2">Opening the file</p>}><FileDocCard block={block} onChange={onChange} /></Suspense></CanvasNode>;
  // An imported 3D model, point cloud, splat or CAD model (ModelCard.jsx): the header strip moves it, the viewer is explicit.
  if (block.type === 'file' && block.kind === 'model') return <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space} connected={connected} width={block.w || 560} height={block.h || 460} autoMax={undefined} saved={{ w: block.w, h: block.h }} onSize={(id, w, h) => onChange({ ...block, w, h })} onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
    <Suspense fallback={<p role="status" className="px-3 text-sm text-ink-2">Loading the 3D viewer</p>}><ModelCard block={block} selected={selected} onChange={onChange} onSelect={onSelect} /></Suspense></CanvasNode>;
  if (block.type === 'file') return <FileCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} appName={appName} />;
  if (block.type === 'divider') return <DividerCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  if (block.type === 'slide') return <SlideCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  if (block.type === 'pdf') return <PdfCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  if (block.type === 'notebook') return <NotebookCard block={block} zoom={zoom} selected={selected} connected={connected} appName={appName} onSelect={onSelect} onMove={onMove} onChange={onChange} onChangeQuiet={onChangeQuiet} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  // A code card (repo-graph Release 2, code-card.js): resizable; Expand grows it unless the learner sized it.
  if (block.type === 'repo-code') return <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space} connected={connected} width={CODE_CARD.w} height={block.expanded ? CODE_CARD.h * 2 : CODE_CARD.h} autoMax={undefined} saved={{ w: block.w, h: block.h }} onSize={(id, w, h) => onChange({ ...block, w, h })} onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}><CodeCard block={block} onChange={onChange} /></CanvasNode>;
  if (block.type === 'canvas-ref') return <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space} connected={connected} width={REF_CARD.w} height={REF_CARD.h} autoMax={undefined} resizable={false} onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}><CanvasRefCard block={block} /></CanvasNode>;
  if (block.type === 'heading') return <HeadingCard block={block} zoom={zoom} selected={selected} connected={connected} onSelect={onSelect} onMove={onMove} onChange={onChange} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap} />;
  // A repository graph card (GraphCard.jsx): its header strip moves it, its frame resizes it, the graph inside keeps its own pointer.
  if (block.type === 'repo-graph') return <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} space={block.space} connected={connected} width={block.w || GRAPH_CARD.w} height={block.h || GRAPH_CARD.h} autoMax={undefined} saved={{ w: block.w, h: block.h }} onSize={(id, w, h) => onChange({ ...block, w, h })} onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
    <Suspense fallback={<p role="status" className="px-3 text-sm text-ink-2">Loading the graph</p>}><GraphCard block={block} selected={selected} /></Suspense></CanvasNode>;
  return (
    <CanvasNode id={block.id} dx={block.dx} dy={block.dy} zoom={zoom} selected={selected} ghost={!!BLOCK_TYPES[block.type]?.ghost} space={block.space} connected={connected}
      autoMax={BLOCK_TYPES[block.type]?.autoMaxFor?.(block) ?? BLOCK_TYPES[block.type]?.autoMax}
      width={BLOCK_TYPES[block.type]?.sizeFor?.(block)?.width ?? BLOCK_TYPES[block.type]?.width}
      height={BLOCK_TYPES[block.type]?.sizeFor?.(block)?.height ?? BLOCK_TYPES[block.type]?.height}
      extraHeight={sourcesHeight + practiceHeight + controlsHeight} cardLayout={supportsCardLayout(block) ? block.cardLayout : null} saved={{ w: block.w, h: block.h }} onSize={(id, w, h) => onChange({ ...block, w, h })}
      onSelect={onSelect} onMove={onMove} onLayout={onLayout} onConnect={onConnect} onSnap={onSnap}>
      {selected && (
        <div data-thumbnail-hide className="absolute -top-10 right-0 z-30 flex items-center gap-1.5">
          {cadTools && <CadViewerTools viewKey={block.id} account={cadPermissions.account} cardId={block.id} />}
          <NotebookButton entry={block} onNotebook={onNotebook} className="h-[30px] w-[30px] rounded-full border border-line bg-white text-ink shadow-md hover:bg-hover" />
          <SelectionActionsHost id={block.id} divider={cadTools || ['code', 'snippet'].includes(block.type)} />
        </div>
      )}
      <PerfContext.Provider value={phase => perfMark(block.id, phase)}>
        <LearningBlockBody block={block} onChange={onChange} onChangeQuiet={onChangeQuiet} onFile={onFile} appName={appName} onGrade={onGrade} selected={block.type === 'cad' ? viewSelected : selected} readOnly={cadPermissions.readOnly || cadPermissions.localCopy || cadPermissions.locked.has(block.id)} onCadEdit={() => cadOpen('edit')} cadAccount={cadPermissions.account} onPracticeHeight={setPracticeHeight} onControlsHeight={setControlsHeight} />
      </PerfContext.Provider>
      {block.sources && <SourcesDisclosure sources={block.sources} onFile={onFile} onHeight={setSourcesHeight} />}
      {block.promptUsed && <CardPrompt text={block.promptUsed} selected={selected} />}
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

// Open in notebook (docs/features/canvas-notebook.md) on a code card's own row, a small icon beside Ask in chat: off, with
// its reason, for code a notebook cannot run.
function NotebookButton({ entry, onNotebook, className = '' }) {
  const made = notebookFromCode(entry);
  if (!made || !onNotebook) return null;
  return (
    <button type="button" data-open-notebook aria-label="Open in notebook" disabled={!!made.disabled} title={made.disabled || 'Open in notebook'}
      onPointerDown={event => event.stopPropagation()} onClick={() => onNotebook(entry.id)}
      className={`flex items-center justify-center disabled:cursor-default disabled:text-ink-3 ${className}`}>
      <NotebookPen size={13} aria-hidden="true" />
    </button>
  );
}

// The Text / Code switch on a selected text box (docs/features/canvas-editing.md): the same object, words, place and
// size; Code shows it literally in monospace and keeps the text formatting aside for the switch back. Nothing runs.
function ModePill({ mode, onMode, lang = 'text', onLang = null, notebook = null }) {
  return (
    <div role="group" aria-label="Text or code" data-keep-focus data-thumbnail-hide style={{ fontSize: 12, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none' }}
      className="flex w-max items-center gap-0.5 rounded-lg border border-line bg-white p-0.5 font-sans shadow-md"
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}>
      {[['text', 'Text'], ['code', 'Code']].map(([value, label]) => (
        <button key={value} type="button" aria-pressed={(mode || 'text') === value} data-text-mode={value} title={value === 'code' ? 'Show as code: monospace, literal spacing' : 'Show as formatted text'}
          onClick={() => onMode(value)}
          className={`rounded px-1.5 py-0.5 text-[11px] ${(mode || 'text') === value ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'} ${value === 'code' ? 'font-mono' : ''}`}>{label}</button>
      ))}
      {/* The language (canvas-editing.md section 3). Its own press is let through: a prevented one never opens the list. */}
      {mode === 'code' && onLang && (
        <select aria-label="Code language" title="Code language" value={lang} onChange={event => onLang(event.target.value)} onPointerDown={event => event.stopPropagation()}
          className="cursor-pointer rounded bg-white px-1 py-0.5 text-[11px] text-ink-2 outline-none hover:bg-hover hover:text-ink">
          {CODE_LANGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      )}
      {mode === 'code' && notebook}
    </div>
  );
}

// The words of a text box or note as drawn: its level's size and weight, its own formatting, its colour.
const itemBase = item => {
  if (item.kind === 'sticky') return baseOf(item, { color: stickyTone(item.color).text, size: 13, weight: 400 });
  const level = TEXT_LEVELS.find(entry => entry.id === item.level);
  const base = baseOf({ ...item, textColor: undefined }, { color: item.color || COLORS[0], size: level?.size || item.size || 14, weight: level?.weight || 400 });
  return item.mode === 'code' ? { ...base, b: false, i: false, u: false, f: 'mono' } : base;
};

// editOn: { id, n } - the canvas asking this item to open for typing (Enter on a selected text box). onEditStart: the
// edit began (its undo step opens). onCommit(id, runs, how): the edit ended. onEditorApi: the open editor's handle.
function CanvasItem({ item, zoom, cameraKey, getTooltipSpace, tool, selected, onSelect, onCommit, onMove, onResize, onGesture, onDelete, onSnap = null, onLevel = null, editOn = null, onEditStart = null, onEditorApi = null, onMode = null, onLang = null, onNotebook = null, onInlineAI = null, onDiscardCode = null }) {
  const [editing, setEditing] = useState(!!item.fresh);
  // A Code box not being edited is drawn in its language's colors, once they are ready for exactly these words.
  const [colors, setColors] = useState(null);
  const lang = codeLang(item);
  const colorKey = item.kind === 'text' && item.mode === 'code' && !editing ? `${lang}\n${item.text || ''}` : null;
  useEffect(() => {
    if (!colorKey) return undefined;
    let live = true;
    highlightCode(item.text || '', lang).then(runs => { if (live) setColors(runs && { key: colorKey, runs }); });
    return () => { live = false; };
  }, [colorKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [point, setPoint] = useState(null);
  const edit = useContext(CanvasEdit), locked = edit.readOnly || edit.locked.has(item.id);
  const body = useRef(null);
  // A divider's old title keeps its plain editor; it is pinned while editing so a re-render never wipes it.
  const shown = useRef(item.text);
  useEffect(() => { if (editing && item.kind === 'section') body.current?.focus(); }, [editing, item.kind]);
  const sticky = item.kind === 'sticky';
  const code = item.kind === 'text' && item.mode === 'code';
  // A section is a rule across the column with a title under it - the thing that
  // turns a long canvas into chapters. It carries no colour or size of its own,
  // so it reads as structure rather than as another annotation.
  const section = item.kind === 'section';
  // Double-click (the caret lands where it was pressed) or Enter (the canvas's editOn) opens it; a locked one never.
  const startEdit = (event = null) => {
    if (locked || editing) return;
    shown.current = item.text;
    setPoint(event ? { x: event.clientX, y: event.clientY } : null);
    onEditStart?.(item.id);
    setEditing(true);
  };
  useEffect(() => { if (editOn?.id === item.id) startEdit(); }, [editOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const down = event => {
    if (event.button !== 0) return;
    if (tool === 'eraser') { event.preventDefault(); event.stopPropagation(); if (!locked) onDelete(item.id); return; }
    if (tool !== 'select') return;
    // While typing, a press places the caret and a drag selects words: neither moves the box nor pans the canvas. A press
    // on the box's own padding (a note's blank lower part) keeps the editor's focus and puts the caret at the end.
    if (editing) {
      event.stopPropagation();
      if (!event.target.closest('[data-rich-editor],[data-code-box-editor]')) {
        event.preventDefault();
        const editor = event.currentTarget.querySelector('[data-rich-editor]');
        if (editor) { editor.focus({ preventScroll: true }); document.getSelection()?.selectAllChildren(editor); document.getSelection()?.collapseToEnd(); }
      }
      return;
    }
    if (pickOnPress(selected, event)) onSelect(item.id, event);
    if (locked || (selected && event.shiftKey)) { event.preventDefault(); event.stopPropagation(); return; }
    if (event.altKey && edit.altDrag) { edit.altDrag(item.id, event); return; }
    // The undo step is taken on the first real movement: a click that only selects leaves none.
    let stepped = false;
    startDrag(event, { x: item.x, y: item.y }, (x, y) => { if (!stepped) { stepped = true; onGesture(); } onMove(item.id, x, y); }, zoom, onSnap?.(item.id));
  };
  if (section) {
    // A divider is only a rule now - Section / Sub-section headings do the
    // titling. Dividers made before that keep the title they were given.
    const titled = !!item.text;
    return (
      <div data-block data-section style={{ left: item.x, top: item.y, width: item.w || COLUMN }}
        className={`group absolute z-10 cursor-grab py-2 active:cursor-grabbing ${selected ? 'rounded ring-2 ring-accent ring-offset-2' : ''}`}
        onPointerDown={down} onDoubleClick={titled && !locked ? () => { shown.current = item.text; setEditing(true); } : undefined}>
        <div className="h-px w-full bg-line-strong" />
        {titled && <div ref={body} contentEditable={editing} suppressContentEditableWarning
          onBlur={e => { setEditing(false); const text = e.currentTarget.textContent; shown.current = text; onCommit(item.id, [{ t: text }], 'blur'); }}
          className="mt-2 text-sm font-medium text-ink outline-none">{shown.current}</div>}
        {/* Reachable without selecting first: a section is structure, and removing
            one should not need the same ceremony as editing it. */}
        {!locked && <button type="button" aria-label="Remove divider" title="Remove divider"
          onPointerDown={event => event.stopPropagation()}
          onClick={() => onDelete(item.id)}
          className="absolute -top-2 right-0 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-3 opacity-0 hover:bg-hover hover:text-ink focus-visible:opacity-100 group-hover:opacity-100">
          <X size={13} />
        </button>}
      </div>
    );
  }
  // The selection actions (Add to chat, Quick Edit; r35's Ask in chat), on a text box or note with words in it; never while it
  // is edited. A text box's actions keep its top right, the place its comment pins leave free (pillRow), so while they show
  // the ladder and Text | Code take the line above: beside the ladder the 293 px actions ran past a narrow box's right edge
  // and its pin landed on H1 (r38 selected-pill gate).
  const chrome = !locked && (editing || (selected && tool === 'select'));
  const ladder = !sticky && item.kind === 'text' && onLevel && chrome;
  const ask = selected && !editing && tool === 'select' && !!String(item.text || '').trim();
  const above = ladder && ask;
  const askPill = <SelectionActionsHost id={item.id} className={sticky ? 'absolute z-30 -translate-x-full' : 'ml-auto'} style={sticky ? { left: item.x + (item.w || 160), top: item.y - 40 } : null} />;
  const base = itemBase(item);
  const ink = sticky ? (value => value) : inkAware;
  return (<>
    <div data-block data-item-id={item.id} data-text-mode={item.kind === 'text' ? item.mode || 'text' : undefined}
      style={{ left: item.x, top: item.y, opacity: item.opacity, ...(sticky
        // A note grows with its words rather than clipping them; its corner sets the least it can be.
        ? { width: item.w || 160, minHeight: item.h || 160, background: stickyTone(item.color).bg, borderColor: stickyTone(item.color).border, color: stickyTone(item.color).text, '--sticky-ph': stickyTone(item.color).placeholder }
        : { color: inkAware(item.color), ...textStyle(item), ...(code ? { minWidth: item.w || 96, width: 'max-content' } : item.w ? { width: item.w } : { width: 'max-content' }), ...(item.h ? { minHeight: item.h } : {}) }) }}
      className={`absolute z-10 ${editing ? 'cursor-text' : selected && !locked ? 'cursor-move' : 'cursor-default'} ${sticky
        // Text has no card behind it, so its box is invisible until you are on
        // it. The border is always there and only gains a colour on hover, so
        // nothing shifts; the padding is cancelled by the margin for the same
        // reason - glyphs stay exactly where they were placed.
        ? '-rotate-1 flex flex-col overflow-hidden rounded-sm border p-3 text-[13px] leading-snug shadow-md'
        : `min-w-24 -mx-1 -my-0.5 rounded border px-1 py-0.5 leading-snug ${code ? 'border-line bg-hover/60' : 'border-transparent'} ${tool === 'select' && !code ? 'hover:border-line' : ''}`} ${selected ? 'ring-2 ring-select ring-offset-1' : ''}`}
      onPointerDown={down} onDoubleClick={event => { if (tool === 'select') startEdit(event); }}>
      {/* A selected or editing text box offers its ladder right there - H1 to
          text - and Text / Code, instead of asking the learner to find the style
          panel. pointerdown is swallowed so choosing never blurs or deselects. */}
      {/* Beside the ladder and Text | Code, the selection actions would run past the box's right edge, so those two take
          their own line above; the actions keep the row against the box. */}
      {(ladder || (ask && !sticky)) && (
        <div className="absolute bottom-full left-0 z-20 mb-2.5 flex min-w-full flex-col items-start gap-1.5">
          {above && <div className="flex items-center gap-2">
            {!code && <LevelPill level={item.level} onLevel={value => onLevel(item.id, value)} />}
            {onMode && <ModePill mode={item.mode} onMode={value => onMode(item.id, value)} lang={lang} onLang={onLang && (value => onLang(item.id, value))} notebook={<NotebookButton entry={item} onNotebook={onNotebook} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink" />} />}
          </div>}
          <div className="flex items-center gap-2 self-stretch">
            {ladder && !code && !above && <LevelPill level={item.level} onLevel={value => onLevel(item.id, value)} />}
            {ladder && onMode && !above && <ModePill mode={item.mode} onMode={value => onMode(item.id, value)} lang={lang} onLang={onLang && (value => onLang(item.id, value))} notebook={<NotebookButton entry={item} onNotebook={onNotebook} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink" />} />}
            {ask && !sticky && askPill}
          </div>
        </div>
      )}
      {code && editing ? <Suspense fallback={<div role="status">Loading code editor</div>}>
        <CodeBoxEditor key={item.id} value={item.text || ''} language={item.lang} filename={item.filename} base={base}
          readOnly={locked} zoom={zoom} cameraKey={cameraKey} getTooltipSpace={getTooltipSpace} onApi={onEditorApi}
          onLanguageChange={value => !locked && onLang?.(item.id, value)} onInlineAI={!locked ? onInlineAI : null}
          onDiscard={() => { setEditing(false); setPoint(null); onDiscardCode?.(); }}
          onExit={({ value, reason, conflict, expectedText }) => {
            if (conflict || onCommit(item.id, [{ t: value }], reason, { expectedText }) === false) return false;
            setEditing(false); setPoint(null); return true;
          }} />
      </Suspense> : <RichText entry={item} base={base} colorOf={ink} code={code} colors={colors?.key === colorKey ? colors.runs : null} editing={editing} point={point}
        placeholder={sticky ? 'Note' : code ? 'Code' : 'Text'} aria-label={sticky ? 'Sticky note' : code ? 'Code' : 'Text'}
        style={{ ...objectStyle(item, base, ink), ...(code ? { fontWeight: 400, fontStyle: 'normal', textAlign: 'left' } : {}) }}
        className={`${sticky ? 'flex-1 empty:before:text-[color:var(--sticky-ph)]' : 'empty:before:opacity-50'} empty:before:content-[attr(data-placeholder)]`}
        onApi={onEditorApi} onCommit={(runs, how) => { setEditing(false); setPoint(null); onCommit(item.id, runs, how); }} />}
      {/* Text gets the same corner control as a note: the box scales, the
          type does not - wrapping is what changes, never the font size. The
          glyph is the card nodes' diagonal-lines corner, not a square. */}
      {(sticky || item.kind === 'text') && selected && tool === 'select' && !locked && (
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
    {/* A note clips and tilts what is inside it, so its pill sits beside it in the layer, above its top right. */}
    {ask && sticky && askPill}
  </>);
}

// An equation (docs/features/canvas-equations.md): its LaTeX rendered by KaTeX, and while edited MathLive's field with
// the palette above it (EquationEditor.jsx, loaded on the first edit). Double-click edits; a click away or Esc finishes.
function EquationItem({ item, zoom, tool, selected, onSelect, onMove, onGesture, onDelete, onSnap, onPatch, onDone, onDraft, generation, editOn = null }) {
  const [editing, setEditing] = useState(!!item.fresh);
  const size = item.size || EQUATION_SIZE;
  const still = item.latex ? <MathText expression={item.latex} display /> : <span className="text-[0.6em] text-ink-3 italic">Empty equation</span>;
  const edit = useContext(CanvasEdit), locked = edit.readOnly || edit.locked.has(item.id);
  useEffect(()=>{if(locked)setEditing(false);},[locked]);
  // Edit LaTeX from the right-click menu (UI-25): the same editor a double-click opens.
  useEffect(() => { if (editOn?.id === item.id && !locked) setEditing(true); }, [editOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const down = event => {
    if (event.button !== 0) return;
    if (tool === 'eraser') { event.preventDefault(); event.stopPropagation(); if (!locked) onDelete(item.id); return; }
    if (tool !== 'select') return;
    if (editing) { event.stopPropagation(); return; }
    if (pickOnPress(selected, event)) onSelect(item.id, event);
    if (locked || (selected && event.shiftKey)) { event.preventDefault(); event.stopPropagation(); return; }
    if (event.altKey && edit.altDrag) { edit.altDrag(item.id, event); return; }
    // The undo step is taken on the first real movement: a click that only selects leaves none.
    let stepped = false;
    startDrag(event, { x: item.x, y: item.y }, (x, y) => { if (!stepped) { stepped = true; onGesture(); } onMove(item.id, x, y); }, zoom, onSnap?.(item.id));
  };
  return (
    <div data-block data-item-id={item.id} data-equation={editing ? 'editing' : ''} style={{ left: item.x, top: item.y, fontSize: size, color: inkAware(item.color || COLORS[0]) }}
      className={`absolute z-10 -mx-1 rounded border px-1 [&_[data-chat-math]]:my-0 [&_[data-chat-math]]:py-0 ${editing ? 'cursor-text border-line bg-white' : `cursor-grab border-transparent active:cursor-grabbing ${tool === 'select' ? 'hover:border-line' : ''}`} ${selected ? 'ring-2 ring-select ring-offset-1' : ''}`}
      onPointerDown={down} onDoubleClick={() => { if (tool === 'select' && !locked) setEditing(true); }}>
      {editing && !locked
        ? <Suspense fallback={still}><EquationEditor latex={item.latex || ''} zoom={zoom} generation={generation?{...generation,onAccept:async result=>{const out=await generation.onAccept(result);if(out?.ok)setEditing(false);return out;}}:null} onDraft={latex => onDraft(item.id, latex)} onDone={latex => { setEditing(false); onDone(item.id, latex); }} /></Suspense>
        : still}
      {/* The size ladder, where a text box shows its H1-to-text one; never while the LaTeX is edited (the palette is there). */}
      {selected && !editing && !locked && tool === 'select' && (
        <div className="absolute bottom-full left-0 z-20 mb-2.5 flex items-center gap-1.5">
          <LevelPill level={equationLevel(size)} levels={EQUATION_LEVELS} label="Equation size" fallback={null}
            onLevel={value => { onGesture(); onPatch(item.id, { size: levelSize(value) }); }} />
          <SelectionActionsHost id={item.id} divider />
        </div>
      )}
      {/* The corner scales the type, as a text box's corner reflows its text. */}
      {selected && !editing && !locked && tool === 'select' && (
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
        aria-label="Filter blocks" placeholder="Filter"
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

// An arrowhead (learn-style-panel.js HEADS) at `tip`, pointing away from `from`: open arrow, filled triangle, dot or bar.
const headMark = (kind, tip, from, stroke, key = undefined) => {
  if (!kind || kind === 'none' || !tip || !from) return null;
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x), size = 8 + stroke.strokeWidth * 2;
  const at = (turn, reach) => `${tip.x - reach * Math.cos(angle + turn)} ${tip.y - reach * Math.sin(angle + turn)}`;
  const solid = { stroke: stroke.stroke, strokeWidth: stroke.strokeWidth, opacity: stroke.opacity, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (kind === 'triangle') return <path key={key} data-head="triangle" d={`M${at(-0.42, size)} L${tip.x} ${tip.y} L${at(0.42, size)} Z`} {...solid} fill={stroke.stroke} />;
  if (kind === 'dot') { const r = 2.5 + stroke.strokeWidth; return <circle key={key} data-head="dot" cx={tip.x - r * Math.cos(angle)} cy={tip.y - r * Math.sin(angle)} r={r} {...solid} fill={stroke.stroke} />; }
  if (kind === 'bar') { const half = size / 2; return <path key={key} data-head="bar" d={`M${tip.x + half * Math.sin(angle)} ${tip.y - half * Math.cos(angle)} L${tip.x - half * Math.sin(angle)} ${tip.y + half * Math.cos(angle)}`} {...solid} fill="none" />; }
  return <path key={key} data-head="arrow" d={`M${at(-0.45, size)} L${tip.x} ${tip.y} L${at(0.45, size)}`} {...solid} fill="none" />;
};

// The words on a line as drawn: 13px unless sized, the line's own colour unless given a text colour.
const labelBase = entry => baseOf(entry, { color: entry.color || COLORS[0], size: 13, weight: 400 });

// A label in the middle of a connector or a drawn arrow. It sits on a small
// paper patch so the line does not run through the words; only the editor
// takes the pointer. It edits like every canvas text (RichText): Enter breaks the
// line, Esc or Ctrl/Cmd+Enter commits (docs/features/canvas-connectors.md).
function LineLabel({ at, entry, editing, pickable = false, onPick = null, onDone, onApi = null }) {
  const [point, setPoint] = useState(null);
  const text = entry.label || '';
  if (!editing && !text) return null;
  const base = labelBase(entry);
  return (
    <foreignObject x={at.x - 120} y={at.y - 40} width={240} height={80} style={{ overflow: 'visible', pointerEvents: 'none' }}>
      <div className="flex h-full w-full items-center justify-center">
        <RichText entry={{ ...entry, text }} base={base} colorOf={inkAware} editing={editing} point={point} data-line-label aria-label="Line label"
          style={{ ...objectStyle(entry, base, inkAware), textAlign: ALIGNS.includes(entry.align) ? entry.align : 'center', pointerEvents: editing || pickable ? 'auto' : 'none' }}
          onPointerDown={event => {
            event.stopPropagation();
            // On a selected line, a click on its label edits it, the caret where it was pressed.
            if (!editing && pickable) { event.preventDefault(); setPoint({ x: event.clientX, y: event.clientY }); onPick?.(); }
          }}
          onApi={onApi} onCommit={(runs, how) => { setPoint(null); onDone(runs, how); }}
          className="max-w-[240px] min-w-4 cursor-text rounded bg-white px-1.5 py-0.5 leading-snug" />
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
// The words inside a closed shape as drawn: its level's size unless sized, its outline's colour unless given a text colour.
const shapeBase = shape => { const level = textStyle(shape); return baseOf(shape, { color: shape.color || COLORS[0], size: level.fontSize, weight: level.fontWeight || 400 }); };
const shapeTextCss = (shape, base) => ({ ...objectStyle(shape, base, inkAware), lineHeight: 1.25, textAlign: ALIGNS.includes(shape.align) ? shape.align : 'center' });
const JUSTIFY = { top: 'justify-start', middle: 'justify-center', bottom: 'justify-end' };
const MIN_SHAPE = 16;


// onGestureCancel: Esc during a resize puts the shape back and drops the step. onGrow(id, height): the words need more
// room than the shape has, so it grows downward instead of clipping them.
function ShapeView({ shape, tool, zoom, selected, editing = false, editPoint = null, labelEditing = false, showPorts = false, onSelect, onMoveStart, onResize, onGesture, onGestureCancel = null, onDelete, onEdit, onText, onConnect, onLabel, onLabelDone, onGrow = null, onEditorApi = null }) {
  const { kind, x1, y1, x2, y2, color, width, dash, fill, opacity, round } = shape;
  const canvasEdit = useContext(CanvasEdit), locked = canvasEdit.locked.has(shape.id);
  // Unfilled shapes paint a transparent fill so the pointer can grab the
  // interior, not just the hairline outline. Transparent paint still hit-tests
  // under visiblePainted; opacity 0 keeps it invisible.
  const stroke = { stroke: shape.noStroke ? 'none' : inkAware(color), strokeWidth: width, fill: fill ? inkAware(fill) : 'transparent', fillOpacity: fill ? (shape.fillOpacity ?? 0.25) : 0, opacity, strokeDasharray: dashArray(dash, width), strokeLinecap: 'round', strokeLinejoin: 'round' };
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  const control = kind === 'curve' ? curveControl(shape) : null;
  const linear = kind === 'line' || kind === 'arrow' || kind === 'curve' || kind === 'elbow';
  const elbow = kind === 'elbow' ? freeElbow(shape) : null;
  const middle = kind === 'curve' ? { x: 0.25 * x1 + 0.5 * control.x + 0.25 * x2, y: 0.25 * y1 + 0.5 * control.y + 0.25 * y2 } : elbow ? polylineMid(elbow) : { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const heads = headsOf(shape);
  const textBox = TEXT_BOX[kind];
  const textRef = useRef(null);
  const base = textBox ? shapeBase(shape) : null;
  const boxW = textBox ? Math.max(1, (textBox[2] - textBox[0]) * w) : 0, boxH = textBox ? Math.max(1, (textBox[3] - textBox[1]) * h) : 0;
  // Words never overflow silently: while typing, and after any change to the words or their formatting, a shape whose
  // words need more height grows to hold them. Never on load - opening a board changes nothing on it.
  const changed = useRef(false);
  const textKey = textBox ? JSON.stringify([shape.text, shape.runs, shape.font, shape.fontSize, shape.level, shape.bold, shape.italic, Math.round(boxW), Math.round(boxH)]) : '';
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || !textBox || !onGrow) return undefined;
    const check = () => { if (element.offsetHeight > boxH + 0.5) onGrow(shape.id, element.offsetHeight / (textBox[3] - textBox[1])); };
    if (editing) { const observer = new ResizeObserver(check); observer.observe(element); return () => observer.disconnect(); }
    if (changed.current) check();
    changed.current = true;
    return undefined;
  }, [editing, textKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const down = event => {
    if (event.button !== 0) return;
    if (editing || labelEditing) { event.stopPropagation(); return; }
    if (tool === 'eraser') { event.stopPropagation(); if (!locked) onDelete(shape.id); return; }
    if (tool !== 'select') return;
    if (pickOnPress(selected, event)) onSelect(shape.id, event);
    // Shift takes a selected shape out of the selection; a locked shape is selected, never moved.
    if ((selected && event.shiftKey) || locked) { event.stopPropagation(); event.preventDefault(); return; }
    onMoveStart(event, shape);
  };
  // The least a shape with words can be at a width: tall enough to hold them (they never shrink to fit).
  const minSize = boxWidth => {
    if (!textBox || !(shape.text || editing)) return { w: MIN_SHAPE, h: MIN_SHAPE };
    const tall = measureHeight(runsOf(shape), base, inkAware, shapeTextCss(shape, base), boxWidth * (textBox[2] - textBox[0]));
    return { w: MIN_SHAPE, h: Math.max(MIN_SHAPE, tall / (textBox[3] - textBox[1])) };
  };
  // Drag an endpoint (linear) or a corner (boxed) to resize the drawn shape: Shift keeps the proportions (snaps a line
  // to 45 degrees), Alt/Option keeps the centre.
  const handles = linear
    ? [[x1, y1, 'start'], [x2, y2, 'end']]
    : [[x, y, [0, 0]], [x + w, y, [1, 0]], [x + w, y + h, [1, 1]], [x, y + h, [0, 1]]];
  return (
    <g data-shape-id={shape.id} data-locked={locked ? '' : undefined} className="group" style={{ pointerEvents: tool === 'preview' ? 'none' : 'visiblePainted', cursor: tool === 'select' ? (locked ? 'default' : 'move') : undefined }} onPointerDown={down}
      onDoubleClick={event => {
        // A double-click inside the open editor selects a word; it never starts the edit again.
        if (tool !== 'select' || locked || editing || labelEditing) return;
        if (textBox && onEdit) onEdit(shape.id, { x: event.clientX, y: event.clientY });
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
      {elbow && <path d={pathOf(elbow)} fill="none" stroke="transparent" strokeWidth={Math.max(14 / zoom, width + 8)} strokeLinejoin="round" />}
      {linear && headMark(heads.end, kind === 'elbow' ? elbow[elbow.length - 1] : { x: x2, y: y2 }, kind === 'curve' ? control : kind === 'elbow' ? elbow[elbow.length - 2] : { x: x1, y: y1 }, stroke, 'end')}
      {linear && headMark(heads.start, { x: x1, y: y1 }, kind === 'curve' ? control : kind === 'elbow' ? elbow[1] : { x: x2, y: y2 }, stroke, 'start')}
      {linear && <LineLabel at={middle} entry={shape} editing={labelEditing} pickable={selected && tool === 'select' && !locked} onPick={() => onLabel?.(shape.id)} onDone={(runs, how) => onLabelDone(shape.id, runs, how)} onApi={onEditorApi} />}
      {linear && selected && tool === 'select' && !locked && !labelEditing && !shape.label && onLabel && <LabelHandle at={middle} zoom={zoom} onPick={() => onLabel(shape.id)} />}
      {/* Text in the middle of a closed shape: it wraps inside the outline and
          reflows as the shape is resized. Only the editor takes the pointer. */}
      {textBox && (shape.text || editing) && (
        <foreignObject x={x + textBox[0] * w} y={y + textBox[1] * h} width={boxW} height={boxH}
          style={{ pointerEvents: editing ? 'all' : 'none', overflow: 'visible' }}>
          <div className={`flex h-full w-full flex-col ${JUSTIFY[shape.valign] || JUSTIFY.middle}`} style={{ opacity }}>
            <RichText rootRef={textRef} entry={shape} base={base} colorOf={inkAware} editing={editing} point={editPoint} data-shape-text aria-label="Shape text"
              style={shapeTextCss(shape, base)} className="w-full min-w-4"
              onApi={onEditorApi} onCommit={(runs, how) => onText(shape.id, runs, how)} />
          </div>
        </foreignObject>
      )}
      {selected && !linear && <rect data-thumbnail-hide x={x - 5} y={y - 5} width={w + 10} height={h + 10} fill="none" style={{ stroke: 'var(--color-select)' }} strokeWidth="1" strokeDasharray="4 3" />}
      {selected && tool === 'select' && !locked && handles.map(([hx, hy, grip], index) => (
        <circle key={index} data-thumbnail-hide data-handle={linear ? grip : grip.join('')} cx={hx} cy={hy} r={5 / zoom} fill="white" strokeWidth={1.5 / zoom}
          style={{ stroke: 'var(--color-select)', pointerEvents: 'all', cursor: linear ? 'move' : grip[0] === grip[1] ? 'nwse-resize' : 'nesw-resize' }}
          onPointerDown={event => {
            if (event.button !== 0) return;
            onGesture();
            const from = { ...shape };
            const apply = (px, py, keys) => onResize(shape.id, linear ? moveEnd(from, grip, { x: px, y: py }, keys) : resizeBox(from, grip, { x: px, y: py }, keys, minSize));
            apply.cancel = () => onGestureCancel?.();
            startDrag(event, { x: hx, y: hy }, apply, zoom);
          }} />
      ))}
      {/* Connection ports on the four sides: drag to another shape or card, or
          click here and then click the target. */}
      {textBox && tool === 'select' && onConnect && SIDES.filter(side => side !== 'top' || !canvasEdit.hasPin?.(shape.id)).map(side => { // the top one steps aside for a comment pin, as on a card
        const at = sidePoint({ x, y, w, h }, side);
        return (
          <circle key={side} data-port={side} data-owner={shape.id} cx={at.x} cy={at.y} r={6 / zoom} fill="white" strokeWidth={1.5 / zoom}
            className={selected || showPorts ? '' : 'opacity-0 group-hover:opacity-100'} style={{ stroke: 'var(--color-select)', pointerEvents: 'all', cursor: 'crosshair' }}
            onPointerDown={event => onConnect(event, shape.id, side)}><title>Drag or click to connect</title></circle>
        );
      })}
    </g>
  );
}

const TOOL_KEY_OF = Object.fromEntries(Object.entries(TOOL_KEYS).map(([key, tool]) => [tool, key.toUpperCase()]));
function ToolButton({ value, Icon, label, hint, active, onPick }) {
  const key = TOOL_KEY_OF[value];
  return (
    <button type="button" title={[key ? `${label} (${key})` : label, hint].filter(Boolean).join(' · ')} aria-label={label} aria-keyshortcuts={key} aria-pressed={active}
      // A pointer press never leaves the tool focused (keyboard Tab still does), so Space after a click pans instead of pressing it again.
      onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }} onClick={onPick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-ink text-white' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
      <Icon size={15} strokeWidth={1.7} />
    </button>
  );
}

// A group's outline sits GROUP_PAD outside its members; its name chip's row starts GROUP_CHIP above the outline.
const GROUP_PAD = 12, GROUP_CHIP = 28;

// The name tag of a group, floating just above its top-left corner. Click
// selects the whole group; double-click renames it in place.
function GroupChip({ group, onSelect, onLabel, editOn = false }) {
  const [editing, setEditing] = useState(false);
  const body = useRef(null);
  const chip = useRef(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!editing) return;
    // Caret at the END of the shown name (owner 2026-10-21: after the p in "Group"), so editing means editing - not
    // typing in front of it. An unnamed group shows the default name as its text. rAF outruns the double-click's own selection.
    requestAnimationFrame(() => {
      const node = body.current;
      if (!node) return;
      node.textContent = groupEditText(group.label);
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
  // Enter saves and Escape cancels, then focus goes back to the chip; blur (a click elsewhere) saves.
  const finish = cancel => { cancelled.current = cancel; body.current?.blur(); chip.current?.focus(); };
  return (
    <div ref={chip} tabIndex={-1} data-group-chip={group.id}
      className="flex cursor-pointer items-center rounded-md border border-line bg-white/90 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-ink-2 shadow-sm backdrop-blur-sm outline-none hover:text-ink focus-visible:ring-1 focus-visible:ring-accent"
      onPointerDown={event => { event.stopPropagation(); if (!editing) onSelect(); }}
      onDoubleClick={() => setEditing(true)}>
      <div ref={body} contentEditable={editing} suppressContentEditableWarning data-placeholder="Group"
        onKeyDown={event => { if (!editing) return; event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); finish(false); } else if (event.key === 'Escape') { event.preventDefault(); finish(true); } }}
        onBlur={event => {
          const cancel = cancelled.current;
          cancelled.current = false;
          setEditing(false);
          const label = cancel ? group.label || '' : groupLabelFrom(group.label, event.currentTarget.textContent);
          event.currentTarget.textContent = label;
          onLabel(cancel ? null : label);
        }}
        className="min-w-6 outline-none empty:before:opacity-60 empty:before:content-[attr(data-placeholder)]">{group.label}</div>
    </div>
  );
}

const CARDS_COPIED = 'rabbit-hole:copied-cards';

export default function AdaptiveCanvas({ exchanges, onMove, onSearch = null, bottomLeft = null, onDelete = null, onRestore = null, onAskTarget = null, askTargetId = null, onOpenFile = null, onAdd = null, onGrade = null, onResize = null, onReply = null, appName = null, apiRef = null, onState = null, storageKey = null, seedBlocks = null, composer = null, renderBlockComposer = null, onWiki = null, onWatch = null, onDropFiles = null, onCardAction = null, attachedIds = null, onGroupShot = null, onAreaShot = null, onPaper = null, edgeInset = 0, boardState = null, onSave = null, readOnly = false, localCopy = false, gutterTop = null, leftRail = null, hooks = null, onStartRabbitHole = null, onAddComment = null, commentPins = null, onCommentPin = null, onPinColor = null, onPinDelete = null, onCommentObjects = null, onUngroupComments = null, onPasteCode = null, inlineAi = null, docView = 'canvas', docReady = true, docError = null, onDocRetry = null, onDocDirty = null, refLinks = null, onLinkCanvas = null, onPinForStudy = null, permissions = null, onSignIn = null }) {
  // A view-only board pans and zooms with the hand and edits nothing.
  const [tool, setTool] = useState(readOnly ? 'hand' : 'select');
  const readOnlyRef = useRef(readOnly);
  // Local-copy mode (SHARE-02, C:/s/spec/share/contract-guest-draft.md): a visitor edits a temporary copy of a shared canvas -
  // shapes, text, moving, resizing, duplicating, arranging, styling, deleting, undo - saved only through onSave (the guest
  // draft), never to the source. Card bodies and the document stay read-only, and nothing in here starts server work.
  const localCopyRef = useRef(localCopy);
  localCopyRef.current = localCopy;
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
  const [renaming, setRenaming] = useState(null); // { id, title, rect }: a card's title being renamed in place (card-rename.js)
  const [composerHidden, setComposerHidden] = useState(false);
  const hideComposer = useCallback(() => setComposerHidden(true), []);
  // Ask in chat (askDraft) writes a ready question into the composer: a hidden composer comes back to show it.
  useEffect(() => {
    if (!composerHidden) return undefined;
    const show = () => setComposerHidden(false);
    window.addEventListener('small:ask-focus', show);
    return () => window.removeEventListener('small:ask-focus', show);
  }, [composerHidden]);
  // The inline AI editor (docs/features/inline-ai-editor.md): its frozen target while open. Ctrl/Cmd+K, the canvas menu and
  // the page's Edit menu open it; a request's whole life is InlineAiEditor.jsx's, and it lands only through applyInline.
  const [inline, setInline] = useState(null);
  // A7: a generated card's ghost - rendered only, never in the board: at the end of the column, offset (dx, dy) to the
  // spot the editor placed it. hidden: drawn invisibly once so its real size can be measured before it is placed.
  const [cardGhost, setCardGhost] = useState(null);
  const inlineRef = useRef(null);
  inlineRef.current = inline;
  const inlineAiRef = useRef(inlineAi);
  inlineAiRef.current = inlineAi;
  const [inlineHint, setInlineHint] = useState(0);
  const inlineOpens = useRef(0);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = !!menuAt;
  // The menu's placement, keyboard, outside-click and focus return live in CanvasMenu.jsx (UI-25); its rows in canvas-actions.js.
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
  const [noStroke, setNoStroke] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [round, setRound] = useState(false);
  // Armed for the next thing drawn, like colour: fill opacity, arrowheads (null: the kind's own), and the text formatting
  // a new text box, note or shape text starts with (docs/features/canvas-editing.md).
  const [fillOpacity, setFillOpacity] = useState(0.25);
  const [heads, setHeads] = useState({ start: null, end: null });
  const [textArm, setTextArm] = useState({});
  // The open text editor's handle (RichText onApi): the style panel formats its characters while it is open.
  const editorRef = useRef(null);
  const [editorTick, setEditorTick] = useState(0);
  // Curious (semanticReader, below): what the page hears of the canvas's meaning, declared before onState reads it.
  const [semanticFingerprint, setSemanticFingerprint] = useState(null);
  const [semanticSettling, setSemanticSettling] = useState(false);
  const editorUnsub = useRef(null);
  const onEditorApi = useCallback(api => {
    editorUnsub.current?.();
    editorUnsub.current = null;
    editorRef.current = api;
    if (api) editorUnsub.current = api.subscribe(() => setEditorTick(tick => tick + 1));
    setEditorTick(tick => tick + 1);
  }, []);
  // Enter on a selected text box or note opens it (CanvasItem editOn); a shape's text and a line's label open by id.
  const [editTarget, setEditTarget] = useState(null);
  const [editPoint, setEditPoint] = useState(null);
  // Copy style / paste style: appearance only, never words, identity or position.
  const styleClip = useRef(null);
  const [canPasteStyle, setCanPasteStyle] = useState(false);
  // Space held over a canvas that owns the keyboard: a drag pans, whatever is under it.
  const [spacePan, setSpacePan] = useState(false);
  const spacePanRef = useRef(false);
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
  // This browser's copy exactly as this canvas read it at mount, for the first save below.
  const readCopy = useRef(null);
  if (stored.current === null) {
    // A shared board arrives as state from the server instead (SharedBoardPage).
    try { readCopy.current = storageKey ? localStorage.getItem(storageKey) : null; stored.current = boardState || (storageKey ? JSON.parse(readCopy.current || '{}') : {}); } catch { stored.current = {}; }
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
  // Selection moving anywhere (a blank click, another object, Esc) releases every scene highlight it leaves behind
  // (EXP-T27): one owner, through the quiet path, so deselecting takes no undo step. An area's outline goes with it too
  // (EXP-T28): its pill stays until its x or Send, and an area an answer is linked from stays as that link's anchor.
  const releaseHighlights = keep => {
    setBlocks(previous => releaseSceneHighlights(previous, keep));
    setAreas(previous => { const next = previous.filter(area => keep.includes(area.id) || exchanges.some(exchange => exchange.linkFrom === area.id)); return next.length === previous.length ? previous : next; });
  };
  const setSelected = value => { setSelection(value == null ? [] : [value]); releaseHighlights(value == null ? [] : [value]); };
  const pickTool = value => { setTool(value); if (DRAWING_TOOLS.has(value)) setSelection([]); };
  // Selecting on the canvas takes the keyboard away from the composer so
  // Delete acts on the selection; editable notes keep their own focus.
  const select = (id, event = null) => {
    // Picking something lets the style panel follow it again, even if the
    // learner closed the panel earlier: a shape's colours are one click away.
    setStyleOpen(null);
    const active = document.activeElement;
    if (id && active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) active.blur();
    // Excalidraw's rules (docs/features/canvas-editing.md): a plain click picks the object - its whole group when it is
    // in one; Ctrl/Cmd+click picks the one member inside a group, without ungrouping it; Shift+click adds what is not
    // selected and takes out what is (a group as one piece, unless Ctrl/Cmd is held too). Selection never rewrites groups.
    const one = event && (event.ctrlKey || event.metaKey);
    const gid = id == null ? null : groupOf(id);
    const piece = id == null ? [] : gid && !one ? membersOf(gid) : [id];
    let next = piece;
    if (id != null && event?.shiftKey) {
      const current = selectedRef.current;
      next = piece.every(other => current.includes(other)) ? current.filter(other => !piece.includes(other)) : [...current, ...piece.filter(other => !current.includes(other))];
    }
    // Read at once by a drag that starts on this same press (groupTargets), before the re-render.
    selectedRef.current = next;
    setSelection(next);
    releaseHighlights(next);
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
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  // Every area asked about stays on the canvas, outlined and lightly filled red, saved with the
  // board, until the learner clicks its outline to remove it.
  const [areas, setAreas] = useState(stored.current.areas || []);
  // The Table of contents' own list (owner brief 2026-10-23; learn-outline-model.js tocOf), or null while the board reads
  // its canvas headings. Saved and undone with the board; no TOC command touches the canvas objects.
  const [toc, setToc] = useState(() => (Array.isArray(stored.current.toc) ? stored.current.toc : null));
  const tocRef = useRef(toc);
  tocRef.current = toc;
  const areaById = id => areas.find(area => area.id === id);
  // The board an answer was asked about: the whiteboard itself, or the board a toolbar area was drawn on (EXP-T28).
  const boardOf = id => { const host = areaById(id)?.blockId || id; return blocks.find(block => block.id === host && block.type === 'whiteboard')?.id; };
  // The canvas's one document (docs/features/blocknote-canvas.md): { v, x, y, w, blocks } in world units, saved with the
  // board. Never part of the canvas's undo history (BlockNote keeps its own). docLive holds the editor's latest blocks at
  // once, so a chat turn reads unsaved words; the board copy (doc) follows after a pause, so typing never re-renders the canvas.
  const [doc, setDoc] = useState(() => (stored.current.doc && typeof stored.current.doc === 'object' ? stored.current.doc : null));
  const docRef = useRef(doc);
  docRef.current = doc;
  const docLive = useRef(doc?.blocks || null), docTimer = useRef(null);
  // The document as this canvas last wrote it to this browser's copy (JSON), so leaving can tell its own pending words from
  // a copy someone else (the server's, on load) put there since.
  const docWritten = useRef(JSON.stringify(doc ?? null));
  const liveDoc = () => (docRef.current ? { ...docRef.current, blocks: docLive.current || docRef.current.blocks || [] } : null);
  const divePortals = useContext(DivePortals);
  // Every change also goes to onSave (a shared board's server copy), if given.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  // The board as last rendered, for persist(): a caller holding an older canvasApi still saves the latest.
  const boardRef = useRef(null);
  boardRef.current = { strokes, shapes, items, links, blocks, groups, areas, ...(toc ? { toc } : {}), ...(doc ? { doc } : {}) };
  // The board as this canvas first showed it, which retire() compares the live board against (pendingWork).
  const mountedBoard = useRef(null);
  if (!mountedBoard.current) mountedBoard.current = boardRef.current;
  // Final review B-C1: an unmounted canvas (Home, the sidebar, a Rabbit Hole remounting the page) neither inserts nor
  // saves, so a run still holding its canvasApi never reports a block drawn or overwrites the new canvas's saved copy.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Retired (canvasApi.retire): the page is replacing this browser's copy with the server's and remounting the canvas on it,
  // so nothing this canvas still has pending - its as-loaded save, an edit's save, a document flush - may write that copy or
  // push it (board-empty-report). retire() answers the work made here since mount (pendingWork), which the page adds to
  // the server's copy instead.
  const retired = useRef(false);
  // The board as this browser's copy holds it (the debounced save's shape), and the last such board this canvas wrote or
  // mounted with: the unmount flush below writes only a board that differs from it.
  const savedShape = board => ({ strokes: board.strokes, shapes: board.shapes, items: board.items, links: board.links, blocks: lightBlocks(board.blocks), groups: board.groups, areas: board.areas, ...(board.toc ? { toc: board.toc } : {}), ...(board.doc ? { doc: board.doc } : {}) });
  const lastWritten = useRef(null);
  if (lastWritten.current === null) lastWritten.current = JSON.stringify(savedShape(mountedBoard.current));
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;
  const firstSave = useRef(true);
  useEffect(() => {
    if (!storageKey && !onSaveRef.current) return;
    // Oversized data URLs dropped (canvas-persist.js lightBlocks).
    const light = lightBlocks(blocks);
    // The first run is the board as loaded, not a change.
    const loaded = firstSave.current;
    firstSave.current = false;
    const timer = setTimeout(() => {
      if (retired.current) return;
      // The first run only writes back the board as loaded, so it never goes over a copy that changed since this canvas read
      // it: the server's copy the page put there on open, about to remount this canvas with it. Written over, the remounted
      // canvas read this board back empty and the page's next push sent that over the server's copy (board-empty-report).
      if (loaded && storageKey) { try { if (localStorage.getItem(storageKey) !== readCopy.current) return; } catch { /* blocked storage: nothing to write over */ } }
      const state = { strokes, shapes, items, links, blocks: light, groups, areas, ...(toc ? { toc } : {}), ...(doc ? { doc } : {}) };
      if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(state)); docWritten.current = JSON.stringify(state.doc ?? null); lastWritten.current = JSON.stringify(state); } catch { /* full or blocked storage loses drawings only */ } }
      if (!loaded) onSaveRef.current?.(state);
    }, 400);
    return () => clearTimeout(timer);
  }, [strokes, shapes, items, links, blocks, groups, areas, toc, doc, storageKey]);
  // Leaving the canvas (Home, the sidebar, a Rabbit Hole, a remount) cancels the pending save above, so an edit made less
  // than 400 ms before is written here instead, once, on unmount: this browser's copy, then the board's push at once
  // (owner: cancelling a pending save or remounting never discards work). Not for a retired canvas - the page has put its
  // work on the server's copy - and not when the board is what this canvas last wrote or mounted with. Declared before the
  // document's flush, which then adds the last words typed onto this copy.
  useEffect(() => () => {
    const key = storageKeyRef.current;
    if (retired.current || (!key && !onSaveRef.current)) return;
    const state = savedShape(boardRef.current), text = JSON.stringify(state);
    if (text === lastWritten.current) return;
    if (key) { try { localStorage.setItem(key, text); docWritten.current = JSON.stringify(state.doc ?? null); lastWritten.current = text; } catch { /* full or blocked storage: the push below still carries it */ } }
    onSaveRef.current?.(state, { now: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Typing goes to docLive at once and into the board after a pause (one canvas render per pause, not per key).
  const onDocDirtyRef = useRef(onDocDirty);
  onDocDirtyRef.current = onDocDirty;
  const searchRead = useRef(null), searchStore = useRef(null), docSearchApi = useRef(null);
  const searchJump = useRef(0), searchPaint = useRef(null), equationSearchDrafts = useRef(null);
  if (!equationSearchDrafts.current) equationSearchDrafts.current = createEquationSearchDrafts(() => searchStore.current.changed());
  if (!searchStore.current) searchStore.current = createSearchSnapshotStore(() => searchRead.current());
  const docChanged = next => {
    docLive.current = next;
    searchStore.current.changed();
    // The page says Saving… from the first key, not once the pause is over: Saved only ever means the server has it.
    if (!docTimer.current) onDocDirtyRef.current?.();
    clearTimeout(docTimer.current);
    docTimer.current = setTimeout(() => { docTimer.current = null; setDoc(previous => previous && { ...previous, blocks: docLive.current }); }, 500);
  };
  // Leaving the canvas (another canvas, a Rabbit Hole, Home) or a save asked for now never drops the last words typed: a
  // pending edit is written through the normal save path at once (this browser's copy, then onSave, the board's server push).
  // Only the document is merged into this browser's copy, and only while that copy still holds what this canvas last wrote:
  // a server copy that replaced it on open (the page remounts the canvas) is never overwritten from here.
  const flushDoc = () => {
    clearTimeout(docTimer.current);
    docTimer.current = null;
    if (retired.current) return false;
    const live = docRef.current && { ...docRef.current, blocks: docLive.current || docRef.current.blocks || [] };
    if (!live || !storageKey || JSON.stringify(live) === docWritten.current) return false;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return false; }
    if (JSON.stringify(saved.doc ?? null) !== docWritten.current) return false;
    const state = { ...saved, doc: live };
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { return false; }
    docWritten.current = JSON.stringify(live);
    if (alive.current) setDoc(live);
    onSaveRef.current?.(state);
    return true;
  };
  // A reload or a closed tab runs no unmount: pagehide writes the pending words too (owner decision A1 - after a 409 this
  // browser's copy is the only place they live until Reload and keep my document or Restore my unsaved document).
  useEffect(() => {
    window.addEventListener('pagehide', flushDoc);
    return () => { window.removeEventListener('pagehide', flushDoc); flushDoc(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  // View > Minimap, Rabbit Hole Map, Curious (owner brief 2026-10-21 item 3): this device's choice (ui-prefs.js), on by default.
  // Hidden, the Rabbit Hole Map and Curious stay mounted (display: none), so their state is there when they come back.
  const [minimap, setMinimap] = useState(() => uiPrefs().minimap);
  const [holeMap, setHoleMap] = useState(() => uiPrefs().holeMap);
  const [curious, setCurious] = useState(() => uiPrefs().curious);
  // View > Show / hide > Toolbar (owner brief 2026-10-22): the drawing toolbar; this person's choice on this device, never the canvas.
  const [toolbar, setToolbar] = useState(() => uiPrefs().toolbar);
  const showWidget = (name, on) => {
    ({ minimap: setMinimap, holeMap: setHoleMap, curious: setCurious, toolbar: setToolbar })[name](on);
    try { saveUiPref(name, on); } catch { /* storage refused: the choice holds in this page until a reload */ }
  };
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
      // The gutter is the canvas row's height at every width (UI-19: the toolbar stays a column on the left).
      // The Rabbit Hole navigator shares the gutter above it (Dive.jsx): its slot and the gap (gap-2) are reserved. The
      // gutter has no overview button (UI-19; since UI-17 the map is always in this slot, and
      // reserving it cut the toolbar to under 120px at 1280x720 with a deep map: dive-check, fast-e2e 39723974033).
      const slot = bar.parentElement.querySelector('[data-gutter-top]');
      // Less the gutter's bottom padding: the floating strip's column on the tools' side (--chrome-left/right).
      const room = bar.parentElement.clientHeight - parseFloat(getComputedStyle(bar.parentElement).paddingBottom || 0) - 16 - (slot ? slot.offsetHeight + 8 : 0), pad = 4; // p-1
      if (bar.scrollHeight <= room) { setToolCap(null); return; }
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
  }, [presenting, !!gutterTop, toolbar]);
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
  const onUngroupCommentsRef = useRef(onUngroupComments);
  onUngroupCommentsRef.current = onUngroupComments;
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
    // The toolbar and the header float over the surface (owner, 2026-10-22): framed inside what their measured rectangles
    // leave (controlArea), never under them.
    const area = controlArea(), w = area.right - area.left;
    const fit = h => Math.max(0.2, Math.min(maxZoom, (w - pad * 2) / Math.max(1, right - left), (h - pad * 2) / Math.max(1, bottom - top)));
    // Wider than the room even at the zoom floor: from its left edge, beside the toolbar (as a tall span is framed from its top).
    const across = z => area.left + Math.max(0, (w - (right - left) * z) / 2) - left * z;
    // The floating bottom chrome over the framed span is a bottom inset: nothing is framed under the composer, the
    // minimap and zoom, or the hooks. A refit only narrows the span, so the first span's inset still holds.
    let z = fit(area.bottom - area.top);
    const h = Math.min(area.bottom, chromeTop(across(z) + left * z, across(z) + right * z)) - area.top;
    z = fit(h);
    // Centred horizontally; vertically too when the section is short enough to
    // sit in the middle of the screen, which is what reads as a slide.
    const height = (bottom - top) * z;
    setView({
      z,
      x: across(z),
      y: area.top + (height + pad * 2 < h ? (h - height) / 2 : pad) - top * z,
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
      // The contents' own list, or null while they read the canvas headings (learn-outline-model.js tocOf).
      toc: () => tocRef.current,
      getSearchSnapshot: searchStore.current.get,
      subscribeSearch: searchStore.current.subscribe,
      captureNavigation: () => ({ owner: searchStore.current, view: { ...viewRef.current }, selection: [...selectedRef.current],
        scroll: [...(surface.current?.querySelectorAll('[data-block-id] *, [data-canvas-doc] *') || [])]
          .filter(node => node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth).map(node => ({ node, top: node.scrollTop, left: node.scrollLeft })) }),
      restoreNavigation: saved => {
        if (!saved || saved.owner !== searchStore.current) return { found: false, reason: 'different-canvas' };
        searchJump.current++; searchPaint.current?.(); searchPaint.current = null;
        cameraRef.current = null; revealRef.current = null;
        for (const entry of saved.scroll) if (entry.node.isConnected) { entry.node.scrollTop = entry.top; entry.node.scrollLeft = entry.left; }
        setSelection(saved.selection.filter(id => objectById(id) || shapesRef.current.some(shape => shape.id === id) || present.current.links.some(link => link.id === id) || groupsRef.current.some(group => group.id === id)));
        setGlide(false); viewRef.current = { ...saved.view }; setView(viewRef.current);
        return { found: true };
      },
      focusSearchTarget: target => focusSearchTarget(target),
      // Curious (owner task 2): the last semantic snapshot and its fingerprint (semanticBoard below); blocks() is unchanged.
      semantic: () => semanticRef.current.value(),
      // Whole-canvas context (chat-canvas-context.js), read when a chat turn is sent: the live lists with the open editor's
      // unsaved words, the freehand strokes, every object's measured box in world units, and the ids selected now.
      // doc: the document with the editor's unsaved words (docLive), in both views; boxes.doc its measured sheet in Editor view.
      // The board as the canvas holds it now, in the shape its browser save writes (lightBlocks), with the document's unsaved
      // words: what a reload would lose if no copy holds it yet (LearnPage boardUnsaved, offline-recovery brief).
      boardNow: () => {
        const b = boardRef.current, doc = liveDoc();
        return { strokes: b.strokes, shapes: b.shapes, items: b.items, links: b.links, blocks: lightBlocks(b.blocks), groups: b.groups, areas: b.areas, ...(doc ? { doc } : {}) };
      },
      liveBoard: () => {
        const doc = liveDoc(), box = docBoxRef.current;
        return { ...semanticBoard(), strokes: present.current.strokes, boxes: { ...inlineCanvas.layout(), ...(box ? { doc: box } : {}) }, doc };
      },
      // The document (blocknote-canvas.md): its box, framing its start, and a whole replacement (Restore my unsaved document).
      goToDoc: () => goToDoc(),
      flushDoc: () => flushDoc(),
      // The editor reads its blocks once, when it is made (CanvasDoc), so a replaced document gets a new editor (docEpoch).
      replaceDoc: next => { clearTimeout(docTimer.current); docTimer.current = null; docLive.current = next?.blocks || null; setDoc(next && typeof next === 'object' ? next : null); setDocEpoch(epoch => epoch + 1); },
      selection: () => selectedRef.current,
      updateBlock: (id, change) => {
        const current = blocksRef.current.find(block => block.id === id);
        const next = current && change(current);
        if (!next || next === current) return false;
        snapshot();
        setBlocks(previous => previous.map(block => block.id === id ? next : block));
        return true;
      },
      undo, redo, selectAll, deleteSelection, zoomFit, present: startPresenting,
      // View > Fit selection: the framing the card menu uses; nothing selected, nothing moves.
      zoomToSelection: () => zoomToSelection(),
      // Insert > Equation: an empty equation opens for typing at the view's centre, as the Equation tool does where it is clicked.
      insertEquation: () => { if (readOnlyRef.current || localCopyRef.current) return; snapshot(); setEquationDraft(newEquation(viewCenter())); },
      // Insert > Webpage: asks for the address, then makes the capture a pasted link makes.
      insertWebpage: () => { if (!readOnlyRef.current && !localCopyRef.current) setWebpageAsk(''); },
      // The inline AI editor from the page's Edit menu, and whether Ctrl/Cmd+K is the inline editor's right now (Dive asks).
      inlineAi: (mode = null) => openInline(performance.now(), false, mode), inlineClaims: () => !!inlineRef.current || !!inlineTarget(true),
      copy: copySelection,
      paste: () => !!(clipboard.current?.length && pasteIds(clipboard.current, 28, true)),
      duplicate: () => !!pasteIds(selectedRef.current),
      cut: cutSelection, copyStyle: copyStyleCommand, pasteStyle: pasteStyleCommand, lockSelection, nudge,
      // Enter on one selected object: a text box or note opens for typing, a closed shape its words, a line its label.
      editSelected: id => {
        if (lockedRef.current.has(id)) return false;
        const item = itemsRef.current.find(entry => entry.id === id && (entry.kind === 'text' || entry.kind === 'sticky'));
        if (item) { setEditTarget({ id, n: Date.now() }); return true; }
        const shape = shapesRef.current.find(entry => entry.id === id);
        if (shape && TEXT_BOX[shape.kind]) { startShapeText(id); return true; }
        if (shape || present.current.links.some(link => link.id === id)) { startLabel(id); return true; }
        return false;
      },
      // Paint order: 'front', 'forward', 'backward', 'back'.
      order: how => reorderSelection(how, selectedRef.current),
      group: groupSelection, ungroup: ungroupSelection, arrange,
      zoomIn: () => zoomCenter(1.25),
      zoomOut: () => zoomCenter(1 / 1.25),
      zoomReset: () => setView(homeView(controlArea(), COLUMN)),
      // Everything inserted lands where the learner is looking: headings and
      // cards join the column at the card nearest the middle of the screen,
      // free items land at its centre, and the camera only moves if the new
      // thing would otherwise be off screen.
      insertHeading: level => revealAfter(insertHeadingAt(level, flowIndexAtView())),
      // `home`: the canvas the PDF is stored on (pdf-to-canvas.md), so a copy of the card or page still reads its own upload.
      insertPdf: ({ assetKey, label, home }) => {
        snapshot();
        insertAtView({ id: crypto.randomUUID(), type: 'pdf', dx: 0, dy: 0, assetKey, label, ...(home ? { home } : {}) });
      },
      // A PDF's pages (pdf-to-canvas.md): one block per page, in order, where the learner is looking, as one undo.
      // `pages` is [{ assetKey, number }], number the PDF's own page; `pdf` the source key (pdf-source.js), so Files, the
      // reader and the AI context follow each page to its own page of its own source.
      insertSlides: ({ pages, label, pdf, home }) => {
        if (!pages.length) return;
        snapshot();
        // A divider block names each page, so a separator can be deleted on its own; page 1 opening the set needs none.
        const slides = pages.flatMap(({ assetKey, number }, index) => [
          ...(index || number !== 1 ? [{ id: crypto.randomUUID(), type: 'divider', dx: 0, dy: 0, label: `Page ${number}`, pdf }] : []),
          { id: crypto.randomUUID(), type: 'slide', dx: 0, dy: 0, assetKey, label, number, pdf, ...(home ? { home } : {}) },
        ]);
        const index = flowIndexAtView();
        setBlocks(previous => [...previous.slice(0, index), ...slides, ...previous.slice(index)]);
        revealAfter(slides[0].id);
      },
      // A dropped image, GIF, or clip. `mediaId` is the server copy an image
      // context can name later; GIFs and clips never have one.
      insertFile: ({ assetKey = null, kind, label, mediaId = null, meta = null, fileRef = null }) => {
        snapshot();
        return insertAtView({ id: crypto.randomUUID(), type: 'file', dx: 0, dy: 0, kind, ...(assetKey ? { assetKey } : {}), label, ...(mediaId ? { mediaId } : {}), ...(meta ? { meta } : {}), ...(fileRef ? { fileRef } : {}) });
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
      // A chat answer the learner puts on the canvas (the answer footer's Add as card): a finished chat card, centred like
      // a fresh question's. `answer` is the stored markdown, so inline citations stay; `sources` (the answer's refs) ride
      // along as data. `id` (chat-<messageId>): a card already holding it is located, never added twice.
      insertChat: ({ id = crypto.randomUUID(), question, answer, sources = null }) => {
        if (exchangesRef.current.some(exchange => exchange.id === id)) { commandsRef.current.focusObject(id); return id; }
        snapshot(true);
        seenChats.current.add(id);
        centerRef.current = id;
        onAddRef.current?.([{ id, question, answer, linkFrom: null, status: 'done', dx: 0, dy: 0, ...(sources?.length ? { sources } : {}) }]);
        return id;
      },
      // Whether the canvas holds this card (the footer's Added state).
      hasCard: id => exchangesRef.current.some(exchange => exchange.id === id),
      // `after` (a block id): right after that block in the flow, ignoring the view - a journey section's steps
      // under their heading (learn-journey-materialize.js). The updater reads `previous`, so inserts chained in one
      // tick land in order.
      insertBlock: (block, { into = null, after = null } = {}) => {
        if (!alive.current) return null;
        snapshot();
        // A confirmed /motion card lands with its press's request id (withPressId), so a reload can never start a second job.
        const added = withPressId({ ...block, id: crypto.randomUUID(), dx: 0, dy: 0 });
        if (after == null) return insertAtView(added, into);
        perfMark(added.id, 'insert');
        setBlocks(previous => { const at = indexAfter(previous, after); return [...previous.slice(0, at), added, ...previous.slice(at)]; });
        return revealAfter(added.id);
      },
      // An /explain v2 job's card (EXP-T20): placed once under the job's own card id, so a resent press or a reload finds it
      // instead of adding a second card; the result attaches to it later (ExplainPending).
      placeExplain: (card, { into = null } = {}) => {
        if (!alive.current || readOnlyRef.current || !card?.id || card.type !== 'animation') return null;
        if (blocksRef.current.some(block => block.id === card.id)) return card.id;
        snapshot();
        const added = { ...card, dx: 0, dy: 0 };
        blocksRef.current = [...blocksRef.current, added];
        return insertAtView(added, into);
      },
      reconcileCad: (incoming, { insert = true } = {}) => {
        if (!alive.current || readOnlyRef.current || !incoming?.id || incoming.type !== 'cad') return null;
        const previous = blocksRef.current.find(block => block.id === incoming.id);
        if (previous) {
          const next = mergeCadBlock(previous,incoming);
          if(JSON.stringify(previous)!==JSON.stringify(next)){
            if(cadPersistenceChanged(previous,next))snapshot();
            // Job-list recovery can win the race with card polling. Keep the
            // ref current so that either observer persists the accepted revision once.
            blocksRef.current=blocksRef.current.map(block=>block.id===incoming.id?next:block);
            setBlocks(list => list.map(block => block.id === incoming.id ? mergeCadBlock(block,incoming) : block));
          }
          return incoming.id;
        }
        if (!insert) return null;
        snapshot();
        const added = { ...incoming, dx: incoming.dx || 0, dy: incoming.dy || 0 };
        // Track immediately so two completions in one turn cannot insert duplicate cards.
        blocksRef.current = [...blocksRef.current,added];
        return insertAtView(added);
      },
      cadContext: (prompt, id = null) => {
        const live = { ...semanticBoard(), boxes: inlineCanvas.layout() }, ids = id ? [id] : selectedRef.current;
        const options = { cache: inlineCache.current, boardKey: inlineKey.current, describeCard: describeObject, request: prompt, extras: inlineAiRef.current?.extras?.() || {} };
        return ids.length ? buildContext(live,freezeTarget(live,ids),options) : buildCreationContext(live,viewCenter(),options);
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
      insertText: (at = null) => {
        snapshot();
        const center = at || viewCenter();
        const id = crypto.randomUUID();
        setItems(previous => [...previous, { id, kind: 'text', x: center.x - 48, y: center.y - 16, text: '', color: textArm.c || color, opacity, level, ...armedText('text'), fresh: true }]);
        setSelection([id]);
      },
      insertSticky: (at = null) => {
        snapshot();
        const center = at || viewCenter();
        const id = crypto.randomUUID();
        setItems(previous => [...previous, { id, kind: 'sticky', x: center.x - 80, y: center.y - 80, text: '', color, opacity, ...armedText('sticky'), fresh: true }]);
        setSelection([id]);
      },
      // The Files panel's show and remove.
      // Framed once laid out (the camera effect): a card inserted this very tick is framed at its real
      // size instead of skipped for want of a measurement.
      focusBlock: id => {
        setSelection([id]);
        cameraRef.current = { id, frame: true };
      },
      // A Search result dropped on the canvas (search-drag.js): this same object, its top-left at a world point, one undo step.
      moveTo: (id, spot) => {
        const box = boxesOf([id])[0];
        if (readOnlyRef.current || lockedRef.current.has(id) || !box) return false;
        snapshot(exchangesRef.current.some(entry => entry.id === id));
        shift(spot.x - box.x, spot.y - box.y, [id]);
        setSelection([id]);
        return true;
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
      removeBlock: async id => {
        const cad=blocksRef.current.find(block=>block.id===id && block.type==='cad' && block.jobId && !block.cadDetached);
        if(cad){if(cadRunning(cad.status) && !window.confirm('Removing this CAD card cancels its running job. Undo does not restart generation. Remove it?'))return;try{await cadClient(api,appName).action(cad.jobId,'placement',{hidden:true});}catch(problem){toast(problem.message);return;}}
        if (!blocksRef.current.some(block => block.id === id)) return;
        snapshot();
        setBlocks(previous => previous.filter(block => block.id !== id));
        setLinks(previous => previous.filter(link => link.from !== id && link.to !== id));
        setSelection(previous => previous.filter(other => other !== id));
      },
      // Canvas references (C:/s/spec/references-plan.md, Client API; canvas-refs-model.js): each change is one undo step.
      // addRef: { ok } or { ok: false, reason } - 'unsupported' for anything but a block, or on a view-only board.
      addRef: (blockId, target) => {
        const next = readOnlyRef.current ? { reason: 'unsupported' } : withRef(blocksRef.current.find(block => block.id === blockId), target);
        if (!next.refs) return { ok: false, reason: next.reason };
        snapshot();
        setBlocks(previous => previous.map(block => block.id === blockId ? { ...block, refs: next.refs } : block));
        return { ok: true };
      },
      removeRef: (blockId, refId) => {
        const refs = readOnlyRef.current ? null : withoutRef(blocksRef.current.find(block => block.id === blockId), refId);
        if (!refs) return false;
        snapshot();
        setBlocks(previous => previous.map(block => block.id === blockId ? { ...block, refs } : block));
        return true;
      },
      // A standalone reference card near `point` (world units: (menuAt.x - view.x) / view.z) or the view's centre, in free
      // space, placed as openInNotebook places (the end of the column, offset to the spot), then selected. Returns its id.
      insertRefCard: (target, point = null, at = null) => {
        if (readOnlyRef.current || !target) return null;
        // at: a Search result's drop (search-drag.js) - the card's top-left exactly there, as the outline showed.
        const spot = at || refCardSpot(point || viewCenter(), [...inlineCanvas.obstacles(), ...placementChrome()], inlineCanvas.visibleWorld());
        const col = column.current, flowY = (col?.offsetHeight || 0) + (col?.children.length ? 20 : 0);
        const added = { id: crypto.randomUUID(), type: 'canvas-ref', dx: Math.round(spot.x - (COLUMN - REF_CARD.w) / 2), dy: Math.round(spot.y - flowY), refs: [{ id: crypto.randomUUID(), target }] };
        snapshot();
        setBlocks(previous => [...previous, added]);
        setSelection([added.id]);
        if (spot.offscreen) inlineCanvas.reveal({ x: spot.x, y: spot.y, ...REF_CARD });
        return added.id;
      },
      // PDF excerpt cards (pdf-excerpt.js placeExcerpts): one insertion, one Undo step, nothing else moved. Without `at` they land
      // in free space in the usable view (refCardSpot: right panel, zoom and chrome accounted for, as insertRefCard); with `at`
      // (a drop's world point) there. A split's parts stack in order. The cards join the end of the column and are drawn at their
      // spot by their offset; their ids enter blocksRef now, so a repeated request finds them before the next render.
      insertExcerpts: (list, at = null) => {
        if (readOnlyRef.current || !alive.current || !list?.length) return [];
        // A region card is a FileCard (COLUMN wide, its height the crop's aspect plus its header, note and footer).
        const gap = 20, widths = list.map(block => block.w || (block.type === 'file' ? COLUMN : EXCERPT_CARD.w)), w = Math.max(...widths);
        const heights = list.map((block, index) => block.h || (block.excerpt?.crop ? Math.round((widths[index] - 24) * block.excerpt.crop.height / block.excerpt.crop.width) + 130 : EXCERPT_CARD.h));
        const box = { w, h: heights.reduce((sum, h) => sum + h, 0) + gap * (list.length - 1) };
        const spot = at ? { x: at.x - w / 2, y: at.y } : refCardSpot(viewCenter(), [...inlineCanvas.obstacles(), ...placementChrome()], inlineCanvas.visibleWorld(), box);
        const col = column.current, flowY = (col?.offsetHeight || 0) + (col?.children.length ? 20 : 0);
        let y = spot.y, flow = flowY;
        const added = list.map((block, index) => {
          const card = { ...block, id: crypto.randomUUID(), dx: Math.round(spot.x - (COLUMN - widths[index]) / 2), dy: Math.round(y - flow) };
          y += heights[index] + gap; flow += heights[index] + 20;
          return card;
        });
        snapshot();
        blocksRef.current = [...blocksRef.current, ...added];
        setBlocks(previous => [...previous, ...added]);
        setSelection(added.map(block => block.id));
        if (spot.offscreen) inlineCanvas.reveal({ x: spot.x, y: spot.y, ...box });
        return added.map(block => block.id);
      },
      // Several cards at once (Add code card on a graph selection; repo-canvas-graph.md "Multiple nodes and placement"): one
      // compact grid as wide as the view allows, in the free space in view nearest its top-left (refCardSpot with the grid as one box; the corner it keeps clear is the view's own),
      // one undo step, the new cards selected, and panned to only when the grid is off-screen. Each joins the end of the
      // column (gap-5) and is drawn at its cell by its offset from its own flow place, as insertRefCard places one card.
      // ponytail: flow places assume each card is size.h tall (CanvasNode's fixed height); measure if cards ever autosize.
      insertGroup: (list, size) => {
        if (readOnlyRef.current || !list?.length) return [];
        const visible = inlineCanvas.visibleWorld(), gap = 20;
        const cols = Math.max(1, Math.min(list.length, Math.floor((visible.w + gap) / (size.w + gap))));
        const rows = Math.ceil(list.length / cols), box = { w: cols * size.w + (cols - 1) * gap, h: rows * size.h + (rows - 1) * gap };
        const spot = refCardSpot({ x: visible.x, y: visible.y }, [...inlineCanvas.obstacles(), ...placementChrome()], visible, box);
        const col = column.current, flowY = (col?.offsetHeight || 0) + (col?.children.length ? 20 : 0);
        const added = list.map((block, index) => ({ ...block, id: crypto.randomUUID(),
          dx: Math.round(spot.x + (index % cols) * (size.w + gap) - (COLUMN - size.w) / 2),
          dy: Math.round(spot.y + Math.floor(index / cols) * (size.h + gap) - (flowY + index * (size.h + 20))) }));
        snapshot();
        setBlocks(previous => [...previous, ...added]);
        setSelection(added.map(block => block.id));
        if (spot.offscreen) inlineCanvas.reveal({ x: spot.x, y: spot.y, ...box });
        return added.map(block => block.id);
      },
      // Every card's refs on the live board, unsaved included.
      liveRefs: () => blocksRef.current.filter(block => block.refs?.length).map(block => ({ blockId: block.id, refs: block.refs })),
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
      showWidget,
      // Page guides: false (off), 'portrait' or 'landscape' A4.
      setPages,
      // One snapshot for the whole restructure, so Ctrl+Z reverts the proposal
      // rather than one heading at a time. R4 contract C7: { ok: true, applied, skipped } or { ok: false, reason:
      // 'stale' | 'invalid', message }; a proposal passes its `base` revision and `source` (C7b: 'syllabus' allows 96 ops),
      // the panel's own edits pass neither. Tutor Task 11 (learn-outline-model.js applyOutlineAction): a proposal also passes
      // planBase, the accepted plan it was made on, and plan, the plan now; a view-only board ('read_only') and any moved base
      // ('stale') change nothing.
      applyOutline: (ops, { base, source, planBase, plan = null } = {}) => {
        // Owner brief 2026-10-23: the contents' own list only (applyTocAction); no canvas object is created or changed.
        const result = applyTocAction(blocksRef.current, tocRef.current, { baseOutlineRevision: base, basePlanRevision: planBase, changes: ops }, { canEdit: !readOnlyRef.current, planRevision: plan, source });
        if (!result.ok) return result;
        if (result.applied) { snapshot(); setToc(result.toc); }
        return { ok: true, applied: result.applied, skipped: result.skipped };
      },
      moveSection: (id, beforeId) => { if (readOnlyRef.current) return; snapshot(); setToc(moveTocSection(blocksRef.current, tocRef.current, id, beforeId)); },
      toggleSectionDone: id => { if (readOnlyRef.current) return; snapshot(); setToc(toggleTocDone(blocksRef.current, tocRef.current, id)); },
      removeSection: id => { if (readOnlyRef.current) return; snapshot(); setToc(removeTocEntry(blocksRef.current, tocRef.current, id)); },
      // A journey heading just drawn joins a stored contents list (learn-journey-materialize.js).
      linkTocHeading: heading => setToc(previous => linkTocHeading(previous, heading)),
      // Frame the section rather than scroll to it: a section is a heading plus
      // what follows, and the camera already knows how to land on one. A contents entry frames the heading it links; one
      // with no canvas heading has nothing to frame.
      showSection: id => {
        const heading = tocHeading(tocRef.current, id);
        if (heading == null) return;
        const steps = presentSteps(blocksRef.current, boundsRef.current);
        const step = steps.find(entry => entry.ids[0] === heading) || steps.find(entry => entry.ids.includes(heading));
        if (step) frame(step.boxes, 64, 1.2);
      },
      // The board saved now, a shared board's push awaited (canvas-persist.js; architecture §6.5.5, LP1 Task 15): a
      // journey section is recorded only once this resolves ok. It reads boardRef, so a call after a paint that follows
      // the inserts saves them, from any canvasApi of this canvas. The debounced save above is unchanged.
      // The document's words typed in the last half second ride too (liveDoc), not only its last board copy.
      persist: () => {
        if (!alive.current) return Promise.resolve({ ok: false });
        const live = liveDoc();
        clearTimeout(docTimer.current); docTimer.current = null;
        if (live) { docWritten.current = JSON.stringify(live); setDoc(live); }
        return persistBoard({ state: { ...boardRef.current, ...(live ? { doc: live } : {}) }, storageKey, storage: () => localStorage, onSave: onSaveRef.current });
      },
      toggleLock: () => setLock(previous => !previous),
      // `base`: the board the work is counted from - the server's copy before a 409 (conflictBaseKey), else the mounted one.
      retire: (base = mountedBoard.current) => {
        retired.current = true;
        const work = pendingWork(base, boardRef.current);
        // The document as typed, its words still in the editor's pause included: the page offers it back, never drops it.
        const live = docRef.current && { ...docRef.current, blocks: docLive.current || docRef.current.blocks || [] };
        return live && JSON.stringify(live) !== JSON.stringify(base.doc ?? null) ? { ...work, doc: live } : work;
      },
      // The card thumbnail (card-thumbnails.md): this canvas's content drawn at 800 x 400 in the light theme without its
      // chrome (card-thumbnail.js CHROME, data-thumbnail-hide here), or null when it is empty.
      thumbnail: () => (alive.current && worldRef.current ? drawThumbnail(worldRef.current, thumbnailRegion(contentBoxes())) : Promise.resolve(null)),
    };
    if (apiRef) apiRef.current = commandsRef.current;
  });
  // Menu checkmarks need these as state on the page, not as a ref it cannot watch.
  const outline = outlineFrom(blocks, toc);
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
  // ids, so copy then edit then paste produces what is on the canvas now; it
  // also keeps a copy of each object, the links between them and their groups,
  // for when the originals are gone - a cut, then a paste.
  const clipCopies = useRef(null);
  const copySelection = () => {
    const picked = selectedRef.current;
    const has = list => list.some(entry => picked.includes(entry.id));
    // A connector is selectable but not copyable. Without this the clipboard
    // was wiped by a copy that captured nothing.
    if (!has(blocksRef.current) && !has(itemsRef.current) && !has(shapesRef.current) && !has(exchangesRef.current)) return false;
    clipboard.current = picked.slice();
    const pick = list => list.filter(entry => picked.includes(entry.id));
    clipCopies.current = {
      blocks: pick(blocksRef.current), items: pick(itemsRef.current), shapes: pick(shapesRef.current), chats: pick(exchangesRef.current),
      links: present.current.links.filter(link => picked.includes(link.from) && picked.includes(link.to)),
      groups: groupsRef.current.filter(group => { const members = membersOf(group.id); return members.length && members.every(id => picked.includes(id)); }),
    };
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
  // Shared by Ctrl+V, Duplicate and Alt-drag. Ids in, fresh copies out; the copy
  // carries the latest text, formatting and position (the clipboard's own copy
  // once the original is gone). A link between two copied objects is copied
  // with them; a whole group copied becomes a new group of the copies - a
  // duplicate is new material, never a new member of the original group. A
  // copy is never locked. step: how far the copies land from their sources.
  // Returns { ids, copies } (copies for Alt-drag to place), or null.
  // clip: a paste from the clipboard, which may name objects since cut or deleted (Duplicate and Alt-drag never do).
  const pasteIds = (picked, step = 28, clip = false) => {
    const saved = (clip && clipCopies.current) || {};
    const live = (list, kept = []) => picked.map(id => list.find(entry => entry.id === id) || kept.find(entry => entry.id === id)).filter(Boolean);
    const pickedBlocks = live(blocksRef.current, saved.blocks);
    const pickedItems = live(itemsRef.current, saved.items);
    const pickedShapes = live(shapesRef.current, saved.shapes);
    const pickedChats = live(exchangesRef.current, saved.chats);
    if (!pickedBlocks.length && !pickedItems.length && !pickedShapes.length && !pickedChats.length) return null;
    snapshot(pickedChats.length > 0);
    const fresh = [], ids = new Map();
    const newId = old => { const id = crypto.randomUUID(); ids.set(old, id); fresh.push(id); return id; };
    // Groups whose every member is copied come along as new groups.
    const wholeGroups = new Map();
    for (const group of [...groupsRef.current, ...(saved.groups || [])]) {
      if (wholeGroups.has(group.id)) continue;
      const members = [...pickedBlocks, ...pickedItems, ...pickedShapes, ...pickedChats].filter(entry => entry.groupId === group.id);
      const all = membersOf(group.id);
      if (members.length >= 2 && (all.length ? all.every(id => picked.includes(id)) : true)) wholeGroups.set(group.id, { id: crypto.randomUUID(), label: group.label || '' });
    }
    const groupFor = entry => wholeGroups.get(entry.groupId)?.id;
    // A copied notebook card gets its own workspace, seeded from the copy of its notebook; a card's references get new ids.
    const copyNode = node => ({ ...node, ...(localCopyRef.current ? { copyOf: node.copyOf || node.id } : {}), id: newId(node.id), groupId: groupFor(node), locked: undefined, dx: node.dx + step, dy: node.dy + step, ...(node.type === 'notebook' ? { notebook_id: crypto.randomUUID() } : {}), ...(node.refs ? { refs: reIdRefs(node.refs) } : {}) });
    const blocksCopy = pickedBlocks.map(copyNode);
    // A card copied mid-answer would never receive its stream: deltas are
    // routed by id and the copy has a new one. Settle it instead.
    const chatsCopy = pickedChats.map(node => ({ ...copyNode(node), linkFrom: null, status: 'done' }));
    const itemsCopy = pickedItems.map(item => ({ ...item, id: newId(item.id), groupId: groupFor(item), locked: undefined, x: item.x + step, y: item.y + step, fresh: false }));
    const shapesCopy = pickedShapes.map(shape => ({ ...shape, id: newId(shape.id), groupId: groupFor(shape), locked: undefined, x1: shape.x1 + step, y1: shape.y1 + step, x2: shape.x2 + step, y2: shape.y2 + step }));
    // Live links first; a saved link only where one of its ends is gone (a cut), never one deleted on its own since.
    const liveIds = new Set(everything().map(entry => entry.id));
    const linkSource = [...present.current.links, ...(saved.links || []).filter(link => !liveIds.has(link.from) || !liveIds.has(link.to))];
    const linksCopy = linkSource.filter(link => ids.has(link.from) && ids.has(link.to)).map(link => ({ ...link, id: crypto.randomUUID(), from: ids.get(link.from), to: ids.get(link.to) }));
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
    if (linksCopy.length) setLinks(previous => [...previous, ...linksCopy]);
    if (wholeGroups.size) setGroups(previous => [...previous, ...wholeGroups.values()]);
    if (chatsCopy.length) onAddRef.current?.(chatsCopy);
    selectedRef.current = fresh;
    setSelection(fresh);
    clipboard.current = fresh; // paste again and it stacks from the newest
    setCanPaste(true);
    return { ids: fresh, copies: { blocks: blocksCopy, items: itemsCopy, shapes: shapesCopy, chats: chatsCopy } };
  };
  // Alt/Option-drag from an object's body: a copy of it (and of the rest of its selection, its group) follows the
  // pointer and the originals stay. The copy and the move are one undo step. A resize handle's Alt keeps the centre.
  const altDrag = (id, event) => {
    const current = selectedRef.current;
    const ids = current.includes(id) ? current : groupOf(id) ? membersOf(groupOf(id)) : [id];
    const start = local(event);
    // The copies are made once the pointer actually travels: an Alt-click copies nothing, and Esc takes them back.
    let made = null, cards = [], notes = [], marks = [], chats = [];
    const apply = (x, y) => {
      if (!made) {
        made = pasteIds(ids, 0);
        if (!made) return;
        ({ blocks: cards, items: notes, shapes: marks, chats } = made.copies);
      }
      const ddx = x - start.x, ddy = y - start.y;
      const at = list => new Map(list.map(entry => [entry.id, entry]));
      const cardAt = at(cards), noteAt = at(notes), markAt = at(marks);
      if (cards.length) setBlocks(previous => previous.map(block => cardAt.has(block.id) ? { ...block, dx: cardAt.get(block.id).dx + ddx, dy: cardAt.get(block.id).dy + ddy } : block));
      if (notes.length) setItems(previous => previous.map(item => noteAt.has(item.id) ? { ...item, x: noteAt.get(item.id).x + ddx, y: noteAt.get(item.id).y + ddy } : item));
      if (marks.length) setShapes(previous => previous.map(shape => { const from = markAt.get(shape.id); return from ? { ...shape, x1: from.x1 + ddx, y1: from.y1 + ddy, x2: from.x2 + ddx, y2: from.y2 + ddy } : shape; }));
      for (const chat of chats) onMove(chat.id, chat.dx + ddx, chat.dy + ddy);
    };
    apply.cancel = () => { if (!made) return; cancelGesture(); selectedRef.current = ids; setSelection(ids); };
    // ponytail: copies placed absolutely from where they started; no alignment snapping while Alt-dragging.
    startDrag(event, start, apply, view.z);
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
  // Add webpage card (WebpageCard.jsx): placed where the learner is looking, capturing; the card makes the one capture request.
  const [urlPaste, setUrlPaste] = useState(null);
  const [webpageAsk, setWebpageAsk] = useState(null);
  const addWebpage = url => {
    if (readOnlyRef.current || localCopyRef.current || !isWebUrl(url)) return null;
    let host = url;
    try { host = new URL(url).hostname; } catch { /* isWebUrl parsed it */ }
    const id = crypto.randomUUID();
    askCapture(id);
    snapshot();
    insertAtView({ id, type: 'webpage', dx: 0, dy: 0, url, title: host, pending: { manifestId: null, lineage: null, status: 'capturing', reason: null, startedAt: Date.now() }, failure: null, scrollTop: 0, scrollLocked: false });
    setSelection([id]);
    return id;
  };
  useEffect(() => {
    if (!urlPaste) return undefined;
    const away = event => { if (!event.target.closest?.('[data-paste-url]')) setUrlPaste(null); };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [urlPaste]);
  const choosePaste = choice => {
    const chosen = urlPaste;
    setUrlPaste(null);
    chosen?.back?.focus?.();
    if (!chosen) return;
    if (choice === 'card') addWebpage(chosen.text); else if (choice === 'text') pasteTextRef.current(chosen.text);
  };
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
  const ungroupSelection = async () => {
    const gids = new Set(selectedRef.current.map(groupOf).filter(Boolean));
    if (!gids.size) return;
    // Ungroup is not a delete (owner decision 2026-10-23): the group's comments move to the canvas at its top centre first, so
    // a refused move keeps the group; the move rides in this undo step (travelHistory).
    let comments = null;
    if (onUngroupCommentsRef.current) {
      const spots = [...gids].map(id => { const slot = commentSlot(id); return slot && { id, x: slot.x + slot.w / 2, y: slot.y }; }).filter(Boolean);
      try { comments = await onUngroupCommentsRef.current(spots); } catch (problem) { toast(`Not ungrouped: ${problem?.data?.error || problem.message}`, { tone: 'error' }); return; }
    }
    const members = everything().filter(entry => gids.has(entry.groupId)).map(entry => entry.id);
    if (!members.length) return; // a second press while the first moved the comments: that one ungrouped already
    const step = snapshot(exchangesRef.current.some(exchange => gids.has(exchange.groupId)));
    if (comments) step.comments = comments;
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
    // A locked piece neither moves nor is lined up against.
    const units = arrangeUnits(selectedRef.current).filter(unit => !unit.members.some(id => lockedRef.current.has(id)));
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
  // The page's canvas header (LearnPage [data-canvas-header]), floating over this canvas when nothing sits between them.
  const pageHeader = () => document.querySelector('[data-canvas-header]');
  // The floating strip's side columns, as CSS lengths on the shell from its bottom edge: the Voice caption sits above the
  // left one (--chrome-left), the tools' gutter pads its side's one (--chrome-left / --chrome-right).
  useLayoutEffect(() => {
    const strip = bottomStrip.current, host = shell.current;
    if (!strip || !host || typeof ResizeObserver === 'undefined') return undefined;
    const sync = () => {
      const bottom = host.getBoundingClientRect().bottom;
      host.style.setProperty('--chrome-left', `${Math.max(0, bottom - strip.firstElementChild.getBoundingClientRect().top)}px`);
      host.style.setProperty('--chrome-right', `${Math.max(0, bottom - strip.lastElementChild.getBoundingClientRect().top)}px`);
      // The page header floating over the canvas (owner, 2026-10-22): the tools column and the canvas's top notices start below it.
      const header = pageHeader();
      host.style.setProperty('--canvas-top', `${header ? Math.max(0, header.getBoundingClientRect().bottom - host.getBoundingClientRect().top) : 0}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    for (const column of strip.children) observer.observe(column);
    observer.observe(host);
    if (pageHeader()) observer.observe(pageHeader());
    return () => observer.disconnect();
  }, [presenting]);
  const column = useRef(null);
  const measureNow = () => {
    const next = {};
    for (const element of column.current?.querySelectorAll('[data-block-id]') || []) {
      const owner = exchangesRef.current.find(item => item.id === element.dataset.blockId) || blocksRef.current.find(item => item.id === element.dataset.blockId);
      if (owner) { const slot = element.parentElement?.hasAttribute('data-card-slot') ? element.parentElement : null; next[owner.id] = { x: element.offsetLeft + (slot?.offsetLeft || 0) + owner.dx, y: element.offsetTop + (slot?.offsetTop || 0) + owner.dy, w: element.offsetWidth, h: element.offsetHeight }; }
    }
    return next;
  };
  const measureBlocks = useCallback(() => {
    const next = measureNow();
    setBounds(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  // The same chrome for a card placed in view (insertRefCard, insertExcerpts, insertGroup, openInNotebook, the inline
  // editor's results), as world obstacles (chromeObstacles). While the Next Steps hooks can show here but are hidden, their
  // corner counts too, at the room they last had (hooksRoom): the insert itself changes their input, and their loading
  // skeleton comes back over that corner at once.
  // shortcut: hooks never shown yet on this canvas reserve nothing; measure a hidden skeleton if that case ever matters.
  const hooksRoom = useRef(null), hooksSeen = useRef(null);
  const hooksSlot = useCallback(node => {
    hooksSeen.current?.disconnect();
    hooksSeen.current = node && new ResizeObserver(() => {
      const rect = node.getBoundingClientRect(), edge = node.closest('[data-canvas-bottom]').getBoundingClientRect();
      if (rect.width && rect.height) hooksRoom.current = { right: edge.right - rect.right, bottom: edge.bottom - rect.bottom, w: rect.width, h: rect.height };
    });
    hooksSeen.current?.observe(node);
  }, []);
  const placementChrome = () => {
    const strip = bottomStrip.current, at = surface.current?.getBoundingClientRect();
    if (!strip || !at) return [];
    const rects = [...strip.querySelectorAll(':scope > * > *')].flatMap(boxesIn).filter(rect => rect.width && rect.height);
    const slot = strip.querySelector('[data-hooks-slot]'), room = hooksRoom.current, edge = strip.getBoundingClientRect();
    if (curious && slot && room && !slot.getBoundingClientRect().height) rects.push({ left: edge.right - room.right - room.w, right: edge.right - room.right, top: edge.bottom - room.bottom - room.h });
    return chromeObstacles(rects.map(rect => ({ left: rect.left - at.left, right: rect.right - at.left, top: rect.top - at.top })), at.height, viewRef.current);
  };
  // The floating controls over the drawing surface (owner, 2026-10-22: the surface fills the canvas workspace; the toolbar,
  // the Rabbit Hole navigator above it and the page header's controls float over it), as their measured rectangles in
  // surface px - never a constant gutter. Fit, reveal, placement and the opening camera keep clear of them.
  const controlRects = () => {
    const frame = surface.current.getBoundingClientRect();
    return [...(gutter.current?.querySelectorAll('[role="toolbar"], [data-gutter-top] > *') || []), ...(pageHeader()?.children || [])]
      .map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height && rect.right > frame.left && rect.left < frame.right && rect.bottom > frame.top && rect.top < frame.bottom)
      .map(rect => ({ left: rect.left - frame.left, top: rect.top - frame.top, right: rect.right - frame.left, bottom: rect.bottom - frame.top }));
  };
  const controlArea = () => freeArea({ w: surface.current.clientWidth, h: surface.current.clientHeight }, controlRects(), 0);
  // What the learner can see of the surface: less what floats over it - the chat sheet above the composer, the
  // Voice caption, the page's contents rail (edgeInset), the floating controls - and a margin (canvas-slots.js freeArea).
  const visibleArea = () => {
    const frame = surface.current.getBoundingClientRect();
    const overlays = [...(shell.current?.querySelectorAll('[data-chat-sheet], [data-voice-rail] > *') || [])]
      .map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height)
      .map(rect => ({ left: rect.left - frame.left, top: rect.top - frame.top, right: rect.right - frame.left, bottom: rect.bottom - frame.top }));
    overlays.push(...controlRects());
    if (edgeInset) overlays.push({ left: frame.width - edgeInset, top: 0, right: frame.width, bottom: frame.height });
    return freeArea({ w: frame.width, h: frame.height }, overlays);
  };
  // A side panel opening, closing or resized beside the canvas changes only the surface's width (canvas-clipping.md). When
  // it has settled (the same width two frames running, after the panel's slide), the one selected card that was whole in
  // the canvas before is brought back into view at the learner's zoom (showBox, one glide) - so Add to chat opening Chat, or
  // a panel dragged wider, never leaves it cut. A card the learner had panned away, a camera move during the resize, or a
  // window resize (the canvas narrowed by the browser, not a panel) is left alone; nothing moves while the width holds.
  const keepRef = useRef(null);
  keepRef.current = id => showBox(boundsRef.current[id], true);
  useEffect(() => {
    const element = surface.current;
    if (!element) return undefined;
    let width = element.clientWidth, start = null, frame = 0, windowWidth = window.innerWidth;
    const sole = () => (selectedRef.current.length === 1 ? selectedRef.current[0] : null);
    const settled = () => {
      const was = start;
      start = null;
      if (was?.whole && element.clientWidth < was.width && window.innerWidth === was.windowWidth && manualMoves.current === was.moves && sole() === was.id) keepRef.current(was.id);
    };
    const observer = new ResizeObserver(() => {
      if (!start) {
        const id = sole(), box = id && boundsRef.current[id], v = viewRef.current;
        const left = box ? v.x + box.x * v.z : -1, right = box ? left + box.w * v.z : Infinity;
        start = { width, id, whole: left >= 0 && right <= width, moves: manualMoves.current, windowWidth };
      }
      windowWidth = window.innerWidth;
      width = element.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(settled); });
    });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
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
  // Search changes only camera, selection and transient DOM scroll/paint. It never commits text or card dimensions.
  const focusSearchTarget = async target => {
    const jump = ++searchJump.current;
    searchPaint.current?.(); searchPaint.current = null;
    if (!target || !surface.current) return { found: false, reason: 'missing-target' };
    let element, range = null, box;
    if (target.kind === 'document') {
      if (!liveDoc()) return { found: false, reason: 'missing-target' };
      if (docView !== 'editor') return { found: false, reason: 'document-hidden' };
      if (!docSearchApi.current) return { found: false, reason: 'document-loading' };
      const result = docSearchApi.current.reveal(target.docBlockId || target.id, target.quote);
      if (!result.found) return result;
      ({ element, range } = result);
    } else if (target.anchor?.kind === 'point') {
      box = { x: target.anchor.x, y: target.anchor.y, w: 24, h: 24 };
    } else {
      const id = target.anchor?.kind === 'object' ? target.anchor.object_id : target.id;
      const selector = ['block-id', 'item-id', 'shape-id', 'group-box', 'connection'].map(key => `[data-${key}="${CSS.escape(id || '')}"]`).join(',');
      element = surface.current.querySelector(selector);
      const boxes = boxesOf(membersOf(id).length ? membersOf(id) : [id]);
      box = boundsRef.current[id] || boxes[0];
      if (!element) return { found: false, reason: 'missing-target' };
      if (!box || membersOf(id).length) {
        const hit = element.getBoundingClientRect(), at = surface.current.getBoundingClientRect(), v = viewRef.current;
        box = { x: (hit.left - at.left - v.x) / v.z, y: (hit.top - at.top - v.y) / v.z, w: hit.width / v.z, h: hit.height / v.z };
      }
      setSelection([id]);
      range = searchRange(element, target.quote);
      revealSearchRange(element, range, viewRef.current.z);
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (jump !== searchJump.current || !surface.current || (element && !element.isConnected)) return { found: false, reason: 'superseded' };
    // A matching paragraph within a Full-content card is its own camera target; an internally scrolled match is now visible.
    if (element && (range || target.kind === 'document')) {
      const hit = range?.getBoundingClientRect() || element.getBoundingClientRect(), at = surface.current.getBoundingClientRect(), current = viewRef.current;
      if (hit.width || hit.height) box = { x: (hit.left - at.left - current.x) / current.z, y: (hit.top - at.top - current.y) / current.z,
        w: Math.max(1, hit.width / current.z), h: Math.max(1, hit.height / current.z) };
    }
    if (!box) return { found: false, reason: 'missing-target' };
    cameraRef.current = null; revealRef.current = null;
    let area = visibleArea(), next = searchCamera(box, viewRef.current, area);
    area = { ...area, bottom: Math.min(area.bottom, chromeTop(next.x + box.x * next.z, next.x + (box.x + box.w) * next.z) - 24) };
    next = searchCamera(box, viewRef.current, area);
    setGlide(false); viewRef.current = next; setView(next);
    searchPaint.current = temporarySearchHighlight(element, range);
    return { found: true, matched: !!range };
  };
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
  // Whether every selected lockable object is locked (the menus say Unlock then).
  const selectionLocked = selection.length > 0 && selection.every(id => !blocks.concat(items, shapes).some(entry => entry.id === id) || blocks.concat(items, shapes).some(entry => entry.id === id && entry.locked)) && selection.some(id => blocks.concat(items, shapes).some(entry => entry.id === id && entry.locked));
  // The section being viewed (learn-present.js activeSection), for the Table of contents' marker.
  // ponytail: follows the camera and the layout, not a window resize on its own; the next pan catches up.
  const viewing = surface.current ? activeSection(blocks, bounds, { x: -view.x / view.z, y: -view.y / view.z, w: surface.current.clientWidth / view.z, h: surface.current.clientHeight / view.z }) : null;
  useEffect(() => { onState?.({ grid, lock, minimap, holeMap, curious, toolbar, pages, presenting: presenting !== null, outline: JSON.parse(outlineKey), cards: JSON.parse(cardsKey), selected: selectedCount, units, grouped, canPaste, canPasteStyle, selectionLocked, activeSection: tocEntryFor(toc, viewing), card: JSON.parse(cardKey), content, attempts, semanticFingerprint, semanticSettling }); }, [grid, lock, minimap, holeMap, curious, toolbar, pages, presenting, outlineKey, cardsKey, selectedCount, units, grouped, canPaste, canPasteStyle, selectionLocked, viewing, toc, cardKey, content, attempts, semanticFingerprint, semanticSettling, onState]);
  useEffect(() => () => connectionCleanup.current?.(), []);
  // Deleting is a command as well as a key, so it lives outside the key handler.
  const deleteSelection = async () => {
    // A locked object is never deleted by accident: it stays, selected, and says so.
    const ids = selectedRef.current.filter(id => !lockedRef.current.has(id));
    if (ids.length < selectedRef.current.length) toast('Locked objects stay. Unlock them to delete.');
    if (!ids.length) return;
    const cad = blocksRef.current.filter(block=>ids.includes(block.id) && block.type==='cad' && block.jobId && !block.cadDetached);
    if(cad.some(block=>cadRunning(block.status)) && !window.confirm('Removing this CAD card cancels its running job. Undo restores the card but does not restart generation. Remove it?'))return;
    try { if(cad.length)await Promise.all(cad.map(block=>cadClient(api,appName).action(block.jobId,'placement',{hidden:true}))); } catch(problem) { toast(`CAD card was kept: ${problem.message}`); return; }
    const chats = ids.filter(id => exchangesRef.current.some(exchange => exchange.id === id));
    snapshot(chats.length > 0);
    // Selected nodes delete with their attached connections.
    for (const id of chats) onDeleteRef.current?.(id);
    const nodes = new Set([...chats, ...ids.filter(id => blocksRef.current.some(block => block.id === id) || shapesRef.current.some(shape => shape.id === id))]);
    setBlocks(previous => previous.filter(block => !ids.includes(block.id)));
    setItems(previous => previous.filter(item => !ids.includes(item.id)));
    setShapes(previous => previous.filter(shape => !ids.includes(shape.id)));
    setLinks(previous => previous.filter(link => !ids.includes(link.id) && !nodes.has(link.from) && !nodes.has(link.to)));
    setSelection(previous => previous.filter(id => !ids.includes(id)));
  };
  // A webpage card's Remove (a capture that was refused): the card and its connections, one undo step.
  const removeBlock = id => {
    if (readOnlyRef.current || !blocksRef.current.some(block => block.id === id)) return;
    snapshot();
    setBlocks(previous => previous.filter(block => block.id !== id));
    setLinks(previous => previous.filter(link => link.from !== id && link.to !== id));
    setSelection(previous => previous.filter(other => other !== id));
  };
  const presentingRef = useRef(null);
  // Present mode's laser pointer: on by default, L or the bar's Laser toggles it.
  const [laser, setLaser] = useState(true);
  const laserRef = useRef(setLaser);
  presentingRef.current = presenting;
  const deleteSelectionRef = useRef(deleteSelection);
  deleteSelectionRef.current = deleteSelection;
  // ---------- Everyday object controls (docs/features/canvas-editing.md) ----------
  // Locked objects: cards, shapes, text, notes and equations. A locked object can be selected (to unlock it), never
  // moved, resized, edited, restyled or deleted by accident. A connector follows its ends and has no lock of its own.
  const lockedIds = new Set([...blocks, ...items, ...shapes].filter(entry => entry.locked).map(entry => entry.id));
  const lockedRef = useRef(lockedIds);
  lockedRef.current = lockedIds;
  const lockable = id => [...blocksRef.current, ...itemsRef.current, ...shapesRef.current].some(entry => entry.id === id);
  const lockSelection = () => {
    const ids = selectedRef.current.filter(lockable);
    if (!ids.length) return false;
    const lock = !ids.every(id => lockedRef.current.has(id));
    // An open edit lands first (flushed, so this step starts from the committed words).
    if (lock && editorRef.current) flushSync(() => editorRef.current.commit('blur'));
    snapshot();
    const patch = entry => (ids.includes(entry.id) ? { ...entry, locked: lock || undefined } : entry);
    setBlocks(previous => previous.map(patch));
    setItems(previous => previous.map(patch));
    setShapes(previous => previous.map(patch));
    return true;
  };
  // Cut: the copy machinery first; only a copy that succeeded deletes anything (and never a locked object).
  const cutSelection = () => {
    if (!copySelection()) return false;
    deleteSelection();
    return true;
  };
  // Copy style / paste style: appearance only (learn-style-panel.js copyStyle), from the first selected styleable object.
  const styleSource = () => {
    for (const id of selectedRef.current) {
      const link = present.current.links.find(entry => entry.id === id);
      if (link) return copyStyle(link, true);
      const entry = [...shapesRef.current, ...itemsRef.current].find(other => other.id === id && other.kind !== 'section');
      if (entry) return copyStyle(entry);
    }
    return null;
  };
  const copyStyleCommand = () => {
    const style = styleSource();
    if (!style) return false;
    styleClip.current = style;
    setCanPasteStyle(true);
    toast('Style copied');
    return true;
  };
  const pasteStyleCommand = () => {
    const style = styleClip.current, targets = selectedRef.current.filter(id => !lockedRef.current.has(id));
    if (!style || !targets.length) return false;
    snapshot();
    setShapes(previous => previous.map(shape => (targets.includes(shape.id) ? pasteStyle(shape, style) : shape)));
    setItems(previous => previous.map(item => (targets.includes(item.id) && item.kind !== 'section' ? pasteStyle(item, style) : item)));
    setLinks(previous => previous.map(link => (targets.includes(link.id) ? pasteStyle(link, style, true) : link)));
    return true;
  };
  // Arrow keys nudge by one canvas unit, Shift by ten. A run of presses is one undo step.
  const lastNudge = useRef(0);
  const nudge = (dx, dy) => {
    const ids = selectedRef.current.filter(id => !lockedRef.current.has(id));
    if (!ids.length) return false;
    const now = Date.now();
    if (now - lastNudge.current > 700) snapshot(ids.some(id => exchangesRef.current.some(exchange => exchange.id === id)));
    lastNudge.current = now;
    shift(dx, dy, ids);
    return true;
  };
  // Text / Code: an open edit is committed first, so its words are what switches; the switch is its own undo step.
  const setTextMode = (id, mode) => {
    if (editorRef.current) flushSync(() => editorRef.current.commit('blur'));
    if (editorRef.current || readOnlyRef.current) return;
    const sketch = drawTargetRef.current ? blocksRef.current.find(block => block.id === drawTargetRef.current)?.sketch : null;
    const before = (sketch ? sketch.items || [] : itemsRef.current).find(item => item.id === id);
    if (!before || (before.mode || 'text') === mode || lockedRef.current.has(id)) return;
    snapshot();
    markLists().setItems(previous => previous.map(item => (item.id === id ? { ...item, mode: mode === 'code' ? 'code' : undefined } : item)));
  };
  // A Code box's language (canvas-editing.md section 3): its own undo step, after any open edit is committed.
  const setCodeLang = (id, lang) => {
    if (editorRef.current) flushSync(() => editorRef.current.commit('blur'));
    if (editorRef.current || readOnlyRef.current) return;
    const sketch = drawTargetRef.current ? blocksRef.current.find(block => block.id === drawTargetRef.current)?.sketch : null;
    const before = (sketch ? sketch.items || [] : itemsRef.current).find(item => item.id === id);
    if (!before || codeLang(before) === lang || lockedRef.current.has(id)) return;
    snapshot();
    markLists().setItems(previous => withCodeLang(previous, id, lang));
  };
  // H1 to Text: the preset decides size and weight again, so the object's own size and bold, and any characters' sizes
  // and bold, let go (the other formatting stays).
  const presetPatch = (entry, value) => {
    const runs = Array.isArray(entry.runs) ? compactRuns(entry.runs.map(run => { const rest = { ...run }; delete rest.s; delete rest.b; return rest; })) : null;
    return { ...entry, level: value, fontSize: undefined, bold: undefined, runs: runs || undefined };
  };
  const applyLevel = (ids, value) => {
    setLevel(value);
    setTextArm(previous => ({ ...previous, s: undefined, b: undefined }));
    ids = ids.filter(id => !lockedRef.current.has(id));
    if (!ids.length) return;
    // The open editor's characters let go too; the object's own preset changes below.
    if (editorRef.current && ids.includes(editStep.current?.id)) editorRef.current.strip(['s', 'b']);
    if (!editorRef.current || editorRef.current.state().code) snapshot();
    const lists = markLists();
    lists.setItems(previous => previous.map(item => (ids.includes(item.id) ? presetPatch(item, value) : item)));
    lists.setShapes(previous => previous.map(shape => (ids.includes(shape.id) ? presetPatch(shape, value) : shape)));
  };
  // Undo and redo: snapshot the artifact lists before every mutating gesture.
  // ponytail: single-level lists + 100-step cap; both stacks die with the tab.
  const present = useRef(null);
  // groups ride in every undo step (UI-25): Undo after Ungroup or Group brings back the group itself, its name included.
  present.current = { strokes, shapes, items, links, blocks, groups, toc };
  const history = useRef([]);
  const future = useRef([]);
  const notebookHistory=useRef(null);
  if(!notebookHistory.current)notebookHistory.current=notebookHistoryController();
  // withExchanges captures the chat blocks too, so deleting a block undoes.
  const capture = (withExchanges = false) => ({ ...present.current, ...(withExchanges ? { exchanges: exchangesRef.current } : {}) });
  const snapshot = (withExchanges = false) => {
    const entry = capture(withExchanges);
    history.current.push(entry);
    if (history.current.length > 100) history.current.shift();
    // A fresh gesture is a new branch, so anything redone is no longer reachable.
    future.current = [];
    return entry;
  };
  // Esc on an unfinished resize: the shape goes back to how the gesture found it, and its step is dropped.
  const cancelGesture = () => {
    const entry = history.current[history.current.length - 1];
    if (!entry) return;
    history.current.pop();
    setStrokes(entry.strokes); setShapes(entry.shapes); setItems(entry.items); setLinks(entry.links); setBlocks(entry.blocks);
    if (entry.exchanges) onRestoreRef.current?.(entry.exchanges);
  };
  // A text edit is one undo step: opened when typing starts, dropped at the end if the edit changed nothing.
  const editStep = useRef(null);
  const beginEdit = id => {
    // CodeMirror keeps drafts local: create history only when a draft is accepted.
    // Discarding a stale draft must preserve newer content and the existing redo stack.
    const localCodeDraft = present.current.items.some(item => item.id === id && item.mode === 'code');
    editStep.current = { id, entry: localCodeDraft ? null : snapshot() };
  };
  const endEdit = (changed, list) => {
    const step = editStep.current;
    editStep.current = null;
    if (!step?.entry || changed) return;
    // A shape that grew while it was written in changed too.
    const was = step.entry[list]?.find(entry => entry.id === step.id), now = present.current[list]?.find(entry => entry.id === step.id);
    if (was === now && history.current[history.current.length - 1] === step.entry) history.current.pop();
  };
  const restore = state => {
    const before = blocksRef.current.filter(block=>block.type==='cad' && block.jobId && !block.cadDetached), after = state.blocks.filter(block=>block.type==='cad' && block.jobId && !block.cadDetached);
    for(const block of before.filter(block=>!after.some(next=>next.id===block.id)))cadClient(api,appName).action(block.jobId,'placement',{hidden:true}).catch(problem=>toast(problem.message));
    for(const block of after.filter(block=>!before.some(old=>old.id===block.id)))cadClient(api,appName).action(block.jobId,'placement',{hidden:false}).catch(problem=>toast(problem.message));
    setStrokes(state.strokes); setShapes(state.shapes); setItems(state.items); setLinks(state.links); setBlocks(state.blocks); if (state.groups) setGroups(state.groups); if ('toc' in state) setToc(state.toc); setSelected(null);
    if (state.exchanges) onRestoreRef.current?.(state.exchanges);
  };
  const travelHistory = (from,to) => {
    if(readOnlyRef.current||notebookHistory.current.pending)return;
    const next=from.current.at(-1);if(!next)return;
    const before=capture(!!next.exchanges),fingerprint=JSON.stringify(before),sourceStack=from.current,destinationStack=to.current;
    const result=notebookHistory.current.run({before,after:next,editor:notebookEditor,
      current:()=>alive.current&&!readOnlyRef.current&&from.current===sourceStack&&to.current===destinationStack&&from.current.at(-1)===next&&JSON.stringify(capture(!!next.exchanges))===fingerprint,
      commit:()=>{from.current.pop();to.current.push(before);restore(next);
        // A step's comment moves (Ungroup's) go back with Undo and again with Redo; the step on the other stack carries them on.
        if(next.comments){before.comments=next.comments;(from===history?next.comments.undo:next.comments.redo)().catch(problem=>toast(problem?.data?.error||problem.message,{tone:'error'}));}}});
    result?.catch?.(error=>toast(error.message));
  };
  const undo = () => travelHistory(history,future);
  const redo = () => travelHistory(future,history);
  // The opening camera, compensated for the controls that now float over the surface (homeView): no jump on load.
  useEffect(() => { setView(autoView.current = homeView(controlArea(), COLUMN)); }, []);
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
      if (!(event.ctrlKey || event.metaKey) && event.target.closest?.('[data-scroll]') && !event.target.closest?.('[data-card-layout="full"]')) return;
      // A graph card zooms its own graph; the wheel never also moves the canvas (repo-canvas-graph.md Clarification 5).
      if (event.target.closest?.('[data-graph-card]')) return;
      // The document's own menus scroll themselves, and a wide code block or table its own sideways overflow; reading down
      // the page itself moves the canvas camera (one spatial model, blocknote-canvas.md section 6).
      if (!(event.ctrlKey || event.metaKey) && event.target.closest?.('[data-canvas-doc] [role="listbox"],[data-canvas-doc] [role="menu"],[data-canvas-doc] .bn-suggestion-menu,[data-canvas-doc] .bn-grid-suggestion-menu')) return;
      if (!(event.ctrlKey || event.metaKey) && Math.abs(event.deltaX) > Math.abs(event.deltaY) && event.target.closest?.('[data-canvas-doc] pre,[data-canvas-doc] .tableWrapper')) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) zoomAt(event.clientX - box.left, event.clientY - box.top, Math.exp(-event.deltaY * 0.002));
      else setView(v => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    rail?.addEventListener('wheel', railWheel, { passive: false });
    return () => { element.removeEventListener('wheel', wheel); rail?.removeEventListener('wheel', railWheel); };
  }, [presenting === null]);
  // The surface clips (overflow hidden) but the document caret's reveal (the browser's and ProseMirror's scrollRectIntoView)
  // still scrolls it, sliding the world under a camera that never moved. Such a scroll becomes a camera move and the surface
  // goes back to 0, so the camera follows the document's caret (blocknote-canvas.md section 6). flushSync:
  // docCaret measures in the next frame, after the move, so it never pans a second time.
  useEffect(() => {
    const element = surface.current;
    const scrolled = () => {
      // Only while the document has the focus (its caret's reveal): any other scroll stays as it always was.
      if (!document.activeElement?.closest?.('[data-canvas-doc]')) return;
      const dx = element.scrollLeft, dy = element.scrollTop;
      if (!dx && !dy) return;
      element.scrollLeft = 0; element.scrollTop = 0;
      flushSync(() => setView(v => (autoView.current = { ...v, x: v.x - dx, y: v.y - dy })));
    };
    element.addEventListener('scroll', scrolled);
    return () => element.removeEventListener('scroll', scrolled);
  }, []);
  // ---------- Inline AI editor hooks (docs/features/inline-ai-editor.md) ----------
  // The live lists, never the last saved copy (§4). Layout comes separately (layout()), so content stays cheap to read.
  const inlineBoard = () => ({ shapes: shapesRef.current, items: itemsRef.current, links: present.current.links, blocks: blocksRef.current, groups: groupsRef.current, exchanges: exchangesRef.current });
  // The live lists with the open text editor's words on its object, read without committing or closing it (the shared
  // snapshot's board; agent-coordination 2026-10-13-shared-canvas-semantics.md, decision 3).
  const editorWords = () => {
    const id = editStep.current?.id || editingShape || editingLabel, runs = editorRef.current?.state?.().runs;
    return id && runs ? { id, text: plainOf(runs) } : null;
  };
  const semanticBoard = () => {
    const board = inlineBoard(), typed = editorWords();
    if (!typed) return board;
    const { id, text } = typed, put = list => list.map(entry => (entry.id === id ? { ...entry, text } : entry));
    return { ...board, shapes: put(board.shapes), items: put(board.items), links: board.links.map(link => (link.id === id ? { ...link, label: text } : link)) };
  };
  // Search reads these unbudgeted live lists, independently of model context and camera/layout state.
  searchRead.current = () => ({ ...equationSearchDrafts.current.apply(semanticBoard()), doc: liveDoc() });
  useLayoutEffect(() => { searchStore.current.changed(); }, [blocks, exchanges, shapes, items, links, groups, editorTick, doc]);
  useEffect(() => () => { searchJump.current++; searchPaint.current?.(); searchStore.current.dispose(); }, []);
  // Curious (docs/features/professor-next-steps.md 2.8, curious-context.js semanticReader): one read once the lists, the
  // editor's words and the selection have been still for 150 ms, focused on recent edits; typing settles at once. The
  // fingerprint and settling reach the page (onState), so a change of meaning re-plans and a move does not.
  const semanticLive = useRef(null);
  semanticLive.current = { semanticBoard, editorWords };
  const semanticRef = useRef(null);
  if (!semanticRef.current) semanticRef.current = semanticReader({ board: () => semanticLive.current.semanticBoard(), editor: () => semanticLive.current.editorWords(), selection: () => selectedRef.current,
    report: ({ fingerprint, settling }) => { setSemanticFingerprint(fingerprint); setSemanticSettling(settling); } });
  useEffect(() => { semanticRef.current.changed(); }, [shapes, items, links, blocks, groups, editorTick, selection]);
  useEffect(() => () => semanticRef.current.dispose(), []);
  // One context cache per board (A1): a board switch remounts the canvas with a new one; a permission change clears it.
  const inlineCache = useRef(null);
  if (!inlineCache.current) inlineCache.current = createContextCache();
  const inlineKey = useRef(null);
  if (!inlineKey.current) inlineKey.current = storageKey || `canvas:${crypto.randomUUID()}`;
  useEffect(() => { inlineCache.current.reset(); }, [readOnly]);
  // What Ctrl/Cmd+K would act on now: the words selected in the open text editor (precedence 1), that editor's object, or
  // the canvas selection - frozen (§2). null: nothing eligible, or the focus is somewhere that is not the canvas's.
  // fromKey: only the keyboard path asks where the focus is (a menu row's own focus is the menu's).
  // Creation (owner brief 2026-10-13 §1-§3): with nothing selected and the canvas focused, the editor opens to add, at an
  // insertion anchor in world units - the last deliberate click on empty canvas when it is still in view, else the middle
  // of the view. Nothing is saved by opening.
  const lastEmptyClick = useRef(null);
  const insertionAnchor = () => {
    const area = visibleArea(), v = viewRef.current;
    const seen = { x: (area.left - v.x) / v.z, y: (area.top - v.y) / v.z, w: (area.right - area.left) / v.z, h: (area.bottom - area.top) / v.z };
    const click = lastEmptyClick.current;
    if (click && click.x >= seen.x && click.x <= seen.x + seen.w && click.y >= seen.y && click.y <= seen.y + seen.h) return { x: Math.round(click.x), y: Math.round(click.y), from: 'click' };
    return { x: Math.round(seen.x + seen.w / 2), y: Math.round(seen.y + seen.h / 2), from: 'view' };
  };
  const inlineTarget = (fromKey = false) => {
    if (!inlineAiRef.current || presentingRef.current !== null) return null;
    const board = inlineBoard();
    const editing = document.activeElement?.closest?.('[data-rich-editor],[data-code-box-input]');
    if (editing && shell.current?.contains(editing)) {
      const owner = editing.closest('[data-item-id],[data-shape-id],[data-connection]');
      const id = owner?.dataset.itemId || owner?.dataset.shapeId || owner?.dataset.connection || null;
      if (!id) return null;
      const codeSelection = editing.matches('[data-code-box-input]') ? editorRef.current?.getSelection?.() : null;
      const text = codeSelection ? codeSelection.source : plainOf(readRuns(editing)), at = codeSelection || offsetsOf(editing);
      const range = at && at.to > at.from ? { id, from: at.from, to: at.to, text: text.slice(at.from, at.to) } : null;
      const target = freezeTarget(codeSelection ? semanticBoard() : board, [id], range ? { range } : {});
      return target && { target };
    }
    const held = document.activeElement;
    if (fromKey && held && held !== document.body && !held.matches?.('[data-block-id]') && (typingIn(held) || held.closest?.('[data-chat-composer],[data-toc-composer],[role="dialog"],[role="menu"],input,textarea,select,[contenteditable="true"]'))) return null;
    const target = freezeTarget(board, selectedRef.current);
    if (target) return { target };
    // Nothing selected (a populated canvas is not a blank one): the same editor, to add. From the keyboard only while the
    // canvas has the focus - never from a field, a dialog or a menu (checked above) or another part of the page.
    if (selectedRef.current.length || readOnly || (fromKey && held && held !== document.body && !shell.current?.contains(held))) return null;
    return { target: { ids: [], range: null, groupId: null, creation: true, anchor: insertionAnchor() } };
  };
  // mode: the editor's first mode, 'edit' | 'explain' (the selection action bar's Quick Edit passes 'edit'); null keeps
  // the editor's own default.
  const openInline = (opened = performance.now(), fromKey = false, mode = null) => {
    if (inlineRef.current) { shell.current?.querySelector('[data-inline-ai] textarea')?.focus(); return true; }
    const found = inlineTarget(fromKey);
    if (!found) return false;
    setMenuAt(null);
    setInline({ ...found, opened, mode, cold: inlineOpens.current === 0, opener: document.activeElement, n: (inlineOpens.current += 1) });
    return true;
  };
  const closeInline = () => {
    const opener = inlineRef.current?.opener;
    setInline(null);
    // Focus goes back where it was when that was a card or a control; from a closed text editor, to the canvas (body).
    requestAnimationFrame(() => { if (opener?.isConnected && opener.matches?.('[data-block-id],button,a,[tabindex]:not([tabindex="-1"])')) opener.focus({ preventScroll: true }); });
  };
  // Ctrl/Cmd+K is Quick Edit wherever the canvas has the focus, with a selection or none, and Ctrl/Cmd+L adds the selection to the
  // chat: shortcut-owner.js offers each chord here first, so neither can also open Search (now Ctrl/Cmd+Shift+F) or Dive.
  const quickEditKey = useRef(null), addToChatKey = useRef(null);
  quickEditKey.current = (event, field) => {
    if (!inlineAiRef.current) return false;
    if (!quickEditAllowed({ field, ownField: !!document.activeElement?.closest?.('[data-rich-editor],[data-code-box-input],[data-inline-ai]') })) return false;
    // Nothing eligible: the key stays on the canvas and says what it does, never Search.
    if (!openInline(performance.now(), true)) setInlineHint(n => n + 1);
    return true;
  };
  addToChatKey.current = (event, field) => addToChatAllowed({ hasSelection: selectedRef.current.length > 0, field, inlineOpen: !!inlineRef.current, presenting: presentingRef.current !== null, readOnly: readOnlyRef.current }) && addToChat();
  useEffect(() => {
    const stops = [claimChord('quick-edit', 'canvas', 10, (event, field) => quickEditKey.current(event, field)), claimChord('add-to-chat', 'canvas', 10, (event, field) => addToChatKey.current(event, field))];
    return () => stops.forEach(stop => stop());
  }, []);
  // Quick Edit opens the existing inline editor with Edit selection active (the bar's action, the menus' row and the chord).
  useEffect(() => {
    const open = event => { if(event.detail?.appName !== appName || !blocksRef.current.some(block=>block.id===event.detail.id))return; selectedRef.current=[event.detail.id];setSelection([event.detail.id]);openInline(performance.now(),false,event.detail.mode); };
    window.addEventListener('learn:cad-inline',open);return()=>window.removeEventListener('learn:cad-inline',open);
  },[appName]);
  const quickEdit = () => openInline(performance.now(), false, 'edit');
  const syncNotebook=snapshot=>{
    const block=blocksRef.current.find(item=>item.id===snapshot.id);
    if(readOnlyRef.current||block?.type!=='notebook'||block.locked||block.notebook_id!==snapshot.notebookId||activePath(block)!==snapshot.path)throw new Error('This notebook can no longer be edited.');
    flushSync(()=>setBlocks(previous=>previous.map(item=>item.id===snapshot.id?{...item,ipynb:snapshot.ipynb,ipynb_path:snapshot.path}:item)));
  };
  useEffect(()=>{
    const open=event=>{const {appName:owner,id,notebook}=event.detail||{};if(owner!==appName||readOnlyRef.current||inlineRef.current)return;
      try{syncNotebook(notebook);const target=freezeTarget(inlineBoard(),[id]);if(!target)return;selectedRef.current=[id];setSelection([id]);setInline({target:{...target,notebook},opened:performance.now(),mode:'edit',cold:inlineOpens.current===0,opener:document.activeElement,n:(inlineOpens.current+=1)});}catch(error){toast(error.message);}
    };
    window.addEventListener('learn:notebook-inline',open);return()=>window.removeEventListener('learn:notebook-inline',open);
  },[appName]);
  useEffect(() => { if (!inlineHint) return undefined; const timer = setTimeout(() => setInlineHint(0), 2200); return () => clearTimeout(timer); }, [inlineHint]);
  // The accepted result as one transaction and one undo step, applied to the lists as they are now: an unrelated edit made
  // meanwhile stays (§11). Then the existing save path at once, so persistence is measured apart from acceptance (A3).
  const applyInline = (tx, requestId, onPersisted) => {
    if (!alive.current || readOnlyRef.current) return false;
    editorRef.current?.commit('blur');
    if (tx.kind === 'edit'||tx.kind==='annotations') {
      const live = inlineBoard();
      if (tx.changes.some(change => !live[change.list]?.some(entry => entry.id === change.id) || lockedRef.current.has(change.id))) return false;
      if((tx.removals||[]).some(change=>!live[change.list]?.some(entry=>entry.id===change.id)||lockedRef.current.has(change.id)))return false;
      if((tx.additions||[]).some(change=>Object.values(live).some(list=>Array.isArray(list)&&list.some(entry=>entry.id===change.id))))return false;
      const boxes = measureNow();
      tx = { ...tx, changes: tx.changes.map(change => change.list === 'blocks'
        ? { ...change, after: preserveCardEditLayout(change.after, boxes[change.id]) } : change) };
    }
    // A placed card (A7) goes at the end of the column, offset to the spot its ghost showed; no other card moves.
    if (tx.kind === 'card' && !tx.after && !tx.end) { const at = flowIndexAtView(); tx = { ...tx, after: blocksRef.current[at - 1]?.id ?? null, first: at === 0 }; }
    if(tx.retainedSources?.length && !inlineAiRef.current?.retainImageSources?.(tx.retainedSources))return false;
    setCardGhost(null);
    snapshot();
    // A native diagram brings its groups too (inline-diagram.js): one transaction, one snapshot, one Undo.
    for (const [list, set] of [['shapes', setShapes], ['items', setItems], ['links', setLinks], ['blocks', setBlocks], ['groups', setGroups]]) {
      set(previous => applyTx({ shapes: [], items: [], links: [], blocks: [], groups: [], [list]: previous }, tx)[list]);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => commandsRef.current?.persist().then(result => { if (result?.ok) onPersisted?.(requestId); })));
    return true;
  };
  // Telemetry rows (A3/A5), batched and sent a few seconds after the last change - never on the request's path.
  const telemetryQueue = useRef(new Map()), telemetryTimer = useRef(null);
  // Only settled rows go (A5: after Accept, Reject or Cancel); a preview still on screen waits. On unmount everything goes.
  const flushTelemetry = (all = false) => {
    clearTimeout(telemetryTimer.current);
    const batch = [...telemetryQueue.current.values()].filter(row => all || !['previewed', 'reused'].includes(row.outcome));
    for (const row of batch) telemetryQueue.current.delete(row.request_id);
    if (batch.length) inlineAiRef.current?.sendTelemetry?.(batch);
  };
  useEffect(() => () => flushTelemetry(true), []); // eslint-disable-line react-hooks/exhaustive-deps
  const NOTE_LIKE = { kind: 'rect', color: '#6b7280', textColor: '#37352f', align: 'left' };
  // A connector's drawn path as world points every 16 units (its own hit path, in the world's coordinates).
  const inlinePaths = () => [...(shell.current?.querySelectorAll('[data-connection] path[stroke="transparent"]') || [])].map(path => {
    const length = path.getTotalLength(), points = [];
    for (let at = 0; at <= length; at += 16) points.push(path.getPointAtLength(at));
    points.push(path.getPointAtLength(length));
    return { id: path.closest('[data-connection]').dataset.connection, points: points.map(({ x, y }) => ({ x, y })) };
  });
  // Rendered elements in world units, from their screen boxes (group frames and comment pins are drawn, not stored).
  const inlineScreenBoxes = (selector, idKey = null) => {
    const at = surface.current?.getBoundingClientRect(), v = viewRef.current;
    if (!at) return [];
    return [...(shell.current?.querySelectorAll(selector) || [])].map(element => {
      const rect = element.getBoundingClientRect();
      return { ...(idKey ? { id: element.dataset[idKey] } : {}), x: (rect.left - at.left - v.x) / v.z, y: (rect.top - at.top - v.y) / v.z, w: rect.width / v.z, h: rect.height / v.z };
    }).filter(box => box.w && box.h);
  };
  // Every kind of thing on the board as boxes with their ids (obstaclesOf): the inline editor's obstacles, and linked answers'.
  const boardObstacles = (exclude = []) => obstaclesOf({ boxes: contentBoxes(), paths: inlinePaths(), frames: inlineScreenBoxes('[data-group-box]', 'groupBox'), areas: areas.map(stored => ({ ...areaBox(stored), id: stored.id })), pins: inlineScreenBoxes('[data-comment-pin]') }, exclude);
  const inlineCanvas = {
    locked: id => lockedRef.current.has(id),
    boardKey: inlineKey.current, cache: inlineCache.current,
    board: inlineBoard,
    renderNativeShape: shape => <ShapeView shape={{...shape,id:`inline-preview:${shape.id}`}} tool="preview" zoom={view.z} selected={false} />,
    layout: () => Object.fromEntries(contentBoxes().filter(box => box.id).map(({ id, ...box }) => [id, box])),
    boxOf: id => boxesOf([id])[0] || null,
    // Every kind of thing on the board (A7): measured boxes, connectors along their drawn paths, group frames, areas and
    // comment pins, in world units.
    obstacles: exclude => boardObstacles(exclude).map(({ id: _id, ...box }) => box),
    // The camera moves to show a world box (a ghost placed off-screen), the way an inserted card is shown.
    reveal: box => showBox(box, true),
    placementChrome,
    visibleWorld: () => { const area = visibleArea(), v = viewRef.current; return { x: (area.left - v.x) / v.z, y: (area.top - v.y) / v.z, w: (area.right - area.left) / v.z, h: (area.bottom - area.top) / v.z }; },
    // The part of the surface on screen: a phone's keyboard shrinks the visual viewport, not the surface.
    surfaceSize: () => {
      const element = surface.current, port = window.visualViewport;
      if (!element) return { w: 0, h: 0 };
      const top = element.getBoundingClientRect().top;
      return { w: element.clientWidth, h: Math.max(120, Math.min(element.clientHeight, port ? port.height + port.offsetTop - top : element.clientHeight)) };
    },
    // The canvas's own floating chrome over the surface, in surface pixels: the popover keeps clear of it.
    chromeRects: () => {
      const at = surface.current?.getBoundingClientRect();
      if (!at) return [];
      return [...[...(shell.current?.querySelectorAll('[data-style-panel], [data-canvas-bottom] > * > *, [data-chat-sheet]') || [])].flatMap(boxesIn)
        .filter(rect => rect.width && rect.height).map(rect => ({ x: rect.left - at.left, y: rect.top - at.top, w: rect.width, h: rect.height })),
      ...controlRects().map(rect => ({ x: rect.left, y: rect.top, w: rect.right - rect.left, h: rect.bottom - rect.top }))];
    },
    objectCount: () => blocksRef.current.length + itemsRef.current.length + shapesRef.current.length + present.current.links.length,
    describe: object => describeObject(object),
    measureNote: (text, width) => { const base = shapeBase(NOTE_LIKE); return measureHeight([{ t: text }], base, inkAware, shapeTextCss(NOTE_LIKE, base), width); },
    apply: applyInline,
    // A7 card ghost: show (hidden first, to measure), measure (its world box where it is now drawn), clear.
    cardGhost: {
      show: (block, { dx = 0, dy = 0, hidden = false } = {}) => setCardGhost({ block: { ...block, dx, dy }, hidden }),
      measure: () => {
        const node = shell.current?.querySelector('[data-inline-card-ghost] [data-block-id]');
        const at = surface.current?.getBoundingClientRect(), v = viewRef.current;
        if (!node || !at) return null;
        const rect = node.getBoundingClientRect();
        return { x: (rect.left - at.left - v.x) / v.z, y: (rect.top - at.top - v.y) / v.z, w: rect.width / v.z, h: rect.height / v.z };
      },
      clear: () => setCardGhost(null),
    },
    // An open text editor's words land first (flushed), so Accept's stale check reads them, not the last committed copy.
    flushEdits: () => { if (editorRef.current) flushSync(() => editorRef.current.commit('blur')); },
    syncNotebook,
    telemetry: rows => { for (const row of rows) telemetryQueue.current.set(row.request_id, row); clearTimeout(telemetryTimer.current); telemetryTimer.current = setTimeout(() => flushTelemetry(), 4000); },
  };
  // Delete/Backspace removes the selected sticky, text or shape; ctrl+z
  // undoes the last canvas gesture — both stand down while typing.
  useEffect(() => {
    const key = event => {
      // The inline editor owns its keys while it has the focus: Esc closes it first, never the selection.
      if (document.activeElement?.closest?.('[data-inline-ai]')) return;
      // An open text editor (RichText) owns every key while it is open: Enter, Esc, undo, clipboard and the arrows.
      if (document.activeElement?.closest?.('[data-rich-editor],[data-code-box-editor]')) return;
      // The document's editor (blocknote-canvas.md section 9) owns every key while it has the focus: typing, Space, Ctrl+A,
      // Delete, undo, its formatting and link shortcuts, Esc for its own menus. Never a canvas tool or selection.
      if (document.activeElement?.closest?.('[data-canvas-doc]')) return;
      // The companion column (Context, Files, Graph; repo-canvas-graph.md) owns its keys: Delete, the arrows and Esc on a focused
      // graph node act on the graph, never on canvas cards. So do a graph card's own controls (GraphCard.jsx): Delete on a focused
      // node never deletes the card; the card is deleted by selecting it as a canvas object.
      if (document.activeElement?.closest?.('[data-companion],[data-graph-card]')) return;
      // The pasted-URL choice owns its keys (Tab, Enter, Esc): Enter never opens a card, Delete never deletes one.
      if (document.activeElement?.closest?.('[data-paste-url]')) return;
      // A focused, unlocked webpage card scrolls its page with the arrows, Page Up/Down, Home and End (WebpageCard.jsx), never nudging it.
      if (document.activeElement?.closest?.('[data-webcard-frame][data-scroll]') && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
      // An active 3D viewer (ModelCard.jsx) owns its keys too: Esc ends its interaction first, never the selection.
      // A CAD viewer's Esc is its own wherever the focus is (its Interact sits in the toolbar outside the card): CadCard.jsx.
      if (document.activeElement?.closest?.('[data-viewer-active]') || (event.key === 'Escape' && document.querySelector('[data-cad-viewer][data-viewer-active]'))) return;
      // A drag in progress owns Esc: it cancels the gesture (startDrag) and nothing else.
      if (gestureLive && event.key === 'Escape') return;
      // Cards take the keyboard on any board (docs/features/canvas-card-selection.md): Space selects the focused card;
      // Enter opens it - or the one selected card while nothing else holds the focus. Presenting keeps both keys.
      const focusedCard = document.activeElement?.matches?.('[data-block-id]') ? document.activeElement.dataset.blockId : null;
      // Typing somewhere, an embedded editor or widget (focus inside a card), a dialog, a menu, the composer or the Pinned Study
      // pane and its working-view row (its divider's arrows resize the pane, never nudge a card): the canvas's own letter, Space
      // and arrow keys stand down there.
      const held = document.activeElement;
      const busy = held && held !== document.body && (held.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME'].includes(held.tagName) || typingIn(held)
        || (!!held.closest?.('[data-block-id]') && !held.matches('[data-block-id]')) || !!held.closest?.('[data-chat-composer],[data-toc-composer],[data-comments-panel],[data-study-pane],[data-study-work],[role="dialog"],[role="menu"]'));
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      // Shift+F10 or the menu key (UI-25): on a focused card the browser sends the card a contextmenu event, which the
      // surface handles; with the focus elsewhere and the canvas holding the keyboard, the selection's (or canvas's) menu.
      if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey)) && !busy
        && presentingRef.current === null && !held?.closest?.('[data-canvas-surface]')) {
        event.preventDefault();
        openKeyMenuRef.current();
        return;
      }
      if (presentingRef.current === null && plain) {
        if (event.key === ' ' && focusedCard) { event.preventDefault(); if (!selectedRef.current.includes(focusedCard)) selectRef.current(focusedCard); return; }
        // Space held over a canvas that owns the keyboard: a drag pans (never a space typed into anything, never a
        // focused button's own Space).
        if (event.key === ' ' && !busy && !held?.closest?.('button,a,[role="button"],[role="menuitem"],[role="tab"],summary')) {
          event.preventDefault();
          if (!spacePanRef.current) { spacePanRef.current = true; setSpacePan(true); }
          return;
        }
        const idle = !document.activeElement || document.activeElement === document.body;
        const target = event.key === 'Enter' && (focusedCard || (idle && selectedRef.current.length === 1 ? selectedRef.current[0] : null));
        if (target && openCardRef.current.can(target)) {
          event.preventDefault();
          if (!selectedRef.current.includes(target)) selectRef.current(target);
          openCardRef.current.open(target, 'learner_enter');
          return;
        }
        // Enter on a selected text box, note, shape or line (not a card that opens): start typing in it.
        if (target && !readOnlyRef.current && commandsRef.current.editSelected(target)) { event.preventDefault(); return; }
      }
      // C (docs/features/canvas-comments.md, Q14; owner 2026-10-08): comment on the selected or focused object, on any board
      // where you may comment; with nothing selected it does nothing. It stands down while typing, inside an embedded editor or widget (focus
      // inside a card), in a dialog or the composer, with Ctrl, Alt or Meta held (Ctrl+C still copies), and while presenting.
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
      // An open dialog or menu handles its own Esc first (the shortcuts sheet, the canvas menu, a composer menu), and so
      // does the New comment panel: its Esc is Cancel (canvas-comments.md, owner 2026-10-13).
      if (event.key === 'Escape' && (held?.closest?.('[role="dialog"],[role="menu"],[data-comment-draft]') || document.querySelector('[role="dialog"][aria-modal="true"]'))) return;
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
      // nothing half-done. An open canvas menu closes first, on its own.
      if (event.key === 'Escape') {
        if (menuOpenRef.current) { setMenuAt(null); return; }
        // A text edit still open while a style-panel field has the focus: Esc lands the words, nothing else.
        if (editorRef.current) { event.preventDefault(); editorRef.current.commit('esc'); return; }
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
      const commands = commandsRef.current;
      // One key per tool (familiar Excalidraw mappings), only while the canvas owns the keyboard: V select, H hand,
      // R rectangle, O ellipse, A arrow, L line, P pen, T text, E eraser, N sticky note. C is Comment, above.
      if (plain && !busy && TOOL_KEYS[event.key.toLowerCase()]) { event.preventDefault(); pickTool(TOOL_KEYS[event.key.toLowerCase()]); return; }
      // Arrow keys nudge the selection one canvas unit, Shift+arrow ten.
      if (!event.ctrlKey && !event.metaKey && !event.altKey && !busy && !drawTargetRef.current && NUDGE[event.key] && selectedRef.current.length) {
        const [dx, dy] = NUDGE[event.key], by = event.shiftKey ? 10 : 1;
        if (commands.nudge(dx * by, dy * by)) event.preventDefault();
        return;
      }
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
      // While a sketch is the draw target, the canvas's select-all, duplicate, group, copy and cut stand down: they
      // would reach the canvas's things from inside the sketch. Delete reaches the sketch's own selection only.
      if (drawTargetRef.current) {
        if (mod && ['a', 'd', 'g', 'c', 'x', 'l', '[', ']'].includes(event.key.toLowerCase())) return;
        if ((event.key === 'Delete' || event.key === 'Backspace') && !typing) deleteSketchSelectionRef.current();
        if (event.key === 'Delete' || event.key === 'Backspace') return;
      }
      // The rest of the Edit and View menus, each standing down while typing
      // so text fields keep their own select-all and the browser keeps its
      // zoom there. Ctrl+D and Ctrl+G would otherwise bookmark and find.
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'a') { if (typing) return; event.preventDefault(); commands.selectAll(); return; }
      // Duplicate, Group, Ungroup, Lock, layers and Delete run the canvas menu's own rows (canvas-actions.js, UI-25): one
      // handler and one permission check for the menu, the menubar's commands and the keyboard.
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'd') { if (typing || !selectedRef.current.length) return; event.preventDefault(); keyActionRef.current('duplicate'); return; }
      if (mod && event.key.toLowerCase() === 'g') { if (typing) return; event.preventDefault(); keyActionRef.current(event.shiftKey ? 'ungroup' : 'group'); return; }
      if (mod && ['=', '+', '-', '_'].includes(event.key)) { if (typing) return; event.preventDefault(); (event.key === '-' || event.key === '_' ? commands.zoomOut : commands.zoomIn)(); return; }
      if (!mod && event.shiftKey && (event.code === 'Digit1' || event.code === 'Digit0')) { if (typing) return; event.preventDefault(); (event.code === 'Digit1' ? commands.zoomFit : commands.zoomReset)(); return; }
      // Lock (Ctrl+Shift+L), layers (Ctrl+[ / ], with Shift all the way) and copy / paste style (Ctrl+Alt+C / V).
      if (mod && event.shiftKey && event.code === 'KeyL') { if (typing) return; event.preventDefault(); keyActionRef.current('lock'); return; }
      if (mod && (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
        if (typing || !selectedRef.current.length) return;
        event.preventDefault();
        keyActionRef.current(`order-${event.code === 'BracketRight' ? (event.shiftKey ? 'front' : 'forward') : (event.shiftKey ? 'back' : 'backward')}`);
        return;
      }
      if (mod && event.altKey && (event.code === 'KeyC' || event.code === 'KeyV')) {
        if (typing || !selectedRef.current.length) return;
        event.preventDefault();
        (event.code === 'KeyC' ? commands.copyStyle : commands.pasteStyle)();
        return;
      }
      if (mod && !event.altKey && (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'x')) {
        // Only a real text selection should defer to the browser. Testing the
        // document for any selection at all let a stray highlight anywhere on
        // the page silently kill the copy.
        const text = window.getSelection();
        if (typing || !selectedRef.current.length || (text && !text.isCollapsed && text.toString())) return;
        // Cut is copy, then delete - only once the copy succeeded.
        if ((event.key.toLowerCase() === 'x' ? commands.cut : commands.copy)()) event.preventDefault();
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (typing) return;
      keyActionRef.current('delete');
    };
    const keyUp = event => { if (event.key === ' ' && spacePanRef.current) { spacePanRef.current = false; setSpacePan(false); } };
    const lost = () => { if (spacePanRef.current) { spacePanRef.current = false; setSpacePan(false); } };
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
      const kind = pasteKind({ images: dropFilesRef.current ? images.length : 0, text, marker: CARDS_COPIED, copying: markingCopy.current, cards: clipboard.current?.length || 0, code, url: !readOnlyRef.current && !localCopyRef.current });
      // One URL asks first (webcard brief): Paste as text or Add webpage card; nothing is placed or fetched until a choice.
      if (kind === 'url') { event.preventDefault(); setUrlPaste({ text: text.trim(), back: active }); return; }
      if (kind === 'image') { event.preventDefault(); dropFilesRef.current(images); return; }
      if (kind === 'cards' && pasteIdsRef.current(clipboard.current, 28, true)) { event.preventDefault(); return; }
      if (kind === 'code') { event.preventDefault(); pasteCodeRef.current(text); return; }
      if (kind === 'text') { event.preventDefault(); pasteTextRef.current(text); }
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', keyUp, true);
    window.addEventListener('blur', lost);
    window.addEventListener('paste', paste, true);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', keyUp, true); window.removeEventListener('blur', lost); window.removeEventListener('paste', paste, true); };
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
  // The selected object's chat-context identity (pdf-materials-refinement.md section 6): a PDF card or page is its document and
  // page (pdfRef), anything else the ref Add to chat gives it. The composer shows a selection and an attachment of one ref once.
  // A code card is its code-card.js codeCardRef, the one its own Add to chat gives (UI-09/UI-10): a repository card its file and
  // lines at its commit, an uploaded one its stored file (its text is read in addToChat below).
  // A repository card the viewer cannot read arrives redacted (repository-cards.js: no path): it stays a plain card ref.
  const codeChatRef = object => (object?.type === 'repo-code' && (object.source?.kind === 'upload' || object.source?.path) ? codeCardRef(object) : null);
  const chatRefOf = object => excerptChatRef(object) || pdfRef(object) || fileChatRef(object) || codeChatRef(object) || (object ? { sourceId: `${objectKind(object)}:${object.id}`, kind: objectKind(object), range: null } : null);
  const armTarget = block => {
    const found = describeObject(block);
    if (!found) return false;
    // An untitled card's chip is its first line or its kind, never empty (UI-09).
    const described = { ...found, title: objectName(block, found) };
    armedId.current = block.id;
    // card: a selected card's context (the strip above the composer), kept after a send; context: its identities.
    const card = { card: true, asked: askedId.current === block.id, context: { ...selectedCardContext(block, described.title), material_type: block.type || described.material }, ref: chatRefOf(block), pdf: !!(pdfRef(block) || fileChatRef(block)) };
    // A region excerpt's content is its picture: its crop's file ref rides the turn (ask.jsx), as a text excerpt's quote rides in its text.
    if (block.excerpt?.kind === 'region') card.excerptCrop = card.ref;
    // A page sends the page itself, of its own source (pdf-source.js): an uploaded paper's page as paper_context, read by
    // the model as the reader's pages are, from its home canvas when it was copied here; a context document's page as its doc
    // ref at that page. The thumbnail only shows on the chip.
    if (block.type === 'slide') {
      const source = pdfSource(block.pdf), ref = pageRef(block);
      const target = { id: block.id, ...described, ...card, ...(source?.kind === 'paper' ? { paper: { id: source.id, page: block.number, ...(block.home ? { home: block.home } : {}) } } : {}), ...(source?.kind === 'doc' && ref ? { docPage: ref } : {}) };
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
  // Add to chat (owner brief 2026-10-13: Ctrl/Cmd+L and the selection bar; it replaces Ask in chat and its prefilled question).
  // The selection becomes the composer's context chip: one object as its card chip, a group or several objects as ONE chip with
  // their count. The chip holds ids and its text is read when the question is sent. The learner's draft is never touched,
  // nothing is sent, the selection stays, and a hidden composer comes back and takes the focus.
  const askEntryOf = id => {
    const block = blocksRef.current.find(entry => entry.id === id);
    if (block) { const described = describeBlock(block); return described?.text ? { text: described.text } : { skipped: block.type }; }
    const exchange = exchangesRef.current.find(entry => entry.id === id);
    if (exchange) return { question: exchange.question, answer: exchange.answer };
    const item = itemsRef.current.find(entry => entry.id === id);
    if (item?.text) return { text: item.text };
    if (item?.latex) return { text: describeCanvasObject(item).text };
    const shape = shapesRef.current.find(entry => entry.id === id);
    return shape?.text ? { text: shape.text } : null;
  };
  // Each selected object's name, read from the object itself (UI-09: never "1 item"); a shape is in none of objectById's lists.
  const nameOf = id => { const object = objectById(id) || shapesRef.current.find(shape => shape.id === id); return objectName(object, object && describeObject(object)); };
  const armCollection = (ids, ref = null) => {
    const gids = new Set(ids.map(groupOf));
    const gid = gids.size === 1 && !gids.has(null) ? [...gids][0] : null;
    const group = gid && membersOf(gid).length === ids.length ? groups.find(entry => entry.id === gid) : null;
    const label = selectionName(ids.map(nameOf), group);
    const id = group ? group.id : `selection:${[...ids].sort().join('+')}`;
    armedId.current = null;
    armedGroup.current = group ? group.id : null;
    onAskTargetRef.current?.({ id, kind: group ? 'Group' : 'Selection', title: label, ...(ref ? { ref } : {}), get text() { return groupTargetText(ids.map(askEntryOf).filter(Boolean)); } });
    // The visuals ride too: a rendered snapshot of the selection's area becomes this question's image context.
    const boxes = boxesOf(ids);
    if (!boxes.length) return;
    const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.w)), bottom = Math.max(...boxes.map(box => box.y + box.h));
    groupShot({
      box: { left, top, right, bottom }, members: new Set(ids),
      strokes: strokes.filter(stroke => stroke.points?.some(point => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom)),
      shapes, items, blocks, bounds, cachedAsset: loadAsset,
      dark: document.documentElement.classList.contains('dark'),
    }).then(blob => { if (blob) onGroupShotRef.current?.(blob, group?.label || label, id); }).catch(() => { /* text still asks */ });
  };
  // On a Learn canvas (the Chat workspace, chat-workspace-CONTRACT.md A5) the selection is ONE ContextRef in the right-side Chat
  // (selection-ref.js): Chat opens in Ask, the draft stays, its composer takes the focus, nothing is sent. The card's selection
  // chip steps aside, so one card is never two chips or sent twice. A view-only board has no workspace and keeps the path below.
  const chatWorkspace = useChatWorkspace();
  // quote: text selected inside the object, captured when the right-click menu opened (UI-25 Add selection to chat); it is
  // the selection's quote, so a source card (PDF, file, code) adds that text rather than the whole source.
  const addToChat = options => {
    const given = typeof options?.quote === 'string' ? options.quote : null;
    const ids = selectedRef.current.filter(id => objectById(id) || shapesRef.current.some(shape => shape.id === id));
    if (!ids.length) return false;
    const object = ids.length === 1 ? objectById(ids[0]) : null;
    if (chatWorkspace) {
      // A page is its own PDF at that page (pdf-to-canvas.md): a context document's ref, or an uploaded paper's (pageRef), the
      // chip a question about it sends; a whole PDF card is its document's ref (pdfRef), never a second card chip of one PDF.
      // Its selection chip steps aside, as a card's does below, so the page is one chip.
      // An imported file card is its file ref (file-chat-ref.js: source revision + scope), the selection chip's own identity.
      // A PDF excerpt is its own ref (pdf-excerpt.js): the verbatim text, or its crop's image file - the selection chip's identity.
      // A repository code card is its code ref: the file and lines at its commit, read under the owner check (UI-09).
      const sourceRef = excerptChatRef(object) || pdfRef(object) || fileChatRef(object) || codeChatRef(object);
      if (sourceRef && given === null) {
        // An uploaded code card carries its stored text, as CodeCard's own Add to chat does; an unreadable asset adds its name only.
        if (object.type === 'repo-code' && object.source?.kind === 'upload') {
          loadAsset(object.source.assetKey).then(value => (typeof value === 'string' ? value : value?.text?.() ?? ''))
            .then(text => chatWorkspace.addToChat(codeCardRef(object, text)), () => chatWorkspace.addToChat(sourceRef));
        } else if (chatWorkspace.addToChat(sourceRef, { fileRef: object.fileRef }) === false) return false;
        if (askTargetId === object.id) { armedId.current = null; onAskTargetRef.current?.(null); }
        return true;
      }
      const described = object && describeObject(object);
      const read = () => (described ? liveAskText(object.id, described)() : groupTargetText(ids.map(askEntryOf).filter(Boolean)));
      const group = ids.length > 1 && groups.find(entry => ids.every(id => groupOf(id) === entry.id) && membersOf(entry.id).length === ids.length);
      const picked = window.getSelection(), node = picked && !picked.isCollapsed ? picked.anchorNode : null;
      const quote = given ?? (object && (node?.nodeType === 1 ? node : node?.parentElement)?.closest('[data-block-id]')?.getAttribute('data-block-id') === object.id ? picked.toString() : '');
      const ref = selectionRef({ ids, kind: objectKind(object), name: object ? objectName(object, described) : selectionName(ids.map(nameOf), group), content: read(), quote, text: read });
      chatWorkspace.addToChat(ref);
      // Keep the existing snapshot path; the matching pinned ref makes this one chip, not a second selection chip.
      if (!object) armCollection(ids, ref);
      if (object && askTargetId === object.id) { armedId.current = null; onAskTargetRef.current?.(null); }
      if (object?.type === 'file' && object.kind === 'image' && object.mediaId) onCardActionRef.current?.('image-attach', { blockId: object.id, mediaId: object.mediaId, label: object.label });
      return true;
    }
    if (object && describeObject(object)) {
      askedId.current = object.id;
      if (!armTarget(object)) return false;
      // A dropped image is shown to the tutor the way Show the tutor this image and the drop show it (LearnPage image-attach).
      if (object.type === 'file' && object.kind === 'image' && object.mediaId) onCardActionRef.current?.('image-attach', { blockId: object.id, mediaId: object.mediaId, label: object.label });
    } else armCollection(ids);
    askDraft();
    requestAnimationFrame(() => shell.current?.querySelector('[data-canvas-composer] textarea, [data-canvas-composer] input:not([type="file"]), [data-canvas-composer] [contenteditable="true"]')?.focus({ preventScroll: true }));
    return true;
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
  // A question asked about a block auto-links that block to its answer node. A card's answer goes beside its card in
  // free space (placeAnswers, the inline editor's placer): clear of every card, note, shape, connector and answer, the
  // ones placed in the same pass included, and nothing else moves. Placement repeats once the answer is complete, when
  // the node's height is final. A floated answer (LearnPage) is placed only while it has no spot of its own: one saved
  // with its spot stays where it was saved.
  const autoLinked = useRef(new Set());
  const autoSettled = useRef(new Set());
  useEffect(() => {
    const due = exchanges.filter(exchange => {
      if (!exchange.linkFrom) return false;
      if (autoLinked.current.has(exchange.id)) return !autoSettled.current.has(exchange.id) && exchange.status === 'done';
      return !exchange.float || (!exchange.dx && !exchange.dy);
    });
    if (!due.length) return;
    // Measured now: an answer placed a moment ago has moved before its bounds caught up.
    const live = boundsRef.current = measureNow();
    const place = (exchange, own, x, y, sides, area = null) => {
      const flowX = own.x - exchange.dx, flowY = own.y - exchange.dy;
      onMove(exchange.id, x - flowX, y - flowY);
      if (centerRef.current === exchange.id) { centerRef.current = null; centerOn({ x, y, w: own.w, h: own.h }); }
      const mine = present.current.links.find(link => link.from === exchange.linkFrom && link.to === exchange.id);
      if (!mine) {
        setLinks(previous => [...previous, { id: crypto.randomUUID(), from: exchange.linkFrom, fromSide: sides[0], to: exchange.id, toSide: sides[1], ...(area ? { route: 'curve' } : {}), color: area ? '#dc2626' :LINK_COLORS[blocksRef.current.find(block => block.id === exchange.linkFrom)?.type] || '#2383e2' }]);
      } else if (mine.fromSide !== sides[0] || mine.toSide !== sides[1]) {
        setLinks(previous => previous.map(link => link.id === mine.id ? { ...link, fromSide: sides[0], toSide: sides[1] } : link));
      }
    };
    const cards = [], beside = [];
    for (const exchange of due) {
      const linkedArea = areaById(exchange.linkFrom);
      const source = boxesOf([exchange.linkFrom])[0] || (linkedArea && areaBox(linkedArea)), own = live[exchange.id];
      if (!source || !own) continue; // wait for both to be measured
      autoLinked.current.add(exchange.id);
      if (exchange.status === 'done') autoSettled.current.add(exchange.id);
      const area = String(exchange.linkFrom).startsWith('area:') ? source : null;
      if (!area) { cards.push({ exchange, own, source }); continue; }
      // An asked-about area's answer goes beside what the area sits on (a slide, a card), on the
      // nearer side and a little above the area, never over it.
      const under = Object.entries(live).filter(([id, b]) => id !== exchange.id && b.x < area.x + area.w && b.x + b.w > area.x && b.y < area.y + area.h && b.y + b.h > area.y).map(([, b]) => b);
      const left = Math.min(area.x, ...under.map(b => b.x)), right = Math.max(area.x + area.w, ...under.map(b => b.x + b.w));
      const toRight = area.x + area.w / 2 >= (left + right) / 2;
      const x = toRight ? right + 48 : left - 48 - own.w;
      let y = area.y - 24;
      // Push below any node whose box would overlap this one.
      // ponytail: an area's answer keeps its beside-the-host rule and this column-only push; move it to placeAnswers if
      // it is ever seen over a note or a shape.
      const others = Object.entries(live).filter(([id]) => id !== exchange.id && id !== exchange.linkFrom).map(([, box]) => box).sort((a, b) => a.y - b.y);
      for (let pass = 0; pass < 8; pass++) {
        const hit = others.find(box => x < box.x + box.w && x + own.w > box.x && y < box.y + box.h && y + own.h > box.y);
        if (!hit) break;
        y = hit.y + hit.h + 24;
      }
      place(exchange, own, x, y, toRight ? ['right', 'left'] : ['left', 'right'], area);
      beside.push({ x, y, w: own.w, h: own.h });
    }
    if (!cards.length) return;
    const answers = cards.map(({ exchange, own, source }) => ({ id: exchange.id, target: source, size: { w: own.w, h: own.h },
      ignore: [exchange.linkFrom, ...present.current.links.filter(link => link.from === exchange.id || link.to === exchange.id).map(link => link.id)] }));
    placeAnswers(answers, [...boardObstacles(), ...beside]).forEach((spot, i) => place(cards[i].exchange, cards[i].own, spot.x, spot.y, spot.sides));
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
    const area = controlArea();
    setView(v => {
      const x = (area.left + area.right) / 2 - (box.x + box.w / 2) * v.z;
      const h = Math.max(120, Math.min(open, chromeTop(x + box.x * v.z, x + (box.x + box.w) * v.z)) - area.top);
      return (autoView.current = { ...v, x, y: area.top + h / 2 - (box.y + Math.min(box.h, h / v.z) / 2) * v.z });
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
  // A Search result dragged over the canvas (UI-13, search-drag.js): its plan at the pointer drawn as the landing outline (or
  // the refusal), and done on drop. false: not a Search drag from this page.
  const searchMark = useRef(null);
  const searchDragEvent = (event, drop = false) => {
    const drag = searchDrag.current();
    if (!drag || ![...(event.dataTransfer?.types || [])].includes(SEARCH_DRAG)) return false;
    const at = local(event), plan = searchDropPlan(drag.payload, { readOnly: readOnlyRef.current || localCopyRef.current, locked: lockedRef.current, blocks: blocksRef.current, box: id => boxesOf([id])[0] || null });
    event.preventDefault();
    drag.refusal = plan.action === 'refuse' ? plan.reason : null;
    event.dataTransfer.dropEffect = plan.action === 'refuse' ? 'none' : plan.action === 'link' ? 'copy' : 'move';
    paintSearchDrop(searchMark.current, drop ? null : plan, at, view);
    if (drop) drag.outcome = applySearchDrop(commandsRef.current, plan, at);
    return true;
  };
  // Add comment (docs/features/canvas-comments.md section 5): an anchor at a world point, on the object there (relative
  // to it, so it follows the card, shape or group) or on the canvas. The menu, the Comment tool and C all come here; the
  // page's panel saves.
  const groupMembers = {};
  for (const entry of [...blocks, ...items, ...shapes, ...exchanges]) if (entry.groupId) (groupMembers[entry.groupId] ||= []).push(entry.id);
  const commentBoard = { bounds, items, shapes, groups: groupMembers };
  // The commentable objects, to the page's comments (owner decision 2026-10-23): a deleted object's threads leave the Comments
  // panel and the counts as its pin does, and come back with Undo. A group is live while it has members.
  const commentKey = onCommentObjects ? JSON.stringify([[...blocks, ...items, ...shapes, ...exchanges].map(entry => entry.id), Object.keys(groupMembers)]) : '';
  useEffect(() => {
    if (!onCommentObjects) return;
    const [ids, gids] = JSON.parse(commentKey).map(list => new Set(list));
    onCommentObjects({ ids, groups: gids });
  }, [commentKey, onCommentObjects]);
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
  // The pin slot (owner, 2026-10-08): an object's thread pins sit just left of its pill row - the selection actions, and the
  // pills a few cards add beside it - whether it is selected or not, so a pin never covers a pill; and each touches its object
  // (owner, 2026-10-13; pinSpot in comments/anchors.js). In world units: the object's visible box (a group's outline) and the
  // row's width. A dropped image, a text box and a sticky note have the same Ask in chat (r35); a shape keeps the slot it
  // would take. PILL: the pills' rendered widths, with a little room.
  const PILL = { ask: 297, select: 124, explain: 144, more: 138, notebook: 30, gap: 6 };
  const pillRow = id => {
    const block = blocks.find(entry => entry.id === id);
    if (block) return PILL.ask + (block.type === 'whiteboard' || block.type === 'paper' ? PILL.gap + PILL.select : 0) + (block.type === 'code' || block.type === 'snippet' ? PILL.gap + PILL.notebook : 0);
    if (exchanges.some(entry => entry.id === id)) return PILL.explain + PILL.gap + PILL.ask + PILL.gap + PILL.more;
    return PILL.ask;
  };
  const commentSlot = id => {
    const members = groupMembers[id];
    const boxes = boxesOf(members || [id]);
    if (!boxes.length) return null;
    const pad = members ? GROUP_PAD : 0; // a group's outline sits outside its members
    const x = Math.min(...boxes.map(box => box.x)) - pad, y = Math.min(...boxes.map(box => box.y)) - pad;
    const w = Math.max(...boxes.map(box => box.x + box.w)) + pad - x;
    // lead: what its pins keep clear at its top left - a group's name chip (it keeps its menu); a text box's, an equation's or
    // a text shape's whole top edge, where its ladder, Text | Code and a shape's actions sit from the left (so they hang on
    // its left edge, never over H1 or another control).
    const item = items.find(entry => entry.id === id), shape = shapes.find(entry => entry.id === id);
    const lead = members ? worldRef.current?.querySelector(`[data-group-chip="${id}"]`)?.offsetWidth || 0 : (item && item.kind !== 'sticky') || (shape && TEXT_BOX[shape.kind]) ? w : 0;
    return { x, y, w, h: Math.max(...boxes.map(box => box.y + box.h)) + pad - y, row: pillRow(id), lead };
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
  // A drag on empty canvas (or Ctrl-drag, either button) rubber-bands a selection: every card, shape and
  // text box the rectangle touches is selected, and the next drag moves them together.
  const marqueeRef = useRef(null);
  const selectWithin = (rect, additive = false) => {
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
    const next = [...new Set([...(additive ? selectedRef.current : []), ...ids])];
    selectedRef.current = next;
    setSelection(next);
  };
  // A plain drag on empty canvas draws a selection rectangle (Excalidraw; docs/features/canvas-editing.md): everything
  // it touches is selected, Shift adds to what was. The Hand tool, Space+drag, the middle button and the trackpad pan.
  const startMarquee = (event, additive) => {
    if (!additive) setSelected(null);
    const start = local(event);
    marqueeRef.current = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
    setMarquee(marqueeRef.current);
    const apply = (px, py) => { marqueeRef.current = { x1: start.x, y1: start.y, x2: px, y2: py }; setMarquee(marqueeRef.current); };
    apply.done = () => { if (marqueeRef.current) selectWithin(marqueeRef.current, additive); marqueeRef.current = null; setMarquee(null); };
    startDrag(event, start, apply, view.z);
  };
  // Shared by the extra text formatting a new text box or note starts with (the panel's armed values).
  const armedText = kind => ({
    ...(textArm.f ? { font: textArm.f } : {}), ...(textArm.s ? { fontSize: textArm.s } : {}), ...(textArm.b != null ? { bold: textArm.b } : {}),
    ...(textArm.i ? { italic: true } : {}), ...(textArm.u ? { underline: true } : {}), ...(textArm.align ? { align: textArm.align } : {}),
    ...(kind === 'sticky' && textArm.c ? { textColor: textArm.c } : {}),
  });
  // Ask about selection: a rectangle in page coordinates becomes a PNG of that part of the screen, the
  // cards it touches, and an ask target (LearnPage uploads the image so the tutor sees it).
  const areaShot = useRef(0);
  const askArea = async rect => {
    const x = Math.min(rect.x1, rect.x2), y = Math.min(rect.y1, rect.y2), w = Math.abs(rect.x2 - rect.x1), h = Math.abs(rect.y2 - rect.y1);
    if (w * view.z < 8 || h * view.z < 8) return;
    const node = surface.current, box = node.getBoundingClientRect();
    const crop = { x: view.x + x * view.z, y: view.y + y * view.z, w: w * view.z, h: h * view.z };
    const inside = Object.entries(boundsRef.current).filter(([, b]) => b.x + b.w > x && b.x < x + w && b.y + b.h > y && b.y < y + h).map(([id]) => blocks.find(block => block.id === id)).filter(Boolean);
    // EXP-T28: bind the crop to each card as it is now (id, revision, bounds, moment), measured before the slow capture.
    const screen = { left: box.left + crop.x, top: box.top + crop.y, width: crop.w, height: crop.h };
    const bindings = inside.map(block => {
      const card = node.querySelector(`[data-block-id="${CSS.escape(block.id)}"]`);
      if (!card) return null;
      const objects = [...card.querySelectorAll('[data-animation-object]')].map(el => ({ id: el.getAttribute('data-animation-object'), rect: el.getBoundingClientRect() }));
      const shapes = block.type === 'whiteboard' ? boardAsk(block.id)?.shapesIn(screen) : undefined;
      return cropBinding(block, screen, { card: card.getBoundingClientRect(), page: card.querySelector('canvas[aria-label="Paper PDF page"]')?.getBoundingClientRect(), objects, shapes });
    }).filter(Boolean);
    // A later crop supersedes this one, and a canvas switched or closed meanwhile takes nothing from it.
    const shot = ++areaShot.current, key = storageKeyRef.current;
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
    if (shot !== areaShot.current || key !== storageKeyRef.current || !node.isConnected) return;
    const id = `area:${Date.now().toString(36)}`;
    // The area rides on the card or slide under its centre, so it stays put when the column above it grows.
    const cx = x + w / 2, cy = y + h / 2;
    const host = Object.entries(boundsRef.current).find(([hostId, b]) => blocks.some(block => block.id === hostId) && cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h);
    setAreas(previous => [...previous, { id, x, y, w, h, ...(host ? { blockId: host[0], dx: x - host[1].x, dy: y - host[1].y } : {}) }]);
    onAreaShotRef.current?.({ target: areaTarget({ id, bindings, preview }), preview, blob });
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
    // Esc cancels an unfinished stroke or shape: nothing is added, nothing is undoable (docs/features/canvas-editing.md).
    const listen = (move, up, key) => {
      gestureLive = true;
      const stop = () => { gestureLive = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('keydown', keys, true); window.removeEventListener('keyup', keys, true); };
      const finish = e => { stop(); up(e); };
      const keys = e => {
        if (e.type === 'keydown' && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); key('cancel'); return; }
        if (e.key === 'Shift' || e.key === 'Alt') { if (e.key === 'Alt') e.preventDefault(); key(e); }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('keydown', keys, true);
      window.addEventListener('keyup', keys, true);
    };
    if (tool === 'pen' || tool === 'highlighter') {
      event.preventDefault();
      // The width row scales both inks: pen uses it directly, highlighter 4x.
      const ink = tool === 'pen' ? { tool, color, width, dash, opacity } : { tool, width: width * 4 };
      const points = [store.local(event)];
      store.setLive({ ...ink, points });
      listen(
        e => { points.push(store.local(e)); store.setLive({ ...ink, points: [...points] }); },
        () => { store.setLive(null); if (points.length > 1) { snapshot(); store.setStrokes(previous => [...previous, { ...ink, points }]); } },
        e => { if (e === 'cancel') store.setLive(null); },
      );
    } else if (shapeTool) {
      event.preventDefault();
      const start = store.local(event);
      const linear = tool === 'line' || tool === 'arrow' || tool === 'curve' || tool === 'elbow';
      const draft = { id: crypto.randomUUID(), kind: tool, x1: start.x, y1: start.y, x2: start.x, y2: start.y, color, width, dash, fill, opacity, round,
        ...(TEXT_BOX[tool] && fill ? { fillOpacity } : {}), ...(TEXT_BOX[tool] && noStroke ? { noStroke: true } : {}), ...(linear && heads.start ? { startHead: heads.start } : {}), ...(linear && heads.end ? { endHead: heads.end } : {}) };
      // Shift squares the box or snaps the line to 45 degrees; Alt draws from the centre. Pressing or letting go of
      // either mid-drag redraws the preview at once, and the shape saved is the preview's (learn-draw-modifiers.js).
      let point = start, keys = { shift: event.shiftKey, alt: event.altKey };
      const shape = () => ({ ...draft, ...drawGeometry(linear, start, point, keys) });
      store.setLiveShape(shape());
      listen(
        e => { point = store.local(e); keys = { shift: e.shiftKey, alt: e.altKey }; store.setLiveShape(shape()); },
        e => {
          point = store.local(e); keys = { shift: e.shiftKey, alt: e.altKey };
          store.setLiveShape(null);
          // The drawn shape is the selection (Excalidraw does the same), so its style panel stays open on it.
          if (Math.hypot(point.x - start.x, point.y - start.y) > 4) { snapshot(); const made = shape(); store.setShapes(previous => [...previous, made]); store.select(made.id); }
          if (!lock) setTool('select');
        },
        e => { if (e === 'cancel') { store.setLiveShape(null); return; } keys = { shift: e.shiftKey, alt: e.altKey }; store.setLiveShape(shape()); },
      );
    } else if (tool === 'eraser') {
      event.preventDefault();
      snapshot();
      const radius = 12 / view.z;
      const erase = e => {
        const point = store.local(e);
        store.setStrokes(previous => previous.filter(stroke => !stroke.points.some(q => Math.hypot(q.x - point.x, q.y - point.y) < radius)));
        store.setShapes(previous => previous.filter(shape => {
          if (lockedRef.current.has(shape.id)) return true; // a locked shape survives a sweep of the eraser
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
      // A new text box grows with its words (Excalidraw's auto width); a corner drag gives it a width to wrap at. Inside a
      // sketch it wraps at the sketch's edge. It starts with whatever text formatting is armed.
      const width = store.textWidth(point), id = crypto.randomUUID();
      store.setItems(previous => [...previous, { id, kind: tool, x: point.x, y: point.y, text: '', color: tool === 'text' && textArm.c ? textArm.c : color, opacity, ...armedText(tool), ...(tool === 'text' ? { level, ...(width ? { w: width } : {}) } : {}), fresh: true }]);
      // The new box is the selection, so the style panel formats it while it is typed in (Excalidraw does the same).
      store.select(id);
      if (!lock) setTool('select');
    } else if (tool === 'equation' && store.equations) {
      // An equation opens for editing where it is placed (canvas-equations.md); an Explain Back sketch holds none.
      event.preventDefault();
      setEquationDraft(newEquation(store.local(event)));
      if (!lock) setTool('select');
    } else return false;
    return true;
  };
  const canvasStore = { local, setStrokes, setShapes, setItems, setLive, setLiveShape, textWidth: () => null, equations: true, select: id => { selectedRef.current = [id]; setSelection([id]); } };
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
    select: markId => setSketchSel([markId]),
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
            editing={sketchEdit?.kind === 'text' && sketchEdit.id === shape.id} editPoint={sketchEdit?.point || null} labelEditing={sketchEdit?.kind === 'label' && sketchEdit.id === shape.id}
            onSelect={selectInSketch} onMoveStart={(event, pressed) => moveSketchShape(event, id, pressed)} onGesture={snapshot} onGestureCancel={cancelGesture}
            onResize={(markId, patch) => patchSketch(id, 'shapes', markId, patch)} onDelete={markId => dropFromSketch(id, [markId])}
            onEdit={(markId, point) => setSketchEdit({ id: markId, kind: 'text', point })} onEditorApi={onEditorApi}
            onGrow={(markId, height) => editSketch(id, 'shapes', marks => marks.map(mark => { if (mark.id !== markId || Math.abs(mark.y2 - mark.y1) >= height) return mark; const top = Math.min(mark.y1, mark.y2); return mark.y2 >= mark.y1 ? { ...mark, y2: top + height } : { ...mark, y1: top + height }; }))}
            onText={(markId, runs) => { setSketchEdit(null); snapshot(); patchSketch(id, 'shapes', markId, textPatch(runs)); }}
            onLabel={markId => setSketchEdit({ id: markId, kind: 'label' })}
            onLabelDone={(markId, runs) => { setSketchEdit(null); snapshot(); const { text, runs: kept } = textPatch(runs); patchSketch(id, 'shapes', markId, { label: text, runs: kept }); }} />)}
          {[...strokes, ...(mine?.stroke ? [mine.stroke] : [])].map(inkPath)}
        </svg>
        {items.map(item => <CanvasItem key={item.id} item={item} zoom={view.z} tool={markTool} selected={marked(item.id)} onSelect={selectInSketch} onGesture={snapshot} onEditorApi={onEditorApi}
          onCommit={(markId, runs) => { const before = items.find(mark => mark.id === markId); const patch = textPatch(runs); if (before && !before.fresh && (before.text || '') !== patch.text) snapshot(); patchSketch(id, 'items', markId, { ...patch, fresh: false }); }}
          onMove={(markId, x, y) => patchSketch(id, 'items', markId, { x, y })}
          onResize={(markId, w, h) => patchSketch(id, 'items', markId, { w, h })}
          onDelete={markId => dropFromSketch(id, [markId])}
          onLevel={(markId, value) => { snapshot(); patchSketch(id, 'items', markId, presetPatch(items.find(mark => mark.id === markId) || {}, value)); }} />)}
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
      // A group's box is painted over its cards, so a Ctrl/Cmd press on a grouped card lands on the box, not the card.
      // It picks that one card, as select does for any card (Shift toggles); only a press on empty canvas starts a marquee.
      // ponytail: the press only selects; a Ctrl-drag from a grouped card does not move it (a card outside a group does).
      const card = event.button === 0 && document.elementsFromPoint(event.clientX, event.clientY).find(node => node.matches('[data-block-id]'));
      if (card) { select(card.dataset.blockId, event); return; }
      startMarquee(event, event.shiftKey);
      return;
    }
    // The middle button pans, whatever tool is armed.
    if (event.button === 1) { pan(event); return; }
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
    // A deliberate click on empty canvas is where Ctrl/Cmd+K with nothing selected adds (owner brief 2026-10-13,
    // creation §3). Pointer movement alone never is.
    if (tool === 'select' && !event.shiftKey) lastEmptyClick.current = local(event);
    if (tool === 'select') { startMarquee(event, event.shiftKey); return; }
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
      if (lockedRef.current.has(id)) continue; // a locked object keeps its place, whatever moves around it
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
  const resizeCard = (id, w, h, x, minimum, quiet = false) => {
    if (readOnly || lockedRef.current.has(id)) return;
    if (!quiet) snapshot();
    setBlocks(previous => previous.map(block => block.id === id ? resizeCardLayout(block, w, h, x, minimum) : block));
  };
  const setCardLayout = (id, mode) => {
    if (readOnly || lockedRef.current.has(id) || selection.length !== 1) return;
    const block = blocksRef.current.find(value => value.id === id); if (!supportsCardLayout(block) || (block.cardLayout?.mode || 'scrollable') === mode) return;
    const box = measureNow()[id]; if (!box) return;
    snapshot(); setBlocks(previous => previous.map(value => value.id === id ? switchCardLayout(value, mode, box) : value));
  };
  // A card that takes a scene highlight takes it from every other card (EXP-T27: one owner).
  const putBlock = (previous, updated) => {
    const next = previous.map(block => block.id === updated.id ? updated : block);
    return holdsSceneHighlight(updated) ? releaseSceneHighlights(next, [updated.id]) : next;
  };
  const changeBlock = updated => {
    snapshot();
    setBlocks(previous => putBlock(previous, updated));
    // A paper card's page is what the tutor is told, the way a wiki card's
    // section is.
    if (updated.type === 'paper' && updated.paper?.id) onPaperRef.current?.({ id: updated.id, paperId: updated.paper.id, page: updated.paper.page || 1, title: updated.title });
  };
  // A continuous gesture must not snapshot: one scrub drag would evict the whole
  // 100-entry undo ring. Same reasoning as moveBlock, which has never snapshotted.
  const changeBlockQuietly = updated => setBlocks(previous => putBlock(previous, updated));
  // A style press sets the default for the next thing drawn, and restyles
  // whatever is selected. Connectors only carry a colour.
  // quiet: a slider's drag, whose one undo step was taken when it started.
  // While a text edit is open, its undo step (opened when typing started) covers the change: one gesture, one step.
  const applyStyle = (patch, targets, quiet = false) => {
    if (!targets.length) return;
    if (!quiet && (!editorRef.current || editorRef.current.state().code)) snapshot();
    const lists = markLists();
    // Words keep their own colour (docs/features/canvas-editing.md): a shape or line whose text followed its stroke takes
    // that colour as its text colour before the stroke changes, so a new outline never recolours the words.
    const keepWords = entry => (patch.color && !entry.textColor && (entry.text || entry.label) ? { textColor: entry.color || COLORS[0] } : {});
    lists.setShapes(previous => previous.map(shape => targets.includes(shape.id) ? { ...shape, ...keepWords(shape), ...patch } : shape));
    lists.setItems(previous => previous.map(item => targets.includes(item.id) ? { ...item, ...patch } : item));
    const linkPatch = Object.fromEntries(Object.entries(patch).filter(([key]) => ['color', 'startHead', 'endHead'].includes(key)));
    if (Object.keys(linkPatch).length) setLinks(previous => previous.map(link => targets.includes(link.id) ? { ...link, ...keepWords(link), ...linkPatch } : link));
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
  // how: 'front', 'back' (all the way), 'forward', 'backward' (one step) - within the shapes' layer and the notes'.
  const reorderSelection = (how, targets) => {
    targets = targets.filter(id => !lockedRef.current.has(id));
    if (!targets.length) return;
    snapshot();
    const lists = markLists();
    const order = list => (how === 'front' || how === 'back' ? reorder(list, targets, how === 'front') : reorderStep(list, targets, how === 'forward'));
    lists.setShapes(order);
    lists.setItems(order);
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
    if (!surface.current) return { x: -view.x / view.z, y: -view.y / view.z };
    // The middle of what the floating controls leave (controlArea).
    const area = controlArea();
    return { x: ((area.left + area.right) / 2 - view.x) / view.z, y: ((area.top + area.bottom) / 2 - view.y) / view.z };
  };
  // The column slot nearest the middle of the screen: before the first card
  // whose middle is below the screen's middle.
  const flowIndexAtView = () => flowIndexAt(viewCenter().y);
  // The column slot at a height in the world (a drop point's), as flowIndexAtView finds the screen's middle. Never between a
  // PDF page and its label (pairStart).
  const flowIndexAt = y => {
    const list = blocksRef.current;
    const at = list.findIndex(block => { const box = boundsRef.current[block.id]; return box && box.y + box.h / 2 > y; });
    return pairStart(list, at < 0 ? list.length : at);
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
  // Open in notebook: a new notebook card from one code card, beside it in free space - placeNote and its obstacles
  // (inlineCanvas.obstacles: obstaclesOf), the inline editor's, so nothing else moves - selected, and panned to when the
  // spot is off-screen, as the editor's ghost is; one undo step. The code card is left as it is.
  const openInNotebook = id => {
    if (editorRef.current) flushSync(() => editorRef.current.commit('blur'));
    const code = blocksRef.current.find(entry => entry.id === id);
    const made = notebookFromCode(code || itemsRef.current.find(entry => entry.id === id))?.block;
    const target = boxesOf([id])[0];
    if (!made || !target || readOnlyRef.current) return null;
    // NotebookCard's opening size. It joins the end of the column (gap-5, a wide card centred on it, as insertBlock's)
    // and is drawn at the placed spot by its offset from there.
    const size = { w: 640, h: 540 };
    const spot = placeNote(target, size, [...inlineCanvas.obstacles([id]), ...placementChrome()], inlineCanvas.visibleWorld());
    const col = column.current, flowY = (col?.offsetHeight || 0) + (col?.children.length ? 20 : 0);
    const added = { ...made, dx: Math.round(spot.x - (COLUMN - size.w) / 2), dy: Math.round(spot.y - flowY) };
    snapshot();
    perfMark(added.id, 'insert');
    setBlocks(previous => [...previous, added]);
    setSelection([added.id]);
    if (spot.offscreen) inlineCanvas.reveal({ x: spot.x, y: spot.y, ...size });
    return added.id;
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
  // The document (docs/features/blocknote-canvas.md): a portrait sheet in world units on the canvas, framed at its start.
  // Framing reads the free part of the surface (visibleArea: less the chat sheet and the contents rail) and keeps a zoom that
  // reads well - 100%, less only when the sheet would not fit across - never a zoom-out to fit a long document's height.
  const docFrame = target => {
    const element = surface.current;
    if (!element || !target) return;
    const area = visibleArea(), span = Math.max(240, area.right - area.left);
    const z = Math.max(0.3, Math.min(1, (span - 48) / target.w));
    autoView.current = { x: area.left + (span - target.w * z) / 2 - target.x * z, y: area.top + 32 - target.y * z, z };
    setGlide(true);
    setView(autoView.current);
  };
  const goToDoc = () => docFrame(docRef.current);
  // First opening: the sheet goes where the learner is looking, across the middle of the free view, its top just below the
  // top edge; when cards, shapes, notes or ink already sit there, beside them to the right instead - nothing existing moves.
  const placeDoc = () => {
    const element = surface.current;
    if (!element) return null;
    const area = visibleArea(), v = viewRef.current;
    const left = (area.left - v.x) / v.z, top = (area.top - v.y) / v.z, span = (area.right - area.left) / v.z, tall = (area.bottom - area.top) / v.z;
    const sheet = { x: Math.round(left + span / 2 - DOC_W / 2), y: Math.round(top + 32 / v.z), w: DOC_W, h: Math.max(DOC_MIN_H, tall) };
    const hits = box => box.w > 0 && box.h > 0 && box.x < sheet.x + sheet.w && box.x + box.w > sheet.x && box.y < sheet.y + sheet.h && box.y + box.h > sheet.y;
    for (let i = 0; i < 50; i += 1) {
      const blocking = contentBoxes().filter(hits);
      if (!blocking.length) break;
      sheet.x = Math.round(Math.max(...blocking.map(box => box.x + box.w)) + 80);
    }
    return { v: 1, x: sheet.x, y: sheet.y, w: DOC_W, blocks: [] };
  };
  // Editor view on a canvas with no document yet: one empty sheet, placed once (its world position is saved), then framed.
  // Only after the page has the board's saved copy (docReady), so an empty sheet is never made over one still loading.
  useEffect(() => {
    if (docView !== 'editor' || doc || readOnly || localCopy || !docReady || docError) return;
    const fresh = placeDoc();
    if (!fresh) return;
    docLive.current = fresh.blocks;
    setDoc(fresh);
    requestAnimationFrame(() => docFrame(fresh));
  }, [docView, doc, readOnly, docReady, docError]); // eslint-disable-line react-hooks/exhaustive-deps
  // Typing near the bottom (or the top) of the view keeps the caret on screen, through the canvas camera.
  const docCaret = box => {
    const element = surface.current;
    if (!element || !document.activeElement?.closest?.('[data-canvas-doc]')) return;
    // A reveal scroll of the surface not yet turned into a camera move (its scroll event can come after this frame) is taken
    // first: the pan keeps the caret where it is on screen, so box still holds, and the late scroll event finds nothing to do.
    if (element.scrollLeft || element.scrollTop) {
      const dx = element.scrollLeft, dy = element.scrollTop;
      element.scrollLeft = 0; element.scrollTop = 0;
      flushSync(() => setView(v => (autoView.current = { ...v, x: v.x - dx, y: v.y - dy })));
    }
    const frame = element.getBoundingClientRect(), bottom = Math.min(frame.bottom, frame.top + chromeTop(0, frame.width)) - 48, top = frame.top + controlArea().top + 48;
    const by = box.bottom > bottom ? bottom - box.bottom : box.top < top ? top - box.top : 0;
    if (by) setView(v => (autoView.current = { ...v, y: v.y + by }));
  };
  const paperRef = useRef(null);
  // The document's box in world units, the one source for its footprint (blocknote-layers-minimap.md section 3): its saved
  // x, y and width, and the paper's measured height (at least DOC_MIN_H, empty or not), in Editor view only. The height comes
  // from one ResizeObserver, set only when it changes (a new line, not a key), and is never saved with the board.
  const [docH, setDocH] = useState(DOC_MIN_H);
  const docBox = doc && docView === 'editor' ? { x: doc.x, y: doc.y, w: doc.w, h: docH } : null;
  const docBoxRef = useRef(docBox);
  docBoxRef.current = docBox;
  const docShown = !!doc && docView === 'editor';
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return undefined;
    const observer = new ResizeObserver(() => setDocH(Math.max(DOC_MIN_H, paper.offsetHeight)));
    observer.observe(paper);
    return () => observer.disconnect();
  }, [docShown]);
  const [docMounted, setDocMounted] = useState(false);
  const [docEpoch, setDocEpoch] = useState(0);
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
  // A text box or note's edit ends (RichText onCommit): its words and formatting saved as one undo step - the edit's, or
  // for a fresh box its placement's. Code mode keeps the text formatting aside, carried over onto the edited words.
  const commitItemText = (id, runs, how, codeGuard = null) => {
    const before = present.current.items.find(item => item.id === id);
    if (!before) return;
    if (codeGuard && (readOnlyRef.current || lockedRef.current.has(id) || (before.text || '') !== codeGuard.expectedText)) return false;
    const patch = before.mode === 'code'
      ? { text: plainOf(runs), runs: compactRuns(reconcileRuns(runsOf(before), plainOf(runs))) || undefined }
      : textPatch(runs);
    const changed = patch.text !== (before.text || '') || JSON.stringify(patch.runs || null) !== JSON.stringify(before.runs || null);
    if (changed && !editStep.current?.entry && !before.fresh) snapshot();
    if (changed || before.fresh) setItems(previous => previous.map(item => item.id === id ? { ...item, ...patch, fresh: false } : item));
    endEdit(changed, 'items');
    // Esc or Ctrl/Cmd+Enter finish typing and leave the box selected, as Excalidraw does.
    if (how !== 'blur') { selectedRef.current = [id]; setSelection([id]); }
  };
  // An equation's edit ends with its source. A fresh one is still its placement's undo step; one left empty goes.
  const [equationDraft,setEquationDraft]=useState(null);
  const equationDraftRef=useRef(null);equationDraftRef.current=equationDraft;
  const equationCandidates=useRef(new Map());
  const finishEquation = (id, latex) => {
    if(readOnlyRef.current||lockedRef.current.has(id))return false;
    if(equationDraftRef.current?.id===id){const draft=equationDraftRef.current;if(latex&&!readOnlyRef.current){snapshot();setItems(previous=>[...previous,{...draft,latex,fresh:false}]);}setEquationDraft(null);return;}
    const before = present.current.items.find(item => item.id === id);
    if (!before) return;
    if (!latex) { if (before.fresh) setItems(previous => previous.filter(item => item.id !== id)); else deleteItem(id); return; }
    if (!before.fresh && before.latex !== latex) snapshot();
    setItems(previous => previous.map(item => item.id === id ? { ...item, latex, fresh: false } : item));
  };
  const equationGeneration=item=>!inlineAiRef.current||readOnly||item.locked||lockedRef.current.has(item.id)?null:{
    scopeKey:`${inlineKey.current}:${item.id}`,mode:equationDraft?.id===item.id?'insert':'replace',
    onGenerate:async({prompt,requestId,signal,latex})=>{
      if(readOnlyRef.current)throw new Error('This canvas is read-only.');
      const key=inlineKey.current,config=inlineAiRef.current,live={...inlineBoard(),boxes:inlineCanvas.layout()},original=live.items.find(entry=>entry.id===item.id),draft=equationDraftRef.current?.id===item.id;
      if(!draft&&(!original||original.locked||lockedRef.current.has(item.id)))throw new Error('The equation is unavailable.');
      const options={cache:inlineCache.current,boardKey:key,describeCard:describeObject,request:prompt,extras:config.extras?.()||{}};
      const context=draft?buildCreationContext(live,{x:item.x,y:item.y},options):buildContext(live,freezeTarget(live,[item.id]),options);
      if(!draft)context.target.objects=context.target.objects.map(entry=>entry.id===item.id?{...entry,text:latex}:entry);
      const request=draft?{kind:'creation',mode:'explain',output:'equation',anchor:{x:item.x,y:item.y},region:'',prompt,context}:{kind:'selection',mode:'edit',targetIds:[item.id],prompt,context};
      const decision=await config.transport.decide({requestId,request,enabled:[...(config.enabled||[]),'equation']},{signal});
      if(signal.aborted)throw new DOMException('Cancelled','AbortError');
      if(decision.decision==='clarify')return{result:{kind:'clarify',question:decision.message}};
      if(decision.decision!=='proceed')throw new Error(decision.message||decision.error||'The equation request could not proceed.');
      const answer=await config.transport.generate({requestId,request,token:decision.token},{signal,onEvent:()=>{}});
      if(signal.aborted||inlineKey.current!==key||readOnlyRef.current||lockedRef.current.has(item.id))throw new DOMException('Cancelled','AbortError');
      if(answer.result?.kind==='equation')equationCandidates.current.set(item.id,{key,requestId,frozen:original?structuredClone(original):null,point:{x:item.x,y:item.y}});
      return answer;
    },
    onAccept:result=>{
      const record=equationCandidates.current.get(item.id);if(!record||record.key!==inlineKey.current)return{ok:false,error:'Request a new equation preview.'};
      const live=inlineBoard(),made=equationTransaction(result,{item:record.frozen?live.items.find(entry=>entry.id===item.id):null,frozen:record.frozen,point:record.point,requestId:record.requestId,readOnly:readOnlyRef.current,taken:live.items.map(entry=>entry.id)});
      if(!made.ok)return made;if(!applyInline(made.tx,record.requestId,()=>{}))return{ok:false,error:'This canvas closed.'};
      equationCandidates.current.delete(item.id);if(equationDraftRef.current?.id===item.id)setEquationDraft(null);return{ok:true};
    },
  };
  const patchItem = (id, patch) => setItems(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  const deleteItem = id => { snapshot(); setItems(previous => previous.filter(item => item.id !== id)); setShapes(previous => previous.filter(shape => shape.id !== id)); setLinks(previous => previous.filter(link => link.from !== id && link.to !== id)); setSelection(previous => previous.filter(other => other !== id)); };
  const [editingShape, setEditingShape] = useState(null);
  // The line (connector or drawn arrow) whose label is being written.
  const [editingLabel, setEditingLabel] = useState(null);
  const startLabel = id => { if (lockedRef.current.has(id)) return; beginEdit(id); setEditingLabel(id); };
  const startShapeText = (id, point = null) => { if (lockedRef.current.has(id)) return; beginEdit(id); setEditPoint(point); setEditingShape(id); };
  // A line's label and a shape's words end their edit the same way a text box does.
  const changeLabel = (id, runs, how) => {
    setEditingLabel(null);
    const before = [...present.current.links, ...present.current.shapes].find(entry => entry.id === id);
    if (!before) return;
    const { text, runs: kept } = textPatch(runs);
    const changed = text !== (before.label || '') || JSON.stringify(kept || null) !== JSON.stringify(before.runs || null);
    if (changed) {
      if (!editStep.current) snapshot();
      const patch = entry => entry.id === id ? { ...entry, label: text, runs: kept } : entry;
      setLinks(previous => previous.map(patch));
      setShapes(previous => previous.map(patch));
    }
    endEdit(changed, present.current.links.some(link => link.id === id) ? 'links' : 'shapes');
    if (how !== 'blur') { selectedRef.current = [id]; setSelection([id]); }
  };
  const changeShapeText = (id, runs, how) => {
    setEditingShape(null);
    setEditPoint(null);
    const before = present.current.shapes.find(shape => shape.id === id);
    if (!before) return;
    const { text, runs: kept } = textPatch(runs);
    const changed = text !== (before.text || '') || JSON.stringify(kept || null) !== JSON.stringify(before.runs || null);
    if (changed) {
      if (!editStep.current) snapshot();
      setShapes(previous => previous.map(shape => shape.id === id ? { ...shape, text, runs: kept } : shape));
    }
    endEdit(changed, 'shapes');
    if (how !== 'blur') { selectedRef.current = [id]; setSelection([id]); }
  };
  // Words that need more room than their shape: it grows downward (its top and width stay), inside the current step.
  const growShape = (id, height) => setShapes(previous => previous.map(shape => {
    if (shape.id !== id || Math.abs(shape.y2 - shape.y1) >= height) return shape;
    const top = Math.min(shape.y1, shape.y2);
    return shape.y2 >= shape.y1 ? { ...shape, y2: top + height } : { ...shape, y1: top + height };
  }));
  const resizeShape = (id, patch) => setShapes(previous => previous.map(shape => shape.id === id ? { ...shape, ...patch } : shape));
  const moveShapeStart = (event, shape) => {
    // Pressing a shape that is already selected reopens its style panel too.
    setStyleOpen(null);
    // Alt/Option on the body drags a copy away (a handle's Alt resizes from the centre instead).
    if (event.altKey) { altDrag(shape.id, event); return; }
    // The undo step is taken on the first real movement: a click that only selects leaves none.
    let stepped = false;
    const step = () => { if (!stepped) { stepped = true; snapshot(); } };
    // A shape inside a selection drags the whole selection, the way cards do.
    const targets = groupTargets(shape.id);
    if (targets.length > 1) {
      let last = { x: shape.x1, y: shape.y1 };
      startDrag(event, { x: shape.x1, y: shape.y1 }, (x, y) => {
        step();
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
      step();
      const dx = x - shape.x1, dy = y - shape.y1;
      setShapes(previous => previous.map(s => s.id === shape.id ? { ...s, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy } : s));
    }, view.z, makeSnap([shape.id], size, base));
  };
  const inking = tool === 'pen' || tool === 'highlighter';
  const drawing = inking || shapeTool;
  // Ask about selection: the crosshair wins over every card's own cursor, slides included.
  // Select keeps the plain arrow (owner brief 2); only the Hand and Space+drag show the open hand, grabbing while held.
  const cursor = spacePan ? 'cursor-grab active:cursor-grabbing [&_*]:!cursor-grab' : tool === 'askArea' ? 'cursor-crosshair [&_*]:!cursor-crosshair' : tool === 'hand' ? 'cursor-grab active:cursor-grabbing' : inking || tool === 'eraser' || shapeTool ? 'cursor-crosshair' : tool === 'select' ? 'cursor-default' : 'cursor-copy';
  // The rail answers to the blank canvas right of the column, where its buttons
  // live; over the cards themselves it would only be in the way. Held by index
  // rather than by value so the line keeps following the cards as they move.
  // With a sketch as the target, the style panel follows the sketch's selection and restyles its marks.
  const sketchMarks = drawTarget ? blocks.find(block => block.id === drawTarget)?.sketch : null;
  const editingId = editStep.current?.id || editingShape || editingLabel || null;
  const panel = drawTarget
    ? panelFor({ tool, selection: sketchSel, shapes: sketchMarks?.shapes || [], links: [], items: sketchMarks?.items || [], editing: sketchEdit?.id || null })
    : panelFor({ tool, selection, shapes, links, items, editing: editingId, units, locked: [...lockedIds] });
  const showStyle = styleOpen === null ? panel.open : styleOpen;
  // What the panel shows: the selection's own values, 'mixed' where it disagrees, else the armed defaults
  // (docs/features/canvas-editing.md). The open editor's characters win for the text controls.
  const markShapes = drawTarget ? sketchMarks?.shapes || [] : shapes, markItems = drawTarget ? sketchMarks?.items || [] : items;
  const entryOf = id => markShapes.find(entry => entry.id === id) || markItems.find(entry => entry.id === id) || (drawTarget ? null : links.find(entry => entry.id === id)) || null;
  const isLink = entry => !!entry && entry.from !== undefined;
  const textBaseOf = entry => (isLink(entry) ? labelBase(entry) : entry.kind === 'text' || entry.kind === 'sticky' ? itemBase(entry) : TEXT_BOX[entry.kind] ? shapeBase(entry) : labelBase(entry));
  const common = (entries, read) => { const seen = new Set(entries.map(read)); return seen.size === 1 ? [...seen][0] : seen.size ? 'mixed' : undefined; };
  const styleEntries = panel.targets.map(entryOf).filter(Boolean);
  const textEntries = panel.textTargets.map(entryOf).filter(Boolean);
  const pick = (read, fallback, only = () => true) => { const some = styleEntries.filter(only); return some.length ? common(some, read) : fallback; };
  const editorState = editorRef.current?.state();
  const levelOf = entry => entry.level || 'body';
  const textValue = (key, fallback) => {
    if (editorState) return valueOver(editorState.runs, editorState.from, editorState.to, key, editorState.base, editorState.pending);
    if (textEntries.length) return objectsValue(textEntries, key, textBaseOf);
    return textArm[key] ?? fallback;
  };
  const closed = entry => !!TEXT_BOX[entry.kind];
  const linear = entry => isLink(entry) || ['line', 'arrow', 'curve', 'elbow'].includes(entry.kind);
  const panelValues = {
    color: pick(entry => entry.color || COLORS[0], color),
    stroke: pick(entry => strokeOf(entry, COLORS[0]), panel.noStroke && noStroke ? null : color),
    fill: pick(entry => entry.fill || null, fill, closed),
    fillOpacity: pick(entry => entry.fillOpacity ?? 0.25, fillOpacity, closed),
    width: pick(entry => entry.width ?? WIDTHS[0], width, entry => !isLink(entry)),
    dash: pick(entry => dashStyle(entry.dash), dash, entry => !isLink(entry)),
    opacity: pick(entry => entry.opacity ?? 1, opacity, entry => !isLink(entry)),
    round: pick(entry => !!entry.round, round, entry => entry.kind === 'rect'),
    startHead: pick(entry => headsOf(entry).start, heads.start || 'none', linear),
    endHead: pick(entry => headsOf(entry).end, heads.end || (tool === 'line' ? 'none' : 'arrow'), linear),
    level: textEntries.length ? common(textEntries, levelOf) : level,
    font: textValue('f', 'sans'),
    size: textValue('s', TEXT_LEVELS.find(entry => entry.id === level)?.size || 14),
    b: textValue('b', false), i: textValue('i', false), u: textValue('u', false),
    textColor: textValue('c', color),
    align: textEntries.length ? common(textEntries, entry => entry.align || (entry.kind === 'text' || entry.kind === 'sticky' ? 'left' : 'center')) : textArm.align || 'left',
    valign: textEntries.length ? common(textEntries, entry => entry.valign || 'middle') : 'middle',
    mode: panel.code ? markItems.find(entry => entry.id === panel.code)?.mode || 'text' : 'text',
    lang: codeLang(panel.code ? markItems.find(entry => entry.id === panel.code) : null),
  };
  // Text formatting: the open editor's characters (a range, or what the caret types next), else every selected object
  // that holds words, else the armed default. A text box's colour is its words' colour (its `color`).
  const formatEntry = (entry, key, value) => (entry.kind === 'text' && key === 'c' ? { ...formatObject(entry, 'c', null), color: value } : formatObject(entry, key, value));
  const formatText = (key, value) => {
    setTextArm(previous => ({ ...previous, [key]: value }));
    const editor = editorRef.current;
    if (editor && !editor.state().code) { editor.format(key, value); return; }
    const ids = panel.textTargets;
    if (!ids.length) return;
    if (!editorRef.current || editorRef.current.state().code) snapshot();
    const apply = entry => (ids.includes(entry.id) ? formatEntry(entry, key, value) : entry);
    const lists = markLists();
    lists.setShapes(previous => previous.map(apply));
    lists.setItems(previous => previous.map(apply));
    if (!drawTarget) setLinks(previous => previous.map(apply));
  };
  // Alignment is the object's (a paragraph setting), even while its words are being edited.
  const patchText = patch => {
    const ids = panel.textTargets;
    if (!ids.length) return;
    if (!editorRef.current || editorRef.current.state().code) snapshot();
    const apply = entry => (ids.includes(entry.id) ? { ...entry, ...patch } : entry);
    const lists = markLists();
    lists.setShapes(previous => previous.map(apply));
    lists.setItems(previous => previous.map(apply));
    if (!drawTarget) setLinks(previous => previous.map(apply));
  };
  const panelOn = {
    // A panel field is done (Enter, Esc, a picked colour): focus goes back to the open text, else to the canvas, so the
    // next shortcut reaches the canvas rather than the field.
    refocus: () => { if (editorRef.current) editorRef.current.refocus(); else if (document.activeElement?.closest?.('[data-style-panel]')) document.activeElement.blur(); },
    start: () => snapshot(),
    // null is No stroke: only a closed shape can have none (the swatch shows for nothing else).
    color: value => { if (value !== null) setColor(value); if (panel.noStroke) setNoStroke(value === null); applyStyle(strokePatch(value), value === null ? panel.targets.filter(id => closed(entryOf(id) || {})) : panel.targets); },
    fill: value => { setFill(value); applyStyle({ fill: value, ...(value ? { fillOpacity: panelValues.fillOpacity === 'mixed' ? 0.25 : panelValues.fillOpacity ?? 0.25 } : {}) }, panel.targets.filter(id => closed(entryOf(id) || {}))); },
    fillOpacity: value => { setFillOpacity(value); applyStyle({ fillOpacity: value }, panel.targets.filter(id => closed(entryOf(id) || {})), true); },
    width: value => { setWidth(value); applyStyle({ width: value }, panel.targets); },
    dash: value => { setDash(value); applyStyle({ dash: value }, panel.targets); },
    opacity: value => { setOpacity(value); applyStyle({ opacity: value }, panel.targets); },
    opacitySlide: value => { setOpacity(value); applyStyle({ opacity: value }, panel.targets, true); },
    round: value => { setRound(value); applyStyle({ round: value }, panel.targets); },
    head: (end, kind) => { setHeads(previous => ({ ...previous, [end]: kind })); applyStyle({ [`${end}Head`]: kind }, panel.targets.filter(id => linear(entryOf(id) || {}))); },
    route: value => {
      setConnectorRoute(value);
      if (!panel.targets.length) return;
      snapshot();
      setLinks(previous => previous.map(link => panel.targets.includes(link.id) ? { ...link, route: value } : link));
      markLists().setShapes(previous => previous.map(shape => panel.targets.includes(shape.id) && shape.kind !== 'line' ? { ...shape, kind: ARROW_KINDS[value] } : shape));
    },
    level: value => applyLevel(panel.textTargets.length ? panel.textTargets : panel.targets, value),
    font: value => formatText('f', value),
    size: value => formatText('s', validSize(value)),
    toggle: key => {
      const editor = editorRef.current;
      if (editor && !editor.state().code) { editor.toggle(key); setTextArm(previous => ({ ...previous, [key]: panelValues[key] !== true })); return; }
      formatText(key, panelValues[key] !== true);
    },
    textColor: value => formatText('c', value),
    align: value => { setTextArm(previous => ({ ...previous, align: value })); patchText({ align: value }); },
    valign: value => patchText({ valign: value }),
    mode: value => panel.code && setTextMode(panel.code, value),
    lang: value => panel.code && setCodeLang(panel.code, value),
    order: how => reorderSelection(how, panel.targets),
    arrange, group: groupSelection, ungroup: ungroupSelection,
    lock: lockSelection, copyStyle: copyStyleCommand, pasteStyle: pasteStyleCommand,
  };
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
    ...(docBox ? [{ ...docBox, doc: true }] : []),
    ...Object.entries(bounds).map(([id, box]) => (divePortals?.portals?.[id] ? { ...box, hole: true } : box)),
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
    // Never over an object, never while something is selected (owner, 2026-10-13): the rail is for blank canvas.
    if (selectedRef.current.length || event.target.closest?.('[data-item-id],[data-block-id],[data-shape-id],[data-connection]')) return setHoverGap(null);
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
  // The selection action bar's anchor (SelectionActions.jsx): the selection's box in the surface's pixels. A lone empty text box has
  // nothing to add, so it gets none.
  // A whole group's box is its outline with the name chip's row, so the bar sits above the chip, never over it: the chip keeps
  // its press, its rename and its right-click menu (Add comment).
  const emptyText = id => { const entry = items.find(item => item.id === id); return !!entry && entry.kind !== 'equation' && !String(entry.text || '').trim(); };
  const barBoxes = boxesOf(selection);
  if (selectedGroup && barBoxes.length) {
    const { left, top, right, bottom } = anchorOf(barBoxes, { x: 0, y: 0, z: 1 });
    barBoxes.push({ x: left - GROUP_PAD, y: top - GROUP_PAD - GROUP_CHIP, w: right - left + GROUP_PAD * 2, h: bottom - top + GROUP_PAD * 2 + GROUP_CHIP });
  }
  const barAnchor = tool === 'select' && selection.some(id => !emptyText(id)) ? anchorOf(barBoxes, view) : null;
  // The room it may use ends where the bottom chrome (zoom, composer) begins, under the bar's width.
  const barBox = { w: surface.current?.clientWidth || 1200, h: surface.current && barAnchor ? chromeTop(barAnchor.right - 300, barAnchor.right) : 800 };
  // hasPin(id): the object shows a comment pin at its top centre (CommentPins, owner 2026-10-21), so it takes the floating bar
  // and its top connect port steps aside for the pin.
  // ---------- UI-25 canvas actions (canvas-actions.js; contract C:/s/spec/share/contract-actions.md) ----------
  // What each id is: a card (block or chat card), an item, a shape or a connector.
  const menuObject = id => {
    const block = blocksRef.current.find(entry => entry.id === id);
    if (block) return { object: block, family: 'block' };
    const chat = exchangesRef.current.find(entry => entry.id === id);
    if (chat) return { object: chat, family: 'chat' };
    const item = itemsRef.current.find(entry => entry.id === id);
    if (item) return { object: item, family: 'item' };
    const shape = shapesRef.current.find(entry => entry.id === id);
    if (shape) return { object: shape, family: 'shape' };
    const link = present.current.links.find(entry => entry.id === id);
    return link ? { object: link, family: 'link' } : null;
  };
  const menuModel = (extra = {}) => ({
    selection: selectedRef.current, objectOf: menuObject, groupOf, membersOf,
    // A text selection, captured at open: the menu's focus must not lose it (brief section 1).
    selectedText: () => {
      const picked = window.getSelection();
      if (!picked || picked.isCollapsed || !picked.toString().trim()) return null;
      const node = picked.anchorNode;
      return { text: picked.toString(), node: node?.nodeType === 1 ? node : node?.parentElement };
    },
    ...extra,
    point: extra.screen ? { x: (extra.screen.x - viewRef.current.x) / viewRef.current.z, y: (extra.screen.y - viewRef.current.y) / viewRef.current.z } : null,
  });
  const portalOf = id => divePortals?.portals?.[id];
  // A shared canvas (view-only, or the visitor's local copy): Start Rabbit Hole is the visitor's own, through the page.
  const visiting = readOnly || localCopy;
  const rabbitHoleHere = !!(divePortals?.open && !visiting) || !!(visiting && onStartRabbitHole);
  // Who is acting, for S1's can(): the page's ctx (SharedBoardPage builds it from the server's access), else the owner on
  // their own canvas, or a viewer of a view-only board.
  const commentCtx = onAddComment ? { read: true, post: true } : null;
  const permissionCtx = permissions || (visiting ? { role: 'viewer', shared: true, comments: commentCtx } : { role: 'owner', shared: false, comments: commentCtx });
  // The handler context every row runs with (contract section 7), asking S1's can() (canvas-permissions.js).
  // A blob to the person's disk, as the cards' own Download links save it.
  const saveFile = (blob, name) => { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const actionCtx = {
    // A board that cannot be edited at all (view-only, no local copy) refuses every edit, whatever the role allows.
    can: capability => (readOnly && !localCopy && VIEW_ONLY_HIDDEN.has(capability) ? { allowed: false, hidden: true, reason: 'View only' } : permit(capability, permissionCtx)),
    readOnly,
    familyOf: id => menuObject(id)?.family || null,
    groupOf, locked: id => lockedRef.current.has(id), lockable,
    commands: commandsRef.current || {},
    canvas: {
      select: ids => { selectedRef.current = ids; setSelection(ids); },
      canStartRabbitHole: id => rabbitHoleHere && rabbitHoleTarget(blocksRef.current.find(block => block.id === id)),
      // Your canvas: the card's Rabbit Hole, entered when it has one and made first otherwise (Dive.jsx); a view-only
      // board: the viewer's own private Rabbit Hole (shared-canvas-rabbit-hole.md).
      startRabbitHole: id => (visiting ? onStartRabbitHole(id) : portalOf(id) ? divePortals.enter(portalOf(id).name) : divePortals.open(id, undefined, 'learner_menu')),
      addComment: onAddComment ? (point, on) => commentAt(point, on) : null,
      linkCanvas: onLinkCanvas ? arg => onLinkCanvas(arg) : null,
      // A visitor's local copy renames no card (SHARE-02: titles are the source's).
      renamable: object => !localCopy && renamable(object),
      rename: id => { const block = blocksRef.current.find(entry => entry.id === id); if (block) setRenaming({ id, title: block.title, rect: document.querySelector(`[data-block-id="${CSS.escape(id)}"]`)?.getBoundingClientRect() }); },
      renameGroup: gid => setChipEdit(gid),
      describable: target => target.ids.length > 0 && (!!chatWorkspace || target.objects.some(object => object && describeObject(object))),
      addToChat: options => addToChat(options),
      quickEdit: inlineAi && !visiting ? () => openInline(performance.now(), false, 'edit') : null,
      copyText: text => navigator.clipboard?.writeText(text),
      copyable: ids => ids.some(id => ['block', 'chat', 'item', 'shape'].includes(menuObject(id)?.family)),
      // Every member, so a mixed selection never restyles some objects and silently skips the cards (brief section 3).
      styleable: ids => ids.length > 0 && ids.every(id => { const found = menuObject(id); return !!found && (found.family === 'link' || found.family === 'shape' || (found.family === 'item' && found.object.kind !== 'section')); }),
      canPaste, canPasteStyle,
      zoomToSelection,
      supportsCardLayout: object => !!object && supportsCardLayout(object),
      fullContent: object => object?.cardLayout?.mode === 'full',
      setCardLayout: (id, mode) => setCardLayout(id, mode),
      cardAction: onCardActionRef.current ? (name, payload) => onCardActionRef.current?.(name, payload) : null,
      attached: sourceId => (attachedIds ? attachedIds.includes(sourceId) : true),
      openUrl: url => window.open(url, '_blank', 'noopener'),
      reader: object => { const reader = openTarget(object, { readers: true }); return reader?.kind === 'reader' ? reader : null; },
      notebookFrom: object => notebookFromCode(object),
      openInNotebook: id => openInNotebook(id),
      cadArtifact: (object, format) => cadArtifact(object.manifest, format),
      downloadCad: (object, format) => downloadCadArtifact(cadArtifact(object.manifest, format), cadCanMutate(object, readOnly)).catch(problem => toast(problem.message, { tone: 'error' })),
      toggleDone: id => { snapshot(); setBlocks(previous => previous.map(entry => entry.id === id ? { ...entry, done: !entry.done } : entry)); },
      presentFrom: id => presentFrom(id),
      // Pin for study (UI-27): the owner's page makes the clicked card its pinned reference; absent elsewhere, so the row hides.
      pinForStudy: onPinForStudy ? id => onPinForStudy(id) : null,
      // A row S1 answers with signIn: the page's sign-in, keeping the draft and selection (false: none here, the reason shows).
      // Start Rabbit Hole's own flow (the page's onStartRabbitHole) already asks a guest to sign in and keeps the card.
      signIn: (capability, target) => {
        if (capability === 'canvas.child' && visiting && onStartRabbitHole && target.id) { onStartRabbitHole(target.id); return true; }
        if (onSignIn) { onSignIn(capability, target); return true; }
        return false;
      },
      toast,
      // Per-type rows (canvas-actions-types.js, lane U2): the card's own handlers.
      appName,
      edit: id => commandsRef.current.editSelected(id),
      editEquation: id => setEditTarget({ id, n: Date.now() }),
      patchItem: (id, patch) => { snapshot(); patchItem(id, patch); },
      updateBlock: (id, patch) => { snapshot(); setBlocks(previous => previous.map(entry => (entry.id === id ? { ...entry, ...patch } : entry))); },
      openStyle: () => setStyleOpen(true),
      insertText: at => commandsRef.current.insertText(at),
      insertSticky: at => commandsRef.current.insertSticky(at),
      downloadText: (name, text, type) => saveFile(new Blob([text], { type }), name),
      downloadUrl: (url, name) => fetch(url, { headers: wsHeaders() }).then(response => (response.ok ? response.blob() : Promise.reject(new Error(`Download failed (${response.status})`))))
        .then(blob => saveFile(blob, name)).catch(problem => toast(problem.message, { tone: 'error' })),
      // The bytes the card's own Download reads (media-storage.js), saved as a file that can never render in the page.
      downloadOriginal: object => loadMediaOriginal(object).then(value => (value && typeof value !== 'string'
        ? saveFile(new Blob([value], { type: 'application/octet-stream' }), object.label || 'file')
        : toast('This file is not in this browser or saved with the board yet.'))),
    },
  };
  const actionCtxRef = useRef(actionCtx);
  actionCtxRef.current = actionCtx;
  // Open the menu on `target`: what was clicked becomes the selection (the empty canvas clears it), so no row can act on
  // an older selection. A target with no rows (a view-only board's empty canvas) opens nothing.
  const openMenu = target => {
    const rows = actionsFor(target, actionCtx);
    if (!rows.length) { setMenuAt(null); return; }
    if (target.kind === 'canvas') { if (selectedRef.current.length) setSelected(null); }
    else if (target.id && !selectedRef.current.includes(target.id)) select(target.id);
    else if (!target.id && target.group) setSelection(target.ids);
    setMenuAt({ x: target.screen.x, y: target.screen.y, target, back: document.activeElement });
  };
  // Shift+F10 or the menu key with the canvas holding the keyboard: the selection's menu, beside its first object.
  const openKeyMenu = () => {
    const ids = selectedRef.current, box = boxesOf(ids)[0], area = surface.current;
    if (!area) return;
    const v = viewRef.current;
    const screen = box ? { x: box.x * v.z + v.x + 12, y: box.y * v.z + v.y + 12 } : { x: area.clientWidth / 2, y: area.clientHeight / 2 };
    openMenu(selectionTarget(menuModel({ screen })));
  };
  const openKeyMenuRef = useRef(openKeyMenu);
  openKeyMenuRef.current = openKeyMenu;
  const pickMenu = id => {
    const target = menuAt.target;
    setMenuAt(null);
    const done = runAction(id, target, actionCtx);
    if (!done.ran && done.reason) toast(done.reason);
  };
  // Escape or Tab gives the focus back to what had it at open (the card, for Shift+F10), else to the clicked card.
  const closeMenu = byKey => {
    const opened = menuAt;
    setMenuAt(null);
    if (!byKey || !opened) return;
    const back = opened.back && opened.back !== document.body && opened.back.isConnected ? opened.back
      : opened.target.id ? surface.current?.querySelector(`[data-block-id="${CSS.escape(opened.target.id)}"]`) : null;
    back?.focus?.({ preventScroll: true });
  };
  // A keyboard shortcut runs the same row as the menu (contract section 5), on the selection.
  const keyAction = id => {
    const done = runAction(id, selectionTarget(menuModel()), actionCtxRef.current);
    if (!done.ran && done.reason) toast(id === 'delete' && done.reason === 'Locked' ? 'Locked objects stay. Unlock them to delete.' : done.reason);
    return done;
  };
  const keyActionRef = useRef(keyAction);
  keyActionRef.current = keyAction;
  // A card's own ⋮ menu (CanvasMenu.jsx CardActionRows): that card's rows, run like the right-click menu's.
  const cardTarget = id => selectionTarget(menuModel({ selection: [id] }));
  const cardActions = {
    rows: (id, groups) => actionsFor(cardTarget(id), actionCtx).filter(row => row.separator || !groups || groups.includes(rowGroup(row.id))),
    run: (id, actionId) => { const done = runAction(actionId, cardTarget(id), actionCtx); if (!done.ran && done.reason) toast(done.reason); },
  };
  const hasPin = commentPins && presenting === null ? id => commentPins.some(pin => pin.anchor?.kind === 'object' && pin.anchor.object_id === id) : null;
  return (
    // Delete, ctrl+z, copy and paste all stand down while a text field has focus,
    // and the dock composer takes focus on mount - so without this, selecting a
    // shape or a note and pressing Delete silently did nothing. Any pointer press
    // outside the focused field hands focus back to the canvas. Pressing inside
    // the field it belongs to is left alone, so typing still works.
    // account (CanvasEdit): whose viewing preferences this browser keeps (a CAD card's Show dimensions); storageKey is
    // small.adaptive-canvas:<org>:<email>:<canvas> (home/canvas-local.js canvasKeys), absent on shared and member pages.
    <CanvasEdit.Provider value={{ locked: lockedIds, altDrag, readOnly, localCopy, hasPin, resizeCard, selectionCount: selection.length, account: storageKey ? storageKey.split(':').slice(1, 3).join(':') : '' }}>
    <CardActions.Provider value={cardActions}>
    <SelectionActionsProvider sole={selection.length === 1 ? selection[0] : null} hidden={!!inline || presenting !== null || readOnly || localCopy} narrow={(surface.current?.clientWidth || 1200) < 640} pinned={hasPin} onAddToChat={readOnly ? null : addToChat} added={!!(chatWorkspace && selection.length === 1 && objectById(selection[0]) && chatWorkspace.context.isAttached(chatRefOf(objectById(selection[0]))))} onQuickEdit={inlineAi && !readOnly ? quickEdit : null}>
    <div ref={shell} className="@container relative flex h-full min-h-0 flex-col"
      onPointerDownCapture={event => {
        // An open text edit whose focus went to a style-panel field ends when the press lands anywhere else.
        const editor = editorRef.current;
        const frame = editor?.root?.closest('[data-item-id],[data-shape-id],[data-connection]');
        if (editor && !frame?.contains(event.target) && !event.target.closest?.('[data-keep-focus]')) editor.commit('blur');
        const active = document.activeElement;
        if (!active || active === document.body) return;
        // A press anywhere on the canvas takes the keyboard back from the companion column, as a card press does: its keys
        // stand down while a focus is held there, so Ctrl+Z after a drop from the reader would undo nothing.
        if (active.closest?.('[data-companion]')) { active.blur(); return; }
        const editable = typingIn(active);
        // data-keep-focus marks controls that act ON the focused text - the
        // level pill - where a press must restyle, never blur. This runs in
        // the capture phase, so the pill's own stopPropagation cannot save it.
        if (editable && !active.contains(event.target) && !pressKeepsDocFocus(active, event.target) && !event.target.closest?.('[data-keep-focus]')) active.blur();
      }}>
      {/* The drawing surface fills this row, to the workspace's outer edges and the right panel (owner, 2026-10-22,
          superseding the reserved tools gutter): the tools column floats over it, a column at every width (UI-19), and
          fit, reveal and placement keep clear of the tools' measured rectangles (controlRects). */}
      <div className="flex min-h-0 flex-1">
      {/* With the grid on, the canvas draws its own dots instead of borrowing
          the page's: these ride the camera, so the grid you snap to is the grid
          you can see. An opaque surface keeps the page dots from showing through
          and doubling them up. */}
      {/* Voice Mode's Tutor caption (VoiceMode.jsx): a zero-width anchor after the tools gutter (which docks
          order-first), so the small caption window floats at the surface's lower left, above the zoom pill, as the
          owner asked (2026-10-01). At every width (UI-19: the canvas row no longer stacks). Never while presenting. It sits over the canvas
          but outside the surface's drop target, so a file dropped on it is ignored rather than opened by the browser.
          The rail is one stack there (owner, 2026-10-06), held in the stack's flow instead of its own corner; the
          Professor Next Steps card left it for the lower right, beside the composer (owner, 2026-10-08: `hooks` below).
          The stack stays left of the centred dock (780 px) and the answer sheet above it, down to 208 px wide. */}
      {leftRail && presenting === null && <div data-voice-rail className="relative z-20 w-0 shrink-0"
        onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()}>
        <div data-left-stack className={`absolute bottom-[calc(var(--chrome-left,0px)+0.75rem)] ${toolSide === 'left' ? 'left-24' : 'left-3'} flex w-[clamp(208px,calc(50cqw-500px),300px)] flex-col items-start gap-2 [&>[data-tutor-caption]]:relative [&>[data-tutor-caption]]:inset-auto`}>{leftRail}</div>
      </div>}
      <div ref={surface} data-canvas-surface data-space-pan={spacePan ? '' : undefined}
        onPointerDownCapture={event => {
          // Space held: this drag pans, over anything (cards and shapes included).
          if (spacePanRef.current && event.button === 0 && !event.target.closest('[role="toolbar"],[data-zoom],[role="menu"]')) { pan(event); return; }
          if (tool === 'askArea') startArea(event);
        }} data-presenting={presenting !== null ? '' : undefined} onPointerDown={down} onPointerMove={trackGap} onPointerLeave={() => { if (!gapAdding) setHoverGap(null); }}
        onContextMenu={event => {
          // UI-25: the thing under the pointer decides the menu (canvas-actions.js resolveTarget). Inside a field, an editor,
          // the document or an embedded page the browser's or the editor's own menu shows: nothing is prevented here.
          if (event.ctrlKey || marqueeRef.current || presenting !== null) { event.preventDefault(); return; }
          const root = surface.current.getBoundingClientRect();
          // Shift+F10 or the menu key on a focused card can arrive without a pointer position: beside that card then.
          const keyed = event.clientX === 0 && event.clientY === 0 && event.target !== surface.current;
          const near = keyed ? event.target.getBoundingClientRect() : null;
          const screen = near ? { x: near.left - root.left + 12, y: near.top - root.top + 12 } : { x: event.clientX - root.left, y: event.clientY - root.top };
          // A view-only board presses through the hand, so a card is found by its bounds - as its click selection does.
          const at = local(event);
          const hitByBounds = readOnlyRef.current ? () => Object.entries(boundsRef.current).find(([key, box]) => blocksRef.current.some(block => block.id === key) && at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h)?.[0] || null : null;
          const target = resolveMenuTarget(event.target, menuModel({ screen, hitByBounds, via: keyed ? 'keyboard' : 'pointer' }));
          if (target.native) return;
          event.preventDefault();
          openMenu(target);
        }}
        onDragOver={event => { if (searchDragEvent(event)) return; if (!readOnlyRef.current && ([...(event.dataTransfer?.types || [])].includes(EXCERPT_DRAG) || (chatWorkspace?.canvasOps?.insertCard && [...(event.dataTransfer?.types || [])].includes(CODE_DRAG)))) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropHover(true); return; } if (onDropFiles && isFileDrag(event.dataTransfer)) { event.preventDefault(); setDropHover(true); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setDropHover(false); paintSearchDrop(searchMark.current, null); } }}
        onDrop={event => { if (searchDragEvent(event, true)) return; const excerpt = !readOnlyRef.current && event.dataTransfer?.getData(EXCERPT_DRAG); if (excerpt) { event.preventDefault(); setDropHover(false); if (document.activeElement?.closest?.('[data-companion]')) document.activeElement.blur(); window.dispatchEvent(new CustomEvent(EXCERPT_EVENT, { detail: { action: 'canvas', draftId: excerpt, at: local(event) } })); return; } const code = !readOnlyRef.current && dragSource(event.dataTransfer); if (code) { event.preventDefault(); setDropHover(false); insertCodeCard(chatWorkspace?.canvasOps, repoCodeCard(code), local(event)); return; } if (!onDropFiles || !isFileDrag(event.dataTransfer)) return; event.preventDefault(); setDropHover(false); const at = local(event); droppedFiles(event.dataTransfer).then(files => onDropFiles(files, at), problem => toast(problem.message)); }}
        style={grid ? { background: 'var(--color-white)', backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)', backgroundSize: `${GRID * view.z}px ${GRID * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px` } : undefined}
        className={`relative min-h-0 flex-1 touch-none overflow-hidden ${cursor} ${dropHover ? 'ring-2 ring-accent ring-inset' : ''}`}>
        <LaserPointer on={presenting !== null && laser} />
        <div ref={searchMark} hidden aria-hidden="true" data-search-drop="" data-thumbnail-hide className="pointer-events-none absolute z-40 rounded-lg border-2 border-dashed border-accent bg-accent/5 data-[search-drop=refuse]:border-line-strong data-[search-drop=refuse]:bg-surface data-[search-drop=refuse]:px-3 data-[search-drop=refuse]:py-2 data-[search-drop=refuse]:shadow-md"><span className="absolute -top-6 left-0 rounded-md bg-ink px-1.5 py-0.5 text-[11px] whitespace-nowrap text-surface in-data-[search-drop=refuse]:static in-data-[search-drop=refuse]:whitespace-normal in-data-[search-drop=refuse]:bg-transparent in-data-[search-drop=refuse]:p-0 in-data-[search-drop=refuse]:text-xs in-data-[search-drop=refuse]:text-ink" /></div>
        <SelectionActionBar anchor={barAnchor} box={barBox} />
        {/* A pasted URL (canvas-paste.js 'url'): two choices, keyboard first - Tab between them, Enter picks, Esc places nothing. */}
        {urlPaste && <div role="dialog" aria-label="Paste a link" data-paste-url data-thumbnail-hide onPointerDown={event => event.stopPropagation()}
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); choosePaste(null); } }}
          className="absolute top-1/3 left-1/2 z-40 flex w-72 max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col gap-1 rounded-lg border border-line bg-white p-1 shadow-pop">
          <p className="truncate px-2 pt-1 pb-0.5 text-xs text-ink-2" title={urlPaste.text}>{urlPaste.text}</p>
          <button type="button" autoFocus data-paste-url-choice="text" onClick={() => choosePaste('text')} className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-accent/35"><Type size={14} className="shrink-0 text-ink-2" />Paste as text</button>
          <button type="button" data-paste-url-choice="card" onClick={() => choosePaste('card')} className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-accent/35"><Globe size={14} className="shrink-0 text-ink-2" />Add webpage card</button>
        </div>}
        {/* Insert > Webpage: the address, then the capture a pasted link makes. Esc places nothing. */}
        {webpageAsk !== null && <form role="dialog" aria-label="Add a webpage" data-webpage-ask data-thumbnail-hide onPointerDown={event => event.stopPropagation()}
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setWebpageAsk(null); } }}
          onSubmit={event => { event.preventDefault(); const url = webpageAsk.trim(); if (!isWebUrl(url)) return; setWebpageAsk(null); addWebpage(url); }}
          className="absolute top-1/3 left-1/2 z-40 flex w-80 max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col gap-2 rounded-lg border border-line bg-white p-2 shadow-pop">
          <label className="px-1 text-xs text-ink-2" htmlFor="webpage-ask-url">Webpage address</label>
          <input id="webpage-ask-url" autoFocus value={webpageAsk} onChange={event => setWebpageAsk(event.target.value)} placeholder="https://example.com" inputMode="url"
            className="h-8 rounded-md border border-line bg-white px-2 text-sm text-ink outline-none focus:border-ink-3" />
          <div className="flex justify-end gap-1">
            <button type="button" onClick={() => setWebpageAsk(null)} className="h-7 rounded-md px-2 text-xs text-ink-2 hover:bg-hover">Cancel</button>
            <button type="submit" disabled={!isWebUrl(webpageAsk.trim())} className="h-7 rounded-md bg-accent px-2 text-xs text-white disabled:opacity-40">Add webpage</button>
          </div>
        </form>}
        {inline && inlineAi && <Suspense fallback={null}><InlineAiEditor key={inline.n} target={inline.target} opened={inline.opened} cold={inline.cold} initialMode={inline.mode}
          canvas={inlineCanvas} config={inlineAi} view={view} readOnly={readOnly} onClose={closeInline} /></Suspense>}
        {inlineHint > 0 && <div role="status" data-inline-hint className="pointer-events-none absolute top-[calc(var(--canvas-top,0px)+0.75rem)] left-1/2 z-40 -translate-x-1/2 rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-2 shadow-md">Select something to edit or explain</div>}
        {docView === 'editor' && !doc && (docError || (!docReady && !readOnly)) && (
          <div data-canvas-doc data-doc-state={docError ? 'error' : 'loading'} className="absolute top-[calc(var(--canvas-top,0px)+3rem)] left-1/2 z-40 w-80 -translate-x-1/2 rounded-md border border-line bg-white p-4 text-sm text-ink-2 shadow-md dark:bg-side">
            {docError ? <>
              <p role="alert">Couldn&apos;t load this canvas&apos;s document. Your saved document is unchanged.</p>
              {onDocRetry && <button type="button" onClick={onDocRetry} className="mt-2 rounded-md border border-line px-2 py-1 text-xs text-ink hover:bg-hover">Retry</button>}
            </> : <p>Loading the document</p>}
          </div>
        )}
        <div ref={worldRef} data-canvas-world style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: '0 0' }} className={`absolute top-0 left-0 ${glide ? 'transition-transform duration-200 ease-out motion-reduce:transition-none' : ''}`}>
        {/* The document (docs/features/blocknote-canvas.md): a writing surface in world units BELOW every canvas object
            (blocknote-layers-minimap.md): the first child of the world layer with no z-index of its own, so cards, notes, shapes,
            connectors and their handles - all later in this layer - paint and take the pointer above it, whatever their own
            order, and focus or a menu never raises it. Its editor menus keep their own z-index in this layer, above the cards.
            Editor view only - in
            Canvas view it is not drawn at all, so nothing invisible catches the canvas's input. The hand tool and Space pan
            through it; a press inside it is the editor's, never a marquee, pan or card drag. Files dropped on it do nothing
            (no media in this MVP) rather than becoming a canvas card behind it. */}
        {doc && docView === 'editor' && (
          <div ref={paperRef} data-canvas-doc data-doc-state={docError || unknownDocBlock(doc.blocks) ? 'error' : docMounted ? 'ready' : 'loading'}
            style={{ left: doc.x, top: doc.y, width: doc.w, minHeight: DOC_MIN_H }}
            onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
            onContextMenu={event => event.stopPropagation()}
            onDragOver={event => { if (isFileDrag(event.dataTransfer)) { event.preventDefault(); event.stopPropagation(); } }}
            onDrop={event => { if (isFileDrag(event.dataTransfer)) { event.preventDefault(); event.stopPropagation(); } }}
            className={`absolute flex flex-col rounded-md border border-line bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] dark:bg-side ${(tool === 'hand' && !readOnly) || spacePan ? 'pointer-events-none' : ''}`}>
            <div data-canvas-doc-editor className="flex-1 px-4 py-14 [&_.bn-editor]:px-10">
              {unknownDocBlock(doc.blocks)
                ? <p role="alert" className="px-10 text-sm text-ink-2">This document holds content this version cannot edit, so it opens read-only here. Nothing in it was changed.</p>
                : <Suspense fallback={<p className="px-10 text-sm text-ink-3">Loading the document</p>}>
                  <CanvasDoc key={docEpoch} blocks={doc.blocks} searchApiRef={docSearchApi} editable={!readOnly && !localCopy} onChange={docChanged} onCaret={docCaret} onReady={(ready = true) => setDocMounted(ready)} />
                </Suspense>}
            </div>
          </div>
        )}
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
                <path d={path.d} fill="none" stroke={ink} strokeWidth={isSelected(link.id) ? 4 : 2.5} strokeLinejoin="round" strokeDasharray={link.kind === 'annotation' ? '6 5' : undefined} />
                {headMark(headsOf(link).end, path.tip, path.from, { stroke: ink, strokeWidth: 2.5 }, 'end')}
                {headMark(headsOf(link).start, portPosition(link.from, link.fromSide), path.next, { stroke: ink, strokeWidth: 2.5 }, 'start')}
                {/* A view-only board edits no connection, so its hit path takes no press: a press on a card a connection crosses
                    selects the card (r38: answers about a selected card are linked chat cards, so connections cross cards). */}
                <path d={path.d} fill="none" stroke="transparent" strokeWidth={14 / view.z} style={{ pointerEvents: readOnly ? 'none' : 'stroke', cursor: 'pointer' }}
                  onPointerDown={event => { event.stopPropagation(); select(link.id, event); }}
                  onDoubleClick={() => startLabel(link.id)}><title>Select connection · choose a color, arrowheads, a route or press Delete · double-click or Enter to label</title></path>
                <LineLabel at={path.mid} entry={link} editing={editingLabel === link.id} pickable={isSelected(link.id) && tool === 'select'} onPick={() => startLabel(link.id)} onDone={(runs, how) => changeLabel(link.id, runs, how)} onApi={onEditorApi} />
                {isSelected(link.id) && tool === 'select' && editingLabel !== link.id && !link.label && <LabelHandle at={path.mid} zoom={view.z} onPick={() => startLabel(link.id)} />}
              </g>
            );
          })}
          {connecting?.snap && <circle cx={connecting.snap.at.x} cy={connecting.snap.at.y} r={9} fill="white" stroke={connecting.color} strokeWidth="3" />}
          {connecting && <path data-connection-preview d={connectionPath(connecting)} fill="none" stroke={inkAware(connecting.color)} strokeWidth="2.5" strokeLinejoin="round" className="dark:[filter:brightness(1.5)_saturate(1.2)]" />}
        </svg>
        <svg aria-hidden="true" data-ink width="1" height="1" className="pointer-events-none absolute top-0 left-0 z-10 overflow-visible">
          {[...shapes, ...(liveShape ? [liveShape] : [])].map(shape => <ShapeView key={shape.id} shape={shape} tool={tool} zoom={view.z} selected={isSelected(shape.id)} editing={editingShape === shape.id} editPoint={editPoint} onSelect={select} onMoveStart={moveShapeStart} onResize={resizeShape} onGesture={snapshot} onGestureCancel={cancelGesture} onDelete={deleteItem}
            onEdit={startShapeText} onText={changeShapeText} onConnect={connect} showPorts={!!connecting} onGrow={growShape} onEditorApi={onEditorApi}
            labelEditing={editingLabel === shape.id} onLabel={startLabel} onLabelDone={changeLabel} />)}
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
                <circle key={`${link.id}-${end}`} data-link-for={link.id} data-link-end={end} cx={at.x} cy={at.y} r={6 / view.z} fill="white" strokeWidth={1.5 / view.z}
                  style={{ stroke: 'var(--color-select)', pointerEvents: 'all', cursor: 'move' }} onPointerDown={event => repoint(event, link, end)}><title>Drag to attach this end somewhere else</title></circle>
              )) : [];
            })}
          </svg>
        )}
        <div ref={column} style={{ width: COLUMN }} className={`absolute top-0 left-0 flex flex-col gap-5 ${drawing || tool === 'eraser' || tool === 'hand' ? 'pointer-events-none' : ''}`}>
          {/* An answer to a red box, or to a card asked about (float, LearnPage), lives beside it: out of the column flow (no height, no gap), so asking never pushes the slides, the cards or the box down. */}
          {exchanges.map(exchange => (String(exchange.linkFrom).startsWith('area:') || (exchange.linkFrom && exchange.float)
            ? <div key={exchange.id} className="-mb-5 h-0 overflow-visible"><ChatCard exchange={exchange} zoom={view.z} selected={isSelected(exchange.id)} connected={portsInUse[exchange.id]} boardId={boardOf(exchange.linkFrom)} onSelect={select} onMove={moveNode} onSize={onResize} onReply={onReply} renderComposer={renderBlockComposer && ((exchange, receive) => renderBlockComposer(exchange, receive, linkedTarget(exchange)))} onLayout={measureBlocks} onConnect={connect} onSnap={snapForNode} onFile={onOpenFile} /></div>
            : <ChatCard key={exchange.id} exchange={exchange} zoom={view.z} selected={isSelected(exchange.id)} connected={portsInUse[exchange.id]} boardId={boardOf(exchange.linkFrom)} onSelect={select} onMove={moveNode} onSize={onResize} onReply={onReply} renderComposer={renderBlockComposer && ((exchange, receive) => renderBlockComposer(exchange, receive, linkedTarget(exchange)))} onLayout={measureBlocks} onConnect={connect} onSnap={snapForNode} onFile={onOpenFile} />))}
          <SketchHost.Provider value={sketchHost}><CardOpen.Provider value={cardOpen}><CanvasRefs.Provider value={refLinks && { ...refLinks, refsOf: id => { const entry = blocks.find(block => block.id === id); return entry?.type === 'canvas-ref' ? null : entry?.refs; } }}>
            {columnEntries(blocks, slots).map(({ block, slot }) => slot ? <SlotCard key={slot.id} slot={slot} /> : <LessonBlockCard key={block.id} block={block} zoom={view.z} selected={isSelected(block.id)} viewSelected={selection.includes(block.id)} connected={portsInUse[block.id]} onSelect={select} onMove={moveNode} onChange={changeBlock} onChangeQuiet={changeBlockQuietly} onLayout={measureBlocks} onConnect={connect} onSnap={snapForNode} onFile={onOpenFile} appName={appName} onGrade={onGrade} onWiki={onWiki} onWatch={onWatch} onNotebook={readOnly || localCopy ? null : openInNotebook} onRemove={readOnly ? null : removeBlock} />)}
          </CanvasRefs.Provider></CardOpen.Provider></SketchHost.Provider>
        </div>
        {/* A7: the card ghost, where the card will go - the next slot at the end of the column (the column's height plus its
            gap), laid out like a column card - so no card moves, now or at Accept. Pale, untouchable (the editor's overlay
            covers it in the free spot it stands in), in no thumbnail; never in the board, its bounds or undo. */}
        {cardGhost && (
          <div data-inline-card-ghost data-thumbnail-hide aria-hidden="true" className="pointer-events-none absolute left-0 flex flex-col"
            style={{ top: (column.current?.offsetHeight || 0) + (column.current?.children.length ? 20 : 0), width: COLUMN, opacity: cardGhost.hidden ? 0 : 0.5 }}>
            <LessonBlockCard block={cardGhost.block} zoom={view.z} selected={false} connected={null} onSelect={noop} onMove={noop} onChange={noop} onChangeQuiet={noop} onLayout={noop} onConnect={noop} onSnap={noop} onFile={noop} appName={appName} onGrade={noop} onWiki={noop} onWatch={noop} />
          </div>
        )}
        {readOnly && selected && bounds[selected] && (
          <div data-view-selection={selected} aria-hidden="true" style={{ left: bounds[selected].x - 3, top: bounds[selected].y - 3, width: bounds[selected].w + 6, height: bounds[selected].h + 6 }}
            className="pointer-events-none absolute z-20 rounded-[14px] ring-2 ring-select" />
        )}
        {/* The gap near the pointer shows its dotted line and [-] [+] [...] at the far left. */}
        {presenting === null && !readOnly && !localCopy && !selection.length && gaps.filter(gap => gap.index === hoverGap).map(gap => (
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
            {areaMarquee.busy && <text x={Math.min(areaMarquee.x1, areaMarquee.x2) + 6 / view.z} y={Math.min(areaMarquee.y1, areaMarquee.y2) - 6 / view.z} fill="#dc2626" fontSize={12 / view.z} fontWeight="600">Capturing</text>}
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
          const pad = GROUP_PAD;
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
                className={`absolute rounded-xl border ${active ? 'border-select bg-select/[0.03]' : 'border-line-strong'} ${portal ? (portal.pending ? 'outline-8 outline-offset-1 outline-hole-pending/40' : 'outline-8 outline-offset-1 outline-hole/80') : ''} cursor-grab active:cursor-grabbing`}
                onDoubleClick={divePortals ? () => (portal ? divePortals.enter(portal.name) : divePortals.open?.(group.id, group.label || `${members.length} items`)) : undefined}
                onPointerDown={event => {
                  if (event.button !== 0 || tool !== 'select' || event.ctrlKey || event.metaKey) return;
                  event.stopPropagation();
                  const targets = membersOf(group.id);
                  setSelection(targets);
                  let last = local(event);
                  startDrag(event, last, (x, y) => { shift(x - last.x, y - last.y, targets); last = { x, y }; }, view.z);
                }} />
              <div style={{ left: left - pad, top: top - pad - GROUP_CHIP }} className="absolute z-20 flex items-center gap-1">
                <GroupChip group={group} editOn={chipEdit === group.id}
                  onSelect={() => setSelection(membersOf(group.id))}
                  onLabel={label => { setChipEdit(null); if (label === null || label === (group.label || '')) return; snapshot(); setGroups(previous => previous.map(entry => entry.id === group.id ? { ...entry, label } : entry)); }} />
                {portal && <button type="button" data-dive-portal={portal.name} title={`Enter the Rabbit Hole: ${portal.title}`} onPointerDown={event => event.stopPropagation()} onClick={() => divePortals.enter(portal.name)}
                  className={`pointer-events-auto flex max-w-60 items-center gap-1 rounded-sm border bg-white px-2 py-0.5 text-[11px] text-hole shadow-sm hover:bg-hole/10 ${portal.pending ? 'border-dashed border-hole-pending' : 'border-hole/40'}`}>
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" className="shrink-0"><path d="M6 1.5V10M2.5 6.5 6 10l3.5-3.5" /></svg><span className="truncate">{portal.title}</span></button>}
              </div>
            </div>
          );
        })}
        <div ref={itemsLayer} className={drawing || tool === 'hand' ? 'pointer-events-none' : ''}>
          {items.map(item => item.kind === 'equation'
            ? <EquationItem key={item.id} item={item} zoom={view.z} tool={tool} selected={isSelected(item.id)} onSelect={select} onMove={moveItemNode} onGesture={snapshot} onDelete={deleteItem} onSnap={snapForItem} onPatch={patchItem} onDone={finishEquation} onDraft={equationSearchDrafts.current.set} generation={equationGeneration(item)} editOn={editTarget} />
            : <CanvasItem key={item.id} item={item} zoom={view.z} tool={tool} selected={isSelected(item.id)} onSelect={select} onCommit={commitItemText} onMove={moveItemNode} onResize={resizeItem} onGesture={snapshot} onDelete={deleteItem} onSnap={snapForItem}
            onLevel={(id, value) => applyLevel([id], value)} onMode={setTextMode} onLang={setCodeLang} onNotebook={readOnly || localCopy ? null : openInNotebook} editOn={editTarget} onEditStart={id => { beginEdit(id); setEditTarget(null); }} onEditorApi={onEditorApi}
            cameraKey={`${view.x}:${view.y}:${view.z}`} getTooltipSpace={() => { const area = visibleArea(), frame = surface.current.getBoundingClientRect(); return { left: frame.left + area.left, right: frame.left + area.right, top: frame.top + area.top, bottom: frame.top + area.bottom }; }}
            onInlineAI={readOnly ? null : () => openInline(performance.now(), true)} onDiscardCode={() => endEdit(false, 'items')} />)}
          {equationDraft&&!readOnly&&<EquationItem key={equationDraft.id} item={equationDraft} zoom={view.z} tool="select" selected onSelect={()=>{}} onMove={()=>{}} onGesture={()=>{}} onDelete={()=>setEquationDraft(null)} onPatch={()=>{}} onDone={finishEquation} onDraft={()=>{}} generation={equationGeneration(equationDraft)}/>}
          {/* A shape's ladder sits in this HTML layer, above the shape: the ink
              SVG is aria-hidden, and the ladder must stay reachable. */}
          {shapes.filter(shape => TEXT_BOX[shape.kind] && !lockedIds.has(shape.id) && (editingShape === shape.id || (tool === 'select' && selection.length === 1 && selection[0] === shape.id))).map(shape => (
            <div key={`level-${shape.id}`} className="absolute z-20 flex items-center gap-1.5" style={{ left: Math.min(shape.x1, shape.x2), top: Math.min(shape.y1, shape.y2) - 42 }}>
              <LevelPill level={shape.level} onLevel={value => applyLevel([shape.id], value)} />
              {editingShape !== shape.id && <SelectionActionsHost id={shape.id} divider />}
            </div>
          ))}
          {/* A lock on each locked object, so a press that does nothing says why; select it and Unlock (panel, menu,
              Ctrl+Shift+L). Never in the thumbnail. */}
          {presenting === null && !readOnly && [...lockedIds].map(id => {
            const box = boxesOf([id])[0];
            return box ? <span key={`lock-${id}`} data-lock-badge={id} data-thumbnail-hide aria-hidden="true" title="Locked"
              style={{ left: box.x + box.w - 6, top: box.y - 10, transform: `scale(${1 / view.z})`, transformOrigin: 'left bottom' }}
              className="pointer-events-none absolute z-30 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-white text-ink-2 shadow-sm"><Lock size={9} /></span> : null;
          })}
        </div>
        </div>
        {/* Comment pins (docs/features/canvas-comments.md): over the camera at a constant size; never while presenting. */}
        {commentPins && presenting === null && <CommentPins pins={commentPins} view={view} board={commentBoard} slotOf={commentSlot} onPin={onCommentPin} picked={pinPick} onPick={pickPin} ask={pinAsk} onConfirm={() => deletePin(pinPick)} onCancel={() => setPinAsk(null)} />}
        {/* UI-25: one menu for every target, from the action registry (canvas-actions.js); opening it runs nothing. */}
        {menuAt && presenting === null && <CanvasMenu rows={actionsFor(menuAt.target, actionCtx)} at={menuAt} surface={surface.current} onPick={pickMenu} onClose={closeMenu} />}
        {/* Rename (card-rename.js): the card's title edited in place over its top edge; Enter or blur saves, Escape cancels, focus goes back to the card. */}
        {renaming && !readOnly && renaming.rect && (() => {
          const done = (save, refocus = true) => {
            if (renaming.closed) return; // a blur after Enter or Escape must not save again
            renaming.closed = true;
            const { id, title } = renaming;
            setRenaming(null);
            const next = save ? renameBlock(blocks, id, title) : blocks;
            if (next !== blocks) { snapshot(); setBlocks(next); }
            // Enter or Escape hands focus back to the card; a click elsewhere keeps the focus it moved to.
            if (refocus) requestAnimationFrame(() => document.querySelector(`[data-block-id="${CSS.escape(id)}"]`)?.focus?.());
          };
          return <input autoFocus data-card-rename aria-label="Card title" value={renaming.title}
            style={{ position: 'fixed', left: renaming.rect.left, top: renaming.rect.top, width: Math.max(160, renaming.rect.width) }}
            className="z-50 rounded-md border border-accent bg-white px-2 py-1.5 text-sm text-ink shadow-pop outline-none"
            onFocus={event => event.currentTarget.select()}
            onPointerDown={event => event.stopPropagation()}
            onChange={event => setRenaming(previous => ({ ...previous, title: event.target.value }))}
            onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); done(true); } else if (event.key === 'Escape') { event.preventDefault(); done(false); } }}
            onBlur={() => done(true, false)} />;
        })()}
      </div>
      {/* The tools' column: 84px at the side the toolbar docks (left by default; drag the grip to move it), floating over
          the surface from below the page header (--canvas-top) down to the bottom strip's column. Owner, 2026-10-22: it
          is no gutter - it clips nothing and takes no pointer; only its controls do, and the canvas pans, draws and
          selects under the rest. Docked right it keeps clear of the page's contents rail (edgeInset). A column at every
          width (owner UI-19): no strip under a narrow canvas and no overview here - the one minimap is the bottom strip's.
          The style panel opens from it. */}
      {presenting === null && (
        <div ref={gutter} data-tool-gutter
          // Docked right it mirrors the left side (84px, 8px in from the edge) and clears the contents rail (edgeInset).
          style={{ '--edge': `${edgeInset || 0}px` }}
          className={`pointer-events-none absolute top-[var(--canvas-top,0px)] bottom-0 z-20 flex flex-col justify-center gap-2 [&>*]:pointer-events-auto ${toolSide === 'left' ? 'left-0 items-start pl-2 pb-(--chrome-left) w-[84px]' : 'right-(--edge) items-end pr-2 pb-(--chrome-right) w-[84px]'}`}>
        {/* The Rabbit Hole navigator (Dive.jsx): top of the gutter, the tools centred in the rest. */}
        {/* Top of the tools gutter: the Rabbit Hole navigator. Canvas home is the page's top-left corner (LearnPage). */}
        <div data-gutter-top className={`pointer-events-none! mb-auto flex flex-col gap-3 [&>*]:pointer-events-auto ${import.meta.env.VITE_COACHING_DEV === 'true' ? 'pt-12' : 'pt-3'} @max-[640px]:hidden ${toolSide === 'left' ? 'items-start self-start' : 'items-end self-end'}`}>
          {/* The Rabbit Holes Map always sits here, on either side, never in a column of its own: a full-height 92 px column
              ended the canvas (overflow hidden) short of the panel, a blank strip cutting cards early (UI-17, canvas-clipping.md). */}
          {gutterTop && <div className={holeMap ? undefined : 'hidden'}>{gutterTop}</div>}
        </div>
        {/* Dev-only workbench: drop any lesson block on the canvas to review its
            look before lessons are assembled. */}
        {!readOnly && !localCopy && import.meta.env.VITE_COACHING_DEV === 'true' && (
          <div className={`absolute top-3 ${toolSide === 'left' ? 'left-2' : '-right-6'} z-20`}>
            <button type="button" aria-label="Insert lesson block" title="Insert a sample lesson block" aria-expanded={insertOpen}
              onClick={() => setInsertOpen(previous => !previous)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-white text-ink-2 shadow-md hover:text-ink">
              <Plus size={15} strokeWidth={1.7} />
            </button>
            {insertOpen && <BlockMenu className={`top-0 ${toolSide === 'left' ? 'left-10' : 'right-10'}`} filter={insertFilter} onFilter={setInsertFilter} onPick={type => (type === 'notebook' ? (snapshot(), insertAtView(newNotebookBlock()), setInsertOpen(false)) : type === 'youtube' ? (setInsertOpen(false), onSearch?.('youtube')) : insertBlock(type))} />}
          </div>
        )}
        {!readOnly && toolbar && <div ref={toolbarRef} role="toolbar" aria-label="Canvas tools" data-draw-target={drawTarget ? 'sketch' : 'canvas'}
          style={toolDrag ? { position: 'absolute', left: toolDrag.x, top: toolDrag.y } : toolCap != null ? { maxHeight: toolCap } : undefined}
          className={`z-20 grid max-h-full shrink-0 grid-cols-2 gap-0.5 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-md`}>
          {/* The handle: drag the palette and it parks on whichever edge you let
              go nearer to - left or right - never floating mid-canvas. */}
          <div role="button" aria-label="Move the toolbar" title="Drag to the left or right edge"
            className="col-span-2 flex h-5 cursor-grab items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink active:cursor-grabbing"
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
            className="col-span-2 rounded-md bg-[#2383e2]/10 py-0.5 text-center text-[10px] font-semibold tracking-wide text-[#2383e2] uppercase">Sketch</div>}
          {NAV_TOOLS.map(([value, Icon, label, hint]) => <ToolButton key={value} value={value} Icon={Icon} label={label} hint={hint} active={tool === value} onPick={() => setTool(value)} />)}
          <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
          {DRAW_TOOLS.map(([value, Icon, label, hint]) => <ToolButton key={value} value={value} Icon={Icon} label={label} hint={hint} active={tool === value} onPick={() => pickTool(value)} />)}
          <div className="col-span-2 mx-1.5 my-0.5 h-px bg-line" />
          {SHAPE_TOOLS.map(([value, Icon, label, hint]) => <ToolButton key={value} value={value} Icon={Icon} label={label} hint={hint} active={tool === value} onPick={() => pickTool(value)} />)}
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
        <div aria-hidden="true" className="mt-auto" />
        {!readOnly && showStyle && (
          <StylePanel side={toolSide} panel={panel} values={panelValues} on={panelOn}
            flags={{ units, grouped, allLocked: selectionLocked, canPasteStyle, sketch: !!drawTarget }} />
        )}
        {!showStyle && pickedPin?.can.color && onPinColor && presenting === null && <StylePanel colorOnly side={toolSide} values={{ color: pickedPin.color || PIN_DEFAULT }} on={{ color: colorPin }} />}
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
          composer, one per row; the minimap stays above the zoom row at every width (UI-19), shown as View > Minimap says.
          It floats (owner, 2026-10-08: "in the canvas above the chat composer you are cutting the canvas too much"): the
          canvas runs to the bottom, the strip is transparent and lets the pointer through, and only its controls (the
          strip's grandchildren) take it. Chrome may float over the canvas but never hides what the learner cannot reach:
          fit, focus and a new card's reveal stop above it (chromeTop), and panning brings anything out from under it. */}
      {presenting === null && <div data-canvas-bottom ref={bottomStrip} className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 md:flex-row md:items-end md:gap-3 ${DOCK_PAD} [&>*>*]:pointer-events-auto`}>
        <div className="flex items-end gap-2 md:min-w-fit md:flex-1 md:basis-0">
        {/* The page's own lower-left control (Learn: the feedback button). */}
        {bottomLeft}
        {/* One positioned group (owner brief 2026-10-16 item 8, aligned-minimap mockup): the minimap directly above the zoom
            row, 8px apart, both one outer width - the column is as wide as its widest child (the minimap's fixed frame) and
            the zoom row stretches to it, its slack going to the percentage, so both edges line up at any zoom label. */}
        <div data-zoom-stack className="flex w-fit flex-col items-stretch gap-2">
        {minimap && <div data-canvas-minimap>
          <CanvasMinimap boxes={minimapBoxes} view={view} onFit={zoomFit}
            surface={{ w: surface.current?.clientWidth || 0, h: surface.current?.clientHeight || 0 }}
            onView={next => setView(v => ({ ...v, x: next.x, y: next.y }))} />
        </div>}
        <div data-zoom aria-label="Zoom controls" className="z-20 flex items-center rounded-lg border border-line bg-white shadow-sm @max-[1024px]:static @max-[1024px]:mb-2">
          <IconBtn title="Scroll up" onClick={() => scrollBy(-1)}><ChevronUp size={14} /></IconBtn>
          <IconBtn title="Scroll down" onClick={() => scrollBy(1)}><ChevronDown size={14} /></IconBtn>
          <span className="mx-0.5 h-5 w-px bg-line" />
          <IconBtn title="Zoom out" onClick={() => zoomCenter(1 / 1.25)}><Minus size={14} /></IconBtn>
          <button type="button" title="Reset zoom" onClick={() => setView(homeView(controlArea(), COLUMN))} className="min-w-11 flex-1 px-1 text-center text-xs tabular-nums text-ink-2 hover:text-ink">{Math.round(view.z * 100)}%</button>
          <IconBtn title="Zoom in" onClick={() => zoomCenter(1.25)}><Plus size={14} /></IconBtn>
        </div>
        </div>
        </div>
        {/* The shared composer shell's footprint: DOCK_WIDTH in a DOCK_PAD strip (ChatComposer.jsx). */}
        {/* Hide the composer (owner brief 2 item 5): it stays mounted - draft, attachments, the selected card's context and
            a running answer all carry on - and only leaves the view, so it frees its room (fit and reveal stop above the
            small Show button instead). The hooks card's minimized state is its own. */}
        {composer && <div data-canvas-composer data-composer-hidden={composerHidden ? '' : undefined} className={`${DOCK_WIDTH} relative min-w-0 md:mx-0 md:shrink max-md:order-2 ${composerHidden ? 'hidden' : ''}`}>
          <ComposerHide.Provider value={hideComposer}>{composer}</ComposerHide.Provider>
        </div>}
        {composer && composerHidden && <div data-composer-show-slot className="flex justify-center max-md:order-2">
          <button type="button" data-composer-show aria-label="Show chat composer" title="Show chat composer"
            onClick={() => { setComposerHidden(false); requestAnimationFrame(() => shell.current?.querySelector('[data-canvas-composer] textarea, [data-canvas-composer] input[type="text"], [data-canvas-composer] [contenteditable="true"]')?.focus({ preventScroll: true })); }}
            className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-xs text-ink-2 shadow-md hover:text-ink"><MessageCircle size={13} />Chat<ChevronUp size={13} /></button>
        </div>}
        {/* Lower right: the hooks, bottom-aligned with the composer and right of it, the width the left stack gave them. It
            also balances the left column, so the composer stays centred. On a phone, above the composer at the right. */}
        <div data-canvas-lower-right className="flex justify-end md:min-w-fit md:flex-1 md:basis-0 max-md:order-1">
          {hooks && <div data-hooks-slot ref={hooksSlot} className={`w-[clamp(208px,calc(50cqw-500px),300px)] empty:hidden max-md:w-[min(100%,300px)] ${curious ? '' : 'hidden'}`}>{hooks}</div>}
        </div>
      </div>}
    </div>
    </SelectionActionsProvider>
    </CardActions.Provider>
    </CanvasEdit.Provider>
  );
}
