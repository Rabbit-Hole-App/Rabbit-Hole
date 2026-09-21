# Reference notes — multi head attention

Captured: `reference/reference-manifest.json` (images cached, gitignored per
REFERENCE-LICENSING.md).

## Learning objective

How several attention heads run in parallel over the same input and are recombined into one output.

## What makes the reference successful

- Every head gets its OWN Q/K/V weight matrices drawn side by side, not one
  shared set reused - "separate learned projection per head" is a spatial
  fact (eight distinct column groups), not something stated only in prose.
- Heads are drawn as literally parallel columns fed by the same input X,
  with an ellipsis for the middle heads - enough repetition to read as
  "many of these," not so much that the diagram becomes tedious to scan.
- Recombination is three explicit, ordered steps (concatenate, multiply by
  W^O, get one output Z) rather than a single "combine" arrow - a reader
  can see WHY the concatenated width needs the extra projection, not just
  that one exists.
- A final recap diagram re-draws the whole per-head pipeline compressed
  into one frame, so the detailed view and the compressed view are
  explicitly connected as the same computation at two zoom levels.

## What must not be copied

Palette, typography, node shapes, arrow style, coordinates and wording. The
evaluation target is semantic and pedagogical parity, never visual imitation.
