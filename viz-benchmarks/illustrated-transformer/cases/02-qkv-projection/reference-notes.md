# Reference notes — qkv projection

Captured: `reference/reference-manifest.json` (image cached, gitignored per
REFERENCE-LICENSING.md).

## Learning objective

How one token vector becomes separate query, key and value vectors, and why three roles are needed rather than one.

## What makes the reference successful

- One embedding (X) feeds three separate matrix multiplications, drawn in
  parallel rows rather than a branching diagram - the three roles read as
  siblings, not a sequence.
- Each learned weight matrix (W^Q, W^K, W^V) keeps its own stable colour
  identity, carried through to the output vector it produces (Q, K, V) -
  the viewer never has to re-match a colour to a label.
- The output vectors are drawn narrower than the input embedding, making
  the projection's dimensionality change visible without a caption.
- Nothing about the numbers matters yet; the diagram teaches the shape of
  the operation (one input, three learned transforms, three named outputs)
  before any value is read.

## What must not be copied

Palette, typography, node shapes, arrow style, coordinates and wording. The
evaluation target is semantic and pedagogical parity, never visual imitation.
