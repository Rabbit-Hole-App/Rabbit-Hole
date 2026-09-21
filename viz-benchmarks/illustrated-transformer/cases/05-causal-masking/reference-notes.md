# Reference notes — causal masking

Captured: `reference/reference-manifest.json` (text quote cached, gitignored
per REFERENCE-LICENSING.md). No image exists in this source - see below.

## Learning objective

How a decoder prevents a position from attending to later positions, and what the masked score matrix looks like.

## What the reference actually is

The article's only treatment of this is one paragraph under "The Decoder
Side": masking sets future positions to -inf before the softmax step, so
their weight rounds to zero without changing the shape of the computation.
There is no accompanying diagram of a masked matrix in this source.

## What makes the reference successful

- The mechanism is described as a small, surgical change to a computation
  the reader already has (the softmax step from case 04) - masking is one
  extra operation inserted before softmax, not a separate pipeline.
- Framing it as "setting future positions to -inf" ties the effect (zero
  weight after softmax) to a concrete, checkable operation on the score,
  rather than describing masking only by its outcome.

## What a generated version must still get right despite no image reference

- A triangular pattern (each position sees itself and earlier positions
  only) is the visual fact this text implies; nothing here specifies HOW
  to draw it, so a generated static frame is not benchmarked against a
  published picture for this case - only against the textual claim above.

## What must not be copied

Palette, typography, node shapes, arrow style, coordinates and wording. The
evaluation target is semantic and pedagogical parity, never visual imitation.
