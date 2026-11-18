// Learn sections, Position (learn-position-spec.md v1.3): where the made materials of an accepted plan stand on the canvas. One column for the whole plan, read top to bottom:
// chapters and sections in the plan's order, each item's lead -> card(s) -> follow, the section's notes last; a paired card (an explanation or notebook made for a passage card,
// learn.after) steps sideways once beside that card; an item's several cards (code anchors, paper pages) stand side by side. Pure geometry in world units, no model, no topic
// words; every distance comes from SPACING. The canvas (AdaptiveCanvas.jsx) turns each target into the card's offsets, as a drag would.
import { GAP, freeSpot } from './inline-ai-apply.js';

// The only place a distance is set (spec 5a). The owner judges the multiplier on production (Reviewer 2026-11-17 10:22: ships at x1); the dev build's tight / normal / loose
// toggle scales it for a side-by-side look.
export const SPACING = { card: GAP, pair: GAP, section: 2 * GAP, chapter: 6 * GAP, column: 6 * GAP };
export const SPACING_SCALES = { tight: 0.75, normal: 1, loose: 1.5 };
let scaleNow = 1;
export const spacingScale = () => scaleNow;
export const setSpacingScale = value => { scaleNow = Number.isFinite(value) && value > 0 ? value : 1; return scaleNow; };
export const spacing = (scale = scaleNow) => Object.fromEntries(Object.entries(SPACING).map(([key, value]) => [key, Math.round(value * scale)]));

// One width for the column (spec 5): the widest natural card width in the plan, clamped to 560..720. A card that needs more than 720 (a wide table) keeps its own width.
export const W_MIN = 560, W_MAX = 720;
export const columnWidth = naturals => Math.min(W_MAX, Math.max(W_MIN, ...naturals.filter(Number.isFinite)));
export const cardWidth = (natural, W) => (Number.isFinite(natural) && natural > W_MAX ? natural : W);

const DIAGRAMS = new Set(['flow_diagram', 'mermaid_diagram']), GRAPHS = new Set(['interactive_graph', 'data_plot']), PAGES = new Set(['paper', 'wiki', 'webpage']);
const FIT = new Set(['doc', 'snippet']); // text cards: their content's height, no inner scroll (block.learn.fit)
export const fitsContent = block => FIT.has(block?.type);
// The words of a Document card (BlockNote blocks: text in content runs, children nested).
export function docWords(blocks) {
  let n = 0;
  const walk = list => { for (const b of Array.isArray(list) ? list : []) { for (const run of Array.isArray(b?.content) ? b.content : []) if (typeof run?.text === 'string') n += run.text.split(/\s+/).filter(Boolean).length; walk(b?.children); } };
  walk(blocks);
  return n;
}
// A code card's lines: its stored range (start..end), else the widest of its ranges, else a screenful.
export function codeLines(block) {
  const span = (a, b) => (Number.isInteger(a) && Number.isInteger(b) && b >= a ? b - a + 1 : 0);
  const own = span(block?.start ?? block?.ref?.start, block?.end ?? block?.ref?.end);
  const ranges = (Array.isArray(block?.ranges) ? block.ranges : []).reduce((most, r) => Math.max(most, span(r?.start, r?.end)), 0);
  return Math.min(200, own || ranges || 40);
}
// The height the Tutor sets on a page or app card (spec 5, 5b): inner scroll is the reading there. null: the card's content decides (text, explanation, diagram).
export function fixedHeight(block, W) {
  if (block?.type === 'notebook') return 720;
  if (PAGES.has(block?.type)) return 900;
  if (block?.type === 'video') return Math.round((9 / 16) * W + 56);
  if (block?.type === 'repo-code') return 28 * codeLines(block) + 56;
  if (GRAPHS.has(block?.type)) return Math.round((3 / 4) * W + 56);
  return null;
}
// The slot a card takes before the canvas measures it (spec 5).
export function assumedHeight(block, W) {
  const fixed = fixedHeight(block, W);
  if (fixed) return fixed;
  if (block?.type === 'doc') return 160 + 24 * Math.ceil(docWords(block.blocks) / 40);
  if (block?.type === 'snippet') return 28 * String(block.code ?? block.body ?? '').split('\n').length + 56;
  if (DIAGRAMS.has(block?.type)) return 360;
  return 520; // an explanation, and anything else
}

// Reading order of a plan card: chapter, section (a chapter heading first), item (composition order; notes last), role (lead, card, follow), part.
const RANK = { chapter: -1, lead: 0, card: 1, notes: 1, follow: 2 };
const numbers = id => String(id ?? '').split('.').map(Number);
export function orderKey(learn) {
  const [chapter = 0, section = 0] = numbers(learn?.sectionId);
  return [chapter || 0, learn?.role === 'chapter' ? -1 : section || 0, learn?.role === 'chapter' ? -1 : Number.isFinite(learn?.order) ? learn.order : 1e6, RANK[learn?.role] ?? 1, learn?.part || 0];
}
export const byKey = (a, b) => { const x = orderKey(a.learn), y = orderKey(b.learn); for (let k = 0; k < x.length; k += 1) if (x[k] !== y[k]) return x[k] - y[k]; return 0; };
const chapterOf = learn => numbers(learn?.sectionId)[0] || 0;
export const union = boxes => {
  const list = boxes.filter(Boolean);
  if (!list.length) return null;
  const x = Math.min(...list.map(b => b.x)), y = Math.min(...list.map(b => b.y));
  return { x, y, w: Math.max(...list.map(b => b.x + b.w)) - x, h: Math.max(...list.map(b => b.y + b.h)) - y };
};

// cards: [{ id, learn, w, h, box, placed }]: every card of the plan (block.learn.slot): its size now (measured, else assumed), its drawn box (null before it is measured) and
// whether the column already put it on its slot. others: the boxes of everything else on the board (and the canvas chrome). W: the column width.
// -> { targets: Map(id -> { x, y }), origin: { x, y } }: the top-left each card of the plan stands at. A pinned card (dragged by the learner) keeps its place and is an obstacle.
export function learnLayout({ cards, others = [], W = W_MAX, space = spacing() }) {
  const order = cards.filter(card => card.learn && !card.learn.pinned).sort(byKey);
  const obstacles = [...others, ...cards.filter(card => card.learn?.pinned && card.box).map(card => card.box)];
  if (!order.length) return { targets: new Map(), origin: null };
  // Origin: the first card already on its slot defines the column (stored nowhere); a plan's first card goes right of everything on the board, top aligned with it.
  const anchor = order.find(card => card.placed && card.box), board = union(others);
  let origin = anchor ? { x: anchor.box.x, y: anchor.box.y } : board ? { x: board.x + board.w + space.column, y: board.y } : { x: order[0].box?.x ?? 0, y: order[0].box?.y ?? 0 };
  // A paired card stands beside the first card of the item it was made for (same section).
  const firstCard = new Map(), beside = new Map();
  for (const card of order) if (card.learn.role === 'card' && !card.learn.after) { const key = `${card.learn.sectionId}/${card.learn.itemId}`; if (!firstCard.has(key)) firstCard.set(key, card.id); }
  for (const card of order) {
    if (card.learn.role !== 'card' || !card.learn.after) continue;
    const host = firstCard.get(`${card.learn.sectionId}/${card.learn.after}`);
    if (host) beside.set(host, [...(beside.get(host) || []), card]);
  }
  const paired = new Set([...beside.values()].flat().map(card => card.id));
  const lay = at => {
    const targets = new Map(), boxes = [];
    let y = at.y, previous = null;
    const put = (card, x, top) => { targets.set(card.id, { x: Math.round(x), y: Math.round(top) }); boxes.push({ x, y: top, w: card.w, h: card.h }); };
    for (let k = 0; k < order.length; k += 1) {
      const card = order[k];
      if (paired.has(card.id) || targets.has(card.id)) continue;
      if (previous) y += card.learn.role === 'chapter' ? space.chapter : chapterOf(card.learn) !== chapterOf(previous.learn) ? space.chapter : card.learn.sectionId !== previous.learn.sectionId && previous.learn.role !== 'chapter' ? space.section : space.card;
      // A row: this card, the item's other parts after it (side by side), and the cards paired with any of them (to their right).
      const row = [card];
      if (card.learn.role === 'card') for (const next of order.slice(k + 1)) { if (next.learn.role === 'card' && next.learn.itemId === card.learn.itemId && next.learn.sectionId === card.learn.sectionId && !paired.has(next.id)) row.push(next); else if (!paired.has(next.id)) break; }
      let x = at.x, tallest = 0;
      for (const part of row) {
        put(part, x, y); x += part.w + space.card; tallest = Math.max(tallest, part.h);
        for (const pair of beside.get(part.id) || []) { const px = targets.get(part.id).x + part.w + space.pair; put(pair, Math.max(px, x - space.card + space.pair), y); x = Math.max(x, px + pair.w + space.card); tallest = Math.max(tallest, pair.h); }
      }
      y += tallest; previous = row.at(-1);
    }
    // A paired card whose host is not in the plan (deleted) joins the column at its own place in order: laid last, below everything.
    for (const card of order) if (!targets.has(card.id)) { y += space.card; put(card, at.x, y); y += card.h; }
    return { targets, boxes };
  };
  // Nothing that is not the plan's moves: a slot that would overlap it shifts the whole column right by one slot, and the column is laid again.
  for (let tries = 0; tries < 24; tries += 1) {
    const out = lay(origin);
    if (out.boxes.every(box => freeSpot(box, obstacles))) return { targets: out.targets, origin };
    origin = { x: origin.x + W + space.card, y: origin.y };
  }
  return { targets: lay(origin).targets, origin };
}
