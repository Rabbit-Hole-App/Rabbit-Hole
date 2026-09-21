# Reference notes — transformer block

Captured: `reference/reference-manifest.json` (images cached, gitignored per
REFERENCE-LICENSING.md).

## Learning objective

Attention, residual connection, normalisation and feed-forward as one repeating block.

## What makes the reference successful

- The residual connection is drawn as an explicit dashed line looping
  AROUND the sublayer, arriving at the same "Add & Normalize" box the
  sublayer output feeds into - the addition is spatial (two arrows into
  one box) rather than a formula the reader has to trust.
- One diagram writes the residual step out as an equation, LayerNorm(X +
  Z), directly beside the boxes it corresponds to - a reader can move
  between the visual flow and the exact operation without translating.
- The block is drawn once, then explicitly labelled "Encoder #1" inside a
  bounding box, so "this whole thing repeats" is implied by the container
  and its number, not stated only in a caption.
- A version with real tensor shapes on the arrows exists alongside the
  clean conceptual version, so the same structure is available at two
  levels of concreteness.

## What must not be copied

Palette, typography, node shapes, arrow style, coordinates and wording. The
evaluation target is semantic and pedagogical parity, never visual imitation.
