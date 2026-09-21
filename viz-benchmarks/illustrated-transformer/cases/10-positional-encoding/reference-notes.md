# Reference notes — positional encoding

Captured: `reference/reference-manifest.json` (images cached, gitignored per
REFERENCE-LICENSING.md).

## Learning objective

How order is injected into a model that is otherwise order-free.

## What makes the reference successful

- The positional vector is drawn the SAME width and shape as the token
  embedding it is added to, and the addition is a literal "+" between two
  equal-sized grids - "this is added to, not concatenated with, the
  embedding" is visible without reading the word "add".
- A small worked example (three tokens, a handful of dimensions) precedes
  the full-scale heatmap, so the mechanism is understood at a size a reader
  can trace by eye before meeting the version too large to read cell by
  cell.
- The full heatmap uses one consistent colour scale across all positions
  and dimensions, so the value pattern (bands that widen as dimension
  index increases) is a property of the function, not an artefact of
  per-row rescaling.
- The left/right split in the large example corresponds to the sine/cosine
  halves of the encoding function, keeping that structural fact visible at
  a glance rather than requiring the reader to know the formula already.

## What must not be copied

Palette, typography, node shapes, arrow style, coordinates and wording. The
evaluation target is semantic and pedagogical parity, never visual imitation.
