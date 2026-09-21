# Reference notes — softmax attention weights

Captured: `reference/reference-manifest.json` (images cached, gitignored per
REFERENCE-LICENSING.md).

## Learning objective

How raw scores become normalised attention weights, and how those weights select a blend of values.

## What makes the reference successful

- The score is scaled (divide by 8) before softmax, shown as its own row
  rather than folded silently into the softmax step - a reader can see
  normalisation is two operations, not one.
- Softmax output is drawn as a probability pair that visibly sums toward 1
  (0.88 / 0.12), so "these are weights, not raw scores" is legible without
  reading the word softmax.
- The full diagram continues past softmax into "softmax × value" and a
  final sum, so a weight is never left as an abstract number - it is shown
  actually scaling a value vector before the two contributions combine
  into the output.
- A near-zero weight visibly fades its value vector (drawn paler), so
  "this position barely contributes" is a visual fact, not something to
  infer from a small number.

## What must not be copied

Palette, typography, node shapes, arrow style, coordinates and wording. The
evaluation target is semantic and pedagogical parity, never visual imitation.
