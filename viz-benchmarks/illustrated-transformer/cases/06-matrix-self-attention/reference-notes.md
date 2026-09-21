# Reference notes — matrix self attention

Captured: `reference/reference-manifest.json` (images cached, gitignored per
REFERENCE-LICENSING.md).

## Learning objective

The same computation expressed once over whole matrices instead of per token.

## What makes the reference successful

- The whole-sentence embedding matrix X keeps the same row-per-token shape
  it had before projection, so "every row is still one token" survives the
  jump from per-token vectors to a matrix - nothing about the object
  changes, only how many rows are processed in one expression.
- The projection is drawn as one matrix multiplication (X × W^Q = Q) rather
  than one per token, making explicit that this is the SAME operation as
  the per-token case, condensed - not a different computation.
- The second diagram condenses the entire score-softmax-weighted-sum chain
  into a single row of matrix operations, so a reader who already followed
  the per-token version (case 03/04) can map each box directly onto a step
  they already understand, rather than parsing a new pipeline.

## What must not be copied

Palette, typography, node shapes, arrow style, coordinates and wording. The
evaluation target is semantic and pedagogical parity, never visual imitation.
