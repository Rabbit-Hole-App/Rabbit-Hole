// The Explanation card's width follows its widest visual (owner 2026-11-08, "quality over size"): a dense diagram is drawn at its own width instead of scrolling inside a fixed
// 408 px card; a picture is displayed at PICTURE_DISPLAY_WIDTH (the source is 1024 x 1024). Derived on every render from the saved body, never stored, so old cards widen too.
// The minimized tile uses the same rule on its one visual (explanation-minimize.js tileWidth): the visual is never scaled down.
import { parseIllustrationFence } from './explanation-lead.js';
import { naturalSize, renderTutorDiagram } from './tutor-diagrams/TutorDiagram.js';
import { FULL_WIDTH } from './card-layout.js';

export const PICTURE_DISPLAY_WIDTH = 512;
export const MIN_VISUAL_WIDTH = 408, MAX_VISUAL_WIDTH = 960;
// The card's own horizontal room around a visual: 1 px border and 16 px padding on each side (the card's border-box width less this is what a visual has).
export const CARD_CHROME = 34;
// The widths the card and the tile have when no visual asks for more: the card's long-standing 440 (408 of room less the border), the tile's 408.
export const CARD_FLOOR = 440, TILE_FLOOR = 408;

// A diagram's natural width: what its layout draws at the card's usual 408 px of room (a dense one is wider and used to scroll). Memoised per spec text.
const memo = new Map();
// `fit` (the card, not the tile): a portrait diagram is measured at the room that makes it 4:3 (tutor-diagrams naturalSize), up to the card's widest ordinary room (FULL_WIDTH.preferred).
export function diagramWidth(source, fit = false) {
  const key = (fit ? 'fit:' : '') + (typeof source === 'string' ? source : JSON.stringify(source));
  if (memo.has(key)) return memo.get(key);
  let width = 0;
  try {
    const spec = typeof source === 'string' ? JSON.parse(source) : source;
    width = Math.round((fit ? naturalSize(spec, MIN_VISUAL_WIDTH, FULL_WIDTH.preferred - CARD_CHROME) : renderTutorDiagram(spec, MIN_VISUAL_WIDTH)).width) || 0;
  } catch { width = 0; } // an invalid spec is not drawn: it asks for no room
  if (memo.size > 300) memo.clear();
  memo.set(key, width);
  return width;
}

// The card (or tile) border-box width for its widest visual's width: the floor, or the visual plus the card's chrome, with the visual capped at MAX_VISUAL_WIDTH (above it the diagram scrolls).
export const widthFor = (widest, floor = CARD_FLOOR) => (widest > MIN_VISUAL_WIDTH ? Math.max(floor, Math.min(widest, MAX_VISUAL_WIDTH) + CARD_CHROME) : floor); // a visual that fits the usual room never widens the card

const FENCE = /^[ \t]*```[ \t]*(rh-illustration|rh-diagram)[^\n]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gim;
// The widths of the card's visuals, in reading order: a diagram its natural width, a picture PICTURE_DISPLAY_WIDTH (a picture that is still being made counts: its frame is there; one that
// failed or was dropped draws nothing).
export function visualWidths(block) {
  const out = [];
  const own = block?.illustration;
  if (own && (own.src || own.cacheKey || own.fileRef?.source?.id)) out.push(PICTURE_DISPLAY_WIDTH);
  for (const [, lang, source] of String(block?.body ?? '').matchAll(FENCE)) {
    if (lang.toLowerCase() === 'rh-illustration') {
      const fence = parseIllustrationFence(source), entry = fence && Object.hasOwn(block.figures || {}, fence.id) ? block.figures[fence.id] : null;
      if (fence && !['failed', 'dropped'].includes(entry?.status)) out.push(PICTURE_DISPLAY_WIDTH); // an unreadable fence draws nothing
    } else out.push(diagramWidth(source, true));
  }
  return out;
}

// The Explanation card's width (px, border box), or undefined for a card with no body to measure (the type's own width stands).
export function explanationCardWidth(block) {
  if (block?.type !== 'explanation' || typeof block.body !== 'string') return undefined;
  return widthFor(Math.max(0, ...visualWidths(block)), CARD_FLOOR);
}

// The tile's width for its one visual (explanation-minimize.js minimizedVisual): { kind: 'picture' } | { kind: 'diagram', spec: <the fence's JSON text> } | null.
export const tileWidthFor = visual => widthFor(!visual ? 0 : visual.kind === 'picture' ? PICTURE_DISPLAY_WIDTH : diagramWidth(visual.spec), TILE_FLOOR);
