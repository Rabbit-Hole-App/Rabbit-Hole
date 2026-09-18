// The rail that sits on blank canvas beside the lesson column: one dotted line
// per pair of adjacent cards, with [-] and [+] to pull the pair together or
// push it apart. Space lives as a `space` field on the lower card of the pair,
// rendered as its margin, so the column's own flow moves everything below.

// How far from a rail the pointer still counts as hovering it.
const REACH = 160;

// Gaps are keyed by position in the array, never by y. Space is free to go
// negative, which overlaps two cards and inverts their y order; identity pinned
// to geometry would hand a press-and-hold on [-] to a different gap partway
// through.
export function gapsFrom(blocks, bounds) {
  const gaps = [];
  for (let index = 0; index < blocks.length - 1; index++) {
    const above = bounds[blocks[index].id], below = bounds[blocks[index + 1].id];
    if (!above || !below) continue; // a card the layout has not measured yet
    gaps.push({ index, beforeId: blocks[index + 1].id, y: (above.y + above.h + below.y) / 2 });
  }
  return gaps;
}

export function nearestGap(gaps, y, within = REACH) {
  let best = null, closest = within;
  for (const gap of gaps) {
    const distance = Math.abs(gap.y - y);
    if (distance < closest) { best = gap; closest = distance; }
  }
  return best;
}
