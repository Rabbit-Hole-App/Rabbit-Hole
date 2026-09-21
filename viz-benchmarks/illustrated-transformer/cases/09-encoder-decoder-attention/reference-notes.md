# Reference notes — encoder decoder attention

Captured: `reference/reference-manifest.json` (images cached, gitignored per
REFERENCE-LICENSING.md).

## Learning objective

How the decoder attends to encoder output, and how that differs from self-attention.

## What makes the reference successful

- The decoder's block is drawn with encoder-decoder attention as its OWN
  labelled sublayer, sitting between self-attention and feed-forward - the
  difference from a plain self-attention block is a visible extra box, not
  a caption explaining a hidden change.
- The encoder and decoder blocks are drawn side by side with one connecting
  arrow, so "the decoder consumes the encoder's output" is a single visible
  edge crossing from one stack into the other.
- A separate diagram fans that connection out explicitly - the TOP
  encoder's output reaching every decoder layer, not just the first - so
  the fan-out isn't left implicit in a single arrow.

## What must not be copied

Palette, typography, node shapes, arrow style, coordinates and wording. The
evaluation target is semantic and pedagogical parity, never visual imitation.
