// The rail on blank canvas left of the content: a dotted line in every
// horizontal gap - a band of height nothing on the canvas occupies - with [-]
// and [+] to pull what is below the line up or push it down, and [...] to add
// a section there. Everything counts: lesson cards, chat cards, notebooks,
// shapes, notes, text and ink.

// How far from a rail the pointer still counts as hovering it.
const REACH = 160;
// [-] never closes a gap completely, so its rail stays reachable.
export const MIN_GAP = 24;

// boxes: [{ x, y, w, h }] of everything on the canvas. A gap is the space
// between the bottom of everything above a line and the top of everything
// below it; gaps are numbered top to bottom.
export function gapsFrom(boxes) {
  const sorted = boxes.filter(box => box && box.h >= 0 && Number.isFinite(box.y)).sort((a, b) => a.y - b.y);
  const gaps = [];
  let bottom = null;
  for (const box of sorted) {
    if (bottom !== null && box.y > bottom) gaps.push({ index: gaps.length, top: bottom, bottom: box.y, y: (bottom + box.y) / 2 });
    bottom = bottom === null ? box.y + box.h : Math.max(bottom, box.y + box.h);
  }
  return gaps;
}

// How far [+]/[-] moves what is below a gap: a push is always the full step, a
// pull stops MIN_GAP short of touching.
export function nudgeBy(gap, delta) {
  if (delta >= 0) return delta;
  return -Math.min(-delta, Math.max(0, gap.bottom - gap.top - MIN_GAP));
}

export function nearestGap(gaps, y, within = REACH) {
  let best = null, closest = within;
  for (const gap of gaps) {
    const distance = Math.abs(gap.y - y);
    if (distance < closest) { best = gap; closest = distance; }
  }
  return best;
}
