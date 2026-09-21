# Iteration v001 - static

Bottom-to-top pipeline: input X -> self-attention -> add & normalize
(LayerNorm(X+Z)) -> feed forward -> add & normalize (LayerNorm(Z+FFN(Z))) ->
next encoder block. Two nested residual bypass loops carry X around
self-attention and the first add&normalize's output around feed-forward,
each rejoining as a second arrow into its own add & normalize box.

## New reusable technique: the bypass loop

A residual connection needs an arrow that visually goes AROUND a box, not
just to it - arrows are a single straight segment, so "around" has to be
built. Composed from two `line` objects (no arrowhead - out from the source,
then up the margin) and one `arrow` object (the final short approach, with
the head) - an L-shaped path. Two instances nest here (bypass1 at x=100
wraps self-attention; bypass2 at x=140, offset so it never visually merges
with bypass1, wraps feed-forward) and both render with zero crossings.

This is the same idea as case02's spine-and-branch (decompose a diagonal
that would cross something into straight segments that don't), applied to a
loop instead of a fan-out. Naming it here because case09
(encoder-decoder attention) will need a comparable long-distance connection
between two stacks and can reuse the same technique.

## Failure classification

- uniform-neutral-role-for-distinct-operations: VISUAL_HIERARCHY / cause:
  **content** - considered and kept, not a defect. All four operation boxes
  share role 'neutral' and are visually identical apart from their label.
  The reference distinguishes them by colour; this scene does not, because
  none of the ten roles represents "a computation step" as a category
  separate from data - ROLE answers what an object MEANS (input, output,
  observed, prediction, ...), not which operation it performs. 'neutral'
  for all four operation boxes is the semantically correct choice. The
  labels alone carry the distinction, which the case's own reference-notes
  treat as sufficient ("failure if a paragraph is required to decode the
  diagram" - a labeled box needs no paragraph).
- equations-leave-dead-space: LAYOUT / cause: **layout**, minor. The two
  LayerNorm equations sit with a lot of empty space around them relative to
  their boxes. Not a crossing or a correctness problem, just loose spacing
  worth tightening in a later pass.

No PRIMITIVE or TEMPLATE gap. No bespoke scene workaround.

## Patterns exercised

Both declared patterns genuinely match the mechanism this time: `flow`
(bottom-to-top staged pipeline, X keeps its identity through the bypass) and
`graphs` (real fan-in at each add & normalize box - the sublayer path and
the residual path converge there). Unlike case07's `routing` declaration,
nothing here needed to be flagged as a mismatch.

## Did this case require a bespoke scene workaround?

No.
