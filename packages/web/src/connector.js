// AR-C1/C2/C4 (release 146): the connector between a card and the card it was made from. DERIVED from what the cards already record (nothing is drawn, dragged, saved or deleted by the learner):
//   explain: a card made from a highlighted passage -> its source card, DASHED. The link is parentCard { id, dy } (dy: the highlighted line's offset from the source's top, written when the card is made) or,
//            for a passage of a Markdown file card, the card's sourceRef resolved to that file card (source-ref.js markdownCardOf); the tail is at the passage line.
//   ask:     a card made by "Ask in a new card" -> the card it was asked from (parentCard { id, revision, actionId }), SOLID, at the source's middle.
// Pure geometry in world units; AdaptiveCanvas draws it in a layer BELOW every card.
import { PALETTE } from './tutor-diagrams/primitives.js';
import { hashOf } from './place-sourced.js';
import { markdownCardOf } from './source-ref.js';

// One block to tune: the line, the arrowhead, the S-curve and the guards.
export const ARROW = Object.freeze({ width: 1.4, dash: '6 5', head: 9, headSpread: 0.44, minRun: 48, maxRun: 240, edgeInset: 8, bow: 0.1, maxBow: 24, samples: 48 });

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Which side of the SOURCE the target is on, decided by the cards' relative horizontal position (centres); overlapping cards go by their centres too.
export const sideOfTarget = (source, target) => (target.x + target.w / 2 >= source.x + source.w / 2 ? 'right' : 'left');

// -> { tail, head, side, mode: 'S' | 'gentle', d, segments, angle }. tail: on the source's facing edge at the passage line (clamped inside the source's height, never off it); head: on the target's facing edge at
// its vertical middle. 'S': a cubic Bezier with horizontal tangents at both ends, control offsets at most half the run, so x is monotone (no loop, no spiral). When the target is not clear of the
// tail by minRun (a dragged card overlapping the source, or too close), the path degrades to 'gentle': a nearly straight arc between the nearest edges, bowed by at most maxBow, which cannot loop.
export function connectorGeometry({ source, target, anchorY = null }) {
  const side = sideOfTarget(source, target), sign = side === 'right' ? 1 : -1;
  const y = clamp(Number.isFinite(anchorY) ? anchorY : source.y + source.h / 2, source.y + ARROW.edgeInset, source.y + source.h - ARROW.edgeInset);
  const tail = { x: side === 'right' ? source.x + source.w : source.x, y };
  const head = { x: side === 'right' ? target.x : target.x + target.w, y: target.y + target.h / 2 };
  const run = (head.x - tail.x) * sign;
  if (run >= ARROW.minRun) {
    const k = Math.min(run / 2, ARROW.maxRun);
    const c1 = { x: tail.x + sign * k, y: tail.y }, c2 = { x: head.x - sign * k, y: head.y };
    return { tail, head, side, mode: 'S', segments: [tail, c1, c2, head], angle: side === 'right' ? 0 : Math.PI, d: `M ${tail.x} ${tail.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${head.x} ${head.y}` };
  }
  // gentle: control points at a third and two thirds of the chord, pushed to one side by a bounded bow.
  const dx = head.x - tail.x, dy = head.y - tail.y, length = Math.hypot(dx, dy) || 1;
  const bow = Math.min(ARROW.maxBow, ARROW.bow * length) * (side === 'right' ? 1 : -1);
  const nx = -dy / length, ny = dx / length;
  const c1 = { x: tail.x + dx / 3 + nx * bow, y: tail.y + dy / 3 + ny * bow }, c2 = { x: tail.x + (2 * dx) / 3 + nx * bow, y: tail.y + (2 * dy) / 3 + ny * bow };
  return { tail, head, side, mode: 'gentle', segments: [tail, c1, c2, head], angle: Math.atan2(head.y - c2.y, head.x - c2.x), d: `M ${tail.x} ${tail.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${head.x} ${head.y}` };
}

// Points along the cubic (for tests and hit-free checks).
export function samplePath(geometry, n = ARROW.samples) {
  const [p0, p1, p2, p3] = geometry.segments;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
  });
}

// The small open arrowhead at the head, pointing along the end tangent: two short strokes from the tip.
export function arrowhead(geometry, scale = 1) {
  const { head, angle } = geometry, size = ARROW.head * scale; // ARROW.head is screen pixels: the canvas passes scale = 1 / zoom, so the head is the same size at every zoom (live canvas: 7 world units were 3 px at 34%)
  const wing = sign => ({ x: head.x - size * Math.cos(angle + sign * ARROW.headSpread), y: head.y - size * Math.sin(angle + sign * ARROW.headSpread) });
  const a = wing(1), b = wing(-1);
  return `M ${a.x} ${a.y} L ${head.x} ${head.y} L ${b.x} ${b.y}`;
}

// Colours: the explain primitives' palette (tutor-diagrams/primitives.js PALETTE: process, decision, outcome, olive, coral, lavender, rose, slate), one per connector, chosen by a hash of the target card's id
// (stable across reloads and across the two ends' order). On the light canvas each is deepened toward the ink so the thin line stays visible (>= 2:1 on white); on the dark canvas it is used as it is.
export const PALETTE_ORDER = Object.keys(PALETTE);
const INK = [0x32, 0x21, 0x1c];
const mixHex = (hex, toward, amount) => `#${[1, 3, 5].map((i, c) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount) + toward[c] * amount).toString(16).padStart(2, '0')).join('')}`;
export const LIGHT_MIX = 0.28;
export function connectorColors(targetId) {
  const name = PALETTE_ORDER[hashOf(`connector|${targetId}`) % PALETTE_ORDER.length], base = PALETTE[name];
  return { name, dark: base, light: mixHex(base, INK, LIGHT_MIX) };
}
export function contrast(a, b) {
  const lum = hex => { const [r, g, bl] = [1, 3, 5].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The connectors the board's cards imply: [{ id, from (source card id), to (card id), kind: 'explain' | 'ask', dy? (explain: the line's offset from the source's top) }]. A link whose source is not a card of this
// board is skipped; a card is never its own source.
export function connectorsOf(blocks) {
  const byId = new Map(blocks.map(block => [block.id, block]));
  const out = [];
  for (const block of blocks) {
    const parent = block.parentCard?.id && block.parentCard.id !== block.id && byId.has(block.parentCard.id) ? block.parentCard : null;
    if (parent) { out.push({ id: `arrow:${block.id}`, from: parent.id, to: block.id, kind: parent.actionId || parent.revision ? 'ask' : 'explain', ...(Number.isFinite(parent.dy) ? { dy: parent.dy } : {}) }); continue; }
    const file = block.sourceRef ? markdownCardOf(blocks, block.sourceRef) : null;
    if (file && file !== block.id) out.push({ id: `arrow:${block.id}`, from: file, to: block.id, kind: 'explain' });
  }
  return out;
}

// One connector's drawing, or null when either end is missing or not measured. boxes: { id: { x, y, w, h } } (world units); passageY: { [targetId]: world y } measured passage lines.
export function drawConnector(connector, blocks, boxes, passageY = {}) {
  const source = boxes[connector.from], target = boxes[connector.to];
  const from = blocks.find(block => block.id === connector.from), to = blocks.find(block => block.id === connector.to);
  if (!source || !target || !from || !to) return null;
  const anchorY = Number.isFinite(passageY[connector.to]) ? passageY[connector.to] : connector.kind === 'explain' && Number.isFinite(connector.dy) ? source.y + connector.dy : null;
  const geometry = connectorGeometry({ source, target, anchorY });
  return { id: connector.id, kind: connector.kind, geometry, head: arrowhead(geometry), colors: connectorColors(connector.to) };
}
