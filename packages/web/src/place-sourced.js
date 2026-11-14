// AR-C3 (release 146): where a card made FROM another card (a Ctrl+K Explain on a highlighted passage, "Ask in a new card") stands. One pure entry, placeSourced, in world units; every sourced
// card is placed by it, then the connector (connector.js) is drawn from where the card ended up. Nothing here moves or resizes an existing card.
//
// Rules (owner 2026-11-14; decided in the brief of release 146):
//  a. never overlap any box (card, group frame, object) and keep SOURCED.margin clear of each; existing cards are never moved.
//  b. ideal slot: the new card's vertical MIDDLE at anchorY (the passage's line, or the source's middle for Ask), one SOURCED.gap (96) from the source's edge: the connector is then a gentle horizontal S.
//  c. candidates are the RIGHT and the LEFT side only (never above or below the source: that makes the arrow loop). On a side, slide up and down in SOURCED.step steps (alternating,
//     nearest first) inside a window of two card heights, keeping the x gap; gaps 96, 128, 64, 160 are tried; nothing free: one more column out (x + width + gap) at the ideal y; at most SOURCED.columns.
//  d. the side with the lowest cost wins. cost = |dy| (the final slot's middle from the anchor) + 0.5 * |gap - 96| + 200 per extra column + 150 per box the straight tail-head segment crosses + 60 per
//     sibling the order rule (e) breaks. A tie (within 1) goes to: the side the source's other children already stand on, then the side nearer the visible area's centre, then RIGHT.
//  e. children of one source read top to bottom in anchorY order, so connectors never cross: a new child is penalised for standing above a sibling with a lower anchorY (or below one with a higher);
//     siblings are never moved, so when the ordered slot is taken the nearest free slot is taken and the order is accepted.
//  f. JITTER (owner 2026-11-14, "a brainstorm board, not a structure"): a deterministic offset from a hash of the new card's id and the source's id shifts the gap by up to +-JITTER.x of itself
//     (never under SOURCED.minGap) and the card's middle by up to +-JITTER.y around the anchor, before the overlap check, so it can never overlap anything. ANTI-GRID: a slot whose left edge, right edge or
//     centre x lies within JITTER.align of another card's is pushed sideways by at least JITTER.push (in the hash's direction, then wider, up to JITTER.pushes steps): against EVERY sibling of this source and every
//     other card within JITTER.reach card heights, so cards two apart never line up either; consecutive siblings do not repeat a
//     vertical gap (JITTER.siblingGap). The no-loop guard (the head clears the tail by minGap) runs on the jittered slot: it fails -> the jitter halves, then is dropped.
//     No id: no jitter (the old callers). The amplitudes below are the one block to tune.
export const SOURCED = Object.freeze({ gap: 96, minGap: 64, gaps: [96, 128, 64, 160], margin: 24, step: 24, windowHeights: 2, columns: 4, columnCost: 200, crossCost: 150, orderCost: 60, edge: 16, maxCoord: 1e7 });
export const JITTER = Object.freeze({ x: 0.35, y: 40, align: 32, push: 48, pushes: 8, spread: 10, reach: 3, siblingGap: 12 });

// FNV-1a, the hash beside-placement.js scatterOf uses: stable across reloads and runs.
export const hashOf = text => { let hash = 2166136261; for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0; return hash; };
const unit = text => (hashOf(text) % 20001) / 10000 - 1; // -1..1

const hits = (a, b, m) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
const sideOf = (source, box) => (box.x + box.w / 2 >= source.x + source.w / 2 ? 'right' : 'left');
const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

// Does the segment a->b pass through the box (Liang-Barsky)? A touch of the border is not a crossing.
function crosses(a, b, box) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.x], [dx, box.x + box.w - a.x], [-dy, a.y - box.y], [dy, box.y + box.h - a.y]]) {
    if (p === 0) { if (q <= 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r >= t1) return false; if (r > t0) t0 = r; } else { if (r <= t0) return false; if (r < t1) t1 = r; }
  }
  return t1 > t0;
}

// The tail and head the connector will have for a card at `at` ({ x, y }, size { w, h }) on `side`.
const endsOf = (source, anchorY, at, size, side) => ({
  tail: { x: side === 'right' ? source.x + source.w : source.x, y: anchorY },
  head: { x: side === 'right' ? at.x : at.x + size.w, y: at.y + size.h / 2 },
});
// The no-loop guard on a slot: the head is on the facing side of the tail and clears it by minGap.
const clears = (source, at, size, side) => (side === 'right' ? at.x - (source.x + source.w) : source.x - (at.x + size.w)) >= SOURCED.minGap;

// The deterministic quality of a placement, for tests and for comparing: dy (head's y from the tail's), crossings (boxes the straight segment passes through), columns (extra columns out).
export function slotQuality({ source, anchorY, at, size, side, boxes = [], columns = 0 }) {
  const { tail, head } = endsOf(source, anchorY, at, size, side);
  const placed = { x: at.x, y: at.y, w: size.w, h: size.h };
  const crossings = boxes.filter(box => !same(box, source) && !hits(placed, box, -1) && crosses(tail, head, box)).length;
  return { dy: Math.round(Math.abs(head.y - tail.y)), crossings, columns };
}

// Is the slot column-aligned (left edges, right edges or centres within JITTER.align) with a peer? peers: [{ b, always }]: a sibling of the source always counts, any other card only within JITTER.reach card heights.
const aligned = (rect, peers) => peers.some(({ b, always }) => {
  const gapY = Math.max(0, Math.max(rect.y, b.y) - Math.min(rect.y + rect.h, b.y + b.h));
  return (always || gapY < JITTER.reach * rect.h) && (Math.abs(rect.x - b.x) < JITTER.align || Math.abs(rect.x + rect.w - (b.x + b.w)) < JITTER.align || Math.abs(rect.x + rect.w / 2 - (b.x + b.w / 2)) < JITTER.align);
});

function bestOnSide(side, ctx, scale) {
  const { source, anchorY, size, obstacles, siblings, boxes, jx, jy } = ctx;
  const steps = Math.floor((SOURCED.windowHeights * size.h) / SOURCED.step);
  let best = null;
  for (let column = 0; column < SOURCED.columns && !best; column += 1) {
    for (const gap of column === 0 ? SOURCED.gaps : [SOURCED.gap]) {
      const eff = Math.max(SOURCED.minGap, Math.round(gap * (1 + jx * JITTER.x * scale))); // the jitter never takes the gap under the minimum
      const x = side === 'right' ? source.x + source.w + eff + column * (size.w + gap) : source.x - eff - size.w - column * (size.w + gap);
      for (let i = 0; i <= 2 * steps; i += 1) {
        const slide = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * SOURCED.step; // 0, +s, -s, +2s, ...
        const rect = { x: Math.round(x), y: Math.round(anchorY - size.h / 2 + jy * JITTER.y * scale + slide), w: size.w, h: size.h };
        if (Math.abs(rect.x) > SOURCED.maxCoord || Math.abs(rect.y) > SOURCED.maxCoord || !clears(source, rect, size, side)) continue;
        if (obstacles.some(box => hits(rect, box, SOURCED.margin))) continue;
        const mid = rect.y + size.h / 2;
        const order = siblings.filter(s => sideOf(source, s.box) === side && ((s.anchorY < anchorY && s.box.y + s.box.h / 2 > mid) || (s.anchorY > anchorY && s.box.y + s.box.h / 2 < mid))).length;
        const quality = slotQuality({ source, anchorY, at: rect, size, side, boxes, columns: column });
        const cost = Math.abs(mid - anchorY) + 0.5 * Math.abs(eff - SOURCED.gap) + column * SOURCED.columnCost + quality.crossings * SOURCED.crossCost + order * SOURCED.orderCost;
        if (!best || cost < best.cost) best = { x: rect.x, y: rect.y, side, cost, quality };
      }
    }
  }
  return best;
}

// Anti-grid: a chosen slot column-aligned with a neighbour is pushed sideways (away from it, else the hash's direction) by JITTER.push, then more; the first push that stays free, clears the
// tail and aligns with nothing wins. Siblings' vertical gaps: a slot whose gap to its nearest same-side sibling repeats another sibling-to-sibling gap is nudged by JITTER.siblingGap.
function deAlign(pick, ctx) {
  const { source, size, obstacles, siblings, boxes, dir } = ctx; // dir: the hash direction, for the sibling-gap nudge
  const others = [...boxes.filter(b => !same(b, source)).map(b => ({ b, always: false })), ...siblings.map(s => ({ b: s.box, always: true }))];
  const free = rect => !obstacles.some(box => hits(rect, box, SOURCED.margin)) && clears(source, rect, size, pick.side);
  let out = { x: pick.x, y: pick.y };
  const rect = at => ({ x: at.x, y: at.y, w: size.w, h: size.h });
  if (siblings.length > 0 || aligned(rect(out), others)) {
    // A board, not a ramp: next to the source there is little room to move toward it, so ordered pushes always end up stepping away and the fan becomes a diagonal. Instead a second or later child (or any slot that lines up) takes the first free,
    // non-aligned gap from a deterministic shuffle (hash of the card and source ids) of JITTER.spread gaps spaced JITTER.push apart from the minimum gap outward; none works: the old push by hash direction.
    // Alternate by sibling index: an even-numbered child prefers a gap wider than the previous child's, an odd one a narrower, so the distances zig-zag instead of stepping one way.
    const last = siblings.at(-1)?.box, prevGap = last ? (sideOf(source, last) === 'right' ? last.x - (source.x + source.w) : source.x - (last.x + last.w)) : null;
    const zig = g => (prevGap === null ? 0 : (g > prevGap) === (siblings.length % 2 === 0) ? 0 : 1);
    const gaps = Array.from({ length: JITTER.spread }, (_, i) => SOURCED.minGap + i * JITTER.push).sort((a, b) => (zig(a) - zig(b)) || hashOf(`${ctx.key}|g|${a}`) - hashOf(`${ctx.key}|g|${b}`));
    const hit = gaps.map(g => ({ x: pick.side === 'right' ? source.x + source.w + g : source.x - g - size.w, y: out.y })).find(at => free(rect(at)) && !aligned(rect(at), others));
    if (hit) out = hit;
  }
  const kin = siblings.filter(s => sideOf(source, s.box) === pick.side).map(s => s.box).sort((a, b) => a.y - b.y);
  if (kin.length) {
    const gaps = kin.slice(1).map((b, i) => Math.round(b.y - (kin[i].y + kin[i].h)));
    const mine = out.y >= kin.at(-1).y ? Math.round(out.y - (kin.at(-1).y + kin.at(-1).h)) : null;
    if (mine !== null && gaps.some(g => Math.abs(g - mine) < 2)) {
      const nudged = [1, -1].map(d => ({ x: out.x, y: out.y + d * JITTER.siblingGap * (dir > 0 ? 1 : -1) })).find(at => free(rect(at)) && !aligned(rect(at), others));
      if (nudged) out = nudged;
    }
  }
  return out;
}

// source: the source card's measured box { x, y, w, h }. anchorY: the world y of the passage's line (clamped into the source), or the source's middle for Ask in a new card.
// size: the new card's { w, h }. boxes: every other card, group frame and object on the board ({ x, y, w, h }), the source and the siblings' cards included.
// area: the visible canvas area { x, y, w, h } (world units), a tie-break only. siblings: this source's existing children, [{ box, anchorY }].
// id, sourceId: the new card's id and the source's, for the deterministic jitter (rule f); without an id there is none.
// -> { x, y, side: 'right' | 'left', quality: { dy, crossings, columns }, jitter: 1 | 0.5 | 0, fallback? }. x, y is the new card's top-left corner.
export function placeSourced({ source, anchorY = null, size, boxes = [], area = null, siblings = [], id = null, sourceId = null }) {
  const line = Math.min(source.y + source.h - SOURCED.edge, Math.max(source.y + SOURCED.edge, Number.isFinite(anchorY) ? anchorY : source.y + source.h / 2));
  const obstacles = [source, ...boxes, ...siblings.map(s => s.box)];
  const key = `${sourceId ?? ''}|${id ?? ''}`;
  const ctx = { source, anchorY: line, size, obstacles, siblings, boxes, key, jx: id == null ? 0 : unit(`${key}|x`), jy: id == null ? 0 : unit(`${key}|y`), dir: hashOf(`${key}|d`) & 1 ? 1 : -1 };
  for (const scale of id == null ? [0] : [1, 0.5, 0]) { // halve the jitter, then drop it, when the jittered slot has no valid placement (rule f)
    const right = bestOnSide('right', ctx, scale), left = bestOnSide('left', ctx, scale);
    if (!right && !left) continue;
    const pick = (() => {
      if (!right || !left) return right || left;
      if (Math.abs(right.cost - left.cost) > 1) return right.cost < left.cost ? right : left;
      const onRight = siblings.filter(s => sideOf(source, s.box) === 'right').length, onLeft = siblings.length - onRight;
      if (onRight !== onLeft) return onRight > onLeft ? right : left;
      if (area) {
        const cx = area.x + area.w / 2, near = c => Math.abs(c.x + size.w / 2 - cx);
        if (Math.abs(near(right) - near(left)) > 1) return near(right) < near(left) ? right : left;
      }
      return right;
    })();
    const at = id == null ? { x: pick.x, y: pick.y } : deAlign(pick, ctx);
    return { ...at, side: pick.side, quality: slotQuality({ source, anchorY: line, at, size, side: pick.side, boxes, columns: pick.quality.columns }), jitter: scale };
  }
  // Nothing free within the columns on either side: beyond the board's rightmost box, at the ideal y (the connector is long but never loops).
  const x = Math.max(source.x + source.w, ...obstacles.map(box => box.x + box.w)) + SOURCED.gap + SOURCED.margin;
  const at = { x: Math.round(x), y: Math.round(line - size.h / 2) };
  return { ...at, side: 'right', quality: slotQuality({ source, anchorY: line, at, size, side: 'right', boxes, columns: SOURCED.columns }), jitter: 0, fallback: true };
}
