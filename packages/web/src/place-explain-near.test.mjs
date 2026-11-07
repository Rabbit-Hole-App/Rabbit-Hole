// Where an Explain skeleton goes (AdaptiveCanvas placeExplain): beside the highlighted passage in free space, never over the source card or any other
// box, and somewhere sensible when the sides are taken. The geometry is roadmap-placement's deliveredSpot and proposalAnchor, called exactly as placeExplain
// calls them; the last test pins that call shape in the source. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deliveredSpot, proposalAnchor } from './roadmap-placement.js';

const SIZE = { w: 440, h: 360 };
const meets = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const place = (source, passage, others = []) => {
  const spot = deliveredSpot(SIZE, proposalAnchor(source, passage), [...others, source], null);
  return { ...spot, ...SIZE };
};
const source = { x: 0, y: 0, w: 600, h: 1200 }, passage = { x: 20, y: 500, w: 560, h: 90 };

test('free space: the skeleton stands beside the passage, clear of the source card', () => {
  const box = place(source, passage);
  assert.equal(meets(box, source), false, 'never over the document');
  assert.ok(box.x >= source.x + source.w || box.x + box.w <= source.x, 'to a side of the card');
  assert.ok(box.y < passage.y + passage.h && box.y + box.h > passage.y, 'level with the passage, not at the card top or bottom');
});

test('a neighbour on the near side is avoided; the skeleton never covers any box', () => {
  const others = [{ x: 640, y: 300, w: 500, h: 500 }];
  const box = place(source, passage, others);
  for (const other of [source, ...others]) assert.equal(meets(box, other), false);
});

test('both sides and the rows around are taken: it still lands in free space', () => {
  const others = [{ x: 600, y: -2000, w: 700, h: 5200 }, { x: -800, y: -2000, w: 800, h: 5200 }];
  const box = place(source, passage, others);
  for (const other of [source, ...others]) assert.equal(meets(box, other), false, 'free space only');
  assert.ok(Number.isFinite(box.x) && Number.isFinite(box.y));
});

test('a passage outside the card is clamped to the card, so the slab stays on the source', () => {
  const slab = proposalAnchor(source, { x: 0, y: 5000, w: 10, h: 40 });
  assert.ok(slab.y >= source.y && slab.y + slab.h <= source.y + source.h && slab.x === source.x && slab.w === source.w);
  assert.deepEqual(proposalAnchor(source, null), source);
});

test('placeExplain calls it with the source card as an obstacle and falls back to the view without a source box', () => {
  const page = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  const body = page.slice(page.indexOf('placeExplain: (card'), page.indexOf('reconcileCad:'));
  assert.match(body, /deliveredSpot\(\{ w: EXPLAIN_PENDING_SIZE\.width, h: 360 \}, proposalAnchor\(box, near\.world\), \[\.\.\.boardObstacles\(\[source\.id\]\), \.\.\.anchoredBoxes\(slotsRef\.current\), box\]/);
  assert.match(body, /if \(box\) \{[\s\S]*pendingAt\.current\.set\(added\.id, spot\)[\s\S]*\}\s*blocksRef\.current = \[\.\.\.blocksRef\.current, added\];[\s\S]*insertAtView\(added, into\)/);
});
