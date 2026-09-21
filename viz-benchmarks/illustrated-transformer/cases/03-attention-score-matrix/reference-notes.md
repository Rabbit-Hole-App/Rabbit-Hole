# Reference notes — attention score matrix

Captured: `reference/reference-manifest.json` (image cached, gitignored per
REFERENCE-LICENSING.md).

## Learning objective

How comparing every query against every key produces a score matrix, and what a cell in it means.

## What makes the reference successful

- The dot product is shown as an equation with named operands (q1 . k1 =
  112), not just a bare number - a reader can verify the arithmetic, not
  just trust the label.
- Two scores for the same query are drawn side by side (q1.k1, q1.k2), so
  the comparison a score matrix encodes - "how much does this position
  attend to that one" - is visible before any matrix notation appears.
- The score keeps the same position in the vertical flow as the Q/K/V rows
  above it, so it reads as the next step of one continuous computation,
  not a separate diagram.

## What must not be copied

Palette, typography, node shapes, arrow style, coordinates and wording. The
evaluation target is semantic and pedagogical parity, never visual imitation.
