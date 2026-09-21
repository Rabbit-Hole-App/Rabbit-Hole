// The continuity / repetition pattern. Generic across subjects: an encoder
// block, a decoder layer, a mixture-of-experts row, a beam-search step - any
// unit a scene draws once and then says "repeats N times" needs the same
// thing, and today it only ever gets a caption. See docs/superpowers/specs/
// 2026-09-18-visual-language-and-motion-design.md's continuity finding and
// viz-benchmarks/illustrated-transformer/independent-review.md, cases 06, 08
// and 09: "whatever handles repeat/condense doesn't carry forward the
// identity or connectivity established in the uncompressed version... no
// existing composition pattern."
//
// The fix here is deliberately small and structural, not a bespoke drawing
// per case: a stack of ghost silhouettes behind the one full-detail unit a
// scene already draws, each carrying only an index caption - reduced detail,
// per the brief ("condensed copies may reduce detail"), but a real shape on
// screen, not a sentence. Authors call this once; the visual pattern lives
// here, not reinvented per scene.
import { SPACE } from './scene-vocab.js';

// unitBox: the bounding box of the ONE fully-drawn copy already in the
// scene. count: how many copies exist in total, including that one -
// stackSilhouettes draws the other count-1. direction controls which way the
// stack recedes visually ('back-right', the default, reads as a card stack
// peeking out from behind-and-right; 'back-up' recedes upward, for a unit
// with room above it rather than beside it).
export function stackSilhouettes({ unitBox, count, direction = 'back-right', labelPrefix = '#', idPrefix = 'stack' }) {
  if (!(count > 1)) return { objects: [] };
  const { x, y, w, h } = unitBox;
  const step = SPACE[1]; // 8 - a card-stack offset small enough to read as "behind", not a second full copy
  const objects = [];
  const ghostCount = count - 1;
  for (let i = ghostCount; i >= 1; i -= 1) {
    const dx = direction === 'back-up' ? 0 : step * i;
    const dy = -step * i;
    const id = `${idPrefix}-${i}`;
    objects.push({
      id, type: 'box', semanticId: id,
      // Reduced detail, on purpose: a ghost is an outline, never the unit's
      // own internal content redrawn - redrawing it would be a second full
      // copy, not a compressed one.
      initialState: { x: x + dx, y: y + dy, w, h, role: 'neutral', opacity: 0.55 },
    });
  }
  // One caption naming how many copies the stack represents, attached to the
  // back-most (furthest offset) ghost so it reads as "this is the Nth of
  // them" rather than floating free of the shapes it describes.
  const dx = direction === 'back-up' ? 0 : step * ghostCount;
  const dy = -step * ghostCount;
  const captionId = `${idPrefix}-label`;
  objects.push({
    id: captionId, type: 'text', semanticId: captionId,
    initialState: {
      text: `${labelPrefix}${count} total, stacked`,
      x: x + dx + w + SPACE[1],
      y: y + dy + h / 2,
      typography: 'caption',
    },
  });
  return { objects };
}

// Given an ordered list of unit anchors ({x, y} pairs - the point a
// connection should leave from and the point the next unit's connection
// should arrive at), returns the arrow objects chaining consecutive units.
// Generic: the "columns never chained" class of bug is a missing arrow
// between two adjacent units, whatever those units are - this is the one
// place that arrow gets drawn, so a scene author cannot forget it for one
// pair while remembering it for another.
export function chainSequential(anchors, { idPrefix = 'chain' } = {}) {
  const objects = [];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const id = `${idPrefix}-${i}`;
    objects.push({
      id, type: 'arrow', semanticId: id,
      initialState: { from: anchors[i].out, to: anchors[i + 1].in, role: 'neutral' },
    });
  }
  return objects;
}
