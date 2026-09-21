# Iteration v001 - static

One input token -> embedding (X, 4 cells, no values - shape only) -> three
parallel rows, each a learned weight matrix (Wq/Wk/Wv, IDENTITY-coloured,
values omitted for the same reason) producing a projected vector (Q/K/V,
narrower - 3 cells vs 4 - showing the dimensionality change without a
caption, per the case's own reference notes).

Numbers are deliberately absent everywhere in this scene. The reference's
own equivalent figure does the same - at this step the point is the SHAPE of
the operation (one input, three independent learned transforms, three named
outputs), not any particular value - and case01 already owns the case where
the numbers matter.

## Routing technique reused from case 01, extended

Three W matrices are stacked vertically, all fed by the same embedding. A
direct fan-out (one diagonal per row) would cross the rows above it, exactly
like case01's tokens -> Q/K/V arrows. Fix: a single vertical `line` "spine"
running down the left margin (outside every W's x-range), with a short
horizontal `arrow` branching off the spine into each row at that row's own
y. This is a reusable pattern for one-to-many fan-out into stacked targets -
worth naming for future scenes: **spine-and-branch** - and it composes two
existing primitives (line + arrow), not a new one.

## Failure classification

- first-draft-arrow-crossed-embedding-label: LAYOUT / cause: **layout**
  (a coordinate choice, not a missing capability). The token->embedding
  arrow's first endpoint landed under the embedding strip's own caption;
  moved the endpoint right, clear of the caption. Fixed before finalizing,
  not carried as an open failure.

No PRIMITIVE or TEMPLATE gap. No bespoke scene workaround.

## Recurring theme (watch, not yet a gap)

This is the second case in a row (after case01) where a straight-line arrow
needed a manual coordinate fix to avoid crossing a label or shape. Neither
instance was a vocabulary gap - both were caught by rendering and looking -
but noting the pattern in case a third instance suggests the reusable system
needs help here (e.g. a dev-time check that an arrow's bounding box doesn't
intersect another object's label rect) rather than continued manual care.

## Patterns exercised

`flow` passes. This case declares only one pattern.

## Did this case require a bespoke scene workaround?

No.
